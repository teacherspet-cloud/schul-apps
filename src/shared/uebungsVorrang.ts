/**
 * Übungsvorrang (12.10.2026, Entscheidung der Lehrkraft: „Schüler sollen in ihren Übungen immer zuerst die zuletzt für
 * sie freigeschalteten Abschnitte oder für angekündigte Tests angewählte Abschnitte zur Übung erhalten"):
 *
 *  - Neue Wörter in Freigabe-Reihenfolge: der zuletzt freigeschaltete Abschnitt zuerst, darin Lehrwerk-Reihenfolge (statt
 *    zufällig). Abschnitte, die zusammen freigeschaltet wurden (höchstens eine Stunde auseinander), gelten als EINE
 *    Freigabe; darin kommt der im Buch späteste Abschnitt zuerst (27.10.2026, Entscheidung der Lehrkraft: bei einer
 *    Sammel-Freigabe ist die Klasse am letzten Abschnitt). Ohne Zeitpunkt: Lehrwerk-Reihenfolge rückwärts (nach der Stelle).
 *  - Fällige Wiederholungen aus den Test- bzw. neuesten Abschnitten stehen vor älteren fälligen (`vorrang` am Wort,
 *    shared/vokabeltrainer.ts `sitzungsWoerter`).
 *  - Test-Vorlauf: Ab der Ankündigung (Termin gesetzt) haben die gewählten Abschnitte des Tests Vorrang; das Tagesziel
 *    für neue Wörter steigt so, dass bis 3 Tage vor dem Test jedes Testwort mindestens einmal dran war – gleichmäßig auf
 *    die verbleibenden Tage verteilt, höchstens 30 je Tag (Faustregel, `TEST_NEU_HOECHSTENS`).
 *  - Spiele ziehen ~70 % ihrer Wörter aus den Vorrang-Abschnitten (Test vor neuester Freigabe, shared/vokabelSpiele.ts).
 *
 * Rein rechnend: Der Server setzt `rang`/`vorrang` an die Wörter (server/vokabeln.ts, server/sprachstand.ts) und schickt
 * das erhöhte Tagesziel mit – so rechnen Trainer, Startseite, Erinnerungen und Spiele mit derselben Zahl.
 */
import { heuteNeu, TAG, tagVon, type Vokabel, type WortStand } from './vokabeltrainer'
import { TEST_PAUSE_TAGE } from './sprachstand'

/** Abschnitte, die höchstens so weit auseinander freigeschaltet wurden, gelten als eine Freigabe */
export const GLEICHE_FREIGABE_MS = 60 * 60 * 1000
/** Faustregel: mehr neue Wörter je Tag verlangt auch ein angekündigter Test nicht */
export const TEST_NEU_HOECHSTENS = 30
/** Anteil der Spielwörter aus den Vorrang-Abschnitten */
export const SPIEL_VORRANG_ANTEIL = 0.7

export interface VorrangAbschnitt {
  /** Kennungen der Wörter in Lehrwerk-Reihenfolge */
  ids: string[]
  /** Zeitpunkt der Freigabe (ms); 0 = unbekannt */
  zeit: number
  /** Stelle im Lehrwerk bzw. im Kurs (größer = später im Buch) */
  stelle: number
  /** Für einen angekündigten Test gewählt */
  test?: boolean
}

/**
 * Abschnitte in Übungsreihenfolge: Test-Abschnitte zuerst, dann die Freigaben vom neuesten zur ältesten (eine Freigabe
 * in Buchreihenfolge), zuletzt die ohne Zeitpunkt rückwärts nach ihrer Stelle. `neu` = Abschnitte der neuesten Freigabe.
 */
