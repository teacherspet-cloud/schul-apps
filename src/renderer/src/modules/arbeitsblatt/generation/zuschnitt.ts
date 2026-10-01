/**
 * Material von einer Internetadresse auf die Textlänge einer Klausur bzw. eines Arbeitsblatts
 * bringen – wörtlich, mit rotem Faden, mit Einleitungssatz und vollständiger Quellenangabe.
 *
 * Befund der Lehrkraft (01.10.2026): „Bei der Mediationsaufgabe habe ich jetzt eine konkrete URL
 * angegeben. Die URL wird auch als Material benutzt, allerdings nicht auf die vorgegebenen
 * Textlängen heruntergekürzt. Führe eine Mechanik ein, mit der die KI für eine Klausur passende
 * Texte aus der URL anpasst, um eine Klausur mit einem roten Faden herzustellen."
 *
 * Ablauf:
 * 1. Seitenbeiwerk regelbasiert entfernen (`bereinigeArtikeltext`): Rubrik, Datum, Vorspann,
 *    Bildnachweis … – Schlagzeile, Datum und Medium wandern in Titel und Quellenangabe.
 * 2. Ist der Text länger als der Zielbereich, wählt die KI einen zusammenhängenden Ausschnitt,
 *    ausgerichtet am Thema der GANZEN Arbeit und an der Aufgabe dieses Teils. Sie darf nur
 *    weglassen ([…]); die App prüft das Wort für Wort (`pruefeKuerzung`). Hält die KI sich nicht
 *    daran oder verfehlt sie die Länge, kürzt die App selbst absatzweise – das Ergebnis ist dann
 *    weniger elegant, aber sicher wörtlich.
 * 3. Die KI prüft den Ausschnitt ein zweites Mal: nur Artikeltext? Gemeldete Fremdzeilen fallen
 *    heraus (mit […], wenn sie mitten im Text stehen).
 * 4. Einleitungssatz (kursiv über dem Text) aus den Angaben der Seite; fehlende Angaben darf die
 *    KI recherchieren – übernommen wird nur, was belegt ist, mit Fundstelle für die Lehrkraft.
 */
import type { StructuredRequest } from '@shared/types'
import { bereinigeArtikeltext, keineSchlagzeile, ohneSeitenname, type Artikel } from '@shared/artikelText'
import { stoppwortSatz } from '@shared/stoppwoerter'
import { arr, bool, obj, str } from '../../../shared/aiSchema'
import { LANGUAGE_NAMES } from '../model/subjects'
import type { OriginalMaterialAblage, TextBlock, TextZuschnitt } from '../model/types'
import { kuerzungsProtokoll, pruefeKuerzung, wortzahl, zerlege, type KuerzungsPruefung } from './kuerzung'
import { KUERZUNGSREGELN, quellenangabeMitAbruf } from './originalmaterial'

export type AiRuf = <T>(req: StructuredRequest) => Promise<T>

/** Fundstelle der Websuche (Titel, Adresse, Auszug) */
export interface Fund {
  titel: string
  url: string
  auszug: string
}

export interface Zielbereich {
  min: number
  max: number
  /** woher der Bereich stammt – amtliche Vorgabe oder Faustregel */
  grund: string
}

export interface ZuschnittEingabe {
  /** roher Fließtext der Seite (wird bereinigt) */
  text: string
  /** Titel der Webseite bzw. Dateiname */
  seitentitel?: string
  url: string
  /** bereits ermittelte Quellenangabe (ohne Kürzungshinweis) */
  quellenangabe?: string
  urheber?: string
  ziel: Zielbereich
  /** Thema der Arbeit bzw. des Blattes */
  thema: string
  /** roter Faden: die Teile der Arbeit und wie sie zusammenhängen */
  leitgedanke?: string
  /** Teil, für den der Text gebraucht wird („Sprachmittlung") */
  teil?: string
  /** was dieser Teil von den Lernenden verlangt */
  aufgabe?: string
  /** Sprache des Textes */
  sprache: string
  /** Zielsprache der Lernenden (Fremdsprachen) – bestimmt die Sprache der Worthilfen */
  zielsprache?: string
  fach: string
  jahrgang: number
  mediation?: boolean
  /** Wunsch der Lehrkraft („kürzer", „anderer Ausschnitt") */
  wunsch?: string
  /** bisheriger Ausschnitt – bei „anderer Ausschnitt" zu meiden */
  bisher?: string
  /** Einleitungssatz übernehmen statt neu erzeugen */
  einleitung?: { text: string; fundstellen: { angabe: string; url: string }[] }
}

export interface ZuschnittErgebnis {
  ablage: OriginalMaterialAblage
  pruefung: KuerzungsPruefung
  artikel: Artikel
  /** wie gekürzt wurde: gar nicht, von der KI oder von der App (Ersatzweg) */
  weg: 'ungekuerzt' | 'ki' | 'app'
}

export const sprachName = (code: string): string => ({ ...LANGUAGE_NAMES, de: 'Deutsch', en: 'Englisch', fr: 'Französisch', es: 'Spanisch' }[code] ?? code)

// ---------- Hilfen ----------

const absaetze = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((a) => a.trim())
    .filter(Boolean)

