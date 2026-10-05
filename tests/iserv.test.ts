import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AppSettings, DeepPartial } from '@shared/types'

/*
 * IServ per WebDAV (01.10.2026, recherche/iserv-webdav-2026-10-01.md).
 *
 * Gegen einen nachgebauten IServ-WebDAV-Server (tests/support/fakeWebdav.mjs): Adresse finden
 * (webdav.<domain>, sonst <domain>/webdav), Anmeldung, Ordner lesen, Ordner anlegen, Dateien
 * hochladen ohne Überschreiben, Fehler verständlich (401/405/507/Netz). Dazu: Das Passwort liegt
 * NUR im Passwort-Speicher des Geräts (iPad: eigener Schlüsselbund-Eintrag), nie in den Einstellungen.
 */
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/nie-benutzt', isPackaged: false, getAppPath: () => '/', getVersion: () => '0.0.0-test' },
  dialog: {},
  shell: {},
  safeStorage: {},
  BrowserWindow: class {}
}))

// Einstellungen im Speicher statt auf der Platte
let einstellungen: Partial<AppSettings> = {}
vi.mock('../src/main/services/storage/settings', async (original) => {
  const echt = await original<typeof import('../src/main/services/storage/settings')>()
  return {
    ...echt,
    getSettings: () => einstellungen as AppSettings,
    setSettings: (patch: DeepPartial<AppSettings>) => {
      const p = patch as Partial<AppSettings>
      einstellungen = { ...einstellungen, ...p, ...(p.iserv ? { iserv: { ...einstellungen.iserv, ...p.iserv } as AppSettings['iserv'] } : {}) }
      return einstellungen as AppSettings
    }
  }
})

const { fakeWebdav } = await import('./support/fakeWebdav.mjs')
const iserv = await import('../src/shared/iserv')
const dav = await import('../src/main/services/iserv/webdav')
const dienst = await import('../src/main/services/iserv/iserv')

type Fake = ReturnType<typeof fakeWebdav>

function speicher(): { wert: string | null; passwort: import('../src/main/services/iserv/iserv').IservGeraet['passwort'] } {
  const s = {
    wert: null as string | null,
    passwort: {
      lies: async () => s.wert,
      setze: async (w: string) => void (s.wert = w),
      loesche: async () => void (s.wert = null)
    }
  }
  return s
}

const ZUGANG = (fake: Fake): import('../src/main/services/iserv/webdav').IservZugang => ({
  abruf: fake.abruf,
  basis: 'https://webdav.meineschule.de/',
  benutzer: fake.benutzer,
  passwort: fake.passwort
})

describe('Adresse der Schule', () => {
  it('nimmt Domain, https-Adresse und webdav-Adresse; lehnt http und Unsinn ab', () => {
    expect(iserv.iservDomain('meineschule.de')).toBe('meineschule.de')
    expect(iserv.iservDomain(' https://MeineSchule.de/iserv/login ')).toBe('meineschule.de')
    expect(iserv.iservDomain('webdav.meineschule.de')).toBe('meineschule.de')
    expect(iserv.iservDomain('http://meineschule.de')).toBe('')
    expect(iserv.iservDomain('meine schule')).toBe('')
    expect(iserv.iservAdressFehler('http://meineschule.de')).toMatch(/verschlüsselt/)
    expect(iserv.iservAdressFehler('')).toMatch(/fehlt/)
    expect(iserv.iservAdressFehler('meineschule.de')).toBeNull()
  })

  it('probiert erst webdav.<domain>, dann <domain>/webdav – nur https', () => {
    expect(iserv.iservKandidaten('meineschule.de')).toEqual(['https://webdav.meineschule.de/', 'https://meineschule.de/webdav/'])
  })
})

