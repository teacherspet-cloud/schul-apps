/**
 * Informationspflichten (22.10.2026, Prüfung des Schulträgers, Punkt 6: Art. 13 DSGVO, § 18 MStV, Art. 50 KI-VO).
 *
 * Gemeinsam für Server (src/server/datenschutzSeiten.ts) und Oberfläche:
 * - Angaben der Schule für Datenschutzerklärung und Impressum (Verwaltung › Schule › „Datenschutz und Impressum"),
 *   gespeichert in server_einstellungen unter 'datenschutz-angaben'.
 * - Kurzfassung für Lernende („du", kindgerecht) mit Fassungskennung: Ändert sich der Text, erscheint sie wieder.
 *   Sie ist eine INFORMATION, keine Einwilligung – „Verstanden" merkt nur, dass sie gezeigt wurde.
 * - Kennzeichnung von KI-Rückmeldungen für Lernende (Art. 50 KI-VO).
 *
 * Bewusst ohne Importe aus Node: auch die Oberfläche liest diese Datei.
 */

/** Aufsichtsbehörde in Niedersachsen (Vorgabe, änderbar) */
export const AUFSICHT_NIEDERSACHSEN =
  'Die Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover, poststelle@lfd.niedersachsen.de'

/** Hosting (Vorgabe, änderbar): der Server der Schul-Apps */
export const HOSTING_VORGABE = 'STRATO GmbH (IONOS-Gruppe), Berlin – Server und Datensicherung in Rechenzentren in Deutschland'

export interface DatenschutzAngaben {
  /** Name der Schule (leer: aus der Schul-Einrichtung) */
  schuleName: string
  /** Anschrift (mehrzeilig; leer: aus der Schul-Einrichtung) */
  schuleAnschrift: string
  /** Verantwortlich: Schulleitung (Name, Funktion) */
  verantwortlich: string
  /** Kontakt der/des Datenschutzbeauftragten (mehrzeilig) */
  datenschutzbeauftragte: string
  /** Betreiber / technischer Ansprechpartner (mehrzeilig) */
  betreiber: string
  /** Hosting-Dienstleister */
  hosting: string
  /** Zuständige Aufsichtsbehörde */
  aufsicht: string
  /** Freier Zusatztext (erscheint in Datenschutzerklärung und Impressum) */
  freitext: string
  /** Die Schule hat die markierten Stellen geprüft – die gelben Prüfhinweise entfallen */
  geprueft: boolean
  /** Zuletzt geändert (ISO) */
  geaendert?: string
}

export const LEERE_ANGABEN: DatenschutzAngaben = {
  schuleName: '',
  schuleAnschrift: '',
  verantwortlich: '',
  datenschutzbeauftragte: '',
  betreiber: '',
  hosting: HOSTING_VORGABE,
  aufsicht: AUFSICHT_NIEDERSACHSEN,
  freitext: '',
  geprueft: false
}

/** Grenzen je Feld (Zeichen) */
const GRENZE: Record<Exclude<keyof DatenschutzAngaben, 'geprueft' | 'geaendert'>, number> = {
  schuleName: 150,
  schuleAnschrift: 300,
  verantwortlich: 300,
  datenschutzbeauftragte: 400,
  betreiber: 400,
  hosting: 300,
  aufsicht: 300,
  freitext: 4000
}

