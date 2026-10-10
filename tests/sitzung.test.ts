import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Sitzung der Oberfläche (09.10.2026, Entscheidung der Lehrkraft; renderer/shared/sitzung.ts):
 *  - Auf- und zugeklappte Kästen gelten nur für die Sitzung: gleiche Sitzung behält sie, eine neue Sitzung (Exe-Start,
 *    neue Anmeldung) zeigt wieder die Vorgabe. Ansichtswünsche (Karten/Liste, Stunden/Teile …) bleiben dauerhaft.
 *  - Beim ersten Öffnen einer App in der Sitzung über die Leiste steht ihre Übersicht da; danach bleibt der Stand.
 *    Gezielte Sprünge (Dokument öffnen) zählen als erstes Öffnen und werden nicht auf die Übersicht umgelenkt.
 */

const speicher = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k),
  key: (i: number) => [...speicher.keys()][i] ?? null,
  get length() {
    return speicher.size
  }
})

const sitzung = await import('../src/renderer/src/shared/sitzung')
const { createElement } = await import('react')
const { renderToString } = await import('react-dom/server')
const { ladeOffen, speichereOffen } = await import('../src/renderer/src/modules/lernen/regal/grammatikJahrgaenge')
const { kopfGemerkt, merkeKopf, ansichtGemerkt, merkeAnsicht } = await import('../src/renderer/src/modules/unterrichtsreihe/ReiheKopf')
const { weitereOptionenOffen, merkeWeitereOptionen } = await import('../src/renderer/src/shared/components/WeitereOptionen')
const { offenNurInSitzung, VORGABE } = await import('../src/renderer/src/modules/onlinetest/schuelerDarstellung')

beforeEach(() => {
  speicher.clear()
  sitzung.sitzungFuerTests('pc-start-1')
})

describe('Auf/Zu je Sitzung', () => {
  it('verpackt mit der Sitzung und liest nur aus derselben Sitzung', () => {
    const roh = sitzung.verpacke({ a: true }, 's1')
    expect(sitzung.entpacke(roh, 's1')).toEqual({ a: true })
    expect(sitzung.entpacke(roh, 's2')).toBeUndefined()
    // Stand von vor dieser Regel (ohne Sitzung) gilt nicht – dann die Vorgabe
    expect(sitzung.entpacke('{"a":true}', 's1')).toBeUndefined()
    expect(sitzung.entpacke('1', 's1')).toBeUndefined()
    expect(sitzung.entpacke('{kaputt', 's1')).toBeUndefined()
    expect(sitzung.entpacke(null, 's1')).toBeUndefined()
  })

  it('gleiche Sitzung behält offene Kästen, neue Sitzung setzt sie zurück', () => {
    sitzung.offenMerken('test-offen', true)
    expect(sitzung.offenLesen<boolean>('test-offen')).toBe(true)
    // Neuladen in derselben Anmeldung: dieselbe Kennung
    sitzung.sitzungFuerTests('pc-start-1')
    expect(sitzung.offenLesen<boolean>('test-offen')).toBe(true)
    // Neuer Programmstart bzw. neue Anmeldung
    sitzung.sitzungFuerTests('pc-start-2')
    expect(sitzung.offenLesen<boolean>('test-offen')).toBeUndefined()
  })

  it('„Weitere Optionen": offen in der Sitzung, nach einem Neustart wieder eingeklappt', () => {
    expect(weitereOptionenOffen('arbeitsblatt')).toBe(false)
    merkeWeitereOptionen('arbeitsblatt', true)
    expect(weitereOptionenOffen('arbeitsblatt')).toBe(true)
    sitzung.sitzungFuerTests('pc-start-2')
    expect(weitereOptionenOffen('arbeitsblatt')).toBe(false)
  })

  it('Jahrgänge im Schülerordner: neue Anmeldung = wieder nur die Vorgabe', () => {
    sitzung.sitzungFuerTests('server-lernende-a')
    speichereOffen('englisch', { '7': true, '6': true })
    expect(ladeOffen('englisch')).toEqual({ '7': true, '6': true })
    sitzung.sitzungFuerTests('server-lernende-b')
    expect(ladeOffen('englisch')).toEqual({})
  })

  it('Kopf der Reihe (Auf/Zu) gilt je Sitzung, die gewählte Ansicht bleibt dauerhaft', () => {
    merkeKopf('r1', true)
    merkeAnsicht('teile')
    expect(kopfGemerkt('r1')).toBe(true)
    expect(ansichtGemerkt()).toBe('teile')
    sitzung.sitzungFuerTests('pc-start-2')
    expect(kopfGemerkt('r1')).toBeNull()
    expect(ansichtGemerkt()).toBe('teile')
  })

  it('Spielbereiche und Vokabelweg der Lernenden: nur in der Anmeldung, in der sie geklappt wurden', () => {
    const d = { ...VORGABE, spielGruppen: { paare: false, raetseln: true }, vokabelwegOffen: true, offenSitzung: 'a' }
    expect(offenNurInSitzung(d, 'a')).toBe(d)
    const neu = offenNurInSitzung(d, 'b')
    expect(neu.spielGruppen).toBeUndefined()
    expect(neu.vokabelwegOffen).toBeUndefined()
    expect(neu.offenSitzung).toBe('b')
    // Darstellung selbst (Farbe, Modus …) bleibt
    expect(neu.farbe).toBe(d.farbe)
    expect(neu.modus).toBe(d.modus)
  })

  it('Kennung: Server vor Exe vor PIN vor Tab', () => {
    const w = globalThis as unknown as { window?: Record<string, unknown> }
    const vorher = w.window
    try {
      w.window = { __schulappsServer: { angemeldet: true, adresse: '', sitzung: 'abc' }, __schulappsSitzung: 'p1', location: { protocol: 'https:' } }
      sitzung.sitzungFuerTests(null)
      expect(sitzung.sitzungsKennung()).toBe('server-abc')
      w.window = { __schulappsSitzung: 'p1', location: { protocol: 'file:' } }
      sitzung.sitzungFuerTests(null)
      expect(sitzung.sitzungsKennung()).toBe('pc-p1')
      speicher.set('schulapps-netz-token', 'geheim-1')
      w.window = { location: { protocol: 'http:' } }
      sitzung.sitzungFuerTests(null)
      const pin = sitzung.sitzungsKennung()
      expect(pin.startsWith('pin-')).toBe(true)
      expect(pin).not.toContain('geheim')
      speicher.set('schulapps-netz-token', 'geheim-2')
      sitzung.sitzungFuerTests(null)
      expect(sitzung.sitzungsKennung()).not.toBe(pin)
    } finally {
      w.window = vorher
      if (vorher === undefined) delete w.window
    }
  })
})

