/**
 * Auftragsregister für KI-Anfragen aus der iPad-App (30.09.2026).
 *
 * Wunsch der Lehrkraft: „Füge eine Mechanik ein, die bei Verbindungsabbrüchen zwischen PC und
 * iPad greift und ein nahtloses Anknüpfen nach Wiederaufnahme der Verbindung ermöglicht. …
 * Außerdem sollen Aufträge zur Generierung nicht abbrechen, wenn man die App auf dem Tablet
 * minimiert oder ausblendet."
 *
 * Bis dahin hing eine KI-Anfrage an EINER HTTP-Verbindung: Riss sie ab (WLAN-Wechsel,
 * Tailscale verbindet neu, iPad im Hintergrund), brach der PC die Anfrage ab, und das iPad
 * meldete einen Fehler. Jetzt:
 *  - Jede Anfrage bekommt vom iPad eine Auftrags-ID. Dieselbe ID zweimal gesendet ist derselbe
 *    Auftrag (idempotent) – das iPad kann nach einer Unterbrechung einfach erneut fragen.
 *  - Der Auftrag läuft am PC unabhängig von jeder Verbindung weiter. Nur ein ausdrücklicher
 *    Abbruch (Knopf in der Auftragsleiste) beendet ihn.
 *  - Ergebnis, Fehler und letzter Fortschritt bleiben hier liegen, bis das iPad sie abholt und
 *    quittiert – höchstens zwei Stunden nach dem Ende.
 *
 * ZUGRIFF: Ein Auftrag gehört dem GERÄT, das ihn gestartet hat (`geraet`: eine zufällige,
 * geheime Kennung, die die iPad-App einmal erzeugt und behält). Nicht an die Anmeldung
 * (Token) gebunden – nach einem Neustart der App meldet sie sich neu an und muss ihre Aufträge
 * trotzdem wiederfinden. Abfragen setzt aber IMMER eine gültige Anmeldung (PIN) voraus
 * (lanServer.ts); ein fremdes Gerät sieht fremde Aufträge nicht, auch nicht deren Existenz.
 */
import { istAbbruch } from '@shared/abbruch'

/** Nur lange Arbeiten laufen über das Register – alles andere bleibt ein gewöhnlicher Aufruf */
export const AUFTRAGS_KANAELE: readonly string[] = ['ai:structured', 'ai:image', 'ai:websuche', 'audio:speak']

/** So lange bleibt ein beendeter, nicht abgeholter Auftrag liegen */
export const AUFTRAG_TTL_MS = 2 * 60 * 60 * 1000
/** Ein Auftrag, der so lange läuft, gilt als verwaist (der Hauptprozess antwortet nie mehr) */
export const AUFTRAG_HOECHSTDAUER_MS = 6 * 60 * 60 * 1000
/** Höchstens so viele Aufträge insgesamt bzw. je Gerät – danach gehen zuerst die ältesten beendeten */
export const MAX_AUFTRAEGE = 200
export const MAX_JE_GERAET = 60
/** Länger wartet eine Abfrage nicht (Long-Poll) – iOS kappt stille Verbindungen nach 60 s */
export const MAX_WARTEN_MS = 25_000

/** Auftrags-IDs und Gerätekennungen: nur Zeichen, die in Kennungen und Adressen unverfänglich sind */
export const gueltigeAuftragsId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(id)
export const gueltigesGeraet = (g: unknown): g is string => typeof g === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(g)

/** Vorsatz der Kennung, unter der ein Auftrag im Hauptprozess läuft (Fortschritt, Warteplatz, Abbruch) */
export const AUFTRAG_VORSATZ = 'netz-auftrag-'
export const kennungDesAuftrags = (id: string): string => `${AUFTRAG_VORSATZ}${id}`

export type AuftragsZustand = 'laeuft' | 'fertig' | 'fehler' | 'abgebrochen'

