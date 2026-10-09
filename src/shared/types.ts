// Typen, die Main-Prozess, Preload und Oberfläche gemeinsam nutzen.

export const CEFR_SCALE = ['Pre-A1', 'A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2'] as const
export type CefrLevel = (typeof CEFR_SCALE)[number]

export function cefrIndex(level: CefrLevel): number {
  return CEFR_SCALE.indexOf(level)
}

// ---------- Einstellungen ----------

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

export type AiProviderId = 'openai' | 'anthropic' | 'google'
export type ImageProviderId = 'openai' | 'google' | 'anthropic' | 'none'
export type SecretName = AiProviderId | 'pixabay' | 'elevenlabs' | 'iserv'
export type ModelKind = 'text' | 'image'

export interface AiProviderInfo {
  id: AiProviderId
  label: string
  keyUrl: string
  keyPlaceholder: string
  supportsImages: boolean
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    keyUrl: 'platform.openai.com',
    keyPlaceholder: 'sk-…',
    supportsImages: true
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    keyUrl: 'platform.claude.com',
    keyPlaceholder: 'sk-ant-…',
    supportsImages: false
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    keyUrl: 'aistudio.google.com',
    keyPlaceholder: 'AIza…',
    supportsImages: true
  }
]

/** Zugang zur KI: bezahlter API-Schlüssel oder privates Abo über das Kommandozeilenprogramm des Anbieters. */
export type AiAccess = 'api' | 'subscription'

export interface SubscriptionInfo {
  provider: AiProviderId
  /** Name des Abos, z. B. „ChatGPT Plus/Pro" */
  plan: string
  /** Name des Kommandozeilenprogramms */
  program: string
  command: string
  /** Ungefähre Downloadgröße in MB */
  downloadMb: number
  /** Anbieterkonto, mit dem man sich anmeldet */
  account: string
  /** Was beim Abo-Zugang für Bilder gilt */
  imageNote: string
  /** Hinweis zu den Nutzungsbedingungen (Stand der Prüfung) */
  termsWarning: string
  termsUrl: string
  /** Noch nicht mit echtem Konto getestet */
  experimental?: boolean
}

export const SUBSCRIPTIONS: Record<AiProviderId, SubscriptionInfo> = {
  openai: {
    provider: 'openai',
    plan: 'ChatGPT Plus/Pro',
    program: 'Codex CLI',
    command: 'codex',
    downloadMb: 140,
    account: 'ChatGPT',
    termsWarning:
      'OpenAI empfiehlt für automatisierte Nutzung einen API-Schlüssel. Die Nutzung von Codex mit ChatGPT-Anmeldung durch andere Programme ist nach aktuellem Stand geduldet, aber nicht vertraglich zugesichert. Es gelten die Nutzungsgrenzen des Abos (pro 5 Stunden und pro Woche).',
    termsUrl: 'https://learn.chatgpt.com/docs/auth',
    imageNote:
      'Bilder entstehen mit der Bildgenerierung von ChatGPT (Fotos und Zeichnungen). Ein Bild dauert etwa eine halbe Minute und zählt deutlich stärker auf das Kontingent als Text.'
  },
  anthropic: {
    provider: 'anthropic',
    plan: 'Claude Pro/Max',
    program: 'Claude Code',
    command: 'claude',
    downloadMb: 230,
    account: 'Claude',
    termsWarning:
      'Laut Anthropic ist die Abo-Anmeldung für die gewöhnliche Nutzung von Claude Code gedacht; Programme, die Anfragen über ein Pro- oder Max-Abo leiten, sind nicht vorgesehen. Anthropic behält sich vor, dagegen ohne Vorwarnung vorzugehen (z. B. Einschränkung des Kontos). Die Nutzung teilt sich das Kontingent mit claude.ai.',
    termsUrl: 'https://code.claude.com/docs/en/legal-and-compliance',
    imageNote:
      'Claude kann keine Fotos erzeugen, zeichnet aber einfache Vektorgrafiken (SVG) – gut geeignet für Piktogramme und Symbole, weniger für realistische Motive.'
  },
  google: {
    provider: 'google',
    plan: 'Google AI Pro/Ultra',
    program: 'Antigravity CLI',
    command: 'agy',
    downloadMb: 200,
    account: 'Google',
    termsWarning:
      'Die Nutzungsbedingungen von Antigravity untersagen den Zugriff über Software Dritter; Google hat deswegen bereits Konten gesperrt. Die Nutzung erfolgt ausdrücklich auf eigenes Risiko. Die Anbindung ist experimentell und wurde ohne Google-Konto nur nach Dokumentation umgesetzt.',
    termsUrl: 'https://antigravity.google/terms/',
    imageNote: 'Bilder entstehen mit der Bildgenerierung von Antigravity. Experimentell: ohne Google-Konto nicht getestet.',
    experimental: true
  }
}

/** Fortschritt bei Einrichtung und Anmeldung (vom Hauptprozess an die Oberfläche) */
export interface SetupEvent {
  provider: AiProviderId
  type: 'progress' | 'installed' | 'login-url' | 'logged-in' | 'error'
  message: string
  received?: number
  total?: number
  /** Anmeldeseite, falls sich der Browser nicht selbst öffnet */
  url?: string
  /** Die Anmeldeseite zeigt einen Code, der in der App eingefügt wird */
  needsCode?: boolean
}

export interface SubscriptionStatus {
  provider: AiProviderId
  /** Gefundenes Programm (Pfad) oder null */
  path: string | null
  /** Von der App selbst eingerichtet (kann aktualisiert werden) */
  managed?: boolean
  version?: string
  /** true/false, wenn prüfbar; null, wenn das Programm keine Prüfung anbietet */
  loggedIn: boolean | null
  account?: string
  detail?: string
  /** Tarif des angemeldeten Kontos (z. B. „free", „plus", „pro", „max"), soweit lesbar (03.10.2026) */
  tarif?: string
  /** Deutliche Warnung, z. B. bei einem kostenlosen Konto (keine Bilder, nur Ersatzmodelle) */
  warnung?: string
}

