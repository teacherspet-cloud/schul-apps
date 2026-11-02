/**
 * Gebietseroberung (Teams, 02.11.2026): Am Beamer liegt eine Karte aus 8 × 6 Feldern mit 1–3 Sternen. Vor jeder Frage
 * wählt man ★, ★★ oder ★★★ – die Schwierigkeit RELATIV zum eigenen Niveau (★ gelingt meist, ★★★ ist eine echte
 * Herausforderung). Richtig → das Team holt ein Feld mit so vielen Sternen, bevorzugt neben dem eigenen Gebiet;
 * ★★★ darf Felder anderer Teams nehmen. Stand je Team = Sterne ÷ Teamgröße (kleine Teams nicht im Nachteil).
 *
 * BELEGT (allgemein): Wahl der Schwierigkeit stärkt Autonomie (Selbstbestimmungstheorie); Herausforderung auf dem
 * eigenen Niveau. FAUSTREGEL: Ziel-P je Sternzahl 0,9 / 0,75 / 0,55; Sternverteilung 50 / 33 / 17 %.
 */
import { mischen, zufall } from '../../mehrspieler/kern'
import { meldung, teamGroesse, type BBlock, type KBasis, type KlassenRegeln } from '../kern'

export const SPALTEN = 8
export const ZEILEN = 6
const ZIEL_P_STERNE: Record<number, number> = { 1: 0.9, 2: 0.75, 3: 0.55 }

export interface Gebiet extends KBasis {
  felder: { sterne: number; team: number | null }[]
  wahl: Record<string, number | null>
  neu: number[]
}

const nachbarn = (i: number): number[] => {
  const x = i % SPALTEN
  const y = Math.floor(i / SPALTEN)
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1]
  ]
    .filter(([a, b]) => a >= 0 && a < SPALTEN && b >= 0 && b < ZEILEN)
    .map(([a, b]) => b * SPALTEN + a)
}

export const gebietWert = (z: Gebiet, t: number): number =>
  Math.round((z.felder.filter((f) => f.team === t).reduce((s, f) => s + f.sterne, 0) / teamGroesse(z, t)) * 10) / 10

/** Zielfeld für ein Team bei `sterne` – frei bevorzugt neben eigenem Gebiet; ★★★ nimmt auch fremde Felder */
export function zielFeld(z: Gebiet, team: number, sterne: number): number | null {
  const eigen = new Set(z.felder.map((f, i) => (f.team === team ? i : -1)).filter((i) => i >= 0))
  const amRand = (i: number): boolean => nachbarn(i).some((n) => eigen.has(n))
  const wahl = (liste: number[]): number | null => {
    if (!liste.length) return null
    const nah = liste.filter(amRand)
    return mischen(z, nah.length ? nah : liste)[0]
  }
  const frei = z.felder.map((f, i) => (f.team === null ? i : -1)).filter((i) => i >= 0)
  const fremd = z.felder.map((f, i) => (f.team !== null && f.team !== team ? i : -1)).filter((i) => i >= 0)
  if (sterne === 3) {
    const raub = wahl(fremd.filter((i) => amRand(i) || !eigen.size))
    if (raub !== null && zufall(z) < 0.5) return raub
  }
  return (
    wahl(frei.filter((i) => z.felder[i].sterne === sterne)) ??
    wahl(frei) ??
    // Alles verteilt: Felder anderer Teams mit höchstens so vielen Sternen
    wahl(fremd.filter((i) => z.felder[i].sterne <= sterne))
  )
}

export const gebiet: KlassenRegeln<Gebiet> = {
  id: 'gebiet',
  start(z) {
    const felder = Array.from({ length: SPALTEN * ZEILEN }, () => {
      const r = zufall(z)
      return { sterne: r < 0.5 ? 1 : r < 0.83 ? 2 : 3, team: null as number | null }
    })
    return Object.assign(z, { felder, wahl: {}, neu: [] })
  },
  zielP(z, wer) {
    return ZIEL_P_STERNE[z.wahl[wer] ?? 2] ?? null
  },
  frageZeigen(z, wer) {
    return Boolean(z.wahl[wer])
  },
  zug(z, wer, aktion, wert) {
    if (aktion !== 'sterne' || z.wahl[wer]) return false
    const s = Number(wert)
    if (![1, 2, 3].includes(s)) return false
    z.wahl[wer] = s
    if (z.personen[wer]) z.personen[wer].aufgabe = null
    return true
  },
  nachAntwort(z, wer, _a, richtig) {
    const s = z.wahl[wer] ?? 1
    z.wahl[wer] = null
    const t = z.personen[wer]?.team ?? -1
    if (!richtig || t < 0) return
    const i = zielFeld(z, t, s)
    if (i === null) return
    const vorher = z.felder[i].team
    z.felder[i].team = t
    z.neu = [...z.neu, i].slice(-6)
    if (vorher !== null && vorher !== t) meldung(z, `${z.teams[t].symbol} Team ${z.teams[t].name} erobert ein Feld von Team ${z.teams[vorher].name}!`, 'warn')
  },
  beamer(z) {
    const neu = new Set(z.neu)
    const aus: BBlock[] = [
      {
        typ: 'karte',
        spalten: SPALTEN,
        felder: z.felder.map((f, i) => ({ sterne: f.sterne, team: f.team, ...(neu.has(i) ? { neu: true } : {}) })),
        teams: z.teams.map((t, i) => ({ name: t.name, farbe: t.farbe, symbol: t.symbol, wert: gebietWert(z, i) }))
      }
    ]
    return aus
  },
  geraet(z, wer) {
    const t = z.personen[wer]?.team ?? -1
    const kopf =
      t >= 0
        ? [{ typ: 'text' as const, text: `${z.teams[t].symbol} Team ${z.teams[t].name}: ${gebietWert(z, t)} Sterne je Kopf · ${z.felder.filter((f) => f.team === t).length} Felder` }]
        : []
    if (z.wahl[wer]) return [...kopf, { typ: 'text', text: `Du spielst um ${'★'.repeat(z.wahl[wer]!)}`, ton: 'leise' }]
    return [
      ...kopf,
      { typ: 'text', text: 'Um wie viele Sterne spielst du?', gross: true },
      {
        typ: 'knoepfe',
        knoepfe: [
          { text: '★ sicher', aktion: 'sterne', wert: '1', farbe: 'gray' },
          { text: '★★ mittel', aktion: 'sterne', wert: '2', farbe: 'blue' },
          { text: '★★★ schwer – darf erobern', aktion: 'sterne', wert: '3', farbe: 'grape' }
        ]
      }
    ]
  },
  ergebnis(z) {
    const werte = z.teams.map((_, i) => gebietWert(z, i))
    const max = Math.max(...werte)
    const sieger = werte.map((w, i) => (w === max ? i : -1)).filter((i) => i >= 0)
    const text = sieger.length === 1 ? `${z.teams[sieger[0]].symbol} Team ${z.teams[sieger[0]].name} gewinnt mit ${max} Sternen je Kopf!` : `Unentschieden: ${sieger.map((i) => z.teams[i].name).join(' und ')}!`
    const gesamt = z.felder.filter((f) => f.team !== null).reduce((s, f) => s + f.sterne, 0)
    return {
      text,
      teams: z.teams.map((t, i) => ({ nr: i, name: t.name, farbe: t.farbe, symbol: t.symbol, wert: werte[i] })),
      siegerTeams: sieger,
      klassenwert: gesamt,
      klassenwertText: `${gesamt} Sterne erobert`
    }
  }
}
