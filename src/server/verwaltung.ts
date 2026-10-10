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
import { leseDiagnose } from './diagnose'
import { fehlerUebersicht, serverZustand } from './serverZustand'
import { sicherungStarten, sicherungsStand } from './sicherungen'
import { freemem, loadavg, totalmem } from 'node:os'
import { statfsSync } from 'node:fs'
import type { SecretName } from '@shared/types'
import { KOMPATIBEL_IDS, kompatibelVorgabe } from '@shared/kiAnbieter'
import type { Anfrage } from './http'
import { json } from './http'
import {
  alleNutzer,
  leseServerProtokoll,
  nutzerAendern,
  nutzerAnlegen,
  kontoEntfernen,
  nutzerNachBenutzer,
  nutzerNachId,
  protokolliereServer,
  serverGeheimnis,
  serverWert,
  setzeServerGeheimnis,
  setzeServerWert,
  sitzungenDesNutzersBeenden,
  datenbank
} from './datenbank'
import { passwortHash, zufallsPasswort } from './geheim'
import { iservEinstellung, ISERV_STANDARD, type IservEinstellung } from './anmeldung'
import { DATEN } from './pfade'
import { offeneStroeme } from './ereignisse'
import type { Rolle } from './kontext'
import { benutzerFuer, klassenGruppe, nameAusZeile, startPasswort } from './klassenliste'
import { registerVergessen } from './namensschutz'
import { alleFreigaben, freigabeWiderrufen } from './hoertexte'
import { ABLAGE_STANDARD, ablageMuster } from './klassen'
import { alleKursgruppenSichern } from './iservKursgruppen'
import { AbgleichFehler, abgleichGeschuetzt, abgleichPruefen, abgleichSchwelle, pruefungEinloesen, pruefungMerken, sicherungVorAbgleich } from './iservAbgleich'
import { basename } from 'node:path'
import { verknuepfungLoesen } from './kontoVerknuepfung'
import type { NutzerInfo } from './datenbank'

