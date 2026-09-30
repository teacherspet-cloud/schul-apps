import { DesignTemplate, STANDARD_DESIGN_ID, normalizeDesign, presetDesigns } from '@shared/design'
import { readJson, writeJson } from './settings'

const FILE = 'worksheet-designs.json'
const VERSION_FILE = 'worksheet-designs-version.json'
/** Stand der mitgelieferten Vorlagen; bei Erhöhung werden gespeicherte Vorlagen einmalig angepasst */
const DESIGN_VERSION = 4

interface VersionsStand {
  version: number
  /** Die Lehrkraft hat die Standardvorlage selbst festgelegt (ab 30.09.2026 vermerkt) */
  standardGewaehlt?: boolean
}

const stand = (): VersionsStand => readJson<VersionsStand>(VERSION_FILE, { version: 1 })

/** Vermerkt, dass die Lehrkraft die Standardvorlage bewusst gewählt hat – eine spätere Umstellung lässt sie dann unberührt */
function standardGewaehltMerken(): void {
  writeJson(VERSION_FILE, { ...stand(), standardGewaehlt: true })
}

/** Fehlt eine Standardvorlage, gilt die mitgelieferte („Farbband"), sonst die erste */
function standardSichern(designs: DesignTemplate[]): void {
  if (designs.some((d) => d.isDefault)) return
  ;(designs.find((d) => d.id === STANDARD_DESIGN_ID) ?? designs[0]).isDefault = true
}

/** Einmalige Anpassungen gespeicherter Vorlagen an neue Vorgaben. */
function migrate(designs: DesignTemplate[]): DesignTemplate[] {
  const { version, standardGewaehlt } = stand()
  if (version >= DESIGN_VERSION) return designs
  let result = designs
  if (version < 2) {
    // Arbeitsblätter: Schüler tragen nur noch das Datum ein
    result = result.map((d) => ({ ...d, header: { ...d.header, fields: { name: false, class: false, date: true } } }))
  }
  if (version < 3) {
    // Barrierearme Vorlage auf die Werte des BDA-Leitfadens gebracht (14 pt, Zeilenabstand 1,5)
    const fixed = presetDesigns().find((p) => p.id === 'preset-barrierearm')
    if (fixed) result = result.map((d) => (d.id === 'preset-barrierearm' ? { ...fixed, name: d.name, isDefault: d.isDefault } : d))
  }
  // Neu mitgelieferte Vorlagen ergänzen, ohne eigene Vorlagen zu verändern
  for (const preset of presetDesigns()) if (!result.some((d) => d.id === preset.id)) result.push({ ...preset, isDefault: false })
  if (version < 4 && !standardGewaehlt) {
    /*
     * Standard jetzt „Farbband" (Wunsch der Lehrkraft, 30.09.2026). Umgestellt wird nur, wenn noch
     * der alte Werksstandard „Klassisch" gilt – eine andere Standardvorlage hat die Lehrkraft
     * selbst gewählt und behält sie. Gespeicherte Materialien tragen ihre Vorlage selbst.
     */
    const bisher = result.find((d) => d.isDefault)
    if ((!bisher || bisher.id === 'preset-klassisch') && result.some((d) => d.id === STANDARD_DESIGN_ID))
      result = result.map((d) => ({ ...d, isDefault: d.id === STANDARD_DESIGN_ID }))
  }
  writeJson(FILE, result)
  writeJson(VERSION_FILE, { ...stand(), version: DESIGN_VERSION })
  return result
}

/** Alle Designvorlagen; beim ersten Aufruf werden die mitgelieferten angelegt. */
export function listDesigns(): DesignTemplate[] {
  const stored = readJson<DesignTemplate[] | null>(FILE, null)
  if (!stored || !Array.isArray(stored) || stored.length === 0) {
    const presets = presetDesigns()
    writeJson(FILE, presets)
    writeJson(VERSION_FILE, { version: DESIGN_VERSION })
    return presets
  }
  const designs = migrate(stored.map((d) => normalizeDesign(d)))
  standardSichern(designs)
  return designs
}

export function saveDesign(design: DesignTemplate): DesignTemplate[] {
  const designs = listDesigns()
  const normalized = normalizeDesign(design)
  const index = designs.findIndex((d) => d.id === normalized.id)
  const bisher = designs.find((d) => d.isDefault)?.id
  if (index >= 0) designs[index] = normalized
  else designs.push(normalized)
  if (normalized.isDefault) {
    designs.forEach((d) => (d.isDefault = d.id === normalized.id))
    if (bisher !== normalized.id) standardGewaehltMerken()
  }
  writeJson(FILE, designs)
  return designs
}

export function deleteDesign(id: string): DesignTemplate[] {
  let designs = listDesigns()
  if (designs.length <= 1) throw new Error('Die letzte Designvorlage kann nicht gelöscht werden.')
  designs = designs.filter((d) => d.id !== id)
  standardSichern(designs)
  writeJson(FILE, designs)
  return designs
}

export function setDefaultDesign(id: string): DesignTemplate[] {
  const designs = listDesigns()
  designs.forEach((d) => (d.isDefault = d.id === id))
  writeJson(FILE, designs)
  standardGewaehltMerken()
  return designs
}
