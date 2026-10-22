/**
 * Datenschutzerklärung, Elternfassung und Impressum (22.10.2026, Prüfung des Schulträgers, Punkt 6:
 * Art. 13 DSGVO, § 18 MStV, Art. 50 KI-VO).
 *
 *   GET  /datenschutz                – Datenschutzerklärung (ohne Anmeldung, ohne Skript)
 *   GET  /datenschutz/eltern         – Elternfassung zum Drucken bzw. „Als PDF speichern" (ohne Anmeldung)
 *   GET  /impressum                  – Impressum nach § 18 MStV / § 5 DDG (ohne Anmeldung)
 *   GET  /server/datenschutz         – Angaben der Schule + Vorschau der Empfänger (Lehrkräfte und Admins)
 *   POST /server/datenschutz         – Angaben speichern (nur Admin, mit x-schulapps-token)
 *   GET  /s/api/datenschutz/kurz     – Kurzfassung für Lernende: Sätze, Fassung, zuletzt bestätigte Fassung
 *   POST /s/api/datenschutz/kurz     – „Verstanden" merken ({ version }) – je Konto bzw. Gastkonto
 *
 * Der Inhalt entsteht aus der ECHTEN Einrichtung: Angaben der Schule (server_einstellungen 'datenschutz-angaben',
 * Rückfall auf die Schul-Einrichtung 'schule'), freigegebene Schlüssel der Schule (verwaltung.ts › freigaben) und die
 * Datenorte der Anbieter (shared/kiAnbieter.ts). Leere Pflichtangaben erscheinen als deutlich markierte Platzhalter,
 * rechtliche Einordnungen, die die Schule bestätigen muss, als gelbe Kästen „Von der Schule zu prüfen" – bis die
 * Verwaltung „geprüft" setzt.
 *
 * Die Seiten liegen VOR der Anmeldung (Route steht in start.ts vor allen anderen; http.ts ruft die Routen vor der
 * Umleitung auf /anmelden auf). CSP wie die Anmeldeseite, aber ganz ohne Skript.
 */
import { kompatibelVorgabe, KOMPATIBLE_ANBIETER } from '@shared/kiAnbieter'
import {
  KURZFASSUNG_SCHUELER,
  kurzfassungVersion,
  LEERE_ANGABEN,
  pruefeDatenschutzAngaben,
  type DatenschutzAngaben
} from '@shared/datenschutzInfo'
import { datenbank, protokolliereServer, serverGeheimnis, serverWert, setzeServerWert } from './datenbank'
import { json, type Anfrage } from './http'
import { leseSchule } from './schule'
import { iservBereit } from './anmeldung'

const SCHLUESSEL = 'datenschutz-angaben'

/** CSP der Informationsseiten: kein Skript, keine Formulare */
export const INFO_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'"

// ---------------------------------------------------------------- Einrichtung lesen

/** Was aus der Schul-Einrichtung übernommen wird (Name, Anschrift, Kontakt) */
export interface SchulKopf {
  name: string
  strasse: string
  plz: string
  ort: string
  telefon: string
  email: string
}

/** Ein Empfänger, an den Daten gehen können */
export interface Empfaenger {
  id: string
  name: string
  zweck: string
  ort: string
  /** true: Drittland (USA); null: hängt von der Einrichtung ab */
  drittland: boolean | null
  /** Gehen dorthin Daten von Lernenden? */
  lernende: boolean
}

/** Alles, woraus die Seiten entstehen – reine Daten, damit die Erzeugung ohne Datenbank prüfbar ist */
export interface SeitenStand {
  angaben: DatenschutzAngaben
  schule: SchulKopf | null
  /** Freigegebene Schlüssel der Schule mit hinterlegtem Wert (SecretName, z. B. 'openai', 'mistral', 'elevenlabs') */
  freigegeben: string[]
  /** Anmeldung über IServ eingerichtet */
  iserv: boolean
}

