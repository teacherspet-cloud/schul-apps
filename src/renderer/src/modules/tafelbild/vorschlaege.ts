/**
 * „Vorschlag der App umsetzen" für Tafelbilder (Nachbesserung 30.09.2026) – zum Befund „Schrift
 * kleiner als empfohlen". Vorbild: arbeitsblatt/didactics/seitenAktionen.ts.
 *
 * - Text kürzen (KI): die betroffenen Kästen kürzen lassen, dann alle Formate neu setzen
 *   (auftrag.ts, textKuerzen) – dieselbe Kürzung, die beim Erzeugen einmal automatisch läuft.
 * - Elemente zusammenfassen (ohne KI): die zwei kürzesten benachbarten Aspekte werden EIN Kasten
 *   („A / B", Stichpunkte beider). Weniger Kästen heißt weniger Rahmen, Titel und Abstände – die
 *   Schrift darf wieder größer werden. Nur bei Strukturen ohne Reihenfolge (Begriffsnetz,
 *   Gliederung, übernommene Anordnung): Schritte eines Ablaufs, Stationen eines Kreislaufs,
 *   Ereignisse einer Zeitleiste und Spalten einer Gegenüberstellung bleiben getrennt.
 */
import { korrigiereOperatorformen } from '@shared/operatoren/satzbau'
import { worte, type TbInhalt, type TbKnoten, type TbVorschlag } from './model'

const ZUSAMMENFASSBAR: TbInhalt['struktur'][] = ['netz', 'gliederung', 'frei']

const umfang = (k: TbKnoten): number => worte(k.titel) + k.punkte.reduce((n, p) => n + worte(p), 0)

/** Die zwei benachbarten Aspekte mit dem wenigsten Text – oder null, wenn nichts zusammenpasst */
export function zusammenfassPaar(inhalt: TbInhalt): [TbKnoten, TbKnoten] | null {
  if (!ZUSAMMENFASSBAR.includes(inhalt.struktur)) return null
  const aspekte = inhalt.knoten.filter((k) => k.rolle !== 'zentrum')
  // Danach bleiben mindestens zwei Aspekte – sonst ist es kein Netz mehr
  if (aspekte.length < 3) return null
  let best: [TbKnoten, TbKnoten] | null = null
  let bestUmfang = Infinity
  for (let i = 0; i + 1 < aspekte.length; i++) {
    const n = umfang(aspekte[i]) + umfang(aspekte[i + 1])
    if (n < bestUmfang) {
      best = [aspekte[i], aspekte[i + 1]]
      bestUmfang = n
    }
  }
  return best
}

/** Zwei Aspekte zu einem Kasten zusammenfassen; Beziehungen und Zeichnungen ziehen mit */
export function zusammenfassen(inhalt: TbInhalt): TbInhalt | null {
  const paar = zusammenfassPaar(inhalt)
  if (!paar) return null
  const [a, b] = paar
  const neu = structuredClone(inhalt)
  const ziel = neu.knoten.find((k) => k.id === a.id)!
  ziel.titel = `${a.titel} / ${b.titel}`
  ziel.punkte = [...a.punkte, ...b.punkte]
  ziel.symbol = a.symbol || b.symbol
  ziel.niveau = Math.min(a.niveau, b.niveau) as TbKnoten['niveau']
  ziel.schritt = Math.min(a.schritt, b.schritt)
  ziel.lueckenWoerter = [...new Set([...a.lueckenWoerter, ...b.lueckenWoerter])]
  neu.knoten = neu.knoten.filter((k) => k.id !== b.id)
  const gesehen = new Set<string>()
  neu.beziehungen = neu.beziehungen
    .map((x) => ({ ...x, von: x.von === b.id ? a.id : x.von, nach: x.nach === b.id ? a.id : x.nach }))
    .filter((x) => x.von !== x.nach)
    // Doppelte Verbindung (A und B hingen beide am Zentrum): die beschriftete bleibt
    .sort((x, y) => Number(Boolean(y.beschriftung.trim())) - Number(Boolean(x.beschriftung.trim())))
    .filter((x) => {
      const s = [x.von, x.nach].sort().join('|')
      if (gesehen.has(s)) return false
      gesehen.add(s)
      return true
    })
  for (const z of neu.zeichnungen) if (z.bezug === b.id) z.bezug = a.id
  return neu
}

/** Kurzer Name eines Vorschlags – für das Kreismenü */
export const VORSCHLAG_NAMEN: Record<TbVorschlag, { label: string; titel: string }> = {
  kiKuerzen: { label: 'Text kürzen (KI)', titel: 'Die KI kürzt die Kästen mit zu kleiner Schrift; danach werden alle Formate neu gesetzt.' },
  zusammenfassen: { label: 'Elemente zusammenfassen', titel: 'Die zwei kürzesten benachbarten Aspekte werden ein Kasten – ohne KI, mit Strg+Z rückgängig.' },
  satzbau: { label: 'Satzstellung korrigieren', titel: 'Operatoren als korrekter Imperativ („Fassen Sie … zusammen") – ohne KI, mit Strg+Z rückgängig.' }
}

/**
 * Operatoren in falscher Satzstellung (01.10.2026, „Zusammenfassen Sie …"): Texte der Tafeln und
 * Arbeitsauftrag/Hausaufgabe des Inhalts korrigieren – an Ort und Stelle (Entwurf des Stores).
 * Liefert die Zahl der geänderten Texte.
 */
export function satzbauKorrigieren(t: { tafeln: { elemente: { text: string; titel?: string }[] }[]; inhalt: TbInhalt | null }): number {
  let n = 0
  const korr = (s: string | undefined): string | undefined => {
    if (!s) return s
    const neu = korrigiereOperatorformen(s).text
    if (neu !== s) n++
    return neu
  }
  for (const x of t.tafeln)
    for (const e of x.elemente) {
      e.text = korr(e.text) ?? e.text
      if (e.titel) e.titel = korr(e.titel)
    }
  if (t.inhalt) {
    t.inhalt.impuls = korr(t.inhalt.impuls) ?? ''
    t.inhalt.hausaufgabe = korr(t.inhalt.hausaufgabe) ?? ''
    for (const s of t.inhalt.schritte) s.impuls = korr(s.impuls) ?? ''
  }
  return n
}
