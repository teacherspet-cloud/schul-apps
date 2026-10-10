/**
 * Cover der Schulbuch-Bände in „Vokabellisten" (09.10.2026, Wunsch der Lehrkraft).
 *
 * Hier stehen NUR die Adressen der Verlagsbilder – keine Bilddateien. Die Lehrkraft hat entschieden, die Cover direkt
 * beim Verlag zu laden und weder im Projekt noch auf dem Server oder in der Exe abzulegen (Urheberrecht). Fehlt das Netz
 * oder hat der Verlag die Adresse geändert, zeigt die Liste eine schlichte Kachel in der Bandfarbe mit der Bandnummer.
 *
 * Quelle: die Produktübersichten der Lehrwerke auf klett.de (abgerufen am 09.10.2026), jeweils das Bild „…_2469_200.jpg"
 * (200 px breit) des Schulbuchs (Schülerausgabe; fester und flexibler Einband haben dasselbe Cover). Die Bundesländer je
 * Ausgabe stammen aus der Angabe „In mehreren Bundesländern verfügbar" der Produktseite bzw. aus dem Namen der Ausgabe.
 *   https://www.klett.de/lehrwerk/green-line-bundesausgabe-ab-2021/produktuebersicht
 *   https://www.klett.de/lehrwerk/green-line-g9-ausgabe-ab-2019/produktuebersicht
 *   https://www.klett.de/lehrwerk/green-line-bundesausgabe-ab-2014/produktuebersicht
 *   https://www.klett.de/lehrwerk/green-line-ausgabe-baden-wuerttemberg-ab-2016/produktuebersicht
 *   https://www.klett.de/lehrwerk/green-line-g9-ausgabe-baden-wuerttemberg-ab-2025/produktuebersicht
 *   https://www.klett.de/lehrwerk/green-line-ausgabe-bayern-ab-2017/produktuebersicht
 *   https://www.klett.de/lehrwerk/green-line-transition-ausgabe-ab-2018/produktuebersicht
 *   https://www.klett.de/lehrwerk/green-line-transition-ausgabe-bayern-ab-2023/produktuebersicht
 *   https://www.klett.de/lehrwerk/green-line-oberstufe-ausgabe-ab-2021/produktuebersicht
 *   https://www.klett.de/lehrwerk/green-line-oberstufe-ausgabe-bayern-ab-2024/produktuebersicht
 * Alle Adressen am 09.10.2026 geprüft (HTTP 200, image/jpeg, ohne Referrer).
 *
 * Französisch und Spanisch (10.10.2026, zu den Platzhalter-Lehrwerken vom 09.10.2026):
 *   https://www.klett.de/lehrwerk/decouvertes-serie-jaune-ausgabe-ab-2012/produktuebersicht
 *   https://www.klett.de/lehrwerk/decouvertes-ausgabe-ab-2020/produktuebersicht
 *     → wie oben das Bild „…_2469_200.jpg" des Schulbuchs (fester Einband); Band 5 der Série jaune heißt beim Verlag
 *       „Découvertes 5 Série jaune – Passerelle". Bundesländer aus „In mehreren Bundesländern verfügbar" der Produktseite.
 *   https://www.cornelsen.de/reihen/apuntate-120001230000/spanisch-als-2-fremdsprache-ausgabe-2016-120001230004
 *   https://www.cornelsen.de/reihen/apuntate-120001230000/spanisch-als-2-fremdsprache-ausgabe-2024-120001230005
 *     → Produktseiten der Schulbücher (cornelsen.de/produkte/<ISBN ohne Striche>), Bild auf static.cornelsen.de:
 *       „media/<ISBN>/<ISBN>_COVER_STD_B110_X2.png" (220 px breit; B160/B260 wären größer). Bundesländer aus der Angabe
 *       „Bundesland" der Produktseite. Eigene Niedersachsen-Schulbücher gibt es nicht: Niedersachsen nutzt dieselben Bände,
 *       nur die Arbeitshefte unterscheiden sich (Cuaderno 1A/1B, Nivel avanzado/elemental). Ausgabe 2024 hat bisher die
 *       Bände 1–4 (Band 4 laut Verlag 2026) – für Band 5 gibt es noch kein Cover (Ersatzkachel).
 * Alle Adressen am 10.10.2026 geprüft (HTTP 200, image/jpeg bzw. image/png, ohne Referrer und ohne Cookies).
 *
 * Bildquellen sind allein assets.klett.de und static.cornelsen.de. Die CSP der Oberfläche (src/renderer/index.html) lässt
 * Bilder über https: zu.
 */

