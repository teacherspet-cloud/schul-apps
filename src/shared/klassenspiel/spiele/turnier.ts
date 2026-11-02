/**
 * Turnier-Tische (Teams, 02.11.2026 – Teams-Games-Tournament nach DeVries & Slavin): Gemischte Stammteams; gespielt wird
 * an Tischen mit 2–3 Gleichstarken. Je Runde bekommt jeder Tisch dieselben 5 Fragen (auf das Niveau des Tisches
 * abgestimmt). Platz am Tisch → Punkte für das Stammteam (6 / 4 / 2, Gleichstand teilt). Danach wird umgesetzt
 * („bumping"): Tischsieger:in einen Tisch hoch, Letzte:r einen runter. So hat jede:r eine echte Gewinnchance und trägt
 * gleich viel zum Team bei.
 *
 * Abgestimmt: Die Einteilung soll zufällig wirken – Tischnamen werden jede Runde neu verlost, der Beamer zeigt keine
 * Namen an den Tischen und keine Reihenfolge nach Stärke.
 * BELEGT: TGT (Slavin) – Teamwertung, individuelle Verantwortung, gleiche Erfolgschancen.
 * FAUSTREGEL: 5 Fragen je Runde, Runden = Dauer ÷ 3 (2–5), Punkte 6/4/2.
 */
import { mischen } from '../../mehrspieler/kern'
import { umsetzen } from '../teams'
import { aufgabeBauen, meldung, naechsteAufgabe, teamGroesse, type BBlock, type KBasis, type KlassenRegeln } from '../kern'
import type { Stufe } from '../adaptiv'

export const FRAGEN_JE_RUNDE = 5
const PLATZ_PUNKTE = [6, 4, 2]
const SYMBOLE = ['🍎', '🍐', '🍋', '🍇', '🍓', '🍒', '🥝', '🍍', '🥥', '🍉', '🍑', '🫐']

interface Tisch {
  name: string
  fragen: { item: string; stufe: Stufe }[]
  stand: Record<string, { idx: number; richtig: number }>
}

export interface Turnier extends KBasis {
  runde: number
  runden: number
  rundeBis: number
  /** Tische dieser Runde (Reihenfolge wie z.tische: stark → schwach) */
  tischRunde: Tisch[]
  /** Punkte je Stammteam (Summe) */
  punkte: number[]
  /** Tischsiege je Person (alleiniger erster Platz mit mindestens einer richtigen Antwort) */
  tischSiege: Record<string, number>
}

export const rundenFuer = (z: KBasis): number => Math.max(2, Math.min(5, Math.round(z.einst.dauer / 3)))
const rundeMs = (z: Turnier): number => (z.einst.dauer * 60_000) / z.runden

function tischVon(z: Turnier, wer: string): number {
  return z.tische.findIndex((t) => t.includes(wer))
}

function rundeStarten(z: Turnier, jetzt: number): void {
  const namen = mischen(z, SYMBOLE)
  z.tischRunde = z.tische.map((t, i) => {
    const sortiert = t.filter((id) => z.personen[id]).sort((a, b) => z.personen[a].theta - z.personen[b].theta)
    const vertreter = sortiert[Math.floor(sortiert.length / 2)] ?? t[0]
    const fragen: Tisch['fragen'] = []
    for (let k = 0; k < FRAGEN_JE_RUNDE && vertreter; k++) {
      const a = naechsteAufgabe(z, vertreter, jetzt, null, { meiden: fragen.map((f) => f.item) })
      if (a) fragen.push({ item: a.item, stufe: a.stufe })
    }
    return { name: `Tisch ${namen[i % namen.length]}`, fragen, stand: Object.fromEntries(t.map((id) => [id, { idx: 0, richtig: 0 }])) }
  })
  z.rundeBis = Math.min(z.bis, jetzt + rundeMs(z))
  for (const p of Object.values(z.personen)) p.aufgabe = null
}

function rundeBeenden(z: Turnier, jetzt: number): void {
  const rang: Record<string, number> = {}
  z.tische.forEach((t, i) => {
    const st = z.tischRunde[i]?.stand ?? {}
    const sortiert = [...t].sort((a, b) => (st[b]?.richtig ?? 0) - (st[a]?.richtig ?? 0))
    // Plätze mit Gleichstand: gleiche Punkte (Mittel der Plätze)
    let k = 0
    while (k < sortiert.length) {
      let m = k
      while (m + 1 < sortiert.length && (st[sortiert[m + 1]]?.richtig ?? 0) === (st[sortiert[k]]?.richtig ?? 0)) m++
      const pkt = PLATZ_PUNKTE.slice(k, m + 1).reduce((s, x) => s + x, 0) / (m - k + 1) || 2
      for (let j = k; j <= m; j++) {
        const id = sortiert[j]
        rang[id] = k + 1
        if (k === 0 && m === 0 && (st[id]?.richtig ?? 0) > 0 && sortiert.length > 1) z.tischSiege[id] = (z.tischSiege[id] ?? 0) + 1
        const team = z.personen[id]?.team ?? -1
        if (team >= 0) z.punkte[team] = (z.punkte[team] ?? 0) + pkt
      }
      k = m + 1
    }
  })
  meldung(z, `Runde ${z.runde} vorbei – es wird neu gesetzt.`, 'info')
  z.tische = umsetzen(z.tische, rang)
  if (z.runde >= z.runden) {
    z.ende = true
    return
  }
  z.runde++
  z.level = Math.min(6, z.runde * 2 - 1)
  rundeStarten(z, jetzt)
}