/** Bekannte Dienste außerhalb der OpenAI-kompatiblen Liste */
const DIENSTE: Record<string, Omit<Empfaenger, 'id'>> = {
  openai: {
    name: 'OpenAI (Schnittstelle zu den GPT-Modellen)',
    zweck: 'Texte und Rückmeldungen erzeugen, Bilder erzeugen; Sprechtraining (Live-Gespräch per Sprache)',
    ort: 'USA (Vertragspartner in Europa: OpenAI Ireland Ltd.)',
    drittland: true,
    lernende: true
  },
  anthropic: {
    name: 'Anthropic (Schnittstelle zu den Claude-Modellen)',
    zweck: 'Texte und Rückmeldungen erzeugen',
    ort: 'USA',
    drittland: true,
    lernende: true
  },
  google: {
    name: 'Google (Schnittstelle zu den Gemini-Modellen)',
    zweck: 'Texte und Rückmeldungen erzeugen, Bilder erzeugen',
    ort: 'USA und weitere Länder',
    drittland: true,
    lernende: true
  },
  elevenlabs: {
    name: 'ElevenLabs (Sprachausgabe)',
    zweck: 'Aussprache von Vokabeln und Beispielsätzen vertonen – nur Lernwörter, keine Daten von Lernenden',
    ort: 'USA',
    drittland: true,
    lernende: false
  },
  pixabay: {
    name: 'Pixabay (Bildersuche)',
    zweck: 'Bilder zu Vokabeln suchen – nur Suchwörter, keine Daten von Lernenden',
    ort: 'Deutschland',
    drittland: false,
    lernende: false
  },
  azure_speech: {
    name: 'Microsoft Azure Speech (Aussprache)',
    zweck: 'Aussprache im Sprechtraining einschätzen',
    ort: 'Region laut Einrichtung der Schule (EU-Region möglich)',
    drittland: null,
    lernende: true
  }
}

/** Datenort eines OpenAI-kompatiblen Anbieters → Drittland? */
const KOMPATIBEL_DRITTLAND: Record<string, boolean | null> = {
  mistral: false,
  azure: false,
  ionos: false,
  stackit: false,
  gemini_oai: true,
  openrouter: true,
  eigener: null
}

/** Empfänger aus den freigegebenen Schlüsseln (Reihenfolge: KI, Sprache, Bilder) */
export function empfaengerAus(freigegeben: string[]): Empfaenger[] {
  const aus: Empfaenger[] = []
  for (const id of new Set(freigegeben)) {
    if (id === 'iserv') continue
    const d = DIENSTE[id]
    if (d) {
      aus.push({ id, ...d })
      continue
    }
    const k = kompatibelVorgabe(id)
    if (k && !k.nurPc)
      aus.push({ id, name: k.label, zweck: 'Texte und Rückmeldungen erzeugen', ort: k.datenort, drittland: KOMPATIBEL_DRITTLAND[id] ?? null, lernende: true })
  }
  const rang = (e: Empfaenger): number => (e.id === 'elevenlabs' || e.id === 'azure_speech' ? 1 : e.id === 'pixabay' ? 2 : 0)
  return aus.sort((a, b) => rang(a) - rang(b))
}

/** Alle KI-Dienste, die Lehrkräfte mit EIGENEM Zugang nutzen können (für den Hinweis „eigene Konten") */
export const MOEGLICHE_KI = (): string[] => [
  DIENSTE.openai.name,
  DIENSTE.anthropic.name,
  DIENSTE.google.name,
  ...KOMPATIBLE_ANBIETER.filter((k) => !k.nurPc && k.id !== 'eigener').map((k) => k.label)
]

/** Angaben der Schule (oder leere Vorgaben) */
export function leseAngaben(): DatenschutzAngaben {
  const roh = serverWert<unknown>(SCHLUESSEL, null)
  return roh ? { ...pruefeDatenschutzAngaben(roh), geaendert: (roh as { geaendert?: string }).geaendert } : { ...LEERE_ANGABEN }
}

/** Freigegebene Schlüssel MIT hinterlegtem Wert */
function freigegebeneSchluessel(): string[] {
  const freigaben = serverWert<Record<string, boolean>>('freigaben', {})
  return Object.keys(freigaben).filter((n) => freigaben[n] && Boolean(serverGeheimnis(`schluessel:${n}`)))
}

/** Stand aus der Datenbank */
export function seitenStand(): SeitenStand {
  const s = leseSchule()
  return {
    angaben: leseAngaben(),
    schule: s?.name ? { name: s.name, strasse: s.strasse, plz: s.plz, ort: s.ort, telefon: s.telefon, email: s.email } : null,
    freigegeben: freigegebeneSchluessel(),
    iserv: iservBereit()
  }
}

// ---------------------------------------------------------------- HTML-Bausteine

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const zeilen = (s: string): string => esc(s).replace(/\n/g, '<br>')

/** Markierter Platzhalter für eine fehlende Pflichtangabe */
export const platzhalter = (was: string): string => `<span class="platzhalter" data-platzhalter>[von der Schule einzutragen: ${esc(was)}]</span>`
const feld = (wert: string, was: string): string => (wert.trim() ? zeilen(wert) : platzhalter(was))

/** Gelber Kasten für Einordnungen, die die Schule bestätigen muss */
const pruefen = (st: SeitenStand, text: string): string =>
  st.angaben.geprueft ? '' : `<aside class="pruefen" data-pruefen><strong>Von der Schule zu prüfen:</strong> ${text}</aside>`

function schulName(st: SeitenStand): string {
  return st.angaben.schuleName.trim() || st.schule?.name || ''
}

