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
import type { MaskottchenInfo } from './maskottchen'
import type { LehrplanDatei } from './lehrplan'
import type { VerbListe, VerbListeMeta } from './verben'
import type { SchulQuelle, SchulTreffer, SuchOptionen } from './schulsuche'
import type { DesignTemplate } from '@shared/design'
import type { BereichsUebernahme, ThemenDaten, Themenbereich, Zuordnung } from '@shared/themen'
import type { AblehnungsDaten, AblehnungsEingabe } from '@shared/quellenAblehnung'
import type { LanStatus } from '../main/services/lanServer'
import type { WindowsFreigabeErgebnis, WindowsFreigabeStatus } from '../main/services/netz/windowsFreigabe'
import type { Netzfund } from '../main/services/ai/provider'
import type { IservStatus } from '../main/services/iserv/iserv'
import type { DavEintrag } from './iserv'
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
  VideoQuelle,
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
  SavedGrammarTestMeta,
  PcKiTest,
  AblageZiel
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

/** Eintrag einer Bibliothek der neuen Programme (Rückmeldung, Elternbrief) */
export type PaketArt = 'arbeitsblatt' | 'vokabeltest' | 'klassenarbeit' | 'lernzielkontrolle' | 'grammatiktest' | 'rueckmeldung' | 'elternbrief' | 'tafelbild'

export interface PaketVorschau {
  titel: string
  erstellt: string
  eintraege: { art: PaketArt; name: string }[]
  hoertexte: number
  designs: number
  maskottchen: number
}

export interface SavedDokumentMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  subjectLabel?: string
  grade?: number
  thema?: string
  [feld: string]: unknown
}

/**
 * Rückfragen der Oberfläche vor dem Speichern und Öffnen (02.10.2026): Am PC ist window.api über
 * die Electron-Brücke unveränderlich – die Oberfläche kann files.save & Co. nicht umhüllen. Sie
 * meldet deshalb hier zwei Funktionen an (shared/export/ausgabeOrt.tsx, eingabeOrt.tsx):
 *  - ortWahl: vor files.save/exporter.pdf den Ort wählen (Gerät, IServ …); null = abgebrochen
 *  - dateiWahl: vor files.open die Quelle wählen; undefined = wie bisher vom Gerät, null = abgebrochen
 */
export type OrtWahlFn = (ziel: AblageZiel | undefined) => Promise<AblageZiel | undefined | null>
export type DateiWahlFn = (filters: FileFilter[]) => Promise<OpenedFile | null | undefined>
/** HTML vor Druck/PDF/Vorschau aufbereiten (Silbentrennung, 02.10.2026: renderer/shared/silbentrennung.ts) */
export type HtmlVorbereitenFn = (html: string) => Promise<string>

