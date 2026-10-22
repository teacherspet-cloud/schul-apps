/**
 * Start des Servers (02.10.2026) – `node out/server/start.mjs` im Docker-Container.
 *
 * Umgebungsvariablen:
 *   SCHULAPPS_PORT          8443
 *   SCHULAPPS_ADRESSE       öffentliche Adresse, z. B. https://217.154.120.64:8443
 *   SCHULAPPS_HOSTS         erlaubte Host-Kopfzeilen, kommagetrennt (Vorgabe: Host der Adresse)
 *   SCHULAPPS_WEICHE        '1': hinter der Weiche auf 443 – Besucheradresse aus X-Real-IP (nur von privaten Adressen)
 *   SCHULAPPS_TLS_DOMAIN_NAMEN, SCHULAPPS_TLS_DOMAIN_CERT, SCHULAPPS_TLS_DOMAIN_KEY
 *                           eigene Domain mit eigenem Zertifikat (SNI), z. B. www.meineschulapps.de
 *   SCHULAPPS_TLS_CERT/KEY  Zertifikat (fehlt es, läuft der Server ohne TLS – nur für Tests)
 *   SCHULAPPS_DATEN         Datenordner (Docker-Volume)
 *   SCHULAPPS_SCHLUESSEL    Datei des Hauptschlüssels (Docker-Secret)
 *   SCHULAPPS_NOTZUGANG_PASSWORT  setzt beim Start das Passwort des Admin-Notzugangs (t.kornahrens)
 *   SCHULAPPS_NOTZUGANG_ERZWINGEN '1': Notzugang an, auch wenn er in der Verwaltung aus ist (Wiederherstellung bei
 *                           IServ-Ausfall, e2e-Testserver) – sonst standardmäßig aus (23.10.2026, Prüfung des Schulträgers)
 */
