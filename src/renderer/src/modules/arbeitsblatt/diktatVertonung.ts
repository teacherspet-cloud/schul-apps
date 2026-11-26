/**
 * Vorlesestimme für Diktate (26.11.2026, abgestimmt: KI-Stimme, einmal beim Freigeben erzeugt).
 *
 * Jeder Sinnabschnitt wird eine Zeile der Vertonung (Zeitmarken je Zeile, shared/vertonung.ts) – so springt der
 * Abspieler der Lernenden gezielt zu einem Abschnitt und wiederholt ihn. Satzschlusszeichen werden angesagt
 * (ISB: „Satzschlusszeichen werden angesagt"), Kommas nur, wenn sie mitdiktiert werden. Langsam gesprochen.
 * Die Aufnahme liegt als Hörtext-Freigabe auf dem Server (server/hoertexte.ts, öffentliche MP3 ohne Anmeldung).
 */
import type { DiktatBlock, Worksheet } from './model/types'
import { sinnabschnitte } from './didactics/diktat'
import { settingsFuerNiveau } from '@shared/voiceSettings'

const ANSAGE: Record<string, string> = { '.': 'Punkt', '?': 'Fragezeichen', '!': 'Ausrufezeichen', ':': 'Doppelpunkt' }

/** Die Zeilen zum Vorlesen: Sinnabschnitte mit angesagten Satzzeichen */
export function diktatZeilen(b: Pick<DiktatBlock, 'text' | 'kommasDiktiert'>): string[] {
  return sinnabschnitte(b.text).map((a) => {
    let t = a.replace(/[„“”"»«]/g, '')
    if (b.kommasDiktiert) t = t.replace(/,\s*/g, ' – Komma – ')
    const m = /([.?!:])\s*$/.exec(t)
    return m ? `${t.slice(0, m.index).trim()} … ${ANSAGE[m[1]]}.` : t.trim()
  })
}

export const tonFingerabdruck = (b: Pick<DiktatBlock, 'text' | 'kommasDiktiert'>): string => `${b.kommasDiktiert ? 'k' : '-'}|${b.text.replace(/\s+/g, ' ').trim()}`

export const tonAktuell = (b: DiktatBlock): boolean => Boolean(b.ton?.url && b.ton.fingerabdruck === tonFingerabdruck(b))

/**
 * Alle Diktate eines Blattes vertonen, deren Aufnahme fehlt oder veraltet ist. Wirft nicht: Ohne Sprachdienst bleibt das
 * Diktat ohne Stimme (die Lehrkraft liest vor) – die Rückgabe nennt den Grund.
 */
export async function diktateVertonen(ws: Worksheet, sheetId: string, stimme: string): Promise<{ ws: Worksheet; vertont: number; fehler?: string }> {
  let vertont = 0
  let fehler: string | undefined
  const sheets = await Promise.all(
    ws.sheets.map(async (s) => {
      if (s.id !== sheetId) return s
      const blocks = await Promise.all(
        s.blocks.map(async (b) => {
          if (b.type !== 'diktat' || !b.text.trim() || tonAktuell(b)) return b
          try {
            const res = await window.api.audio.speak({
              id: `diktat-${b.id}`,
              languageCode: 'de',
              turns: diktatZeilen(b).map((text) => ({ voiceId: stimme, text })),
              skript: b.text,
              // Diktiertempo: deutlich langsamer als ein Hörtext (FAUSTREGEL, etwa 70–90 Wörter je Minute)
              settings: settingsFuerNiveau([70, 90], false)
            })
            if (!res.freigabe) throw new Error('Die Aufnahme wurde nicht auf dem Server abgelegt (nur in der Web-App möglich).')
            vertont++
            return { ...b, ton: { url: res.freigabe, zeitmarken: res.zeitmarken ?? [], ...(res.sekunden ? { sekunden: res.sekunden } : {}), fingerabdruck: tonFingerabdruck(b) } }
          } catch (e) {
            fehler = e instanceof Error ? e.message : String(e)
            return b
          }
        })
      )
      return { ...s, blocks }
    })
  )
  return { ws: { ...ws, sheets }, vertont, ...(fehler ? { fehler } : {}) }
}
