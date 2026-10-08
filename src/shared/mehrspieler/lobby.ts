/**
 * Lobby der Mehrspieler-Spiele (08.10.2026, Plan B) – reine Zustandsmaschine ohne Netz und Datenbank:
 *  - Host legt an (Spiel, Kurs), andere treten mit dem Einladungscode bei (bis zur Höchstzahl des Spiels).
 *  - Host sieht die Beigetretenen (Kurznamen), kann jemanden entfernen (kein erneuter Beitritt), wählt Schwierigkeit
 *    und bei Grammatik die Form, startet ab der Mindestzahl.
 *  - Verlässt der Host die Lobby, wird die nächste Person Host. Verbindungsabbruch: Platz 60 s gehalten.
 *  - Nach 30 Minuten ohne Aktivität läuft die Lobby ab.
 */
import { mehrspielInfo, type Bereich, type MehrspielId, type Schwierigkeit } from './typen'

export const PLATZ_HALTEN_MS = 60_000
export const LOBBY_LEBT_MS = 30 * 60_000

export interface LobbySpieler {
  id: string
  name: string
  verbunden: boolean
  /** Seit wann ohne Verbindung (ms) */
  getrennt?: number
}

export interface Lobby {
  code: string
  bereich: Bereich
  kurs: string
  spiel: MehrspielId
  host: string
  spieler: LobbySpieler[]
  entfernt: string[]
  schwierigkeit: Schwierigkeit
  /** Grammatik: gewählte Form (Kennung der Grammatik-Freigabe) */
  form?: string
  phase: 'warten' | 'spiel' | 'ende'
  aktiv: number
}

export type LobbyFehler = { fehler: string; status: number }

export function lobbyNeu(o: { code: string; bereich: Bereich; kurs: string; spiel: MehrspielId; host: { id: string; name: string }; jetzt: number; form?: string }): Lobby {
  return {
    code: o.code,
    bereich: o.bereich,
    kurs: o.kurs,
    spiel: o.spiel,
    host: o.host.id,
    spieler: [{ id: o.host.id, name: o.host.name, verbunden: true }],
    entfernt: [],
    schwierigkeit: 'mittel',
    ...(o.form ? { form: o.form } : {}),
    phase: 'warten',
    aktiv: o.jetzt
  }
}

const maxVon = (l: Lobby): number => mehrspielInfo(l.spiel)?.max ?? 4
const minVon = (l: Lobby): number => mehrspielInfo(l.spiel)?.min ?? 2

/** Beitreten (oder wieder verbinden, wenn schon dabei) */
export function beitreten(l: Lobby, s: { id: string; name: string }, jetzt: number): LobbyFehler | null {
  if (l.entfernt.includes(s.id)) return { fehler: 'Du wurdest aus dieser Runde genommen.', status: 403 }
  const da = l.spieler.find((x) => x.id === s.id)
  if (da) {
    da.verbunden = true
    delete da.getrennt
    l.aktiv = jetzt
    return null
  }
  if (l.phase !== 'warten') return { fehler: 'Das Spiel läuft schon.', status: 409 }
  if (l.spieler.length >= maxVon(l)) return { fehler: `Die Runde ist voll (höchstens ${maxVon(l)}).`, status: 409 }
  l.spieler.push({ id: s.id, name: s.name, verbunden: true })
  l.aktiv = jetzt
  return null
}

/** Verlassen: Host geht → nächste Person ist Host; true = Lobby ist leer */
export function verlassen(l: Lobby, id: string, jetzt: number): boolean {
  l.spieler = l.spieler.filter((s) => s.id !== id)
  if (l.host === id && l.spieler.length) l.host = l.spieler[0].id
  l.aktiv = jetzt
  return l.spieler.length === 0
}

export function entfernen(l: Lobby, wer: string, id: string, jetzt: number): LobbyFehler | null {
  if (wer !== l.host) return { fehler: 'Nur wer die Runde eröffnet hat, kann jemanden herausnehmen.', status: 403 }
  if (id === wer) return { fehler: 'Dich selbst kannst du nicht herausnehmen – verlasse die Runde.', status: 400 }
  if (!l.spieler.some((s) => s.id === id)) return { fehler: 'Nicht in der Runde.', status: 404 }
  l.entfernt.push(id)
  verlassen(l, id, jetzt)
  return null
}

export function einstellen(l: Lobby, wer: string, e: { schwierigkeit?: Schwierigkeit; form?: string; spiel?: MehrspielId }, jetzt: number): LobbyFehler | null {
  if (wer !== l.host) return { fehler: 'Nur wer die Runde eröffnet hat, stellt ein.', status: 403 }
  if (l.phase !== 'warten') return { fehler: 'Das Spiel läuft schon.', status: 409 }
  if (e.spiel) {
    const info = mehrspielInfo(e.spiel)
    if (!info || !info.bereiche.includes(l.bereich)) return { fehler: 'Unbekanntes Spiel.', status: 400 }
    if (l.spieler.length > info.max) return { fehler: `Für dieses Spiel seid ihr zu viele (höchstens ${info.max}).`, status: 409 }
    l.spiel = e.spiel
  }
  if (e.schwierigkeit) l.schwierigkeit = e.schwierigkeit
  if (e.form !== undefined) l.form = e.form
  l.aktiv = jetzt
  return null
}

export function startPruefen(l: Lobby, wer: string): LobbyFehler | null {
  if (wer !== l.host) return { fehler: 'Nur wer die Runde eröffnet hat, startet.', status: 403 }
  if (l.phase === 'spiel') return { fehler: 'Das Spiel läuft schon.', status: 409 }
  const da = l.spieler.filter((s) => s.verbunden)
  if (da.length < minVon(l)) return { fehler: `Es braucht mindestens ${minVon(l)} Personen.`, status: 409 }
  return null
}

/** Verbindung an/aus melden */
export function verbindung(l: Lobby, id: string, an: boolean, jetzt: number): void {
  const s = l.spieler.find((x) => x.id === id)
  if (!s) return
  if (an) {
    s.verbunden = true
    delete s.getrennt
  } else if (s.verbunden) {
    s.verbunden = false
    s.getrennt = jetzt
  }
}

/**
 * Aufräumen: Wer länger als 60 s getrennt ist, verliert den Platz (Host wandert weiter). Gibt die Herausgefallenen
 * zurück; `abgelaufen` = 30 min ohne Aktivität oder niemand mehr da.
 */
export function aufraeumen(l: Lobby, jetzt: number): { raus: string[]; abgelaufen: boolean } {
  const raus = l.spieler.filter((s) => !s.verbunden && s.getrennt !== undefined && jetzt - s.getrennt >= PLATZ_HALTEN_MS).map((s) => s.id)
  for (const id of raus) verlassen(l, id, l.aktiv)
  return { raus, abgelaufen: !l.spieler.length || jetzt - l.aktiv >= LOBBY_LEBT_MS }
}
