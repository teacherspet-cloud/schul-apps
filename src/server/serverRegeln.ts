/**
 * Reiter „Server" der Verwaltung (09.10.2026): reine Regeln ohne Datenbank und ohne Dateien – damit testbar
 * (tests/serverZustand.test.ts). Gesammelt und gespeichert wird in serverZustand.ts, Sicherungen in sicherungen.ts.
 *
 *  - `gesundheitPruefen`: Ampel oben im Reiter – „Alles in Ordnung" oder was zu tun ist, in einfachen Worten.
 *  - `verdichten`: 5-Minuten-Messwerte zu Stundenmitteln (Ansicht „7 Tage").
 *  - `tageAuffuellen`: Tageszahlen der letzten n Tage, fehlende Tage als 0.
 *  - `fehlerGruppieren`: gleiche Meldungen zusammenfassen (Anzahl, zuletzt) mit Hinweis, wo er naheliegt.
 */

export type Stufe = 'ok' | 'hinweis' | 'warnung' | 'kritisch'

export interface Befund {
  stufe: Stufe
  /** kurze Aussage, z. B. „Der Arbeitsspeicher ist fast voll (86 %)." */
  titel: string
  /** was zu tun ist */
  tun: string
}

export interface GesundheitsWerte {
  /** belegter Arbeitsspeicher 0–1 (Container, sonst ganzes System) */
  speicherAnteil: number | null
  /** freier Platz auf der Platte 0–1 */
  platteFrei: number | null
  /** Tage bis zum Ablauf des Zertifikats (kleinster Wert), null = keins gefunden */
  zertifikatTage: number | null
  /** Alter der neuesten Sicherung in Stunden, null = keine Sicherung */
  sicherungStunden: number | null
  /** Fehler in den letzten 24 Stunden */
  fehler24h: number
  /** Anfragen über 1 Sekunde in den letzten 24 Stunden */
  langsam24h: number
  /** Anfragen in den letzten 24 Stunden (für den Anteil der langsamen) */
  anfragen24h: number
}

export const GRENZEN = {
  speicher: 0.8,
  speicherKritisch: 0.92,
  platteFrei: 0.15,
  platteKritisch: 0.05,
  zertifikatTage: 14,
  zertifikatKritisch: 3,
  sicherungStunden: 36,
  fehler24h: 20,
  langsam24h: 30,
  langsamAnteil: 0.05
}

const pz = (x: number): string => `${Math.round(x * 100)} %`

/** Ampel: leer heißt „Alles in Ordnung" */
export function gesundheitPruefen(w: GesundheitsWerte): Befund[] {
  const aus: Befund[] = []
  if (w.speicherAnteil !== null && w.speicherAnteil > GRENZEN.speicher)
    aus.push({
      stufe: w.speicherAnteil > GRENZEN.speicherKritisch ? 'kritisch' : 'warnung',
      titel: `Der Arbeitsspeicher ist fast voll (${pz(w.speicherAnteil)}).`,
      tun: 'Hält das an, den Server zu einer ruhigen Zeit neu starten (nicht im Unterricht). Wiederholt es sich, mehr Speicher für den Container einplanen.'
    })
  if (w.platteFrei !== null && w.platteFrei < GRENZEN.platteFrei)
    aus.push({
      stufe: w.platteFrei < GRENZEN.platteKritisch ? 'kritisch' : 'warnung',
      titel: `Auf der Platte ist nur noch ${pz(w.platteFrei)} frei.`,
      tun: 'Alte Sicherungen außerhalb des Servers ablegen und hier löschen oder die Platte vergrößern. Unter „Platz“ steht, was am meisten belegt.'
    })
  if (w.zertifikatTage !== null && w.zertifikatTage < GRENZEN.zertifikatTage)
    aus.push({
      stufe: w.zertifikatTage < GRENZEN.zertifikatKritisch ? 'kritisch' : 'warnung',
      titel: w.zertifikatTage < 0 ? 'Das Zertifikat ist abgelaufen – Browser warnen vor der Seite.' : `Das Zertifikat läuft in ${Math.max(0, Math.floor(w.zertifikatTage))} Tagen ab.`,
      tun: 'Die automatische Verlängerung (Let’s Encrypt, schul-apps-zertifikat.sh) auf dem Server prüfen und den Container danach neu starten.'
    })
  if (w.sicherungStunden === null)
    aus.push({ stufe: 'warnung', titel: 'Es gibt noch keine Sicherung der Datenbank.', tun: '„Sicherung jetzt anlegen“ wählen und die nächtliche Sicherung auf dem Server einrichten.' })
  else if (w.sicherungStunden > GRENZEN.sicherungStunden)
    aus.push({
      stufe: w.sicherungStunden > 24 * 7 ? 'kritisch' : 'warnung',
      titel: `Die letzte Sicherung ist ${w.sicherungStunden >= 48 ? `${Math.floor(w.sicherungStunden / 24)} Tage` : `${Math.floor(w.sicherungStunden)} Stunden`} alt.`,
      tun: 'Die nächtliche Sicherung auf dem Server prüfen (cron) – bis dahin „Sicherung jetzt anlegen“.'
    })
  if (w.fehler24h >= GRENZEN.fehler24h)
    aus.push({
      stufe: w.fehler24h >= GRENZEN.fehler24h * 5 ? 'kritisch' : 'warnung',
      titel: `In den letzten 24 Stunden gab es ${w.fehler24h} Fehler.`,
      tun: 'Unter „Fehler“ steht, welche Meldung sich häuft und was meist dahintersteckt.'
    })
  const anteil = w.anfragen24h ? w.langsam24h / w.anfragen24h : 0
  if (w.langsam24h >= GRENZEN.langsam24h && anteil >= GRENZEN.langsamAnteil / 5)
    aus.push({
      stufe: anteil >= GRENZEN.langsamAnteil ? 'warnung' : 'hinweis',
      titel: `${w.langsam24h} Anfragen brauchten in den letzten 24 Stunden länger als 1 Sekunde.`,
      tun: 'Meist eine kurze Spitze (viele gleichzeitig, KI-Aufträge). Häuft es sich zu Unterrichtszeiten, die Auslastung im Verlauf ansehen.'
    })
  const rang: Record<Stufe, number> = { kritisch: 0, warnung: 1, hinweis: 2, ok: 3 }
  return aus.sort((a, b) => rang[a.stufe] - rang[b.stufe])
}

