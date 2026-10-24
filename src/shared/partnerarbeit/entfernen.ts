/**
 * Löschkonzept (24.10.2026): Kennungen einer gelöschten Person aus den JSON-Daten der Partnerarbeit nehmen – Gruppen,
 * Anwesenheit, Symbole, Rollen eines Schritts sowie Einstufung, „nicht mit" und „zuletzt" der Regeln. Rein rechnend,
 * genutzt von server/personDaten.ts (JSON_OBJEKTE) für partner_arbeiten.daten und partner_regeln.daten.
 */
import type { PaGruppe } from './typen'

export function partnerPersonEntfernen(daten: unknown, ids: Set<string>): unknown {
  if (!daten || typeof daten !== 'object' || Array.isArray(daten)) return daten
  const d = daten as Record<string, unknown>
  const aus: Record<string, unknown> = { ...d }
  const weg = (x: unknown): boolean => ids.has(String(x))
  if (Array.isArray(d.anwesend)) aus.anwesend = d.anwesend.filter((x) => !weg(x))
  if (d.symbole && typeof d.symbole === 'object') aus.symbole = Object.fromEntries(Object.entries(d.symbole as Record<string, string>).filter(([k]) => !weg(k)))
  if (Array.isArray(d.gruppen))
    aus.gruppen = (d.gruppen as PaGruppe[])
      .map((g) => ({
        ...g,
        mitglieder: (g.mitglieder ?? []).filter((x) => !weg(x)),
        schritt: g.schritt
          ? {
              ...g.schritt,
              rollen: Object.fromEntries(Object.entries(g.schritt.rollen ?? {}).filter(([k]) => !weg(k))),
              frei: Object.fromEntries(Object.entries(g.schritt.frei ?? {}).filter(([k]) => !weg(k))),
              fertig: (g.schritt.fertig ?? []).filter((x) => !weg(x)),
              ...(g.schritt.dran && weg(g.schritt.dran) ? { dran: undefined } : {})
            }
          : null
      }))
      .filter((g) => g.mitglieder.length)
  if (d.einstufung && typeof d.einstufung === 'object')
    aus.einstufung = Object.fromEntries(Object.entries(d.einstufung as Record<string, string>).filter(([k]) => !weg(k)))
  if (Array.isArray(d.nichtMit)) aus.nichtMit = (d.nichtMit as [string, string][]).filter((p) => Array.isArray(p) && !weg(p[0]) && !weg(p[1]))
  if (d.zuletzt && typeof d.zuletzt === 'object')
    aus.zuletzt = Object.fromEntries(
      Object.entries(d.zuletzt as Record<string, string[]>)
        .filter(([k]) => !weg(k))
        .map(([k, v]) => [k, (Array.isArray(v) ? v : []).filter((x) => !weg(x))])
    )
  return aus
}