export interface ModelOption {
  id: string
  label: string
  /** Neuestes/empfohlenes Modell dieses Anbieters */
  recommended?: boolean
}

export interface ModelListResult {
  provider: AiProviderId
  kind: ModelKind
  models: ModelOption[]
  /** Zeitpunkt der letzten erfolgreichen Abfrage beim Anbieter */
  fetchedAt?: string
  source: 'live' | 'cache' | 'builtin'
  error?: string
}

export type CitationStyle = 'deutsch' | 'mla' | 'apa' | 'chicago'

export type ColorSchemeSetting = 'light' | 'dark' | 'auto'

export interface AppSettings {
  ai: {
    textProvider: AiProviderId
    textModels: Record<AiProviderId, string>
    imageProvider: ImageProviderId
    imageModels: { openai: string; google: string }
    /** API-Schlüssel oder Abo für Bilder (Claude zeichnet Vektorgrafiken) */
    imageAccess: Record<Exclude<ImageProviderId, 'none'>, AiAccess>
    /** Automatisch immer das empfohlene (neueste) Modell verwenden */
    autoLatest: boolean
    /** API-Schlüssel oder Abo je Anbieter */
    access: Record<AiProviderId, AiAccess>
    /** Modell beim Abo-Zugang ('' = Voreinstellung des Programms) */
    subscriptionModels: Record<AiProviderId, string>
    /** Hinweis zu den Nutzungsbedingungen bestätigt */
    subscriptionAccepted: Record<AiProviderId, boolean>
    /** Optional: Pfad zum Kommandozeilenprogramm, falls es nicht automatisch gefunden wird */
    cliPaths: Record<AiProviderId, string>
    /** Sparmodus: weniger KI-Anfragen (auto = nur beim Abo-Zugang) */
    economy: 'auto' | 'on' | 'off'
    /**
     * Blindprobe für Ankreuzfragen zu Texten (01.10.2026): eine zweite Anfrage beantwortet die
     * Fragen ohne den Text; Lösbares wird neu gefasst. Fehlt der Wert, ist sie an.
     */
    mcBlindprobe?: boolean
  }
  appearance: {
    colorScheme: ColorSchemeSetting
    theme: string
    /** Dunkel als Vorgabe übernommen (05.10.2026): einmalig „automatisch" → „dunkel", danach gilt die eigene Wahl */
    dunkelVorgabe?: boolean
  }
  schoolName: string
  defaults: {
    stateId: string
    schoolTypeId: string
    targetLanguage: string
    /**
     * Abitur an der eigenen Schule nach Klasse 12 (G8) oder 13 (G9); 'land' = wie im Land üblich.
     * Für Länder im Übergang und Schulen mit eigener Wahl – bestimmt, ob Klasse 10 schon zur
     * Einführungsphase gehört und gesiezt wird (didactics/bildungsgang.ts).
     */
    abiturNach?: 'land' | 'G8' | 'G9'
  }
  /** Hörtexte: voreingestellte Stimmen je Sprache (ElevenLabs-Kennungen) */
  audio: {
    voices: Record<string, string>
  }
  /**
   * Notenschlüssel als Prozentschwellen für die Noten 1 bis 5 (6 gilt darunter).
   *
   * `allgemein` ist die Voreinstellung für alle Fächer. `jeFach` überschreibt sie für
   * einzelne – das ist kein Luxus: Fachkonferenzen legen Schlüssel fachweise fest, und in
   * den Fremdsprachen sind andere Schwellen üblich als in Mathematik.
   */
  gradeScale: {
    allgemein: number[]
    jeFach: Record<string, number[]>
  }
  /**
   * Korrekturzeichen für die Rückmeldung (29.09.2026) je Fachgruppe (deutsch, fremdsprache,
   * mathematik, naturwissenschaft, gesellschaft, allgemein). Fehlt eine Gruppe, gilt die
   * Voreinstellung aus renderer/shared/korrekturzeichen.ts.
   */
  korrekturzeichen?: Record<string, { zeichen: string; bedeutung: string }[]>
  /**
   * Zeitform in Protokollen, wie sie die Fachschaft festgelegt hat (29.09.2026) – gilt ab
   * Klasse 7 als Vorschlag; leer = Präsens mit man/Passiv (didactics/protokoll.ts).
   */
  protokollStil?: 'ichwir' | 'praesens' | 'praeteritum' | ''
  /**
   * Anteil des Schreibteils an der Note in den modernen Fremdsprachen, wie ihn die Fachschaft
   * festgelegt hat (29.09.2026) – je Fach (Kennung) für Klasse 5 und ab Klasse 6. Fehlt ein Fach,
   * gilt die bisherige Voreinstellung 60 / 70 % (in den Kerncurricula nicht belegt, eher
   * Fachkonferenzbeschluss – recherche/klassenarbeiten-pruefung-vorhandene-faecher-2026-09-29.md).
   */
  schreibanteil?: Record<string, { k5: number; ab6: number }>
  /** Maskottchen (26.09.2026): bis zu welcher Klasse Illustrationen gelten, und die Standardfigur */
  illustrationen?: { bisKlasse: number; standardId?: string }
  /**
   * Fachfarben (Paket 10a): eigene Wahl der Lehrkraft je Fach (Kennung → #rrggbb). Fehlt ein
   * Fach oder steht dort '', gilt der Vorschlag aus renderer/shared/fachfarben.ts – so kommen
   * neue Vorschläge auch bei bestehenden Einstellungen an.
   */
  fachfarben?: Record<string, string>
  /**
   * Unterrichtete Fächer der Lehrkraft (Paket 12; Kennungen aus arbeitsblatt/model/subjects.ts).
   * Sie stehen in jeder Fachauswahl oben, und Programme, die zu keinem davon passen, werden
   * ausgeblendet (renderer/shared/programmSichtbarkeit.ts). Leer oder fehlend = alles sichtbar.
   */
  eigeneFaecher?: string[]
  /**
   * Bedienung (07.10.2026): „standard" blendet Feineinstellungen aus (renderer/shared/components/NurExperte.tsx),
   * „experte" zeigt alles wie bisher. Fehlt das Feld (bestehende Installationen), gilt „experte" – nichts verschwindet
   * plötzlich; die Einrichtung neuer Nutzer setzt „standard". Umschalter in der linken Leiste.
   */
  oberflaeche?: 'standard' | 'experte'
  /**
   * „Programme anzeigen": eigene Wahl je Programm, geht der Regel nach Fächern vor
   * (true = immer zeigen, false = immer ausblenden; fehlt = nach den eigenen Fächern). Ein
   * mitgeschicktes null nimmt die Festlegung zurück – der Hauptprozess löscht den Eintrag.
   */
  programmeAnzeigen?: Record<string, boolean | null>
  /** Angaben zur Schule (Name, Logo) auf den Materialien abdrucken */
  showSchool: boolean
  /** Nach welchem Regelwerk Quellen auf den Materialien angegeben werden */
  citationStyle: CitationStyle
  /**
   * Zeitpunkt der letzten gespeicherten Sicherung (ISO). Die Startseite erinnert daran, wenn
   * sie lange zurückliegt – eine Sicherung, an die niemand denkt, fehlt genau dann, wenn der
   * Rechner ausfällt.
   */
  letzteSicherung?: string
  /** Sichtbarer KI-Vermerk auf neuen Materialien (fehlt = nur im Lösungsteil); maschinenlesbar gekennzeichnet wird immer */
  kiVermerk?: 'loesung' | 'ueberall' | 'aus'
  /**
   * Datenschutz (Großprogramm 0.4): Hinweis vor dem ersten Hochladen an eine KI bestätigt (Datum),
   * und ob Namen vor dem Senden durch Kürzel ersetzt werden (fehlt = ja).
   */
  datenschutz?: { hinweisBestaetigt?: string; namenErsetzen?: boolean }
  /**
   * Briefkopf (29.09.2026): Absender der Elternbriefe. Straße, PLZ, Ort und Telefon kommen bei der
   * Schulwahl aus dem Schulverzeichnis und bleiben änderbar; `zertifikat` = Pfad einer .pfx/.p12-Datei
   * zum digitalen Signieren der Brief-PDFs (das Passwort wird nie gespeichert).
   */
  briefkopf?: { lehrkraft?: string; strasse?: string; plz?: string; ort?: string; telefon?: string; zertifikat?: string; signieren?: boolean }
  /** Automatische Sicherung (27.09.2026): an/aus (fehlt = an), zusätzlicher Ordner, Zahl der Stände */
  sicherung?: { automatisch?: boolean; ordner?: string; behalten?: number }
  /**
   * Zugriff aus dem lokalen Netz (Browser auf Tablet, Handy, zweitem Rechner, iPad-App).
   *
   * Port und PIN bleiben über Neustarts gleich – ein angemeldetes Gerät muss nichts neu eingeben.
   * Bis 30.09.2026 war der Zugang nach jedem Start aus. Entscheidung der Lehrkraft („nach jedem
   * Neustart aus"): Er schaltet sich beim Start wieder ein, sobald er einmal eingerichtet
   * wurde – abschaltbar über `autoStart` (services/lanServer.ts, `lanBeimStart`).
   */
  lan?: {
    port: number
    /** Sechsstellige PIN, die ein Geraet einmal eingeben muss */
    pin: string
    /** Beim Programmstart automatisch einschalten; ohne Angabe: an, sobald der Zugang eingerichtet ist */
    autoStart?: boolean
    /** Der Zugang lief schon einmal (einmal eingeschaltet = eingerichtet) */
    eingerichtet?: boolean
    /** Lief der Zugang beim letzten Beenden bzw. zuletzt? */
    zuletztAn?: boolean
  }
  /**
   * Nur iPad-App: KI über die App am PC („Abo über den PC", 30.09.2026, mobil/pcKi.ts).
   *
   * Den Abo-Zugang gibt es nur über die offiziellen Programme der Anbieter am PC. Die iPad-App
   * reicht ihre KI-Aufrufe deshalb auf Wunsch an Schul-Apps am PC weiter (Netzzugang mit PIN) –
   * im selben WLAN oder von unterwegs über ein privates VPN wie Tailscale.
   */
  pcKi?: PcKiEinstellungen
  /**
   * Nur iPad-App: Ausgegebene Dateien geordnet auf dem Gerät ablegen – Dokumente/Schulmaterial/
   * <Fach>/<Themenbereich> (30.09.2026, shared/schulmaterial.ts). Fehlt = an.
   */
  schulmaterialAblage?: boolean
  /**
   * IServ per WebDAV (01.10.2026, shared/iserv.ts): Schuladresse, Benutzername, gefundene
   * WebDAV-Adresse und Standardziel. Das Passwort steht NIE hier – iPad: Schlüsselbund (eigener
   * Eintrag), PC: verschlüsselt in secrets.json.
   */
  iserv?: IservEinstellungen
  /** Wohin Material standardmäßig geht; 'fragen' = vor jedem Speichern wählen. Fehlt = Gerät (mit IServ: fragen) */
  ausgabeOrt?: AusgabeOrt | 'fragen'
  /** Woher „Datei öffnen" liest, solange IServ verbunden ist (02.10.2026); fehlt = fragen */
  eingabeOrt?: 'geraet' | 'iserv' | 'fragen'
}

