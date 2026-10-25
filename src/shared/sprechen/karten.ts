/**
 * Aufgabenkarten des Sprechtrainings (19.10.2026): Interviewfragen, Bildkarten (Monolog) und Dialogkarten – je
 * Sprache und Jahrgang im schulweiten Pool (server/sprechBank.ts), einmal von der KI erzeugt und von einer Lehrkraft
 * durchgesehen. Hier: Typen, Prüfung und ein kleiner eingebauter Grundbestand (Englisch, ohne Bilder), damit Interview
 * und Dialog auch ohne Pool üben lassen. Anlehnung an die Materialbände (belegt: Jg 5 „talk about these six ideas …
 * which two are best?", info-gap mit Info- und Prompt-Karte, Diskussion mit Einigung); Inhalte selbst formuliert.
 */
import type { SprechSprache, Stufe } from './niveaus'

/**
 * Bis zu welcher Stelle im Lehrwerk eine Karte reicht (21.10.2026, Wunsch der Lehrkraft: nachvollziehbar, bis zu welchem
 * Abschnitt ein Aufgabenpool geht): Band, Unit und – wenn gewählt – Abschnitt, z. B. Green Line 3 › Unit 1 › Station 2
 */
export interface SprechStand {
  band: string
  unit: string
  abschnitt?: string
}

/**
 * Hilfen für die Partnerarbeit im Unterricht (24.10.2026, abgestimmt): hängen an der Pool-Karte, einmal von der KI
 * ergänzt (App „Sprechprüfungen", Knopf „Fehlende Inhalte ergänzen") – Partner A schaltet sie Partner B frei bzw. jede
 * Rolle sich selbst. Das KI-Sprechtraining und das Druckset nutzen sie nicht.
 */
export interface Wortschatz {
  wort: string
  deutsch: string
}
/** Zur Karte passende Wendung (24.10.2026): Text in der Zielsprache, `wann` = wann man sie braucht (deutsch, kurz) */
export interface KartenPhrase {
  text: string
  wann: string
}
export interface InterviewHilfen {
  /** Je Frage eine Nachfrage für den Interviewer (gleiche Reihenfolge wie `fragen`) */
  nachfragen: string[]
  wortschatz: Wortschatz[]
  /** 2–3 Musterantworten als letzte Hilfe */
  beispiele: string[]
  /** 5–8 Phrases, die zu DIESEN Fragen passen (der allgemeine Bestand bleibt ausklappbar) */
  phrases: KartenPhrase[]
}
export interface MonologHilfen {
  /** Arbeitsauftrag in der Zielsprache, den Partner A vorliest */
  auftrag: string
  /** Zusatzfragen, wenn die/der Sprechende stockt */
  zusatzfragen: string[]
  wortschatz: Wortschatz[]
  beispiele: string[]
  phrases: KartenPhrase[]
}
export interface DialogRolle {
  name: string
  /** Text der Rollenkarte – bei Info-Gap mit der Information dieser Rolle */
  karte: string
  /** Konkrete Vorschläge (Argumente, Fragen, Ideen) für diese Rolle */
  vorschlaege: string[]
  wortschatz: Wortschatz[]
  beispiele: string[]
}
export interface DialogHilfen {
  /** 2–3 Rollen; [0] und [1] bilden allein ein vollständiges Zweier-Set, [2] ist die dritte Person */
  rollen: DialogRolle[]
  /** Phrases zur Gesprächsführung dieser Karte (für alle Rollen) */
  phrases: KartenPhrase[]
}
/** 'ki' = von der KI ergänzt/überarbeitet, noch nicht durchgesehen; 'geprueft' = eine Lehrkraft hat bestätigt */
export type HilfenStatus = 'ki' | 'geprueft'

export interface InterviewKarte {
  art: 'interview'
  id: string
  stand?: SprechStand
  thema: string
  /** Offene Einstiegsfragen zuerst, dann gezieltere */
  fragen: string[]
  hilfen?: InterviewHilfen
  hilfenStatus?: HilfenStatus
}

