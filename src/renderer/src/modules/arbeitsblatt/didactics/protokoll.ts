/**
 * Versuchsprotokoll und verwandte Protokolle – Didaktik (29.09.2026, Wunsch der Lehrkraft).
 *
 * Grundlage: Recherche recherche/versuchsprotokoll-2026-09-29.md. Kernbefunde:
 * - Keine bundesweit verbindliche Protokollnorm; der Kern ist überall gleich: Frage → Vermutung →
 *   Material/Aufbau (Skizze) → Durchführung → Beobachtung/Messwerte → Auswertung/Deutung →
 *   Antwort auf die Frage. Chemie ergänzt Chemikalien, Gefahren/Schutzmaßnahmen,
 *   Reaktionsgleichung, Entsorgung; Physik Messwerttabelle, Diagramm, Fehlerbetrachtung
 *   (Kl. 7/8 qualitativ, 9/10 einfach unter Anleitung, Sek II selbstständig); Biologie
 *   Mikroskopierprotokoll; Grundschule Forscherbogen (Forschungskreis).
 * - Zentrale Regel in allen Quellen: Beobachtung und Deutung strikt trennen.
 * - Zeitform: kein Konsens (Präsens + man/Passiv bei Chemiezauber und Nelles, Präteritum bei
 *   Ratgebern, Ich-/Wir-Form in der Unterstufe) – deshalb wählbar mit Vorschlag nach Alter.
 * - Sicherheit (RiSU 2023): Die Gefährdungsbeurteilung erstellt die Lehrkraft; auf das
 *   Schülerprotokoll gehören Gefahren/Schutzmaßnahmen, GHS-Piktogramme und Entsorgung.
 *   Eine Stoffdatenbank ohne Quelle gibt es hier nicht: Die Angaben der KI sind als „zu
 *   prüfen" markiert, mit Verweis auf die GESTIS-Stoffdatenbank der DGUV.
 * - Satzbausteine: Nelles-Vorlage und offenes-lernen.de (CC0); Bewertungskriterien:
 *   chemie.schule-Bewertungsbogen, KMK AHR Chemie 3.2.1.3.
 * - Für Technik, Informatik und Erdkunde gibt es keine eigene Protokollnorm; die Test- und
 *   Geländeprotokolle hier sind aus dem gemeinsamen Kern abgeleitet (so im Lehrerhinweis).
 */
import type { StructuredRequest } from '@shared/types'
import { arr, enumOf, obj, str } from '../../../shared/aiSchema'
import { newId } from '../../vokabeltest/model/random'
import type { Sheet, TextBlock, WorksheetMeta, WsBlock } from '../model/types'
import type {
  AbschnittForm,
  AbschnittId,
  Chemikalie,
  GhsId,
  ProtokollAbschnitt,
  ProtokollArt,
  ProtokollInhalt,
  ProtokollStil,
  ProtokollStufe,
  VersuchDaten,
  VersuchSetup
} from '../model/protokoll'

// ---------- Fächer und Arten ----------

/** Fächer mit Versuchen, Messungen oder Beobachtungen (Kennungen aus model/subjects.ts) */
export const PROTOKOLL_FAECHER = ['chemie', 'physik', 'biologie', 'sachunterricht', 'informatik', 'erdkunde', 'technik'] as const

export const hatProtokolle = (subjectId: string): boolean => (PROTOKOLL_FAECHER as readonly string[]).includes(subjectId)

export interface ArtInfo {
  id: ProtokollArt
  label: string
  beschreibung: string
  /** Die Norm ist aus dem gemeinsamen Kern abgeleitet, nicht belegt */
  abgeleitet?: boolean
}

export const ARTEN: ArtInfo[] = [
  { id: 'versuch', label: 'Versuchsprotokoll', beschreibung: 'Frage, Vermutung, Material, Aufbau, Durchführung, Beobachtung, Deutung, Ergebnis' },
  { id: 'messung', label: 'Messprotokoll', beschreibung: 'Messwerttabelle mit Größe und Einheit, Diagramm, Auswertung, Fehlerbetrachtung' },
  { id: 'beobachtung', label: 'Beobachtungsprotokoll', beschreibung: 'Beobachten über eine Zeit oder an einem Objekt, Beobachtung und Deutung getrennt' },
  { id: 'mikroskopie', label: 'Mikroskopierprotokoll', beschreibung: 'Objekt, Präparat, Färbung, Vergrößerung, mikroskopische Zeichnung' },
  { id: 'forscher', label: 'Forscherbogen', beschreibung: 'Grundschule und Unterstufe: Ich frage – ich vermute – ich probiere – ich beobachte – ich finde heraus' },
  { id: 'test', label: 'Test- und Konstruktionsprotokoll', beschreibung: 'Anforderung, Testschritte, erwartetes und tatsächliches Ergebnis, Verbesserung', abgeleitet: true },
  { id: 'gelaende', label: 'Gelände- und Messprotokoll', beschreibung: 'Ort, Datum, Wetter, Messungen im Gelände, Lageskizze', abgeleitet: true }
]

export const artInfo = (id: ProtokollArt): ArtInfo => ARTEN.find((a) => a.id === id) ?? ARTEN[0]

const ARTEN_JE_FACH: Record<string, ProtokollArt[]> = {
  chemie: ['versuch', 'beobachtung', 'messung'],
  physik: ['versuch', 'messung'],
  biologie: ['versuch', 'beobachtung', 'mikroskopie', 'messung'],
  sachunterricht: ['forscher', 'beobachtung', 'versuch'],
  informatik: ['test', 'messung'],
  erdkunde: ['gelaende', 'messung', 'beobachtung'],
  technik: ['test', 'versuch', 'messung']
}

/** Arten für ein Fach (sonst alle) – die erste ist der Vorschlag; bis Klasse 4 immer der Forscherbogen */
export function artenFuer(subjectId: string, grade: number): ProtokollArt[] {
  const liste = ARTEN_JE_FACH[subjectId] ?? ARTEN.map((a) => a.id)
  return grade <= 4 && !liste.includes('forscher') ? ['forscher', ...liste] : grade <= 4 ? ['forscher', ...liste.filter((a) => a !== 'forscher')] : liste
}

// ---------- Stufen und Stil ----------

