/**
 * Klänge der übrigen Klassenspiele (20.11.2026): Diese Spiele haben keinen Ereignisstrom wie der Boss – der Beamer
 * vergleicht deshalb den neuen Stand mit dem vorigen und leitet daraus Klänge ab (Schritt, Etappe, Führungswechsel,
 * Feld erobert/gestohlen, Rekord, Seil-Ruck, neue Runde, Sturm). Je Aktualisierung höchstens ein paar Klänge.
 */
import type { BBlock } from '@shared/klassenspiel/kern'
import type { KlangArt } from './klangbild'

export interface KlangAnstoss {
  art: KlangArt
  staerke?: number
  /** Musik kurz leiser (großer Moment) */
  ducken?: boolean
}

type Block<T extends BBlock['typ']> = Extract<BBlock, { typ: T }>
const finde = <T extends BBlock['typ']>(b: BBlock[], typ: T): Block<T> | undefined => b.find((x): x is Block<T> => x.typ === typ)

/** Index des führenden Teams (null bei Gleichstand an der Spitze oder ohne Punkte) */
function fuehrend(werte: number[]): number | null {
  const max = Math.max(...werte)
  if (max <= 0) return null
  const an = werte.filter((w) => w === max).length
  return an === 1 ? werte.indexOf(max) : null
}

export function klangAusBloecken(vorher: BBlock[], jetzt: BBlock[]): KlangAnstoss[] {
  const aus: KlangAnstoss[] = []

  // Expedition: Schritt, Lager, Sturm (gebremst), Gipfel
  const b0 = finde(vorher, 'berg')
  const b1 = finde(jetzt, 'berg')
  if (b0 && b1) {
    if (b1.lager > b0.lager) aus.push(b1.lager >= b1.von ? { art: 'rekord', ducken: true } : { art: 'etappe', ducken: true })
    else if (b1.anteil > b0.anteil) aus.push({ art: 'schritt', staerke: 0.7 })
    if (b1.hinweis && !b0.hinweis) aus.push({ art: 'gebremst', ducken: true })
  }

  // Rennen/Puzzle/Turnier-Bahnen. Tauziehen (Seil) bleibt ohne Geräusche – Wunsch der Lehrkraft 27.11.2026,
  // nur die Musik läuft dort weiter.
  const n0 = finde(vorher, 'bahnen')
  const n1 = finde(jetzt, 'bahnen')
  if (n0 && n1 && !n1.seil && n0.teams.length === n1.teams.length) {
    const w0 = n0.teams.map((t) => t.wert)
    const w1 = n1.teams.map((t) => t.wert)
    const plus = w1.reduce((s, w, i) => s + Math.max(0, w - w0[i]), 0)
    if (plus > 0) aus.push({ art: 'schritt', staerke: 0.6 })
    const f0 = fuehrend(w0)
    const f1 = fuehrend(w1)
    if (f1 !== null && f0 !== null && f1 !== f0) aus.push({ art: 'fuehrung', ducken: true })
    const imZiel = (ts: typeof n1.teams): number => ts.filter((t) => t.ziel > 0 && t.wert >= t.ziel).length
    if (imZiel(n1.teams) > imZiel(n0.teams)) aus.push({ art: 'rekord', ducken: true })
  }

  // Gebiet: Feld erobert (vorher frei) oder gestohlen (vorher anderes Team)
  const k0 = finde(vorher, 'karte')
  const k1 = finde(jetzt, 'karte')
  if (k0 && k1 && k0.felder.length === k1.felder.length) {
    let erobert = 0
    let gestohlen = 0
    k1.felder.forEach((f, i) => {
      const alt = k0.felder[i].team
      if (f.team === null || f.team === alt) return
      if (alt === null) erobert++
      else gestohlen++
    })
    if (gestohlen) aus.push({ art: 'gestohlen', ducken: true })
    else if (erobert) aus.push({ art: 'erobert', staerke: 0.85 })
  }

  // Rekord: Schritt je Zuwachs, neuer Rekord beim Überholen der Bestmarke
  const r0 = finde(vorher, 'rekord')
  const r1 = finde(jetzt, 'rekord')
  if (r0 && r1 && r1.jetzt > r0.jetzt) {
    if (r1.bisher !== null && r0.jetzt <= r1.bisher && r1.jetzt > r1.bisher) aus.push({ art: 'rekord', ducken: true })
    else aus.push({ art: 'schritt', staerke: 0.6 })
  }

  // Wette: aufgelöste Einsätze
  const t0 = finde(vorher, 'treffsicherheit')
  const t1 = finde(jetzt, 'treffsicherheit')
  if (t0 && t1) {
    const richtig = (x: typeof t1): number => x.stufen.reduce((s, st) => s + st.richtig, 0)
    if (richtig(t1) > richtig(t0)) aus.push({ art: 'schritt', staerke: 0.6 })
  }

  // Turnier: neue Runde, fertige Tische, Antworten
  const z0 = finde(vorher, 'tische')
  const z1 = finde(jetzt, 'tische')
  if (z0 && z1) {
    if (z1.runde > z0.runde) aus.push({ art: 'runde', ducken: true })
    else {
      const fertig = (x: typeof z1): number => x.tische.filter((t) => t.gesamt > 0 && t.fertig >= t.gesamt).length
      const summe = (x: typeof z1): number => x.tische.reduce((s, t) => s + t.fertig, 0)
      if (fertig(z1) > fertig(z0)) aus.push({ art: 'etappe' })
      else if (summe(z1) > summe(z0)) aus.push({ art: 'schritt', staerke: 0.6 })
    }
  }
  return aus
}