/** Wohin eine Datei geht: aufs Gerät (iPad: Schulmaterial, PC: Speichern-Dialog), IServ, Dateien-App-Export, Teilen-Menü */
export type AusgabeOrt = 'geraet' | 'iserv' | 'dateien' | 'teilen'

export interface IservEinstellungen {
  /** Wie eingetragen, z. B. „meineschule.de" */
  schule: string
  /** IServ-Benutzername, meist vorname.nachname */
  benutzer: string
  /** Die WebDAV-Adresse, die geantwortet hat (https://webdav.meineschule.de/) – leer = nicht verbunden */
  basis?: string
  /** Standardziel unterhalb der Basis, z. B. „Home/Schulmaterial" */
  ziel?: string
}

/**
 * Wohin eine ausgegebene Datei gehört – die Programme geben es beim Speichern mit.
 * Das iPad legt danach unter Schulmaterial ab; der PC fragt wie gewohnt mit dem Dialog.
 */
export interface AblageZiel {
  /** Programm (Kennung wie in der Bibliothek, z. B. 'vokabeltest') */
  programm: string
  /** Anzeigename des Fachs, z. B. „Englisch" */
  fach?: string
  /** Themenbereich von oben nach unten (mit Unterbereichen) */
  themenbereich?: string[]
  /** Jahrgang des Materials (05.10.2026: Ordner „Jahrgang 7") */
  jahrgang?: number
  /** Thema des Materials – Ordner, wenn kein Themenbereich zugeordnet ist */
  thema?: string
  /** Wohin (01.10.2026) – fehlt = aufs Gerät wie bisher */
  ort?: AusgabeOrt
  /** Gibt es den Namen dort schon: ersetzen oder neue Version (shared/vorhanden.ts); fehlt = nachfragen */
  beiVorhanden?: 'ersetzen' | 'neu'
  /** Fester Ordner in IServ statt Standardziel + Fach (Meine Klassen, 06.10.2026: „Gruppen/Klasse 10b/Englisch") */
  iservPfad?: string[]
}