function schulAnschrift(st: SeitenStand): string {
  if (st.angaben.schuleAnschrift.trim()) return st.angaben.schuleAnschrift
  const s = st.schule
  if (!s) return ''
  return [s.strasse, [s.plz, s.ort].filter(Boolean).join(' ')].filter((z) => z.trim()).join('\n')
}

function schulKontakt(st: SeitenStand): string {
  const s = st.schule
  if (!s) return ''
  return [s.telefon ? `Telefon: ${s.telefon}` : '', s.email ? `E-Mail: ${s.email}` : ''].filter(Boolean).join('\n')
}

const STIL = `
:root { color-scheme: light dark; --grund: #f6f5fb; --karte: #fff; --text: #1d1b26; --leise: #5d5870; --rand: #dcd8ea; --akzent: #5b4fd6;
  --gelb: #fff4c7; --gelb-rand: #e3c650; --gelb-text: #5a4600; --platz: #ffe1dd; --platz-text: #8a1c10; }
@media (prefers-color-scheme: dark) { :root { --grund: #14121f; --karte: #1d1a2c; --text: #eeecf8; --leise: #b0a8c8; --rand: #36314d; --akzent: #a99cff;
  --gelb: #3a3214; --gelb-rand: #8a7420; --gelb-text: #f3e2a0; --platz: #4a1f1a; --platz-text: #ffc2b8; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--grund); color: var(--text); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 16px; }
main { max-width: 820px; margin: 0 auto; background: var(--karte); border: 1px solid var(--rand); border-radius: 16px; padding: 24px 22px 28px; }
h1 { margin: 0 0 6px; font-size: 1.7rem; line-height: 1.25; }
h2 { margin: 28px 0 8px; font-size: 1.2rem; }
h3 { margin: 18px 0 6px; font-size: 1.02rem; }
p, li { overflow-wrap: anywhere; }
.leise { color: var(--leise); }
a { color: var(--akzent); }
nav.oben { max-width: 820px; margin: 0 auto 12px; display: flex; gap: 16px; flex-wrap: wrap; font-size: .92rem; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: .92rem; }
th, td { text-align: left; vertical-align: top; border-top: 1px solid var(--rand); padding: 8px 6px; }
th { font-weight: 700; }
.tabelle { overflow-x: auto; }
.pruefen { background: var(--gelb); border: 1px solid var(--gelb-rand); color: var(--gelb-text); border-radius: 10px; padding: 8px 12px; margin: 10px 0; font-size: .92rem; }
.platzhalter { background: var(--platz); color: var(--platz-text); border-radius: 6px; padding: 1px 6px; font-weight: 600; }
.marke { display: inline-block; font-size: .8rem; font-weight: 700; border: 1px solid var(--rand); border-radius: 999px; padding: 1px 8px; }
footer { max-width: 820px; margin: 14px auto 0; font-size: .85rem; text-align: center; }
@media print {
  :root { color-scheme: light; --grund: #fff; --karte: #fff; --text: #000; --leise: #333; --rand: #999; --gelb: #fff; --platz: #fff; --platz-text: #000; --gelb-text: #000; }
  body { padding: 0; font-size: 11pt; } main { border: 0; padding: 0; max-width: none; } nav.oben, footer, .nur-bildschirm { display: none; }
  h2 { break-after: avoid; } table, .pruefen { break-inside: avoid; }
}
`

