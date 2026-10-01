import { describe, expect, it } from 'vitest'
import { mp3Bereinigt, mp3Rahmen, mp3Schneiden, mp3Sekunden, mp3Stueck, stilleMp3, verbinde } from '../src/shared/mp3'
import {
  markenNachZeichen,
  planeVertonung,
  vertoneHoertext,
  vorlagePasst,
  zeitenAusAusrichtung,
  zeitenAusDialog,
  type Sprecherzeile,
  type Synthese,
  type SyntheseTeil
} from '../src/shared/vertonung'

/*
 * Wunsch der Lehrkraft (01.10.2026): Zeitangaben aus der echten Aufnahme, und bei kleinen
 * Skriptänderungen nur die geänderten Stellen neu vertonen und einsetzen – ohne ffmpeg.
 */
const RAHMEN = 1152 / 44100

/** Dienst-Attrappe: je Zeile Stille (1 s je 10 Zeichen) + 0,3 s Pause, mit oder ohne Zeitmarken */
function attrappe(mitMarken = true): Synthese & { auftraege: Sprecherzeile[][]; kontexte: { davor?: string; danach?: string }[] } {
  const auftraege: Sprecherzeile[][] = []
  const kontexte: { davor?: string; danach?: string }[] = []
  return {
    modell: 'test',
    auftraege,
    kontexte,
    async vertone(zeilen, kontext): Promise<SyntheseTeil[]> {
      auftraege.push(zeilen)
      kontexte.push(kontext)
      const teile: Uint8Array[] = []
      const zeiten: { von: number; bis: number }[] = []
      let t = 0
      zeilen.forEach((z, i) => {
        const sprache = stilleMp3(z.text.length / 10, 10 + auftraege.length * 10 + i)
        teile.push(sprache, stilleMp3(0.3))
        const d = mp3Sekunden(sprache)
        zeiten.push({ von: t, bis: t + d })
        t += d + mp3Sekunden(stilleMp3(0.3))
      })
      return [{ mp3: verbinde(teile), zeilen: zeilen.length, ...(mitMarken ? { zeiten } : {}) }]
    }
  }
}

const zeilen: Sprecherzeile[] = [
  { voiceId: 'w', text: 'Good morning, Anna. You look tired today.' },
  { voiceId: 'm', text: 'Good morning. I could not sleep last night.' },
  { voiceId: 'w', text: 'Were you worried about the maths test?' },
  { voiceId: 'm', text: 'Yes. I still do not understand the fractions.' }
]

describe('MP3 ohne ffmpeg', () => {
  it('misst die Spieldauer über die Rahmen', () => {
    expect(mp3Sekunden(stilleMp3(2))).toBeCloseTo(2, 1)
    expect(mp3Rahmen(stilleMp3(1)).length).toBe(Math.round(1 / RAHMEN))
  })

  it('überspringt ID3-Kopf, Xing-Rahmen und ID3v1-Schluss', () => {
    const ton = stilleMp3(1)
    const id3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 20, ...new Array(20).fill(0)])
    const xing = stilleMp3(0.01)
    xing.set([0x58, 0x69, 0x6e, 0x67], 4 + 17)
    const tag = new Uint8Array(128)
    tag.set([0x54, 0x41, 0x47])
    const datei = verbinde([id3, xing, ton, tag])
    expect(mp3Sekunden(datei)).toBeCloseTo(mp3Sekunden(ton), 5)
    expect(mp3Rahmen(datei).filter((r) => r.kopf)).toHaveLength(1)
    // Bereinigt bleiben nur die Tonrahmen
    expect(mp3Bereinigt(datei)).toEqual(ton)
  })

  it('schneidet an Rahmengrenzen; die Stücke ergeben zusammen die ganze Dauer', () => {
    const datei = stilleMp3(3)
    const stuecke = mp3Schneiden(datei, [1, 2])
    expect(stuecke).toHaveLength(3)
    for (const s of stuecke) expect(mp3Sekunden(s)).toBeCloseTo(1, 1)
    expect(stuecke.reduce((n, s) => n + mp3Sekunden(s), 0)).toBeCloseTo(mp3Sekunden(datei), 5)
  })

  it('setzt Anfangsrahmen mit Bit-Reservoir still (kein Knacken an der Schnittstelle)', () => {
    const datei = stilleMp3(0.2)
    const r = mp3Rahmen(datei)
    // Rahmen 1 und 2 „borgen" Daten beim Vorgänger
    datei[r[1].start + 4] = 0x40
    datei[r[2].start + 4] = 0x20
    const frisch = mp3Rahmen(datei)
    expect(frisch[1].reservoir).toBeGreaterThan(0)
    const stueck = mp3Stueck(datei, frisch, 1, frisch.length)
    const neu = mp3Rahmen(stueck)
    expect(neu).toHaveLength(frisch.length - 1)
    expect(neu[0].reservoir).toBe(0)
    expect(neu[1].reservoir).toBe(0)
    // Ab dem ersten Rahmen ohne Reservoir bleibt alles Byte für Byte gleich
    expect(stueck.subarray(neu[2].start)).toEqual(datei.subarray(frisch[3].start))
  })
})

