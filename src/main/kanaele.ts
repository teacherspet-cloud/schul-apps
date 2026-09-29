/**
 * Alle Aufrufe der Oberfläche – für den PC (Electron) und für die iPad-App (Capacitor).
 *
 * Bis 29.09.2026 stand diese Sammlung in main/index.ts und kannte Electron direkt. Für die
 * eigenständige iPad-App läuft derselbe Code im WKWebView, ohne Node und ohne Electron. Was je
 * Gerät verschieden ist – Dialoge, Ordner, Drucken, der Netzzugang, die Sicherungen –, kommt
 * deshalb über die `Umgebung`. Alles andere (Ablagen, KI, Bilder, Quellen, PDF-Nachbearbeitung)
 * ist hier genau einmal beschrieben. So kann keine der beiden Apps einen Aufruf kennen, den die
 * andere nicht hat (Prüfung: tests/mobilKanaele.test.ts).
 *
 * Electron-Fassung der Umgebung: main/umgebung.ts. iPad-Fassung: mobil/umgebung.ts.
 */
import { ABLAGEN, type DokumentEingabe } from './services/storage/dokumente'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import {
  AI_PROVIDERS,
  AiProviderId,
  AiStatus,
  AppSettings,
  DeepPartial,
  economyActive,
  FileFilter,
  ModelKind,
  Materialanfrage,
  OnlineImageSource,
  SavedTestInput,
  SavedExamInput,
  SavedWorksheetInput,
  SavedVocabList,
  SecretName,
  SetupEvent,
  StructuredRequest,
  Textbook,
  TtsRequest,
  SavedGrammarTestInput,
  SavedKurztestInput
} from '@shared/types'
import type { PrinterInfo, PrintOptions } from '@shared/apiShape'
import { createCliProvider, subscriptionModels, subscriptionStatus } from './services/ai/cli'
import { generateSvgImage } from './services/ai/svg'
import { KiPlaetze } from './services/ai/kiPlaetze'
import { attrappeAktiv } from './services/ai/attrappe'
import { istAbbruch } from '@shared/abbruch'
import { freierDateiname } from '@shared/dateiname'
import { cancelLogin, installCli, reopenLoginPage, startLogin, submitLoginCode } from './services/ai/setup'
import { createProvider, createTextProvider, getModelList, healModelSelection, refreshProvider } from './services/ai/models'
import { mitPdfMetadaten } from './services/export/pdfMetadaten'
import { htmlToPdfWithExtras, MEASURE_SCRIPT, type Gemessen, type Messen } from './services/export/fillablePdf'
import { fetchAsDataUrl, getOpenMojiSvg, searchOnline, searchOpenMoji } from './services/images/images'
import { checkMediaSource, checkQuote } from './services/images/sources'
import { ladeOriginalquelle, sucheOriginalquellen } from './services/sources/materialSuche'
import { ladeVideo } from './services/sources/video'
import { deleteMaskottchen, deletePose, listMaskottchen, saveMaskottchen, savePose } from './services/storage/maskottchen'
import { audioPath, listVoices, previewVoice, readAudio, speak } from './services/audio/elevenlabs'
import { importiereAudio } from './services/audio/importAudio'
import { deleteTextbook, getTextbook, listTextbooks, saveTextbooks } from './services/storage/textbooks'
import { deleteExam, getExam, listExams, saveExam } from './services/storage/exams'
import { deleteWorksheet, getWorksheet, listWorksheets, saveWorksheet } from './services/storage/worksheets'
import { docxToHtml } from './services/ocr/docx'
import type { DesignTemplate } from '@shared/design'
import { getLogo, getUnterschrift, removeLogo, removeUnterschrift, setLogo, setUnterschrift } from './services/storage/branding'
import { getPictograms, removeAllPictograms, removePictogram, setPictogram } from './services/storage/pictograms'
import { deleteGrammarTest, getGrammarTest, listGrammarTests, saveGrammarTest } from './services/storage/grammarTests'
import { deleteKurztest, getKurztest, listKurztests, saveKurztest } from './services/storage/kurztests'
import { deleteDesign, listDesigns, saveDesign, setDefaultDesign } from './services/storage/designs'
import { getCefrTable } from './services/storage/cefr'
import { deleteTest, getTest, listTests, saveTest } from './services/storage/vocabTests'
import { deleteVocabList, getSecret, getSettings, listVocabLists, saveVocabList, setSecret, setSettings } from './services/storage/settings'
import {
  leseThemen,
  themenAutomatik,
  themenBereichLoeschen,
  themenBereichVerschieben,
  themenBereichSetzen,
  themenReihenfolge,
  themenUebernehmen,
  themenZuordnen
} from './services/storage/themen'
import { leseLehrplan } from './services/storage/lehrplan'
import type { SuchOptionen } from '@shared/schulsuche'
import { schulenSuchen, schulLogo, schulQuellen } from './services/storage/schulen'
import type { BereichsUebernahme, Themenbereich, Zuordnung } from '@shared/themen'
import { bestand, pruefeSicherung, sicherung, werkszustand, wiederherstellen } from './services/storage/wartung'
import { raeumeHoertexteAuf, verwaisteHoertexte } from './services/storage/hoertexteAufraeumen'
import { erstellePaket, leseGeoeffnetesPaketEin, oeffnePaket } from './services/paket/wege'
import { leseZertifikat, signierePdf } from './services/export/pdfSignatur'
import type { PaketArt } from './services/paket/paket'
import { leseProtokoll, protokolliere } from './services/protokoll'
import { mitWiederholung } from './services/ai/wiederholung'
import { leseVerbrauch, merkeVerbrauch } from './services/ai/verbrauch'
import type { LanStatus } from './services/lanServer'
import type { SicherungsEintrag } from './services/storage/autoSicherung'

