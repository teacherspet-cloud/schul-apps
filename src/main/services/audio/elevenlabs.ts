/**
 * Hörtexte vertonen über ElevenLabs.
 *
 * Die vorhandenen KI-Zugänge (Codex, Claude Code, Antigravity) schreiben nur Text;
 * gesprochene Sprache liefert keiner von ihnen. Deshalb erzeugt die App die Audiodateien
 * über die Text-to-Speech-Schnittstelle von ElevenLabs:
 * POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id} mit dem Kopf „xi-api-key“.
 * Standardmodell ist eleven_multilingual_v2, das Englisch, Französisch, Spanisch und
 * Italienisch in Schulqualität spricht.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { writeAtomic } from '../storage/atomar'
import { merkeVerbrauch } from '../ai/verbrauch'
import { join, resolve, sep } from 'path'
import type { TtsRequest, TtsResult, TtsSettings, TtsVoice } from '@shared/types'
import { clampTtsSettings, dialogBloecke, ohneTags, textStuecke } from '@shared/voiceSettings'
import { getSecret } from '../storage/settings'
import { istOpenAiStimme, OPENAI_TTS_MODEL, openAiStimmen, sprichOpenAi } from './openaiTts'

// Basis ohne Fassungsnummer: Die Stimmenliste braucht v2 (nur dort gibt es `sharing`),
// alles andere v1. Jeder Pfad nennt seine Fassung deshalb selbst.
const API = 'https://api.elevenlabs.io'
export const TTS_MODEL = 'eleven_multilingual_v2'
/**
 * Modell für Gespräche mit mehreren Sprechern.
 *
 * eleven_v3 ist laut ElevenLabs im „research preview". Für Hörtexte der Schule ist das
 * vertretbar – sie werden vorab erzeugt, angehört und notfalls neu erzeugt, nicht live
 * ausgespielt. Wichtig ist dafür die Stabilität: Bei sehr niedrigen Werten neigt das
 * Modell dazu, Wörter zu erfinden, und ein erfundenes Wort verdirbt jede Verstehensfrage.
 */
export const DIALOG_MODEL = 'eleven_v3'

/** Pause zwischen zwei Sprecherzeilen, damit ein Dialog nicht gehetzt klingt. */
const TURN_BREAK = '<break time="0.7s" />'

/**
 * Der häufigste Fehler beim Einrichten: Auf der Schlüsselseite von ElevenLabs steht gut
 * sichtbar die KENNUNG des Schlüssels (64 Hexzeichen). Der Schlüssel selbst beginnt mit
 * „sk_" und wird nur EINMAL gezeigt – beim Anlegen oder Erneuern. Wer die Kennung kopiert,
 * bekommt sonst erst nach dem ersten Vertonungsversuch eine kryptische Meldung.
 */
export function keyProblem(k: string): string | null {
  const v = k.trim()
  if (!v) return null
  if (/^[0-9a-f]{32,}$/i.test(v)) {
    return 'Das ist die Kennung des Schlüssels, nicht der Schlüssel selbst. Der Schlüssel beginnt mit „sk_" und wird bei ElevenLabs nur einmal angezeigt – beim Anlegen oder Erneuern. Dort einen neuen Schlüssel anlegen und den angezeigten Wert kopieren.'
  }
  if (!v.startsWith('sk_')) return 'Ein ElevenLabs-Schlüssel beginnt mit „sk_". Bitte prüfen, ob der ganze Wert kopiert wurde.'
  return null
}

function key(): string {
  const k = getSecret('elevenlabs')
  if (!k) throw new Error('Es ist kein ElevenLabs-Schlüssel hinterlegt. Er wird in den Einstellungen unter „Hörtexte“ eingetragen.')
  const problem = keyProblem(k)
  if (problem) throw new Error(problem)
  return k
}

/** Die Meldung von ElevenLabs lesbar machen – sie steckt verschachtelt im JSON. */
function apiMessage(body: string): string {
  try {
    const d = JSON.parse(body) as { detail?: { message?: string } | string }
    if (typeof d.detail === 'string') return d.detail
    return d.detail?.message ?? ''
  } catch {
    return ''
  }
}

