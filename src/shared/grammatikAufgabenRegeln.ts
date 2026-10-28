/**
 * Regeln für gute Grammatikaufgaben (28.10.2026, nach der Prüfung der ganzen Aufgabenbank am Schulserver; Bericht
 * „Grammatikbank-Prüfung Englisch“, Wunsch der Lehrkraft: „langfristig wirkend korrigieren, Prompts überarbeiten, auch für
 * andere Fremdsprachen“). Befunde der Prüfung (82.315 Aufgaben, 554 Formen):
 *  - Erkennen war meist eine freie Lücke ohne Knöpfe (rund 11.700), oft mit „Wähle …“, ohne Vorgabe musste geraten werden.
 *  - In rund 5.800 Lücken stand die Lösung schon in der Klammer („(should)“ → should) – reines Abschreiben.
 *  - Mehrere richtige Antworten, nur eine gelistet (Kontrastformen, Fragewörter, Konjunktionen).
 *  - Unterscheiden-Lücken mit Grundform prüften die Abgrenzung nicht.
 *  - Fehler finden mit Fehlern, die man nicht durch EIN Wort ersetzen kann (Streichen, Umstellen); Fehler in fremder Grammatik.
 *  - Nicht tippbare Lösungen („—“, „,“, „streichen“), mehrere Lücken bei einem Feld.
 *
 * Drei Bausteine, für alle Sprachen gleich:
 *  - `AUFGABEN_REGELN`: der Auftrag an die KI (Bank, Pool, „+ Aufgaben“, Prüfung).
 *  - `aufgabeNormalisiert`: was sich ohne KI richten lässt (Wahl in der Vorgabe → Auswahl, „Wähle“ bei Lücken, doppelte
 *    Möglichkeiten, Lücke mit Grundform beim Erkennen → Bilden).
 *  - `aufgabeMangel`: was übrig bleibt und eine Aufgabe unbrauchbar macht – neue Aufgaben mit Mangel fallen weg,
 *    vorhandene in der Bank werden für die Lernenden zurückgestellt, bis sie überarbeitet sind.
 */
import { normiert, woerterVon, type GrammatikAufgabe } from './grammatiktrainer'

/** Auftrag an die KI: Regeln, die für jede Aufgabe gelten (alle Sprachen) */
export const AUFGABEN_REGELN = [
  'QUALITÄT – jede Aufgabe muss für sich allein EINDEUTIG lösbar sein; die Lernenden sehen nur Anweisung, Satz und Vorgabe:',
  '- LÜCKE ist ein freies Tippfeld ohne Knöpfe. Nur verwenden, wenn die Lernenden eine Form aus einem Grundwort BILDEN: „vorgabe“ nennt das Grundwort in Klammern (z. B. „(go)“, „(finir)“, „(tener)“, „(laudare)“), die Lösung ist eine ANDERE Form davon – nie das Wort aus der Vorgabe selbst.',
  '- Ist die Lösung ein Wort, das man WÄHLT statt bildet (Präposition, Konjunktion, Artikel, Pronomen, Relativ- oder Fragewort, Hilfs- oder Modalverb, Mengenwort, Signalwort), dann AUSWAHL mit Ablenkern – keine Lücke.',
  '- Der Satz erzwingt genau eine Form: Zeitsignal, Kontext oder Bezugswort machen klar, was gemeint ist. Passen grammatisch mehrere Formen (z. B. will / going to, who / that, passé composé / imparfait, ser / estar), nenne ALLE in „loesungen“ oder ändere den Satz so, dass nur eine passt.',
  '- Genau EINE Lücke „___“ je Satz. Die Lösung ist nur der Text für die Lücke – ohne Wörter, die schon im Satz stehen (kein doppeltes Subjekt oder Verb).',
  '- AUSWAHL: 3–4 Möglichkeiten, genau EINE davon ist im Satz richtig; keine zwei gleichwertigen; Ablenker sind typische Fehlformen bzw. die verwechselbare Nachbarform.',
  '- Die Anweisung passt zur Aufgabenart: „Wähle …“ nur bei Auswahl; bei Lücken „Setze … ein“ bzw. „Ergänze …“.',
  '- FEHLER FINDEN und RICHTIG ODER FALSCH: nur Fehler, die sich durch Ersetzen GENAU EINES Wortes durch EIN anderes Wort beheben lassen (eine Kurzform zählt als ein Wort) – keine Fehler durch ein überflüssiges oder fehlendes Wort und keine Wortstellungsfehler. Der Fehler betrifft die geübte Grammatik, nicht Rechtschreibung oder anderes.',
  '- Zeichensetzung und Wortstellung (Komma bei Relativsätzen, Stellung von Adverbien, Inversion, Fragen): nie als Lücke mit einem Satzzeichen oder „—“ als Lösung; stattdessen Auswahl zwischen ganzen Sätzen (satz = „___“, optionen = vollständige Sätze), Satzbau oder Umformen.',
  '- UMFORMEN: Anweisung oder vorgabe nennt die Zielform; die Lösung ist ein anderer Satz als der Ausgangssatz; alle gleichwertigen Fassungen in „loesungen“.',
  '- SATZBAU: genau eine sinnvolle Reihenfolge; die geübte Form steht nicht schon fertig in einem einzigen Teil.',
  '- Lösungen sind tippbare Wörter der Zielsprache – keine Erklärungen („streichen“, „nichts“), keine Platzhalter („—“), kein „/“ zwischen Varianten (jede Variante einzeln in „loesungen“).'
].join('\n')

