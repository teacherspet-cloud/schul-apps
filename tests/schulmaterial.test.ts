import { beforeEach, describe, expect, it, vi } from 'vitest'
import { anzeigeOrt, ordnerName, schulmaterialOrdner, schulmaterialTeile } from '../src/shared/schulmaterial'

/*
 * Ablage auf dem iPad (30.09.2026): Was die iPad-App ausgibt, landet geordnet unter
 * Dokumente/Schulmaterial/<Fach>/<Themenbereich>/<Datei> – in der Dateien-App „Auf meinem iPad ›
 * Schul-Apps › Schulmaterial". Festgehalten werden die Ordnernamen (die Dateien-App und später
 * Windows müssen damit umgehen können), die Ausweichordner und dass nie überschrieben wird.
 */
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/nie-benutzt', isPackaged: false, getAppPath: () => '/', getVersion: () => '0.0.0-test' },
  dialog: {},
  shell: {},
  safeStorage: {},
  BrowserWindow: class {}
}))

const { vfs } = await import('../src/mobil/vfs/speicher')
const { mobilUmgebung } = await import('../src/mobil/umgebung')

describe('Ordnernamen', () => {
  it('lässt gewöhnliche Namen stehen – mit Umlauten und Leerzeichen', () => {
    expect(ordnerName('Englisch')).toBe('Englisch')
    expect(ordnerName('Ökologie und Umwelt')).toBe('Ökologie und Umwelt')
  })

  it('ersetzt, was in Dateinamen nicht geht, und entfernt Unsichtbares', () => {
    expect(ordnerName('Deutsch/Kunst')).toBe('Deutsch-Kunst')
    expect(ordnerName('Frage: wer? *wo*')).toBe('Frage- wer- -wo-')
    expect(ordnerName('Zeile\u0000eins\ttab')).toBe('Zeile eins tab')
    expect(ordnerName('  viel   Luft  ')).toBe('viel Luft')
  })

  it('verhindert versteckte Ordner und Ausbrüche', () => {
    expect(ordnerName('.versteckt')).toBe('versteckt')
    expect(ordnerName('..')).toBe('')
    expect(ordnerName('Ende...')).toBe('Ende')
    expect(ordnerName(undefined)).toBe('')
  })

  it('kürzt lange Namen', () => {
    const lang = 'Entwicklung der Medien seit dem Zeitalter der Hochkulturen bis in die Gegenwart (Längsschnitt)'
    expect(ordnerName(lang).length).toBeLessThanOrEqual(60)
    expect(lang.startsWith(ordnerName(lang))).toBe(true)
  })
})