function audioDir(): string {
  const dir = join(app.getPath('userData'), 'hoertexte')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'xi-api-key': key(), 'content-type': 'application/json', ...(init.headers ?? {}) }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const message = apiMessage(body)
    // Eigene Meldung vor die von ElevenLabs stellen, aber deren Wortlaut mitgeben:
    // Sie benennt den Fehler oft genauer, als eine allgemeine Meldung es könnte.
    if (res.status === 401) throw new Error(`ElevenLabs lehnt den Schlüssel ab. Bitte in den Einstellungen prüfen.${message ? ` (${message})` : ''}`)
    if (res.status === 429)
      throw new Error(`Das ElevenLabs-Kontingent ist erschöpft oder es laufen zu viele Anfragen gleichzeitig.${message ? ` (${message})` : ''}`)
    throw new Error(message || `ElevenLabs meldet einen Fehler (${res.status}). ${body.slice(0, 200)}`)
  }
  return res
}

/** Alle Seiten von /v2/voices einsammeln. */
async function alleSeiten(): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  let token = ''
  for (let seite = 0; seite < 10; seite++) {
    const res = await request(`/v2/voices?page_size=100${token ? `&next_page_token=${encodeURIComponent(token)}` : ''}`)
    const data = (await res.json()) as { voices?: Record<string, unknown>[]; has_more?: boolean; next_page_token?: string }
    out.push(...(data.voices ?? []))
    if (!data.has_more || !data.next_page_token) break
    token = data.next_page_token
  }
  return out
}

/** Tarif des Kontos („free", „starter", „creator" …) – bestimmt, welche Stimmen nutzbar sind. */
async function accountTier(): Promise<string> {
  try {
    const res = await request('/v1/user/subscription')
    const data = (await res.json()) as { tier?: string }
    return (data.tier ?? '').toLowerCase()
  } catch {
    // Ohne Auskunft lieber nichts verbergen, als eine nutzbare Stimme zu unterschlagen
    return ''
  }
}

/** Die Felder einer Stimme, aus denen sich die Nutzbarkeit ergibt. */
export type StimmenRohdaten = {
  is_owner?: boolean
  available_for_tiers?: string[]
  sharing?: { free_users_allowed?: boolean; status?: string } | null
}

/**
 * Darf das Konto diese Stimme benutzen?
 *
 * Eigene Funktion, weil hier die Entscheidung fällt, die die Lehrkraft zu sehen bekommt –
 * und weil sie sich nur so ohne Konto prüfen lässt.
 *
 * `sharing` ist gesetzt, sobald eine Stimme geteilt WIRD oder WURDE (bei übernommenen
 * Stimmen steht dort `status: 'copied'`). Zusammen mit `is_owner: false` heißt das: Sie
 * stammt aus der Bibliothek eines fremden Kontos.
 *
 * WICHTIG – am echten Konto gemessen: `sharing.free_users_allowed: true` bedeutet NICHT,
 * dass ein kostenloses Konto die Stimme vertonen darf. Die Stimme „Ana-Rita3" trägt genau
 * dieses Feld und scheitert trotzdem mit HTTP 402 `paid_plan_required`:
 * „Free users cannot use library voices via the API." Das Feld sagt nur, ob freie Konten
 * die Stimme in ihre Liste ÜBERNEHMEN dürfen – nicht, ob sie damit sprechen dürfen.
 * Im kostenlosen Tarif ist deshalb JEDE Bibliotheksstimme gesperrt, ohne Ausnahme.
 */
export function stimmenNutzbarkeit(v: StimmenRohdaten, tier: string): { ausBibliothek: boolean; usable: boolean; unusableReason: string } {
  const ausBibliothek = Boolean(v.sharing) && !v.is_owner
  if (!ausBibliothek) return { ausBibliothek, usable: true, unusableReason: '' }
  // „free", aber auch Schreibweisen wie „free_v2" – die Regel darf nicht an einem Wort hängen
  if (tier.startsWith('free')) {
    return { ausBibliothek, usable: false, unusableReason: 'Im kostenlosen Tarif sind Stimmen aus der Bibliothek über die Schnittstelle gesperrt.' }
  }
  if (v.available_for_tiers?.length && !(tier && v.available_for_tiers.includes(tier))) {
    return { ausBibliothek, usable: false, unusableReason: `Diese Stimme setzt einen anderen Tarif voraus (${v.available_for_tiers.join(', ')}).` }
  }
  return { ausBibliothek, usable: true, unusableReason: '' }
}

