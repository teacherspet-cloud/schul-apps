import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
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
import { cleanupWorkDirs, createCliProvider, subscriptionModels, subscriptionStatus } from './services/ai/cli'
import { generateSvgImage } from './services/ai/svg'
import { KiPlaetze } from './services/ai/kiPlaetze'
import { attrappeAktiv } from './services/ai/attrappe'
import { istAbbruch } from '@shared/abbruch'
import { freierDateiname } from '@shared/dateiname'
import { cancelLogin, installCli, reopenLoginPage, startLogin, submitLoginCode } from './services/ai/setup'
import { createProvider, createTextProvider, getModelList, healModelSelection, refreshProvider } from './services/ai/models'
import { htmlToPdf, PrintOptions, printHtml } from './services/export/pdf'
import { htmlToPdfWithExtras } from './services/export/fillablePdf'
import { fetchAsDataUrl, getOpenMojiSvg, searchOnline, searchOpenMoji } from './services/images/images'
import { checkMediaSource, checkQuote } from './services/images/sources'
import { ladeOriginalquelle, sucheOriginalquellen } from './services/sources/materialSuche'
import { audioPath, listVoices, previewVoice, readAudio, speak } from './services/audio/elevenlabs'
import { deleteTextbook, getTextbook, listTextbooks, saveTextbooks } from './services/storage/textbooks'
import { deleteExam, getExam, listExams, saveExam } from './services/storage/exams'
import { deleteWorksheet, getWorksheet, listWorksheets, saveWorksheet } from './services/storage/worksheets'
import { docxToHtml } from './services/ocr/docx'
import type { DesignTemplate } from '@shared/design'
import { getLogo, removeLogo, setLogo } from './services/storage/branding'
import { getPictograms, removeAllPictograms, removePictogram, setPictogram } from './services/storage/pictograms'
import { deleteGrammarTest, getGrammarTest, listGrammarTests, saveGrammarTest } from './services/storage/grammarTests'
import { deleteKurztest, getKurztest, listKurztests, saveKurztest } from './services/storage/kurztests'
import { deleteDesign, listDesigns, saveDesign, setDefaultDesign } from './services/storage/designs'
import { getCefrTable } from './services/storage/cefr'
import { deleteTest, getTest, listTests, saveTest } from './services/storage/vocabTests'
import { deleteVocabList, getSecret, getSettings, listVocabLists, saveVocabList, setSecret, setSettings } from './services/storage/settings'
import { bestand, pruefeSicherung, sicherung, werkszustand, wiederherstellen } from './services/storage/wartung'
import { lanEreignis, lanRundruf, lanStatus, startLan, stopLan } from './services/lanServer'
import { begrenzeStand, FensterStand, leseStand, MINDEST_GROESSE, STANDARD_GROESSE } from './fensterStand'
// Kopiert electron-vite beim Bauen nach out/ und liefert den Pfad (liegt damit auch in der .exe)
import fensterSymbol from '../../build/icon.ico?asset'

let mainWindow: BrowserWindow | null = null

/**
 * Ein Ereignis zu EINER Anfrage (Fortschritt, Warteplatz) dorthin schicken, wo sie herkam.
 *
 * Kam sie von einem Gerät im Netz, geht das Ereignis nur an dieses Gerät (services/lanServer.ts,
 * `lanEreignis`) – nicht ans Fenster, damit Rechner und Tablet sich nicht in die Quere kommen.
 */
function sendeEreignis(kanal: string, wert: unknown): void {
  if (lanEreignis(kanal, wert)) return
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(kanal, wert)
}

/** Ein Ereignis, das alle angeht (z. B. geänderte KI-Modelle): ans Fenster und an jedes angemeldete Gerät. */
function rundruf(kanal: string, wert: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(kanal, wert)
  lanRundruf(kanal, wert)
}

/** Höchstens drei KI-Anfragen zugleich; wer wartet, erfährt es (Auftragsleiste der Oberfläche) */
const kiPlaetze = new KiPlaetze(3, (id, zustand, info) => sendeEreignis('ai:platz', { id, zustand, ...info }))

/**
 * Wie lange das Fenster beim Schließen auf die Oberfläche wartet, bis alles gesichert ist.
 * Reagiert sie nicht (etwa weil sie hängt), geht das Fenster trotzdem zu – sonst ließe sich
 * das Programm gar nicht mehr beenden.
 */
const SICHERN_BEIM_SCHLIESSEN_MS = 3000

