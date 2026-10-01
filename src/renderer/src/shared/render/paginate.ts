/**
 * Verteilt gemessene Bausteine auf A4-Seiten.
 * Teilbare Bausteine (mit `units`) dürfen zwischen zwei Einheiten geteilt werden – an den natürlichen
 * Stellen, die der Baustein selbst als Einheiten ausweist (Absatz, Frage, Tabellenzeile, Schreiblinie …);
 * alles andere bleibt zusammen.
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
  /**
   * Einheit i ist an die FOLGENDE gebunden: nach ihr wird nicht umbrochen (01.10.2026).
   *
   * Wunsch der Lehrkraft: „Die Aufgabenstellung sollte nicht einzeln vom Rest der Aufgabe
   * getrennt werden (Aufgabenstellung auf S. 1 unten und Fragen/Sätze auf der nächsten Seite)."
   * Die Arbeitsanweisung selbst steht im Kopf – der kommt nie ohne erste Einheit auf eine Seite.
   * Gebunden wird zusätzlich, was zur Stellung gehört oder nur die Folgezeile einleitet: Kopf
   * einer Teilaufgabe („b) Ergänze …"), Vorgaben einer Schreibaufgabe, gelöstes Beispiel „0.",
   * Überschrift des Erwartungshorizonts. Passt die Kette nicht mehr, wandert sie geschlossen.
   */
  unitGlue?: boolean[]
  /**
   * Was ein Folgestück, das mit Einheit i beginnt, ZUSÄTZLICH oben wiederholt – etwa die
   * Kopfzeile einer Richtig/Falsch-Tabelle innerhalb einer Aufgabe (01.10.2026).
   */
  unitRepeat?: number[]
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
  /**
   * Spaltenbreiten in Prozent für das Stück einer GETEILTEN Tabelle (30.09.2026).
   *
   * Ohne von Hand gezogene Maße setzt der Browser die Spalten nach dem Inhalt. Ein Tabellenstück
   * enthält aber nur einen Teil der Zeilen – seine Spalten wurden anders breit, die Zellen
   * brachen anders um, und die Zeilen wurden höher als gemessen: Die letzte Zeile ragte halb
   * über den Seitenrand (Befund der Lehrkraft). Jedes Stück bekommt deshalb die Breiten, die die
   * GANZE Tabelle beim Messen hatte.
   */
  spalten?: number[]
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
 * KEINE Mindestzahl an Einheiten je Teilstück mehr (01.10.2026).
 *
 * Bis dahin galt die Buchsatzregel „mindestens zwei Einheiten" (Schusterjunge/Hurenkind,
 * eingeführt am 25.09.2026 nach „Aufgabe/Material wird zerrissen"). Eine Einheit ist hier aber
 * keine Zeile, sondern ein ganzer Absatz, eine Frage, eine Tabellenzeile – die Regel schob ganze
 * Absätze auf die nächste Seite und kostete Seiten. Entscheidung der Lehrkraft: keine harte
 * Mindestzeilen-Regel; maßgeblich ist allein, dass die Aufgabenstellung nie ohne den ersten
 * Teil ihres Inhalts dasteht (Kopf + erste Einheit, gebundene Einheiten siehe `unitGlue`).
 */

/**
 * `abzug`: je Seite (0-basiert) so viele px weniger Platz. Die Prüfung nach dem Setzen
 * (SheetPages, `seitenUeberlauf`) trägt hier ein, um wie viel eine Seite tatsächlich über den
 * Satzspiegel lief – beim nächsten Durchgang wandert dann das Überstehende auf die Folgeseite,
 * statt abgeschnitten zu werden (30.09.2026).
 */
export function paginate(items: MeasuredItem[], firstPageHeight: number, otherPageHeight: number, abzug: readonly number[] = []): PagePlan[] {
  const pages: PagePlan[] = [{ items: [], overflow: false }]
  let remaining = firstPageHeight - (abzug[0] ?? 0)
  const page = (): PagePlan => pages[pages.length - 1]
  const newPage = (): void => {
    pages.push({ items: [], overflow: false })
    remaining = otherPageHeight - (abzug[pages.length - 1] ?? 0)
  }
  /** Kleinstes erstes Stück: Kopf + erste Einheit samt allem, was an sie gebunden ist */
  const minHeight = (it: MeasuredItem): number => {
    if (!it.units?.length) return it.height
    let h = it.headHeight ?? 0
    for (let k = 0; k < it.units.length; k++) {
      h += it.units[k]
      if (!it.unitGlue?.[k]) break
    }
    return h
  }

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
    // Maßgeblich ist der Platz der NÄCHSTEN Seite – mit ihrem Abzug aus der Prüfung
    const naechste = otherPageHeight - (abzug[pages.length] ?? 0)
    if (item.keepTogether && page().items.length > 0 && item.height <= naechste + EPS && remaining < otherPageHeight * KEEP_TOGETHER_MAX_GAP) {
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
      const n = item.units.length
      const gebunden = (k: number): boolean => Boolean(item.unitGlue?.[k])
      while (from < n) {
        // Ein Folgestück wiederholt seinen Kopf (Fortsetzungshinweis, Tabellenkopf) – und ggf. den einer inneren Tabelle
        const head = from === 0 ? (item.headHeight ?? 0) : (item.continuedHead ?? 0) + (item.unitRepeat?.[from] ?? 0)
        let used = head
        let to = from
        while (to < n && used + mitFuss(to) <= remaining + EPS) {
          used += mitFuss(to)
          to++
        }
        /*
         * Gebundene Einheiten (Aufgabenstellung, Kopf einer Teilaufgabe …) nie als letzte eines
         * Stücks: so weit zurückgehen, bis nach einer freien Einheit umbrochen wird.
         */
        const gierig = to
        while (to > from && to < n && gebunden(to - 1)) {
          to--
          used -= mitFuss(to)
        }
        if (to === from) {
          // Nicht einmal Kopf + erste Einheit (samt Gebundenem) passen: ganzer Rest auf die nächste Seite
          if (page().items.length > 0) {
            newPage()
            continue
          }
          if (gierig > from) {
            // Oben auf einer leeren Seite und die Kette ist länger als die Seite: dann doch innerhalb der Kette teilen
            to = gierig
            used = head
            for (let k = from; k < to; k++) used += mitFuss(k)
          } else {
            // Einheit größer als eine ganze Seite: trotzdem setzen
            to = from + 1
            used = head + mitFuss(from)
            page().overflow = true
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