/** Schlüssel, die der Admin für alle freigeben kann */
export const TEILBARE_SCHLUESSEL: SecretName[] = [
  'openai',
  'anthropic',
  'google',
  // OpenAI-kompatible Anbieter (09.10.2026, kiZugaenge.ts) – lokale Modelle gibt es auf dem Server nicht
  ...KOMPATIBEL_IDS.filter((id) => !kompatibelVorgabe(id)?.nurPc),
  'elevenlabs',
  'pixabay'
]

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
          nutzer: alleNutzer().map(({ gruppen, ...n }) => ({ ...n, gruppen: gruppen.length, klasse: gruppen.find((g) => g.id.startsWith('klasse:'))?.name ?? '' })),
          // Bekannte Klassen für die Zuordnung von Schülerkonten (06.10.2026)
          klassen: bekannteKlassen(),
          schluessel: TEILBARE_SCHLUESSEL.map((name) => ({ name, hinterlegt: verdeckt(serverGeheimnis(`schluessel:${name}`)), fuerAlle: Boolean(freigaben[name]) })),
          iserv: { ...iserv, geheimnis: Boolean(serverGeheimnis('iserv-client')), abgleichSchwelle: abgleichSchwelle() },
          notzugang: serverWert('notzugang', true),
          // Meine Klassen (06.10.2026): Ordnerstruktur für „In IServ ablegen"
          ablage: { muster: ablageMuster(), standard: ABLAGE_STANDARD },
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
    // Reiter „Server" (09.10.2026): Ampel, Verlauf, Nutzung, Platz, Sicherungen, Fehler – Zeitraum 24h oder 7d
    if (was === 'zustand') return (json(res, 200, serverZustand(DATEN, url.searchParams.get('zeitraum') === '7d' ? '7d' : '24h')), true)
    if (was === 'fehler') return (json(res, 200, fehlerUebersicht()), true)
    if (was === 'protokoll') return (json(res, 200, { eintraege: leseServerProtokoll(Number(url.searchParams.get('anzahl')) || 300) }), true)
    // Diagnose-Protokolle (zeilenweise verschlüsselt, diagnose.ts) entschlüsselt lesen – 08.10.2026
    if (was === 'diagnose') {
      const datei = url.searchParams.get('datei') === 'browser' ? 'browser' : 'langsam'
      return (json(res, 200, { zeilen: leseDiagnose(datei, Math.min(5000, Number(url.searchParams.get('anzahl')) || 500)) }), true)
    }
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
  if (was === 'klassenliste') {
    // Schülerkonten gesammelt (klassenliste.ts): Namensliste + Klasse → Konten mit Startpasswort
    const klasse = String(k0.klasse ?? '').trim().slice(0, 40)
    if (!klasse) return (json(res, 400, { fehler: 'Bitte die Klasse angeben (z. B. 10b).' }), true)
    const zeilen = String(k0.namen ?? '').split(/\r?\n/).slice(0, 60)
    const gruppe = klassenGruppe(klasse)
    const angelegt: { name: string; benutzer: string; passwort: string; schonDa?: boolean }[] = []
    for (const zeile of zeilen) {
      const n = nameAusZeile(zeile)
      if (!n) continue
      const name = `${n.vorname} ${n.nachname}`
      let benutzer = benutzerFuer(n.vorname, n.nachname)
      const vorhanden = nutzerNachBenutzer(benutzer)
      // Schon in dieser Klasse? Dann nicht doppelt anlegen
      if (vorhanden && vorhanden.name === name && vorhanden.gruppen.some((g) => g.id === gruppe.id)) {
        angelegt.push({ name, benutzer, passwort: '', schonDa: true })
        continue
      }
      for (let i = 2; nutzerNachBenutzer(benutzer); i++) benutzer = `${benutzerFuer(n.vorname, n.nachname)}${i}`
      const passwort = startPasswort()
      nutzerAnlegen({ benutzer, name, rolle: 'schueler', quelle: 'lokal', passwortHash: passwortHash(passwort), passwortWechseln: true, gruppen: [gruppe] })
      angelegt.push({ name, benutzer, passwort })
    }
    if (!angelegt.length) return (json(res, 400, { fehler: 'In der Liste wurden keine Namen erkannt (eine Zeile je Kind: „Vorname Nachname").' }), true)
    registerVergessen()
    protokolliereServer('verwaltung', `Schülerkonten angelegt (${angelegt.filter((x) => !x.schonDa).length}, Klasse ${klasse})`, ich)
    return (json(res, 200, { klasse, angelegt }), true)
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
    // Schülerkonto gleich einer Klasse zuordnen (06.10.2026) – so findet es jede Lerngruppe dieser Klasse
    const klasse = rolle === 'schueler' ? String(k0.klasse ?? '').trim().slice(0, 40) : ''
    const neu = nutzerAnlegen({
      benutzer,
      name: String(k0.name ?? '').trim().slice(0, 80) || benutzer,
      rolle,
      quelle: 'lokal',
      passwortHash: passwortHash(passwort),
      passwortWechseln: true,
      ...(klasse ? { gruppen: [klassenGruppe(klasse)] } : {})
    })
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
    // IServ-Konten nicht einzeln (09.10.2026): Sie kämen bei der nächsten Anmeldung leer wieder – entfernt werden sie über
    // „Mit IServ abgleichen", sobald es sie in IServ nicht mehr gibt
    if (n.quelle === 'iserv')
      return (json(res, 400, { fehler: 'Konten aus IServ lassen sich nicht einzeln löschen. „Mit IServ abgleichen“ entfernt Konten, die es in IServ nicht mehr gibt; sperren geht jederzeit.' }), true)
    // Die ganze Ablage des Kontos geht mit
    kontoEntfernen(n)
    registerVergessen()
    protokolliereServer('verwaltung', `Konto gelöscht (${n.quelle}, ${n.rolle})`, ich)
    return (json(res, 200, { ok: true }), true)
  }
  if (was === 'iserv-abgleich-pruefen') {
    // Schritt 1 (09.10.2026): nur zeigen, wer entfernt würde – nichts wird gelöscht
    const s = Number(k0.schwelle)
    if (Number.isFinite(s) && s >= 1 && s <= 100) setzeServerWert('iserv-abgleich-schwelle', Math.round(s))
    const schwelle = abgleichSchwelle()
    try {
      const plan = await abgleichPruefen(ich, undefined, schwelle)
      // Kurse aus IServ (10.10.2026): beim Abgleich die Kursgruppen aller Lehrkräfte aus ihren gespeicherten Gruppen nachziehen
      try {
        alleKursgruppenSichern()
      } catch {
        /* Zugabe */
      }
      const kennung = !plan.abbruch && (plan.entfernen.length || plan.loesen.length) ? pruefungMerken(ich, [...plan.entfernen, ...plan.loesen].map((x) => x.id)) : ''
      protokolliereServer('verwaltung', `IServ-Abgleich geprüft (${plan.entfernen.length} von ${plan.geprueft} fehlen in IServ, ${plan.loesen.length} Verknüpfungen${plan.abbruch ? ', abgebrochen' : ''})`, ich)
      return (json(res, 200, { ...plan, schwelle, kennung }), true)
    } catch (e) {
      protokolliereServer('verwaltung', 'IServ-Abgleich: Prüfen fehlgeschlagen', ich)
      return (json(res, e instanceof AbgleichFehler ? 400 : 502, { fehler: e instanceof AbgleichFehler ? e.message : 'IServ war für den Abgleich nicht erreichbar.' }), true)
    }
  }
  if (was === 'iserv-abgleich-entfernen') {
    // Schritt 2: nur mit Bestätigung, nur wer beim Prüfen angezeigt wurde und laut erneuter Prüfung noch immer fehlt
    if (k0.bestaetigt !== true) return (json(res, 400, { fehler: 'Das Entfernen braucht eine ausdrückliche Bestätigung.' }), true)
    const gezeigt = pruefungEinloesen(String(k0.kennung ?? ''), ich)
    if (!gezeigt) return (json(res, 409, { fehler: 'Die Prüfung ist abgelaufen. Bitte erneut prüfen.' }), true)
    let ziele: NutzerInfo[]
    let loesen: string[]
    try {
      const plan = await abgleichPruefen(ich)
      if (plan.abbruch) return (json(res, 409, { fehler: plan.abbruch }), true)
      ziele = plan.entfernen
        .filter((x) => gezeigt.has(x.id))
        .map((x) => nutzerNachId(x.id))
        .filter((n): n is NutzerInfo => Boolean(n) && !abgleichGeschuetzt(n!, ich))
      loesen = plan.loesen.filter((x) => gezeigt.has(x.id)).map((x) => x.id)
    } catch (e) {
      protokolliereServer('verwaltung', 'IServ-Abgleich: erneutes Prüfen fehlgeschlagen, nichts entfernt', ich)
      return (json(res, e instanceof AbgleichFehler ? 400 : 502, { fehler: e instanceof AbgleichFehler ? e.message : 'IServ war für den Abgleich nicht erreichbar – nichts entfernt.' }), true)
    }
    if (!ziele.length && !loesen.length) return (json(res, 200, { entfernt: 0, geloest: 0, sicherung: '' }), true)
    let sicherung = ''
    try {
      sicherung = basename(sicherungVorAbgleich(DATEN))
    } catch (e) {
      protokolliereServer('verwaltung', 'IServ-Abgleich: Sicherung fehlgeschlagen, nichts entfernt', ich)
      return (json(res, 500, { fehler: e instanceof AbgleichFehler ? e.message : 'Die Sicherung vor dem Abgleich ist fehlgeschlagen – nichts entfernt.' }), true)
    }
    for (const n of ziele) kontoEntfernen(n)
    // Gastkonten bleiben – nur die IServ-Anmeldung entfällt, Code/QR geht weiter
    for (const id of loesen) verknuepfungLoesen(id)
    registerVergessen()
    // Nur Zahlen, keine Namen
    protokolliereServer(
      'verwaltung',
      `IServ-Abgleich: ${ziele.length} Konten entfernt (${ziele.filter((n) => n.rolle === 'lehrkraft').length} Lehrkraft, ${ziele.filter((n) => n.rolle === 'schueler').length} Schüler), ${loesen.length} Verknüpfungen gelöst`,
      ich
    )
    return (json(res, 200, { entfernt: ziele.length, geloest: loesen.length, sicherung }), true)
  }
  if (was === 'nutzer') {
    const n = nutzerNachId(String(k0.id ?? ''))
    if (!n) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    const rolle = ['admin', 'lehrkraft', 'schueler'].includes(String(k0.rolle)) ? (k0.rolle as Rolle) : undefined
    if (n.id === ich && (rolle && rolle !== 'admin')) return (json(res, 400, { fehler: 'Die eigene Admin-Rolle lässt sich nicht abgeben.' }), true)
    // Klasse eines Schülerkontos setzen oder entfernen (leer); andere Gruppen (IServ) bleiben
    const klasse = typeof k0.klasse === 'string' ? k0.klasse.trim().slice(0, 40) : undefined
    const gruppen = klasse === undefined ? undefined : [...n.gruppen.filter((g) => !g.id.startsWith('klasse:')), ...(klasse ? [klassenGruppe(klasse)] : [])]
    nutzerAendern(n.id, { ...(rolle ? { rolle } : {}), ...(typeof k0.gesperrt === 'boolean' ? { gesperrt: k0.gesperrt } : {}), ...(gruppen ? { gruppen } : {}) })
    if (k0.gesperrt === true) sitzungenDesNutzersBeenden(n.id)
    protokolliereServer(
      'verwaltung',
      `Konto geändert${rolle ? ` (Rolle ${rolle})` : ''}${typeof k0.gesperrt === 'boolean' ? ` (${k0.gesperrt ? 'gesperrt' : 'entsperrt'})` : ''}${klasse !== undefined ? ` (Klasse ${klasse || 'entfernt'})` : ''}`,
      ich
    )
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
  if (was === 'iserv-ablage') {
    // Platzhalter {Klasse}, {Fach}, {Schuljahr}; leer = Standard
    const muster = String(k0.muster ?? '')
      .replace(/\\/g, '/')
      .split('/')
      .map((t) => t.trim().replace(/[<>:"|?*]/g, ''))
      .filter(Boolean)
      .join('/')
      .slice(0, 200)
    setzeServerWert('iserv-ablage', muster || ABLAGE_STANDARD)
    protokolliereServer('verwaltung', 'IServ-Ablagestruktur geändert', ich)
    return (json(res, 200, { muster: muster || ABLAGE_STANDARD }), true)
  }
  if (was === 'sicherung') {
    // „Sicherung jetzt anlegen" (09.10.2026): läuft im Hintergrund, Fortschritt über GET zustand
    const r = sicherungStarten(DATEN, ich)
    return (json(res, r.ok ? 200 : 409, r.ok ? { ok: true, stand: sicherungsStand() } : { fehler: r.fehler }), true)
  }
  if (was === 'notzugang') {
    setzeServerWert('notzugang', Boolean(k0.an))
    protokolliereServer('verwaltung', `Notzugang ${k0.an ? 'an' : 'aus'}`, ich)
    return (json(res, 200, { ok: true }), true)
  }
  return (json(res, 404, { fehler: 'Unbekannt.' }), true)
}

declare const __APP_VERSION__: string

/** Klassen aus den Schülerkonten (Klassenliste, Verwaltung) und den Lerngruppen der Lehrkräfte */
function bekannteKlassen(): string[] {
  const namen = new Map<string, string>()
  for (const n of alleNutzer()) for (const g of n.gruppen) if (g.id.startsWith('klasse:')) namen.set(g.id, g.name)
  try {
    const zeilen = datenbank().prepare('SELECT name FROM lerngruppen').all() as { name: string }[]
    for (const z of zeilen) if (z.name.trim()) namen.set(klassenGruppe(z.name).id, namen.get(klassenGruppe(z.name).id) ?? z.name.trim())
  } catch {
    // Tabelle fehlt (noch keine Lerngruppe) – nur die Konten
  }
  return [...namen.values()].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
}
