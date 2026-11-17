/**
 * Boss-Kampf (Koop, 02.11.2026; Arena 17.11.2026, abgestimmt mit der Lehrkraft): Die Klasse kämpft gemeinsam gegen ein
 * Monster. Jedes Kind hat vorne eine selbst gewählte Figur (ohne Namen); die Klasse teilt einen Lebensbalken.
 *
 * - Richtige Antworten schaden dem Boss; geschriebene Antworten (Stufe 3–4) doppelt, 5 richtig in Folge dreifach (kritisch).
 * - Unter 66 % und 33 % Lebenspunkten trägt der Boss Rüstung bzw. rast: Auswählen (Stufe 1–2) schadet nur halb.
 * - Falsche Antworten werden zu Angriffskugeln des Bosses. Das Item geht an andere Lernende (Abruf in der Sitzung); wer
 *   es richtig beantwortet, wehrt die Kugel ab. Im Angriffstakt treffen alle Kugeln, die älter als 6 s sind, die Klasse.
 * - Fällt der Lebensbalken der Klasse auf 0, hat der Boss gewonnen (Niederlage, abgestimmt).
 * - Alle richtigen Antworten füllen die Spezialleiste: voll nach ≈ 3 richtigen je Kind → Klassenangriff (3 % der Boss-LP).
 * - Die eigene Figur reagiert nach Einstellung der Lehrkraft: nur Erfolge (Vorgabe), auch Fehler, nur gemeinsam.
 *
 * BELEGT (Begründung im Entwurf): Fehlerklima ohne Bloßstellung (Steuer u. a. 2013) → nie Namen, Fehler abwehrbar;
 * Abruf kurz nach dem Fehler (Roediger & Karpicke 2006) → Abwehr; Rückmeldung auf die Aufgabe statt die Person
 * (Kluger & DeNisi 1996) → Gerät sagt „Der Boss lädt einen Angriff auf".
 * FAUSTREGELN: Boss-LP = Personen × Minuten × 3,2 (Boss fällt bei ≈ 4 richtigen Antworten je Kind und Minute nach etwa
 * 70 % der Zeit); Schaden je Kugel = 100 ÷ (Personen × Minuten × 0,8), höchstens 8. Simulation (tests/klassenspiel.test.ts,
 * 17.11.2026): bei 78 % Quote bleiben der Klasse 63–69 % Leben, bei 55 % 0–6 % (Niederlage bzw. knapp), bei 70 % 25–44 %.
 * Mit Stufenleiter (Boss-Leben × 1,3): 78 % → 61–63 % Leben, Boss fällt nach 6–6,5 von 10 min; 55 % → Niederlage.
 * Takt 12/10/8 s je Phase; Kugel trifft erst ab 6 s Alter.
 */
import { zufall } from '../../mehrspieler/kern'
import { klassenwertVon, meldung, type BBlock, type BossEreignis, type KBasis, type KlassenRegeln } from '../kern'
import { kt } from '../texte'
import { figurenFuer, hintergrundFuer, monsterFuer, monsterName } from '../bossBestand'
import type { LeiterFormat } from '../leiter'

export const TAKT_MS = [12_000, 10_000, 8_000]
export const KUGEL_REIF_MS = 6_000
/** Kugeln von Lernenden mit „Spiele mit Zeitdruck" aus treffen später (17.11.2026, Entscheidung der Lehrkraft) */
export const KUGEL_REIF_RUHIG_MS = 12_000
const reifAb = (z: KBasis, k: Kugel): number => k.seit + (z.personen[k.von]?.ruhig ? KUGEL_REIF_RUHIG_MS : KUGEL_REIF_MS)
export const WARNUNG_MS = 3_000

export interface Kugel {
  id: number
  item: string
  /** Person mit dem Fehler – bekommt das Item nicht noch einmal als Angriff */
  von: string
  seit: number
  /** Hat die Klasse schon getroffen (bleibt als Item im Umlauf, bis es jemand richtig hat) */
  getroffen?: boolean
}

export interface Boss extends KBasis {
  boss: { id: string; name: string; symbol: string; welt: string }
  hintergrund: string | null
  hp: number
  max: number
  treffer: number
  angriffe: Kugel[]
  abgewehrt: number
  held: number
  naechster: number
  gewarnt: boolean
  spezial: number
  niederlage: boolean
  ereignisse: BossEreignis[]
  /** Je Person: letzter Schlag/Abwehr/Krit (Nummern für die Effekte am Gerät) */
  schlag: { nr: number; schaden: number }
  eigen: Record<string, { abwehr?: number; krit?: number; auf?: number }>
}

