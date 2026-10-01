/**
 * Hörtext vertonen – mit Zeitmarken je Sprecherzeile und Wiederverwendung unveränderter Stellen
 * (01.10.2026).
 *
 * Wünsche der Lehrkraft:
 * - Alle Zeitangaben sollen zur echten Aufnahme passen. Dafür misst die App jedes erzeugte Stück
 *   (Rahmen zählen, `shared/mp3.ts`) und kennt so den Beginn jeder Sprecherzeile.
 * - Ändern sich nur einzelne Stellen des Skripts, werden nur diese neu vertont und an der
 *   richtigen Stelle in die vorhandene Datei eingesetzt – mit derselben Stimme und denselben
 *   Einstellungen. Das spart Kontingent und lässt den Rest der Aufnahme unverändert.
 *
 * Dafür wird die fertige Datei in SEGMENTE zerlegt gemerkt: je Sprecherzeile ein Byte-Bereich,
 * wenn der Dienst Zeitmarken liefert (dann wird in der Pause zwischen zwei Zeilen geschnitten),
 * sonst ein Bereich je Auftrag. Jedes Segment trägt Schlüssel aus Text, Stimme, Klang, Modell und
 * Sprache. Beim nächsten Vertonen werden die Schlüssel verglichen: Was gleich ist, wird Byte für
 * Byte übernommen, nur der Rest geht an den Dienst.
 *
 * Ganz neu vertont wird, wenn es nichts zu übernehmen gibt – alte Aufnahme ohne Segmente, Datei
 * fehlt, Stimme/Tempo/Modell geändert. Der Grund steht im Ergebnis und in der Meldung.
 *
 * Ohne Netz und ohne Oberfläche prüfbar (tests/vertonung.test.ts): Der Dienst kommt als
 * `Synthese` herein.
 */
import { mp3Bereinigt, mp3Rahmen, mp3Schneiden, mp3Sekunden, verbinde } from './mp3'

export interface Sprecherzeile {
  voiceId: string
  text: string
}

/** Ein zusammenhängender Byte-Bereich der fertigen Datei mit den Zeilen, die er enthält. */
export interface TtsSegment {
  /** Schlüssel je Zeile aus Text, Stimme, Klang, Modell und Sprache */
  s: string[]
  /** Schlüssel je Zeile nur aus dem Text – unterscheidet „Text geändert" von „Stimme geändert" */
  t: string[]
  von: number
  bis: number
  sekunden: number
  /** Beginn jeder Zeile relativ zum Segmentanfang, in Sekunden */
  marken: number[]
  /** Zeitmarken vom Dienst gemessen (sonst nach Zeichen verteilt) */
  gemessen: boolean
}

/** Antwort des Dienstes auf einen Auftrag: ein MP3-Stück für `zeilen` aufeinanderfolgende Zeilen. */
export interface SyntheseTeil {
  mp3: Uint8Array
  zeilen: number
  /** Beginn und Ende jeder Zeile im Stück, in Sekunden – nur, wenn der Dienst sie liefert */
  zeiten?: { von: number; bis: number }[]
}

export interface Synthese {
  /** Modell bzw. Weg (eleven_v3, eleven_multilingual_v2, OpenAI …) – geht in die Schlüssel ein */
  modell: string
  /** Zeilen vertonen; `davor`/`danach` = Nachbartext für eine bruchlose Sprechmelodie */
  vertone(zeilen: Sprecherzeile[], kontext: { davor?: string; danach?: string }): Promise<SyntheseTeil[]>
}

export interface Vorlage {
  mp3: Uint8Array
  segmente: TtsSegment[]
}

export interface VertonungsErgebnis {
  mp3: Uint8Array
  sekunden: number
  /** Beginn jeder Zeile in der fertigen Datei, in Sekunden */
  zeitmarken: number[]
  segmente: TtsSegment[]
  weg: 'voll' | 'teilweise'
  /** Zahl der neu vertonten Zeilen */
  neu: number
  zeilen: number
  /** Vertonte Zeichen (Verbrauch) */
  zeichen: number
  /** Aufrufe des Dienstes */
  auftraege: number
  /** Warum ganz neu vertont wurde, obwohl eine Aufnahme da war */
  grund?: string
}

