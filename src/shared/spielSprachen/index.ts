/**
 * Sprachpakete der Spiele (09.10.2026): alle Fremdsprachen der App außer denen der Haupttabellen (de, en, fr, es, it,
 * la in spielSprache.ts/spielTexte.ts/reiseLexikon.ts). Neue Sprache: Datei anlegen und hier eintragen.
 */
import type { SprachPaket } from './typ'
import { ar } from './ar'
import { cs } from './cs'
import { da } from './da'
import { el } from './el'
import { grc } from './grc'
import { ja } from './ja'
import { nl } from './nl'
import { pl } from './pl'
import { pt } from './pt'
import { ru } from './ru'
import { tr } from './tr'
import { zh } from './zh'

export const PAKETE: Record<string, SprachPaket> = { ar, cs, da, el, grc, ja, nl, pl, pt, ru, tr, zh }