export const STUFEN: { id: ProtokollStufe; label: string; beschreibung: string }[] = [
  { id: 'forscher', label: 'Forscherbogen', beschreibung: 'Wenig Schreiben: Leitfragen, Ich-Satzanfänge, Zeichnen, Ankreuzen' },
  { id: 'vorstrukturiert', label: 'Vorstrukturiert', beschreibung: 'Material und Durchführung stehen da; Vermutung, Beobachtung und Deutung werden ergänzt – mit Leitfragen und Satzanfängen' },
  { id: 'luecken', label: 'Lückenprotokoll', beschreibung: 'Beobachtung und Deutung als Lückentext mit Wortspeicher' },
  { id: 'offen', label: 'Offene Vorlage', beschreibung: 'Versuchsanleitung als Material, das Protokoll nur mit Überschriften und Schreibflächen' },
  { id: 'planen', label: 'Versuch selbst planen', beschreibung: 'Frage und verfügbares Material stehen da; Vermutung, Aufbau und Durchführung werden selbst geplant' }
]

/** Vorschlag nach Alter (Recherche 1.4): GS Forscherbogen, 5–8 vorstrukturiert, 9–10 offen, Sek II offen */
export function stufeVorschlag(grade: number, art: ProtokollArt): ProtokollStufe {
  if (art === 'forscher' || grade <= 4) return 'forscher'
  if (grade <= 8) return 'vorstrukturiert'
  return 'offen'
}

export const STILE: { id: ProtokollStil; label: string; beispiel: string }[] = [
  { id: 'ichwir', label: 'Ich-/Wir-Form', beispiel: '„Ich vermute, dass …" – „Wir erhitzen …"' },
  { id: 'praesens', label: 'Präsens, man/Passiv', beispiel: '„Das Reagenzglas wird erhitzt." – „Man beobachtet …"' },
  { id: 'praeteritum', label: 'Präteritum', beispiel: '„Das Reagenzglas wurde erhitzt." – „Es bildete sich …"' }
]

/** Vorschlag nach Alter; ab Klasse 7 gilt die Festlegung der Fachschaft aus den Einstellungen, falls vorhanden */
export function stilVorschlag(grade: number, fachschaft?: ProtokollStil | ''): ProtokollStil {
  if (grade <= 6) return 'ichwir'
  return fachschaft || 'praesens'
}

// ---------- Abschnitte ----------

interface AbschnittInfo {
  titel: string
  form: AbschnittForm
  leitfrage: string
  /** Satzanfänge je Stil (Nelles-Vorlage, offenes-lernen.de) */
  satz: Partial<Record<ProtokollStil, string[]>>
  zeilen: number
  hoeheMm?: number
}

const ABSCHNITTE: Record<AbschnittId, AbschnittInfo> = {
  kopf: { titel: 'Protokoll', form: 'kopf', leitfrage: '', satz: {}, zeilen: 0 },
  frage: {
    titel: 'Fragestellung',
    form: 'linien',
    leitfrage: 'Was soll herausgefunden werden?',
    satz: { ichwir: ['Ich möchte herausfinden, ob …', 'Was passiert, wenn …?'], praesens: ['Was passiert, wenn …?', 'Kann man …?'], praeteritum: ['Was passiert, wenn …?'] },
    zeilen: 2
  },
  vermutung: {
    titel: 'Vermutung',
    form: 'linien',
    leitfrage: 'Was wird wahrscheinlich passieren – und warum?',
    satz: {
      ichwir: ['Ich vermute, dass …, weil …'],
      praesens: ['Vermutlich …, weil …', 'Wenn …, dann …, weil …', 'Je …, desto …'],
      praeteritum: ['Es wurde vermutet, dass …, weil …']
    },
    zeilen: 3
  },
  material: { titel: 'Material und Geräte', form: 'liste', leitfrage: 'Was wird gebraucht?', satz: {}, zeilen: 3 },
  chemikalien: { titel: 'Chemikalien', form: 'liste', leitfrage: 'Welche Stoffe werden verwendet – in welcher Menge?', satz: {}, zeilen: 3 },
  sicherheit: { titel: 'Gefahren und Schutzmaßnahmen', form: 'liste', leitfrage: 'Worauf ist zu achten?', satz: {}, zeilen: 2 },
  aufbau: { titel: 'Versuchsaufbau (Skizze)', form: 'skizze', leitfrage: 'Den Aufbau mit Bleistift zeichnen und beschriften.', satz: {}, zeilen: 0, hoeheMm: 60 },
  durchfuehrung: {
    titel: 'Durchführung',
    form: 'linien',
    leitfrage: 'Was wird nacheinander gemacht?',
    satz: {
      ichwir: ['Zuerst …', 'Dann …', 'Zum Schluss …'],
      praesens: ['Zunächst wird …', 'Anschließend …', 'Abschließend …'],
      praeteritum: ['Zunächst wurde …', 'Anschließend …', 'Abschließend …']
    },
    zeilen: 5
  },
  beobachtung: {
    titel: 'Beobachtung',
    form: 'linien',
    leitfrage: 'Nur notieren, was gesehen, gehört, gerochen oder gemessen wird – noch keine Erklärung.',
    satz: {
      ichwir: ['Ich sehe, dass …', 'Es riecht …'],
      praesens: ['Es lässt sich beobachten, dass …', 'Nach … Minuten …'],
      praeteritum: ['Es war zu beobachten, dass …', 'Nachdem …, …']
    },
    zeilen: 4
  },
  messwerte: { titel: 'Messwerte', form: 'tabelle', leitfrage: 'Messwerte mit Einheit eintragen.', satz: {}, zeilen: 0 },
  diagramm: { titel: 'Diagramm', form: 'diagramm', leitfrage: 'Die Messwerte in ein Diagramm übertragen; Achsen mit Größe und Einheit beschriften.', satz: {}, zeilen: 0, hoeheMm: 70 },
  auswertung: {
    titel: 'Auswertung (Deutung)',
    form: 'linien',
    leitfrage: 'Wie lässt sich die Beobachtung erklären?',
    satz: {
      ichwir: ['Das liegt daran, dass …', 'Ich erkläre mir das so: …'],
      praesens: ['Aus der Beobachtung folgt, dass …', 'Die Erklärung dafür ist, dass …'],
      praeteritum: ['Aus der Beobachtung folgte, dass …', 'Die Erklärung dafür ist, dass …']
    },
    zeilen: 5
  },
  fehler: {
    titel: 'Fehlerbetrachtung',
    form: 'linien',
    leitfrage: 'Welche konkreten Fehlerquellen können das Ergebnis verfälscht haben?',
    satz: { praesens: ['Eine mögliche Fehlerquelle ist …, weil …'], praeteritum: ['Eine mögliche Fehlerquelle war …, weil …'], ichwir: ['Ungenau war vielleicht …'] },
    zeilen: 3
  },
  ergebnis: {
    titel: 'Ergebnis',
    form: 'linien',
    leitfrage: 'Antwort auf die Fragestellung: Stimmt die Vermutung?',
    satz: {
      ichwir: ['Ich habe herausgefunden, dass …', 'Meine Vermutung war richtig / falsch, weil …'],
      praesens: ['Die Vermutung wird bestätigt / widerlegt, weil …'],
      praeteritum: ['Die Vermutung wurde bestätigt / widerlegt, weil …']
    },
    zeilen: 3
  },
  entsorgung: { titel: 'Entsorgung', form: 'linien', leitfrage: 'Wohin kommen die Reste?', satz: {}, zeilen: 1 },
  weiter: { titel: 'Neue Fragen', form: 'linien', leitfrage: 'Was möchte ich noch herausfinden?', satz: { ichwir: ['Ich frage mich noch, …'] }, zeilen: 2 }
}

