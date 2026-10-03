/**
 * Start des Servers (02.10.2026) – `node out/server/start.mjs` im Docker-Container.
 *
 * Umgebungsvariablen:
 *   SCHULAPPS_PORT          8443
 *   SCHULAPPS_ADRESSE       öffentliche Adresse, z. B. https://217.154.120.64:8443
 *   SCHULAPPS_HOSTS         erlaubte Host-Kopfzeilen, kommagetrennt (Vorgabe: Host der Adresse)
 *   SCHULAPPS_TLS_CERT/KEY  Zertifikat (fehlt es, läuft der Server ohne TLS – nur für Tests)
 *   SCHULAPPS_DATEN         Datenordner (Docker-Volume)
 *   SCHULAPPS_SCHLUESSEL    Datei des Hauptschlüssels (Docker-Secret)
 *   SCHULAPPS_NOTZUGANG_PASSWORT  setzt beim Start das Passwort des Admin-Notzugangs (t.kornahrens)
 */
import { existsSync } from 'node:fs'
import { ablageVerschluesseln } from './shims/fs'
import { registriereKanaele, type Handle } from '../main/kanaele'
import { setzeGeheimRueckfall } from '../main/services/storage/settings'
import { cleanupWorkDirs } from '../main/services/ai/cli'
import { abgelaufeneSitzungenEntfernen, datenbank, nutzerAendern, nutzerAnlegen, nutzerNachBenutzer, protokolliereServer } from './datenbank'
import { hauptschluessel, passwortHash } from './geheim'
import { ADMIN_BENUTZER } from './anmeldung'
import { serverUmgebung } from './umgebung'
import { starteServer } from './http'
import { herzschlagStarten } from './ereignisse'
import { freigegebenerSchluessel, verwaltungsRoute } from './verwaltung'
import { druckBeenden } from './druck'
import { mitNamensschutz } from './namensschutz'
import { hoertextRoute, mitFreigabe } from './hoertexte'
import { lehrkraftRoute, schuelerRoute } from './onlinetest'
import { fachschaftRoute, mitFachschaft, setzeEntferner } from './fachschaft'
import { fachordnerRoute } from './fachordner'
import { feedbackRoute } from './schuelerfeedback'
import { blaetterRoute } from './arbeitsblaetter'
import { reihenRoute } from './reihen'
import { vokabelRoute } from './vokabeln'
import { lernenRoute } from './lernen'
import { aktuellerNutzer } from './kontext'
import { DATEN, OBERFLAECHE } from './pfade'

const env = process.env

async function main(): Promise<void> {
  hauptschluessel()
  datenbank()

  // Notzugang des Admins (solange IServ noch nicht freigeschaltet ist)
  const pw = env.SCHULAPPS_NOTZUGANG_PASSWORT
  if (pw) {
    const admin = nutzerNachBenutzer(ADMIN_BENUTZER)
    if (admin) nutzerAendern(admin.id, { passwortHash: passwortHash(pw), rolle: 'admin' })
    else nutzerAnlegen({ benutzer: ADMIN_BENUTZER, name: 'Torge Kornahrens', rolle: 'admin', quelle: 'notzugang', passwortHash: passwortHash(pw) })
    protokolliereServer('start', 'Passwort des Notzugangs gesetzt')
  }

  // Vom Admin für alle freigegebene Schlüssel – nur, wenn der Nutzer keinen eigenen hat
  setzeGeheimRueckfall(freigegebenerSchluessel)

  const port = Number(env.SCHULAPPS_PORT || 8443)
  const adresse = (env.SCHULAPPS_ADRESSE || `http://localhost:${port}`).replace(/\/$/, '')

  // Alle Aufrufe der Oberfläche, wie am PC – nur mit der Umgebung des Servers
  const aufrufe = new Map<string, (...args: unknown[]) => unknown>()
  const handle: Handle = (kanal, fn) => void aufrufe.set(kanal, fn as (...args: unknown[]) => unknown)
  registriereKanaele(handle, serverUmgebung())
  const roh = async (kanal: string, args: unknown[]): Promise<unknown> => {
    const fn = aufrufe.get(kanal)
    if (!fn) throw new Error(`Unbekannter Aufruf „${kanal}".`)
    return fn(...args)
  }
  // Klarnamen nie an eine KI (namensfilter.ts) – EINE Stelle für alle KI- und Sprachausgabe-Aufrufe
  // Freigaben für die Fachschaft: Arbeitskopien bleiben aus der Bibliothek, bis sie geändert werden (fachschaft.ts)
  const geschuetzt = mitFachschaft(mitNamensschutz(roh))
  setzeEntferner(roh)
  // Hörtexte: jede Aufnahme bekommt eine Adresse für den QR-Code (hoertexte.ts)
  const aufruf = async (kanal: string, args: unknown[]): Promise<unknown> => {
    const wert = await geschuetzt(kanal, args)
    const n = aktuellerNutzer()
    if (n && (kanal === 'audio:speak' || kanal === 'audio:import')) return mitFreigabe(wert, n.id, adresse)
    return wert
  }

  // Personenbezogenes verschlüsselt (feldschutz.ts, shims/fs.ts): Altdateien der Ablagen einmal umschreiben
  const umgeschrieben = ablageVerschluesseln()
  if (umgeschrieben) console.log(`${umgeschrieben} Dateien der Ablagen verschlüsselt.`)

  const hosts = (env.SCHULAPPS_HOSTS || new URL(adresse).host)
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  const cert = env.SCHULAPPS_TLS_CERT
  const key = env.SCHULAPPS_TLS_KEY
  const tls = cert && key && existsSync(cert) && existsSync(key) ? { cert, key } : undefined

  await starteServer({
    port,
    adresse,
    hosts,
    aufruf,
    tls,
    routen: [
      hoertextRoute,
      feedbackRoute(aufruf, adresse),
      blaetterRoute(aufruf, adresse),
      reihenRoute(aufruf),
      vokabelRoute(adresse),
      lernenRoute(),
      schuelerRoute(aufruf),
      lehrkraftRoute(aufruf, adresse),
      fachschaftRoute(),
      fachordnerRoute(),
      verwaltungsRoute
    ]
  })
  console.log(`Schul-Apps-Server läuft: ${adresse} (${tls ? 'TLS' : 'ohne TLS'}), Daten: ${DATEN}, Oberfläche: ${OBERFLAECHE}`)
  protokolliereServer('start', `Server gestartet (${tls ? 'TLS' : 'ohne TLS'})`)

  herzschlagStarten()
  const stuendlich = setInterval(() => {
    abgelaufeneSitzungenEntfernen()
    cleanupWorkDirs()
  }, 36e5)
  stuendlich.unref()

  const ende = async (): Promise<void> => {
    await druckBeenden()
    process.exit(0)
  }
  process.on('SIGTERM', () => void ende())
  process.on('SIGINT', () => void ende())
  // Ein Fehler außerhalb einer Anfrage soll den Server nicht beenden – laut melden und weiter
  process.on('unhandledRejection', (e) => console.error('Unbehandelt:', e))
}

void main().catch((e: unknown) => {
  console.error('Start fehlgeschlagen:', e)
  process.exit(1)
})
