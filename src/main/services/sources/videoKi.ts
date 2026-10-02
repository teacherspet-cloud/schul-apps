/**
 * Gemini „sieht" ein öffentliches YouTube-Video (02.10.2026, Entscheidung der Lehrkraft: einer der
 * Wege für Hör-/Sehverstehen, wenn ein Video keine Untertitel hat).
 *
 * Belegt (ai.google.dev/gemini-api/docs/video-understanding, Stand 10/2026): Die Gemini-API nimmt
 * eine YouTube-Adresse direkt als Eingabe, verarbeitet Bild (1 Bild/s) UND Ton und nennt Stellen
 * als MM:SS; nur öffentliche Videos; im kostenlosen Rahmen höchstens 8 Stunden Video je Tag.
 *
 * Das Ergebnis ist ein INHALTSPROTOKOLL, kein wörtliches Transkript: Die KI gibt das Gesprochene
 * sinngemäß und das Gezeigte knapp wieder. So wird es auch weitergegeben, damit die Aufgaben nicht
 * nach Wortlaut fragen, den es so vielleicht nicht gibt.
 */
import { GoogleGenAI } from '@google/genai'
import { getSecret, getSettings } from '../storage/settings'
import { merkeVerbrauch } from '../ai/verbrauch'
import { attrappeAktiv } from '../ai/attrappe'

const AUFTRAG = [
  'Erstelle ein Inhaltsprotokoll dieses Videos für eine Lehrkraft, die daraus Aufgaben zum Hör-/Sehverstehen macht.',
  'Gliedere es in Abschnitte von etwa 20–40 Sekunden. Jede Zeile beginnt mit der Zeitmarke im Format [m:ss].',
  'Gib je Abschnitt (1) das Gesagte möglichst nah am Wortlaut in der Sprache des Videos wieder, mit Sprecher, wenn erkennbar, und (2) in eckigen Klammern knapp, was zu sehen ist (Ort, Personen, Einblendungen, Grafiken, Zahlen).',
  'Erfinde nichts: Was unklar ist, kennzeichne mit (unverständlich). Keine Bewertung, keine Zusammenfassung am Ende.'
].join('\n')

/** Inhaltsprotokoll mit Zeitmarken – oder ein Grund, warum es keines gibt */
export async function videoInhaltUeberGemini(url: string): Promise<{ protokoll: string } | { fehler: string }> {
  // In den Oberflächentests nie ins Netz
  if (attrappeAktiv()) return { fehler: 'In der Testumgebung abgeschaltet.' }
  const schluessel = getSecret('google')
  if (!schluessel) return { fehler: 'Kein Google-Schlüssel hinterlegt (Einstellungen → KI).' }
  const eingestellt = getSettings().ai.textModels.google
  // Ein Gemini-Modell mit Videoverständnis; die eingestellte Wahl, sonst ein schnelles
  const model = eingestellt && /gemini/i.test(eingestellt) ? eingestellt : 'gemini-2.5-flash'
  const client = new GoogleGenAI({ apiKey: schluessel })
  const antwort = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ fileData: { fileUri: url, mimeType: 'video/*' } }, { text: AUFTRAG }] }],
    config: { abortSignal: AbortSignal.timeout(240_000) }
  })
  merkeVerbrauch('google', model, { eingabe: antwort.usageMetadata?.promptTokenCount ?? 0, ausgabe: antwort.usageMetadata?.candidatesTokenCount ?? 0 })
  const protokoll = (antwort.text ?? '').trim()
  return protokoll ? { protokoll } : { fehler: 'Gemini hat zum Video nichts geliefert.' }
}
