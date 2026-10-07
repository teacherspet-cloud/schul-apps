/**
 * Warten bei Begrenzungen der Dienste (06.10.2026, Wunsch der Lehrkraft): Medienaufträge der Vokabellisten
 * (Beispielbilder, Aussprache, Satz-Aussprache) laufen oft über Hunderte Wörter. Meldet ein Dienst „zu viele
 * Anfragen" (HTTP 429), ein ausgeschöpftes Kontingent oder die Nutzungsgrenze des KI-Abos, bricht der Auftrag
 * nicht ab, sondern wartet sichtbar in der Auftragsleiste („wartet bis 14:35") und macht danach weiter.
 *
 * Die Wartezeit kommt – wo der Dienst sie nennt – aus seiner Angabe (Retry-After, „wieder verfügbar ab …"),
 * sonst schrittweise länger. Eine Sperre gilt je DIENST für alle laufenden Aufträge: Hat die Sprach-KI eben
 * „429" gesagt, fragt auch der Nachbarauftrag erst nach Ablauf wieder an.
 *
 * Ohne Fenster und ohne `window` – damit lässt sich die Logik ohne Oberfläche prüfen (tests/medienWarten.test.ts).
 */

/** Die Dienste, die ein Medienauftrag nutzt */
export type Dienst = 'ki' | 'bildki' | 'sprache' | 'bildsuche'

export const DIENST_NAME: Record<Dienst, string> = {
  ki: 'Die KI',
  bildki: 'Die Bild-KI',
  sprache: 'Die Sprach-KI',
  bildsuche: 'Die Bildsuche'
}

/** Schrittweise längere Wartezeiten, wenn der Dienst keine nennt (30 s … 30 min) */
export const WARTESTUFEN_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000]

/** Länger als so viel wartet ein einzelner Schritt insgesamt nicht – dann gilt der Fehler */
export const MAX_WARTEN_MS = 12 * 60 * 60 * 1000

/**
 * Ist das eine vorübergehende Begrenzung? Fehlendes GUTHABEN, ein abgelehnter Schlüssel oder ein gesperrter
 * Tarif zählen nicht – da hilft Warten nicht, die Lehrkraft muss etwas tun.
 */
export function istBegrenzung(meldung: string): boolean {
  if (/kein guthaben|credit balance|insufficient_quota|lehnt den schlüssel|api key|unauthori[sz]ed|\b401\b|\b402\b|paid_plan|tarif/i.test(meldung)) return false
  return /429|rate.?limit|too many requests|zu viele anfragen|kontingent|nutzungsgrenze|usage limit|limit erreicht|limit reached|quota|concurrent|ausgelastet|überlastet|system_busy|503/i.test(
    meldung
  )
}