/** Registriert einen Aufruf; Fehler kommen als lesbare Meldung in der Oberfläche an (Sache der Umgebung). */
export type Handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) => void

/** Daten einer auszugebenden Datei – als Funktion erst NACH dem Dialog gebaut (teure PDFs) */
export type AusgabeDaten = Uint8Array | string | (() => Promise<Uint8Array | string>)

/**
 * PDF erzeugen und drucken. Am PC ein unsichtbares Electron-Fenster (services/export/pdf.ts),
 * auf dem iPad das native Plugin PdfDruck (WKWebView + UIPrintInteractionController).
 */
export interface Druckmaschine {
  /** Reines PDF (A4, Hintergründe, CSS-Seitengröße) */
  pdf(html: string): Promise<Uint8Array>
  /** PDF und – im selben Durchgang – das Ergebnis des Messskripts (fillablePdf.MEASURE_SCRIPT) */
  messenUndPdf(html: string, skript: string): Promise<{ pdf: Uint8Array; messung: unknown }>
  /** Ohne Optionen: Druckdialog des Geräts; mit Optionen (nur PC): direkt drucken */
  drucken(html: string, optionen?: PrintOptions): Promise<void>
  /** Drucker zur Auswahl in der Druckvorschau (iPad: leer – dort wählt AirPrint) */
  drucker(): Promise<PrinterInfo[]>
}

/** Was je Gerät verschieden ist */
export interface Umgebung {
  /** Ein Ereignis zu EINER Anfrage (Fortschritt, Warteplatz) dorthin, wo sie herkam */
  sende(kanal: string, wert: unknown): void
  /** Ein Ereignis, das alle angeht (z. B. geänderte KI-Modelle) */
  rundruf(kanal: string, wert: unknown): void
  /** Ein Ereignis nur an die eigene Oberfläche (Einrichtung des Abo-Zugangs) */
  anOberflaeche(kanal: string, wert: unknown): void
  /** Das Schließen des Fensters (PC); auf dem iPad ohne Wirkung */
  fenster: { gesichert(): void; rueckfrage(): void; bleiben(): void }
  /**
   * Eine Datei ausgeben: am PC mit Speichern-Dialog, auf dem iPad nach Dokumente/Ausgaben und
   * über das Teilen-Menü. Liefert den Pfad oder null (abgebrochen).
   */
  dateiAusgeben(name: string, filters: FileFilter[], daten: AusgabeDaten): Promise<string | null>
  /** Eine Datei wählen; liefert einen lesbaren Pfad (iPad: Kopie unter /tmp) oder null */
  dateiWaehlen(filters: FileFilter[], titel?: string): Promise<string | null>
  /** Ordner für mehrere Dateien; iPad: ein neuer Ordner unter Dokumente/Ausgaben */
  ordnerWaehlen(titel?: string): Promise<string | null>
  /** Den Ordner zeigen (PC: Explorer) bzw. seine Dateien teilen (iPad) */
  ordnerZeigen(ordner: string): Promise<void>
  /** Eine Datei im Ordner zeigen (PC) bzw. teilen (iPad) */
  imOrdnerZeigen(pfad: string): Promise<void>
  /** Datei, mit der die App gestartet wurde (Doppelklick auf .vokabeltest), sonst null */
  startDatei(): string | null
  /** Beim Start übergebenes Schulpaket (einmal abholbar), sonst null */
  startPaket(): string | null
  druck: Druckmaschine
  /** Zertifikat (.pfx/.p12) zum Signieren wählen; liefert den Pfad oder null */
  zertifikatWaehlen(): Promise<string | null>
  /** Automatische Sicherung – am PC unter userData/sicherungen, auf dem iPad unter Dokumente/Sicherungen */
  sicherungen: {
    liste(): SicherungsEintrag[] | Promise<SicherungsEintrag[]>
    laden(name: string): Uint8Array | Promise<Uint8Array>
    jetzt(): SicherungsEintrag | Promise<SicherungsEintrag>
    /** Ordner für eine Kopie wählen (PC); iPad: null */
    ordnerWaehlen(): Promise<string | null>
  }
  /** Zugang aus dem lokalen Netz – nur am PC */
  lan: { status(): LanStatus; start(): Promise<LanStatus>; stop(): LanStatus } | null
}

