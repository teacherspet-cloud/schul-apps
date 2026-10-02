/**
 * ZEILENWEISE TEILUNG von Materialtexten (02.10.2026).
 *
 * Befund der Lehrkraft (wiederholt): „Materialblöcke werden komplett auf die nächste Seite
 * verschoben, obwohl wahrscheinlich 5 Zeilen des Blocks noch auf die vorherige Seite gepasst
 * hätten." Bis dahin war die kleinste Umbruchstelle eines Textes der ABSATZ: Passte schon
 * Kopf + erster Absatz nicht mehr, wanderte das ganze Material; ein Text aus einem einzigen
 * Absatz ließ sich gar nicht teilen.
 *
 * Jetzt ist jede Zeile eine Einheit für den Seitenumbruch (shared/render/paginate.ts bleibt
 * unverändert – er sieht nur mehr, kleinere Einheiten). Gesetzt wird ein Absatzstück, indem der
 * GANZE Absatz in einen Rahmen gestellt wird, der nur die Zeilen des Stücks zeigt (Höhe fest,
 * Inhalt um die schon gezeigten Zeilen nach oben verschoben). So bricht der Text im Stück genau
 * so um wie beim Messen – in Ansicht, Druck und PDF dieselben Zeilen.
 *
 * Hier stehen nur die reinen Rechnungen (testbar ohne Browser); das Messen im DOM steht in
 * SheetPages.tsx (`textZeilen`), das Setzen in baustein/blockview.tsx (`MaterialText`).
 */
import type { PlacedItem } from './paginate'

/** Senkrechter Ausschnitt in px, relativ zur Oberkante des Absatzes */
export interface Streifen {
  top: number
  bottom: number
}

/**
 * Die Zeilen eines Absatzes aus den Rechtecken seiner Textstücke (`Range.getClientRects`).
 *
 * Ein Rechteck gehört zur laufenden Zeile, solange seine Mitte nicht unter deren Unterkante
 * liegt – so bleiben Stücke in anderer Schriftgröße (fett, kleiner gesetzt) in ihrer Zeile.
 * Hochgestellte Ziffern lässt der Aufrufer weg: Sie ragen nach oben und würden zwei Zeilen
 * verschmelzen.
 */
export function zeilenBaender(rects: readonly Streifen[]): Streifen[] {
  const sortiert = rects.filter((r) => r.bottom - r.top > 0.5).sort((a, b) => a.top + a.bottom - (b.top + b.bottom))
  const aus: Streifen[] = []
  for (const r of sortiert) {
    const zeile = aus[aus.length - 1]
    if (zeile && (r.top + r.bottom) / 2 <= zeile.bottom) {
      zeile.top = Math.min(zeile.top, r.top)
      zeile.bottom = Math.max(zeile.bottom, r.bottom)
    } else aus.push({ top: r.top, bottom: r.bottom })
  }
  return aus
}

/** Ein Hindernis gilt als zerschnitten, wenn es mehr als so viele px über und unter die Schnittstelle reicht */
const SCHNITT_TOLERANZ = 1

/**
 * Schnittstellen zwischen den Zeilen eines Absatzes und die Zahl der Textzeilen je Abschnitt.
 *
 * Geschnitten wird in der MITTE zwischen der Unterkante der einen und der Oberkante der nächsten
 * Zeile – das ist die Grenze der Zeilenboxen, auf beiden Seiten bleibt der halbe Durchschuss als
 * Sicherheit gegen Rundung. Nie mitten in einer Zeile: Eine Schnittstelle, die ein Element
 * überdeckt (Formel, Bild, Lücke als Kästchen), entfällt; die Zeilen darüber und darunter bilden
 * dann zusammen EINE Einheit (`zeilenJe` > 1).
 */
export function zeilenSchnitte(baender: readonly Streifen[], hindernisse: readonly Streifen[] = []): { schnitte: number[]; zeilenJe: number[] } {
  const schnitte: number[] = []
  const zeilenJe: number[] = []
  let zeilen = 0
  baender.forEach((b, i) => {
    zeilen++
    const naechste = baender[i + 1]
    if (!naechste) return
    const s = (b.bottom + naechste.top) / 2
    const zerschnitten = hindernisse.some((h) => h.top < s - SCHNITT_TOLERANZ && h.bottom > s + SCHNITT_TOLERANZ)
    // Schnittstellen müssen aufsteigen – sonst lieber nicht schneiden
    if (zerschnitten || s <= (schnitte[schnitte.length - 1] ?? 0)) return
    schnitte.push(s)
    zeilenJe.push(zeilen)
    zeilen = 0
  })
  zeilenJe.push(Math.max(zeilen, baender.length ? 0 : 1))
  return { schnitte, zeilenJe }
}