/** Meldung der Oberfläche „alles gesichert" – gesetzt, solange auf sie gewartet wird. */
let gesichert: (() => void) | null = null
/**
 * Die Oberfläche fragt nach (es laufen noch Aufträge): Die Frist von drei Sekunden hält an,
 * bis die Lehrkraft entschieden hat. `bleiben` bricht das Schließen ab.
 */
let rueckfrage: (() => void) | null = null
let bleiben: (() => void) | null = null

/** Gemerkte Fenstergröße und -lage (siehe fensterStand.ts) – je Rechner, nicht in der Sicherung */
const fensterDatei = (): string => join(app.getPath('userData'), 'fenster.json')

function ladeFensterStand(): FensterStand | null {
  try {
    if (!existsSync(fensterDatei())) return null
    const stand = leseStand(JSON.parse(readFileSync(fensterDatei(), 'utf-8')))
    return begrenzeStand(
      stand,
      screen.getAllDisplays().map((d) => d.workArea)
    )
  } catch {
    return null
  }
}

function merkeFensterStand(win: BrowserWindow): void {
  try {
    // getNormalBounds: die Größe VOR dem Maximieren – damit das Fenster beim Verkleinern wieder so wird
    const stand: FensterStand = { bounds: win.getNormalBounds(), maximiert: win.isMaximized() }
    writeFileSync(fensterDatei(), JSON.stringify(stand))
  } catch {
    // Merken ist Komfort – ein Fehler darf das Schließen nicht aufhalten
  }
}

