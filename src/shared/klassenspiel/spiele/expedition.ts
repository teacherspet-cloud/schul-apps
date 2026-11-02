/**
 * Klassen-Expedition (Koop, 02.11.2026): Die ganze Klasse steigt gemeinsam auf einen Gipfel mit 6 Lagern.
 *
 * Ein Lager ist geschafft, wenn die Klasse genug richtige Schritte gesammelt hat UND sorgfältig bleibt (Quote der letzten
 * 30 Antworten ≥ 70 %). So zählt nicht nur Tempo – raten lohnt sich nicht. Fehler kosten keinen Fortschritt (Koop: keine
 * Schuld bei Einzelnen). Im Modus „Level" hebt jedes Lager die Antwortform (erkennen → schreiben → anwenden).
 *
 * FAUSTREGEL: Schritte je Lager = max(8, 2,5 × Personen) · Dauer/10; Quote 70 %.
 */
import { kt, ktListe } from '../texte'
import { klassenQuote, klassenwertVon, meldung, type BBlock, type KBasis, type KlassenRegeln } from '../kern'

export const LAGER = 6
export const ZIEL_QUOTE = 0.7
const namen = (z: KBasis): string[] => Array.from({ length: LAGER }, (_, i) => ktListe(z.sprache, 'lager', i))

export interface Expedition extends KBasis {
  lager: number
  fort: number
  /** Hinweis „zu viele Fehler" schon gegeben (für dieses Lager) */
  gebremst: boolean
}

export const schritteJeLager = (z: KBasis): number =>
  Math.max(8, Math.round(Object.keys(z.personen).length * 2.5 * Math.max(0.5, z.einst.dauer / 10)))

export const expedition: KlassenRegeln<Expedition> = {
  id: 'expedition',
  start(z) {
    return Object.assign(z, { lager: 0, fort: 0, gebremst: false, level: 1 })
  },
  nachAntwort(z, _wer, a, richtig) {
    if (!richtig) return
    z.fort += a.stufe >= 3 ? 1.5 : 1
    const ziel = schritteJeLager(z)
    if (z.fort < ziel) return
    const q = klassenQuote(z)
    if (q !== null && q < ZIEL_QUOTE) {
      z.fort = ziel
      if (!z.gebremst) meldung(z, kt(z.sprache, 'exZuVieleFehler'), 'warn')
      z.gebremst = true
      return
    }
    z.lager++
    z.fort = 0
    z.gebremst = false
    z.level = Math.min(6, z.lager + 1)
    if (z.lager >= LAGER) {
      z.sieg = true
      z.ende = true
      meldung(z, kt(z.sprache, 'exGipfel'), 'gut')
    } else meldung(z, kt(z.sprache, 'exGeschafft', namen(z)[z.lager - 1], namen(z)[z.lager]), 'gut')
  },
  beamer(z) {
    const ziel = schritteJeLager(z)
    const q = klassenQuote(z)
    const r = Object.values(z.personen).reduce((s, p) => s + p.richtig, 0)
    const aus: BBlock[] = [
      { typ: 'berg', lager: z.lager, von: LAGER, anteil: Math.min(1, z.fort / ziel), quote: q, zielQuote: ZIEL_QUOTE, namen: namen(z), titel: kt(z.sprache, 'exLager', z.lager, LAGER), ...(z.gebremst ? { hinweis: kt(z.sprache, 'exHinweis') } : {}) },
      {
        typ: 'zahlen',
        eintraege: [
          { titel: kt(z.sprache, 'zRichtig'), wert: String(r) },
          { titel: kt(z.sprache, 'exSorgfalt'), wert: q === null ? '–' : `${Math.round(q * 100)} %` },
          { titel: kt(z.sprache, 'zDabei'), wert: String(Object.keys(z.personen).length) }
        ]
      }
    ]
    return aus
  },
  geraet(z) {
    const ziel = schritteJeLager(z)
    return [
      { typ: 'fortschritt', titel: `🏔️ ${namen(z)[Math.min(LAGER - 1, z.lager)]} · ${z.lager}/${LAGER}`, wert: Math.min(ziel, z.fort), max: ziel, ton: z.gebremst ? 'warn' : 'info' },
      ...(z.gebremst ? [{ typ: 'text' as const, text: kt(z.sprache, 'exSorgfaltGeraet'), ton: 'warn' as const }] : [])
    ]
  },
  ergebnis(z) {
    const text = z.sieg ? kt(z.sprache, 'exErgebnisGipfel') : kt(z.sprache, 'exErgebnis', z.lager, LAGER)
    // Rekord: Lager zählen vor allem, dazu der Klassenwert
    return { text, sieg: z.sieg, klassenwert: z.lager * 1000 + Math.min(999, klassenwertVon(z)), klassenwertText: kt(z.sprache, 'exLager', z.lager, LAGER) }
  }
}
