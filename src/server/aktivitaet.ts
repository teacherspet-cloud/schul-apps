/**
 * Arbeitet gerade jemand am Server? – Grundlage der Aufspiel-Sperre (25.10.2026).
 *
 * Anlass: Beim Aufspielen von 0.4.197 startete der Server neu, während die Lehrkraft ein Arbeitsblatt erstellen ließ.
 * Die Web-App lädt nach einem Update einmal neu (shared/components/Fehlergrenze.tsx), der laufende Auftrag war weg.
 * Das Aufspiel-Skript (deploy/strato/schul-apps-aufspielen.sh) fragt deshalb vorher `/gesundheit` aus dem Container
 * heraus und bricht ab, wenn Lehrkräfte in den letzten Minuten etwas getan haben oder KI-Aufträge laufen – es sei
 * denn, es wird mit `--jetzt` aufgerufen.
 *
 * Gezählt werden nur Handlungen (POST-Anfragen von Lehrkraft-Konten), nicht das bloße Offenhalten einer Seite oder
 * der Ereignisstrom; Lernende zählen nicht. Reine Daten im Speicher, nichts Personenbezogenes.
 */

/** So viele Minuten nach der letzten Handlung einer Lehrkraft gilt der Server als ruhig */
export const RUHE_MINUTEN = 10

export interface AktivitaetsBild {
  /** Laufende Anfragen an die Programme und laufende Aufträge im Register */
  laufend: number
  /** Minuten seit der letzten Handlung einer Lehrkraft (abgerundet); null: seit dem Start keine */
  lehrkraftVorMinuten: number | null
  /** Nichts läuft und die letzte Handlung liegt mindestens RUHE_MINUTEN zurück */
  ruhig: boolean
}

export class Aktivitaet {
  private zuletztLehrkraft: number | null = null
  private laufendeAnfragen = 0
  constructor(private uhr: () => number = () => Date.now()) {}

  /** Eine Handlung einer Lehrkraft (POST an /api, /auftrag/…, /server/…) */
  merkeLehrkraft(): void {
    this.zuletztLehrkraft = this.uhr()
  }
  /** Eine Anfrage an die Programme beginnt bzw. endet (/api) */
  anfrageBeginnt(): void {
    this.laufendeAnfragen++
  }
  anfrageEndet(): void {
    this.laufendeAnfragen = Math.max(0, this.laufendeAnfragen - 1)
  }
  bild(laufendeAuftraege = 0): AktivitaetsBild {
    const laufend = this.laufendeAnfragen + Math.max(0, laufendeAuftraege)
    const vor = this.zuletztLehrkraft === null ? null : Math.max(0, Math.floor((this.uhr() - this.zuletztLehrkraft) / 60_000))
    return { laufend, lehrkraftVorMinuten: vor, ruhig: laufend === 0 && (vor === null || vor >= RUHE_MINUTEN) }
  }
}

/** Ist die Anfrage aus dem Container selbst gekommen (Docker-Gesundheitsprüfung, Aufspiel-Skript)? */
export const vonInnen = (adresse: string | undefined): boolean => /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(String(adresse ?? ''))

export const aktivitaet = new Aktivitaet()
