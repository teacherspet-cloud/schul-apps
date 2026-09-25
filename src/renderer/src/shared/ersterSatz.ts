/**
 * Teilt einen Erklärtext in den ersten Satz und den Rest (für „Mehr", shared/components/MehrText).
 *
 * Die Hinweise in den Formularen sind voller Abkürzungen („§ 21 Abs. 2 S. 8", „z. B.",
 * „u. a.") und Ordnungszahlen („am 23. September"). Ein Punkt beendet deshalb nur dann einen
 * Satz, wenn danach ein Großbuchstabe oder ein öffnendes Zeichen folgt und davor ein Wort mit
 * mindestens drei Buchstaben (keine bekannte Abkürzung) oder eine Zahl steht, die keine
 * Ordnungszahl ist – so bleibt „z. B. Potenzen" ganz, „Jg. 7/8. Der Lehrplan" wird geteilt.
 */
const ABKUERZUNGEN = new Set(['abs', 'bzw', 'vgl', 'nr', 'ggf', 'usw', 'inkl', 'ca', 'min', 'std', 'evtl', 'sog', 'bzgl', 'etc'])

/** Wörter, nach denen eine Zahl mit Punkt eine Ordnungszahl ist */
const ORDINAL_VOR = new Set([
  'am',
  'vom',
  'zum',
  'bis',
  'ab',
  'dem',
  'den',
  'der',
  'die',
  'das',
  'des',
  'im',
  'zur',
  'einer',
  'eines',
  'jeder',
  'jedem',
  'seit'
])

export function ersterSatz(text: string): [string, string] {
  const t = text.trim()
  const muster = /([.!?])(["“”»)]?)\s+(?=[A-ZÄÖÜ„"(])/g
  let treffer: RegExpExecArray | null
  while ((treffer = muster.exec(t))) {
    const davor = t.slice(0, treffer.index)
    const wort = /([A-Za-zÄÖÜäöüß]+|\d+)$/.exec(davor)?.[1] ?? ''
    // „… (§ 21 Abs. 2 S. 8). Nächster Satz": Nach einer Klammer oder einem Zitat endet der Satz
    const nachKlammer = /[)"“”»]$/.test(davor)
    if (treffer[1] === '.' && !treffer[2] && !nachKlammer) {
      if (/^\d+$/.test(wort)) {
        // „am 23. September", „der 2. Fremdsprache": Ordnungszahl, kein Satzende
        const vorher = /(\S+)\s+[\d/]+$/.exec(davor)?.[1]?.toLowerCase() ?? ''
        if (ORDINAL_VOR.has(vorher)) continue
      } else if (wort.length < 3 || ABKUERZUNGEN.has(wort.toLowerCase())) continue
    }
    const ende = treffer.index + treffer[1].length + treffer[2].length
    return [t.slice(0, ende), t.slice(ende).trim()]
  }
  return [t, '']
}
