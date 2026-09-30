/**
 * Einstiegsimpulse in der Verlaufsplanung (Wunsch der Lehrkraft, 01.10.2026).
 *
 * „Beim Erstellen eines Verlaufs durch die KI, wenn Bildimpulse z. B. als Einstieg genutzt werden
 * sollen: die KI nach einem konkreten Bild suchen oder selbst eines passend zum Lernziel entwerfen
 * lassen." Die didaktischen Regeln stammen aus der Recherche recherche/einstiegsimpulse-2026-10-01.md:
 *
 * - Der Einstieg hat eine Funktion (Interesse, Problem sichtbar machen, Vorwissen aktivieren) und
 *   mündet in EINE Leitfrage, die festgehalten und in der Sicherung beantwortet wird.
 * - Die Impulsart folgt Fach, Lernziel und Jahrgang – kein Bild um des Bildes willen.
 * - Bildimpulse: ein klares Motiv, offen/irritierend genug für Fragen, ohne Vorwissen beschreibbar,
 *   altersgerecht, keine Schockbilder; Ablauf Wahrnehmen – Beschreiben – Deuten – Frage entwickeln.
 * - Quellen: historische Bilder und Zitate nur echt und mit Quellenangabe; KI-Bilder gekennzeichnet.
 *
 * Diese Datei ist ohne Oberfläche und ohne KI prüfbar (tests/einstiegsimpuls.test.ts). Die
 * Bildbeschaffung (Suche → KI-Prüfung → KI-Entwurf) steht in impulsBild.ts.
 */
import type { ImageRef } from '../../modules/arbeitsblatt/model/types'
import { arr, bool, enumOf, obj, str } from '../aiSchema'

/** Arten von Einstiegsimpulsen – mit Kennzeichen, ob ein Bild dazugehört */
export const IMPULS_ARTEN = {
  bild: { label: 'Bildimpuls', bild: true },
  karikatur: { label: 'Karikatur', bild: true },
  quellenbild: { label: 'Historisches Quellenbild', bild: true },
  zitat: { label: 'Zitat', bild: false },
  provokation: { label: 'Provokante These', bild: false },
  fallbeispiel: { label: 'Fallbeispiel / Dilemma', bild: false },
  experiment: { label: 'Experiment / Phänomen', bild: false },
  gegenstand: { label: 'Gegenstand (Realie)', bild: false },
  raetsel: { label: 'Rätsel / Schätzfrage', bild: false },
  statistik: { label: 'Statistik / Diagramm', bild: false },
  video: { label: 'Video / Hörbeispiel', bild: false },
  wortimpuls: { label: 'Wort- oder Tafelimpuls', bild: false }
} as const

export type ImpulsArt = keyof typeof IMPULS_ARTEN

export const IMPULS_ART_LISTE = Object.keys(IMPULS_ARTEN) as ImpulsArt[]

/** Bildstil – entscheidet über Suche (echtes Werk?) und über den Entwurf der Bild-KI */
export type BildStil = 'foto' | 'zeichnung' | 'karikatur' | 'quelle'

/** Was die KI für das Bild eines Einstiegs plant */
export interface ImpulsBildAuftrag {
  /** Was zu sehen sein soll (deutsch, konkret) – Grundlage der Prüfung */
  motiv: string
  /** Englische Suchwörter für Wikimedia Commons / Openverse */
  suche: string
  /** Ein bestimmtes echtes Werk (historische Quelle, Karikatur): nie durch ein KI-Bild ersetzt */
  original: boolean
  /** Bei `original`: Urheber, Titel, Jahr */
  werk: string
  stil: BildStil
  /** Bildidee für die Bild-KI (englisch), falls kein freies Bild passt */
  entwurf: string
}

export interface Einstiegsimpuls {
  art: ImpulsArt
  /** Kurzer Name, z. B. „Foto: Kinderarbeit in einer Spinnerei (1908)" */
  titel: string
  /** Was die Lernenden sehen, hören oder erleben */
  beschreibung: string
  /** Wie der Impuls zum Stundenziel führt (ein Satz) */
  bezug?: string
  /** Leit- bzw. Problemfrage, auf die der Einstieg hinführt (an der Tafel festhalten) */
  leitfrage: string
  /** Erwartete Beiträge der Lernenden */
  erwartungen: string[]
  /** Überleitung zur Erarbeitung */
  ueberleitung: string
  /** Moderationsschritte der Lehrkraft (stummer Impuls, Denkzeit, Beschreiben – Deuten …) */
  moderation: string[]
  /** Bei Bildimpulsen: der Auftrag für Suche bzw. Entwurf */
  bild?: ImpulsBildAuftrag
  /** Bei Zitaten: Wortlaut und Quelle */
  zitat?: { text: string; quelle: string }
  /** Das beschaffte Bild (mit Nachweis bzw. KI-Kennzeichnung) */
  image?: ImageRef
  /** Seitenverhältnis (Breite/Höhe) – für Word und Folie */
  bildFormat?: number
  /** Hinweis zur Bildwahl für die Lehrkraft */
  bildHinweis?: string
  /** Schon gezeigte Bilder – „Anderes Bild" schließt sie aus */
  gesehen?: string[]
}

