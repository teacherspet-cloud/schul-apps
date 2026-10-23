import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Verschlüsselung ruhender Daten (23.10.2026, Nachprüfung des Schulträgers): Rückmeldungen,
 * Elternbriefe und Nachteilsausgleiche liegen am PC und auf dem iPad nur verschlüsselt; alte
 * Klartext-Dateien werden an Ort und Stelle umgestellt; Sicherungen gibt es nur verschlüsselt.
 */
const wurzel = mkdtempSync(join(tmpdir(), 'schulapps-ruhend-'))
vi.mock('electron', () => ({ app: { getPath: () => wurzel } }))

const ruhend = await import('../src/main/services/storage/ruhend')
const { erzeugeAblage } = await import('../src/main/services/storage/dokumente')
const wartung = await import('../src/main/services/storage/wartung')
const format = await import('../src/shared/ruhendFormat')
const ios = await import('../src/mobil/vfs/ruhendIos')
const { ohnePersonenbezug } = await import('../src/renderer/src/shared/auftraege')
const { personenbezogenesAbmelden } = await import('../src/shared/lokaleDaten')

/** Attrappe für DPAPI: „verschlüsselt" erkennbar anders, aber umkehrbar */
const attrappe = (verfuegbar = true): import('../src/main/services/storage/ruhend').SchluesselSchutz => ({
  verfuegbar: () => verfuegbar,
  verschluesseln: (t) => new TextEncoder().encode(`DPAPI:${Buffer.from(t).toString('hex')}`),
  entschluesseln: (b) => {
    const t = new TextDecoder().decode(b)
    if (!t.startsWith('DPAPI:')) throw new Error('falsches Konto')
    return Buffer.from(t.slice(6), 'hex').toString()
  }
})

const NAME = 'Malte Mustermann-Özdemir'
const TEXT = 'Malte schreibt sehr anschaulich über seine Ferien in Cuxhaven.'

function alleBytes(dir: string): Buffer[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? alleBytes(join(dir, e.name)) : [readFileSync(join(dir, e.name))]))
}

beforeEach(() => {
  ruhend.ruhendZuruecksetzen()
  rmSync(wurzel, { recursive: true, force: true })
  mkdirSync(wurzel, { recursive: true })
})
afterAll(() => rmSync(wurzel, { recursive: true, force: true }))

