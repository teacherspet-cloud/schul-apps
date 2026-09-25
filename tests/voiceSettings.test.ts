import { describe, expect, it } from 'vitest'
import {
  clampTtsSettings,
  DIALOG_MAX_ZEICHEN,
  dialogBloecke,
  NATURAL_WPM_DIALOG,
  NATURAL_WPM_SOLO,
  ohneTags,
  settingsFuerNiveau,
  SPEED_RANGE,
  tempoFuerNiveau,
  textStuecke,
  TTS_DEFAULTS
} from '../src/shared/voiceSettings'

/*
 * Die Zielspannen stammen aus `didactics/listeningFormats.ts` (listeningRules) und sind
 * dort belegt. Hier stehen sie nur als Eingabe – die Tabelle wird nicht verdoppelt.
 */
const WPM = {
  A2: [85, 100] as [number, number],
  B1: [100, 120] as [number, number],
  B2: [120, 140] as [number, number],
  C1: [140, 165] as [number, number],
  C2: [165, 190] as [number, number]
}

describe('Sprechtempo aus dem Niveau', () => {
  it('spricht für höhere Niveaus nie langsamer', () => {
    const tempi = [WPM.A2, WPM.B1, WPM.B2, WPM.C1, WPM.C2].map((w) => tempoFuerNiveau(w).speed)
    for (let i = 1; i < tempi.length; i++) expect(tempi[i]).toBeGreaterThanOrEqual(tempi[i - 1])
  })

  it('unterscheidet nur dort, wo die Schnittstelle es hergibt', () => {
    /*
     * Ernüchternd, aber so ist es: A2, B1 und B2 liegen ALLE am unteren Anschlag 0.7, weil
     * die Stimmen selbst dort noch ~144 Wörter je Minute sprechen. Erst ab C1 lässt sich
     * das Niveau überhaupt am Tempo ablesen. Ein Test, der hier lauter verschiedene Werte
     * erwartet, würde eine Genauigkeit behaupten, die es nicht gibt.
     */
    expect(tempoFuerNiveau(WPM.A2).speed).toBe(SPEED_RANGE.min)
    expect(tempoFuerNiveau(WPM.B1).speed).toBe(SPEED_RANGE.min)
    expect(tempoFuerNiveau(WPM.C2).speed).toBeGreaterThan(tempoFuerNiveau(WPM.C1).speed)
  })

  it('bleibt in den Grenzen, die ElevenLabs zulässt', () => {
    for (const w of Object.values(WPM)) {
      const t = tempoFuerNiveau(w)
      expect(t.speed).toBeGreaterThanOrEqual(SPEED_RANGE.min)
      expect(t.speed).toBeLessThanOrEqual(SPEED_RANGE.max)
    }
  })

  it('meldet, wenn das Niveau gar nicht erreichbar ist', () => {
    /*
     * GEMESSEN: Die Stimmen sprechen bei speed 1.0 rund 205 Wörter je Minute, langsamer als
     * 0.7 lässt die Schnittstelle nicht zu – das sind noch immer ~144. A2 verlangt 85–100.
     * Dieser Rest darf nicht verschwiegen werden, sonst hält die Lehrkraft den Hörtext für
     * niveaugerecht, obwohl er es nicht ist.
     */
    expect(tempoFuerNiveau(WPM.A2).zuSchnell).toBe(true)
    expect(tempoFuerNiveau(WPM.A2).speed).toBe(SPEED_RANGE.min)
    expect(tempoFuerNiveau(WPM.C1).zuSchnell).toBe(false)
  })

  it('nennt Ziel und tatsächliches Tempo, damit die Anzeige nicht schätzt', () => {
    const t = tempoFuerNiveau(WPM.C1)
    expect(t.zielWpm).toBe(153)
    expect(t.erreichtWpm).toBe(Math.round(t.speed * NATURAL_WPM_SOLO))
  })

  it('rechnet für den Dialog mit der langsameren Grundrate', () => {
    // eleven_v3 atmet zwischen den Sprechern und ist von sich aus ruhiger
    expect(NATURAL_WPM_DIALOG).toBeLessThan(NATURAL_WPM_SOLO)
    expect(tempoFuerNiveau(WPM.C1, true).speed).toBeGreaterThan(tempoFuerNiveau(WPM.C1, false).speed)
  })

  it('macht aus dem Tempo fertige Einstellungen – eigene Wahl hat Vorrang', () => {
    expect(settingsFuerNiveau(WPM.C1, false).speed).toBe(tempoFuerNiveau(WPM.C1).speed)
    expect(settingsFuerNiveau(WPM.C1, false, { ...TTS_DEFAULTS, speed: 1.1 }).speed).toBe(1.1)
  })
})