function seite(titel: string, inhalt: string, stand?: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.ico" sizes="any">
<title>${esc(titel)} – Schul-Apps</title>
<style>${STIL}</style>
</head>
<body>
<nav class="oben"><a href="/">Zu Schul-Apps</a><a href="/datenschutz">Datenschutzerklärung</a><a href="/datenschutz/eltern">Fassung für Eltern</a><a href="/impressum">Impressum</a></nav>
<main>
${inhalt}
</main>
<footer class="leise">Schul-Apps${stand ? ` · Angaben der Schule zuletzt geändert am ${esc(new Date(stand).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }))}` : ''}</footer>
</body>
</html>`
}

/** Bereiche der App: Zweck und Daten */
const BEREICHE: { bereich: string; zweck: string; daten: string }[] = [
  {
    bereich: 'Anmeldung und Konten',
    zweck: 'Zugang zur Plattform, Zuordnung zu Klassen und Kursen',
    daten: 'Name, Benutzername, Rolle, Klassen-/Kursgruppen (aus IServ), Zeitpunkt der letzten Anmeldung; bei Gästen ein selbst gewählter Vorname und ein Anmeldecode'
  },
  {
    bereich: 'Arbeitsblätter',
    zweck: 'Blätter digital ausfüllen, einreichen, Rückmeldung erhalten',
    daten: 'Eingaben, Zeichnungen mit dem Stift, Einreichungen, Rückmeldungen, Bearbeitungsstand'
  },
  {
    bereich: 'Onlinetests',
    zweck: 'Tests im Unterricht schreiben und auswerten',
    daten: 'Antworten, vorläufige und bestätigte Bewertung, Aufsichtsvermerke (z. B. Verlassen der Seite, Einfügen)'
  },
  {
    bereich: 'Vokabeln und Spiele',
    zweck: 'Vokabeln üben, Lernkartei, Lernspiele (auch zu zweit)',
    daten: 'Lernstand je Wort, Übungstage, Rekorde, Medaillen, Spielcodes'
  },
  { bereich: 'Grammatik', zweck: 'Grammatik üben', daten: 'Antworten, Lernstand je Grammatikform' },
  {
    bereich: 'Unterrichtsreihen',
    zweck: 'Lernpfad mit Schritten, Diagnose, Lerntagebuch, Abschlussprodukt',
    daten: 'Fortschritt, Diagnoseergebnisse, Lerntagebuch-Einträge, Abgaben (Text, Foto, Datei, Sprachaufnahme), Rückmeldungen'
  },
  { bereich: 'Rückmeldebogen', zweck: 'Texte schreiben und überarbeiten mit Rückmeldung', daten: 'Fassungen des Textes, Rückmeldebögen' },
  {
    bereich: 'Sprechtraining',
    zweck: 'Sprechprüfungen mit einer KI üben',
    daten: 'Stimme (live, nicht gespeichert), Gesprächstext (nur bis zur Auswertung), Einschätzung, Kennzahlen, Tipps, Übungsminuten'
  },
  {
    bereich: 'Erinnerungen (Push)',
    zweck: 'Erinnerungen zum Üben – nur, wenn sie auf dem Gerät ausdrücklich eingeschaltet werden',
    daten: 'Push-Adresse des Geräts, gewählte Zeiten'
  },
  {
    bereich: 'Elternbriefe',
    zweck: 'Lehrkräfte erstellen Elternbriefe und Rücklaufzettel',
    daten: 'Inhalt der Briefe; Namen von Kindern nur, soweit die Lehrkraft sie einträgt'
  },
  {
    bereich: 'Krisenhinweise',
    zweck: 'Schutz von Kindern: Deutet ein Eintrag auf Selbstgefährdung hin, sieht das Kind sofort Hilfsangebote und die Lehrkraft einen vertraulichen Hinweis',
    daten: 'Art und Zeitpunkt des Hinweises, ohne den Wortlaut'
  },
  { bereich: 'Darstellung und Einstellungen', zweck: 'Schrift, Farben, Vorlesen, Lernziele', daten: 'gewählte Einstellungen' }
]

/** Empfängerliste als Tabelle */
function empfaengerTabelle(e: Empfaenger[]): string {
  if (!e.length) return '<p data-keine-ki>Über die Zugänge der Schule ist derzeit kein KI-, Sprach- oder Bilddienst freigegeben.</p>'
  return `<div class="tabelle"><table data-empfaenger>
<thead><tr><th>Dienst</th><th>Wofür</th><th>Ort der Verarbeitung</th></tr></thead>
<tbody>${e
    .map(
      (x) =>
        `<tr data-empfaenger-id="${esc(x.id)}"><td>${esc(x.name)}</td><td>${esc(x.zweck)}</td><td>${esc(x.ort)}${
          x.drittland === true ? ' <span class="marke" data-drittland>Drittland</span>' : x.drittland === null ? ' <span class="marke">je nach Einrichtung</span>' : ''
        }</td></tr>`
    )
    .join('')}</tbody></table></div>`
}

// ---------------------------------------------------------------- Datenschutzerklärung

export function datenschutzHtml(st: SeitenStand): string {
  const a = st.angaben
  const name = schulName(st)
  const ki = empfaengerAus(st.freigegeben)
  const inhalt = `
<h1>Datenschutzerklärung</h1>
<p class="leise">für die Lernplattform „Schul-Apps“${name ? ` der Schule ${esc(name)}` : ''} – Informationen nach Art. 13 und 14 DSGVO</p>

<h2>1. Verantwortlich</h2>
<p>${feld(name, 'Name der Schule')}<br>${feld(schulAnschrift(st), 'Anschrift der Schule')}${schulKontakt(st) ? `<br>${zeilen(schulKontakt(st))}` : ''}</p>
<p>Vertreten durch die Schulleitung: ${feld(a.verantwortlich, 'Name der Schulleitung')}</p>

<h2>2. Datenschutzbeauftragte bzw. Datenschutzbeauftragter</h2>
<p>${feld(a.datenschutzbeauftragte, 'Kontakt der/des Datenschutzbeauftragten')}</p>

<h2>3. Betrieb und technische Ansprechperson</h2>
<p>${feld(a.betreiber, 'Betreiber bzw. technische Ansprechperson')}</p>

<h2>4. Zwecke und Rechtsgrundlage</h2>
<p>Die Schule nutzt Schul-Apps, um Unterricht zu planen und Lernende beim Lernen zu unterstützen. Rechtsgrundlage ist die Erfüllung des
Bildungsauftrags: § 31 Niedersächsisches Schulgesetz (NSchG) in Verbindung mit Art. 6 Abs. 1 lit. e und Abs. 3 DSGVO. Eine Einwilligung ist dafür
nicht nötig; freiwillige Zusatzfunktionen (z. B. Erinnerungen per Push) werden nur auf ausdrücklichen Wunsch eingeschaltet.</p>
${pruefen(st, 'Die Rechtsgrundlage (§ 31 NSchG i. V. m. Art. 6 Abs. 1 lit. e DSGVO) und die Einordnung freiwilliger Funktionen bestätigen; ggf. Erlass zur Nutzung digitaler Lernplattformen und Beschluss der Gesamtkonferenz ergänzen.')}
<div class="tabelle"><table data-bereiche>
<thead><tr><th>Bereich</th><th>Zweck</th><th>Daten</th></tr></thead>
<tbody>${BEREICHE.map((b) => `<tr><td>${esc(b.bereich)}</td><td>${esc(b.zweck)}</td><td>${esc(b.daten)}</td></tr>`).join('')}</tbody>
</table></div>
<p>Bei Krisenhinweisen dient die Verarbeitung zusätzlich dem Schutz lebenswichtiger Interessen des Kindes (Art. 6 Abs. 1 lit. d DSGVO).</p>
${pruefen(st, 'Rechtsgrundlage der Krisenhinweise (Art. 6 Abs. 1 lit. d DSGVO, ggf. Art. 9 Abs. 2 lit. c DSGVO) und das schulische Vorgehen bei einem Hinweis (Beratungslehrkraft, Schulsozialarbeit) bestätigen.')}

<h2>5. Kategorien von Daten</h2>
<ul>
<li>Stammdaten: Name, Benutzername, Klasse bzw. Kurs, Rolle (Lehrkraft, Lernende, Gast)</li>
<li>Lern- und Leistungsdaten: Antworten, Abgaben, Ergebnisse, Lernstand, Rückmeldungen</li>
<li>Von Lernenden erstellte Inhalte: Texte, Fotos, Zeichnungen, Sprachaufnahmen in Unterrichtsreihen</li>
<li>Technische Daten: Sitzung, Gerätekennung für Erinnerungen, IP-Adresse beim Aufruf (zur Verbindung und zur Abwehr von Missbrauch), Fehlerberichte ohne Namen</li>
</ul>
<p>Namen, Benutzernamen und Klassen werden auf dem Server verschlüsselt gespeichert.</p>

<h2>6. Empfänger</h2>
<h3>Hosting</h3>
<p>${zeilen(a.hosting)}. Der Dienstleister verarbeitet die Daten im Auftrag (Art. 28 DSGVO).</p>
${pruefen(st, 'Vertrag zur Auftragsverarbeitung mit dem Hosting-Dienstleister liegt vor.')}
<h3>Anmeldung</h3>
<p>${
    st.iserv
      ? 'Die Anmeldung läuft über IServ, die Schulplattform der Schule. Schul-Apps erhält dabei Name, Benutzername und Gruppen; das Passwort sieht Schul-Apps nicht.'
      : 'Die Anmeldung über IServ ist noch nicht eingerichtet; die Anmeldung erfolgt mit Benutzername und Passwort oder mit einem Code der Lehrkraft.'
  }</p>
<h3>KI-, Sprach- und Bilddienste der Schule</h3>
<p>Diese Dienste hat die Schule auf dem Server freigegeben (Stand der Einrichtung):</p>
${empfaengerTabelle(ki)}
<p>Vor der Übermittlung an einen KI-Dienst ersetzt Schul-Apps Namen durch Kürzel; die Dienste erhalten keine Namen, Benutzernamen oder Klassen.
Die Anfragen laufen über API-Zugänge, deren Daten die Anbieter nach ihren Bedingungen nicht zum Training verwenden (bei Google nur in der
bezahlten Stufe). Lehrkräfte können außerdem eigene Zugänge nutzen
(${MOEGLICHE_KI().map(esc).join(', ')}); dann gelten dieselben Schutzregeln.</p>
<p data-drittland-hinweis><strong>Übermittlung in Drittländer:</strong> Soweit Dienste mit Sitz oder Verarbeitung in den USA genutzt werden (Sprechtraining,
gekennzeichnete Dienste oben, eigene Zugänge von Lehrkräften), erhalten sie Daten auf Grundlage des Angemessenheitsbeschlusses der EU-Kommission zum
EU-US Data Privacy Framework (Art. 45 DSGVO), soweit der Anbieter zertifiziert ist, sonst auf Grundlage von Standardvertragsklauseln (Art. 46 DSGVO).
In den USA ist ein Zugriff von Behörden nicht auszuschließen.</p>
${pruefen(st, 'Für jeden freigegebenen Dienst: Vertrag zur Auftragsverarbeitung, Zertifizierung nach dem Data Privacy Framework bzw. Standardvertragsklauseln, Datenschutz-Folgenabschätzung für den KI-Einsatz mit Daten von Lernenden.')}
<h3>Erinnerungen per Push</h3>
<p>Nur wenn Lernende Erinnerungen auf ihrem Gerät einschalten: Die Erinnerung läuft über den Push-Dienst des Browserherstellers (z. B. Apple, Google, Mozilla).
Er erhält eine Geräteadresse und den kurzen Erinnerungstext, keinen Namen.</p>

<h2>7. Einsatz von KI</h2>
<p>Schul-Apps nutzt KI, um Rückmeldungen, Lerntipps und Übungen vorzuschlagen und im Sprechtraining als Gesprächspartner. Lernende erkennen
KI-Inhalte an der Kennzeichnung „Rückmeldung der KI“ bzw. „Einschätzung der KI“; im Sprechtraining wird ausdrücklich gesagt, dass der Gesprächspartner eine KI ist
(Art. 50 KI-Verordnung).</p>
<p><strong>Keine automatisierte Entscheidung (Art. 22 DSGVO):</strong> Die KI macht nur Vorschläge. Noten und Entscheidungen trifft immer die Lehrkraft;
sie kann jede Rückmeldung der KI ändern oder verwerfen.</p>
<p><strong>Sprechtraining:</strong> Die Stimme geht während des Gesprächs live an den KI-Dienst OpenAI (USA). Der Server der Schule speichert keine
Aufnahmen. Der Text des Gesprächs dient nur der Auswertung und wird danach gelöscht; gespeichert werden Einschätzung, Kennzahlen und Tipps.</p>

<h2>8. Speicherdauer</h2>
<ul>
<li>Daten von Lernenden werden gelöscht, wenn die Person die Schule verlässt (Löschung am Ende der Schulzeit, nach einer von der Schule eingestellten Übergangsfrist).</li>
<li>Gastzugänge (Code der Lehrkraft) bestehen nur, solange die zugehörige Freigabe besteht, und werden mit ihr gelöscht.</li>
<li>Krisenhinweise: 30 Tage. Vorfälle im Sprechtraining (Art, Zeit, ein Satz): 14 Tage. Gesprächstext im Sprechtraining: nur bis zur Auswertung.</li>
<li>Datensicherungen: 14 Tage auf dem Server, dazu eine verschlüsselte Kopie auf dem Rechner des Betreibers mit derselben Frist.</li>
</ul>
${pruefen(st, 'Speicherfristen mit den Vorgaben des Landes (Aufbewahrung von Leistungsnachweisen) abgleichen und die Übergangsfrist nach dem Verlassen der Schule festlegen.')}

<h2>9. Cookies und lokaler Speicher</h2>
<p>Schul-Apps setzt nur technisch notwendige Speicher ein (§ 25 Abs. 2 Nr. 2 TDDDG): ein Sitzungs-Cookie für die Anmeldung sowie im Browser
gespeicherte Einstellungen (Darstellung, Zwischenstände beim Ausfüllen). Es gibt keine Werbe- oder Analyse-Cookies und kein Tracking.</p>

<h2>10. Rechte</h2>
<p>Betroffene Personen – bei Kindern auch die Erziehungsberechtigten – haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16),
Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20, soweit anwendbar).</p>
<p><strong>Widerspruch (Art. 21 DSGVO):</strong> Aus Gründen, die sich aus der besonderen Situation ergeben, kann der Verarbeitung widersprochen werden.
Die Schule prüft dann, ob zwingende schutzwürdige Gründe für die Verarbeitung überwiegen. Freiwillige Funktionen wie Erinnerungen lassen sich jederzeit
selbst abschalten.</p>
<p>Anfragen bitte an die Schule oder die Datenschutzbeauftragte bzw. den Datenschutzbeauftragten (Abschnitte 1 und 2).</p>

