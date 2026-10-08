import type { ComponentType, CSSProperties } from 'react'
import { useId } from 'react'

/*
 * Eigene Symbole der Programme (Paket 9, 26.09.2026).
 *
 * Vorher standen hier Tabler-Symbole (Sprache, Liste, Datei …), die für die Lehrkraft nicht
 * zeigten, welches Programm dahintersteckt – LZK und Klassenarbeit sahen fast gleich aus.
 * Jetzt passt jedes Symbol zum Motiv der Startseiten-Illustration, ohne Buchstaben oder Ziffern:
 * Globus vor Ankreuzblatt, Karteikasten, Blatt mit Stift, Blatt mit Balken, Puzzleteile, Heftstapel.
 *
 * Gezeichnet auf einem 24er-Raster, sichtbar ist der Ausschnitt 1…23. Bei der Leistengröße
 * 22 px fällt so jede Rastereinheit auf genau ein Bildschirmpixel: Die 2er-Striche auf
 * ganzzahligen Koordinaten liegen deckungsgleich auf zwei Pixelreihen und bleiben scharf.
 *
 * Striche in currentColor (folgen der Leiste, hell/dunkel, aktiv), Flächen in der Programmfarbe.
 * Wo die Fläche mit dem Hintergrund verschwimmen würde (aktiver Knopf, farbige Leiste, getönte
 * Symbolfläche), schaltet app.css sie auf eine halbtransparente Strichfarbe um.
 */

type Art = 'strich' | 'akzent' | 'voll'
interface Teil {
  d: string
  art: Art
  /** Strichbreite, falls nicht 2 (der schmale Stift braucht einen feineren Rand) */
  breite?: number
}
interface Form {
  /** Umriss des vorderen Teils: wird aus dem hinteren ausgespart, damit ein Spalt beide trennt */
  aussparen?: string
  aussparenBreite?: number
  hinten: Teil[]
  vorn: Teil[]
}

export type ProgrammSymbolForm =
  | 'vokabeltest'
  | 'vokabelliste'
  | 'arbeitsblatt'
  | 'lernzielkontrolle'
  | 'grammatiktest'
  | 'klassenarbeit'
  | 'rueckmeldung'
  | 'elternbrief'
  | 'tafelbild'
  | 'onlinetest'
  | 'verwaltung'
  | 'unterrichtsreihe'
  | 'freigaben'
  | 'laufendereihen'
  | 'vokabeltraining'
  | 'grammatiktraining'
  | 'sprachenlernen'

const BLEISTIFT = 'M11 21L12 17L18.5 10.5A2.12 2.12 0 0 1 21.5 13.5L15 20Z'
const GLOBUS = 'M6 13A4.5 4.5 0 1 0 6 22A4.5 4.5 0 1 0 6 13Z'
const BALKEN = 'M11 16H14V22H11ZM15 12H18V22H15ZM19 7H22V22H19Z'
const HAKEN_KREIS = 'M18 13A5 5 0 1 0 18 23A5 5 0 1 0 18 13Z'
const PUZZLETEIL = 'M2 9H5A2.2 2.2 0 1 1 8 9H11V12.5A2.2 2.2 0 1 1 11 15.5V19H2Z'
const FUELLER = 'M14.5 20L15.1 15.9L19.33 6.76A1.6 1.6 0 0 1 22.19 8.2L17.5 17.1Z'
const heft = (x: number, y: number, breite: number, hoehe: number): string =>
  `M${x + 1} ${y}H${x + breite - 1}A1 1 0 0 1 ${x + breite} ${y + 1}V${y + hoehe - 1}A1 1 0 0 1 ${x + breite - 1} ${y + hoehe}H${x + 1}A1 1 0 0 1 ${x} ${y + hoehe - 1}V${y + 1}A1 1 0 0 1 ${x + 1} ${y}Z`

