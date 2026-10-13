/**
 * App „Grammatikformen" (12.10.2026, Wunsch der Lehrkraft) – Logik ohne React.
 *
 * Je Lehrwerk-Band: Units (Kapitel) → Abschnitte (Stationen; '' = ganzes Kapitel) → Grammatikpunkte mit Katalog-
 * Kennungen (Themen „en.verb.past_simple" bzw. Teilformen „en.verb.past_simple/fragen", didactics/grammarTopics.ts +
 * grammatikRecherche.json). Gespeichert wird die GANZE Grammatik eines Bands (main/services/storage/lehrwerkGrammatik.ts),
 * sie überlagert die eingebaute Liste (shared/lehrwerkGrammatik.ts).
 *
 * KI-Vorschläge aus Schulbuchseiten: Die KI liefert „Abschnitt → Form (Kennung) + Fundstelle"; hier werden sie gegen das
 * Buch und den Katalog geprüft. Unbekannte Kennungen fallen weg, Units/Abschnitte, die das Buch nicht hat, werden
 * markiert, schon Vorhandenes ist nicht angehakt. Übernommen wird nur Angehaktes und nur DAZU – bestehende Einträge
 * werden nie still überschrieben.
 */
import { GRAMMAR_TOPICS } from '../arbeitsblatt/didactics/grammar'
import type { GrammarTopic } from '../arbeitsblatt/didactics/grammar'
import { ABSCHNITT_FOLGE, type LehrwerkGrammatikBand, type LehrwerkGrammatikPunkt } from '../../shared/lehrwerkGrammatik'

/** Units und Abschnitte eines Lehrwerks (TextbookMeta) */
export interface BuchGliederung {
  units: { name: string; sections: { name: string }[] }[]
}

const themaVon = (k: string): string => k.split('/')[0]

/** Thema einer Kennung (auch zu einer Teilform) */
export function themaZu(kennung: string): GrammarTopic | undefined {
  const id = themaVon(kennung)
  return GRAMMAR_TOPICS.find((t) => t.id === id)
}

/** Lesbare Bezeichnung einer Kennung („Simple past: Fragen"); unbekannt: die Kennung selbst */
export function kennungLabel(kennung: string): string {
  const t = themaZu(kennung)
  if (!t) return kennung
  const teil = kennung.includes('/') ? t.teilformen?.find((x) => x.id === kennung.split('/')[1]) : undefined
  return teil ? `${t.label}: ${teil.label}` : t.label
}

/** Gibt es die Kennung im Katalog (Thema bzw. Teilform des Themas)? */
export function kennungGueltig(kennung: string, fach?: string): boolean {
  const t = themaZu(kennung)
  if (!t || (fach && t.subject !== fach)) return false
  if (!kennung.includes('/')) return true
  return Boolean(t.teilformen?.some((x) => x.id === kennung.split('/')[1]))
}

/** Katalog eines Fachs als knappe Liste für die KI (Thema, darunter seine Teilformen) */
export function katalogFuerKi(fach: string, grenze = 60000): string {
  const zeilen: string[] = []
  for (const t of GRAMMAR_TOPICS.filter((x) => x.subject === fach)) {
    zeilen.push(`${t.id} — ${t.label}${t.term && t.term !== t.label ? ` (${t.term})` : ''}`)
    for (const teil of t.teilformen ?? []) zeilen.push(`  ${t.id}/${teil.id} — ${teil.label}`)
  }
  const text = zeilen.join('\n')
  return text.length > grenze ? text.slice(0, grenze) : text
}

/** Abschnitte einer Unit in Buchreihenfolge, vorne '' (ganzes Kapitel) */
export function abschnitteDer(buch: BuchGliederung, unit: string, kapitel?: Record<string, LehrwerkGrammatikPunkt[]>): string[] {
  const ausBuch = buch.units.find((u) => u.name === unit)?.sections.map((s) => s.name) ?? []
  const nurGrammatik = Object.keys(kapitel ?? {}).filter((s) => s && !ausBuch.includes(s))
  return ['', ...ausBuch, ...nurGrammatik.sort((a, b) => ABSCHNITT_FOLGE.indexOf(a) - ABSCHNITT_FOLGE.indexOf(b))]
}