/** Zusatz für die Prüfung durch die KI: dieselben Regeln als Prüfpunkte */
export const PRUEF_REGELN =
  'ok = false auch, wenn eine Regel aus QUALITÄT verletzt ist und sich nicht über Lösungen, Möglichkeiten oder Fehlerwort reparieren lässt – besonders: Lücke ohne Grundwort, deren Lösung man raten muss; Vorgabe gleich Lösung; mehrere Lücken; Fehler, der sich nicht durch EIN Wort beheben lässt; Auswahl mit zwei richtigen Möglichkeiten; nicht tippbare Lösung.'

// ---------------------------------------------------------------- ohne KI richten

const klammerInhalt = (v: string | undefined): string =>
  String(v ?? '')
    .trim()
    .replace(/^\(\s*|\s*\)$/g, '')
    .trim()

/** Möglichkeiten aus einer Vorgabe wie „(since / for)“ oder „(who oder which)“; leer, wenn keine Wahl darin steht */
export function wahlAusVorgabe(vorgabe: string | undefined): string[] {
  const innen = klammerInhalt(vorgabe)
  if (!innen || !/\s\/\s|\/|\s(oder|or|ou|o)\s/i.test(innen)) return []
  const teile = innen
    .split(/\s*\/\s*|\s+(?:oder|or|ou|o)\s+|\s*,\s*/i)
    .map((x) => x.trim())
    .filter(Boolean)
  return teile.length >= 2 && teile.length <= 5 ? teile : []
}

