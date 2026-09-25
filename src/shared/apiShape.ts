/**
 * Die FORM der Programmschnittstelle – gemeinsam für den PC und für den Zugriff aus dem Netz.
 *
 * Am PC reicht der Preload die Aufrufe über die Electron-Brücke weiter, im Browser laufen
 * dieselben Aufrufe über HTTP. Beide bauen ihre Schnittstelle aus DIESER Datei: Ein neuer
 * Aufruf existiert damit automatisch in beiden Welten. Zwei getrennte Fassungen wären
 * genau die Art Fehler, die still bleibt – am PC funktioniert alles, im Browser fehlt eine
 * Kleinigkeit, und es sieht nach einem Fehler der Oberfläche aus.
 *
 * WELCHE Aufrufe aus dem Netz überhaupt erlaubt sind, steht NICHT hier, sondern im Server
 * (main/services/lanServer.ts). Diese Datei beschreibt nur, was es gibt.
 */
import type { DesignTemplate } from '@shared/design'
import type { LanStatus } from '../main/services/lanServer'
import type { Netzfund } from '../main/services/ai/provider'
import type {
  AiProviderId,
  AiProgress,
  AiStatus,
  AppSettings,
  CefrTable,
  DeepPartial,
  ModelKind,
  ModelListResult,
  ModelOption,
  SetupEvent,
  SubscriptionStatus,
  FileFilter,
  GeladeneQuelle,
  Materialanfrage,
  OnlineImageHit,
  OnlineImageSource,
  OpenedFile,
  OpenMojiHit,
  Quellentreffer,
  SavedExam,
  SavedExamInput,
  SavedExamMeta,
  SavedTest,
  SavedTestInput,
  SavedTestMeta,
  SavedWorksheet,
  SavedWorksheetInput,
  SavedWorksheetMeta,
  SavedVocabList,
  MediaCheck,
  QuoteCheck,
  SecretName,
  StructuredRequest,
  Textbook,
  TextbookMeta,
  TtsRequest,
  TtsResult,
  TtsVoice,
  SavedGrammarTest,
  SavedGrammarTestInput,
  SavedKurztest,
  SavedKurztestInput,
  SavedKurztestMeta,
  SavedGrammarTestMeta
} from '@shared/types'

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export interface PrintOptions {
  deviceName: string
  copies: number
  duplex: 'simplex' | 'longEdge' | 'shortEdge'
  color: boolean
  /** Seitenbereiche, 1-basiert und einschließlich */
  pages?: { from: number; to: number }[]
}

/** Ruft einen Kanal des Hauptprozesses auf. */
export type Call = <T>(channel: string, ...args: unknown[]) => Promise<T>

/** Was sich nicht über einen Kanal erledigen lässt und je Umgebung verschieden ist. */
export interface ApiExtras {
  /** Pfad einer per Dateiauswahl übergebenen Datei – im Browser gibt es ihn nicht. */
  pathOf: (file: File) => string
  /**
   * Meldungen, die das Programm von sich aus schickt (Fortschritt einer KI-Anfrage,
   * Einrichtungsschritte, neu geladene Modelllisten). Liefert die Abmeldung zurück.
   *
   * Am PC ist das die Electron-Brücke, im Browser ein offener Ereignisstrom.
   */
  subscribe: (channel: string, cb: (value: unknown) => void) => () => void
}