describe('Ordner je Material', () => {
  it('Fach und Themenbereich – mit Unterbereichen', () => {
    expect(schulmaterialTeile({ programm: 'vokabeltest', fach: 'Englisch', themenbereich: ['Unit 1'] })).toEqual(['Englisch', 'Unit 1', 'Vokabeltests'])
    expect(schulmaterialTeile({ programm: 'arbeitsblatt', fach: 'Geschichte', themenbereich: ['Der Erste Weltkrieg', 'Ursachen', 'Der Balkan'] })).toEqual([
      'Geschichte',
      'Der Erste Weltkrieg',
      'Ursachen',
      'Der Balkan',
      'Arbeitsblätter'
    ])
  })

  it('ohne Themenbereich direkt im Fachordner', () => {
    expect(schulmaterialTeile({ programm: 'arbeitsblatt', fach: 'Biologie' })).toEqual(['Biologie', 'Arbeitsblätter'])
    // Ein leerer Bereichsname verschwindet statt einen leeren Ordner zu erzeugen
    expect(schulmaterialTeile({ programm: 'arbeitsblatt', fach: 'Biologie', themenbereich: ['..', ''] })).toEqual(['Biologie', 'Arbeitsblätter'])
  })

  it('ohne Fach unter „Allgemein" – je Programm ein Ordner', () => {
    expect(schulmaterialTeile({ programm: 'elternbrief' })).toEqual(['Allgemein', 'Elternbriefe'])
    expect(schulmaterialTeile({ programm: 'rueckmeldung', fach: '  ' })).toEqual(['Allgemein', 'Rückmeldungen'])
    expect(schulmaterialTeile({ programm: 'unbekannt' })).toEqual(['Allgemein'])
  })

  it('Fach / Jahrgang / Thema / Materialart (05.10.2026)', () => {
    expect(schulmaterialTeile({ programm: 'arbeitsblatt', fach: 'Geschichte', jahrgang: 8, thema: 'Julikrise 1914' })).toEqual([
      'Geschichte',
      'Jahrgang 8',
      'Julikrise 1914',
      'Arbeitsblätter'
    ])
    // Ein zugeordneter Themenbereich hat Vorrang vor dem Thema des Materials
    expect(schulmaterialTeile({ programm: 'klassenarbeit', fach: 'Geschichte', jahrgang: 8, thema: 'Julikrise', themenbereich: ['Erster Weltkrieg'] })).toEqual(
      ['Geschichte', 'Jahrgang 8', 'Erster Weltkrieg', 'Klassenarbeiten']
    )
    // Unplausibler Jahrgang entfällt
    expect(schulmaterialTeile({ programm: 'vokabeltest', fach: 'Englisch', jahrgang: 99 })).toEqual(['Englisch', 'Vokabeltests'])
  })

  it('höchstens vier Ebenen Themenbereich', () => {
    expect(schulmaterialTeile({ programm: 'arbeitsblatt', fach: 'Physik', themenbereich: ['a', 'b', 'c', 'd', 'e', 'f'] })).toEqual([
      'Physik',
      'a',
      'b',
      'c',
      'd',
      'Arbeitsblätter'
    ])
  })

  it('Pfad und Anzeige in der Dateien-App', () => {
    const ordner = schulmaterialOrdner('/documents', { programm: 'vokabeltest', fach: 'Englisch', themenbereich: ['Unit 1'] })
    expect(ordner).toBe('/documents/Schulmaterial/Englisch/Unit 1/Vokabeltests')
    expect(anzeigeOrt(`${ordner}/Test.pdf`)).toBe('Auf meinem iPad › Schul-Apps › Schulmaterial › Englisch › Unit 1 › Vokabeltests › Test.pdf')
    expect(anzeigeOrt('/documents/Ausgaben/Test.pdf')).toBeNull()
    expect(anzeigeOrt('C:\\Users\\x\\Test.pdf')).toBeNull()
  })
})

describe('Ausgabe auf dem iPad', () => {
  beforeEach(() => {
    vfs.zuruecksetzen()
    vfs.einhaengen({ wurzel: '/documents' })
    vfs.einhaengen({ wurzel: '/userData' })
    vfs.einhaengen({ wurzel: '/tmp' })
  })

  it('legt mit Ablageziel unter Schulmaterial ab und überschreibt nie', async () => {
    const u = mobilUmgebung()
    const ziel = { programm: 'vokabeltest', fach: 'Englisch', themenbereich: ['Unit 1'] }
    const a = await u.dateiAusgeben('Test.pdf', [], new Uint8Array([1, 2, 3]), ziel)
    expect(a).toBe('/documents/Schulmaterial/Englisch/Unit 1/Vokabeltests/Test.pdf')
    expect([...vfs.lies(a!)]).toEqual([1, 2, 3])
    const b = await u.dateiAusgeben('Test.pdf', [], async () => 'zweite', ziel)
    expect(b).toBe('/documents/Schulmaterial/Englisch/Unit 1/Vokabeltests/Test (2).pdf')
    expect(new TextDecoder().decode(vfs.lies(b!))).toBe('zweite')
    // Die erste ist unverändert
    expect([...vfs.lies(a!)]).toEqual([1, 2, 3])
  })

  it('bereinigt Dateinamen und nutzt die Ausweichordner', async () => {
    const u = mobilUmgebung()
    expect(await u.dateiAusgeben('Brief: Klasse 7/8.docx', [], 'x', { programm: 'elternbrief' })).toBe(
      '/documents/Schulmaterial/Allgemein/Elternbriefe/Brief- Klasse 7-8.docx'
    )
    expect(await u.dateiAusgeben('Blatt.pdf', [], 'x', { programm: 'arbeitsblatt', fach: 'Mathematik' })).toBe(
      '/documents/Schulmaterial/Mathematik/Arbeitsblätter/Blatt.pdf'
    )
  })
})
