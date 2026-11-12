/**
 * Formen-Staffel (Versus): Die Teams sind abwechselnd dran, im Team wechseln sich die Läuferinnen und Läufer ab. Eine
 * richtige Antwort füllt ein Feld; eine falsche kommt später wieder. Wer zuerst zehn Felder hat, gewinnt. Kein Zeitdruck.
 * Schiffe versenken (Versus): Wer richtig antwortet, lädt einen Schuss – reihum. 09.10.2026 (Lehrkraft): Ein Schuss
 * braucht 2 (leicht/mittel, Klasse 5–6 immer) bzw. 3 (schwer/unmöglich) richtige Antworten; die Ladung bleibt dem
 * Team, wer richtig antwortet, bleibt dran, eine falsche Antwort gibt den Zug ab.
 */
import { antwortRichtig, basisNeu, fehlerMerken, frageBlock, gut, melde, naechste, name, rueckBlock, teamName, teamsAus, tx, versusErgebnis, zufall, type Basis, type Block, type FragenArt, type Regeln, type StartKontext } from '../kern'
import type { SpielItem } from '../typen'
import { frageItems, leereFragen, naechsteFrage, spaeterNochmal, type MitFragen } from './hilfen'

interface Reihum extends MitFragen {
  teams: [string[], string[]]
  dran: 0 | 1
  laeufer: [number, number]
  /** Größter Rückstand je Team (Comeback) */
  rueckstand: [number, number]
}

function reihumStart(k: StartKontext): Reihum {
  const b = basisNeu(k)
  const z: Reihum = { ...b, ...leereFragen(b), teams: teamsAus(k.spieler), dran: 0, laeufer: [0, 0], rueckstand: [0, 0] }
  naechsteFrage(z, z.teams[0][0])
  return z
}
const amZug = (z: Reihum): string => z.teams[z.dran][z.laeufer[z.dran]]
function weitergeben(z: Reihum): void {
  const t = z.dran === 0 ? 1 : 0
  z.laeufer[t] = z.dran === t ? naechste(z, z.teams[t], z.laeufer[t]) : z.laeufer[t]
  z.dran = t
  // Läufer im neuen Team weiterzählen, Abwesende überspringen
  if (z.weg.includes(amZug(z))) z.laeufer[t] = naechste(z, z.teams[t], z.laeufer[t])
  naechsteFrage(z, amZug(z))
}
function laeuferWeiter(z: Reihum): void {
  z.laeufer[z.dran] = naechste(z, z.teams[z.dran], z.laeufer[z.dran])
}

// ---------------------------------------------------------------- Formen-Staffel

const FELDER = 10
interface Staffel extends Reihum {
  felder: [number, number]
}

