import { describe, expect, it } from 'vitest'
import {
  abrufUebungFuer,
  bewerte,
  buchstaben,
  ERKENNEN,
  leerzeichenSelbst,
  linkRunde,
  mitApostrophen,
  mitLeerzeichenVoraus,
  neuerStand,
  ohneAuslassung,
  type Vokabel,
  type WortStand
} from '../src/shared/vokabeltrainer'
import { schnellWaechter, SCHNELL_FOLGE } from '../src/shared/schnellKlick'
import { mitUebung, regelTipp, type TippDaten } from '../src/shared/lernstand'
import { fremdSeiteSichtbar, KEIN_ZUG, zugAbbrechen, zugBeenden, zugBeginnen, zugBewegen } from '../src/renderer/src/modules/lernen/kartenZug'
import { gelegtText, LEER, leerAnhaengen, nurBuchstaben, tippStand, zuordnen, type Kachel } from '../src/renderer/src/modules/lernen/handschrift/legeLogik'

/* Runde 09.10.2026: Vokabeltrainer und Spiele (Wünsche und Befunde der Lehrkraft) */

describe('Lernkarte: Ziehen friert nicht mehr ein', () => {
  it('Tippen und Ziehen drehen um, wenn der Zug auf der Karte begann', () => {
    let z = zugBeginnen(KEIN_ZUG, 1, 100)
    expect(zugBeenden(z, 1).umdrehen).toBe(true)
    // Leichte Bewegung beim Klick (früher die tote Zone 6–40 px): dreht trotzdem um
    z = zugBewegen(zugBeginnen(KEIN_ZUG, 1, 100), 1, 120)
    expect(z.zug).toBe(20)
    const r = zugBeenden(z, 1)
    expect(r.umdrehen).toBe(true)
    expect(r.zug).toEqual(KEIN_ZUG)
  })
  it('Abgebrochener Zug (Text/Bild gezogen, Tablet scrollt, Fenster verlassen) bleibt nicht hängen', () => {
    const z = zugBewegen(zugBeginnen(KEIN_ZUG, 7, 100), 7, 300)
    expect(z.zug).toBe(60)
    const weg = zugAbbrechen(z, 7)
    expect(weg).toEqual(KEIN_ZUG)
    // Danach kippt die Karte beim bloßen Überfahren nicht mehr mit
    expect(zugBewegen(weg, 7, 400)).toEqual(KEIN_ZUG)
    // … und der nächste Klick dreht sie normal um
    expect(zugBeenden(zugBeginnen(weg, 8, 50), 8).umdrehen).toBe(true)
    // Blur/Ausblenden ohne Zeiger
    expect(zugAbbrechen(z)).toEqual(KEIN_ZUG)
  })
  it('Loslassen ohne Drücken auf der Karte oder mit fremdem Zeiger dreht nicht', () => {
    expect(zugBeenden(KEIN_ZUG, 1).umdrehen).toBe(false)
    const z = zugBeginnen(KEIN_ZUG, 1, 0)
    expect(zugBeginnen(z, 2, 50)).toBe(z)
    expect(zugBeenden(z, 2).umdrehen).toBe(false)
    expect(zugAbbrechen(z, 2)).toBe(z)
  })
  it('Aussprache nur auf der fremdsprachigen Seite (deutsche Vorderseite verrät nichts)', () => {
    expect(fremdSeiteSichtbar(true, false)).toBe(false)
    expect(fremdSeiteSichtbar(true, true)).toBe(true)
    expect(fremdSeiteSichtbar(false, false)).toBe(true)
    expect(fremdSeiteSichtbar(false, true)).toBe(false)
  })
})

describe('Zu schnell geklickt', () => {
  it('fünf gleiche, blitzschnelle Antworten: ab der fünften nicht gewertet, die vier davor zurück', () => {
    const w = schnellWaechter<number>()
    for (let k = 0; k < SCHNELL_FOLGE - 1; k++) expect(w.melden('ja', 300, k)).toEqual({ werten: true, hinweis: false, zurueck: [] })
    const r = w.melden('ja', 250, 4)
    expect(r.werten).toBe(false)
    expect(r.hinweis).toBe(true)
    expect(r.zurueck).toEqual([0, 1, 2, 3])
    // Geht es weiter, zählt weiterhin nichts – zurückgenommen wird nur einmal
    expect(w.melden('ja', 200, 5)).toEqual({ werten: false, hinweis: true, zurueck: [] })
  })
  it('langsame oder wechselnde Antworten sind kein Muster', () => {
    const w = schnellWaechter()
    for (let k = 0; k < 10; k++) expect(w.melden('ja', 900).werten).toBe(true)
    const v = schnellWaechter()
    for (let k = 0; k < 10; k++) expect(v.melden(k % 2 ? 'ja' : 'nein', 300).werten).toBe(true)
    // Eine langsame Antwort beendet die Folge
    const u = schnellWaechter()
    for (let k = 0; k < 4; k++) u.melden('nein', 300)
    expect(u.melden('nein', 1500).werten).toBe(true)
    expect(u.melden('nein', 300).werten).toBe(true)
  })
})

