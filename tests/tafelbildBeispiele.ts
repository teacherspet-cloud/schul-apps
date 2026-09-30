/**
 * Beispielantworten der KI für die Tafelbild-Tests – je Struktur eine, so wie die KI sie im
 * Schema `tafelbild_inhalt` liefert (alle Felder, leere Felder leer).
 */
const leerDiagramm = { art: 'tabelle', eintraege: [], funktionen: [], bereich: { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }, schaltplan: '', spalten: [], zeilen: [], xName: '', yName: '' }
const lage = { x: -1, y: -1, w: -1, h: -1 }
const k = (id: string, titel: string, punkte: string[], o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  titel,
  punkte,
  rolle: 'aspekt',
  farbe: 'grund',
  symbol: '',
  zeit: '',
  niveau: 1,
  schritt: 2,
  lueckenWoerter: [],
  lage,
  ...o
})

const basis = {
  strukturGrund: 'passt',
  impuls: 'Erläutere, warum die Republik scheiterte.',
  beziehungen: [],
  aspekte: [],
  merksatz: { titel: 'Merke!', text: 'Die Weimarer Republik scheiterte an mehreren Ursachen zugleich.', lueckenWoerter: ['Ursachen'] },
  hausaufgabe: 'Beurteile, welche Ursache am schwersten wog.',
  zeichnungen: [],
  farbLegende: [
    { farbe: 'gelb', bedeutung: 'Fachbegriff' },
    { farbe: 'orange', bedeutung: 'Merksatz' },
    { farbe: 'rot', bedeutung: 'Problem' },
    { farbe: 'blau', bedeutung: 'Beispiel' }
  ],
  schritte: [
    { nr: 1, phase: 'Einstieg', impuls: 'Leitfrage' },
    { nr: 2, phase: 'Erarbeitung', impuls: 'Ursachen sammeln' }
  ]
}

export const NETZ = {
  ...basis,
  titel: 'Warum scheiterte die Weimarer Republik?',
  struktur: 'netz',
  knoten: [
    k('k1', 'Scheitern der Republik', [], { rolle: 'zentrum', farbe: 'gelb', schritt: 1 }),
    k('k2', 'Politik', ['Versailler Vertrag', 'Dolchstoßlegende'], { farbe: 'rot', symbol: 'blitz', lueckenWoerter: ['Dolchstoßlegende'] }),
    k('k3', 'Wirtschaft', ['Inflation 1923', 'Weltwirtschaftskrise'], { farbe: 'rot', symbol: 'geld', schritt: 3 }),
    k('k4', 'Verfassung', ['Artikel 48', 'Splitterparteien'], { farbe: 'blau', schritt: 3, niveau: 2 }),
    k('k5', 'Gesellschaft', ['Demokratie ohne Demokraten', 'Radikalisierung'], { farbe: 'blau', schritt: 4, niveau: 3 })
  ],
  beziehungen: [
    { von: 'k1', nach: 'k2', beschriftung: 'außenpolitisch', art: 'linie' },
    { von: 'k1', nach: 'k3', beschriftung: 'wirtschaftlich', art: 'linie' }
  ],
  zeichnungen: [
    {
      art: 'diagramm',
      bezug: '',
      name: '',
      prompt: '',
      tex: '',
      diagramm: { ...leerDiagramm, art: 'zeitstrahl', eintraege: [{ label: 'Gründung', wert: '1919', x: 0, y: 0 }, { label: 'Ende', wert: '1933', x: 0, y: 0 }] },
      beschriftung: '',
      schritt: 1
    }
  ]
}

export const TABELLE = {
  ...basis,
  titel: 'Wie unterscheiden sich Tier- und Pflanzenzelle?',
  struktur: 'tabelle',
  aspekte: ['Zellwand', 'Chloroplasten', 'Vakuole'],
  knoten: [
    k('k1', 'Pflanzenzelle', ['vorhanden', 'vorhanden', 'groß'], { rolle: 'spalte', farbe: 'gruen', lueckenWoerter: ['groß'] }),
    k('k2', 'Tierzelle', ['fehlt', 'fehlen', 'klein oder keine'], { rolle: 'spalte', farbe: 'blau' })
  ],
  zeichnungen: [{ art: 'skizze', bezug: '', name: 'pflanzenzelle', prompt: '', tex: '', diagramm: leerDiagramm, beschriftung: 'Pflanzenzelle', schritt: 2 }]
}

export const FLUSS = {
  ...basis,
  titel: 'Wie entsteht Regen?',
  struktur: 'fluss',
  knoten: [
    k('k1', 'Verdunstung', ['Sonne erwärmt Wasser'], { schritt: 2, farbe: 'gelb' }),
    k('k2', 'Aufstieg', ['warme Luft steigt'], { schritt: 3 }),
    k('k3', 'Kondensation', ['Wolken bilden sich'], { schritt: 4, farbe: 'gelb' }),
    k('k4', 'Niederschlag', ['Regen fällt'], { schritt: 5 })
  ],
  beziehungen: [
    { von: 'k1', nach: 'k2', beschriftung: '', art: 'pfeil' },
    { von: 'k2', nach: 'k3', beschriftung: 'kühlt ab', art: 'pfeil' },
    { von: 'k3', nach: 'k4', beschriftung: '', art: 'pfeil' }
  ],
  zeichnungen: [{ art: 'formel', bezug: '', name: '', prompt: '', tex: 'H_2O_{(l)} \\rightarrow H_2O_{(g)}', diagramm: leerDiagramm, beschriftung: '', schritt: 2 }]
}

export const ZEITLEISTE = {
  ...basis,
  titel: 'Wie verlief die Französische Revolution?',
  struktur: 'zeitleiste',
  knoten: [
    k('k1', 'Generalstände', ['Mai 1789'], { rolle: 'ereignis', zeit: '1789' }),
    k('k2', 'Sturm auf die Bastille', ['14. Juli'], { rolle: 'ereignis', zeit: '1789', farbe: 'rot', schritt: 3 }),
    k('k3', 'Verfassung', ['konstitutionelle Monarchie'], { rolle: 'ereignis', zeit: '1791', schritt: 4 }),
    k('k4', 'Terrorherrschaft', ['Robespierre'], { rolle: 'ereignis', zeit: '1793', farbe: 'rot', schritt: 5 }),
    k('k5', 'Napoleon', ['Staatsstreich'], { rolle: 'ereignis', zeit: '1799', schritt: 6 })
  ]
}

export const KREISLAUF = {
  ...basis,
  titel: 'Wie funktioniert der Wasserkreislauf?',
  struktur: 'kreislauf',
  knoten: [
    k('k1', 'Verdunstung', ['Meer, Seen']),
    k('k2', 'Kondensation', ['Wolkenbildung']),
    k('k3', 'Niederschlag', ['Regen, Schnee']),
    k('k4', 'Abfluss', ['Flüsse, Grundwasser'])
  ],
  zeichnungen: [
    {
      art: 'diagramm',
      bezug: '',
      name: '',
      prompt: '',
      tex: '',
      diagramm: { ...leerDiagramm, art: 'koordinatensystem', funktionen: ['0.5x^2 - 2'], bereich: { xMin: -4, xMax: 4, yMin: -3, yMax: 5 } },
      beschriftung: '',
      schritt: 2
    }
  ]
}

export const ALLE = { netz: NETZ, tabelle: TABELLE, fluss: FLUSS, zeitleiste: ZEITLEISTE, kreislauf: KREISLAUF }