/**
 * Kapitel in Buchreihenfolge ordnen (die Reihenfolge der Schlüssel IST die Reihenfolge im Band – bekannteGrammatik),
 * leere Abschnitte und leere Kapitel entfernen. Kapitel, die das Buch nicht kennt, bleiben dahinter erhalten.
 */
export function ordneBand(band: LehrwerkGrammatikBand, buch: BuchGliederung): LehrwerkGrammatikBand {
  const out: LehrwerkGrammatikBand = {}
  const unitNamen = [...buch.units.map((u) => u.name), ...Object.keys(band).filter((k) => !buch.units.some((u) => u.name === k))]
  for (const u of unitNamen) {
    const k = band[u]
    if (!k) continue
    const stationen: Record<string, LehrwerkGrammatikPunkt[]> = {}
    for (const s of abschnitteDer(buch, u, k)) if (k[s]?.length) stationen[s] = k[s].map(saeubere)
    if (Object.keys(stationen).length) out[u] = stationen
  }
  return out
}

/** Punkt ohne leere Felder */
function saeubere(p: LehrwerkGrammatikPunkt): LehrwerkGrammatikPunkt {
  const t = [...new Set(p.t.map((x) => x.trim()).filter(Boolean))]
  return p.w ? { text: p.text.trim(), t, w: true } : { text: p.text.trim(), t }
}

/** Punkt in einem Abschnitt verschieben (-1 = nach oben, +1 = nach unten) */
export function verschiebe(liste: LehrwerkGrammatikPunkt[], i: number, richtung: -1 | 1): LehrwerkGrammatikPunkt[] {
  const j = i + richtung
  if (i < 0 || j < 0 || i >= liste.length || j >= liste.length) return liste
  const neu = [...liste]
  ;[neu[i], neu[j]] = [neu[j], neu[i]]
  return neu
}

/** Punkt per Ziehen an eine neue Stelle (Index in der Liste vor dem Verschieben) */
export function verschiebeNach(liste: LehrwerkGrammatikPunkt[], von: number, nach: number): LehrwerkGrammatikPunkt[] {
  if (von < 0 || von >= liste.length || nach < 0 || nach >= liste.length || von === nach) return liste
  const neu = [...liste]
  const [p] = neu.splice(von, 1)
  neu.splice(nach, 0, p)
  return neu
}

/**
 * Darstellung eines Punkts als Pille (12.10.2026, Neugestaltung): Bezeichnung = Buchtext; ist er leer oder gleich dem
 * Katalognamen, der Katalogname. `abweichend` = der Buchtext nennt die Form anders (Katalogname dann nur im Tooltip).
 * `status`: ok = alle Kennungen gültig, fehlt = keine Katalogform, ungueltig = mindestens eine unbekannte Kennung.
 */
export function pillenInfo(
  p: LehrwerkGrammatikPunkt,
  fach?: string
): { name: string; katalog: string; abweichend: boolean; status: 'ok' | 'fehlt' | 'ungueltig'; ungueltig: string[] } {
  const katalog = p.t.map(kennungLabel).join(' · ')
  const text = p.text.trim()
  const gleich = !text || (p.t.length > 0 && (text === textZu(p.t) || text === katalog))
  const ungueltig = p.t.filter((k) => !kennungGueltig(k, fach))
  return {
    name: gleich ? katalog || text || '(ohne Bezeichnung)' : text,
    katalog,
    abweichend: !gleich && p.t.length > 0,
    status: !p.t.length ? 'fehlt' : ungueltig.length ? 'ungueltig' : 'ok',
    ungueltig
  }
}

