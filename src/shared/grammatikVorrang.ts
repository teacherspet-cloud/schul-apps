/**
 * Grammatik heute (12.10.2026, Übungsvorrang wie bei den Vokabeln – shared/uebungsVorrang.ts): EINE Rechnung für den
 * Grammatiktrainer, die Erinnerungen und die Freigabe der Mehrspieler-Spiele (vorher dreimal gleich, aber getrennt).
 *
 *  - Zuerst fällige Wiederholungen – die aus der neuesten Freigabe (bzw. einem angekündigten Test) vor älteren.
 *  - Dann unbearbeitete Aufgaben: die zuletzt freigegebenen zuerst (Aufgaben, die die Lehrkraft mit „+ Aufgaben"
 *    angehängt hat, tragen ihren Zeitpunkt in der Kennung „m<Zeit>-n"; die übrigen den der Freigabe), darin wie bisher
 *    nach Stufen (Förderaufgaben) und der Reihenfolge der Regeln.
 *  - Neue je Tag: 10 (bisher fest); vor einem angekündigten Test mehr, damit jede Aufgabe des Tests bis 3 Tage vorher
 *    einmal dran war (`neuJeTag` vom Server, Faustregel `tageszielVorTest`).
 */
import { alsKarten, type GrammatikPaket } from './grammatiktrainer'
import { sitzungsWoerter, tagVon, type Vokabel, type WortStand } from './vokabeltrainer'
import { GLEICHE_FREIGABE_MS } from './uebungsVorrang'

/** Neue Grammatikaufgaben je Tag (ohne angekündigten Test) */
export const GRAMMATIK_NEU_JE_TAG = 10

/** Freigabezeit einer Aufgabe: „+ Aufgaben" vergibt „m<Zeit base36>-n" (server/grammatik.ts), sonst die Freigabe des Trainings */
export function aufgabeFreigabe(id: string, erstellt: number): number {
  const m = /^m([0-9a-z]{6,12})-\d+$/.exec(id)
  if (m) {
    const t = parseInt(m[1], 36)
    if (t > 1.5e12 && t < 4.1e12) return t
  }
  return erstellt
}

/** Karten des Pakets mit Vorrang: 'test' für alle (angekündigter Test), sonst 'neu' für die neueste Freigabe (wenn es mehrere gibt) */
export function grammatikKarten(paket: Pick<GrammatikPaket, 'aufgaben'>, erstellt: number, test = false): Vokabel[] {
  const karten = alsKarten(paket.aufgaben as GrammatikPaket['aufgaben']) as Vokabel[]
  if (test) return karten.map((k) => ({ ...k, vorrang: 'test' as const }))
  const zeiten = paket.aufgaben.map((a) => aufgabeFreigabe(a.id, erstellt))
  const neueste = Math.max(0, ...zeiten)
  const mehrere = zeiten.some((t) => t < neueste - GLEICHE_FREIGABE_MS)
  return mehrere ? karten.map((k, i) => (zeiten[i] >= neueste - GLEICHE_FREIGABE_MS ? { ...k, vorrang: 'neu' as const } : k)) : karten
}

/** Kennungen der heute dran stehenden Aufgaben in Übungsreihenfolge */
export function grammatikHeute(
  paket: Pick<GrammatikPaket, 'aufgaben' | 'regeln'>,
  staende: Record<string, WortStand>,
  o: { erstellt: number; neuJeTag?: number; test?: boolean; jetzt?: number }
): string[] {
  const jetzt = o.jetzt ?? Date.now()
  const faellig = sitzungsWoerter(grammatikKarten(paket, o.erstellt, o.test), staende, jetzt, 0).map((k) => k.id)
  const heute = tagVon(jetzt)
  const schonNeu = paket.aufgaben.filter((a) => staende[a.id]?.erstmals && tagVon(staende[a.id].erstmals!) === heute).length
  const regelIndex = new Map(paket.regeln.map((r, i) => [r.id, i]))
  const neu = Math.max(0, (o.neuJeTag ?? GRAMMATIK_NEU_JE_TAG) - schonNeu)
  const neue = paket.aufgaben
    .map((a, i) => ({ a, i, zeit: aufgabeFreigabe(a.id, o.erstellt) }))
    .filter((x) => !staende[x.a.id]?.versuche)
    // neueste Freigabe zuerst (zusammen angehängte als eine), darin Stufe, Regel und Reihenfolge wie bisher
    .sort(
      (x, y) =>
        Math.floor(y.zeit / GLEICHE_FREIGABE_MS) - Math.floor(x.zeit / GLEICHE_FREIGABE_MS) ||
        (x.a.stufe ?? 0) - (y.a.stufe ?? 0) ||
        (regelIndex.get(x.a.regelId) ?? 0) - (regelIndex.get(y.a.regelId) ?? 0) ||
        x.i - y.i
    )
    .slice(0, neu)
    .map((x) => x.a.id)
  return [...faellig, ...neue]
}