export const staffel: Regeln<Staffel> = {
  id: 'staffel',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  start: (k) => ({ ...reihumStart(k), felder: [0, 0] }),
  zug(z, wer, zug) {
    if (z.ende || zug.aktion !== 'antwort' || wer !== amZug(z)) return
    const f = z.fragen[wer]
    if (!f) return
    if (antwortRichtig(f, zug.wert)) {
      gut(z, wer, 1)
      z.felder[z.dran]++
      melde(z, wer, true, tx(z, 'feldGefuellt'))
    } else {
      fehlerMerken(z, wer, f.itemId)
      spaeterNochmal(z, wer, f.itemId)
      melde(z, wer, false, tx(z, 'daneben'), f.loesung)
    }
    z.rueckstand = [Math.max(z.rueckstand[0], z.felder[1] - z.felder[0]), Math.max(z.rueckstand[1], z.felder[0] - z.felder[1])]
    if (z.felder[z.dran] >= FELDER) return void (z.ende = true)
    laeuferWeiter(z)
    weitergeben(z)
  },
  sicht(z, wer) {
    const b: Block[] = [
      { typ: 'fortschritt', titel: teamName(z, z.teams[0]), wert: z.felder[0], max: FELDER, ton: z.teams[0].includes(wer) ? 'gut' : 'info' },
      { typ: 'fortschritt', titel: teamName(z, z.teams[1]), wert: z.felder[1], max: FELDER, ton: z.teams[1].includes(wer) ? 'gut' : 'info' },
      ...rueckBlock(z)
    ]
    if (z.ende) return b
    const dran = amZug(z)
    if (wer === dran && z.fragen[wer]) b.push({ typ: 'text', text: tx(z, 'duBistDran'), ton: 'info' }, frageBlock(z.fragen[wer]!))
    else b.push({ typ: 'text', text: tx(z, 'istDran', name(z, dran)), ton: 'leise' })
    return b
  },
  weg(z, wer) {
    if (wer === amZug(z)) {
      laeuferWeiter(z)
      if (z.weg.includes(amZug(z))) weitergeben(z)
      else naechsteFrage(z, amZug(z))
    }
  },
  ergebnis(z) {
    const t = z.felder[0] >= FELDER ? 0 : z.felder[1] >= FELDER ? 1 : z.felder[0] > z.felder[1] ? 0 : z.felder[1] > z.felder[0] ? 1 : null
    const sieger = t === null ? [] : z.teams[t]
    return versusErgebnis(z, sieger, (id) => z.richtig[id] ?? 0, t === null ? tx(z, 'unentschieden') : tx(z, 'gewonnenHat', teamName(z, sieger)), {
      comeback: t !== null && z.rueckstand[t] >= 4,
      unentschieden: t === null
    })
  }
}

// ---------------------------------------------------------------- Schiffe versenken

/*
 * Umbau 12.11.2026 (abgestimmt mit der Lehrkraft):
 * - Feld 7×7, Flotte wie im echten Spiel aus verschiedenen Schiffen: Schlachtschiff (4), Kreuzer (3), zwei Zerstörer (2)
 * - Die Teams stellen ihre Flotte selbst auf (Phase „legen"): Schiff wählen, Feld antippen, gelegtes Schiff antippen =
 *   drehen (waagerecht ↔ senkrecht), „Zufällig verteilen", „Fertig". Jedes Teammitglied darf schieben. Erst wenn beide
 *   Teams fertig sind, beginnt das Spiel. Schiffe dürfen sich nicht überlappen (berühren erlaubt – leichter für Kinder).
 * - Aufgabenstufe vor dem Schuss steigt mit den Treffern des Teams (alle drei Treffer eine Stufe) und liegt bei sicher
 *   gelernten Wörtern (Band „leicht") eine Stufe höher: erkennen → Wort finden (Auswahl) → schreiben → Lückensatz
 *   schreiben. Schreiben auch in Klasse 5–6 (Entscheidung der Lehrkraft). „Schwer"/„unmöglich" beginnt eine Stufe höher.
 */
export const SCHIFF_GROESSE = 7
const GROESSE = SCHIFF_GROESSE
export const SCHIFFSTYPEN = [
  { art: 'schlachtschiff', laenge: 4 },
  { art: 'kreuzer', laenge: 3 },
  { art: 'zerstoerer', laenge: 2 },
  { art: 'zerstoerer', laenge: 2 }
] as const
/** Treffer je Aufgabenstufe */
const TREFFER_JE_STUFE = 3
export interface SchiffPlatz {
  /** Feld des Bugs (oben bzw. links) */
  feld: number
  quer: boolean
}
interface Schiffe extends Reihum {
  phase: 'legen' | 'spiel'
  /** Platz je Schiff (Reihenfolge wie SCHIFFSTYPEN) und Team; null = noch im Hafen */
  plaetze: [(SchiffPlatz | null)[], (SchiffPlatz | null)[]]
  bereit: [boolean, boolean]
  /** Schiffsfelder je Team (Index 0..48) – bleiben auf dem Server */
  flotte: [number[], number[]]
  /** Schüsse auf das Feld von Team t (Index → Treffer) */
  schuesse: [Record<number, boolean>, Record<number, boolean>]
  schiessen: boolean
  /** Geladene richtige Antworten je Team bis zum nächsten Schuss */
  ladung: [number, number]
  noetig: number
}