describe('Auslassungspunkte in Lösungen', () => {
  it('„to look forward to ..." gilt ohne Punkte und mit „…" als richtig', () => {
    expect(bewerte('look forward to', 'to look forward to ...').urteil).toBe('richtig')
    expect(bewerte('to look forward to', 'to look forward to ...').urteil).toBe('richtig')
    expect(bewerte('look forward to ...', 'to look forward to ...').urteil).toBe('richtig')
    expect(bewerte('look forward to…', 'to look forward to ...').urteil).toBe('richtig')
    expect(bewerte('look forward to', 'to look forward to …').urteil).toBe('richtig')
    expect(bewerte('… ago', '... ago').urteil).toBe('richtig')
    expect(bewerte('ago', '... ago').urteil).toBe('richtig')
  })
  it('Apostroph-Toleranz bleibt, einzelne Punkte („sb.") bleiben', () => {
    expect(bewerte('don’t …', "don't ...").urteil).toBe('richtig')
    expect(ohneAuslassung('to remind sb. of ...')).toBe('to remind sb. of')
    expect(bewerte('to look forward', 'to look forward to ...').urteil).not.toBe('richtig')
  })
  it('keine Punkt-Plättchen beim Buchstabenlegen', () => {
    expect(buchstaben('to look forward to ...', () => 0.5).includes('.')).toBe(false)
  })
})

