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
 *  - Alle (17.10.2026, Wunsch der Lehrkraft, nur Grammatik): Im Trainer sind alle Aufgaben möglich – `alle` liefert alle
 *    fälligen und alle unbearbeiteten in derselben Reihenfolge. Erinnerungen und Spiele-Freigabe zählen weiter die
 *    Tagesrunde (ohne `alle`).
 *  - Etappen (20.10.2026, abgestimmt – shared/grammatikEtappen.ts): Neue Übungen nur aus freigeschalteten Etappen
 *    (Erkennen → Bilden → Anwenden → Profi → Bonus, weiter ab 80 % richtig). Vor einem angekündigten Test gilt das nicht –
 *    dann soll jede Aufgabe des Tests rechtzeitig einmal dran gewesen sein.
 */
import { alsKarten, type GrammatikPaket } from './grammatiktrainer'
import { sitzungsWoerter, tagVon, type Vokabel, type WortStand } from './vokabeltrainer'
import { GLEICHE_FREIGABE_MS } from './uebungsVorrang'
import { freieAufgaben } from './grammatikEtappen'

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
  o: { erstellt: number; neuJeTag?: number; test?: boolean; jetzt?: number; alle?: boolean }
): string[] {
  const jetzt = o.jetzt ?? Date.now()
  const faellig = sitzungsWoerter(grammatikKarten(paket, o.erstellt, o.test), staende, jetzt, 0, o.alle ? Number.MAX_SAFE_INTEGER : undefined).map(
    (k) => k.id
  )
  const heute = tagVon(jetzt)
  const schonNeu = paket.aufgaben.filter((a) => staende[a.id]?.erstmals && tagVon(staende[a.id].erstmals!) === heute).length
  const regelIndex = new Map(paket.regeln.map((r, i) => [r.id, i]))
  const frei = o.test ? null : freieAufgaben(paket, staende)
  const neu = o.alle ? Number.MAX_SAFE_INTEGER : Math.max(0, (o.neuJeTag ?? GRAMMATIK_NEU_JE_TAG) - schonNeu)
  const neue = paket.aufgaben
    .map((a, i) => ({ a, i, zeit: aufgabeFreigabe(a.id, o.erstellt) }))
    .filter((x) => !staende[x.a.id]?.versuche && (!frei || frei.has(x.a.id)))
    // neueste Freigabe zuerst (zusammen angehängte als eine), darin Stufe, Regel und Reihenfolge wie bisher
    .sort(
      (x, y) =>
        Math.floor(y.zeit / GLEICHE_FREIGABE_MS) - Math.floor(x.zeit / GLEICHE_FREIGABE_MS) ||
        // Aufgabenbank (13.10.2026, abgestimmt): Teilbereiche der Reihe nach, darin erst Erkennen, dann Bilden …
        (x.a.uebung && y.a.uebung ? (regelIndex.get(x.a.regelId) ?? 0) - (regelIndex.get(y.a.regelId) ?? 0) : 0) ||
        (x.a.stufe ?? 0) - (y.a.stufe ?? 0) ||
        (regelIndex.get(x.a.regelId) ?? 0) - (regelIndex.get(y.a.regelId) ?? 0) ||
        x.i - y.i
    )
    .slice(0, neu)
    .map((x) => x.a.id)
  return [...faellig, ...foerderAusReserve(paket, staende), ...neue]
}

/** Schwierigkeiten in Regel und Übungsart: mindestens so viele Fehler … */
export const RESERVE_AB_FEHLER = 2
/** … bei mindestens diesem Fehleranteil */
export const RESERVE_AB_ANTEIL = 0.4
/** Höchstens so viele grundlegende Aufgaben je Regel und Übungsart auf einmal */
export const RESERVE_JE_MAL = 3

/**
 * Förderreserve (13.10.2026, Entscheidung der Lehrkraft: „die grundlegenden dürfen als Fördermaterial dienen, wenn Schüler
 * Schwierigkeiten mit der mittleren Schwierigkeit haben"): Hat ein Kind in einer Regel und Übungsart mindestens
 * RESERVE_AB_FEHLER Fehler bei RESERVE_AB_ANTEIL Fehleranteil, kommen bis zu RESERVE_JE_MAL noch nicht geübte grundlegende
 * Aufgaben genau dieser Regel und Übungsart vor den neuen dran. Wiederholt werden sie nicht (keine Karten im Kasten).
 */
export function foerderAusReserve(paket: Pick<GrammatikPaket, 'aufgaben' | 'reserve'>, staende: Record<string, WortStand>): string[] {
  if (!paket.reserve?.length) return []
  const aus: string[] = []
  const gruppen = new Map<string, { versuche: number; falsch: number }>()
  for (const a of paket.aufgaben) {
    const s = staende[a.id]
    if (!s?.versuche || !a.uebung) continue
    const g = gruppen.get(`${a.regelId}|${a.uebung}`) ?? { versuche: 0, falsch: 0 }
    g.versuche += s.versuche
    g.falsch += s.falsch ?? 0
    gruppen.set(`${a.regelId}|${a.uebung}`, g)
  }
  for (const [k, g] of gruppen) {
    if (g.falsch < RESERVE_AB_FEHLER || g.falsch / g.versuche < RESERVE_AB_ANTEIL) continue
    // Schon geübte Reserve dieser Gruppe zählt mit: nach RESERVE_JE_MAL richtigen ist die Hilfe getan
    const eigene = paket.reserve.filter((a) => `${a.regelId}|${a.uebung}` === k)
    const geschafft = eigene.filter((a) => (staende[a.id]?.versuche ?? 0) > (staende[a.id]?.falsch ?? 0)).length
    if (geschafft >= RESERVE_JE_MAL) continue
    aus.push(
      ...eigene
        .filter((a) => !staende[a.id]?.versuche)
        .slice(0, RESERVE_JE_MAL - geschafft)
        .map((a) => a.id)
    )
  }
  return aus
}