/** Text zu gewählten Kennungen (Bezeichnungen der Themen, Teilformen ohne doppeltes Thema) */
export function textZu(kennungen: string[]): string {
  const themen = [...new Set(kennungen.map(themaVon))]
  return themen
    .map((id) => {
      const t = themaZu(id)
      const teile = kennungen.filter((k) => k.startsWith(`${id}/`)).map((k) => t?.teilformen?.find((x) => x.id === k.split('/')[1])?.label)
      return t ? (teile.length && teile.every(Boolean) ? `${t.label} (${teile.join(', ')})` : t.label) : id
    })
    .join('; ')
}

// ---------------------------------------------------------------- KI-Vorschläge

export const VORSCHLAG_SCHEMA = {
  type: 'object',
  properties: {
    vorschlaege: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          unit: { type: 'string' },
          abschnitt: { type: 'string' },
          text: { type: 'string' },
          kennungen: { type: 'array', items: { type: 'string' } },
          fundstelle: { type: 'string' }
        },
        required: ['unit', 'abschnitt', 'text', 'kennungen', 'fundstelle'],
        additionalProperties: false
      }
    }
  },
  required: ['vorschlaege'],
  additionalProperties: false
}

export interface Vorschlag {
  /** laufende Nummer (Schlüssel in der Liste) */
  nr: number
  unit: string
  abschnitt: string
  text: string
  t: string[]
  /** z. B. „S. 34, Grammar box" */
  fundstelle: string
  /** von der KI genannte, aber unbekannte Kennungen (nur als Hinweis) */
  verworfen: string[]
  /** neu = übernehmbar; vorhanden = steht schon so da; unklar = Unit/Abschnitt fehlt im Buch oder keine gültige Kennung */
  status: 'neu' | 'vorhanden' | 'unklar'
  gewaehlt: boolean
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '')

/** Unit/Abschnitt des Buchs zu einer Angabe der KI (Groß-/Kleinschreibung, Satzzeichen egal) */
function findeUnit(buch: BuchGliederung, unit: string): string | undefined {
  const n = norm(unit)
  return buch.units.find((u) => norm(u.name) === n)?.name
}
function findeAbschnitt(buch: BuchGliederung, unit: string, abschnitt: string): string | undefined {
  const n = norm(abschnitt)
  const genau = buch.units.find((u) => u.name === unit)?.sections.find((s) => norm(s.name) === n)?.name
  if (genau !== undefined) return genau
  // „ganze Unit", „gesamtes Kapitel" … = das ganze Kapitel
  return !n || /^(ganz|gesamt|alle|kapitel)/.test(n) || n === norm(unit) ? '' : undefined
}

/**
 * Antwort der KI prüfen: Kennungen gegen den Katalog des Fachs, Unit/Abschnitt gegen das Buch, Doppeltes gegen den
 * aktuellen Stand. Angehakt ist nur, was neu ist und sicher passt.
 */
export function pruefeVorschlaege(roh: unknown, buch: BuchGliederung, band: LehrwerkGrammatikBand, fach: string): Vorschlag[] {
  const liste = (roh as { vorschlaege?: unknown })?.vorschlaege
  if (!Array.isArray(liste)) return []
  const out: Vorschlag[] = []
  for (const [nr, v] of liste.slice(0, 200).entries()) {
    if (!v || typeof v !== 'object') continue
    const x = v as Record<string, unknown>
    const kennungen = Array.isArray(x.kennungen) ? x.kennungen.filter((k): k is string => typeof k === 'string').map((k) => k.trim()) : []
    const t = [...new Set(kennungen.filter((k) => kennungGueltig(k, fach)))]
    const verworfen = kennungen.filter((k) => k && !t.includes(k))
    const unit = findeUnit(buch, String(x.unit ?? ''))
    const abschnitt = unit !== undefined ? findeAbschnitt(buch, unit, String(x.abschnitt ?? '')) : undefined
    const text = String(x.text ?? '').trim() || textZu(t)
    const ort = unit !== undefined && abschnitt !== undefined
    const vorhanden = ort && t.length > 0 && (band[unit]?.[abschnitt] ?? []).some((p) => t.every((k) => p.t.includes(k)))
    const status: Vorschlag['status'] = !ort || !t.length ? 'unklar' : vorhanden ? 'vorhanden' : 'neu'
    out.push({
      nr,
      unit: unit ?? String(x.unit ?? '').trim(),
      abschnitt: abschnitt ?? String(x.abschnitt ?? '').trim(),
      text,
      t,
      fundstelle: String(x.fundstelle ?? '').trim(),
      verworfen,
      status,
      gewaehlt: status === 'neu'
    })
  }
  return out
}

