import { FAECHER } from './faecher'

/**
 * Fachschaft aus den IServ-Gruppen (Wunsch der Lehrkraft, 02.10.2026): Der Ordner „Englisch" unter
 * „Gruppen" zeigt, dass jemand Englisch unterrichtet. Erkannt werden Ordner, deren Name ein Fach
 * nennt – „Englisch", „Fachschaft Englisch", „FS Englisch", „Fachgruppe Mathematik" –, nicht aber
 * Klassen oder Kurse („Klasse 10b", „Englisch 10b" bleiben außen vor).
 */
export function faecherAusGruppen(ordner: string[]): string[] {
  const treffer = new Set<string>()
  for (const roh of ordner) {
    const n = roh
      .toLowerCase()
      .replace(/^(fachschaft|fachgruppe|fachbereich|fs|fk)[\s:_-]+/, '')
      .replace(/[\s_-]+(fachschaft|fachgruppe)$/, '')
      .trim()
    if (/\d/.test(n)) continue
    const f = FAECHER.find((x) => x.label.toLowerCase() === n || x.id === n)
    if (f) treffer.add(f.id)
  }
  return [...treffer]
}