/** Schaden je Format der Stufenleiter (FAUSTREGEL: Auswählen 1, Hören/Wort wählen/Salat 1,5, Schreiben 2, Diktat/Satz 2,5) */
export const FORMAT_SCHADEN: Record<LeiterFormat, number> = { wahl3: 1, wahl4: 1, hoerwahl: 1.5, rueckwahl: 1.5, salat: 1.5, schreiben: 2, diktat: 2.5, satz: 2.5 }

/** Stufenleiter: schwerere Formate schaden mehr – der Boss hat dort 30 % mehr Leben (Simulation 17.11.2026) */
export const lebenFuer = (z: KBasis): number =>
  Math.max(30, Math.round(Object.keys(z.personen).length * z.einst.dauer * 3.2 * (z.einst.schwierigkeit === 'leiter' ? 1.3 : 1)))
export const schadenJeKugel = (z: KBasis): number => Math.min(8, 100 / (Math.max(1, Object.keys(z.personen).length) * z.einst.dauer * 0.8))
export const phaseVon = (z: Boss): number => (z.hp > z.max * 0.66 ? 1 : z.hp > z.max * 0.33 ? 2 : 3)

const zuf = (z: KBasis): number => zufall(z)

/** Reihenfolge der Figuren vorne: nach Beitritt (Platz = Index) */
export const reihenfolge = (z: KBasis): string[] =>
  Object.values(z.personen)
    .sort((a, b) => a.beitritt - b.beitritt || a.id.localeCompare(b.id))
    .map((p) => p.id)

/** Figur ohne Wahl: zufällig aus dem Band (beim Start und für später Dazukommende) */
export function figurZuteilen(z: KBasis, wer: string): void {
  const l = figurenFuer(z.jahrgang)
  if (!l.length) return
  z.figuren ??= {}
  if (!z.figuren[wer]) z.figuren[wer] = { figur: l[Math.floor(zuf(z) * l.length) % l.length].id, stufe: 0 }
}

function ereignis(z: Boss, e: Omit<BossEreignis, 'nr'>): void {
  z.ereignisse = [...z.ereignisse, { nr: ++z.nr, ...e }].slice(-40)
}

/** Platz der Person vorne – nur, wenn die Lehrkraft Einzelreaktionen erlaubt */
function slotFuer(z: Boss, wer: string, fehler: boolean): number | undefined {
  const r = z.einst.bossReaktion
  if (r === 'gemeinsam' || (fehler && r !== 'alle')) return undefined
  const i = reihenfolge(z).indexOf(wer)
  return i >= 0 ? i : undefined
}

function niederlage(z: Boss): void {
  z.niederlage = true
  z.sieg = false
  z.ende = true
}

