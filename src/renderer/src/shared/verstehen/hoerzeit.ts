/**
 * Zeitangaben rund um einen Hörtext – geschätzt oder aus der echten Aufnahme (01.10.2026).
 *
 * Wunsch der Lehrkraft: Sobald die Aufnahme da ist, müssen ALLE Zeitangaben zu ihr passen –
 * die Spieldauer überall, wo sie steht, die Bearbeitungszeit des Hörteils und die Zeitmarken
 * („ab 1:45") in Transkript und Erwartungshorizont. Vorher sind es Schätzungen nach Wörtern je
 * Minute, gekennzeichnet mit „ca.".
 *
 * Die Messung selbst geschieht beim Vertonen (`shared/vertonung.ts`): Jede Sprecherzeile hat
 * dann ihren gemessenen Beginn. Ändert sich das Skript danach, passt die Aufnahme nicht mehr –
 * erkannt am Fingerabdruck des vertonten Skripts. Dann gelten wieder Schätzungen, bis neu
 * vertont ist.
 *
 * Ohne Oberfläche prüfbar (tests/hoerzeit.test.ts).
 */
import { textSchluessel } from '@shared/vertonung'
import { STOPPWOERTER } from '@shared/stoppwoerter'
import type { Answer, AudioBlock, TaskBlock, WsBlock } from '../../modules/arbeitsblatt/model/types'
import type { Hoerablauf } from '../../modules/arbeitsblatt/didactics/hoerablauf'

/** Wörter je Minute, wenn das Niveau nichts anderes sagt (deutlich artikulierte Standardsprache) */
export const WPM_STANDARD = 130

