import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import {
  erwarteterMix,
  erwarteteDauer,
  glaetteZiel,
  HISTORY,
  kiKennung,
  leseVerlauf,
  median,
  merkeAnfrage,
  merkeAuftrag,
  restAnzeige,
  schaetzeRest,
  vergissVerlauf,
  type DauerVerlauf,
  type RestzeitLage
} from '../src/renderer/src/shared/restzeit'

/**
 * Wache für die Restzeit (shared/restzeit.ts, 27.09.2026): gemerkte Dauern je Anfrageart und
 * KI, Mischung je Auftragsart, und die Schätzung daraus – auch nach einem Anbieterwechsel.
 */

const speicher = new Map<string, string>()
beforeEach(() => {
  speicher.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => void speicher.set(k, v),
    removeItem: (k: string) => void speicher.delete(k)
  })
  vergissVerlauf()
})

const KI = 'openai:gpt-image-2'
const TEXT = 'openai:gpt-5.5'

/** Verlauf wie nach ein paar Läufen „Posen zeichnen" (12 Bilder je 12 Umfang) mit 45 s je Bild */
function posenVerlauf(): DauerVerlauf {
  for (let i = 0; i < 5; i++) merkeAnfrage('bild', KI, { ms: 45000 + (i - 2) * 1000, chars: 0 })
  merkeAuftrag('Posen zeichnen', { ms: 12 * 45000, umfang: 12, ki: TEXT, mix: { bild: 12 } })
  merkeAuftrag('Posen zeichnen', { ms: 6 * 45000, umfang: 6, ki: TEXT, mix: { bild: 6 } })
  return leseVerlauf()
}

const lage = (teil: Partial<RestzeitLage>): RestzeitLage => ({
  art: 'Posen zeichnen',
  umfang: 12,
  elapsedMs: 0,
  ratio: 0,
  erledigt: {},
  laufend: [],
  ki: (art) => (art === 'bild' ? KI : TEXT),
  ...teil
})

describe('Verlauf der Dauern', () => {
  it('merkt je Anfrageart und KI die letzten Läufe, je Auftragsart die Mischung', () => {
    for (let i = 1; i <= HISTORY + 3; i++) merkeAnfrage('bild', KI, { ms: i * 1000, chars: 0 })
    const v = leseVerlauf()
    expect(v.anfragen[`bild@${KI}`]).toHaveLength(HISTORY)
    expect(v.anfragen[`bild@${KI}`][0].ms).toBe(4000)
    // Zu kurze „Läufe" (Fehler, sofortige Antworten) und Aufträge ohne Anfragen lernen nichts
    merkeAnfrage('bild', KI, { ms: 50, chars: 0 })
    merkeAuftrag('Leer', { ms: 5000, umfang: 1, ki: TEXT, mix: {} })
    expect(leseVerlauf().anfragen[`bild@${KI}`]).toHaveLength(HISTORY)
    expect(leseVerlauf().auftraege.Leer).toBeUndefined()
    // Median und Maximum
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(erwarteteDauer(leseVerlauf(), 'bild', KI)).toEqual({ median: 8500, max: 13000 })
    expect(erwarteteDauer(leseVerlauf(), 'bild', 'google:imagen')).toBeNull()
  })

  it('rechnet die Mischung je Umfangseinheit auf den neuen Umfang um', () => {
    const v = posenVerlauf()
    expect(erwarteterMix(v, 'Posen zeichnen', 3)).toEqual({ bild: 3 })
    expect(erwarteterMix(v, 'Unbekannt', 3)).toBeNull()
    // Ein Blatt: Gliederung 1×, Bausteine je Umfang 1×, Bilder etwa halb so oft
    merkeAuftrag('Ausformulieren', { ms: 60000, umfang: 4, ki: TEXT, mix: { outline: 1, block: 4, bild: 2 } })
    merkeAuftrag('Ausformulieren', { ms: 90000, umfang: 6, ki: TEXT, mix: { outline: 1, block: 6, bild: 3 } })
    const mix = erwarteterMix(leseVerlauf(), 'Ausformulieren', 8)!
    expect(mix.block).toBe(8)
    expect(mix.bild).toBe(4)
    expect(mix.outline).toBeCloseTo(((1 / 4 + 1 / 6) / 2) * 8, 5)
  })

  it('kennt die KI an Anbieter, Modell oder Abo-Weg', () => {
    const ai = structuredClone(DEFAULT_SETTINGS.ai)
    expect(kiKennung(ai, 'text')).toBe('openai:gpt-5.5')
    expect(kiKennung(ai, 'bild')).toBe('openai:gpt-image-2')
    expect(kiKennung(ai, 'text', { provider: 'anthropic', model: 'claude-opus-5' })).toBe('anthropic:claude-opus-5')
    ai.access.openai = 'subscription'
    expect(kiKennung(ai, 'text')).toBe('openai:abo:std')
    ai.subscriptionModels.openai = 'gpt-5.5-codex'
    expect(kiKennung(ai, 'text')).toBe('openai:abo:gpt-5.5-codex')
    ai.imageAccess.openai = 'subscription'
    expect(kiKennung(ai, 'bild')).toBe('openai:abo')
    ai.imageProvider = 'anthropic'
    expect(kiKennung(ai, 'bild')).toBe('anthropic:svg')
    ai.imageProvider = 'none'
    expect(kiKennung(ai, 'bild')).toBe('none')
  })
})