describe('Einstellungen in gültige Bereiche zwingen', () => {
  it('fängt Werte ab, die eine gespeicherte Datei mitbringen kann', () => {
    const s = clampTtsSettings({ stability: 5, similarity: -1, style: 2, speed: 3, speakerBoost: false })
    expect(s).toEqual({ stability: 1, similarity: 0, style: 1, speed: SPEED_RANGE.max, speakerBoost: false })
  })

  it('füllt Fehlendes mit den Vorgaben von ElevenLabs', () => {
    expect(clampTtsSettings(undefined)).toEqual(TTS_DEFAULTS)
    expect(clampTtsSettings({ speed: 0.9 })).toEqual({ ...TTS_DEFAULTS, speed: 0.9 })
  })
})

describe('Audio-Tags', () => {
  it('entfernt sie für das Modell, das sie nicht versteht', () => {
    // eleven_multilingual_v2 würde „laughs" hörbar vorlesen
    expect(ohneTags('[laughs] Really? [excited] That is great!')).toBe('Really? That is great!')
  })

  it('lässt normale eckige Klammern im Satz nicht zum Problem werden', () => {
    expect(ohneTags('Er sagte: „Nein."')).toBe('Er sagte: „Nein."')
  })

  it('rührt lange Klammerinhalte nicht an – das ist kein Tag mehr', () => {
    const lang = '[dies ist ein sehr langer eingeklammerter Hinweis, der kein Audio-Tag sein kann]'
    expect(ohneTags(lang)).toBe(lang)
  })
})

describe('Lange Dialoge aufteilen', () => {
  const zeile = (n: number, laenge: number): { voiceId: string; text: string } => ({ voiceId: `v${n % 2}`, text: 'w'.repeat(laenge) })

  it('lässt einen kurzen Dialog in EINEM Block – jede Naht ist hörbar', () => {
    /*
     * eleven_v3 lehnt previous_request_ids ausdrücklich ab, Blöcke lassen sich also nicht
     * verbinden. Deshalb: so wenige Blöcke wie möglich.
     */
    expect(dialogBloecke([zeile(0, 100), zeile(1, 100)])).toHaveLength(1)
  })

  it('teilt erst, wenn die Grenze überschritten würde', () => {
    const zeilen = [zeile(0, 1200), zeile(1, 1200), zeile(2, 300)]
    const bloecke = dialogBloecke(zeilen)
    expect(bloecke).toHaveLength(2)
    for (const b of bloecke) expect(b.reduce((s, z) => s + z.text.length, 0)).toBeLessThanOrEqual(DIALOG_MAX_ZEICHEN)
  })

  it('verliert keine Zeile und behält die Reihenfolge', () => {
    const zeilen = Array.from({ length: 12 }, (_, i) => ({ voiceId: `v${i % 2}`, text: `Zeile ${i} ${'x'.repeat(400)}` }))
    const flach = dialogBloecke(zeilen).flat()
    expect(flach).toEqual(zeilen)
  })

  it('gibt einer überlangen einzelnen Zeile einen eigenen Block, statt sie zu zerschneiden', () => {
    // Mitten im Satz zu trennen wäre schlimmer als eine Naht am Sprecherwechsel
    const bloecke = dialogBloecke([zeile(0, 100), zeile(1, 2500), zeile(2, 100)])
    expect(bloecke.map((b) => b.length)).toEqual([1, 1, 1])
  })
})

describe('Langen Text eines Sprechers schneiden', () => {
  it('lässt kurzen Text unangetastet', () => {
    expect(textStuecke('Ein Satz. Noch einer.', 9000)).toEqual(['Ein Satz. Noch einer.'])
  })

  it('trennt an Satzenden, nie mitten im Satz', () => {
    const text = 'Erster Satz hier. Zweiter Satz hier. Dritter Satz hier.'
    for (const s of textStuecke(text, 25)) expect(s).toMatch(/[.!?]$/)
  })

  it('verliert keinen Inhalt', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Das ist Satz Nummer ${i}.`).join(' ')
    expect(textStuecke(text, 200).join(' ').replace(/\s+/g, ' ')).toBe(text)
  })
})