describe('Zeitmarken der Dienste', () => {
  it('liest Beginn und Ende je Zeile aus voice_segments', () => {
    expect(
      zeitenAusDialog(
        [
          { dialogue_input_index: 0, start_time_seconds: 0.1, end_time_seconds: 2 },
          { dialogue_input_index: 1, start_time_seconds: 2.4, end_time_seconds: 3 },
          { dialogue_input_index: 1, start_time_seconds: 3.1, end_time_seconds: 4.5 }
        ],
        2
      )
    ).toEqual([
      { von: 0.1, bis: 2 },
      { von: 2.4, bis: 4.5 }
    ])
    expect(zeitenAusDialog([{ dialogue_input_index: 0, start_time_seconds: 0, end_time_seconds: 1 }], 2)).toBeUndefined()
    expect(zeitenAusDialog(undefined, 1)).toBeUndefined()
  })

  it('findet die Zeilen in der Zeichen-Ausrichtung der Einzelstimme', () => {
    const text = 'Hello there.  How are you?'
    const characters = [...text]
    const character_start_times_seconds = characters.map((_, i) => i * 0.1)
    const character_end_times_seconds = characters.map((_, i) => i * 0.1 + 0.08)
    const z = zeitenAusAusrichtung({ characters, character_start_times_seconds, character_end_times_seconds }, ['Hello there.', 'How are you?'])
    expect(z?.[0].von).toBeCloseTo(0)
    expect(z?.[1].von).toBeCloseTo(1.4)
    expect(z?.[1].bis).toBeCloseTo(2.58)
    expect(zeitenAusAusrichtung({ characters, character_start_times_seconds, character_end_times_seconds }, ['Nicht im Text'])).toBeUndefined()
  })

  it('verteilt ohne Messung nach Zeichen', () => {
    expect(markenNachZeichen(['aaaa', 'aaaaaaaaaaaa'], 8)).toEqual([0, 2])
  })
})

