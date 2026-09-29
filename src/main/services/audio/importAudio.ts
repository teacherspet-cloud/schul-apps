/**
 * Eigene Hördatei (MP3) als Aufnahme eines Hörtext-Bausteins übernehmen (29.09.2026).
 *
 * Entscheidung der Lehrkraft: Beim Hörverstehen wird die ORIGINAL-Hördatei (etwa von der
 * Verlags-CD) hineingezogen; im Unterricht läuft das Original. Die Datei landet im selben
 * Hörtext-Ordner und unter demselben Namensschema (`<id>.mp3`) wie eine Vertonung – so lädt
 * `audio:read` sie beim Öffnen wieder, und MP3-Speichern, QR-Code und PDF-Anhang funktionieren
 * unverändert.
 */
import { writeFileSync } from 'fs'
import { pruefeAudioName } from './elevenlabs'

/** Obergrenze: Ein Hörtext für die Schule ist höchstens einige Minuten lang */
export const MAX_AUDIO_BYTES = 60 * 1024 * 1024

/** Beginnt der Puffer wie eine MP3 (ID3-Kopf oder MPEG-Rahmen)? */
export function istMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true // „ID3"
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
}

/** Dateiname zur Baustein-Kennung: nur Buchstaben, Ziffern, _ und - (siehe `pruefeAudioName`). */
export const audioDateiName = (id: string): string => `${String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 76) || 'hoertext'}.mp3`

export function importiereAudio(id: string, daten: Uint8Array): { fileName: string; dataUrl: string; bytes: number } {
  if (!(daten instanceof Uint8Array) || !daten.length) throw new Error('Die Hördatei ist leer.')
  if (daten.length > MAX_AUDIO_BYTES) throw new Error('Die Hördatei ist größer als 60 MB.')
  if (!istMp3(daten)) throw new Error('Das ist keine MP3-Datei. Andere Formate (WAV, M4A) bitte vorher in MP3 umwandeln.')
  const fileName = audioDateiName(id)
  const buffer = Buffer.from(daten)
  writeFileSync(pruefeAudioName(fileName), buffer)
  return { fileName, dataUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`, bytes: buffer.length }
}
