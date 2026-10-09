/**
 * Handlungsbedarf aus EINER Quelle (09.10.2026, Befund der Lehrkraft): „Meine Klassen" und die Kursseite in
 * Sprachenlernen zeigten für denselben Klassenkurs verschiedene Einträge, und ein Grammatik-Eintrag führte zur
 * Vokabeltabelle. Jetzt rechnet der Server die Kurs-Hinweise mit shared/kursHinweise.ts; die Kursseite zeigt genau
 * diese Einträge ihres Kurses. Rein, ohne Datenbank (Grammatik-Profil als Attrappe).
 */
import { describe, expect, it } from 'vitest'
import { bedarfAufteilen, kursBedarfDerGruppe, type Merkmal } from '../src/server/klassen'
import { klassenReiterFuer, kursBedarf, kursHinweise, type KursHinweisEingabe } from '../src/shared/kursHinweise'
import { empfehlung } from '../src/shared/grammatikBereiche'
import { fokusZiele } from '../src/renderer/src/modules/lernen/kurs/kursFokus'
import type { NutzerInfo } from '../src/server/datenbank'

const TAG = 86_400_000
const jetzt = Date.parse('2026-10-09T10:00:00')
const eingabe: KursHinweisEingabe = {
  status: 'offen',
  testTermin: jetzt + 3 * TAG,
  woerter: 20,
  teile: [{ titel: 'Unit 1', anzahl: 20, zeit: jetzt - 20 * TAG }],
  gesamt: { gesamt: 40, sicher: 10 },
  lernende: [
    { id: 'a', name: 'Ada K.', tage7: 2, uebersicht: { gesamt: 20, sicher: 1 } },
    { id: 'b', name: 'Ben S.', tage7: 0, uebersicht: { gesamt: 20, sicher: 9 } }
  ]
}
const nutzer = [
  { id: 'a', name: 'Ada K.', benutzer: 'ada.k' },
  { id: 'b', name: 'Ben S.', benutzer: 'ben.s' }
] as unknown as NutzerInfo[]
const schwaeche = { versuche: 8, quote: 0.3, fach: 1 }
// Ada hat eine Grammatik-Schwäche, Ben nicht (Attrappe für grammatikFoerder – gleiche Regel wie die Kursseite: empfehlung)
const profil = (nutzer: NutzerInfo[]): Set<string> =>
  new Set(nutzer.filter((n) => empfehlung(n.id === 'a' ? [schwaeche] : []).art === 'foerder').map((n) => n.id))
const daten = { k1: { eingabe, sprache: 'en', nutzer } }
const kurse = [{ id: 'k1', titel: '5b – Englisch', kursName: 'Vokabeln Englisch' }]

describe('Handlungsbedarf: eine Quelle für „Meine Klassen" und Kursseite', () => {
  it('gleiche Eingabe → gleiche Einträge (Wortlaut, Reihenfolge, Reiter) in beiden Ansichten', () => {
    const klasse = kursBedarfDerGruppe(daten, kurse, 'lk', jetzt, profil)
    // Die Kursseite rechnet für spontane Gruppen selbst – mit derselben Funktion und demselben Ergebnis
    const kursseite = kursHinweise({ ...eingabe, foerder: [{ id: 'a', name: 'Ada K.' }] }, jetzt)
    expect(klasse.map((b) => b.text)).toEqual(kursseite.map((h) => h.text))
    expect(klasse.map((b) => b.hinweis)).toEqual(['termin', 'schwach', 'foerdern', 'inaktiv'])
    expect(klasse.map((b) => b.reiter)).toEqual(kursseite.map((h) => h.reiter))
    // Die Kursseite zeigt für Klassenkurse genau die Einträge ihres Kurses (Filter auf `kurs`)
    expect(klasse.filter((b) => b.kurs === 'k1')).toHaveLength(klasse.length)
    expect(klasse.every((b) => b.schluessel.startsWith('kurs:k1:'))).toBe(true)
  })

  it('Grammatik-Hinweis → Reiter „Grammatik" (Kursseite und „Meine Klassen"), Sprung zur Grammatik je Lernende/r', () => {
    const g = kursBedarfDerGruppe(daten, kurse, 'lk', jetzt, profil).find((b) => b.hinweis === 'foerdern')!
    expect(g.text).toBe('Grammatik-Schwäche – Fördern empfohlen: Ada K.')
    expect(g.reiter).toBe('grammatik')
    expect(g.ids).toEqual(['a'])
    expect(klassenReiterFuer(g)).toBe('grammatik')
    expect(fokusZiele({ kurs: 'k1', hinweis: g.hinweis, reiter: g.reiter })[0]).toContain('[data-je-lernende-kopf="grammatik"]')
    // Entwürfe ebenfalls in der Grammatik
    const e = kursBedarf({ id: 'k1' }, kursHinweise({ ...eingabe, status: 'beendet', entwuerfe: 2 }, jetzt))
    expect(e.map((b) => [b.hinweis, b.reiter, klassenReiterFuer(b)])).toEqual([['entwurf', 'grammatik', 'grammatik']])
    expect(fokusZiele({ kurs: 'k1', hinweis: 'entwurf', reiter: 'grammatik' })[0]).toContain('[data-grammatik-entwurf]')
    // Vokabel-Hinweise bleiben bei den Vokabeln
    const v = kursBedarfDerGruppe(daten, kurse, 'lk', jetzt, profil).filter((b) => b.hinweis !== 'foerdern')
    expect(v.map(klassenReiterFuer)).toEqual(['vokabeln', 'vokabeln', 'vokabeln'])
  })

  it('Ausblenden gilt für den Eintrag des Kurses – bleibt verborgen, bis neue Betroffene dazukommen', () => {
    const vorher = kursBedarfDerGruppe(daten, kurse, 'lk', jetzt, profil)
    const inaktiv = vorher.find((b) => b.hinweis === 'inaktiv')!
    const gemerkt = new Map<string, Merkmal>([[inaktiv.schluessel, inaktiv.merkmal]])
    expect(bedarfAufteilen(vorher, gemerkt).ausgeblendet.map((b) => b.schluessel)).toEqual([inaktiv.schluessel])
    // Ada übt auch nicht mehr → neue Betroffene → wieder sichtbar
    const spaeter = kursBedarfDerGruppe(
      { k1: { ...daten.k1, eingabe: { ...eingabe, lernende: eingabe.lernende.map((l) => ({ ...l, tage7: 0 })) } } },
      kurse,
      'lk',
      jetzt,
      profil
    )
    expect(bedarfAufteilen(spaeter, gemerkt).ausgeblendet).toHaveLength(0)
    // Merkmal ohne Namen
    expect(JSON.stringify(vorher.map((b) => b.merkmal))).not.toMatch(/Ada|Ben/)
  })

  it('mehrere Kurse mit Hinweisen: Kursname vorne; beendete Kurse fehlen in den Daten', () => {
    const zwei = kursBedarfDerGruppe(
      { ...daten, k2: { ...daten.k1 } },
      [...kurse, { id: 'k2', titel: '5b – Französisch', kursName: 'Vokabeln Französisch' }],
      'lk',
      jetzt,
      profil
    )
    expect(zwei.some((b) => b.text.startsWith('Vokabeln Französisch: '))).toBe(true)
    expect(kursBedarfDerGruppe({}, kurse, 'lk', jetzt, profil)).toEqual([])
  })
})
