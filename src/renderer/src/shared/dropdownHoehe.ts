import type { PopoverProps } from '@mantine/core'

type PopoverMiddlewares = NonNullable<PopoverProps['middlewares']>

/**
 * Lange Menüs und Pop-ups rollen (01.10.2026).
 *
 * Befund der Lehrkraft am iPad: Die Auswahl der Bausteine („Darunter einfügen", „Baustein
 * hinzufügen", Einfügestelle der Gliederung) und ähnliche Pop-ups ließen sich nicht rollen. Die
 * Liste ist länger als der Bildschirm; Mantine setzt Menüs ohne Höhenbegrenzung, der Rest lag
 * unter dem Bildschirmrand. In einem Dialog verhinderte zusätzlich dessen Rollsperre
 * (react-remove-scroll) jedes Wischen, das nicht in einem rollbaren Bereich beginnt.
 *
 * Deshalb erhält jedes Menü und Pop-up die Höhe, die neben seinem Auslöser frei ist (floating-ui
 * `size`), und rollt, wenn der Inhalt höher ist. Rollt es nicht, bleibt `overflow` unberührt –
 * sonst schnitte es den Pfeil am Rand ab.
 */
const RAND = 8
/** Darunter wird nicht gestaucht – dann darf der Rand verdeckt werden, die Liste rollt trotzdem */
const MINDESTENS = 160

export const ROLL_GROESSE: Exclude<PopoverMiddlewares['size'], boolean | undefined> = {
  padding: RAND,
  apply({ availableHeight, elements }) {
    const el = elements.floating
    const hoehe = Math.max(MINDESTENS, Math.floor(availableHeight))
    el.style.maxHeight = `${hoehe}px`
    el.style.overflowY = el.scrollHeight > hoehe + 1 ? 'auto' : ''
  }
}

/** Standard für Popover (auch die Hauptmenüs, die darauf aufbauen) */
export const POPOVER_MIDDLEWARES: PopoverMiddlewares = { flip: true, shift: true, size: ROLL_GROESSE }
/** Untermenüs: Mantine verschiebt sie auch quer (crossAxis) – das bleibt */
export const UNTERMENUE_MIDDLEWARES: PopoverMiddlewares = { shift: { crossAxis: true }, size: ROLL_GROESSE }
