/**
 * KI-Kennzeichnung der Materialien (Großprogramm 0.4, Rechtspaket).
 *
 * Hintergrund: Art. 50 Abs. 2 der KI-Verordnung (EU) 2024/1689 verpflichtet ab 2.8.2026 die
 * ANBIETER von KI-Systemen, erzeugte Inhalte maschinenlesbar als künstlich erzeugt zu
 * kennzeichnen. Die Lehrkraft ist Betreiberin; für sie gilt eine Kennzeichnungspflicht nur bei
 * Deepfakes und bei Texten, die die Öffentlichkeit informieren sollen – und nicht, wenn ein
 * Mensch den Text redaktionell geprüft hat. Arbeitsblätter fallen darunter in aller Regel nicht.
 * Die App kennzeichnet trotzdem: maschinenlesbar in den Dateieigenschaften von Word und PDF
 * (immer) und sichtbar als kleiner Vermerk – nach Wahl der Lehrkraft nur im Lösungsteil,
 * auf jeder Seite oder gar nicht. Das ist Transparenz, keine Behauptung einer Pflicht.
 */
import { AI_PROVIDERS, type AiProviderId, type AppSettings } from './types'

/** Welche KI an einem Material mitgewirkt hat */
export interface KiHerkunft {
  anbieter: string
  modell: string
  /** Datum der letzten KI-Mitwirkung (JJJJ-MM-TT) */
  am: string
}

export type KiVermerk = 'loesung' | 'ueberall' | 'aus'

export const KI_VERMERK_STANDARD: KiVermerk = 'loesung'

const kurzname = (id: string): string => {
  const p = AI_PROVIDERS.find((x) => x.id === id)
  return p ? p.label.replace(/\s*\(.*\)$/, '') : id
}

/** Die eingestellte Text-KI als Herkunft */
export function aktuelleKi(settings: Pick<AppSettings, 'ai'>, jetzt = new Date()): KiHerkunft {
  const id = settings.ai.textProvider as AiProviderId
  const abo = settings.ai.access?.[id] === 'subscription'
  const modell = (abo ? settings.ai.subscriptionModels?.[id] : '') || settings.ai.textModels?.[id] || ''
  return { anbieter: kurzname(id), modell, am: jetzt.toISOString().slice(0, 10) }
}

/**
 * Stempelt ein Dokument als KI-unterstützt. Kennt alle Dokumentarten der App: `meta`
 * (Arbeitsblatt, Klassenarbeit, Lernzielkontrolle, Grammatiktest) und `doc` (Vokabeltest).
 */
export function stempleKi<D>(d: D, ki: KiHerkunft, vermerk?: KiVermerk): D {
  if (!d || typeof d !== 'object') return d
  const o = d as Record<string, unknown>
  const ziel = (o.meta && typeof o.meta === 'object' ? o.meta : o.doc && typeof o.doc === 'object' ? o.doc : null) as Record<string, unknown> | null
  if (!ziel) return d
  const feld = o.meta && typeof o.meta === 'object' ? 'meta' : 'doc'
  // Die Voreinstellung der App gilt, solange die Lehrkraft am Material nichts anderes gewählt hat
  const kiVermerk = (ziel.kiVermerk as KiVermerk | undefined) ?? vermerk
  return { ...o, [feld]: { ...ziel, ki, ...(kiVermerk ? { kiVermerk } : {}) } } as D
}

const datumDe = (iso: string): string => {
  const [j, m, t] = iso.split('-')
  return j && m && t ? `${t}.${m}.${j}` : iso
}

/** Der sichtbare Vermerk */
export function kiVermerkText(ki: KiHerkunft, sprache: 'de' | 'en' = 'de'): string {
  const wer = [ki.anbieter, ki.modell].filter(Boolean).join(' · ')
  return sprache === 'en'
    ? `Created with AI assistance (${wer}, ${ki.am}) and edited by the teacher.`
    : `Mit KI-Unterstützung erstellt (${wer}, ${datumDe(ki.am)}) und von der Lehrkraft bearbeitet.`
}

/** Gehört der Vermerk auf diese Seite? */
export const vermerkSichtbar = (ki: KiHerkunft | undefined, vermerk: KiVermerk | undefined, istLoesung: boolean): boolean => {
  if (!ki) return false
  const v = vermerk ?? KI_VERMERK_STANDARD
  return v === 'ueberall' || (v === 'loesung' && istLoesung)
}

/** Maschinenlesbare Angaben für die Dateieigenschaften (Word: benutzerdefinierte Eigenschaften, PDF: Info-Verzeichnis) */
export function kiEigenschaften(ki: KiHerkunft | undefined): { name: string; value: string }[] {
  if (!ki) return []
  return [
    { name: 'KI-generiert', value: 'ja (mit KI-Unterstützung erstellt, von der Lehrkraft bearbeitet)' },
    { name: 'KI-Anbieter', value: ki.anbieter },
    { name: 'KI-Modell', value: ki.modell || 'unbekannt' },
    { name: 'KI-Datum', value: ki.am },
    { name: 'Erzeugt mit', value: 'Schul-Apps' }
  ]
}

/** Stichwörter für Word/PDF */
export const kiStichwoerter = (ki: KiHerkunft | undefined): string => (ki ? `KI-generiert; AI-generated; ${ki.anbieter}; ${ki.modell}`.replace(/; $/, '') : '')

/** Eigenschaften für `new Document({...})` der Word-Bibliothek: Beschreibung, Stichwörter, benutzerdefinierte Felder */
export function kiWordEigenschaften(ki: KiHerkunft | undefined): {
  description?: string
  keywords?: string
  customProperties?: { name: string; value: string }[]
} {
  if (!ki) return {}
  return { description: kiVermerkText(ki), keywords: kiStichwoerter(ki), customProperties: kiEigenschaften(ki) }
}

/*
 * PDF: Das PDF entsteht im Hauptprozess aus fertigem HTML. Statt jeden Aufruf um ein Feld zu
 * erweitern, steht die Herkunft als <meta>-Zeile im HTML-Kopf; der Hauptprozess liest sie und
 * schreibt sie nach dem Drucken ins Info-Verzeichnis des PDF.
 */
const META_NAME = 'schulapps-ki'

const htmlAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function kiMetaTag(ki: KiHerkunft | undefined): string {
  return ki ? `<meta name="${META_NAME}" content="${htmlAttr(JSON.stringify(ki))}">` : ''
}

export function leseKiMeta(html: string): KiHerkunft | null {
  const m = html.slice(0, 20000).match(new RegExp(`<meta name="${META_NAME}" content="([^"]*)">`))
  if (!m) return null
  try {
    const roh = JSON.parse(
      m[1]
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    ) as Partial<KiHerkunft>
    return typeof roh.anbieter === 'string' && typeof roh.am === 'string' ? { anbieter: roh.anbieter, modell: String(roh.modell ?? ''), am: roh.am } : null
  } catch {
    return null
  }
}
