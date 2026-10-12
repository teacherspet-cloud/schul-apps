/**
 * Geschichte: „zusammenfassen" und „beurteilen" nach den Vorlagen der Lehrkraft (12.10.2026).
 *
 * EINE Quelle für Erzeugung (Arbeitsblatt, Lernkontrolle, Klassenarbeit: Aufgabenstellung, Hilfen,
 * Lösungsteil/Erwartungshorizont) und Rückmeldung (Rückmeldungs-Modul, Feedback je Aufgabe auf freigegebenen
 * Blättern, Prüfung beim Einreichen, Onlinetest). Vorher galten für beide Operatoren nur die allgemeinen Regeln
 * („Inhalt vor Form") – die Lehrkraft hat zwei Vorlagen zur verbindlichen Grundlage erklärt:
 *
 *  - Vorlage 1, Merkblatt „Zusammenfassungen in Geschichte" (AFB I): Zweck, Verbenliste statt „Der Verfasser
 *    sagt …", ATTIKA-Einleitung, Regeln (keine Meinung, nicht zitieren, keine Zeilenangaben, Konjunktiv, eigene
 *    Worte, Präsens, abwechslungsreich, bündeln, ca. ⅓ des Originals), Vorbereitung und Arbeitsschritte.
 *  - Vorlage 2, „Beurteilen" (AFB III, Recap Abi BW Geschichte): Sachurteil ohne Ich-Form, Aufbau Einleitung mit
 *    Vorweg-Urteil – Kriterien – Hauptteil (Argument–Erklärung–Beispiel, Belege mit Z.-Angaben) – Fazit, das zur
 *    Einleitung passt; Zitierregeln; Beispiel Revolution 1905 mit Wendes Revolutionsbegriff.
 *
 * Entscheidungen der Lehrkraft (12.10.2026), hier umgesetzt:
 *  - Zusammenfassen: Zitat oder Zeilenangabe = FEHLER (Verstoß gegen den Operator); Intention gehört in die
 *    ATTIKA-Einleitung; ⅓-Länge wird gezählt (ohne Einleitung, Toleranz 20–45 % des Originals, im Feedback mit
 *    Zahlen); Redeeinleitung + Indikativ („Der Autor betont, dass … ist") ist ERLAUBT, im Feedback aber mit
 *    konkreter Konjunktiv-Alternative ohne Redeeinleitung („Der Krieg sei unvermeidlich gewesen.").
 *  - Beurteilen: zwingend geprüft werden Vorweg-Urteil in der Einleitung, eigener Kriterienteil vor dem Hauptteil,
 *    Ich-Form (= Fehler, Sachurteil), Beleg je Argument (Material mit „(vgl. Z. …)" oder Fachwissen), Fazit passt
 *    zur Einleitung (eigener Prüfpunkt). „bewerten" (Werturteil mit offengelegten Wertmaßstäben, Ich-Form zulässig)
 *    ist etwas anderes und wird hier NICHT erfasst.
 *  - Geltung: Sek II in allen Ländern (AFB und Punkte nach der Landesdefinition, wo sie abweicht; Arbeitsschritte
 *    und Kriterien bleiben). Sek I: Stufenplan 5/6 – 7/8 – 9/10, Hilfen nehmen ab, Rückmeldung nach der Stufe.
 *
 * Belegt = Wortlaut bzw. Entscheidung der Lehrkraft. Faustregeln der App sind als solche gekennzeichnet
 * (Gewichtungen, Erkennungsmuster der Vorprüfungen, Ich-Form in Kl. 9/10 als Fehler).
 */
import { abschrift } from '../abschrift'
import { findeOperatoren } from './erkennung'
import { operatorenAuswahl } from './zugriff'

export type Schreibform = 'zusammenfassen' | 'beurteilen'
/** Stufenplan der Lehrkraft: Kl. 5/6, 7/8, 9/10, Oberstufe */
export type GeschichtsStufe = 'kl56' | 'kl78' | 'kl910' | 'sek2'

export const STUFEN_NAME: Record<GeschichtsStufe, string> = { kl56: 'Kl. 5/6', kl78: 'Kl. 7/8', kl910: 'Kl. 9/10', sek2: 'Sek II' }

/** Fach Geschichte – Kennung („geschichte") oder Anzeigename („Geschichte", auch bilingual „Geschichte (bilingual)") */
export const istGeschichte = (fach: string | undefined): boolean => /^geschichte\b/i.test((fach ?? '').trim())

/**
 * Stufe aus dem Jahrgang. `sek2` übergibt der Aufrufer, wo er die Oberstufe genauer kennt (G8-Jahrgang 10,
 * bildungsgang.ts `gehoertZurSekII`); sonst gilt ab Jahrgang 11 die Oberstufe. Ohne Jahrgang: Kl. 9/10
 * (Faustregel – die strengste Sek-I-Stufe, ohne die volle Sek-II-Strenge).
 */
export function geschichtsStufe(jahrgang?: number, sek2?: boolean): GeschichtsStufe {
  if (sek2) return 'sek2'
  if (!jahrgang || !Number.isFinite(jahrgang)) return 'kl910'
  if (jahrgang >= 11) return 'sek2'
  if (jahrgang >= 9) return 'kl910'
  if (jahrgang >= 7) return 'kl78'
  return 'kl56'
}

/* ---------- Erkennung über die gemeinsame Operatorerkennung ---------- */

const ERKENNUNG = [
  { operator: 'zusammenfassen', formen: ['Zusammenfassung'] },
  { operator: 'beurteilen', formen: ['Beurteilung', 'Sachurteil'] }
]

/** Welche der beiden Schreibformen verlangt die Arbeitsanweisung? („Fasse … zusammen", „Beurteilen Sie …") */
export function schreibformenIn(anweisung: string): Schreibform[] {
  const treffer = findeOperatoren(anweisung ?? '', ERKENNUNG)
  return [...new Set(treffer.map((t) => t.operator as Schreibform))]
}

/* ---------- Vorlage 1: Merkblatt „Zusammenfassungen in Geschichte" (AFB I) ---------- */

export const MERKBLATT_ZUSAMMENFASSEN = {
  wozu: 'Eine Zusammenfassung soll dem Leser ermöglichen, über einen Text Bescheid zu wissen, ohne ihn selbst gelesen zu haben.',
  /** Statt „Der Verfasser sagt …" */
  verben: [
    'beschreiben',
    'informieren',
    'deutlich machen',
    'verdeutlichen',
    'betonen',
    'anführen',
    'bemerken',
    'behaupten',
    'erklären',
    'ausführen',
    'erläutern',
    'feststellen',
    'nennen',
    'meinen'
  ],
  attika: ['A – Autor', 'T – Textsorte/Quellenart', 'T – Titel/Thema', 'I – Intention', 'K – Kontext/Entstehungszeit', 'A – Adressaten'],
  einleitungsmuster:
    'Die (Quellenart) „(Titel)" von (Autor), veröffentlicht (Datum) in (Ort), ist eine (Textsorte), die sich an (Adressat) mit der Intention (Intention) richtet. Sie behandelt das Thema (Thema) und fällt in die Zeit (Kontext).',
  regeln: [
    'Anforderungen an den Operator beachten',
    'keine eigene Meinung zum Material',
    'nicht zitieren',
    'keine Zeilenangaben',
    'sprachliche Distanz durch Konjunktiv',
    'eigene Worte',
    '(historisches) Präsens',
    'abwechslungsreich formulieren (keine gleich formulierten Sätze)',
    'Aspekte des Textes bündeln',
    'Länge: der Text (ohne Einleitung) ca. 1/3 des Originals'
  ],
  vorbereitung: [
    'Aufgabenstellung sorgfältig lesen (auch Folgeaufgaben als Hinweise)',
    'Text mindestens 2× lesen: 1. Überblick, 2. markieren in Farben + Randnotizen',
    'W-Fragen klären: Wer? Was? Wann? Wo? Warum? An wen?'
  ],
  arbeitsschritte: ['Vorbereitung', 'Lesen', 'Markieren', 'Planung', 'Entwurf', 'Korrektur']
} as const

/** Toleranz der ⅓-Regel (Entscheidung der Lehrkraft 12.10.2026): 20–45 % des Originals, ohne Einleitung */
export const LAENGE_MIN = 0.2
export const LAENGE_MAX = 0.45

/* ---------- Vorlage 2: „Beurteilen" (AFB III, Recap Abi BW Geschichte) ---------- */