/** iPad: was über den PC läuft und wie er erreichbar ist */
export interface PcKiEinstellungen {
  /** Adresse wie in den Netz-Einstellungen am PC, z. B. 192.168.1.24:8420 oder pc.tailnet.ts.net:8420 */
  adresse: string
  /** PIN des Netzzugangs am PC */
  pin: string
  /** Texte und Texterkennung (ai:structured, ai:websuche) */
  texte: boolean
  /** Bilder (ai:image) */
  bilder: boolean
  /** Hörtexte vertonen (audio:voices, audio:speak, audio:preview) */
  hoertexte: boolean
  /**
   * Vom PC beim Anmelden genannte Tailscale-Adresse (http://name.tailnet.ts.net:8420). Die App
   * nimmt sie statt einer rohen 100.x-Adresse – die lässt iOS nicht zu (30.09.2026).
   */
  tailscaleAdresse?: string
}

/** Ergebnis von „Verbindung testen" (iPad) */
export interface PcKiTest {
  /** Die Adresse, wie sie benutzt wurde (mit http://) */
  adresse: string
  /** Fassung von Schul-Apps am PC */
  fassung: string
  status: AiStatus
  /** Anmeldestand des Abo-Programms am PC, falls dort der Abo-Zugang gewählt ist */
  abo: SubscriptionStatus | null
  /** Tailscale-Adresse des PCs mit Namen auf „.ts.net", falls der PC sie kennt */
  tailscale?: string
}

/** Eine bei ElevenLabs verfügbare Stimme */
export interface TtsVoice {
  id: string
  name: string
  language: string
  gender: string
  description: string
  /** Fertige Hörprobe bei ElevenLabs – das Abspielen kostet kein Kontingent */
  previewUrl?: string
  /**
   * Herkunft der Stimme: premade = mitgeliefert, cloned/professional/generated.
   * Achtung: Auch Stimmen AUS DER BIBLIOTHEK tragen „cloned" oder „professional" – die
   * Kategorie allein sagt also nicht, ob die Stimme dem Konto gehört.
   */
  category?: string
  /** true = eigene Stimme des Kontos */
  isOwner?: boolean
  /** true = aus der Stimmenbibliothek übernommen (nicht in jedem Tarif nutzbar) */
  fromLibrary?: boolean
  /**
   * false = im kostenlosen Tarif nicht über die Schnittstelle nutzbar.
   * ElevenLabs antwortet dort mit „Free users cannot use library voices via the API".
   */
  usable?: boolean
  /** Warum die Stimme nicht nutzbar ist – für die Anzeige */
  unusableReason?: string
  /**
   * Sprachen, für die ElevenLabs die Stimme geprüft hat (`verified_languages`, Kürzel wie „de", 07.10.2026).
   * Die mitgelieferten Stimmen tragen meist einen englischen Akzent im Etikett, sprechen mit dem mehrsprachigen
   * Modell aber viele Sprachen – erst diese Angabe zeigt, welche.
   */
  languages?: string[]
  /** Spricht mehrere Sprachen (mehrsprachiges Modell) */
  multilingual?: boolean
}

/** Eine Stimme aus der ElevenLabs-Bibliothek (Suche nach Sprache und Geschlecht, 07.10.2026) */
export interface BibliotheksStimme {
  voiceId: string
  publicOwnerId: string
  name: string
  gender: string
  accent: string
  language: string
  description: string
  previewUrl?: string
}

/**
 * Klangregler einer Stimme, wie ElevenLabs sie kennt.
 *
 * `speed` reicht nur von 0.7 bis 1.2, alles andere von 0 bis 1. Die didaktische Bedeutung
 * steckt im Tempo – die Herleitung aus dem GER-Niveau steht in `shared/voiceSettings.ts`.
 */
export interface TtsSettings {
  /** Wie eng die Stimme an der Vorlage bleibt; niedrig = ausdrucksstärker, aber unruhiger */
  stability: number
  /** Ähnlichkeit zur Originalaufnahme */
  similarity: number
  /** Überzeichnung des Sprechstils; 0 = neutral */
  style: number
  /** Sprechtempo, 1 = natürliche Geschwindigkeit der Stimme */
  speed: number
  /** Klangliche Hervorhebung der Sprecherstimme */
  speakerBoost: boolean
}

