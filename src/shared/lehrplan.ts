/**
 * Lehrplan-Themen aus `resources/lehrplaene/<LAND>.json` (Paket 12/14).
 *
 * Die Recherche (Paket 14) legt je Land eine Datei mit amtlich belegten Themen an, in Ebenen:
 * Oberthema (Themenfeld, Inhaltsfeld, Lernbereich) › Unterthemen › ggf. eine weitere Ebene. Das
 * Format steht in der Recherche-Vorgabe (Stand 26.09.2026) und wird hier nur GELESEN: Die
 * Themenbereiche (renderer/shared/themenKatalog.ts) bauen daraus ihre Hierarchie. Fehlt die
 * Datei für ein Land – oder ist sie beschädigt –, gilt der Rückfall auf die Daten, die die App
 * schon mitbringt (Lernzielkontrolle, Klassenarbeit Geschichte, Lehrwerke, Grammatik).
 *
 * Ohne Electron und ohne React: Der Hauptprozess liest die Datei (main/index.ts,
 * `lehrplan:themen`), die Oberfläche wandelt sie um, die Tests prüfen beides direkt.
 */

export interface LehrplanUnterthema {
  thema: string
  herkunft?: 'wortlaut' | 'zusammengefasst' | string
  /** „z. B."-Angabe des Lehrplans – ein Beispiel, kein verbindliches Thema */
  beispiel?: boolean
  unterthemen?: LehrplanUnterthema[]
}

export interface LehrplanEintrag {
  fach: string
  /** Bei fach = "anderes" der Name des Fachs */
  fachname?: string
  /** z. B. "ethik" bei fach = "religion" */
  variante?: string
  schulformen?: string[]
  jahrgaenge?: number[]
  verbindlichkeit?: string
  quelle?: string
  seite?: string
  thema: string
  herkunft?: string
  unterthemen?: LehrplanUnterthema[]
  stichwoerter?: string[]
}

export interface LehrplanDatei {
  stateId: string
  stand?: string
  quellen?: { id: string; titel: string; url?: string }[]
  eintraege: LehrplanEintrag[]
}

const text = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

function unterthemen(roh: unknown, tiefe: number): LehrplanUnterthema[] {
  if (!Array.isArray(roh) || tiefe > 4) return []
  return roh
    .map((u): LehrplanUnterthema | null => {
      const r = (u ?? {}) as Record<string, unknown>
      const thema = text(r.thema)
      if (!thema) return null
      const kinder = unterthemen(r.unterthemen, tiefe + 1)
      return {
        thema,
        ...(text(r.herkunft) ? { herkunft: text(r.herkunft) } : {}),
        ...(r.beispiel === true ? { beispiel: true } : {}),
        ...(kinder.length ? { unterthemen: kinder } : {})
      }
    })
    .filter((u): u is LehrplanUnterthema => u !== null)
}

/**
 * Liest eine Lehrplandatei und verwirft, was nicht passt. Eine halb fertige oder beschädigte
 * Datei soll die Themenbereiche nicht lahmlegen – schlimmstenfalls fehlen einzelne Einträge.
 * Liefert null, wenn gar nichts Brauchbares darin steht.
 */
