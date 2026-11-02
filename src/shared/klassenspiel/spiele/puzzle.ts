/**
 * Team-Puzzle (Koop in kleinen Teams, 02.11.2026 – nach dem Prinzip von Quizlet Live): Teams aus 3–4 Lernenden sitzen
 * zusammen. Alle Geräte eines Teams zeigen DIESELBE Frage, die Antwortkarten sind aber auf die Geräte verteilt – nur ein
 * Gerät hat die richtige. Das Team muss sprechen. Richtig: ein Schritt vor; falsch: zwei zurück (kein Raten). Ziel: 12
 * Schritte. Klassenziel: alle Teams im Ziel.
 *
 * BELEGT: Quizlet Live (Intergruppen-Wettbewerb) verbesserte Wortschatz und Motivation gegenüber nicht-kompetitivem
 * Unterricht; positive Interdependenz (jede:r hält ein Teil der Lösung) ist ein Kern kooperativen Lernens.
 * FAUSTREGEL: 12 Schritte, −2 bei Fehlern, neue Frage nach 30 s ohne Antwort (jemand mit der richtigen Karte fehlt).
 */
import { antwortRichtig, mischen, type Block } from '../../mehrspieler/kern'
import { schwierigkeitVon } from '../adaptiv'
import { meldung, naechsteAufgabe, teamGroesse, verbuchen, type BBlock, type KAufgabe, type KBasis, type KlassenRegeln } from '../kern'

export const PUZZLE_ZIEL = 12
const NEU_NACH_MS = 30_000

interface TeamFrage {
  aufgabe: KAufgabe
  /** Karten je Person */
  karten: Record<string, string[]>
  seit: number
}

export interface Puzzle extends KBasis {
  schritte: number[]
  fertig: (number | null)[]
  frage: (TeamFrage | null)[]
  rueck: ({ nr: number; richtig: boolean; text: string } | null)[]
  verlaufNr: number
}

/** Frage für ein Team: Stellvertretung mit mittlerem Niveau, nur Stufe 1–2 (Auswahl), Karten reihum verteilt */
function teamFrage(z: Puzzle, t: number, jetzt: number): TeamFrage | null {
  const leute = z.teams[t]?.mitglieder.filter((id) => z.personen[id]) ?? []
  if (!leute.length) return null
  const sortiert = [...leute].sort((a, b) => z.personen[a].theta - z.personen[b].theta)
  const vertreter = sortiert[Math.floor(sortiert.length / 2)]
  const optionen = Math.min(8, Math.max(4, leute.length * 2))
  const alt = z.frage[t]?.aufgabe.item
  const a = naechsteAufgabe(z, vertreter, jetzt, null, { stufen: [1, 2], optionen, meiden: alt ? [alt] : [] })
  if (!a) return null
  const karten: Record<string, string[]> = Object.fromEntries(leute.map((id) => [id, [] as string[]]))
  const reihum = mischen(z, leute)
  mischen(z, a.frage.optionen).forEach((o, i) => karten[reihum[i % reihum.length]].push(o))
  return { aufgabe: a, karten, seit: jetzt }
}

const teamVon = (z: Puzzle, wer: string): number => z.personen[wer]?.team ?? -1