<h2>11. Beschwerderecht</h2>
<p>Es besteht das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO). Zuständig ist:</p>
<p data-aufsicht>${zeilen(a.aufsicht)}</p>

<h2>12. Pflicht zur Bereitstellung</h2>
<p>Für die Nutzung im Unterricht sind Name und Klassenzugehörigkeit nötig. Ohne sie ist eine Teilnahme über ein Konto nicht möglich; die Schule stellt dann
einen anderen Weg bereit.</p>
${a.freitext.trim() ? `<h2>13. Weitere Hinweise der Schule</h2><p data-freitext>${zeilen(a.freitext)}</p>` : ''}
<p class="leise">Kurz und einfach erklärt: <a href="/datenschutz/eltern">Fassung für Eltern</a> · <a href="/impressum">Impressum</a></p>
`
  return seite('Datenschutzerklärung', inhalt, a.geaendert)
}

// ---------------------------------------------------------------- Elternfassung

export function elternHtml(st: SeitenStand): string {
  const a = st.angaben
  const name = schulName(st)
  const ki = empfaengerAus(st.freigegeben).filter((e) => e.lernende)
  const inhalt = `
<h1>Datenschutz bei Schul-Apps – Informationen für Eltern</h1>
<p class="leise">${feld(name, 'Name der Schule')}</p>
<p class="nur-bildschirm leise">Zum Ausdrucken oder Speichern als PDF: im Browser „Drucken“ wählen (Strg+P bzw. Teilen › Drucken) und als Ziel „Als PDF speichern“.</p>

