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
  const text = (search ?? '').trim()
  if (!text) return options
  const lower = text.toLowerCase()
  // Auch gruppierte Listen (Lehrplan: Oberthema → Themen, Großprogramm 0.4)
  const alle = options.flatMap((o) => ('items' in o ? (o.items as ComboboxItem[]) : [o as ComboboxItem]))
  if (alle.some((o) => o.label.toLowerCase() === lower)) return options
  const passt = (o: ComboboxItem): boolean => o.label.toLowerCase().includes(lower)
  const treffer = options
    .map((o) =>
      'items' in o
        ? {
            ...o,
            items: (o.items as ComboboxItem[]).filter(
              (i) =>
                passt(i) ||
                String(o.group ?? '')
                  .toLowerCase()
                  .includes(lower)
            )
          }
        : o
    )
    .filter((o) => ('items' in o ? o.items.length > 0 : passt(o as ComboboxItem)))
  return treffer.length ? treffer : options
}