/** Schlimmste Stufe der Befunde */
export const gesamtStufe = (b: Befund[]): Stufe => b[0]?.stufe ?? 'ok'

// ---------------------------------------------------------------- Verlauf

export interface Messwert {
  /** Zeit in ms */
  zeit: number
  /** Last der Prozessoren 0–1 (Last-Mittel einer Minute je Kern) */
  cpu: number
  /** belegter Arbeitsspeicher des Systems 0–1 */
  system: number
  /** Arbeitsspeicher von Schul-Apps 0–1 (am Container-Limit, sonst am ganzen System) */
  prozess: number
  /** Arbeitsspeicher von Schul-Apps in Byte */
  prozessByte: number
}

/** Messwerte zu Mitteln je `schritt` ms (Ansicht „7 Tage": Stunden) – Zeit = Anfang des Abschnitts */
export function verdichten(werte: Messwert[], schritt: number): Messwert[] {
  const gruppen = new Map<number, Messwert[]>()
  for (const w of werte) {
    const k = Math.floor(w.zeit / schritt) * schritt
    const g = gruppen.get(k)
    if (g) g.push(w)
    else gruppen.set(k, [w])
  }
  const mittel = (g: Messwert[], f: (w: Messwert) => number): number => g.reduce((s, w) => s + f(w), 0) / g.length
  return [...gruppen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([zeit, g]) => ({ zeit, cpu: mittel(g, (w) => w.cpu), system: mittel(g, (w) => w.system), prozess: mittel(g, (w) => w.prozess), prozessByte: mittel(g, (w) => w.prozessByte) }))
}

// ---------------------------------------------------------------- Tageszahlen

/** Kalendertag JJJJ-MM-TT (UTC – wie die Zeitstempel im Protokoll) */
export const tagVon = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Die letzten `tage` Tage bis heute (älteste zuerst), fehlende Werte 0 */
export function tageAuffuellen<T extends Record<string, number>>(werte: Map<string, Partial<T>>, heute: number, tage: number, leer: T): ({ tag: string } & T)[] {
  const aus: ({ tag: string } & T)[] = []
  for (let i = tage - 1; i >= 0; i--) {
    const tag = tagVon(heute - i * 864e5)
    aus.push({ tag, ...leer, ...(werte.get(tag) ?? {}) })
  }
  return aus
}

// ---------------------------------------------------------------- Fehler

export interface FehlerZeile {
  /** ISO-Zeit */
  zeit: string
  quelle: 'server' | 'browser' | 'protokoll'
  text: string
}

export interface FehlerGruppe {
  meldung: string
  quelle: FehlerZeile['quelle']
  anzahl: number
  zuletzt: string
  hinweis: string
}

