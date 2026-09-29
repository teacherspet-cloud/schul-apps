/**
 * Bogen zum Anhören (29.09.2026, Wunsch der Lehrkraft; auch als Nachteilsausgleich bei Lese-
 * oder Sehbeeinträchtigung): sofort im Programm über die Sprachausgabe von Windows (ohne
 * Internet, ohne Kosten) oder als MP3-Datei über die Stimmen des Hörtext-Dienstes (ElevenLabs),
 * wenn dort ein Zugang eingerichtet ist.
 */
import type { AppSettings } from '@shared/types'

export const vorlesenMoeglich = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window

export function vorlesen(text: string, onEnde?: () => void): void {
  if (!vorlesenMoeglich()) throw new Error('Die Sprachausgabe steht auf diesem Gerät nicht zur Verfügung.')
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'de-DE'
  u.rate = 0.95
  const deutsch = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('de'))
  if (deutsch) u.voice = deutsch
  if (onEnde) {
    u.onend = onEnde
    u.onerror = onEnde
  }
  window.speechSynthesis.speak(u)
}

export function vorlesenStopp(): void {
  if (vorlesenMoeglich()) window.speechSynthesis.cancel()
}

/** MP3 über den Hörtext-Dienst; liefert die Bytes zum Speichern */
export async function alsMp3(text: string, id: string, settings: AppSettings): Promise<Uint8Array> {
  const stimmen = await window.api.audio.voices()
  const voiceId = settings.audio.voices.de || stimmen.find((v) => v.language?.toLowerCase().startsWith('de'))?.id || stimmen[0]?.id
  if (!voiceId) throw new Error('Für die Audiodatei ist keine Stimme verfügbar – der Hörtext-Dienst ist unter Einstellungen › Dienste einzurichten.')
  const erg = await window.api.audio.speak({ id: `rueckmeldung-${id}`, turns: [{ voiceId, text }], languageCode: 'de' })
  const base64 = erg.dataUrl.slice(erg.dataUrl.indexOf(',') + 1)
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