export interface CoverAusgabe {
  /** Reihe wie in den Lehrwerken („Green Line") */
  reihe: string
  /** Name der Ausgabe beim Verlag („Ausgabe ab 2021", „G9 Ausgabe Baden-Württemberg ab 2025") */
  ausgabe: string
  /** Jahr der Ausgabe („ab 2021" → 2021) – passt zur Angabe `ausgabe` der Lehrwerke */
  jahr: number
  /** Band: „1"–„6", „Transition", „Oberstufe" */
  band: string
  /** ISBN des Schulbuchs (fester Einband, sonst das einzige) */
  isbn: string
  /** Bundesländer (Kürzel aus src/shared/schulformen.ts) */
  laender: string[]
  /** Allgemeine Ausgabe – Rückfall, wenn keine Ausgabe zum Land passt */
  allgemein?: boolean
  /**
   * Nur für Bände genau dieser Ausgabe (10.10.2026): nennt der Band ein Jahr („ab 2024"), gilt das Cover nur bei gleichem
   * Jahr. Für Reihen, deren Ausgaben eigene Bände mit anderem Inhalt haben (¡Apúntate! 2016/2024) – ein Band 5 der Ausgabe
   * 2024 soll nicht das Cover der Ausgabe 2016 zeigen. Green Line braucht das nicht (BW ab 2016 nutzt Bände der
   * Bundesausgabe ab 2014).
   */
  nurEigeneAusgabe?: boolean
  /** Verlag („Klett", „Cornelsen") */
  verlag: string
  /** Bild beim Verlag */
  url: string
}

