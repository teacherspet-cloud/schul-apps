/**
 * Redeeinleitungen in Satzanfängen (26.10.2026, Befund der Lehrkraft): In der Sprachhilfe zu einer Zusammenfassung
 * standen „Er schildere, …", „Er betone, …", „Er führe an, …" – die KI hatte das REDEEINLEITENDE Verb in den
 * Konjunktiv I gesetzt. Richtig ist: Das einleitende Verb steht im Indikativ Präsens („Er schildert, dass …"), der
 * Konjunktiv gehört nur in den wiedergegebenen Inhalt („… die USA hätten …"). Die Regel steht im Auftrag an die KI
 * (prompts/gestaltung.ts); hier die Nachbesserung ohne KI für alle Satzanfänge, die trotzdem so ankommen – gilt für
 * jedes Fach und jedes Programm, das Satzanfänge erzeugt (Arbeitsblatt, Klassenarbeit, Lernzielkontrolle, Reihe).
 *
 * Nur am Anfang eines Satzanfangs, nach einem Subjekt aus bis zu drei Wörtern („Er", „Die Autorin", „Manfred Wichmann",
 * „Der Verfasser des Textes" nicht – vier Wörter): dort ist ein Konjunktiv I des Sagens nie gemeint.
 */

/** Konjunktiv I (3. Person Singular) → Indikativ Präsens, nur Verben des Sagens, Meinens und Darstellens */
const INDIKATIV: Record<string, string> = {
  schildere: 'schildert',
  betone: 'betont',
  führe: 'führt',
  erkläre: 'erklärt',
  stelle: 'stellt',
  berichte: 'berichtet',
  beschreibe: 'beschreibt',
  behaupte: 'behauptet',
  meine: 'meint',
  sage: 'sagt',
  nenne: 'nennt',
  vermute: 'vermutet',
  kritisiere: 'kritisiert',
  zeige: 'zeigt',
  hebe: 'hebt',
  verweise: 'verweist',
  warne: 'warnt',
  fordere: 'fordert',
  erläutere: 'erläutert',
  argumentiere: 'argumentiert',
  begründe: 'begründet',
  bezeichne: 'bezeichnet',
  deute: 'deutet',
  verdeutliche: 'verdeutlicht',
  mache: 'macht',
  informiere: 'informiert',
  bemerke: 'bemerkt',
  erwähne: 'erwähnt',
  weise: 'weist',
  unterstreiche: 'unterstreicht',
  betrachte: 'betrachtet',
  bewerte: 'bewertet',
  urteile: 'urteilt',
  folgere: 'folgert',
  schließe: 'schließt',
  rechtfertige: 'rechtfertigt',
  räume: 'räumt',
  gebe: 'gibt',
  gehe: 'geht',
  komme: 'kommt',
  lege: 'legt',
  spreche: 'spricht',
  sehe: 'sieht',
  halte: 'hält',
  nehme: 'nimmt',
  wolle: 'will',
  könne: 'kann',
  müsse: 'muss',
  schreibe: 'schreibt',
  formuliere: 'formuliert',
  thematisiere: 'thematisiert',
  problematisiere: 'problematisiert',
  warnt: 'warnt'
}

/** Subjekt am Anfang: ein bis drei Wörter, das erste groß geschrieben, keine Satzzeichen dazwischen */
const MUSTER = /^((?:[A-ZÄÖÜ][\wäöüß'-]*)(?:\s+[\wäöüÄÖÜß'-]+){0,2}?)\s+([a-zäöüß]+)(?=[\s,.:;!?]|$)/u

/** „Er schildere, dass …" → „Er schildert, dass …"; alles andere unverändert (dasselbe Objekt bei Strings) */
export function redeeinleitungIndikativ(satzanfang: string): string {
  const m = MUSTER.exec(satzanfang)
  if (!m) return satzanfang
  const verb = m[2]
  const indikativ = INDIKATIV[verb]
  if (!indikativ || indikativ === verb) return satzanfang
  // Nebensatz-Einleiter vor dem Verb („Weil er …") oder eine Anführung: kein Satzanfang mit Subjekt
  if (/^(Weil|Dass|Wenn|Obwohl|Da|Nachdem|Bevor|Während|Sobald|Indem|Ob|Wie|Was|Wer|Wo)\b/.test(m[1])) return satzanfang
  return `${m[1]} ${indikativ}${satzanfang.slice(m[0].length)}`
}

/** Alle Satzanfänge einer Sprachhilfe nachbessern (unveränderte Texte bleiben dasselbe Objekt) */
export function satzanfaengeNachbessern<T extends { groups: { items: { text: string }[] }[] }>(block: T): T {
  let geaendert = false
  const groups = block.groups.map((g) => {
    let gruppeGeaendert = false
    const items = g.items.map((it) => {
      const text = redeeinleitungIndikativ(it.text)
      if (text === it.text) return it
      gruppeGeaendert = true
      return { ...it, text }
    })
    if (!gruppeGeaendert) return g
    geaendert = true
    return { ...g, items }
  })
  return geaendert ? { ...block, groups } : block
}
