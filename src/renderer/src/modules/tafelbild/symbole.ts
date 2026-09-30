/**
 * Piktogramme und Skizzenvorlagen im Tafelstil – einfache Striche, die sich mit Kreide oder
 * Marker abzeichnen lassen (Recherche: „Die Zeichnung muss abmalbar bleiben").
 *
 * Symbole: Ansichtsfläche 0 … 100. Skizzen: 0 … 200 × 0 … 140. Nur Linien (`d`) und
 * wenige gefüllte Flächen (`voll`); die Farbe setzt die Zeichnung.
 */

export interface Zeichen {
  label: string
  /** Suchwörter (für die Zuordnung aus KI-Vorschlägen) */
  woerter: string[]
  d: string[]
  voll?: string[]
  /** feste Bedeutung (Legende), z. B. „Folge" beim Pfeil */
  bedeutung?: string
}

export const SYMBOLE: Record<string, Zeichen> = {
  idee: {
    label: 'Idee (Glühbirne)',
    woerter: ['idee', 'glühbirne', 'licht', 'erkenntnis', 'lampe', 'einfall'],
    d: ['M50 12a26 26 0 0 0-16 46c4 4 6 8 6 12h20c0-4 2-8 6-12a26 26 0 0 0-16-46z', 'M40 78h20M42 86h16M46 93h8', 'M50 30v18M44 42l6 6 6-6']
  },
  achtung: { label: 'Achtung', woerter: ['achtung', 'warnung', 'vorsicht', 'gefahr', 'fehler'], d: ['M50 10L92 86H8Z', 'M50 38v24'], voll: ['M46 72h8v8h-8z'] },
  frage: {
    label: 'Frage',
    woerter: ['frage', 'offen', 'problem', 'unklar'],
    d: ['M32 32a18 18 0 1 1 26 16c-6 3-8 7-8 13v6'],
    voll: ['M45 78h10v10H45z'],
    bedeutung: 'offene Frage'
  },
  blitz: { label: 'Widerspruch (Blitz)', woerter: ['widerspruch', 'konflikt', 'blitz', 'strom', 'streit', 'krise'], d: ['M58 8L26 54h22l-8 38 34-50H52z'], bedeutung: 'Widerspruch' },
  haken: { label: 'Richtig (Haken)', woerter: ['richtig', 'haken', 'ja', 'vorteil', 'pro', 'erfolg'], d: ['M16 52l22 22 46-50'] },
  kreuz: { label: 'Falsch (Kreuz)', woerter: ['falsch', 'kreuz', 'nein', 'nachteil', 'contra', 'fehler'], d: ['M20 20l60 60M80 20L20 80'] },
  plus: { label: 'Plus', woerter: ['plus', 'vorteil', 'positiv', 'mehr'], d: ['M50 18v64M18 50h64'] },
  minus: { label: 'Minus', woerter: ['minus', 'nachteil', 'negativ', 'weniger'], d: ['M18 50h64'] },
  stern: { label: 'Stern', woerter: ['stern', 'wichtig', 'merke', 'highlight'], d: ['M50 8l12 27 29 3-22 20 7 29-26-15-26 15 7-29L9 38l29-3z'] },
  herz: { label: 'Herz', woerter: ['herz', 'liebe', 'gefühl', 'gesundheit', 'emotion'], d: ['M50 86C20 64 10 48 12 32a18 18 0 0 1 38-6 18 18 0 0 1 38 6c2 16-8 32-38 54z'] },
  uhr: { label: 'Uhr / Zeit', woerter: ['uhr', 'zeit', 'dauer', 'frist', 'zeitraum'], d: ['M50 10a40 40 0 1 0 .1 0', 'M50 26v24l16 10'] },
  buch: { label: 'Buch', woerter: ['buch', 'text', 'lesen', 'quelle', 'literatur', 'gesetz'], d: ['M50 24C38 16 22 16 10 20v58c12-4 28-4 40 4 12-8 28-8 40-4V20c-12-4-28-4-40 4z', 'M50 24v58'] },
  person: {
    label: 'Person',
    woerter: ['person', 'mensch', 'mann', 'frau', 'figur', 'akteur', 'bürger', 'kind'],
    d: ['M50 12a11 11 0 1 0 .1 0', 'M50 34v30M50 64L34 90M50 64l16 26M28 44h44']
  },
  gruppe: {
    label: 'Gruppe',
    woerter: ['gruppe', 'menschen', 'gesellschaft', 'volk', 'bevölkerung', 'team', 'klasse'],
    d: ['M50 18a9 9 0 1 0 .1 0', 'M50 36v22M50 58L40 80M50 58l10 22M38 44h24', 'M22 30a8 8 0 1 0 .1 0', 'M22 46v18M22 64l-8 18M22 64l8 18M12 52h20', 'M78 30a8 8 0 1 0 .1 0', 'M78 46v18M78 64l-8 18M78 64l8 18M68 52h20']
  },
  haus: { label: 'Haus', woerter: ['haus', 'wohnen', 'familie', 'heim', 'stadt'], d: ['M12 48L50 16l38 32', 'M20 42v44h60V42', 'M42 86V62h16v24'] },
  fabrik: {
    label: 'Fabrik',
    woerter: ['fabrik', 'industrie', 'produktion', 'wirtschaft', 'arbeit', 'industrialisierung'],
    d: ['M10 88V52l20 12V52l20 12V52l20 12V20h14v68z', 'M74 12c4-4 10-4 14 0', 'M20 76h8M40 76h8M60 76h8']
  },
  baum: { label: 'Baum', woerter: ['baum', 'natur', 'wald', 'pflanze', 'umwelt'], d: ['M50 90V56', 'M50 56c-22 0-34-12-30-28 4-14 20-20 30-14 10-6 26 0 30 14 4 16-8 28-30 28z', 'M50 70l-10-8M50 64l10-8'] },
  pflanze: { label: 'Pflanze', woerter: ['pflanze', 'keimen', 'wachstum', 'blatt', 'fotosynthese'], d: ['M50 90V40', 'M50 60c-20 0-28-12-28-24 16 0 28 8 28 24z', 'M50 48c18 0 26-10 26-22-16 0-26 8-26 22z', 'M30 90h40'] },
  sonne: { label: 'Sonne', woerter: ['sonne', 'energie', 'licht', 'wärme', 'tag', 'sommer'], d: ['M50 30a20 20 0 1 0 .1 0', 'M50 6v12M50 82v12M6 50h12M82 50h12M19 19l8 8M73 73l8 8M19 81l8-8M73 27l8-8'] },
  wolke: { label: 'Wolke', woerter: ['wolke', 'wetter', 'luft', 'klima'], d: ['M26 72a16 16 0 0 1 2-32 22 22 0 0 1 42-4 18 18 0 0 1 4 36z'] },
  regen: { label: 'Regen', woerter: ['regen', 'niederschlag', 'wasser'], d: ['M26 56a14 14 0 0 1 2-28 20 20 0 0 1 38-4 16 16 0 0 1 4 32z', 'M32 66l-6 14M50 66l-6 14M68 66l-6 14'] },
  tropfen: { label: 'Tropfen', woerter: ['tropfen', 'wasser', 'flüssigkeit', 'blut'], d: ['M50 10C36 32 26 46 26 60a24 24 0 0 0 48 0c0-14-10-28-24-50z'] },
  flamme: { label: 'Flamme', woerter: ['feuer', 'flamme', 'brand', 'verbrennung', 'hitze', 'energie'], d: ['M50 90c-18 0-28-12-26-28 2-14 14-20 14-36 12 8 16 18 14 28 6-4 8-10 8-16 10 10 16 22 14 32-2 12-10 20-24 20z'] },
  geld: { label: 'Geld', woerter: ['geld', 'euro', 'kosten', 'preis', 'wirtschaft', 'handel', 'münze', 'kapital'], d: ['M50 12a38 38 0 1 0 .1 0', 'M62 34a16 16 0 1 0 0 32', 'M30 44h26M30 56h26'] },
  waage: {
    label: 'Waage',
    woerter: ['waage', 'gerechtigkeit', 'recht', 'abwägen', 'gleichgewicht', 'justiz', 'urteil'],
    d: ['M50 14v70M34 86h32M18 26h64', 'M18 26L8 54h20z', 'M82 26L72 54h20z', 'M8 54a10 6 0 0 0 20 0M72 54a10 6 0 0 0 20 0']
  },
  globus: { label: 'Erde / Globus', woerter: ['erde', 'welt', 'globus', 'global', 'international', 'globalisierung'], d: ['M50 10a40 40 0 1 0 .1 0', 'M10 50h80M50 10c-16 14-16 66 0 80M50 10c16 14 16 66 0 80M18 28h64M18 72h64'] },
  zahnrad: {
    label: 'Zahnrad',
    woerter: ['zahnrad', 'technik', 'mechanik', 'prozess', 'maschine', 'system'],
    d: ['M50 34a16 16 0 1 0 .1 0', 'M46 10h8l2 10 8 3 8-6 6 6-6 8 3 8 10 2v8l-10 2-3 8 6 8-6 6-8-6-8 3-2 10h-8l-2-10-8-3-8 6-6-6 6-8-3-8-10-2v-8l10-2 3-8-6-8 6-6 8 6 8-3z']
  },
  lupe: { label: 'Lupe', woerter: ['lupe', 'untersuchen', 'analyse', 'forschen', 'beobachten', 'suche'], d: ['M42 14a28 28 0 1 0 .1 0', 'M62 62l26 26'] },
  sprechblase: { label: 'Sprechblase', woerter: ['sprechen', 'rede', 'meinung', 'dialog', 'kommunikation', 'aussage', 'zitat'], d: ['M14 20h72v44H42L24 82V64H14z'] },
  auge: { label: 'Auge', woerter: ['auge', 'sehen', 'beobachtung', 'wahrnehmung', 'blick'], d: ['M8 50c20-28 64-28 84 0-20 28-64 28-84 0z', 'M50 36a14 14 0 1 0 .1 0'], voll: ['M50 44a6 6 0 1 0 .1 0'] },
  krone: { label: 'Krone', woerter: ['krone', 'könig', 'herrscher', 'macht', 'monarchie', 'adel', 'kaiser'], d: ['M14 76L10 30l22 18 18-28 18 28 22-18-4 46z', 'M14 86h72'] },
  schwert: { label: 'Schwert', woerter: ['schwert', 'krieg', 'kampf', 'gewalt', 'militär', 'schlacht'], d: ['M50 8v64M36 72h28M50 72v18', 'M44 8l6-4 6 4'] },
  burg: { label: 'Burg', woerter: ['burg', 'mittelalter', 'festung', 'schloss', 'ritter'], d: ['M12 90V34h12v10h10V34h12v10h8V34h12v10h10V34h12v56z', 'M42 90V68a8 8 0 0 1 16 0v22'] },
  kirche: { label: 'Kirche', woerter: ['kirche', 'religion', 'glaube', 'gott', 'christentum', 'kloster'], d: ['M50 6v20M42 14h16', 'M50 26L28 48v42h44V48z', 'M42 90V70a8 8 0 0 1 16 0v20'] },
  schiff: { label: 'Schiff', woerter: ['schiff', 'handel', 'see', 'entdeckung', 'reise', 'boot', 'kolonie'], d: ['M10 64h80L78 84H22z', 'M50 64V14', 'M50 18l26 38H50', 'M50 22L28 56h22'] },
  kreislauf: { label: 'Kreislauf', woerter: ['kreislauf', 'zyklus', 'wiederholung', 'recycling'], d: ['M80 40a32 32 0 0 0-58-8', 'M20 60a32 32 0 0 0 58 8', 'M22 18v14h14', 'M78 82V68H64'] },
  atom: { label: 'Atom', woerter: ['atom', 'chemie', 'physik', 'teilchen', 'kern'], d: ['M50 20c-10 0-20 14-20 30s10 30 20 30 20-14 20-30-10-30-20-30z', 'M18 34c8-12 26-8 40 2s24 22 20 30M82 34c-8-12-26-8-40 2S18 58 22 66'], voll: ['M50 44a6 6 0 1 0 .1 0'] },
  ziel: { label: 'Ziel', woerter: ['ziel', 'zweck', 'absicht', 'lernziel', 'ergebnis'], d: ['M50 10a40 40 0 1 0 .1 0', 'M50 26a24 24 0 1 0 .1 0'], voll: ['M50 42a8 8 0 1 0 .1 0'] },
  schloss: { label: 'Schloss (gesperrt)', woerter: ['schloss', 'sicherheit', 'geschlossen', 'verbot', 'geheim'], d: ['M24 46h52v42H24z', 'M34 46V32a16 16 0 0 1 32 0v14', 'M50 62v10'] },
  pfeil: { label: 'Pfeil (Folge)', woerter: ['folge', 'führt zu', 'ergebnis'], d: ['M10 50h72', 'M64 32l18 18-18 18'], bedeutung: 'Folge / führt zu' },
  doppelpfeil: { label: 'Wechselwirkung', woerter: ['wechselwirkung', 'beziehung', 'gegenseitig'], d: ['M16 50h68', 'M32 34L16 50l16 16', 'M68 34l16 16-16 16'], bedeutung: 'Wechselwirkung' },
  ungleich: { label: 'Gegensatz (≠)', woerter: ['gegensatz', 'unterschied', 'ungleich'], d: ['M18 40h64M18 60h64M64 20L36 80'], bedeutung: 'Gegensatz' },
  folgerung: { label: 'Folgerung (⇒)', woerter: ['folgerung', 'schluss', 'daraus folgt'], d: ['M10 42h60M10 58h60', 'M58 26l24 24-24 24'], bedeutung: 'Schlussfolgerung' }
}

