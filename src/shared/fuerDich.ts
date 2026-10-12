/**
 * „Für dich" (12.10.2026, Förder- und Fordermaterial, Entscheidung der Lehrkraft): Je Kind bereitet die App ein Bündel
 * vor – Vokabeln und Grammatik zum Üben und Hinweise aus dem Feedback – als VORSCHLAG bei der Lehrkraft. Lernende sehen
 * Bündel und Einzel-Blätter erst nach der Freigabe, in ihrem Fachordner im Bereich „Für dich"; Mitschüler sehen nie, wer
 * welches Material hat (jede Person bekommt nur ihr eigenes). Bündel gelten befristet (Vorgabe 6 Wochen, Faustregel –
 * Gruppen „nur befristet, je Ziel", EEF) und verschwinden danach.
 *
 * Dazu der Förderplan-Baustein (Hessen-Mindestinhalt, R-HE: Ausgangslage positiv, 1–3 Ziele mit Indikator, Maßnahme,
 * Zeitraum; Niedersachsen: Einschätzung des Fördererfolgs, R-NI) – als Text zum Kopieren bzw. als Word-Abschnitt. Ein
 * Blatt ist eine MASSNAHME, kein Förderplan (den beschließt die Klassenkonferenz bzw. Klassenleitung).
 */
import { befundVon, type KindDaten } from './foerderGruppen'

export type BuendelStatus = 'vorschlag' | 'frei'

export interface BuendelInhalt {
  /** Fach (Anzeigename) – bestimmt den Fachordner der Lernenden */
  fach: string
  /** „Dein Ziel" */
  ziel: string
  woerter: { term: string; translation: string }[]
  grammatik: { titel: string; erklaerung?: string; beispiele?: string[] }[]
  hinweise: string[]
}

/** Gültigkeit eines Bündels in Tagen (Faustregel) */
export const BUENDEL_TAGE = 42
const TAG = 86_400_000

/** Sieht diese Person das Bündel? Nur die eigene Person, nur freigegeben, nur bis zum Ablauf */
export function buendelSichtbar(z: { status: string; schueler_id: string; ablauf: number }, ich: { id: string; rolle: string }, jetzt = Date.now()): boolean {
  return ich.rolle === 'schueler' && z.status === 'frei' && z.schueler_id === ich.id && z.ablauf > jetzt
}

/** Fachordner der Lernenden: Blätter „Für dich" (Einzel-Freigabe Förder/Forder) getrennt von den übrigen Arbeitsblättern */
export function fuerDichAufteilen<T extends { fuerDich?: boolean }>(blaetter: T[]): { fuerDich: T[]; andere: T[] } {
  return { fuerDich: blaetter.filter((b) => b.fuerDich === true), andere: blaetter.filter((b) => b.fuerDich !== true) }
}

const text = (x: unknown, n: number): string => (typeof x === 'string' ? x.trim().slice(0, n) : '')

/** Inhalt eines Bündels prüfen und begrenzen (was der Server speichert) */
export function buendelBereinigt(roh: unknown): BuendelInhalt | null {
  if (!roh || typeof roh !== 'object') return null
  const r = roh as Record<string, unknown>
  const ziel = text(r.ziel, 300)
  if (!ziel) return null
  const liste = (x: unknown): Record<string, unknown>[] =>
    Array.isArray(x) ? x.filter((y): y is Record<string, unknown> => Boolean(y) && typeof y === 'object') : []
  return {
    fach: text(r.fach, 60),
    ziel,
    woerter: liste(r.woerter)
      .map((w) => ({ term: text(w.term, 120), translation: text(w.translation, 200) }))
      .filter((w) => w.term)
      .slice(0, 20),
    grammatik: liste(r.grammatik)
      .map((g) => ({
        titel: text(g.titel, 160),
        ...(text(g.erklaerung, 1200) ? { erklaerung: text(g.erklaerung, 1200) } : {}),
        ...(Array.isArray(g.beispiele)
          ? {
              beispiele: (g.beispiele as unknown[])
                .map((b) => text(b, 300))
                .filter(Boolean)
                .slice(0, 4)
            }
          : {})
      }))
      .filter((g) => g.titel)
      .slice(0, 5),
    hinweise: (Array.isArray(r.hinweise) ? (r.hinweise as unknown[]) : [])
      .map((h) => text(h, 400))
      .filter(Boolean)
      .slice(0, 5)
  }
}