/** Überschriften, die je Art anders heißen */
const TITEL_JE_ART: Partial<Record<ProtokollArt, Partial<Record<AbschnittId, string>>>> = {
  forscher: { frage: 'Meine Forscherfrage', vermutung: 'Ich vermute …', material: 'Das brauche ich', aufbau: 'So sieht es aus (Zeichnung)', beobachtung: 'Das beobachte ich', ergebnis: 'Das habe ich herausgefunden', weiter: 'Das möchte ich noch wissen' },
  mikroskopie: { material: 'Objekt, Präparat, Färbung, Vergrößerung', aufbau: 'Mikroskopische Zeichnung', beobachtung: 'Beschreibung', auswertung: 'Deutung' },
  test: { frage: 'Anforderung / Testziel', material: 'Werkzeuge und Testumgebung', durchfuehrung: 'Testschritte', messwerte: 'Testfälle', auswertung: 'Auswertung', fehler: 'Gefundene Fehler und Verbesserungen', ergebnis: 'Ergebnis' },
  gelaende: { kopf: 'Geländeprotokoll', material: 'Ausrüstung', aufbau: 'Lageskizze', durchfuehrung: 'Vorgehen', messwerte: 'Messungen' }
}

const MIKRO_LEITFRAGE = 'Mit Bleistift, feinen durchgehenden Linien, ohne Schraffur zeichnen; Beschriftung rechts mit Lineal-Strichen; Vergrößerung angeben.'

/** Vorgeschlagene Abschnitte für Art, Fach und Jahrgang (Recherche 1.2–1.4) */
export function abschnittVorschlag(art: ProtokollArt, subjectId: string, grade: number): AbschnittId[] {
  const chemie = subjectId === 'chemie'
  const mitStoffen = chemie || subjectId === 'biologie'
  const fehler = grade >= 7
  switch (art) {
    case 'forscher':
      return ['kopf', 'frage', 'vermutung', 'material', 'aufbau', 'beobachtung', 'ergebnis', 'weiter']
    case 'beobachtung':
      return ['kopf', 'frage', 'material', 'durchfuehrung', 'beobachtung', 'auswertung', 'ergebnis']
    case 'mikroskopie':
      return ['kopf', 'frage', 'material', 'aufbau', 'beobachtung', 'auswertung']
    case 'messung':
      return ['kopf', 'frage', 'vermutung', 'material', 'aufbau', 'durchfuehrung', 'messwerte', 'diagramm', 'auswertung', ...(fehler ? (['fehler'] as AbschnittId[]) : []), 'ergebnis']
    case 'test':
      return ['kopf', 'frage', 'material', 'durchfuehrung', 'messwerte', 'auswertung', 'fehler', 'ergebnis']
    case 'gelaende':
      return ['kopf', 'frage', 'vermutung', 'material', 'aufbau', 'durchfuehrung', 'messwerte', 'beobachtung', 'auswertung', 'ergebnis']
    default:
      return [
        'kopf',
        'frage',
        'vermutung',
        'material',
        ...(chemie ? (['chemikalien', 'sicherheit'] as AbschnittId[]) : mitStoffen ? (['sicherheit'] as AbschnittId[]) : []),
        'aufbau',
        'durchfuehrung',
        'beobachtung',
        ...(subjectId === 'physik' ? (['messwerte'] as AbschnittId[]) : []),
        'auswertung',
        ...(subjectId === 'physik' && fehler ? (['fehler'] as AbschnittId[]) : []),
        'ergebnis',
        ...(chemie ? (['entsorgung'] as AbschnittId[]) : [])
      ]
  }
}

export const ALLE_ABSCHNITTE = Object.keys(ABSCHNITTE) as AbschnittId[]
export const abschnittTitel = (id: AbschnittId, art: ProtokollArt): string => TITEL_JE_ART[art]?.[id] ?? ABSCHNITTE[id].titel

// ---------- Sicherheit ----------

export const GHS: { id: GhsId; name: string; bedeutung: string }[] = [
  { id: 'GHS01', name: 'Explodierende Bombe', bedeutung: 'explosiv' },
  { id: 'GHS02', name: 'Flamme', bedeutung: 'entzündbar' },
  { id: 'GHS03', name: 'Flamme über Kreis', bedeutung: 'brandfördernd (oxidierend)' },
  { id: 'GHS04', name: 'Gasflasche', bedeutung: 'Gas unter Druck' },
  { id: 'GHS05', name: 'Ätzwirkung', bedeutung: 'ätzend' },
  { id: 'GHS06', name: 'Totenkopf', bedeutung: 'giftig' },
  { id: 'GHS07', name: 'Ausrufezeichen', bedeutung: 'gesundheitsschädlich, reizend' },
  { id: 'GHS08', name: 'Gesundheitsgefahr', bedeutung: 'schwere Gesundheitsschäden' },
  { id: 'GHS09', name: 'Umwelt', bedeutung: 'umweltgefährlich' }
]
const GHS_IDS = GHS.map((g) => g.id)

