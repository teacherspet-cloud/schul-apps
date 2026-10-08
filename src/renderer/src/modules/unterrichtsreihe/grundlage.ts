/**
 * Was benutzt die KI? (08.10.2026, Plan „Unterrichtsreihe: Übersicht, KI-Status, Transparenz", Abschnitt C)
 *
 * EINE Quelle für die Eingaben jeder Schritt-Erstellung – Arbeitsblatt (`blattMeta`, platzhalterAuftrag.ts) wie die
 * übrigen Arten (`schrittAnfrage`, reihePlanungKi.ts): Lernziele der Reihe, Auszug aus dem Kerncurriculum zum
 * Oberthema, geplante Minuten, didaktische Funktion (Begründung der Planung), Schritte davor, Schulbuch, Lerngruppe.
 *
 * Dieselben Angaben zeigt die Zeile „Grundlage:" als Chips (GrundlageChips.tsx). Vor dem Erstellen lassen sich Chips abwählen
 * (`Schritt.grundlageAus`) – was abgewählt ist, geht nicht an die KI. Lerngruppe und Schulbuch bleiben immer dabei:
 * ohne Jahrgang kein passendes Material, und die Buchübernahme hat die Lehrkraft ausdrücklich gewählt.
 *
 * Der Kerncurriculum-Auszug entsteht im Editor (Lehrplan laden, Oberthema wählen) und liegt hier in einem kleinen
 * Speicher je Land/Schulform/Fach/Jahrgang/Oberthema – so bekommen ihn auch Aufträge, ohne dass jede Stelle neu lädt.
 */
import type { Reihe, Schritt } from '@shared/reihe'
import type { KcAuszug } from './Lernziele'
import { useAppSettings } from '../../shared/settingsStore'

export type GrundlageArt = 'lerngruppe' | 'kc' | 'lernziele' | 'buch' | 'minuten' | 'davor' | 'funktion' | 'niveau'

export interface GrundlageChip {
  id: GrundlageArt
  /** Kurztext auf dem Chip */
  label: string
  /** Überschrift des Auszugs */
  titel: string
  /** Was genau an die KI geht */
  zeilen: string[]
  abwaehlbar: boolean
  /** abgewählt – geht nicht an die KI */
  aus: boolean
}

/** Höchstens so viele Zeilen des Kerncurriculums gehen an die KI */
export const KC_ZEILEN = 15
/** Höchstens so viele Titel vorheriger Schritte */
export const DAVOR_MAX = 8

// ---------------------------------------------------------------- Kerncurriculum-Auszug

type KcSchluesselTeile = Pick<Reihe, 'stateId' | 'schoolTypeId' | 'fachId' | 'grade' | 'oberthema'>
const kcSpeicher = new Map<string, KcAuszug>()

export const kcSchluessel = (r: KcSchluesselTeile): string => [r.stateId, r.schoolTypeId, r.fachId, r.grade, r.oberthema.trim()].join('|')

/** Der Editor legt den Auszug zum gewählten Oberthema ab (null = keiner) */
export function merkeKcAuszug(r: KcSchluesselTeile, a: KcAuszug | null): void {
  if (a && a.zeilen.length) kcSpeicher.set(kcSchluessel(r), a)
  else kcSpeicher.delete(kcSchluessel(r))
}

export const kcAuszugFuer = (r: KcSchluesselTeile): KcAuszug | null => kcSpeicher.get(kcSchluessel(r)) ?? null

// ---------------------------------------------------------------- Eingaben

export interface GrundlageEingabe {
  /** „Klasse 7 (Gymnasium, NI), Englisch" – immer dabei */
  lerngruppe: string
  kc?: KcAuszug
  /** Lernziele der Reihe, die nicht schon Lernziele des Schritts sind (Fassung für die Lehrkraft) */
  reiheZiele: string[]
  /** Lernziele des Schritts – gehören zum Schritt, immer dabei */
  schrittZiele: string[]
  minuten?: number
  funktion?: string
  davor: string[]
  buch?: string
  niveau?: NonNullable<Schritt['kiVorgabe']>['niveau']
  /** Sprache relativ zum Jahrgang (Niveau der Reihe, 08.10.2026) – fehlt = wie `niveau` */
  sprache?: NonNullable<Schritt['kiVorgabe']>['niveau']
  stufen?: NonNullable<Schritt['kiVorgabe']>['stufen']
}