import { grammatikRoute } from './grammatik'
import { bankGrundbestand, grammatikBankRoute } from './grammatikBank'
import { ueberthemenRoute } from './ueberthemen'
import { sprechenRoute } from './sprechen'
import { kriseRoute, krisenErinnerungStarten } from './krise'
import { datenpanneRoute } from './datenpanne'
import { sprechBankRoute } from './sprechBank'
import { erinnerungenRoute, erinnerungenStarten } from './erinnerungen'
import { rekordbuchRoute } from './rekordbuch'
import { achievementsRoute, alleBerichtigen } from './achievements'
import { klassenRoute } from './klassen'
import { vorwissenRoute } from './vorwissen'
import { alleFachVorgaben, fachvorgabenRoute } from './fachvorgaben'
import { setzeSchulOperatoren } from '../shared/operatoren/zugriff'
import { foerdernRoute } from './foerdern'
import { startseiteRoute } from './startseite'
import { klassenGaesteRoute } from './klassenGaeste'
import { kontoVerknuepfungRoute } from './kontoVerknuepfungRoute'
import { kontoZumSchluessel, vorschauRoute } from './vorschau'
import { vokabelwegRoute } from './vokabelweg'
import { sprachstandRoute } from './sprachstand'
import { doppeltePruefen, wortlisteRoute } from './wortliste'
import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DATEN, RESSOURCEN } from './pfade'
import { ablageVerschluesseln } from './shims/fs'
import { kiAblagenAufraeumen } from './kiAblage'
import { registriereKanaele, type Handle } from '../main/kanaele'
import {
  getSettings,
  hatEigenesGeheimnis,
  setzeFachfarbenQuelle,
  setzeGeheimRueckfall,
  setzeNotenVorgabenQuelle,
  setzeSchuleFest,
  setzeSchulRueckfall
} from '../main/services/storage/settings'
import { fachfarbenRoute, leseSchulFachfarben, uebernimmFachfarbenEinmal } from './fachfarben'
import { schuleFest } from '@shared/schulFest'
import { leseSchule, schuleRoute } from './schule'
import { kalenderLaden, kalenderStarten, landAusLehrkraeften, schulkalenderRoute, setzeLandRueckfall } from './schulkalender'
import { schuljahrRoute, schuljahrWechselStarten, setzeOrtQuelle } from './schuljahrWechsel'
import { schulOrtVon } from './grammatik'
import { setzeFachobmannQuelle, setzeRolleQuelle } from '../main/services/rolle'
import { fachobleuteRoute, fachobmannFaecher } from './fachobleute'
import { ladeLehrwerkGrammatik } from '../main/services/storage/lehrwerkGrammatik'
import { cleanupWorkDirs } from '../main/services/ai/cli'
import { abgelaufeneSitzungenEntfernen, datenbank, fehlerKurz, nutzerAendern, nutzerAnlegen, nutzerNachBenutzer, protokolliereServer } from './datenbank'
import { hauptschluessel, passwortHash } from './geheim'
import { ADMIN_BENUTZER, anmeldeHaken, notzugangErzwungen } from './anmeldung'
import { adminRollenRoute } from './adminRollen'
import { alleKursgruppenSichern, iservKurseRoute, nachIservAnmeldung } from './iservKursgruppen'
import { serverUmgebung } from './umgebung'
import { starteServer } from './http'
import { herzschlagStarten } from './ereignisse'
import { messungenStarten, setzeKiNutzungQuelle, zaehlerSchreiben } from './serverZustand'
import { kiNutzungJeTag, meldeTokens, merkeKiNutzung, mitKiNutzung } from './kiNutzung'
import { setzeVerbrauchsHaken } from '../main/services/ai/verbrauch'
import { setzeEndpunktRueckfall } from '../main/services/ai/models'
import { kiSchutzEinrichten } from './kiSchutzServer'
import type { SecretName } from '@shared/types'
import { freigegebenerSchluessel, verwaltungsRoute } from './verwaltung'
import { kiZugaengeRoute, schulEndpunkt } from './kiZugaenge'
import { loeschkonzeptRoute, loeschkonzeptStarten } from './loeschkonzept'
import { datenschutzRoute } from './datenschutzSeiten'
import { druckBeenden } from './druck'
import { mitNamensschutz } from './namensschutz'
import { hoertextRoute, mitFreigabe } from './hoertexte'
import { medienRoute } from './medien'
import { dublettenMelder, dublettenPruefen, medienKorpusQuelle } from '../main/services/storage/medienbank'
import { serverKorpus } from './wartungMedienBedeutungen'
import { lehrkraftRoute, schuelerRoute } from './onlinetest'
import { lernstandRoute } from './lernstand'
import { fachschaftRoute, mitFachschaft, setzeEntferner } from './fachschaft'
import { fachordnerRoute } from './fachordner'
import { feedbackRoute } from './schuelerfeedback'
import { blaetterRoute } from './arbeitsblaetter'
import { reihenRoute } from './reihen'
import { vokabelRoute } from './vokabeln'
import { lernenRoute } from './lernen'
import { spielRoute } from './spiel'
import { planenRoute } from './planen'
import { aktuellerNutzer } from './kontext'
import { OBERFLAECHE } from './pfade'

const env = process.env