describe('Verschlüsselung am PC (storage/ruhend.ts)', () => {
  it('Rundreise: verschlüsseln und entschlüsseln, mit Kopf und ohne Klartext', () => {
    expect(ruhend.ruhendEinschalten(wurzel, attrappe()).zustand).toBe('an')
    const klar = new TextEncoder().encode(TEXT)
    const geheim = ruhend.verschluesseln(klar)
    expect(format.hatRuhendKopf(geheim)).toBe(true)
    expect(Buffer.from(geheim).includes(Buffer.from('Cuxhaven'))).toBe(false)
    expect(ruhend.entschluesseln(geheim).toString('utf8')).toBe(TEXT)
    // Zweimal dasselbe ergibt verschiedene Chiffrate (zufälliger IV)
    expect(Buffer.from(ruhend.verschluesseln(klar)).equals(Buffer.from(geheim))).toBe(false)
    // Manipulation fällt auf (GCM-Prüfwert)
    const kaputt = new Uint8Array(geheim)
    kaputt[kaputt.length - 1] ^= 1
    expect(() => ruhend.entschluesseln(kaputt)).toThrow(/nicht entschlüsseln/)
  })

  it('der Datenschlüssel liegt nur geschützt auf der Platte und bleibt über Neustarts gleich', () => {
    ruhend.ruhendEinschalten(wurzel, attrappe())
    const geheim = ruhend.verschluesseln(new TextEncoder().encode(TEXT))
    expect(readFileSync(join(wurzel, ruhend.SCHLUESSEL_DATEI), 'utf8').startsWith('DPAPI:')).toBe(true)
    ruhend.ruhendZuruecksetzen()
    ruhend.ruhendEinschalten(wurzel, attrappe())
    expect(ruhend.entschluesseln(geheim).toString('utf8')).toBe(TEXT)
  })

  it('kein Klartext: eine Rückmeldung mit Namen steht nicht lesbar auf der Platte – lesen klappt trotzdem', () => {
    ruhend.ruhendEinschalten(wurzel, attrappe())
    const ablage = erzeugeAblage('rueckmeldungen', 'Rückmeldung', () => wurzel)
    ablage.save({ id: 'abcd1234', name: `Rückmeldung ${NAME}`, stats: { schueler: NAME }, payload: { name: NAME, text: TEXT, note: 2 } })
    const bytes = alleBytes(join(wurzel, 'rueckmeldungen'))
    expect(bytes.length).toBe(2)
    for (const b of bytes) {
      expect(format.hatRuhendKopf(b)).toBe(true)
      expect(b.includes(Buffer.from('Malte'))).toBe(false)
      expect(b.includes(Buffer.from('Mustermann'))).toBe(false)
      expect(b.includes(Buffer.from('Cuxhaven'))).toBe(false)
    }
    expect(ablage.list()[0].name).toBe(`Rückmeldung ${NAME}`)
    expect((ablage.get('abcd1234').payload as { text: string }).text).toBe(TEXT)
    ablage.delete('abcd1234')
    expect(ablage.list()).toEqual([])
  })

  it('Nachteilsausgleiche und Elternbriefe ebenso; Unterrichtsmaterial bleibt Klartext', () => {
    ruhend.ruhendEinschalten(wurzel, attrappe())
    erzeugeAblage('nachteilsausgleiche', 'Nachteilsausgleich', () => wurzel).save({ id: 'personen', name: 'Gemerkte', stats: {}, payload: { eintraege: { m: { name: NAME } } } })
    erzeugeAblage('elternbriefe', 'Elternbrief', () => wurzel).save({ id: 'brief0001', name: `Brief an Familie ${NAME}`, stats: {}, payload: { kind: NAME } })
    erzeugeAblage('tafelbilder', 'Tafelbild', () => wurzel).save({ id: 'tafel0001', name: 'Photosynthese', stats: {}, payload: {} })
    for (const o of ['nachteilsausgleiche', 'elternbriefe']) for (const b of alleBytes(join(wurzel, o))) expect(b.includes(Buffer.from('Malte'))).toBe(false)
    expect(readFileSync(join(wurzel, 'tafelbilder', 'tafel0001.json'), 'utf8')).toContain('Photosynthese')
  })

  it('Umstellung: alte Klartext-Dateien werden an Ort und Stelle verschlüsselt, ohne .bak', () => {
    mkdirSync(join(wurzel, 'rueckmeldungen'), { recursive: true })
    const alt = JSON.stringify({ id: 'alt00001', name: NAME, createdAt: 'x', updatedAt: 'y', payload: { text: TEXT } })
    writeFileSync(join(wurzel, 'rueckmeldungen', 'alt00001.json'), alt)
    writeFileSync(join(wurzel, 'rueckmeldungen', 'index.json'), JSON.stringify([{ id: 'alt00001', name: NAME, createdAt: 'x', updatedAt: 'y' }]))
    const r = ruhend.ruhendEinschalten(wurzel, attrappe())
    expect(r).toEqual({ zustand: 'an', umgestellt: 2 })
    expect(readdirSync(join(wurzel, 'rueckmeldungen')).sort()).toEqual(['alt00001.json', 'index.json'])
    for (const b of alleBytes(join(wurzel, 'rueckmeldungen'))) expect(b.includes(Buffer.from('Malte'))).toBe(false)
    const ablage = erzeugeAblage('rueckmeldungen', 'Rückmeldung', () => wurzel)
    expect(ablage.list()[0].name).toBe(NAME)
    expect(JSON.stringify(ablage.get('alt00001'))).toBe(alt)
    // Ein zweiter Start stellt nichts mehr um
    ruhend.ruhendZuruecksetzen()
    expect(ruhend.ruhendEinschalten(wurzel, attrappe()).umgestellt).toBe(0)
  })

  it('gesperrt: kein Klartext-Ausweichen, und ein unlesbarer Schlüssel wird nie überschrieben', () => {
    expect(ruhend.ruhendEinschalten(wurzel, attrappe(false)).zustand).toBe('gesperrt')
    const ablage = erzeugeAblage('rueckmeldungen', 'Rückmeldung', () => wurzel)
    expect(() => ablage.save({ id: 'abcd1234', name: NAME, stats: {}, payload: {} })).toThrow(/nicht verfügbar/)
    expect(alleBytes(join(wurzel, 'rueckmeldungen')).some((b) => b.includes(Buffer.from('Malte')))).toBe(false)

    ruhend.ruhendZuruecksetzen()
    writeFileSync(join(wurzel, ruhend.SCHLUESSEL_DATEI), 'FREMDES-KONTO')
    expect(ruhend.ruhendEinschalten(wurzel, attrappe()).zustand).toBe('gesperrt')
    expect(readFileSync(join(wurzel, ruhend.SCHLUESSEL_DATEI), 'utf8')).toBe('FREMDES-KONTO')
    expect(() => wartung.sicherung()).toThrow(/nur verschlüsselt/)
  })

  it('Sicherung: nur verschlüsselt, Wiederherstellen auf demselben Konto; Klartext nur ausdrücklich', () => {
    ruhend.ruhendEinschalten(wurzel, attrappe())
    erzeugeAblage('rueckmeldungen', 'Rückmeldung', () => wurzel).save({ id: 'abcd1234', name: NAME, stats: {}, payload: { text: TEXT } })
    const { daten } = wartung.sicherung()
    expect(format.istVerschluesselteSicherung(daten)).toBe(true)
    expect(Buffer.from(daten).includes(Buffer.from('Malte'))).toBe(false)
    expect(wartung.pruefeSicherung(daten).ordner).toContainEqual({ ordner: 'rueckmeldungen', eintraege: 2 })

    // Klartext-Export enthält die Rückmeldung lesbar (nicht doppelt verschlüsselt)
    const klar = wartung.sicherung({ klartext: true })
    expect(klar.name).toMatch(/UNVERSCHLUESSELT/)
    const inhalt = JSON.parse(new TextDecoder().decode(klar.daten)) as { rueckmeldungen: Record<string, string> }
    expect(Buffer.from(inhalt.rueckmeldungen['abcd1234.json'], 'base64').toString('utf8')).toContain('Cuxhaven')

    // Wiederherstellen: Dateien kommen verschlüsselt zurück
    rmSync(join(wurzel, 'rueckmeldungen'), { recursive: true, force: true })
    wartung.wiederherstellen(daten)
    for (const b of alleBytes(join(wurzel, 'rueckmeldungen'))) expect(format.hatRuhendKopf(b)).toBe(true)
    expect((erzeugeAblage('rueckmeldungen', 'Rückmeldung', () => wurzel).get('abcd1234').payload as { text: string }).text).toBe(TEXT)

    // Aus dem Klartext-Export wiederhergestellt: ebenfalls verschlüsselt auf der Platte
    rmSync(join(wurzel, 'rueckmeldungen'), { recursive: true, force: true })
    wartung.wiederherstellen(klar.daten)
    for (const b of alleBytes(join(wurzel, 'rueckmeldungen'))) expect(b.includes(Buffer.from('Malte'))).toBe(false)

    // Anderes Konto (neuer Schlüssel): die verschlüsselte Sicherung lässt sich nicht öffnen
    ruhend.ruhendZuruecksetzen()
    rmSync(join(wurzel, ruhend.SCHLUESSEL_DATEI))
    ruhend.ruhendEinschalten(wurzel, attrappe())
    expect(() => wartung.pruefeSicherung(daten)).toThrow(/anderen Gerät/)
  })
})