export const MERKBLATT_BEURTEILEN = {
  sachurteil: 'Sachurteil = objektives Urteil über einen historischen Gegenstand/Sachverhalt; keine Formulierungen in der 1. Person („Ich finde, dass …").',
  aufbau: [
    '01 Einleitung: (interessante) Hinführung zur Aufgabe + klares, vorwegnehmendes, aber kurzes Urteil',
    '02 Kriterien: Offenlegung der Kriterien (wann ist der „Tatbestand" erfüllt?), Definition von Kernbegriffen (z. B. was ist eine Revolution?)',
    '03 Hauptteil: Argumentation anhand der Kriterien, Fachwissen und Material; ein Absatz = Argument – Erklärung – Beispiel/Begründung',
    '04 Fazit: zusammenfassende Bündelung der Argumente unter Wiederaufgriff der Einleitung und klare Formulierung des eigenen Sachurteils'
  ],
  fazitRegel: 'Das Fazit muss zur Einleitung passen! (Tipp: nur Einleitung und Fazit lesen.)',
  zitieren: [
    'sinngemäße Bezüge: „(vgl. Z. X–Y)"',
    'Zitat: „es [sei] kein […] Problém (sic!)" (Z. X–Y)',
    '[ ] für veränderte oder eingefügte Wörter bzw. Wortteile',
    '(sic!) für aus dem Original übernommene Fehler',
    '[…] für Auslassungen'
  ],
  beispielAufgabe:
    'Beurteilen Sie, inwieweit es sich bei der Revolution von 1905 um eine Revolution handelt. Beziehen Sie sich dabei auf Revolutionsbegriffe, die im Unterricht behandelt wurden.',
  beispielKriterien:
    'Revolutionsbegriff nach Peter Wende (2000) als Kriterien: politisch – Sturz alter/Einsetzen neuer Eliten, Änderung der Organisationsform bis zur Totalumwälzung, neue Normen/Ideale; Gewalt „von unten" oder Reform „von oben", subjektiver Veränderungswille; Folgen – rascher Wandel/Fortschritt, Rückkehr nicht ausgeschlossen. Wiedergabe des Begriffs im Konjunktiv, Belege mit Z.-Angaben, Fazit „zwar … jedoch … allerdings" (differenziertes Urteil).',
  abgrenzung:
    '„bewerten" ist ein Werturteil mit offengelegten Wertmaßstäben (dort sind Ich-Form und Wertbezug zulässig) – nicht mit „beurteilen" (Sachurteil) vermischen.'
} as const

/* ---------- Stufenplan (Sek I) und Sek II ---------- */

export type Verstoss = 'fehler' | 'hinweis'

export interface Pruefkriterium {
  id: string
  text: string
  /** Gewicht in Prozent innerhalb der Schreibform (Faustregel der App; Land/Lehrkraft können abweichen) */
  gewicht: number
  /** Wie ein Verstoß zählt: „fehler" = Verstoß gegen den Operator, „hinweis" = Verbesserungsvorschlag */
  verstoss: Verstoss
}

const K = (id: string, text: string, gewicht: number, verstoss: Verstoss = 'fehler'): Pruefkriterium => ({ id, text, gewicht, verstoss })

const KRITERIEN: Record<Schreibform, Record<GeschichtsStufe, Pruefkriterium[]>> = {
  zusammenfassen: {
    kl56: [
      K('wfragen', 'W-Fragen beantwortet (Wer? Was? Wann? Wo? Warum?)', 40),
      K('kern', 'Kernaussagen des Textes erfasst', 35),
      K('eigeneWorte', 'in eigenen Worten (nicht abgeschrieben)', 15, 'hinweis'),
      K('kurz', 'kurz – deutlich kürzer als der Text', 10, 'hinweis')
    ],
    kl78: [
      K('einleitung', 'Einleitungssatz mit Autor, Textsorte, Titel, Thema und Zeit', 20),
      K('kern', 'Kernaussagen vollständig und richtig, Wichtiges von Unwichtigem getrennt', 40),
      K('keineZitate', 'keine Zitate und keine Zeilenangaben, eigene Worte', 15),
      K('praesens', 'im Präsens', 10, 'hinweis'),
      K('keineMeinung', 'keine eigene Meinung', 10),
      K('kurz', 'deutlich kürzer als das Original', 5, 'hinweis')
    ],
    kl910: [
      K('attika', 'Einleitung nach ATTIKA: Autor, Textsorte/Quellenart, Titel/Thema, Intention, Kontext/Zeit, Adressaten', 20),
      K('kern', 'Kernaussagen vollständig, richtig und gebündelt (nicht Satz für Satz nacherzählt)', 35),
      K('keineZitate', 'keine Zitate und keine Zeilenangaben, eigene Worte', 15),
      K('distanz', 'sprachliche Distanz: Konjunktiv (oder Redeeinleitung mit Verb aus der Verbenliste), Präsens', 10),
      K('keineMeinung', 'keine eigene Meinung zum Material', 10),
      K('laenge', 'Länge ca. ⅓ des Originals (ohne Einleitung, 20–45 %)', 5, 'hinweis'),
      K('abwechslung', 'abwechslungsreich formuliert, Verben statt „sagt"', 5, 'hinweis')
    ],
    sek2: [
      K('attika', 'Quellenkritische Einleitung nach ATTIKA: Autor, Textsorte/Quellenart, Titel/Thema, Intention, Kontext/Entstehungszeit, Adressaten', 20),
      K('kern', 'Kernaussagen vollständig, sachlich richtig, sinnvoll gebündelt und strukturiert', 35),
      K('keineZitate', 'keine Zitate, keine Zeilenangaben, eigene Worte', 15),
      K('distanz', 'sprachliche Distanz durch Konjunktiv; (historisches) Präsens', 10),
      K('keineMeinung', 'keine eigene Meinung zum Material', 10),
      K('laenge', 'Länge ca. ⅓ des Originals (ohne Einleitung, 20–45 %)', 5),
      K('abwechslung', 'abwechslungsreich formuliert (keine gleich gebauten Sätze), Verben statt „Der Verfasser sagt"', 5, 'hinweis')
    ]
  },
  beurteilen: {
    kl56: [
      K('urteil', 'ein klares Urteil zur Frage', 45),
      K('grund', 'mindestens ein passender Grund („…, weil …")', 45),
      K('sachlich', 'Grund stimmt sachlich', 10, 'hinweis')
    ],
    kl78: [
      K('urteil', 'klares Urteil zur Frage', 20),
      K('kriterium', 'Urteil am vorgegebenen Kriterium ausgerichtet', 25),
      K('aeb', 'Argument – Erklärung – Beispiel/Beleg je Gedanke', 35),
      K('beleg', 'Beispiele aus Material oder Unterricht', 10),
      K('sachlich', 'sachliche Formulierung (Sachurteil statt „Ich finde …")', 10, 'hinweis')
    ],
    kl910: [
      K('vorweg', 'Einleitung mit Hinführung und kurzem Vorweg-Urteil', 15),
      K('kriterien', 'eigener Kriterienteil vor dem Hauptteil: Kriterien selbst entwickelt, Kernbegriff definiert', 20),
      K('aeb', 'Hauptteil: je Absatz Argument – Erklärung – Beispiel/Begründung entlang der Kriterien', 30),
      K('belege', 'Belege aus dem Material mit Zeilenangabe „(vgl. Z. …)" oder aus Fachwissen', 10),
      K('fazit', 'Fazit bündelt die Argumente, greift die Einleitung auf und passt zu ihr', 15),
      K('keinIch', 'Sachurteil ohne Ich-Form', 10)
    ],
    sek2: [
      K('vorweg', 'Einleitung: Hinführung zur Aufgabe + klares, vorwegnehmendes, kurzes Urteil', 10),
      K('kriterien', 'Kriterienteil vor dem Hauptteil: Kriterien offengelegt (wann ist der „Tatbestand" erfüllt?), Kernbegriffe definiert', 20),
      K('aeb', 'Hauptteil: Argumentation anhand der Kriterien, Fachwissen und Material; ein Absatz = Argument – Erklärung – Beispiel/Begründung', 35),
      K('belege', 'jedes Argument belegt: Materialbezüge „(vgl. Z. X–Y)", Zitate korrekt („…" (Z. X–Y), [ ], […], (sic!)), Fachwissen', 10),
      K('fazit', 'Fazit: Bündelung der Argumente, Wiederaufgriff der Einleitung, klares eigenes Sachurteil – passt zur Einleitung', 15),
      K('keinIch', 'Sachurteil: keine Formulierungen in der 1. Person', 10)
    ]
  }
}

export const kriterienFuer = (form: Schreibform, stufe: GeschichtsStufe): Pruefkriterium[] => KRITERIEN[form][stufe]

/** Was die Stufe von der Aufgabenstellung verlangt (Stufenplan der Lehrkraft) */
const ZIEL: Record<Schreibform, Record<GeschichtsStufe, string>> = {
  zusammenfassen: {
    kl56: 'W-Fragen beantworten und die Kernaussagen kurz in eigenen Worten wiedergeben.',
    kl78: 'Einleitungssatz (Autor, Textsorte, Titel, Thema, Zeit), Kernaussagen im Präsens, ohne Zitate und Zeilenangaben.',
    kl910: 'Volle ATTIKA-Einleitung inkl. Intention und Adressaten, Konjunktiv, Aspekte bündeln, ca. ⅓ des Originals.',
    sek2: 'Merkblatt vollständig: ATTIKA-Einleitung, Konjunktiv, Präsens, eigene Worte ohne Zitate/Zeilenangaben, gebündelt, ca. ⅓ des Originals.'
  },
  beurteilen: {
    kl56: 'Ein Urteil mit einem Grund („…, weil …").',
    kl78: 'Urteil an einem vorgegebenen Kriterium; Argument – Erklärung – Beispiel.',
    kl910:
      'Kriterien selbst entwickeln, vierteiliger Aufbau (Einleitung mit Vorweg-Urteil, Kriterien, Hauptteil, Fazit), Fazit passt zur Einleitung, Zeilenbelege.',
    sek2: 'Sachurteil im vierteiligen Aufbau nach der Vorlage, Kriterien offengelegt und Kernbegriffe definiert, jedes Argument belegt, Fazit passt zur Einleitung.'
  }
}