export interface TtsRequest {
  /** Kennung des Hörtext-Bausteins; bestimmt den Dateinamen */
  id: string
  /** Sprecherzeilen in der Reihenfolge des Skripts */
  turns: { voiceId: string; text: string }[]
  /** ISO-639-1-Code der Zielsprache */
  languageCode?: string
  /** Klangregler; ohne Angabe gelten die Voreinstellungen von ElevenLabs */
  settings?: TtsSettings
  /**
   * Bisherige Aufnahme (01.10.2026): Datei und Segmente. Unveränderte Zeilen werden daraus
   * übernommen, nur geänderte neu vertont (`shared/vertonung.ts`).
   */
  vorher?: { fileName: string; segmente: import('./vertonung').TtsSegment[] }
}

export interface TtsResult {
  /** Server (02.10.2026, src/server/hoertexte.ts): Adresse der Abspielseite für den QR-Code */
  freigabe?: string
  fileName: string
  dataUrl: string
  bytes: number
  /**
   * Welcher Weg gegangen wurde: `dialog` = alle Sprecher in einem Auftrag (eleven_v3),
   * `solo` = eine Stimme über eleven_multilingual_v2. Das steht in der Erfolgsmeldung,
   * weil es hörbar den Unterschied macht – und weil sich sonst nicht prüfen lässt, ob die
   * Dialog-Vertonung überhaupt gegriffen hat.
   */
  mode: 'dialog' | 'solo'
  /** Das tatsächlich benutzte Modell */
  model: string
  /** Zahl der Aufträge an ElevenLabs (mehr als einer nur bei sehr langen Texten) */
  requests: number
  /** Gemessene Spieldauer in Sekunden (01.10.2026) */
  sekunden?: number
  /** Beginn jeder Sprecherzeile in Sekunden – gemessen bzw. je Auftrag nach Zeichen verteilt */
  zeitmarken?: number[]
  /** Segmente der Datei für spätere Teil-Vertonungen */
  segmente?: import('./vertonung').TtsSegment[]
  /** 'teilweise' = nur geänderte Zeilen neu vertont, der Rest übernommen */
  weg?: 'voll' | 'teilweise'
  /** Neu vertonte und gesamte Zeilen */
  neu?: number
  zeilen?: number
  /** Warum ganz neu vertont wurde, obwohl eine Aufnahme da war */
  grund?: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    textProvider: 'openai',
    textModels: {
      openai: 'gpt-5.5',
      anthropic: 'claude-opus-5',
      google: 'gemini-2.5-pro'
    },
    imageProvider: 'openai',
    imageModels: { openai: 'gpt-image-2', google: 'imagen-4.0-generate-001' },
    imageAccess: { openai: 'api', google: 'api', anthropic: 'api' },
    autoLatest: true,
    access: { openai: 'api', anthropic: 'api', google: 'api' },
    subscriptionModels: { openai: '', anthropic: '', google: '' },
    subscriptionAccepted: { openai: false, anthropic: false, google: false },
    cliPaths: { openai: '', anthropic: '', google: '' },
    economy: 'auto'
  },
  // Dunkel als Vorgabe (05.10.2026, Wunsch der Lehrkraft)
  appearance: { colorScheme: 'dark', theme: 'teal', dunkelVorgabe: true },
  schoolName: '',
  defaults: { stateId: 'NI', schoolTypeId: 'gymnasium', targetLanguage: 'en' },
  audio: { voices: {} },
  // 1 ab 91 %, 2 ab 78 %, 3 ab 64 %, 4 ab 50 %, 5 ab 25 % – die Vorgabe der Lehrkraft
  gradeScale: { allgemein: [91, 78, 64, 50, 25], jeFach: {} },
  showSchool: true,
  citationStyle: 'deutsch'
}

export interface AiStatus {
  textProvider: AiProviderId
  textModel: string
  textAccess: AiAccess
  /** Text-KI ist eingerichtet (Schlüssel hinterlegt oder Abo-Zugang bestätigt) */
  hasTextKey: boolean
  imageProvider: ImageProviderId
  imageModel: string
  imageAccess: AiAccess
  /** Bild-KI ist eingerichtet (Schlüssel hinterlegt oder Abo-Zugang bestätigt) */
  hasImageKey: boolean
  /** Sparmodus aktiv (weniger Anfragen, ohne zusätzliche KI-Prüfung) */
  economy: boolean
  /** Hörtexte lassen sich vertonen (ElevenLabs-Schlüssel hinterlegt) */
  hasTts: boolean
  /** Anbieter mit hinterlegtem Zugang, für die Wahl eines stärkeren Modells je Auftrag */
  textOptions: { provider: AiProviderId; model: string; label: string }[]
}

// ---------- GER-Tabelle ----------

export interface CefrGradeEntry {
  level: CefrLevel
  basis: 'Lehrplan' | 'KMK' | 'interpoliert' | string
}

export interface CefrLanguageTrack {
  order: number
  startGrade: number
  grades: Record<string, CefrGradeEntry>
  sources?: string[]
}

export interface CefrSchoolType {
  id: string
  name: string
  languages: CefrLanguageTrack[]
}

export interface CefrState {
  id: string
  name: string
  schoolTypes: CefrSchoolType[]
}

export interface CefrTable {
  version: number
  generatedAt?: string
  note?: string
  levelScale?: string[]
  states: CefrState[]
}

// ---------- KI ----------

export interface StructuredRequest {
  system: string
  user: string
  /** Bilder als data:-URLs (PNG/JPEG) */
  images?: string[]
  schemaName: string
  schema: Record<string, unknown>
  /**
   * Abweichender Anbieter für genau diese Anfrage (leer = der eingestellte).
   * Gedacht für Aufträge, die ein stärkeres Modell verdienen – etwa Hörtexte.
   */
  provider?: AiProviderId
  /** Abweichendes Modell; ohne Angabe gilt das eingestellte Modell des Anbieters */
  model?: string
  /**
   * Kennung für die Fortschrittsmeldung. Ist sie gesetzt, wird die Antwort im Strom
   * empfangen und die Zahl der eingetroffenen Zeichen laufend gemeldet.
   */
  progressId?: string
  /**
   * Live-Vorschau (02.10.2026): den bisher gelieferten Antworttext mitschicken (ai:progress, höchstens
   * einmal je Sekunde). Nur Anbieter mit Antwortstrom (API-Schlüssel); das Abo liefert erst am Ende.
   */
  teilText?: boolean
  /** Nur in der Oberfläche: bekommt den bisher gelieferten Text (wird vor dem Senden entfernt) */
  onTeilText?: (text: string) => void
}