const AUSLASSUNG_ABSATZ = /^\[\s*(?:…|\.\.\.)\s*\]$/

/** Sätze eines Absatzes (Satzzeichen bleiben am Satz) */
const saetze = (absatz: string): string[] =>
  absatz
    .match(/[^.!?…]+(?:[.!?…]+["'“”»«)]*|$)\s*/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [absatz]

/** Inhaltswörter des Themas – für die Auswahl des Ausschnitts ohne KI */
function themenwoerter(thema: string, sprache: string): Set<string> {
  const stopp = stoppwortSatz(sprache)
  return new Set(
    zerlege(thema)
      .map((w) => w.norm)
      .filter((w) => w.length > 3 && !stopp.has(w))
  )
}

/*
 * ---------- Ziellänge (01.10.2026) ----------
 *
 * Befund der Lehrkraft: Bei 450–650 Wörtern kam ein Text mit 455 Wörtern heraus – „etwa 150 Wörter
 * zu kurz". Ursache: Jede Länge ab 90 % des MINIMUMS galt als getroffen (405 Wörter hätten
 * gereicht), und die Absatzkürzung suchte nur „unter dem Maximum", nicht „nah am Ziel".
 * Jetzt zielt der Zuschnitt auf etwa 90 % des Maximums; angenommen wird nur, was im Bereich
 * liegt UND mindestens die Mitte erreicht. Darunter gilt der Ausschnitt als zu kurz.
 */

/** Mitte des Zielbereichs – darunter ist ein Ausschnitt zu kurz */
export const mitteDesBereichs = (ziel: Pick<Zielbereich, 'min' | 'max'>): number => Math.ceil((ziel.min + ziel.max) / 2)

/** Angestrebte Wortzahl: etwa 90 % des Maximums, nie unter der Mitte des Bereichs */
export const zielWortzahl = (ziel: Pick<Zielbereich, 'min' | 'max'>): number => Math.max(Math.round(ziel.max * 0.9), mitteDesBereichs(ziel))

/** Länge eines Ausschnitts: zu kurz (unter der Mitte), passend oder zu lang (über dem Maximum) */
export function laengeBewerten(n: number, ziel: Pick<Zielbereich, 'min' | 'max'>): 'zuKurz' | 'passt' | 'zuLang' {
  if (n > ziel.max) return 'zuLang'
  return n < mitteDesBereichs(ziel) ? 'zuKurz' : 'passt'
}

/**
 * Ausschnitt OHNE KI: das zusammenhängende Stück aus ganzen Absätzen, das der angestrebten Länge
 * (`zielWortzahl`) am nächsten kommt, ohne das Maximum zu überschreiten, und dabei möglichst viele
 * Themenwörter enthält. Bleibt es unter dem Ziel, wird mit ganzen Sätzen des folgenden Absatzes
 * aufgefüllt. Wörtlich ist es von selbst – es wird nichts umgestellt. Ein einzelner überlanger
 * Absatz wird nach ganzen Sätzen abgeschnitten.
 */
export function absatzAuswahl(original: string, ziel: Zielbereich, thema = '', sprache = 'de'): string {
  const liste = absaetze(original)
  if (!liste.length) return ''
  const n = liste.map((a) => wortzahl(a))
  const soll = zielWortzahl(ziel)
  const mitte = mitteDesBereichs(ziel)
  const themen = themenwoerter(thema, sprache)
  const treffer = liste.map((a) => zerlege(a).filter((w) => themen.has(w.norm)).length)
  let best: { von: number; bis: number; summe: number; punkte: number } | null = null
  for (let i = 0; i < liste.length; i++) {
    let summe = 0
    let punkte = 0
    for (let j = i; j < liste.length; j++) {
      summe += n[j]
      punkte += treffer[j]
      if (summe > ziel.max) break
      // Ab der Mitte des Bereichs zählen Nähe zum Ziel und Themenwörter; darunter zählt die Länge
      const laenge = summe >= mitte ? 1000 - Math.abs(summe - soll) * 2 : summe >= ziel.min ? 500 + summe - ziel.min : summe
      const wert = laenge + punkte * 5 - i * 0.01
      if (!best || wert > best.punkte) best = { von: i, bis: j, summe, punkte: wert }
    }
  }
  if (best) {
    const teile = liste.slice(best.von, best.bis + 1)
    // Unter dem Ziel: mit ganzen Sätzen des nächsten Absatzes auffüllen (nie über das Maximum)
    let summe = best.summe
    const naechster = liste[best.bis + 1]
    if (summe < soll && naechster && !AUSLASSUNG_ABSATZ.test(naechster) && !naechster.startsWith('**')) {
      const dazu: string[] = []
      for (const satz of saetze(naechster)) {
        const w = wortzahl(satz)
        if (summe + w > ziel.max || (summe >= mitte && Math.abs(summe + w - soll) > Math.abs(summe - soll))) break
        dazu.push(satz)
        summe += w
      }
      if (dazu.length) teile.push(dazu.join(' '))
    }
    return teile.join('\n\n')
  }
  // Schon der erste Absatz ist zu lang: ganze Sätze bis zum Ziel
  const aus: string[] = []
  let summe = 0
  for (const s of saetze(liste[0])) {
    const w = wortzahl(s)
    if (summe + w > ziel.max && summe >= Math.min(ziel.min, ziel.max / 2)) break
    aus.push(s)
    summe += w
    if (summe >= soll) break
  }
  return aus.join(' ')
}

/**
 * Absätze entfernen, die die Prüfung als Fremdzeilen gemeldet hat. Steht ein solcher Absatz
 * zwischen zwei bleibenden, kommt ein […] an seine Stelle – sonst wäre die Lücke unmarkiert.
 */
export function entferneAbsaetze(text: string, fremd: string[]): { text: string; entfernt: string[] } {
  const schluessel = (s: string): string =>
    zerlege(s)
      .map((w) => w.norm)
      .slice(0, 8)
      .join(' ')
  const ziele = fremd.map(schluessel).filter((s) => s.split(' ').length >= 1 && s.length >= 3)
  if (!ziele.length) return { text, entfernt: [] }
  const liste = absaetze(text)
  const weg = liste.map((a) => {
    const k = schluessel(a)
    return ziele.some((z) => k.startsWith(z) || z.startsWith(k))
  })
  const entfernt = liste.filter((_, i) => weg[i])
  if (!entfernt.length || entfernt.length === liste.length) return { text, entfernt: [] }
  const aus: string[] = []
  let luecke = false
  for (let i = 0; i < liste.length; i++) {
    if (weg[i]) {
      luecke = aus.length > 0
      continue
    }
    if (luecke && !AUSLASSUNG_ABSATZ.test(liste[i]) && !AUSLASSUNG_ABSATZ.test(aus[aus.length - 1] ?? '')) aus.push('[…]')
    luecke = false
    aus.push(liste[i])
  }
  return { text: aus.join('\n\n'), entfernt }
}

/** Wie stark ein Text nach einer Sprache aussieht (Anteil ihrer Stoppwörter) */
function sprachAnteil(text: string, sprache: string): number {
  const w = zerlege(text).map((x) => x.norm)
  if (!w.length) return 0
  const stopp = stoppwortSatz(sprache)
  return w.filter((x) => stopp.has(x)).length / w.length
}

/**
 * Sprache eines Textes unter mehreren Kandidaten – nach Stoppwortdichte. Liefert '' bei zu
 * wenig Text oder ohne klaren Abstand (dann entscheidet der Aufrufer nicht nach Sprache).
 */
export function erkenneSprache(text: string, kandidaten: string[]): string {
  if (wortzahl(text) < 25) return ''
  const werte = kandidaten.map((k) => ({ k, a: sprachAnteil(text.slice(0, 6000), k) })).sort((a, b) => b.a - a.a)
  if (!werte.length || werte[0].a < 0.12) return ''
  if (werte[1] && werte[0].a - werte[1].a < 0.05) return ''
  return werte[0].k
}

/**
 * Worthilfen prüfen: Der Begriff muss im Text stehen, die Erklärung darf nicht der Begriff selbst
 * sein und muss in der verlangten Sprache stehen (bei kurzen Erklärungen lässt sich das nicht
 * messen – dann bleibt sie). Höchstens acht.
 */
export function pruefeWorthilfen(
  liste: { term?: string; explanation?: string }[] | undefined,
  text: string,
  sprache: string
): { term: string; explanation: string }[] {
  const klein = text.toLowerCase()
  const aus: { term: string; explanation: string }[] = []
  for (const g of liste ?? []) {
    const term = String(g?.term ?? '').trim()
    const explanation = String(g?.explanation ?? '').trim()
    if (!term || !explanation || term.toLowerCase() === explanation.toLowerCase()) continue
    if (!klein.includes(term.toLowerCase())) continue
    if (sprache && sprache !== 'de' && wortzahl(explanation) >= 5 && sprachAnteil(explanation, 'de') > sprachAnteil(explanation, sprache) + 0.1) continue
    aus.push({ term, explanation })
    if (aus.length >= 8) break
  }
  return aus
}

/** Kurzer Kürzungshinweis für die Quellenzeile */
export function kuerzungsVermerk(p: KuerzungsPruefung): string {
  const gekuerzt = p.wortzahlGekuerzt < p.wortzahlOriginal || p.auslassungen.length > 0
  const teile = [gekuerzt ? 'gekürzt' : '', p.einfuegungen.some((e) => e.trim()) ? 'Ergänzungen in eckigen Klammern' : ''].filter(Boolean)
  return teile.length ? `(${teile.join('; ')})` : ''
}

/**
 * Quellenangabe aus den Angaben der Seite: Verfasser, Titel, Medium, Datum, Fundort, Abrufdatum.
 * Eine schon ermittelte Angabe (KI aus dem Text) hat Vorrang; was ihr fehlt, ergänzt die Seite.
 */
export function quellenangabeAus(e: Pick<ZuschnittEingabe, 'quellenangabe' | 'urheber' | 'url' | 'seitentitel'>, artikel: Artikel, heute = new Date()): string {
  const titel = artikel.titel || bereinigterSeitentitel(e.seitentitel ?? '')
  let angabe = (e.quellenangabe ?? '').replace(/^\s*quelle\s*:\s*/i, '').trim()
  // Eine Angabe, die nur aus der Adresse besteht, zählt nicht als Angabe
  if (angabe === e.url) angabe = ''
  if (!angabe) {
    angabe = [e.urheber || artikel.autor, titel ? `„${titel}“` : '', artikel.medium, artikel.datum].filter(Boolean).join(', ')
  } else {
    // „Magazin EINSICHTEN" ist schon genannt, wenn „EINSICHTEN" dasteht
    const kern = (x: string): string => x.replace(/^(?:magazin|heft|zeitschrift|journal)\s+/i, '').toLowerCase()
    const fehlend = [artikel.medium, artikel.datum].filter((x): x is string => Boolean(x) && !angabe.toLowerCase().includes(kern(x!)))
    // Vor Fundort/Abruf einfügen, falls die Angabe schon damit endet
    const m = /\s*(?:Fundort:|https?:\/\/|\(abgerufen)/i.exec(angabe)
    if (fehlend.length) angabe = m ? `${angabe.slice(0, m.index)}, ${fehlend.join(', ')}${angabe.slice(m.index)}` : `${angabe}, ${fehlend.join(', ')}`
  }
  return quellenangabeMitAbruf(angabe, { url: e.url, titel: titel || e.url, urheber: e.urheber, herkunft: 'netz', auszug: '' }, heute)
}

/**
 * Seitentitel ohne Website-Namen („Shakespeares Werke | LMU München" → „Shakespeares Werke");
 * leer, wenn er nach Bewertung, Zähler oder Knopf aussieht (01.10.2026: „Bewertung: 2").
 */
export function bereinigterSeitentitel(t: string): string {
  const titel = ohneSeitenname(t)
  return titel && !keineSchlagzeile(titel) ? titel : ''
}

// ---------- Schritt 2: Ausschnitt wählen ----------

const ZUSCHNITT_SCHEMA = obj({
  gekuerzt: str('Der Ausschnitt im WÖRTLICHEN Originalwortlaut; Auslassungen als […]; Absätze durch Leerzeile getrennt'),
  begruendung: str('Warum dieser Ausschnitt zum Thema der Arbeit und zur Aufgabe passt – ein Satz'),
  worthilfen: arr(obj({ term: str('Wort bzw. Wendung wörtlich aus dem Ausschnitt'), explanation: str() }), 'nur wenn nötig, sonst leere Liste')
})

interface ZuschnittAntwort {
  gekuerzt: string
  begruendung?: string
  worthilfen?: { term: string; explanation: string }[]
}

function zuschnittAuftrag(e: ZuschnittEingabe, original: string, ziel: Zielbereich, rueckmeldung = ''): StructuredRequest {
  const worthilfenSprache = e.mediation ? e.zielsprache ?? e.sprache : e.sprache
  return {
    system:
      'Du wählst aus einem echten Originaltext einen Ausschnitt für eine Klassenarbeit bzw. ein Arbeitsblatt. Du darfst nur weglassen – nie umformulieren, nie übersetzen, nie ergänzen.',
    user: [
      `Fach: ${e.fach}. Jahrgang: ${e.jahrgang}. Thema: ${e.thema}.`,
      e.leitgedanke ? `ROTER FADEN DER ARBEIT (alle Teile beziehen sich auf dasselbe Thema):\n${e.leitgedanke}` : '',
      e.teil ? `Der Ausschnitt ist das Material für: ${e.teil}${e.aufgabe ? ` – ${e.aufgabe}` : ''}.` : '',
      `ZIELLÄNGE: etwa ${zielWortzahl(ziel)} Wörter – zulässig ${mitteDesBereichs(ziel)} bis ${ziel.max} Wörter (Zielbereich ${ziel.min}–${ziel.max}: ${ziel.grund}). Kürzere Ausschnitte gelten als zu kurz. Das Original hat ${wortzahl(original)} Wörter.`,
      'AUSWAHL: Wähle die Abschnitte, die für dieses Thema und diese Aufgabe ergiebig sind (Standpunkte, Gründe, Beispiele, Ergebnisse). Der Ausschnitt muss für sich verständlich sein und einen Gedankengang tragen – keine Anhäufung loser Sätze.',
      e.mediation
        ? `SPRACHMITTLUNG: Der Text bleibt in der Ausgangssprache (${sprachName(
            e.sprache
          )}). Nicht übersetzen. Wähle die Stellen, die ein Adressat in der Zielsprache für die Aufgabe braucht.`
        : '',
      KUERZUNGSREGELN,
      '- Lass Seitenbeiwerk weg: Rubriken, Datum, Verfasserzeile, Bildunterschriften und Bildnachweise (©, Foto:), Vorspann bzw. Teaser, Hinweise auf weitere Artikel. Die Schlagzeile gehört NICHT in den Text – den Titel setzt die App.',
      `WORTHILFEN (worthilfen): nur, wenn ein Wort für die Lerngruppe sonst unverständlich bliebe – höchstens sechs. term wörtlich aus dem Ausschnitt; explanation auf ${sprachName(
        worthilfenSprache
      )}${
        e.mediation ? ' (die Entsprechung bzw. eine kurze Umschreibung in der Zielsprache)' : ' (einsprachige Erklärung)'
      }. In der gymnasialen Oberstufe in der Regel keine. Sonst eine leere Liste.`,
      e.wunsch ? `WUNSCH DER LEHRKRAFT (hat Vorrang): ${e.wunsch}` : '',
      e.bisher ? `BISHERIGER AUSSCHNITT (bei „anderer Ausschnitt" andere Stellen wählen):\n${e.bisher.slice(0, 4000)}` : '',
      rueckmeldung ? `KORREKTUR DES LETZTEN VERSUCHS: ${rueckmeldung}` : '',
      `ORIGINAL:\n${original}`
    ]
      .filter(Boolean)
      .join('\n\n'),
    schemaName: 'material_zuschnitt',
    schema: ZUSCHNITT_SCHEMA
  }
}

const ARTIKEL_SCHEMA = obj({
  nurArtikeltext: bool('true, wenn der Ausschnitt nur aus Artikeltext besteht'),
  fremd: arr(str('Anfang (die ersten Wörter) einer Zeile bzw. eines Absatzes, der kein Artikeltext ist'), 'leer, wenn alles Artikeltext ist')
})

// ---------- Schritt 4: Einleitungssatz ----------

const EINLEITUNG_SCHEMA = obj({
  einleitung: str('Ein Satz, endet mit Doppelpunkt'),
  angaben: arr(
    obj({ angabe: str('recherchierte Angabe, z. B. „Erscheinungsdatum 10.03.2025"'), url: str('Fundstelle aus der Liste') }),
    'nur recherchierte Angaben'
  )
})

/** Jahreszahlen und Datumsangaben in einem Satz */
const ZAHLEN = /\b\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}\b|\b1[5-9]\d\d\b|\b20\d\d\b/g

/** Ein Einleitungssatz aus den Angaben allein – Ersatz, wenn die KI nichts Brauchbares liefert. Erfindet nichts. */
export function einleitungAusAngaben(a: { autor?: string; medium?: string; datum?: string; thema?: string }, sprache: string): string {
  const { autor, medium, datum } = a
  const thema = a.thema?.trim()
  if (sprache === 'en') {
    const wer = autor || (medium ? `An article in ${medium}` : 'The following text')
    const wo = autor && medium ? ` in ${medium}` : ''
    return `${datum ? `On ${datum}, ` : ''}${wer}${autor ? ` writes${wo}` : ''}${thema ? ` about ${thema}` : ''}:`.replace(/^./, (c) => c.toUpperCase())
  }
  if (autor) return `${datum ? `Am ${datum} äußert sich` : 'Es äußert sich'} ${autor}${medium ? ` in ${medium}` : ''}${thema ? ` zum Thema „${thema}“` : ''}:`
  if (medium) return `${datum ? `Am ${datum} erschien` : 'Es erschien'} in ${medium} ein Beitrag${thema ? ` zum Thema „${thema}“` : ''}:`
  return `${datum ? `Ein Text vom ${datum}` : 'Ein Text'}${thema ? ` zum Thema „${thema}“` : ''}:`
}

export interface EinleitungEingabe {
  artikel: Artikel
  text: string
  titel: string
  url: string
  sprache: string
  thema: string
  quellenangabe: string
  /** Websuche (Fundstellen mit Auszug) – fehlt sie, wird nicht recherchiert */
  netzsuche?: (auftrag: string) => Promise<Fund[]>
}

/**
 * Einleitungssatz über dem Material (Wunsch der Lehrkraft, 01.10.2026): Verfasser mit
 * Funktion, Entstehungszeit, Anlass/Medium, Thema – in der Sprache des Materials.
 *
 * Fehlen Datum oder Funktion des Verfassers, darf recherchiert werden. Übernommen wird nur, was
 * in den Angaben der Seite, im Text oder in einem Fundstellen-Auszug steht; jede Zahl im Satz
 * muss dort vorkommen, sonst gilt der Satz als geraten und die App nimmt den Ersatzsatz.
 */
export async function einleitungErstellen(e: EinleitungEingabe, ai: AiRuf): Promise<{ text: string; fundstellen: { angabe: string; url: string }[] }> {
  const { artikel } = e
  const angabenSeite = [
    artikel.autor ? `Verfasser: ${artikel.autor}` : '',
    artikel.datum ? `Datum: ${artikel.datum}` : '',
    artikel.medium ? `Medium: ${artikel.medium}` : '',
    artikel.titel || e.titel ? `Titel: ${artikel.titel || e.titel}` : '',
    `Quellenangabe: ${e.quellenangabe}`,
    // Der entfernte Vorspann nennt oft Verfasser und Funktion („erklärt die LMU-Anglistin …")
    ...artikel.entfernt.filter((z) => /^(Vorspann|Verfasserzeile|Herkunft|Datum)/.test(z)).map((z) => `Von der Seite entfernt – ${z}`)
  ].filter(Boolean)

  let funde: Fund[] = []
  const fehlt = !artikel.datum || !artikel.autor
  if (fehlt && e.netzsuche) {
    const auftrag = [
      'Gesucht sind bibliografische Angaben zu einem veröffentlichten Text (keine personenbezogenen Daten darüber hinaus).',
      `Adresse: ${e.url}`,
      `Titel: ${artikel.titel || e.titel}`,
      artikel.medium ? `Medium: ${artikel.medium}` : '',
      'Gesucht: Erscheinungsdatum, Verfasser bzw. Sprecher und deren Funktion (z. B. „Anglistin an der LMU München"), Anlass bzw. Medium.',
      'Nenne bis zu vier Fundstellen mit einem Auszug, in dem die Angabe steht.'
    ]
      .filter(Boolean)
      .join('\n')
    funde = (await e.netzsuche(auftrag).catch(() => [])).filter((f) => /^https:\/\//.test(f.url)).slice(0, 4)
  }

  const belege = [angabenSeite.join('\n'), e.text.slice(0, 3000), ...funde.map((f) => `${f.titel} ${f.auszug}`)].join('\n')
  const ersatz = (): string =>
    einleitungAusAngaben({ autor: artikel.autor, medium: artikel.medium, datum: artikel.datum, thema: artikel.titel || e.titel || e.thema }, e.sprache)

  try {
    const r = await ai<{ einleitung?: string; angaben?: { angabe?: string; url?: string }[] }>({
      system:
        'Du schreibst den Einleitungssatz über einem Material für eine Klassenarbeit bzw. ein Arbeitsblatt. Du übernimmst nur belegte Angaben und rätst nie.',
      user: [
        `SPRACHE DES SATZES: ${sprachName(e.sprache)} (die Sprache des Materials).`,
        'FORM: EIN Satz, endet mit Doppelpunkt. Enthält – soweit belegt – Verfasser mit Funktion bzw. Rolle („die LMU-Anglistin Claudia Olk"), Entstehungszeit (Erscheinungsdatum; bei historischen Quellen die Entstehungszeit), Anlass und Medium („in einem Beitrag für das Magazin EINSICHTEN", „in einer Rede vor dem Reichstag") und das Thema mit Bezug zur Aufgabe („… zur Aktualität Shakespeares:").',
        'Muster: „Am 25.10.2012 äußert sich der Historiker Max Mustermann zum Historikerstreit:" bzw. „In 2025, LMU anglicist Claudia Olk explains in the magazine EINSICHTEN why Shakespeare is more relevant than ever:"',
        'BELEGE: Nimm nur, was unten in den ANGABEN DER SEITE, im TEXT oder in einer FUNDSTELLE steht. Unsichere Angaben LÄSST DU WEG (lieber ohne Datum als mit einem geschätzten). Kein Verfasser bekannt → ohne Verfasser.',
        'angaben: je Angabe, die du aus einer FUNDSTELLE übernommen hast, die Angabe und die Adresse der Fundstelle. Angaben von der Seite selbst gehören nicht hierher.',
        `Thema der Arbeit: ${e.thema}`,
        `ANGABEN DER SEITE:\n${angabenSeite.join('\n')}`,
        funde.length ? `FUNDSTELLEN:\n${funde.map((f) => `- ${f.url}\n  ${f.titel}: ${f.auszug}`).join('\n')}` : 'FUNDSTELLEN: keine',
        `TEXT (Anfang):\n${e.text.slice(0, 2500)}`
      ].join('\n\n'),
      schemaName: 'material_einleitung',
      schema: EINLEITUNG_SCHEMA
    })
    let satz = String(r?.einleitung ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!satz) return { text: ersatz(), fundstellen: [] }
    // Keine geratenen Zahlen: Jede Jahreszahl bzw. jedes Datum muss belegt sein
    const ungedeckt = (satz.match(ZAHLEN) ?? []).filter((z) => !belege.includes(z.replace(/\s/g, '')) && !belege.includes(z))
    if (ungedeckt.length) return { text: ersatz(), fundstellen: [] }
    satz = satz.replace(/[.\s]*$/, '')
    if (!satz.endsWith(':')) satz += ':'
    const erlaubt = new Set(funde.map((f) => f.url))
    const fundstellen = (r?.angaben ?? [])
      .map((a) => ({ angabe: String(a?.angabe ?? '').trim(), url: String(a?.url ?? '').trim() }))
      .filter((a) => a.angabe && erlaubt.has(a.url))
    return { text: satz, fundstellen }
  } catch {
    return { text: ersatz(), fundstellen: [] }
  }
}

// ---------- Ablauf ----------


export async function schneideZu(
  e: ZuschnittEingabe,
  ai: AiRuf,
  opts: { netzsuche?: (auftrag: string) => Promise<Fund[]>; fortschritt?: (t: string) => void } = {}
): Promise<ZuschnittErgebnis> {
  const artikel = bereinigeArtikeltext(e.text, { seitentitel: e.seitentitel })
  const original = artikel.text
  const titel = artikel.titel || bereinigterSeitentitel(e.seitentitel ?? '') || 'Material'
  const nOriginal = wortzahl(original)
  let gekuerzt = original
  let weg: ZuschnittErgebnis['weg'] = 'ungekuerzt'
  let worthilfen: { term: string; explanation: string }[] = []
  const protokoll: string[] = []

  if (nOriginal > e.ziel.max || e.wunsch) {
    opts.fortschritt?.(`Der Text wird auf etwa ${zielWortzahl(e.ziel)} Wörter (${e.ziel.min}–${e.ziel.max}) zugeschnitten …`)
    let rueckmeldung = ''
    // Wörtlicher KI-Ausschnitt im Bereich, aber unter der Mitte: nur, wenn die App selbst nichts Passenderes findet
    let zuKurz: { text: string; n: number; antwort: ZuschnittAntwort } | null = null
    for (let versuch = 0; versuch < 2 && weg !== 'ki'; versuch++) {
      try {
        const r = await ai<ZuschnittAntwort>(zuschnittAuftrag(e, original, e.ziel, rueckmeldung))
        const kandidat = String(r?.gekuerzt ?? '').trim()
        const p = pruefeKuerzung(original, kandidat)
        const laenge = laengeBewerten(p.wortzahlGekuerzt, e.ziel)
        if (kandidat && p.ok && laenge === 'passt') {
          gekuerzt = kandidat
          weg = 'ki'
          worthilfen = pruefeWorthilfen(r?.worthilfen, kandidat, e.mediation ? e.zielsprache ?? e.sprache : e.sprache)
          if (r?.begruendung) protokoll.push(`Auswahl: ${r.begruendung}`)
        } else {
          if (kandidat && p.ok && laenge === 'zuKurz' && p.wortzahlGekuerzt >= e.ziel.min && (!zuKurz || p.wortzahlGekuerzt > zuKurz.n))
            zuKurz = { text: kandidat, n: p.wortzahlGekuerzt, antwort: r }
          rueckmeldung = [
            ...p.verstoesse,
            kandidat && laenge === 'zuKurz'
              ? `Der Ausschnitt hatte ${p.wortzahlGekuerzt} Wörter – zu kurz. Verlangt sind ${e.ziel.min}–${e.ziel.max}, angestrebt etwa ${zielWortzahl(e.ziel)} Wörter (mindestens ${mitteDesBereichs(e.ziel)}). Weitere zusammenhängende Absätze aufnehmen.`
              : '',
            kandidat && laenge === 'zuLang' ? `Der Ausschnitt hatte ${p.wortzahlGekuerzt} Wörter – zu lang. Verlangt sind höchstens ${e.ziel.max}.` : ''
          ]
            .filter(Boolean)
            .join(' ')
        }
      } catch {
        break
      }
    }
    if (weg !== 'ki' && nOriginal > e.ziel.max) {
      // Ersatzweg: Die App kürzt selbst – ganze Absätze, sicher wörtlich, aufgefüllt bis nahe an das Ziel
      const app = absatzAuswahl(original, e.ziel, [e.thema, e.teil].filter(Boolean).join(' '), e.sprache)
      const nApp = wortzahl(app)
      const soll = zielWortzahl(e.ziel)
      if (zuKurz && Math.abs(zuKurz.n - soll) < Math.abs(nApp - soll)) {
        // Der KI-Ausschnitt kommt dem Ziel trotzdem näher als die Absatzkürzung
        gekuerzt = zuKurz.text
        weg = 'ki'
        worthilfen = pruefeWorthilfen(zuKurz.antwort?.worthilfen, zuKurz.text, e.mediation ? e.zielsprache ?? e.sprache : e.sprache)
        protokoll.push(`Der Ausschnitt der KI liegt mit ${zuKurz.n} Wörtern unter der Mitte des Zielbereichs; die Absatzkürzung kam dem Ziel nicht näher.`)
      } else {
        gekuerzt = app
        weg = 'app'
        protokoll.push(`Die KI-Kürzung ließ sich nicht verwenden (Wortlaut oder Länge); die App hat absatzweise auf ${nApp} Wörter gekürzt.`)
      }
    }
  }

  // Zweite Stufe: nur Artikeltext?
  try {
    const r = await ai<{ nurArtikeltext?: boolean; fremd?: string[] }>({
      system: 'Du prüfst einen Textausschnitt, der als Material auf eine Klassenarbeit kommt.',
      user: [
        'Enthält der Ausschnitt nur Artikeltext? Kein Artikeltext sind: Rubriken, Datumszeilen, Verfasserzeilen, Bildunterschriften, Bildnachweise (©, Foto:), Vorspann/Teaser, der den Artikel nur ankündigt, Hinweise wie „Mehr zum Thema", Teilen-/Drucken-/Newsletter-Knöpfe, Cookie-Hinweise, Brotkrumen.',
        'Nenne in fremd für jede solche Zeile ihre ersten Wörter, genau wie im Ausschnitt. Ist alles Artikeltext: nurArtikeltext = true, fremd = [].',
        `AUSSCHNITT:\n${gekuerzt}`
      ].join('\n\n'),
      schemaName: 'material_artikelpruefung',
      schema: ARTIKEL_SCHEMA
    })
    if (r && r.nurArtikeltext === false && Array.isArray(r.fremd)) {
      const ohne = entferneAbsaetze(gekuerzt, r.fremd.map(String))
      if (ohne.entfernt.length && pruefeKuerzung(original, ohne.text).ok) {
        gekuerzt = ohne.text
        protokoll.push(...ohne.entfernt.map((a) => `Von der KI als Seitenbeiwerk erkannt und entfernt: „${a.slice(0, 80)}"`))
      }
    }
  } catch {
    // Die zweite Prüfung ist eine Absicherung – ohne sie bleibt die regelbasierte Bereinigung
  }

  const pruefung = pruefeKuerzung(original, gekuerzt)
  const quellenangabe = quellenangabeAus(e, artikel)
  const einleitung =
    e.einleitung ??
    (await einleitungErstellen(
      { artikel, text: gekuerzt, titel, url: e.url, sprache: e.sprache, thema: e.thema, quellenangabe, netzsuche: opts.netzsuche },
      ai
    ))

  const zuschnitt: TextZuschnitt = {
    original: original.slice(0, 60000),
    url: e.url,
    zielMin: e.ziel.min,
    zielMax: e.ziel.max,
    zielGrund: e.ziel.grund,
    thema: e.thema,
    ...(e.leitgedanke ? { leitgedanke: e.leitgedanke } : {}),
    ...(e.teil ? { teil: e.teil } : {}),
    sprache: e.sprache,
    ...(e.zielsprache ? { zielsprache: e.zielsprache } : {}),
    fach: e.fach,
    jahrgang: e.jahrgang,
    quellenangabe
  }
  const ablage: OriginalMaterialAblage = {
    titel,
    urheber: e.urheber || artikel.autor || '',
    url: e.url,
    text: gekuerzt,
    quellenangabe,
    hinweis: kuerzungsVermerk(pruefung),
    protokoll: [
      `Zielbereich: ${e.ziel.min}–${e.ziel.max} Wörter (${e.ziel.grund}).`,
      ...protokoll,
      ...artikel.entfernt.map((z) => `Seitenbeiwerk entfernt – ${z}`),
      ...kuerzungsProtokoll(pruefung),
      ...einleitung.fundstellen.map((f) => `Einleitung recherchiert: ${f.angabe} (Fundstelle: ${f.url})`)
    ],
    wortlautGeprueft: pruefung.ok,
    einleitung: einleitung.text,
    ...(einleitung.fundstellen.length ? { einleitungFundstellen: einleitung.fundstellen } : {}),
    zuschnitt,
    ...(worthilfen.length ? { worthilfen } : {})
  }
  return { ablage, pruefung, artikel, weg }
}

/**
 * Den Zielbereich nach einem Wunsch der Lehrkraft verschieben: „kürzer" → etwa ein Fünftel
 * weniger als jetzt, „länger" → etwa ein Fünftel mehr; sonst bleibt er.
 */
export function zielNachWunsch(ziel: Zielbereich, jetzt: number, wunsch: string): Zielbereich {
  const w = wunsch.toLowerCase()
  if (/kürzer|kuerzer|shorter|weniger/.test(w)) {
    const max = Math.max(60, Math.round(jetzt * 0.8))
    return { min: Math.max(40, Math.round(max * 0.75)), max, grund: `Wunsch der Lehrkraft: kürzer als ${jetzt} Wörter` }
  }
  if (/länger|laenger|longer|mehr text|ausführlicher/.test(w)) {
    const min = Math.round(jetzt * 1.2)
    return { min, max: Math.round(min * 1.35), grund: `Wunsch der Lehrkraft: länger als ${jetzt} Wörter` }
  }
  return ziel
}

/**
 * Zauberstab an einem zugeschnittenen Materialtext: Der Ausschnitt wird aus dem ORIGINAL neu
 * gewählt – „kürzer", „länger", „anderer Ausschnitt" –, nie umformuliert. Einleitung und
 * Titel bleiben (sie beschreiben den ganzen Artikel).
 */
export async function neuZuschneiden(block: TextBlock, wunsch: string, art: 'ueberarbeiten' | 'neu', ai: AiRuf): Promise<TextBlock> {
  const z = block.zuschnitt
  if (!z) throw new Error('Dieser Text hat kein gespeichertes Original.')
  const jetzt = wortzahl(block.body)
  const ziel = zielNachWunsch({ min: z.zielMin, max: z.zielMax, grund: z.zielGrund }, jetzt, wunsch)
  const anderer = art === 'neu' || /ander|other|different/i.test(wunsch)
  const r = await schneideZu(
    {
      text: z.original,
      url: z.url,
      quellenangabe: z.quellenangabe,
      ziel,
      thema: z.thema,
      leitgedanke: z.leitgedanke,
      teil: z.teil,
      sprache: z.sprache,
      zielsprache: z.zielsprache,
      fach: z.fach ?? '',
      jahrgang: z.jahrgang ?? 0,
      mediation: block.language === 'de' && Boolean(z.zielsprache && z.zielsprache !== 'de'),
      wunsch: [wunsch.trim(), anderer ? 'Wähle einen ANDEREN Ausschnitt als bisher.' : ''].filter(Boolean).join(' ') || 'Ausschnitt neu wählen',
      ...(anderer ? { bisher: block.body } : {}),
      einleitung: { text: block.intro ?? '', fundstellen: block.introFundstellen ?? [] }
    },
    ai
  )
  return {
    ...block,
    body: r.ablage.text,
    source: [r.ablage.quellenangabe, r.ablage.hinweis].filter(Boolean).join(' '),
    ...(r.ablage.worthilfen ? { glossary: r.ablage.worthilfen } : {}),
    zuschnitt: { ...z, zielMin: ziel.min, zielMax: ziel.max, zielGrund: ziel.grund }
  }
}
