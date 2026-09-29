/**
 * EINE Paginierung für Ansicht und PDF (29.09.2026 nachts, Bericht der Lehrkraft: „Die Seitenzahl
 * kann zwischen Ansicht und PDF um eine Seite abweichen" und „eine sehr hohe Randnotiz neben den
 * letzten Zeilen einer Seite rutscht an den Anfang der nächsten Seite").
 *
 * Hier stehen nur die REGELN – ohne DOM, damit die Tests sie prüfen. Gemessen wird in
 * seitenMessen.ts (Ansicht: am gezeichneten Blatt, PDF: in einem unsichtbaren Rahmen in A4-Breite);
 * beide geben dieselben Maße an dieselben Funktionen.
 *
 * Regeln:
 * - Ein Block passt, wenn sein TEXT noch auf die Seite passt (die Randnotizen daneben dürfen
 *   überstehen – sie weichen danach nach oben aus).
 * - Passt ein Absatz nicht, wird er an einer ZEILENGRENZE geteilt – so bleibt keine Seite halb leer,
 *   wenn der nächste Absatz teilweise noch passt. Mindestens zwei Zeilen oben und unten
 *   (Schusterjunge/Hurenkind), sonst beginnt der Absatz auf der nächsten Seite.
 * - Tabellen und Listen des Kastens werden zwischen zwei Zeilen bzw. Punkten geteilt, nie in einer
 *   Zeile; eine Bereichsüberschrift bleibt bei ihrer ersten Zeile.
 * - Randnotizen, die unten nicht mehr passen, weichen nach oben aus (der Stapel endet an der
 *   Seitenunterkante); reicht das nicht, wird ihre Schrift schrittweise bis auf 80 % kleiner. Nie
 *   auf die Folgeseite.
 */
import { SEITE_NUTZ_MM, type NotizLage } from './blattLayout'

/** Spielraum für Rundungen beim Messen (mm) */
const TOL = 0.3

export interface MessBlock {
  key: string
  basis: string
  /** Beginn des Teils: Zeichenposition (Absatz) bzw. erster Eintrag (Kasten) */
  von: number
  art: string
  /** Höhe des Blocks samt Randnotizen (mm) */
  hoehe: number
  /** Absatz: Textzeilen. `start(n)` = Zeichenposition (im ganzen Absatz) des ersten Zeichens der Zeile n */
  text?: { oben: number; zeile: number; zeilen: number; start: (n: number) => number | null }
  /** Kasten: teilbare Einträge (Zeilen einer Tabelle, Punkte einer Liste), Lage im Block (mm) */
  posten?: { oben: number; unten: number; halten?: boolean }[]
  /** Innenabstand unten (mm) – steht unter dem letzten Eintrag */
  polster?: number
}

export interface SeitenErgebnis {
  /** Ein Block muss (weiter) geteilt werden: danach neu messen */
  schnitt: { basis: string; stellen: number[] } | null
  /** Seitenanfänge ab Seite 2 mit dem freien Rest der Seite davor */
  seiten: { start: string; rest: number }[]
  /**
   * Absätze am Seitenende, deren Randnotizen unten überstanden: Höhe (mm), auf die ihre Textspalte
   * begrenzt wird – sonst liefen die Schreiblinien über die Seite hinaus (die Notizen rücken nach oben)
   */
  kappen: Record<string, number>
}

const runde = (x: number): number => Math.round(x * 10) / 10

/** Was von einem Block auf der Seite stehen muss (Absatz: nur der Text – die Notizen dürfen ausweichen) */
const noetig = (b: MessBlock): number => (b.text ? (b.text.zeilen ? b.text.oben + b.text.zeilen * b.text.zeile : 0) : b.hoehe)

const teilbar = (b: MessBlock): boolean => Boolean((b.text && b.text.zeilen >= 2) || (b.posten && b.posten.length >= 2))

/**
 * Wo ein Absatz geteilt wird, damit der erste Teil in `frei` mm passt – und, falls der Rest höher
 * als eine Seite ist, gleich die weiteren Schnitte (die Zeilen sind bekannt). null: nicht teilbar.
 */
function textSchnitte(b: MessBlock, frei: number, seite: number, oben: boolean): number[] | null {
  const t = b.text!
  const passen = (platz: number, kopf: number): number => Math.floor((platz - kopf + TOL) / t.zeile)
  let n = passen(frei, t.oben)
  if (n >= t.zeilen) return null
  if (!oben) {
    if (t.zeilen - n < 2) n = t.zeilen - 2
    if (n < 2) return null
  } else n = Math.max(1, n)
  if (n <= 0 || n >= t.zeilen) return null
  const zeilen: number[] = [n]
  // Weitere Seiten: der Rest beginnt oben auf einer neuen Seite
  const jeSeite = Math.max(1, passen(seite, 0))
  let z = n
  while (t.zeilen - z > jeSeite) {
    let naechste = z + jeSeite
    if (t.zeilen - naechste < 2) naechste = t.zeilen - 2
    if (naechste <= z) break
    zeilen.push(naechste)
    z = naechste
  }
  const stellen = zeilen.map((k) => t.start(k)).filter((s): s is number => s != null && s > b.von)
  return stellen.length ? stellen : null
}

