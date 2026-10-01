import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ablehnen,
  ablehnungsPruefer,
  aufheben,
  ausgeblendetImThema,
  findeAblehnung,
  leereAblehnungen,
  normalisiereQuellenUrl,
  pruefeAblehnungen,
  themenSchluessel
} from '../src/shared/quellenAblehnung'

/*
 * Abgelehnte Quellen (01.10.2026). Gemeldet von der Lehrkraft: Zu „German Macbeth Adaptations"
 * kamen „Die Musikforschung" und „Friedrich Gundolf" immer wieder, obwohl sie aussortiert
 * waren. Das Aussortieren wurde nirgends gespeichert. Geprüft wird hier: Normalisierung der
 * Adresse, dauerhafte Speicherung, Thema gegen „nie wieder", und dass die Liste für ALLE
 * Programme dieselbe ist.
 */
let wurzel = ''
vi.mock('electron', () => ({ app: { getPath: () => wurzel } }))
const speicher = await import('../src/main/services/storage/quellenAblehnungen')

const MUSIK = 'https://de.wikisource.org/wiki/Die_Musikforschung'
const GUNDOLF = 'https://de.wikisource.org/wiki/Friedrich_Gundolf'
const THEMA = 'German Macbeth Adaptations'

describe('Adresse normalisieren', () => {
  it('erkennt dieselbe Wikisource-Seite in allen Schreibweisen', () => {
    const varianten = [
      MUSIK,
      'https://de.m.wikisource.org/wiki/Die_Musikforschung',
      'http://de.wikisource.org/wiki/Die%20Musikforschung',
      'https://de.wikisource.org/wiki/Die_Musikforschung#Inhalt',
      'https://de.wikisource.org/wiki/die_musikforschung',
      'https://de.wikisource.org/w/index.php?title=Die_Musikforschung',
      'de.wikisource.org/wiki/Die Musikforschung'
    ]
    const schluessel = new Set(varianten.map(normalisiereQuellenUrl))
    expect(schluessel.size).toBe(1)
    expect([...schluessel][0]).toBe('de.wikisource.org/wiki/die musikforschung')
  })

  it('hält verschiedene Seiten auseinander', () => {
    expect(normalisiereQuellenUrl(MUSIK)).not.toBe(normalisiereQuellenUrl(GUNDOLF))
    expect(normalisiereQuellenUrl(MUSIK)).not.toBe(normalisiereQuellenUrl('https://en.wikisource.org/wiki/Die_Musikforschung'))
  })

  it('entfernt Anker, Verfolgungsparameter, www und den Schrägstrich am Ende', () => {
    const a = normalisiereQuellenUrl('https://www.example.org/feuilleton/macbeth-kritik/?utm_source=x&fbclid=1#kommentare')
    const b = normalisiereQuellenUrl('https://example.org/feuilleton/macbeth-kritik')
    expect(a).toBe(b)
  })

  it('behält Parameter, die eine andere Seite bezeichnen', () => {
    expect(normalisiereQuellenUrl('https://example.org/artikel?id=1')).not.toBe(normalisiereQuellenUrl('https://example.org/artikel?id=2'))
    // Reihenfolge der Parameter ist egal
    expect(normalisiereQuellenUrl('https://example.org/a?x=1&y=2')).toBe(normalisiereQuellenUrl('https://example.org/a?y=2&x=1'))
  })

  it('führt die Gutenberg-Formen auf die Buchnummer zurück', () => {
    expect(normalisiereQuellenUrl('https://www.gutenberg.org/cache/epub/1533/pg1533.txt')).toBe('gutenberg.org/ebooks/1533')
    expect(normalisiereQuellenUrl('https://www.gutenberg.org/ebooks/1533')).toBe('gutenberg.org/ebooks/1533')
  })

  it('bildet einen Themenschlüssel unabhängig von Reihenfolge und Schreibung', () => {
    expect(themenSchluessel('German Macbeth Adaptations')).toBe(themenSchluessel('macbeth – german adaptations'))
    expect(themenSchluessel('Über Macbeth')).toBe(themenSchluessel('uber macbeth'))
    expect(themenSchluessel(THEMA)).not.toBe(themenSchluessel('Macbeth'))
  })
})