/** Was das Gerät über einen Auftrag erfährt (ohne Ergebnis) */
export interface AuftragsBild {
  id: string
  kanal: string
  zustand: AuftragsZustand
  seit: number
  ende?: number
  /** Letzte Fortschrittsmeldung (ai:progress), z. B. { chars: 1200 } */
  fortschritt?: Record<string, unknown>
  /** Letzte Meldung zum Warteplatz (ai:platz) */
  platz?: Record<string, unknown>
  fehler?: string
}

interface Eintrag extends AuftragsBild {
  geraet: string
  wert?: unknown
  /** Warten gerade Abfragen auf das Ende? */
  warter: Set<() => void>
}

export class AuftragsFehler extends Error {
  constructor(message: string, readonly code: 'voll' | 'fremd') {
    super(message)
    this.name = 'AuftragsFehler'
  }
}

export class AuftragsRegister {
  private eintraege = new Map<string, Eintrag>()

  constructor(private uhr: () => number = () => Date.now()) {}

  private bild(e: Eintrag, mitWert = false): AuftragsBild & { wert?: unknown } {
    const { geraet: _g, warter: _w, wert, ...rest } = e
    return mitWert && e.zustand === 'fertig' ? { ...rest, wert } : rest
  }

  private eigen(geraet: string, id: string): Eintrag | null {
    const e = this.eintraege.get(id)
    return e && e.geraet === geraet ? e : null
  }

  private beende(e: Eintrag, zustand: Exclude<AuftragsZustand, 'laeuft'>, felder: Partial<Eintrag> = {}): void {
    if (e.zustand !== 'laeuft') return
    Object.assign(e, felder, { zustand, ende: this.uhr() })
    for (const w of [...e.warter]) w()
    e.warter.clear()
  }

  /** Abgelaufenes entfernen: beendet und älter als die TTL, oder verwaist */
  aufraeumen(): void {
    const jetzt = this.uhr()
    for (const [id, e] of this.eintraege) {
      if (e.zustand !== 'laeuft' && jetzt - (e.ende ?? e.seit) > AUFTRAG_TTL_MS) this.eintraege.delete(id)
      else if (e.zustand === 'laeuft' && jetzt - e.seit > AUFTRAG_HOECHSTDAUER_MS) {
        this.beende(e, 'fehler', {
          fehler: 'Der Auftrag hat am PC zu lange gedauert und wurde aufgegeben.'
        })
      }
    }
  }

  /** Platz schaffen: zuerst die ältesten beendeten Aufträge (des Geräts bzw. insgesamt) */
  private platzFuer(geraet: string): void {
    const beendete = (nur?: string): Eintrag[] =>
      [...this.eintraege.values()].filter((e) => e.zustand !== 'laeuft' && (!nur || e.geraet === nur)).sort((a, b) => (a.ende ?? 0) - (b.ende ?? 0))
    const zahl = (nur?: string): number => [...this.eintraege.values()].filter((e) => !nur || e.geraet === nur).length
    for (const e of beendete(geraet)) {
      if (zahl(geraet) < MAX_JE_GERAET) break
      this.eintraege.delete(e.id)
    }
    for (const e of beendete()) {
      if (zahl() < MAX_AUFTRAEGE) break
      this.eintraege.delete(e.id)
    }
    if (zahl(geraet) >= MAX_JE_GERAET || zahl() >= MAX_AUFTRAEGE) {
      throw new AuftragsFehler('Am PC laufen gerade zu viele Aufträge. Bitte warten, bis einige fertig sind.', 'voll')
    }
  }