/** Braucht dieser Impuls ein Bild? */
export const brauchtBild = (i: Pick<Einstiegsimpuls, 'art' | 'bild'> | undefined): boolean => Boolean(i && IMPULS_ARTEN[i.art]?.bild && i.bild?.motiv.trim())

/** Lerngruppe und Stunde – so viel braucht die Planung des Einstiegs */
export interface ImpulsMeta {
  subjectId: string
  subjectLabel: string
  grade: number
  topic: string
  learningGoals?: string
}

const GESCHICHTE = /geschichte|history/i
const FREMDSPRACHE = /englisch|franz|spanisch|latein|italien|russisch|niederl|tuerk|türk|polnisch|chinesisch|griechisch|japan|portug/i
const NAWI = /physik|chemie|biologie|nawi|naturwiss|sachunterricht|technik/i
const MATHE = /mathe/i
const DEUTSCH = /deutsch/i
const ERDKUNDE = /erdkunde|geograf|geograph/i

const RELIGION = /religion|ethik|philosophie|werte/i
const POLITIK = /politik|sozial|gesellschaft|wirtschaft/i
const KUNST = /kunst/i

/** Fachspezifische Empfehlung für den Einstieg – ein Satz für den Auftrag an die KI (Recherche, Regel 5) */
export function fachEmpfehlung(m: Pick<ImpulsMeta, 'subjectId' | 'subjectLabel' | 'grade'>): string {
  const fach = `${m.subjectId} ${m.subjectLabel}`
  if (GESCHICHTE.test(fach))
    return 'Geschichte: bevorzugt eine echte historische Bildquelle oder zeitgenössische Karikatur (Urheber, Titel, Jahr), sonst ein belegtes Zitat – als Quelle bzw. Darstellung kennzeichnen; im Einstieg Beschreiben und erste Deutung, die volle Analyse (Beschreiben – Analysieren – Deuten) gehört in die Erarbeitung.'
  if (FREMDSPRACHE.test(fach))
    return 'Fremdsprache: Bildimpuls in der Zielsprache (picture description, prediction: „What might happen next?"), nötigen Wortschatz vorentlasten; einsprachig moderieren.'
  if (NAWI.test(fach))
    return 'Naturwissenschaften: ein Phänomen oder Experiment mit überraschendem Ausgang (discrepant event) oder ein Alltagsfoto; die Lernenden stellen Vermutungen/Hypothesen auf, die in der Stunde geprüft werden.'
  if (MATHE.test(fach)) return 'Mathematik: eine Alltagssituation, Schätzfrage (Fermi-Frage) oder ein Rätsel, dessen Lösung das neue Verfahren braucht.'
  if (DEUTSCH.test(fach)) return 'Deutsch: Bild, Buchcover oder Zitat als Sprech- und Schreibanlass; Erwartungen an den Text aufbauen.'
  if (ERDKUNDE.test(fach))
    return 'Erdkunde: ein aussagekräftiges Foto eines Raumes, eine Karte oder eine Statistik mit Widerspruch; verorten, beschreiben, erklären.'
  if (POLITIK.test(fach))
    return 'Politik/Wirtschaft: Karikatur, Dilemma, Fallbeispiel oder provokante These, zu der die Lernenden Stellung beziehen – kontrovers und nicht überwältigend (Beutelsbacher Konsens).'
  if (RELIGION.test(fach)) return 'Religion/Ethik: Kunstwerk, Symbol, Lebensfrage oder Dilemma, das zum Nachdenken und Stellungnehmen einlädt.'
  if (KUNST.test(fach)) return 'Kunst: ein Werkdetail oder ein Werkvergleich, zunächst genau wahrnehmen und beschreiben.'
  if (m.grade <= 4) return 'Grundschule: ein Gegenstand, ein Bild oder eine kurze Erzählung, konkret und anschaulich (3–5 Minuten).'
  return 'Die Impulsart passt zum Lernziel; ein Bild nur, wenn sein Inhalt direkt zur Leitfrage führt.'
}

