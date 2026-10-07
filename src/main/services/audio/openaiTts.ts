/**
 * Hörtexte über OpenAI vertonen (Großprogramm 0.4, F6) – neben ElevenLabs.
 *
 * Wunsch der Lehrkraft: Text-to-Speech über OpenAI UND ElevenLabs. Wer schon einen
 * OpenAI-Schlüssel für die Texte hat, braucht so keinen zweiten Dienst. Die Stimmen erscheinen
 * in derselben Liste wie die von ElevenLabs, mit dem Präfix „openai:" in der Kennung – daran
 * erkennt `speak`, welchen Weg ein Hörtext nimmt. Kein Umbau der Oberfläche nötig.
 *
 * Schnittstelle: POST https://api.openai.com/v1/audio/speech (Modell gpt-4o-mini-tts, höchstens
 * 4096 Zeichen je Auftrag, MP3). Ein Gespräch mit mehreren Sprechern entsteht Zeile für Zeile
 * (eine Stimme je Sprecher) und wird aneinandergehängt – OpenAI hat keine Dialog-Schnittstelle
 * wie ElevenLabs v3; die Zeilen klingen deshalb etwas weniger verbunden.
 *
 * Nur über API-Schlüssel: Der Abo-Weg (Kommandozeilenprogramme) liefert keine Sprachausgabe.
 */
import type { TtsRequest, TtsVoice } from '@shared/types'
import { ohneTags, textStuecke } from '@shared/voiceSettings'

export const OPENAI_TTS_MODEL = 'gpt-4o-mini-tts'
export const OPENAI_PRAEFIX = 'openai:'
const MAX_ZEICHEN = 4000

/** Die Stimmen von gpt-4o-mini-tts – alle sprechen die Sprache des Textes */
const STIMMEN: { id: string; name: string; gender: string; description: string }[] = [
  { id: 'alloy', name: 'Alloy', gender: 'neutral', description: 'neutral, klar' },
  { id: 'ash', name: 'Ash', gender: 'male', description: 'männlich, ruhig' },
  { id: 'ballad', name: 'Ballad', gender: 'male', description: 'männlich, weich' },
  { id: 'coral', name: 'Coral', gender: 'female', description: 'weiblich, freundlich' },
  { id: 'echo', name: 'Echo', gender: 'male', description: 'männlich, sachlich' },
  { id: 'fable', name: 'Fable', gender: 'neutral', description: 'erzählend' },
  { id: 'nova', name: 'Nova', gender: 'female', description: 'weiblich, lebhaft' },
  { id: 'onyx', name: 'Onyx', gender: 'male', description: 'männlich, tief' },
  { id: 'sage', name: 'Sage', gender: 'female', description: 'weiblich, ruhig' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', description: 'weiblich, hell' },
  { id: 'verse', name: 'Verse', gender: 'male', description: 'männlich, ausdrucksvoll' }
]

export const istOpenAiStimme = (id: string): boolean => id.startsWith(OPENAI_PRAEFIX)

export function openAiStimmen(): TtsVoice[] {
  return STIMMEN.map((s) => ({
    id: `${OPENAI_PRAEFIX}${s.id}`,
    name: `${s.name} (OpenAI)`,
    language: 'multilingual',
    multilingual: true,
    gender: s.gender,
    description: s.description,
    category: 'openai',
    usable: true
  }))
}

/** Sprechanweisung: deutlich, im Tempo der Regler, ohne Vorlesen von Regieanweisungen */
function anweisung(req: TtsRequest): string {
  const tempo = req.settings?.speed
  return [
    'Sprich deutlich und natürlich, wie in einem Hörtext für Lernende.',
    tempo && tempo < 0.95 ? 'Sprich etwas langsamer als gewöhnlich.' : tempo && tempo > 1.05 ? 'Sprich etwas zügiger als gewöhnlich.' : '',
    req.languageCode ? `Sprache des Textes: ${req.languageCode}.` : ''
  ]
    .filter(Boolean)
    .join(' ')
}

export type Abrufer = (url: string, init: RequestInit) => Promise<Response>

/**
 * Vertont alle Zeilen; aufeinanderfolgende Zeilen derselben Stimme werden zusammengefasst.
 * Liefert die MP3-Teile in der Reihenfolge des Skripts.
 */
export async function sprichOpenAi(req: TtsRequest, schluessel: string, abrufen: Abrufer = fetch): Promise<Buffer[]> {
  return (await sprichOpenAiTeile(req, schluessel, abrufen)).flatMap((t) => t.mp3)
}

/**
 * Wie `sprichOpenAi`, aber je Stimmblock mit der Zahl der Sprecherzeilen, die er enthält
 * (01.10.2026) – daraus entstehen die Segmente für spätere Teil-Vertonungen. Zeilen, die nach dem
 * Entfernen der Audio-Tags leer sind, zählen beim benachbarten Block mit.
 */
export async function sprichOpenAiTeile(req: TtsRequest, schluessel: string, abrufen: Abrufer = fetch): Promise<{ mp3: Buffer[]; zeilen: number }[]> {
  if (!schluessel)
    throw new Error('Für OpenAI-Stimmen ist ein OpenAI-API-Schlüssel nötig (Einstellungen › KI-Zugang). Der Abo-Weg liefert keine Sprachausgabe.')
  const bloecke: { stimme: string; text: string; zeilen: number }[] = []
  let ohneText = 0
  for (const t of req.turns) {
    const text = ohneTags(t.text).trim()
    if (!text) {
      if (bloecke.length) bloecke[bloecke.length - 1].zeilen++
      else ohneText++
      continue
    }
    const stimme = istOpenAiStimme(t.voiceId) ? t.voiceId.slice(OPENAI_PRAEFIX.length) : 'alloy'
    const letzter = bloecke[bloecke.length - 1]
    if (letzter && letzter.stimme === stimme) {
      letzter.text += `\n\n${text}`
      letzter.zeilen++
    } else bloecke.push({ stimme, text, zeilen: 1 + ohneText })
    ohneText = 0
  }
  const teile: { mp3: Buffer[]; zeilen: number }[] = []
  for (const b of bloecke) {
    const block: Buffer[] = []
    teile.push({ mp3: block, zeilen: b.zeilen })
    for (const stueck of textStuecke(b.text, MAX_ZEICHEN)) {
      const res = await abrufen('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { authorization: `Bearer ${schluessel}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: OPENAI_TTS_MODEL, voice: b.stimme, input: stueck, instructions: anweisung(req), response_format: 'mp3' })
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        if (res.status === 401) throw new Error('OpenAI lehnt den Schlüssel ab. Bitte in den Einstellungen prüfen.')
        if (res.status === 429) throw new Error('Das OpenAI-Kontingent ist erschöpft oder es laufen zu viele Anfragen gleichzeitig.')
        throw new Error(`OpenAI meldet einen Fehler bei der Vertonung (${res.status}). ${text.slice(0, 200)}`)
      }
      block.push(Buffer.from(await res.arrayBuffer()))
    }
  }
  return teile
}