export function pruefeLehrplan(roh: unknown, stateId: string): LehrplanDatei | null {
  if (!roh || typeof roh !== 'object') return null
  const r = roh as Record<string, unknown>
  if (!Array.isArray(r.eintraege)) return null
  const eintraege: LehrplanEintrag[] = []
  for (const e of r.eintraege) {
    const x = (e ?? {}) as Record<string, unknown>
    const fach = text(x.fach)
    const thema = text(x.thema)
    if (!fach || !thema) continue
    const jahrgaenge = Array.isArray(x.jahrgaenge) ? x.jahrgaenge.filter((j): j is number => Number.isInteger(j)) : undefined
    const schulformen = Array.isArray(x.schulformen) ? x.schulformen.filter((s): s is string => typeof s === 'string') : undefined
    const stichwoerter = Array.isArray(x.stichwoerter) ? x.stichwoerter.filter((s): s is string => typeof s === 'string') : undefined
    const kinder = unterthemen(x.unterthemen, 1)
    eintraege.push({
      fach,
      thema,
      ...(text(x.fachname) ? { fachname: text(x.fachname) } : {}),
      ...(text(x.variante) ? { variante: text(x.variante) } : {}),
      ...(schulformen?.length ? { schulformen } : {}),
      ...(jahrgaenge?.length ? { jahrgaenge } : {}),
      ...(text(x.verbindlichkeit) ? { verbindlichkeit: text(x.verbindlichkeit) } : {}),
      ...(text(x.quelle) ? { quelle: text(x.quelle) } : {}),
      ...(kinder.length ? { unterthemen: kinder } : {}),
      ...(stichwoerter?.length ? { stichwoerter } : {})
    })
  }
  if (!eintraege.length) return null
  return { stateId: text(r.stateId) || stateId, ...(text(r.stand) ? { stand: text(r.stand) } : {}), eintraege }
}

/** Nur Länderkürzel – der Name wird zum Dateinamen */
export const gueltigesLand = (stateId: string): boolean => /^[A-Z]{2}$/.test(stateId)

/**
 * Schulform der App → Schulform der Lehrplandateien (Recherche-Format: grundschule, hauptschule,
 * realschule, integriert, gymnasium, foerderLernen). Bis Paket 13 wurde die App-Kennung direkt
 * verglichen – an einer Oberschule („oberschule") passte dadurch KEIN Eintrag der Datei
 * („integriert"), und die Automatik fiel still auf die alten flachen Themen zurück.
 */
export function lehrplanSchulform(appSchulform: string | undefined): string | undefined {
  if (!appSchulform) return undefined
  if (['grundschule', 'hauptschule', 'realschule', 'gymnasium'].includes(appSchulform)) return appSchulform
  if (appSchulform === 'mittelschule' || appSchulform === 'werkrealschule') return 'hauptschule'
  if (appSchulform === 'foerderschule' || appSchulform === 'foerderLernen') return 'foerderLernen'
  // Oberschule, Gesamt-, Gemeinschafts-, Regional-, Sekundar-, Stadtteil-, Regelschule, Realschule plus
  return 'integriert'
}

// ---------- Bereichsnamen aus Lehrplantexten (Paket 13) ----------

/*
 * Gemeldet von der Lehrkraft (26.09.2026): Die Automatik legte Themenbereiche mit ganzen
 * Kompetenzsätzen als Namen an („lineare Funktionen … analysieren …"). Die Kerncurricula führen
 * unter einem Thema oft keine Unterthemen, sondern Kompetenzen („Winkel schätzen, messen und
 * zeichnen") oder Leitsätze („Enzyme steuern Lebensvorgänge in Zellen"); dazu lange amtliche
 * Titel mit Klammerzusatz („… bis in die Gegenwart (Längsschnitt)"). Als Ordnername taugt das
 * nicht. `bereichsName` leitet deshalb eine Kurzform ab oder sagt „kein Bereichsname" (null);
 * der Wortlaut bleibt am Bereich als Tooltip erhalten.
 */

/** Wörter, die klein stehen und auf -en enden, aber keine Verben sind – am Satzende kein Kompetenzsignal */
const KEINE_VERBEN = new Set(['oben', 'unten', 'innen', 'außen', 'anderen', 'eigenen', 'modellen', 'beispielen', 'medien', 'daten'])

/*
 * Gebeugte Verben, an denen man einen Leitsatz erkennt („Enzyme STEUERN …"). Keine vollständige
 * Liste – gesammelt aus den Leitsätzen der Kerncurricula NI (Stand 26.09.2026); ein unbekanntes
 * Verb lässt einen Satz im Zweifel durch, der dann meist an der Länge scheitert.
 */
