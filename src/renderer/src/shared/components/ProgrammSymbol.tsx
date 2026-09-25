import type { ComponentType, CSSProperties } from 'react'
import { useId } from 'react'

/*
 * Eigene Symbole der Programme (Paket 9, 26.09.2026).
 *
 * Vorher standen hier Tabler-Symbole (Sprache, Liste, Datei …), die für die Lehrkraft nicht
 * zeigten, welches Programm dahintersteckt – LZK und Klassenarbeit sahen fast gleich aus.
 * Jetzt passt jedes Symbol zum Motiv der Startseiten-Illustration, ohne Buchstaben oder Ziffern:
 * Sprechblasen mit Häkchen, Karteikasten, Blatt mit Stift, Zielscheibe, Puzzleteile, Heftstapel.
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

export type ProgrammSymbolForm = 'vokabeltest' | 'vokabelliste' | 'arbeitsblatt' | 'lernzielkontrolle' | 'grammatiktest' | 'klassenarbeit'

const SPRECHBLASE = 'M12 8H18A3 3 0 0 1 21 11V15A3 3 0 0 1 18 18H15L12 21V18A3 3 0 0 1 9 15V11A3 3 0 0 1 12 8Z'
const BLEISTIFT = 'M11 21L12 17L18.5 10.5A2.12 2.12 0 0 1 21.5 13.5L15 20Z'
const PFEIL = 'M11 13L16 8M16 5V8H19L22 5H19V2Z'
const PUZZLETEIL = 'M2 9H5A2.2 2.2 0 1 1 8 9H11V12.5A2.2 2.2 0 1 1 11 15.5V19H2Z'
const FUELLER = 'M14.5 20L15.1 15.9L19.33 6.76A1.6 1.6 0 0 1 22.19 8.2L17.5 17.1Z'
const heft = (x: number, y: number, breite: number, hoehe: number): string =>
  `M${x + 1} ${y}H${x + breite - 1}A1 1 0 0 1 ${x + breite} ${y + 1}V${y + hoehe - 1}A1 1 0 0 1 ${x + breite - 1} ${y + hoehe}H${x + 1}A1 1 0 0 1 ${x} ${y + hoehe - 1}V${y + 1}A1 1 0 0 1 ${x + 1} ${y}Z`

const FORMEN: Record<ProgrammSymbolForm, Form> = {
  // Zwei überlappende Sprechblasen, die vordere mit Häkchen – sprachneutral
  vokabeltest: {
    aussparen: SPRECHBLASE,
    hinten: [{ d: 'M5 3H13A2 2 0 0 1 15 5V10A2 2 0 0 1 13 12H7L4 15V12A2 2 0 0 1 3 10V5A2 2 0 0 1 5 3Z', art: 'akzent' }],
    vorn: [
      { d: SPRECHBLASE, art: 'strich' },
      { d: 'M12 13L14 15L18 11', art: 'strich' }
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
  // Zielscheibe mit Pfeil
  lernzielkontrolle: {
    aussparen: PFEIL,
    aussparenBreite: 5,
    hinten: [
      { d: 'M11 4A9 9 0 1 0 20 13A9 9 0 0 0 11 4Z', art: 'strich' },
      { d: 'M11 8A5 5 0 1 0 16 13A5 5 0 0 0 11 8Z', art: 'akzent' }
    ],
    vorn: [
      { d: 'M11 11A2 2 0 1 0 11 15A2 2 0 1 0 11 11Z', art: 'voll' },
      { d: PFEIL, art: 'strich' }
    ]
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
