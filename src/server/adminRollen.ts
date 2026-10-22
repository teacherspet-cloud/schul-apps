/**
 * Admin-Rollen in der Verwaltung (23.10.2026, Prüfung des Schulträgers, Punkt 9; Entscheidung der Lehrkraft: ein
 * zweiter Admin lässt sich später in der Verwaltung ernennen, keine Zwei-Faktor-Anmeldung).
 *
 *   GET  /server/verwaltung/admins           → { admins, lehrkraefte, fest }
 *   POST /server/verwaltung/admin-vergeben    { id }  (mit x-schulapps-token)
 *   POST /server/verwaltung/admin-entziehen   { id }
 *
 * Regeln (`adminAenderungPruefen`, auch für „Konto geändert" in verwaltung.ts):
 *  - Admin werden nur Lehrkraft-Konten (IServ oder von der Verwaltung angelegt) – keine Schüler-, Gast-, Test- oder
 *    Vorschaukonten und keine gesperrten Konten.
 *  - Der fest eingetragene Admin (ADMIN_BENUTZER) bleibt immer Admin (Rückfall; IServ machte ihn ohnehin wieder dazu).
 *  - Nie den letzten aktiven (nicht gesperrten) Admin entziehen oder sperren – auch nicht sich selbst.
 *  - Jede Änderung steht im Protokoll (Verwaltung › Server), mit dem Benutzernamen der Lehrkraft.
 */
import type { Anfrage } from './http'
import { json } from './http'
import { alleNutzer, nutzerAendern, nutzerNachId, protokolliereServer, type NutzerInfo } from './datenbank'
import { ADMIN_BENUTZER } from './anmeldung'

const ADMIN_QUELLEN = new Set(['iserv', 'lokal', 'notzugang'])

/** Aktive Admins (nicht gesperrt) */
export const aktiveAdmins = (): NutzerInfo[] => alleNutzer().filter((n) => n.rolle === 'admin' && !n.gesperrt)

export const istFesterAdmin = (n: Pick<NutzerInfo, 'benutzer'>): boolean => n.benutzer === ADMIN_BENUTZER

/**
 * Darf das Konto `ziel` so geändert werden? `rolle`/`gesperrt` wie in der Änderung (undefined = bleibt).
 * Liefert die Fehlermeldung oder null.
 */
export function adminAenderungPruefen(ziel: NutzerInfo, aenderung: { rolle?: string; gesperrt?: boolean }): string | null {
  const wirdAdmin = aenderung.rolle === 'admin' && ziel.rolle !== 'admin'
  if (wirdAdmin) {
    if (ziel.rolle !== 'lehrkraft' || !ADMIN_QUELLEN.has(ziel.quelle)) return 'Die Admin-Rolle lässt sich nur an Lehrkraft-Konten vergeben.'
    if (ziel.gesperrt || aenderung.gesperrt === true) return 'Gesperrte Konten bekommen keine Admin-Rolle.'
  }
  const verliertAdmin = ziel.rolle === 'admin' && aenderung.rolle !== undefined && aenderung.rolle !== 'admin'
  const wirdGesperrt = ziel.rolle === 'admin' && aenderung.gesperrt === true && !ziel.gesperrt
  if (verliertAdmin && istFesterAdmin(ziel)) return 'Dieses Konto ist als Admin fest eingetragen und bleibt Admin.'
  if ((verliertAdmin || wirdGesperrt) && !ziel.gesperrt) {
    const uebrig = aktiveAdmins().filter((n) => n.id !== ziel.id)
    if (!uebrig.length)
      return verliertAdmin ? 'Das ist der letzte Admin – vorher die Admin-Rolle an eine weitere Lehrkraft vergeben.' : 'Der letzte Admin lässt sich nicht sperren.'
  }
  return null
}

const kurz = (n: NutzerInfo): { id: string; benutzer: string; name: string; quelle: string; gesperrt: boolean; fest: boolean } => ({
  id: n.id,
  benutzer: n.benutzer,
  name: n.name,
  quelle: n.quelle,
  gesperrt: n.gesperrt,
  fest: istFesterAdmin(n)
})

export async function adminRollenRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  const was = url.pathname.startsWith('/server/verwaltung/') ? url.pathname.slice('/server/verwaltung/'.length) : ''
  if (was !== 'admins' && was !== 'admin-vergeben' && was !== 'admin-entziehen') return false
  if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
  if (sitzung.nutzer.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)

  if (was === 'admins') {
    if (req.method !== 'GET') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    const alle = alleNutzer()
    return (
      json(res, 200, {
        admins: alle.filter((n) => n.rolle === 'admin').map(kurz),
        // Wählbar: Lehrkraft-Konten, die Admin werden dürfen
        lehrkraefte: alle.filter((n) => n.rolle === 'lehrkraft' && !n.gesperrt && ADMIN_QUELLEN.has(n.quelle)).map(kurz),
        fest: ADMIN_BENUTZER
      }),
      true
    )
  }

  if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
  if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
  const k0 = (await k.koerper()) as Record<string, unknown>
  const ziel = nutzerNachId(String(k0.id ?? ''))
  if (!ziel) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  const vergeben = was === 'admin-vergeben'
  if (vergeben && ziel.rolle === 'admin') return (json(res, 200, { ok: true }), true)
  if (!vergeben && ziel.rolle !== 'admin') return (json(res, 200, { ok: true }), true)
  const fehler = adminAenderungPruefen(ziel, { rolle: vergeben ? 'admin' : 'lehrkraft' })
  if (fehler) return (json(res, 400, { fehler }), true)
  nutzerAendern(ziel.id, { rolle: vergeben ? 'admin' : 'lehrkraft' })
  protokolliereServer('verwaltung', `Admin-Rolle ${vergeben ? 'vergeben an' : 'entzogen:'} ${ziel.benutzer}`, sitzung.nutzer.id)
  return (json(res, 200, { ok: true }), true)
}
