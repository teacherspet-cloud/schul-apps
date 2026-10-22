/**
 * Transkript für Lernende an der Hörtext-Freigabe (23.10.2026, Barrierefreiheit/Nachteilsausgleich): Schalter je Freigabe
 * (aus / für alle / nur für ausgewählte), Entscheidung am Server aus der Sitzung, Text nie in der Seite, wenn nicht erlaubt.
 */
import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { setzeSchluesselFuerTests } from '../src/server/geheim'
import { datenbank, datenbankFuerTests, nutzerAnlegen, type NutzerInfo } from '../src/server/datenbank'
import {
  abspielCsp,
  freigabeFuer,
  hoertexteZuruecksetzen,
  hoertextRoute,
  skriptAusAnfrage,
  transkriptEinstellung,
  transkriptErlaubt,
  transkriptSetzen,
  transkriptWahlVon
} from '../src/server/hoertexte'
import type { Anfrage } from '../src/server/http'

const person = (benutzer: string, rolle: 'schueler' | 'lehrkraft' = 'schueler', quelle: NutzerInfo['quelle'] = 'iserv') => ({ benutzer, rolle, quelle }) as const

describe('Transkript: wer darf es sehen?', () => {
  it('aus: niemand – auch nicht ausgewählte', () => {
    const w = transkriptWahlVon({ wer: 'aus', schueler: ['mia'] })
    expect(w).toEqual({ wer: 'aus', schueler: [] })
    expect(transkriptErlaubt(w, person('mia'))).toBe(false)
    expect(transkriptErlaubt(w, null)).toBe(false)
  })
  it('für alle: auch ohne Anmeldung und für Gastkonten', () => {
    const w = transkriptWahlVon({ wer: 'alle' })
    expect(transkriptErlaubt(w, null)).toBe(true)
    expect(transkriptErlaubt(w, person('gast-1', 'schueler', 'gast'))).toBe(true)
    expect(transkriptErlaubt(w, person('ben'))).toBe(true)
  })
  it('nur für ausgewählte: nur angemeldete, ausgewählte Schülerkonten', () => {
    const w = transkriptWahlVon({ wer: 'einzelne', schueler: [' Mia.Probe ', 'mia.probe', 3] })
    expect(w).toEqual({ wer: 'einzelne', schueler: ['mia.probe'] })
    expect(transkriptErlaubt(w, person('mia.probe'))).toBe(true)
    expect(transkriptErlaubt(w, person('ben'))).toBe(false)
    expect(transkriptErlaubt(w, null)).toBe(false)
    // Gastkonto mit gleichem Namen und Lehrkräfte: nicht über „ausgewählte"
    expect(transkriptErlaubt(w, person('mia.probe', 'schueler', 'gast'))).toBe(false)
    expect(transkriptErlaubt(w, person('mia.probe', 'lehrkraft'))).toBe(false)
  })
  it('ausgewählte ohne Auswahl und Unbekanntes sind „aus"', () => {
    expect(transkriptWahlVon({ wer: 'einzelne', schueler: [] }).wer).toBe('aus')
    expect(transkriptWahlVon('kaputt{').wer).toBe('aus')
    expect(transkriptWahlVon({ wer: 'jeder' }).wer).toBe('aus')
    expect(transkriptWahlVon('').wer).toBe('aus')
  })
  it('Skript aus der Vertonungsanfrage: mit Namen, sonst die Sprecherzeilen', () => {
    expect(skriptAusAnfrage({ skript: 'Anna: Hi', turns: [{ text: 'Hi' }] })).toBe('Anna: Hi')
    expect(skriptAusAnfrage({ turns: [{ text: ' Hi ' }, { text: 'Bye' }] })).toBe('Hi\nBye')
    expect(skriptAusAnfrage(null)).toBeUndefined()
  })
  it('CSP: Skript nur per Hash und nur mit Transkript', () => {
    expect(abspielCsp(false)).not.toContain('script-src')
    expect(abspielCsp(true)).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+';/)
    expect(abspielCsp(true)).not.toContain('unsafe-inline\'; base')
  })
})