/** Längster sinnvoller Einstieg: 5–10 Minuten bei 45, höchstens 15 bei 90, nie über 20 % der Stunde (Grundschule 3–5) */
export function einstiegMaxMinuten(dauer: number, grade = 7): number {
  if (grade <= 4) return 5
  return Math.max(5, Math.min(dauer >= 90 ? 15 : 10, Math.floor(dauer * 0.2)))
}

/** Die Regeln für den Einstieg im Auftrag an die KI (recherche/einstiegsimpulse-2026-10-01.md, Umsetzungsregeln) */
export function impulsRegeln(m: ImpulsMeta, dauer: number): string {
  const max = einstiegMaxMinuten(dauer, m.grade)
  return [
    'EINSTIEG (didaktische Regeln, genau einhalten – das Feld „einstieg" beschreibt den Impuls der Einstiegsphase):',
    '- Funktion: Der Einstieg weckt Interesse, macht ein Problem sichtbar und aktiviert Vorwissen. Er mündet in EINE Leitfrage (Problemfrage) – eine echte, schülernahe Frage mit „?" –, die an der Tafel festgehalten und in der Sicherung ausdrücklich wieder aufgegriffen wird.',
    `- Impulsart passend zu Fach, Lernziel und Jahrgang (Klasse ${m.grade}) wählen: ${fachEmpfehlung(m)}`,
    '- Nach Lernziel: Vorwissen aktivieren → Wortimpuls oder Bild; Problem entdecken → Widerspruch, Phänomen, Karikatur; Urteilen → Dilemma oder These; Hypothesen bilden → Experiment, Cover, Vorhersage.',
    m.grade <= 6
      ? '- Jüngere Lernende: konkret und gegenständlich (Bild, Gegenstand, Rätsel), klare Aufträge; Karikaturen nur mit bekannten Symbolen und Hilfen.'
      : m.grade >= 11
        ? '- Oberstufe: auch abstraktere Impulse (Zitat, These, Statistik, mehrdeutige Karikatur), Deutung und Problematisierung stärker.'
        : '- Mittelstufe: Irritation und Widerspruch nutzen; Karikaturen mit bekannten Symbolen.',
    '- Kein Impuls um des Effekts willen: „bezug" sagt in einem Satz, wie der Impuls zum Stundenziel führt. Der Impuls nimmt die Antwort nicht vorweg.',
    '- Bildimpuls („bild", „karikatur", „quellenbild"): ein klares Hauptmotiv, mehrdeutig oder irritierend genug, dass Fragen entstehen, ohne Vorwissen beschreibbar, altersgerecht, auf dem Beamer gut erkennbar. Keine Schock- oder Opferbilder als Effekt, keine realen Privatpersonen, niemand wird bloßgestellt; politische Bilder nicht einseitig.',
    '- Ablauf bei Bildimpulsen: Bild zunächst ohne Kommentar zeigen (stummer Impuls, 30–60 Sekunden), dann Wahrnehmen – Beschreiben – Deuten (mit Begründung am Bild) – Frage entwickeln – Leitfrage festhalten – Überleitung. Beschreiben kommt immer vor Deuten. Bei Deutungs- und Urteilsfragen verkürztes Think-Pair-Share.',
    '- „moderation": mindestens ein nonverbaler oder offener Impuls („Beschreibt …", „Was fällt auf?"), Wartezeit von mindestens drei Sekunden, keine Ja/Nein- oder Kettenfragen, kein Lehrer-Echo; Vermutungen sichtbar an der Tafel sammeln.',
    '- „erwartungen": drei bis fünf realistische Beiträge der Lernenden, auch unvollständige oder falsche (Fehlvorstellungen), jeweils mit der geplanten Reaktion nach „→".',
    `- Dauer der Einstiegsphase 5–${max} Minuten (nie über 20 % der Stunde); die Überleitung ist ein ausformulierter Satz, der Leitfrage und Arbeitsauftrag der Erarbeitung verbindet (M1, Aufgabe 1 …).`,
    '- Zitat: nur echte, belegbare Zitate mit Quelle (Urheber, Werk/Rede, Jahr). Im Zweifel als These statt als Zitat formulieren – nie ein Zitat oder eine Quelle erfinden.',
    '- „bild.original" = true nur für ein bestimmtes echtes Werk (historische Quelle, Karikatur, berühmtes Foto); dann „bild.werk" mit Urheber, Titel und Jahr und „bild.suche" mit Urheber und Titel. Ist kein reales Werk sicher bekannt: original false und ein allgemeines Motiv.',
    '- „bild.suche": 2–5 englische Suchwörter für das Kernmotiv (Wikimedia Commons). „bild.entwurf": eine englische Bildidee für eine Bild-KI, falls kein freies Bild passt (Szene, Blickwinkel, Stil, ohne Schrift).',
    '- Kein Bildimpuls: „bild" mit leeren Feldern, stil „foto", original false. Kein Zitat: „zitat" mit leeren Feldern.',
    '- Die Einstiegsphase in „phasen" nennt den Impuls knapp („Bildimpuls: …, stummer Impuls · Beschreiben/Deuten · Leitfrage festhalten") und bei „medien" das Medium (Beamer/Folie, Tafel).'
  ]
    .filter(Boolean)
    .join('\n')
}

