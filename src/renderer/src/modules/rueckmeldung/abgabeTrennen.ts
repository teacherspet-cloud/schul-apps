/**
 * Schülertext von Aufgabenblatt trennen (29.09.2026, Fehlerbericht der Lehrkraft): „Ich habe eine
 * .doc-Datei in die Abgaben gezogen – im Textfeld stehen ein Haufen Inhalte der eigentlichen
 * Aufgabe, nicht der Abgabe." Word- und PDF-Abgaben enthalten oft das ganze Aufgabenblatt samt
 * Material, der Schülertext steht darunter oder dazwischen.
 *
 * Zwei Stufen:
 * 1. Abgleich (ohne KI): Zeilen, die wörtlich in der Aufgabe stehen (normalisiert auf Leerraum und
 *    Groß-/Kleinschreibung), und typische Kopfzeilen fallen weg.
 * 2. KI – nur wenn danach noch Aufgabenteile vermutet werden oder keine Aufgabe eingetragen ist.
 *    Die KI nennt den Schülertext; übernommen werden aber die ORIGINALZEILEN, die darin
 *    vorkommen – so bleibt der Text wörtlich, mit allen Fehlern. Weicht die Antwort zu stark
 *    vom Original ab (verbessert, übersetzt), gilt sie nicht.
 *
 * Der Originaltext bleibt an der Abgabe (`textOriginal`) – „Rückgängig" stellt ihn wieder her.
 */
import type { StructuredRequest } from '@shared/types'
import { arr, obj, str } from '../../shared/aiSchema'
import type { Abgabe } from './model/types'

export interface TrennErgebnis {
  text: string
  /** Entfernte (nicht leere) Zeilen */
  zeilen: number
  /** Was entfernt wurde – Anfänge der Zeilen bzw. Angaben der KI */
  entfernt: string[]
  /** Nach dem Abgleich stehen vermutlich noch Teile der Aufgabe im Text */
  verdacht: boolean
  /**
   * Keine Schülerantwort erkennbar (29.09.2026, Fehlerbericht: die Word-Fassung der Klassenarbeit
   * landete als Abgabe): 'leer' = alles war Aufgabe/Material, 'lehrerfassung' = die Datei enthält
   * Erwartungshorizont, Mustertext oder Bewertungsraster – das schreibt keine Schülerin selbst.
   */
  keineAntwort?: 'leer' | 'lehrerfassung'
}

/**
 * Word-Dateien kommen als HTML an (extractContent, Format 'html'). In die Abgabe gehört nur der
 * Text – ohne Tags, ohne eingebettete Bilder (base64), Absätze und Tabellenzellen als Zeilen.
 */