export interface BildKarte {
  art: 'monolog'
  id: string
  stand?: SprechStand
  titel: string
  /** Bilddatei im Pool (…/sprechbilder/<datei>) – Oberstufe: bis zu 3 */
  bilder: string[]
  /** Alle Fassungen des Bilds, die aktuelle eingeschlossen (21.10.2026, bildVersionen.ts) */
  bildVersionen?: string[]
  /** Was auf dem Bild zu sehen ist (für die KI, die das Bild nicht sieht) */
  bildBeschreibung: string
  leitfragen: string[]
  hilfen?: MonologHilfen
  hilfenStatus?: HilfenStatus
}

export interface DialogKarte {
  art: 'dialog'
  id: string
  stand?: SprechStand
  form: 'rollenspiel' | 'infogap' | 'diskussion'
  titel: string
  /** Lage, wie sie auf der Karte steht (Zielsprache) */
  situation: string
  rolleSchueler: string
  rolleKi: string
  /** Punkte, die besprochen werden (Optionen, Prompt-Karte, Info-Karte …) */
  punkte: string[]
  /** Woran das Gespräch endet (Einigung, alle Infos …) */
  ziel: string
  /** Mit Hilfen sind `rollen[0].karte`/`rollen[1].karte` die Quelle von rolleSchueler/rolleKi (karteBereinigt gleicht ab) */
  hilfen?: DialogHilfen
  hilfenStatus?: HilfenStatus
}

export type SprechKarte = InterviewKarte | BildKarte | DialogKarte

const text = (x: unknown, max = 400): string => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const liste = (x: unknown, max = 12): string[] => (Array.isArray(x) ? x.map((y) => text(y, 300)).filter(Boolean).slice(0, max) : [])

/** Lehrwerk-Stand bereinigen – ohne Band und Unit keiner */
export function standBereinigt(roh: unknown): SprechStand | undefined {
  const r = (roh ?? {}) as Record<string, unknown>
  const band = text(r.band, 80)
  const unit = text(r.unit, 80)
  const abschnitt = text(r.abschnitt, 80)
  return band && unit ? { band, unit, ...(abschnitt ? { abschnitt } : {}) } : undefined
}

/** „bis Green Line 3 › Unit 1 › Station 2" – leer ohne Stand */
export const standText = (s: SprechStand | undefined): string => (s ? `bis ${[s.band, s.unit, s.abschnitt].filter(Boolean).join(' › ')}` : '')

/** Bereinigt eine Karte aus Pool oder KI-Antwort; null = unbrauchbar */
export function karteBereinigt(roh: unknown, id: string): SprechKarte | null {
  const k = karteOhneStand(roh, id)
  const stand = k && standBereinigt((roh as Record<string, unknown> | null)?.stand)
  return k && stand ? { ...k, stand } : k
}

const woerter = (x: unknown, max = 15): Wortschatz[] =>
  Array.isArray(x)
    ? x
        .map((w) => {
          const r = (w ?? {}) as Record<string, unknown>
          return { wort: text(r.wort, 80), deutsch: text(r.deutsch, 80) }
        })
        .filter((w) => w.wort)
        .slice(0, max)
    : []

const phrasen = (x: unknown, max = 10): KartenPhrase[] =>
  Array.isArray(x)
    ? x
        .map((p) => {
          const r = (p ?? {}) as Record<string, unknown>
          return { text: text(r.text, 160), wann: text(r.wann, 80) }
        })
        .filter((p) => p.text)
        .slice(0, max)
    : []