/** Richtige Antworten je Schuss nach Schwierigkeit (Klasse 5–6 höchstens 2) */
export const antwortenJeSchuss = (z: Basis): number =>
  z.schwierigkeit === 'schwer' || z.schwierigkeit === 'unmoeglich' ? (z.jahrgang !== null && z.jahrgang <= 6 ? 2 : 3) : 2

/** Felder eines Schiffs; null, wenn es nicht ins Feld passt */
export function schiffFelder(p: SchiffPlatz, laenge: number): number[] | null {
  const x = p.feld % GROESSE
  const y = Math.floor(p.feld / GROESSE)
  if (p.feld < 0 || p.feld >= GROESSE * GROESSE) return null
  if (p.quer ? x + laenge > GROESSE : y + laenge > GROESSE) return null
  return Array.from({ length: laenge }, (_, i) => (p.quer ? p.feld + i : p.feld + i * GROESSE))
}

/** Bug so verschieben, dass das Schiff ins Feld passt (Antippen am Rand legt es trotzdem ganz hinein) */
export function einpassen(feld: number, quer: boolean, laenge: number): SchiffPlatz {
  let x = feld % GROESSE
  let y = Math.floor(feld / GROESSE)
  if (quer) x = Math.min(x, GROESSE - laenge)
  else y = Math.min(y, GROESSE - laenge)
  return { feld: y * GROESSE + x, quer }
}

/** Kann Schiff `s` an `p` liegen, ohne andere Schiffe zu überlappen? */
export function platzFrei(plaetze: (SchiffPlatz | null)[], s: number, p: SchiffPlatz): boolean {
  const felder = schiffFelder(p, SCHIFFSTYPEN[s].laenge)
  if (!felder) return false
  const belegt = new Set(plaetze.flatMap((q, k) => (k !== s && q ? (schiffFelder(q, SCHIFFSTYPEN[k].laenge) ?? []) : [])))
  return felder.every((f) => !belegt.has(f))
}

function zufallsFlotte(z: { saat: number }): SchiffPlatz[] {
  for (;;) {
    const plaetze: (SchiffPlatz | null)[] = SCHIFFSTYPEN.map(() => null)
    let ok = true
    SCHIFFSTYPEN.forEach((t, s) => {
      for (let v = 0; v < 80 && !plaetze[s]; v++) {
        const quer = zufall(z) < 0.5
        const p = einpassen(Math.floor(zufall(z) * GROESSE * GROESSE), quer, t.laenge)
        if (platzFrei(plaetze, s, p)) plaetze[s] = p
      }
      if (!plaetze[s]) ok = false
    })
    if (ok) return plaetze as SchiffPlatz[]
  }
}

const felderVon = (plaetze: (SchiffPlatz | null)[]): number[][] => plaetze.map((p, s) => (p ? (schiffFelder(p, SCHIFFSTYPEN[s].laenge) ?? []) : []))
const versenkt = (flotte: number[], schuesse: Record<number, boolean>): number => flotte.filter((f) => schuesse[f]).length
const teamVon = (z: Schiffe, wer: string): 0 | 1 => (z.teams[0].includes(wer) ? 0 : 1)
const schiffName = (z: Schiffe, s: number): string => tx(z, SCHIFFSTYPEN[s].art)

/** Aufgabenstufe des Teams (0–3) aus den eigenen Treffern und der Schwierigkeit */
export function teamStufe(z: Schiffe, t: 0 | 1): number {
  const gegner = t === 0 ? 1 : 0
  const extra = z.schwierigkeit === 'schwer' || z.schwierigkeit === 'unmoeglich' ? 1 : 0
  return Math.min(3, Math.floor(versenkt(z.flotte[gegner], z.schuesse[gegner]) / TREFFER_JE_STUFE) + extra)
}