/** Schema des Einstiegs in der Antwort der KI (strict: alle Felder Pflicht) */
export const EINSTIEG_SCHEMA = obj({
  art: enumOf(IMPULS_ART_LISTE),
  titel: str('Kurzer Name des Impulses, z. B. „Foto: Kinderarbeit in einer Spinnerei (1908)"'),
  beschreibung: str('Was die Lernenden sehen, hören oder erleben – konkret, ein bis zwei Sätze'),
  bezug: str('Ein Satz: wie der Impuls zum Stundenziel führt'),
  leitfrage: str('Leit- bzw. Problemfrage (endet mit „?"), auf die der Einstieg hinführt und die festgehalten wird'),
  erwartungen: arr(str(), 'Drei bis fünf erwartete Beiträge der Lernenden, auch Fehlvorstellungen, je mit geplanter Reaktion nach „→"'),
  ueberleitung: str('Ein Satz: Überleitung zur Erarbeitung mit Bezug auf das Material'),
  moderation: arr(
    str(),
    'Drei bis fünf knappe Moderationsschritte der Lehrkraft in Ablaufreihenfolge (Impuls, Denkzeit, Sozialform, Sammeln, Leitfrage festhalten)'
  ),
  bild: obj({
    motiv: str('Was das Bild zeigen soll (deutsch, konkret); leer, wenn kein Bildimpuls'),
    suche: str('2–5 englische Suchwörter für das Kernmotiv; leer, wenn kein Bildimpuls'),
    original: bool('true nur für ein bestimmtes echtes Werk (historische Quelle, Karikatur)'),
    werk: str('Bei original: Urheber, Titel, Jahr – sonst leer'),
    stil: enumOf(['foto', 'zeichnung', 'karikatur', 'quelle']),
    entwurf: str('Englische Bildidee für eine Bild-KI (Szene, Blickwinkel, Stil, ohne Schrift); leer, wenn kein Bildimpuls')
  }),
  zitat: obj({ text: str('Wortlaut des Zitats; leer, wenn kein Zitat'), quelle: str('Urheber, Werk/Rede, Jahr; leer, wenn kein Zitat') })
})

const text = (x: unknown): string => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '')
const liste = (x: unknown, max: number): string[] => (Array.isArray(x) ? x.map(text).filter(Boolean).slice(0, max) : [])

/** Antwort der KI → Einstiegsimpuls (oder nichts, wenn die Angaben fehlen) */
export function impulsAus(daten: unknown): Einstiegsimpuls | undefined {
  const d = (daten ?? {}) as Record<string, unknown>
  const art = (IMPULS_ART_LISTE as string[]).includes(String(d.art)) ? (d.art as ImpulsArt) : undefined
  const leitfrage = text(d.leitfrage)
  const beschreibung = text(d.beschreibung)
  if (!art || (!leitfrage && !beschreibung)) return undefined
  const b = (d.bild ?? {}) as Record<string, unknown>
  const z = (d.zitat ?? {}) as Record<string, unknown>
  const stil =
    (['foto', 'zeichnung', 'karikatur', 'quelle'] as const).find((s) => s === b.stil) ??
    (art === 'karikatur' ? 'karikatur' : art === 'quellenbild' ? 'quelle' : 'foto')
  const bild: ImpulsBildAuftrag | undefined =
    IMPULS_ARTEN[art].bild && (text(b.motiv) || text(b.suche))
      ? {
          motiv: text(b.motiv) || beschreibung,
          suche: text(b.suche) || text(b.werk),
          // Ein Quellenbild ist immer ein echtes Werk
          original: b.original === true || art === 'quellenbild',
          werk: text(b.werk),
          stil,
          entwurf: text(b.entwurf)
        }
      : undefined
  const zitat = text(z.text) ? { text: text(z.text), quelle: text(z.quelle) } : undefined
  return {
    art,
    titel: text(d.titel) || IMPULS_ARTEN[art].label,
    beschreibung,
    ...(text(d.bezug) ? { bezug: text(d.bezug) } : {}),
    leitfrage,
    erwartungen: liste(d.erwartungen, 5),
    ueberleitung: text(d.ueberleitung),
    moderation: liste(d.moderation, 6),
    ...(bild ? { bild } : {}),
    ...(zitat ? { zitat } : {})
  }
}