/** Hilfen einer Karte bereinigen – undefined, wenn nichts Brauchbares da ist */
export function hilfenBereinigt(art: SprechKarte['art'], roh: unknown): InterviewHilfen | MonologHilfen | DialogHilfen | undefined {
  const r = (roh ?? {}) as Record<string, unknown>
  if (art === 'interview') {
    const h: InterviewHilfen = { nachfragen: liste(r.nachfragen, 10), wortschatz: woerter(r.wortschatz), beispiele: liste(r.beispiele, 3), phrases: phrasen(r.phrases) }
    return h.nachfragen.length || h.wortschatz.length || h.beispiele.length || h.phrases.length ? h : undefined
  }
  if (art === 'monolog') {
    const h: MonologHilfen = {
      auftrag: text(r.auftrag, 600),
      zusatzfragen: liste(r.zusatzfragen, 6),
      wortschatz: woerter(r.wortschatz),
      beispiele: liste(r.beispiele, 3),
      phrases: phrasen(r.phrases)
    }
    return h.auftrag || h.zusatzfragen.length || h.wortschatz.length || h.beispiele.length || h.phrases.length ? h : undefined
  }
  const rollen: DialogRolle[] = (Array.isArray(r.rollen) ? r.rollen : [])
    .map((x) => {
      const q = (x ?? {}) as Record<string, unknown>
      return { name: text(q.name, 80), karte: text(q.karte, 600), vorschlaege: liste(q.vorschlaege, 6), wortschatz: woerter(q.wortschatz, 10), beispiele: liste(q.beispiele, 3) }
    })
    .filter((x) => x.karte || x.name)
    .slice(0, 3)
  return rollen.length >= 2 ? { rollen, phrases: phrasen(r.phrases) } : undefined
}

const status = (x: unknown): HilfenStatus | undefined => (x === 'ki' || x === 'geprueft' ? x : undefined)
const mitHilfen = <K extends SprechKarte>(k: K, roh: Record<string, unknown>): K => {
  const hilfen = hilfenBereinigt(k.art, roh.hilfen)
  if (!hilfen) return k
  const st = status(roh.hilfenStatus)
  return { ...k, hilfen, ...(st ? { hilfenStatus: st } : {}) }
}

function karteOhneStand(roh: unknown, id: string): SprechKarte | null {
  const r = (roh ?? {}) as Record<string, unknown>
  if (r.art === 'interview') {
    const fragen = liste(r.fragen, 10)
    return fragen.length >= 3 ? mitHilfen({ art: 'interview', id, thema: text(r.thema, 80) || 'About you', fragen }, r) : null
  }
  if (r.art === 'monolog') {
    const leitfragen = liste(r.leitfragen, 6)
    const datei = (b: string): boolean => /^[a-f0-9]{8,40}\.(png|jpe?g|webp)$/i.test(b)
    const bilder = liste(r.bilder, 3).filter(datei)
    const versionen = [...new Set([...liste(r.bildVersionen, 20).filter(datei), ...bilder])]
    const beschreibung = text(r.bildBeschreibung, 800)
    return beschreibung && leitfragen.length
      ? mitHilfen({ art: 'monolog', id, titel: text(r.titel, 80) || 'Picture', bilder, ...(versionen.length > bilder.length ? { bildVersionen: versionen } : {}), bildBeschreibung: beschreibung, leitfragen }, r)
      : null
  }
  if (r.art === 'dialog') {
    const form = r.form === 'infogap' || r.form === 'diskussion' ? r.form : 'rollenspiel'
    const punkte = liste(r.punkte, 8)
    const situation = text(r.situation, 600)
    if (!situation || punkte.length < 2) return null
    const basis: DialogKarte = {
      art: 'dialog',
      id,
      form,
      titel: text(r.titel, 80) || 'Dialogue',
      situation,
      rolleSchueler: text(r.rolleSchueler, 600),
      rolleKi: text(r.rolleKi, 600),
      punkte,
      ziel: text(r.ziel, 200) || 'Agree on a decision.'
    }
    const k = mitHilfen(basis, r)
    // Mit Rollenliste sind deren Karten die Quelle – so bleiben KI-Training und Druckset (rolleSchueler/rolleKi) im Takt
    const rollen = k.hilfen?.rollen
    return rollen ? { ...k, rolleSchueler: rollen[0].karte || k.rolleSchueler, rolleKi: rollen[1].karte || k.rolleKi } : k
  }
  return null
}