describe('Pfade und Namen', () => {
  it('Standardziel + Fach + Themenbereich, wie die Ablage auf dem iPad', () => {
    expect(iserv.iservOrdnerFuer(undefined, { programm: 'vokabeltest', fach: 'Englisch', themenbereich: ['Unit 1', 'Food'] })).toEqual([
      'Home',
      'Schulmaterial',
      'Englisch',
      'Unit 1',
      'Food',
      'Vokabeltests'
    ])
    expect(iserv.iservOrdnerFuer('Groups/Kollegium/Material', { programm: 'elternbrief' })).toEqual([
      'Groups',
      'Kollegium',
      'Material',
      'Allgemein',
      'Elternbriefe'
    ])
    // Kein Ausbruch aus dem Ziel
    expect(iserv.iservOrdnerFuer('Home/../Groups', { programm: 'x', fach: '../Geheim' })).toEqual(['Home', 'Groups', '-Geheim'])
  })

  it('kodiert jeden Teil einzeln (Umlaute, Leerzeichen, #)', () => {
    expect(iserv.davUrl('https://webdav.meineschule.de/', ['Home', 'Schulmaterial', 'Französisch', 'Unit #1'], true)).toBe(
      'https://webdav.meineschule.de/Home/Schulmaterial/Franz%C3%B6sisch/Unit%20%231/'
    )
  })

  it('zeigt den Ort wie im Web-Interface', () => {
    expect(iserv.iservAnzeige('iserv:Home/Schulmaterial/Englisch/Test.pdf')).toBe('IServ › Eigene Dateien › Schulmaterial › Englisch › Test.pdf')
    expect(iserv.iservAnzeige(['Groups', 'Kollegium'])).toBe('IServ › Gruppen › Kollegium')
    expect(iserv.inGruppenordner(['Groups', 'Kollegium'])).toBe(true)
    expect(iserv.inGruppenordner(['Home'])).toBe(false)
    expect(iserv.inGruppenordner(['Gruppen', '7a'])).toBe(true)
  })

  it('gleicht die oberste Ebene an die Namen des Servers an (Home ↔ Eigene, Groups ↔ Gruppen; 03.10.2026)', () => {
    const ziel = ['Home', 'Schulmaterial', 'Englisch']
    expect(iserv.wurzelAngleichen(ziel, ['Eigene', 'Gruppen'])).toEqual(['Eigene', 'Schulmaterial', 'Englisch'])
    expect(iserv.wurzelAngleichen(ziel, ['Files', 'Groups'])).toEqual(['Files', 'Schulmaterial', 'Englisch'])
    expect(iserv.wurzelAngleichen(ziel, ['Groups', 'Home'])).toEqual(ziel)
    expect(iserv.wurzelAngleichen(ziel, ['Meins', 'Gruppen'])).toEqual(['Meins', 'Schulmaterial', 'Englisch'])
    expect(iserv.wurzelAngleichen(['Groups', '7a'], ['Eigene', 'Gruppen'])).toEqual(['Gruppen', '7a'])
    expect(iserv.wurzelAngleichen(['home', 'x'], ['Home', 'Groups'])).toEqual(['Home', 'x'])
    expect(iserv.iservAnzeige(['Eigene', 'Schulmaterial'])).toBe('IServ › Eigene Dateien › Schulmaterial')
  })

  it('liest Multi-Status mit beliebigen Namensraum-Kürzeln, kodierten Namen und ohne den Ordner selbst', () => {
    const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/Home/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
      <d:response><d:href>https://webdav.meineschule.de/Home/Unterricht%20%26%20Co/</d:href><d:propstat><d:prop><d:resourcetype><d:collection /></d:resourcetype></d:prop></d:propstat></d:response>
      <d:response><d:href>/Home/Arbeitsbl%C3%A4tter.pdf</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>1234</d:getcontentlength></d:prop></d:propstat></d:response>
      <d:response><d:href>/Home/.versteckt</d:href><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response>
    </d:multistatus>`
    const e = iserv.leseMultistatus(xml, 'https://webdav.meineschule.de/', ['Home'])
    expect(e).toEqual([
      { name: 'Unterricht & Co', ordner: true, teile: ['Home', 'Unterricht & Co'] },
      { name: 'Arbeitsblätter.pdf', ordner: false, teile: ['Home', 'Arbeitsblätter.pdf'], groesse: 1234 }
    ])
    // Ohne Kürzel und mit /webdav davor
    const ohne =
      '<multistatus xmlns="DAV:"><response><href>/webdav/Groups/</href></response><response><href>/webdav/Groups/7a/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response></multistatus>'
    expect(iserv.leseMultistatus(ohne, 'https://meineschule.de/webdav/', ['Groups']).map((x) => x.name)).toEqual(['7a'])
  })
})

describe('WebDAV gegen den nachgebauten IServ', () => {
  let fake: Fake
  beforeEach(() => {
    fake = fakeWebdav()
  })

  it('findet webdav.<domain> und liefert Eigene Dateien und Gruppen', async () => {
    const r = await dav.verbindungFinden(fake.abruf, 'meineschule.de', fake.benutzer, fake.passwort)
    expect(r.basis).toBe('https://webdav.meineschule.de/')
    expect(r.wurzel.map((e) => e.name)).toEqual(['Groups', 'Home'])
    // Basic-Anmeldung mit UTF-8 (Umlaut im Passwort)
    expect(fake.protokoll.every((p: { auth: boolean }) => p.auth)).toBe(true)
  })

  it('nimmt <domain>/webdav, wenn es nur diese Form gibt', async () => {
    fake = fakeWebdav({ rechner: ['meineschule.de/webdav'] })
    const r = await dav.verbindungFinden(fake.abruf, 'meineschule.de', fake.benutzer, fake.passwort)
    expect(r.basis).toBe('https://meineschule.de/webdav/')
    expect(r.wurzel.map((e) => e.name)).toEqual(['Groups', 'Home'])
  })

  it('401 → „Anmeldung fehlgeschlagen", ohne die zweite Form zu probieren', async () => {
    await expect(dav.verbindungFinden(fake.abruf, 'meineschule.de', fake.benutzer, 'falsch')).rejects.toMatchObject({ art: 'anmeldung' })
    expect(fake.protokoll.length).toBe(1)
  })

  it('ohne WebDAV-Modul → „nicht freigeschaltet"; ohne Netz → „keine Verbindung"', async () => {
    fake = fakeWebdav({ rechner: [] })
    const e = await dav.verbindungFinden(fake.abruf, 'meineschule.de', fake.benutzer, fake.passwort).catch((x: unknown) => x)
    expect(e).toMatchObject({ art: 'nicht-freigeschaltet' })
    expect((e as Error).message).toMatch(/nicht freigeschaltet/)
    const netz = await dav.verbindungFinden(fake.abruf, 'netzfehler.de', fake.benutzer, fake.passwort).catch((x: unknown) => x)
    expect(netz).toMatchObject({ art: 'nicht-freigeschaltet' })
    const nurNetz = await dav.verbindungFinden(async () => Promise.reject(new Error('offline')), 'meineschule.de', 'a', 'b').catch((x: unknown) => x)
    expect(nurNetz).toMatchObject({ art: 'netz' })
    expect((nurNetz as Error).message).toMatch(/keine Verbindung/)
  })

  it('405 auf PROPFIND → „nicht freigeschaltet"', async () => {
    fake.fehler.push({ methode: 'PROPFIND', status: 405 })
    await expect(dav.liste(ZUGANG(fake), ['Home'])).rejects.toMatchObject({ art: 'nicht-freigeschaltet' })
  })

  it('legt Fach und Themenbereich an und lädt die Datei unverändert hoch', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x80, 0x0a])
    const teile = await dav.hochladen(ZUGANG(fake), ['Home', 'Schulmaterial', 'Englisch', 'Unit 1'], 'Test.pdf', pdf)
    expect(teile).toEqual(['Home', 'Schulmaterial', 'Englisch', 'Unit 1', 'Test.pdf'])
    const datei = fake.baum.get('/Home/Schulmaterial/Englisch/Unit 1/Test.pdf')!
    expect([...datei.daten!]).toEqual([...pdf])
    expect(datei.typ).toBe('application/pdf')
    // MKCOL nur unterhalb von Home, von oben nach unten
    const mkcol = fake.protokoll.filter((p: { methode: string }) => p.methode === 'MKCOL').map((p: { pfad: string }) => p.pfad)
    expect(mkcol).toEqual(['/Home/Schulmaterial', '/Home/Schulmaterial/Englisch', '/Home/Schulmaterial/Englisch/Unit 1'])
  })

  it('gleicher Name (05.10.2026): ohne Entscheidung Rückfrage, „neu" → „(2)", „ersetzen" überschreibt – auch bei anderer Schreibweise', async () => {
    const z = ZUGANG(fake)
    await dav.hochladen(z, ['Home', 'Unterricht'], 'Blatt.pdf', new Uint8Array([1]))
    await expect(dav.hochladen(z, ['Home', 'Unterricht'], 'Blatt.pdf', new Uint8Array([2]))).rejects.toThrow(/^VORHANDEN:Blatt\.pdf$/)
    await expect(dav.hochladen(z, ['Home', 'Unterricht'], 'blatt.pdf', new Uint8Array([2]))).rejects.toThrow(/^VORHANDEN:/)
    expect([...fake.baum.get('/Home/Unterricht/Blatt.pdf')!.daten!]).toEqual([1])
    const zwei = await dav.hochladen(z, ['Home', 'Unterricht'], 'Blatt.pdf', new Uint8Array([2]), 'neu')
    const drei = await dav.hochladen(z, ['Home', 'Unterricht'], 'blatt.pdf', new Uint8Array([3]), 'neu')
    expect(zwei.at(-1)).toBe('Blatt (2).pdf')
    expect(drei.at(-1)).toBe('blatt (3).pdf')
    expect([...fake.baum.get('/Home/Unterricht/Blatt.pdf')!.daten!]).toEqual([1])
    // Ersetzen schreibt in die vorhandene Datei (deren Schreibweise), legt nichts Neues an
    const ersetzt = await dav.hochladen(z, ['Home', 'Unterricht'], 'blatt.pdf', new Uint8Array([9]), 'ersetzen')
    expect(ersetzt.at(-1)).toBe('Blatt.pdf')
    expect([...fake.baum.get('/Home/Unterricht/Blatt.pdf')!.daten!]).toEqual([9])
  })

  it('Gruppenordner: die Gruppe selbst wird nie angelegt', async () => {
    await dav.hochladen(ZUGANG(fake), ['Groups', 'Kollegium', 'Material'], 'a.txt', new TextEncoder().encode('x'))
    const mkcol = fake.protokoll.filter((p: { methode: string }) => p.methode === 'MKCOL').map((p: { pfad: string }) => p.pfad)
    expect(mkcol).toEqual(['/Groups/Kollegium/Material'])
  })

  it('507 → „Speicherplatz voll", 403 → „darf nicht schreiben"', async () => {
    fake.fehler.push({ methode: 'PUT', status: 507, einmal: true })
    await expect(dav.hochladen(ZUGANG(fake), ['Home'], 'x.pdf', new Uint8Array([1]))).rejects.toMatchObject({ art: 'voll', message: /voll/ })
    fake.fehler.push({ methode: 'MKCOL', status: 403, einmal: true })
    await expect(dav.hochladen(ZUGANG(fake), ['Home', 'Neu'], 'x.pdf', new Uint8Array([1]))).rejects.toMatchObject({ art: 'verboten' })
  })

  it('schickt nichts über http', async () => {
    const z = { ...ZUGANG(fake), basis: 'http://webdav.meineschule.de/' }
    await expect(dav.liste(z, [])).rejects.toMatchObject({ art: 'netz' })
    expect(fake.protokoll.length).toBe(0)
  })
})

describe('Dienst: verbinden, ablegen, trennen – Passwort nur im Geräte-Speicher', () => {
  beforeEach(() => {
    einstellungen = {}
  })

  it('merkt Adresse, Benutzer und Basis – das Passwort nur im Schlüsselbund', async () => {
    const fake = fakeWebdav()
    const s = speicher()
    const g = { abruf: fake.abruf, passwort: s.passwort }
    const r = await dienst.iservVerbinden(g, { schule: 'meineschule.de', benutzer: ` ${fake.benutzer} `, passwort: fake.passwort })
    expect(r.ordner.map((e) => e.name)).toEqual(['Groups', 'Home'])
    expect(s.wert).toBe(fake.passwort)
    expect(einstellungen.iserv).toEqual({
      schule: 'meineschule.de',
      benutzer: fake.benutzer,
      basis: 'https://webdav.meineschule.de/',
      ziel: 'Home/Schulmaterial'
    })
    expect(JSON.stringify(einstellungen)).not.toContain(fake.passwort)
    expect(await dienst.iservStatus(g)).toMatchObject({ verbunden: true, passwortGespeichert: true })
  })

  it('ein falsches Passwort überschreibt das gespeicherte nicht', async () => {
    const fake = fakeWebdav()
    const s = speicher()
    const g = { abruf: fake.abruf, passwort: s.passwort }
    await dienst.iservVerbinden(g, { schule: 'meineschule.de', benutzer: fake.benutzer, passwort: fake.passwort })
    await expect(dienst.iservVerbinden(g, { schule: 'meineschule.de', benutzer: fake.benutzer, passwort: 'falsch' })).rejects.toMatchObject({
      art: 'anmeldung'
    })
    expect(s.wert).toBe(fake.passwort)
    // Ohne Passwort gilt das gespeicherte
    await expect(dienst.iservVerbinden(g, { schule: 'meineschule.de', benutzer: fake.benutzer })).resolves.toBeTruthy()
  })

  it('legt nach Fach und Themenbereich ab, Ordnerliste nur mit Ordnern, Trennen löscht das Passwort', async () => {
    const fake = fakeWebdav()
    const s = speicher()
    const g = { abruf: fake.abruf, passwort: s.passwort }
    await expect(dienst.iservAblegen(g, 'a.pdf', 'x', { programm: 'vokabeltest' })).rejects.toThrow(/noch nicht verbunden/)
    await dienst.iservVerbinden(g, { schule: 'meineschule.de', benutzer: fake.benutzer, passwort: fake.passwort })
    const pfad = await dienst.iservAblegen(g, 'Vokabeltest Unit 1.pdf', new Uint8Array([1, 2, 3]), {
      programm: 'vokabeltest',
      fach: 'Englisch',
      themenbereich: ['Unit 1']
    })
    expect(pfad).toBe('iserv:Home/Schulmaterial/Englisch/Unit 1/Vokabeltests/Vokabeltest Unit 1.pdf')
    expect(fake.baum.has('/Home/Schulmaterial/Englisch/Unit 1/Vokabeltests/Vokabeltest Unit 1.pdf')).toBe(true)
    expect((await dienst.iservOrdner(g, 'Home')).map((e) => e.name)).toEqual(['Schulmaterial', 'Unterricht'])
    await dienst.iservTrennen(g)
    expect(s.wert).toBeNull()
    expect(einstellungen.iserv?.basis).toBe('')
    expect(einstellungen.iserv?.schule).toBe('meineschule.de')
  })
})

describe('Dateien von IServ öffnen (02.10.2026)', () => {
  let fake: Fake
  beforeEach(() => {
    fake = fakeWebdav()
  })

  it('lädt eine Datei unverändert (Bytes, nicht Text)', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x80, 0x0a])
    await dav.hochladen(ZUGANG(fake), ['Home', 'Unterricht'], 'Blatt.pdf', pdf)
    expect([...(await dav.herunterladen(ZUGANG(fake), ['Home', 'Unterricht', 'Blatt.pdf']))]).toEqual([...pdf])
  })

  it('fehlende Datei und falsches Passwort → verständliche Fehler', async () => {
    await expect(dav.herunterladen(ZUGANG(fake), ['Home', 'gibtsnicht.pdf'])).rejects.toMatchObject({ art: 'nicht-freigeschaltet' })
    await expect(dav.herunterladen({ ...ZUGANG(fake), passwort: 'falsch' }, ['Home', 'x.pdf'])).rejects.toMatchObject({ art: 'anmeldung' })
    await expect(dav.herunterladen(ZUGANG(fake), [])).rejects.toBeInstanceOf(dav.IservFehler)
  })

  it('Dienst: Einträge mit Dateien, Laden liefert Name und Daten', async () => {
    const s = speicher()
    const g = { abruf: fake.abruf, passwort: s.passwort }
    einstellungen = {}
    await dienst.iservVerbinden(g, { schule: 'meineschule.de', benutzer: fake.benutzer, passwort: fake.passwort })
    await dav.hochladen(ZUGANG(fake), ['Home', 'Unterricht'], 'Vokabeln.csv', new TextEncoder().encode('house;Haus'))
    const eintraege = await dienst.iservEintraege(g, 'Home/Unterricht')
    expect(eintraege.map((e) => [e.name, e.ordner])).toEqual([['Vokabeln.csv', false]])
    // Die Ordnerauswahl zeigt weiter nur Ordner
    expect(await dienst.iservOrdner(g, 'Home/Unterricht')).toEqual([])
    const datei = await dienst.iservLaden(g, 'Home/Unterricht/Vokabeln.csv')
    expect(datei.name).toBe('Vokabeln.csv')
    expect(new TextDecoder().decode(datei.data)).toBe('house;Haus')
  })

  it('ohne Verbindung: klare Meldung statt Netzanfrage', async () => {
    einstellungen = {}
    const g = { abruf: fake.abruf, passwort: speicher().passwort }
    await expect(dienst.iservLaden(g, 'Home/x.pdf')).rejects.toThrow(/noch nicht verbunden/)
    expect(fake.protokoll).toHaveLength(0)
  })
})

describe('Kanäle: files:save und export:pdf mit Ziel „IServ"', () => {
  it('leitet zu IServ statt aufs Gerät', async () => {
    einstellungen = {}
    const fake = fakeWebdav()
    const s = speicher()
    const { registriereKanaele } = await import('../src/main/kanaele')
    const { mobilUmgebung } = await import('../src/mobil/umgebung')
    const geraet = vi.fn(async () => '/documents/x')
    const u = { ...mobilUmgebung(), dateiAusgeben: geraet, iserv: { abruf: fake.abruf, passwort: s.passwort } }
    const kanaele = new Map<string, (...a: unknown[]) => unknown>()
    registriereKanaele((k, fn) => void kanaele.set(k, fn as (...a: unknown[]) => unknown), u)
    await kanaele.get('iserv:verbinden')!({ schule: 'meineschule.de', benutzer: fake.benutzer, passwort: fake.passwort })
    const pfad = await kanaele.get('files:save')!('Blatt.docx', [], new Uint8Array([7]), { programm: 'arbeitsblatt', fach: 'Biologie', ort: 'iserv' })
    expect(pfad).toBe('iserv:Home/Schulmaterial/Biologie/Arbeitsblätter/Blatt.docx')
    expect(geraet).not.toHaveBeenCalled()
    // Ohne Ort wie bisher aufs Gerät
    await kanaele.get('files:save')!('Blatt.docx', [], new Uint8Array([7]), { programm: 'arbeitsblatt', fach: 'Biologie' })
    expect(geraet).toHaveBeenCalledTimes(1)
  })
})

describe('iPad: eigener Schlüsselbund-Eintrag', () => {
  it('schreibt das Passwort unter „iserv", nicht in den Eintrag der API-Schlüssel', async () => {
    const ablage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ablage.get(k) ?? null,
      setItem: (k: string, v: string) => void ablage.set(k, v),
      removeItem: (k: string) => void ablage.delete(k)
    })
    try {
      const { mobilUmgebung, ISERV_KONTO } = await import('../src/mobil/umgebung')
      expect(ISERV_KONTO).toBe('iserv')
      const u = mobilUmgebung()
      ablage.set('schulapps.secrets', '{"openai":"verschluesselt"}')
      await u.iserv.passwort.setze('geheim')
      expect(ablage.get('schulapps.secrets.iserv')).toBe('geheim')
      expect(ablage.get('schulapps.secrets')).toBe('{"openai":"verschluesselt"}')
      expect(await u.iserv.passwort.lies()).toBe('geheim')
      await u.iserv.passwort.loesche()
      expect(ablage.has('schulapps.secrets.iserv')).toBe(false)
      expect(ablage.has('schulapps.secrets')).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