export function abschnitteOrdnen<A extends VorrangAbschnitt>(abschnitte: A[]): { reihe: A[]; neu: Set<A> } {
  const mitZeit = abschnitte.filter((a) => a.zeit > 0).sort((a, b) => b.zeit - a.zeit || a.stelle - b.stelle)
  const gruppen: A[][] = []
  for (const a of mitZeit) {
    const g = gruppen[gruppen.length - 1]
    if (g && g[0].zeit - a.zeit <= GLEICHE_FREIGABE_MS) g.push(a)
    else gruppen.push([a])
  }
  // Innerhalb einer Sammel-Freigabe der im Buch späteste Abschnitt zuerst (27.10.2026)
  for (const g of gruppen) g.sort((a, b) => b.stelle - a.stelle)
  for (const a of abschnitte.filter((x) => !(x.zeit > 0)).sort((a, b) => b.stelle - a.stelle)) gruppen.push([a])
  const neu = new Set<A>(gruppen[0] ?? [])
  const alle = gruppen.flat()
  return { reihe: [...alle.filter((a) => a.test), ...alle.filter((a) => !a.test)], neu }
}

/**
 * Rang und Vorrang an die Wörter setzen (neue Objekte; die Reihenfolge der Liste bleibt). Ein Wort in mehreren
 * Abschnitten zählt beim ersten in Übungsreihenfolge. Wörter ohne Abschnitt bleiben ohne Angabe.
 */
export function vorrangSetzen<V extends Vokabel>(woerter: V[], abschnitte: VorrangAbschnitt[]): V[] {
  if (!abschnitte.length) return woerter
  const { reihe, neu } = abschnitteOrdnen(abschnitte)
  const info = new Map<string, { rang: number; vorrang?: 'test' | 'neu' }>()
  let rang = 0
  for (const a of reihe)
    for (const id of a.ids) {
      if (info.has(id)) continue
      info.set(id, { rang: rang++, ...(a.test ? { vorrang: 'test' as const } : neu.has(a) ? { vorrang: 'neu' as const } : {}) })
    }
  return woerter.map((v) => {
    const i = info.get(v.id)
    if (!i) return v
    const { rang: _r, vorrang: _v, ...rest } = v
    void _r
    void _v
    return { ...rest, rang: i.rang, ...(i.vorrang ? { vorrang: i.vorrang } : {}) } as V
  })
}

/** Kalendertage (Berlin) von heute bis zum Tag des Termins (morgen = 1) */
export function tageBisTermin(termin: number, jetzt = Date.now()): number {
  const tag = (ms: number): number => {
    const t = tagVon(ms)
    return Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10))
  }
  return Math.round((tag(termin) - tag(jetzt)) / TAG)
}

/**
 * Tagesziel vor einem angekündigten Test (Faustregel, 12.10.2026): Die noch nie geübten Testwörter (dazu die heute
 * erstmals geübten – sonst sänke das Ziel im Lauf des Tages) verteilen sich auf die Tage bis 3 Tage vor dem Test
 * (heute eingeschlossen; danach bzw. ab dann alles Übrige sofort). Nie unter dem Ziel der Lehrkraft, wegen des Tests
 * höchstens `TEST_NEU_HOECHSTENS` je Tag. Ohne Test (oder schon vorbei) bleibt das Ziel.
 */
export function tageszielVorTest(
  ziel: number,
  woerter: Pick<Vokabel, 'id' | 'vorrang'>[],
  staende: Record<string, WortStand>,
  testTermin: number | null | undefined,
  jetzt = Date.now()
): number {
  if (typeof testTermin !== 'number' || testTermin <= jetzt) return ziel
  const heute = tagVon(jetzt)
  const offen = woerter.filter((v) => {
    if (v.vorrang !== 'test') return false
    const st = staende[v.id]
    return !st || !st.versuche || heuteNeu(st, heute)
  }).length
  if (!offen) return ziel
  const tage = Math.max(1, tageBisTermin(testTermin, jetzt) - TEST_PAUSE_TAGE + 1)
  const noetig = Math.ceil(offen / tage)
  return noetig > ziel ? Math.min(Math.max(ziel, TEST_NEU_HOECHSTENS), noetig) : ziel
}