/** Ist ein Vorschlag (auch nach Änderung durch die Lehrkraft) übernehmbar? */
export const uebernehmbar = (v: Vorschlag, buch: BuchGliederung): boolean =>
  v.t.length > 0 &&
  Boolean(v.text.trim()) &&
  buch.units.some((u) => u.name === v.unit && (v.abschnitt === '' || u.sections.some((s) => s.name === v.abschnitt)))

/**
 * Angehakte Vorschläge DAZU nehmen (nie ersetzen): am Ende des Abschnitts angehängt; was dort schon mit denselben
 * Kennungen steht, wird nicht doppelt eingetragen. Liefert den neuen Band und die Zahl der übernommenen Punkte.
 */
export function uebernimmVorschlaege(
  band: LehrwerkGrammatikBand,
  vorschlaege: Vorschlag[],
  buch: BuchGliederung
): { band: LehrwerkGrammatikBand; zahl: number } {
  const neu: LehrwerkGrammatikBand = JSON.parse(JSON.stringify(band)) as LehrwerkGrammatikBand
  let zahl = 0
  for (const v of vorschlaege) {
    if (!v.gewaehlt || !uebernehmbar(v, buch)) continue
    const liste = ((neu[v.unit] ??= {})[v.abschnitt] ??= [])
    if (liste.some((p) => v.t.every((k) => p.t.includes(k)) && p.t.length === v.t.length)) continue
    liste.push({ text: v.text.trim(), t: [...v.t] })
    zahl++
  }
  return { band: ordneBand(neu, buch), zahl }
}

/** Auftrag an die KI (System und Nutzer) – Buch, Gliederung, Katalog */
export function vorschlagAuftrag(buchName: string, buch: BuchGliederung, fach: string, fachName: string): { system: string; user: string } {
  const gliederung = buch.units.map((u) => `- ${u.name}: ${u.sections.map((s) => s.name).join(' | ') || '(keine Abschnitte)'}`).join('\n')
  return {
    system:
      'Du ordnest die Grammatik eines Schulbuchs (Lehrwerk für den Fremdsprachenunterricht) den Units und Abschnitten zu. Grundlage sind die hochgeladenen Seiten (Inhaltsverzeichnis, Grammatikanhang, Grammar boxes, Lernziele). Du nennst NUR, was auf den Seiten belegt ist – nichts raten, nichts aus dem Gedächtnis ergänzen.',
    user: [
      `Lehrwerk: ${buchName} (Fach ${fachName}).`,
      'Units und Abschnitte des Lehrwerks (nur diese Namen verwenden):',
      gliederung,
      '',
      'Je Grammatikpunkt ein Vorschlag:',
      '- "unit": genau ein Unit-Name aus der Liste oben;',
      '- "abschnitt": genau ein Abschnittsname dieser Unit; gilt der Punkt für die ganze Unit (z. B. Trailer, Welcome back), "".',
      '- "kennungen": passende Kennungen NUR aus dem Katalog unten (Teilform „thema/teilform", wenn sie genau passt, sonst das Thema); keine erfinden.',
      '- "text": kurze deutsche Bezeichnung wie im Buch (z. B. „simple past: Fragen mit did").',
      '- "fundstelle": wo es steht (Seite, Kasten, Abschnitt des Inhaltsverzeichnisses).',
      'Wiederholungen früher eingeführter Grammatik nur nennen, wenn das Buch sie ausdrücklich als Grammatik des Abschnitts ausweist.',
      '',
      `KATALOG ${fachName.toUpperCase()} (Kennung — Bezeichnung):`,
      katalogFuerKi(fach)
    ].join('\n')
  }
}

