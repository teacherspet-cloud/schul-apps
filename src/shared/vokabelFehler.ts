/**
 * Typische Falschschreibungen als Distraktoren (03.10.2026, Wunsch der Lehrkraft: „Typische Fehler von
 * Schülern sind z. B. ‚wiht', ‚whit', ‚withe' statt ‚white', ‚wich', ‚whitch', ‚witch' statt ‚which' …
 * ei und ie wird auch oftmals vertauscht. Finde weitere typische Fehler").
 *
 * Gesammelt sind Fehler, die deutschsprachige Lernende erfahrungsgemäß machen – nach Fehlerquelle:
 *
 *  Englisch
 *  - stumme Buchstaben fehlen: wh → w (which → wich), kn → n (know → now… nur wenn kein Wort entsteht
 *    lässt sich nicht prüfen, also bleibt es ein Distraktor), wr → r, mb → m, gh fehlt (night → nit)
 *  - stummes End-e fehlt oder kommt dazu (white → whit, with → withe)
 *  - Buchstabendreher an Konsonantengruppen (with → wiht, the → teh)
 *  - ie/ei vertauscht (friend → freind, receive → recieve)
 *  - Doppelkonsonant vergessen oder verdoppelt (letter → leter, really → realy, until → untill)
 *  - ch/tch (which → whitch, watch → wach), ck → k (back → bak)
 *  - deutsche Lautschrift: sh → sch (shop → schop), th → d/t am Anfang (this → dis, thing → ting),
 *    v/w vertauscht (very → wery, we → ve), c → k (cat → kat), z statt s (please → pleaze)
 *  - Vokalgruppen: ea ↔ ee, oo → u, ou → o/u, au/ou, ai/ei
 *  - Endungen: -ful → -full, -tion → -shion, -y → -i/-ie, -le → -el (table → tabel), -er/-re
 *  Französisch: Akzente fehlen/verwechselt (é/è/ê), stumme Endungen (-ent, -s, -t, -e), Doppel-
 *    konsonanten, eau → o, ai ↔ é, qu → k, gn → nj, ou → u
 *  Spanisch: Akzente fehlen, b ↔ v, ll ↔ y, h am Anfang fehlt, c/z/s, qu → k, ñ → n
 *  Allgemein (Rückfall): zwei Buchstaben vertauscht, Doppelbuchstabe vereinfacht, Konsonant verdoppelt
 *
 * Kein Distraktor darf (nach Normalisierung) eine richtige Lösung sein.
 */
type Regel = (w: string) => string[]

const ersetze = (w: string, re: RegExp, durch: string): string[] => {
  const aus: string[] = []
  for (const m of w.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
    const i = m.index ?? 0
    aus.push(w.slice(0, i) + m[0].replace(re, durch) + w.slice(i + m[0].length))
  }
  return aus
}

const ENGLISCH: Regel[] = [
  (w) => ersetze(w, /wh/, 'w'),
  (w) => ersetze(w, /^kn/, 'n'),
  (w) => ersetze(w, /^wr/, 'r'),
  (w) => ersetze(w, /mb$/, 'm'),
  (w) => ersetze(w, /gh/, ''),
  (w) => ersetze(w, /ght/, 'gt'),
  (w) => (/[^aeiou]e$/.test(w) && w.length > 3 ? [w.slice(0, -1)] : []),
  (w) => (/[bcdfghklmnprstvz]$/.test(w) && w.length > 2 ? [w + 'e'] : []),
  // „h" aus „wh" rutscht nach hinten (white → withe) oder hinter den Vokal (white → wihte)
  (w) => ersetze(w, /wh([aeiou])([tdn])/, 'w$1$2h'),
  (w) => ersetze(w, /wh([aeiou])/, 'w$1h'),
  (w) => ersetze(w, /th/, 'ht'),
  (w) => ersetze(w, /ie/, 'ei'),
  (w) => ersetze(w, /ei/, 'ie'),
  (w) => ersetze(w, /([bcdfglmnprst])\1/, '$1'),
  (w) => ersetze(w, /([aeiou])([bdglmnprt])([aeiouy])/, '$1$2$2$3'),
  (w) => ersetze(w, /l$/, 'll'),
  (w) => ersetze(w, /([^t])ch/, '$1tch'),
  (w) => ersetze(w, /tch/, 'ch'),
  (w) => ersetze(w, /ck/, 'k'),
  (w) => ersetze(w, /sh/, 'sch'),
  (w) => ersetze(w, /^th/, 'd'),
  (w) => ersetze(w, /^th/, 't'),
  (w) => ersetze(w, /v/, 'w'),
  (w) => ersetze(w, /^w([aeiou])/, 'v$1'),
  (w) => ersetze(w, /^c([aou])/, 'k$1'),
  (w) => ersetze(w, /([aeiou])s([aeiou])/, '$1z$2'),
  (w) => ersetze(w, /ea/, 'ee'),
  (w) => ersetze(w, /ee/, 'ea'),
  (w) => ersetze(w, /oo/, 'u'),
  (w) => ersetze(w, /ou/, 'o'),
  (w) => ersetze(w, /ful$/, 'full'),
  (w) => ersetze(w, /tion$/, 'shion'),
  (w) => ersetze(w, /y$/, 'i'),
  (w) => ersetze(w, /([bcdfgkpt])le$/, '$1el'),
  (w) => ersetze(w, /er$/, 'a'),
  (w) => ersetze(w, /ph/, 'f')
]