async function main(): Promise<void> {
  hauptschluessel()
  // Bilder je Bedeutung (21.10.2026): Wörter aller Lehrkräfte für das Einrichten – vor der Wartung, die es auslöst
  medienKorpusQuelle(serverKorpus)
  datenbank()
  // Gespeicherten Schulkalender gleich setzen – Rechnungen vor dem ersten Abruf nutzen schon die letzten Daten
  kalenderLaden()

  // Notzugang des Admins (solange IServ noch nicht freigeschaltet ist)
  const pw = env.SCHULAPPS_NOTZUGANG_PASSWORT
  if (pw) {
    const admin = nutzerNachBenutzer(ADMIN_BENUTZER)
    if (admin) nutzerAendern(admin.id, { passwortHash: passwortHash(pw), rolle: 'admin' })
    else nutzerAnlegen({ benutzer: ADMIN_BENUTZER, name: 'Torge Kornahrens', rolle: 'admin', quelle: 'notzugang', passwortHash: passwortHash(pw) })
    protokolliereServer('start', 'Passwort des Notzugangs gesetzt')
  }
  // Erzwungener Notzugang steht im Protokoll (23.10.2026, Prüfung des Schulträgers)
  if (notzugangErzwungen()) protokolliereServer('start', 'Notzugang über SCHULAPPS_NOTZUGANG_ERZWINGEN eingeschaltet')

  // Vom Admin für alle freigegebene Schlüssel – nur, wenn der Nutzer keinen eigenen hat
  setzeGeheimRueckfall(freigegebenerSchluessel)
  // OpenAI-kompatible Anbieter der Schule (09.10.2026): Adresse/Azure-Version aus „KI-Zugänge", solange die Lehrkraft keine eigene hat
  setzeEndpunktRueckfall(schulEndpunkt)
  // KI-Nutzung über Schlüssel der Schule für Verwaltung › Server (kiNutzung.ts)
  setzeKiNutzungQuelle(kiNutzungJeTag)
  // Token der Aufrufe über Schlüssel der Schule für Kosten-Schätzung und Budget (10.10.2026, kiNutzung.ts › meldeTokens)
  setzeVerbrauchsHaken(meldeTokens)
  // KI-Sicherheitsprüfung (22.10.2026, kiSchutzServer.ts): Schlange je Lehrkraft, Modelle/Budget über den Schulzugang, SSRF
  kiSchutzEinrichten()
  // Schul-Einrichtung der Verwaltung: Bundesland/Schulform, solange die Lehrkraft keine eigenen gewählt hat (09.10.2026)
  setzeSchulRueckfall(leseSchule)
  // Fachfarben legt die Verwaltung für alle fest (09.10.2026, fachfarben.ts) – einmal die des Admins übernehmen
  uebernimmFachfarbenEinmal()
  setzeFachfarbenQuelle(leseSchulFachfarben)
  // Schulinterne Operatoren der Fächer auch für Erzeugung am Server (13.10.2026)
  setzeSchulOperatoren((fach) => alleFachVorgaben()[fach]?.operatoren)
  // Notenschlüssel je Fach aus den Vorgaben der Fachobleute (13.10.2026, fachvorgaben.ts)
  setzeNotenVorgabenQuelle(() =>
    Object.fromEntries(Object.entries(alleFachVorgaben()).flatMap(([f, v]) => (v.notenschluessel ? [[f, v.notenschluessel]] : [])))
  )
  // IServ-Konten gehören fest zur Schule des Servers (09.10.2026, shared/schulFest.ts)
  setzeSchuleFest(() => schuleFest(aktuellerNutzer()))
  // Gemeinsame Lehrwerke und Medienbank: bearbeiten nur Admins (main/services/rolle.ts)
  setzeRolleQuelle(() => aktuellerNutzer()?.rolle)
  // Fachobleute (12.10.2026, fachobleute.ts): bearbeiten gemeinsame Lehrwerke ihres Fachs wie der Admin
  setzeFachobmannQuelle(() => {
    const n = aktuellerNutzer()
    return n && n.rolle !== 'schueler' ? fachobmannFaecher(n.id) : []
  })
  // Grammatikformen der Lehrwerke (12.10.2026): gemeinsame Bearbeitungen über die eingebauten legen
  ladeLehrwerkGrammatik()
  // Medienbank-Grundbestand (19.10.2026, Wunsch der Lehrkraft): ein neuer Server ohne Medienbank übernimmt den Stand des
  // Schulservers vom 19.10.2026 (resources/medienbank – Bilder, Aussprache, Beispielsätze); eine vorhandene bleibt, wie sie ist
  // Grammatik-Aufgabenbank ebenso (grammatikBank.ts, nur bei leerer Bank). SCHULAPPS_GRUNDBESTAND=0 (Testserver): beides aus
  const grundbestand = env.SCHULAPPS_GRUNDBESTAND !== '0'
  if (grundbestand) bankGrundbestand()
  const medienZiel = join(DATEN, 'medienbank')
  const medienQuelle = join(RESSOURCEN, 'medienbank')
  if (grundbestand && !existsSync(join(medienZiel, 'index.json')) && existsSync(join(medienQuelle, 'index.json')))
    try {
      cpSync(medienQuelle, medienZiel, { recursive: true, force: false })
      protokolliereServer('system', 'Medienbank-Grundbestand eingespielt')
    } catch (e) {
      protokolliereServer('system', `Medienbank-Grundbestand fehlgeschlagen: ${fehlerKurz(e)}`)
    }
  // Kurse aus IServ (10.10.2026, iservKursgruppen.ts): nach jeder Anmeldung über IServ erkennen und Kursgruppen sichern
  anmeldeHaken.nachIserv = nachIservAnmeldung

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
  // Innen die Zählung der KI-Nutzung (09.10.2026, kiNutzung.ts): NUR Aufrufe über Schlüssel der Schule, nie private Zugänge
  const gezaehlt = mitKiNutzung(roh, {
    nutzer: () => aktuellerNutzer(),
    einstellung: () => getSettings().ai,
    eigenerSchluessel: (a) => hatEigenesGeheimnis(a as SecretName),
    schulSchluessel: (a) => Boolean(freigegebenerSchluessel(a as SecretName)),
    merke: merkeKiNutzung
  })
  const geschuetzt = mitFachschaft(mitNamensschutz(gezaehlt))
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
  // Reste der KI-Programme (Protokolle, Verläufe, Arbeitsordner) – beim Start ohne Schonfrist, danach alle 10 Minuten
  try {
    kiAblagenAufraeumen(DATEN, Date.now(), 0)
  } catch {
    /* beim nächsten Durchgang */
  }
  setInterval(() => {
    try {
      kiAblagenAufraeumen(DATEN)
    } catch {
      /* beim nächsten Durchgang */
    }
  }, 10 * 60 * 1000).unref()
  if (umgeschrieben) console.log(`${umgeschrieben} Dateien der Ablagen verschlüsselt.`)

  const hosts = (env.SCHULAPPS_HOSTS || new URL(adresse).host)
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  const cert = env.SCHULAPPS_TLS_CERT
  const key = env.SCHULAPPS_TLS_KEY
  // Eigene Domain (05.10.2026): zweites Zertifikat, gewählt nach dem Namen (SNI) – die IP-Adresse behält ihres
  const domainNamen = (env.SCHULAPPS_TLS_DOMAIN_NAMEN || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
  const domain =
    domainNamen.length && env.SCHULAPPS_TLS_DOMAIN_CERT && env.SCHULAPPS_TLS_DOMAIN_KEY
      ? { namen: domainNamen, cert: env.SCHULAPPS_TLS_DOMAIN_CERT, key: env.SCHULAPPS_TLS_DOMAIN_KEY }
      : undefined
  const tls = cert && key && existsSync(cert) && existsSync(key) ? { cert, key, ...(domain ? { domain } : {}) } : undefined

  await starteServer({
    port,
    adresse,
    hosts,
    weiche: env.SCHULAPPS_WEICHE === '1',
    aufruf,
    tls,
    // „Als Schüler ansehen“ (06.10.2026): Vorschau-Schlüssel nur mit der Sitzung der Lehrkraft
    vorschau: kontoZumSchluessel,
    routen: [
      // Datenschutzerklärung, Elternfassung, Impressum ohne Anmeldung; Kurzfassung für Lernende (22.10.2026, datenschutzSeiten.ts) – vor schuelerRoute
      datenschutzRoute(),
      // Klasse und Kurse aus IServ für Lernende (10.10.2026, iservKursgruppen.ts) – vor den Routen, die /s/api/ ganz übernehmen
      iservKurseRoute(),
      // Förder- und Fordermaterial: Lerndaten je Kind, Gruppen, Bündel „Für dich" (12.10.2026, foerdern.ts)
      foerdernRoute(),
      // Vorwissen der Lerngruppe für Reihe, Arbeitsblatt und Förder-/Fordermaterial (13.10.2026, vorwissen.ts)
      vorwissenRoute(),
      // Vorgaben der Fächer: Curriculum und Standards, gepflegt von den Fachobleuten (13.10.2026, fachvorgaben.ts)
      fachvorgabenRoute(),
      hoertextRoute,
      // Medienbank der Vokabeln für Lernende (05.10.2026)
      medienRoute,
      feedbackRoute(aufruf, adresse),
      blaetterRoute(aufruf, adresse),
      reihenRoute(aufruf, adresse),
      // Vokabeln je Sprache (10.10.2026): Stand, Tagesrunde „sp:…" und frühere Bände „bd:…" – vor den Listen
      sprachstandRoute(),
      // Vokabelweg vor den Listen: er übernimmt die Kennungen „lb:…"
      vokabelwegRoute(),
      vokabelRoute(adresse),
      // Wortliste im Fachordner der Lernenden (09.10.2026)
      wortlisteRoute(),
      // Grammatik-Lern-App (06.10.2026)
      grammatikRoute(adresse),
      // Aufgabenbank der Grammatik (13.10.2026): Aufgaben an der Form, gepflegt in „Grammatikformen"
      grammatikBankRoute(),
      // Rekordbuch der Lernenden (08.10.2026)
      rekordbuchRoute(),
      // Achievements der Lernenden (08.10.2026)
      achievementsRoute(),
      // Erinnerungen zum Üben per Web Push (10.10.2026)
      erinnerungenRoute(adresse),
      // Zusammen spielen: Kooperativ und Versus (08.10.2026)
      spielRoute(),
      lernenRoute(),
      // Überthemen (19.10.2026): /s/api/themen – vor schuelerRoute, die /s/api/ ganz übernimmt
      ueberthemenRoute(),
      // Sprechprüfungstraining (19.10.2026) – vor schuelerRoute
      // Kartenpool und Bilder der Sprechprüfungen (19.10.2026) – vor sprechenRoute (Bildpfad unter /s/api/sprechen/)
      sprechBankRoute(),
      sprechenRoute(aufruf),
      // Vertrauliche Krisenhinweise an die Lehrkraft (22.10.2026, krise.ts)
      kriseRoute(),
      // Datenpannen nach Art. 33/34 DSGVO (22.10.2026, Prüfung des Schulträgers, datenpanne.ts) – nur Admins
      datenpanneRoute(),
      // Freischaltungen planen: „Geplant" der Lehrkraft, „Demnächst"/„Neu freigeschaltet" der Lernenden (09.10.2026)
      planenRoute(),
      // Schüler-Startseite: Lernstand und Lerntipps (06.10.2026)
      lernstandRoute(aufruf),
      schuelerRoute(aufruf),
      lehrkraftRoute(aufruf, adresse),
      fachschaftRoute(),
      // „Meine Klassen" (06.10.2026)
      // Musterschüler-Vorschau vor den Klassen (/server/klassen/<id>/vorschau)
      vorschauRoute(),
      // Gäste mit Anmeldecode in „Meine Klassen" › Lernende (09.10.2026, klassenGaeste.ts)
      klassenGaesteRoute(),
      // Gastkonto ↔ IServ zusammenführen (09.10.2026, kontoVerknuepfungRoute.ts)
      kontoVerknuepfungRoute(),
      klassenRoute(),
      // Startseite der Lehrkraft: Vokabelkurse und Klassen auf einen Blick (10.10.2026)
      startseiteRoute(),
      fachordnerRoute(),
      // Schul-Einrichtung (09.10.2026): lesen alle Lehrkräfte, ändern nur Admins
      schuleRoute,
      // Schulkalender (10.10.2026): lesen alle Angemeldeten, neu abrufen nur Admins
      schulkalenderRoute,
      // Schuljahreswechsel: Hinweis und „Rückgängig" in „Meine Klassen" (10.10.2026)
      schuljahrRoute,
      // Fachfarben der Schule: lesen alle Lehrkräfte, ändern nur Admins (09.10.2026)
      fachfarbenRoute,
      // Fachobleute: Admin ernennt, Lehrkräfte lesen die eigenen Fächer (12.10.2026)
      fachobleuteRoute,
      // KI-Zugänge der Schule: Adressen, Verbindungstest, Nutzungsübersicht (09.10.2026, kiZugaenge.ts)
      kiZugaengeRoute,
      // Löschkonzept und Sicherung außerhalb des Servers (23.10.2026, loeschkonzept.ts)
      loeschkonzeptRoute,
      // Admin-Rollen vergeben/entziehen (23.10.2026, adminRollen.ts) – vor der Verwaltung, die /server/verwaltung/ ganz übernimmt
      adminRollenRoute,
      verwaltungsRoute
    ]
  })
  console.log(`Schul-Apps-Server läuft: ${adresse} (${tls ? 'TLS' : 'ohne TLS'}), Daten: ${DATEN}, Oberfläche: ${OBERFLAECHE}`)
  protokolliereServer('start', `Server gestartet (${tls ? 'TLS' : 'ohne TLS'})`)

  herzschlagStarten()
  // Messwerte für Verwaltung › Server (09.10.2026): alle 5 Minuten, 8 Tage aufgehoben
  messungenStarten()
  // Erinnerungen zum Üben (10.10.2026): Zeitplaner alle 5 Minuten, nur fällige Lernende
  erinnerungenStarten(adresse)
  // Krisenhinweise (23.10.2026, Prüfung des Schulträgers): eine Erinnerung nach 24 h ohne „Gesehen"
  krisenErinnerungStarten()
  // Schulkalender und Schuljahreswechsel (10.10.2026): Ferien/Feiertage des Landes, Hochstufen am ersten Schultag
  setzeLandRueckfall(() => landAusLehrkraeften(schulOrtVon))
  setzeOrtQuelle(schulOrtVon)
  schuljahrWechselStarten()
  // Löschkonzept (23.10.2026): Nachtlauf 3–6 Uhr und kurz nach dem Start, Wiederherstellungstests des Hosts
  loeschkonzeptStarten()
  kalenderStarten()
  // Doppelte Vokabeln in laufenden Kursen zählen (10.10.2026) – Protokollzeile nur, wenn es welche gibt
  setTimeout(() => doppeltePruefen('Start'), 20_000).unref?.()
  // Medienbank (10.10.2026): doppelte Aufnahmen derselben Vokabel zählen – beim Start und nach Medienaufträgen, Protokollzeile nur bei Dubletten
  dublettenMelder((zeile) => protokolliereServer('medien', zeile))
  setTimeout(() => dublettenPruefen(), 25_000).unref?.()
  // Medaillen still auf die neue Regel berichtigen (12.10.2026) – einmal je Person, auch ohne dass sie die App öffnet
  setTimeout(() => void alleBerichtigen().catch(() => undefined), 30_000).unref?.()
  // Kurse aus IServ (10.10.2026): beim Start einmal für alle Lehrkräfte (Gruppen aus ihrer letzten Anmeldung)
  try {
    const k = alleKursgruppenSichern()
    if (k.angelegt || k.verknuepft) protokolliereServer('klassen', `Kurse aus IServ beim Start: ${k.angelegt} angelegt, ${k.verknuepft} verknüpft (${k.lehrkraefte} Lehrkräfte)`)
  } catch {
    /* beim nächsten Anmelden */
  }
  const stuendlich = setInterval(() => {
    abgelaufeneSitzungenEntfernen()
    cleanupWorkDirs()
  }, 36e5)
  stuendlich.unref()

  const ende = async (): Promise<void> => {
    zaehlerSchreiben()
    await druckBeenden()
    process.exit(0)
  }
  process.on('SIGTERM', () => void ende())
  process.on('SIGINT', () => void ende())
  // Ein Fehler außerhalb einer Anfrage soll den Server nicht beenden – laut melden und weiter
  // Nur Art, gekürzte Meldung und Aufrufstelle – keine Inhalte (Meldungen zitieren sonst Anfragen, 08.10.2026)
  process.on('unhandledRejection', (e) =>
    console.error('Unbehandelt:', fehlerKurz(e), e instanceof Error ? (e.stack ?? '').split('\n').filter((z) => /^\s+at /.test(z)).slice(0, 6).join('\n') : '')
  )
}

void main().catch((e: unknown) => {
  console.error('Start fehlgeschlagen:', e)
  process.exit(1)
})