const FORMEN: Record<ProgrammSymbolForm, Form> = {
  // Kleiner Globus vor einem Blatt mit Ankreuzfeldern, das oberste angekreuzt – sprachneutral
  // (Paket 10a: angeglichen an die gewählte Illustration, vorher Sprechblasen)
  vokabeltest: {
    aussparen: GLOBUS,
    aussparenBreite: 3,
    hinten: [
      { d: 'M9 2H19A2 2 0 0 1 21 4V19A2 2 0 0 1 19 21H9A2 2 0 0 1 7 19V4A2 2 0 0 1 9 2Z', art: 'strich' },
      { d: 'M10 4H14V8H10Z', art: 'akzent' },
      { d: 'M10.5 6L12 7.5L15 3.5', art: 'strich', breite: 1.5 },
      { d: 'M10.5 9.5H13.5V12.5H10.5Z', art: 'strich', breite: 1 },
      { d: 'M16.5 6H18.5M16.5 11H18.5M16.5 16H18.5', art: 'strich' }
    ],
    vorn: [
      { d: GLOBUS, art: 'akzent' },
      { d: GLOBUS, art: 'strich', breite: 1.5 },
      { d: 'M1.5 17.5H10.5M6 13A2 4.5 0 0 0 6 22A2 4.5 0 0 0 6 13', art: 'strich', breite: 1.25 }
    ]
  },
  // Offener Karteikasten mit Karten, eine davon mit Reiter
  vokabelliste: {
    hinten: [
      { d: 'M6 12V4A1 1 0 0 1 7 3H13A1 1 0 0 1 14 4V12', art: 'strich' },
      { d: 'M9 12V7A1 1 0 0 1 10 6H12V5A1 1 0 0 1 13 4H15A1 1 0 0 1 16 5V6H17A1 1 0 0 1 18 7V12Z', art: 'akzent' }
    ],
    vorn: [
      { d: 'M3 12H21L19.5 20A1.3 1.3 0 0 1 18.2 21H5.8A1.3 1.3 0 0 1 4.5 20Z', art: 'strich' },
      { d: 'M10 15.5H14', art: 'strich' }
    ]
  },
  // Blatt mit Bildfläche und Textzeilen, Stift davor
  arbeitsblatt: {
    aussparen: BLEISTIFT,
    hinten: [
      { d: 'M5 2H13A2 2 0 0 1 15 4V19A2 2 0 0 1 13 21H5A2 2 0 0 1 3 19V4A2 2 0 0 1 5 2Z', art: 'strich' },
      { d: 'M6 5H12V10H6Z', art: 'akzent' },
      { d: 'M6 13H12M6 16H9', art: 'strich' }
    ],
    vorn: [
      { d: BLEISTIFT, art: 'akzent' },
      { d: BLEISTIFT, art: 'strich', breite: 1.5 }
    ]
  },
  // Blatt mit Textzeilen, davor aufsteigende Balken – der Lernstand steigt
  // (Paket 10a: angeglichen an die gewählte Illustration, vorher Zielscheibe)
  lernzielkontrolle: {
    aussparen: BALKEN,
    aussparenBreite: 2,
    hinten: [
      { d: 'M4 2H12A2 2 0 0 1 14 4V19A2 2 0 0 1 12 21H4A2 2 0 0 1 2 19V4A2 2 0 0 1 4 2Z', art: 'strich' },
      { d: 'M5 6H11M5 10H11M5 14H8', art: 'strich' }
    ],
    vorn: [{ d: BALKEN, art: 'akzent' }]
  },
  // Zwei Puzzleteile – das zweite hat die Aussparung, in die das erste einrastet
  grammatiktest: {
    aussparen: PUZZLETEIL,
    hinten: [{ d: 'M12 9H15A2.2 2.2 0 1 1 18 9H21V19H12Z', art: 'akzent' }],
    vorn: [{ d: PUZZLETEIL, art: 'strich' }]
  },
  // Stapel Hefte (die farbige Mitte steht für die zweite Fassung) mit Füller
  klassenarbeit: {
    aussparen: FUELLER,
    aussparenBreite: 3,
    hinten: [
      { d: heft(3, 16, 14, 5), art: 'strich' },
      { d: heft(4, 10, 12, 4), art: 'akzent' },
      { d: heft(5, 4, 10, 4), art: 'strich' }
    ],
    vorn: [
      { d: 'M14.86 15.7L19.33 6.76A1.6 1.6 0 0 1 22.19 8.2L17.72 17.14Z', art: 'voll' },
      { d: 'M14.5 20L15.13 15.84L17.45 17Z', art: 'akzent' }
    ]
  },
  // Rückmeldung (Großprogramm 0.4): Sprechblase mit Textzeilen, davor ein Kreis mit Haken – Rückmeldung ohne Note
  rueckmeldung: {
    aussparen: HAKEN_KREIS,
    aussparenBreite: 3,
    hinten: [
      { d: 'M4 2H18A2 2 0 0 1 20 4V12A2 2 0 0 1 18 14H9L5 18V14H4A2 2 0 0 1 2 12V4A2 2 0 0 1 4 2Z', art: 'strich' },
      { d: 'M6 6.5H16M6 10H12', art: 'strich' }
    ],
    vorn: [
      { d: HAKEN_KREIS, art: 'akzent' },
      { d: 'M15.8 18L17.4 19.6L20.4 16.4', art: 'strich', breite: 1.75 }
    ]
  },
  // Elternbrief (Großprogramm 0.4): Briefumschlag, davor ein Blatt mit farbigem Kopf
  elternbrief: {
    aussparen: 'M11 9H21V22H11Z',
    aussparenBreite: 3,
    hinten: [
      { d: 'M3 5H17A1 1 0 0 1 18 6V16A1 1 0 0 1 17 17H3A1 1 0 0 1 2 16V6A1 1 0 0 1 3 5Z', art: 'strich' },
      { d: 'M2.5 6L10 12L17.5 6', art: 'strich' }
    ],
    vorn: [
      { d: 'M12 10H20V21H12Z', art: 'strich', breite: 1.75 },
      { d: 'M12 10H20V13H12Z', art: 'akzent' },
      { d: 'M14 16H18M14 18.5H17', art: 'strich', breite: 1.5 }
    ]
  },
  // Tafelbilder (30.09.2026): Tafel auf Beinen mit Schrift und farbigem Kasten, davor ein Stück Kreide
  tafelbild: {
    aussparen: 'M15 21.5L21.5 15',
    aussparenBreite: 4,
    hinten: [
      { d: 'M3 3H21V16H3Z', art: 'strich' },
      { d: 'M6 7H11M6 10.5H9.5', art: 'strich', breite: 1.5 },
      { d: 'M13 6.5H18V11H13Z', art: 'akzent' },
      { d: 'M7 16L5.5 21M17 16L18.5 21', art: 'strich' }
    ],
    vorn: [{ d: 'M15 21.5L21.5 15', art: 'strich', breite: 2.5 }]
  },
  // Onlinetest (02.10.2026, Server): Tablet mit Ankreuzfeld, davor ein Haken im Kreis
  onlinetest: {
    aussparen: HAKEN_KREIS,
    aussparenBreite: 3,
    hinten: [
      { d: 'M4 2H16A2 2 0 0 1 18 4V20A2 2 0 0 1 16 22H4A2 2 0 0 1 2 20V4A2 2 0 0 1 4 2Z', art: 'strich' },
      { d: 'M5 6H9V10H5Z', art: 'akzent' },
      { d: 'M11 7H15M5 14H13M9.5 19H10.5', art: 'strich', breite: 1.5 }
    ],
    vorn: [
      { d: HAKEN_KREIS, art: 'strich', breite: 1.75 },
      { d: 'M15.5 18L17.3 19.8L20.5 16.3', art: 'strich', breite: 1.75 }
    ]
  },
  // Unterrichtsreihe (02.10.2026, Server): geschwungener Lernpfad mit Stationen, oben die Zielfahne
  unterrichtsreihe: {
    aussparen: 'M16 2V9M16 2.5H21.5L20 4.5L21.5 6.5H16',
    aussparenBreite: 3,
    hinten: [
      { d: 'M4 20C4 16 8 16 11 16S18 16 18 12.5 14 9.5 11 9.5 4 9.5 4 6', art: 'strich' },
      { d: 'M2.5 18.5H5.5V21.5H2.5Z', art: 'akzent' },
      { d: 'M9.5 14.5H12.5V17.5H9.5Z', art: 'akzent' },
      { d: 'M9.5 8H12.5V11H9.5Z', art: 'akzent' }
    ],
    vorn: [
      { d: 'M16 2V9', art: 'strich', breite: 1.75 },
      { d: 'M16 2.5H21.5L20 4.5L21.5 6.5H16Z', art: 'akzent' }
    ]
  },
  // Freigegebene Blätter (03.10.2026): Blatt mit Pfeil nach außen – verteilt an die Lernenden
  freigaben: {
    aussparen: 'M14 15H22M18 11L22 15L18 19',
    aussparenBreite: 3,
    hinten: [
      { d: heft(3, 2, 13, 18), art: 'strich' },
      { d: 'M6 7H13M6 10.5H13M6 14H10', art: 'strich', breite: 1.5 }
    ],
    vorn: [{ d: 'M14 15H22M18 11L22 15L18 19', art: 'strich', breite: 2 }]
  },
  // Laufende Reihen (03.10.2026): drei Fortschrittsbalken unterschiedlicher Länge mit Zielfahne
  laufendereihen: {
    hinten: [
      { d: 'M3 6H17M3 12H13M3 18H20', art: 'strich' },
      { d: 'M3 4.5H11V7.5H3Z', art: 'akzent' },
      { d: 'M3 10.5H8V13.5H3Z', art: 'akzent' },
      { d: 'M3 16.5H16V19.5H3Z', art: 'akzent' }
    ],
    vorn: [{ d: 'M20 3V9M20 3.5H23L22 5L23 6.5H20', art: 'strich', breite: 1.5 }]
  },
  // Sprachenlernen (08.10.2026): Karteikasten, vorne eine Sprechblase (Vokabeln und Grammatik in einer App)
  sprachenlernen: {
    hinten: [
      { d: 'M3 10H17V20H3Z', art: 'strich' },
      { d: 'M5 6H15V10H5Z', art: 'akzent' },
      { d: 'M7 14H13', art: 'strich', breite: 1.5 }
    ],
    vorn: [{ d: 'M14 12H23V18H19L16.5 20.5V18H14Z', art: 'strich', breite: 1.5 }]
  },
  // Vokabeltraining (03.10.2026): Karteikasten mit Karten, vorne ein Haken
  vokabeltraining: {
    hinten: [
      { d: 'M3 10H19V20H3Z', art: 'strich' },
      { d: 'M5 6H17V10H5Z', art: 'akzent' },
      { d: 'M7 3H15V6H7Z', art: 'strich', breite: 1.5 },
      { d: 'M8 14H14', art: 'strich', breite: 1.5 }
    ],
    vorn: [{ d: 'M16 17L18.5 19.5L23 14', art: 'strich', breite: 2 }]
  },
  // Grammatiktraining (06.10.2026): Karteikasten, vorne ein Satzbaustein mit Lücke
  grammatiktraining: {
    hinten: [
      { d: 'M3 10H19V20H3Z', art: 'strich' },
      { d: 'M5 6H17V10H5Z', art: 'akzent' },
      { d: 'M6 15H9M11 15H16', art: 'strich', breite: 1.5 }
    ],
    vorn: [
      { d: 'M15 13H23V19H15Z', art: 'akzent' },
      { d: 'M17 16H21', art: 'strich', breite: 1.5 }
    ]
  },
  // Verwaltung (02.10.2026, Server, nur Admin): Schieberegler
  verwaltung: {
    hinten: [
      { d: 'M4 6H20M4 12H20M4 18H20', art: 'strich' },
      { d: 'M7 4H11V8H7Z', art: 'akzent' },
      { d: 'M13 10H17V14H13Z', art: 'akzent' },
      { d: 'M6 16H10V20H6Z', art: 'akzent' }
    ],
    vorn: []
  }
}