/** Fortschritt einer laufenden KI-Anfrage */
export interface AiProgress {
  id: string
  /** Zeichen der Antwort, die bisher eingetroffen sind */
  chars: number
  /** Bisher gelieferter Antworttext – nur bei `teilText` (Live-Vorschau) */
  text?: string
}

export interface ConnectionResult {
  ok: boolean
  models?: string[]
  error?: string
}

// ---------- Bilder ----------

export interface OpenMojiHit {
  hexcode: string
  annotation: string
  tags: string
}

export interface OnlineImageHit {
  id: string
  thumbnail: string
  url: string
  title: string
  creator: string
  license: string
  licenseUrl?: string
  /** Entstehungsdatum (Wikimedia Commons) */
  date?: string
  source: OnlineImageSource
}

export type OnlineImageSource = 'openverse' | 'pixabay' | 'wikimedia' | 'clipart'

/** Ergebnis des Abgleichs eines Quellenzitats mit der angegebenen Internetquelle */
/**
 * Ergebnis der Prüfung einer Ton- oder Filmquelle.
 *
 * Geprüft wird nicht der Wortlaut (den kann man einer Videoseite nicht entnehmen), sondern
 * zweierlei: Gibt es die Seite überhaupt, und handelt sie von dem, was die KI behauptet?
 * Damit fallen erfundene Adressen auf – der häufigste Fehler, wenn ein Sprachmodell eine
 * Fundstelle nennen soll.
 */
export interface MediaCheck {
  /** ok = erreichbar und thematisch passend; mismatch = erreichbar, passt aber nicht; unreachable = nicht abrufbar */
  status: 'ok' | 'mismatch' | 'unreachable'
  /** Titel der Seite, soweit erkennbar */
  title?: string
  /** Erwartete Begriffe, die auf der Seite vorkommen */
  matched: string[]
  /** Erwartete Begriffe, die fehlen */
  missing: string[]
  message: string
}

export interface QuoteCheck {
  status: 'found' | 'partial' | 'notFound' | 'unreachable'
  ratio: number
  message: string
  /** Adresse, unter der der Wortlaut tatsächlich gefunden wurde (wenn die angegebene nicht passte) */
  suggestedUrl?: string
}

// ---------- Suche nach Originalmaterial ----------

/**
 * Auftrag an die Materialsuche.
 *
 * Die Suchwörter stellt die KI aus Thema, Fach und Jahrgang zusammen; gesucht wird aber in
 * der App, damit der Wortlaut nachweislich aus dem Archiv stammt und nicht aus dem
 * Gedächtnis des Sprachmodells.
 */
export interface Materialanfrage {
  suchwoerter: string
  /** Sprache des gesuchten Textes, zweibuchstabig („de", „en", „la" …) */
  sprache: string
  /** Höchstzahl der Treffer je Archiv */
  max?: number
}

export interface Quellentreffer {
  titel: string
  urheber?: string
  jahr?: string
  url: string
  herkunft: 'wikisource' | 'gutenberg' | 'netz'
  /**
   * Ungefaehre Groesse der Quellseite in Zeichen – nur zum Vorsortieren.
   * Die genaue Wortzahl steht erst fest, wenn die Quelle geladen ist.
   */
  zeichen?: number
  /** die ersten Sätze – damit sich die Eignung beurteilen lässt, ohne alles zu laden */
  auszug: string
  lizenz?: string
  /**
   * Kategorien der Archivseite (Wikisource), z. B. „Kategorie:Autoren" oder
   * „Kategorie:Zeitschrift" – daran erkennt die Relevanzprüfung Werklisten und
   * Inhaltsverzeichnisse, die keine Quellentexte sind (01.10.2026).
   */
  kategorien?: string[]
}

/** Der tatsächlich geladene Wortlaut einer Quelle. Nur was hier steht, darf aufs Blatt. */
export interface GeladeneQuelle {
  url: string
  titel: string
  text: string
  wortzahl: number
  /** gesetzt, wenn die Quelle nicht geladen werden konnte – dann ist `text` leer */
  fehler?: string
  /**
   * PDF-Daten, aus denen der Text noch zu gewinnen ist.
   *
   * Der Hauptprozess laedt nur die Bytes; die Formate versteht die Oberflaeche – dort liegt
   * der PDF-Leser, den auch das hochgeladene Material der Lehrkraft benutzt. Zwei getrennte
   * PDF-Leser waeren genau die Art Fehler, die still bleibt.
   *
   * Nachgemessen am 24.09.2026: Bei der Suche nach wissenschaftlichen Quellen zu
   * „Antibiotikaresistenz" war ein Bericht des Robert-Koch-Instituts ein PDF – und fiel mit
   * „Die Adresse liefert keinen Text" heraus. Gerade in den Naturwissenschaften liegt vieles
   * so vor.
   */
  pdf?: Uint8Array
}

// ---------- Dateien ----------

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface OpenedFile {
  name: string
  data: Uint8Array
}

export interface SavedVocabList {
  id: string
  name: string
  updatedAt: string
  /** Sprache der Vokabeln (en, fr, es, it, la) – für Vorschläge im Test */
  language?: string
  /** Jahrgang, für den die Liste gedacht ist */
  grade?: number
  /** Herkunft, z. B. „Green Line 4 – Unit 1" */
  source?: string
  entries: {
    term: string
    translation: string
    pos?: string
    note?: string
    grey?: boolean
    inBox?: boolean
    /** Sprechtext für die Sprachausgabe (09.10.2026, „Aussprache als …") */
    aussprache?: string
    /** Weitere richtige Antworten („auch richtig", 09.10.2026) */
    auchRichtig?: string[]
    /**
     * Veraltet: Bis Paket 7 schrieb der Vokabeltest seine Abfrage-Wahl mit in die Liste.
     * Beim Laden wird es ignoriert (vokabeltest/model/vocab.ts `ausListe`), neu gespeichert
     * wird es nicht mehr – welche Wörter abgefragt werden, entscheidet der Test.
     */
    include?: boolean
  }[]
}

