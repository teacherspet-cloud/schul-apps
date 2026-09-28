import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it, vi } from 'vitest'

/*
 * Sicherheitsbefund vom 27.09.2026: `audio:read` ist über den Tablet-Zugang freigegeben und
 * setzte den Dateinamen ungeprüft an den Hörtext-Ordner – „..\" öffnete jede Datei des Rechners.
 */
const userData = mkdtempSync(join(tmpdir(), 'schulapps-audio-'))
vi.mock('electron', () => ({ app: { getPath: () => userData } }))

const { pruefeAudioName, readAudio } = await import('../src/main/services/audio/elevenlabs')

afterAll(() => rmSync(userData, { recursive: true, force: true }))

describe('Dateinamen der Hörtexte', () => {
  it('lässt nur schlichte MP3-Namen aus dem Hörtext-Ordner zu', () => {
    expect(pruefeAudioName('hoertext-abc_1.mp3').endsWith(join('hoertexte', 'hoertext-abc_1.mp3'))).toBe(true)
    for (const name of [
      '../settings.json',
      '..\\secrets.json',
      'C:\\Windows\\win.ini',
      '/etc/passwd',
      'a.mp3.txt',
      'a b.mp3',
      '',
      'x'.repeat(90) + '.mp3',
      'ä.mp3'
    ]) {
      expect(() => pruefeAudioName(name), name).toThrow(/Ungültiger Dateiname/)
    }
    expect(() => pruefeAudioName(42 as unknown as string)).toThrow(/Ungültiger Dateiname/)
  })

  it('liest nichts außerhalb des Ordners – auch nicht über den Lesepfad', () => {
    expect(() => readAudio('../settings.json')).toThrow(/Ungültiger Dateiname/)
    expect(readAudio('gibt-es-nicht.mp3')).toBeNull()
  })
})
