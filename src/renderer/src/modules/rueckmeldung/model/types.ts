/**
 * Programm „Rückmeldung" (Großprogramm 0.4, F3): schriftliche Rückmeldung ohne Note zu
 * Schülerarbeiten.
 *
 * Wunsch der Lehrkraft: „wie 1, aber aus Klassenarbeit / Arbeitsblatt / Vokabeltest etc.
 * heraus erstellbar, um Aufgabengrundlage zu haben, oder custom erstellbar in neuem Programm."
 *
 * Aufbau: eine GRUNDLAGE (die Aufgaben eines gespeicherten Materials oder eine frei
 * eingegebene Aufgabe), mehrere ABGABEN (Foto, Scan, PDF, Word oder getippter Text je
 * Schülerin/Schüler), zu jeder Abgabe ein BOGEN: Das gelingt schon – Nächste Schritte –
 * Kriterien mit Einschätzung in Worten. Keine Noten, keine Punkte (`pruefeBogen`).
 *
 * Datenschutz: Namen bleiben auf diesem Rechner. Die KI sieht nur Kürzel (S1, S2 …);
 * erkannte Namen in Transkripten werden vor der nächsten Anfrage ersetzt (shared/pseudonymisierung).
 */
import type { KiHerkunft, KiVermerk } from '@shared/kiKennzeichnung'
import type { Zuordnung } from '@shared/pseudonymisierung'

export type GrundlageArt = 'arbeitsblatt' | 'klassenarbeit' | 'lernzielkontrolle' | 'grammatiktest' | 'frei'

export interface Grundlage {
  art: GrundlageArt
  /** Kennung des Materials in seiner Bibliothek (nicht bei „frei") */
  docId?: string
  titel: string
  /** Die Aufgaben als Text – so, wie die KI sie für die Rückmeldung braucht */
  aufgaben: string
  /** Erwartungshorizont bzw. Lösungen, falls vorhanden */
  erwartung?: string
}

export type Einschaetzung = 'sicher' | 'teilweise' | 'noch nicht'

export interface BogenKriterium {
  kriterium: string
  einschaetzung: Einschaetzung
  /** Beleg aus der Abgabe (kurzes Zitat oder Stelle) */
  beleg?: string
}

export interface Bogen {
  /** Was schon gelingt – konkret, mit Bezug auf die Abgabe */
  staerken: string[]
  /** Die nächsten Schritte – als Handlungen formuliert */
  schritte: string[]
  kriterien: BogenKriterium[]
  /** Ein persönlicher Satz zum Schluss */
  schluss?: string
  /** Was `pruefeBogen` entfernt hat (Noten, Punkte) – für einen Hinweis an die Lehrkraft */
  entfernt?: number
}

export interface Abgabe {
  id: string
  /** Kürzel, unter dem die KI die Abgabe kennt (S1, S2 …) */
  kuerzel: string
  /** Name – nur auf diesem Rechner, geht nie an die KI */
  name: string
  dateiname: string
  /** Text der Abgabe (getippt, aus Datei gelesen oder aus dem Foto übertragen) – mit Kürzeln statt Namen */
  text: string
  /** Seitenbilder (Foto, Scan) – nur solange kein Text übertragen ist */
  bilder: string[]
  /** Namen, die im Text ersetzt wurden (Kürzel → Name), bleiben lokal */
  pseudonyme?: Zuordnung[]
  bogen?: Bogen
}

export interface RueckmeldungMeta {
  title: string
  subjectId: string
  subjectLabel: string
  grade: number
  stateId: string
  schoolTypeId: string
  schoolTypeName: string
  /** Anrede auf dem Bogen */
  anrede: 'du' | 'sie'
  /** Worauf die Lehrkraft achten will (Kriterien, Schwerpunkt) */
  schwerpunkt: string
  ki?: KiHerkunft
  kiVermerk?: KiVermerk
}

export interface Rueckmeldung {
  version: 1
  meta: RueckmeldungMeta
  grundlage: Grundlage
  abgaben: Abgabe[]
  createdAt: string
  /** Für die Projektdatei (shared/testmodul/projekt.ts) */
  design?: unknown
}

export const hatInhalt = (r: Rueckmeldung | null): boolean => Boolean(r?.abgaben.some((a) => a.bogen))
export const lohntSicherung = (r: Rueckmeldung | null): boolean => Boolean(r && (r.abgaben.length || r.grundlage.aufgaben.trim() || r.meta.title.trim()))

export const standardName = (r: Rueckmeldung): string =>
  r.meta.title.trim() || [r.meta.subjectLabel, r.grundlage.titel].filter(Boolean).join(' – ') || 'Rückmeldung'

export const naechstesKuerzel = (abgaben: Abgabe[]): string => {
  const nummern = abgaben.map((a) => Number(/^S(\d+)$/.exec(a.kuerzel)?.[1] ?? 0))
  return `S${Math.max(0, ...nummern) + 1}`
}