<h2>Was ist Schul-Apps?</h2>
<p>Schul-Apps ist die Lernplattform der Schule. Ihr Kind bearbeitet dort Arbeitsblätter, übt Vokabeln und Grammatik, schreibt Onlinetests und arbeitet in
Unterrichtsreihen. Verantwortlich ist die Schule; die Nutzung beruht auf dem Bildungsauftrag (§ 31 NSchG, Art. 6 Abs. 1 lit. e DSGVO).</p>

<h2>Welche Daten?</h2>
<p>Name, Klasse bzw. Kurs, Antworten und Abgaben, Ergebnisse und Lernstand. Die Lehrkräfte sehen die Arbeiten ihrer Lerngruppen, andere Kinder nicht.
Namen und Klassen liegen verschlüsselt auf einem Server in Deutschland.</p>

<h2>Künstliche Intelligenz</h2>
<p>Manche Rückmeldungen und Tipps schreibt eine KI. Sie erhält keine Namen – Schul-Apps ersetzt sie vorher durch Kürzel. Die KI macht nur Vorschläge;
Noten und Entscheidungen trifft immer die Lehrkraft. KI-Rückmeldungen sind für Ihr Kind als solche gekennzeichnet.
${ki.length ? `Derzeit freigegeben: ${ki.map((e) => `${esc(e.name)} (${esc(e.ort)})`).join('; ')}.` : 'Über die Zugänge der Schule ist derzeit kein KI-Dienst freigegeben.'}
Lehrkräfte können auch eigene Zugänge nutzen; es gelten dieselben Schutzregeln.</p>
<p>Im Sprechtraining spricht Ihr Kind live mit einer KI von OpenAI (USA). Der Server der Schule speichert keine Aufnahme; der Gesprächstext wird nach der
Auswertung gelöscht, gespeichert bleiben Einschätzung und Tipps.</p>