describe('Erstes Öffnen einer App in der Sitzung', () => {
  it('nur das erste Öffnen über die Leiste meldet „Übersicht"', () => {
    expect(sitzung.erstesOeffnen('arbeitsblatt')).toBe(true)
    expect(sitzung.erstesOeffnen('arbeitsblatt')).toBe(false)
    // Ein gezielter Sprung vorher zählt als geöffnet
    sitzung.alsGeoeffnetMerken('tafelbild')
    expect(sitzung.erstesOeffnen('tafelbild')).toBe(false)
    // Neue Sitzung (neu geladene Seite): wieder von vorn
    sitzung.sitzungFuerTests('pc-start-2')
    expect(sitzung.erstesOeffnen('arbeitsblatt')).toBe(true)
  })

  it('Leiste zeigt beim ersten Mal die Übersicht, danach bleibt der Stand; Dokument-Sprung öffnet sein Ziel', async () => {
    vi.stubGlobal('window', { api: {}, location: { protocol: 'file:' }, addEventListener: () => undefined })
    const nav = await import('../src/renderer/src/shared/navigation')
    const uebersicht: string[] = []
    const ab1 = nav.uebersichtAnmelden('klassenarbeit', () => uebersicht.push('klassenarbeit'))
    const ab2 = nav.uebersichtAnmelden('vokabeltest', () => uebersicht.push('vokabeltest'))
    try {
      nav.oeffneProgramm('klassenarbeit')
      expect(nav.useNavigation.getState().active).toBe('klassenarbeit')
      expect(uebersicht).toEqual(['klassenarbeit'])
      // Wechsel und zurück: kein zweites Mal
      nav.openModule('home')
      nav.oeffneProgramm('klassenarbeit')
      expect(uebersicht).toEqual(['klassenarbeit'])
      // Gezielter Sprung (wie openDocument → openModule) vor dem ersten Öffnen über die Leiste: keine Übersicht danach
      nav.openModule('vokabeltest')
      nav.oeffneProgramm('vokabeltest')
      expect(uebersicht).toEqual(['klassenarbeit'])
    } finally {
      ab1()
      ab2()
      vi.stubGlobal('window', undefined)
    }
  })
})