const FRANZOESISCH: Regel[] = [
  (w) => ersetze(w, /[éèêë]/, 'e'),
  (w) => ersetze(w, /é/, 'è'),
  (w) => ersetze(w, /è/, 'é'),
  (w) => ersetze(w, /[àâ]/, 'a'),
  (w) => ersetze(w, /ç/, 'c'),
  (w) => ersetze(w, /[ôî]/, w.includes('ô') ? 'o' : 'i'),
  (w) => ersetze(w, /ent$/, 'e'),
  (w) => (/[st]$/.test(w) ? [w.slice(0, -1)] : [w + 's']),
  (w) => (/e$/.test(w) ? [w.slice(0, -1)] : []),
  (w) => ersetze(w, /([lmnrst])\1/, '$1'),
  (w) => ersetze(w, /eau/, 'o'),
  (w) => ersetze(w, /ai/, 'é'),
  (w) => ersetze(w, /qu/, 'k'),
  (w) => ersetze(w, /gn/, 'nj'),
  (w) => ersetze(w, /ou/, 'u')
]

const SPANISCH: Regel[] = [
  (w) => ersetze(w, /[áéíóú]/, (w.match(/[áéíóú]/)?.[0] ?? 'a').normalize('NFD')[0]),
  (w) => ersetze(w, /b/, 'v'),
  (w) => ersetze(w, /v/, 'b'),
  (w) => ersetze(w, /ll/, 'y'),
  (w) => ersetze(w, /^h/, ''),
  (w) => ersetze(w, /z/, 's'),
  (w) => ersetze(w, /c([ei])/, 's$1'),
  (w) => ersetze(w, /qu/, 'k'),
  (w) => ersetze(w, /ñ/, 'n')
]

/** Allgemeine Rückfälle: Buchstabendreher, Doppelbuchstabe vereinfacht, Konsonant verdoppelt */
const ALLGEMEIN: Regel[] = [
  (w) => Array.from({ length: Math.max(0, w.length - 2) }, (_, i) => i + 1).map((i) => w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2)),
  (w) => ersetze(w, /(.)\1/, '$1'),
  (w) => ersetze(w, /([bcdfgklmnprstz])/, '$1$1')
]

const normal = (s: string): string => s.toLowerCase().normalize('NFC').trim()

/**
 * Bis zu `anzahl` Falschschreibungen eines Wortes (nur Einzelwörter und kurze Wendungen; bei Wendungen
 * wird das längste Wort verändert). `verboten`: richtige Lösungen und andere Wörter der Liste.
 */
export function falschschreibungen(wort: string, sprache: string, anzahl = 2, zufall: () => number = Math.random, verboten: string[] = []): string[] {
  const teile = wort.split(' ')
  if (teile.length > 4) return []
  const ziel = [...teile].sort((a, b) => b.length - a.length)[0] ?? wort
  if (ziel.length < 3) return []
  const i = teile.indexOf(ziel)
  const gross = ziel[0] !== ziel[0].toLowerCase()
  const klein = ziel.toLowerCase()
  const regeln = sprache === 'en' ? ENGLISCH : sprache === 'fr' ? FRANZOESISCH : sprache === 'es' ? SPANISCH : []
  const gemischt = <T>(l: T[]): T[] => [...l].sort(() => zufall() - 0.5)
  const verbotenN = new Set([wort, ...verboten].map(normal))
  const aus: string[] = []
  const dazu = (kandidat: string): void => {
    if (aus.length >= anzahl) return
    const k = gross ? kandidat.charAt(0).toUpperCase() + kandidat.slice(1) : kandidat
    const ganz = [...teile.slice(0, i), k, ...teile.slice(i + 1)].join(' ')
    if (!kandidat || kandidat.length < 2 || verbotenN.has(normal(ganz)) || aus.some((a) => normal(a) === normal(ganz))) return
    aus.push(ganz)
  }
  // Typische Fehler der Sprache zuerst, dann die allgemeinen
  for (const r of gemischt(regeln)) for (const k of gemischt(r(klein))) dazu(k)
  for (const r of ALLGEMEIN) for (const k of gemischt(r(klein))) dazu(k)
  return aus
}