/** Expertenmodus? (ohne geladene Einstellungen: ja – wie `useExperte`) */
export function istExperte(): boolean {
  try {
    return useAppSettings.getState().settings.oberflaeche !== 'standard'
  } catch {
    return true
  }
}

/**
 * Niveau eines Schritts (08.10.2026): Vorgabe ist das Niveau der Reihe (`Reihe.niveau`, wie beim Arbeitsblatt: Anspruch,
 * Sprache, Niveaustufen); die eigene Vorgabe des Schritts (`kiVorgabe`) gilt nur im Expertenmodus vorrangig. „mittel" bei
 * einem Niveau bleibt ohne Angabe (jahrgangsgemäß).
 */
export function schrittNiveau(
  r: Pick<Reihe, 'niveau'>,
  s: Pick<Schritt, 'kiVorgabe'>,
  experte = istExperte()
): Pick<GrundlageEingabe, 'niveau' | 'sprache' | 'stufen'> {
  const eigen = experte ? s.kiVorgabe : undefined
  const anspruch = eigen?.niveau ?? r.niveau?.anspruch
  const sprache = eigen?.niveau && !r.niveau ? eigen.niveau : (r.niveau?.sprache ?? eigen?.niveau)
  const stufen = eigen?.stufen ?? r.niveau?.stufen
  const mittel = anspruch === 'mittel' && (sprache ?? 'mittel') === 'mittel'
  return {
    ...(anspruch && !mittel ? { niveau: anspruch } : {}),
    ...(sprache && !mittel ? { sprache } : {}),
    ...(stufen && stufen > 1 ? { stufen } : {})
  }
}

const istAus = (s: Pick<Schritt, 'grundlageAus'>, id: GrundlageArt): boolean => (s.grundlageAus ?? []).includes(id)

/** Didaktische Funktion an dieser Stelle: Begründung der Planung (am Platzhalter bzw. nach dem Erstellen am Schritt) */
export const funktionVon = (s: Pick<Schritt, 'platzhalter' | 'begruendung'>): string => (s.platzhalter?.begruendung ?? s.begruendung ?? '').trim()

/** Titel der Schritte vor `s` in der Reihe (höchstens `DAVOR_MAX`, die letzten) */
export function schritteDavor(r: Pick<Reihe, 'schritte'>, s: Pick<Schritt, 'id'>): string[] {
  const i = r.schritte.findIndex((x) => x.id === s.id)
  return r.schritte
    .slice(0, Math.max(0, i))
    .map((x) => x.titel.trim())
    .filter(Boolean)
    .slice(-DAVOR_MAX)
}

/** Alles, was für diesen Schritt an die KI geht – ohne Abgewähltes */
export function grundlageEingabe(r: Reihe, s: Schritt, kc: KcAuszug | null): GrundlageEingabe {
  const schrittZiele = s.lernziele.map((l) => l.text.trim()).filter(Boolean)
  const reiheZiele = r.lernziele.map((l) => l.text.trim()).filter((t) => t && !schrittZiele.includes(t))
  const funktion = funktionVon(s)
  const davor = schritteDavor(r, s)
  return {
    lerngruppe: `Klasse ${r.grade} (${[r.schoolTypeId, r.stateId].filter(Boolean).join(', ')}), ${r.fachLabel}`,
    ...(kc && kc.zeilen.length && !istAus(s, 'kc') ? { kc: { quelle: kc.quelle, zeilen: kc.zeilen.slice(0, KC_ZEILEN) } } : {}),
    reiheZiele: istAus(s, 'lernziele') ? [] : reiheZiele,
    schrittZiele,
    ...(s.minuten && !istAus(s, 'minuten') ? { minuten: s.minuten } : {}),
    ...(funktion && !istAus(s, 'funktion') ? { funktion } : {}),
    davor: istAus(s, 'davor') ? [] : davor,
    ...(s.platzhalter?.buch?.trim() ? { buch: s.platzhalter.buch.trim() } : {}),
    ...schrittNiveau(r, s)
  }
}