export const SCHUTZMASSNAHMEN: { id: string; label: string }[] = [
  { id: 'brille', label: 'Schutzbrille' },
  { id: 'handschuhe', label: 'Schutzhandschuhe' },
  { id: 'kittel', label: 'Laborkittel' },
  { id: 'abzug', label: 'Abzug' },
  { id: 'lueften', label: 'Lüften' },
  { id: 'haare', label: 'Lange Haare zusammenbinden' },
  { id: 'brandschutz', label: 'Brandschutz (Löschdecke, Sand bereit)' },
  { id: 'kleinmengen', label: 'Nur kleine Mengen' },
  { id: 'essen', label: 'Nicht essen, trinken, kosten' }
]

/** GESTIS-Stoffdatenbank der DGUV – zum Prüfen der Angaben der KI */
export const GESTIS_URL = 'https://gestis.dguv.de/'
export const SICHERHEIT_HINWEIS =
  'Sicherheitsangaben der KI – vor dem Einsatz prüfen (GESTIS-Stoffdatenbank, Sicherheitsdatenblatt). Die Gefährdungsbeurteilung nach RiSU erstellt die Lehrkraft.'

// ---------- Checkliste und Raster ----------

export function checklisteFuer(abschnitte: AbschnittId[], art: ProtokollArt): string[] {
  const hat = (id: AbschnittId): boolean => abschnitte.includes(id)
  return [
    hat('kopf') ? 'Überschrift, Datum und Name stehen oben.' : '',
    hat('frage') ? 'Die Fragestellung ist als Frage formuliert.' : '',
    hat('vermutung') ? 'Die Vermutung ist begründet.' : '',
    hat('aufbau') ? (art === 'mikroskopie' ? 'Die Zeichnung ist mit Bleistift, beschriftet und mit Vergrößerung.' : 'Die Skizze ist beschriftet.') : '',
    hat('durchfuehrung') ? 'Die Durchführung ist so beschrieben, dass jemand anderes den Versuch wiederholen kann.' : '',
    hat('beobachtung') ? 'Bei der Beobachtung steht nur, was wahrgenommen oder gemessen wurde – noch keine Erklärung.' : '',
    hat('messwerte') ? 'Alle Messwerte stehen mit Einheit in der Tabelle.' : '',
    hat('diagramm') ? 'Die Achsen im Diagramm tragen Größe und Einheit.' : '',
    hat('auswertung') ? 'Die Deutung erklärt jede Beobachtung.' : '',
    hat('fehler') ? 'Die Fehlerquellen sind konkret benannt.' : '',
    hat('ergebnis') ? 'Das Ergebnis beantwortet die Fragestellung und vergleicht mit der Vermutung.' : ''
  ].filter(Boolean)
}

/** Bewertungsraster (Recherche 6.3, abgeleitet aus chemie.schule-Bogen und KMK AHR Chemie 3.2.1.3) */
export function rasterFuer(abschnitte: AbschnittId[]): { kriterium: string; erwartung: string }[] {
  const hat = (id: AbschnittId): boolean => abschnitte.includes(id)
  return [
    { kriterium: 'Vollständigkeit', erwartung: 'Alle Abschnitte vorhanden, Kopf mit Datum und Namen' },
    hat('frage') || hat('vermutung') ? { kriterium: 'Fragestellung und Vermutung', erwartung: 'Klar formuliert; Vermutung begründet (ab Sek I)' } : null,
    hat('material') || hat('chemikalien') ? { kriterium: 'Material und Stoffe', erwartung: 'Vollständig, mit Mengen; Gefahren und Schutzmaßnahmen richtig' } : null,
    hat('aufbau') ? { kriterium: 'Skizze', erwartung: 'Beschriftet, sauber; Schnittzeichnung bzw. Schaltplan fachgerecht' } : null,
    hat('durchfuehrung') ? { kriterium: 'Durchführung', erwartung: 'Nachvollziehbar und wiederholbar, richtige Reihenfolge, keine Beobachtungen' } : null,
    hat('beobachtung') || hat('messwerte') ? { kriterium: 'Beobachtung und Messwerte', erwartung: 'Nur Wahrnehmbares bzw. Gemessenes; Tabelle mit Größen und Einheiten' } : null,
    hat('auswertung') ? { kriterium: 'Auswertung und Deutung', erwartung: 'Bezug zu jeder Beobachtung; Fachbegriffe; Reaktionsgleichung bzw. Rechnung' } : null,
    hat('ergebnis') ? { kriterium: 'Ergebnis', erwartung: 'Antwort auf die Fragestellung; Vermutung bestätigt oder widerlegt' } : null,
    hat('fehler') ? { kriterium: 'Fehlerbetrachtung', erwartung: 'Konkrete Fehlerquellen statt Pauschalbegriffe' } : null,
    { kriterium: 'Sprache und Form', erwartung: 'Einheitliche Zeitform, sachlich, Fachsprache, übersichtlich' }
  ].filter((x): x is { kriterium: string; erwartung: string } => Boolean(x))
}

// ---------- Protokoll bauen ----------

export interface ProtokollOptionen {
  art: ProtokollArt
  stufe: ProtokollStufe
  stil: ProtokollStil
  subjectId: string
  grade: number
  abschnitte?: AbschnittId[]
  daten?: VersuchDaten
  checkliste?: boolean
  raster?: boolean
  /** Lernzielkontrolle: keine Leitfragen und Satzanfänge (außer mit Nachteilsausgleich) */
  ohneHilfen?: boolean
}

const liste = (xs: string[]): string => xs.filter(Boolean).map((x) => `- ${x}`).join('\n')
const nummeriert = (xs: string[]): string => xs.filter(Boolean).map((x, i) => `${i + 1}. ${x}`).join('\n')

/** Messtabelle: Spalten aus den Messgrößen (mindestens zwei) */
function messSpalten(d: VersuchDaten | undefined, art: ProtokollArt): string[] {
  if (art === 'test') return ['Testfall / Eingabe', 'Erwartetes Ergebnis', 'Tatsächliches Ergebnis', 'bestanden?']
  const g = d?.messgroessen?.filter(Boolean) ?? []
  return g.length >= 2 ? g : g.length === 1 ? ['Nr.', g[0]] : ['Größe 1 (Einheit)', 'Größe 2 (Einheit)']
}