/** Sprecherzeilen „Name: Text" aus dem Skript lesen; ohne Namen gilt der erste Sprecher. */
export function scriptTurns(block: Pick<AudioBlock, 'transcript'>): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []
  for (const line of block.transcript.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = /^([\p{Lu}][\p{L}\s.'-]{0,24}):\s*(.+)$/u.exec(trimmed)
    if (m) out.push({ name: m[1].trim(), text: m[2].trim() })
    else if (out.length) out[out.length - 1].text += ` ${trimmed}`
    else out.push({ name: '', text: trimmed })
  }
  return out
}

/** Fingerabdruck eines Skripts – steht beim Vertonen in `audio.skript`. */
export const skriptFingerabdruck = (transcript: string): string => textSchluessel(transcript)

const woerter = (s: string): number => s.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length

/** Geschätzte Spieldauer nach Wörtern je Minute */
export function schaetzeSekunden(transcript: string, wpm = WPM_STANDARD): number {
  return Math.round((woerter(transcript) / Math.max(40, wpm)) * 60)
}

/** Passt die Aufnahme nicht mehr zum Skript? (Nur bei eigener Vertonung – ein Original bleibt maßgeblich.) */
export function aufnahmeVeraltet(block: AudioBlock): boolean {
  if (!block.audio?.fileName && !block.audio?.dataUrl) return false
  if (block.origin === 'archiv' || !block.audio.skript) return false
  return block.audio.skript !== skriptFingerabdruck(block.transcript)
}

export interface Hoerzeit {
  sekunden: number
  /** true = aus der Aufnahme gemessen */
  echt: boolean
  /** Aufnahme vorhanden, passt aber nicht mehr zum Skript */
  veraltet: boolean
  /** Beginn jeder Sprecherzeile in Sekunden */
  marken: number[]
  /** true = Zeitmarken gemessen (sonst nach Wörtern verteilt) */
  markenEcht: boolean
}

function verteilt(texte: string[], sekunden: number): number[] {
  const w = texte.map((t) => Math.max(1, woerter(t)))
  const summe = w.reduce((a, b) => a + b, 0)
  let t = 0
  return w.map((n) => {
    const m = t
    t += (n / summe) * sekunden
    return m
  })
}

/**
 * Spieldauer und Zeitmarken eines Hörtextes. `wpm` = Sprechtempo des Niveaus für die Schätzung.
 */
export function hoerzeit(block: AudioBlock, wpm = WPM_STANDARD): Hoerzeit {
  const turns = scriptTurns(block)
  const texte = turns.map((t) => t.text)
  const veraltet = aufnahmeVeraltet(block)
  const gemessen = block.audio?.sekunden
  if (gemessen && gemessen > 0 && !veraltet) {
    const m = block.audio?.zeitmarken
    const passt = Array.isArray(m) && m.length === turns.length
    return { sekunden: gemessen, echt: true, veraltet: false, marken: passt ? m : verteilt(texte, gemessen), markenEcht: passt }
  }
  // Eingebundene Originalaufnahme: Dauer beim Einbinden gemessen (`seconds`)
  if (block.origin === 'archiv' && (block.audio?.dataUrl || block.audio?.fileName) && block.seconds > 0)
    return { sekunden: block.seconds, echt: true, veraltet: false, marken: verteilt(texte, block.seconds), markenEcht: false }
  const sekunden = schaetzeSekunden(block.transcript, wpm) || block.seconds || 0
  return { sekunden, echt: false, veraltet, marken: verteilt(texte, sekunden), markenEcht: false }
}

/** „3:20" */
export function minSek(sekunden: number): string {
  const s = Math.max(0, Math.round(sekunden))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** „3:20 min" aus der Aufnahme, „ca. 3:20 min" geschätzt */
export function dauerAngabe(h: Pick<Hoerzeit, 'sekunden' | 'echt'>): string {
  return `${h.echt ? '' : 'ca. '}${minSek(h.sekunden)} min`
}

/** Zeitmarke „ab 1:45" (geschätzt „ab ca. 1:45") */
export function abMarke(sekunden: number, echt: boolean): string {
  return `ab ${echt ? '' : 'ca. '}${minSek(sekunden)}`
}

/**
 * Bearbeitungszeit eines Hörteils in Sekunden: je Text Einlesezeit, alle Durchgänge, die Pausen
 * dazwischen und die Zeit zum Fertigschreiben; zwischen den Texten die kurze Pause.
 */
export function hoerBearbeitungszeit(texte: { sekunden: number; plays: number }[], a: Hoerablauf): number {
  if (!texte.length) return 0
  const je = texte.map((t) => {
    const plays = Math.max(1, Math.round(t.plays || 1))
    return a.einlesen + plays * t.sekunden + (plays - 1) * a.zwischen + a.nachbearbeiten
  })
  return je.reduce((x, y) => x + y, 0) + (texte.length - 1) * a.zwischenTexten
}

/** Bearbeitungszeit in ganzen Minuten (aufgerundet – niemand soll mitten im Hören abgeben) */
export const hoerMinuten = (sekunden: number): number => Math.max(1, Math.ceil(sekunden / 60))

/** Ablauf als Zeile für die Lehrkraft, z. B. „1:00 Einlesezeit · 2 × 3:20 Hören · 1:00 Pause · 1:00 Nachbearbeitung = 9 Min." */
export function ablaufZeile(h: Pick<Hoerzeit, 'sekunden' | 'echt'>, plays: number, a: Hoerablauf): string {
  const n = Math.max(1, Math.round(plays || 1))
  const teile = [
    `${minSek(a.einlesen)} Einlesezeit`,
    `${n} × ${minSek(h.sekunden)} Hören`,
    n > 1 ? `${minSek(a.zwischen)} Pause${n > 2 ? 'n' : ''}` : '',
    `${minSek(a.nachbearbeiten)} Nachbearbeitung`
  ].filter(Boolean)
  const gesamt = hoerMinuten(hoerBearbeitungszeit([{ sekunden: h.sekunden, plays: n }], a))
  return `${teile.join(' · ')} = ${h.echt ? '' : 'ca. '}${gesamt} Min.`
}

const BEZUG = /hör|dauer|lang|länge|aufnahme|audio|text|listen|record|lasts|long|écout|enregistr|durée|escuch|grabaci|duraci|ascolt|durata/i
const DAUER = /(\b(?:ca\.|circa|etwa|ungefähr|rund|about|approximately|approx\.|around|environ|aproximadamente|unos|circa)\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(Minuten|Minute|Min\.|min\.?|minutes?|mins?\.?|minutos?|minuti)(?!\p{L})/giu

/**
 * Längenangaben eines Hörtextes in einem Text auf die neue Dauer bringen – etwa „Der Hörtext
 * dauert ca. 3 Minuten" in der Arbeitsanweisung. Geändert wird nur, was erkennbar die Länge
 * DIESES Hörtextes meint: ein Bezugswort in der Nähe und ein Wert nahe der bisherigen Dauer.
 * Aus der Aufnahme gemessen fällt das „ca." weg; geschätzt bleibt die Angabe ungefähr.
 */
export function ersetzeDauerangaben(text: string, altSekunden: number, neu: Pick<Hoerzeit, 'sekunden' | 'echt'>): string {
  if (!text || !altSekunden || Math.round(altSekunden) === Math.round(neu.sekunden) || !/\d/.test(text)) return text
  return text.replace(DAUER, (ganz, vor: string | undefined, min: string, sek: string | undefined, einheit: string, pos: number, alles: string) => {
    const wert = Number(min) * 60 + (sek ? Number(sek) : 0)
    if (Math.abs(wert - altSekunden) > Math.max(20, altSekunden * 0.25)) return ganz
    const umfeld = alles.slice(Math.max(0, pos - 80), pos) + alles.slice(pos + ganz.length, pos + ganz.length + 30)
    if (!BEZUG.test(umfeld)) return ganz
    const praefix = neu.echt ? '' : (vor ?? '')
    return `${praefix}${minSek(neu.sekunden)} ${einheit}`
  })
}

const STOPP = new Set(Object.values(STOPPWOERTER).flat())
const marken = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/\[\[|\]\]/g, ' ')
      .split(/[^\p{L}\p{N}']+/u)
      .filter((w) => w.length >= 3 && !STOPP.has(w))
  )

/**
 * Die Sprecherzeile, in der ein Item seine Antwort findet (-1 = keine eindeutige). Treffer der
 * Antwort gehen vor, Wörter des Stamms entscheiden nur bei Gleichstand – sonst gewänne bei „Why is Anna tired?" die
 * Zeile „You look tired" statt der mit dem Grund.
 */
export function fundZeile(item: { antwort: string; stamm?: string }, turns: { text: string }[]): number {
  const antwort = marken(item.antwort)
  const stamm = marken(item.stamm ?? '')
  if (!antwort.size && !stamm.size) return -1
  let best = -1
  let bestWert = 0
  turns.forEach((t, i) => {
    const da = marken(t.text)
    let n = 0
    for (const w of antwort) if (da.has(w)) n += 100
    for (const w of stamm) if (da.has(w) && !antwort.has(w)) n += 1
    if (n > bestWert) {
      best = i
      bestWert = n
    }
  })
  return bestWert >= 1 ? best : -1
}

type ItemText = { label?: string; antwort: string; stamm?: string }

/** Texte, an denen sich die Antwort eines Items im Skript wiedererkennen lässt */
function itemTexte(answer: Answer, stamm: string, loesung: string): ItemText[] {
  switch (answer.kind) {
    case 'trueFalse':
      return answer.statements.map((s, i) => ({ label: `${i + 1}`, antwort: s.text }))
    case 'multipleChoice':
      return [{ antwort: answer.correct.map((k) => answer.options[k] ?? '').join(' '), stamm }]
    case 'gapText': {
      // Je Lücke die Lösung, dazu der Satz um sie herum
      const saetze = answer.gapText.split(/(?<=[.!?])\s+/)
      const out: ItemText[] = []
      for (const satz of saetze) for (const m of satz.matchAll(/\[\[([^\]]+)\]\]/g)) out.push({ label: `${out.length + 1}`, antwort: m[1], stamm: satz })
      return out
    }
    case 'matching':
      return answer.left.map((l, i) => ({ label: `${i + 1}`, antwort: answer.right[answer.pairs[i]] ?? '', stamm: l }))
    case 'tableFill':
      return answer.solutionRows.map((r, i) => ({ label: `${i + 1}`, antwort: r.join(' '), stamm: (answer.rows[i] ?? []).join(' ') }))
    default:
      return [{ antwort: loesung, stamm }]
  }
}

const BUCHSTABEN = 'abcdefghijklmnopqrstuvwxyz'

/**
 * Fundstellen der Items einer Hörverstehensaufgabe im Hörtext – für den Erwartungshorizont:
 * „a) ab 0:45 · b) ab 1:12". Leer, wenn sich keine Stelle eindeutig zuordnen lässt.
 */
export function fundstellen(task: TaskBlock, audio: AudioBlock, h: Hoerzeit): string[] {
  const turns = scriptTurns(audio)
  if (!turns.length) return []
  const items: ItemText[] = task.parts.length
    ? task.parts.map((p, i) => {
        const teile = itemTexte(p.answer, p.instruction, p.solution)
        return { label: BUCHSTABEN[i] ?? `${i + 1}`, antwort: teile.map((x) => x.antwort).join(' '), stamm: teile.map((x) => x.stamm ?? '').join(' ') }
      })
    : itemTexte(task.answer, task.instruction, task.solution)
  const out: string[] = []
  for (const it of items) {
    const z = fundZeile(it, turns)
    if (z < 0 || h.marken[z] === undefined) continue
    out.push(`${it.label ? `${it.label}) ` : ''}${abMarke(h.marken[z], h.markenEcht)}`)
  }
  return out
}

/**
 * Der Hörtext, zu dem eine Aufgabe gehört: über `audioId`, sonst der letzte Hörtext davor –
 * aber nur bei Aufgaben zum Hörverstehen.
 */
export function hoertextZu(task: TaskBlock, bloecke: WsBlock[]): AudioBlock | undefined {
  if (task.audioId) {
    const a = bloecke.find((b) => b.id === task.audioId)
    if (a?.type === 'audio') return a
  }
  if (task.skill && task.skill !== 'listening') return undefined
  let letzter: AudioBlock | undefined
  for (const b of bloecke) {
    if (b.id === task.id) return task.skill === 'listening' ? letzter : undefined
    if (b.type === 'audio') letzter = b
  }
  return undefined
}
