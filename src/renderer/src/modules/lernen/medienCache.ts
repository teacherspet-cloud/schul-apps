/**
 * Medienbank im Vokabeltraining der Lernenden (05.10.2026): Bild und Aussprache je Wort, Aussprache der
 * Beispielsätze – von der Lehrkraft-Seite einmal erzeugt (Vokabellisten, nur Admins). Die Aufnahme ersetzt
 * die Stimme des Geräts; fehlt sie, spricht wie bisher das Gerät.
 *
 * Eine Sitzung trainiert EINE Liste; deshalb genügt ein Zwischenspeicher für die gerade geladene.
 */
import type { MedienSicht } from '@shared/medienbank'
import { satzSchluessel, stufeVon } from '@shared/medienbank'
import { alsAnfrage, anfrageSchluessel, istEinfach, type MedienAnfrage } from '@shared/medienBedeutung'
import { senden } from '../onlinetest/serverApi'
import { useDarstellung } from '../onlinetest/schuelerDarstellung'

let medien: Record<string, MedienSicht> = {}
let laeuft: HTMLAudioElement | null = null

/*
 * Anfragen mit Bedeutung und Wortart (21.10.2026, shared/medienBedeutung.ts): Der Server gibt das Bild der Bedeutung –
 * das Verb „bear" bekommt so nicht mehr das Bild des Bären. Per POST, weil die Übersetzungen als Adresse zu lang würden.
 * Bevorzugte Fassung der Aussprache (07.10.2026) und Bildstufe nach Klasse (07.10.2026) löst der Server auf.
 */
async function abrufen(sprache: string, woerter: (string | MedienAnfrage)[], klasse?: number | null): Promise<Record<string, MedienSicht>> {
  const d = await senden<{ medien: Record<string, MedienSicht> }>('/s/api/medien', {
    sprache,
    lage: useDarstellung.getState().d.aussprache === 'm' ? 'm' : 'w',
    stufe: stufeVon(klasse),
    woerter: woerter.slice(0, 600).map((w) => (typeof w === 'string' ? { w } : w))
  }).catch(() => ({ medien: {} }))
  return d.medien ?? {}
}

/** Zwei Antworten zu einem Wort zusammenlegen (Bilder je Bedeutung dazu) */
function zusammen(a: MedienSicht | undefined, b: MedienSicht): MedienSicht {
  return a ? { ...a, ...b, ...(a.bilder || b.bilder ? { bilder: { ...(a.bilder ?? {}), ...(b.bilder ?? {}) } } : {}) } : b
}

/** Medien zu den Wörtern einer Liste laden (am Server); liefert sie auch zurück */
export async function medienLaden(sprache: string, woerter: (string | MedienAnfrage)[], klasse?: number | null): Promise<Record<string, MedienSicht>> {
  medien = {}
  if (!woerter.length) return medien
  medien = await abrufen(sprache, woerter, klasse)
  return medien
}

/**
 * Weitere Medien dazuladen, ohne die der Liste zu verwerfen (07.10.2026): Bild und Aussprache der unregelmäßigen
 * Verben liegen unter ihrer Grundform, die Formen als „Sätze".
 */
export async function medienErgaenzen(sprache: string, woerter: (string | MedienAnfrage)[], klasse?: number | null): Promise<void> {
  // Fehlt: das Wort ganz – oder bei einer Anfrage mit Bedeutung deren Bild (z. B. das Verb zum schon geladenen Nomen)
  const gesehen = new Set<string>()
  const fehlen = woerter
    .map(alsAnfrage)
    .filter((a): a is MedienAnfrage => Boolean(a))
    .filter((a) => {
      const k = anfrageSchluessel(a, sprache)
      if (gesehen.has(k)) return false
      gesehen.add(k)
      const m = medien[a.w]
      return !m || (!istEinfach(a) && !m.bilder?.[k])
    })
    .slice(0, 600)
  if (!fehlen.length) return
  const neu = await abrufen(sprache, fehlen, klasse)
  const aus = { ...medien }
  for (const [w, m] of Object.entries(neu)) aus[w] = zusammen(aus[w], m)
  medien = aus
}

export const medium = (wort: string): MedienSicht | undefined => medien[wort]

/**
 * Angepasste Fassung eines geschlechtsbezogenen Beispielsatzes (12.10.2026, shared/satzFassung.ts): Der Server liefert sie
 * nur, wenn die Lernenden ihre Aufnahme hören (bevorzugte Stimme, sonst die andere) – dann passt sie zur Stimme
 * („My name is Emma." statt „… Tom."). null = Original.
 */
export function satzFassung(satz: string | undefined): { text: string; uebersetzung?: string } | null {
  if (!satz) return null
  const k = satzSchluessel(satz)
  for (const m of Object.values(medien)) {
    const f = m.fassungen?.[k]
    if (f?.text) return { text: f.text, ...(f.uebersetzung ? { uebersetzung: f.uebersetzung } : {}) }
  }
  return null
}

/** Beispielsatz und Übersetzung so, wie die Lernenden sie sehen und hören (Fassung ihrer Stimme, sonst das Original) */
export function beispielFuerLernende<T extends { example?: string; exampleTranslation?: string }>(v: T): T {
  const f = satzFassung(v.example)
  return f ? { ...v, example: f.text, exampleTranslation: f.uebersetzung } : v
}

/** Gespeicherte Aufnahme abspielen; false = keine da (dann spricht das Gerät) */
export function aufnahmeSpielen(text: string): boolean {
  // Original eines geschlechtsbezogenen Satzes: die Aufnahme seiner Fassung (12.10.2026)
  const t = (satzFassung(text.trim())?.text ?? text).trim()
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
  const k = satzSchluessel(satzFassung(satz)?.text ?? satz)
  return Object.values(medien).some((m) => Boolean(m.saetze?.[k]?.url))
}