/**
 * Verfügbare Stimmen des Kontos.
 *
 * Wichtig ist nicht nur, WELCHE Stimmen das Konto sieht, sondern welche es auch BENUTZEN
 * darf. Die Stimmenbibliothek ist im kostenlosen Tarif gesperrt; ElevenLabs sagt das aber
 * erst beim Vertonen: „Free users cannot use library voices via the API." Die Lehrkraft
 * hätte die Stimme also gewählt, den Hörtext geschrieben – und erst am Ende erfahren, dass
 * es nicht geht. Deshalb wird die Nutzbarkeit hier schon beim Laden bestimmt.
 */
export async function listVoices(): Promise<TtsVoice[]> {
  /*
   * Seit Großprogramm 0.4 (F6) stehen auch die Stimmen von OpenAI in der Liste – wenn ein
   * OpenAI-API-Schlüssel hinterlegt ist. Scheitert ElevenLabs (kein oder falscher Schlüssel),
   * bleiben die OpenAI-Stimmen nutzbar; ohne beide gilt die Meldung von ElevenLabs.
   */
  const openai = getSecret('openai') ? openAiStimmen() : []
  if (!getSecret('elevenlabs') && openai.length) return openai
  try {
    return [...(await elevenLabsStimmen()), ...openai]
  } catch (e) {
    if (openai.length) return openai
    throw e
  }
}

async function elevenLabsStimmen(): Promise<TtsVoice[]> {
  /*
   * ABSICHTLICH /v2/voices, nicht /v1/voices.
   *
   * Nur die zweite Fassung liefert `sharing`, `is_owner` und `available_for_tiers` – und
   * ohne diese Felder lässt sich nicht erkennen, ob eine Stimme aus der Bibliothek stammt.
   * Mit /v1 blieb die Prüfung wirkungslos: Es sah aus, als sei nichts gesperrt, und die
   * Bibliotheksstimmen standen weiter in der Liste, bis das Vertonen daran scheiterte.
   *
   * v2 blättert; 100 Stimmen je Seite, höchstens zehn Seiten – das deckt jedes Schulkonto ab
   * und verhindert zugleich eine Endlosschleife, falls der Seitenzeiger einmal stehen bleibt.
   */
  const [seiten, tier] = await Promise.all([alleSeiten(), accountTier()])
  const data = { voices: seiten } as {
    voices?: {
      voice_id: string
      name: string
      labels?: Record<string, string>
      description?: string
      preview_url?: string
      category?: string
      is_owner?: boolean
      available_for_tiers?: string[]
      sharing?: { free_users_allowed?: boolean; status?: string } | null
    }[]
  }
  const voices = (data.voices ?? []).map((v) => {
    const { ausBibliothek, usable, unusableReason } = stimmenNutzbarkeit(v, tier)
    return {
      id: v.voice_id,
      name: v.name,
      language: v.labels?.language ?? v.labels?.accent ?? '',
      gender: v.labels?.gender ?? '',
      description: v.description ?? '',
      usable,
      ...(unusableReason ? { unusableReason } : {}),
      ...(v.is_owner ? { isOwner: true } : {}),
      ...(ausBibliothek ? { fromLibrary: true } : {}),
      ...(v.preview_url ? { previewUrl: v.preview_url } : {}),
      ...(v.category ? { category: v.category } : {})
    }
  })
  for (const v of voices) if (v.previewUrl) previewUrls.set(v.id, v.previewUrl)
  return voices
}

/** Adressen der Hörproben, gemerkt aus dem letzten Abruf der Stimmenliste. */
const previewUrls = new Map<string, string>()

/**
 * Hörprobe einer Stimme als data:-Adresse.
 *
 * ElevenLabs liefert zu jeder Stimme eine fertige Beispielaufnahme mit. Sie abzuspielen
 * kostet KEIN Kontingent – anders als eine eigene Probesynthese. Gerade im kostenlosen
 * Tarif ist das der Unterschied zwischen „vorher reinhören" und „Kontingent verbraten".
 *
 * Geholt wird sie im Hauptprozess, nicht im Fenster: Dessen Sicherheitsrichtlinie erlaubt
 * nur eigene Quellen, eine fremde Adresse im Audio-Element würde sie blockieren.
 */