/** Häufige Meldungen und was meist dahintersteckt */
const HINWEISE: [RegExp, string][] = [
  [/ENOSPC|no space left/i, 'Die Platte ist voll – Platz schaffen (alte Sicherungen, Medien).'],
  [/ENOMEM|heap out of memory|Allocation failed/i, 'Der Arbeitsspeicher reichte nicht – Verlauf der Auslastung ansehen, ggf. neu starten.'],
  [/SQLITE_BUSY|database is locked/i, 'Die Datenbank war kurz belegt (z. B. während einer Sicherung). Einzelne Fälle sind harmlos.'],
  [/SQLITE_CORRUPT|malformed/i, 'Die Datenbank meldet einen Schaden – sofort eine Sicherung anlegen und die letzte gute Sicherung bereithalten.'],
  [/ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i, 'Der Browser hatte noch eine alte Fassung der App. Neu laden behebt es; tritt nach jedem Aufspielen kurz auf.'],
  [/ResizeObserver loop/i, 'Harmlose Meldung des Browsers – nichts zu tun.'],
  [/^Script error\.?$|\| Script error/i, 'Fehler in einem fremden Skript ohne Einzelheiten (Browser-Erweiterung o. Ä.) – meist harmlos.'],
  [/\b(429|rate.?limit|quota|insufficient_quota|Kontingent)\b/i, 'Das KI-Kontingent oder die Anfragegrenze des Anbieters ist erreicht – Guthaben bzw. Abo des Schlüssels prüfen.'],
  [/\b(401|invalid.?api.?key|unauthori[sz]ed)\b/i, 'Ein Zugang wurde abgelehnt – Schlüssel unter „KI-Zugänge“ prüfen.'],
  [/ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up|network/i, 'Die Verbindung zu einem Dienst (KI-Anbieter, IServ) brach ab. Einzelne Fälle sind normal; viele deuten auf eine Störung beim Anbieter.'],
  [/Anmeldung mit Passwort fehlgeschlagen/i, 'Falsches Passwort eingegeben. Nur bei auffälliger Häufung prüfen (Konto wird nach mehreren Versuchen kurz gesperrt).'],
  [/IServ/i, 'Betrifft die Anmeldung über IServ – Einstellungen unter „IServ-Anbindung“ prüfen.'],
  [/KI-Auswertung fehlgeschlagen|Feedback fehlgeschlagen|KI-Vorschlag .* nicht möglich/i, 'Eine KI-Antwort kam nicht zustande – meist Anbieter oder Kontingent; die Lehrkraft kann es erneut versuchen.']
]

export const fehlerHinweis = (text: string): string => HINWEISE.find(([m]) => m.test(text))?.[1] ?? ''

/** Gleiche Meldung = gleich nach Entfernen von Zahlen, Kennungen, Pfadteilen mit Kennungen und Zeiten */
export function fehlerSchluessel(text: string): string {
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, '')
    .replace(/\b[0-9a-f]{8,}\b/gi, '…')
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** Fehlerzeilen nach Meldung zusammenfassen – häufigste zuerst, bei Gleichstand die jüngste */
export function fehlerGruppieren(zeilen: FehlerZeile[], max = 30): FehlerGruppe[] {
  const gruppen = new Map<string, FehlerGruppe>()
  for (const z of zeilen) {
    const k = `${z.quelle}|${fehlerSchluessel(z.text)}`
    const g = gruppen.get(k)
    if (g) {
      g.anzahl++
      if (z.zeit > g.zuletzt) (g.zuletzt = z.zeit), (g.meldung = z.text)
    } else gruppen.set(k, { meldung: z.text, quelle: z.quelle, anzahl: 1, zuletzt: z.zeit, hinweis: fehlerHinweis(z.text) })
  }
  return [...gruppen.values()].sort((a, b) => b.anzahl - a.anzahl || b.zuletzt.localeCompare(a.zuletzt)).slice(0, max)
}

/** Diagnosezeile „<ISO> <Text>" zerlegen; Zeilen ohne Zeitstempel bekommen '' */
export function diagnoseZeile(z: string): { zeit: string; text: string } {
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/.exec(z)
  return m ? { zeit: m[1], text: m[2] } : { zeit: '', text: z }
}

/** Ist eine Zeile aus langsam.log ein Fehler (nicht nur langsam)? „FEHLER …" oder Status 5xx */
export const istServerFehler = (text: string): boolean => /^FEHLER\b/.test(text) || /^\d+ ms \S+ \S+ 5\d\d$/.test(text)

/** Protokolleinträge, die einen Fehlschlag melden */
export const istProtokollFehler = (text: string): boolean => /fehlgeschlagen|nicht möglich|nicht angelegt|nicht verknüpft|Fehler/i.test(text)

// ---------------------------------------------------------------- Sicherungen

/** Von Schul-Apps (oder der nächtlichen Sicherung) angelegte Sicherungen im Ordner sicherungen/ */
export const SICHERUNGS_DATEI = /^schulapps-[\w.-]*\.db(\.gz)?$/

/** Welche Sicherungen über die neuesten `behalten` hinausgehen (nach Zeit, neueste zuerst behalten) */
export function zuEntfernen(dateien: { name: string; zeit: number }[], behalten: number): string[] {
  return dateien
    .filter((d) => SICHERUNGS_DATEI.test(d.name))
    .sort((a, b) => b.zeit - a.zeit || b.name.localeCompare(a.name))
    .slice(behalten)
    .map((d) => d.name)
}
