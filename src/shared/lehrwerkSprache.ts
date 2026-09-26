/**
 * Sprache und Jahrgang aus dem Namen eines Lehrwerks – „Green Line 1" → Englisch, Klasse 5.
 *
 * Befund der Lehrkraft (26.09.2026): Ein Vokabeltest „Green Line 1 - Unit 1, Station 2" war
 * keinem Fach zugeordnet, und die Automatik der Themenbereiche fand deshalb nichts. Der
 * Vokabeltest speichert kein Fach, nur die Zielsprache aus den Testeinstellungen; die fehlte,
 * weil noch kein Test erstellt war. Der Name verrät das Fach aber eindeutig – jedes gängige
 * Lehrwerk gehört zu genau einer Sprache.
 *
 * Nur für die Fremdsprachen; Jahrgänge nur dort, wo Band 1 verlässlich in Klasse 5 beginnt
 * (die englischen Reihen der Sekundarstufe I). Bei zweiten und dritten Fremdsprachen hängt
 * der Startjahrgang von Schule und Sprachenfolge ab – dort bleibt der Jahrgang offen.
 */

interface Reihe {
  muster: RegExp
  language: string
  /** Band 1 = diese Klasse (nur wenn verlässlich) */
  band1Klasse?: number
}

const REIHEN: Reihe[] = [
  // Englisch, Sekundarstufe I – Band 1 in Klasse 5
  { muster: /^green line/i, language: 'en', band1Klasse: 5 },
  { muster: /^orange line/i, language: 'en', band1Klasse: 5 },
  { muster: /^red line/i, language: 'en', band1Klasse: 5 },
  { muster: /^blue line/i, language: 'en', band1Klasse: 5 },
  { muster: /^(english g )?access/i, language: 'en', band1Klasse: 5 },
  { muster: /^english g/i, language: 'en', band1Klasse: 5 },
  { muster: /^camden town/i, language: 'en', band1Klasse: 5 },
  { muster: /^notting hill gate/i, language: 'en', band1Klasse: 5 },
  { muster: /^lighthouse/i, language: 'en', band1Klasse: 5 },
  { muster: /^headlight/i, language: 'en', band1Klasse: 5 },
  { muster: /^highlight/i, language: 'en', band1Klasse: 5 },
  { muster: /^password green/i, language: 'en', band1Klasse: 5 },
  { muster: /^camden market/i, language: 'en', band1Klasse: 5 },
  // Englisch, Oberstufe und Grundschule
  { muster: /^(context|focus on success|green line oberstufe|summit)/i, language: 'en' },
  { muster: /^(playway|sally|bumblebee|ginger|sunshine)/i, language: 'en' },
  // Französisch
  { muster: /^(découvertes|decouvertes|à plus|a plus|tous ensemble|(le )?cours intensif|génération pro|generation pro|réalités|realites|ensemble|pas de problème|horizons|parcours plus)/i, language: 'fr' },
  // Spanisch
  { muster: /^(¡?vamos!? ¡?adelante!?|encuentros|¡?apúntate!?|apuntate|línea verde|linea verde|línea amarilla|linea amarilla|caminos|puente al español|con gusto|perspectivas|eñe|bachillerato)/i, language: 'es' },
  // Latein
  { muster: /^(prima|pontes|roma|cursus|campus|agite|via mea|actio|salvete|adeamus|intra|lumina|felix|iter romanum)/i, language: 'la' },
  // Italienisch
  { muster: /^(scambio|appunto|tutto bene|ecco|(in )?piazza|allegro|espresso)/i, language: 'it' },
  // Niederländisch und Russisch
  { muster: /^(welkom|taal vitaal|nederlands in gang)/i, language: 'nl' },
  { muster: /^(dialog|konetschno|privet)/i, language: 'ru' }
]

/**
 * Was der Name eines Lehrwerks (oder eines danach benannten Tests) über Sprache und Jahrgang
 * verrät. Unbekannter Name → null.
 */
export function lehrwerkAngaben(name: string | undefined): { language: string; grade?: number } | null {
  const n = (name ?? '').trim().replace(/\s+/g, ' ')
  if (!n) return null
  const reihe = REIHEN.find((r) => r.muster.test(n))
  if (!reihe) return null
  if (!reihe.band1Klasse) return { language: reihe.language }
  // Bandnummer direkt nach dem Reihennamen: „Green Line 3 – Unit 1" → 3; „Green Line Transition" → Klasse 11
  const rest = n.replace(reihe.muster, '').trim()
  const band = /^(\d{1,2})(?!\d)/.exec(rest)?.[1]
  if (band) return { language: reihe.language, grade: reihe.band1Klasse + Number(band) - 1 }
  if (/^transition/i.test(rest)) return { language: reihe.language, grade: 11 }
  return { language: reihe.language }
}
