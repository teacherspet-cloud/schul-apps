/**
 * Verteilt gemessene Bausteine auf A4-Seiten.
 * Texte und Tabellen dürfen an Absatz- bzw. Zeilengrenzen geteilt werden, alles andere bleibt zusammen.
 */

export interface MeasuredItem {
  id: string
  /** Gesamthöhe in px (inkl. Abstand nach unten) */
  height: number
  /** Teilbare Bausteine: Höhe des Kopfes (Titel, Tabellenkopf) und der einzelnen Einheiten */
  headHeight?: number
  /**
   * Höhe des Kopfes auf einem FOLGESTÜCK – etwa der Hinweis „Aufgabe 3 (Fortsetzung)".
   *
   * Er gehört zu keiner Einheit und stand deshalb in keiner Rechnung: Auf jeder Folgeseite
   * lief der Inhalt um genau diese Höhe über den Rand hinaus (gemessen 24.09.2026: 6 px).
   */
  continuedHead?: number
  /** Höhe des FUSSES (Wortzahl, Quellenangabe) – er steht nur unter dem letzten Stück (27.09.2026) */
  footHeight?: number
  units?: number[]
  /** Zeilen je Einheit (für fortlaufende Zeilennummern) */
  unitLines?: number[]
  /** Nicht allein am Seitenende stehen lassen (z. B. Abschnittsüberschrift) */
  keepWithNext?: boolean
  /**
   * Zusammengehöriges Material (Text, Tabelle): lieber vollständig auf die nächste Seite setzen,
   * als es nach wenigen Zeilen umzubrechen. Geteilt wird nur, was nicht auf eine ganze Seite passt
   * oder schon in der oberen Seitenhälfte beginnt (sonst bliebe eine fast leere Seite zurück).
   */
  keepTogether?: boolean
  /**
   * Beginnt auf einer NEUEN Seite, auch wenn auf der laufenden noch Platz waere.
   *
   * Wunsch der Lehrkraft (24.09.2026) fuer Uebungsklausuren: „fuege bei uebungsklausuren die
   * aufgabenstellungen ausserdem an den anfang auf eine eigene seite und das material auf
   * nachfolgende seiten."
   *
   * So ist es auch in der Pruefung: Der Pruefling liest zuerst die Aufgaben und weiss beim
   * Lesen des Materials, worauf er achten muss. Steht beides gemischt auf einer Seite,
   * blaettert er staendig.
   */
  pageBreakBefore?: boolean
}

export interface PlacedItem {
  id: string
  /** Bereich der Einheiten [from, to) bei geteilten Bausteinen */
  from?: number
  to?: number
  /** Erste Zeilennummer (0-basiert) und Zeilenzahl des Stücks */
  lineStart?: number
  lineCount?: number
  /** Fortsetzung eines geteilten Bausteins */
  continued?: boolean
  /**
   * Zusaetzliche Schreiblinien, die den Rest der Seite fuellen.
   *
   * Die Linienzahl einer Schreibaufgabe folgt der geforderten Woerterzahl. Auf den unteren
   * Niveaustufen ist die kleiner – dort blieb der untere Teil des Blattes leer, waehrend das
   * erweiterte Niveau eine volle Seite bekam. Entschieden am 24.09.2026: Alle Niveaus sehen
   * gleich aus. Berechnet wird die Zahl dort, wo die gemessenen Hoehen vorliegen.
   */
  fillLines?: number
}

export interface PagePlan {
  items: PlacedItem[]
  /** Ein Baustein ist größer als die Seite */
  overflow: boolean
}

const EPS = 0.5
/** Höchstens so viel einer Seite bleibt leer, wenn Material zusammengehalten wird */
const KEEP_TOGETHER_MAX_GAP = 0.5
/*
 * Wie viele Einheiten mindestens auf ein Teilstück gehören.
 *
 * Gemeldet am 25.09.2026: „sobald man den notizrand aktiviert, geht etwas an den
 * seitenumbrüchen kaputt … Aufgabe/Material wird zerrissen." Der Notizrand ist nicht die
 * Ursache – er macht den Text schmaler und damit höher und trifft damit nur viel häufiger
 * einen Fall, den die Verteilung vorher nicht kannte: Sie füllte die Seite bis zur letzten
 * passenden Einheit, und was übrig blieb, stand allein auf der Folgeseite. Gemessen: ein
 * einzelner Absatz auf einer sonst leeren vierten Seite.
 *
 * Im Buchsatz heißen die beiden Fälle Schusterjunge (erste Zeile bleibt allein unten) und
 * Hurenkind (letzte Zeile steht allein oben); beide gelten als Satzfehler. Zwei Einheiten
 * sind die überlieferte Untergrenze.
 */
const MIN_EINHEITEN = 2

