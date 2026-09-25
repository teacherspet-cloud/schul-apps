import { DesignTemplate, normalizeDesign, presetDesigns } from '@shared/design'
import { readJson, writeJson } from './settings'

const FILE = 'worksheet-designs.json'
const VERSION_FILE = 'worksheet-designs-version.json'
/** Stand der mitgelieferten Vorlagen; bei Erhöhung werden gespeicherte Vorlagen einmalig angepasst */
const DESIGN_VERSION = 3

/** Einmalige Anpassungen gespeicherter Vorlagen an neue Vorgaben. */
function migrate(designs: DesignTemplate[]): DesignTemplate[] {
  const { version } = readJson<{ version: number }>(VERSION_FILE, { version: 1 })
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
  writeJson(FILE, result)
  writeJson(VERSION_FILE, { version: DESIGN_VERSION })
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
  if (!designs.some((d) => d.isDefault)) designs[0].isDefault = true
  return designs
}

export function saveDesign(design: DesignTemplate): DesignTemplate[] {
  const designs = listDesigns()
  const normalized = normalizeDesign(design)
  const index = designs.findIndex((d) => d.id === normalized.id)
  if (index >= 0) designs[index] = normalized
  else designs.push(normalized)
  if (normalized.isDefault) designs.forEach((d) => (d.isDefault = d.id === normalized.id))
  writeJson(FILE, designs)
  return designs
}

export function deleteDesign(id: string): DesignTemplate[] {
  let designs = listDesigns()
  if (designs.length <= 1) throw new Error('Die letzte Designvorlage kann nicht gelöscht werden.')
  designs = designs.filter((d) => d.id !== id)
  if (!designs.some((d) => d.isDefault)) designs[0].isDefault = true
  writeJson(FILE, designs)
  return designs
}

export function setDefaultDesign(id: string): DesignTemplate[] {
  const designs = listDesigns()
  designs.forEach((d) => (d.isDefault = d.id === id))
  writeJson(FILE, designs)
  return designs
}
