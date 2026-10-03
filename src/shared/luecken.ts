/**
 * Lücken in allen Aufgaben (02.10.2026, Befund und Entscheidung der Lehrkraft).
 *
 * Befund: „It did _______ collect old books." mit der Lösung „not only … but (also)" – die Wendung
 * passt nicht in den Satz; „She wanted to _____ her" mit der Lösung „to reward" – das „to" steht
 * doppelt da. Abgestimmt (gilt für alle Fächer, Materialien und Schulformen):
 *  - Zweiteilige Wendungen (not only … but also, either … or, neither … nor, both … and, as … as,
 *    trennbare Verben …) stehen in EINEM Satz, in dem sie natürlich vorkommen – mit einer Lücke je
 *    Teil; beide Teile richtig = ein Punkt.
 *  - Steht ein Teil der Lösung schon direkt vor oder nach der Lücke, nimmt die App ihn aus der
 *    Lösung (`ohneDoppelte`). Wer ihn trotzdem einträgt, hat im Onlinetest nicht falsch geantwortet.
 *  - Die Prüfrunde prüft ausdrücklich, ob Satz und Lösung zusammen Sinn ergeben.
 */

/** Teile einer mehrteiligen Lösung: „not only … but (also)" → ["not only", "but (also)"] */
export const teileVon = (loesung: string): string[] =>
  String(loesung ?? '')
    .split(/\s*(?:…|\.\.\.)\s*/)
    .map((t) => t.trim())
    .filter(Boolean)

/** Ein optionaler Teil in Klammern: „but (also)" → ["but also", "but"] */
export function mitOptionalem(loesung: string): string[] {
  const s = String(loesung ?? '').trim()
  if (!/\([^)]+\)/.test(s)) return [s]
  const mit = s.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
  const ohne = s
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [...new Set([mit, ohne].filter(Boolean))]
}

const wort = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, '')

/**
 * Wörter, die schon vor bzw. nach der Lücke stehen, aus der Lösung nehmen:
 * „She wanted to" + „to reward" → „reward"; „a" + „a teacher" → „teacher";
 * „look it" + „up" bleibt. Liefert die bereinigte Lösung und was entfernt wurde.
 */