export async function previewVoice(voiceId: string): Promise<string> {
  // OpenAI hat keine fertigen Hörproben: eine kurze Probe (rund 75 Zeichen) wird erzeugt
  if (istOpenAiStimme(voiceId)) {
    const teile = await sprichOpenAi(
      { id: 'probe', turns: [{ voiceId, text: 'Hallo! So klingt diese Stimme in einem Hörtext. Hello, this is how I sound.' }] },
      getSecret('openai') ?? ''
    )
    merkeVerbrauch('openai', OPENAI_TTS_MODEL, { ttsZeichen: 75 })
    return `data:audio/mpeg;base64,${Buffer.concat(teile).toString('base64')}`
  }
  if (!previewUrls.has(voiceId)) await listVoices()
  const url = previewUrls.get(voiceId)
  if (!url) throw new Error('Zu dieser Stimme gibt es keine Hörprobe.')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Die Hörprobe konnte nicht geladen werden (${res.status}).`)
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:audio/mpeg;base64,${buf.toString('base64')}`
}

/** Die Klangregler in die Schreibweise der Schnittstelle bringen. */
function settingsBody(s?: TtsSettings): Record<string, number | boolean> {
  const v = clampTtsSettings(s)
  return { stability: v.stability, similarity_boost: v.similarity, style: v.style, use_speaker_boost: v.speakerBoost, speed: v.speed }
}

/**
 * Ein Stück Text eines einzelnen Sprechers vertonen.
 *
 * `previous_text`, `next_text` und `previous_request_ids` sind das Mittel gegen den Bruch
 * an der Schnittstelle zweier Aufträge: Das Modell kennt damit den Zusammenhang und setzt
 * die Sprechmelodie fort, statt jedes Stück bei null zu beginnen. Höchstens drei Kennungen
 * nimmt ElevenLabs entgegen.
 */
async function ttsStueck(
  voiceId: string,
  text: string,
  settings: TtsSettings | undefined,
  kontext: { previous_text?: string; next_text?: string; previous_request_ids?: string[] }
): Promise<{ buf: Buffer; id: string }> {
  const res = await request(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      // eleven_multilingual_v2 erkennt die Sprache selbst; language_code wird dort nicht unterstützt
      voice_settings: settingsBody(settings),
      ...kontext
    })
  })
  return { buf: Buffer.from(await res.arrayBuffer()), id: res.headers.get('request-id') ?? '' }
}

/** Reserve zum Limit von 10 000 Zeichen bei eleven_multilingual_v2. */
const SOLO_MAX_ZEICHEN = 9000

/**
 * Ein einzelner Sprecher: der GANZE Text in einem Auftrag.
 *
 * Vorher bekam jede Zeile eine eigene Anfrage – dadurch fehlte der sprachliche
 * Zusammenhang und die Sätze standen unverbunden nebeneinander. Bei nur einer Stimme gibt
 * es dafür keinen Grund: 10 000 Zeichen passen in einen Auftrag, das reicht für jeden
 * Hörtext der Schule. Nur wenn es doch länger wird, entstehen Stücke – und die werden
 * aneinandergebunden.
 *
 * Audio-Tags fliegen hier raus: eleven_multilingual_v2 versteht sie nicht und würde sie
 * vorlesen.
 */
async function sprichSolo(req: TtsRequest): Promise<Buffer[]> {
  const text = req.turns
    .map((t) => ohneTags(t.text))
    .filter(Boolean)
    .join(` ${TURN_BREAK} `)
  const stuecke = textStuecke(text, SOLO_MAX_ZEICHEN)
  const voiceId = req.turns[0].voiceId
  const parts: Buffer[] = []
  const ids: string[] = []
  for (let i = 0; i < stuecke.length; i++) {
    const { buf, id } = await ttsStueck(voiceId, stuecke[i], req.settings, {
      ...(i > 0 ? { previous_text: stuecke[i - 1], previous_request_ids: ids.slice(-3) } : {}),
      ...(i + 1 < stuecke.length ? { next_text: stuecke[i + 1] } : {})
    })
    parts.push(buf)
    if (id) ids.push(id)
  }
  return parts
}

/**
 * Mehrere Sprecher: der ganze Dialog in EINEM Auftrag über die Dialog-Schnittstelle.
 *
 * Das ist der eigentliche Unterschied. Zeile für Zeile einzeln erzeugt, kennt das Modell
 * den Gesprächspartner nicht – es fehlen Anschluss, Betonung und die kleinen Reaktionen,
 * die ein Gespräch ausmachen. `/v1/text-to-dialogue` bekommt alle Zeilen mit ihren Stimmen
 * auf einmal und erzeugt daraus ein zusammenhängendes Gespräch.
 *
 * Nur eleven_v3 kann das. Dessen Grenzen sind am Konto geprüft: rund 2000 Zeichen je
 * Auftrag, und `previous_request_ids`/`previous_text` werden ausdrücklich abgelehnt. Lange
 * Dialoge zerfallen deshalb in möglichst wenige, möglichst große Blöcke.
 */