<h2>Wie lange?</h2>
<p>Bis Ihr Kind die Schule verlässt; danach werden die Daten nach einer kurzen Übergangsfrist gelöscht. Datensicherungen werden nach 14 Tagen überschrieben.</p>

<h2>Cookies, Erinnerungen</h2>
<p>Nur technisch notwendige Speicher für die Anmeldung und Einstellungen, keine Werbung, kein Tracking. Erinnerungen per Push gibt es nur, wenn sie auf dem
Gerät ausdrücklich eingeschaltet werden.</p>

<h2>Ihre Rechte</h2>
<p>Auskunft, Berichtigung, Löschung, Einschränkung und Widerspruch (Art. 15–21 DSGVO). Ansprechpartner: die Schule bzw. die oder der
Datenschutzbeauftragte: ${feld(a.datenschutzbeauftragte, 'Kontakt der/des Datenschutzbeauftragten')}.</p>
<p>Beschwerden: ${zeilen(a.aufsicht)}</p>
${pruefen(st, 'Inhalt dieser Elternfassung mit der vollständigen Datenschutzerklärung abgleichen.')}
<p class="leise">Ausführlich: <a href="/datenschutz">Datenschutzerklärung</a></p>
`
  return seite('Datenschutz – Fassung für Eltern', inhalt, a.geaendert)
}

// ---------------------------------------------------------------- Impressum

export function impressumHtml(st: SeitenStand): string {
  const a = st.angaben
  const inhalt = `