// ---------- Gespeicherte Vokabeltests ----------

export interface SavedTestStats {
  /** Alle Vokabeln der Liste */
  vocabCount: number
  /** Davon für den Test markiert */
  includedCount: number
  /** Ein Test wurde bereits erstellt */
  hasTest: boolean
  variantCount: number
  totalPoints: number
  /** Optionale Vokabeln (grau bzw. im Kasten gedruckt): wie viele es gibt und wie viele mitgeprüft werden (06.10.2026) */
  optionalCount?: number
  optionalIncluded?: number
  /** Zahl der Aufgaben im Test (Fassung A) */
  taskCount?: number
  /**
   * Sprache, Fach und Jahrgang (Paket 7) – für Suche und „Zuletzt bearbeitet". Ältere Tests
   * haben sie nicht; dort bleiben die Felder leer.
   */
  language?: string
  subjectLabel?: string
  grade?: number
}

export interface SavedTestMeta extends SavedTestStats {
  id: string
  /** z. B. „Green Line 5 – Unit 1, Station 1" */
  name: string
  createdAt: string
  updatedAt: string
}

/** Inhalt aus dem Vokabeltest-Programm (Vokabelliste, Einstellungen, Test) */
export interface SavedTest extends SavedTestMeta {
  payload: unknown
}

export interface SavedTestInput {
  id: string
  name: string
  stats: SavedTestStats
  payload: unknown
}

// ---------- Gespeicherte Arbeitsblätter ----------

export interface SavedWorksheetStats {
  subjectId: string
  subjectLabel: string
  /** Thema des Blattes – wird zum Themenordner */
  topic: string
  grade: number
  schoolTypeName: string
  /**
   * Bundesland und Schulform des Materials (Paket 13) – damit die Themenbereiche nur den
   * Lehrplan des passenden Landes anwenden. Ältere Einträge haben sie nicht; dann gelten die
   * Einstellungen.
   */
  stateId?: string
  schoolTypeId?: string
  /** Anzahl der Niveaufassungen */
  sheetCount: number
  hasBoard: boolean
  /** Überthema des Blattes (27.09.2026) – die Themenbereiche ordnen danach zu (shared/themenVorschlag.ts) */
  ueberthema?: string
}

export interface SavedWorksheetMeta extends SavedWorksheetStats {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  /** Kleines Vorschaubild der ersten Seite (JPEG, data:-URL) */
  thumb?: string
}

export interface SavedWorksheet extends SavedWorksheetMeta {
  payload: unknown
}

export interface SavedWorksheetInput {
  id: string
  name: string
  stats: SavedWorksheetStats
  thumb?: string
  payload: unknown
}

// ---------- Schulbuch-Vokabeln (Lehrwerke) ----------

export interface TextbookEntry {
  term: string
  translation: string
  pos?: string
  note?: string
  /** Seite im Schulbuch */
  page?: string
  /** Passiver/fakultativer Wortschatz (im Buch grau oder markiert) */
  grey?: boolean
  /**
   * Woher die graue Markierung stammt. „ohne-beispiel" heißt: Sie wurde daraus abgeleitet,
   * dass die Verlagsliste zu diesem Wort keinen Kontextsatz führt (scripts/grey-without-example.mjs).
   * Von Hand gesetzte Markierungen tragen nichts und bleiben dadurch unangetastet.
   */
  greyBy?: 'ohne-beispiel'
  /** Vokabel aus einem Kasten der Unit (z. B. „Numbers 0-12“), nicht aus der laufenden Liste */
  inBox?: boolean
  /**
   * Im Buch farbig hervorgehobener Eintrag, der statt einer Übersetzung eine Erklärung trägt
   * (z. B. „nerd“, „meme“, „Coloured“). Für Übersetzungsaufgaben ungeeignet.
   */
  explained?: boolean
  /** Beispielsatz aus dem Buch */
  example?: string
  exampleTranslation?: string
  /** Sprechtext für die Sprachausgabe statt des Wortes (09.10.2026, „Aussprache als …") */
  aussprache?: string
  /** Weitere richtige Antworten („auch richtig", 09.10.2026) */
  auchRichtig?: string[]
}

export interface TextbookSection {
  /** z. B. „Check-in“, „Station 1“, „Story“ */
  name: string
  entries: TextbookEntry[]
}

export interface TextbookUnit {
  /** z. B. „Unit 1“ */
  name: string
  sections: TextbookSection[]
}

export interface Textbook {
  id: string
  /** z. B. „Green Line 1“ */
  name: string
  /** Sprachcode der Vokabeln (en, fr, es, it, la) */
  language: string
  /** Jahrgang, für den der Band gedacht ist (Green Line 1 → Klasse 5) */
  grade?: number
  /** Bundesland und Schulform der Ausgabe – werden beim Test vorgeschlagen */
  stateId?: string
  schoolTypeId?: string
  /** Verlag und Landesausgabe, soweit bekannt (z. B. Klett, Niedersachsen) */
  publisher?: string
  edition?: string
  /**
   * Schulbuchreihe, Ausgabe (Generation/Erscheinungsjahr, z. B. „ab 2021") und Band („3",
   * „Transition") – Paket 15, siehe src/shared/lehrwerkReihe.ts. Fehlen Reihe und Band, werden
   * sie beim Einlesen aus dem Namen abgeleitet.
   */
  reihe?: string
  ausgabe?: string
  band?: string
  units: TextbookUnit[]
  /** mitgeliefert (nur lesen) oder von der Lehrkraft importiert */
  builtIn?: boolean
  importedAt: string
}

/** Kennzeichnungen einer Vokabel als Bitmaske (mehrere können zugleich gelten) */
export const MARK_BOX = 1
export const MARK_GREY = 2
export const MARK_EXPLAINED = 4