/** Uhrzeit „14:35" aus einer Angabe wie „wieder verfügbar ab 14:35 Uhr" – als nächster solcher Zeitpunkt */
function abUhrzeit(meldung: string, jetzt: number): number | null {
  const m = /(?:ab|bis|um|at)\s+(\d{1,2}):(\d{2})/i.exec(meldung)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const d = new Date(jetzt)
  d.setHours(h, min, 0, 0)
  if (d.getTime() <= jetzt) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** Wartezeit in Sekunden, wenn die Meldung eine nennt („erneut versuchen in 20 s", „retry after 20", „try again in 1.5s") */
function genannteSekunden(meldung: string): number | null {
  const m =
    /(?:erneut versuchen in|retry[- ]after|try again in|wieder möglich in)\D{0,3}(\d+(?:[.,]\d+)?)\s*(s|sek|sekunden|seconds?|min|minuten|minutes?|h|stunden|hours?)?/i.exec(
      meldung
    )
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  const einheit = (m[2] ?? 's').toLowerCase()
  if (einheit.startsWith('h') || einheit.startsWith('stund')) return n * 3600
  if (einheit.startsWith('min')) return n * 60
  return n
}

/**
 * Wie lange nach diesem Fehler gewartet wird – oder null, wenn es keine Begrenzung ist.
 * `versuch` zählt die Fehlversuche desselben Schritts (0 = erster).
 */
export function wartezeit(e: unknown, versuch: number, jetzt = Date.now()): number | null {
  const meldung = e instanceof Error ? e.message : String(e ?? '')
  if (!istBegrenzung(meldung)) return null
  const sekunden = genannteSekunden(meldung)
  // Ein paar Sekunden Reserve, damit die erste Anfrage danach nicht wieder knapp zu früh kommt
  if (sekunden !== null) return Math.min(MAX_WARTEN_MS, Math.max(1000, Math.round(sekunden * 1000) + 2000))
  const ab = abUhrzeit(meldung, jetzt)
  if (ab !== null) return Math.min(MAX_WARTEN_MS, ab - jetzt + 60_000)
  return WARTESTUFEN_MS[Math.min(Math.max(0, versuch), WARTESTUFEN_MS.length - 1)]
}

/** „14:35" (bzw. „Di 14:35", wenn es nicht mehr heute ist) */
export function uhrzeitLabel(bis: number, jetzt = Date.now()): string {
  const d = new Date(bis)
  const zeit = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const heute = new Date(jetzt)
  if (d.toDateString() === heute.toDateString()) return zeit
  return `${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()]} ${zeit}`
}

/** Sperren je Dienst: bis wann niemand anfragt */
export class DienstSperren {
  private bis = new Map<Dienst, number>()
  sperre(dienst: Dienst, bis: number): void {
    this.bis.set(dienst, Math.max(this.bis.get(dienst) ?? 0, bis))
  }
  /** Zeitpunkt, bis zu dem der Dienst gesperrt ist – 0, wenn er frei ist */
  gesperrtBis(dienst: Dienst, jetzt = Date.now()): number {
    const b = this.bis.get(dienst) ?? 0
    if (b <= jetzt) {
      this.bis.delete(dienst)
      return 0
    }
    return b
  }
  leeren(): void {
    this.bis.clear()
  }
}

/**
 * Plätze für Medienaufträge: Mehrere Abschnitte lassen sich auf einmal in Auftrag geben, aber nur `anzahl`
 * laufen zugleich – sonst stünden zehn Abschnitte gleichzeitig bei der Sprach-KI an und lösten selbst die
 * Begrenzung aus. Die übrigen warten der Reihe nach.
 */
export class Plaetze {
  private belegt = 0
  private warteschlange: { ok: (frei: () => void) => void; signal?: AbortSignal }[] = []
  constructor(private anzahl: number) {}

  /** Liefert die Freigabe des Platzes; ein Abbruch während des Wartens nimmt den Eintrag aus der Schlange */
  belege(signal?: AbortSignal): Promise<() => void> {
    return new Promise((ok, fehler) => {
      if (signal?.aborted) return fehler(new Error('abgebrochen'))
      if (this.belegt < this.anzahl) {
        this.belegt++
        return ok(this.freigabe())
      }
      const eintrag = { ok, signal }
      this.warteschlange.push(eintrag)
      signal?.addEventListener(
        'abort',
        () => {
          const i = this.warteschlange.indexOf(eintrag)
          if (i >= 0) this.warteschlange.splice(i, 1)
          fehler(new Error('abgebrochen'))
        },
        { once: true }
      )
    })
  }

  /** Sofort einen freien Platz nehmen – null, wenn alle belegt sind (dann `belege`) */
  nimm(): (() => void) | null {
    if (this.belegt >= this.anzahl || this.warteschlange.length) return null
    this.belegt++
    return this.freigabe()
  }

  /** Wie viele gerade warten (für Tests und Anzeige) */
  get wartend(): number {
    return this.warteschlange.length
  }

  private freigabe(): () => void {
    let frei = false
    return () => {
      if (frei) return
      frei = true
      const naechster = this.warteschlange.shift()
      if (naechster) naechster.ok(this.freigabe())
      else this.belegt--
    }
  }
}