/** Möglichkeiten aus einer Anweisung wie „Setze despite, in spite of oder because of ein.“ */
export function wahlAusAnweisung(anweisung: string | undefined): string[] {
  const m = /(?:setze|ergänze|wähle|trage)\s+(.+?)\s+(?:ein|richtig ein|in die lücke)\b/i.exec(String(anweisung ?? ''))
  if (!m) return []
  const teile = m[1]
    .replace(/[„“"‚‘']/g, '')
    .split(/\s*,\s*|\s+oder\s+|\s*\/\s*/i)
    .map((x) => x.trim())
    .filter(Boolean)
  return teile.length >= 2 && teile.length <= 5 && teile.every((t) => t.split(/\s+/).length <= 4) ? teile : []
}

const enthalten = (liste: readonly string[], wert: string): boolean => liste.some((x) => normiert(x) === normiert(wert))

/**
 * Was sich ohne KI richten lässt (28.10.2026). Rein: liefert eine neue Aufgabe, die Kennung bleibt.
 *  - Lücke beim Erkennen/Unterscheiden mit einer Wahl in Vorgabe oder Anweisung („(since / for)“) → Auswahl mit diesen Möglichkeiten.
 *  - Lücke beim Erkennen/Unterscheiden mit Grundform (≠ Lösung) → Übungsart Bilden (das ist sie in der Sache).
 *  - „Wähle …“ bei einer Lücke → „Setze … ein“.
 *  - doppelte Möglichkeiten bei der Auswahl entfernen.
 */
export function aufgabeNormalisiert<T extends GrammatikAufgabe>(a: T): T {
  let x: T = { ...a }
  if (x.art === 'luecke' && (x.uebung === 'erkennen' || x.uebung === 'unterscheiden') && x.loesungen.length) {
    const wahl = wahlAusVorgabe(x.vorgabe)
    const ausAnweisung = wahl.length ? [] : !x.vorgabe ? wahlAusAnweisung(x.anweisung) : []
    const moeglich = wahl.length ? wahl : ausAnweisung
    if (moeglich.length && enthalten(moeglich, x.loesungen[0]) && moeglich.filter((m) => enthalten(x.loesungen, m)).length === 1) {
      const richtig = moeglich.find((m) => normiert(m) === normiert(x.loesungen[0]))!
      const { vorgabe: _v, ...rest } = x
      void _v
      x = { ...(rest as T), art: 'auswahl', optionen: moeglich, loesungen: [richtig], anweisung: 'Wähle die passende Form.' }
    } else if (x.vorgabe && !wahl.length && !enthalten(x.loesungen, klammerInhalt(x.vorgabe))) {
      x = { ...x, uebung: 'bilden' }
    }
  }
  if (x.art === 'luecke' && /^\s*w[äa]hle\b/i.test(x.anweisung)) x = { ...x, anweisung: x.vorgabe ? 'Setze die passende Form ein.' : 'Ergänze die Lücke.' }
  if (x.art === 'auswahl' && x.optionen) {
    const ohne: string[] = []
    for (const o of x.optionen) if (!enthalten(ohne, o)) ohne.push(o)
    if (ohne.length !== x.optionen.length) x = { ...x, optionen: ohne }
  }
  return x
}

// ---------------------------------------------------------------- Mängel

// Ganze Lösung ein Platzhalter oder eine Anweisung (nicht einzelne Wörter darin – „nichts“ kann im Deutschen die Lösung sein)
const UNTIPPBAR = /^[\s—–\-.,;:!?…]*$|^\s*[—–]|^\s*\(?\s*(streichen|entfernen|weglassen|kein wort|leer lassen)\b|\b(streichen|entfernen)\s*\)?\s*$/i
const wortzahl = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length

/**
 * Mangel einer Aufgabe nach den Regeln (28.10.2026) – leer, wenn keiner. Geprüft wird, was sich am Text sicher erkennen
 * lässt; inhaltliche Fehler findet nur die KI bzw. die Prüfung durch eine Lehrkraft.
 */
export function aufgabeMangel(a: GrammatikAufgabe): string {
  const l = a.loesungen ?? []
  if (a.art === 'luecke' || a.art === 'auswahl') {
    const n = (a.satz.match(/___/g) ?? []).length
    if (n !== 1) return 'mehrere Lücken in einem Satz'
  }
  if (a.art === 'luecke') {
    const v = klammerInhalt(a.vorgabe)
    if (v && !wahlAusVorgabe(a.vorgabe).length && enthalten(l, v)) return 'Vorgabe ist schon die Lösung'
    if (a.uebung === 'erkennen' || a.uebung === 'unterscheiden') return 'freie Lücke beim Erkennen bzw. Unterscheiden (braucht Auswahl)'
    // Bilden heißt: aus einem Grundwort – ohne Vorgabe und ohne genannte Wahl muss geraten werden
    if (a.uebung === 'bilden' && !a.vorgabe && !wahlAusAnweisung(a.anweisung).length) return 'Lücke ohne Grundwort beim Bilden'
  }
  if (['luecke', 'umformen', 'fehler'].includes(a.art) && l.some((x) => UNTIPPBAR.test(x) || /\s\/\s/.test(x))) return 'Lösung nicht tippbar'
  if (a.art === 'auswahl') {
    if (!a.optionen || a.optionen.length < 2 || !enthalten(a.optionen, l[0] ?? '')) return 'Lösung steht nicht unter den Möglichkeiten'
  }
  if (a.art === 'fehler') {
    if (!a.fehlerWort || !woerterVon(a.satz).some((w) => normiert(w) === normiert(a.fehlerWort!))) return 'Fehlerwort steht nicht im Satz'
    if (enthalten(l, a.fehlerWort)) return 'Korrektur gleich Fehlerwort'
    if (l.length && l.every((x) => wortzahl(x) > 2)) return 'Fehler lässt sich nicht durch ein Wort beheben'
  }
  if (a.art === 'umformen' && l.length && enthalten(l, a.satz)) return 'Lösung gleich Ausgangssatz'
  if (a.art === 'satzbau' && a.teile?.length && l.length) {
    const nur = (s: string): string => normiert(s).replace(/[^\p{L}\p{N}]/gu, '')
    if (!l.some((x) => nur(x) === nur(a.teile!.join(' ')))) return 'Teile ergeben nicht die Lösung'
  }
  return ''
}

/** Neue Aufgaben (KI): erst richten, dann alles mit Mangel weglassen – mit Gründen für den Bericht */
export function aufgabenGeprueft<T extends GrammatikAufgabe>(liste: readonly T[]): { aufgaben: T[]; gestrichen: { grund: string; satz: string }[] } {
  const aufgaben: T[] = []
  const gestrichen: { grund: string; satz: string }[] = []
  for (const roh of liste) {
    const a = aufgabeNormalisiert(roh)
    const m = aufgabeMangel(a)
    if (m) gestrichen.push({ grund: m, satz: a.satz.slice(0, 80) })
    else aufgaben.push(a)
  }
  return { aufgaben, gestrichen }
}
