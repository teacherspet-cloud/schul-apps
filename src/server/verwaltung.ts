/**
 * Schnittstelle der Verwaltungs-App (nur Admin) und der Kontoangaben jedes Nutzers (02.10.2026).
 *
 *   POST /server/eingerichtet          – Einrichtungsassistent abgeschlossen (jeder Nutzer)
 *   GET  /server/verwaltung/…          – Lesen (Admin)
 *   POST /server/verwaltung/…          – Ändern (Admin, mit x-schulapps-token)
 *
 * Testkonten: Benutzername „test.<n>", Einmal-Passwort (nur einmal angezeigt), Rolle Lehrkraft
 * oder Schüler, löschbar – beim Löschen geht die ganze Ablage des Kontos mit.
 * Freigegebene Schlüssel: Der Admin hinterlegt API-Schlüssel (verschlüsselt) und schaltet je
 * Schlüssel „für alle" an; Nutzer ohne eigenen Schlüssel arbeiten dann damit. ChatGPT-/Claude-Abos
 * sind NICHT teilbar (Nutzungsbedingungen) – jede Lehrkraft meldet ihr eigenes an.
 */
import { freemem, loadavg, totalmem } from 'node:os'
import { rmSync, statfsSync } from 'node:fs'
import type { SecretName } from '@shared/types'
import type { Anfrage } from './http'
import { json } from './http'
import {
  alleNutzer,
  leseServerProtokoll,
  nutzerAendern,
  nutzerAnlegen,
  nutzerLoeschen,
  nutzerNachBenutzer,
  nutzerNachId,
  protokolliereServer,
  serverGeheimnis,
  serverWert,
  setzeServerGeheimnis,
  setzeServerWert,
  sitzungenDesNutzersBeenden
} from './datenbank'
import { passwortHash, zufallsPasswort } from './geheim'
import { iservEinstellung, ISERV_STANDARD, type IservEinstellung } from './anmeldung'
import { DATEN, nutzerOrdner } from './pfade'
import { offeneStroeme } from './ereignisse'
import type { Rolle } from './kontext'
import { registerVergessen } from './namensschutz'
import { alleFreigaben, freigabeWiderrufen } from './hoertexte'

/** Schlüssel, die der Admin für alle freigeben kann */
export const TEILBARE_SCHLUESSEL: SecretName[] = ['openai', 'anthropic', 'google', 'elevenlabs', 'pixabay']

/** Für main/services/storage/settings.ts `setzeGeheimRueckfall`: freigegebener Schlüssel oder nichts */
export function freigegebenerSchluessel(name: SecretName): string | undefined {
  const freigaben = serverWert<Record<string, boolean>>('freigaben', {})
  if (!TEILBARE_SCHLUESSEL.includes(name) || !freigaben[name]) return undefined
  return serverGeheimnis(`schluessel:${name}`) || undefined
}

const verdeckt = (s: string): string => (s ? `${s.slice(0, 4)}…${s.slice(-4)}` : '')

