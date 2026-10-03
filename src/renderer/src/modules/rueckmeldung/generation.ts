/**
 * Rückmeldung (Großprogramm 0.4, F3): Grundlage aus gespeichertem Material, Übertragen von
 * Fotos/Scans in Text, Rückmeldebogen ohne Note.
 */
import { antwortSpracheAus, type AntwortSprache } from './antwortSprache'
import { fremdsprachlich, gesamtAusTeilen, getrennt, teileAusArbeit, teilZeile, wertungenAusKi, type BewertungsTeil, type TeilWertung } from './teilbewertung'
import { deutschMoeglich, pruefeZielsprache, zielsprachHinweis } from './sprachErkennung'
import type { StructuredRequest } from '@shared/types'
import { korrigiereOperatorformen } from '@shared/operatoren/satzbau'
import { ersetzeNamen, findeNamen, type Zuordnung } from '@shared/pseudonymisierung'
import { arr, enumOf, int, obj, str, type Schema } from '../../shared/aiSchema'
import { describeBlock, describeSheet } from '../arbeitsblatt/generation/describe'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { normalisiereArbeit } from '../klassenarbeit/model/fassungen'
import type { Exam } from '../klassenarbeit/model/types'
import { examToWorksheet } from '../klassenarbeit/render/examWorksheet'
import type { GrammarTest } from '../grammatiktest/model/types'
import { testToWorksheet } from '../grammatiktest/render/testWorksheet'
import type { Kurztest } from '../lernzielkontrolle/model/types'
import { kurztestToWorksheet } from '../lernzielkontrolle/render/kurztestWorksheet'
import { describeBlock as vokabelBlock } from '../vokabeltest/generation/quality'
import { LANGUAGES, type TestDocument } from '../vokabeltest/model/types'
import { fachIdVon } from '../../shared/fachfarben'
import type { Korrekturzeichen } from '../../shared/korrekturzeichen'
import { newId } from '../vokabeltest/model/random'
import { EINSTUFUNGEN, einstufungVon, gesamtEinstufen, hatForm, kriterienEinstufen, tabellenSumme, vorschlag, type SkalenKontext } from './art'
import { klemme } from './korrekturrand'
import { kiLandesregeln } from './laenderRegeln'
import { ausgleichAnweisung, maxSchritte, ohneRechtschreibung } from './nachteilsausgleich'
import { tabelleText } from './tabelle'
import { begruendungMitDeckel, oberstufeVon, sprachRegeln, tabelleDeckeln, teileDeckeln, teileDeckelSatz, umfangBefund } from './sprachmassstab'
import { klartext, ohneKiTest } from './abgabeTrennen'
import type { Abgabe, Bogen, BogenKriterium, Einschaetzung, Einstufungswert, Grundlage, GrundlageArt, RandKommentar, Rueckmeldung } from './model/types'

// ---------- Grundlage aus gespeichertem Material ----------

/** Aufgaben und Erwartungshorizont eines Arbeitsblatts (auch umgewandelte Arbeiten und Tests) */
export function grundlageAusBlatt(ws: Worksheet, art: GrundlageArt, docId: string, titel: string): Grundlage {
  const aufgaben = ws.sheets.map((s) => (ws.sheets.length > 1 ? `[${s.label}]\n` : '') + describeSheet(s)).join('\n\n')
  const loesungen = ws.sheets
    .flatMap((s) => s.blocks)
    .filter((b) => b.type === 'task' && b.solution?.trim())
    .map((b, i) => `Aufgabe ${i + 1}: ${(b as { solution: string }).solution.trim()}`)
  return { art, docId, titel, aufgaben, ...(loesungen.length ? { erwartung: loesungen.join('\n') } : {}) }
}

/**
 * Vokabeltest als Grundlage: die Aufgaben der ersten Fassung mit ihren Lösungen („→ answer").
 * Rückmeldung passt hier vor allem zu Aufgaben mit eigenen Sätzen; Lücken und Zuordnungen
 * zeigen, welche Wörter noch nicht sitzen.
 */
export function grundlageAusVokabeltest(doc: TestDocument, docId: string, titel: string): Grundlage {
  const bloecke = doc.variants[0]?.blocks ?? []
  return {
    art: 'vokabeltest',
    docId,
    titel,
    aufgaben: bloecke.map((b, i) => `Aufgabe ${i + 1}\n${vokabelBlock(b)}`).join('\n\n'),
    erwartung: 'Die Lösungen stehen in den Aufgaben hinter „→ answer" bzw. „→ model answer".'
  }
}

export interface MaterialEintrag {
  art: Exclude<GrundlageArt, 'frei'>
  id: string
  name: string
  fach: string
  updatedAt: string
}

export const ART_TITEL: Record<Exclude<GrundlageArt, 'frei'>, string> = {
  arbeitsblatt: 'Arbeitsblatt',
  klassenarbeit: 'Klassenarbeit',
  lernzielkontrolle: 'Lernzielkontrolle',
  grammatiktest: 'Grammatiktest',
  vokabeltest: 'Vokabeltest'
}