export const puzzle: KlassenRegeln<Puzzle> = {
  id: 'puzzle',
  start(z, jetzt) {
    const n = z.teams.length
    const p = Object.assign(z, { schritte: Array(n).fill(0), fertig: Array(n).fill(null), frage: Array(n).fill(null), rueck: Array(n).fill(null), verlaufNr: 0 }) as Puzzle
    for (let t = 0; t < n; t++) p.frage[t] = teamFrage(p, t, jetzt)
    return p
  },
  nachAntwort() {
    // Die Teamwertung macht `antwort` (geteilte Frage)
  },
  antwort(z, wer, wert, jetzt) {
    const t = teamVon(z, wer)
    const f = t >= 0 ? z.frage[t] : null
    if (!f || z.fertig[t] !== null) return null
    const w = String(wert ?? '')
    if (!(f.karten[wer] ?? []).includes(w)) return null
    const richtig = antwortRichtig(f.aufgabe.frage, w)
    // Für die antwortende Person verbuchen (Elo, Kasten), mit ihrem eigenen Band
    verbuchen(z, puzzle, wer, { ...f.aufgabe, b: schwierigkeitVon(z.band[wer]?.[f.aufgabe.item], f.aufgabe.stufe) }, richtig, jetzt)
    if (z.personen[wer]) z.personen[wer].rueck = null
    z.schritte[t] = richtig ? z.schritte[t] + 1 : Math.max(0, z.schritte[t] - 2)
    z.rueck[t] = { nr: ++z.verlaufNr, richtig, text: richtig ? `${z.personen[wer]?.name ?? ''}: richtig!` : `${z.personen[wer]?.name ?? ''}: falsch – richtig war „${f.aufgabe.frage.loesung}“. Zwei Schritte zurück.` }
    if (z.schritte[t] >= PUZZLE_ZIEL) {
      z.fertig[t] = jetzt
      z.frage[t] = null
      meldung(z, `${z.teams[t].symbol} Team ${z.teams[t].name} ist im Ziel!`, 'gut')
      if (z.fertig.every((x) => x !== null)) {
        z.sieg = true
        z.ende = true
        meldung(z, 'Alle Teams im Ziel! 🎉', 'gut')
      }
    } else z.frage[t] = teamFrage(z, t, jetzt)
    return { richtig }
  },
  tick(z, jetzt) {
    let geaendert = false
    for (let t = 0; t < z.teams.length; t++) {
      while (z.schritte.length <= t) z.schritte.push(0), z.fertig.push(null), z.frage.push(null), z.rueck.push(null)
      if (z.fertig[t] !== null) continue
      const f = z.frage[t]
      const leute = z.teams[t].mitglieder.filter((id) => z.personen[id])
      // Neue Frage: keine da, zu alt (jemand mit der richtigen Karte fehlt) oder ein neues Mitglied ohne Karten
      if (!f || jetzt - f.seit > NEU_NACH_MS || leute.some((id) => !f.karten[id])) {
        z.frage[t] = teamFrage(z, t, jetzt)
        geaendert = true
      }
    }
    return geaendert
  },
  geraetFrage(z, wer) {
    const t = teamVon(z, wer)
    if (t < 0) return [{ typ: 'text', text: 'Gleich bekommst du ein Team.', ton: 'info' }]
    const aus: Block[] = []
    const r = z.rueck[t]
    if (r) aus.push({ typ: 'text', text: r.text, ton: r.richtig ? 'gut' : 'schlecht' })
    if (z.fertig[t] !== null) return [...aus, { typ: 'text', text: '🏁 Euer Team ist im Ziel! Helft den anderen mit Daumendrücken.', gross: true }]
    const f = z.frage[t]
    if (!f) return [...aus, { typ: 'text', text: 'Einen Moment …', ton: 'leise' }]
    const eigene = f.karten[wer] ?? []
    aus.push({
      typ: 'frage',
      frage: f.aufgabe.frage.frage,
      ...(f.aufgabe.frage.zusatz ? { zusatz: f.aufgabe.frage.zusatz } : {}),
      optionen: eigene,
      aktion: 'antwort'
    })
    aus.push({ typ: 'text', text: 'Nur ein Gerät in eurem Team hat die richtige Karte – redet miteinander!', ton: 'leise' })
    return aus
  },
  beamer(z) {
    const imZiel = z.fertig.filter((x) => x !== null).length
    const aus: BBlock[] = [
      {
        typ: 'bahnen',
        seil: false,
        teams: z.teams.map((t, i) => ({ name: t.name, farbe: t.farbe, symbol: t.symbol, wert: z.schritte[i] ?? 0, ziel: PUZZLE_ZIEL, n: teamGroesse(z, i) }))
      },
      { typ: 'zahlen', eintraege: [{ titel: 'Teams im Ziel', wert: `${imZiel} / ${z.teams.length}` }] }
    ]
    return aus
  },
  geraet(z, wer) {
    const t = teamVon(z, wer)
    if (t < 0) return []
    return [{ typ: 'fortschritt', titel: `${z.teams[t].symbol} Team ${z.teams[t].name}: ${z.schritte[t] ?? 0} / ${PUZZLE_ZIEL}`, wert: z.schritte[t] ?? 0, max: PUZZLE_ZIEL, ton: 'info' }]
  },
  ergebnis(z) {
    const imZiel = z.fertig.map((f, i) => ({ f, i })).filter((x) => x.f !== null).sort((a, b) => a.f! - b.f!)
    const max = Math.max(...z.schritte)
    const sieger = imZiel.length ? [imZiel[0].i] : z.schritte.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0)
    const text = z.sieg
      ? `Alle Teams im Ziel! Zuerst: ${z.teams[sieger[0]].symbol} Team ${z.teams[sieger[0]].name}.`
      : `${imZiel.length} von ${z.teams.length} Teams im Ziel.`
    const gesamt = z.schritte.reduce((s, x) => s + x, 0)
    return {
      text,
      sieg: z.sieg,
      teams: z.teams.map((t, i) => ({ nr: i, name: t.name, farbe: t.farbe, symbol: t.symbol, wert: z.schritte[i] ?? 0 })),
      siegerTeams: sieger,
      klassenwert: gesamt,
      klassenwertText: `${gesamt} Schritte aller Teams`
    }
  }
}