const SATZVERBEN =
  /\s(ist|sind|war|waren|wird|werden|wurde|wurden|hat|haben|kann|können|lässt|lassen|führt|führen|ermöglicht|ermöglichen|steuert|steuern|stellt|stellen|bildet|bilden|grenzen|grenzt|kommunizieren|kommuniziert|zeigen|zeigt|bewirken|bewirkt|beeinflusst|beeinflussen|regulieren|reguliert|verändert|verändern|übertragen|überträgt|lösen|löst|dienen|dient|ändert|ändern|braucht|brauchen|erschließen|erschließt|entsteht|entstehen|prägt|prägen|bestimmt|bestimmen|beruht|beruhen|gibt|geben|liegt|liegen|besteht|bestehen|wirkt|wirken)\s/

/** Operatoren der Kompetenzlisten, substantiviert am Zeilenanfang */
const OPERATOR_NOMEN =
  /^(Lösen|Berechnen|Bestimmen|Zeichnen|Konstruieren|Untersuchen|Beschreiben|Darstellen|Anwenden|Nutzen|Ermitteln|Erstellen|Vergleichen|Deuten|Interpretieren|Begründen|Skizzieren|Messen|Schätzen|Erläutern|Analysieren|Beurteilen|Bewerten)$/

/** Wörter ohne Gewicht für die Frage „stehen hier Nomen?" */
const FUELLWOERTER = new Set(
  'der die das des dem den ein eine einer eines einem einen und oder sowie im in am an auf aus bei mit nach von vom zu zum zur für über unter um als bis durch gegen ohne seit'.split(
    ' '
  )
)