/** Rollen eines Dialogs: aus den Hilfen, sonst aus den zwei festen Feldern (ohne Vorschläge) */
export function dialogRollen(k: DialogKarte): DialogRolle[] {
  if (k.hilfen?.rollen && k.hilfen.rollen.length >= 2) return k.hilfen.rollen
  const leer = { vorschlaege: [], wortschatz: [], beispiele: [] }
  return [
    { name: 'A', karte: k.rolleSchueler, ...leer },
    { name: 'B', karte: k.rolleKi, ...leer }
  ]
}

/** Dialogkarte mit eigener dritter Rolle (für Dreiergruppen) */
export const karteFuer3 = (k: SprechKarte): boolean => k.art === 'dialog' && dialogRollen(k).length >= 3

export type FehlenderInhalt = 'hilfen' | 'beispiele' | 'dritteRolle' | 'bild'

/**
 * Reicht der Arbeitsauftrag einer Bildkarte für einen Monolog in Prüfungslänge (24.10.2026, Wunsch der Lehrkraft)?
 * Mindestens zwei Sätze (Beschreiben + Vermuten/Meinung) und nicht nur ein Halbsatz – sonst gilt die Hilfe als fehlend
 * und der Knopf „Fehlende Inhalte ergänzen" lässt die KI nachbessern.
 */
export function auftragReicht(auftrag: string | undefined): boolean {
  const t = (auftrag ?? '').trim()
  if (t.length < 60) return false
  const schritte = auftragSchritte(t)
  // Zu viele Aufforderungen überfordern (Befund 25.10.2026): höchstens 3 Sätze und etwa 45 Wörter
  return schritte.length >= 2 && schritte.length <= 3 && t.split(/\s+/).length <= 45
}

/** Arbeitsauftrag als einzelne Schritte (Sätze) – für die nummerierte Anzeige unter dem Bild */
export function auftragSchritte(auftrag: string | undefined): string[] {
  return (auftrag ?? '')
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ¿¡])/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2)
}

/**
 * Was einer Karte für die Partnerarbeit noch fehlt (24.10.2026) – Grundlage für den Knopf „Fehlende Inhalte ergänzen",
 * den Abdeckungshinweis beim Vorbereiten und die Tests. 'bild' lässt sich nicht per Text-KI beheben (nur zählen).
 */
export function fehlendeInhalte(k: SprechKarte): FehlenderInhalt[] {
  const aus: FehlenderInhalt[] = []
  if (k.art === 'interview') {
    const h = k.hilfen
    if (!h || !h.nachfragen.length || !h.wortschatz.length || !h.phrases.length) aus.push('hilfen')
    if (!h?.beispiele.length) aus.push('beispiele')
  } else if (k.art === 'monolog') {
    if (!k.bilder[0]) aus.push('bild')
    const h = k.hilfen
    if (!h || !auftragReicht(h.auftrag) || !h.zusatzfragen.length || !h.wortschatz.length || !h.phrases.length) aus.push('hilfen')
    if (!h?.beispiele.length) aus.push('beispiele')
  } else {
    const rollen = k.hilfen?.rollen ?? []
    if (rollen.length < 2 || rollen.some((r) => !r.karte || !r.vorschlaege.length || !r.wortschatz.length) || !k.hilfen?.phrases.length) aus.push('hilfen')
    if (rollen.length < 2 || rollen.some((r) => !r.beispiele.length)) aus.push('beispiele')
    if (rollen.length < 3) aus.push('dritteRolle')
  }
  return aus
}

/** Fehlendes, das die Text-KI ergänzen kann */
export const ergaenzbar = (k: SprechKarte): FehlenderInhalt[] => fehlendeInhalte(k).filter((x) => x !== 'bild')

