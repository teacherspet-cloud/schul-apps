/**
 * Fragen-Rennen (Welle 2): Jede Person beantwortet ihre eigenen Fragen (Versus: aus dem eigenen Band = Handicap).
 *  - Wörterturm (Kooperativ, Kl. 5–6): jede richtige Antwort ein Stein im gemeinsamen Turm; drei Fehler lassen ihn
 *    wackeln und zwei Steine fallen.
 *  - Konjugations-Duell (Kl. 7–10): Verbformen der unregelmäßigen Verben der Liste.
 *  - Umbau-Rennen (Kl. 9–13): Sätze umformen (Grammatikaufgaben „Umformen").
 *  - Kollokations-Duell (Kl. 10–13): Welches Wort passt zu den Nachbarwörtern im Beispielsatz?
 *  - Synonym-Leiter (Kl. 10–13): gleichbedeutendes Wort finden; daneben = eine Sprosse zurück.
 */
import {
  ablenkerFuer,
  antwortRichtig,
  basisNeu,
  eines,
  fehlerMerken,
  frageBlock,
  gewicht,
  gut,
  itemsZiehen,
  koopErgebnis,
  melde,
  mischen,
  name,
  rueckBlock,
  standBlock,
  tx,
  versusErgebnis,
  type Block,
  type Regeln
} from '../kern'
import type { Frage, MehrspielId, SpielInhalt } from '../typen'
import { frageItems, leereFragen, naechsteFrage, spaeterNochmal, type MitFragen } from './hilfen'
import { spielEinheit } from '../../spielSprache'

export interface Rennen extends MitFragen {
  stand: Record<string, number>
  gemeinsam: number
  wackeln: number
  bis: number | null
  rueckstand: Record<string, number>
}

interface RennenCfg {
  id: MehrspielId
  passt: (i: SpielInhalt, stimme?: boolean) => string | null
  koop?: boolean
  ziel: (z: Rennen) => number
  frage?: (z: Rennen, wer: string) => Frage | null
  punkte?: (z: Rennen, wer: string, f: Frage) => number
  falsch?: (z: Rennen, wer: string) => void
  einheit: string
  zeitMs?: number
  extra?: (z: Rennen, wer: string) => Block[]
}