export function protokollBauen(o: ProtokollOptionen): ProtokollInhalt {
  const ids = o.abschnitte?.length ? o.abschnitte : abschnittVorschlag(o.art, o.subjectId, o.grade)
  const d = o.daten
  const hilfen = !o.ohneHilfen && (o.stufe === 'forscher' || o.stufe === 'vorstrukturiert' || o.stufe === 'luecken' || o.stufe === 'planen')
  // Was die App vorgibt, statt es schreiben zu lassen
  const vorgegeben = (id: AbschnittId): string | undefined => {
    if (!d) return undefined
    const vorstruktur = o.stufe === 'vorstrukturiert' || o.stufe === 'luecken'
    switch (id) {
      case 'frage':
        return o.stufe === 'forscher' ? undefined : d.frage
      case 'material':
        return vorstruktur || o.stufe === 'forscher' ? liste(d.geraete) : o.stufe === 'planen' ? `Verfügbar:\n${liste(d.geraete)}` : undefined
      case 'durchfuehrung':
        return vorstruktur ? nummeriert(d.durchfuehrung) : undefined
      case 'beobachtung':
        return o.stufe === 'luecken' ? d.lueckenBeobachtung : undefined
      case 'auswertung':
        return o.stufe === 'luecken' ? d.lueckenDeutung : undefined
      case 'entsorgung':
        // Die Entsorgung gibt die Lehrkraft vor – sie ist keine Leistung der Lernenden
        return d.entsorgung
      default:
        return undefined
    }
  }
  const musterVon = (id: AbschnittId): string | undefined => {
    if (!d) return undefined
    switch (id) {
      case 'frage':
        return d.frage
      case 'vermutung':
        return d.vermutung
      case 'material':
        return liste(d.geraete)
      case 'aufbau':
        return d.aufbau
      case 'durchfuehrung':
        return nummeriert(d.durchfuehrung)
      case 'beobachtung':
        return d.beobachtung
      case 'auswertung':
        return [d.deutung, d.gleichung].filter(Boolean).join('\n')
      case 'fehler':
        return liste(d.fehlerquellen)
      case 'ergebnis':
        return d.ergebnis
      case 'entsorgung':
        return d.entsorgung
      default:
        return undefined
    }
  }
  const abschnitte: ProtokollAbschnitt[] = ids.map((id) => {
    const info = ABSCHNITTE[id]
    const vorgabe = vorgegeben(id)
    const satz = info.satz[o.stil] ?? []
    const a: ProtokollAbschnitt = {
      id,
      titel: abschnittTitel(id, o.art),
      form: id === 'messwerte' ? 'tabelle' : info.form,
      ...(hilfen && info.leitfrage ? { leitfrage: o.art === 'mikroskopie' && id === 'aufbau' ? MIKRO_LEITFRAGE : info.leitfrage } : {}),
      ...(hilfen && satz.length && !vorgabe ? { satzanfaenge: satz } : {}),
      ...(vorgabe ? { vorgabe } : {}),
      ...(info.zeilen ? { zeilen: vorgabe && id !== 'beobachtung' && id !== 'auswertung' ? 0 : info.zeilen } : {}),
      ...(info.hoeheMm ? { hoeheMm: info.hoeheMm } : {}),
      ...(id === 'messwerte' ? { spalten: messSpalten(d, o.art), tabellenZeilen: 6 } : {}),
      ...(musterVon(id) ? { muster: musterVon(id) } : {})
    }
    // Die Skizze darf bei der Mikroskopie größer sein (etwa eine halbe Seite)
    if (id === 'aufbau' && o.art === 'mikroskopie') a.hoeheMm = 110
    return a
  })
  const chemikalien = ids.includes('chemikalien') || ids.includes('sicherheit') ? (d?.chemikalien ?? []) : []
  return {
    title: d?.titel ? `${artInfo(o.art).label}: ${d.titel}` : artInfo(o.art).label,
    art: o.art,
    stufe: o.stufe,
    stil: o.stil,
    abschnitte,
    ...(chemikalien.length ? { chemikalien } : {}),
    ...(ids.includes('sicherheit') || ids.includes('chemikalien') ? { schutz: d?.schutz ?? [] } : {}),
    ...(d?.entsorgung ? { entsorgung: d.entsorgung } : {}),
    ...(d?.sicherheitZuPruefen && (chemikalien.length || d.schutz.length) ? { sicherheitZuPruefen: true } : {}),
    ...(o.checkliste !== false ? { checkliste: checklisteFuer(ids, o.art) } : {}),
    ...(o.raster !== false ? { raster: rasterFuer(ids) } : {})
  }
}

/** Voreinstellung für eine Lerngruppe (Karte „Versuch" und Baustein im Editor) */
export function versuchVorgabe(meta: Pick<WorksheetMeta, 'subjectId' | 'grade'>, fachschaftStil?: ProtokollStil | ''): VersuchSetup {
  const art = artenFuer(meta.subjectId, meta.grade)[0]
  return {
    aktiv: true,
    art,
    stufe: stufeVorschlag(meta.grade, art),
    stil: stilVorschlag(meta.grade, fachschaftStil),
    quelle: 'ki',
    beschreibung: '',
    checkliste: true,
    raster: true
  }
}

/** Leeres Protokoll für den Editor („Baustein einfügen") */
export function leeresProtokoll(meta: Pick<WorksheetMeta, 'subjectId' | 'grade'>, fachschaftStil?: ProtokollStil | ''): ProtokollInhalt {
  const v = versuchVorgabe(meta, fachschaftStil)
  return protokollBauen({ ...v, subjectId: meta.subjectId, grade: meta.grade })
}

/** Das Protokoll aus der Einstellung der Karte „Versuch" */
export function protokollAusVersuch(meta: WorksheetMeta, ohneHilfen = false): ProtokollInhalt | null {
  const v = meta.versuch
  if (!v?.aktiv) return null
  return protokollBauen({ ...v, subjectId: meta.subjectId, grade: meta.grade, ohneHilfen })
}