export function buildApi(call: Call, extras: ApiExtras) {
  let ortWahl: OrtWahlFn | null = null
  let dateiWahl: DateiWahlFn | null = null
  let htmlVorbereiten: HtmlVorbereitenFn | null = null
  const vorbereitet = async (html: string): Promise<string> => (htmlVorbereiten ? htmlVorbereiten(html).catch(() => html) : html)
  /** Bibliothek eines neuen Programms (Großprogramm 0.4) – main/services/storage/dokumente.ts */
  const dokumentAblage = (kanal: 'rueckmeldungen' | 'elternbriefe' | 'tafelbilder' | 'bewertungstabellen' | 'nachteilsausgleiche') => ({
    list: () => call<SavedDokumentMeta[]>(`${kanal}:list`),
    get: (id: string) => call<SavedDokumentMeta & { payload: unknown }>(`${kanal}:get`, id),
    save: (input: { id: string; name: string; stats: Record<string, unknown>; payload: unknown }) => call<SavedDokumentMeta>(`${kanal}:save`, input),
    delete: (id: string) => call<SavedDokumentMeta[]>(`${kanal}:delete`, id)
  })
  return {
    /**
     * Zugriff aus dem lokalen Netz. Nur am Rechner selbst bedienbar – im Browser ist der
     * Aufruf gesperrt, sonst koennte ein Geraet den Zugang fuer andere oeffnen.
     */
    lan: {
      status: () => call<LanStatus>('lan:status'),
      start: () => call<LanStatus>('lan:start'),
      stop: () => call<LanStatus>('lan:stop'),
      /** Windows-Firewall: Status lesen (ohne Adminrechte) bzw. mit EINER UAC-Abfrage einrichten */
      freigabeStatus: () => call<WindowsFreigabeStatus>('lan:freigabe-status'),
      freigabeEinrichten: () => call<WindowsFreigabeErgebnis>('lan:freigabe-einrichten')
    },
    /**
     * Nur iPad-App: KI über die App am PC („Abo über den PC", mobil/pcKi.ts). Meldet sich mit
     * der PIN am Netzzugang des PCs an und liest dessen KI-Zugang. Am PC: Meldung „nur iPad".
     */
    pcKi: {
      testen: (adresse: string, pin: string) => call<PcKiTest>('pcki:testen', adresse, pin)
    },
    /**
     * IServ per WebDAV (01.10.2026, main/services/iserv): verbinden (testet und merkt; das Passwort
     * geht in den Schlüsselbund bzw. verschlüsselt in secrets.json), Ordner zeigen, trennen.
     * Gespeichert wird über files.save/exporter.pdf mit `ziel.ort = 'iserv'`.
     */
    iserv: {
      status: () => call<IservStatus>('iserv:status'),
      verbinden: (eingabe: { schule: string; benutzer: string; passwort?: string }) => call<{ basis: string; ordner: DavEintrag[] }>('iserv:verbinden', eingabe),
      ordner: (pfad: string) => call<DavEintrag[]>('iserv:ordner', pfad),
      trennen: () => call<void>('iserv:trennen'),
      /** Ordner UND Dateien eines Ordners (02.10.2026) */
      eintraege: (pfad: string) => call<DavEintrag[]>('iserv:eintraege', pfad),
      /** Eine Datei von IServ laden */
      laden: (pfad: string) => call<OpenedFile>('iserv:laden', pfad)
    },
    /** Rückfragen vor Speichern/Öffnen anmelden (siehe OrtWahlFn) – einmal beim Start der Oberfläche */
    vermittlung: {
      ortWahl: (fn: OrtWahlFn | null) => {
        ortWahl = fn
      },
      dateiWahl: (fn: DateiWahlFn | null) => {
        dateiWahl = fn
      },
      htmlVorbereiten: (fn: HtmlVorbereitenFn | null) => {
        htmlVorbereiten = fn
      }
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
      wiederherstellen: (daten: Uint8Array) => call<{ wiederhergestellt: string[] }>('wartung:wiederherstellen', daten),
      sicherungen: () => call<{ name: string; groesse: number; erstellt: string }[]>('wartung:sicherungen'),
      sicherungLaden: (name: string) => call<Uint8Array>('wartung:sicherungLaden', name),
      sichereJetzt: () => call<{ name: string; groesse: number; erstellt: string }>('wartung:sichereJetzt'),
      sicherungsOrdner: () => call<string | null>('wartung:sicherungsOrdner'),
      hoertexte: () => call<{ dateien: string[]; bytes: number }>('wartung:hoertexte'),
      hoertexteAufraeumen: () => call<{ dateien: string[]; bytes: number }>('wartung:hoertexteAufraeumen')
    },
    verbrauch: {
      get: () =>
        call<
          Record<string, Record<string, { anfragen: number; wiederholungen: number; eingabe: number; ausgabe: number; bilder: number; ttsZeichen: number }>>
        >('verbrauch:get')
    },
    /** Briefkopf (29.09.2026): Zertifikat für die digitale Signatur wählen – im Netzzugang gesperrt */
    briefkopf: {
      zertifikatWaehlen: () => call<string | null>('briefkopf:zertifikat')
    },
    /** Schulpaket (F8): Material als Datei weitergeben – im Netzzugang gesperrt */
    paket: {
      erstellen: (titel: string, auswahl: { art: PaketArt; id: string }[]) => call<string | null>('paket:erstellen', titel, auswahl),
      oeffnen: () => call<PaketVorschau | null>('paket:oeffnen'),
      einlesen: () => call<{ art: PaketArt; id: string; name: string }[]>('paket:einlesen'),
      /** Beim Start per „Öffnen mit" übergebenes Paket (einmal) */
      startdatei: () => call<PaketVorschau | null>('paket:startdatei'),
      /** Paket, das geöffnet wurde, während die App schon lief */
      onVonAussen: (cb: (v: PaketVorschau | { fehler: string }) => void) => extras.subscribe('paket:vonAussen', cb as (value: unknown) => void)
    },
    protokoll: {
      melden: (text: string) => call<void>('protokoll:melden', text),
      speichern: () => call<string | null>('protokoll:speichern')
    },
    /**
     * Das Fenster soll schließen: Vorher sichert die Oberfläche alles Anstehende und meldet
     * sich mit `gesichert()` zurück. Im Browser gibt es kein solches Ereignis.
     */
    fenster: {
      onSchliessen: (cb: () => void) => extras.subscribe('fenster:schliessen', () => cb()),
      gesichert: () => call<void>('fenster:gesichert'),
      /** Es laufen noch Aufträge und die Oberfläche fragt nach: Das Schließen wartet auf die Antwort */
      rueckfrage: () => call<void>('fenster:rueckfrage'),
      /** Die Lehrkraft will weiterarbeiten: Das Fenster bleibt offen */
      bleiben: () => call<void>('fenster:bleiben')
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
      websuche: (auftrag: string, anfrageId?: string) => call<Netzfund[]>('ai:websuche', auftrag, anfrageId),
      image: (prompt: string, anfrageId?: string) => call<string>('ai:image', prompt, anfrageId),
      /**
       * Bricht eine laufende oder wartende Anfrage ab (Kennung = `progressId` bzw. `anfrageId`).
       * Die Anfrage endet dann mit der Abbruchmeldung aus @shared/abbruch – kein Fehler.
       */
      cancel: (anfrageId: string) => call<void>('ai:cancel', anfrageId),
      /**
       * Meldet, ob eine Anfrage auf einen freien Platz wartet (höchstens drei laufen zugleich).
       * Beim Warten steht dabei, wie viele Plätze abgebrochene Anfragen noch halten (davon Bilder).
       */
      onPlatz: (cb: (platz: { id: string; zustand: 'wartend' | 'laufend'; abgebrochen?: number; abgebrocheneBilder?: number }) => void) =>
        extras.subscribe('ai:platz', cb as (value: unknown) => void),
      /**
       * Nur über das Netz (iPad-App „Abo über den PC", Browser, 30.09.2026): Die Verbindung zum PC
       * ist während einer Anfrage abgerissen bzw. wieder da; `wiederholt` = die App war im
       * Hintergrund, die Anfrage wird nach der Rückkehr erneut gestellt (API-Modus auf dem iPad).
       */
      onVerbindung: (cb: (v: { id: string; zustand: 'unterbrochen' | 'verbunden' | 'wiederholt' }) => void) =>
        extras.subscribe('ai:verbindung', cb as (value: unknown) => void)
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
      removeLogo: () => call<void>('branding:remove-logo'),
      getUnterschrift: () => call<string | null>('branding:get-unterschrift'),
      setUnterschrift: (pngDataUrl: string) => call<void>('branding:set-unterschrift', pngDataUrl),
      removeUnterschrift: () => call<void>('branding:remove-unterschrift')
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
    /** Neue Programme (Großprogramm 0.4) – gemeinsame Ablage im Hauptprozess */
    rueckmeldungen: dokumentAblage('rueckmeldungen'),
    elternbriefe: dokumentAblage('elternbriefe'),
    /** Tafelbilder (30.09.2026) */
    tafelbilder: dokumentAblage('tafelbilder'),
    /** Rückmeldung (29.09.2026): Vorlagen für Bewertungstabellen, gemerkte Nachteilsausgleiche (nur auf diesem Rechner) */
    bewertungstabellen: dokumentAblage('bewertungstabellen'),
    nachteilsausgleiche: dokumentAblage('nachteilsausgleiche'),
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
    /** Listen unregelmäßiger Verben je Lehrwerk-Band (30.09.2026, shared/verben.ts) */
    verbLists: {
      list: () => call<VerbListeMeta[]>('verbLists:list'),
      get: (id: string) => call<VerbListe>('verbLists:get', id),
      save: (liste: VerbListe) => call<VerbListeMeta[]>('verbLists:save', liste),
      delete: (id: string) => call<VerbListeMeta[]>('verbLists:delete', id)
    },
    /**
     * Themenbereiche je Fach und die Zuordnung der Materialien (Paket 10b, src/shared/themen.ts).
     * Jeder Aufruf liefert den ganzen neuen Stand zurück.
     */
    themen: {
      list: () => call<ThemenDaten>('themen:list'),
      /** Anlegen oder umbenennen */
      bereich: (b: Pick<Themenbereich, 'id' | 'fachId' | 'name'> & Partial<Themenbereich>) => call<ThemenDaten>('themen:bereich', b),
      /** Löschen samt Unterbereichen – die Materialien rücken in den Oberbereich bzw. nach „Ohne Themenbereich" */
      delete: (id: string) => call<ThemenDaten>('themen:delete', id),
      /** Unter einen anderen Bereich hängen oder nach oben (null) – Paket 12 */
      verschieben: (id: string, elternId: string | null) => call<ThemenDaten>('themen:verschieben', id, elternId),
      /** Zuordnungen setzen; null entfernt den Eintrag */
      zuordnen: (eintraege: Record<string, Zuordnung | null>) => call<ThemenDaten>('themen:zuordnen', eintraege),
      /** Vorschläge der Automatik übernehmen und für diese Fächer die Automatik einschalten */
      uebernehmen: (vorschlaege: BereichsUebernahme[], automatik: string[]) => call<ThemenDaten>('themen:uebernehmen', vorschlaege, automatik),
      reihenfolge: (schluessel: string, liste: string[]) => call<ThemenDaten>('themen:reihenfolge', schluessel, liste),
      automatik: (fachId: string, an: boolean) => call<ThemenDaten>('themen:automatik', fachId, an)
    },
    /** Lehrplan-Themen eines Landes (resources/lehrplaene/<LAND>.json, Paket 12/14); null = keine Datei */
    lehrplan: {
      themen: (stateId: string) => call<LehrplanDatei | null>('lehrplan:themen', stateId)
    },
    /** Schulverzeichnis (resources/schulen, Paket 13) – Suche, Vorgabe-Logo, Quellenvermerk */
    schulen: {
      suche: (text: string, opt: SuchOptionen) => call<SchulTreffer[]>('schulen:suche', text, opt),
      logo: (id: string) => call<string | null>('schulen:logo', id),
      quellen: () => call<{ stand: string; anzahl: number; quellen: SchulQuelle[] }>('schulen:quellen')
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
      laden: (url: string) => call<GeladeneQuelle>('sources:laden', url),
      /** Abgelehnte Quellen – eine Liste für alle Programme (01.10.2026) */
      ablehnungen: () => call<AblehnungsDaten>('sources:ablehnungen'),
      /** „Für dieses Thema ausblenden" (umfang: 'thema', mit thema) oder „Nie wieder vorschlagen" (umfang: 'global') */
      ablehnen: (eingaben: (AblehnungsEingabe & { thema?: string })[] | (AblehnungsEingabe & { thema?: string })) =>
        call<AblehnungsDaten>('sources:ablehnen', eingaben),
      /** Ablehnung aufheben: eine Seite (url) oder alle Ausblendungen eines Themas (thema) */
      ablehnungAufheben: (auswahl: { url?: string; thema?: string }) => call<AblehnungsDaten>('sources:ablehnung-aufheben', auswahl),
      /** Titel, Beschreibung und Transkript eines YouTube-Videos – Material aus einer Adresse (26.09.2026) */
      video: (url: string) => call<VideoQuelle>('sources:video', url)
    },
    /** Maskottchen für Illustrationen (26.09.2026) – Ablage im Profil unter maskottchen/ */
    maskottchen: {
      list: () => call<MaskottchenInfo[]>('maskottchen:list'),
      save: (eingabe: { id: string; name: string; beschreibung: string; quelle: 'ki' | 'upload'; vorlage?: string }) =>
        call<MaskottchenInfo>('maskottchen:save', eingabe),
      pose: (id: string, pose: string, dataUrl: string) => call<MaskottchenInfo>('maskottchen:pose', id, pose, dataUrl),
      deletePose: (id: string, pose: string) => call<MaskottchenInfo | null>('maskottchen:delete-pose', id, pose),
      delete: (id: string) => call<MaskottchenInfo[]>('maskottchen:delete', id)
    },
    /** Hörtexte vertonen (ElevenLabs) */
    audio: {
      voices: () => call<TtsVoice[]>('audio:voices'),
      speak: (req: TtsRequest) => call<TtsResult>('audio:speak', req),
      /** Hörprobe einer Stimme als data:-Adresse – kostet kein Kontingent */
      preview: (voiceId: string) => call<string>('audio:preview', voiceId),
      /** Gespeicherte Datei erneut laden; null, wenn sie nicht mehr da ist */
      read: (fileName: string) => call<string | null>('audio:read', fileName),
      /** Eigene MP3 (z. B. Original-Hördatei des Verlags) als Aufnahme des Bausteins `id` ablegen (29.09.2026) */
      import: (id: string, daten: Uint8Array) => call<{ fileName: string; dataUrl: string; bytes: number }>('audio:import', id, daten),
      showInFolder: (fileName: string) => call<void>('audio:show', fileName)
    },
    files: {
      docxToHtml: (data: Uint8Array) => call<string>('files:docx-html', data),
      /** `ziel`: wohin die Datei gehört – die iPad-App legt danach unter Schulmaterial ab, der PC ignoriert es */
      save: async (defaultName: string, filters: FileFilter[], data: Uint8Array | string, ziel?: AblageZiel) => {
        const z = ortWahl ? await ortWahl(ziel) : ziel
        if (z === null) return null
        return call<string | null>('files:save', defaultName, filters, data, z)
      },
      open: async (filters: FileFilter[]) => {
        const gewaehlt = dateiWahl ? await dateiWahl(filters) : undefined
        if (gewaehlt !== undefined) return gewaehlt
        return call<OpenedFile | null>('files:open', filters)
      },
      launchFile: () => call<OpenedFile | null>('files:launch-file'),
      /** Mehrere Pfade: auf dem iPad gemeinsam teilen; am PC zeigt der Explorer den ersten */
      showInFolder: (path: string | string[]) => call<void>('files:show', path),
      /** Ordner wählen, in den mehrere Dateien auf einmal gehen; null bei Abbruch */
      chooseFolder: (title?: string) => call<string | null>('files:choose-folder', title),
      /** Datei in den gewählten Ordner legen – vorhandene werden nicht überschrieben („… (2)"); liefert den Pfad */
      saveInFolder: (folder: string, name: string, data: Uint8Array | string) => call<string>('files:save-in-folder', folder, name, data),
      openFolder: (folder: string) => call<void>('files:open-folder', folder),
      pathOf: (file: File) => extras.pathOf(file)
    },
    exporter: {
      pdf: async (
        html: string,
        defaultName: string,
        opts?: {
          fillable?: boolean
          audio?: { id: string; fileName: string; title: string; base64: string }[]
          signatur?: { passwort: string; grund?: string; name?: string }
          /** Nur diese Seiten (1-basiert) – für Dokumente ohne Seitenzahlen (shared/seitenPdf.ts) */
          seiten?: number[]
        },
        /** Wohin die Datei gehört (iPad: Schulmaterial; der PC ignoriert es) */
        ziel?: AblageZiel
      ) => {
        const z = ortWahl ? await ortWahl(ziel) : ziel
        if (z === null) return null
        return call<string | null>('export:pdf', await vorbereitet(html), defaultName, opts, z)
      },
      /** Wie `pdf`, aber ohne Dialog in einen schon gewählten Ordner (siehe files.chooseFolder) */
      pdfInFolder: (
        folder: string,
        html: string,
        name: string,
        opts?: { fillable?: boolean; audio?: { id: string; fileName: string; title: string; base64: string }[]; seiten?: number[] }
      ) => vorbereitet(html).then((h) => call<string>('export:pdf-in-folder', folder, h, name, opts)),
      fillablePreview: (html: string, audio?: { id: string; fileName: string; title: string; base64: string }[]) =>
        vorbereitet(html).then((h) => call<Uint8Array>('export:fillable-preview', h, audio)),
      /** Ohne Optionen: Druckdialog von Windows; mit Optionen: direkt drucken (aus der Druckvorschau) */
      print: (html: string, options?: PrintOptions) => vorbereitet(html).then((h) => call<void>('export:print', h, options)),
      preview: (html: string) => vorbereitet(html).then((h) => call<Uint8Array>('export:preview', h)),
      printers: () => call<PrinterInfo[]>('export:printers')
    }
  }
}

export type SchulAppsApi = ReturnType<typeof buildApi>