export function ohneDoppelte(vor: string, loesung: string, nach: string): { loesung: string; vorne: string[]; hinten: string[] } {
  let teile = String(loesung ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const vorWoerter = String(vor ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const nachWoerter = String(nach ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const vorne: string[] = []
  const hinten: string[] = []
  // Vorne: die längste Folge, mit der der Text vor der Lücke endet und die Lösung beginnt (nie die ganze Lösung)
  for (let n = Math.min(3, teile.length - 1, vorWoerter.length); n >= 1; n--) {
    const ende = vorWoerter.slice(-n).map(wort)
    if (ende.every((w, i) => w && w === wort(teile[i]))) {
      vorne.push(...teile.slice(0, n))
      teile = teile.slice(n)
      break
    }
  }
  for (let n = Math.min(3, teile.length - 1, nachWoerter.length); n >= 1; n--) {
    const anfang = nachWoerter.slice(0, n).map(wort)
    if (anfang.every((w, i) => w && w === wort(teile[teile.length - n + i]))) {
      hinten.push(...teile.slice(teile.length - n))
      teile = teile.slice(0, teile.length - n)
      break
    }
  }
  return { loesung: teile.join(' '), vorne, hinten }
}

/**
 * Optionaler Teil der Vokabel direkt an der Lücke (03.10.2026, Befund der Lehrkraft: „there are
 * (3) ______ of books" mit „lots (of)"): Das in der Vokabel eingeklammerte Wort gehört in die
 * Lösung, nicht in den Satz – die Lernenden sollen „lots of" selbst schreiben. Also: aus dem Satz
 * nehmen, in der Lösung ohne Klammern verlangen. „to ___" mit „(to) go" → „___" mit „to go".
 */
export function optionalesInLoesung(vor: string, loesung: string, nach: string): { vor: string; loesung: string; nach: string } {
  const s = String(loesung ?? '').trim()
  const hinten = /^(.*\S)\s*\(([^)]+)\)$/.exec(s)
  const vorne = /^\(([^)]+)\)\s*(\S.*)$/.exec(s)
  const nachWoerter = String(nach ?? '').replace(/^\s+/, '')
  const vorText = String(vor ?? '').replace(/\s+$/, '')
  if (hinten) {
    const opt = hinten[2].trim()
    const m = new RegExp(`^${opt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}'’-])`, 'iu').exec(nachWoerter)
    if (m) {
      const rest = nachWoerter.slice(m[0].length).replace(/^\s+/, '')
      return { vor, loesung: `${hinten[1].trim()} ${opt}`, nach: rest && /^\s/.test(nach) && !/^[.,;:!?]/.test(rest) ? ` ${rest}` : rest }
    }
  }
  if (vorne) {
    const opt = vorne[1].trim()
    const m = new RegExp(`(?<![\\p{L}\\p{N}'’-])${opt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'iu').exec(vorText)
    if (m) {
      const rest = vorText.slice(0, m.index).replace(/\s+$/, '')
      return { vor: rest ? `${rest} ` : '', loesung: `${opt} ${vorne[2].trim()}`, nach }
    }
  }
  return { vor, loesung, nach }
}

/** Lückentext mit [[Lösung]]-Markierungen: doppelte Wörter an jeder Lücke aus der Lösung nehmen */
export function lueckentextOhneDoppelte(text: string): string {
  const s = String(text ?? '')
  return s.replace(/\[\[([^\]]+)\]\]/g, (ganz, loesung: string, pos: number) => {
    const vor = s.slice(Math.max(0, pos - 60), pos).replace(/\[\[[^\]]*\]\]/g, ' ')
    const ende = pos + ganz.length
    const nach = s.slice(ende, ende + 60).replace(/\[\[[^\]]*\]\]/g, ' ')
    const r = ohneDoppelte(vor, loesung, nach)
    return r.loesung && r.loesung !== loesung.trim() ? `[[${r.loesung}]]` : ganz
  })
}

/** Regeln für jede Aufgabe mit Lücken (Teil der Anfrage an die KI) */
export const LUECKEN_REGELN = [
  'Rules for every gap:',
  '- The sentence with the solution filled in must be natural, idiomatic and make sense in its situation – the meaning of the tested word/expression must fit what the sentence says (e.g. "not only … but also" needs two things that are both true; do not use it to negate something).',
  '- Two-part expressions (not only … but also, either … or, neither … nor, both … and, as … as, so … that, separable phrasal verbs like "pick … up"): use the expression completely and correctly in ONE sentence and make one gap for EACH part.',
  '- The words directly before and after a gap must not repeat a word of the solution: no "to ___" when the solution is "to reward" (then the solution is "reward"), no "a ___" when the solution is "a teacher".',
  '- The solution must fit the gap grammatically exactly as written (form, number, tense).'
].join('\n')

/** Prüfpunkt für die Prüfrunde (KI) */
export const LUECKEN_PRUEFUNG =
  '- GAPS: read every gap sentence WITH the solution filled in. Report it if the sentence then makes no sense, the tested word/expression does not fit the meaning of the situation, a two-part expression is used incompletely or wrongly, or a word directly next to the gap repeats a word of the solution (e.g. "to ___" with "to reward").'

/** Dieselben Regeln deutsch – für Arbeitsblatt, Klassenarbeit, Grammatiktest, Lernzielkontrolle ([[Lösung]]-Lücken) */
export const LUECKEN_REGELN_DE = [
  '- Lücken ([[Lösung]]): Der Satz mit eingesetzter Lösung muss natürlich, sprachlich korrekt und inhaltlich stimmig sein – die Bedeutung des gesuchten Wortes passt zur Situation (z. B. „not only … but also“ verbindet zwei Dinge, die beide zutreffen; nie zum Verneinen).',
  '- Zweiteilige Wendungen (not only … but also, either … or, sowohl … als auch, weder … noch, trennbare Verben): vollständig in EINEM Satz, je Teil eine eigene Lücke ([[not only]] … [[but also]]).',
  '- Kein Wort der Lösung steht direkt vor oder nach der Lücke noch einmal: nicht „to [[to reward]]“, sondern „to [[reward]]“; nicht „a [[a teacher]]“.'
].join('\n')

/** Prüfpunkt für die Prüfrunden deutschsprachiger Anfragen */
export const LUECKEN_PRUEFUNG_DE =
  '- Lücken: Lies jeden Lückensatz MIT eingesetzter Lösung. Melde, wenn er dann keinen Sinn ergibt, das gesuchte Wort nicht zur Situation passt, eine zweiteilige Wendung unvollständig oder falsch steht oder ein Wort der Lösung direkt neben der Lücke wiederholt wird.'