describe('Schätzung der Restzeit', () => {
  it('ohne Verlauf: keine Zahl, bis der Balken etwas hergibt – dann die Hochrechnung', () => {
    const leer = leseVerlauf()
    expect(schaetzeRest(lage({ elapsedMs: 20000, ratio: 0.05 }), leer)).toEqual({ sekunden: null, laenger: false })
    expect(schaetzeRest(lage({ elapsedMs: 30000, ratio: 0.5 }), leer)).toEqual({ sekunden: 30, laenger: false })
  })

  it('mit Verlauf steht die Zahl ab der ersten Sekunde: Ausstehendes mal Dauer plus Rest des Laufenden', () => {
    const v = posenVerlauf()
    // 2 Bilder fertig, eines läuft seit 10 s, 9 stehen aus: 9 × 45 + (45 − 10) = 440 s
    const l = lage({ elapsedMs: 100000, erledigt: { bild: 2 }, laufend: [{ art: 'bild', ki: KI, elapsedMs: 10000, chars: 0, expectedChars: 0 }] })
    expect(schaetzeRest(l, v)).toEqual({ sekunden: 440, laenger: false })
    // Kleinerer Umfang, nichts läuft: 3 × 45
    expect(schaetzeRest(lage({ umfang: 3 }), v).sekunden).toBe(135)
  })

  it('mischt die Hochrechnung des Balkens mit wachsendem Fortschritt ein – nie unter das Laufende', () => {
    const v = posenVerlauf()
    // Verlauf sagt 440 s, der Balken (17 % nach 100 s) sagt 488 s → gewichtet nach Anteil
    const l = lage({ elapsedMs: 100000, ratio: 0.17, erledigt: { bild: 2 }, laufend: [{ art: 'bild', ki: KI, elapsedMs: 10000, chars: 0, expectedChars: 0 }] })
    const s = schaetzeRest(l, v).sekunden!
    expect(s).toBeGreaterThan(440)
    expect(s).toBeLessThan(488)
    // Der Balken behauptet „fast fertig", die laufende Anfrage braucht noch 35 s: es bleiben 35 s
    const spaet = lage({
      elapsedMs: 600000,
      ratio: 0.99,
      erledigt: { bild: 11 },
      laufend: [{ art: 'bild', ki: KI, elapsedMs: 10000, chars: 0, expectedChars: 0 }]
    })
    expect(schaetzeRest(spaet, v).sekunden).toBe(35)
  })

  it('im Zeichenstrom zählt das Tempo der Antwort', () => {
    const v = leseVerlauf()
    // 3000 von 6000 Zeichen nach 20 s → noch 20 s, ganz ohne Verlauf
    const l = lage({
      art: 'Gliederung planen',
      umfang: 1,
      elapsedMs: 20000,
      laufend: [{ art: 'outline', ki: TEXT, elapsedMs: 20000, chars: 3000, expectedChars: 6000 }]
    })
    expect(schaetzeRest(l, v)).toEqual({ sekunden: 20, laenger: false })
    // Unter einem Zehntel ist das Tempo Zufall: ohne Verlauf keine Zahl
    const frueh = lage({
      art: 'Gliederung planen',
      umfang: 1,
      elapsedMs: 3000,
      laufend: [{ art: 'outline', ki: TEXT, elapsedMs: 3000, chars: 100, expectedChars: 6000 }]
    })
    expect(schaetzeRest(frueh, v).sekunden).toBeNull()
  })

  it('nach einem Anbieterwechsel gilt die alte Mischung mit den Zeiten des neuen – oder ehrlich nichts', () => {
    const v = posenVerlauf()
    const neu = 'google:imagen-4.0-generate-001'
    // Für die neue Bild-KI gibt es noch keine Dauer: keine erfundene Zahl
    const ohne = lage({ ki: () => neu, laufend: [{ art: 'bild', ki: neu, elapsedMs: 5000, chars: 0, expectedChars: 0 }] })
    expect(schaetzeRest(ohne, v).sekunden).toBeNull()
    // Sobald zwei Bilder der neuen KI gemessen sind (20 s), rechnet die alte Mischung damit
    merkeAnfrage('bild', neu, { ms: 20000, chars: 0 })
    merkeAnfrage('bild', neu, { ms: 20000, chars: 0 })
    const mit = lage({ ki: () => neu, erledigt: { bild: 2 }, laufend: [{ art: 'bild', ki: neu, elapsedMs: 5000, chars: 0, expectedChars: 0 }] })
    expect(schaetzeRest(mit, leseVerlauf()).sekunden).toBe(9 * 20 + 15)
  })

  it('sagt „länger als sonst", statt eine Zahl zu erfinden', () => {
    const v = posenVerlauf()
    // Ein Bild läuft seit 70 s – über dem Mittel (45 s): bis zur Grenze aus dem längsten Lauf (47 × 1,15 ≈ 54 s)… schon vorbei
    const letzte = lage({ umfang: 1, elapsedMs: 70000, laufend: [{ art: 'bild', ki: KI, elapsedMs: 70000, chars: 0, expectedChars: 0 }] })
    expect(schaetzeRest(letzte, v)).toEqual({ sekunden: 0, laenger: true })
    // Knapp über dem Mittel: bis zur Grenze, keine Meldung
    const knapp = lage({ umfang: 1, elapsedMs: 50000, laufend: [{ art: 'bild', ki: KI, elapsedMs: 50000, chars: 0, expectedChars: 0 }] })
    expect(schaetzeRest(knapp, v)).toEqual({ sekunden: 4, laenger: false })
    // Stehen noch Bilder aus, bleibt die Zahl, denn die sind zählbar
    const weitere = lage({ umfang: 3, elapsedMs: 70000, laufend: [{ art: 'bild', ki: KI, elapsedMs: 70000, chars: 0, expectedChars: 0 }] })
    expect(schaetzeRest(weitere, v)).toEqual({ sekunden: 90, laenger: false })
  })

  it('Anzeige: Zielzeitpunkt zählt von selbst herunter, das Ziel wird geglättet', () => {
    const jetzt = 1_000_000
    expect(restAnzeige({}, jetzt)).toBe('')
    expect(restAnzeige({ restLage: 'laenger' }, jetzt)).toBe('dauert länger als sonst')
    expect(restAnzeige({ restBis: jetzt + 100_000 }, jetzt)).toBe('noch etwa 1:40 Min.')
    expect(restAnzeige({ restBis: jetzt + 100_000 }, jetzt + 70_000)).toBe('noch etwa 30 Sek.')
    expect(restAnzeige({ restBis: jetzt + 2_000 }, jetzt)).toBe('gleich fertig')
    expect(glaetteZiel(undefined, 5000)).toBe(5000)
    expect(glaetteZiel(5000, 10000)).toBe(7000)
  })
})

describe('Wartende Aufträge ohne Restzeit (09.10.2026)', () => {
  it('vor dem Start keine Restzeit, danach schon', async () => {
    const { restAnzeige } = await import('../src/renderer/src/shared/restzeit')
    const jetzt = Date.now()
    expect(restAnzeige({ status: 'wartend', restBis: jetzt + 7000 }, jetzt)).toBe('')
    expect(restAnzeige({ status: 'wartend', gestartet: true, restBis: jetzt + 60_000 }, jetzt)).not.toBe('')
    expect(restAnzeige({ status: 'laeuft', restBis: jetzt + 60_000 }, jetzt)).not.toBe('')
  })
})