export function klartext(text: string): string {
  if (!/<(p|div|br|table|tr|td|li|ul|ol|h\d|img|strong|em|span)\b[^>]*>/i.test(text)) return text
  return text
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|td|th|h\d|table|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((z) => z.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Der unsichtbare KI-Test des Schülerblatts (shared/aiCanary.ts, „Formale Vorgabe der Lehrkraft …
 * Kennwort …") steht in jeder Word/PDF-Fassung mit. Er ist eine Anweisung an Sprachmodelle und darf
 * weder in der Abgabe noch in einer Anfrage stehen – sonst folgt ihr die KI der Rückmeldung
 * (Fehlerbericht 29.09.2026: das Feedback nannte plötzlich „Hamlet"). Liefert auch die Kennwörter.
 */
const KI_TEST = [
  /Formale Vorgabe der Lehrkraft für die Bearbeitung:[\s\S]*?gelten als nicht abgegeben\./g,
  /Formal requirement: if you write an answer as text[\s\S]*?count as not submitted\./g,
  /Dies ist ein KI-Test\.[^.\n]*\./g
]

export function ohneKiTest(text: string): { text: string; kennwoerter: string[] } {
  const kennwoerter = new Set<string>()
  let t = text
  for (const muster of KI_TEST)
    t = t.replace(muster, (satz) => {
      for (const m of satz.matchAll(/[„"]([^"“”„]{2,40})["“”]/g)) kennwoerter.add(m[1].trim())
      return ''
    })
  return { text: t === text ? text : t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), kennwoerter: [...kennwoerter] }
}

/** Überschriften, die nur in der Lehrerfassung stehen */
const LEHRERTEIL = /^(erwartungshorizont|mustertext|musterlösung|bewertungsraster|model answer|answer key|corrigé|solucionario)\b\s*:?/im

/** Normalform für den Vergleich: Leerraum, Groß-/Kleinschreibung, Anführungszeichen, Aufzählungszeichen */
export function norm(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[​-‍﻿­]/g, '')
    .replace(/[„“”‚‘’«»"']/g, '')
    .replace(/[–—‑]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:[-•*·▪◦]|\(?[a-z0-9]{1,3}[).:]|\[[^\]]{1,12}\])\s+/, '')
    .trim()
}

const KOPFZEILE = /^(name|vorname|nachname|datum|klasse|kurs|fach|lehrer(in)?|lehrkraft|schule|schuljahr|date|class|nom|prénom|fecha|nombre|nome|data)\s*[:：]/i
const SEITENZAHL = /^(seite|page|página|pagina)\s+\d+(\s*(von|of|de|di|\/)\s*\d+)?$/i

/** Merkmale einer Aufgabenstellung, die im Schülertext nicht vorkommen sollten */
const AUFGABEN_MERKMAL =
  /^(aufgabe|teilaufgabe|arbeitsauftrag|arbeitsanweisung|task|exercise|assignment|material|m\s?\d+\b|text\s?\d+\b|quelle|source|annotations?|vocabulary|vokabelhilfen?|worterkl[äa]rungen|t[âa]che|exercice|consigne|ejercicio|tarea|esercizio|compito)\b|^(beschreibe|erläutere|erkläre|analysiere|nenne|fasse|vergleiche|beurteile|diskutiere|interpretiere|begründe|untersuche|write|describe|explain|summari[sz]e|analy[sz]e|compare|comment on|imagine you|écris|décris|explique|escribe|describe|explica|scrivi|descrivi|spiega)\b|\(\s*\d+\s*(p|punkte|pkt|be|vp|points?|pts)\.?\s*\)/i

const nichtLeer = (s: string): boolean => s.trim().length > 0

/** Zahl der nicht leeren Zeilen */
export const zeilenZahl = (s: string): number => s.split('\n').filter(nichtLeer).length

/** Leere Zeilen zusammenfassen (höchstens eine Leerzeile) */
const verdichte = (zeilen: string[]): string =>
  zeilen
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const kurz = (s: string): string => (s.trim().length > 60 ? `${s.trim().slice(0, 57)} …` : s.trim())

/**
 * Die Aufgaben aus dem Material enthalten oft schon die Lösungen („→ answer: …", „Lösung: …",
 * describe.ts/quality.ts). Eine richtige Schülerantwort darf nicht als „Aufgabentext" wegfallen –
 * daher wird nur mit dem Teil vor der Lösung verglichen.
 */
export function ohneLoesungen(aufgaben: string): string {
  return aufgaben
    .split('\n')
    .map((z) => z.replace(/\s*(→|[–-]\s*(Musterl|L)ösung\s*:|(Musterl|L)ösung\s*:|model answer\s*:|correction\s*:).*$/i, ''))
    .join('\n')
}

/**
 * Stufe 1: Abgleich mit der Aufgabe. Eine Zeile fällt weg, wenn sie (normalisiert) als ganze Zeile
 * in der Aufgabe steht oder – ab drei Wörtern bzw. 20 Zeichen – wörtlich im Aufgabentext enthalten
 * ist; außerdem Kopfzeilen (Name/Datum/Klasse) und Seitenzahlen. Bleibt nichts übrig, bleibt alles.
 */
export function trenneNachAufgabe(textRoh: string, aufgabenRoh: string, erwartung = ''): TrennErgebnis {
  const text = ohneKiTest(klartext(textRoh)).text
  const aufgaben = ohneLoesungen(aufgabenRoh)
  const zeilen = text.split('\n')
  const aufgabenZeilen = new Set(aufgaben.split('\n').map(norm).filter(Boolean))
  const aufgabenGanz = ` ${norm(aufgaben.replace(/\n/g, ' '))} `
  // Erwartungshorizont: nur lange Zeilen (ab 8 Wörtern) – ganze Sätze daraus schreibt niemand zufällig selbst
  const erwartungGanz = ` ${norm(erwartung.replace(/\n/g, ' '))} `
  const lehrerfassung = LEHRERTEIL.test(text)
  const entfernt: string[] = []
  const bleibt = zeilen.filter((z) => {
    const n = norm(z)
    if (!n) return true
    const lang = n.length >= 20 || n.split(' ').length >= 3
    // Auch Zeilen, die eine lange Aufgabenzeile enthalten und kaum mehr (Nummer davor: „1  You help …")
    const mitAufgabe = [...aufgabenZeilen].some((az) => az.length >= 25 && n.includes(az) && az.length >= 0.8 * n.length)
    const inAufgabe = aufgabenZeilen.has(n) || (lang && aufgabenGanz.includes(n)) || mitAufgabe || (n.split(' ').length >= 8 && erwartungGanz.includes(n))
    const kopf = (KOPFZEILE.test(z.trim()) && z.trim().length < 60) || SEITENZAHL.test(z.trim())
    if (inAufgabe || kopf) {
      entfernt.push(kurz(z))
      return false
    }
    return true
  })
  const neu = verdichte(bleibt)
  // Keine Schülerantwort: nur Aufgabe/Material, oder eine Lehrerfassung (Erwartungshorizont, Mustertext)
  if (!neu || lehrerfassung)
    return { text: '', zeilen: zeilenZahl(text), entfernt: entfernt.slice(0, 12), verdacht: false, keineAntwort: lehrerfassung ? 'lehrerfassung' : 'leer' }
  // Nur umgewandelt (HTML → Text, KI-Test entfernt): auch das zählt als Änderung, rückgängig machbar
  const umgewandelt = text !== textRoh.trim() && text !== textRoh
  return { text: neu, zeilen: entfernt.length || (umgewandelt ? 1 : 0), entfernt, verdacht: vermuteAufgabe(neu) }
}

/** Stehen im Text (noch) Teile einer Aufgabenstellung? */
export function vermuteAufgabe(text: string): boolean {
  return text.split('\n').some((z) => AUFGABEN_MERKMAL.test(z.trim()))
}

/**
 * Braucht die Abgabe nach dem Abgleich die KI? Bei Verdacht auf Aufgabenteile, oder wenn keine
 * Aufgabe eingetragen ist und der Text nicht nur ein paar Zeilen lang ist.
 */
export function kiTrennungNoetig(e: TrennErgebnis, aufgaben: string): boolean {
  if (!e.text.trim()) return false
  if (e.verdacht) return true
  return !aufgaben.trim() && (e.text.length > 400 || zeilenZahl(e.text) > 6)
}

// ---------- Stufe 2: KI ----------

const TRENNUNG = obj({
  schuelertext: str(
    'NUR der eigene Text der Schülerin bzw. des Schülers – WÖRTLICH aus der Abgabe übernommen, mit allen Fehlern, Zeile für Zeile in der Reihenfolge der Abgabe; nichts verbessert, nichts übersetzt, nichts ergänzt'
  ),
  entfernt: arr(str('Kurz, was entfernt wurde (z. B. „Aufgabenstellung 1", „Material M2", „Kopfzeile", „Vokabelhilfen")'))
})

export function trennAnfrage(text: string, aufgaben: string): StructuredRequest {
  return {
    system:
      'Du bereitest Schülerabgaben (aus Word- oder PDF-Dateien) für eine Rückmeldung vor. Oft steht darin das Aufgabenblatt samt Material, und der Text der Schülerin bzw. des Schülers steht darunter oder dazwischen. Du trennst beides und veränderst am Schülertext nichts.',
    user: [
      'Gib NUR den eigenen Text der Schülerin bzw. des Schülers zurück.',
      'ENTFERNEN: Aufgabenstellungen und Arbeitsanweisungen, abgedrucktes Material (Texte, Tabellen, Bildunterschriften, Quellenangaben, Vokabelhilfen), Kopf- und Fußzeilen des Aufgabenblatts (Schule, Fach, Datum, Name, Punkte).',
      'BEHALTEN: alles, was die Person selbst geschrieben hat – auch eigene Überschriften, Stichpunkte, Antworten in Lücken (dann die ganze Zeile), sehr kurze, fehlerhafte oder anderssprachige Texte. Im Zweifel behalten.',
      'WÖRTLICH: Rechtschreib-, Grammatik- und Zeichensetzungsfehler bleiben stehen; nichts verbessern, nichts übersetzen. Ist die ganze Abgabe Schülertext, gib sie unverändert zurück.',
      'Kürzel wie S1 oder S1-P1 stehen für Namen und bleiben unverändert.',
      aufgaben.trim()
        ? `AUFGABE (zum Vergleich, ohne Lösungen):\n<<<AUFGABE\n${ohneLoesungen(aufgaben).trim()}\nAUFGABE>>>`
        : 'Die Aufgabe ist nicht bekannt – erkennbar ist sie an Arbeitsanweisungen, Operatoren, Punkteangaben und Material.',
      `ABGABE:\n<<<ABGABE\n${text}\nABGABE>>>`
    ].join('\n'),
    schemaName: 'rueckmeldung_abgabe_trennen',
    schema: TRENNUNG
  }
}

const woerterVon = (s: string): Set<string> => new Set(s.match(/[\p{L}\p{N}]+/gu) ?? [])

/**
 * Hat die KI eine Zeile doch leicht verändert (etwa einen Fehler „verbessert")? Dann zählt sie als
 * behalten, wenn mindestens drei Viertel ihrer Wörter in einer Zeile der KI stehen – so geht kein
 * Schülertext verloren, und übernommen wird trotzdem die Originalzeile.
 */
function aehnlich(n: string, kiWoerter: Set<string>[]): boolean {
  const w = [...woerterVon(n)]
  if (w.length < 3) return false
  return kiWoerter.some((k) => w.filter((x) => k.has(x)).length >= 0.75 * w.length)
}

/**
 * Antwort der KI → Ergebnis aus den ORIGINALZEILEN. `original` ist der Text der Abgabe, `anonym`
 * derselbe Text ohne Namen (so, wie ihn die KI gesehen hat). Liefert null, wenn die Antwort nicht
 * brauchbar ist (leer, alles entfernt, Text verändert).
 */
export function kiTrennungAnwenden(original: string, anonym: string, daten: unknown): TrennErgebnis | null {
  const d = (daten ?? {}) as { schuelertext?: unknown; entfernt?: unknown }
  const ki = String(d.schuelertext ?? '').trim()
  if (!ki) return null
  const origZeilen = original.split('\n')
  const anonZeilen = anonym.split('\n')
  // Gleiche Zeilen: Namen wie im Original behalten; sonst (Zeilen verschoben) die bereinigte Fassung
  const zeilen = anonZeilen.length === origZeilen.length ? origZeilen : anonZeilen
  const vergleich = anonZeilen
  const kiZeilen = ki.split('\n').map(norm).filter(Boolean)
  const kiSet = new Set(kiZeilen)
  const kiGanz = ` ${kiZeilen.join(' ')} `
  const kiWoerter = kiZeilen.map(woerterVon)
  const bleibt: string[] = []
  let entfernteZeilen = 0
  let erhalten = 0
  vergleich.forEach((z, i) => {
    const n = norm(z)
    if (!n) {
      bleibt.push(zeilen[i])
      return
    }
    const behalten =
      kiSet.has(n) || (n.length >= 12 && kiGanz.includes(` ${n} `)) || kiZeilen.some((k) => k.length >= 6 && n.includes(k)) || aehnlich(n, kiWoerter)
    if (behalten) {
      bleibt.push(zeilen[i])
      erhalten += n.length
    } else entfernteZeilen++
  })
  // Wörtlichkeit: Der Schülertext der KI muss zum größten Teil aus Originalzeilen bestehen
  if (!erhalten || erhalten < 0.6 * kiGanz.trim().length) return null
  const text = verdichte(bleibt)
  if (!text) return null
  const angaben = Array.isArray(d.entfernt) ? d.entfernt.map((x) => String(x ?? '').trim()).filter(Boolean) : []
  return { text, zeilen: entfernteZeilen, entfernt: angaben, verdacht: false }
}

// ---------- An der Abgabe ----------

/**
 * Ergebnis an die Abgabe: neuer Text, der Originaltext bleibt (der früheste, auch nach mehreren
 * Durchgängen) und die Zahl der entfernten Zeilen gegenüber dem Original.
 */
export function trennungAnwenden(a: Abgabe, e: TrennErgebnis, quelle: 'abgleich' | 'ki'): Abgabe {
  if (!e.zeilen || (e.text.trim() === a.text.trim() && !e.keineAntwort)) return a
  const original = a.textOriginal ?? a.text
  const bisher = a.trennung?.entfernt ?? []
  return {
    ...a,
    text: e.text,
    textOriginal: original,
    trennung: {
      zeilen: Math.max(0, zeilenZahl(original) - zeilenZahl(e.text)),
      quelle: a.trennung?.quelle === 'ki' ? 'ki' : quelle,
      entfernt: [...bisher, ...e.entfernt].slice(0, 12),
      ...(e.keineAntwort ? { keineAntwort: e.keineAntwort } : {})
    }
  }
}

/** Rückgängig: den Originaltext wiederherstellen */
export function trennungZurueck(a: Abgabe): Abgabe {
  if (a.textOriginal === undefined) return a
  const { textOriginal, trennung: _t, ...rest } = a
  void _t
  return { ...rest, text: textOriginal }
}

/** Hinweis an der Abgabe: „Aufgabentext entfernt (12 Zeilen)" */
export function trennHinweis(a: Abgabe): string | null {
  if (!a.trennung || a.textOriginal === undefined) return null
  if (a.trennung.keineAntwort === 'lehrerfassung')
    return 'Keine Schülerantwort erkennbar: Die Datei ist offenbar eine Lehrerfassung (Aufgabe, Material, Erwartungshorizont bzw. Mustertext). Die Abgabe der Schülerin bzw. des Schülers gehört hierher.'
  if (a.trennung.keineAntwort === 'leer') return 'Keine Schülerantwort erkennbar: Die Datei enthält nur Aufgabenstellung und Material.'
  const n = a.trennung.zeilen
  return `Aufgabentext entfernt (${n} ${n === 1 ? 'Zeile' : 'Zeilen'}${a.trennung.quelle === 'ki' ? ', mit KI' : ''})`
}