/** Meldung, wenn eine Funktion nur am PC existiert */
export const NUR_AM_PC = 'Diese Funktion gibt es nur in der App am PC.'

type PdfExtras = {
  fillable?: boolean
  audio?: { id: string; fileName: string; title: string; base64: string }[]
  /** Digital signieren mit dem Zertifikat aus den Einstellungen (Elternbriefe, 29.09.2026) */
  signatur?: { passwort: string; grund?: string; name?: string }
}

export function registriereKanaele(handle: Handle, u: Umgebung): void {
  /** Höchstens drei KI-Anfragen zugleich; wer wartet, erfährt es (Auftragsleiste der Oberfläche) */
  const kiPlaetze = new KiPlaetze(3, (id, zustand, info) => u.sende('ai:platz', { id, zustand, ...info }))

  /** Modelllisten im Hintergrund aktualisieren und die Oberfläche über Modellwechsel informieren. */
  const updateModelsInBackground = async (): Promise<void> => {
    try {
      const notes = await healModelSelection()
      if (notes.length) u.rundruf('models:updated', notes)
    } catch {
      // Ohne Internet bleibt die zuletzt bekannte Liste aktiv
    }
  }

  /*
   * Der Zugang aus dem lokalen Netz – nur am PC. Auf dem iPad gibt es die Aufrufe trotzdem,
   * mit einer klaren Meldung: Die Oberfläche blendet den Reiter dort ohnehin aus.
   */
  const lan = u.lan
  handle('lan:status', () => (lan ? lan.status() : { laeuft: false, wunschPort: 0, adresse: '', port: 0, angemeldet: 0, gesperrt: false }))
  handle('lan:start', () => {
    if (!lan) throw new Error(NUR_AM_PC)
    return lan.start()
  })
  handle('lan:stop', () => {
    if (!lan) throw new Error(NUR_AM_PC)
    return lan.stop()
  })

  // Die Oberfläche hat vor dem Schließen alles gesichert (siehe main/index.ts, createWindow)
  handle('fenster:gesichert', () => u.fenster.gesichert())
  handle('fenster:rueckfrage', () => u.fenster.rueckfrage())
  handle('fenster:bleiben', () => u.fenster.bleiben())
  handle('settings:get', () => getSettings())
  handle('settings:set', (patch: DeepPartial<AppSettings>) => setSettings(patch))
  handle('secrets:set', (name: SecretName, value: string) => {
    setSecret(name, value)
    if (value && AI_PROVIDERS.some((p) => p.id === name)) void updateModelsInBackground()
  })
  handle('secrets:has', (name: SecretName) => Boolean(getSecret(name)))

  /*
   * Wartung: sichern und auf den Werkszustand zurücksetzen.
   *
   * Diese Aufrufe stehen bewusst NICHT in der Erlaubnisliste des Netzzugangs
   * (services/lanServer.ts): Vom Tablet aus soll niemand die Ablage des Rechners leeren
   * können, auch nicht versehentlich.
   */
  handle('wartung:bestand', () => bestand())
  handle('wartung:sicherung', () => sicherung())
  handle('wartung:zuruecksetzen', () => werkszustand())
  handle('wartung:pruefen', (daten: Uint8Array) => pruefeSicherung(daten))
  handle('wartung:wiederherstellen', (daten: Uint8Array) => wiederherstellen(daten))
  // Automatische Sicherung und Protokoll (27.09.2026)
  handle('wartung:sicherungen', () => u.sicherungen.liste())
  handle('wartung:sicherungLaden', (name: string) => u.sicherungen.laden(name))
  handle('wartung:sichereJetzt', () => u.sicherungen.jetzt())
  handle('wartung:hoertexte', () => verwaisteHoertexte())
  handle('wartung:hoertexteAufraeumen', () => raeumeHoertexteAuf())
  handle('wartung:sicherungsOrdner', () => u.sicherungen.ordnerWaehlen())
  handle('protokoll:melden', (text: string) => protokolliere('fehler', 'oberflaeche', String(text ?? '').slice(0, 2000)))
  handle('protokoll:speichern', () =>
    u.dateiAusgeben(`Schul-Apps Protokoll ${new Date().toISOString().slice(0, 10)}.log`, [{ name: 'Protokoll', extensions: ['log'] }], leseProtokoll())
  )

  handle('ai:status', () => aiStatus())
  const PING: StructuredRequest = {
    system: 'Antworte nur mit dem verlangten JSON.',
    user: 'Gib ok=true zurück.',
    schemaName: 'verbindungstest',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }
  }
  handle('ai:test', async (provider: AiProviderId) => {
    const models = await refreshProvider(provider)
    await updateModelsInBackground()
    // Die Modellliste funktioniert auch ohne Guthaben – deshalb eine winzige echte Anfrage mit dem gewählten Modell
    const { ai } = getSettings()
    await createProvider(provider).structured(PING, ai.textModels[provider])
    return models.length
  })
  handle('ai:subscription-status', (provider: AiProviderId) => subscriptionStatus(provider))
  handle('ai:subscription-models', (provider: AiProviderId) => subscriptionModels(provider))
  /** Testbild über das Abo (unabhängig von der gewählten Bild-KI) */
  handle('ai:subscription-image-test', (provider: AiProviderId) => {
    const { ai } = getSettings()
    if (!ai.subscriptionAccepted[provider]) throw new Error('Bitte zuerst den Hinweis zu den Nutzungsbedingungen bestätigen.')
    return createCliProvider(provider).generateImage!(
      'A simple black-and-white line drawing in pictogram style showing: an apple. Thick clean outlines, plain white background, no text.',
      ai.subscriptionModels[provider]
    )
  })
  // Einrichtung ohne Terminal: Programm laden und Anmeldung im Browser starten; Fortschritt per Ereignis
  const emitSetup = (event: SetupEvent): void => u.anOberflaeche('ai:setup-event', event)
  handle('ai:install', async (provider: AiProviderId) => {
    await installCli(provider, emitSetup)
  })
  handle('ai:login-start', (provider: AiProviderId) => startLogin(provider, emitSetup, async () => (await subscriptionStatus(provider)).loggedIn === true))
  handle('ai:login-code', (provider: AiProviderId, code: string) => submitLoginCode(provider, code))
  handle('ai:login-cancel', (provider: AiProviderId) => cancelLogin(provider))
  handle('ai:login-open', (url: string) => reopenLoginPage(url))
  /** Echte Mini-Anfrage über das Abo; liefert die Dauer in Sekunden. */
  handle('ai:subscription-test', async (provider: AiProviderId) => {
    const started = Date.now()
    const { provider: cli, model } = createTextProvider(provider)
    const res = await cli.structured<{ ok: boolean }>(PING, model)
    if (res?.ok !== true) throw new Error('Unerwartete Antwort der KI.')
    return Math.round((Date.now() - started) / 100) / 10
  })
  handle('ai:models', (provider: AiProviderId, kind: ModelKind, refresh: boolean) => getModelList(provider, kind, refresh))
  /*
   * KI-Anfragen laufen über die gemeinsame Begrenzung (höchstens drei zugleich, siehe
   * services/ai/kiPlaetze.ts). Wer warten muss, wird der Oberfläche gemeldet; mit der
   * Kennung der Anfrage lässt sie sich über `ai:cancel` abbrechen.
   */
  handle('ai:structured', (req: StructuredRequest) => {
    // Ein Auftrag darf ein anderes (stärkeres) Modell verlangen als das eingestellte
    const { provider, model } = createTextProvider(req.provider ?? getSettings().ai.textProvider)
    const id = req.progressId
    // Fortschritt melden, aber höchstens fünfmal je Sekunde – sonst überflutet es die Oberfläche
    let last = 0
    const onChunk = id
      ? (chars: number): void => {
          const now = Date.now()
          if (now - last < 200) return
          last = now
          u.sende('ai:progress', { id, chars })
        }
      : undefined
    const anbieter = req.provider ?? getSettings().ai.textProvider
    const modell = req.model || model
    merkeVerbrauch(anbieter, modell, { anfragen: 1 })
    // Einmal wiederholen bei kaputter, abgeschnittener oder leerer Antwort und Serverfehlern (27.09.2026)
    return kiPlaetze.platz(id, (signal) =>
      mitWiederholung(
        req,
        (r) => provider.structured(r, modell, onChunk, signal),
        ({ art, meldung }) => {
          if (signal.aborted) return
          protokolliere('warnung', 'ki', `${req.schemaName ?? 'Anfrage'}: Wiederholung (${art}) – ${meldung}`)
          merkeVerbrauch(anbieter, modell, { anfragen: 1, wiederholungen: 1 })
        }
      )
    )
  })
  handle('ai:cancel', (id: string) => {
    kiPlaetze.abbrechen(id)
  })
  /*
   * Websuche nach Fundstellen fuer Originalmaterial.
   *
   * Nicht jeder Anbieter kann das. Fehlt die Faehigkeit oder scheitert die Suche, bleibt es
   * bei den Archiven, die die App selbst durchsucht – dann gibt es weniger Auswahl, aber
   * keinen Fehler. Eine leere Liste ist hier eine Antwort, kein Defekt. Ein ABBRUCH dagegen
   * wird weitergereicht: Der Auftrag, zu dem die Suche gehört, soll enden.
   */
  handle('ai:websuche', async (auftrag: string, id?: string) => {
    const { provider, model } = createTextProvider(getSettings().ai.textProvider)
    if (!provider.websuche) return []
    try {
      return await kiPlaetze.platz(id, (signal) => provider.websuche!(auftrag, model, signal), 'websuche')
    } catch (e) {
      if (istAbbruch(e)) throw e
      return []
    }
  })
  handle('ai:image', (prompt: string, id?: string) => {
    merkeVerbrauch(getSettings().ai.imageProvider, '', { bilder: 1 })
    return kiPlaetze.platz(id, (signal) => generateImage(prompt, signal), 'bild')
  })
  handle('verbrauch:get', () => leseVerbrauch())

  handle('cefr:get', () => getCefrTable())

  handle('branding:get-logo', () => getLogo())
  handle('branding:set-logo', (dataUrl: string) => setLogo(dataUrl))
  handle('branding:remove-logo', () => removeLogo())
  // Unterschrift (29.09.2026) – im Netzzugang gesperrt (nicht in ERLAUBTE_KANAELE)
  handle('branding:get-unterschrift', () => getUnterschrift())
  handle('branding:set-unterschrift', (dataUrl: string) => setUnterschrift(dataUrl))
  handle('branding:remove-unterschrift', () => removeUnterschrift())
  handle('briefkopf:zertifikat', () => u.zertifikatWaehlen())

  handle('pictograms:get', () => getPictograms())
  handle('pictograms:set', (id: string, dataUrl: string) => setPictogram(id, dataUrl))
  handle('pictograms:remove', (id: string) => removePictogram(id))
  handle('pictograms:reset', () => removeAllPictograms())

  handle('designs:list', () => listDesigns())
  handle('designs:save', (design: DesignTemplate) => saveDesign(design))
  handle('designs:delete', (id: string) => deleteDesign(id))
  handle('designs:set-default', (id: string) => setDefaultDesign(id))

  handle('tests:list', () => listTests())
  handle('tests:get', (id: string) => getTest(id))
  handle('tests:save', (input: SavedTestInput) => saveTest(input))
  handle('tests:delete', (id: string) => deleteTest(id))
  handle('exams:list', () => listExams())
  handle('exams:get', (id: string) => getExam(id))
  handle('exams:save', (input: SavedExamInput) => saveExam(input))
  handle('exams:delete', (id: string) => deleteExam(id))
  // Neue Programme (Großprogramm 0.4): Rückmeldung und Elternbrief – gemeinsame Ablage (storage/dokumente.ts)
  handle('rueckmeldungen:list', () => ABLAGEN.rueckmeldungen.list())
  handle('rueckmeldungen:get', (id: string) => ABLAGEN.rueckmeldungen.get(id))
  handle('rueckmeldungen:save', (input: DokumentEingabe) => ABLAGEN.rueckmeldungen.save(input))
  handle('rueckmeldungen:delete', (id: string) => ABLAGEN.rueckmeldungen.delete(id))
  handle('elternbriefe:list', () => ABLAGEN.elternbriefe.list())
  handle('elternbriefe:get', (id: string) => ABLAGEN.elternbriefe.get(id))
  handle('elternbriefe:save', (input: DokumentEingabe) => ABLAGEN.elternbriefe.save(input))
  handle('elternbriefe:delete', (id: string) => ABLAGEN.elternbriefe.delete(id))
  handle('bewertungstabellen:list', () => ABLAGEN.bewertungstabellen.list())
  handle('bewertungstabellen:get', (id: string) => ABLAGEN.bewertungstabellen.get(id))
  handle('bewertungstabellen:save', (input: DokumentEingabe) => ABLAGEN.bewertungstabellen.save(input))
  handle('bewertungstabellen:delete', (id: string) => ABLAGEN.bewertungstabellen.delete(id))
  handle('nachteilsausgleiche:list', () => ABLAGEN.nachteilsausgleiche.list())
  handle('nachteilsausgleiche:get', (id: string) => ABLAGEN.nachteilsausgleiche.get(id))
  handle('nachteilsausgleiche:save', (input: DokumentEingabe) => ABLAGEN.nachteilsausgleiche.save(input))
  handle('nachteilsausgleiche:delete', (id: string) => ABLAGEN.nachteilsausgleiche.delete(id))

  handle('grammarTests:list', () => listGrammarTests())
  handle('grammarTests:get', (id: string) => getGrammarTest(id))
  handle('grammarTests:save', (input: SavedGrammarTestInput) => saveGrammarTest(input))
  handle('grammarTests:delete', (id: string) => deleteGrammarTest(id))
  handle('kurztests:list', () => listKurztests())
  handle('kurztests:get', (id: string) => getKurztest(id))
  handle('kurztests:save', (input: SavedKurztestInput) => saveKurztest(input))
  handle('kurztests:delete', (id: string) => deleteKurztest(id))
  handle('sheets:list', () => listWorksheets())
  handle('sheets:get', (id: string) => getWorksheet(id))
  handle('sheets:save', (input: SavedWorksheetInput) => saveWorksheet(input))
  handle('sheets:delete', (id: string) => deleteWorksheet(id))
  handle('textbooks:list', () => listTextbooks())
  handle('textbooks:get', (id: string) => getTextbook(id))
  handle('textbooks:save', (books: Textbook[]) => saveTextbooks(books))
  handle('textbooks:delete', (id: string) => deleteTextbook(id))
  /*
   * Themenbereiche (Paket 10b): Bereiche je Fach und die Zuordnung der Materialien. Löschen
   * heißt wie bei den Materialien `…:delete` und ist damit über das Netz gesperrt.
   */
  handle('themen:list', () => leseThemen())
  // Lehrplan-Themen je Land für die Hierarchie der Themenbereiche (Paket 12); null = Datei fehlt
  handle('lehrplan:themen', (stateId: string) => leseLehrplan(stateId))
  // Schulsuche beim Schulnamen (Paket 13): gesucht wird hier, die Oberfläche bekommt nur die Treffer
  handle('schulen:suche', (text: string, opt: SuchOptionen) => schulenSuchen(text, opt))
  handle('schulen:logo', (id: string) => schulLogo(id))
  handle('schulen:quellen', () => schulQuellen())
  handle('themen:bereich', (b: Pick<Themenbereich, 'id' | 'fachId' | 'name'> & Partial<Themenbereich>) => themenBereichSetzen(b))
  handle('themen:delete', (id: string) => themenBereichLoeschen(id))
  handle('themen:verschieben', (id: string, elternId: string | null) => themenBereichVerschieben(id, elternId))
  handle('themen:zuordnen', (eintraege: Record<string, Zuordnung | null>) => themenZuordnen(eintraege))
  handle('themen:uebernehmen', (vorschlaege: BereichsUebernahme[], automatik: string[]) => themenUebernehmen(vorschlaege, automatik))
  handle('themen:reihenfolge', (schluessel: string, liste: string[]) => themenReihenfolge(schluessel, liste))
  handle('themen:automatik', (fachId: string, an: boolean) => themenAutomatik(fachId, an))
  handle('library:list', () => listVocabLists())
  handle('library:save', (list: SavedVocabList) => saveVocabList(list))
  handle('library:delete', (id: string) => deleteVocabList(id))

  handle('images:openmoji-search', (q: string) => searchOpenMoji(q))
  handle('images:openmoji-svg', (hex: string) => getOpenMojiSvg(hex))
  handle('images:online-search', (q: string, source: OnlineImageSource) => searchOnline(q, source, getSecret('pixabay')))
  handle('images:fetch', (url: string) => fetchAsDataUrl(url))
  handle('sources:check-quote', (url: string, quote: string) => checkQuote(url, quote))
  // Ton-/Filmquellen: erreichbar, und handelt die Seite von dem, was die KI behauptet?
  handle('sources:check-media', (url: string, expect: string[]) => checkMediaSource(url, expect))
  /*
   * Die App sucht und laedt SELBST. Nur was sie gelesen hat, darf als Originaltext aufs
   * Blatt – eine Fundstelle aus dem Gedaechtnis des Sprachmodells kann erfunden sein.
   */
  handle('sources:suche', (anfrage: Materialanfrage) => sucheOriginalquellen(anfrage))
  handle('sources:laden', (url: string) => ladeOriginalquelle(url))
  // Video als Material: Titel, Beschreibung, Transkript aus den Untertiteln (26.09.2026)
  handle('sources:video', (url: string) => ladeVideo(url))
  // Maskottchen für Illustrationen (26.09.2026)
  handle('maskottchen:list', () => listMaskottchen())
  handle('maskottchen:save', (eingabe: { id: string; name: string; beschreibung: string; quelle: 'ki' | 'upload'; vorlage?: string }) =>
    saveMaskottchen(eingabe)
  )
  handle('maskottchen:pose', (id: string, pose: string, dataUrl: string) => savePose(id, pose, dataUrl))
  handle('maskottchen:delete-pose', (id: string, pose: string) => deletePose(id, pose))
  handle('maskottchen:delete', (id: string) => deleteMaskottchen(id))

  handle('audio:voices', () => listVoices())
  handle('audio:speak', (req: TtsRequest) => speak(req))
  handle('audio:preview', (voiceId: string) => previewVoice(voiceId))
  handle('audio:read', (fileName: string) => readAudio(fileName))
  // Original-Hördatei (MP3) der Lehrkraft übernehmen, etwa von der Verlags-CD (29.09.2026)
  handle('audio:import', (id: string, daten: Uint8Array) => importiereAudio(id, daten))
  handle('audio:show', (fileName: string) => u.imOrdnerZeigen(audioPath(fileName)))

  handle('files:docx-html', (data: Uint8Array) => docxToHtml(data))
  handle('files:save', (defaultName: string, filters: FileFilter[], data: Uint8Array | string) => u.dateiAusgeben(defaultName, filters, data))
  handle('files:open', async (filters: FileFilter[]) => {
    const path = await u.dateiWaehlen(filters)
    if (!path) return null
    return { name: basename(path), data: new Uint8Array(readFileSync(path)) }
  })
  handle('files:launch-file', () => {
    const path = u.startDatei()
    if (!path) return null
    return { name: basename(path), data: new Uint8Array(readFileSync(path)) }
  })
  handle('files:show', (path: string) => u.imOrdnerZeigen(path))
  // Schulpaket (Großprogramm 0.4, F8): Material als Datei weitergeben und einlesen
  handle('paket:erstellen', (titel: string, auswahl: { art: PaketArt; id: string }[]) => {
    const daten = erstellePaket(String(titel ?? '').trim() || 'Schulpaket', auswahl)
    const name = (String(titel ?? '').trim() || 'Schulpaket').replace(/[\\/:*?"<>|]/g, '-')
    return u.dateiAusgeben(`${name}.schulpaket`, [{ name: 'Schulpaket', extensions: ['schulpaket'] }], daten)
  })
  handle('paket:oeffnen', async () => {
    const pfad = await u.dateiWaehlen([{ name: 'Schulpaket', extensions: ['schulpaket', 'zip'] }])
    return pfad ? oeffnePaket(pfad) : null
  })
  handle('paket:einlesen', () => leseGeoeffnetesPaketEin())
  // Per Doppelklick bzw. „Öffnen mit" übergebenes Paket – die Startseite fragt einmal danach
  handle('paket:startdatei', () => {
    const pfad = u.startPaket()
    return pfad ? oeffnePaket(pfad) : null
  })

  /*
   * Mehrere Dateien in EINEN Ordner (Anlass 25.09.2026): Beim Arbeitsblatt entstanden Blatt,
   * Lösungen, Tafelbild und Hörtexte – mit je einem Speichern-Dialog, bis zu fünf
   * hintereinander. Jetzt wird einmal ein Ordner gewählt und alles dort abgelegt. Ohne den
   * Dialog von Windows fehlt dessen Rückfrage „Ersetzen?"; vorhandene Dateien bekommen
   * deshalb nie einen stummen Nachfolger, sondern der neue Name ein „(2)" (shared/dateiname.ts).
   *
   * Nicht in der Freigabe des Netzzugangs: Ein Ordner auf DIESEM Rechner hat für ein Tablet
   * keinen Sinn, dort wird weiter heruntergeladen (renderer/shared/netzZugang.ts).
   */
  handle('files:choose-folder', (title?: string) => u.ordnerWaehlen(title))
  const inOrdnerSchreiben = (ordner: string, name: string, daten: Buffer | string): string => {
    const ziel = join(
      ordner,
      freierDateiname(basename(name), (n) => existsSync(join(ordner, n)))
    )
    writeFileSync(ziel, daten)
    return ziel
  }
  handle('files:save-in-folder', (ordner: string, name: string, data: Uint8Array | string) =>
    inOrdnerSchreiben(ordner, name, typeof data === 'string' ? data : Buffer.from(data))
  )
  handle('files:open-folder', (ordner: string) => u.ordnerZeigen(ordner))

  /** Messen und Drucken über die Druckmaschine der Umgebung (für Formularfelder und Hörtexte) */
  const messen: Messen = async (html) => {
    const { pdf, messung } = await u.druck.messenUndPdf(html, MEASURE_SCRIPT)
    const m = (messung ?? {}) as Partial<Gemessen>
    return {
      pdf: Buffer.from(pdf),
      felder: m.felder ?? [],
      audios: m.audios ?? [],
      seite: m.seite ?? { widthPx: 0, heightPx: 0 }
    }
  }

  const pdfBytes = async (html: string, opts?: PdfExtras): Promise<Buffer> => {
    const audio = (opts?.audio ?? []).map((a) => ({ id: a.id, fileName: a.fileName, title: a.title, bytes: Buffer.from(a.base64, 'base64') }))
    // Nur den teuren Weg gehen, wenn auch etwas hinzukommt
    const roh = opts?.fillable || audio.length ? await htmlToPdfWithExtras(html, { fillable: opts?.fillable, audio }, messen) : await u.druck.pdf(html)
    // Erzeuger und KI-Kennzeichnung ins Info-Verzeichnis (Großprogramm 0.4)
    const mitMeta = await mitPdfMetadaten(new Uint8Array(roh), html)
    if (!opts?.signatur) return Buffer.from(mitMeta)
    // Signieren zuletzt – jede spätere Änderung würde die Signatur ungültig machen
    const { briefkopf } = getSettings()
    return Buffer.from(
      await signierePdf(mitMeta, leseZertifikat(briefkopf?.zertifikat), opts.signatur.passwort, {
        grund: opts.signatur.grund,
        name: opts.signatur.name,
        ort: briefkopf?.ort
      })
    )
  }

  /**
   * PDF speichern. `fillable` erzeugt statt des reinen Abbilds ein Formular: Auf den
   * Schreiblinien lässt sich tippen, Kästchen lassen sich ankreuzen.
   */
  handle('export:pdf', (html: string, defaultName: string, opts?: PdfExtras) =>
    u.dateiAusgeben(defaultName, [{ name: 'PDF', extensions: ['pdf'] }], () => pdfBytes(html, opts))
  )
  /** Dasselbe PDF ohne Dialog in einen schon gewählten Ordner (siehe `files:choose-folder`) */
  handle('export:pdf-in-folder', async (ordner: string, html: string, name: string, opts?: PdfExtras) =>
    inOrdnerSchreiben(ordner, name, await pdfBytes(html, opts))
  )
  handle('export:print', (html: string, options?: PrintOptions) => u.druck.drucken(html, options))
  /** Druckvorschau: PDF-Daten zum Anzeigen der Seiten */
  handle('export:preview', async (html: string) => new Uint8Array(await u.druck.pdf(html)))
  /** Dieselben Daten als Formular – für die Prüfung und für eine Vorschau ohne Speichern */
  handle('export:fillable-preview', async (html: string, audio?: { id: string; fileName: string; title: string; base64: string }[]) => {
    const dateien = (audio ?? []).map((a) => ({ id: a.id, fileName: a.fileName, title: a.title, bytes: Buffer.from(a.base64, 'base64') }))
    return new Uint8Array(await htmlToPdfWithExtras(html, { fillable: true, audio: dateien }, messen))
  })
  handle('export:printers', () => u.druck.drucker())

  // Beim Start und danach alle 12 Stunden die Modelllisten abgleichen – das Anstoßen ist Sache der Umgebung
  aktualisiereModelle = updateModelsInBackground
}

/** Nach `registriereKanaele` verfügbar: Modelllisten im Hintergrund abgleichen */
export let aktualisiereModelle: () => Promise<void> = async () => undefined

function aiStatus(): AiStatus {
  const { ai } = getSettings()
  const img = ai.imageProvider
  const imageAccess = img === 'none' ? 'api' : ai.imageAccess[img]
  const imageModel =
    img === 'none'
      ? ''
      : img === 'anthropic'
      ? imageAccess === 'subscription'
        ? ai.subscriptionModels.anthropic
        : ai.textModels.anthropic
      : imageAccess === 'subscription'
      ? ''
      : ai.imageModels[img]
  return {
    textProvider: ai.textProvider,
    textModel: ai.access[ai.textProvider] === 'subscription' ? ai.subscriptionModels[ai.textProvider] : ai.textModels[ai.textProvider],
    textAccess: ai.access[ai.textProvider],
    // Mit der Attrappe der Oberflächentests (nie im Betrieb) gilt die KI als eingerichtet
    hasTextKey:
      attrappeAktiv() || (ai.access[ai.textProvider] === 'subscription' ? ai.subscriptionAccepted[ai.textProvider] : Boolean(getSecret(ai.textProvider))),
    imageProvider: ai.imageProvider,
    imageModel,
    imageAccess,
    hasImageKey: img !== 'none' && (imageAccess === 'subscription' ? ai.subscriptionAccepted[img] : Boolean(getSecret(img))),
    economy: economyActive(ai),
    // Hörtexte über ElevenLabs oder – seit Großprogramm 0.4 (F6) – über einen OpenAI-API-Schlüssel
    hasTts: Boolean(getSecret('elevenlabs') || getSecret('openai')),
    textOptions: textOptions(ai)
  }
}

/**
 * Anbieter, über die Text erzeugt werden kann. Programme, die für einen einzelnen Auftrag
 * ein stärkeres Modell anbieten (Hörtexte), zeigen daraus ihre Auswahl.
 */
function textOptions(ai: AppSettings['ai']): AiStatus['textOptions'] {
  return AI_PROVIDERS.filter((p) => (ai.access[p.id] === 'subscription' ? ai.subscriptionAccepted[p.id] : Boolean(getSecret(p.id)))).map((p) => {
    const model = ai.access[p.id] === 'subscription' ? ai.subscriptionModels[p.id] : ai.textModels[p.id]
    return { provider: p.id, model, label: `${p.label}${model ? ` · ${model}` : ''}` }
  })
}

/** Bild erzeugen – über API-Schlüssel oder Abo; Claude zeichnet in beiden Fällen eine Vektorgrafik. */
async function generateImage(prompt: string, signal?: AbortSignal): Promise<string> {
  const { ai } = getSettings()
  const img = ai.imageProvider
  if (img === 'none') throw new Error('Es ist keine KI für Bilder ausgewählt (Einstellungen).')
  if (ai.imageAccess[img] === 'subscription') {
    if (!ai.subscriptionAccepted[img]) {
      throw new Error('Der Abo-Zugang für Bilder ist noch nicht freigegeben. Bitte in den Einstellungen den Hinweis bestätigen.')
    }
    const cli = createCliProvider(img)
    return cli.generateImage!(prompt, ai.subscriptionModels[img], signal)
  }
  if (img === 'anthropic') return generateSvgImage(createProvider('anthropic'), ai.textModels.anthropic, prompt, signal)
  const provider = createProvider(img)
  if (!provider.generateImage) throw new Error('Dieser Anbieter kann keine Bilder erzeugen.')
  return provider.generateImage(prompt, ai.imageModels[img], signal)
}