/** cyrb53 – kurzer, stabiler Text-Fingerabdruck (kein Sicherheitszweck). */
export function fingerabdruck(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const normal = (s: string): string => s.replace(/\s+/g, ' ').trim()

export function textSchluessel(text: string): string {
  return fingerabdruck(normal(text))
}

export function zeilenSchluessel(z: Sprecherzeile, modell: string, umgebung: { settings?: unknown; sprache?: string }): string {
  return fingerabdruck([modell, umgebung.sprache ?? '', JSON.stringify(umgebung.settings ?? {}), z.voiceId, normal(z.text)].join('|'))
}

/** Zeitmarken innerhalb eines Stücks ohne Messung: nach Zeichen verteilt. */
export function markenNachZeichen(texte: string[], sekunden: number): number[] {
  const laengen = texte.map((t) => Math.max(1, normal(t).length))
  const summe = laengen.reduce((a, b) => a + b, 0)
  let t = 0
  return laengen.map((l) => {
    const m = t
    t += (l / summe) * sekunden
    return m
  })
}

/** Längste gemeinsame Teilfolge: je neuer Zeile der Index der passenden alten (oder -1). */
function zuordnung(neu: string[], alt: string[]): number[] {
  const n = neu.length
  const m = alt.length
  const l: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) l[i][j] = neu[i] === alt[j] ? l[i + 1][j + 1] + 1 : Math.max(l[i + 1][j], l[i][j + 1])
  const out = new Array<number>(n).fill(-1)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (neu[i] === alt[j]) {
      out[i] = j
      i++
      j++
    } else if (l[i + 1][j] >= l[i][j + 1]) i++
    else j++
  }
  return out
}

type Schritt = { art: 'alt'; segment: TtsSegment } | { art: 'neu'; von: number; bis: number }

/**
 * Welche alten Segmente unverändert übernommen werden können und welche Zeilen neu vertont
 * werden. Ein Segment zählt nur, wenn ALLE seine Zeilen gleich geblieben sind und in der neuen
 * Fassung direkt aufeinander folgen.
 */
export function planeVertonung(schluessel: string[], alt: TtsSegment[]): Schritt[] {
  const flach: { seg: number; pos: number }[] = []
  alt.forEach((s, k) => s.s.forEach((_, p) => flach.push({ seg: k, pos: p })))
  const map = zuordnung(
    schluessel,
    alt.flatMap((s) => s.s)
  )
  // Je Segment: Startzeile in der neuen Fassung, wenn es vollständig und zusammenhängend passt
  const start = new Map<number, number>()
  alt.forEach((s, k) => {
    const neuIdx = s.s.map((_, p) => map.findIndex((j) => j >= 0 && flach[j].seg === k && flach[j].pos === p))
    if (neuIdx.every((x, p) => x >= 0 && x === neuIdx[0] + p)) start.set(neuIdx[0], k)
  })
  const schritte: Schritt[] = []
  let i = 0
  while (i < schluessel.length) {
    const k = start.get(i)
    if (k !== undefined) {
      schritte.push({ art: 'alt', segment: alt[k] })
      i += alt[k].s.length
      continue
    }
    const letzter = schritte[schritte.length - 1]
    if (letzter?.art === 'neu') letzter.bis = i + 1
    else schritte.push({ art: 'neu', von: i, bis: i + 1 })
    i++
  }
  return schritte
}

/** Passen die gemerkten Segmente zur Datei? (Lückenlos, Ende = Dateiende, Rahmen am Anfang.) */
export function vorlagePasst(v: Vorlage | null | undefined): boolean {
  if (!v || !v.segmente.length || !v.mp3.length) return false
  let pos = 0
  for (const s of v.segmente) {
    if (s.von !== pos || s.bis <= s.von || s.s.length !== s.marken.length || s.s.length !== s.t.length) return false
    pos = s.bis
  }
  if (pos !== v.mp3.length) return false
  return mp3Rahmen(v.mp3.subarray(0, Math.min(v.mp3.length, 4096)))[0]?.start === 0
}

