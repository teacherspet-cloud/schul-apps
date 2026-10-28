/**
 * Blindprobe (28.10.2026, Wunsch der Lehrkraft: „eine Prüfung nach der Erstellung mit möglicher Überarbeitung als Teil der
 * Erzeugung, die sicherstellt, dass eine blinde KI die Lösung aus allem erkennt, was Lernende an Information hätten"):
 * Eine zweite KI sieht je Aufgabe nur die Schüleransicht – Anweisung, Kontext, Satz bzw. Text, Vorgaben, Möglichkeiten
 * (gemischt wie in der App), Wortkasten, Satzanfang, dazu Thema und Regelkarte – und löst sie. Ihre Antwort wird mit
 * derselben Bewertung wie bei Lernenden geprüft (pruefeGrammatik). Was sie nicht trifft oder als mehrdeutig meldet, geht
 * in die Überarbeitung (grammatikErzeugen.ts `blindGeprueft`).
 */
import { normiert, pruefeGrammatik, SATZ_ARTEN, woerterVon, type GrammatikAufgabe } from './grammatiktrainer'
import type { Urteil } from './vokabeltrainer'

/** Antwort der blinden KI – einheitlich für alle Formate */
export interface BlindAntwort {
  nr: number
  /** Tippen bzw. Auswahl: die Antwort; Fehler finden/Richtig-falsch: die Berichtigung */
  text: string
  /** Lückentext: je Lücke; Mehrfachauswahl: gewählte Möglichkeiten; Markieren: Wörter; Sortieren/Zuordnen: je Element bzw. linke Hälfte */
  liste: string[]
  /** Fehler finden / Richtig-falsch: das falsche Wort */
  wort: string
  /** Richtig-falsch: hält den Satz für richtig */
  richtig: boolean
  /** Weitere Antworten, die nach Ansicht der blinden KI ebenso richtig wären */
  auch: string[]
}

/** Regelkarte, wie Lernende sie abrufen können */
export interface BlindRegel {
  titel: string
  erklaerung: string
  beispiele: string[]
}

/** Formate, die die Blindprobe prüft (Latein-Bestimmen, Tabellen und Übersetzen nicht – dort entscheidet die Prüfung) */
export const BLIND_ARTEN = [
  'luecke',
  'auswahl',
  'umformen',
  'fehler',
  'satzbau',
  'zuordnen',
  'richtigfalsch',
  'lueckentext',
  'verbinden',
  'frage',
  'markieren',
  'sortieren',
  'mehrfach'
] as const
export const blindTauglich = (a: GrammatikAufgabe): boolean => (BLIND_ARTEN as readonly string[]).includes(a.art)
/** Formate mit getippter Antwort: hier darf eine andere richtige Antwort als Lösung dazukommen */
export const TIPP_ARTEN = ['luecke', 'umformen', 'verbinden', 'frage', 'lueckentext', 'satzbau'] as const

/** Feste Mischung je Aufgabe (wie in der App: die Reihenfolge verrät nichts) */
export function gemischt<T>(l: readonly T[], saat: string): T[] {
  let h = 2166136261
  for (const c of saat) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  const r = [...l]
  for (let i = r.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0
    const j = h % (i + 1)
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

const FORMAT_TEXT: Partial<Record<string, string>> = {
  luecke: 'Lücke – das fehlende Wort bzw. die fehlende Form tippen (text)',
  auswahl: 'Auswahl – genau eine Möglichkeit wählen (text = die Möglichkeit)',
  umformen: 'Umformen – den ganzen Satz tippen (text)',
  verbinden: 'Sätze verbinden – den ganzen neuen Satz tippen (text)',
  frage: 'Frage bilden – die ganze Frage tippen (text)',
  satzbau: 'Satzbau – den Satz aus den Teilen tippen (text)',
  fehler: 'Fehler finden – das falsche Wort (wort) antippen und berichtigen (text)',
  richtigfalsch: 'Richtig oder falsch – richtig = true/false; bei falsch das falsche Wort (wort) und die Berichtigung (text)',
  lueckentext: 'Lückentext – je Lücke die Antwort in Reihenfolge (liste)',
  mehrfach: 'Mehrfachauswahl – alle richtigen Möglichkeiten (liste)',
  markieren: 'Markieren – alle gesuchten Wörter genau wie im Satz, jedes Vorkommen einzeln (liste)',
  sortieren: 'Sortieren – je Element in der angezeigten Reihenfolge der Name seiner Gruppe (liste)',
  zuordnen: 'Zuordnen – je linker Hälfte in Reihenfolge die passende rechte Hälfte (liste)'
}

/** Angezeigte Reihenfolge der Elemente beim Sortieren (Indizes in `elemente`) */
export const sortierFolge = (a: GrammatikAufgabe): number[] => gemischt((a.elemente ?? []).map((_, i) => i), a.id)

/** Was Lernende zu dieser Aufgabe sehen – ohne Lösung, Erklärung oder Fehlerwort */
export function blindSicht(a: GrammatikAufgabe, nr: number, regel?: BlindRegel): string {
  const z: string[] = [`${nr}. Format: ${FORMAT_TEXT[a.art] ?? a.art}`, `Anweisung: ${a.anweisung}`]
  if (a.kontext) z.push(`Kontext: ${a.kontext}`)
  if (a.art === 'lueckentext') {
    let k = 0
    z.push(`Text: ${a.satz.replace(/_{3,}/g, () => `(${++k}) ___`)}`)
    for (const [i, l] of (a.luecken ?? []).entries())
      if (l.vorgabe || l.optionen?.length)
        z.push(`  Lücke ${i + 1}: ${l.vorgabe ?? ''}${l.optionen?.length ? ` Auswahl: ${gemischt(l.optionen, a.id + i).join(' / ')}` : ''}`)
    if (a.wortkasten?.length) z.push(`Wortkasten: ${gemischt(a.wortkasten, a.id).join(', ')}`)
  } else if (a.art === 'satzbau') z.push(`Teile: ${gemischt(a.teile ?? [], a.id).join(' | ')}`)
  else if (a.art === 'zuordnen') {
    z.push(`Links: ${(a.paare ?? []).map((p, i) => `${i + 1}) ${p.links}`).join('  ')}`)
    z.push(`Rechts (gemischt): ${gemischt((a.paare ?? []).map((p) => p.rechts), a.id).join(' | ')}`)
  } else if (a.art === 'sortieren') {
    z.push(`Gruppen: ${(a.gruppen ?? []).join(' | ')}`)
    z.push(`Elemente: ${sortierFolge(a).map((i, k) => `${k + 1}) ${a.elemente![i].text}`).join('  ')}`)
  } else if (a.satz) z.push(`Satz: ${a.satz}`)
  if (a.vorgabe && a.art !== 'lueckentext') z.push(`Vorgabe: ${a.vorgabe}`)
  if (a.anfang) z.push(`Satzanfang (steht schon da): ${a.anfang}`)
  if ((a.art === 'auswahl' || a.art === 'mehrfach') && a.optionen?.length) z.push(`Möglichkeiten: ${gemischt(a.optionen, a.id).join(' | ')}`)
  if (regel)
    z.push(
      `Regelkarte (abrufbar): ${regel.titel} – ${regel.erklaerung}${regel.beispiele.length ? ` (z. B. ${regel.beispiele.slice(0, 3).join('; ')})` : ''}`
    )
  return z.join('\n')
}