const kacheln = (wort: string): Kachel[] => [...wort.replace(/[\s']/g, '')].map((b, i) => ({ b, i }))

describe('Lege das Wort: Tastatur und Leerzeichen', () => {
  it('Tippfeld zeigt das nächste Leerzeichen schon an, ohne es doppelt zu nehmen', () => {
    expect(mitLeerzeichenVoraus('to bring about', 'bring')).toBe('bring ')
    expect(mitLeerzeichenVoraus('to bring about', 'bringa')).toBe('bring a')
    expect(mitLeerzeichenVoraus('house', 'house')).toBe('house')
    expect(mitLeerzeichenVoraus('to bring about', '')).toBe('')
    const k = kacheln('bringabout')
    const anzeige = (g: number[]): string => mitLeerzeichenVoraus('to bring about', gelegtText(g, k))
    let g = zuordnen('bring', k).gelegt
    expect(anzeige(g)).toBe('bring ')
    // Selbst getipptes Leerzeichen: nicht doppelt
    g = tippStand({ text: anzeige(g), gelegt: g }, 'bring  ', k).gelegt
    expect(anzeige(g)).toBe('bring ')
    g = tippStand({ text: anzeige(g), gelegt: g }, 'bring a', k).gelegt
    expect(anzeige(g)).toBe('bring a')
    // Rücktaste hinter dem vorgegebenen Leerzeichen nimmt den Buchstaben davor mit
    g = zuordnen('bring', k).gelegt
    g = tippStand({ text: 'bring ', gelegt: g }, 'bring', k).gelegt
    expect(anzeige(g)).toBe('brin')
  })
  it('schwerste Stufe: Leerzeichen selbst setzen, nichts verrät die Trennung', () => {
    expect(leerzeichenSelbst({ fach: 1 })).toBe(false)
    expect(leerzeichenSelbst({ fach: 2 })).toBe(true)
    expect(leerzeichenSelbst(null)).toBe(false)
    const k = kacheln('bringabout')
    // Ohne Leerzeichen gelegt: so steht es da – und ist falsch
    const ohne = mitApostrophen('to bring about', gelegtText(zuordnen('bringabout', k, true).gelegt, k))
    expect(ohne).toBe('bringabout')
    expect(bewerte(ohne, 'to bring about').urteil).not.toBe('richtig')
    const mit = zuordnen('bring  about', k, true).gelegt
    expect(mit.filter((x) => x === LEER)).toHaveLength(1)
    expect(nurBuchstaben(mit)).toHaveLength(10)
    expect(bewerte(mitApostrophen('to bring about', gelegtText(mit, k)), 'to bring about').urteil).toBe('richtig')
    expect(leerAnhaengen([])).toEqual([])
    expect(leerAnhaengen([0, LEER])).toEqual([0, LEER])
    expect(zuordnen(' house', kacheln('house'), true).gelegt[0]).not.toBe(LEER)
  })
  it('Apostrophe stehen weiter von selbst an ihrer Stelle', () => {
    expect(mitApostrophen("l'école", 'lécole')).toBe("l'école")
    expect(mitApostrophen("dogs' food", 'dogs food')).toBe("dogs' food")
    expect(mitApostrophen("don't", 'dont')).toBe("don't")
  })
})

const stand = (s: Partial<WortStand>): WortStand => ({ ...neuerStand(), ...s })
const W = (n: number): Vokabel[] => Array.from({ length: n }, (_, i) => ({ id: `w${i}`, term: `word${i}`, translation: `Wort${i}` }) as Vokabel)

describe('Abfrage ohne Hinschauen und Links aus den Tipps', () => {
  it('nur selbst abrufen – nie Auswahl oder Erkennen', () => {
    const v = W(1)[0]
    for (let z = 0; z < 1; z += 0.05)
      for (const fach of [0, 1, 2, 3, 4]) {
        const u = abrufUebungFuer(stand({ fach, versuche: 2 }), v, z)
        expect(ERKENNEN.includes(u)).toBe(false)
        expect(u).not.toBe('karte')
      }
    expect(abrufUebungFuer(stand({ fach: 0, versuche: 0 }), v, 0.5)).toBe('karte')
  })
  it('Tipp-Knöpfe öffnen genau die Übung', () => {
    expect(mitUebung('/s/v/abc123', 'abfragen')).toBe('/s/v/abc123?uebung=abfragen')
    expect(mitUebung('/s/g/abc123', 'abfragen')).toBe('/s/g/abc123')
    const d: TippDaten = {
      stufe: 'mittel',
      fleiss: { tage14: 9, fleissig: true } as TippDaten['fleiss'],
      leistung: { stand: 'niedrig' } as TippDaten['leistung'],
      vokabeln: [{ id: 'v1', titel: 'Unit 1', faellig: 4, wackelig: 0, testInTagen: null, href: '/s/v/v1' }]
    }
    const t = regelTipp(d)
    expect(t.knopf?.text).toBe('Abfrage ohne Hinschauen starten')
    expect(t.knopf?.href).toBe('/s/v/v1?uebung=abfragen')
  })
  it('linkRunde: bekannte zuerst beim Abfragen, wackelige freiwillig, Unbekanntes → nichts', () => {
    const jetzt = Date.now()
    const liste = W(4)
    const st: Record<string, WortStand> = {
      w0: stand({ fach: 1, versuche: 3, falsch: 1, faellig: jetzt - 1000, zuletzt: jetzt - 86_400_000 }),
      w1: stand({ fach: 3, versuche: 4, faellig: jetzt + 9e9, zuletzt: jetzt - 86_400_000 })
    }
    const a = linkRunde('abfragen', liste, st, jetzt)!
    expect(a.abfragen).toBe(true)
    expect(a.woerter[0].id).toBe('w0')
    const w = linkRunde('wackelig', liste, st, jetzt)!
    expect(w.freiwillig).toBe(true)
    expect(w.woerter.map((x) => x.id)).toEqual(['w0'])
    expect(linkRunde('runde', liste, st, jetzt)?.woerter.length).toBeGreaterThan(0)
    expect(linkRunde('quatsch', liste, st, jetzt)).toBeNull()
    expect(linkRunde(null, liste, st, jetzt)).toBeNull()
  })
})

describe('Zu schnell geklickt – nur blindes Raten (09.10.2026)', () => {
  it('schnell und richtig zählt weiter, schnell mit Fehlern nicht', async () => {
    const { schnellWaechter } = await import('../src/shared/schnellKlick')
    const w = schnellWaechter<number>()
    for (let i = 0; i < 8; i++) expect(w.melden('passt', 200, i, true).werten).toBe(true)
    const r = schnellWaechter<number>()
    const erg = [true, false, true, false, true].map((ok, i) => r.melden('passt', 200, i, ok))
    expect(erg[4].werten).toBe(false)
    expect(erg[4].hinweis).toBe(true)
  })
})