export const boss: KlassenRegeln<Boss> = {
  id: 'boss',
  start(z, jetzt) {
    const l = monsterFuer(z.jahrgang)
    const m = l[Math.floor(zuf(z) * l.length) % l.length]
    const b = { id: m.id, name: monsterName(m, z.sprache), symbol: m.symbol, welt: m.welt }
    const hg = hintergrundFuer(z.jahrgang, m.welt, zuf(z))
    for (const wer of Object.keys(z.personen)) figurZuteilen(z, wer)
    const max = lebenFuer(z)
    return Object.assign(z, {
      boss: b,
      hintergrund: hg?.id ?? null,
      hp: max,
      max,
      treffer: 0,
      angriffe: [],
      abgewehrt: 0,
      held: 100,
      naechster: jetzt + TAKT_MS[0],
      gewarnt: false,
      spezial: 0,
      niederlage: false,
      ereignisse: [],
      schlag: { nr: 0, schaden: 0 },
      eigen: {},
      level: 1
    })
  },
  vorschlag(z, wer) {
    // Jede dritte Aufgabe ein offener Angriff (nicht der eigene Fehler)
    const p = z.personen[wer]
    if (!p || p.n % 3 !== 2) return null
    return z.angriffe.find((a) => a.von !== wer)?.item ?? null
  },
  nachAntwort(z, wer, a, richtig, _p, jetzt) {
    const vorher = phaseVon(z)
    if (!richtig) {
      // Jede falsche Antwort lädt eine Kugel (17.11.2026: vorher nur eine je Wort – bei wenigen Wörtern traf bald nichts mehr)
      z.angriffe = [...z.angriffe, { id: ++z.nr, item: a.item, von: wer, seit: jetzt }].slice(-60)
      const slot = slotFuer(z, wer, true)
      if (slot !== undefined) ereignis(z, { art: 'fehler', slot })
      return
    }
    const p = z.personen[wer]
    const krit = Boolean(p && p.serie > 0 && p.serie % 5 === 0)
    const ruestung = vorher > 1
    // Stufenleiter: schwerere Formate schaden mehr (FAUSTREGEL); sonst wie bisher Schreiben doppelt
    const grund = a.format ? FORMAT_SCHADEN[a.format] : a.stufe >= 3 ? 2 : 1
    const schaden = grund * (ruestung && a.stufe <= 2 ? 0.5 : 1) * (krit ? 3 : 1)
    z.hp = Math.max(0, z.hp - schaden)
    z.treffer++
    ereignis(z, { art: 'treffer', wert: schaden, slot: slotFuer(z, wer, false), krit })
    if (krit) z.eigen[wer] = { ...z.eigen[wer], krit: z.nr }
    // Aufstieg auf der Stufenleiter (kern.ts verbuchen) – vorne leuchtet die Figur
    if (p?.leiterAuf && p.leiterAuf.nr > (z.eigen[wer]?.auf ?? 0)) {
      z.eigen[wer] = { ...z.eigen[wer], auf: p.leiterAuf.nr }
      const slot = slotFuer(z, wer, false)
      if (slot !== undefined) ereignis(z, { art: 'aufstieg', slot, wert: p.leiterAuf.stufe })
    }
    // Abwehr nur durch andere (17.11.2026: eigene Wiederholung wehrte die eigene Kugel ab, bevor sie traf);
    // die eigene richtige Wiederholung räumt nur bereits getroffene Kugeln des Worts ab
    const i = z.angriffe.findIndex((x) => x.item === a.item && !x.getroffen && x.von !== wer)
    const j = i >= 0 ? i : z.angriffe.findIndex((x) => x.item === a.item && x.getroffen)
    if (j >= 0) {
      const k = z.angriffe[j]
      z.angriffe.splice(j, 1)
      if (!k.getroffen) {
        z.abgewehrt++
        ereignis(z, { art: 'abwehr', slot: slotFuer(z, wer, false) })
        z.eigen[wer] = { ...z.eigen[wer], abwehr: z.nr }
        if (z.abgewehrt % 5 === 0) meldung(z, kt(z.sprache, 'boAbgewehrt', z.abgewehrt), 'gut')
      }
    }
    // Spezialleiste: voll nach ≈ 3 richtigen Antworten je Kind
    z.spezial += 1 / (Math.max(1, Object.keys(z.personen).length) * 3)
    if (z.spezial >= 1 && z.hp > 0) {
      z.spezial = 0
      const w = Math.round(z.max * 0.03)
      z.hp = Math.max(0, z.hp - w)
      ereignis(z, { art: 'spezial', wert: w })
      meldung(z, kt(z.sprache, 'boKlassenangriff'), 'gut')
    }
    const nachher = phaseVon(z)
    if (nachher !== vorher && z.hp > 0) {
      ereignis(z, { art: 'phase', wert: nachher })
      meldung(z, nachher === 2 ? kt(z.sprache, 'boRuestung', z.boss.name) : kt(z.sprache, 'boRaserei', z.boss.name), 'warn')
      z.level = Math.min(6, nachher * 2)
    }
    if (z.hp <= 0) {
      z.sieg = true
      z.ende = true
      meldung(z, kt(z.sprache, 'boBesiegt', z.boss.name), 'gut')
    }
  },
  // Mindeststufe der Stufenleiter: je Phase (1 → keine, 2 → Wort wählen, 3 → Schreiben)
  fortschritt(z) {
    return (phaseVon(z) - 1) / 2
  },
  tick(z, jetzt) {
    if (z.ende) return false
    const reif = z.angriffe.filter((k) => !k.getroffen && jetzt >= reifAb(z, k))
    let geaendert = false
    // Vorwarnung: nur wenn wirklich etwas trifft
    const warnen = reif.length > 0 && z.naechster - jetzt <= WARNUNG_MS
    if (warnen !== z.gewarnt) {
      z.gewarnt = warnen
      geaendert = true
    }
    if (jetzt < z.naechster) return geaendert
    z.naechster = jetzt + TAKT_MS[phaseVon(z) - 1]
    z.gewarnt = false
    if (!reif.length) return true
    for (const k of reif) k.getroffen = true
    const schaden = reif.length * schadenJeKugel(z)
    z.held = Math.max(0, z.held - schaden)
    z.schlag = { nr: ++z.nr, schaden: Math.round(schaden) }
    ereignis(z, { art: 'schlag', wert: Math.round(schaden * 10) / 10, krit: reif.length > 5 })
    if (z.held <= 0) {
      niederlage(z)
      meldung(z, kt(z.sprache, 'boNiederlage', z.boss.name, Math.round(((z.max - z.hp) / z.max) * 100)), 'warn')
    }
    return true
  },
  beamer(z, jetzt) {
    const reihe = reihenfolge(z)
    const figuren = reihe.map((id) => z.figuren?.[id] ?? { figur: figurenFuer(z.jahrgang)[0]?.id ?? '', stufe: 0 })
    const zaehl = new Map<string, number>()
    for (const f of figuren) zaehl.set(f.figur, (zaehl.get(f.figur) ?? 0) + 1)
    const schon = new Map<string, number>()
    const ph = phaseVon(z)
    const aus: BBlock[] = [
      {
        typ: 'boss',
        name: z.boss.name,
        symbol: z.boss.symbol,
        monster: z.boss.id,
        hintergrund: z.hintergrund,
        hp: Math.ceil(z.hp),
        max: z.max,
        phase: ph,
        ruestung: ph > 1,
        treffer: z.treffer,
        angriffe: z.angriffe.filter((k) => !k.getroffen).length,
        abgewehrt: z.abgewehrt,
        held: Math.round(z.held * 10) / 10,
        heldMax: 100,
        kugeln: z.angriffe.filter((k) => !k.getroffen).map((k) => ({ id: k.id, reif: jetzt >= reifAb(z, k) })),
        warnung: z.gewarnt,
        naechsterIn: Math.max(0, z.naechster - jetzt),
        spezial: Math.min(1, z.spezial),
        figuren: figuren.map((f) => {
          const n = schon.get(f.figur) ?? 0
          schon.set(f.figur, n + 1)
          return { figur: f.figur, stufe: f.stufe, ring: (zaehl.get(f.figur) ?? 0) > 1 ? n : null }
        }),
        ereignisse: z.ereignisse,
        ausgang: z.sieg ? 'sieg' : z.niederlage ? 'niederlage' : z.ende ? 'entkommen' : null,
        leben: kt(z.sprache, 'boLeben', Math.ceil(z.hp), z.max, ph),
        ruestungText: kt(z.sprache, 'boRuestungHinweis'),
        texte: {
          klasse: kt(z.sprache, 'boKlasse'),
          naechster: kt(z.sprache, 'boNaechster'),
          spezial: kt(z.sprache, 'boSpezial'),
          treffer: kt(z.sprache, 'boTreffer'),
          abgewehrt: kt(z.sprache, 'boAbgewehrtT'),
          holtAus: kt(z.sprache, 'boHoltAus', z.boss.name),
          klassenangriff: kt(z.sprache, 'boKlassenangriff'),
          ruestung: kt(z.sprache, 'boRuestung', z.boss.name),
          raserei: kt(z.sprache, 'boRaserei', z.boss.name)
        }
      }
    ]
    return aus
  },
  geraet(z) {
    return [
      { typ: 'fortschritt', titel: `🛡️ ${kt(z.sprache, 'boKlasse')}`, wert: Math.ceil(z.held), max: 100, ton: 'gut' },
      { typ: 'fortschritt', titel: `${z.boss.symbol} ${z.boss.name}${phaseVon(z) === 2 ? ' 🛡️' : phaseVon(z) === 3 ? ' 🔥' : ''}`, wert: Math.ceil(z.hp), max: z.max, ton: 'schlecht' }
    ]
  },
  geraetExtra(z, wer) {
    const p = z.personen[wer]
    return {
      figur: z.figuren?.[wer]?.figur ?? null,
      schlag: z.schlag,
      rueck: p?.rueck ? { nr: p.rueck.nr, richtig: p.rueck.richtig } : null,
      abwehr: z.eigen[wer]?.abwehr ?? 0,
      krit: z.eigen[wer]?.krit ?? 0
    }
  },
  ergebnis(z) {
    const anteil = Math.round(((z.max - z.hp) / z.max) * 100)
    const text = z.sieg
      ? kt(z.sprache, 'boBesiegt', z.boss.name)
      : z.niederlage
      ? kt(z.sprache, 'boNiederlage', z.boss.name, anteil)
      : kt(z.sprache, 'boEntkommen', z.boss.name, anteil)
    // Rekord bei Sieg: je mehr Zeit übrig, desto besser
    const restzeit = Math.max(0, z.bis - (z.verlauf[z.verlauf.length - 1]?.zeit ?? z.bis))
    return {
      text,
      sieg: z.sieg,
      klassenwert: z.sieg ? 100_000 + Math.round(restzeit / 1000) : anteil * 100 + Math.min(99, klassenwertVon(z)),
      klassenwertText: z.sieg ? kt(z.sprache, 'boRekordSieg') : kt(z.sprache, 'boRekordSchaden', anteil)
    }
  }
}