/** Hinweise der App zu einem Impuls (für die Lehrkraft) – ohne KI prüfbar */
export function impulsHinweise(i: Einstiegsimpuls, einstiegsMinuten?: number, dauer = 45, grade = 7): string[] {
  const h: string[] = []
  if (!i.leitfrage.trim()) h.push('Leitfrage fehlt – der Einstieg sollte in eine festgehaltene Problemfrage münden.')
  if (i.zitat && !i.zitat.quelle.trim()) h.push('Zitat ohne Quelle – vor dem Einsatz belegen oder als These formulieren.')
  if (i.zitat?.quelle.trim()) h.push('Zitat vor dem Einsatz am Original prüfen (Wortlaut, Quelle).')
  if (i.leitfrage.trim() && !i.leitfrage.trim().endsWith('?')) h.push('Die Leitfrage ist keine Frage – als echte Frage mit „?" festhalten.')
  const max = einstiegMaxMinuten(dauer, grade)
  if (einstiegsMinuten && einstiegsMinuten > max) h.push(`Einstieg mit ${einstiegsMinuten} Minuten recht lang – üblich sind höchstens ${max} Minuten.`)
  if (i.image?.source === 'ai' && i.bild?.original)
    h.push('KI-Entwurf statt historischer Quelle – im Unterricht ausdrücklich als nachgestellte Darstellung kennzeichnen.')
  return h
}

/** Kennzeichnung eines Impulsbildes (unter dem Bild, auf der Folie, in Word/PDF) */
export function bildKennzeichnung(image: Pick<ImageRef, 'source' | 'credit' | 'citation'> | undefined): string {
  if (!image) return ''
  if (image.source === 'ai') return 'KI-generiertes Bild (Entwurf der Bild-KI, kein reales Foto)'
  const c = image.citation
  if (c && (c.creator || c.title || c.license)) {
    const wer = c.creator ? c.creator : 'Urheber unbekannt'
    const was = [c.title, c.date].filter(Boolean).join(', ')
    return `Bildquelle: ${wer}${was ? `: ${was}` : ''}${c.license ? ` – ${c.license}` : ''}${c.repository ? `, ${c.repository}` : ''}${
      c.url ? ` (${c.url})` : ''
    }`
  }
  if (image.credit) return image.credit
  return image.source === 'own' ? 'Eigenes Bild' : ''
}

/**
 * Hinweis zur Nutzung nach Lizenz (Recherche, Regel 14): gemeinfrei/CC0 frei, CC mit Namensnennung
 * (TULLU), ND ohne Bearbeitung; unbekannte Lizenz nur im Unterricht (§ 60a UrhG), nicht veröffentlichen.
 */
export function lizenzHinweis(image: Pick<ImageRef, 'source' | 'credit' | 'citation'> | undefined): string {
  if (!image) return ''
  if (image.source === 'ai') return 'KI-Bild: beim Zeigen als KI-generiert kennzeichnen.'
  if (image.source === 'own') return 'Eigenes Bild: Rechte am Bild selbst prüfen.'
  const lizenz = `${image.citation?.license ?? ''} ${image.credit ?? ''}`
  if (/public domain|gemeinfrei|\bpd\b|pd-|cc0|cc 0/i.test(lizenz)) return 'Gemeinfrei bzw. CC0: frei nutzbar; Quellenangabe trotzdem nennen.'
  if (/-nd\b|\bnd\b|noderiv/i.test(lizenz)) return 'Lizenz ohne Bearbeitungen (ND): Bild unverändert zeigen, Urheber und Lizenz nennen.'
  if (/cc[ -]?by|creative commons|openmoji/i.test(lizenz)) return 'CC-Lizenz: Urheber, Titel, Quelle und Lizenz nennen (TULLU) – beim Zeigen und auf dem Blatt.'
  return 'Lizenz unklar: nur im Unterricht zeigen (§ 60a UrhG), nicht veröffentlichen; Quelle nennen.'
}

/** Kurzfassung des Impulses für die Spalte „Geplantes Geschehen" (falls die KI sie leer ließ) */
export function impulsKurz(i: Einstiegsimpuls): string {
  return [`${IMPULS_ARTEN[i.art].label}: ${i.titel}`, i.leitfrage ? `Leitfrage: ${i.leitfrage}` : ''].filter(Boolean).join(' · ')
}