/** Gestufte Hilfen (nehmen mit den Stufen ab) */
export interface StufenHilfen {
  satzanfaenge: string[]
  verben: string[]
  raster: string[]
}

const HILFEN: Record<Schreibform, Record<GeschichtsStufe, StufenHilfen>> = {
  zusammenfassen: {
    kl56: {
      satzanfaenge: ['Der Text handelt von …', 'Er berichtet, dass …', 'Wichtig ist, dass …', 'Am Ende …'],
      verben: ['berichten', 'beschreiben', 'erklären', 'nennen'],
      raster: ['Wer?', 'Was?', 'Wann?', 'Wo?', 'Warum?']
    },
    kl78: {
      satzanfaenge: ['Der/Die (Textsorte) „(Titel)" von (Autor) aus dem Jahr (Jahr) handelt von …', 'Zunächst beschreibt der Autor …', 'Außerdem betont er …'],
      verben: ['beschreiben', 'betonen', 'erklären', 'feststellen', 'nennen', 'verdeutlichen'],
      raster: ['Einleitung: Autor, Textsorte, Titel, Thema, Zeit', 'Hauptteil: Kernaussagen im Präsens, ohne Zitate']
    },
    kl910: {
      satzanfaenge: [MERKBLATT_ZUSAMMENFASSEN.einleitungsmuster],
      verben: [...MERKBLATT_ZUSAMMENFASSEN.verben],
      raster: []
    },
    sek2: { satzanfaenge: [], verben: [], raster: [] }
  },
  beurteilen: {
    kl56: {
      satzanfaenge: ['Ich finde, dass …, weil …', '… war (k)ein Erfolg, weil …'],
      verben: [],
      raster: ['Mein Urteil', 'Mein Grund']
    },
    kl78: {
      satzanfaenge: ['Gemessen an (Kriterium) war …', 'Dafür spricht, dass …', 'Das zeigt sich zum Beispiel an …', 'Dagegen spricht, dass …'],
      verben: [],
      raster: ['Urteil', 'Kriterium', 'Argument', 'Erklärung', 'Beispiel']
    },
    kl910: {
      satzanfaenge: ['Ob … war, hängt davon ab, ob …', 'Unter … versteht man …', 'Ein erstes Argument ist …', 'Insgesamt zeigt sich, dass … zwar …, jedoch …'],
      verben: [],
      raster: ['01 Einleitung mit Vorweg-Urteil', '02 Kriterien', '03 Hauptteil (Argument – Erklärung – Beispiel)', '04 Fazit passend zur Einleitung']
    },
    sek2: { satzanfaenge: [], verben: [], raster: [] }
  }
}

export const hilfenFuer = (form: Schreibform, stufe: GeschichtsStufe): StufenHilfen => HILFEN[form][stufe]

/* ---------- Landesdefinition (AFB, Wortlaut) ---------- */

export interface LandesOperator {
  afb?: string
  definition: string
  quelle: string
  /** Die Vorlage nennt AFB I (zusammenfassen) bzw. III (beurteilen); hier weicht das Land ab */
  abweichend: boolean
}

const AFB_DER_VORLAGE: Record<Schreibform, string> = { zusammenfassen: 'I', beurteilen: 'III' }

/** Definition des Operators in der Liste des Landes (sonst KMK/EPA) für Geschichte und die Stufe */
export function landesOperator(form: Schreibform, stateId: string | undefined, stufe: GeschichtsStufe, schulform?: string): LandesOperator | null {
  if (!stateId) return null
  const a = operatorenAuswahl({ stateId, fach: 'geschichte', stufe: stufe === 'sek2' ? 'sek2' : 'sek1', ...(schulform ? { schulform } : {}) })
  const o = a?.operatoren.find((x) => x.operator.trim().toLowerCase() === form && x.definition)
  if (!a || !o) return null
  return { ...(o.afb ? { afb: o.afb } : {}), definition: o.definition, quelle: a.quelle, abweichend: Boolean(o.afb) && o.afb !== AFB_DER_VORLAGE[form] }
}

function landZeile(form: Schreibform, l: LandesOperator | null): string {
  if (!l) return ''
  const afb = l.afb ? `AFB ${l.afb}` : 'ohne AFB-Angabe'
  return (
    `- Landesdefinition (${l.quelle}, ${afb}): „${l.definition}"` +
    (l.abweichend
      ? ` – Das Land ordnet „${form}" anders zu als die Vorlage (AFB ${AFB_DER_VORLAGE[form]}): Für AFB und Punkte gilt die Landesdefinition; Arbeitsschritte und Kriterien der Vorlage bleiben.`
      : ' Für AFB und Punkte gilt die Landesdefinition; Arbeitsschritte und Kriterien der Vorlage bleiben.')
  )
}

/* ---------- Bausteine für die Erzeugung (Aufgabenstellung, Hilfen, Lösungsteil) ---------- */

export interface ErzeugungsKontext {
  stufe: GeschichtsStufe
  stateId?: string
  schulform?: string
  /** Leistungssituation (Lernkontrolle, Klassenarbeit): keine Hilfen auf dem Blatt */
  pruefung?: boolean
}

const liste = (xs: readonly string[]): string => xs.join(', ')
const kriterienText = (ks: Pruefkriterium[]): string => ks.map((k) => `${k.text} (${k.gewicht} %${k.verstoss === 'hinweis' ? ', nur Hinweis' : ''})`).join('; ')

/**
 * Regeln für die KI beim Erzeugen von Blättern in Geschichte: Wie Aufgaben mit „zusammenfassen" und „beurteilen"
 * gestellt werden, welche Hilfen dazugehören und was in Lösung/Erwartungshorizont steht. Nur für Geschichte.
 */
