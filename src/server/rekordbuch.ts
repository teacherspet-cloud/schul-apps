/**
 * Rekordbuch der Lernenden (08.10.2026, Wunsch der Lehrkraft): persönliche Rekorde je Spiel über alle Trainings – je
 * Schuljahr neu (Schulkalender: erster Schultag nach den Sommerferien, sonst 1. August), frühere Jahre bleiben als
 * Rekordgeschichte einsehbar („Klasse 5: …"), dazu je Schuljahr, wie viele Wörter neu gelernt und sicher geworden sind. Keine Rangliste: nur die eigenen Werte.
 *
 *  Lernende: GET /s/api/rekorde
 */
import { schuljahrText, schuljahrVon as kalenderSchuljahr } from '@shared/schulkalender'
import { datenbank, type NutzerInfo } from './datenbank'
import { json, type Anfrage } from './http'
import { SPIELE } from '../shared/vokabelSpiele'
import { GRAMMATIK_SPIELE } from '../shared/grammatiktrainer'
import { achievementSpiel } from './achievementsDaten'
import { mehrspielInfo } from '../shared/mehrspieler/typen'

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(`CREATE TABLE IF NOT EXISTS rekord_buch (
      nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
      schuljahr TEXT NOT NULL,
      daten TEXT NOT NULL,
      PRIMARY KEY (nutzer_id, schuljahr)
    )`)
    bereit = true
  }
  return d
}

interface Jahr {
  klasse?: number
  rekorde: Record<string, { wert: number; datum: number }>
  gelernt: number
  sicher: number
}

/** Schuljahr eines Zeitpunkts – nach dem Schulkalender (ohne Daten Wechsel am 1. August): „2026/27" */
export function schuljahrVon(ms: number): string {
  return schuljahrText(kalenderSchuljahr(ms))
}

const lesen = (nutzerId: string, jahr: string): Jahr => {
  const z = db().prepare('SELECT daten FROM rekord_buch WHERE nutzer_id = ? AND schuljahr = ?').get(nutzerId, jahr) as { daten: string } | undefined
  try {
    return z ? (JSON.parse(z.daten) as Jahr) : { rekorde: {}, gelernt: 0, sicher: 0 }
  } catch {
    return { rekorde: {}, gelernt: 0, sicher: 0 }
  }
}
const schreiben = (nutzerId: string, jahr: string, j: Jahr): void => {
  db()
    .prepare('INSERT INTO rekord_buch (nutzer_id, schuljahr, daten) VALUES (?, ?, ?) ON CONFLICT(nutzer_id, schuljahr) DO UPDATE SET daten = excluded.daten')
    .run(nutzerId, jahr, JSON.stringify(j))
}

/** Kleiner ist besser? (Züge, Sekunden) – aus den Spiellisten */
const kleinerBesser = (schluessel: string): boolean => {
  const [art, id] = schluessel.split(':')
  // Zusammen spielen (08.10.2026): „koop:<spiel>“ bzw. „versus:<spiel>“
  if (art === 'koop' || art === 'versus') return Boolean(mehrspielInfo(id)?.kleinerBesser)
  return Boolean(art === 'gram' ? GRAMMATIK_SPIELE.find((s) => s.id === id)?.kleinerBesser : SPIELE.find((s) => s.id === id)?.kleinerBesser)
}

/**
 * Spielergebnis eintragen; true = neuer Rekord des Schuljahres. `schluessel` = „vok:blitz" bzw. „gram:formenblitz".
 * `fehler` (falsche Antworten im Spiel, wenn bekannt) zählt für die Achievements (08.10.2026).
 */
