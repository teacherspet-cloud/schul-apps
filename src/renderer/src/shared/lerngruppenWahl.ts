/**
 * Auswahlliste der Lerngruppen in Freigabe-Dialogen (25.10.2026, Befund der Lehrkraft: „9c" stand mehrfach in der Liste,
 * weil sie in der Klasse mehr als ein Fach unterrichtet – je Fach eine Lerngruppe, aber nur der Klassenname als Eintrag).
 *
 * Gleiche Namen tragen jetzt ihr Fach („9c · Geschichte"), ebenso alle Gruppen eines anderen Fachs, wenn das Fach des
 * Materials bekannt ist; die Gruppen des passenden Fachs stehen vorn und unverändert benannt.
 */
export interface GruppenEintrag {
  id: string
  name: string
  fach?: string
}

const fachGleich = (a?: string, b?: string): boolean => Boolean(a && b) && a!.trim().toLowerCase() === b!.trim().toLowerCase()

/** Einträge für ein Select: `fach` = Fach des Materials (optional) */
export function gruppenAuswahl(gruppen: GruppenEintrag[], fach?: string): { value: string; label: string }[] {
  const zaehler = new Map<string, number>()
  for (const g of gruppen) zaehler.set(g.name, (zaehler.get(g.name) ?? 0) + 1)
  const mitFach = (g: GruppenEintrag): boolean => Boolean(g.fach) && ((zaehler.get(g.name) ?? 0) > 1 || (Boolean(fach) && !fachGleich(g.fach, fach)))
  const sortiert = fach ? [...gruppen].sort((a, b) => Number(fachGleich(b.fach, fach)) - Number(fachGleich(a.fach, fach))) : gruppen
  return sortiert.map((g) => ({ value: g.id, label: mitFach(g) ? `${g.name} · ${g.fach}` : g.name }))
}

/** Vorwahl: die erste Gruppe des passenden Fachs, sonst keine */
export function gruppenVorwahl(gruppen: GruppenEintrag[], fach?: string): string | null {
  return gruppen.find((g) => fachGleich(g.fach, fach))?.id ?? null
}