/** Bündel-Vorschlag aus den Lerndaten eines Kindes: wackelige Wörter, rote Grammatikregeln, nächste Schritte */
export function buendelAus(k: KindDaten, ziel: string, fach: string): BuendelInhalt {
  return {
    fach,
    ziel,
    woerter: (k.wackelig ?? []).slice(0, 12),
    grammatik: (k.grammatik ?? [])
      .filter((g) => g.ampel === 'schwaeche')
      .slice(0, 3)
      .map((g) => ({
        titel: g.titel,
        ...(g.erklaerung ? { erklaerung: g.erklaerung } : {}),
        ...(g.beispiele?.length ? { beispiele: g.beispiele.slice(0, 3) } : {})
      })),
    hinweise: (k.blaetter?.schritte ?? []).slice(0, 3)
  }
}

/** Hat das Bündel überhaupt Inhalt zum Üben? */
export const buendelHatInhalt = (b: BuendelInhalt): boolean => b.woerter.length + b.grammatik.length + b.hinweise.length > 0

/** Ablauf eines neuen Bündels (ms) */
export const buendelAblauf = (jetzt = Date.now(), tage = BUENDEL_TAGE): number => jetzt + tage * TAG

export interface FoerderplanAngaben {
  name: string
  klasse: string
  fach: string
  datum: Date
  kind: KindDaten
  art: 'foerder' | 'forder'
  ziel: string
  /** Titel des Blattes bzw. „Bündel Für dich" */
  massnahmen: string[]
  /** Überprüfung (Tage ab heute, Vorgabe 6 Wochen) */
  pruefenNachTagen?: number
  /** Ergebnis, sobald bekannt – sonst „offen" */
  ergebnis?: string
  bedarfName?: (id: string) => string
}

/**
 * Förderplan-Baustein als Text: Ausgangslage (positiv – Stärken zuerst, dann der nächste Schritt), Ziel mit Indikator,
 * Maßnahme, Zeitraum, Ergebnis. Nur für die Lehrkraft (enthält den Namen, geht nie an eine KI).
 */
export function foerderplanText(a: FoerderplanAngaben): string {
  const b = befundVon(a.kind, a.bedarfName)
  const d = (x: Date): string => x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  // Kalendertage (nicht Millisekunden) – sonst verschiebt die Zeitumstellung das Datum um einen Tag
  const pruefen = new Date(a.datum.getFullYear(), a.datum.getMonth(), a.datum.getDate() + (a.pruefenNachTagen ?? BUENDEL_TAGE))
  const staerken = b.staerken.length ? `${a.name.split(' ')[0]} ${b.staerken.join('; ')}.` : 'Stärken: (bitte ergänzen)'
  const naechster = b.schwerpunkte.length
    ? `Nächster Lernschritt: ${b.schwerpunkte
        .slice(0, 2)
        .map((s) => s.text)
        .join('; ')}.`
    : a.art === 'forder'
    ? 'Nächster Lernschritt: Vertiefung und Transfer (sicherer Stand).'
    : 'Nächster Lernschritt: Grundlagen sichern.'
  return [
    `Förderplan-Baustein – ${a.name}, ${a.klasse}, ${a.fach} (${d(a.datum)})`,
    `Ausgangslage: ${staerken} ${naechster}`,
    `Datengrundlage: ${b.zeilen.join('; ')}.`,
    `Ziel (${a.art === 'forder' ? 'Fordern' : 'Fördern'}): ${a.ziel}`,
    `Indikator: Die Aufgaben zum Ziel gelingen ohne bzw. mit höchstens der ersten Hilfe${a.art === 'forder' ? ' und die Lösungswege sind begründet' : ''}.`,
    `Maßnahme: ${a.massnahmen.join('; ')}.`,
    `Zeitraum: ${d(a.datum)} bis ${d(pruefen)} (Überprüfung).`,
    `Ergebnis: ${a.ergebnis?.trim() || 'offen'}`,
    'Hinweis: Material ist eine Maßnahme, kein Förderplan; über den Förderplan entscheidet die Schule (Klassenkonferenz bzw. Klassenleitung).'
  ].join('\n')
}

/** Derselbe Baustein als einfaches HTML (Word öffnet es als Abschnitt) */
export function foerderplanHtml(texte: string[]): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const abschnitt = (t: string): string => {
    const [kopf, ...rest] = t.split('\n')
    return `<h2>${esc(kopf)}</h2>${rest
      .map((z) => {
        const i = z.indexOf(':')
        return i > 0 ? `<p><b>${esc(z.slice(0, i))}:</b>${esc(z.slice(i + 1))}</p>` : `<p>${esc(z)}</p>`
      })
      .join('')}`
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Förderplan-Bausteine</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h2{font-size:13pt;margin:18pt 0 6pt}p{margin:0 0 4pt}</style></head><body>${texte
    .map(abschnitt)
    .join('')}</body></html>`
}
