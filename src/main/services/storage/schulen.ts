// Schulverzeichnis für die Schulnamen-Suche (Paket 13): resources/schulen/schulen.json. Nur
// gelesen – einmal beim ersten Suchen geladen und vorbereitet (Suchform je Schule), danach
// läuft jede Suche im Speicher. Die Suche selbst steht ohne Electron in src/shared/schulsuche.ts.
//
// Vorgabe-Logos liegen als resources/schulen/logos/<id>.png bei (bisher nur das Gymnasium
// Wesermünde, Wunsch der Lehrkraft vom 26.09.2026).
import { existsSync, readdirSync, readFileSync } from 'fs'
import { bereiteVor, pruefeSchulen, sucheSchulen, type SchulEintrag, type SchulQuelle, type SchulTreffer, type SuchOptionen } from '@shared/schulsuche'
import { resourcePath } from './paths'

let geladen: { index: SchulEintrag[]; quellen: SchulQuelle[]; stand: string; logos: Set<string> } | null = null

function lade(): NonNullable<typeof geladen> {
  if (geladen) return geladen
  let daten: ReturnType<typeof pruefeSchulen> = { zeilen: [], quellen: [], stand: '' }
  try {
    daten = pruefeSchulen(JSON.parse(readFileSync(resourcePath('schulen', 'schulen.json'), 'utf8')))
  } catch {
    // Datei fehlt oder ist beschädigt: Die Suche findet dann nichts – der Schulname bleibt frei eintragbar
  }
  let logos = new Set<string>()
  try {
    const ordner = resourcePath('schulen', 'logos')
    if (existsSync(ordner))
      logos = new Set(
        readdirSync(ordner)
          .filter((f) => f.endsWith('.png'))
          .map((f) => f.slice(0, -4))
      )
  } catch {
    // ohne Logos weiter
  }
  geladen = { index: bereiteVor(daten.zeilen), quellen: daten.quellen, stand: daten.stand, logos }
  return geladen
}

export function schulenSuchen(text: string, opt: SuchOptionen = {}): SchulTreffer[] {
  if (typeof text !== 'string' || text.length > 200) return []
  const { index, logos } = lade()
  return sucheSchulen(
    index,
    text,
    { land: typeof opt?.land === 'string' ? opt.land : undefined, schulform: typeof opt?.schulform === 'string' ? opt.schulform : undefined },
    (id) => logos.has(id)
  )
}

/** Vorgabe-Logo einer Schule als data:-URL (PNG) oder null */
export function schulLogo(id: string): string | null {
  // Nur Kennungen wie „NI-67052" oder „OSM-n123" – der Wert wird zum Dateinamen
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{1,40}$/.test(id) || !lade().logos.has(id)) return null
  try {
    return `data:image/png;base64,${readFileSync(resourcePath('schulen', 'logos', `${id}.png`)).toString('base64')}`
  } catch {
    return null
  }
}

/** Quellen und Lizenzen des Verzeichnisses – für den Quellenvermerk in den Einstellungen */
export function schulQuellen(): { stand: string; anzahl: number; quellen: SchulQuelle[] } {
  const { stand, index, quellen } = lade()
  return { stand, anzahl: index.length, quellen }
}