function Teil({ teil }: { teil: Teil }): React.JSX.Element {
  if (teil.art === 'strich')
    return <path d={teil.d} fill="none" stroke="currentColor" strokeWidth={teil.breite ?? 2} strokeLinecap="round" strokeLinejoin="round" />
  if (teil.art === 'akzent') return <path d={teil.d} className="sym-akzent" />
  return <path d={teil.d} fill="currentColor" />
}

export function ProgrammSymbol(props: { form: ProgrammSymbolForm; farbe: string; size?: number }): React.JSX.Element {
  // useId liefert Zeichen wie „:“ oder „«“, die in url(#…) stören würden
  const maskId = `sym-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const f = FORMEN[props.form]
  const size = props.size ?? 22
  const style = {
    '--sym-akzent': `var(--mantine-color-${props.farbe}-6)`,
    '--sym-akzent-dunkel': `var(--mantine-color-${props.farbe}-4)`
  } as CSSProperties
  return (
    <svg className="programm-symbol" width={size} height={size} viewBox="1 1 22 22" style={style} aria-hidden focusable="false">
      {f.aussparen && (
        <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={24} height={24}>
          <rect width={24} height={24} fill="#fff" />
          <path d={f.aussparen} fill="#000" stroke="#000" strokeWidth={f.aussparenBreite ?? 4} strokeLinejoin="round" strokeLinecap="round" />
        </mask>
      )}
      <g mask={f.aussparen ? `url(#${maskId})` : undefined}>
        {f.hinten.map((t, i) => (
          <Teil key={i} teil={t} />
        ))}
      </g>
      {f.vorn.map((t, i) => (
        <Teil key={i} teil={t} />
      ))}
    </svg>
  )
}

/** Symbol eines Programms mit fester Form und Farbe – so trägt die Programmliste es wie ein Tabler-Symbol */
export type ProgrammIcon = ComponentType<{ size?: number }>

export function programmSymbol(form: ProgrammSymbolForm, farbe: string): ProgrammIcon {
  const Symbol = ({ size }: { size?: number }): React.JSX.Element => <ProgrammSymbol form={form} farbe={farbe} size={size} />
  Symbol.displayName = `ProgrammSymbol(${form})`
  return Symbol
}
