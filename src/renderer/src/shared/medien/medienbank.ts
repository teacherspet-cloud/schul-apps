/**
 * Medienbank der Vokabeln – Abläufe in der Oberfläche (05.10.2026; Ablage: main/services/storage/medienbank.ts).
 *
 * Bilder: Die Bildsuche (Openverse, Wikimedia, Pixabay mit Schlüssel) liefert Kandidaten; die eingestellte
 * KI sieht die Vorschauen und wählt das geeignetste (oder keines). Das Bild wird verkleinert (höchstens
 * 512 px) gespeichert, die übrigen Kandidaten bleiben zum Umwählen. Alternativ erzeugt die Bild-KI eines.
 * Aussprache: die Sprach-KI (ElevenLabs bzw. OpenAI-Stimme) mit der Standardstimme der Sprache.
 * Alle Wege laufen über die vorhandenen Kanäle – mit Schlüsseln, Namensschutz und Verbrauch wie sonst.
 */
import type { OnlineImageHit, OnlineImageSource } from '@shared/types'
import type { MedienKandidat, TonArt } from '@shared/medienbank'

export interface Vokabel {
  term: string
  translation: string
  example?: string
}

const SPRACHE_NAME: Record<string, string> = { en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch', la: 'Latein', nl: 'Niederländisch', pl: 'Polnisch', ru: 'Russisch', tr: 'Türkisch' }

/** Bild verkleinern (JPEG, höchstens `max` px) – die Medienbank bleibt klein, Laden geht schnell */
export async function verkleinern(dataUrl: string, max = 512): Promise<string> {
  const bild = await new Promise<HTMLImageElement>((ok, fehler) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => fehler(new Error('Das Bild ließ sich nicht laden.'))
    i.src = dataUrl
  })
  const f = Math.min(1, max / Math.max(bild.naturalWidth, bild.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bild.naturalWidth * f))
  c.height = Math.max(1, Math.round(bild.naturalHeight * f))
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bild, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

const nachweisVon = (k: MedienKandidat): string => [k.titel, k.urheber, k.lizenz, k.quelle].filter(Boolean).join(' · ')

/** Kandidaten aus der Bildsuche – englischer Begriff bei Englisch, sonst die deutsche Bedeutung */
export async function bildKandidaten(sprache: string, v: Vokabel): Promise<MedienKandidat[]> {
  const suche = sprache === 'en' ? v.term : v.translation || v.term
  const quellen: OnlineImageSource[] = ['openverse', 'wikimedia', 'pixabay']
  const treffer: OnlineImageHit[] = []
  for (const q of quellen) {
    const t = await window.api.images.searchOnline(suche, q).catch(() => [] as OnlineImageHit[])
    treffer.push(...t.slice(0, 4))
  }
  const gesehen = new Set<string>()
  return treffer
    // https – oder kleine data-Bilder (KI-Attrappe der Tests)
    .filter((h) => (/^https:\/\//.test(h.url) || (h.url.startsWith('data:image/') && h.url.length < 4000)) && !gesehen.has(h.url) && gesehen.add(h.url))
    .slice(0, 10)
    .map((h) => ({ url: h.url, vorschau: h.thumbnail || h.url, titel: h.title, urheber: h.creator, lizenz: h.license, quelle: h.source }))
}

/** Die KI wählt aus den Vorschauen das Bild, das die Bedeutung am eindeutigsten zeigt; -1 = keines */
export async function kiWaehlt(sprache: string, v: Vokabel, kandidaten: MedienKandidat[]): Promise<number> {
  const vorschauen: { i: number; dataUrl: string }[] = []
  for (const [i, k] of kandidaten.slice(0, 6).entries()) {
    const d = await window.api.images.fetch(k.vorschau).catch(() => '')
    if (d) vorschauen.push({ i, dataUrl: await verkleinern(d, 256).catch(() => d) })
  }
  if (!vorschauen.length) return -1
  const antwort = await window.api.ai.structured<{ wahl: number; begruendung: string }>({
    system: 'Du wählst Beispielbilder für Vokabelkarten. Ein gutes Bild zeigt die Bedeutung eindeutig, ohne Text, kindgerecht und ohne bekannte Marken oder erkennbare Personen im Mittelpunkt.',
    user: [
      `Vokabel (${SPRACHE_NAME[sprache] ?? sprache}): „${v.term}" – Deutsch: „${v.translation}"${v.example ? ` – Beispiel: „${v.example}"` : ''}`,
      `Die ${vorschauen.length} Bilder sind von 1 bis ${vorschauen.length} nummeriert (in dieser Reihenfolge).`,
      'Antworte mit der Nummer des Bildes, das die Bedeutung am eindeutigsten zeigt; 0, wenn keines passt (z. B. bei abstrakten Wörtern ohne passendes Bild).'
    ].join('\n'),
    images: vorschauen.map((x) => x.dataUrl),
    schemaName: 'vokabel_bildwahl',
    schema: {
      type: 'object',
      properties: { wahl: { type: 'integer' }, begruendung: { type: 'string' } },
      required: ['wahl', 'begruendung'],
      additionalProperties: false
    }
  })
  const n = Math.round(Number(antwort?.wahl) || 0)
  return n >= 1 && n <= vorschauen.length ? vorschauen[n - 1].i : -1
}

/** Ein Kandidat als Bild der Medienbank (in voller Größe geladen, dann verkleinert) */
export async function kandidatUebernehmen(sprache: string, wort: string, k: MedienKandidat, alle?: MedienKandidat[]): Promise<void> {
  const d = await window.api.images.fetch(k.url).catch(() => window.api.images.fetch(k.vorschau))
  await window.api.medien.bildSetzen(sprache, wort, { dataUrl: await verkleinern(d), herkunft: 'suche', nachweis: nachweisVon(k), ...(alle ? { kandidaten: alle } : {}) })
}

/** Suchen, wählen lassen, speichern. false = kein geeignetes Bild gefunden */
export async function bildSuchenUndSetzen(sprache: string, v: Vokabel): Promise<boolean> {
  const kandidaten = await bildKandidaten(sprache, v)
  if (!kandidaten.length) return false
  const i = await kiWaehlt(sprache, v, kandidaten)
  if (i < 0) return false
  await kandidatUebernehmen(sprache, v.term, kandidaten[i], kandidaten)
  return true
}

/** Bild von der Bild-KI erzeugen lassen */
export async function bildErzeugen(sprache: string, v: Vokabel): Promise<void> {
  const prompt = `Simple, friendly illustration for a vocabulary flashcard showing "${v.translation || v.term}" (${SPRACHE_NAME[sprache] ?? sprache} word: "${v.term}"). Clear single subject, plain light background, no text, no letters, no logos.`
  const d = await window.api.ai.image(prompt)
  await window.api.medien.bildSetzen(sprache, v.term, { dataUrl: await verkleinern(d), herkunft: 'ki', nachweis: 'KI-generiert' })
}

/** Aussprache erzeugen (Standardstimme der Sprache) */
export async function tonErzeugen(sprache: string, wort: string, art: TonArt, text: string, stimme: string): Promise<void> {
  const id = `vok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const r = await window.api.audio.speak({ id, turns: [{ voiceId: stimme, text }], languageCode: sprache })
  if (!r?.dataUrl) throw new Error('Die Sprach-KI hat keine Aufnahme geliefert.')
  await window.api.medien.tonSetzen(sprache, wort, art, { dataUrl: r.dataUrl, stimme, text })
}

let laeuft: HTMLAudioElement | null = null
/** Ton der Medienbank abspielen (Datei oder Adresse) */
export async function abspielen(quelle: { datei?: string; url?: string }): Promise<void> {
  laeuft?.pause()
  const src = quelle.url ?? (quelle.datei ? await window.api.medien.datei(quelle.datei) : null)
  if (!src) throw new Error('Die Aufnahme fehlt.')
  laeuft = new Audio(src)
  await laeuft.play()
}