/*
 * „Meine Klassen" (10.10.2026, Entscheidung der Lehrkraft): innerhalb von `DauerhaftMerken` merken die Auf/Zu-Helfer
 * dauerhaft je Gerät (Vorsilbe „mk:", je Lerngruppe mit `bereich`), außerhalb gilt weiter die Sitzungsregel.
 */
describe('Auf/Zu dauerhaft in „Meine Klassen"', () => {
  type Fund = { speicher: ReturnType<typeof sitzung.useOffenSpeicher>; gemerkt: unknown; aufZu: unknown; vorsilbe: string | null }
  const pruefe = (umschliessen: ((kind: React.ReactNode) => React.ReactNode) | null): Fund => {
    let fund: Fund | null = null
    const Sonde = (): null => {
      const speicher = sitzung.useOffenSpeicher()
      const [gemerkt] = sitzung.useOffenGemerkt('kasten', false)
      const [aufZu] = sitzung.useAufZu('details', false)
      fund = { speicher, gemerkt, aufZu, vorsilbe: sitzung.useDauerhaftVorsilbe() }
      return null
    }
    const kind = createElement(Sonde)
    renderToString(umschliessen ? (umschliessen(kind) as React.ReactElement) : kind)
    return fund!
  }
  const mk = (kind: React.ReactNode): React.ReactNode => createElement(sitzung.DauerhaftMerken, { vorsilbe: 'mk:' }, kind)

  it('innen dauerhaft (überlebt eine neue Sitzung), außen nur für die Sitzung', () => {
    const innen = pruefe(mk)
    expect(innen.vorsilbe).toBe('mk:')
    expect(innen.speicher.dauerhaft).toBe(true)
    innen.speicher.merken('kasten', true)
    innen.speicher.merken('details', true)
    const aussen = pruefe(null)
    expect(aussen.vorsilbe).toBeNull()
    expect(aussen.speicher.dauerhaft).toBe(false)
    // Getrennt: derselbe Baustein außerhalb (Sprachenlernen) sieht den Stand aus „Meine Klassen" nicht
    expect(aussen.gemerkt).toBe(false)
    expect(aussen.aufZu).toBe(false)
    aussen.speicher.merken('kasten', true)
    // Neue Sitzung (Neustart, neue Anmeldung): innen bleibt alles, außen wieder die Vorgabe
    sitzung.sitzungFuerTests('pc-start-2')
    const innen2 = pruefe(mk)
    expect(innen2.gemerkt).toBe(true)
    expect(innen2.aufZu).toBe(true)
    expect(pruefe(null).gemerkt).toBe(false)
  })

  it('je Lerngruppe eigener Stand; nie Umgeschaltetes steht wie vorgegeben', () => {
    const klasse = (id: string) => (kind: React.ReactNode): React.ReactNode => mk(createElement(sitzung.DauerhaftMerken, { bereich: id }, kind))
    const a = pruefe(klasse('gruppe-a'))
    expect(a.vorsilbe).toBe('mk:gruppe-a:')
    a.speicher.merken('details', true)
    expect(pruefe(klasse('gruppe-a')).aufZu).toBe(true)
    expect(pruefe(klasse('gruppe-b')).aufZu).toBe(false)
    expect(pruefe(mk).aufZu).toBe(false)
    // Kaputter Speicherinhalt zählt als nie gemerkt
    localStorage.setItem('schulapps.dauerhaft.mk:gruppe-b:details', '{kaputt')
    expect(pruefe(klasse('gruppe-b')).aufZu).toBe(false)
  })

  it('KlappKarte-Speicher: dauerhaftOffen unter der Vorsilbe, unabhängig von der Sitzung', () => {
    sitzung.dauerhaftMerken('mk:gruppe-a:karte', true)
    sitzung.sitzungFuerTests('pc-start-3')
    expect(sitzung.dauerhaftOffen('mk:gruppe-a:karte')).toBe(true)
    expect(sitzung.dauerhaftOffen('karte')).toBeUndefined()
  })
})
