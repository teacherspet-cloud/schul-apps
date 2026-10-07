/**
 * Medienbank im Vokabeltraining der Lernenden (05.10.2026): Bild und Aussprache je Wort, Aussprache der
 * Beispielsätze – von der Lehrkraft-Seite einmal erzeugt (Vokabellisten, nur Admins). Die Aufnahme ersetzt
 * die Stimme des Geräts; fehlt sie, spricht wie bisher das Gerät.
 *
 * Eine Sitzung trainiert EINE Liste; deshalb genügt ein Zwischenspeicher für die gerade geladene.
 */
import type { MedienSicht } from '@shared/medienbank'
import { satzSchluessel, stufeVon } from '@shared/medienbank'
import { holen } from '../onlinetest/serverApi'
import { useDarstellung } from '../onlinetest/schuelerDarstellung'

let medien: Record<string, MedienSicht> = {}
let laeuft: HTMLAudioElement | null = null

/** Medien zu den Wörtern einer Liste laden (am Server); liefert sie auch zurück */
export async function medienLaden(sprache: string, woerter: string[], klasse?: number | null): Promise<Record<string, MedienSicht>> {
  medien = {}
  if (!woerter.length) return medien
  // Bevorzugte Fassung der Aussprache (07.10.2026) – der Server löst sie auf, mit der anderen als Rückfall
  // Bildstufe nach Klasse (07.10.2026) – der Server liefert das Bild dieser Stufe, sonst das der nächstliegenden
  const q = new URLSearchParams({ sprache, lage: useDarstellung.getState().d.aussprache === 'm' ? 'm' : 'w', stufe: stufeVon(klasse) })
  for (const w of woerter.slice(0, 600)) q.append('w', w)
  const d = await holen<{ medien: Record<string, MedienSicht> }>(`/s/api/medien?${q.toString()}`).catch(() => ({ medien: {} }))
  medien = d.medien ?? {}
  return medien
}

export const medium = (wort: string): MedienSicht | undefined => medien[wort]

/** Gespeicherte Aufnahme abspielen; false = keine da (dann spricht das Gerät) */
export function aufnahmeSpielen(text: string): boolean {
  const t = text.trim()
  let url: string | undefined
  const w = medien[t]
  if (w?.ton?.url && w.ton.text.trim() === t) url = w.ton.url
  if (!url) {
    // Beispielsatz: in irgendeinem Eintrag gespeichert
    const k = satzSchluessel(t)
    for (const m of Object.values(medien)) if (m.saetze?.[k]?.url) url = m.saetze[k].url
  }
  if (!url) return false
  try {
    window.speechSynthesis?.cancel()
    laeuft?.pause()
    laeuft = new Audio(url)
    void laeuft.play().catch(() => undefined)
    return true
  } catch {
    return false
  }
}

/** Gibt es eine Aufnahme des Beispielsatzes? */
export const hatSatzAufnahme = (satz: string | undefined): boolean => {
  if (!satz) return false
  const k = satzSchluessel(satz)
  return Object.values(medien).some((m) => Boolean(m.saetze?.[k]?.url))
}