const tischFertig = (z: Turnier, i: number): boolean =>
  z.tische[i].filter((id) => z.personen[id]).every((id) => (z.tischRunde[i]?.stand[id]?.idx ?? 0) >= (z.tischRunde[i]?.fragen.length ?? 0))

export const teamStand = (z: Turnier, t: number): number => Math.round(((z.punkte[t] ?? 0) / teamGroesse(z, t)) * 10) / 10

export const turnier: KlassenRegeln<Turnier> = {
  id: 'turnier',
  start(z, jetzt) {
    const t = Object.assign(z, { runde: 1, runden: rundenFuer(z), rundeBis: 0, tischRunde: [], punkte: z.teams.map(() => 0), tischSiege: {} }) as Turnier
    rundeStarten(t, jetzt)
    return t
  },
  aufgabeFuer(z, wer, jetzt) {
    const i = tischVon(z, wer)
    const tisch = z.tischRunde[i]
    const st = tisch?.stand[wer]
    if (!tisch || !st || st.idx >= tisch.fragen.length) return null
    const f = tisch.fragen[st.idx]
    return aufgabeBauen(z, wer, f.item, f.stufe, jetzt)
  },
  frageZeigen(z, wer) {
    const i = tischVon(z, wer)
    const tisch = z.tischRunde[i]
    const st = tisch?.stand[wer]
    return Boolean(tisch && st && st.idx < tisch.fragen.length)
  },
  nachAntwort(z, wer, _a, richtig, _p, jetzt) {
    const i = tischVon(z, wer)
    const st = z.tischRunde[i]?.stand[wer]
    if (!st) return
    st.idx++
    if (richtig) st.richtig++
    if (z.tische.every((_, k) => tischFertig(z, k))) rundeBeenden(z, jetzt)
  },
  tick(z, jetzt) {
    let geaendert = false
    // Später Dazugekommene: an den kleinsten Tisch
    for (const p of Object.values(z.personen)) {
      if (tischVon(z, p.id) >= 0) continue
      const k = z.tische.map((t, i) => ({ i, n: t.length })).sort((a, b) => a.n - b.n)[0]?.i ?? -1
      if (k < 0) z.tische.push([p.id])
      else z.tische[k].push(p.id)
      const tisch = z.tischRunde[k]
      if (tisch) tisch.stand[p.id] = { idx: 0, richtig: 0 }
      geaendert = true
    }
    if (jetzt >= z.rundeBis && !z.ende) {
      rundeBeenden(z, jetzt)
      geaendert = true
    }
    return geaendert
  },
  geraet(z, wer) {
    const i = tischVon(z, wer)
    const tisch = z.tischRunde[i]
    const st = tisch?.stand[wer]
    const team = z.personen[wer]?.team ?? -1
    const mit = (z.tische[i] ?? []).filter((id) => id !== wer).map((id) => z.personen[id]?.name ?? '')
    return [
      { typ: 'text', text: `Runde ${z.runde}/${z.runden} · ${tisch?.name ?? ''}${mit.length ? ` mit ${mit.join(', ')}` : ''}${team >= 0 ? ` · für ${z.teams[team].symbol} Team ${z.teams[team].name}` : ''}` },
      ...(tisch && st && st.idx >= tisch.fragen.length ? [{ typ: 'text' as const, text: `Fertig: ${st.richtig} von ${tisch.fragen.length} richtig. Warte auf die anderen am Tisch …`, gross: true }] : []),
      ...(tisch && st && st.idx < tisch.fragen.length ? [{ typ: 'fortschritt' as const, titel: `Frage ${st.idx + 1} von ${tisch.fragen.length}`, wert: st.idx, max: tisch.fragen.length, ton: 'info' as const }] : [])
    ]
  },
  beamer(z) {
    const aus: BBlock[] = [
      {
        typ: 'bahnen',
        seil: false,
        teams: z.teams.map((t, i) => ({ name: t.name, farbe: t.farbe, symbol: t.symbol, wert: teamStand(z, i), ziel: z.runden * 6, n: teamGroesse(z, i) }))
      },
      {
        typ: 'tische',
        runde: z.runde,
        von: z.runden,
        // Nach Namen sortiert – nie nach Stärke
        tische: z.tischRunde
          .map((t, i) => ({ name: t.name, fertig: z.tische[i].filter((id) => (t.stand[id]?.idx ?? 0) >= t.fragen.length).length, gesamt: z.tische[i].length }))
          .sort((a, b) => a.name.localeCompare(b.name))
      }
    ]
    return aus
  },
  auszeichnung(z, wer) {
    return { tischSiege: z.tischSiege[wer] ?? 0 }
  },
  ergebnis(z) {
    const werte = z.teams.map((_, i) => teamStand(z, i))
    const max = Math.max(...werte)
    const sieger = werte.map((w, i) => (w === max ? i : -1)).filter((i) => i >= 0)
    const text = sieger.length === 1 ? `${z.teams[sieger[0]].symbol} Team ${z.teams[sieger[0]].name} gewinnt das Turnier!` : `Unentschieden: ${sieger.map((i) => z.teams[i].name).join(' und ')}!`
    const r = Object.values(z.personen).reduce((s, p) => s + p.richtig, 0)
    return {
      text,
      teams: z.teams.map((t, i) => ({ nr: i, name: t.name, farbe: t.farbe, symbol: t.symbol, wert: werte[i] })),
      siegerTeams: sieger,
      klassenwert: r,
      klassenwertText: `${r} richtige Antworten`
    }
  }
}