/** Versuchsanleitung als Material (Stufe „offene Vorlage") */
export function anleitungAlsText(d: VersuchDaten): Omit<TextBlock, 'id'> {
  const teile = [
    d.frage ? `Fragestellung: ${d.frage}` : '',
    d.geraete.length ? `Material:\n${liste(d.geraete)}` : '',
    d.chemikalien.length ? `Chemikalien:\n${liste(d.chemikalien.map((c) => [c.name, c.menge].filter(Boolean).join(', ')))}` : '',
    d.durchfuehrung.length ? `Durchführung:\n${nummeriert(d.durchfuehrung)}` : ''
  ].filter(Boolean)
  return { type: 'text', title: `Versuchsanleitung: ${d.titel}`, body: teile.join('\n\n'), lineNumbers: false, source: '', glossary: [], ref: 'anleitung' }
}

/**
 * Setzt das Protokoll in ein fertig ausformuliertes Blatt ein – die APP, nicht die KI (wie beim
 * Originaltext in generate.ts: Die KI würde Angaben „übernehmen" und dabei ändern). Die KI hat
 * nur die Stelle geplant (Baustein „protocol" ohne Inhalt). Fehlt der Baustein, steht das
 * Protokoll vor der ersten Aufgabe. Bei der offenen Vorlage kommt die Versuchsanleitung als
 * Material davor.
 */
export function setzeVersuchEin(sheet: Sheet, meta: WorksheetMeta, ohneHilfen = false): Sheet {
  const inhalt = protokollAusVersuch(meta, ohneHilfen)
  if (!inhalt) {
    // Ohne Versuch: Platzhalter der KI bekommen die Vorlage für Fach und Jahrgang
    if (!sheet.blocks.some((b) => b.type === 'protocol' && !b.abschnitte.length)) return sheet
    const vorlage = protokollBauen({ ...versuchVorgabe(meta), subjectId: meta.subjectId, grade: meta.grade, ohneHilfen })
    return {
      ...sheet,
      blocks: sheet.blocks.map((b) => (b.type === 'protocol' && !b.abschnitte.length ? { ...vorlage, id: b.id, type: 'protocol', title: b.title || vorlage.title } : b))
    }
  }
  let blocks: WsBlock[] = [...sheet.blocks]
  let stelle = blocks.findIndex((b) => b.type === 'protocol')
  if (stelle < 0) {
    const ersteAufgabe = blocks.findIndex((b) => b.type === 'task')
    stelle = ersteAufgabe < 0 ? blocks.length : ersteAufgabe
    blocks.splice(stelle, 0, { id: newId(), type: 'protocol', ...inhalt })
  } else {
    const alt = blocks[stelle]
    blocks[stelle] = { ...inhalt, id: alt.id, type: 'protocol', ...(alt.stars ? { stars: alt.stars } : {}) }
    // Weitere Protokoll-Platzhalter der KI entfallen – ein Versuch, ein Protokoll
    blocks = blocks.filter((b, i) => b.type !== 'protocol' || i === stelle || (b.type === 'protocol' && b.abschnitte.length > 0))
  }
  const d = meta.versuch?.daten
  if (d && meta.versuch?.stufe === 'offen' && !blocks.some((b) => b.type === 'text' && b.ref === 'anleitung')) {
    const i = blocks.findIndex((b) => b.type === 'protocol')
    blocks.splice(i, 0, { id: newId(), ...anleitungAlsText(d) })
  }
  return { ...sheet, blocks }
}

// ---------- KI: Versuch ausarbeiten ----------

const CHEMIKALIE = obj({
  name: str('Stoffname (bei Lösungen mit Konzentration)'),
  menge: str('Menge, z. B. „5 ml", „1 Spatelspitze"'),
  ghs: arr(enumOf(GHS_IDS), 'GHS-Piktogramme dieses Stoffes in der verwendeten Konzentration'),
  signalwort: enumOf(['Gefahr', 'Achtung', '']),
  hSaetze: str('H-Sätze als Nummern, z. B. „H225, H319"'),
  pSaetze: str('P-Sätze als Nummern, z. B. „P210, P280"')
})

const VERSUCH_SCHEMA = obj({
  titel: str('Kurzer Titel des Versuchs'),
  frage: str('Fragestellung als Frage'),
  vermutung: str('Erwartete, begründete Vermutung (für den Lösungsteil)'),
  geraete: arr(str('Gerät bzw. Material mit Anzahl/Größe')),
  chemikalien: arr(CHEMIKALIE),
  schutz: arr(enumOf(SCHUTZMASSNAHMEN.map((s) => s.id))),
  aufbau: str('Beschreibung des Aufbaus, so dass eine beschriftete Skizze danach gezeichnet werden kann'),
  durchfuehrung: arr(str('Ein Arbeitsschritt, im Anleitungsstil')),
  messgroessen: arr(str('Messgröße mit Formelzeichen und Einheit, z. B. „Zeit t in s" – leer, wenn nicht gemessen wird')),
  beobachtung: str('Erwartete Beobachtung – NUR Wahrnehmbares, keine Erklärung'),
  deutung: str('Deutung/Erklärung der Beobachtung, fachlich richtig, altersgerecht'),
  gleichung: str('Chemie: Wort- und Reaktionsgleichung; Physik: Formel/Gesetz; sonst leer'),
  ergebnis: str('Antwort auf die Fragestellung'),
  fehlerquellen: arr(str('Konkrete Fehlerquelle')),
  entsorgung: str('Entsorgung der Reste (Chemie/Biologie), sonst leer'),
  lueckenBeobachtung: str('Die erwartete Beobachtung als Lückentext: 3–6 Schlüsselwörter durch „___" ersetzt'),
  lueckenDeutung: str('Die Deutung als Lückentext: 3–6 Fachbegriffe durch „___" ersetzt'),
  wortspeicher: arr(str('Die fehlenden Wörter beider Lückentexte, alphabetisch')),
  lehrkraft: str('Hinweise nur für die Lehrkraft: Tätigkeitsbeschränkungen nach RiSU für diese Jahrgangsstufe, Schüler- oder Demonstrationsversuch, Stolperstellen, Zeitbedarf'),
  quelleWoertlich: str('Bei einer hineingezogenen Anleitung: „ja", wenn Material und Durchführung wörtlich übernommen wurden, sonst leer')
})