describe('Verschlüsselung auf dem iPad (vfs/ruhendIos.ts)', () => {
  const quelle = async (): Promise<CryptoKey> => crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])

  it('Rundreise mit Web Crypto – und dasselbe Format wie am PC', async () => {
    await ios.iosRuhendEinschalten({ holen: quelle })
    expect(ios.iosRuhendZustand().zustand).toBe('an')
    const geheim = await ios.verschluesseln(new TextEncoder().encode(TEXT))
    expect(format.hatRuhendKopf(geheim)).toBe(true)
    expect(new TextDecoder().decode(await ios.entschluesseln(geheim))).toBe(TEXT)
    // Der PC (Node) liest dasselbe Format mit demselben Schlüssel
    expect(ruhend.entschluesseln(geheim, Buffer.alloc(32, 7)).toString('utf8')).toBe(TEXT)
    const vomPc = ruhend.verschluesseln(new TextEncoder().encode(NAME), Buffer.alloc(32, 7))
    expect(new TextDecoder().decode(await ios.entschluesseln(vomPc))).toBe(NAME)
  })

  it('Träger: schreibt Schülerdaten nur verschlüsselt, stellt Klartext beim Laden um, lässt Material in Ruhe', async () => {
    await ios.iosRuhendEinschalten({ holen: quelle })
    const roh = new TextEncoder().encode(JSON.stringify({ name: NAME }))
    const geschrieben = await ios.iosSchutz.vorDemSchreiben('rueckmeldungen/x.json', roh)
    expect(Buffer.from(geschrieben).includes(Buffer.from('Malte'))).toBe(false)
    expect(await ios.iosSchutz.vorDemSchreiben('arbeitsblaetter/x.json', roh)).toBe(roh)
    expect(new TextDecoder().decode(await ios.iosSchutz.nachDemLesen('rueckmeldungen/x.json', geschrieben, async () => undefined))).toContain(NAME)

    const umgestellt: Uint8Array[] = []
    const geladen = await ios.iosSchutz.nachDemLesen('nachteilsausgleiche/personen.json', roh, async (k) => void umgestellt.push(k))
    expect(geladen).toEqual(roh)
    expect(umgestellt).toHaveLength(1)
  })

  it('gesperrt (Schlüsselbund unlesbar): Schreiben scheitert statt Klartext', async () => {
    await ios.iosRuhendEinschalten({ holen: async () => Promise.reject(new Error('Status -25308')) })
    expect(ios.iosRuhendZustand().zustand).toBe('gesperrt')
    await expect(ios.iosSchutz.vorDemSchreiben('elternbriefe/a.json', new Uint8Array([1, 2, 3]))).rejects.toThrow(/Schlüsselbund/)
    await expect(ios.sicherungVerschluesseln(new TextEncoder().encode('{}'))).rejects.toThrow()
  })

  it('Schlüsselbund-Quelle: erzeugt einmal einen Schlüssel und nimmt danach denselben; Lesefehler erzeugt keinen neuen', async () => {
    const bund = new Map<string, string>()
    const plugin = {
      get: async (o: { konto: string }) => ({ value: bund.get(o.konto) ?? null }),
      set: async (o: { konto: string; value: string }) => void bund.set(o.konto, o.value)
    }
    const k1 = await ios.schluesselbundQuelle(plugin).holen()
    expect(bund.has(ios.SCHLUESSEL_KONTO)).toBe(true)
    const wert = bund.get(ios.SCHLUESSEL_KONTO)
    const k2 = await ios.schluesselbundQuelle(plugin).holen()
    expect(bund.get(ios.SCHLUESSEL_KONTO)).toBe(wert)
    const g = await ios.verschluesseln(new TextEncoder().encode(TEXT), k1)
    expect(new TextDecoder().decode(await ios.entschluesseln(g, k2))).toBe(TEXT)

    const kaputt = { get: async () => Promise.reject(new Error('gesperrt')), set: vi.fn(async () => undefined) }
    await expect(ios.schluesselbundQuelle(kaputt).holen()).rejects.toThrow()
    expect(kaputt.set).not.toHaveBeenCalled()
  })

  it('Sicherung des iPads: verschlüsselt, nur hier wieder zu öffnen', async () => {
    await ios.iosRuhendEinschalten({ holen: quelle })
    const klar = new TextEncoder().encode(JSON.stringify({ version: 2, rueckmeldungen: { 'a.json': Buffer.from(NAME).toString('base64') } }))
    const daten = await ios.sicherungVerschluesseln(klar)
    expect(format.istVerschluesselteSicherung(daten)).toBe(true)
    expect(Buffer.from(daten).includes(Buffer.from(Buffer.from(NAME).toString('base64')))).toBe(false)
    expect(await ios.sicherungOeffnen(daten)).toEqual(klar)
    await ios.iosRuhendEinschalten({ holen: async () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) })
    await expect(ios.sicherungOeffnen(daten)).rejects.toThrow(/anderen Gerät/)
  })
})

describe('Unterbrochene KI-Aufträge (iPad, localStorage)', () => {
  it('Rückmeldung und Elternbrief werden ohne Eingaben und ohne Titel gemerkt', () => {
    const a = {
      id: '1',
      moduleId: 'elternbrief',
      docId: 'd',
      titel: `Brief an Familie ${NAME}`,
      art: 'schreiben',
      start: 0,
      versuche: 0,
      fortsetzen: { art: 'elternbrief.schreiben', args: [{ kind: NAME }, 'd'] }
    }
    const b = ohnePersonenbezug(a)
    expect(JSON.stringify(b)).not.toContain('Malte')
    expect(b.fortsetzen).toBeUndefined()
    expect(b.titel).toBe('Elternbrief')
    const w = { ...a, moduleId: 'arbeitsblatt', titel: 'Photosynthese', fortsetzen: { art: 'arbeitsblatt.planeNeu', args: [{}] } }
    expect(ohnePersonenbezug(w)).toEqual(w)
  })

  it('beim Abmelden gelöscht', () => {
    const weg: string[] = []
    personenbezogenesAbmelden({ removeItem: (k: string) => void weg.push(k) })
    expect(weg).toContain('schul-apps-auftraege-unterbrochen')
  })
})