<h1>Impressum</h1>
<p class="leise">Angaben nach § 5 Digitale-Dienste-Gesetz und § 18 Medienstaatsvertrag</p>
<h2>Anbieter</h2>
<p>${feld(schulName(st), 'Name der Schule')}<br>${feld(schulAnschrift(st), 'Anschrift der Schule')}</p>
<p>${schulKontakt(st) ? zeilen(schulKontakt(st)) : platzhalter('Telefon und E-Mail der Schule')}</p>
<h2>Vertreten durch</h2>
<p>${feld(a.verantwortlich, 'Name der Schulleitung')}</p>
<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
<p>${feld(a.verantwortlich, 'Name und Anschrift der verantwortlichen Person')}${schulAnschrift(st) ? `<br>${zeilen(schulAnschrift(st))}` : ''}</p>
${pruefen(st, 'Verantwortliche Person nach § 18 Abs. 2 MStV benennen (meist die Schulleitung) und Angaben zum Schulträger ergänzen, falls gewünscht.')}
<h2>Technischer Betrieb</h2>
<p>${feld(a.betreiber, 'Betreiber bzw. technische Ansprechperson')}</p>
<p>Hosting: ${zeilen(a.hosting)}</p>
${a.freitext.trim() ? `<h2>Weitere Angaben</h2><p>${zeilen(a.freitext)}</p>` : ''}
<h2>Datenschutz</h2>
<p><a href="/datenschutz">Datenschutzerklärung</a> · <a href="/datenschutz/eltern">Fassung für Eltern</a></p>
`
  return seite('Impressum', inhalt, a.geaendert)
}

// ---------------------------------------------------------------- Kenntnisnahme der Kurzfassung (Lernende, Gäste)

function tabelle(): void {
  datenbank().exec(
    'CREATE TABLE IF NOT EXISTS datenschutz_kenntnis (nutzer_id TEXT PRIMARY KEY REFERENCES nutzer(id) ON DELETE CASCADE, version TEXT NOT NULL, zeit TEXT NOT NULL)'
  )
}

/** Zuletzt bestätigte Fassung der Kurzfassung (null = nie) */
export function bestaetigteFassung(nutzerId: string): string | null {
  tabelle()
  const z = datenbank().prepare('SELECT version FROM datenschutz_kenntnis WHERE nutzer_id = ?').get(nutzerId) as { version: string } | undefined
  return z?.version ?? null
}

/** „Verstanden" merken – nur die aktuelle Fassung wird angenommen */
export function kenntnisMerken(nutzerId: string, version: string, jetzt = new Date()): boolean {
  if (version !== kurzfassungVersion()) return false
  tabelle()
  datenbank()
    .prepare('INSERT INTO datenschutz_kenntnis (nutzer_id, version, zeit) VALUES (?, ?, ?) ON CONFLICT(nutzer_id) DO UPDATE SET version = excluded.version, zeit = excluded.zeit')
    .run(nutzerId, version, jetzt.toISOString())
  return true
}

// ---------------------------------------------------------------- Route

const SEITEN: Record<string, (st: SeitenStand) => string> = {
  '/datenschutz': datenschutzHtml,
  '/datenschutz/': datenschutzHtml,
  '/datenschutz/eltern': elternHtml,
  '/impressum': impressumHtml
}

export function datenschutzRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const p = url.pathname

    // Öffentliche Seiten – ohne Anmeldung
    const erzeuge = SEITEN[p]
    if (erzeuge) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return (res.writeHead(405).end('nicht erlaubt'), true)
      let html: string
      try {
        html = erzeuge(seitenStand())
      } catch {
        // Ohne lesbare Einrichtung trotzdem eine Seite (mit Platzhaltern)
        html = erzeuge({ angaben: { ...LEERE_ANGABEN }, schule: null, freigegeben: [], iserv: false })
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'content-security-policy': INFO_CSP })
      return (res.end(req.method === 'HEAD' ? undefined : html), true)
    }

    // Kurzfassung für Lernende und Gäste
    if (p === '/s/api/datenschutz/kurz') {
      if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
      const version = kurzfassungVersion()
      if (req.method === 'GET') return (json(res, 200, { version, saetze: KURZFASSUNG_SCHUELER, bestaetigt: bestaetigteFassung(sitzung.nutzer.id) }), true)
      if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
      if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      const k0 = ((await k.koerper()) ?? {}) as Record<string, unknown>
      const ok = kenntnisMerken(sitzung.nutzer.id, typeof k0.version === 'string' ? k0.version : '')
      return (json(res, ok ? 200 : 409, ok ? { ok: true, bestaetigt: version } : { fehler: 'Der Text hat sich geändert. Bitte neu laden.', version }), true)
    }

    // Angaben der Schule (Verwaltung)
    if (p === '/server/datenschutz') {
      if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
      if (sitzung.nutzer.rolle === 'schueler') return (json(res, 403, { fehler: 'Kein Zugang.' }), true)
      if (req.method === 'GET') {
        const st = seitenStand()
        return (json(res, 200, { angaben: st.angaben, schule: st.schule, empfaenger: empfaengerAus(st.freigegeben), iserv: st.iserv }), true)
      }
      if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
      if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      if (sitzung.nutzer.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)
      const angaben: DatenschutzAngaben = { ...pruefeDatenschutzAngaben(await k.koerper()), geaendert: new Date().toISOString() }
      setzeServerWert(SCHLUESSEL, angaben)
      protokolliereServer('verwaltung', 'Angaben für Datenschutz und Impressum geändert', sitzung.nutzer.id)
      return (json(res, 200, { angaben }), true)
    }
    return false
  }
}