export const SYMBOL_NAMEN = Object.keys(SYMBOLE)

/** Passendes Symbol zu einem Wort der KI („Glühbirne", „idee", „Krieg" …) */
export function symbolFuer(wort?: string): string | undefined {
  const w = (wort ?? '').trim().toLowerCase()
  if (!w) return undefined
  if (SYMBOLE[w]) return w
  const treffer = Object.entries(SYMBOLE).find(([, s]) => s.woerter.some((x) => w.includes(x) || x.includes(w)))
  return treffer?.[0]
}

/** Skizzenvorlagen – Fläche 0 … 200 × 0 … 140 */
export const SKIZZEN: Record<string, Zeichen> = {
  becherglas: {
    label: 'Becherglas mit Flüssigkeit',
    woerter: ['becherglas', 'glas', 'lösung', 'flüssigkeit', 'versuch', 'experiment'],
    d: ['M60 16v108h80V16', 'M54 16h12M134 16h12', 'M60 70c14-6 26 6 40 0s26-6 40 0', 'M150 40h-8M150 60h-8M150 80h-8M150 100h-8']
  },
  versuch: {
    label: 'Versuchsaufbau (Brenner, Dreifuß, Glas)',
    woerter: ['brenner', 'erhitzen', 'bunsenbrenner', 'versuchsaufbau', 'dreifuß', 'erhitzt'],
    d: ['M70 18v44h60V18', 'M70 44c10-4 20 4 30 0s20-4 30 0', 'M58 64h84M66 64l-10 58M134 64l10 58', 'M92 132h16M96 132V104h8v28', 'M100 100c-8-8-6-14 0-22 6 8 8 14 0 22z']
  },
  wasserkreislauf: {
    label: 'Wasserkreislauf',
    woerter: ['wasserkreislauf', 'verdunstung', 'niederschlag', 'kondensation', 'wasser'],
    d: ['M4 118c30-6 60 6 92 0', 'M96 118l38-60 30 34 32-26v52H96', 'M40 18a10 10 0 1 0 .1 0', 'M28 18h-8M60 18h-8M40 6V2M40 34v-4', 'M110 34a12 12 0 0 1 12-16 18 18 0 0 1 32 2 12 12 0 0 1 2 24h-44a8 8 0 0 1-2-10z', 'M126 62l-4 10M140 62l-4 10M154 62l-4 10', 'M50 102V58M44 66l6-8 6 8', 'M170 112c6 0 10 2 12 6']
  },
  pflanzenzelle: {
    label: 'Pflanzenzelle',
    woerter: ['pflanzenzelle', 'zelle', 'zellwand', 'chloroplast', 'vakuole'],
    d: ['M20 12h160v116H20z', 'M28 20h144v100H28z', 'M58 48h84v44H58z', 'M146 36a14 14 0 1 0 .1 0', 'M40 104a8 5 0 1 0 .1 0M160 100a8 5 0 1 0 .1 0M40 34a8 5 0 1 0 .1 0']
  },
  tierzelle: {
    label: 'Tierzelle',
    woerter: ['tierzelle', 'zellmembran', 'zellkern', 'mitochondrium'],
    d: ['M100 10c50 0 90 20 90 60s-40 60-90 60S10 110 10 70 50 10 100 10z', 'M100 50a20 20 0 1 0 .1 0', 'M46 88c6-6 16-6 22 0-6 6-16 6-22 0z', 'M140 44c6-6 16-6 22 0-6 6-16 6-22 0z'],
    voll: ['M100 64a6 6 0 1 0 .1 0']
  },
  hebel: { label: 'Hebel', woerter: ['hebel', 'drehpunkt', 'kraft', 'last'], d: ['M10 60l180-20', 'M86 52l14 40 14-40z', 'M70 104h60', 'M30 30v24M22 46l8 8 8-8', 'M170 18v24M162 34l8 8 8-8'] },
  magnet: { label: 'Magnet', woerter: ['magnet', 'magnetismus', 'nordpol', 'südpol', 'feld'], d: ['M60 20v60a40 40 0 0 0 80 0V20h-24v60a16 16 0 0 1-32 0V20z', 'M60 20v18h24V20M116 20v18h24V20'] },
  stadt: {
    label: 'Stadt',
    woerter: ['stadt', 'urbanisierung', 'siedlung', 'großstadt', 'metropole'],
    d: ['M6 130h188', 'M16 130V70h30v60', 'M46 130V40h34v90', 'M80 130V84h26v46', 'M106 130V26h30v104', 'M136 130V64h28v66', 'M164 130V90h24v40', 'M56 52h6M66 52h6M56 66h6M66 66h6M116 40h6M126 40h6M116 56h6M126 56h6']
  },
  landschaft: {
    label: 'Landschaft mit Fluss',
    woerter: ['landschaft', 'fluss', 'berg', 'tal', 'relief', 'gebirge'],
    d: ['M4 90l40-50 30 34 28-44 40 60', 'M142 90l20-20 34 30', 'M4 130c40-20 60 0 90-10s60-30 102-20', 'M20 124c30-16 56 4 84-6s54-26 92-16']
  },
  pyramide: {
    label: 'Pyramide (Stufen)',
    woerter: ['pyramide', 'stände', 'ständegesellschaft', 'hierarchie', 'rangordnung', 'schichten'],
    d: ['M100 10L10 130h180z', 'M70 50h60M40 90h120']
  },
  windrose: { label: 'Windrose / Himmelsrichtungen', woerter: ['windrose', 'norden', 'himmelsrichtung', 'kompass', 'karte'], d: ['M100 10l12 48 48 12-48 12-12 48-12-48-48-12 48-12z', 'M100 58v24M88 70h24'] },
  waage: {
    label: 'Balkenwaage',
    woerter: ['waage', 'abwägung', 'pro und contra', 'gleichgewicht'],
    d: ['M100 20v100M70 124h60M30 34h140', 'M30 34L14 80h32z', 'M170 34l-16 46h32z', 'M14 80a16 8 0 0 0 32 0M154 80a16 8 0 0 0 32 0']
  }
}