/** Zusätzliche Zeilen der Anfrage für Schritte, die die KI direkt füllt (Aufgabe, Lernkarten, Diagnose …) */
export function grundlageZeilen(e: GrundlageEingabe): string[] {
  return [
    `LERNGRUPPE: ${e.lerngruppe}`,
    e.reiheZiele.length ? `LERNZIELE DER REIHE (übergeordnet – der Schritt trägt dazu bei): ${e.reiheZiele.join('; ')}` : '',
    e.kc ? `KERNCURRICULUM (${e.kc.quelle}) – Bezug zum Oberthema:\n${e.kc.zeilen.map((z) => `- ${z}`).join('\n')}` : '',
    e.minuten ? `BEARBEITUNGSZEIT: etwa ${e.minuten} Minuten – den Umfang danach bemessen.` : '',
    e.funktion ? `DIDAKTISCHE FUNKTION AN DIESER STELLE: ${e.funktion}` : '',
    e.niveau ? `ANSPRUCH: ${e.niveau} (gemessen am Jahrgang; „mittel" = jahrgangsgemäß)` : '',
    e.sprache && e.sprache !== e.niveau ? `SPRACHE: ${e.sprache} (Satzlänge, Lesbarkeit, Fachsprache – gemessen am Jahrgang)` : '',
    e.davor.length ? `DAVOR IN DER REIHE: ${e.davor.join('; ')}` : ''
  ].filter(Boolean)
}