export async function verwaltungsRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  if (!url.pathname.startsWith('/server/')) return false
  const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'
  if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)

  if (req.method === 'POST' && url.pathname === '/server/eingerichtet') {
    if (!mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    nutzerAendern(sitzung.nutzer.id, { eingerichtet: true })
    return (json(res, 200, { ok: true }), true)
  }

  if (!url.pathname.startsWith('/server/verwaltung/')) return false
  if (sitzung.nutzer.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)
  const was = url.pathname.slice('/server/verwaltung/'.length)

  if (req.method === 'GET') {
    if (was === 'uebersicht') {
      let platte: { frei: number; gesamt: number } | null = null
      try {
        const s = statfsSync(DATEN)
        platte = { frei: s.bavail * s.bsize, gesamt: s.blocks * s.bsize }
      } catch {
        platte = null
      }
      const freigaben = serverWert<Record<string, boolean>>('freigaben', {})
      const iserv = iservEinstellung()
      return (
        json(res, 200, {
          nutzer: alleNutzer().map(({ gruppen, ...n }) => ({ ...n, gruppen: gruppen.length })),
          schluessel: TEILBARE_SCHLUESSEL.map((name) => ({ name, hinterlegt: verdeckt(serverGeheimnis(`schluessel:${name}`)), fuerAlle: Boolean(freigaben[name]) })),
          iserv: { ...iserv, geheimnis: Boolean(serverGeheimnis('iserv-client')) },
          notzugang: serverWert('notzugang', true),
          server: {
            speicher: { frei: freemem(), gesamt: totalmem(), prozess: process.memoryUsage().rss },
            last: loadavg(),
            platte,
            stroeme: offeneStroeme(),
            laufzeit: process.uptime(),
            fassung: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''
          }
        }),
        true
      )
    }
    if (was === 'hoertexte') {
      const namen = new Map(alleNutzer().map((n) => [n.id, n.benutzer]))
      return (json(res, 200, { freigaben: alleFreigaben().map((f) => ({ ...f, benutzer: namen.get(f.nutzer_id) ?? '' })) }), true)
    }
    if (was === 'protokoll') return (json(res, 200, { eintraege: leseServerProtokoll(Number(url.searchParams.get('anzahl')) || 300) }), true)
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }

  if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
  if (!mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
  const k0 = (await k.koerper()) as Record<string, unknown>
  const ich = sitzung.nutzer.id

  if (was === 'testkonto') {
    const rolle: Rolle = k0.rolle === 'schueler' ? 'schueler' : 'lehrkraft'
    let n = 1
    while (nutzerNachBenutzer(`test.${n}`)) n++
    const passwort = zufallsPasswort()
    const neu = nutzerAnlegen({ benutzer: `test.${n}`, name: String(k0.name ?? '').slice(0, 80) || `Testkonto ${n}`, rolle, quelle: 'test', passwortHash: passwortHash(passwort) })
    registerVergessen()
    protokolliereServer('verwaltung', `Testkonto angelegt (${rolle})`, ich)
    // Das Passwort wird nur dieses eine Mal gezeigt
    return (json(res, 200, { benutzer: neu.benutzer, passwort, id: neu.id }), true)
  }
  if (was === 'nutzer-anlegen') {
    // Neuer Nutzer mit Benutzername und vorübergehendem Passwort (02.10.2026) – bei der ersten
    // Anmeldung muss ein eigenes Passwort gesetzt werden (http.ts, /passwort)
    const benutzer = String(k0.benutzer ?? '').trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(benutzer)) return (json(res, 400, { fehler: 'Benutzername: 2–64 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Minus, Unterstrich (z. B. m.mustermann).' }), true)
    if (benutzer.startsWith('gast-')) return (json(res, 400, { fehler: '„gast-“ ist für Onlinetests reserviert.' }), true)
    if (nutzerNachBenutzer(benutzer)) return (json(res, 409, { fehler: 'Diesen Benutzernamen gibt es schon.' }), true)
    const rolle: Rolle = k0.rolle === 'admin' ? 'admin' : k0.rolle === 'schueler' ? 'schueler' : 'lehrkraft'
    const eigenes = typeof k0.passwort === 'string' ? k0.passwort : ''
    if (eigenes && eigenes.length < 10) return (json(res, 400, { fehler: 'Das vorübergehende Passwort braucht mindestens 10 Zeichen.' }), true)
    const passwort = eigenes || zufallsPasswort()
    const neu = nutzerAnlegen({ benutzer, name: String(k0.name ?? '').trim().slice(0, 80) || benutzer, rolle, quelle: 'lokal', passwortHash: passwortHash(passwort), passwortWechseln: true })
    registerVergessen()
    protokolliereServer('verwaltung', `Konto angelegt (${rolle}, vorübergehendes Passwort)`, ich)
    return (json(res, 200, { benutzer: neu.benutzer, passwort, id: neu.id }), true)
  }
  if (was === 'passwort-zuruecksetzen') {
    // Vergessenes Passwort: neues vorübergehendes Passwort (nur für Konten mit Passwort)
    const n = nutzerNachId(String(k0.id ?? ''))
    if (!n) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    if (n.quelle !== 'lokal' && n.quelle !== 'test') return (json(res, 400, { fehler: 'Dieses Konto meldet sich nicht mit einem Passwort von Schul-Apps an.' }), true)
    const passwort = zufallsPasswort()
    nutzerAendern(n.id, { passwortHash: passwortHash(passwort), passwortWechseln: n.quelle === 'lokal' })
    sitzungenDesNutzersBeenden(n.id)
    protokolliereServer('verwaltung', 'Passwort zurückgesetzt', ich)
    return (json(res, 200, { benutzer: n.benutzer, passwort }), true)
  }
  if (was === 'nutzer-loeschen') {
    const n = nutzerNachId(String(k0.id ?? ''))
    if (!n) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    if (n.id === ich) return (json(res, 400, { fehler: 'Das eigene Konto lässt sich hier nicht löschen.' }), true)
    sitzungenDesNutzersBeenden(n.id)
    nutzerLoeschen(n.id)
    // Die ganze Ablage des Kontos geht mit
    try {
      rmSync(nutzerOrdner(n.id), { recursive: true, force: true })
    } catch {
      // Ordner fehlte – nichts zu tun
    }
    registerVergessen()
    protokolliereServer('verwaltung', `Konto gelöscht (${n.quelle}, ${n.rolle})`, ich)
    return (json(res, 200, { ok: true }), true)
  }
  if (was === 'nutzer') {
    const n = nutzerNachId(String(k0.id ?? ''))
    if (!n) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    const rolle = ['admin', 'lehrkraft', 'schueler'].includes(String(k0.rolle)) ? (k0.rolle as Rolle) : undefined
    if (n.id === ich && (rolle && rolle !== 'admin')) return (json(res, 400, { fehler: 'Die eigene Admin-Rolle lässt sich nicht abgeben.' }), true)
    nutzerAendern(n.id, { ...(rolle ? { rolle } : {}), ...(typeof k0.gesperrt === 'boolean' ? { gesperrt: k0.gesperrt } : {}) })
    if (k0.gesperrt === true) sitzungenDesNutzersBeenden(n.id)
    protokolliereServer('verwaltung', `Konto geändert${rolle ? ` (Rolle ${rolle})` : ''}${typeof k0.gesperrt === 'boolean' ? ` (${k0.gesperrt ? 'gesperrt' : 'entsperrt'})` : ''}`, ich)
    return (json(res, 200, { ok: true }), true)
  }
  if (was === 'schluessel') {
    const name = String(k0.name ?? '') as SecretName
    if (!TEILBARE_SCHLUESSEL.includes(name)) return (json(res, 400, { fehler: 'Unbekannter Schlüssel.' }), true)
    if (typeof k0.wert === 'string') setzeServerGeheimnis(`schluessel:${name}`, k0.wert.trim())
    if (typeof k0.fuerAlle === 'boolean') setzeServerWert('freigaben', { ...serverWert<Record<string, boolean>>('freigaben', {}), [name]: k0.fuerAlle })
    protokolliereServer('verwaltung', `Schlüssel ${name} geändert`, ich)
    return (json(res, 200, { ok: true }), true)
  }
  if (was === 'iserv') {
    const alt = iservEinstellung()
    const neu: IservEinstellung = {
      aussteller: typeof k0.aussteller === 'string' && /^https:\/\/[a-z0-9.-]+(\/[^\s]*)?$/i.test(k0.aussteller.trim()) ? k0.aussteller.trim().replace(/\/$/, '') : alt.aussteller,
      clientId: typeof k0.clientId === 'string' ? k0.clientId.trim() : alt.clientId,
      scopes: typeof k0.scopes === 'string' && k0.scopes.trim() ? k0.scopes.trim() : alt.scopes || ISERV_STANDARD.scopes
    }
    setzeServerWert('iserv', neu)
    if (typeof k0.geheimnis === 'string' && k0.geheimnis.trim()) setzeServerGeheimnis('iserv-client', k0.geheimnis.trim())
    protokolliereServer('verwaltung', 'IServ-Anbindung geändert', ich)
    return (json(res, 200, { ok: true }), true)
  }
  if (was === 'hoertext-widerrufen') {
    const ok = freigabeWiderrufen(String(k0.kennung ?? ''))
    if (ok) protokolliereServer('verwaltung', 'Hörtext-Freigabe widerrufen', ich)
    return (json(res, 200, { ok }), true)
  }
  if (was === 'notzugang') {
    setzeServerWert('notzugang', Boolean(k0.an))
    protokolliereServer('verwaltung', `Notzugang ${k0.an ? 'an' : 'aus'}`, ich)
    return (json(res, 200, { ok: true }), true)
  }
  return (json(res, 404, { fehler: 'Unbekannt.' }), true)
}

declare const __APP_VERSION__: string