/** Bewertet die blinde Antwort wie die von Lernenden */
export function blindUrteil(a: GrammatikAufgabe, b: BlindAntwort): Urteil {
  const liste = (b.liste ?? []).map(String)
  const gleich = (x: string, y: string): boolean => normiert(x) === normiert(y)
  switch (a.art) {
    case 'mehrfach':
    case 'lueckentext':
      return pruefeGrammatik(a, JSON.stringify(liste)).urteil
    case 'markieren': {
      const woerter = woerterVon(a.satz)
      const genommen = new Set<number>()
      for (const w of liste) {
        const i = woerter.findIndex((x, k) => !genommen.has(k) && gleich(x, w))
        if (i >= 0) genommen.add(i)
      }
      return pruefeGrammatik(a, JSON.stringify([...genommen])).urteil
    }
    case 'sortieren': {
      const folge = sortierFolge(a)
      const wahl: number[] = []
      folge.forEach((i, k) => (wahl[i] = (a.gruppen ?? []).findIndex((g) => gleich(g, liste[k] ?? ''))))
      return pruefeGrammatik(a, JSON.stringify(wahl)).urteil
    }
    case 'zuordnen':
      return pruefeGrammatik(a, JSON.stringify((a.paare ?? []).map((_, i) => (a.paare ?? []).findIndex((p) => gleich(p.rechts, liste[i] ?? ''))))).urteil
    case 'richtigfalsch':
      return pruefeGrammatik(a, JSON.stringify({ richtig: b.richtig, wort: b.wort, korrektur: b.text })).urteil
    case 'fehler':
      return pruefeGrammatik(a, b.text, b.wort).urteil
    default:
      return pruefeGrammatik(a, b.text).urteil
  }
}

/** Andere Antworten, die die blinde KI ebenso für richtig hält und die nicht hinterlegt sind (nur Tipp-Formate mit einer Antwort) */
export function blindWeitere(a: GrammatikAufgabe, b: BlindAntwort): string[] {
  if (!(TIPP_ARTEN as readonly string[]).includes(a.art) || a.art === 'lueckentext') return []
  // Mit vorgegebenem Satzanfang können Lernende nur Sätze mit diesem Anfang eingeben – andere Umstellungen zählen nicht
  const moeglich = (x: string): boolean => !(a.anfang && (SATZ_ARTEN as readonly string[]).includes(a.art)) || normiert(x).startsWith(normiert(a.anfang))
  return [...new Set((b.auch ?? []).map(String).filter((x) => x.trim() && moeglich(x) && pruefeGrammatik(a, x).urteil !== 'richtig'))]
}

/** Meldet die blinde KI bei Auswahlformaten eine zweite richtige Möglichkeit, ist die Aufgabe mehrdeutig */
export const blindMehrdeutig = (a: GrammatikAufgabe, b: BlindAntwort): boolean =>
  !(TIPP_ARTEN as readonly string[]).includes(a.art) && (b.auch ?? []).some((x) => String(x).trim())

/** Die Antwort der blinden KI als lesbarer Text (für die Überarbeitung) */
export function blindText(a: GrammatikAufgabe, b: BlindAntwort): string {
  const auch = b.auch?.length ? ` (hält auch für richtig: ${b.auch.join(' | ')})` : ''
  if (a.art === 'richtigfalsch') return (b.richtig ? 'hält den Satz für richtig' : `falsch: „${b.wort}“ → „${b.text}“`) + auch
  if (a.art === 'fehler') return `„${b.wort}“ → „${b.text}“${auch}`
  if (['luecke', 'auswahl', 'umformen', 'verbinden', 'frage', 'satzbau'].includes(a.art)) return b.text + auch
  return (b.liste ?? []).join(' | ') + auch
}
