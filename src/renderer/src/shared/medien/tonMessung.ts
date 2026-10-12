/**
 * Aufnahmen der Medienbank messen (12.10.2026, Regeln in shared/tonPruefung.ts): MP3 mit Web Audio dekodieren und den
 * Pegelverlauf auswerten. Läuft in der Oberfläche – in der Exe wie im Browser am Server; kostet nichts und ruft keinen
 * Dienst. Gescheitertes Dekodieren (kaputte Datei) gilt selbst als Verdacht.
 */
import { bewerte, istGeprueft, messeSignal, PRUEF_VERSION, type TonPruefung } from '@shared/tonPruefung'

/** data:-URL oder Adresse → Bytes (data: ohne fetch – die Inhaltsrichtlinie erlaubt fetch auf data: nicht überall) */
async function bytesVon(quelle: string): Promise<ArrayBuffer> {
  const m = /^data:[^;,]+;base64,(.*)$/s.exec(quelle)
  if (m) {
    const bin = atob(m[1])
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out.buffer
  }
  const res = await fetch(quelle, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`Die Aufnahme ließ sich nicht laden (${res.status}).`)
  return res.arrayBuffer()
}

/** Ein Kontext für alle Messungen; OfflineAudioContext braucht kein Ausgabegerät und keine Nutzergeste */
let kontext: OfflineAudioContext | null = null
const ctx = (): OfflineAudioContext => (kontext ??= new OfflineAudioContext(1, 44100, 44100))

/** Aufnahme messen und bewerten. `text`: gesprochener Text (für Silben- bzw. Buchstabenzahl) */
export async function tonMessen(quelle: string, art: 'wort' | 'satz', text: string): Promise<TonPruefung> {
  const bytes = await bytesVon(quelle)
  let puffer: AudioBuffer
  try {
    puffer = await ctx().decodeAudioData(bytes)
  } catch {
    return { stufe: 'verdacht', gruende: ['Datei nicht lesbar'], version: PRUEF_VERSION }
  }
  return bewerte(messeSignal(puffer.getChannelData(0), puffer.sampleRate), art, text)
}

/*
 * Ergebnisse der Sitzung (12.10.2026): Lehrkräfte ohne Schreibrecht sehen den Verdacht auch, ohne dass er gespeichert
 * wird; Admins müssen nach dem Speichern nicht neu laden. Schlüssel = Dateiname (jede neue Aufnahme hat einen neuen).
 */
const ergebnisse = new Map<string, TonPruefung>()
const hoerer = new Set<() => void>()
export const gemesseneVon = (datei: string | undefined): TonPruefung | undefined => (datei ? ergebnisse.get(datei) : undefined)
let melden: ReturnType<typeof setTimeout> | null = null
export function merkeMessung(datei: string, p: TonPruefung): void {
  ergebnisse.set(datei, p)
  // Gesammelt melden – bei Hunderten Nachprüfungen zeichnet die Tabelle nicht nach jeder einzelnen neu
  melden ??= setTimeout(() => {
    melden = null
    for (const fn of hoerer) fn()
  }, 400)
}
export function aufMessung(fn: () => void): () => void {
  hoerer.add(fn)
  return () => void hoerer.delete(fn)
}

/** Gültige Prüfung einer Aufnahme: gespeichert (aktuelle Regelfassung) oder in dieser Sitzung gemessen */
export const pruefungVon = (ton: { datei: string; pruefung?: TonPruefung } | undefined): TonPruefung | undefined =>
  !ton ? undefined : istGeprueft(ton.pruefung) ? ton.pruefung : gemesseneVon(ton.datei)