export const SKIZZEN_NAMEN = Object.keys(SKIZZEN)

export function skizzeFuer(wort?: string): string | undefined {
  const w = (wort ?? '').trim().toLowerCase()
  if (!w) return undefined
  if (SKIZZEN[w]) return w
  return Object.entries(SKIZZEN).find(([, s]) => s.woerter.some((x) => w.includes(x) || x.includes(w)))?.[0]
}

/**
 * Kreise sind oben als „Punkt oben + Bogen zum Nachbarpunkt" notiert (kurz, aber je nach
 * Renderer mehrdeutig). Hier werden sie in zwei eindeutige Halbbögen umgeschrieben.
 */
export function eindeutigeKreise(d: string): string {
  return d.replace(/M(-?[\d.]+) (-?[\d.]+)a([\d.]+) ([\d.]+) 0 1 0 \.1 0/g, (_, x, y, rx, ry) => {
    const [cx, cy, a, b] = [Number(x), Number(y) + Number(ry), Number(rx), Number(ry)]
    return `M${cx - a} ${cy}a${a} ${b} 0 1 0 ${2 * a} 0a${a} ${b} 0 1 0 ${-2 * a} 0`
  })
}

for (const z of [...Object.values(SYMBOLE), ...Object.values(SKIZZEN)]) {
  z.d = z.d.map(eindeutigeKreise)
  if (z.voll) z.voll = z.voll.map(eindeutigeKreise)
}