export function rekordEintragen(n: NutzerInfo, schluessel: string, wert: number, klasse: number | null, jetzt = Date.now(), fehler?: number): boolean {
  if (n.rolle !== 'schueler' || n.quelle === 'vorschau' || !Number.isFinite(wert)) return false
  const jahr = schuljahrVon(jetzt)
  const j = lesen(n.id, jahr)
  if (klasse) j.klasse = klasse
  const bisher = j.rekorde[schluessel]
  const besser = !bisher || (kleinerBesser(schluessel) ? wert < bisher.wert : wert > bisher.wert)
  if (besser) j.rekorde[schluessel] = { wert, datum: jetzt }
  schreiben(n.id, jahr, j)
  // Achievements: „Rekord gebrochen" nur, wenn es schon einen Rekord gab; dazu Spielarten, Blitzrunde, Verbformen
  achievementSpiel(n, schluessel, wert, besser && Boolean(bisher), fehler, jetzt)
  return besser
}

/** Wörter zählen: neu gelernt (erster Kontakt) bzw. sicher geworden */
export function woerterEintragen(n: NutzerInfo, art: { gelernt?: number; sicher?: number }, klasse: number | null, jetzt = Date.now()): void {
  if (n.rolle !== 'schueler' || n.quelle === 'vorschau' || (!art.gelernt && !art.sicher)) return
  const jahr = schuljahrVon(jetzt)
  const j = lesen(n.id, jahr)
  if (klasse) j.klasse = klasse
  j.gelernt += art.gelernt ?? 0
  j.sicher += art.sicher ?? 0
  schreiben(n.id, jahr, j)
}

/** Achievements (08.10.2026): alle Spiele, die die Person je gespielt hat (über alle Schuljahre) */
export function gespielteSpiele(nutzerId: string): Set<string> {
  const aus = new Set<string>()
  for (const z of db().prepare('SELECT daten FROM rekord_buch WHERE nutzer_id = ?').all(nutzerId) as { daten: string }[]) {
    try {
      for (const k of Object.keys((JSON.parse(z.daten) as Jahr).rekorde ?? {})) aus.add(k)
    } catch {
      // beschädigter Eintrag: überspringen
    }
  }
  return aus
}

/** Name und Einheit eines Spiels für die Anzeige */
const spielInfo = (schluessel: string): { name: string; einheit: string; bereich: string } => {
  const [art, id] = schluessel.split(':')
  if (art === 'koop' || art === 'versus') {
    const m = mehrspielInfo(id)
    return { name: m?.name ?? id, einheit: m?.einheit ?? '', bereich: 'Zusammen' }
  }
  const s = art === 'gram' ? GRAMMATIK_SPIELE.find((x) => x.id === id) : SPIELE.find((x) => x.id === id)
  return { name: s?.name ?? id, einheit: s?.einheit ?? '', bereich: art === 'gram' ? 'Grammatik' : 'Vokabeln' }
}

export function rekordbuchRoute(): (k: Anfrage) => Promise<boolean> {
  return async ({ req, res, url, sitzung }) => {
    if (url.pathname !== '/s/api/rekorde') return false
    if (req.method !== 'GET') return json(res, 405, { fehler: 'Nur lesen.' }), true
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const zeilen = db().prepare('SELECT schuljahr, daten FROM rekord_buch WHERE nutzer_id = ?').all(sitzung.nutzer.id) as { schuljahr: string; daten: string }[]
    const aktuell = schuljahrVon(Date.now())
    const jahre = zeilen
      .map((z) => {
        let j: Jahr
        try {
          j = JSON.parse(z.daten) as Jahr
        } catch {
          j = { rekorde: {}, gelernt: 0, sicher: 0 }
        }
        return {
          schuljahr: z.schuljahr,
          klasse: j.klasse ?? null,
          gelernt: j.gelernt,
          sicher: j.sicher,
          rekorde: Object.entries(j.rekorde)
            .map(([k, r]) => ({ schluessel: k, ...spielInfo(k), wert: r.wert, datum: r.datum }))
            .sort((a, b) => a.bereich.localeCompare(b.bereich) || a.name.localeCompare(b.name, 'de'))
        }
      })
      .sort((a, b) => b.schuljahr.localeCompare(a.schuljahr))
    if (!jahre.some((j) => j.schuljahr === aktuell)) jahre.unshift({ schuljahr: aktuell, klasse: null, gelernt: 0, sicher: 0, rekorde: [] })
    return json(res, 200, { aktuell, jahre }), true
  }
}