export function paginate(items: MeasuredItem[], firstPageHeight: number, otherPageHeight: number): PagePlan[] {
  const pages: PagePlan[] = [{ items: [], overflow: false }]
  let remaining = firstPageHeight
  const page = (): PagePlan => pages[pages.length - 1]
  const newPage = (): void => {
    pages.push({ items: [], overflow: false })
    remaining = otherPageHeight
  }
  const minHeight = (it: MeasuredItem): number => (it.units?.length ? (it.headHeight ?? 0) + it.units[0] : it.height)

  items.forEach((item, index) => {
    const next = items[index + 1]
    // Erzwungener Umbruch: Das Stueck beginnt oben auf einer neuen Seite
    if (item.pageBreakBefore && page().items.length > 0) newPage()

    // Überschriften nicht allein am Seitenende
    if (item.keepWithNext && next && page().items.length > 0 && item.height + minHeight(next) > remaining + EPS) {
      newPage()
    }

    if (item.height <= remaining + EPS) {
      page().items.push(
        item.units
          ? {
              id: item.id,
              from: 0,
              to: item.units.length,
              lineStart: 0,
              lineCount: sum(item.unitLines ?? [])
            }
          : { id: item.id }
      )
      remaining -= item.height
      return
    }

    // Zusammengehöriges Material passt auf eine neue Seite und würde erst in der unteren Seitenhälfte beginnen → nicht teilen
    if (item.keepTogether && page().items.length > 0 && item.height <= otherPageHeight + EPS && remaining < otherPageHeight * KEEP_TOGETHER_MAX_GAP) {
      newPage()
      page().items.push(
        item.units
          ? {
              id: item.id,
              from: 0,
              to: item.units.length,
              lineStart: 0,
              lineCount: sum(item.unitLines ?? [])
            }
          : { id: item.id }
      )
      remaining -= item.height
      return
    }

    if (item.units && item.units.length > 1) {
      let from = 0
      let lineCursor = 0
      // Der Fuß gehört zur letzten Einheit: Wer sie setzt, setzt auch ihn
      const mitFuss = (k: number): number => item.units![k] + (k === item.units!.length - 1 ? (item.footHeight ?? 0) : 0)
      while (from < item.units.length) {
        const head = from === 0 ? (item.headHeight ?? 0) : (item.continuedHead ?? 0)
        let used = head
        let to = from
        while (to < item.units.length && used + mitFuss(to) <= remaining + EPS) {
          used += mitFuss(to)
          to++
        }
        /*
         * Schusterjunge: Es passt nichts oder zu wenig – dann faengt der Baustein lieber
         * ganz oben auf der naechsten Seite an, statt mit einer einzelnen Zeile unten.
         */
        const zuWenigHier = to - from < MIN_EINHEITEN && item.units.length - from > to - from
        if (to === from || zuWenigHier) {
          if (page().items.length > 0) {
            newPage()
            continue
          }
          if (to === from) {
            // Einheit größer als eine ganze Seite: trotzdem setzen
            to = from + 1
            used = head + mitFuss(from)
            page().overflow = true
          }
        }
        /*
         * Hurenkind: Bliebe fuer die Folgeseite nur noch eine einzelne Einheit uebrig, wird
         * sie hier abgegeben – dann stehen drueben zwei statt einer.
         */
        const rest = item.units.length - to
        if (rest > 0 && rest < MIN_EINHEITEN && to - from > MIN_EINHEITEN) {
          const abgeben = MIN_EINHEITEN - rest
          for (let k = 0; k < abgeben; k++) {
            to--
            used -= mitFuss(to)
          }
        }
        const lineCount = sum((item.unitLines ?? []).slice(from, to))
        page().items.push({
          id: item.id,
          from,
          to,
          lineStart: lineCursor,
          lineCount,
          continued: from > 0
        })
        lineCursor += lineCount
        remaining -= used
        from = to
        if (from < item.units.length) newPage()
      }
      return
    }

    if (page().items.length > 0) newPage()
    page().items.push({ id: item.id })
    if (item.height > remaining + EPS) page().overflow = true
    remaining -= item.height
  })

  return pages
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/**
 * Verteilt die Inhalte möglichst gleichmäßig auf genau `targetPages` Seiten.
 * Dazu wird die nutzbare Seitenhöhe so weit verkleinert, wie es die Zielseitenzahl zulässt.
 * Liefert null, wenn der Inhalt schon bei voller Seitenhöhe mehr Seiten braucht.
 */
export function paginateSpread(items: MeasuredItem[], firstPageHeight: number, otherPageHeight: number, targetPages: number): PagePlan[] | null {
  const full = paginate(items, firstPageHeight, otherPageHeight)
  if (full.length > targetPages) return null
  if (full.length === targetPages || items.length <= 1) return full
  // Kleinsten Füllgrad suchen, bei dem der Inhalt noch auf targetPages Seiten passt → gleichmäßig verteilt
  let low = 0.05
  let high = 1
  let best = full
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2
    const plan = paginate(items, firstPageHeight * mid, otherPageHeight * mid)
    const overflow = plan.some((p) => p.overflow)
    if (plan.length <= targetPages && !overflow) {
      best = plan
      high = mid
    } else {
      low = mid
    }
  }
  return best
}
