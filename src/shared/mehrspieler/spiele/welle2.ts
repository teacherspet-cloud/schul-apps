/** Regelmodule der Welle 2 (08.10.2026) – Bildergeschichte, Übersetzungs-Puzzle und Zeitstrahl liegen in ordnen.ts */
import { bildergeschichte, uebersetzung, zeitstrahl } from './ordnen'
import { dialog, fehlerdetektive, hoerkette, kreuzwort, teammemory, wortkette } from './koop2'
import { reiseplaner } from './reiseplaner'
import { konjugation, kollokation, synonyme, umbau, woerterturm } from './rennen'
import { auktion, buzzer, domino, galgen, schnapp, sniper, stadtland } from './versus2'

export const WELLE2 = {
  wortkette,
  bildergeschichte,
  teammemory,
  kreuzwort,
  fehlerdetektive,
  uebersetzung,
  dialog,
  woerterturm,
  hoerkette,
  zeitstrahl,
  reiseplaner,
  schnapp,
  galgen,
  buzzer,
  konjugation,
  umbau,
  kollokation,
  auktion,
  domino,
  stadtland,
  sniper,
  synonyme
}