export function geschichteErzeugungsRegeln(k: ErzeugungsKontext): string {
  const { stufe } = k
  const z = MERKBLATT_ZUSAMMENFASSEN
  const b = MERKBLATT_BEURTEILEN
  const hz = hilfenFuer('zusammenfassen', stufe)
  const hb = hilfenFuer('beurteilen', stufe)
  const sek2 = stufe === 'sek2'
  const hilfeZeile = (h: StufenHilfen, form: Schreibform): string => {
    if (k.pruefung) return ''
    const teile = [
      h.raster.length ? `Strukturraster ${h.raster.map((r) => `„${r}"`).join(' – ')}` : '',
      h.satzanfaenge.length ? `Satzanfänge ${h.satzanfaenge.map((s) => `„${s}"`).join(', ')}` : '',
      h.verben.length ? `Verbenliste (${liste(h.verben)})` : ''
    ].filter(Boolean)
    return teile.length
      ? `- Hilfen zu „${form}" (scaffold bzw. phrases direkt hinter der Aufgabe, in dieser Stufe): ${teile.join(
          '; '
        )}. Die Hilfen nehmen von Stufe zu Stufe ab${sek2 ? '' : ' – nicht mehr anbieten als hier genannt'}.`
      : `- Hilfen zu „${form}": in dieser Stufe keine Satzanfänge oder Raster mehr (höchstens eine Hilfekarte mit den Arbeitsschritten).`
  }
  return [
    `GESCHICHTE – „ZUSAMMENFASSEN" UND „BEURTEILEN" (verbindliche Vorlagen der Lehrkraft; Stufe ${STUFEN_NAME[stufe]}):`,
    'Gilt für jede Aufgabe mit einem dieser Operatoren. „bewerten" ist etwas anderes (Werturteil mit offengelegten Wertmaßstäben) und wird nicht damit vermischt.',
    'ZUSAMMENFASSEN:',
    `- Ziel dieser Stufe: ${ZIEL.zusammenfassen[stufe]} Zweck: ${z.wozu}`,
    `- Aufgabenstellung: bezieht sich auf GENAU einen Text (M{…}), der lang genug ist, um zu verdichten${
      stufe === 'kl56' ? '; in Kl. 5/6 darf die Aufgabe die W-Fragen ausdrücklich nennen' : ''
    }${stufe === 'kl910' || sek2 ? '; Folgeaufgaben bauen darauf auf (sie geben Hinweise, worauf es ankommt)' : ''}.`,
    hilfeZeile(hz, 'zusammenfassen'),
    `- Lösung/Erwartungshorizont (solution bzw. brief.expected): ${
      stufe === 'kl56'
        ? 'Antworten auf die W-Fragen und die Kernaussagen in eigenen Worten'
        : `eine Muster-Zusammenfassung, die die Regeln selbst einhält (${
            stufe === 'kl78'
              ? 'Einleitungssatz, Präsens, keine Zitate und Zeilenangaben'
              : 'ATTIKA-Einleitung, Konjunktiv, Präsens, ohne Zitate und Zeilenangaben, gebündelt, ca. ⅓ des Originals'
          })`
    }, dazu die Kriterienliste mit Gewichtung: ${kriterienText(kriterienFuer('zusammenfassen', stufe))}.`,
    stufe === 'kl910' || sek2 ? `- ATTIKA-Einleitung nach dem Muster: ${z.einleitungsmuster}` : '',
    sek2 ? `- Regeln des Merkblatts: ${liste(z.regeln)}. „Der Verfasser sagt …" vermeiden – stattdessen: ${liste(z.verben)}.` : '',
    sek2 || stufe === 'kl910' ? `- Vorgehen: ${liste(z.vorbereitung)}; Arbeitsschritte ${z.arbeitsschritte.join(' → ')}.` : '',
    'BEURTEILEN:',
    `- Ziel dieser Stufe: ${ZIEL.beurteilen[stufe]}${
      stufe === 'kl910' || sek2 ? ` ${b.sachurteil}` : stufe === 'kl78' ? ' Sachliche Formulierung wird angebahnt (Ich-Form noch kein Fehler).' : ''
    }`,
    stufe === 'kl78' ? '- Aufgabenstellung: nennt das Kriterium ausdrücklich („Beurteile anhand von …, ob …").' : '',
    stufe === 'kl910' || sek2
      ? '- Aufgabenstellung: als Urteilsfrage („Beurteilen Sie, inwieweit …"), ggf. mit Verweis auf im Unterricht behandelte Begriffe als Kriterien.'
      : '',
    hilfeZeile(hb, 'beurteilen'),
    `- Lösung/Erwartungshorizont: ${
      stufe === 'kl56'
        ? 'ein mögliches Urteil mit passendem Grund (andere begründete Urteile sind richtig)'
        : stufe === 'kl78'
        ? 'erwartete Argumente zum vorgegebenen Kriterium mit Erklärung und Beispiel; Urteil offen, sofern begründet'
        : `Aufbau ${b.aufbau
            .map((x) => x.slice(0, 2))
            .join(
              '–'
            )} ausgeführt: mögliche Kriterien und Definition des Kernbegriffs, Argumente mit Belegen (Z.-Angaben bzw. Fachwissen), differenziertes Fazit, das zur Einleitung passt; Urteil offen, sofern kriteriengeleitet begründet`
    }. Kriterienliste mit Gewichtung: ${kriterienText(kriterienFuer('beurteilen', stufe))}.`,
    stufe === 'kl910' || sek2 ? `- Aufbau: ${b.aufbau.join(' | ')}. ${b.fazitRegel}` : '',
    sek2 ? `- Zitierregeln: ${liste(b.zitieren)}.` : '',
    sek2 ? `- Beispiel der Vorlage: „${b.beispielAufgabe}" – ${b.beispielKriterien}` : '',
    landZeile('zusammenfassen', landesOperator('zusammenfassen', k.stateId, stufe, k.schulform)),
    landZeile('beurteilen', landesOperator('beurteilen', k.stateId, stufe, k.schulform))
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Lösungsteil zu EINER fertigen Aufgabe (nachträglich erzeugt, arbeitsblatt/generation/solution.ts): Musterlösung,
 * die die Regeln der Stufe selbst einhält, und Erwartungshorizont mit den Kriterien und ihrer Gewichtung.
 */
export function geschichteLoesungsRegeln(formen: Schreibform[], k: ErzeugungsKontext): string {
  if (!formen.length) return ''
  const { stufe } = k
  const zeilen = formen.flatMap((form) => [
    `GESCHICHTE – „${form}" (Vorlage der Lehrkraft, Stufe ${STUFEN_NAME[stufe]}): ${ZIEL[form][stufe]}`,
    `- „solution": erwartete Inhalte UND die Kriterien mit Gewichtung: ${kriterienText(kriterienFuer(form, stufe))}.`,
    form === 'zusammenfassen'
      ? `- „model": eine Zusammenfassung, die die Regeln selbst einhält – ${
          stufe === 'kl56'
            ? 'Antworten auf die W-Fragen, kurz, in eigenen Worten'
            : stufe === 'kl78'
            ? 'Einleitungssatz (Autor, Textsorte, Titel, Thema, Zeit), Präsens, ohne Zitate und Zeilenangaben'
            : `ATTIKA-Einleitung (${MERKBLATT_ZUSAMMENFASSEN.einleitungsmuster}), Konjunktiv, Präsens, ohne Zitate und Zeilenangaben, gebündelt, ohne Einleitung ca. ⅓ des Originals`
        }.`
      : `- „model": ${
          stufe === 'kl56'
            ? 'ein Urteil mit Grund („…, weil …")'
            : stufe === 'kl78'
            ? 'Urteil am vorgegebenen Kriterium mit Argument – Erklärung – Beispiel'
            : `vierteilig (${MERKBLATT_BEURTEILEN.aufbau.join(' | ')}); ${MERKBLATT_BEURTEILEN.fazitRegel} Keine Ich-Form; Belege „(vgl. Z. …)"`
        }. Das Urteil ist offen – kennzeichne es als EIN mögliches.`,
    landZeile(form, landesOperator(form, k.stateId, stufe, k.schulform))
  ])
  return zeilen.filter(Boolean).join('\n')
}

/* ---------- Deterministische Vorprüfungen (reine Funktionen) ---------- */

/** Wörter zählen (Buchstaben/Ziffern-Folgen; Zeilenmarken „Z. 3:" zählen nicht) */
export function zaehleWoerter(text: string): number {
  return (text ?? '').split(/[^\p{L}\p{N}'’-]+/u).filter((w) => /\p{L}/u.test(w)).length
}

/** Material im Format von materialZeilen.ts („M1\nZ. 1: …") ohne Zeilenmarken */
export function ohneZeilenmarken(text: string): string {
  return (text ?? '').replace(/^\s*Z\.\s*\d+:\s?/gm, '')
}

/**
 * Den Ausgangstext einer Zusammenfassung aus dem Material des Blatts (Format materialZeilen.ts): der in der Anweisung
 * genannte Block (M1, Q2 …), sonst der einzige. Mehrere Blöcke ohne Bezug → null (dann keine Längenprüfung).
 */
export function ausgangstextAusMaterial(material: string, anweisung = ''): string | null {
  const bloecke = (material ?? '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const [kopf, ...rest] = b.split('\n')
      return { kopf: kopf.trim(), text: ohneZeilenmarken(rest.join('\n')) }
    })
    .filter((b) => b.text.trim())
  if (!bloecke.length) return null
  const genannt = [...(anweisung.match(/\b[MQ]\s?\d+\b/g) ?? [])].map((x) => x.replace(/\s/g, ''))
  const passend = bloecke.filter((b) => genannt.includes(b.kopf.replace(/\s/g, '')))
  if (passend.length === 1) return passend[0].text
  return bloecke.length === 1 ? bloecke[0].text : null
}

/** Öffnende Anführungszeichen und ihre möglichen Gegenstücke („…" wird oft mit geradem Zeichen geschlossen) */
const ZITAT_PAARE: Record<string, string> = { '„': '“”"', '"': '"“”', '»': '«', '«': '»', '‚': '‘’' }

/** Zitate in Anführungszeichen (Inhalt) – in der Reihenfolge des Textes, ein Durchgang ohne Überlappung */
export function findeZitate(text: string): { zitat: string; stelle: number; ende: number }[] {
  const t = text ?? ''
  const aus: { zitat: string; stelle: number; ende: number }[] = []
  for (let i = 0; i < t.length; i++) {
    const zu = ZITAT_PAARE[t[i]]
    if (!zu) continue
    let j = i + 1
    while (j < t.length && !zu.includes(t[j]) && j - i < 600) j++
    if (j >= t.length || !zu.includes(t[j])) continue
    const zitat = t.slice(i + 1, j).trim()
    if (zitat) aus.push({ zitat, stelle: i, ende: j + 1 })
    i = j
  }
  return aus
}

/** Text ohne Zitate (für Ich-Form, Konjunktiv, Tempus – im Zitat zählt die Sprache der Quelle) */
export function ohneZitate(text: string): string {
  let t = text ?? ''
  for (const z of findeZitate(t).reverse()) t = `${t.slice(0, z.stelle)} ${t.slice(z.ende)}`
  return t
}

const ZEILEN = /\(?\b(?:vgl\.\s*)?(?:Zl?\.|Zeilen?)\s*\d+(?:\s*(?:[-–—]|bis)\s*\d+|\s*ff?\.?)?\)?/gi

/** Zeilenangaben: „Z. 3", „(Z. 3–5)", „vgl. Z. 12 f.", „Zeile 4", „Zl. 7" */
export function findeZeilenangaben(text: string): string[] {
  return [...(text ?? '').matchAll(ZEILEN)].map((m) => m[0].trim())
}

/*
 * Ich-Form: 1. Person Singular außerhalb von Zitaten. „meine"/„meinen" fehlen absichtlich – sie sind auch Verbformen
 * („er meine" = Konjunktiv, „sie meinen" – Verbenliste des Merkblatts). Faustregel der App.
 */
const ICH = /\b(ich|mich|mir|mein|meinem|meiner|meines|meine Meinung|meine Ansicht|meine Sicht)\b/gi

export function findeIchForm(text: string): string[] {
  return [...ohneZitate(text).matchAll(ICH)].map((m) => m[0])
}

/** Sätze (grob: Satzende + Großbuchstabe/Anführungszeichen) */
export function saetzeVon(text: string): string[] {
  return (text ?? '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„"»(])/)
    .map((s) => s.trim())
    .filter((s) => zaehleWoerter(s) >= 2)
}

/*
 * Konjunktiv I/II als Wortliste (grob, Faustregel): Formen, die in der 3. Person fast nur als Konjunktiv vorkommen,
 * dazu häufige Konjunktiv-I-Formen auf -e („er betone"). Kein Anspruch auf Vollständigkeit – der Anteil ist ein Hinweis.
 */
const KONJUNKTIV =
  /\b(sei|seien|seiest|habe|hätte|hätten|wäre|wären|werde|würde|würden|könne|könnte|könnten|müsse|müsste|müssten|solle|sollte|wolle|dürfe|möge|gebe|gäbe|liege|stehe|gehe|komme|bleibe|führe|zeige|brauche|fehle|gelte|bestehe|trage|handle|diene|lasse|wisse|betone|fordere|kritisiere|erkläre|meine|beschreibe|verlange|drohe)\b/i

/** Redeeinleitung mit Verb des Sagens + „dass/ob/w-" („Der Autor betont, dass …") */
const REDEEINLEITUNG =
  /\b(beschreib\w*|informier\w*|macht\w*\s+deutlich|verdeutlich\w*|beton\w*|führ\w*\s+an|bemerk\w*|behaupt\w*|erklär\w*|führ\w*\s+aus|erläuter\w*|stell\w*\s+fest|nenn\w*|nann\w*|mein\w*|sag\w*|forder\w*|kritisier\w*|argumentier\w*|heb\w*\s+hervor|weis\w*\s+darauf\s+hin|schreib\w*|schrieb\w*|bericht\w*|stell\w*\s+dar|vertrit\w*\s+die\s+\w+|ist\s+der\s+(?:Meinung|Ansicht|Auffassung))\s*,?\s*(dass|ob|wie|warum|weshalb|wer|was|wo)\b/i

const SAGT = /\b(sagt|sagte|sagen|sagten)\b/gi

/** Präteritum-Formen, die in einer Zusammenfassung meist das Präsens verfehlen (grob) */
const PRAETERITUM =
  /\b(war|waren|hatte|hatten|wurde|wurden|ging|gingen|kam|kamen|sagte|sagten|schrieb|schrieben|forderte|forderten|betonte|betonten|erklärte|erklärten|beschrieb|beschrieben)\b/i

export interface KonjunktivBefund {
  saetze: number
  /** Sätze mit Konjunktiv-Form */
  konjunktiv: number
  /** Sätze mit Redeeinleitung („betont, dass") ohne Konjunktiv – erlaubt, aber Alternative vorschlagen */
  redeeinleitungIndikativ: number
  /** Bis zu drei solcher Sätze (für die konkreten Alternativvorschläge im Feedback) */
  beispiele: string[]
}

export function konjunktivBefund(text: string): KonjunktivBefund {
  const saetze = saetzeVon(ohneZitate(text))
  let konjunktiv = 0
  let rede = 0
  const beispiele: string[] = []
  for (const s of saetze) {
    if (KONJUNKTIV.test(s)) konjunktiv++
    else if (REDEEINLEITUNG.test(s)) {
      rede++
      if (beispiele.length < 3) beispiele.push(s.length > 220 ? `${s.slice(0, 217)}…` : s)
    }
  }
  return { saetze: saetze.length, konjunktiv, redeeinleitungIndikativ: rede, beispiele }
}

/* ATTIKA-Signale in der Einleitung (grob, Faustregel) */
const QUELLENART =
  /\b(Rede|Brief\w*|Artikel|Zeitungs\w*|Flugblatt|Flugschrift|Gesetz\w*|Verfassung|Tagebuch\w*|Quelle|Textquelle|Text|Darstellung|Auszug|Aufruf|Proklamation|Erklärung|Bericht|Memoiren|Erinnerungen|Vertrag|Telegramm|Denkschrift|Predigt|Sachtext|Schulbuch\w*|Urkunde|Manifest|Programm|Lied|Gedicht|Interview|Dekret|Note|Resolution|Plakat|Karikatur|Protokoll)\b/
const ATTIKA_SIGNALE: Record<'autor' | 'textsorte' | 'titel' | 'intention' | 'kontext' | 'adressaten', RegExp> = {
  autor: /\b(von|vom|Autor\w*|Verfasser\w*|verfasst|geschrieben|gehalten|stammt)\b/i,
  textsorte: QUELLENART,
  titel: /„[^“”"]+[“”"]|"[^"]+"|»[^«]+«|\b(Titel|Thema|behandelt|handelt\s+von|thematisiert|geht\s+es\s+um)\b/i,
  intention: /\b(Intention|Absicht|Ziel|will|möchte|wollte|um\s+\w+\s+zu|überzeugen|rechtfertigen|mobilisieren|aufrufen|appelliert|werben)\b/i,
  kontext: /\b(1[0-9]{3}|20[0-2][0-9])\b|\b(Jahrhundert|Zeit|während|im\s+Jahr|Kontext|Krieg\w*|Revolution|Epoche)\b/i,
  adressaten: /\b(richtet\s+sich|an\s+die|an\s+den|an\s+das|Adressat\w*|Leser\w*|Publikum|Zuhörer\w*|Bevölkerung|Abgeordnete\w*|Öffentlichkeit)\b/i
}
export type AttikaTeil = keyof typeof ATTIKA_SIGNALE

const einleitungsSignale = (s: string): number =>
  [
    ATTIKA_SIGNALE.textsorte.test(s),
    /\b(1[0-9]{3}|20[0-2][0-9])\b/.test(s),
    /\b(verfasst|veröffentlicht|gehalten|erschienen|geschrieben|stammt)\b/i.test(s),
    ATTIKA_SIGNALE.adressaten.test(s),
    /\b(Thema|behandelt|handelt\s+von|thematisiert)\b/i.test(s)
  ].filter(Boolean).length

/**
 * Einleitung abtrennen: erster Absatz (wenn es mehrere gibt und er nach Einleitung aussieht), sonst die ersten ein
 * bis zwei Sätze mit Einleitungssignalen (Quellenart, Jahr, „verfasst", Adressat, Thema). Faustregel.
 */
export function trenneEinleitung(text: string): { einleitung: string; rest: string; erkannt: boolean } {
  const t = (text ?? '').trim()
  const absaetze = t
    .split(/\n\s*\n/)
    .map((a) => a.trim())
    .filter(Boolean)
  if (absaetze.length >= 2 && einleitungsSignale(absaetze[0]) >= 2) return { einleitung: absaetze[0], rest: absaetze.slice(1).join('\n\n'), erkannt: true }
  const saetze = saetzeVon(t)
  let n = 0
  while (n < Math.min(2, saetze.length) && einleitungsSignale(saetze[n]) >= (n === 0 ? 2 : 1)) n++
  if (!n) return { einleitung: '', rest: t, erkannt: false }
  const einleitung = saetze.slice(0, n).join(' ')
  // Rest = Text ab dem Ende des letzten Einleitungssatzes (Absätze bleiben erhalten)
  const letzter = saetze[n - 1]
  const pos = t.replace(/\s+/g, ' ').indexOf(letzter)
  const rest =
    pos >= 0
      ? t
          .replace(/\s+/g, ' ')
          .slice(pos + letzter.length)
          .trim()
      : saetze.slice(n).join(' ')
  return { einleitung, rest, erkannt: true }
}

/** Welche ATTIKA-Teile die Einleitung erkennbar enthält (grob) */
export function attikaIn(einleitung: string): Record<AttikaTeil, boolean> {
  return Object.fromEntries(Object.entries(ATTIKA_SIGNALE).map(([k, r]) => [k, r.test(einleitung)])) as Record<AttikaTeil, boolean>
}

/** Satzanfänge (erste zwei Wörter), die mindestens dreimal vorkommen */
export function gleicheSatzanfaenge(text: string): { anfang: string; anzahl: number }[] {
  const zaehler = new Map<string, number>()
  for (const s of saetzeVon(text)) {
    const anfang = s
      .split(/\s+/)
      .slice(0, 2)
      .join(' ')
      .replace(/[^\p{L}\s]/gu, '')
      .toLowerCase()
    if (anfang) zaehler.set(anfang, (zaehler.get(anfang) ?? 0) + 1)
  }
  return [...zaehler.entries()].filter(([, n]) => n >= 3).map(([anfang, anzahl]) => ({ anfang, anzahl }))
}

export interface ZusammenfassungsBefund {
  form: 'zusammenfassen'
  stufe: GeschichtsStufe
  woerter: number
  einleitungErkannt: boolean
  einleitungWoerter: number
  attika: Record<AttikaTeil, boolean>
  /** Wörter ohne Einleitung */
  hauptteilWoerter: number
  originalWoerter?: number
  /** Anteil Hauptteil/Original (0–1) */
  anteil?: number
  laenge?: 'passend' | 'zu kurz' | 'zu lang'
  /** Zitate im Hauptteil (ab drei Wörtern) */
  zitate: string[]
  /** Kurze Wendungen in Anführungszeichen (1–2 Wörter) im Hauptteil */
  begriffeInAnfuehrung: string[]
  zeilenangaben: string[]
  konjunktiv: KonjunktivBefund
  praeteritumSaetze: number
  sagt: number
  gleicheAnfaenge: { anfang: string; anzahl: number }[]
  ichForm: string[]
  /** Längste wörtlich übernommene Stelle aus dem Original (Wörter, ab 5) */
  uebernahme?: number
}

export interface BeurteilungsBefund {
  form: 'beurteilen'
  stufe: GeschichtsStufe
  woerter: number
  absaetze: number
  ichForm: string[]
  /** Urteilssignale in der Einleitung (erster Absatz bzw. erste zwei Sätze) */
  vorwegSignal: boolean
  /** Absatz mit Kriterien/Definition vor dem letzten Absatz (Nummer, 1-basiert) */
  kriterienAbsatz: number | null
  zeilenangaben: string[]
  /** davon „vgl. Z." */
  vglAngaben: number
  zitate: number
  /** Zitate ohne folgende Zeilenangabe */
  zitateOhneBeleg: string[]
  /** „Zeile 3" statt „Z. 3", Angabe ohne Klammer o. Ä. */
  zitierformHinweise: string[]
  fazitSignal: boolean
  /** Gemeinsame Kernwörter von Einleitung und Fazit (grob, für „Fazit passt zur Einleitung") */
  gemeinsameKernwoerter: string[]
  differenziert: boolean
  /** Begründung mit „weil/da/denn" (Kl. 5/6) */
  begruendet: boolean
}

export type Schreibbefund = ZusammenfassungsBefund | BeurteilungsBefund

const absaetzeVon = (text: string): string[] =>
  (text ?? '')
    .split(/\n\s*\n/)
    .map((a) => a.trim())
    .filter(Boolean)

const KERN_STOP = new Set(
  'dass diese dieser dieses einer eines einem einen wurde wurden werden worden durch gegen zwischen sowie jedoch allerdings insgesamt zusammenfassend abschließend somit folglich daher sondern bereits damit deshalb dabei nicht keine einen einer andere anderen weiterhin außerdem schließlich lässt handelt'.split(
    ' '
  )
)
const kernwoerter = (t: string): Set<string> =>
  new Set((t.toLowerCase().match(/\p{L}{5,}/gu) ?? []).filter((w) => !KERN_STOP.has(w)).map((w) => w.replace(/(en|er|es|e|n|s)$/u, '')))

/** Vorprüfung einer Zusammenfassung */
export function pruefeZusammenfassung(antwort: string, stufe: GeschichtsStufe, original?: string | null): ZusammenfassungsBefund {
  const { einleitung, rest, erkannt } = trenneEinleitung(antwort)
  const hauptteilWoerter = zaehleWoerter(rest)
  const originalWoerter = original ? zaehleWoerter(original) : 0
  const anteil = originalWoerter >= 40 ? hauptteilWoerter / originalWoerter : undefined
  const zitateRest = findeZitate(rest)
  const ab = original ? abschrift(antwort, original) : null
  return {
    form: 'zusammenfassen',
    stufe,
    woerter: zaehleWoerter(antwort),
    einleitungErkannt: erkannt,
    einleitungWoerter: zaehleWoerter(einleitung),
    attika: attikaIn(einleitung),
    hauptteilWoerter,
    ...(anteil !== undefined
      ? { originalWoerter, anteil, laenge: anteil < LAENGE_MIN ? ('zu kurz' as const) : anteil > LAENGE_MAX ? ('zu lang' as const) : ('passend' as const) }
      : {}),
    zitate: zitateRest.filter((z) => zaehleWoerter(z.zitat) >= 3).map((z) => z.zitat),
    begriffeInAnfuehrung: zitateRest.filter((z) => zaehleWoerter(z.zitat) < 3).map((z) => z.zitat),
    zeilenangaben: findeZeilenangaben(antwort),
    konjunktiv: konjunktivBefund(rest),
    praeteritumSaetze: saetzeVon(ohneZitate(rest)).filter((s) => PRAETERITUM.test(s)).length,
    sagt: [...ohneZitate(antwort).matchAll(SAGT)].length,
    gleicheAnfaenge: gleicheSatzanfaenge(ohneZitate(rest)),
    ichForm: findeIchForm(antwort),
    ...(ab && ab.laengste >= 5 ? { uebernahme: ab.laengste } : {})
  }
}

const VORWEG =
  /\b(handelt\s+es\s+sich|handelte\s+es\s+sich|lässt\s+sich|kann\s+man|ist\s+(?:sie|er|es|dies)?\s*(?:nur\s+)?(?:bedingt|teilweise|eingeschränkt|durchaus|eher|weitgehend|kaum|nicht)|nur\s+(?:bedingt|teilweise|eingeschränkt)|eher|durchaus|weitgehend|im\s+Wesentlichen|zutreffend|berechtigt|gerechtfertigt|keine?\s+(?:echte|wirkliche)|(?:war|waren|ist|sind)\s+(?:k?eine?|nur|kaum|nicht|durchaus|tatsächlich)\s+\p{L}*(?:revolution|erfolg|wende|zäsur|bruch|krise|reform|befreiung|niederlage|sieg)\p{L}*|als\s+\w+\s+(?:zu\s+)?(?:bezeichnen|bewerten|beurteilen|einstufen|sehen))\b/iu
const KRITERIEN_SIGNAL =
  /\b(Kriteri\w*|Maßst[aä]b\w*|definier\w*|Definition|versteh\w*\s+man|wird\s+\w+\s+verstanden|gilt\s+als|Merkmal\w*|Begriff\w*|Tatbestand|erfüllt\s+(?:ist|sind)|liegt\s+\w+\s+vor,?\s+wenn)\b/i
const FAZIT_ANFANG =
  /^(Insgesamt|Zusammenfassend|Abschließend|Somit|Folglich|Daher|Alles\s+in\s+allem|Im\s+Ergebnis|Letztlich|Schlussendlich|Zusammengefasst|Fazit|Abschließend\s+lässt)/i

/** Vorprüfung einer Beurteilung */
export function pruefeBeurteilung(antwort: string, stufe: GeschichtsStufe): BeurteilungsBefund {
  const t = (antwort ?? '').trim()
  const absaetze = absaetzeVon(t)
  const saetze = saetzeVon(t)
  const einleitung = absaetze.length >= 2 ? absaetze[0] : saetze.slice(0, 2).join(' ')
  const fazit = absaetze.length >= 2 ? absaetze[absaetze.length - 1] : saetze.slice(-2).join(' ')
  const mitte = absaetze.length >= 3 ? absaetze.slice(1, -1) : []
  const kIndex = mitte.findIndex((a) => KRITERIEN_SIGNAL.test(a))
  const zeilen = findeZeilenangaben(t)
  const zitate = findeZitate(t).filter((z) => zaehleWoerter(z.zitat) >= 2)
  const zitateOhneBeleg = zitate.filter((z) => !/^\s*,?\s*\(?\s*(?:vgl\.\s*)?(?:Zl?\.|Zeilen?)\s*\d/i.test(t.slice(z.ende, z.ende + 24))).map((z) => z.zitat)
  const zitierformHinweise = [
    ...zeilen.filter((z) => /Zeilen?/i.test(z)).map((z) => `„${z}" → „Z. …"`),
    ...zeilen.filter((z) => !/^\(/.test(z) && !/\)$/.test(z)).map((z) => `„${z}" ohne Klammer`)
  ]
  const e = kernwoerter(einleitung)
  const gemeinsam = [...kernwoerter(fazit)].filter((w) => e.has(w))
  return {
    form: 'beurteilen',
    stufe,
    woerter: zaehleWoerter(t),
    absaetze: absaetze.length,
    ichForm: findeIchForm(t),
    vorwegSignal: VORWEG.test(ohneZitate(einleitung)),
    kriterienAbsatz: kIndex >= 0 ? kIndex + 2 : null,
    zeilenangaben: zeilen,
    vglAngaben: zeilen.filter((z) => /vgl\./i.test(z)).length,
    zitate: zitate.length,
    zitateOhneBeleg,
    zitierformHinweise,
    fazitSignal: FAZIT_ANFANG.test(fazit.trim()) || /\bFazit\b/i.test(fazit),
    gemeinsameKernwoerter: gemeinsam.slice(0, 8),
    differenziert: /\bzwar\b[\s\S]*\b(jedoch|aber|doch|allerdings)\b/i.test(fazit),
    begruendet: /\b(weil|da|denn|deshalb|daher|dafür\s+spricht)\b/i.test(t)
  }
}

export function vorpruefen(form: Schreibform, antwort: string, stufe: GeschichtsStufe, original?: string | null): Schreibbefund {
  return form === 'zusammenfassen' ? pruefeZusammenfassung(antwort, stufe, original) : pruefeBeurteilung(antwort, stufe)
}

/** Ist der Befund ein Verstoß, der nach der Stufe als FEHLER zählt? (Zusammenfassung: Zitat/Zeilenangabe ab Kl. 7/8; Beurteilung: Ich-Form ab Kl. 9/10) */
export function fehlerImBefund(b: Schreibbefund): string[] {
  const aus: string[] = []
  if (b.form === 'zusammenfassen') {
    if (b.stufe !== 'kl56' && b.zitate.length) aus.push(`${b.zitate.length} Zitat(e)`)
    if (b.stufe !== 'kl56' && b.zeilenangaben.length) aus.push(`${b.zeilenangaben.length} Zeilenangabe(n)`)
    if (b.stufe === 'sek2' && b.laenge && b.laenge !== 'passend') aus.push(`Länge ${b.laenge}`)
  } else if ((b.stufe === 'sek2' || b.stufe === 'kl910') && b.ichForm.length) aus.push('Ich-Form')
  return aus
}

const prozent = (x: number): string => `${Math.round(x * 100)} %`
const zitiert = (xs: string[], n = 3): string =>
  xs
    .slice(0, n)
    .map((x) => `„${x.length > 80 ? `${x.slice(0, 77)}…` : x}"`)
    .join(', ') + (xs.length > n ? ` … (insgesamt ${xs.length})` : '')

/** Befund als Fakten für die KI (die App hat gezählt; verlässlich bis auf die als „grob" bezeichneten Werte) */
export function befundZeilen(b: Schreibbefund): string[] {
  if (b.form === 'zusammenfassen') {
    const fehlt = (Object.entries(b.attika) as [AttikaTeil, boolean][]).filter(([, da]) => !da).map(([k]) => k)
    return [
      `- Wörter: ${b.woerter} insgesamt; Einleitung ${b.einleitungErkannt ? `${b.einleitungWoerter} Wörter (erkannt)` : 'nicht erkannt'}; ohne Einleitung ${
        b.hauptteilWoerter
      } Wörter.`,
      b.originalWoerter
        ? `- LÄNGE: Original ${b.originalWoerter} Wörter, Zusammenfassung ohne Einleitung ${b.hauptteilWoerter} Wörter = ${prozent(
            b.anteil!
          )} des Originals (angestrebt ca. ⅓; Toleranz ${prozent(LAENGE_MIN)}–${prozent(LAENGE_MAX)}, also etwa ${Math.round(
            b.originalWoerter * LAENGE_MIN
          )}–${Math.round(b.originalWoerter * LAENGE_MAX)} Wörter) → ${b.laenge}.`
        : '- LÄNGE: Original nicht eindeutig bestimmbar – Länge nur schätzen, keine Zahlen behaupten.',
      b.einleitungErkannt
        ? `- ATTIKA-Signale in der Einleitung (grob): ${fehlt.length ? `nicht erkennbar: ${fehlt.join(', ')}` : 'alle sechs Teile erkennbar'}.`
        : '',
      `- Zitate im Hauptteil (ab drei Wörtern in Anführungszeichen): ${b.zitate.length ? zitiert(b.zitate) : 'keine'}.`,
      b.begriffeInAnfuehrung.length ? `- Kurze Wendungen in Anführungszeichen: ${zitiert(b.begriffeInAnfuehrung)} (prüfen, ob Quellenbegriff oder Zitat).` : '',
      `- Zeilenangaben: ${b.zeilenangaben.length ? zitiert(b.zeilenangaben, 5) : 'keine'}.`,
      `- Konjunktiv (grob): ${b.konjunktiv.konjunktiv} von ${b.konjunktiv.saetze} Sätzen ohne Einleitung mit Konjunktivform; ${
        b.konjunktiv.redeeinleitungIndikativ
      } Sätze mit Redeeinleitung + Indikativ${b.konjunktiv.beispiele.length ? `, z. B. ${zitiert(b.konjunktiv.beispiele)}` : ''}.`,
      b.praeteritumSaetze ? `- Präteritum statt Präsens (grob): ${b.praeteritumSaetze} Satz/Sätze.` : '',
      b.sagt ? `- „sagt/sagen": ${b.sagt}× (Verbenliste empfehlen).` : '',
      b.gleicheAnfaenge.length ? `- Gleiche Satzanfänge: ${b.gleicheAnfaenge.map((g) => `„${g.anfang} …" ${g.anzahl}×`).join(', ')}.` : '',
      b.ichForm.length ? `- Ich-Form/eigene Meinung: ${zitiert(b.ichForm)}.` : '',
      b.uebernahme ? `- Längste wörtlich übernommene Stelle aus dem Original: ${b.uebernahme} Wörter (ohne Anführungszeichen = nicht in eigenen Worten).` : ''
    ].filter(Boolean)
  }
  return [
    `- Wörter: ${b.woerter}; Absätze: ${b.absaetze}.`,
    `- Ich-Form: ${b.ichForm.length ? zitiert(b.ichForm) : 'keine'}.`,
    `- Urteilssignal in der Einleitung (grob): ${b.vorwegSignal ? 'ja' : 'nicht erkannt'}.`,
    `- Kriterienteil vor dem Hauptteil (grob): ${b.kriterienAbsatz ? `Absatz ${b.kriterienAbsatz} nennt Kriterien/Definitionen` : 'nicht erkannt'}.`,
    `- Belege: ${b.zeilenangaben.length} Zeilenangabe(n)${b.vglAngaben ? `, davon ${b.vglAngaben} mit „vgl."` : ''}; ${b.zitate} Zitat(e)${
      b.zitateOhneBeleg.length ? `, davon ohne Zeilenangabe: ${zitiert(b.zitateOhneBeleg)}` : ''
    }.`,
    b.zitierformHinweise.length ? `- Zitierform: ${b.zitierformHinweise.slice(0, 4).join('; ')}.` : '',
    `- Fazit (letzter Absatz): ${b.fazitSignal ? 'als Fazit erkennbar' : 'kein Fazit-Signal'}${
      b.differenziert ? ', differenziert („zwar … jedoch")' : ''
    }; gemeinsame Kernwörter mit der Einleitung (grob): ${b.gemeinsameKernwoerter.length ? b.gemeinsameKernwoerter.join(', ') : 'keine'}.`,
    b.stufe === 'kl56' ? `- Begründung mit „weil/da/denn": ${b.begruendet ? 'ja' : 'nicht erkannt'}.` : ''
  ].filter(Boolean)
}

/* ---------- Bausteine für Rückmeldung/Bewertung ---------- */

export interface FeedbackKontext {
  stufe: GeschichtsStufe
  anrede: 'du' | 'sie'
  stateId?: string
  schulform?: string
}

/** Formulierungsbeispiele (schülergerecht in der Sek I, Sie-Form in der Sek II) */
function beispiele(form: Schreibform, anrede: 'du' | 'sie'): string[] {
  const du = anrede === 'du'
  if (form === 'zusammenfassen')
    return du
      ? [
          '„Dein Satz ‚Der Autor betont, dass der Krieg unvermeidlich war.‘ ist erlaubt. Noch distanzierter klingt er ohne Redeeinleitung im Konjunktiv: ‚Der Krieg sei unvermeidlich gewesen.‘"',
          '„Deine Zusammenfassung hat ohne Einleitung 180 Wörter – das sind 60 % des Textes (300 Wörter). Ziel ist etwa ein Drittel, also rund 100 Wörter: Fasse die Absätze 2 und 3 in einem Satz zusammen."',
          '„In Zeile 4 deiner Antwort steht ein Zitat. In einer Zusammenfassung schreibst du alles in eigenen Worten und ohne Zeilenangaben."'
        ]
      : [
          '„Die Redeeinleitung ‚Der Autor betont, dass der Krieg unvermeidlich war‘ ist zulässig. Distanzierter und knapper: ‚Der Krieg sei unvermeidlich gewesen.‘"',
          '„Ohne Einleitung umfasst Ihre Zusammenfassung 260 Wörter, also 70 % des Originals (370 Wörter). Angestrebt ist etwa ein Drittel (ca. 75–165 Wörter): Bündeln Sie die Beispiele des zweiten Abschnitts in einer Aussage."',
          '„Das Zitat ‚…‘ (Z. 12) verstößt gegen den Operator: Eine Zusammenfassung gibt den Inhalt in eigenen Worten, ohne Zitate und Zeilenangaben wieder."'
        ]
  return du
    ? [
        '„Schreib dein Urteil gleich in die Einleitung, z. B.: ‚Die Revolution von 1905 war nur teilweise eine Revolution.‘"',
        '„Statt ‚Ich finde, dass …‘ formulierst du sachlich: ‚Dafür spricht, dass …‘"',
        '„Belege dein Argument mit dem Material: ‚(vgl. Z. 12–15)‘."'
      ]
    : [
        '„Ihre Einleitung führt zur Frage hin, nimmt aber noch kein Urteil vorweg – ergänzen Sie z. B.: ‚Die Ereignisse von 1905 erfüllen die Kriterien einer Revolution nur teilweise.‘"',
        '„‚Ich finde, dass …‘ ist in einem Sachurteil nicht zulässig – formulieren Sie objektiv: ‚Gemessen am Kriterium … ist festzustellen, dass …‘"',
        '„Ihr Fazit spricht von einem Erfolg, die Einleitung von einer gescheiterten Revolution – Fazit und Einleitung müssen zueinander passen."'
      ]
}

/** Regeln für die Rückmeldung zu EINER Schreibform (Kriterien mit Gewichtung, Fehlerkategorien, Beispiele) */
export function geschichteFeedbackRegeln(form: Schreibform, k: FeedbackKontext): string {
  const { stufe } = k
  const ks = kriterienFuer(form, stufe)
  const fehler = ks.filter((x) => x.verstoss === 'fehler')
  const hinweise = ks.filter((x) => x.verstoss === 'hinweis')
  const zeilen =
    form === 'zusammenfassen'
      ? [
          stufe === 'kl56'
            ? '- Zitate und Zeilenangaben sind in Kl. 5/6 noch kein Fehler – weise freundlich darauf hin, dass man in eigenen Worten zusammenfasst.'
            : '- FEHLER (Verstoß gegen den Operator, nicht nur Hinweis): jedes Zitat und jede Zeilenangabe in der Zusammenfassung. Nenne die Stelle.',
          stufe === 'kl910' || stufe === 'sek2'
            ? '- KONJUNKTIV: Redeeinleitung + Indikativ („Der Autor betont, dass … ist") ist ERLAUBT und kein Fehler. Schlage aber für ein bis zwei solcher Sätze eine konkrete Alternative ohne Redeeinleitung im Konjunktiv vor (z. B. „Der Krieg sei unvermeidlich gewesen."). Sätze ganz ohne Distanz (eigene Behauptung im Indikativ ohne Redeeinleitung) benennen.'
            : stufe === 'kl78'
            ? '- Konjunktiv wird in Kl. 7/8 noch nicht verlangt; Präsens schon.'
            : '',
          stufe === 'kl910' || stufe === 'sek2'
            ? `- LÄNGE: ca. ⅓ des Originals ohne Einleitung (Toleranz ${prozent(LAENGE_MIN)}–${prozent(
                LAENGE_MAX
              )}). Liegt der gezählte Anteil deutlich darüber oder darunter, sage es MIT DEN ZAHLEN (Wörter der Zusammenfassung, Wörter des Originals, Anteil, Zielbereich) und zeige, was sich bündeln bzw. ergänzen lässt.`
            : '- LÄNGE: deutlich kürzer als der Text; nur ansprechen, wenn die Antwort fast so lang ist wie der Text.',
          stufe === 'kl78' || stufe === 'kl910' || stufe === 'sek2'
            ? `- EINLEITUNG: ${
                stufe === 'kl78'
                  ? 'Autor, Textsorte, Titel, Thema, Zeit'
                  : 'ATTIKA – Autor, Textsorte/Quellenart, Titel/Thema, Intention, Kontext/Entstehungszeit, Adressaten (die Intention gehört in die Einleitung)'
              }; fehlende Teile einzeln nennen.`
            : '- W-FRAGEN: Welche W-Frage bleibt offen? Konkret nennen.',
          `- „Der Verfasser sagt …" → Verben aus der Liste vorschlagen: ${liste(MERKBLATT_ZUSAMMENFASSEN.verben)}.`,
          '- Eigene Meinung zum Material gehört nicht in eine Zusammenfassung.'
        ]
      : [
          stufe === 'sek2' || stufe === 'kl910'
            ? '- PRÜFPUNKTE (jeder einzeln, mit Einschätzung): (1) Vorweg-Urteil in der Einleitung; (2) eigener Kriterienteil VOR dem Hauptteil (Kriterien offengelegt, Kernbegriff definiert); (3) jedes Argument mit Beleg aus Material „(vgl. Z. …)" oder Fachwissen, Absatz = Argument – Erklärung – Beispiel; (4) FAZIT PASST ZUR EINLEITUNG (eigener Prüfpunkt: Einleitung und Fazit nebeneinander lesen – widersprechen sie sich, ist das ein Fehler); (5) keine Ich-Form.'
            : stufe === 'kl78'
            ? '- PRÜFPUNKTE: klares Urteil; Ausrichtung am vorgegebenen Kriterium; Argument – Erklärung – Beispiel.'
            : '- PRÜFPUNKTE: ein Urteil und mindestens ein passender Grund („…, weil …").',
          stufe === 'sek2' || stufe === 'kl910'
            ? '- ICH-FORM ist ein FEHLER: Ein Sachurteil ist objektiv formuliert („Ich finde, dass …" → „Gemessen an … zeigt sich, dass …").'
            : stufe === 'kl78'
            ? '- Ich-Form ist in Kl. 7/8 noch kein Fehler; zeige als Hinweis, wie das Urteil sachlich klingt („Dafür spricht, dass …").'
            : '- Ich-Form („Ich finde …, weil …") ist in Kl. 5/6 in Ordnung.',
          stufe === 'sek2' ? `- Zitierregeln prüfen: ${liste(MERKBLATT_BEURTEILEN.zitieren)}.` : '',
          `- ${MERKBLATT_BEURTEILEN.abgrenzung}`,
          '- Das Urteil selbst ist offen: Jedes kriteriengeleitet begründete Urteil ist richtig; bewertet wird die Begründung, nicht die Richtung.'
        ]
  return [
    `GESCHICHTE – „${form.toUpperCase()}" (verbindliche Vorlage der Lehrkraft; Stufe ${STUFEN_NAME[stufe]} – es gelten die Kriterien DIESER Stufe${
      stufe === 'sek2' ? '' : ', nicht die volle Sek-II-Strenge'
    }):`,
    `- Ziel: ${ZIEL[form][stufe]}`,
    `- Kriterien mit Gewichtung (Faustregel der App): ${kriterienText(ks)}.`,
    fehler.length
      ? `- Fehlerkategorie „Verstoß gegen den Operator": jedes nicht erfüllte Kriterium oben, das nicht als „nur Hinweis" gekennzeichnet ist (${fehler.length} von ${ks.length}).`
      : '',
    hinweise.length ? `- Nur Hinweis: ${hinweise.map((x) => x.text).join('; ')}.` : '',
    ...zeilen,
    '- Ein Verstoß gegen den Operator wird als Fehler benannt (Markierung „fehler" an der Stelle) – die Einschätzung ist dann höchstens „teilweise".',
    `- Formulierungsbeispiele (${k.anrede === 'du' ? 'du, schülergerecht' : 'Sie-Form'}): ${beispiele(form, k.anrede).join(' ')}`,
    landZeile(form, landesOperator(form, k.stateId, stufe, k.schulform))
  ]
    .filter(Boolean)
    .join('\n')
}

export interface FeedbackAnfrageDaten {
  /** Fach (Kennung oder Anzeigename) – nur Geschichte erzeugt einen Baustein */
  fach: string | undefined
  /** Arbeitsanweisung(en), in denen der Operator gesucht wird */
  anweisung: string
  /** Antwort der Person (ohne Namen) – leer: nur Regeln, keine Vorprüfung */
  antwort?: string
  jahrgang?: number
  sek2?: boolean
  stateId?: string
  schulform?: string
  /** Ausgangstext für die ⅓-Regel (ohne Zeilenmarken) */
  original?: string | null
  anrede?: 'du' | 'sie'
}

export interface FeedbackBaustein {
  text: string
  formen: Schreibform[]
  stufe: GeschichtsStufe
  befunde: Schreibbefund[]
  /** Verstöße, die nach der Stufe als Fehler zählen (für eine Deckelung der Einschätzung) */
  fehler: string[]
}

/**
 * Alles für EINE Feedback-Anfrage: Regeln je erkannter Schreibform + Vorprüfung der Antwort als Fakten.
 * null, wenn das Fach nicht Geschichte ist oder keiner der beiden Operatoren in der Anweisung steht.
 */
export function geschichteFeedbackBaustein(d: FeedbackAnfrageDaten): FeedbackBaustein | null {
  if (!istGeschichte(d.fach)) return null
  const formen = schreibformenIn(d.anweisung)
  if (!formen.length) return null
  const stufe = geschichtsStufe(d.jahrgang, d.sek2)
  const anrede = d.anrede ?? (stufe === 'sek2' ? 'sie' : 'du')
  // Nur eine Schreibform in der Anweisung: die ganze Antwort gilt ihr. Bei beiden (selten) nur Regeln, Vorprüfung je Form.
  const antwort = (d.antwort ?? '').trim()
  const befunde = antwort ? formen.map((f) => vorpruefen(f, antwort, stufe, f === 'zusammenfassen' ? d.original : null)) : []
  const fehler = formen.length === 1 ? befunde.flatMap(fehlerImBefund) : []
  const text = [
    ...formen.map((f) =>
      geschichteFeedbackRegeln(f, { stufe, anrede, ...(d.stateId ? { stateId: d.stateId } : {}), ...(d.schulform ? { schulform: d.schulform } : {}) })
    ),
    befunde.length
      ? `BEFUND DER APP (automatisch gezählt; Zahlen verlässlich, als „grob" bezeichnete Werte nur Hinweise – prüfe sie am Text${
          formen.length > 1 ? '; die Antwort enthält womöglich beide Teile' : ''
        }):\n${befunde.flatMap(befundZeilen).join('\n')}`
      : '',
    fehler.length ? `- Nach dieser Stufe als Fehler zu werten (gezählt): ${fehler.join(', ')}.` : ''
  ]
    .filter(Boolean)
    .join('\n')
  return { text, formen, stufe, befunde, fehler }
}