/** Eingebauter Grundbestand (Englisch) – Interview und Dialog je Stufe */
export const GRUNDKARTEN: Partial<Record<SprechSprache, Partial<Record<Stufe, SprechKarte[]>>>> = {
  en: {
    A1: [
      { art: 'interview', id: 'g-en-a1-i1', thema: 'You and your family', fragen: ['Tell me something about you.', 'What can you tell me about your family?', 'Have you got any pets?', 'What do you like doing in your free time?', 'What is your favourite subject? Why?', 'How do you get to school?'] },
      { art: 'interview', id: 'g-en-a1-i2', thema: 'Free time and school', fragen: ['What do you do after school?', 'What is your favourite day of the week? Why?', 'Tell me about your best friend.', 'What do you like about your school?', 'What did you do last weekend?'] },
      {
        art: 'dialog',
        id: 'g-en-a1-d1',
        form: 'diskussion',
        titel: 'A weekend with friends from England',
        situation: 'The two of you are planning a weekend with friends from England. Talk about these six ideas. Which two ideas are best?',
        rolleSchueler: 'You are one of the two planners.',
        rolleKi: 'You are the other planner, a friendly classmate.',
        punkte: ['go to the zoo', 'play football in the park', 'go to the cinema', 'have a picnic', 'go swimming', 'visit a museum'],
        ziel: 'Agree on the two best ideas.'
      },
      {
        art: 'dialog',
        id: 'g-en-a1-d2',
        form: 'diskussion',
        titel: 'A birthday present',
        situation: 'Your friend likes animals and sports. Talk about these six presents. Which is the best present?',
        rolleSchueler: 'You are buying a present together with a classmate.',
        rolleKi: 'You are the classmate.',
        punkte: ['a football (£12)', 'a book about cats (£8)', 'a T-shirt with a dog (£15)', 'a skateboard (£40)', 'a cinema ticket (£9)', 'a poster of a horse (£5)'],
        ziel: 'Agree on one present.'
      }
    ],
    A2: [
      { art: 'interview', id: 'g-en-a2-i1', thema: 'Free time and activities', fragen: ['What do you usually do at the weekend?', 'Tell me about a hobby you have had for a long time.', 'What did you do in your last holidays?', 'Which do you prefer: being outside or staying at home? Why?', 'What are your plans for the next holidays?'] },
      {
        art: 'dialog',
        id: 'g-en-a2-d1',
        form: 'infogap',
        titel: 'A summer camp',
        situation: 'Your partner has information about a summer camp. Ask questions to find out more. Then decide if you want to go.',
        rolleSchueler: 'You want to find out about the camp (where, for whom, activities, cost, dates).',
        rolleKi: 'You have the information card: Lakeside Summer Camp, near Brighton, ages 11–15, sailing, climbing and campfire evenings, £180 for one week, 1–8 August.',
        punkte: ['Where?', 'For whom?', 'Activities?', 'Cost?', 'When?'],
        ziel: 'The student has asked about all points and says if he or she wants to go.'
      }
    ],
    B1: [
      { art: 'interview', id: 'g-en-b1-i1', thema: 'Media and the future', fragen: ['How important is your mobile phone for you?', 'What do you think about social media for teenagers?', 'What job would you like to do in the future? Why?', 'If you could change one thing at your school, what would it be?', 'Tell me about something you are proud of.'] },
      {
        art: 'dialog',
        id: 'g-en-b1-d1',
        form: 'diskussion',
        titel: 'Free afternoon classes',
        situation: 'Your school wants to offer new free afternoon classes. Talk about these ideas and try to agree on the three most useful ones.',
        rolleSchueler: 'You are a student on the school council.',
        rolleKi: 'You are another student on the school council.',
        punkte: ['First Aid', 'cooking', 'coding', 'gardening', 'a language certificate', 'film making'],
        ziel: 'Agree on the three most useful classes.'
      }
    ]
  }
}