describe('Ablehnen und prüfen', () => {
  it('blendet „für dieses Thema" nur in diesem Thema aus', () => {
    const d = ablehnen(leereAblehnungen(), { url: MUSIK, titel: 'Die Musikforschung', umfang: 'thema', thema: THEMA, art: 'text' })
    expect(findeAblehnung(d, MUSIK, THEMA)).toBeDefined()
    expect(findeAblehnung(d, 'https://de.m.wikisource.org/wiki/Die%20Musikforschung', 'macbeth german adaptations')).toBeDefined()
    expect(findeAblehnung(d, MUSIK, 'Verdi und die Oper')).toBeUndefined()
    expect(findeAblehnung(d, MUSIK)).toBeUndefined()
  })

  it('blendet „nie wieder" in jedem Thema aus', () => {
    const d = ablehnen(leereAblehnungen(), { url: GUNDOLF, titel: 'Friedrich Gundolf', umfang: 'global', art: 'text' })
    expect(findeAblehnung(d, GUNDOLF, THEMA)).toBeDefined()
    expect(findeAblehnung(d, GUNDOLF, 'Romantik')).toBeDefined()
    expect(findeAblehnung(d, GUNDOLF)).toBeDefined()
  })

  it('legt keine Doppel an und ersetzt Themen-Einträge durch „nie wieder"', () => {
    let d = ablehnen(leereAblehnungen(), { url: MUSIK, titel: '', umfang: 'thema', thema: THEMA, art: 'text' })
    d = ablehnen(d, { url: MUSIK.replace('_', '%20'), titel: '', umfang: 'thema', thema: THEMA.toLowerCase(), art: 'text' })
    expect(d.eintraege).toHaveLength(1)
    d = ablehnen(d, { url: MUSIK, titel: '', umfang: 'global', art: 'text' })
    expect(d.eintraege).toHaveLength(1)
    expect(d.eintraege[0].umfang).toBe('global')
  })

  it('prüft viele Treffer über einen einmal gebauten Prüfer', () => {
    let d = ablehnen(leereAblehnungen(), { url: MUSIK, titel: '', umfang: 'thema', thema: THEMA, art: 'text' })
    d = ablehnen(d, { url: GUNDOLF, titel: '', umfang: 'global', art: 'text' })
    const pruefe = ablehnungsPruefer(d, THEMA)
    expect(pruefe('https://de.m.wikisource.org/wiki/Die_Musikforschung')).toBeDefined()
    expect(pruefe(GUNDOLF + '#Werke')).toBeDefined()
    expect(pruefe('https://de.wikisource.org/wiki/Macbeth_(Schiller)')).toBeUndefined()
    // Ohne Thema greift nur „nie wieder"
    const ohne = ablehnungsPruefer(d)
    expect(ohne(MUSIK)).toBeUndefined()
    expect(ohne(GUNDOLF)).toBeDefined()
  })

  it('hebt einzelne Seiten oder alle Ausblendungen eines Themas wieder auf', () => {
    let d = ablehnen(leereAblehnungen(), { url: MUSIK, titel: '', umfang: 'thema', thema: THEMA, art: 'text' })
    d = ablehnen(d, { url: 'https://example.org/a', titel: '', umfang: 'thema', thema: THEMA, art: 'text' })
    d = ablehnen(d, { url: GUNDOLF, titel: '', umfang: 'global', art: 'text' })
    expect(ausgeblendetImThema(d, THEMA)).toBe(2)
    const ohneThema = aufheben(d, { thema: THEMA })
    expect(ausgeblendetImThema(ohneThema, THEMA)).toBe(0)
    // „Nie wieder" bleibt beim Aufheben eines Themas bestehen
    expect(findeAblehnung(ohneThema, GUNDOLF, THEMA)).toBeDefined()
    expect(findeAblehnung(aufheben(d, { url: GUNDOLF }), GUNDOLF)).toBeUndefined()
  })

  it('liest eine beschädigte Datei, ohne die brauchbaren Einträge zu verlieren', () => {
    const d = pruefeAblehnungen({ eintraege: [null, { url: '' }, { url: MUSIK, umfang: 'thema' }, { url: GUNDOLF, umfang: 'global', titel: 'G' }] })
    expect(d.eintraege.map((e) => e.titel)).toEqual(['G'])
    expect(pruefeAblehnungen('kaputt').eintraege).toEqual([])
  })
})

describe('Dauerhaft und für alle Programme', () => {
  beforeEach(() => {
    wurzel = mkdtempSync(join(tmpdir(), 'schulapps-ablehnung-'))
  })
  afterEach(() => rmSync(wurzel, { recursive: true, force: true }))

  it('speichert die Ablehnung in einer Datei und liest sie nach einem Neustart wieder', () => {
    speicher.quelleAblehnen({
      url: MUSIK,
      titel: 'Die Musikforschung',
      umfang: 'thema',
      thema: THEMA,
      themaText: THEMA,
      art: 'text',
      programm: 'klassenarbeit'
    })
    const datei = JSON.parse(readFileSync(join(wurzel, speicher.ABLEHNUNGEN_DATEI), 'utf8'))
    expect(datei.eintraege).toHaveLength(1)
    // „Neustart": nur noch die Datei zählt
    const neu = speicher.leseAblehnungen()
    expect(findeAblehnung(neu, MUSIK, THEMA)?.programm).toBe('klassenarbeit')
  })

  it('gilt app-übergreifend: in der Klassenarbeit abgelehnt, im Arbeitsblatt ausgeblendet', () => {
    // Klassenarbeit („Keine davon": alle gezeigten Funde für dieses Thema)
    speicher.quelleAblehnen([
      { url: MUSIK, titel: 'Die Musikforschung', umfang: 'thema', thema: THEMA, art: 'text', programm: 'klassenarbeit' },
      { url: GUNDOLF, titel: 'Friedrich Gundolf', umfang: 'thema', thema: THEMA, art: 'text', programm: 'klassenarbeit' }
    ])
    // Arbeitsblatt zum selben Thema, Adresse in mobiler Schreibweise
    const pruefe = ablehnungsPruefer(speicher.leseAblehnungen(), 'german macbeth adaptations')
    expect(pruefe('https://de.m.wikisource.org/wiki/Friedrich%20Gundolf')).toBeDefined()
    expect(pruefe(MUSIK)).toBeDefined()
    // Bildsuche (Stundenverlauf) teilt dieselbe Liste
    speicher.quelleAblehnen({
      url: 'https://commons.wikimedia.org/wiki/File:Macbeth.jpg',
      titel: '',
      umfang: 'global',
      art: 'bild',
      programm: 'stundenverlauf'
    })
    expect(findeAblehnung(speicher.leseAblehnungen(), 'https://commons.m.wikimedia.org/wiki/File:Macbeth.jpg')?.art).toBe('bild')
  })

  it('steht in der Sicherung', async () => {
    const { SICHERUNG_DATEIEN } = await import('../src/main/services/storage/wartung')
    expect(SICHERUNG_DATEIEN()).toContain(speicher.ABLEHNUNGEN_DATEI)
  })
})