export function rennenSpiel(cfg: RennenCfg): Regeln<Rennen> {
  const neueFrage = (z: Rennen, wer: string): void => {
    if (cfg.frage) z.fragen[wer] = cfg.frage(z, wer)
    else naechsteFrage(z, wer, { gemeinsam: cfg.koop })
  }
  return {
    id: cfg.id,
    passt: cfg.passt,
    start(k) {
      const b = basisNeu(k)
      const z: Rennen = {
        ...b,
        ...leereFragen(b),
        stand: Object.fromEntries(k.spieler.map((s) => [s.id, 0])),
        gemeinsam: 0,
        wackeln: 0,
        bis: cfg.zeitMs && b.zeitdruck ? k.jetzt + cfg.zeitMs : null,
        rueckstand: Object.fromEntries(k.spieler.map((s) => [s.id, 0]))
      }
      for (const s of k.spieler) neueFrage(z, s.id)
      return z
    },
    zug(z, wer, zug) {
      if (z.ende || zug.aktion !== 'antwort') return
      const f = z.fragen[wer]
      if (!f) return
      if (antwortRichtig(f, zug.wert)) {
        const p = cfg.punkte ? cfg.punkte(z, wer, f) : 1
        gut(z, wer, p)
        if (cfg.koop) z.gemeinsam += p
        else z.stand[wer] += p
        melde(z, wer, true, p > 1 ? `+${p}` : tx(z, 'richtigKlein'))
      } else {
        fehlerMerken(z, wer, f.itemId)
        spaeterNochmal(z, wer, f.itemId)
        cfg.falsch?.(z, wer)
        melde(z, wer, false, tx(z, 'daneben'), f.loesung)
      }
      const bester = Math.max(...Object.values(z.stand))
      for (const id of Object.keys(z.stand)) z.rueckstand[id] = Math.max(z.rueckstand[id], bester - z.stand[id])
      if (cfg.koop ? z.gemeinsam >= cfg.ziel(z) : Object.values(z.stand).some((v) => v >= cfg.ziel(z))) return void (z.ende = true)
      neueFrage(z, wer)
    },
    tick(z, jetzt) {
      if (z.ende || !z.bis || jetzt < z.bis) return false
      z.ende = true
      return true
    },
    sicht(z, wer) {
      const ziel = cfg.ziel(z)
      const b: Block[] = cfg.koop
        ? [{ typ: 'fortschritt', titel: tx(z, 'gemeinsamVon', z.gemeinsam, ziel, spielEinheit(cfg.einheit, z.inhalt.sprache)), wert: z.gemeinsam, max: ziel, ton: 'gut' }]
        : [
            standBlock(
              z.spieler.map((s) => ({ name: s.name, wert: `${Math.min(z.stand[s.id], ziel)} / ${ziel}`, ...(s.id === wer ? { ich: true } : {}) }))
            )
          ]
      if (z.bis && !z.ende) b.push({ typ: 'uhr', bis: z.bis })
      b.push(...(cfg.extra?.(z, wer) ?? []), ...rueckBlock(z))
      if (!z.ende && z.fragen[wer]) b.push(frageBlock(z.fragen[wer]!))
      return b
    },
    ergebnis(z) {
      if (cfg.koop) {
        const ok = z.gemeinsam >= cfg.ziel(z)
        return koopErgebnis(z, ok, z.gemeinsam, ok ? tx(z, 'geschafftEinheit', z.gemeinsam, spielEinheit(cfg.einheit, z.inhalt.sprache)) : tx(z, 'vonEinheit', z.gemeinsam, cfg.ziel(z), spielEinheit(cfg.einheit, z.inhalt.sprache)))
      }
      const bester = Math.max(...Object.values(z.stand))
      const sieger = Object.keys(z.stand).filter((id) => z.stand[id] === bester && bester > 0)
      return versusErgebnis(z, sieger, (id) => z.stand[id], sieger.length ? tx(z, 'gewonnenHat', sieger.map((id) => name(z, id)).join(' & ')) : tx(z, 'unentschieden'), {
        comeback: sieger.some((id) => z.rueckstand[id] >= 3),
        unentschieden: sieger.length !== 1
      })
    }
  }
}

export const woerterturm = rennenSpiel({
  id: 'woerterturm',
  koop: true,
  einheit: 'Steine',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  ziel: (z) => (z.schwierigkeit === 'leicht' ? 8 : 12),
  zeitMs: 4 * 60_000,
  falsch(z) {
    z.wackeln++
    if (z.wackeln >= 3) {
      z.gemeinsam = Math.max(0, z.gemeinsam - 2)
      z.wackeln = 0
    }
  },
  extra: (z) => [{ typ: 'turm', hoehe: z.gemeinsam, ziel: z.schwierigkeit === 'leicht' ? 8 : 12, wackeln: z.wackeln }]
})

export const konjugation = rennenSpiel({
  id: 'konjugation',
  einheit: 'richtig',
  passt: (i) => (i.verben.length >= 4 ? null : 'Braucht mindestens vier unregelmäßige Verben in der Liste.'),
  ziel: () => 8,
  frage(z) {
    const v = eines(z, z.inhalt.verben)
    const grund = v.formen[0]
    const ziel = eines(z, v.formen.slice(1))
    const andere = mischen(
      z,
      z.inhalt.verben.filter((x) => x.id !== v.id).flatMap((x) => x.formen.filter((f) => f.label === ziel.label).map((f) => f.wert))
    )
    const ablenker = [...new Set([...v.formen.filter((f) => f.wert !== ziel.wert).map((f) => f.wert), ...andere])].filter((w) => w !== ziel.wert)
    return {
      itemId: v.id,
      frage: `${grund.wert} (${v.de})`,
      zusatz: `${ziel.label}?`,
      optionen: z.tippen ? [] : mischen(z, [ziel.wert, ...ablenker.slice(0, 3)]),
      loesung: ziel.wert,
      ...(z.tippen ? { tippen: true } : {})
    }
  }
})