async function sprichDialog(req: TtsRequest): Promise<Buffer[]> {
  const bloecke = dialogBloecke(req.turns.map((t) => ({ voiceId: t.voiceId, text: t.text.trim() })).filter((z) => z.text))
  const parts: Buffer[] = []
  for (const block of bloecke) {
    const res = await request('/v1/text-to-dialogue?output_format=mp3_44100_128', {
      method: 'POST',
      body: JSON.stringify({
        model_id: DIALOG_MODEL,
        inputs: block.map((z) => ({ text: z.text, voice_id: z.voiceId })),
        settings: settingsBody(req.settings),
        ...(req.languageCode ? { language_code: req.languageCode } : {})
      })
    })
    parts.push(Buffer.from(await res.arrayBuffer()))
  }
  return parts
}

/**
 * Vertont einen Hörtext als EINE Datei.
 *
 * Der Weg richtet sich nach der Zahl der Stimmen: ein Sprecher über das bewährte
 * eleven_multilingual_v2, ein Gespräch über die Dialog-Schnittstelle. Entstehen doch
 * mehrere Teile, werden die MP3-Puffer hintereinandergehängt – gleiche Abtastrate und
 * Bitrate, deshalb trägt das.
 */
export async function speak(req: TtsRequest): Promise<TtsResult> {
  const turns = req.turns.filter((t) => t.text.trim())
  if (!turns.length) throw new Error('Der Hörtext enthält keinen Text zum Vertonen.')
  const stimmen = new Set(turns.map((t) => t.voiceId))
  const dialog = stimmen.size > 1
  // OpenAI-Stimme gewählt (Großprogramm 0.4, F6): der ganze Hörtext über OpenAI
  const ueberOpenAi = turns.some((t) => istOpenAiStimme(t.voiceId))
  const parts = ueberOpenAi
    ? await sprichOpenAi({ ...req, turns }, getSecret('openai') ?? '')
    : dialog
      ? await sprichDialog({ ...req, turns })
      : await sprichSolo({ ...req, turns })
  if (!parts.length) throw new Error('Der Hörtext enthält keinen Text zum Vertonen.')
  const modell = ueberOpenAi ? OPENAI_TTS_MODEL : dialog ? DIALOG_MODEL : TTS_MODEL
  merkeVerbrauch(ueberOpenAi ? 'openai' : 'elevenlabs', modell, { ttsZeichen: turns.reduce((n, t) => n + t.text.length, 0) })
  const mp3 = Buffer.concat(parts)
  const fileName = `${req.id}.mp3`
  writeAtomic(join(audioDir(), fileName), mp3)
  return {
    fileName,
    dataUrl: `data:audio/mpeg;base64,${mp3.toString('base64')}`,
    bytes: mp3.length,
    mode: dialog ? 'dialog' : 'solo',
    model: modell,
    requests: parts.length
  }
}

/**
 * Nur ein schlichter Dateiname aus dem Hörtext-Ordner (27.09.2026, Sicherheitsbefund): Über den
 * Tablet-Zugang ist `audio:read` freigegeben – ohne diese Prüfung ließ sich mit „..\" jede Datei
 * des Rechners als Base64 auslesen.
 */
export function pruefeAudioName(fileName: string): string {
  if (typeof fileName !== 'string' || !/^[A-Za-z0-9_-]{1,80}\.mp3$/.test(fileName)) throw new Error('Ungültiger Dateiname für einen Hörtext.')
  const dir = audioDir()
  const file = resolve(dir, fileName)
  if (!file.startsWith(dir + sep)) throw new Error('Ungültiger Dateiname für einen Hörtext.')
  return file
}

/** Gespeicherte Datei erneut laden (z. B. beim Öffnen eines Arbeitsblatts). */
export function readAudio(fileName: string): string | null {
  const file = pruefeAudioName(fileName)
  if (!existsSync(file)) return null
  return `data:audio/mpeg;base64,${readFileSync(file).toString('base64')}`
}

/** Pfad des Ordners mit den Hörtexten (für „Im Ordner zeigen“). */
export function audioPath(fileName: string): string {
  return pruefeAudioName(fileName)
}