/** Lernziel-Feld des Arbeitsblatts (`meta.learningGoals` – „Richtung der Lehrkraft", nicht wörtlich aufs Blatt) */
export function blattZiele(beschreibung: string, e: GrundlageEingabe): string {
  return [
    beschreibung.trim(),
    ...e.schrittZiele.map((z) => `- ${z}`),
    e.funktion ? `Didaktische Funktion an dieser Stelle der Reihe: ${e.funktion}` : '',
    e.reiheZiele.length ? `Übergeordnete Lernziele der Reihe:\n${e.reiheZiele.map((z) => `- ${z}`).join('\n')}` : '',
    e.kc ? `Bezug zum Kerncurriculum (${e.kc.quelle}):\n${e.kc.zeilen.map((z) => `- ${z}`).join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** „S. 34" bzw. „S. 34–35" aus dem Buchtext der Planung (leer, wenn keine Seite genannt ist) */
export function buchSeiten(buch: string): string {
  const m = buch.match(/S\.\s*(\d+(?:\s*[–-]\s*\d+)?)/)
  return m ? `S. ${m[1].replace(/\s+/g, '').replace('-', '–')}` : ''
}

const mehrzahl = (n: number, eins: string, viele: string): string => `${n} ${n === 1 ? eins : viele}`

// ---------------------------------------------------------------- Chips

/** Die Chips der Zeile „Grundlage:" – auch die abgewählten (mit `aus`) */
export function grundlageChips(r: Reihe, s: Schritt, kc: KcAuszug | null): GrundlageChip[] {
  const chips: GrundlageChip[] = []
  const schrittZiele = s.lernziele.map((l) => l.text.trim()).filter(Boolean)
  const reiheZiele = r.lernziele.map((l) => l.text.trim()).filter((t) => t && !schrittZiele.includes(t))
  if (kc && kc.zeilen.length)
    chips.push({
      id: 'kc',
      label: `Kerncurriculum ${r.fachLabel} ${r.grade}`,
      titel: kc.quelle,
      zeilen: kc.zeilen.slice(0, KC_ZEILEN),
      abwaehlbar: true,
      aus: istAus(s, 'kc')
    })
  else
    chips.push({
      id: 'lerngruppe',
      label: `${r.fachLabel} · Jg. ${r.grade}`,
      titel: 'Lerngruppe',
      zeilen: [`Klasse ${r.grade}`, `Fach ${r.fachLabel}`, `Schulform ${r.schoolTypeId}, ${r.stateId}`, 'Kein Auszug aus dem Kerncurriculum zum Oberthema.'],
      abwaehlbar: false,
      aus: false
    })
  const ziele = schrittZiele.length + reiheZiele.length
  if (ziele)
    chips.push({
      id: 'lernziele',
      label: mehrzahl(ziele, 'Lernziel', 'Lernziele'),
      titel: 'Lernziele',
      zeilen: [
        ...schrittZiele.map((z) => `Schritt: ${z}`),
        ...reiheZiele.map((z) => `Reihe: ${z}`),
        ...(schrittZiele.length && reiheZiele.length ? ['Abwählen nimmt nur die Ziele der Reihe heraus – die des Schritts gehen immer mit.'] : [])
      ],
      abwaehlbar: reiheZiele.length > 0,
      aus: reiheZiele.length > 0 && istAus(s, 'lernziele')
    })
  const buch = s.platzhalter?.buch?.trim()
  if (buch) {
    const seiten = buchSeiten(buch)
    chips.push({
      id: 'buch',
      label: seiten ? `Schulbuch ${seiten}` : 'Schulbuch',
      titel: 'Schulbuch (Verweise und Übernahmen)',
      zeilen: buch.split('\n').filter((z) => z.trim()).slice(0, 20),
      abwaehlbar: false,
      aus: false
    })
  }
  if (s.minuten)
    chips.push({
      id: 'minuten',
      label: `${s.minuten} min`,
      titel: 'Geplante Bearbeitungszeit',
      zeilen: [`etwa ${s.minuten} Minuten – Maßstab für den Umfang`],
      abwaehlbar: true,
      aus: istAus(s, 'minuten')
    })
  const davor = schritteDavor(r, s)
  if (davor.length)
    chips.push({
      id: 'davor',
      label: mehrzahl(davor.length, 'vorheriger Schritt', 'vorherige Schritte'),
      titel: 'Davor in der Reihe',
      zeilen: davor,
      abwaehlbar: true,
      aus: istAus(s, 'davor')
    })
  const funktion = funktionVon(s)
  if (funktion)
    chips.push({ id: 'funktion', label: 'Didaktische Funktion', titel: 'Didaktische Funktion an dieser Stelle', zeilen: [funktion], abwaehlbar: true, aus: istAus(s, 'funktion') })
  const nv = schrittNiveau(r, s)
  if (nv.niveau || (nv.stufen ?? 1) > 1)
    chips.push({
      id: 'niveau',
      label: [nv.niveau, (nv.stufen ?? 1) > 1 ? `${nv.stufen} Niveaustufen` : ''].filter(Boolean).join(' · '),
      titel: 'Anspruch',
      zeilen: [
        nv.niveau ? `Anspruch: ${nv.niveau} (gemessen am Jahrgang)` : '',
        nv.sprache && nv.sprache !== nv.niveau ? `Sprache: ${nv.sprache}` : '',
        (nv.stufen ?? 1) > 1 ? `${nv.stufen} Niveaustufen (nur Arbeitsblatt)` : ''
      ].filter(Boolean),
      abwaehlbar: false,
      aus: false
    })
  return chips
}

/** Chip an- bzw. abwählen: neue Liste für `Schritt.grundlageAus` (leer = undefined) */
export function grundlageUmschalten(s: Pick<Schritt, 'grundlageAus'>, id: GrundlageArt): string[] | undefined {
  const alt = s.grundlageAus ?? []
  const neu = alt.includes(id) ? alt.filter((x) => x !== id) : [...alt, id]
  return neu.length ? neu : undefined
}
