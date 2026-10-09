/**
 * Vorschläge „mit dem bisherigen Konto zusammenführen" in „Meine Klassen" › Lernende (09.10.2026, kontoVerknuepfung.ts):
 *
 *   GET  /server/klassen/<GRUPPE>/iserv-vorschlaege                          → { vorschlaege: Vorschlag[] }
 *   POST /server/klassen/<GRUPPE>/iserv-zusammenfuehren  { iservId, gastId }  → { ok }
 *   POST /server/klassen/<GRUPPE>/iserv-ignorieren       { iservId, gastId }  → { ok }
 *
 * Nur für die eigene Lerngruppe; der Gast muss Mitglied einer Lerngruppe der Lehrkraft sein. Steht VOR der Route von
 * „Meine Klassen" (start.ts), die unbekannte POST-Anfragen ablehnt.
 */
import { alsNutzer, json, type Anfrage } from './http'
import { lerngruppe } from './onlinetest'
import { vorschlaegeFuer, vorschlagBestaetigen, vorschlagIgnorieren } from './kontoVerknuepfung'
import { registerVergessen } from './namensschutz'

export function kontoVerknuepfungRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const m = /^\/server\/klassen\/([^/]+)\/(iserv-vorschlaege|iserv-zusammenfuehren|iserv-ignorieren)$/.exec(url.pathname)
    if (!m) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    if (sitzung.nutzer.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const ich = alsNutzer(sitzung.nutzer, sitzung.kennung)
    const g = lerngruppe(decodeURIComponent(m[1]))
    if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true)
    if (m[2] === 'iserv-vorschlaege') {
      if (req.method !== 'GET') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
      return (json(res, 200, { vorschlaege: vorschlaegeFuer(g.id, ich.id) }), true)
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const k0 = (await k.koerper()) as Record<string, unknown>
    const iservId = String(k0.iservId ?? '')
    const gastId = String(k0.gastId ?? '')
    // Nur Vorschläge zu Gästen DIESER Lerngruppe
    if (!vorschlaegeFuer(g.id, ich.id).some((v) => v.iservId === iservId && v.gastId === gastId))
      return (json(res, 404, { fehler: 'Diesen Vorschlag gibt es in dieser Lerngruppe nicht (mehr).' }), true)
    const fehler = m[2] === 'iserv-zusammenfuehren' ? vorschlagBestaetigen(iservId, gastId, ich.id) : vorschlagIgnorieren(iservId, gastId, ich.id)
    if (fehler) return (json(res, 409, { fehler }), true)
    if (m[2] === 'iserv-zusammenfuehren') registerVergessen()
    return (json(res, 200, { ok: true }), true)
  }
}