const STUFEN_VOK = ['stufeErkennen', 'stufeFinden', 'stufeSchreiben', 'stufeLuecke'] as const
const STUFEN_GRAM = ['stufeAuswahl', 'stufeAuswahl', 'stufeAntwortSchreiben', 'stufeAntwortSchreiben'] as const
const stufeName = (z: Schiffe, st: number): string => tx(z, (z.inhalt.bereich === 'gram' ? STUFEN_GRAM : STUFEN_VOK)[st])

/** Aufgabenart einer Stufe (0 erkennen, 1 Wort finden, 2 schreiben, 3 Lückensatz schreiben; Grammatik: Auswahl/schreiben) */
export function formatDerStufe(item: SpielItem, stufe: number): { art: FragenArt; optionen?: number; tippen: boolean } {
  if (!item.vok) return { art: 'standard', optionen: stufe === 0 ? 3 : 4, tippen: stufe >= 2 }
  if (stufe <= 0) return { art: 'erkennen', tippen: false }
  if (stufe === 1) return { art: 'abrufen', tippen: false }
  if (stufe >= 3 && item.vok.luecke) return { art: 'luecke', tippen: true }
  return { art: 'abrufen', tippen: true }
}

/** Frage für die Person am Zug – Format nach Teamstufe, sicher gelernte Wörter eine Stufe höher */
function schiffFrage(z: Schiffe, wer: string): void {
  const basis = teamStufe(z, teamVon(z, wer))
  naechsteFrage(z, wer, {
    format: (item) => {
      const sicher = (z.band.je[wer]?.[item.id] ?? z.band.gemeinsam[item.id]) === 'leicht'
      return formatDerStufe(item, Math.min(3, basis + (sicher ? 1 : 0)))
    }
  })
}

function weiterSchiffe(z: Schiffe): void {
  laeuferWeiter(z)
  weitergeben(z)
  schiffFrage(z, amZug(z))
}

function spielBeginnen(z: Schiffe): void {
  z.flotte = [felderVon(z.plaetze[0]).flat(), felderVon(z.plaetze[1]).flat()]
  z.phase = 'spiel'
  schiffFrage(z, amZug(z))
}

/** Team ohne anwesende Mitglieder: Flotte zufällig, bereit */
function abwesendeTeams(z: Schiffe): void {
  for (const t of [0, 1] as const) {
    if (z.bereit[t] || !z.teams[t].every((id) => z.weg.includes(id))) continue
    z.plaetze[t] = zufallsFlotte(z)
    z.bereit[t] = true
  }
  if (z.phase === 'legen' && z.bereit[0] && z.bereit[1]) spielBeginnen(z)
}

