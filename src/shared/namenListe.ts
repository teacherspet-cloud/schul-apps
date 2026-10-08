/**
 * Namen aus einer Klassenliste (08.10.2026, Wunsch der Lehrkraft: Lernende in ein Vokabeltraining eintragen –
 * eingetippt oder „als PDF, CSV, Word usw. automatisch"). Liest Text aus Tabellen und Listen:
 *  - Kopfzeile mit „Nachname"/„Vorname" (oder „Name") bestimmt die Spalten,
 *  - „Nachname, Vorname" bzw. ohne Kopfzeile zwei Spalten „Nachname | Vorname" (übliche Schulverwaltung),
 *  - eine Spalte „Vorname Nachname"; Nummern davor („1.", „12)") fallen weg.
 * Gespeichert wird wie bei allen Gästen nur „Vorname N." (Datensparsamkeit) – bei Gleichheit mit mehr Buchstaben.
 */
export interface Person {
  vorname: string
  nachname: string
}

const NAMENSTEIL = /^\p{L}[\p{L}'’-]*$/u
const KEIN_NAME = /\b(klasse|schuljahr|lehrer|lehrkraft|seite|datum|summe|gesamt|anzahl|schule|stand)\b/i
const KOPF_VOR = /^(vorname|vornamen|rufname|first ?name)$/i
const KOPF_NACH = /^(nachname|familienname|name|last ?name|surname)$/i
const KOPF_GANZ = /^(schüler(in)?|schüler\/innen|name des kindes|schülername|vor- und nachname|lernende)$/i

const istTeil = (s: string): boolean => s.split(/\s+/).every((w) => NAMENSTEIL.test(w)) && s.length <= 40

/** Word-HTML in Zeilen mit Tabulatoren (Tabellenzellen) */
export function htmlAlsZeilen(html: string): string {
  return html
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<\/(tr|p|li|h\d)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

const ohneNummer = (s: string): string => s.replace(/^\s*\d{1,3}\s*[.):]?\s+/, '').trim()

/** Eine Zelle „Nachname, Vorname" oder „Vorname Nachname" */
function ausZelle(zelle: string): Person | null {
  const s = ohneNummer(zelle).replace(/\s+/g, ' ').trim()
  if (!s || /\d/.test(s) || KEIN_NAME.test(s)) return null
  const komma = s.split(',').map((x) => x.trim())
  if (komma.length === 2 && istTeil(komma[0]) && istTeil(komma[1]) && komma[1]) return { vorname: komma[1], nachname: komma[0] }
  const w = s.split(' ')
  if (w.length < 2 || w.length > 5 || !istTeil(s)) return null
  return { vorname: w.slice(0, -1).join(' '), nachname: w[w.length - 1] }
}

export function namenAusText(text: string): Person[] {
  const zeilen = text
    .replace(/\r/g, '')
    .split('\n')
    .map((z) => z.trim())
    .filter(Boolean)
  const trenner = (z: string): string[] =>
    (z.includes('\t') ? z.split('\t') : z.includes(';') ? z.split(';') : z.split(/ {3,}|\|/)).map((c) => c.replace(/^"|"$/g, '').trim())
  // CSV mit Komma als Trenner: nur, wenn die Kopfzeile Vorname/Nachname durch Komma trennt
  const csvKomma = zeilen.length > 0 && /(vorname|nachname)/i.test(zeilen[0]) && !/[\t;]/.test(zeilen[0]) && zeilen[0].includes(',')
  const teile = (z: string): string[] => (csvKomma ? z.split(',').map((c) => c.replace(/^"|"$/g, '').trim()) : trenner(z))
  let vor = -1
  let nach = -1
  let ganz = -1
  const ergebnis: Person[] = []
  for (const z of zeilen) {
    const c = teile(z)
    const kv = c.findIndex((x) => KOPF_VOR.test(x))
    const kn = c.findIndex((x) => KOPF_NACH.test(x))
    const kg = c.findIndex((x) => KOPF_GANZ.test(x))
    if (kv >= 0 || kn >= 0 || kg >= 0) {
      vor = kv
      nach = kn
      ganz = kv < 0 ? (kg >= 0 ? kg : kn) : -1
      if (ganz >= 0) nach = -1
      continue
    }
    if (vor >= 0 && nach >= 0) {
      const v = (c[vor] ?? '').trim()
      const n = (c[nach] ?? '').trim()
      if (istTeil(v) && istTeil(n) && v && n && !KEIN_NAME.test(`${v} ${n}`)) ergebnis.push({ vorname: v, nachname: n })
      continue
    }
    if (ganz >= 0) {
      const p = ausZelle(c[ganz] ?? '')
      if (p) ergebnis.push(p)
      continue
    }
    // Ohne Kopfzeile: Nummernspalte weg, dann zwei Namensspalten (Nachname | Vorname) oder eine Zelle
    const inhalt = c.filter((x) => x && !/^\d{1,3}[.)]?$/.test(x))
    if (inhalt.length >= 2 && istTeil(inhalt[0]) && istTeil(inhalt[1]) && !inhalt[0].includes(' ') && !KEIN_NAME.test(z)) {
      ergebnis.push({ vorname: inhalt[1], nachname: inhalt[0] })
      continue
    }
    const p = inhalt.length === 1 ? ausZelle(inhalt[0]) : null
    if (p) ergebnis.push(p)
  }
  return ergebnis
}

const gross = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

/** „Vorname N." – bei Gleichheit (zwei „Anna M.") mit mehr Buchstaben des Nachnamens („Anna Mü.", „Anna Me.") */
export function kurzNamen(personen: Person[], schonDa: string[] = []): string[] {
  const vergeben = new Set(schonDa.map((n) => n.toLowerCase()))
  const aus: string[] = []
  const sauber = personen
    .map((p) => ({ v: p.vorname.split(/\s+/)[0].split('-').map(gross).join('-'), n: p.nachname.replace(/[^\p{L}]/gu, '') }))
    .filter((p) => p.v && p.n)
  for (const p of sauber) {
    let name = ''
    for (let k = 1; k <= 3; k++) {
      const versuch = `${p.v} ${gross(p.n.slice(0, k))}.`
      // Gleich lautende Kurzform bei anderer Person: länger machen; dieselbe Person doppelt: überspringen
      const andere = sauber.some((q) => q !== p && q.v === p.v && q.n.slice(0, k).toLowerCase() === p.n.slice(0, k).toLowerCase() && q.n !== p.n)
      name = versuch
      if (!andere) break
    }
    if (vergeben.has(name.toLowerCase())) continue
    vergeben.add(name.toLowerCase())
    aus.push(name)
  }
  return aus
}
