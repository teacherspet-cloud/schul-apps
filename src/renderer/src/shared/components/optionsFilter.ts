import type { ComboboxItem, OptionsFilter } from '@mantine/core'

/**
 * Filter für Autocomplete-Felder mit Vorschlagsliste.
 *
 * Mantine filtert die Vorschläge nach dem Inhalt des Feldes. Steht dort schon ein gewählter
 * Wert, bliebe nur dieser eine Vorschlag übrig – dann ließe sich die Liste nicht mehr
 * durchsehen. Dieser Filter zeigt deshalb alle Vorschläge, solange nichts Neues getippt wurde,
 * und filtert erst, sobald der Text von allen Vorschlägen abweicht.
 */
export const suggestAll: OptionsFilter = ({ options, search }) => {
  const list = options as ComboboxItem[]
  const text = (search ?? '').trim()
  if (!text) return list
  const lower = text.toLowerCase()
  if (list.some((o) => o.label.toLowerCase() === lower)) return list
  const hits = list.filter((o) => o.label.toLowerCase().includes(lower))
  return hits.length ? hits : list
}