/** Eine gemessene Einheit eines Materialtexts: Absatz oder Worterklärungen */
export interface AbsatzMessung {
  /** Index des Absatzes; die Worterklärungen tragen die Zahl der Absätze */
  absatz: number
  /** Höhe der Einheit von Oberkante zu Oberkante der nächsten (wie `units` in paginate) */
  hoehe: number
  /** Schnittstellen innerhalb der Einheit (px ab ihrer Oberkante, aufsteigend) */
  schnitte: number[]
  /** Textzeilen je Abschnitt (Länge = schnitte.length + 1); Worterklärungen 0 */
  zeilenJe: number[]
  /** Fußnoten- bzw. Worthilfenummern mit der senkrechten Mitte ihrer Ziffer (px ab Oberkante) */
  marken: { nr: number; mitte: number }[]
}

/** Wo eine Zeilen-Einheit im Text steht – für das Zurückrechnen der Stücke auf Absätze */
export interface ZeilenStelle {
  absatz: number
  /** Oberkante und Unterkante des Abschnitts, px ab Oberkante des Absatzes */
  oben: number
  unten: number
  /** Erster bzw. letzter Abschnitt seines Absatzes */
  erste: boolean
  letzte: boolean
  /** Anmerkungen, deren Ziffer in diesem Abschnitt steht */
  noten: number[]
}

/**
 * Aus den gemessenen Absätzen die Einheiten für den Seitenumbruch: je Abschnitt (meist eine
 * Zeile) eine Höhe, seine Zeilenzahl (für die Zeilennummern) und seine Stelle im Text.
 * `rest`: Anmerkungen ohne Stelle im Text – sie gehören zur letzten Einheit.
 */
export function zeilenEinheiten(absaetze: readonly AbsatzMessung[], rest: readonly number[] = []): { units: number[]; lines: number[]; karte: ZeilenStelle[] } {
  const units: number[] = []
  const lines: number[] = []
  const karte: ZeilenStelle[] = []
  for (const a of absaetze) {
    const grenzen = [0, ...a.schnitte, a.hoehe]
    const n = a.schnitte.length + 1
    for (let j = 0; j < n; j++) {
      units.push(grenzen[j + 1] - grenzen[j])
      lines.push(a.zeilenJe[j] ?? 0)
      karte.push({
        absatz: a.absatz,
        oben: grenzen[j],
        unten: grenzen[j + 1],
        erste: j === 0,
        letzte: j === n - 1,
        // Die Ziffer steht im Abschnitt, in dem ihre Mitte liegt (über der ersten Schnittstelle: erster Abschnitt)
        noten: a.marken.filter((m) => a.schnitte.filter((s) => s <= m.mitte).length === j).map((m) => m.nr)
      })
    }
  }
  if (karte.length && rest.length) karte[karte.length - 1].noten.push(...rest)
  return { units, lines, karte }
}

/**
 * Ein Stück in Zeilen-Einheiten [from, to) zurück auf Absätze: `from`/`to` zählen danach wieder
 * Absätze (wie bei allen anderen Bausteinen), `absatzAb`/`absatzBis` sagen, ab welcher bzw. bis
 * zu welcher Höhe der erste bzw. letzte Absatz gezeigt wird, `noten` welche Anmerkungen auf
 * dieser Seite stehen. Zeilennummern (`lineStart`/`lineCount`) bleiben, wie paginate sie zählte.
 */
export function aufAbsaetze(it: PlacedItem, karte: readonly ZeilenStelle[]): PlacedItem {
  const a = it.from ?? 0
  const b = Math.min(it.to ?? karte.length, karte.length)
  if (!karte.length || b <= a) return it
  const erste = karte[a]
  const letzte = karte[b - 1]
  const aus: PlacedItem = { ...it, from: erste.absatz, to: letzte.absatz + 1, noten: karte.slice(a, b).flatMap((k) => k.noten) }
  delete aus.absatzAb
  delete aus.absatzBis
  if (!erste.erste) aus.absatzAb = erste.oben
  if (!letzte.letzte) aus.absatzBis = letzte.unten
  return aus
}