/** Text mit Zeilenumbrüchen: Steuerzeichen raus (außer \n), Zeilen getrimmt, höchstens drei Leerzeilen am Stück */
const mehrzeilig = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v
        .replace(/\r\n?/g, '\n')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
        .split('\n')
        .map((z) => z.replace(/\s+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, max)
    : ''

/** Prüft und bereinigt die Angaben aus dem Formular; leere Aufsicht/Hosting fallen auf die Vorgabe zurück */
export function pruefeDatenschutzAngaben(roh: unknown): DatenschutzAngaben {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const aus = { ...LEERE_ANGABEN }
  for (const k of Object.keys(GRENZE) as (keyof typeof GRENZE)[]) aus[k] = mehrzeilig(r[k], GRENZE[k])
  aus.schuleName = aus.schuleName.replace(/\n/g, ' ')
  if (!aus.aufsicht) aus.aufsicht = AUFSICHT_NIEDERSACHSEN
  if (!aus.hosting) aus.hosting = HOSTING_VORGABE
  aus.geprueft = r.geprueft === true
  return aus
}

// ---------------------------------------------------------------- Kurzfassung für Lernende

/**
 * 6–10 kurze Einträge, kindgerecht, mit „du". Nachgeschärft (23.10.2026, Nachprüfung des Schulträgers): Spiele zu zweit,
 * Aufsichtsvermerke, Bilder/Stimme trotz Namensersatz, Sprechtraining (Moderation, ein Satz 14 Tage), Krisenhinweise.
 */
export const KURZFASSUNG_SCHUELER: string[] = [
  'Schul-Apps ist die Lernplattform deiner Schule. Deine Schule ist dafür verantwortlich, was mit deinen Daten passiert.',
  'Gespeichert wird, was du zum Lernen brauchst: dein Name, deine Klasse, deine Antworten und dein Lernstand. In Onlinetests merkt sich die App auch, wenn du die Seite verlässt oder etwas einfügst.',
  'Deine Lehrkräfte sehen deine Antworten und Ergebnisse, andere Kinder nicht. Nur bei Spielen zu zweit sehen die anderen deinen Kurznamen, deine Spielzüge und Punkte; bei der Partnerarbeit im Unterricht sehen sie nur ein Tiersymbol, deine Lehrkraft die Einteilung.',
  'Manche Rückmeldungen schreibt eine KI. Namen in deinem Text werden vorher ersetzt – auf Fotos und in deiner Stimme geht das nicht, also fotografiere keine Menschen und nenne keine Namen.',
  'Noten gibt nur deine Lehrkraft. Die KI macht Vorschläge.',
  'Beim Sprechtraining sprichst du live mit einer KI von OpenAI in den USA; OpenAI prüft dabei, ob etwas Unangemessenes gesagt wird. Eine Aufnahme wird nicht gespeichert, nur deine Punkte und Tipps – sagst du etwas Unangemessenes, bleibt genau dieser Satz 14 Tage für deine Lehrkraft.',
  'Wenn du schreibst oder sagst, dass es dir sehr schlecht geht, zeigt dir die App, wo du Hilfe bekommst, und deine Lehrkraft bekommt einen vertraulichen Hinweis – ohne deine Worte.',
  'Wenn du die Schule verlässt, werden deine Daten gelöscht.',
  'Du darfst fragen, was über dich gespeichert ist. Frag deine Lehrkraft oder die Datenschutzbeauftragte bzw. den Datenschutzbeauftragten deiner Schule.',
  'Alles Genaue steht in der Datenschutzerklärung.'
]

/** Kleine Prüfsumme (djb2) – ohne Node-Krypto, damit auch die Oberfläche sie rechnen kann */
function pruefsumme(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** Fassung der Kurzfassung: ändert sich mit jedem Wort des Textes */
export const kurzfassungVersion = (saetze: string[] = KURZFASSUNG_SCHUELER): string => `k1-${pruefsumme(saetze.join('\n'))}`

/** Lage für die Entscheidung „Kurzfassung von selbst zeigen?" */
export interface KurzfassungLage {
  ich?: { angemeldet?: boolean; rolle?: string; quelle?: string; vorschau?: boolean } | null
  /** Pfad der Seite (im laufenden Onlinetest nie) */
  pfad: string
  /** Vom Server: zuletzt bestätigte Fassung (null = nie) – undefined, solange nicht geladen */
  bestaetigt: string | null | undefined
  aktuell: string
  /** Browser unter Fernsteuerung (Browsertests): nur mit eigener Freigabe im Gerät */
  automatisiert?: boolean
  e2e?: boolean
}

/** Onlinetest (/s/t/…) und gemeinsames Spiel nicht unterbrechen */
const NICHT_UNTERBRECHEN = /^\/s\/(?:t|sp|pa)\//

export function kurzfassungZeigen(l: KurzfassungLage): boolean {
  const ich = l.ich
  if (!ich?.angemeldet) return false
  if (ich.vorschau || ich.quelle === 'vorschau') return false
  if (ich.rolle === 'lehrkraft' || ich.rolle === 'admin') return false
  if (l.bestaetigt === undefined) return false
  if (l.bestaetigt === l.aktuell) return false
  if (l.automatisiert && !l.e2e) return false
  return !NICHT_UNTERBRECHEN.test(l.pfad)
}

// ---------------------------------------------------------------- KI-Kennzeichnung (Art. 50 KI-VO)

/** Kennzeichnung an KI-Rückmeldungen für Lernende */
export const KI_MARKE = {
  rueckmeldung: 'Rückmeldung der KI – deine Lehrkraft kann sie ändern',
  einschaetzung: 'Einschätzung der KI – keine Note, deine Lehrkraft entscheidet',
  impuls: 'Von der KI geschrieben – deine Lehrkraft sieht deinen Eintrag',
  tipp: 'Von der KI geschrieben'
} as const

export type KiMarkeArt = keyof typeof KI_MARKE