/** Was der Versuchsauftrag von der Lerngruppe braucht – Arbeitsblatt, Lernzielkontrolle und Klassenarbeit liefern es */
export interface VersuchLerngruppe {
  subjectId: string
  subjectLabel: string
  grade: number
  schoolTypeName: string
  topic: string
}

export function versuchAnfrage(meta: VersuchLerngruppe, setup: VersuchSetup): StructuredRequest {
  const art = artInfo(setup.art)
  const anleitung = setup.anleitung ?? []
  const bilder = anleitung.flatMap((a) => (a.text.trim() ? [] : (a.pageImages ?? []))).slice(0, 6)
  const quelle =
    setup.quelle === 'datei' && anleitung.length
      ? [
          'Grundlage ist diese Versuchsanleitung der Lehrkraft. Übernimm Titel, Material, Chemikalien und Durchführung WÖRTLICH bzw. so nah wie möglich; ergänze nur, was fehlt, und nenne Ergänzungen im Lehrkraft-Hinweis.',
          ...anleitung.map((a) => (a.text.trim() ? `--- ${a.fileName} ---\n${a.text.slice(0, 15000)}` : `--- ${a.fileName}: als Bild beigefügt ---`))
        ].join('\n')
      : setup.quelle === 'beschreibung' && setup.beschreibung.trim()
        ? `Grundlage ist diese Beschreibung der Lehrkraft (verbindlich; nur Fehlendes ergänzen, Ergänzungen im Lehrkraft-Hinweis nennen):\n${setup.beschreibung.trim()}`
        : `Schlage einen bewährten, schulgeeigneten Standardversuch zum Thema „${meta.topic}" vor${setup.beschreibung.trim() ? ` (Wunsch der Lehrkraft: ${setup.beschreibung.trim()})` : ''}.`
  return {
    system: `Du bist eine erfahrene Lehrkraft für ${meta.subjectLabel} und planst Schülerversuche nach der Richtlinie zur Sicherheit im Unterricht (RiSU). Du erfindest keine Stoffdaten: Wo du unsicher bist, lässt du GHS-Symbole und H-/P-Sätze weg und schreibst es in den Lehrkraft-Hinweis.`,
    user: [
      `Arbeite einen Versuch für ein ${art.label} aus: ${meta.subjectLabel}, Klasse ${meta.grade}, ${meta.schoolTypeName || 'Sekundarstufe'}, Thema „${meta.topic}".`,
      quelle,
      'REGELN:',
      '- Nur Versuche, die für diese Jahrgangsstufe als Schülerversuch zulässig sind (RiSU-Tätigkeitsbeschränkungen); sonst als Demonstrationsversuch kennzeichnen (Lehrkraft-Hinweis).',
      '- Beobachtung und Deutung strikt trennen: Die Beobachtung nennt nur Wahrnehmbares oder Gemessenes.',
      '- Durchführung in klaren, nummerierbaren Einzelschritten; Mengen und Zeiten konkret.',
      setup.art === 'messung' || meta.subjectId === 'physik' ? '- Messgrößen mit Formelzeichen und Einheit angeben.' : '',
      meta.grade <= 4 ? '- Grundschule: nur Alltagsmaterialien, keine Gefahrstoffe, keine offene Flamme.' : '',
      '- Sicherheitsangaben (GHS, H-/P-Sätze, Schutzmaßnahmen, Entsorgung) nach bestem Wissen – sie werden der Lehrkraft als „zu prüfen" angezeigt.'
    ]
      .filter(Boolean)
      .join('\n'),
    ...(bilder.length ? { images: bilder } : {}),
    schemaName: 'versuch_ausarbeiten',
    schema: VERSUCH_SCHEMA
  }
}

export function versuchAus(daten: unknown): VersuchDaten {
  const d = (daten ?? {}) as Record<string, unknown>
  const t = (x: unknown): string => String(x ?? '').trim()
  const l = (x: unknown): string[] => (Array.isArray(x) ? x.map(t).filter(Boolean) : [])
  const titel = t(d.titel)
  if (!titel && !l(d.durchfuehrung).length) throw new Error('Die KI hat keinen Versuch geliefert.')
  const chemikalien: Chemikalie[] = (Array.isArray(d.chemikalien) ? d.chemikalien : [])
    .map((c) => (c ?? {}) as Record<string, unknown>)
    .filter((c) => t(c.name))
    .map((c) => ({
      name: t(c.name),
      ...(t(c.menge) ? { menge: t(c.menge) } : {}),
      ghs: l(c.ghs).filter((g): g is GhsId => (GHS_IDS as string[]).includes(g)),
      signalwort: (['Gefahr', 'Achtung'].includes(t(c.signalwort)) ? t(c.signalwort) : '') as Chemikalie['signalwort'],
      ...(t(c.hSaetze) ? { hSaetze: t(c.hSaetze) } : {}),
      ...(t(c.pSaetze) ? { pSaetze: t(c.pSaetze) } : {})
    }))
  const schutzIds = SCHUTZMASSNAHMEN.map((s) => s.id)
  return {
    titel: titel || 'Versuch',
    frage: t(d.frage),
    ...(t(d.vermutung) ? { vermutung: t(d.vermutung) } : {}),
    geraete: l(d.geraete),
    chemikalien,
    schutz: l(d.schutz).filter((s) => schutzIds.includes(s)),
    aufbau: t(d.aufbau),
    durchfuehrung: l(d.durchfuehrung),
    messgroessen: l(d.messgroessen),
    beobachtung: t(d.beobachtung),
    deutung: t(d.deutung),
    ...(t(d.gleichung) ? { gleichung: t(d.gleichung) } : {}),
    ergebnis: t(d.ergebnis),
    fehlerquellen: l(d.fehlerquellen),
    ...(t(d.entsorgung) ? { entsorgung: t(d.entsorgung) } : {}),
    ...(t(d.lueckenBeobachtung).includes('___') ? { lueckenBeobachtung: t(d.lueckenBeobachtung) } : {}),
    ...(t(d.lueckenDeutung).includes('___') ? { lueckenDeutung: t(d.lueckenDeutung) } : {}),
    ...(l(d.wortspeicher).length ? { wortspeicher: l(d.wortspeicher) } : {}),
    lehrkraft: t(d.lehrkraft),
    // Stoffdaten stammen immer von der KI – auch bei einer hineingezogenen Anleitung ergänzt sie womöglich
    sicherheitZuPruefen: true
  }
}

