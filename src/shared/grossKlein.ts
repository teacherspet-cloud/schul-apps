/**
 * Groß- und Kleinschreibung automatisch in Textfeldern der Arbeitsblätter (27.10.2026, Wunsch der Lehrkraft):
 * Ein eben getippter Kleinbuchstabe am Satzanfang wird groß – am Feldanfang, am Zeilenanfang und nach . ! ? mit
 * Leerzeichen. „Wenn möglich“ heißt: nur, was sich ohne Wissen über den Text sicher sagen lässt. Nicht nach einem
 * Auslassungszeichen („…“ bzw. „...“), nicht nach Ordnungszahlen („1. Weltkrieg“) und nicht nach erkennbaren
 * Abkürzungen („z. B.“, „d. h.“, „bzw.“, „Nr.“), damit „z. B. das“ nicht zu „z. B. Das“ wird. Nur der getippte Buchstabe
 * ändert sich – was schon im Feld steht, bleibt. Die Lehrkraft kann die Automatik je Freigabe abschalten, in
 * Onlinetests ist sie aus (HandFeld.tsx).
 */
const ABKUERZUNGEN = new Set([
  'bzw',
  'usw',
  'etc',
  'ca',
  'nr',
  'vgl',
  'evtl',
  'ggf',
  'bsp',
  'abs',
  'art',
  'jh',
  'jhd',
  'std',
  'min',
  'dr',
  'prof',
  'mr',
  'mrs',
  'ms',
  'st',
  'no',
  'vs',
  'incl',
  'inkl',
  'exkl',
  'zz',
  'zzt',
  'geb',
  'gest',
  'ff',
  'sog',
  'bes',
  'allg'
])

/** Öffnende Zeichen, die vor einem Satzanfang stehen dürfen */
const OEFFNEND = '["„“‚‘\'(\\[]*'
const FELDANFANG = new RegExp(`^\\s*${OEFFNEND}$`, 'u')
const ZEILENANFANG = new RegExp(`\\n\\s*${OEFFNEND}$`, 'u')
const SATZENDE = new RegExp(`(\\S*?)([.!?…])["“”')\\]]*\\s+${OEFFNEND}$`, 'u')

/**
 * Der Text mit großem Buchstaben an `pos - 1`, wenn dort eben ein Kleinbuchstabe am Satzanfang getippt wurde – sonst null.
 * `pos` ist die Schreibmarke nach dem Tippen (Index hinter dem neuen Zeichen).
 */
export function grossAmSatzanfang(text: string, pos: number): string | null {
  if (pos < 1 || pos > text.length) return null
  const z = text[pos - 1]
  if (!/\p{Ll}/u.test(z)) return null
  const gross = z.toLocaleUpperCase('de')
  if (gross === z || gross.length !== 1) return null
  const vor = text.slice(0, pos - 1)
  if (!amSatzanfang(vor)) return null
  return vor + gross + text.slice(pos)
}

/** Beginnt nach `vor` ein Satz? (Feldanfang, Zeilenanfang oder Satzzeichen mit Leerzeichen – ohne Auslassung, Ordnungszahl und Abkürzung) */
export function amSatzanfang(vor: string): boolean {
  if (FELDANFANG.test(vor) || ZEILENANFANG.test(vor)) return true
  const m = SATZENDE.exec(vor)
  if (!m) return false
  const [, wort, zeichen] = m
  // Auslassungszeichen: der Satz geht weiter
  if (zeichen === '…' || (zeichen === '.' && wort.endsWith('.'))) return false
  if (zeichen === '.') {
    const kern = wort.replace(/^[^\p{L}\d]+/u, '').toLocaleLowerCase('de')
    // Einzelbuchstaben („z. B.“, „d. h.“, „e. g.“), bekannte Abkürzungen, Ordnungszahlen („1. Weltkrieg“, „3. Mai“)
    if (/^\p{L}$/u.test(kern) || /^\p{L}\.\p{L}$/u.test(kern) || ABKUERZUNGEN.has(kern) || /^\d+$/.test(kern)) return false
  }
  return true
}