export function buildApi(call: Call, extras: ApiExtras) {
  return {
    /**
     * Zugriff aus dem lokalen Netz. Nur am Rechner selbst bedienbar – im Browser ist der
     * Aufruf gesperrt, sonst koennte ein Geraet den Zugang fuer andere oeffnen.
     */
    lan: {
      status: () => call<LanStatus>('lan:status'),
      start: () => call<LanStatus>('lan:start'),
      stop: () => call<LanStatus>('lan:stop')
    },
    settings: {
      get: () => call<AppSettings>('settings:get'),
      set: (patch: DeepPartial<AppSettings>) => call<AppSettings>('settings:set', patch)
    },
    secrets: {
      set: (name: SecretName, value: string) => call<void>('secrets:set', name, value),
      has: (name: SecretName) => call<boolean>('secrets:has', name)
    },
    /*
     * Sichern und Zurücksetzen. Im Netzzugang gesperrt (siehe services/lanServer.ts): Vom
     * Tablet aus soll niemand die Ablage des Rechners leeren können.
     */
    wartung: {
      bestand: () => call<{ ordner: string; eintraege: number }[]>('wartung:bestand'),
      sicherung: () => call<{ name: string; daten: Uint8Array }>('wartung:sicherung'),
      zuruecksetzen: () => call<{ geloescht: string[] }>('wartung:zuruecksetzen'),
      pruefen: (daten: Uint8Array) => call<{ erstellt: string; ordner: { ordner: string; eintraege: number }[]; dateien: string[] }>('wartung:pruefen', daten),
      wiederherstellen: (daten: Uint8Array) => call<{ wiederhergestellt: string[] }>('wartung:wiederherstellen', daten)
    },
    /**
     * Das Fenster soll schließen: Vorher sichert die Oberfläche alles Anstehende und meldet
     * sich mit `gesichert()` zurück. Im Browser gibt es kein solches Ereignis.
     */
    fenster: {
      onSchliessen: (cb: () => void) => extras.subscribe('fenster:schliessen', () => cb()),
      gesichert: () => call<void>('fenster:gesichert')
    },
    ai: {
      status: () => call<AiStatus>('ai:status'),
      /** Prüft den Schlüssel, lädt die Modellliste neu; liefert die Anzahl gefundener Modelle */
      test: (provider: AiProviderId) => call<number>('ai:test', provider),
      subscriptionStatus: (provider: AiProviderId) => call<SubscriptionStatus>('ai:subscription-status', provider),
      subscriptionModels: (provider: AiProviderId) => call<ModelOption[]>('ai:subscription-models', provider),
      /** Liefert die Dauer der Test-Anfrage in Sekunden */
      subscriptionTest: (provider: AiProviderId) => call<number>('ai:subscription-test', provider),
      /** Erzeugt ein Testbild über das Abo (data:-URL) */
      subscriptionImageTest: (provider: AiProviderId) => call<string>('ai:subscription-image-test', provider),
      /** Lädt das Programm des Anbieters herunter (Fortschritt über onSetupEvent) */
      install: (provider: AiProviderId) => call<void>('ai:install', provider),
      loginStart: (provider: AiProviderId) => call<void>('ai:login-start', provider),
      loginCode: (provider: AiProviderId, code: string) => call<void>('ai:login-code', provider, code),
      loginCancel: (provider: AiProviderId) => call<void>('ai:login-cancel', provider),
      openLoginPage: (url: string) => call<void>('ai:login-open', url),
      /** Meldet, wie weit die Antwort einer laufenden Anfrage gediehen ist */
      onProgress: (cb: (progress: AiProgress) => void) => extras.subscribe('ai:progress', cb as (value: unknown) => void),
      onSetupEvent: (cb: (event: SetupEvent) => void) => extras.subscribe('ai:setup-event', cb as (value: unknown) => void),
      models: (provider: AiProviderId, kind: ModelKind, refresh = false) => call<ModelListResult>('ai:models', provider, kind, refresh),
      onModelsUpdated: (cb: (notes: string[]) => void) => extras.subscribe('models:updated', cb as (value: unknown) => void),
      structured: <T>(req: StructuredRequest) => call<T>('ai:structured', req),
      /** Sucht im offenen Netz nach Fundstellen; leere Liste, wenn der Anbieter das nicht kann */
      websuche: (auftrag: string) => call<Netzfund[]>('ai:websuche', auftrag),
      image: (prompt: string) => call<string>('ai:image', prompt)
    },
    cefr: {
      get: () => call<CefrTable>('cefr:get')
    },
    designs: {
      list: () => call<DesignTemplate[]>('designs:list'),
      save: (design: DesignTemplate) => call<DesignTemplate[]>('designs:save', design),
      delete: (id: string) => call<DesignTemplate[]>('designs:delete', id),
      setDefault: (id: string) => call<DesignTemplate[]>('designs:set-default', id)
    },
    branding: {
      getLogo: () => call<string | null>('branding:get-logo'),
      setLogo: (pngDataUrl: string) => call<void>('branding:set-logo', pngDataUrl),
      removeLogo: () => call<void>('branding:remove-logo')
    },
    /** Selbst gestaltete Piktogramme; gelten für alle Programme */
    pictograms: {
      get: () => call<Record<string, string>>('pictograms:get'),
      set: (id: string, pngDataUrl: string) => call<void>('pictograms:set', id, pngDataUrl),
      remove: (id: string) => call<void>('pictograms:remove', id),
      reset: () => call<void>('pictograms:reset')
    },
    /** In der App gespeicherte Vokabeltests */
    tests: {
      list: () => call<SavedTestMeta[]>('tests:list'),
      get: (id: string) => call<SavedTest>('tests:get', id),
      save: (input: SavedTestInput) => call<SavedTestMeta>('tests:save', input),
      delete: (id: string) => call<SavedTestMeta[]>('tests:delete', id)
    },
    /** In der App gespeicherte Klassenarbeiten */
    exams: {
      list: () => call<SavedExamMeta[]>('exams:list'),
      get: (id: string) => call<SavedExam>('exams:get', id),
      save: (input: SavedExamInput) => call<SavedExamMeta>('exams:save', input),
      delete: (id: string) => call<SavedExamMeta[]>('exams:delete', id)
    },
    /** In der App gespeicherte Grammatiktests */
    kurztests: {
      list: () => call<SavedKurztestMeta[]>('kurztests:list'),
      get: (id: string) => call<SavedKurztest>('kurztests:get', id),
      save: (input: SavedKurztestInput) => call<SavedKurztestMeta>('kurztests:save', input),
      delete: (id: string) => call<SavedKurztestMeta[]>('kurztests:delete', id)
    },
    grammarTests: {
      list: () => call<SavedGrammarTestMeta[]>('grammarTests:list'),
      get: (id: string) => call<SavedGrammarTest>('grammarTests:get', id),
      save: (input: SavedGrammarTestInput) => call<SavedGrammarTestMeta>('grammarTests:save', input),
      delete: (id: string) => call<SavedGrammarTestMeta[]>('grammarTests:delete', id)
    },
    sheets: {
      list: () => call<SavedWorksheetMeta[]>('sheets:list'),
      get: (id: string) => call<SavedWorksheet>('sheets:get', id),
      save: (input: SavedWorksheetInput) => call<SavedWorksheetMeta>('sheets:save', input),
      delete: (id: string) => call<SavedWorksheetMeta[]>('sheets:delete', id)
    },
    textbooks: {
      list: () => call<TextbookMeta[]>('textbooks:list'),
      get: (id: string) => call<Textbook>('textbooks:get', id),
      save: (books: Textbook[]) => call<TextbookMeta[]>('textbooks:save', books),
      delete: (id: string) => call<TextbookMeta[]>('textbooks:delete', id)
    },
    library: {
      list: () => call<SavedVocabList[]>('library:list'),
      save: (list: SavedVocabList) => call<SavedVocabList[]>('library:save', list),
      delete: (id: string) => call<SavedVocabList[]>('library:delete', id)
    },
    images: {
      searchOpenMoji: (q: string) => call<OpenMojiHit[]>('images:openmoji-search', q),
      openMojiSvg: (hex: string) => call<string>('images:openmoji-svg', hex),
      searchOnline: (q: string, source: OnlineImageSource) => call<OnlineImageHit[]>('images:online-search', q, source),
      fetch: (url: string) => call<string>('images:fetch', url)
    },
    sources: {
      /** Prüft, ob der Wortlaut einer Textquelle unter der angegebenen Adresse steht */
      checkQuote: (url: string, quote: string) => call<QuoteCheck>('sources:check-quote', url, quote),
      checkMedia: (url: string, expect: string[]) => call<MediaCheck>('sources:check-media', url, expect),
      /** Sucht Originalmaterial in den freien Archiven (Wikisource, Projekt Gutenberg) */
      suche: (anfrage: Materialanfrage) => call<Quellentreffer[]>('sources:suche', anfrage),
      /** Laedt den Wortlaut einer Quelle – auch fuer Fundstellen, die die KI selbst gefunden hat */
      laden: (url: string) => call<GeladeneQuelle>('sources:laden', url)
    },
    /** Hörtexte vertonen (ElevenLabs) */
    audio: {
      voices: () => call<TtsVoice[]>('audio:voices'),
      speak: (req: TtsRequest) => call<TtsResult>('audio:speak', req),
      /** Hörprobe einer Stimme als data:-Adresse – kostet kein Kontingent */
      preview: (voiceId: string) => call<string>('audio:preview', voiceId),
      /** Gespeicherte Datei erneut laden; null, wenn sie nicht mehr da ist */
      read: (fileName: string) => call<string | null>('audio:read', fileName),
      showInFolder: (fileName: string) => call<void>('audio:show', fileName)
    },
    files: {
      docxToHtml: (data: Uint8Array) => call<string>('files:docx-html', data),
      save: (defaultName: string, filters: FileFilter[], data: Uint8Array | string) => call<string | null>('files:save', defaultName, filters, data),
      open: (filters: FileFilter[]) => call<OpenedFile | null>('files:open', filters),
      launchFile: () => call<OpenedFile | null>('files:launch-file'),
      showInFolder: (path: string) => call<void>('files:show', path),
      pathOf: (file: File) => extras.pathOf(file)
    },
    exporter: {
      pdf: (html: string, defaultName: string, opts?: { fillable?: boolean; audio?: { id: string; fileName: string; title: string; base64: string }[] }) =>
        call<string | null>('export:pdf', html, defaultName, opts),
      fillablePreview: (html: string, audio?: { id: string; fileName: string; title: string; base64: string }[]) =>
        call<Uint8Array>('export:fillable-preview', html, audio),
      /** Ohne Optionen: Druckdialog von Windows; mit Optionen: direkt drucken (aus der Druckvorschau) */
      print: (html: string, options?: PrintOptions) => call<void>('export:print', html, options),
      preview: (html: string) => call<Uint8Array>('export:preview', html),
      printers: () => call<PrinterInfo[]>('export:printers')
    }
  }
}

export type SchulAppsApi = ReturnType<typeof buildApi>