/** Wo eine Tabelle/Liste geteilt wird (Nummer des ersten Eintrags im Rest) – null: nicht teilbar */
function postenSchnitt(b: MessBlock, frei: number, oben: boolean): number | null {
  const p = b.posten!
  let j = 0
  for (let k = 1; k < p.length; k++) if (p[k - 1].unten + (b.polster ?? 0) <= frei + TOL) j = k
  // Eine Bereichsüberschrift nicht allein unten stehen lassen
  while (j > 1 && p[j - 1].halten) j--
  if (j >= 1 && p[j - 1].halten) j = 0
  if (j < 1) return oben ? b.von + 1 : null
  return b.von + j
}

/**
 * Die Seiten eines Blatts aus den gemessenen Blöcken. Liefert entweder einen nötigen Schnitt (dann
 * nach dem Teilen neu messen) oder die fertigen Seitenanfänge.
 */
export function seitenPlanen(bloecke: MessBlock[], seite = SEITE_NUTZ_MM): SeitenErgebnis {
  const seiten: { start: string; rest: number }[] = []
  const kappen: Record<string, number> = {}
  let belegt = 0
  let letzter: { b: MessBlock; oben: number } | null = null
  const setze = (b: MessBlock): void => {
    letzter = { b, oben: belegt }
    belegt += b.hoehe
  }
  for (let i = 0; i < bloecke.length; i++) {
    const b = bloecke[i]
    if (belegt + noetig(b) <= seite + TOL) {
      setze(b)
      continue
    }
    const frei = seite - belegt
    const oben = belegt === 0
    if (teilbar(b)) {
      if (b.text) {
        const stellen = textSchnitte(b, frei, seite, oben)
        if (stellen) return { schnitt: { basis: b.basis, stellen }, seiten, kappen }
      } else {
        const s = postenSchnitt(b, frei, oben)
        if (s != null && s > b.von) return { schnitt: { basis: b.basis, stellen: [s] }, seiten, kappen }
      }
    }
    // Oben auf der Seite und trotzdem zu hoch (Bild, sehr hoher Abschnitt): bleibt, wie er ist
    if (oben) {
      setze(b)
      continue
    }
    // Standen Randnotizen des letzten Absatzes unten über: seine Textspalte endet an der Seitenunterkante
    const l = letzter as { b: MessBlock; oben: number } | null
    if (frei < -TOL && l?.b.art === 'abs') kappen[l.b.key] = runde(seite - l.oben)
    seiten.push({ start: b.key, rest: runde(Math.max(0, frei)) })
    belegt = 0
    letzter = null
    i--
  }
  return { schnitt: null, seiten, kappen }
}

export interface MessNotiz {
  id: string
  /** Oberkante auf der Seite (mm) */
  oben: number
  hoehe: number
}

/** Schriftgrößen, die eine Notiz stufenweise bekommen kann, wenn Ausweichen allein nicht reicht */
export const NOTIZ_MASSE = [1, 0.95, 0.9, 0.85, 0.8] as const

/**
 * Randnotizen einer Seite einpassen: Endet der Stapel unter der Seitenunterkante, rücken die
 * untersten Notizen nach oben (Abstand `luecke`), bis alles passt; reicht der Platz über
 * `minOben` (z. B. unter dem Kopf) nicht, wird ihre Schrift schrittweise kleiner (bis 80 %).
 * Liefert nur die Notizen, die sich ändern.
 */
export function notizenEinpassen(notizen: MessNotiz[], seite = SEITE_NUTZ_MM, minOben = 0, luecke = 1.5): Record<string, NotizLage> {
  const liste = [...notizen].sort((x, y) => x.oben - y.oben)
  if (!liste.length || Math.max(...liste.map((n) => n.oben + n.hoehe)) <= seite + TOL) return {}
  let letzte: Record<string, NotizLage> = {}
  for (const mass of NOTIZ_MASSE) {
    const out: Record<string, NotizLage> = {}
    let grenze = seite
    let ok = true
    for (let i = liste.length - 1; i >= 0; i--) {
      const n = liste[i]
      // Passt die Notiz, wie sie ist, über die Grenze, bleiben sie und alle darüber
      if (n.oben + n.hoehe <= grenze + TOL) break
      const h = n.hoehe * mass
      let oben = Math.min(n.oben, grenze - h)
      if (oben < minOben - TOL) {
        ok = false
        oben = Math.max(minOben, oben)
      }
      out[n.id] = { hoch: runde(n.oben - oben), mass, hoehe: runde(n.hoehe) }
      grenze = oben - luecke
    }
    letzte = out
    if (ok) return out
  }
  // Selbst bei 80 % zu viel: so weit wie möglich nach oben (der Rest steht über – sehr selten)
  return letzte
}