/** Alle gespeicherten Materialien, aus denen eine Rückmeldung entstehen kann – neueste zuerst */
export async function materialListe(): Promise<MaterialEintrag[]> {
  const [ab, ka, lzk, gt, vt] = await Promise.all([
    window.api.sheets.list().catch(() => []),
    window.api.exams.list().catch(() => []),
    window.api.kurztests.list().catch(() => []),
    window.api.grammarTests.list().catch(() => []),
    window.api.tests.list().catch(() => [])
  ])
  const eintrag = (art: MaterialEintrag['art']) => (m: { id: string; name: string; updatedAt: string; subjectLabel?: string }) => ({
    art,
    id: m.id,
    name: m.name,
    fach: m.subjectLabel ?? '',
    updatedAt: m.updatedAt
  })
  return [
    ...ab.map(eintrag('arbeitsblatt')),
    ...ka.map(eintrag('klassenarbeit')),
    ...lzk.map(eintrag('lernzielkontrolle')),
    ...gt.map(eintrag('grammatiktest')),
    ...vt.map(eintrag('vokabeltest'))
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Lädt ein gespeichertes Material und macht daraus die Grundlage */
export async function ladeGrundlage(
  art: MaterialEintrag['art'],
  id: string
): Promise<{ grundlage: Grundlage; fach: { id: string; label: string; grade: number } }> {
  if (art === 'arbeitsblatt') {
    const s = await window.api.sheets.get(id)
    const ws = s.payload as Worksheet
    return { grundlage: grundlageAusBlatt(ws, art, id, s.name), fach: { id: ws.meta.subjectId, label: ws.meta.subjectLabel, grade: ws.meta.grade } }
  }
  if (art === 'klassenarbeit') {
    const s = await window.api.exams.get(id)
    const e = normalisiereArbeit(s.payload as Exam)
    // Teile mit Gewicht, Punkten und Inhaltsanteil stehen in der Arbeit fest (29.09.2026)
    const { teile, verrechnung } = teileAusArbeit(e)
    return {
      grundlage: { ...grundlageAusBlatt(examToWorksheet(e, 0), art, id, s.name), ...(teile.length > 1 || teile.some(getrennt) ? { teile, verrechnung } : {}) },
      fach: { id: e.meta.subjectId, label: e.meta.subjectLabel, grade: e.meta.grade }
    }
  }
  if (art === 'lernzielkontrolle') {
    const s = await window.api.kurztests.get(id)
    const t = s.payload as Kurztest
    return {
      grundlage: grundlageAusBlatt(kurztestToWorksheet(t, 0), art, id, s.name),
      fach: { id: t.meta.subjectId, label: t.meta.subjectLabel, grade: t.meta.grade }
    }
  }
  if (art === 'vokabeltest') {
    const s = await window.api.tests.get(id)
    // Die Bibliothek legt Wörter, Einstellungen und den erzeugten Test zusammen ab
    const doc = (s.payload as { doc?: TestDocument | null }).doc
    if (!doc?.variants?.length) throw new Error('Dieser Vokabeltest hat noch keine Aufgaben – erst den Test erstellen.')
    const sprache = LANGUAGES.find((l) => l.value === doc.settings.targetLanguage)?.label ?? doc.settings.targetLanguage
    return {
      grundlage: grundlageAusVokabeltest(doc, id, s.name),
      fach: { id: fachIdVon(doc.settings.targetLanguage) ?? fachIdVon(sprache) ?? 'englisch', label: sprache, grade: doc.settings.grade }
    }
  }
  const s = await window.api.grammarTests.get(id)
  const t = s.payload as GrammarTest
  return { grundlage: grundlageAusBlatt(testToWorksheet(t), art, id, s.name), fach: { id: t.meta.subjectId, label: t.meta.subjectLabel, grade: t.meta.grade } }
}

// ---------- Foto/Scan → Text ----------

const TRANSKRIPT = obj({
  text: str('Der Text der Schülerarbeit, Wort für Wort übertragen – mit allen Fehlern, nichts verbessert'),
  unleserlich: str('Stellen, die sich nicht sicher lesen ließen, kurz genannt – sonst leer'),
  erkannteNamen: arr(str('Personennamen, die in der Arbeit stehen (Name im Kopf, Unterschrift, Namen von Mitschülern)'))
})

export function transkriptAnfrage(a: Abgabe): StructuredRequest {
  return {
    system:
      'Du überträgst handschriftliche oder gedruckte Schülerarbeiten wortgetreu in Text. Du verbesserst nichts: Rechtschreib-, Grammatik- und Zeichensetzungsfehler bleiben stehen, weil die Lehrkraft genau dazu eine Rückmeldung gibt.',
    user: [
      'Übertrage den Text auf den Bildern (in der Reihenfolge der Seiten). Durchgestrichenes weglassen, Einfügungen an ihrer Stelle einsetzen.',
      'Personennamen nennst du zusätzlich im Feld erkannteNamen; im Text lässt du sie stehen – die App ersetzt sie.'
    ].join('\n'),
    images: a.bilder,
    schemaName: 'rueckmeldung_transkript',
    schema: TRANSKRIPT
  }
}

/** Antwort der Übertragung → Text mit Kürzel statt Namen */
export function transkriptUebernehmen(a: Abgabe, daten: unknown): Abgabe {
  const d = (daten ?? {}) as { text?: unknown; unleserlich?: unknown; erkannteNamen?: unknown }
  const roh = String(d.text ?? '').trim()
  if (!roh) throw new Error('Auf den Bildern wurde kein Text erkannt.')
  const namen = (Array.isArray(d.erkannteNamen) ? d.erkannteNamen : []).map((n) => String(n ?? '').trim()).filter((n) => n.length > 1)
  // Alle erkannten Namen bekommen das Kürzel der Abgabe – die Arbeit gehört EINER Person; Namen Dritter werden ebenfalls unkenntlich
  const { text, zuordnung } = ersetzeNamen(roh, namen, a.pseudonyme ?? [])
  const hinweis = String(d.unleserlich ?? '').trim()
  // Die Seitenbilder bleiben als `scans` erhalten – für Kommentare neben dem eingescannten Text (29.09.2026)
  return {
    ...a,
    text: hinweis ? `${text}\n\n[unleserlich: ${hinweis}]` : text,
    bilder: [],
    scans: a.scans?.length ? a.scans : a.bilder,
    pseudonyme: zuordnung
  }
}

/**
 * Der Text einer Abgabe, wie er an die KI geht: ohne Namen (Praxislauf 28.09.2026 – eingetippte
 * und als Datei geladene Abgaben gingen bis dahin unverändert hinaus, nur übertragene Fotos
 * waren bereinigt). Der eingetragene Name der Person wird zu ihrem Kürzel, weitere erkannte Namen
 * (Kopfzeile, bekannte Vornamen) zu „S1-P1" usw. Die Zuordnung bleibt an der Abgabe auf diesem
 * Rechner und setzt die Namen im Bogen wieder ein; der Text selbst bleibt für die Lehrkraft, wie er war.
 */
export function ohneNamen(a: Abgabe): { text: string; pseudonyme: Zuordnung[] } {
  const eigener = a.name.trim()
  const bisher = a.pseudonyme ?? []
  const fremde = findeNamen(a.text)
    .map((f) => f.name)
    .filter((n) => n.length > 1 && n !== eigener && !eigener.split(/\s+/).includes(n) && !bisher.some((z) => z.name === n))
  let text = a.text
  if (eigener) text = ersetzeNamen(text, [eigener], [{ kuerzel: a.kuerzel, name: eigener }]).text
  const neu: Zuordnung[] = fremde.map((name, i) => ({ kuerzel: `${a.kuerzel}-P${bisher.length + i + 1}`, name }))
  const alle = [...bisher, ...neu]
  if (alle.length)
    text = ersetzeNamen(
      text,
      alle.map((z) => z.name),
      alle
    ).text
  return { text, pseudonyme: alle }
}

// ---------- Rückmeldebogen ----------

const EINSCHAETZUNGEN: Einschaetzung[] = ['sicher', 'teilweise', 'noch nicht']

/** Was der Bogen braucht, das nicht im Dokument steht (Einstellungen der Lehrkraft) */
export interface BogenKontext {
  /** Erlaubte Korrekturzeichen des Fachs (shared/korrekturzeichen.ts) */
  zeichen: Korrekturzeichen[]
  /** Prozentschwellen der Noten 1–6 (Notenschlüssel der Einstellungen) */
  schwellen?: number[]
}

const OHNE_KONTEXT: BogenKontext = { zeichen: [] }

/** Kommentare am Scan: Hat die Abgabe Bilder und ist die Form gewählt? */
export const scanKommentare = (r: Rueckmeldung, a: Abgabe): boolean => hatForm(r.meta, 'scan') && Boolean(a.scans?.length || a.bilder.length)
/** Korrekturrand am Text: gewählt und (bei Scans) nicht schon am Bild */
export const textRand = (r: Rueckmeldung, a: Abgabe): boolean => hatForm(r.meta, 'rand') && !scanKommentare(r, a)
const mitTabelle = (r: Rueckmeldung): boolean => hatForm(r.meta, 'tabelle') && Boolean(r.tabelle?.kriterien.length)

/** Das Antwortschema passt sich den gewählten Formen an – die KI liefert nur, was gebraucht wird */
/**
 * Bewertung nach Teilen (29.09.2026): nur mit Einstufung – ohne Note bleibt es bei einer
 * Rückmeldung in Worten, die Inhalt und Sprache aber getrennt anspricht (`teilRegeln`).
 */
export const mitTeilen = (r: Rueckmeldung): boolean => Boolean(r.grundlage.teile?.length) && einstufungVon(r.meta) !== 'keine'

/** Teile der Arbeit für die Anfrage – mit Kennung, Gewicht und Inhaltsanteil */
export function teileText(r: Rueckmeldung): string {
  const teile = r.grundlage.teile
  if (!teile?.length) return ''
  const v = r.grundlage.verrechnung ?? 'prozent'
  return [
    `TEILE DER ARBEIT (Gesamtleistung nach ${v === 'punkte' ? 'Punkten' : 'prozentualer Gewichtung'}):`,
    ...teile.map(
      (t) =>
        `[${t.id}] ${teilZeile(t, v)}${getrennt(t) ? ' – Inhalt und Sprache getrennt bewerten' : ''}${
          t.ergebnisSprache === 'deutsch'
            ? ' – Antwort AUF DEUTSCH verlangt (Deutsch ist hier richtig)'
            : t.ergebnisSprache === 'zielsprache'
              ? ` – Antwort auf ${r.meta.subjectLabel} verlangt (Deutsch ist hier falsch)`
              : t.art === 'sprachmittlung'
                ? ' – Richtung laut Aufgabenstellung prüfen (ins Deutsche: Deutsch ist richtig)'
                : ''
        }`
    )
  ].join('\n')
}

export function teilRegeln(r: Rueckmeldung): string[] {
  const teile = r.grundlage.teile
  if (!teile?.length) return []
  const getrennteTeile = teile.filter(getrennt)
  const regeln: string[] = []
  if (getrennteTeile.length)
    regeln.push(
      `- ${getrennteTeile.map((t) => t.titel).join(', ')}: Inhalt (Aufgabenbezug, Vollständigkeit, Textsorte, Adressatenbezug) und Sprache (Wortschatz, Grammatik, Satzbau, Kohärenz, sprachliche Richtigkeit) GETRENNT beurteilen – auch in Stärken und nächsten Schritten.`
    )
  // Oberstufe (KMK 2012, IQB, NRW, BE/BB, SH): Ist Inhalt ODER Sprache ungenügend, höchstens 3 Notenpunkte für diesen Teil
  if (getrennteTeile.length && r.meta.grade >= 11)
    regeln.push(
      '- Oberstufe: Ist bei einem Schreib-/Sprachmittlungsteil der Inhalt ODER die Sprache ungenügend (unter 20 %), erreicht dieser Teil insgesamt höchstens 38 % (KMK: höchstens 3 Notenpunkte; die App deckelt).'
    )
  if (mitTeilen(r))
    regeln.push(
      `- Bewerte JEDEN Teil (Kennung in eckigen Klammern): ${getrennteTeile.length ? 'bei Schreiben/Sprachmittlung Erfüllungsgrad von Inhalt und Sprache getrennt, ' : ''}bei anderen Teilen den Erfüllungsgrad des Teils. Die App verrechnet daraus die Gesamtleistung.`
    )
  return regeln
}

/** Kurzbegründung der Gesamtleistung aus den Teilwertungen */
function begruendungAusTeilen(teile: BewertungsTeil[], w: TeilWertung[]): string {
  return teile
    .map((t) => {
      const x = w.find((y) => y.teilId === t.id)
      if (!x) return ''
      return getrennt(t) ? `${t.titel}: Inhalt ${x.inhalt ?? 0} %, Sprache ${x.sprache ?? 0} %` : `${t.titel}: ${x.anteil ?? 0} %`
    })
    .filter(Boolean)
    .join(' · ')
}

export function bogenSchema(r: Rueckmeldung, a: Abgabe, ctx: BogenKontext = OHNE_KONTEXT): Schema {
  const m = r.meta
  const felder: Record<string, Schema> = {}
  const schriftlich = hatForm(m, 'schriftlich')
  if (schriftlich) felder.staerken = arr(str('Was schon gelingt – konkret, mit Bezug auf eine Stelle der Arbeit, ein Satz'))
  if (hatForm(m, 'tipps'))
    felder.schritte = arr(str('Nächster Schritt als Handlung („Achte beim nächsten Mal darauf, …"), ein Satz, mit Beispiel aus der Arbeit'))
  if (schriftlich || kriterienEinstufen(m))
    felder.kriterien = arr(
      obj({
        kriterium: str('Kriterium aus der Aufgabe bzw. dem Schwerpunkt der Lehrkraft'),
        einschaetzung: enumOf(EINSCHAETZUNGEN),
        beleg: str('Kurzes Zitat oder Stelle aus der Arbeit, die die Einschätzung belegt'),
        ...(kriterienEinstufen(m) ? { anteil: int('Erfüllungsgrad dieses Kriteriums in Prozent (0–100)') } : {})
      })
    )
  if (schriftlich) felder.schluss = str('Ein ermutigender, ehrlicher Schlusssatz – ohne Floskel')
  if (mitTeilen(r))
    felder.teile = arr(
      obj({
        id: str('Kennung des Teils in eckigen Klammern, ohne Klammern'),
        inhalt: int('Nur Schreiben/Sprachmittlung: Erfüllungsgrad des INHALTS in Prozent (0–100) – sonst 0'),
        sprache: int('Nur Schreiben/Sprachmittlung: Erfüllungsgrad der SPRACHE in Prozent (0–100) – sonst 0'),
        anteil: int('Nur andere Teile: Erfüllungsgrad des Teils in Prozent (0–100) – sonst 0'),
        begruendung: str('Kurze Begründung mit Bezug auf die Arbeit')
      })
    )
  if (gesamtEinstufen(m) && !mitTabelle(r) && !mitTeilen(r))
    felder.gesamt = obj({
      anteil: int('Erfüllungsgrad der Gesamtleistung in Prozent (0–100), gemessen am Erwartungshorizont und an der Jahrgangsstufe'),
      begruendung: str('Begründung der Einschätzung in 1–2 Sätzen für die Lehrkraft')
    })
  if (mitTabelle(r))
    felder.tabelle = arr(
      obj({
        id: str('Kennung des Kriteriums in eckigen Klammern, ohne Klammern'),
        punkte: int('Erreichte Punkte – bei Kriterien mit Stufen 0'),
        stufe: int('Stufe (0 = beste) – bei Kriterien mit Punkten 0'),
        begruendung: str('Kurze Begründung mit Bezug auf die Arbeit')
      })
    )
  if (hatForm(m, 'rand') || scanKommentare(r, a)) {
    const zeichen = ['', ...ctx.zeichen.map((z) => z.zeichen).filter(Boolean)]
    felder.rand = arr(
      obj({
        zitat: str('Die Stelle WÖRTLICH aus der Arbeit, 1–8 Wörter, genau so geschrieben wie dort (auch mit Fehlern)'),
        text: str('Kommentar am Rand: kurz, konkret, bei Fehlern mit Verbesserung'),
        zeichen: enumOf(zeichen),
        art: enumOf(['lob', 'fehler', 'hinweis']),
        ...(scanKommentare(r, a)
          ? {
              seite: int('Seite des Bildes, auf der die Stelle steht (0 = erstes Bild)'),
              x: int('Waagerechte Lage der Stelle in Prozent der Bildbreite (0 = links)'),
              y: int('Senkrechte Lage der Stelle in Prozent der Bildhöhe (0 = oben)')
            }
          : {})
      })
    )
  }
  if (m.digitalesBlatt)
    felder.aufgaben = arr(
      obj({
        nr: int('Nummer der Aufgabe wie auf dem Blatt'),
        gelungen: str('Was inhaltlich gelungen ist – konkret, mit kurzem Zitat; leer, wenn nichts bearbeitet ist'),
        fehlt: str('Was fehlt oder nicht stimmt – sachlich genau benannt'),
        schritt: str('Ein nächster Schritt mit Beispiel oder Satzanfang, ohne die Lösung vorwegzunehmen')
      })
    )
  if (hatForm(m, 'ueberarbeitung'))
    felder.ueberarbeitung = obj({
      zitat: str('Die Stelle, die überarbeitet werden soll, wörtlich (ein Satz oder Absatzanfang)'),
      auftrag: str('Konkreter Überarbeitungsauftrag als Handlung, 1–3 Sätze')
    })
  felder.fehler = arr(
    obj({
      kategorie: str('Fehlerschwerpunkt als kurze Kategorie (z. B. „Kommasetzung vor dass“, „Belege fehlen“, „Vorzeichen“)'),
      beispiel: str('Ein Beispiel aus der Arbeit')
    })
  )
  if (m.elternfassung)
    felder.eltern = str(
      'Fassung für die Eltern: 3–5 Sätze in einfacher Sprache, Anrede „Sie“, ohne Note – was gelingt, woran gearbeitet wird, wie zu Hause geholfen werden kann'
    )
  return obj(felder)
}

/**
 * Digitales Arbeitsblatt (03.10.2026, Befund der Lehrkraft: Feedback „sehr rudimentär", z. B. „Deine
 * Antwort ist als zusammenhängender Text formuliert …"): Aufgabe für Aufgabe, Inhalt vor Form,
 * konkrete nächste Schritte mit Beispiel; Randkommentare mit wörtlichen Zitaten für die Markierung.
 */
export const BLATT_REGELN = [
  '- ARBEITSBLATT, AUFGABE FÜR AUFGABE: Für JEDE Aufgabe ein Fazit (Feld „aufgaben"): „gelungen" = was inhaltlich stimmt, konkret mit kurzem Zitat; „fehlt" = was nach Aufgabenstellung und Erwartungshorizont fehlt oder nicht stimmt, sachlich genau benannt (z. B. „Die Ursache X fehlt" statt „Ergänze mehr"); „schritt" = EIN machbarer nächster Schritt mit Beispiel oder Satzanfang, der zeigt, wie es geht – ohne die Musterlösung vorwegzunehmen. Unbearbeitete Aufgaben: gelungen leer, fehlt „noch nicht bearbeitet", schritt = wie man anfängt.',
  '- INHALT VOR FORM: Beurteile zuerst, ob der Operator erfüllt ist („nenne" = Stichpunkte genügen, „beschreibe", „erkläre", „beurteile" = Zusammenhänge und Begründungen). Bemängle die Form (Fließtext, Stichpunkte, Tabelle) NUR, wenn die Aufgabe sie ausdrücklich verlangt.',
  '- Keine Allgemeinplätze („Achte auf Genauigkeit", „Schau noch einmal in die Quelle") ohne zu sagen, WORAUF genau; jede Aussage bezieht sich auf eine Stelle der Antwort oder des Materials.',
  '- Randkommentare: neben den Sprachfehlern zu jeder inhaltlich bearbeiteten Aufgabe mindestens einen Kommentar an der passenden Stelle – Lob (art „lob") für Gelungenes, Hinweis (art „hinweis") für Unstimmiges oder Fehlendes; Zitat wörtlich aus der Antwort, 1–8 Wörter.'
]

export function bogenAnfrage(r: Rueckmeldung, a: Abgabe, system: string, ctx: BogenKontext = OHNE_KONTEXT): StructuredRequest {
  const m = r.meta
  const du = m.anrede === 'du'
  const art = einstufungVon(m)
  const scan = scanKommentare(r, a)
  const zeichenListe = ctx.zeichen.filter((z) => z.zeichen).map((z) => `${z.zeichen} = ${z.bedeutung}`)
  const regeln = [
    `- ${hatForm(m, 'schriftlich') ? '2–4 Stärken' : ''}${hatForm(m, 'schriftlich') && hatForm(m, 'tipps') ? ' und ' : ''}${hatForm(m, 'tipps') ? `bis zu ${maxSchritte(a.ausgleich)} nächste Schritte` : ''}, jeweils konkret mit Bezug auf eine Stelle der Arbeit; Schritte machbar und nach Wichtigkeit geordnet.`,
    hatForm(m, 'schriftlich') || kriterienEinstufen(m)
      ? '- Kriterien aus der Aufgabe (und dem Schwerpunkt der Lehrkraft) mit Einschätzung „sicher", „teilweise" oder „noch nicht" und einem Beleg aus der Arbeit.'
      : '',
    '- Freundlich und ehrlich; keine Übertreibung, keine allgemeinen Floskeln.',
    '- Personen nur mit ihrem Kürzel nennen (S1, S2 …).',
    art === 'keine'
      ? '- KEINE Note, KEINE Punkte, KEINE Prozentwerte, keine Einstufung wie „gut" oder „ausreichend" – die Rückmeldung ist lernförderlich, nicht bewertend.'
      : `- Die Lehrkraft vergibt die Einstufung (${EINSTUFUNGEN.find((e) => e.id === art)?.label}) selbst. Du schlägst nur den ERFÜLLUNGSGRAD in Prozent vor${mitTabelle(r) ? ' bzw. die Punkte je Kriterium der Tabelle' : ''}. In den Texten steht KEINE Note und keine Notenbezeichnung.`,
    mitTabelle(r) ? '- Bewerte JEDES Kriterium der Bewertungstabelle (Kennung in eckigen Klammern) mit Punkten bzw. Stufe und kurzer Begründung.' : '',
    ...teilRegeln(r),
    hatForm(m, 'rand') || scan
      ? `- Korrekturrand (29.09.2026: Fehler zuverlässig markieren): JEDEN Rechtschreib-, Grammatik-, Zeichensetzungs- und Wortfehler einzeln markieren – art „fehler", Zitat = nur das fehlerhafte Wort bzw. die kurze Wortgruppe, Text = Korrekturzeichen-Bedeutung knapp und die VERBESSERUNG (z. B. „dargestellt"). Keinen Fehler auslassen, auch wenn es viele sind (bis zu 60 Kommentare); bei Wiederholung desselben Fehlers jede Stelle markieren. Zusätzlich 2–5 Kommentare mit Lob bzw. inhaltlichen Hinweisen. Reihenfolge wie im Text. Das Zitat steht WÖRTLICH so in der Arbeit (mit dem Fehler).${zeichenListe.length ? ` Korrekturzeichen NUR aus dieser Liste (bei Lob und Hinweisen leer): ${zeichenListe.join('; ')}.` : ''}`
      : '',
    scan ? '- Die Arbeit liegt auch als Bild bei: Gib für jeden Randkommentar Seite und ungefähre Lage (x, y in Prozent) der Stelle im Bild an.' : '',
    hatForm(m, 'ueberarbeitung')
      ? '- Überarbeitungsauftrag: EINE Stelle, deren Überarbeitung am meisten bringt, mit konkretem Auftrag – als korrekt gebildeter Imperativ, trennbare Verben mit der Vorsilbe am Satzende („Formuliere den Satz um", „Fassen Sie den Absatz zusammen", nie „Zusammenfassen Sie").'
      : '',
    '- Fehlerschwerpunkte: 1–4 wiederkehrende Fehlerarten der Arbeit (für die Übersicht der Lerngruppe); keine, wenn es keine gibt.',
    ...(m.digitalesBlatt ? BLATT_REGELN : []),
    ...sprachRegeln(r, a, art !== 'keine'),
    ...abgabeRegeln(r, a)
  ]
  const ausgleich = ausgleichAnweisung(a.ausgleich)
  const land = kiLandesregeln(m, art)
  return {
    system,
    user: [
      `Schreibe eine Rückmeldung zur Arbeit von ${a.kuerzel} (${m.subjectLabel}, Klasse ${m.grade}). Sprich die Person mit „${du ? 'du' : 'Sie'}" an.`,
      'REGELN:',
      ...regeln,
      land,
      ausgleich,
      m.schwerpunkt.trim() ? `SCHWERPUNKT DER LEHRKRAFT: ${m.schwerpunkt.trim()}` : '',
      `AUFGABE${r.grundlage.titel ? ` (${r.grundlage.titel})` : ''}:`,
      r.grundlage.aufgaben,
      r.grundlage.erwartung ? `ERWARTUNGSHORIZONT:\n${r.grundlage.erwartung}` : '',
      mitTabelle(r) ? tabelleText(r.tabelle!) : '',
      teileText(r),
      `ARBEIT VON ${a.kuerzel} (die Abgabe, zwischen <<<ARBEIT und ARBEIT>>>):`,
      '<<<ARBEIT',
      ohneKiTest(klartext(a.text)).text.trim() || (scan ? '(Text nur auf den beigefügten Bildern)' : ''),
      'ARBEIT>>>'
    ]
      .filter(Boolean)
      .join('\n'),
    ...(scan ? { images: (a.scans?.length ? a.scans : a.bilder).slice(0, 8) } : {}),
    schemaName: 'rueckmeldung_bogen',
    schema: bogenSchema(r, a, ctx)
  }
}

/**
 * Entfernt, was nach Note oder Punkten aussieht – auch wenn die KI sich nicht daran hält.
 * Liefert die Zahl der entfernten Sätze.
 *
 * Seit 29.09.2026: Mit gewählter Einstufung steht die Note in ihrem eigenen Feld (von der
 * Lehrkraft bestätigt). Aus den TEXTEN verschwinden dann weiter Noten und Notenbezeichnungen –
 * sonst widerspräche der Text womöglich der bestätigten Note –, Punkte dürfen dort stehen,
 * wenn die Bewertungstabelle mit Punkten arbeitet.
 */
const NOTE_WORT = /\b(Note|Noten|Notenpunkte?|Zensur)\b|\b(befriedigend|ausreichend|mangelhaft|ungenügend)\b|\bNote\s*[1-6]|\b[1-6][+\-−](?![\w])/i
const PUNKTE = /\b(Punkte?|Prozent)\b|\d+\s*(\/|von)\s*\d+|\d+\s*%/i

export interface PruefModus {
  /** Punkte und Prozent dürfen im Text stehen (Tabelle mit Punkten) */
  punkteErlaubt?: boolean
}

export function pruefeBogen(b: Bogen, modus: PruefModus = {}): Bogen {
  let entfernt = 0
  const verboten = (s: string | undefined): boolean => Boolean(s) && (NOTE_WORT.test(s!) || (!modus.punkteErlaubt && PUNKTE.test(s!)))
  const sauber = (liste: string[]): string[] =>
    liste.filter((s) => {
      if (verboten(s)) {
        entfernt++
        return false
      }
      return true
    })
  const kriterien: BogenKriterium[] = []
  const stufen: (Einstufungswert | null)[] = []
  b.kriterien.forEach((k, i) => {
    if (verboten(k.kriterium) || verboten(k.beleg)) {
      entfernt++
      return
    }
    kriterien.push(k)
    if (b.kriterienStufen) stufen.push(b.kriterienStufen[i] ?? null)
  })
  const schluss = b.schluss && verboten(b.schluss) ? (entfernt++, undefined) : b.schluss
  const rand = b.rand?.filter((k) => {
    if (verboten(k.text)) {
      entfernt++
      return false
    }
    return true
  })
  const ueberarbeitung = b.ueberarbeitung && verboten(b.ueberarbeitung.auftrag) ? (entfernt++, undefined) : b.ueberarbeitung
  const eltern = b.eltern && NOTE_WORT.test(b.eltern) ? (entfernt++, undefined) : b.eltern
  const { entfernt: _alt, ...rest } = b
  void _alt
  return {
    ...rest,
    staerken: sauber(b.staerken),
    schritte: sauber(b.schritte),
    kriterien,
    ...(b.kriterienStufen ? { kriterienStufen: stufen } : {}),
    schluss,
    ...(rand ? { rand } : {}),
    ueberarbeitung,
    eltern,
    ...(entfernt ? { entfernt } : {})
  }
}

/**
 * Regeln zur Abgabe selbst (29.09.2026, Fehlerberichte der Lehrkraft): Die KI schrieb bei einer
 * kurzen deutschen Abgabe „Da kein eigener Antworttext vorliegt …", und in den Fremdsprachen kam
 * kein Wort dazu, dass die Abgabe auf Deutsch statt in der Zielsprache verfasst war.
 */
/** Antwortsprache der Aufgabe: Wahl der Lehrkraft, sonst aus der Aufgabe erkannt (nur Fremdsprachen) */
export const antwortSpracheVon = (r: Rueckmeldung): AntwortSprache | undefined =>
  fremdsprachlich(r.meta.subjectId) ? (r.grundlage.antwortSprache ?? antwortSpracheAus(r.grundlage.aufgaben, r.meta.subjectId)) : undefined

export function abgabeRegeln(r: Rueckmeldung, a: Abgabe): string[] {
  const regeln = [
    '- Der Text unter ARBEIT (zwischen <<<ARBEIT und ARBEIT>>>) IST die Abgabe – auch wenn er kurz, fehlerhaft oder in der falschen Sprache ist, wird er bewertet. Nie behaupten, es liege keine Abgabe oder kein eigener Antworttext vor, solange dort Text steht. Stehen darin noch Teile der Aufgabenstellung, zählen nur die eigenen Formulierungen.'
  ]
  if (!r.meta.subjectId || !fremdsprachlich(r.meta.subjectId)) return regeln
  const fach = r.meta.subjectLabel
  regeln.push(
    `- ZIELSPRACHE ${fach}: Ist die Abgabe – oder ein Schreib- bzw. Sprachmittlungsteil, der in der Zielsprache verlangt ist – auf Deutsch verfasst, ist diese Aufgabe NICHT erfüllt. Das klar und freundlich sagen (erster nächster Schritt: den Text auf ${fach} schreiben), Stärken nur nennen, wo wirklich welche sind, und den Erfüllungsgrad dieses Teils (Inhalt und Sprache) bzw. der Gesamtleistung mit 0 % angeben. Ausnahme: Sprachmittlung ins Deutsche und Aufgaben, die ausdrücklich Deutsch verlangen – dort ist Deutsch richtig.`
  )
  // Antwortsprache ohne Teile (erkannt oder gewählt) ausdrücklich nennen
  const sprache = r.grundlage.teile?.length ? undefined : antwortSpracheVon(r)
  if (sprache)
    regeln.push(
      `- ANTWORTSPRACHE laut Aufgabe: ${sprache === 'deutsch' ? 'Deutsch (Deutsch ist hier richtig)' : `${fach} (eine deutsche Antwort erfüllt die Aufgabe nicht)`}.`
    )
  const p = pruefeZielsprache(a.text, r.meta.subjectId)
  if (p.verfehlt || p.teilweise)
    regeln.push(
      `- BEFUND DER APP: ${p.verfehlt ? `Die Abgabe ist überwiegend auf Deutsch verfasst (etwa ${Math.round(p.befund.anteilDeutsch * 100)} % der Sätze).` : 'Ein längerer Abschnitt der Abgabe ist auf Deutsch verfasst.'} Das im Feedback ausdrücklich ansprechen.`
    )
  return regeln
}

/**
 * Deutsch statt Zielsprache (Entscheidung der Lehrkraft 29.09.2026: „Ganze Aufgabe nicht
 * erfüllt"): Erkennt der Detektor eine überwiegend deutsche Abgabe in einer modernen Fremdsprache,
 * setzt die App die Einstufung auf 0 % – Teile, Tabelle, Kriterien, Gesamt – und markiert den
 * Bogen. Verlangt die Aufgabe selbst Deutsch (Sprachmittlung ins Deutsche), nur ein Hinweis.
 */
function spracheAnwenden(bogen: Bogen, r: Rueckmeldung, a: Abgabe, art: ReturnType<typeof einstufungVon>, skala: SkalenKontext): void {
  const p = pruefeZielsprache(a.text, r.meta.subjectId)
  const erlaubt = deutschMoeglich(r.grundlage, antwortSpracheVon(r))
  const hinweis = zielsprachHinweis(p, r.meta.subjectLabel, erlaubt, art !== 'keine')
  if (!hinweis) return
  bogen.hinweise = [...(bogen.hinweise ?? []), hinweis]
  if (!p.verfehlt || erlaubt) return
  bogen.spracheVerfehlt = true
  if (art === 'keine') return
  const grund = `Abgabe auf Deutsch statt auf ${r.meta.subjectLabel} – Aufgabe nicht erfüllt (von der App auf 0 % gesetzt).`
  if (bogen.teile && r.grundlage.teile) {
    bogen.teile = r.grundlage.teile.map((t): TeilWertung =>
      getrennt(t) ? { teilId: t.id, inhalt: 0, sprache: 0, begruendung: grund } : { teilId: t.id, anteil: 0, begruendung: grund }
    )
  }
  if (bogen.tabelle && r.tabelle) {
    const schlechteste = Math.max(0, r.tabelle.stufen.length - 1)
    bogen.tabelle = r.tabelle.kriterien.map((k) =>
      k.punkte ? { kriteriumId: k.id, punkte: 0, begruendung: grund } : { kriteriumId: k.id, stufe: schlechteste, begruendung: grund }
    )
  }
  if (bogen.kriterienStufen) bogen.kriterienStufen = bogen.kriterienStufen.map(() => vorschlag(art, 0, skala))
  if (gesamtEinstufen(r.meta)) bogen.gesamt = vorschlag(art, 0, skala, grund)
}

/** Werte, die ohne Angabe nicht im Bogen stehen sollen (undefined-Felder entfernen) */
function ohneLeere<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

/**
 * Die Antwort der KI → Bogen. Ohne Dokument (ältere Aufrufe, Tests) wie bisher: nur Stärken,
 * Schritte, Kriterien, Schluss, ohne Note. Mit Dokument und Abgabe: Einstufung als Vorschlag,
 * Tabelle, Rand, Überarbeitung, Fehler, Elternfassung.
 */
export function bogenAus(daten: unknown, r?: Rueckmeldung, a?: Abgabe, ctx: BogenKontext = OHNE_KONTEXT): Bogen {
  const d = (daten ?? {}) as Record<string, unknown>
  const liste = (x: unknown): string[] => (Array.isArray(x) ? x.map((s) => String(s ?? '').trim()).filter(Boolean) : [])
  const objekte = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.map((k) => (k ?? {}) as Record<string, unknown>) : [])
  const text = (x: unknown): string => String(x ?? '').trim()
  const m = r?.meta
  const art = m ? einstufungVon(m) : 'keine'
  const skala: SkalenKontext | null = r ? { meta: r.meta, schwellen: ctx.schwellen } : null

  const rohKriterien = objekte(d.kriterien).filter((k) => text(k.kriterium))
  const kriterien: BogenKriterium[] = rohKriterien.map((k) => ({
    kriterium: text(k.kriterium),
    einschaetzung: (EINSCHAETZUNGEN.includes(k.einschaetzung as Einschaetzung) ? k.einschaetzung : 'teilweise') as Einschaetzung,
    ...(text(k.beleg) ? { beleg: text(k.beleg) } : {})
  }))
  const bogen: Bogen = {
    staerken: liste(d.staerken),
    schritte: liste(d.schritte).slice(0, a ? maxSchritte(a.ausgleich) : 3),
    kriterien,
    schluss: text(d.schluss) || undefined
  }
  if (r && a && m && skala) {
    // Leitplanke Sprachmaßstab (29.09.2026): Umfang, Komplexität, Oberstufen-Deckel – sprachmassstab.ts
    const umfang = umfangBefund(r, a)
    const kappungen: string[] = []
    if (kriterienEinstufen(m))
      bogen.kriterienStufen = rohKriterien.map((k) => (Number.isFinite(Number(k.anteil)) ? vorschlag(art, Number(k.anteil), skala) : null))
    if (mitTabelle(r)) {
      const t = r.tabelle!
      bogen.tabelle = t.kriterien.map((k) => {
        const w = objekte(d.tabelle).find((x) => text(x.id).replace(/[[\]]/g, '') === k.id)
        const n = t.stufen.length
        return ohneLeere({
          kriteriumId: k.id,
          ...(k.punkte ? { punkte: w ? Math.max(0, Math.min(k.punkte, Math.round(Number(w.punkte) || 0))) : undefined } : {}),
          ...(!k.punkte ? { stufe: w ? Math.max(0, Math.min(n - 1, Math.round(Number(w.stufe) || 0))) : undefined } : {}),
          begruendung: w ? text(w.begruendung) || undefined : undefined
        })
      })
      const gedeckelt = tabelleDeckeln(t, bogen.tabelle, umfang)
      bogen.tabelle = gedeckelt.wertung
      kappungen.push(...gedeckelt.notizen)
      if (gesamtEinstufen(m)) {
        const s = tabellenSumme(t, bogen.tabelle, m)
        bogen.gesamt = vorschlag(art, s.anteil, skala, begruendungMitDeckel(gedeckelt.notizen.join(' '), s.gedeckelt?.grund))
      }
    }
    if (mitTeilen(r)) {
      const teile = r.grundlage.teile!
      const oberstufe = oberstufeVon(m)
      const gedeckelt = teileDeckeln(teile, wertungenAusKi(d.teile, teile), umfang)
      bogen.teile = gedeckelt.wertungen
      kappungen.push(...gedeckelt.notizen)
      const g = gesamtAusTeilen(teile, bogen.teile, r.grundlage.verrechnung ?? 'prozent', oberstufe)
      if (gesamtEinstufen(m) && !mitTabelle(r) && g)
        bogen.gesamt = vorschlag(
          art,
          g.anteil,
          skala,
          begruendungMitDeckel([begruendungAusTeilen(teile, bogen.teile), ...gedeckelt.notizen].join(' · '), teileDeckelSatz(teile, bogen.teile, oberstufe))
        )
    } else if (mitTabelle(r)) {
      // Gesamt aus der Tabelle (oben)
    } else if (gesamtEinstufen(m)) {
      const g = (d.gesamt ?? {}) as Record<string, unknown>
      bogen.gesamt = vorschlag(art, Number(g.anteil), skala, text(g.begruendung) || undefined)
    }
    if (m.digitalesBlatt)
      bogen.aufgaben = objekte(d.aufgaben)
        .map((x) => ({ nr: Math.round(Number(x.nr)) || 0, gelungen: text(x.gelungen), fehlt: text(x.fehlt), schritt: text(x.schritt) }))
        .filter((x) => x.nr > 0 && (x.gelungen || x.fehlt || x.schritt))
        .slice(0, 40)
    if (hatForm(m, 'rand') || scanKommentare(r, a)) {
      const erlaubt = new Set(ctx.zeichen.map((z) => z.zeichen))
      const scan = scanKommentare(r, a)
      const seiten = (a.scans?.length ? a.scans : a.bilder).length
      bogen.rand = objekte(d.rand)
        .filter((k) => text(k.zitat) && text(k.text))
        .map((k) => {
          const zeichen = erlaubt.has(text(k.zeichen)) ? text(k.zeichen) : ''
          const kommentarArt = (['lob', 'fehler', 'hinweis'].includes(text(k.art)) ? text(k.art) : 'hinweis') as RandKommentar['art']
          return ohneLeere({
            id: newId(),
            zitat: text(k.zitat),
            text: text(k.text),
            art: kommentarArt,
            zeichen: zeichen || undefined,
            ...(scan
              ? {
                  seite: Math.max(0, Math.min(Math.max(0, seiten - 1), Math.round(Number(k.seite) || 0))),
                  x: klemme(Number(k.x)),
                  y: klemme(Number(k.y))
                }
              : {}),
            // Notenschutz Rechtschreibung: R-Kommentare sind nur Hinweise ohne Wertung
            ohneWertung: zeichen === 'R' && ohneRechtschreibung(a.ausgleich) ? true : undefined
          })
        })
    }
    if (hatForm(m, 'ueberarbeitung')) {
      const u = (d.ueberarbeitung ?? {}) as Record<string, unknown>
      // Operatoren in korrekter Satzstellung („Fassen Sie … zusammen", nie „Zusammenfassen Sie") – 01.10.2026
      if (text(u.auftrag)) bogen.ueberarbeitung = { zitat: text(u.zitat), auftrag: korrigiereOperatorformen(text(u.auftrag)).text }
    }
    if (m.elternfassung && text(d.eltern)) bogen.eltern = text(d.eltern)
    // Die Kappung steht auch bei den Hinweisen für die Lehrkraft (einmal, auch wenn Tabelle und Teile gedeckelt wurden)
    if (kappungen.length) bogen.hinweise = [...(bogen.hinweise ?? []), ...new Set(kappungen)]
    spracheAnwenden(bogen, r, a, art, skala)
  }
  const fehler = objekte(d.fehler)
    .filter((f) => text(f.kategorie))
    .slice(0, 4)
    .map((f) => ohneLeere({ kategorie: text(f.kategorie), beispiel: text(f.beispiel) || undefined }))
  if (fehler.length) bogen.fehler = fehler
  const geprueft = ohneLeere(pruefeBogen(bogen, { punkteErlaubt: Boolean(r && art !== 'keine' && mitTabelle(r)) }))
  const leer =
    !geprueft.staerken.length &&
    !geprueft.schritte.length &&
    !geprueft.kriterien.length &&
    !geprueft.rand?.length &&
    !geprueft.tabelle?.length &&
    !geprueft.ueberarbeitung
  if (leer) throw new Error('Die KI hat keine Rückmeldung geliefert.')
  return geprueft
}

/** Beschreibung einer einzelnen Aufgabe (für „Rückmeldung zu dieser Aufgabe" aus anderen Programmen) */
export { describeBlock }
