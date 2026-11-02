/**
 * Boss-Kampf (Koop, 02.11.2026): Die Klasse kämpft gemeinsam gegen einen Boss.
 *
 * - Richtige Antworten schaden dem Boss; geschriebene Antworten (Stufe 3–4) doppelt.
 * - Unter 66 % und 33 % Lebenspunkten trägt der Boss „Rüstung": Auswählen (Stufe 1–2) schadet nur halb.
 * - Was jemand falsch hatte, wird zum „Angriff" des Bosses und geht an andere Lernende, bis es jemand richtig hat –
 *   gemeinsamer Abruf der Fehler (Abruf in der Sitzung, Lerneffekt durch Wiederholung).
 * - Im Modus „Level" steigt die Antwortform mit der Phase.
 *
 * FAUSTREGEL: Lebenspunkte = Personen × Dauer (min) × 3,2 – bei ≈ 4 richtigen Antworten je Person und Minute fällt der
 * Boss nach etwa 70 % der Zeit.
 */
import { klassenwertVon, meldung, type BBlock, type KBasis, type KlassenRegeln } from '../kern'

const BOSSE = [
  { name: 'Grammatik-Drache', symbol: '🐉' },
  { name: 'Vokabel-Krake', symbol: '🐙' },
  { name: 'Fehlerteufel', symbol: '👹' },
  { name: 'Wort-Golem', symbol: '🗿' }
]

export interface Boss extends KBasis {
  boss: { name: string; symbol: string }
  hp: number
  max: number
  treffer: number
  /** Angriffe: Items, die jemand falsch hatte – mit der Person, die sie nicht noch einmal bekommt */
  angriffe: { item: string; von: string }[]
  abgewehrt: number
}

export const lebenFuer = (z: KBasis): number => Math.max(30, Math.round(Object.keys(z.personen).length * z.einst.dauer * 3.2))
export const phaseVon = (z: Boss): number => (z.hp > z.max * 0.66 ? 1 : z.hp > z.max * 0.33 ? 2 : 3)

export const boss: KlassenRegeln<Boss> = {
  id: 'boss',
  start(z) {
    const b = BOSSE[Math.floor((z.saat % 1000) / 250) % BOSSE.length]
    const max = lebenFuer(z)
    return Object.assign(z, { boss: b, hp: max, max, treffer: 0, angriffe: [], abgewehrt: 0, level: 1 })
  },
  vorschlag(z, wer) {
    // Jede dritte Aufgabe ein offener Angriff (nicht der eigene Fehler)
    const p = z.personen[wer]
    if (!p || p.n % 3 !== 2) return null
    return z.angriffe.find((a) => a.von !== wer)?.item ?? null
  },
  nachAntwort(z, wer, a, richtig) {
    const vorher = phaseVon(z)
    if (!richtig) {
      if (!z.angriffe.some((x) => x.item === a.item)) z.angriffe = [...z.angriffe, { item: a.item, von: wer }].slice(-40)
      return
    }
    const ruestung = phaseVon(z) > 1
    const schaden = (a.stufe >= 3 ? 2 : 1) * (ruestung && a.stufe <= 2 ? 0.5 : 1)
    z.hp = Math.max(0, z.hp - schaden)
    z.treffer++
    const i = z.angriffe.findIndex((x) => x.item === a.item)
    if (i >= 0) {
      z.angriffe.splice(i, 1)
      z.abgewehrt++
      if (z.abgewehrt % 5 === 0) meldung(z, `${z.abgewehrt} Angriffe abgewehrt!`, 'gut')
    }
    const nachher = phaseVon(z)
    if (nachher !== vorher && z.hp > 0) {
      meldung(z, `${z.boss.name} legt Rüstung an – schreiben trifft jetzt stärker!`, 'warn')
      z.level = Math.min(6, nachher * 2)
    }
    if (z.hp <= 0) {
      z.sieg = true
      z.ende = true
      meldung(z, `${z.boss.name} ist besiegt! 🎉`, 'gut')
    }
  },
  beamer(z) {
    const r = Object.values(z.personen).reduce((s, p) => s + p.richtig, 0)
    const aus: BBlock[] = [
      { typ: 'boss', name: z.boss.name, symbol: z.boss.symbol, hp: Math.ceil(z.hp), max: z.max, phase: phaseVon(z), ruestung: phaseVon(z) > 1, treffer: z.treffer, angriffe: z.angriffe.length },
      {
        typ: 'zahlen',
        eintraege: [
          { titel: 'Treffer', wert: String(r) },
          { titel: 'Offene Angriffe', wert: String(z.angriffe.length) },
          { titel: 'Abgewehrt', wert: String(z.abgewehrt) }
        ]
      }
    ]
    return aus
  },
  geraet(z) {
    return [
      { typ: 'fortschritt', titel: `${z.boss.symbol} ${z.boss.name}${phaseVon(z) > 1 ? ' 🛡️' : ''}`, wert: Math.ceil(z.hp), max: z.max, ton: 'schlecht' }
    ]
  },
  ergebnis(z) {
    const anteil = Math.round(((z.max - z.hp) / z.max) * 100)
    const text = z.sieg ? `${z.boss.name} ist besiegt!` : `${z.boss.name} ist entkommen – ${anteil} % Schaden.`
    // Rekord bei Sieg: je mehr Zeit übrig, desto besser
    const restzeit = Math.max(0, z.bis - (z.verlauf[z.verlauf.length - 1]?.zeit ?? z.bis))
    return {
      text,
      sieg: z.sieg,
      klassenwert: z.sieg ? 100_000 + Math.round(restzeit / 1000) : anteil * 100 + Math.min(99, klassenwertVon(z)),
      klassenwertText: z.sieg ? 'Boss besiegt' : `${anteil} % Schaden`
    }
  }
}