/** Regeln für Gliederung und Ausformulieren, wenn das Blatt zu einem Versuch gehört */
export function versuchRegeln(meta: WorksheetMeta): string {
  const v = meta.versuch
  if (!v?.aktiv) return ''
  const d = v.daten
  const art = artInfo(v.art)
  return [
    `VERSUCH MIT ${art.label.toUpperCase()} (verbindlich):`,
    d
      ? `- Versuch: „${d.titel}". Frage: ${d.frage}\n- Durchführung: ${d.durchfuehrung.join(' – ')}\n- Erwartete Beobachtung: ${d.beobachtung}\n- Deutung: ${d.deutung}${d.gleichung ? ` (${d.gleichung})` : ''}`
      : '- Der Versuch wird von der App ausgearbeitet.',
    `- Plane GENAU EINEN Baustein vom Typ „protocol" an der Stelle, an der der Versuch durchgeführt wird (nach Einstieg und Fragestellung, vor den Aufgaben zur Auswertung und Übertragung). Das Protokoll selbst setzt die App ein: Im Baustein nur einen kurzen Titel, sonst leere Felder.`,
    '- Die Aufgaben wiederholen die Protokollabschnitte NICHT (keine Aufgabe „Notiere deine Beobachtung"), sondern vertiefen: Deutung auf Teilchenebene bzw. mit Fachbegriffen, Übertragung auf Alltag oder einen neuen Fall, Fehlerquellen, Planung eines Folgeversuchs.',
    '- Beobachtung und Deutung werden überall getrennt.'
  ].join('\n')
}

/** Ein einzelner Abschnitt, nachträglich im Editor hinzugefügt (ohne Vorgabe und Muster) */
export function abschnittErzeugen(id: AbschnittId, art: ProtokollArt, stil: ProtokollStil, mitHilfen: boolean): ProtokollAbschnitt {
  const info = ABSCHNITTE[id]
  const satz = info.satz[stil] ?? []
  return {
    id,
    titel: abschnittTitel(id, art),
    form: info.form,
    ...(mitHilfen && info.leitfrage ? { leitfrage: art === 'mikroskopie' && id === 'aufbau' ? MIKRO_LEITFRAGE : info.leitfrage } : {}),
    ...(mitHilfen && satz.length ? { satzanfaenge: satz } : {}),
    ...(info.zeilen ? { zeilen: info.zeilen } : {}),
    ...(info.hoeheMm ? { hoeheMm: art === 'mikroskopie' && id === 'aufbau' ? 110 : info.hoeheMm } : {}),
    ...(id === 'messwerte' ? { spalten: messSpalten(undefined, art), tabellenZeilen: 6 } : {})
  }
}

/** Satzanfänge eines Abschnitts für einen anderen Stil (Umschalten im Editor) */
export const satzanfaengeFuer = (id: AbschnittId, stil: ProtokollStil): string[] => ABSCHNITTE[id].satz[stil] ?? []
export const leitfrageFuer = (id: AbschnittId, art: ProtokollArt): string => (art === 'mikroskopie' && id === 'aufbau' ? MIKRO_LEITFRAGE : ABSCHNITTE[id].leitfrage)

// ---------- Prüfungen (Lernzielkontrolle, Klassenarbeit) ----------

/**
 * Regeln für Prüfungsblätter: Die KI plant EINE Aufgabe mit Operator „protokollieren" (mit
 * Punkten), die App setzt die Protokollvorlage direkt dahinter als Antwortfläche. So bleibt die
 * Bepunktung bei den Aufgaben, wie überall in Lernzielkontrolle und Klassenarbeit.
 */
export function pruefungsVersuchRegeln(v: VersuchSetup | undefined): string {
  if (!v?.aktiv) return ''
  const d = v.daten
  return [
    `VERSUCH MIT ${artInfo(v.art).label.toUpperCase()} (verbindlich):`,
    d ? `- Versuch „${d.titel}". Frage: ${d.frage}. Durchführung: ${d.durchfuehrung.join(' – ')}.` : '- Der Versuch wird von der App ausgearbeitet.',
    '- Plane GENAU EINE Aufgabe mit dem Operator „protokollieren" (answer.kind = "none", mit Punkten nach Umfang des Protokolls); die App setzt die Protokollvorlage direkt dahinter.',
    '- Weitere Aufgaben dürfen den Versuch auswerten (deuten, erklären, Fehlerquellen, Übertragung), wiederholen aber keine Protokollabschnitte.',
    '- Keine Lernhilfen im Protokoll (keine Leitfragen, keine Satzanfänge) – außer mit Nachteilsausgleich.'
  ].join('\n')
}

const istProtokollAufgabe = (b: WsBlock): boolean =>
  b.type === 'task' && (/protokoll/i.test(b.operator) || /protokoll/i.test(b.instruction))

/** Protokollvorlage hinter die Aufgabe „protokollieren" setzen (sonst hinter die erste Aufgabe) */
export function setzeProtokollInPruefung(
  blocks: WsBlock[],
  v: VersuchSetup | undefined,
  lg: Pick<VersuchLerngruppe, 'subjectId' | 'grade'>,
  ohneHilfen: boolean
): WsBlock[] {
  if (!v?.aktiv) return blocks
  const inhalt = protokollBauen({ ...v, subjectId: lg.subjectId, grade: lg.grade, ohneHilfen })
  const ohneAlte = blocks.filter((b) => b.type !== 'protocol')
  let i = ohneAlte.findIndex(istProtokollAufgabe)
  if (i < 0) i = ohneAlte.findIndex((b) => b.type === 'task')
  const stelle = i < 0 ? ohneAlte.length : i + 1
  const neu: WsBlock[] = [...ohneAlte]
  neu.splice(stelle, 0, { id: newId(), type: 'protocol', ...inhalt })
  if (v.daten && v.stufe === 'offen' && !neu.some((b) => b.type === 'text' && b.ref === 'anleitung')) neu.splice(Math.max(0, stelle - 1), 0, { id: newId(), ...anleitungAlsText(v.daten) })
  return neu
}