export interface TextbookSectionMeta {
  /** z. B. „Station 1“ */
  name: string
  /**
   * Zahl der Vokabeln je Kennzeichnungs-Kombination; der Index ist die Bitmaske aus
   * MARK_BOX | MARK_GREY | MARK_EXPLAINED. `marks[0]` sind also die Vokabeln ohne jede
   * Kennzeichnung. So stimmen die Zahlen auch, wenn mehrere Kennzeichnungen zusammenfallen.
   */
  marks: number[]
}

export interface TextbookMeta {
  id: string
  name: string
  language: string
  grade?: number
  stateId?: string
  schoolTypeId?: string
  builtIn?: boolean
  publisher?: string
  /** Landesausgabe („Niedersachsen") */
  edition?: string
  /** Reihe, Ausgabe und Band (Paket 15) – im Hauptprozess notfalls aus dem Namen abgeleitet, also bei Reihe und Band immer gesetzt */
  reihe?: string
  ausgabe?: string
  band?: string
  units: { name: string; sections: TextbookSectionMeta[] }[]
  entryCount: number
}

// ---------- Gespeicherte Klassenarbeiten ----------

export interface SavedExamStats {
  subjectLabel: string
  grade: number
  topic: string
  /** Überthema (27.09.2026) – die Themenbereiche ordnen danach zu */
  ueberthema?: string
  /** Zahl der Teile */
  partCount: number
  /** Sind schon Aufgaben erzeugt? */
  hasTasks: boolean
  minutes: number
  /**
   * Bundesland und Schulform des Materials (Paket 13) – damit die Themenbereiche nur den
   * Lehrplan des passenden Landes anwenden. Ältere Einträge haben sie nicht; dann gelten die
   * Einstellungen.
   */
  stateId?: string
  schoolTypeId?: string
}

export interface SavedExamMeta extends SavedExamStats {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface SavedExam extends SavedExamMeta {
  payload: unknown
}

export interface SavedExamInput {
  id: string
  name: string
  stats: SavedExamStats
  payload: unknown
}

export interface SavedGrammarTestStats {
  subjectLabel: string
  grade: number
  /** Überthema (27.09.2026) – die Themenbereiche ordnen danach zu */
  ueberthema?: string
  /** Geprüfte Formen, für die Übersicht bereits ausgeschrieben */
  topics: string
  taskCount: number
  points: number
  minutes: number
  /** Wird der Test benotet? */
  graded: boolean
  /** Zahl der Fassungen (A/B), 06.10.2026 */
  varianten?: number
  /**
   * Bundesland und Schulform des Materials (Paket 13) – damit die Themenbereiche nur den
   * Lehrplan des passenden Landes anwenden. Ältere Einträge haben sie nicht; dann gelten die
   * Einstellungen.
   */
  stateId?: string
  schoolTypeId?: string
}

export interface SavedGrammarTestMeta extends SavedGrammarTestStats {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface SavedGrammarTest extends SavedGrammarTestMeta {
  payload: unknown
}

export interface SavedGrammarTestInput {
  id: string
  name: string
  stats: SavedGrammarTestStats
  payload: unknown
}

/**
 * Kennzahlen einer gespeicherten Lernzielkontrolle für die Übersicht.
 *
 * Bewusst andere als beim Grammatiktest: Hier zählt, welches Landesformat die Kontrolle hat
 * und wie viele Fassungen es gibt – daran erkennt die Lehrkraft sie in der Liste wieder.
 */
export interface SavedKurztestStats {
  subjectLabel: string
  grade: number
  thema: string
  /** Überthema (27.09.2026) – die Themenbereiche ordnen danach zu */
  ueberthema?: string
  /** Bezeichnung des Landesformats, z. B. „Stegreifaufgabe" */
  bezeichnung: string
  stateId: string
  /** Schulform (Paket 13, für die Themenbereiche); ältere Einträge haben sie nicht */
  schoolTypeId?: string
  taskCount: number
  points: number
  minutes: number
  /** Zahl der Fassungen (A/B/C) */
  varianten: number
}

export interface SavedKurztestMeta extends SavedKurztestStats {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface SavedKurztest extends SavedKurztestMeta {
  payload: unknown
}

export interface SavedKurztestInput {
  id: string
  name: string
  stats: SavedKurztestStats
  payload: unknown
}

/** Sparmodus aktiv? Automatisch beim Abo-Zugang, weil dort jede Anfrage auf das Kontingent zählt. */
export function economyActive(ai: AppSettings['ai']): boolean {
  return ai.economy === 'on' || (ai.economy !== 'off' && ai.access[ai.textProvider] === 'subscription')
}

/**
 * Ein YouTube-Video als Material (26.09.2026): Was der Hauptprozess von der Wiedergabeseite
 * lesen konnte. `fehler` ist gesetzt, wenn etwas fehlt – dann sind die übrigen Felder so
 * weit gefüllt, wie es ging (z. B. Titel ohne Transkript).
 */
export interface VideoQuelle {
  url: string
  titel: string
  kanal: string
  beschreibung: string
  dauerSekunden: number
  /** Fließtext aus den Untertiteln; leer, wenn es keine gibt */
  transkript: string
  transkriptSprache: string
  /** Untertitel automatisch erzeugt (können Fehler enthalten) */
  automatisch: boolean
  fehler?: string
  /** Woher das Video stammt (02.10.2026) – fehlt bei älteren Antworten: YouTube */
  anbieter?: 'youtube' | 'ard' | 'zdf' | 'arte'
  /**
   * Woher der Inhalt stammt: wörtliche Untertitel (mit Zeitmarken „[mm:ss]"), ein Inhaltsprotokoll
   * der KI, die das Video selbst gesehen hat (Gemini, nur öffentliche YouTube-Videos), oder nichts.
   */
  inhaltQuelle?: 'untertitel' | 'ki' | 'keine'
  /** Mediathek: abrufbar bis (ISO-Datum) – Sendungen verschwinden nach Monaten */
  verfuegbarBis?: string
}
