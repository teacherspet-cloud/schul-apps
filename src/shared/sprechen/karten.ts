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

export interface InterviewKarte {
  art: 'interview'
  id: string
  stand?: SprechStand
  thema: string
  /** Offene Einstiegsfragen zuerst, dann gezieltere */
  fragen: string[]
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

function karteOhneStand(roh: unknown, id: string): SprechKarte | null {
  const r = (roh ?? {}) as Record<string, unknown>
  if (r.art === 'interview') {
    const fragen = liste(r.fragen, 10)
    return fragen.length >= 3 ? { art: 'interview', id, thema: text(r.thema, 80) || 'About you', fragen } : null
  }
  if (r.art === 'monolog') {
    const leitfragen = liste(r.leitfragen, 6)
    const datei = (b: string): boolean => /^[a-f0-9]{8,40}\.(png|jpe?g|webp)$/i.test(b)
    const bilder = liste(r.bilder, 3).filter(datei)
    const versionen = [...new Set([...liste(r.bildVersionen, 20).filter(datei), ...bilder])]
    const beschreibung = text(r.bildBeschreibung, 800)
    return beschreibung && leitfragen.length
      ? { art: 'monolog', id, titel: text(r.titel, 80) || 'Picture', bilder, ...(versionen.length > bilder.length ? { bildVersionen: versionen } : {}), bildBeschreibung: beschreibung, leitfragen }
      : null
  }
  if (r.art === 'dialog') {
    const form = r.form === 'infogap' || r.form === 'diskussion' ? r.form : 'rollenspiel'
    const punkte = liste(r.punkte, 8)
    const situation = text(r.situation, 600)
    return situation && punkte.length >= 2
      ? {
          art: 'dialog',
          id,
          form,
          titel: text(r.titel, 80) || 'Dialogue',
          situation,
          rolleSchueler: text(r.rolleSchueler, 200),
          rolleKi: text(r.rolleKi, 200),
          punkte,
          ziel: text(r.ziel, 200) || 'Agree on a decision.'
        }
      : null
  }
  return null
}

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