const KLETT = 'https://assets.klett.de/assets/'
const CORNELSEN = 'https://static.cornelsen.de/media/'
const OHNE_BY = ['BW', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']

const klett = (reihe: string, ausgabe: string, jahr: number, laender: string[], allgemein: boolean, baende: [string, string, string][]): CoverAusgabe[] =>
  baende.map(([band, isbn, pfad]) => ({ reihe, ausgabe, jahr, band, isbn, laender, allgemein: allgemein || undefined, verlag: 'Klett', url: KLETT + pfad }))

const gl = (ausgabe: string, jahr: number, laender: string[], allgemein: boolean, baende: [string, string, string][]): CoverAusgabe[] =>
  klett('Green Line', ausgabe, jahr, laender, allgemein, baende)

/** Cornelsen: Bild unter der ISBN ohne Striche */
const cornelsen = (reihe: string, ausgabe: string, jahr: number, laender: string[], baende: [string, string][]): CoverAusgabe[] =>
  baende.map(([band, isbn]) => {
    const nr = isbn.replace(/-/g, '')
    return { reihe, ausgabe, jahr, band, isbn, laender, allgemein: true, nurEigeneAusgabe: true, verlag: 'Cornelsen', url: `${CORNELSEN}${nr}/${nr}_COVER_STD_B110_X2.png` }
  })

export const COVER_AUSGABEN: CoverAusgabe[] = [
  // Bundesausgabe ab 2021 – Bände 1–4 (alle Länder außer Bayern; Niedersachsen G9 nutzt sie)
  ...gl('Ausgabe ab 2021', 2021, OHNE_BY, true, [
    ['1', '978-3-12-864010-5', 'c5b2c9b3/Cover_864010_Rahmen_2469_200.jpg'],
    ['2', '978-3-12-864020-4', 'fc2f0bff/Cover_864020_Rahmen_2469_200.jpg'],
    ['3', '978-3-12-864030-3', '8dd90c16/Cover_864030_2469_200.jpg'],
    ['4', '978-3-12-864040-2', '22c8f0a533c9931dbda6f1f127d2d710b1460d6125ecea60fe2dea0f705b72e1/Cover_864040_2469_200.jpg']
  ]),
  // Bände 5 und 6 der Ausgabe ab 2021 für G9 (laut Verlag BW, HE, NI, NW, RP, SL, SH)
  ...gl('G9 Ausgabe ab 2021', 2021, ['BW', 'HE', 'NI', 'NW', 'RP', 'SL', 'SH'], true, [
    ['5', '978-3-12-874050-8', '1ea0ad00562ee79cd2c154dde9c0d91ee02aa77320a9798ca67b021637e7a183/Cover_874051_2469_200.jpg'],
    ['6', '978-3-12-874060-7', '816b53eaa25e6e4dfc62c36a269d3072510c790d5092f3535b4d1c4f69f19798/Cover_874060_2469_200.jpg']
  ]),
  // Band 5 der Ausgabe ab 2021 für G8-Länder
  ...gl('Ausgabe ab 2021', 2021, ['BW', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'RP', 'SL', 'SN', 'ST', 'TH'], false, [
    ['5', '978-3-12-864050-1', '0ac79129e11ef8b099c6f319c8fb9c7475e25617b133a1145856c80391f5d27f/Cover_864051_2469_200.jpg']
  ]),
  // G9 Ausgabe ab 2019 (NRW, Schleswig-Holstein)
  ...gl('G9 Ausgabe ab 2019', 2019, ['NW', 'SH'], false, [
    ['1', '978-3-12-835010-3', '4476f43d/Cover_835010_Rahmen_2469_200.jpg'],
    ['2', '978-3-12-835020-2', '1544a81d/Cover_835020_Rahmen_2469_200.jpg'],
    ['3', '978-3-12-835030-1', 'c804b75f/Cover_835030_Rahmen_2469_200.jpg'],
    ['4', '978-3-12-835040-0', 'c91f9bfc/Cover_835040_Rahmen_2469_200.jpg'],
    ['5', '978-3-12-835050-9', '40cec9ac/Cover_835050_Rahmen_2469_200.jpg'],
    ['6', '978-3-12-835060-8', '7bd35986/Cover_835060_Rahmen_2469_200.jpg']
  ]),
  // Bundesausgabe ab 2014 (G8, Bände 1–5)
  ...gl('Bundesausgabe ab 2014', 2014, OHNE_BY, false, [
    ['1', '978-3-12-834210-8', '2c360418/Cover_834210_Rahmen_2469_200.jpg'],
    ['2', '978-3-12-834220-7', '99596102/Cover_834220_Rahmen_2469_200.jpg'],
    ['3', '978-3-12-834230-6', '37af9393/Cover_834230_Rahmen_2469_200.jpg'],
    ['4', '978-3-12-834240-5', '741dfa83/Cover_834240_Rahmen_2469_200.jpg'],
    ['5', '978-3-12-834250-4', '9bd84162/Cover_834250_Rahmen_2469_200.jpg']
  ]),
  // Ausgabe Baden-Württemberg ab 2016: eigene Bände 2 und 3 (1, 4, 5 aus der Bundesausgabe ab 2014)
  ...gl('Ausgabe Baden-Württemberg ab 2016', 2016, ['BW'], false, [
    ['2', '978-3-12-834120-0', '3af99e98/Cover_834120_Rahmen_2469_200.jpg'],
    ['3', '978-3-12-834130-9', '7778817a/Cover_834130_Rahmen_2469_200.jpg']
  ]),
  // G9 Ausgabe Baden-Württemberg ab 2025 (bisher Bände 1–4)
  ...gl('G9 Ausgabe Baden-Württemberg ab 2025', 2025, ['BW'], false, [
    ['1', '978-3-12-875010-1', 'a0bd2513c68ca8c009e6dd83ce373ec142f6f45fe116108e22869332019b12d3/Cover_875010_2469_200.jpg'],
    ['2', '978-3-12-875020-0', '744715811791873ff88c3d082fcc27f3f575aff6d1ffcbfda0bdeed9f5465d9f/Cover_875020_2469_200.jpg'],
    ['3', '978-3-12-875030-9', 'a6ef162ce6da065339f69454d02a73c908d66383782baebc1908d10c8c0527c1/Cover_875030_2469_200.jpg'],
    ['4', '978-3-12-875040-8', '0ba2dcb899f26293bcf1364e685579ece91d39c09c0eb7e8cf829e56f10b9183/Cover_875040_2469_200.jpg']
  ]),
  // Ausgabe Bayern ab 2017
  ...gl('Ausgabe Bayern ab 2017', 2017, ['BY'], false, [
    ['1', '978-3-12-803010-4', '23b6802e/Cover_803010_Rahmen_2469_200.jpg'],
    ['2', '978-3-12-803020-3', '13039024/Cover_803020_Rahmen_2469_200.jpg'],
    ['3', '978-3-12-803030-2', '7a181b9d/Cover_803030_Rahmen_2469_200.jpg'],
    ['4', '978-3-12-803040-1', 'd87affb2/Cover_803040_Rahmen_2469_200.jpg'],
    ['5', '978-3-12-803050-0', 'cce8443b/Cover_803050_Rahmen_2469_200.jpg'],
    ['6', '978-3-12-803060-9', 'faf313f0/Cover_803060_Rahmen_2469_200.jpg']
  ]),
  // Transition (Klasse 10 G8 / 11 G9)
  ...gl('Transition Ausgabe ab 2018', 2018, OHNE_BY, true, [['Transition', '978-3-12-834260-3', 'ddcc8ddd/Cover_834260_Rahmen_2469_200.jpg']]),
  ...gl('Transition Ausgabe Bayern ab 2023', 2023, ['BY'], false, [['Transition', '978-3-12-834370-9', '1cc6aa26/Cover_834370_2469_200.jpg']]),
  // Oberstufe
  ...gl('Oberstufe Ausgabe ab 2021', 2021, ['BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'], true, [
    ['Oberstufe', '978-3-12-550004-4', '4dbb4e04/Cover_550004_Rahmen_2469_200.jpg']
  ]),
  ...gl('Oberstufe Ausgabe Nordrhein-Westfalen ab 2021', 2021, ['NW'], false, [['Oberstufe', '978-3-12-550002-0', '480b8794/Cover_550002_Rahmen_2469_200.jpg']]),
  ...gl('Oberstufe Ausgabe Baden-Württemberg ab 2021', 2021, ['BW'], false, [['Oberstufe', '978-3-12-550003-7', 'a99d334/Cover_550003_Rahmen_2469_200.jpg']]),
  ...gl('Oberstufe Ausgabe Bayern ab 2024', 2024, ['BY'], false, [
    ['Oberstufe', '978-3-12-550000-6', '1217077a365771d663525842827c7fe3d5e6ee0b65f9804000b5e9efed970995/Cover_550000_2469_200.jpg']
  ]),

  // Französisch (10.10.2026): Découvertes Série jaune (ab Klasse 6), Ausgabe ab 2012 – laut Verlag BW, HB, HH, HE, NI, NW,
  // RP, SL, SN, SH, TH; als einzige Ausgabe der Reihe auch der Rückfall
  ...klett('Découvertes Série jaune', 'Série jaune (ab Klasse 6) Ausgabe ab 2012', 2012, ['BW', 'HB', 'HH', 'HE', 'NI', 'NW', 'RP', 'SL', 'SN', 'SH', 'TH'], true, [
    ['1', '978-3-12-622011-8', '296c1976/Cover_622011_Rahmen_2469_200.jpg'],
    ['2', '978-3-12-622021-7', '360cb0ee/Cover_622021_Rahmen_2469_200.jpg'],
    ['3', '978-3-12-622031-6', 'e839abe/Cover_622031_Rahmen_2469_200.jpg'],
    ['4', '978-3-12-622041-5', '7d1ecb75/Cover_622041_Rahmen_2469_200.jpg'],
    ['5', '978-3-12-622051-4', '9687fa95/Cover_622051_Rahmen_2469_200.jpg']
  ]),
  // Découvertes, Ausgabe 1. oder 2. Fremdsprache ab 2020 – alle Länder außer Bayern
  ...klett('Découvertes', 'Ausgabe 1. oder 2. Fremdsprache ab 2020', 2020, OHNE_BY, true, [
    ['1', '978-3-12-624011-6', 'dd5d80b2/Cover_624011_Rahmen_2469_200.jpg'],
    ['2', '978-3-12-624021-5', '530cb51/Cover_624021_Rahmen_2469_200.jpg'],
    ['3', '978-3-12-624031-4', 'be43c9aa/Cover_624031_Rahmen_2469_200.jpg'],
    ['4', '978-3-12-624041-3', '940cb0a1/Cover_624041_2469_200.jpg'],
    ['5', '978-3-12-624051-2', 'dd2d87d31924f1fe143a8cb927db971e21f1a48601f7e106e6fae3ead247c3e0/Cover_624051_2469_200.jpg']
  ]),

  // Spanisch (10.10.2026): ¡Apúntate! Spanisch als 2. Fremdsprache – Ausgabe 2016 (Länder laut Verlag ohne BW, BY)
  ...cornelsen('¡Apúntate!', 'Spanisch als 2. Fremdsprache – Ausgabe 2016', 2016, ['BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'], [
    ['1', '978-3-06-024837-7'],
    ['2', '978-3-06-121118-9'],
    ['3', '978-3-06-121196-7'],
    ['4', '978-3-06-121197-4'],
    ['5', '978-3-06-121198-1']
  ]),
  // Ausgabe 2024 (Länder laut Verlag ohne BW, BY, RP, SL); Band 5 noch nicht erschienen
  ...cornelsen('¡Apúntate!', 'Spanisch als 2. Fremdsprache – Ausgabe 2024', 2024, ['BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'SN', 'ST', 'SH', 'TH'], [
    ['1', '978-3-06-122987-0'],
    ['2', '978-3-06-123052-4'],
    ['3', '978-3-06-123053-1'],
    ['4', '978-3-06-123054-8']
  ])
]

/** Was ein Band über sich weiß (Auszug aus TextbookMeta) */
export interface CoverBand {
  name: string
  reihe?: string
  band?: string
  ausgabe?: string
  stateId?: string
}

/** Vergleichsform: Akzente weg („Découvertes" → „decouvertes"), Satzzeichen wie „¡" und „!" weg, klein */
const norm = (s: string | undefined): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** Reihe und Band – aus den Angaben, sonst aus dem Namen („Green Line 3", „Green Line Transition") */
function reiheUndBand(b: CoverBand): { reihe: string; band: string } | null {
  // längste Reihe zuerst: „Découvertes Série jaune 1" gehört zu „Découvertes Série jaune", nicht zu „Découvertes"
  const reihen = [...new Set(COVER_AUSGABEN.map((a) => a.reihe))].sort((x, y) => norm(y).length - norm(x).length)
  const reihe = reihen.find((r) => norm(r) === norm(b.reihe)) ?? reihen.find((r) => norm(b.name).startsWith(norm(r)))
  if (!reihe) return null
  let band = (b.band ?? '').trim()
  if (!band) {
    // Rest des Namens hinter der Reihe – auch wenn der Name sie anders schreibt („Apuntate 1" zu „¡Apúntate!")
    const name = b.name.trim()
    let ende = 0
    for (let i = 1; i <= name.length; i++) if (norm(name.slice(0, i)) === norm(reihe)) ende = i
    band = name.slice(ende).trim().split(/\s+/)[0] ?? ''
  }
  const treffer = COVER_AUSGABEN.find((a) => a.reihe === reihe && norm(a.band) === norm(band))
  return treffer ? { reihe, band: treffer.band } : null
}

/**
 * Die passende Ausgabe eines Bands für ein Bundesland.
 *
 * Land: das des Bands, wenn er eines nennt (ein Niedersachsen-Band zeigt das Niedersachsen-Cover, auch wenn die Lerngruppe
 * woanders liegt – die Vokabeln sind die der Niedersachsen-Ausgabe), sonst das der Lerngruppe bzw. der Einstellungen.
 * Unter den Ausgaben dieses Lands gewinnt die mit dem Jahr der Lehrwerk-Angabe („ab 2021"), dann die neuere, dann die
 * landeseigene (weniger Länder). Passt keine zum Land: die allgemeine Ausgabe. Unbekannte Reihe oder Band → null.
 */
export function coverAusgabe(b: CoverBand, land?: string): CoverAusgabe | null {
  const rb = reiheUndBand(b)
  if (!rb) return null
  const jahr = Number(/\d{4}/.exec(b.ausgabe ?? '')?.[0] ?? 0)
  const kandidaten = COVER_AUSGABEN.filter(
    (a) => a.reihe === rb.reihe && a.band === rb.band && !(a.nurEigeneAusgabe && jahr && a.jahr !== jahr)
  )
  const ziel = b.stateId || land
  const reihenfolge = (x: CoverAusgabe, y: CoverAusgabe): number =>
    Number(y.jahr === jahr) - Number(x.jahr === jahr) || y.jahr - x.jahr || x.laender.length - y.laender.length
  const passend = ziel ? kandidaten.filter((a) => a.laender.includes(ziel)) : []
  if (passend.length) return [...passend].sort(reihenfolge)[0]
  return [...kandidaten.filter((a) => a.allgemein)].sort(reihenfolge)[0] ?? kandidaten[0] ?? null
}

/** Kurzzeichen für die Ersatzkachel: Bandnummer, „T" (Transition), „O" (Oberstufe) */
export function bandKuerzel(b: CoverBand): string {
  const band = reiheUndBand(b)?.band ?? b.band ?? ''
  if (/^\d+$/.test(band)) return band
  return (band || b.name).trim().charAt(0).toUpperCase() || '?'
}

/** Farbe der Ersatzkachel (Mantine-Farbname): Green Line grün, sonst nach dem Reihennamen */
export function bandFarbe(b: CoverBand): string {
  const reihe = norm(b.reihe || b.name)
  for (const [muster, farbe] of [
    ['green', 'green'],
    ['orange', 'orange'],
    ['red', 'red'],
    ['blue', 'blue']
  ] as const)
    if (reihe.startsWith(muster)) return farbe
  const farben = ['teal', 'indigo', 'grape', 'cyan', 'violet', 'pink']
  let h = 0
  for (const c of reihe) h = (h * 31 + c.charCodeAt(0)) % 997
  return farben[h % farben.length]
}
