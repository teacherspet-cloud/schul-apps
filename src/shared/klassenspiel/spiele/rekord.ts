/**
 * Klasse gegen den eigenen Rekord (Koop, 02.11.2026): Die Klasse spielt gegen ihren letzten Bestwert – ohne jeden
 * Vergleich untereinander.
 *
 * Wert = Treffer je Kind und Minute × Sorgfalt (Quote). So ist der Rekord auch dann fair, wenn heute weniger Kinder da
 * sind oder die Runde kürzer ist, und Raten lohnt sich nicht (Sorgfalt zählt so viel wie Tempo).
 * FAUSTREGEL: die Formel selbst; Anzeige mit zwei Nachkommastellen.
 */
import { klassenQuote, levelNachZeit, meldung, type BBlock, type KBasis, type KlassenRegeln } from '../kern'

export interface RekordSpiel extends KBasis {
  ueberholt: boolean
}

/** Rekordwert (× 100 als ganze Zahl gespeichert) bis `jetzt` */
export function rekordWert(z: KBasis, jetzt: number): number {
  const leute = Object.values(z.personen).filter((p) => p.n > 0)
  if (!leute.length) return 0
  const r = leute.reduce((s, p) => s + p.richtig, 0)
  const n = leute.reduce((s, p) => s + p.n, 0)
  const minuten = Math.max(1, (Math.min(jetzt, z.bis) - z.start) / 60_000)
  return Math.round(((r / leute.length / minuten) * (r / n)) * 100)
}
export const rekordText = (w: number): string => `${(w / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Punkte je Kind und Minute`

const ende = (z: KBasis): number => z.verlauf[z.verlauf.length - 1]?.zeit ?? z.bis

export const rekord: KlassenRegeln<RekordSpiel> = {
  id: 'rekord',
  start(z) {
    return Object.assign(z, { ueberholt: false, level: 1 })
  },
  nachAntwort(z, _wer, _a, _r, _p, jetzt) {
    if (z.einst.schwierigkeit === 'level') z.level = levelNachZeit(z, jetzt)
    // Erst nach einer Minute vergleichen (vorher schwankt der Wert stark)
    if (!z.ueberholt && z.rekordBisher && jetzt - z.start > 60_000 && rekordWert(z, jetzt) > z.rekordBisher.wert) {
      z.ueberholt = true
      meldung(z, 'Ihr liegt über eurem Rekord – haltet durch!', 'gut')
    }
  },
  tick(z, jetzt) {
    if (z.einst.schwierigkeit !== 'level') return false
    const l = levelNachZeit(z, jetzt)
    if (l === z.level) return false
    z.level = l
    return true
  },
  beamer(z, jetzt) {
    const aus: BBlock[] = [
      {
        typ: 'rekord',
        jetzt: rekordWert(z, jetzt),
        bisher: z.rekordBisher?.wert ?? null,
        richtig: Object.values(z.personen).reduce((s, p) => s + p.richtig, 0),
        quote: klassenQuote(z, 60, 5)
      }
    ]
    return aus
  },
  geraet(z, _wer, jetzt) {
    const w = rekordWert(z, jetzt)
    const b = z.rekordBisher?.wert ?? null
    return [{ typ: 'fortschritt', titel: `🏁 Klasse: ${(w / 100).toFixed(2)}${b !== null ? ` · Rekord: ${(b / 100).toFixed(2)}` : ''}`, wert: w, max: Math.max(1, b ?? w, w), ton: b !== null && w > b ? 'gut' : 'info' }]
  },
  ergebnis(z) {
    const w = rekordWert(z, ende(z))
    const b = z.rekordBisher?.wert ?? null
    const sieg = w > 0 && (b === null || w > b)
    const text = b === null ? `Erster Rekord: ${rekordText(w)}.` : sieg ? `Neuer Rekord! ${rekordText(w)} (vorher ${(b / 100).toFixed(2)}).` : `${rekordText(w)} – der Rekord (${(b / 100).toFixed(2)}) hält noch.`
    return { text, sieg, klassenwert: w, klassenwertText: rekordText(w) }
  }
}
