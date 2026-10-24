/**
 * Server-Sent Events je Person (24.10.2026, aus spiel.ts herausgezogen für die Partnerarbeit): Jedes Gerät hält einen
 * Strom offen und bekommt seine eigene Sicht; ein Puls alle 5 s hält Verbindungen hinter der Weiche wach. Der Browser
 * liest den Strom per fetch (Kopfzeile x-schulapps-token) und fällt bei Störung auf Abfragen zurück
 * (renderer/shared/liveSicht.ts). Anwesend ist, wer einen Strom offen hat oder in den letzten Sekunden abgefragt hat.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

export const PULS_MS = 5000
export const ANWESEND_MS = 4000

export class Stroeme {
  private readonly offen = new Map<string, Set<ServerResponse>>()
  private readonly abfrage = new Map<string, number>()

  constructor(private readonly kanal: string) {}

  /** Strom öffnen und offen halten; schließt sich mit der Verbindung */
  oeffnen(req: IncomingMessage, res: ServerResponse, id: string): void {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    req.socket.setNoDelay(true)
    res.write(': verbunden\n\n')
    const set = this.offen.get(id) ?? new Set<ServerResponse>()
    set.add(res)
    this.offen.set(id, set)
    res.on('close', () => {
      set.delete(res)
      if (!set.size) this.offen.delete(id)
    })
  }

  /** Abfrage (Rückfall ohne Strom) vermerken */
  abgefragt(id: string, jetzt = Date.now()): void {
    this.abfrage.set(id, jetzt)
  }

  verbunden(id: string, jetzt = Date.now()): boolean {
    return (this.offen.get(id)?.size ?? 0) > 0 || jetzt - (this.abfrage.get(id) ?? 0) < ANWESEND_MS
  }

  /** Alle, die gerade verbunden sind */
  verbundene(jetzt = Date.now()): string[] {
    const aus = new Set<string>([...this.offen.keys()].filter((id) => (this.offen.get(id)?.size ?? 0) > 0))
    for (const [id, t] of this.abfrage) if (jetzt - t < ANWESEND_MS) aus.add(id)
    return [...aus]
  }

  schreibe(id: string, wert: unknown): void {
    const set = this.offen.get(id)
    if (!set?.size) return
    const zeile = `data: ${JSON.stringify({ kanal: this.kanal, wert })}\n\n`
    for (const res of set) res.write(zeile)
  }

  /** Jedem mit offenem Strom seine Sicht schicken */
  verteilen(sichtFuer: (id: string) => unknown): void {
    for (const [id, set] of this.offen) {
      if (!set.size) continue
      this.schreibe(id, sichtFuer(id))
    }
  }

  puls(): void {
    for (const set of this.offen.values()) for (const res of set) res.write(': puls\n\n')
  }

  schliessen(): void {
    for (const set of this.offen.values()) for (const res of set) res.end()
    this.offen.clear()
    this.abfrage.clear()
  }

  get anzahl(): number {
    return [...this.offen.values()].reduce((n, s) => n + s.size, 0)
  }
}