  /**
   * Startet einen Auftrag – oder liefert den schon vorhandenen mit derselben ID (idempotent).
   * `ausfuehren` läuft ohne Bezug zu einer Verbindung; sein Ende landet im Register.
   */
  starte(geraet: string, id: string, kanal: string, ausfuehren: () => Promise<unknown>): { bild: AuftragsBild & { wert?: unknown }; neu: boolean } {
    this.aufraeumen()
    const vorhanden = this.eintraege.get(id)
    if (vorhanden) {
      if (vorhanden.geraet !== geraet) throw new AuftragsFehler('Diese Auftrags-ID gehört einem anderen Gerät.', 'fremd')
      return { bild: this.bild(vorhanden, true), neu: false }
    }
    this.platzFuer(geraet)
    const e: Eintrag = {
      id,
      kanal,
      geraet,
      zustand: 'laeuft',
      seit: this.uhr(),
      warter: new Set()
    }
    this.eintraege.set(id, e)
    let lauf: Promise<unknown>
    try {
      lauf = Promise.resolve(ausfuehren())
    } catch (err) {
      lauf = Promise.reject(err)
    }
    lauf.then(
      (wert) => this.beende(e, 'fertig', { wert }),
      (err: unknown) =>
        istAbbruch(err)
          ? this.beende(e, 'abgebrochen')
          : this.beende(e, 'fehler', {
              fehler: err instanceof Error ? err.message : String(err)
            })
    )
    return { bild: this.bild(e), neu: true }
  }

  /** Stand eines eigenen Auftrags (mit Ergebnis, falls fertig) – null, wenn unbekannt */
  abfragen(geraet: string, id: string): (AuftragsBild & { wert?: unknown }) | null {
    this.aufraeumen()
    const e = this.eigen(geraet, id)
    return e ? this.bild(e, true) : null
  }

  /**
   * Long-Poll: wartet höchstens `ms` auf das Ende eines laufenden Auftrags. Liefert den Stand
   * danach (null, wenn unbekannt). `signal` beendet das Warten vorzeitig (Verbindung weg).
   */
  warte(geraet: string, id: string, ms: number, signal?: AbortSignal): Promise<(AuftragsBild & { wert?: unknown }) | null> {
    const e = this.eigen(geraet, id)
    if (!e || e.zustand !== 'laeuft' || ms <= 0) return Promise.resolve(this.abfragen(geraet, id))
    return new Promise((ok) => {
      const fertig = (): void => {
        clearTimeout(frist)
        e.warter.delete(fertig)
        signal?.removeEventListener('abort', fertig)
        ok(this.abfragen(geraet, id))
      }
      const frist = setTimeout(fertig, Math.min(ms, MAX_WARTEN_MS))
      e.warter.add(fertig)
      signal?.addEventListener('abort', fertig, { once: true })
    })
  }

  /** Alle Aufträge dieses Geräts (ohne Ergebnisse) – laufende und noch nicht abgeholte */
  liste(geraet: string): AuftragsBild[] {
    this.aufraeumen()
    return [...this.eintraege.values()].filter((e) => e.geraet === geraet).map((e) => this.bild(e))
  }

  /** Ergebnis abgeholt: der Auftrag verschwindet. Ein laufender bleibt (erst abbrechen). */
  quittiere(geraet: string, id: string): boolean {
    const e = this.eigen(geraet, id)
    if (!e || e.zustand === 'laeuft') return false
    this.eintraege.delete(id)
    return true
  }

  /** Ausdrücklicher Abbruch durch das Gerät; liefert true, wenn der Auftrag noch lief */
  brichAb(geraet: string, id: string): boolean {
    const e = this.eigen(geraet, id)
    if (!e || e.zustand !== 'laeuft') return false
    this.beende(e, 'abgebrochen')
    return true
  }

  /**
   * Ein Ereignis des Hauptprozesses zu einem Auftrag (Fortschritt, Warteplatz) festhalten.
   * Liefert das Gerät, dem der Auftrag gehört – oder null.
   */
  ereignis(id: string, kanal: string, wert: unknown): string | null {
    const e = this.eintraege.get(id)
    if (!e) return null
    if (wert && typeof wert === 'object') {
      const { id: _id, ...rest } = wert as Record<string, unknown>
      if (kanal === 'ai:progress') e.fortschritt = rest
      else if (kanal === 'ai:platz') e.platz = rest
    }
    return e.geraet
  }

  /** Nur für Tests */
  groesse(): number {
    return this.eintraege.size
  }

  leeren(): void {
    this.eintraege.clear()
  }
}