const woerterVon = (t: string): string[] => t.split(/\s+/).filter(Boolean)
const nackt = (w: string): string => w.replace(/^[„“"'([]+|[“”"',.;:!?)\]]+$/g, '')
const klein = (w: string): boolean => /^\p{Ll}/u.test(w)
const istVerbform = (w: string): boolean => klein(w) && /(en|ern|eln)$/.test(w) && !KEINE_VERBEN.has(w)
/** Abgetrennte Verbteile am Satzende („stellen ihre Nährstoffe selbst HER", „stellt Energie BEREIT") */
const VERBTEIL = /^(her|hin|bereit|ab|an|aus|auf|ein|fest|vor|zu|zusammen|dar|fort|weiter)$/

/** Endet der Text auf ein Verb? („… anwenden", „Winkel schätzen, messen und zeichnen") */
function verbAmEnde(t: string): boolean {
  const w = woerterVon(t)
  const letztes = nackt(w[w.length - 1] ?? '')
  return VERBTEIL.test(letztes) || istVerbform(letztes)
}

/** Anteil der großgeschriebenen Wörter (Nomen) unter den Inhaltswörtern – Maß für „klingt nach Thema" */
function nomenAnteil(t: string): number {
  const inhalt = woerterVon(t)
    .map(nackt)
    .filter((w) => w && !FUELLWOERTER.has(w.toLocaleLowerCase('de')))
  if (!inhalt.length) return 0
  return inhalt.filter((w) => /^\p{Lu}/u.test(w) || /\d/.test(w)).length / inhalt.length
}

const gross = (t: string): string => t.charAt(0).toLocaleUpperCase('de') + t.slice(1)

/** Nummerierte Überschriften-Vorsätze der Lehrpläne – sie tragen kein Thema */
const VORSATZ =
  'Inhaltsbereich|Inhaltsfeld|Themenfeld|Themenbereich|Lernbereich|Lernfeld|Rahmenthema|Wahlmodul|Pflichtmodul|Modul|Kurshalbjahr|Arbeitsfeld|Kompetenzbereich|Leitthema|Unterrichtseinheit|Schwerpunkt'

/*
 * Wo sich ein zu langer Titel sinnvoll kürzen lässt: vor der Einordnung („Die Welt des
 * Spätmittelalters | zwischen Krise und Aufbruch in die Neuzeit", „Entwicklung der Medien |
 * seit dem Zeitalter der Hochkulturen …"). Der vordere Teil trägt in den Kerncurricula das Thema.
 */
const PRAEPOSITION = /^(nach|im|in|mit|von|vom|unter|für|als|anhand|aus|durch|gegen|ohne|um|über|seit|bis|zwischen|am|an|auf|bei|zur|zum)$/

const KUERZEN_VOR = [' zwischen ', ' seit ', ' bis ', ' am Beispiel ', ' unter Berücksichtigung ', ' im Spannungsfeld ', ' in Geschichte und Gegenwart']

/** Ab hier ist ein Titel kein Ordnername mehr, sondern ein Satz (Vorgabe der Lehrkraft: „~8 Wörter") */
export const MAX_WOERTER = 8

/**
 * Kompetenz- oder Leitsatz statt Thema? Verb am Ende („… analysieren"), gebeugtes Verb mitten
 * im Satz („Enzyme steuern …"), Semikolon. Kurze Einheitstitel mit Verb („Leben braucht
 * Energie", „Auch Pflanzen sind Lebewesen") sind in den Kerncurricula echte Überschriften und
 * bleiben – deshalb zählt das gebeugte Verb erst ab sechs Wörtern.
 */
export function istKompetenzsatz(t: string): boolean {
  const text = t.trim()
  if (text.includes(';')) return true
  if (verbAmEnde(text) && !kurzerTitel(text)) return true
  const w = woerterVon(text).map(nackt)
  // Operator vorn in der Form der Kompetenzlisten („beschreiben die Daten …", „führen … durch")
  if (w.length > 1 && istVerbform(w[0])) return true
  // Verb vor einem Komma mitten im Satz („Tabellen zur Berechnung nutzen, dabei auch …")
  if (woerterVon(text).some((x, i) => i > 0 && x.endsWith(',') && istVerbform(nackt(x)))) return true
  // Substantivierter Operator vorn („Lösen linearer Gleichungen mit digitalen Mathematikwerkzeugen")
  if (w.length > 3 && OPERATOR_NOMEN.test(w[0])) return true
  // Umstandswort am Ende langer Zeilen („Lösen einfacher linearer Gleichungen hilfsmittelfrei", „… zeichnerisch")
  const letztes = w[w.length - 1] ?? ''
  if (w.length > 3 && klein(letztes) && !/[?!]$/.test(text) && !/^(heute|früher|gestern|morgen)$/.test(letztes)) return true
  return woerterVon(text).length > 5 && SATZVERBEN.test(` ${text} `)
}

/**
 * Kurze Titel mit großem Anfang und Verb am Ende sind in den Kerncurricula Überschriften von
 * Themenfeldern, keine Kompetenzen: „Nach Gott fragen" (Religion), „Musik gestalten",
 * „Dreiecke konstruieren". Klein anfangende wie „runden und schätzen" bleiben Kompetenzen.
 */
const kurzerTitel = (t: string): boolean => woerterVon(t).length <= 3 && /^\p{Lu}/u.test(t)

/**
 * Kurzform eines Lehrplantitels als Name eines Themenbereichs – oder null, wenn der Text kein
 * brauchbarer Bereichsname ist (Kompetenz- oder Leitsatz, Sammelüberschrift). Dann legt die
 * Automatik keinen eigenen Bereich an; seine Wörter zählen beim Oberthema mit
 * (renderer/shared/themenKatalog.ts). `wortlaut` ist gesetzt, wenn gekürzt wurde.
 *
 * Schritte (jeweils nur, solange etwas Sinnvolles übrig bleibt):
 * 1. Nummern-Vorsätze weg: „Inhaltsbereich QP 1 – Leben und Energie" → „Leben und Energie",
 *    „FW 4 Stoff- und Energieumwandlung" → „Stoff- und Energieumwandlung".
 * 2. Klammerzusätze weg: „(Längsschnitt)", „(ausgewählte Beispiele)", „[25.04.]".
 * 3. Doppelpunkt: Von „Der Erste Weltkrieg: nationale und internationale Perspektiven" bleibt
 *    der Teil, der mehr nach Thema klingt (Anteil Nomen), bei Gleichstand der vordere. Bei
 *    langen Titeln ebenso am Gedankenstrich; kurze wie „Weimarer Republik – Chancen und
 *    Belastungen" bleiben ganz.
 * 4. Verb am Ende: Verb samt Aufzählung abschneiden, wenn davor ein kurzer Nomen-Ausdruck steht
 *    („Winkel schätzen, messen und zeichnen" → „Winkel", „einfache lineare Gleichungen lösen" →
 *    „Lineare Gleichungen"); sonst null („mit Brüchen rechnen", „vorab Hypothesen aufstellen").
 * 5. Leitsätze und alles, was danach noch länger als `MAX_WOERTER` ist: null.
 */
export function bereichsName(thema: string): { name: string; wortlaut?: string } | null {
  const original = thema.replace(/\s+/g, ' ').trim()
  if (!original) return null
  // 1. Vorsätze
  let t = original
    // „Inhaltsbereich QP 1 – …", „Rahmenthema 2: …", „Arbeitsfeld: …"
    .replace(new RegExp(String.raw`^(${VORSATZ})(\s+([A-Z]{1,3}\s*)?\d+(\.\d+)?)?\s*[–:-]\s*`, 'u'), '')
    .replace(new RegExp(String.raw`^(${VORSATZ})\s+([A-Z]{1,3}\s*)?\d+(\.\d+)?\s+`, 'u'), '')
    // „Wahlmodul Akustik"
    .replace(/^(Wahlmodul|Pflichtmodul|Modul)\s+(?=\p{Lu})/u, '')
    // „FW 4 Stoff- und Energieumwandlung"
    .replace(/^(FW|IF|TF|LB)\s*\d+[.:]?\s*[–:-]?\s*/u, '')
    .trim()
  // 2. Klammerzusätze (auch mehrere)
  const ohneKlammer = t
    .replace(/\s*\([^()]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .trim()
  if (ohneKlammer.length >= 3) t = ohneKlammer
  // Schlusspunkt und Fußnotensternchen („Sünde – Rechtfertigung – Vergebung*")
  t = t.replace(/[.*]+$/, '').trim()
  // 3. Doppelpunkt, bei langen Titeln auch Gedankenstrich
  const teilen = (zeichen: RegExp): void => {
    const m = zeichen.exec(t)
    if (!m) return
    const vorn = t.slice(0, m.index).trim()
    const hinten = t.slice(m.index + m[0].length).trim()
    if (!vorn || !hinten) return
    // Klein beginnende Nachsätze („… – bis heute?", „… – eine Zeitenwende?") tragen kein Thema
    const taugt = (x: string): boolean => !istKompetenzsatz(x) && woerterVon(x).length <= MAX_WOERTER && !/^\p{Ll}/u.test(x)
    /*
     * Welcher Teil klingt nach Thema? Rhetorische Fragen („… – eine Erfolgsgeschichte?") und
     * klein beginnende Nachsätze („… – das Beispiel Sizilien") nie vor einem Aussage-Teil; sonst
     * der mit mehr Nomen („Ein eingespieltes Team: Atmungsorgane und Blutkreislaufsystem"), bei
     * Gleichstand der vordere.
     */
    const wert = (x: string): number => (/[?!]$/.test(x) ? 0 : 2) + (/^\p{Lu}|^\d|^„/u.test(x) ? 1 : 0) + nomenAnteil(x) / 2
    const teile = [vorn, hinten].filter(taugt)
    if (teile.length) t = teile.reduce((a, b) => (wert(b) > wert(a) ? b : a))
  }
  teilen(/:\s/)
  if (woerterVon(t).length > 5) teilen(/\s[–—]\s/)
  // Zu lang: vor der Einordnung kürzen, sonst an der letzten Präposition, die höchstens `MAX_WOERTER` übrig lässt
  if (woerterVon(t).length > MAX_WOERTER && !istKompetenzsatz(t)) {
    const brauchbarerAnfang = (vorn: string): boolean => {
      const n = woerterVon(vorn).length
      return n >= 2 && n <= MAX_WOERTER && nomenAnteil(vorn) >= 0.5 && /\p{Lu}/u.test(woerterVon(vorn)[n - 1] ?? '') && !istKompetenzsatz(vorn)
    }
    // Vor einer Einordnung mindestens drei Wörter – „Der Mensch | zwischen Angst und Geborgenheit …" wäre zu wenig
    let gekuerzt = KUERZEN_VOR.map((marke) => (t.indexOf(marke) > 0 ? t.slice(0, t.indexOf(marke)).trim() : '')).find(
      (vorn) => woerterVon(vorn).length >= 3 && brauchbarerAnfang(vorn)
    )
    if (!gekuerzt) {
      const w = woerterVon(t)
      for (let i = Math.min(w.length - 1, MAX_WOERTER + 1); i >= 2 && !gekuerzt; i--) {
        if (!PRAEPOSITION.test(w[i])) continue
        const vorn = w
          .slice(0, i)
          .join(' ')
          .replace(/(\s+(und|oder|sowie))+$/, '')
          .replace(/,$/, '')
        if (brauchbarerAnfang(vorn)) gekuerzt = vorn
      }
    }
    if (gekuerzt) t = gekuerzt
  }
  // 4. Verb am Ende abschneiden
  if (verbAmEnde(t) && !kurzerTitel(t)) {
    const w = woerterVon(t)
    let i = w.length - 1
    // Rückwärts über die Verben und ihre Aufzählung („schätzen, messen und zeichnen")
    while (i >= 0) {
      const x = nackt(w[i])
      if (!(istVerbform(x) || VERBTEIL.test(x) || /^(und|oder|sowie)$/.test(x))) break
      i--
    }
    let rest = w
      .slice(0, i + 1)
      .join(' ')
      .replace(/[,;]$/, '')
      .replace(/^einfache[rn]?\s+/i, '')
    const erstes = nackt(woerterVon(rest)[0] ?? '').toLocaleLowerCase('de')
    const brauchbar =
      rest.length > 2 &&
      woerterVon(rest).length <= 4 &&
      nomenAnteil(rest) >= 0.5 &&
      // „mit Brüchen", „vorab Hypothesen", „die Durchführung" sind keine Themen
      !FUELLWOERTER.has(erstes) &&
      !/^(vorab|ggf|etwa|selbst|eigene|eigenen|zwei|verschiedene|weitere|diese|dieser|ihre|seine)$/.test(erstes)
    if (!brauchbar) return null
    rest = gross(rest)
    t = rest
  }
  // 5. Leitsätze, Überlängen, Sammelüberschriften
  if (istKompetenzsatz(t) || woerterVon(t).length > MAX_WOERTER) return null
  if (/^(fakultative erweiterungen|erweiterungen|vertiefungen?|ergänzungen|sonstiges|allgemeines|themenfelder|inhalte|themen)$/i.test(t)) return null
  // Bruchstücke und reine Beiwörter („Kultur-", „national") sind keine Bereiche
  if (/-$/.test(t) || (woerterVon(t).length === 1 && klein(t))) return null
  // Klein beginnend: Artikel/Präposition vorn („die Wahrscheinlichkeit des …") nicht, Beiwort vorn („lineare Gleichungen") groß schreiben
  if (klein(t)) {
    if (FUELLWOERTER.has(nackt(woerterVon(t)[0]).toLocaleLowerCase('de')) || nomenAnteil(t) < 0.5) return null
    t = gross(t)
  }
  return t === original ? { name: t } : { name: t, wortlaut: original }
}