export const schiffe: Regeln<Schiffe> = {
  id: 'schiffe',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  start(k) {
    const z = reihumStart(k) as Schiffe
    z.phase = 'legen'
    z.plaetze = [SCHIFFSTYPEN.map(() => null), SCHIFFSTYPEN.map(() => null)]
    z.bereit = [false, false]
    z.flotte = [[], []]
    z.schuesse = [{}, {}]
    z.schiessen = false
    z.ladung = [0, 0]
    z.noetig = antwortenJeSchuss(z)
    return z
  },
  zug(z, wer, zug) {
    if (z.ende) return
    if (z.phase === 'legen') {
      const t = teamVon(z, wer)
      const pl = z.plaetze[t]
      if (zug.aktion === 'aendern') return void (z.bereit[t] = false)
      if (z.bereit[t]) return
      if (zug.aktion === 'zufall') z.plaetze[t] = zufallsFlotte(z)
      else if (zug.aktion === 'legen') {
        const w = (zug.wert ?? {}) as { s?: unknown; feld?: unknown; quer?: unknown }
        const s = Number(w.s)
        const feld = Number(w.feld)
        if (!Number.isInteger(s) || s < 0 || s >= SCHIFFSTYPEN.length || !Number.isInteger(feld) || feld < 0 || feld >= GROESSE * GROESSE) return
        // Der Server reicht Objektwerte als Text weiter (spiel.ts: „true" statt true)
        const p = einpassen(feld, w.quer === true || w.quer === 'true', SCHIFFSTYPEN[s].laenge)
        if (platzFrei(pl, s, p)) pl[s] = p
      } else if (zug.aktion === 'drehen') {
        const s = Number(zug.wert)
        const alt = Number.isInteger(s) ? pl[s] : null
        if (!alt) return
        const p = einpassen(alt.feld, !alt.quer, SCHIFFSTYPEN[s].laenge)
        if (platzFrei(pl, s, p)) pl[s] = p
      } else if (zug.aktion === 'hafen') {
        const s = Number(zug.wert)
        if (Number.isInteger(s) && s >= 0 && s < SCHIFFSTYPEN.length) pl[s] = null
      } else if (zug.aktion === 'fertig') {
        if (pl.some((p) => !p)) return
        z.bereit[t] = true
        if (z.bereit[0] && z.bereit[1]) spielBeginnen(z)
      }
      return
    }
    if (wer !== amZug(z)) return
    const gegner = z.dran === 0 ? 1 : 0
    if (zug.aktion === 'antwort' && !z.schiessen) {
      const f = z.fragen[wer]
      if (!f) return
      if (antwortRichtig(f, zug.wert)) {
        gut(z, wer)
        z.ladung[z.dran]++
        if (z.ladung[z.dran] >= z.noetig) {
          z.ladung[z.dran] = 0
          z.schiessen = true
          return melde(z, wer, true, tx(z, 'darfSchiessen'))
        }
        // Noch nicht geladen: dieselbe Person bleibt dran und bekommt die nächste Frage
        melde(z, wer, true, tx(z, 'geladen', z.noetig - z.ladung[z.dran]))
        schiffFrage(z, wer)
        return
      }
      fehlerMerken(z, wer, f.itemId)
      spaeterNochmal(z, wer, f.itemId)
      melde(z, wer, false, tx(z, 'danebenAnderes'), f.loesung)
      return weiterSchiffe(z)
    }
    if (zug.aktion === 'schuss' && z.schiessen) {
      const feld = Number(zug.wert)
      if (!Number.isInteger(feld) || feld < 0 || feld >= GROESSE * GROESSE || feld in z.schuesse[gegner]) return
      const stufeVorher = teamStufe(z, z.dran)
      const treffer = z.flotte[gegner].includes(feld)
      z.schuesse[gegner][feld] = treffer
      if (treffer) z.punkte[wer] = (z.punkte[wer] ?? 0) + 1
      const ihre = felderVon(z.plaetze[gegner])
      const schiff = treffer ? ihre.findIndex((fs) => fs.includes(feld)) : -1
      const ganz = schiff >= 0 && ihre[schiff].every((f) => z.schuesse[gegner][f])
      const stufeNachher = teamStufe(z, z.dran)
      const text = [
        ganz ? tx(z, 'versenktSchiff', schiffName(z, schiff)) : treffer ? tx(z, 'treffer') : tx(z, 'wasser'),
        stufeNachher > stufeVorher ? tx(z, 'schwerer', stufeName(z, stufeNachher)) : ''
      ]
        .filter(Boolean)
        .join(' ')
      melde(z, wer, treffer, text)
      const meine = versenkt(z.flotte[gegner], z.schuesse[gegner])
      const andere = versenkt(z.flotte[z.dran], z.schuesse[z.dran])
      z.rueckstand[z.dran] = Math.max(z.rueckstand[z.dran], andere - meine)
      z.schiessen = false
      if (meine >= z.flotte[gegner].length) return void (z.ende = true)
      weiterSchiffe(z)
    }
  },
  sicht(z, wer) {
    const meinTeam = teamVon(z, wer)
    const gegner = meinTeam === 0 ? 1 : 0
    const b: Block[] = [...rueckBlock(z)]
    if (z.phase === 'legen') {
      b.push({ typ: 'titel', text: tx(z, 'flotteAufstellen') })
      b.push({
        typ: 'flotte',
        groesse: GROESSE,
        schiffe: SCHIFFSTYPEN.map((t, s) => ({ name: schiffName(z, s), laenge: t.laenge, platz: z.plaetze[meinTeam][s] })),
        bereit: z.bereit[meinTeam]
      })
      b.push({
        typ: 'text',
        text: z.bereit[gegner] ? tx(z, 'flotteBereit', teamName(z, z.teams[gegner])) : tx(z, 'wartenAufFlotte', teamName(z, z.teams[gegner])),
        ton: 'leise'
      })
      return b
    }
    const dran = amZug(z)
    const zellen = (t: 0 | 1, eigen: boolean) =>
      Array.from({ length: GROESSE * GROESSE }, (_, i) => ({
        id: String(i),
        status: (i in z.schuesse[t] ? (z.schuesse[t][i] ? 'treffer' : 'wasser') : eigen && z.flotte[t].includes(i) ? 'schiff' : undefined) as
          | 'treffer'
          | 'wasser'
          | 'schiff'
          | undefined
      }))
    if (!z.ende) {
      if (wer === dran && !z.schiessen && z.fragen[wer])
        b.push({ typ: 'text', text: tx(z, 'erstDieFrage'), ton: 'info' }, frageBlock(z.fragen[wer]!))
      else if (wer === dran && z.schiessen) b.push({ typ: 'text', text: tx(z, 'tippeFeld'), ton: 'info' })
      else b.push({ typ: 'text', text: tx(z, 'istDran', name(z, dran)), ton: 'leise' })
      b.push({ typ: 'fortschritt', titel: tx(z, 'schussLaden', z.noetig - z.ladung[meinTeam]), wert: z.ladung[meinTeam], max: z.noetig, ton: 'info' })
      const st = teamStufe(z, meinTeam)
      b.push({ typ: 'fortschritt', titel: tx(z, 'stufeTitel', st + 1, stufeName(z, st)), wert: st + 1, max: 4, ton: 'warn' })
    }
    b.push({
      typ: 'kacheln',
      titel: tx(z, 'feldVon', teamName(z, z.teams[gegner]), versenkt(z.flotte[gegner], z.schuesse[gegner]), z.flotte[gegner].length),
      kacheln: zellen(gegner, false),
      spalten: GROESSE,
      ...(wer === dran && z.schiessen && !z.ende ? { aktion: 'schuss' } : {})
    })
    // Welche Schiffe des anderen Teams sind schon versenkt? (wie im echten Spiel angesagt)
    const ihre = felderVon(z.plaetze[gegner])
    b.push({
      typ: 'reihe',
      titel: tx(z, 'schiffeVon', teamName(z, z.teams[gegner])),
      teile: SCHIFFSTYPEN.map((t, s) => `${ihre[s].every((f) => z.schuesse[gegner][f]) ? '✓ ' : ''}${schiffName(z, s)} (${t.laenge})`)
    })
    b.push({ typ: 'kacheln', titel: tx(z, 'eureFlotte'), kacheln: zellen(meinTeam, true), spalten: GROESSE })
    return b
  },
  weg(z, wer) {
    if (z.phase === 'legen') return abwesendeTeams(z)
    if (wer === amZug(z)) {
      z.schiessen = false
      laeuferWeiter(z)
      if (z.weg.includes(amZug(z))) weitergeben(z)
      schiffFrage(z, amZug(z))
    }
  },
  ergebnis(z) {
    const a = versenkt(z.flotte[1], z.schuesse[1])
    const b = versenkt(z.flotte[0], z.schuesse[0])
    const t = z.phase === 'legen' ? null : a >= z.flotte[1].length ? 0 : b >= z.flotte[0].length ? 1 : a > b ? 0 : b > a ? 1 : null
    const sieger = t === null ? [] : z.teams[t]
    return versusErgebnis(z, sieger, (id) => z.punkte[id] ?? 0, t === null ? tx(z, 'unentschieden') : tx(z, 'gewonnenHat', teamName(z, sieger)), {
      comeback: t !== null && z.rueckstand[t] >= 3,
      unentschieden: t === null
    })
  }
}