/** Ein Teil des Dienstes in Segmente: je Zeile, wenn Zeitmarken da sind, sonst als Ganzes. */
function teilAlsSegmente(teil: SyntheseTeil, zeilen: { s: string; t: string; text: string }[]): { mp3: Uint8Array; seg: Omit<TtsSegment, 'von' | 'bis'> }[] {
  const z = teil.zeiten
  if (z && z.length === zeilen.length && zeilen.length > 0 && z.every((x, i) => Number.isFinite(x.von) && (i === 0 || x.von >= z[i - 1].von))) {
    // Schnitt mitten in der Pause zwischen zwei Zeilen
    const schnitte = z.slice(1).map((x, i) => Math.max(z[i].von, (Math.min(z[i].bis, x.von) + x.von) / 2))
    const stuecke = mp3Schneiden(teil.mp3, schnitte)
    return stuecke.map((mp3, i) => ({
      mp3,
      seg: {
        s: [zeilen[i].s],
        t: [zeilen[i].t],
        sekunden: mp3Sekunden(mp3),
        marken: [Math.max(0, z[i].von - (i === 0 ? 0 : schnitte[i - 1]))],
        gemessen: true
      }
    }))
  }
  const mp3 = mp3Bereinigt(teil.mp3)
  const sekunden = mp3Sekunden(mp3)
  return [
    {
      mp3,
      seg: {
        s: zeilen.map((x) => x.s),
        t: zeilen.map((x) => x.t),
        sekunden,
        marken: markenSicher(zeilen.map((x) => x.text), sekunden),
        gemessen: false
      }
    }
  ]
}

const markenSicher = (texte: string[], sekunden: number): number[] => (texte.length ? markenNachZeichen(texte, sekunden) : [])

/**
 * Vertont die Zeilen eines Hörtextes. Mit `vorlage` (die bisherige Datei samt Segmenten) werden
 * nur geänderte Zeilen an den Dienst geschickt; `vorlageFehlt` nennt den Grund, falls die
 * Vorlage gar nicht erst geladen werden konnte.
 */
export async function vertoneHoertext(
  zeilen: Sprecherzeile[],
  umgebung: { settings?: unknown; sprache?: string },
  synth: Synthese,
  vorlage?: Vorlage | null,
  vorlageFehlt?: string
): Promise<VertonungsErgebnis> {
  const liste = zeilen.filter((z) => z.text.trim())
  if (!liste.length) throw new Error('Der Hörtext enthält keinen Text zum Vertonen.')
  const info = liste.map((z) => ({ s: zeilenSchluessel(z, synth.modell, umgebung), t: textSchluessel(z.text), text: z.text }))

  let grund = vorlageFehlt
  let schritte: Schritt[] = [{ art: 'neu', von: 0, bis: liste.length }]
  if (vorlage && !vorlagePasst(vorlage)) grund = 'Die gespeicherte Aufnahme passt nicht zu ihren Abschnitten.'
  else if (vorlage) {
    const plan = planeVertonung(
      info.map((x) => x.s),
      vorlage.segmente
    )
    if (plan.some((x) => x.art === 'alt')) schritte = plan
    else {
      const alteSchluessel = new Set(vorlage.segmente.flatMap((s) => s.s))
      const alteTexte = new Set(vorlage.segmente.flatMap((s) => s.t))
      grund = info.some((x) => alteSchluessel.has(x.s))
        ? 'Die bisherige Aufnahme ist ein durchgehendes Stück ohne Schnittstellen zwischen den Zeilen.'
        : info.some((x) => alteTexte.has(x.t))
          ? 'Stimme, Tempo oder Modell wurde geändert.'
          : 'Das Skript wurde vollständig geändert.'
    }
  }

  const stuecke: { mp3: Uint8Array; seg: Omit<TtsSegment, 'von' | 'bis'> }[] = []
  let neu = 0
  let zeichen = 0
  let auftraege = 0
  for (const schritt of schritte) {
    if (schritt.art === 'alt') {
      stuecke.push({ mp3: vorlage!.mp3.subarray(schritt.segment.von, schritt.segment.bis), seg: { ...schritt.segment } })
      continue
    }
    const teilZeilen = liste.slice(schritt.von, schritt.bis)
    const teile = await synth.vertone(teilZeilen, {
      davor: schritt.von > 0 ? liste[schritt.von - 1].text : undefined,
      danach: schritt.bis < liste.length ? liste[schritt.bis].text : undefined
    })
    auftraege++
    if (teile.reduce((n, t) => n + t.zeilen, 0) !== teilZeilen.length) throw new Error('Die Vertonung lieferte nicht für jede Sprecherzeile Ton.')
    let pos = schritt.von
    for (const teil of teile) {
      stuecke.push(...teilAlsSegmente(teil, info.slice(pos, pos + teil.zeilen)))
      pos += teil.zeilen
    }
    neu += teilZeilen.length
    zeichen += teilZeilen.reduce((n, z) => n + z.text.length, 0)
  }

  const mp3 = verbinde(stuecke.map((s) => s.mp3))
  const segmente: TtsSegment[] = []
  const zeitmarken: number[] = []
  let byte = 0
  let zeit = 0
  for (const st of stuecke) {
    segmente.push({ ...st.seg, von: byte, bis: byte + st.mp3.length })
    for (const m of st.seg.marken) zeitmarken.push(rund(zeit + m))
    byte += st.mp3.length
    zeit += st.seg.sekunden
  }
  return {
    mp3,
    sekunden: rund(zeit),
    zeitmarken,
    segmente,
    weg: neu < liste.length ? 'teilweise' : 'voll',
    neu,
    zeilen: liste.length,
    zeichen,
    auftraege,
    ...(neu === liste.length && grund ? { grund } : {})
  }
}