// ---------------------------------------------------------------- Aufgabenbank (13.10.2026, abgestimmt)

/**
 * Teilbereiche zu den Kennungen eines Grammatikpunkts: eine Teilform steht für sich; ein Thema zerfällt in seine
 * Teilformen (ohne Teilformen: das Thema selbst). Unbekannte Kennungen fallen weg. Reihenfolge wie im Katalog.
 */
export function teilbereicheVon(kennungen: readonly string[]): string[] {
  const aus: string[] = []
  for (const k of kennungen) {
    const t = themaZu(k)
    if (!t) continue
    if (k.includes('/')) aus.push(k)
    else if (t.teilformen?.length) aus.push(...t.teilformen.map((x) => `${t.id}/${x.id}`))
    else aus.push(t.id)
  }
  return [...new Set(aus)]
}

/** Kurzname eines Teilbereichs im Reiter („Fragen"); ohne Teilform der Name des Themas */
export function teilKurzname(kennung: string): string {
  const t = themaZu(kennung)
  if (!t) return kennung
  const teil = kennung.includes('/') ? t.teilformen?.find((x) => x.id === kennung.split('/')[1]) : undefined
  return teil?.label ?? t.label
}

/** Angaben des Katalogs zu einem Teilbereich für die KI (erkennen/bilden, Beispiele, typische Fehler) */
export function teilHinweise(kennung: string): string {
  const t = themaZu(kennung)
  if (!t) return ''
  const teil = kennung.includes('/') ? t.teilformen?.find((x) => x.id === kennung.split('/')[1]) : undefined
  return [
    `${t.label}${t.term && t.term !== t.label ? ` (${t.term})` : ''}${teil ? ` – Teilform: ${teil.label}${teil.term ? ` (${teil.term})` : ''}` : ''}`,
    teil?.nurErkennen ? 'Auf dieser Stufe nur erkennen – Bilden und Anwenden einfach halten.' : '',
    teil?.beispiele?.length ? `Beispiele: ${teil.beispiele.slice(0, 4).join('; ')}` : '',
    teil?.fehler ? `Typischer Fehler: ${teil.fehler}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

// ---------------------------------------------------------------- „Öffnen" aus der Auftragsleiste (13.10.2026)

/** Wohin „Öffnen" führt: Band, Unit, Abschnitt und der Grammatikpunkt (nach seinen Kennungen, sonst nach dem Namen) */
export interface GrammatikformenZiel {
  buchId: string
  unit: string
  abschnitt: string
  kennungen: string[]
  text: string
}
export const zielDocId = (z: GrammatikformenZiel): string => `gf:${encodeURIComponent(JSON.stringify(z))}`
export function zielAusDocId(docId: string): GrammatikformenZiel | null {
  if (!docId?.startsWith('gf:')) return null
  try {
    const z = JSON.parse(decodeURIComponent(docId.slice(3))) as Partial<GrammatikformenZiel>
    return typeof z.buchId === 'string' && typeof z.unit === 'string'
      ? {
          buchId: z.buchId,
          unit: z.unit,
          abschnitt: String(z.abschnitt ?? ''),
          kennungen: Array.isArray(z.kennungen) ? z.kennungen.map(String) : [],
          text: String(z.text ?? '')
        }
      : null
  } catch {
    return null
  }
}
/** Index des Zielpunkts in seinem Abschnitt (gleiche Kennungen, sonst gleicher Name); -1 = nicht mehr da */
export function zielIndex(punkte: readonly LehrwerkGrammatikPunkt[], z: Pick<GrammatikformenZiel, 'kennungen' | 'text'>): number {
  const gleich = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
  const i = z.kennungen.length ? punkte.findIndex((p) => gleich(p.t, z.kennungen)) : -1
  return i >= 0 ? i : punkte.findIndex((p) => p.text === z.text)
}
