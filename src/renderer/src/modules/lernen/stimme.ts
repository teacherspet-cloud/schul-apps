/**
 * Stimme für die Aussprache im Vokabeltrainer (03.10.2026, Befund der Lehrkraft: „Die Aussprache für
 * Englisch ist nicht ganz zuverlässig – es klingt nicht alles richtig").
 *
 * Bisher bekam die Sprachausgabe nur die Sprache (en-GB) mit – welche Stimme sprach, entschied das
 * Gerät. Fehlte eine passende, las oft eine deutsche Stimme das englische Wort. Jetzt wird gezielt
 * gewählt: Stimmen der Sprache, natürliche/neuronale vor älteren, die gewünschte Region vor anderen.
 * Gibt es gar keine Stimme der Sprache, wird nicht vorgelesen (lieber still als falsch).
 */
import { gewaehlteStimme } from '../onlinetest/schuelerDarstellung'

const GUETE = [/natural|neural|online/i, /google/i, /premium|enhanced|siri/i, /microsoft/i]

let geladen: SpeechSynthesisVoice[] = []
function stimmen(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return []
  const jetzt = window.speechSynthesis.getVoices()
  if (jetzt.length) geladen = jetzt
  return geladen
}
// Die Liste kommt in Chrome/Edge erst nachträglich
if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.addEventListener?.('voiceschanged', () => void stimmen())

export function besteStimme(lang: string): SpeechSynthesisVoice | null {
  const sprache = lang.slice(0, 2).toLowerCase()
  const passend = stimmen().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(sprache))
  if (!passend.length) return null
  // Selbst gewählte Stimme (Einstellungen › Lesen und Hören, 06.10.2026) – sofern auf diesem Gerät vorhanden
  const wahl = gewaehlteStimme(sprache)
  const gewaehlt = wahl ? passend.find((v) => v.name === wahl) : undefined
  if (gewaehlt) return gewaehlt
  const punkte = (v: SpeechSynthesisVoice): number => {
    let p = 0
    GUETE.forEach((re, i) => {
      if (re.test(v.name)) p += (GUETE.length - i) * 10
    })
    if (v.lang.toLowerCase().replace('_', '-') === lang.toLowerCase()) p += 15
    if (!v.localService) p += 3
    return p
  }
  return [...passend].sort((a, b) => punkte(b) - punkte(a))[0]
}

export const stimmeVorhanden = (lang: string): boolean => Boolean(besteStimme(lang))
