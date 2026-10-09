/**
 * Formen-Staffel (Versus): Die Teams sind abwechselnd dran, im Team wechseln sich die Läuferinnen und Läufer ab. Eine
 * richtige Antwort füllt ein Feld; eine falsche kommt später wieder. Wer zuerst zehn Felder hat, gewinnt. Kein Zeitdruck.
 * Schiffe versenken (Versus): Wer richtig antwortet, lädt einen Schuss – reihum. 09.10.2026 (Lehrkraft): Ein Schuss
 * braucht 2 (leicht/mittel, Klasse 5–6 immer) bzw. 3 (schwer/unmöglich) richtige Antworten; die Ladung bleibt dem
 * Team, wer richtig antwortet, bleibt dran, eine falsche Antwort gibt den Zug ab.
 */
import { antwortRichtig, basisNeu, fehlerMerken, frageBlock, gut, melde, naechste, name, rueckBlock, teamName, teamsAus, tx, versusErgebnis, zufall, type Basis, type Block, type Regeln, type StartKontext } from '../kern'
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

const GROESSE = 6
const SCHIFFE = [3, 2, 2, 1]
interface Schiffe extends Reihum {
  /** Schiffsfelder je Team (Index 0..35) – bleiben auf dem Server */
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

function flotteLegen(z: { saat: number }): number[] {
  for (;;) {
    const belegt = new Set<number>()
    let ok = true
    for (const len of SCHIFFE) {
      let gelegt = false
      for (let v = 0; v < 50 && !gelegt; v++) {
        const quer = zufall(z) < 0.5
        const x = Math.floor(zufall(z) * (quer ? GROESSE - len + 1 : GROESSE))
        const y = Math.floor(zufall(z) * (quer ? GROESSE : GROESSE - len + 1))
        const felder = Array.from({ length: len }, (_, i) => (quer ? y * GROESSE + x + i : (y + i) * GROESSE + x))
        if (felder.some((f) => belegt.has(f))) continue
        felder.forEach((f) => belegt.add(f))
        gelegt = true
      }
      if (!gelegt) ok = false
    }
    if (ok) return [...belegt]
  }
}
const versenkt = (flotte: number[], schuesse: Record<number, boolean>): number => flotte.filter((f) => schuesse[f]).length

export const schiffe: Regeln<Schiffe> = {
  id: 'schiffe',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  start(k) {
    const z = reihumStart(k) as Schiffe
    z.flotte = [flotteLegen(z), flotteLegen(z)]
    z.schuesse = [{}, {}]
    z.schiessen = false
    z.ladung = [0, 0]
    z.noetig = antwortenJeSchuss(z)
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || wer !== amZug(z)) return
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
        naechsteFrage(z, wer)
        return
      }
      fehlerMerken(z, wer, f.itemId)
      spaeterNochmal(z, wer, f.itemId)
      melde(z, wer, false, tx(z, 'danebenAnderes'), f.loesung)
      laeuferWeiter(z)
      return weitergeben(z)
    }
    if (zug.aktion === 'schuss' && z.schiessen) {
      const feld = Number(zug.wert)
      if (!Number.isInteger(feld) || feld < 0 || feld >= GROESSE * GROESSE || feld in z.schuesse[gegner]) return
      const treffer = z.flotte[gegner].includes(feld)
      z.schuesse[gegner][feld] = treffer
      if (treffer) z.punkte[wer] = (z.punkte[wer] ?? 0) + 1
      melde(z, wer, treffer, treffer ? tx(z, 'treffer') : tx(z, 'wasser'))
      const meine = versenkt(z.flotte[gegner], z.schuesse[gegner])
      const ihre = versenkt(z.flotte[z.dran], z.schuesse[z.dran])
      z.rueckstand[z.dran] = Math.max(z.rueckstand[z.dran], ihre - meine)
      z.schiessen = false
      if (meine >= z.flotte[gegner].length) return void (z.ende = true)
      laeuferWeiter(z)
      weitergeben(z)
    }
  },
  sicht(z, wer) {
    const meinTeam = z.teams[0].includes(wer) ? 0 : 1
    const gegner = meinTeam === 0 ? 1 : 0
    const dran = amZug(z)
    const b: Block[] = [...rueckBlock(z)]
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
    }
    b.push({
      typ: 'kacheln',
      titel: tx(z, 'feldVon', teamName(z, z.teams[gegner]), versenkt(z.flotte[gegner], z.schuesse[gegner]), z.flotte[gegner].length),
      kacheln: zellen(gegner, false),
      spalten: GROESSE,
      ...(wer === dran && z.schiessen && !z.ende ? { aktion: 'schuss' } : {})
    })
    b.push({ typ: 'kacheln', titel: tx(z, 'eureFlotte'), kacheln: zellen(meinTeam, true), spalten: GROESSE })
    return b
  },
  weg(z, wer) {
    if (wer === amZug(z)) {
      z.schiessen = false
      laeuferWeiter(z)
      if (z.weg.includes(amZug(z))) weitergeben(z)
      else naechsteFrage(z, amZug(z))
    }
  },
  ergebnis(z) {
    const a = versenkt(z.flotte[1], z.schuesse[1])
    const b = versenkt(z.flotte[0], z.schuesse[0])
    const t = a >= z.flotte[1].length ? 0 : b >= z.flotte[0].length ? 1 : a > b ? 0 : b > a ? 1 : null
    const sieger = t === null ? [] : z.teams[t]
    return versusErgebnis(z, sieger, (id) => z.punkte[id] ?? 0, t === null ? tx(z, 'unentschieden') : tx(z, 'gewonnenHat', teamName(z, sieger)), {
      comeback: t !== null && z.rueckstand[t] >= 3,
      unentschieden: t === null
    })
  }
}