function createWindow(): void {
  const stand = ladeFensterStand()
  mainWindow = new BrowserWindow({
    ...(stand ? stand.bounds : STANDARD_GROESSE),
    minWidth: MINDEST_GROESSE.width,
    minHeight: MINDEST_GROESSE.height,
    show: false,
    title: 'Schul-Apps',
    // Ohne eigenes Symbol zeigt das Fenster beim Entwickeln (npm run dev) das Electron-Symbol
    icon: fensterSymbol,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  mainWindow.on('ready-to-show', () => {
    if (stand?.maximiert) mainWindow?.maximize()
    mainWindow?.show()
  })

  /*
   * Vor dem Schließen die Oberfläche sichern lassen.
   *
   * Die Programme sichern mit ein bis zwei Sekunden Verzögerung. Wer direkt nach einer
   * Änderung das Fenster schloss, verlor sie bis 25.09.2026 still. Jetzt hält das Schließen
   * kurz an, die Oberfläche führt alles Anstehende sofort aus und meldet sich zurück – oder
   * nach drei Sekunden geht das Fenster ohnehin zu.
   */
  let schliessenErlaubt = false
  mainWindow.on('close', (e) => {
    const win = mainWindow
    if (win && !win.isDestroyed()) merkeFensterStand(win)
    if (schliessenErlaubt || !win || win.webContents.isDestroyed() || win.webContents.isCrashed()) return
    e.preventDefault()
    if (gesichert) return // Es wird schon gewartet – ein zweiter Klick aufs Kreuz ändert daran nichts
    const aufraeumen = (): void => {
      clearTimeout(zeit)
      gesichert = rueckfrage = bleiben = null
    }
    const zu = (): void => {
      aufraeumen()
      schliessenErlaubt = true
      if (!win.isDestroyed()) win.close()
    }
    const zeit = setTimeout(zu, SICHERN_BEIM_SCHLIESSEN_MS)
    gesichert = zu
    /*
     * Laufen noch Hintergrund-Aufträge, fragt die Oberfläche nach („trotzdem beenden?").
     * Solange die Frage offen ist, gilt die Frist nicht – sonst ginge das Fenster zu, während
     * die Lehrkraft noch liest.
     */
    rueckfrage = () => clearTimeout(zeit)
    bleiben = aufraeumen
    win.webContents.send('fenster:schliessen')
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // Dateien, die versehentlich neben die Drop-Fläche fallen, sollen die App nicht verlassen.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // Prüfmodus für automatisierte Qualitätsprüfungen (nur mit gesetzter Umgebungsvariable)
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), process.env.SCHULAPPS_SELFTEST === '1' ? { search: 'selftest=1' } : undefined)
  }
}

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
    hasTts: Boolean(getSecret('elevenlabs')),
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

/** Modelllisten im Hintergrund aktualisieren und die Oberfläche über Modellwechsel informieren. */
async function updateModelsInBackground(): Promise<void> {
  try {
    const notes = await healModelSelection()
    if (notes.length) rundruf('models:updated', notes)
  } catch {
    // Ohne Internet bleibt die zuletzt bekannte Liste aktiv
  }
}

/**
 * Alle registrierten Aufrufe – damit sie nicht nur über die Electron-Brücke erreichbar sind,
 * sondern auch über den Zugang aus dem lokalen Netz.
 *
 * WELCHE davon im Netz erlaubt sind, entscheidet die Erlaubnisliste in services/lanServer.ts.
 * Diese Sammlung weiß davon nichts; sie kennt nur alles, was es gibt.
 */
const aufrufe = new Map<string, (...args: unknown[]) => unknown>()

/** Registriert einen IPC-Handler; Fehler kommen als lesbare Meldung in der Oberfläche an. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  aufrufe.set(channel, fn as (...args: unknown[]) => unknown)
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...(args as A)) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

/**
 * Der Zugang aus dem lokalen Netz.
 *
 * Er läuft NUR, solange er eingeschaltet ist, und ist beim Start des Programms immer aus.
 * Beim Beenden wird er mitgenommen – ein Server, der nach dem Schließen des Fensters
 * weiterliefe, wäre genau die Art offener Tür, die niemand bemerkt.
 */
function registerLan(): void {
  handle('lan:status', () => lanStatus())
  handle('lan:start', async () => {
    const s = getSettings()
    const port = s.lan?.port || 8420
    const pin = s.lan?.pin || String(Math.floor(100000 + Math.random() * 900000))
    if (pin !== s.lan?.pin) setSettings({ lan: { port, pin } })
    return startLan({
      port,
      pin,
      wurzel: join(__dirname, '../renderer'),
      aufruf: async (channel, args) => {
        const fn = aufrufe.get(channel)
        if (!fn) throw new Error(`Unbekannter Aufruf „${channel}".`)
        return fn(...args)
      }
    })
  })
  handle('lan:stop', () => {
    stopLan()
    return lanStatus()
  })
}

function registerIpc(): void {
  registerLan()
  // Die Oberfläche hat vor dem Schließen alles gesichert (siehe createWindow)
  handle('fenster:gesichert', () => gesichert?.())
  handle('fenster:rueckfrage', () => rueckfrage?.())
  handle('fenster:bleiben', () => bleiben?.())
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
  const emitSetup = (event: SetupEvent): void => mainWindow?.webContents.send('ai:setup-event', event)
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
          sendeEreignis('ai:progress', { id, chars })
        }
      : undefined
    return kiPlaetze.platz(id, (signal) => provider.structured(req, req.model || model, onChunk, signal))
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
  handle('ai:image', (prompt: string, id?: string) => kiPlaetze.platz(id, (signal) => generateImage(prompt, signal), 'bild'))

  handle('cefr:get', () => getCefrTable())

  handle('branding:get-logo', () => getLogo())
  handle('branding:set-logo', (dataUrl: string) => setLogo(dataUrl))
  handle('branding:remove-logo', () => removeLogo())

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

  handle('audio:voices', () => listVoices())
  handle('audio:speak', (req: TtsRequest) => speak(req))
  handle('audio:preview', (voiceId: string) => previewVoice(voiceId))
  handle('audio:read', (fileName: string) => readAudio(fileName))
  handle('audio:show', (fileName: string) => shell.showItemInFolder(audioPath(fileName)))

  handle('files:docx-html', (data: Uint8Array) => docxToHtml(data))
  handle('files:save', async (defaultName: string, filters: FileFilter[], data: Uint8Array | string) => {
    const res = await dialog.showSaveDialog(mainWindow!, { defaultPath: defaultName, filters })
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, typeof data === 'string' ? data : Buffer.from(data))
    return res.filePath
  })
  handle('files:open', async (filters: FileFilter[]) => {
    const res = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters })
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    return { name: basename(path), data: new Uint8Array(readFileSync(path)) }
  })
  handle('files:launch-file', () => {
    const path = process.argv.slice(1).find((a) => a.toLowerCase().endsWith('.vokabeltest'))
    if (!path) return null
    return { name: basename(path), data: new Uint8Array(readFileSync(path)) }
  })
  handle('files:show', (path: string) => shell.showItemInFolder(path))

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
  let letzterOrdner: string | undefined
  handle('files:choose-folder', async (title?: string) => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: title ?? 'Ordner zum Speichern wählen',
      defaultPath: letzterOrdner,
      buttonLabel: 'Hier speichern',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    letzterOrdner = res.filePaths[0]
    return letzterOrdner
  })
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
  handle('files:open-folder', async (ordner: string) => {
    const fehler = await shell.openPath(ordner)
    if (fehler) throw new Error(fehler)
  })

  type PdfExtras = { fillable?: boolean; audio?: { id: string; fileName: string; title: string; base64: string }[] }
  const pdfBytes = async (html: string, opts?: PdfExtras): Promise<Buffer> => {
    const audio = (opts?.audio ?? []).map((a) => ({ id: a.id, fileName: a.fileName, title: a.title, bytes: Buffer.from(a.base64, 'base64') }))
    // Nur den teuren Weg gehen, wenn auch etwas hinzukommt
    return Buffer.from(opts?.fillable || audio.length ? await htmlToPdfWithExtras(html, { fillable: opts?.fillable, audio }) : await htmlToPdf(html))
  }

  /**
   * PDF speichern. `fillable` erzeugt statt des reinen Abbilds ein Formular: Auf den
   * Schreiblinien lässt sich tippen, Kästchen lassen sich ankreuzen.
   */
  handle('export:pdf', async (html: string, defaultName: string, opts?: PdfExtras) => {
    const res = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, await pdfBytes(html, opts))
    return res.filePath
  })
  /** Dasselbe PDF ohne Dialog in einen schon gewählten Ordner (siehe `files:choose-folder`) */
  handle('export:pdf-in-folder', async (ordner: string, html: string, name: string, opts?: PdfExtras) =>
    inOrdnerSchreiben(ordner, name, await pdfBytes(html, opts))
  )
  handle('export:print', (html: string, options?: PrintOptions) => printHtml(html, options))
  /** Druckvorschau: PDF-Daten zum Anzeigen der Seiten */
  handle('export:preview', async (html: string) => new Uint8Array(await htmlToPdf(html)))
  /** Dieselben Daten als Formular – für die Prüfung und für eine Vorschau ohne Speichern */
  handle('export:fillable-preview', async (html: string, audio?: { id: string; fileName: string; title: string; base64: string }[]) => {
    const dateien = (audio ?? []).map((a) => ({ id: a.id, fileName: a.fileName, title: a.title, bytes: Buffer.from(a.base64, 'base64') }))
    return new Uint8Array(await htmlToPdfWithExtras(html, { fillable: true, audio: dateien }))
  })
  handle('export:printers', async () =>
    (await mainWindow!.webContents.getPrintersAsync()).map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: Boolean((p as { isDefault?: boolean }).isDefault)
    }))
  )
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('de.schulapps.app')
    /*
     * Kein Menü. Electron bringt sonst ein englisches Standardmenü mit („File, Edit, View …"),
     * das mit der Alt-Taste aufklappte – in einer sonst deutschen Oberfläche und ohne einen
     * Eintrag, den die Lehrkraft braucht.
     *
     * Kopieren, Einfügen, Ausschneiden, Alles markieren und Rückgängig in Textfeldern hängen
     * unter Windows NICHT am Menü, sondern an Chromium selbst (geprüft in
     * tests/e2e/hauptapp.mjs). Was das Menü zusätzlich lieferte – Neu laden und die
     * Entwicklerwerkzeuge –, gibt es im Entwicklungsmodus weiter über die Tasten unten.
     */
    Menu.setApplicationMenu(null)
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
      if (is.dev)
        window.webContents.on('before-input-event', (event, input) => {
          if (input.type !== 'keyDown' || !input.control) return
          if (input.shift && input.code === 'KeyI') {
            window.webContents.toggleDevTools()
            event.preventDefault()
          } else if (!input.shift && input.code === 'KeyR') {
            window.webContents.reload()
            event.preventDefault()
          }
        })
    })
    registerIpc()
    createWindow()
    // Liegengebliebene Arbeitsordner der KI-Programme entfernen. Sie entstehen, wenn die App
    // hart beendet wird – dann kommt das eigene Aufräumen nicht mehr dazu.
    try {
      const removed = cleanupWorkDirs()
      if (removed) console.log(`${removed} liegengebliebene Arbeitsordner entfernt`)
    } catch {
      // Aufräumen darf den Start nie verhindern
    }
    // Beim Start und danach alle 12 Stunden die Modelllisten der Anbieter abgleichen
    mainWindow?.webContents.once('did-finish-load', () => void updateModelsInBackground())
    setInterval(() => void updateModelsInBackground(), 12 * 60 * 60 * 1000)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  /*
   * Der Zugang aus dem Netz geht mit dem Programm mit. Ein Server, der nach dem Schließen
   * des Fensters weiterliefe, wäre genau die Art offener Tür, die niemand bemerkt.
   */
  app.on('before-quit', () => stopLan())

  app.on('window-all-closed', () => {
    stopLan()
    if (process.platform !== 'darwin') app.quit()
  })
}