describe('Transkript: Abspielseite und Einstellung am Server', () => {
  let lehrkraft: NutzerInfo
  let andere: NutzerInfo
  let mia: NutzerInfo
  let ben: NutzerInfo
  let kennung = ''
  const SKRIPT = 'Anna: Where is the <station>?\nTom: Over there & left.'

  beforeAll(() => {
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    hoertexteZuruecksetzen()
    lehrkraft = nutzerAnlegen({ benutzer: 'frau.lehrer', name: 'Frau Lehrer', rolle: 'lehrkraft', quelle: 'lokal' })
    andere = nutzerAnlegen({ benutzer: 'herr.anders', name: 'Herr Anders', rolle: 'lehrkraft', quelle: 'lokal' })
    mia = nutzerAnlegen({ benutzer: 'mia.probe', name: 'Mia Probe', rolle: 'schueler', quelle: 'lokal' })
    ben = nutzerAnlegen({ benutzer: 'ben.probe', name: 'Ben Probe', rolle: 'schueler', quelle: 'lokal' })
    kennung = freigabeFuer(lehrkraft.id, 'hoertext-abc.mp3', 'Am Bahnhof', SKRIPT)
  })

  /** Abspielseite für eine Sitzung abrufen */
  async function seite(nutzer: NutzerInfo | null): Promise<{ html: string; csp: string }> {
    let html = ''
    let kopf: Record<string, string> = {}
    const res = {
      writeHead(_c: number, h: Record<string, string>) {
        kopf = h
        return res
      },
      end(t?: string) {
        html = t ?? ''
      }
    }
    const k = {
      req: { method: 'GET', headers: {} },
      res,
      url: new URL(`https://schule.test/h/${kennung}`),
      sitzung: nutzer ? { nutzer, kennung: 'x' } : null,
      ip: '127.0.0.1',
      koerper: async () => ({})
    } as unknown as Anfrage
    expect(await hoertextRoute(k)).toBe(true)
    return { html, csp: kopf['content-security-policy'] }
  }

  it('Vorgabe „aus": kein Knopf, kein Text, kein Skript', async () => {
    expect(transkriptEinstellung(kennung, lehrkraft.id)).toEqual({ wer: 'aus', schueler: [], hatText: true })
    for (const n of [null, mia]) {
      const s = await seite(n)
      expect(s.html).toContain('Am Bahnhof')
      expect(s.html).not.toContain('Transkript anzeigen')
      expect(s.html).not.toContain('station')
      expect(s.html).not.toContain('<script')
      expect(s.csp).not.toContain('script-src')
    }
  })

  it('Text und Auswahl liegen nur verschlüsselt in der Datenbank', () => {
    transkriptSetzen(kennung, lehrkraft.id, { wer: 'einzelne', schueler: ['mia.probe'] })
    const roh = (datenbank() as unknown as { prepare: (s: string) => { all: () => unknown[] } })
      .prepare('SELECT transkript AS t, transkript_wahl AS w FROM hoertext_freigaben')
      .all() as { t: string; w: string }[]
    expect(String(roh[0].t)).toMatch(/^v1:/)
    expect(String(roh[0].w)).toMatch(/^v1:/)
    expect(JSON.stringify(roh)).not.toMatch(/station|mia\.probe/)
  })

  it('nur für ausgewählte: Mia sieht es, Ben und Gäste ohne Anmeldung nicht', async () => {
    transkriptSetzen(kennung, lehrkraft.id, { wer: 'einzelne', schueler: ['mia.probe'] })
    const m = await seite(mia)
    expect(m.html).toContain('aria-expanded="false"')
    expect(m.html).toContain('aria-controls="transkript"')
    expect(m.html).toContain('<h2 id="transkript-titel">Transkript</h2>')
    // escaped, je Zeile ein Absatz
    expect(m.html).toContain('<p>Anna: Where is the &lt;station&gt;?</p>')
    expect(m.html).toContain('<p>Tom: Over there &amp; left.</p>')
    expect(m.csp).toMatch(/script-src 'sha256-/)
    for (const n of [ben, null]) {
      const s = await seite(n)
      expect(s.html).not.toContain('station')
      expect(s.html).not.toContain('Transkript anzeigen')
    }
  })

  it('für alle: auch ohne Anmeldung', async () => {
    transkriptSetzen(kennung, lehrkraft.id, { wer: 'alle', schueler: ['mia.probe'] })
    expect(transkriptEinstellung(kennung, lehrkraft.id)).toEqual({ wer: 'alle', schueler: [], hatText: true })
    const s = await seite(null)
    expect(s.html).toContain('Transkript anzeigen')
    expect(s.html).toContain('&lt;station&gt;')
  })

  it('nur die eigene Freigabe; neues Skript ersetzt den Text', async () => {
    expect(transkriptSetzen(kennung, andere.id, { wer: 'aus' })).toBeNull()
    expect(transkriptEinstellung(kennung, andere.id)).toBeNull()
    transkriptSetzen(kennung, lehrkraft.id, { wer: 'alle', text: 'Neu: Good morning.' })
    const s = await seite(null)
    expect(s.html).toContain('Neu: Good morning.')
    expect(s.html).not.toContain('station')
    // Neuvertonen: das vertonte Skript gilt
    expect(freigabeFuer(lehrkraft.id, 'hoertext-abc.mp3', 'Am Bahnhof', 'Anna: Again.')).toBe(kennung)
    expect((await seite(null)).html).toContain('Anna: Again.')
  })
})