const rund = (s: number): number => Math.round(s * 1000) / 1000

/** Zeitmarken je Zeile aus `voice_segments` der Dialog-Schnittstelle (`…/with-timestamps`). */
export function zeitenAusDialog(segmente: unknown, zeilen: number): { von: number; bis: number }[] | undefined {
  if (!Array.isArray(segmente)) return undefined
  const out = Array.from({ length: zeilen }, () => ({ von: Infinity, bis: -Infinity }))
  for (const s of segmente as { dialogue_input_index?: unknown; start_time_seconds?: unknown; end_time_seconds?: unknown }[]) {
    const i = Number(s?.dialogue_input_index)
    const von = Number(s?.start_time_seconds)
    const bis = Number(s?.end_time_seconds)
    if (!Number.isInteger(i) || i < 0 || i >= zeilen || !Number.isFinite(von) || !Number.isFinite(bis)) continue
    out[i].von = Math.min(out[i].von, von)
    out[i].bis = Math.max(out[i].bis, bis)
  }
  return out.every((z) => Number.isFinite(z.von) && Number.isFinite(z.bis)) ? out : undefined
}

/**
 * Zeitmarken je Zeile aus der Zeichen-Ausrichtung der Einzelstimme (`…/with-timestamps`): Jede
 * Zeile wird über ihren Anfang und ihr Ende im ausgerichteten Text gesucht. Findet sich eine
 * nicht, gibt es keine Marken (dann verteilt die App nach Zeichen).
 */
export function zeitenAusAusrichtung(
  ausrichtung: { characters?: unknown; character_start_times_seconds?: unknown; character_end_times_seconds?: unknown } | undefined,
  texte: string[]
): { von: number; bis: number }[] | undefined {
  const zeichen = ausrichtung?.characters
  const starts = ausrichtung?.character_start_times_seconds
  const enden = ausrichtung?.character_end_times_seconds
  if (!Array.isArray(zeichen) || !Array.isArray(starts) || !Array.isArray(enden)) return undefined
  // Leerraum zusammenfassen, dabei je Zeichen merken, woher es stammt
  let flach = ''
  const herkunft: number[] = []
  zeichen.forEach((z, i) => {
    const c = /\s/.test(String(z)) ? ' ' : String(z).toLowerCase()
    if (c === ' ' && flach.endsWith(' ')) return
    flach += c
    herkunft.push(i)
  })
  const out: { von: number; bis: number }[] = []
  let ab = 0
  for (const t of texte) {
    const n = normal(t).toLowerCase()
    if (!n) return undefined
    const anfang = flach.indexOf(n.slice(0, 24), ab)
    if (anfang < 0) return undefined
    const schluss = n.slice(-24)
    const endePos = flach.indexOf(schluss, Math.max(anfang, anfang + n.length - schluss.length - 40))
    const letzte = endePos >= 0 ? endePos + schluss.length - 1 : anfang + Math.min(n.length, 24) - 1
    const von = Number(starts[herkunft[anfang]])
    const bis = Number(enden[herkunft[Math.min(letzte, herkunft.length - 1)]])
    if (!Number.isFinite(von) || !Number.isFinite(bis)) return undefined
    out.push({ von, bis: Math.max(von, bis) })
    ab = letzte + 1
  }
  return out
}
