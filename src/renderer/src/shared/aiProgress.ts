/**
 * Fortschritt einer KI-Anfrage sichtbar machen.
 *
 * Eine Anfrage liefert ihr Ergebnis erst ganz am Ende – der Balken stand deshalb still und
 * wirkte eingefroren. Die Anbieter senden ihre Antwort aber im Strom. Wir zählen die
 * eingetroffenen Zeichen und setzen sie ins Verhältnis zu dem, was eine Antwort dieser Art
 * erfahrungsgemäß lang ist.
 *
 * Diese Erfahrung entsteht im Betrieb: Zu jeder Auftragsart (dem `schemaName`) merkt sich die
 * App die Länge der letzten Antworten und rechnet mit deren Mittelwert. Beim allerersten Mal
 * gilt eine grobe Schätzung; danach wird es von Lauf zu Lauf genauer.
 */

const STORE_KEY = 'schul-apps-antwortlaengen'
/** So viele Läufe je Auftragsart fließen in den Mittelwert ein */
const HISTORY = 8
/** Schätzung, solange nichts gemessen wurde (Zeichen) */
const DEFAULT_CHARS = 6000

type History = Record<string, number[]>

function readHistory(): History {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as History) : {}
  } catch {
    return {}
  }
}

/** Erwartete Antwortlänge einer Auftragsart in Zeichen. */
export function expectedChars(kind: string): number {
  const runs = readHistory()[kind]
  if (!runs?.length) return DEFAULT_CHARS
  return Math.max(500, Math.round(runs.reduce((a, b) => a + b, 0) / runs.length))
}

/** Merkt sich die tatsächliche Länge einer fertigen Antwort. */
export function rememberLength(kind: string, chars: number): void {
  if (chars < 200) return
  try {
    const all = readHistory()
    all[kind] = [...(all[kind] ?? []), chars].slice(-HISTORY)
    localStorage.setItem(STORE_KEY, JSON.stringify(all))
  } catch {
    // Ohne Verlauf bleibt die Schätzung grob – kein Grund, die Erstellung abzubrechen
  }
}

let counter = 0

export interface RequestProgress {
  /** Anteil dieser einen Anfrage, 0 bis 1 */
  ratio: number
  chars: number
}

/**
 * Verfolgt die laufenden Anfragen und meldet ihren Anteil.
 *
 * Der Anteil wächst nur und bleibt unter 1, solange die Antwort nicht da ist: Ein Balken, der
 * zurückspringt oder zu früh voll ist, ist schlimmer als einer, der still steht.
 */
export class AiProgressTracker {
  private chars = new Map<string, number>()
  private kinds = new Map<string, string>()
  private stop?: () => void

  constructor(private onChange?: () => void) {
    this.stop = window.api.ai.onProgress(({ id, chars }) => {
      if (!this.kinds.has(id)) return
      this.chars.set(id, Math.max(this.chars.get(id) ?? 0, chars))
      this.onChange?.()
    })
  }

  /** Meldet eine neue Anfrage an und liefert deren Kennung für `progressId`. */
  begin(kind: string): string {
    const id = `p${++counter}-${Date.now()}`
    this.kinds.set(id, kind)
    this.chars.set(id, 0)
    return id
  }

  /**
   * Schließt eine Anfrage ab und merkt sich ihre Länge für die nächste Schätzung.
   * Eine abgebrochene oder gescheiterte Antwort ist unvollständig (`merken = false`) – sie
   * würde die Erwartung für die nächste Anfrage dieser Art verfälschen.
   */
  end(id: string, merken = true): void {
    const kind = this.kinds.get(id)
    const chars = this.chars.get(id) ?? 0
    if (kind && merken) rememberLength(kind, chars)
    this.kinds.delete(id)
    this.chars.delete(id)
    this.onChange?.()
  }

  /** Anteil aller laufenden Anfragen zusammen (0 bis 1). */
  ratio(): number {
    const ids = [...this.kinds.keys()]
    if (!ids.length) return 0
    const sum = ids.reduce((acc, id) => acc + Math.min(0.97, (this.chars.get(id) ?? 0) / expectedChars(this.kinds.get(id)!)), 0)
    return sum / ids.length
  }

  dispose(): void {
    this.stop?.()
    this.kinds.clear()
    this.chars.clear()
  }
}

/**
 * Gesamtfortschritt aus abgeschlossenen Schritten und dem Anteil des laufenden Schrittes.
 * Beispiel: 2 von 4 Schritten fertig, der dritte zu 60 % → 0,65.
 */
export function overallRatio(done: number, total: number, current: number): number {
  if (total <= 0) return 0
  return Math.min(0.99, (done + Math.min(1, Math.max(0, current))) / total)
}

/**
 * Geschätzte Restzeit in Sekunden.
 * Erst ab einem Zehntel Fortschritt, sonst wären die Zahlen Zufall.
 */
export function remainingSeconds(ratio: number, elapsedMs: number): number | null {
  if (ratio < 0.1 || elapsedMs < 3000) return null
  const total = elapsedMs / ratio
  return Math.max(5, Math.round((total - elapsedMs) / 1000))
}

/** „noch etwa 1:40 Min." */
export function remainingLabel(seconds: number | null): string {
  if (seconds === null) return ''
  if (seconds < 60) return `noch etwa ${seconds} Sek.`
  return `noch etwa ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} Min.`
}

/**
 * Umhüllt den KI-Aufruf so, dass jede Anfrage ihren Fortschritt meldet.
 * Die Auftragsart ist der `schemaName` – so lernt die App je Aufgabenart eine eigene Erwartung.
 */
export function trackingAiCall<Req extends { schemaName: string }, R>(tracker: AiProgressTracker, call: (req: Req) => Promise<R>) {
  return async (req: Req): Promise<R> => {
    const id = tracker.begin(req.schemaName)
    try {
      return await call({ ...req, progressId: id })
    } finally {
      tracker.end(id)
    }
  }
}

/**
 * Fortschritt über mehrere Abschnitte eines Laufs.
 *
 * Das Erstellen eines Arbeitsblatts besteht aus zwei Abschnitten mit eigener Zählung:
 * Ausformulieren und Fertigstellen (Bilder, Quellen, Tafelbild). Ohne gemeinsamen Maßstab
 * sprang der Balken beim Übergang zurück – der zweite Abschnitt begann wieder bei null.
 *
 * Die Gewichte sind eine Faustregel aus dem beobachteten Zeitverhältnis, keine Messung.
 */
export const RUN_PHASES = { formulate: 0.7, finish: 0.3 } as const

export type RunPhase = keyof typeof RUN_PHASES

/** Anteil am Gesamtlauf für einen Abschnitt. */
export function phaseRatio(phase: RunPhase, done: number, total: number, chunk = 0): number {
  const before = phase === 'finish' ? RUN_PHASES.formulate : 0
  const inner = total > 0 ? Math.min(1, (done + Math.min(1, Math.max(0, chunk))) / total) : 0
  return Math.min(0.99, before + inner * RUN_PHASES[phase])
}

/**
 * Lässt den Balken nie zurücklaufen.
 * Ein zurückspringender Balken liest sich wie ein Fehler, auch wenn alles in Ordnung ist.
 */
export const neverBackwards = (previous: number, next: number): number => Math.max(previous, next)
