/**
 * Schülerkonten aus einer Klassenliste (02.10.2026, abgestimmt mit der Lehrkraft).
 *
 * Solange die Anmeldung über IServ nicht freigeschaltet ist, legt der Admin die Konten der
 * Lernenden an – gesammelt: Namensliste einfügen (aus Excel, eine Zeile je Kind), Klasse angeben.
 * Es entstehen Konten „vorname.nachname" mit Startpasswort (bei der ersten Anmeldung zu ändern)
 * und der Klasse als Gruppe – Lehrkräfte wählen die Klasse dann beim Anlegen einer Lerngruppe.
 */
import { randomInt } from 'node:crypto'

/** Eine Zeile der Liste → Vor- und Nachname („Anna Müller", „Müller, Anna", „Müller⇥Anna") */
export function nameAusZeile(zeile: string): { vorname: string; nachname: string } | null {
  const z = zeile.replace(/\s+/g, ' ').trim()
  if (!z) return null
  if (zeile.includes('\t')) {
    const [a, b] = zeile.split('\t').map((x) => x.trim())
    // Aus Excel kommt meist „Nachname⇥Vorname"
    return b ? { vorname: b, nachname: a } : null
  }
  if (z.includes(',')) {
    const [nach, vor] = z.split(',').map((x) => x.trim())
    return vor && nach ? { vorname: vor, nachname: nach } : null
  }
  const teile = z.split(' ')
  if (teile.length < 2) return null
  return { vorname: teile.slice(0, -1).join(' '), nachname: teile[teile.length - 1] }
}

const ERSATZ: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' }
const kurz = (s: string): string =>
  s
    .replace(/[äöüßÄÖÜ]/g, (z) => ERSATZ[z])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Benutzername „vorname.nachname" (Doppelnamen mit Bindestrich, nur a–z, 0–9) */
export const benutzerFuer = (vorname: string, nachname: string): string => `${kurz(vorname.split(' ')[0])}.${kurz(nachname)}`.slice(0, 60)

const WOERTER = ['Apfel', 'Birne', 'Wolke', 'Sonne', 'Tiger', 'Panda', 'Fuchs', 'Kiwi', 'Mond', 'Stern', 'Insel', 'Blume', 'Igel', 'Delfin', 'Pinsel', 'Rakete', 'Kompass', 'Garten', 'Robbe', 'Eule']

/** Startpasswort, das Kinder abtippen können: „Tiger-Wolke-47" (≥ 10 Zeichen) */
export const startPasswort = (): string => `${WOERTER[randomInt(WOERTER.length)]}-${WOERTER[randomInt(WOERTER.length)]}-${randomInt(10, 100)}`

/** Gruppe der Klasse an den Konten: „klasse:10b" – so findet die Lerngruppe ihre Mitglieder */
export const klassenGruppe = (klasse: string): { id: string; name: string } => ({ id: `klasse:${kurz(klasse) || 'ohne'}`, name: klasse.trim() })