describe('Vertonen mit Segmenten', () => {
  it('erste Vertonung: ein Segment je Zeile, Dauer = Summe der Segmente, Zeitmarken aus der Messung', async () => {
    const dienst = attrappe()
    const erg = await vertoneHoertext(zeilen, { sprache: 'en' }, dienst)
    expect(erg.weg).toBe('voll')
    expect(dienst.auftraege).toHaveLength(1)
    expect(erg.segmente).toHaveLength(4)
    expect(erg.sekunden).toBeCloseTo(
      erg.segmente.reduce((n, s) => n + s.sekunden, 0),
      2
    )
    expect(erg.sekunden).toBeCloseTo(mp3Sekunden(erg.mp3), 2)
    expect(erg.zeitmarken).toHaveLength(4)
    expect(erg.zeitmarken[0]).toBe(0)
    // Zeile 2 beginnt nach Zeile 1 (4,1 s Sprache) und der Pause
    expect(erg.zeitmarken[1]).toBeGreaterThan(4)
    expect(erg.zeitmarken[1]).toBeLessThan(4.6)
    expect(vorlagePasst({ mp3: erg.mp3, segmente: erg.segmente })).toBe(true)
  })

  it('ein geänderter Satz: genau ein Auftrag mit genau dieser Zeile, der Rest Byte für Byte übernommen', async () => {
    const dienst = attrappe()
    const alt = await vertoneHoertext(zeilen, { sprache: 'en' }, dienst)
    const geaendert = zeilen.map((z, i) => (i === 2 ? { ...z, text: 'Were you nervous about the test?' } : z))
    const neu = await vertoneHoertext(geaendert, { sprache: 'en' }, dienst, { mp3: alt.mp3, segmente: alt.segmente })
    expect(dienst.auftraege).toHaveLength(2)
    expect(dienst.auftraege[1]).toEqual([geaendert[2]])
    // Nachbarzeilen als Zusammenhang für die Sprechmelodie
    expect(dienst.kontexte[1]).toEqual({ davor: zeilen[1].text, danach: zeilen[3].text })
    expect(neu.weg).toBe('teilweise')
    expect(neu.neu).toBe(1)
    expect(neu.grund).toBeUndefined()
    for (const i of [0, 1, 3]) {
      const a = alt.segmente[i]
      const b = neu.segmente[i]
      expect(b.s).toEqual(a.s)
      expect(neu.mp3.subarray(b.von, b.bis)).toEqual(alt.mp3.subarray(a.von, a.bis))
    }
    expect(neu.sekunden).toBeCloseTo(
      neu.segmente.reduce((n, s) => n + s.sekunden, 0),
      2
    )
    expect(neu.sekunden).toBeCloseTo(mp3Sekunden(neu.mp3), 2)
    // Kürzere Zeile 3 → Zeile 4 beginnt früher
    expect(neu.zeitmarken[3]).toBeLessThan(alt.zeitmarken[3])
  })

  it('gestrichene Zeile: kein Auftrag; neue Zeile: nur sie wird vertont', async () => {
    const dienst = attrappe()
    const alt = await vertoneHoertext(zeilen, {}, dienst)
    const ohne = await vertoneHoertext([zeilen[0], zeilen[1], zeilen[3]], {}, dienst, { mp3: alt.mp3, segmente: alt.segmente })
    expect(dienst.auftraege).toHaveLength(1)
    expect(ohne.neu).toBe(0)
    expect(ohne.segmente).toHaveLength(3)
    const mit = await vertoneHoertext([...zeilen, { voiceId: 'w', text: 'Then let us practise together.' }], {}, dienst, { mp3: alt.mp3, segmente: alt.segmente })
    expect(dienst.auftraege).toHaveLength(2)
    expect(dienst.auftraege[1]).toHaveLength(1)
    expect(mit.neu).toBe(1)
  })

  it('andere Stimme oder anderes Tempo: alles neu, mit Grund', async () => {
    const dienst = attrappe()
    const alt = await vertoneHoertext(zeilen, { settings: { speed: 1 } }, dienst)
    const neu = await vertoneHoertext(zeilen, { settings: { speed: 0.9 } }, dienst, { mp3: alt.mp3, segmente: alt.segmente })
    expect(neu.weg).toBe('voll')
    expect(dienst.auftraege[1]).toHaveLength(4)
    expect(neu.grund).toMatch(/Stimme, Tempo oder Modell/)
  })

  it('alte Aufnahme ohne Segmente, fehlende Datei oder unpassende Segmente: alles neu, mit Grund', async () => {
    const dienst = attrappe()
    const ohne = await vertoneHoertext(zeilen, {}, dienst, null, 'Die bisherige Aufnahme stammt aus einer älteren Fassung ohne gemerkte Abschnitte.')
    expect(ohne.weg).toBe('voll')
    expect(ohne.grund).toMatch(/älteren Fassung/)
    const kaputt = await vertoneHoertext(zeilen, {}, dienst, { mp3: ohne.mp3.subarray(0, 1000), segmente: ohne.segmente })
    expect(kaputt.weg).toBe('voll')
    expect(kaputt.grund).toMatch(/passt nicht/)
  })

  it('durchgehendes Stück ohne Zeitmarken: Zeitmarken nach Zeichen, Änderung vertont alles neu', async () => {
    const dienst = attrappe(false)
    const alt = await vertoneHoertext(zeilen, {}, dienst)
    expect(alt.segmente).toHaveLength(1)
    expect(alt.segmente[0].gemessen).toBe(false)
    expect(alt.zeitmarken).toHaveLength(4)
    const neu = await vertoneHoertext(
      zeilen.map((z, i) => (i === 0 ? { ...z, text: 'Hi Anna.' } : z)),
      {},
      dienst,
      { mp3: alt.mp3, segmente: alt.segmente }
    )
    expect(neu.weg).toBe('voll')
    expect(neu.grund).toMatch(/ohne Schnittstellen/)
  })

  it('Plan: nur vollständig und zusammenhängend gleich gebliebene Segmente werden übernommen', () => {
    const seg = (s: string[]) => ({ s, t: s, von: 0, bis: 1, sekunden: 1, marken: s.map(() => 0), gemessen: true })
    const plan = planeVertonung(['a', 'x', 'c', 'd'], [seg(['a', 'b']), seg(['c']), seg(['d'])])
    expect(plan.map((p) => (p.art === 'alt' ? `alt:${p.segment.s.join('')}` : `neu:${p.von}-${p.bis}`))).toEqual(['neu:0-2', 'alt:c', 'alt:d'])
  })
})