export const umbau = rennenSpiel({
  id: 'umbau',
  einheit: 'Sätze',
  passt: (i) => (i.items.filter((x) => x.umformen).length >= 3 ? null : 'Braucht mindestens drei Umform-Aufgaben.'),
  ziel: (z) => (z.schwierigkeit === 'leicht' ? 3 : 4),
  punkte: () => 1,
  frage(z, wer) {
    const s = z.schlange[wer]?.length ? z.schlange[wer] : itemsZiehen(z, 8, { fuer: wer, filter: (i) => Boolean(i.umformen) }).map((i) => i.id)
    const id = s.shift()!
    z.schlange[wer] = s
    const i = z.inhalt.items.find((x) => x.id === id)!
    const u = i.umformen!
    const ablenker = ablenkerFuer(z, u.loesung, [], (x) => x.umformen?.loesung, 3)
    return {
      itemId: i.id,
      frage: u.satz,
      zusatz: u.vorgabe,
      optionen: z.tippen ? [] : mischen(z, [u.loesung, ...ablenker]),
      loesung: u.loesung,
      ...(i.alternativen?.length ? { alternativen: i.alternativen } : {}),
      ...(z.tippen ? { tippen: true } : {})
    }
  }
})

/** Nachbarwörter um die Lücke (zwei links, zwei rechts) */
function nachbarn(vor: string, nach: string): string {
  const l = vor.trim().split(/\s+/).filter(Boolean).slice(-2).join(' ')
  const r = nach.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
  return `${l ? `… ${l} ` : ''}___${r ? ` ${r} …` : ''}`
}

export const kollokation = rennenSpiel({
  id: 'kollokation',
  einheit: 'Punkte',
  passt: (i) => (i.items.filter((x) => x.vok?.luecke).length >= 4 ? null : 'Braucht mindestens vier Wörter mit Beispielsatz.'),
  ziel: () => 15,
  punkte: (z, wer, f) => gewicht(z, wer, f.itemId),
  frage(z, wer) {
    const s = z.schlange[wer]?.length ? z.schlange[wer] : itemsZiehen(z, 10, { fuer: wer, filter: (i) => Boolean(i.vok?.luecke) }).map((i) => i.id)
    const id = s.shift()!
    z.schlange[wer] = s
    const i = z.inhalt.items.find((x) => x.id === id)!
    const l = i.vok!.luecke!
    const ablenker = ablenkerFuer(z, l.loesung, [], (x) => x.vok?.term, 3)
    return {
      itemId: i.id,
      frage: nachbarn(l.vor, l.nach),
      zusatz: tx(z, 'welchesPasstDazu'),
      optionen: z.tippen ? [] : mischen(z, [l.loesung, ...ablenker]),
      loesung: l.loesung,
      ...(z.tippen ? { tippen: true } : {})
    }
  }
})

export const synonyme = rennenSpiel({
  id: 'synonyme',
  einheit: 'Sprossen',
  passt: (i) => (i.synonyme.length >= 3 ? null : 'Braucht mindestens drei Gruppen gleichbedeutender Wörter.'),
  ziel: () => 8,
  falsch(z, wer) {
    z.stand[wer] = Math.max(0, z.stand[wer] - 1)
  },
  frage(z) {
    const g = eines(z, z.inhalt.synonyme)
    const [a, b] = mischen(z, g.woerter)
    const andere = mischen(
      z,
      z.inhalt.synonyme.filter((x) => x !== g).flatMap((x) => x.woerter)
    ).filter((w) => !g.woerter.includes(w))
    const item = z.inhalt.items.find((i) => i.vok?.term === a)
    return {
      itemId: item?.id ?? a,
      frage: a,
      zusatz: tx(z, 'welchesDasselbe'),
      optionen: z.tippen ? [] : mischen(z, [b, ...[...new Set(andere)].slice(0, 3)]),
      loesung: b,
      ...(z.tippen ? { tippen: true, alternativen: g.woerter.filter((w) => w !== a) } : {})
    }
  }
})
