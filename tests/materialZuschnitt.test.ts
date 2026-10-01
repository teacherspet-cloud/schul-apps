import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import type { StructuredRequest } from '../src/shared/types'
import { presetDesigns } from '../src/shared/design'
import { bereinigeArtikeltext } from '../src/shared/artikelText'
import { fliesstext } from '../src/main/services/sources/fliesstext'
import { pruefeKuerzung, wortzahl } from '../src/renderer/src/modules/arbeitsblatt/generation/kuerzung'
import {
  absatzAuswahl,
  einleitungAusAngaben,
  einleitungErstellen,
  entferneAbsaetze,
  erkenneSprache,
  neuZuschneiden,
  schneideZu,
  zielNachWunsch
} from '../src/renderer/src/modules/arbeitsblatt/generation/zuschnitt'
import { materialBausteine } from '../src/renderer/src/modules/arbeitsblatt/generation/originalmaterial'
import { pruefungsformatRegeln } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts/schreiben'
import { regelVorschlaege } from '../src/renderer/src/shared/kiWunsch'
import { wunschKontextFuer } from '../src/renderer/src/modules/arbeitsblatt/generation/wunsch'
import { newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { TaskBlock, TextBlock, Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { BlockInhalt } from '../src/renderer/src/modules/arbeitsblatt/render/baustein/blockview'
import { TaskView } from '../src/renderer/src/modules/arbeitsblatt/render/baustein/aufgabe'
import { WsContext, type WsContextValue } from '../src/renderer/src/modules/arbeitsblatt/render/WsContext'
import { buildWorksheetDocx } from '../src/renderer/src/modules/arbeitsblatt/export/docx'
import { arbeitsmaterialFuerTeil, partPrompt, roterFaden, worksheetMetaFor } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'
import { materialZiel } from '../src/renderer/src/modules/klassenarbeit/model/textlaengen'
import { hilfenBefunde, hilfenInsLehrermaterial } from '../src/renderer/src/modules/klassenarbeit/model/lernhilfen'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import olk from './fixtures/artikel-olk.json'

/*
 * Zwei Befunde der Lehrkraft vom 01.10.2026:
 * 1. Material von einer eigenen Internetadresse stand ungekürzt und mit Seitenbeiwerk („News",
 *    Datum, Vorspann, „© … Polaris/laif") in der Klausur. Jetzt: bereinigen, wörtlich auf die
 *    Ziel-Länge kürzen (roter Faden der ganzen Arbeit), Einleitungssatz, Quellenangabe „(gekürzt)".
 * 2. Schreib-/Mediationsaufgaben in Klassenarbeiten trugen Hilfekästen (Adressat · Textsorte · Zweck)
 *    und Teilpunkte. Jetzt: nur im Erwartungshorizont; im Arbeitsblatt als Option.
 */

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const seite = (): string => fliesstext(olk.html, 'de')
const KOPF_MUELL = ['News', '10.03.2025', 'Aus dem Magazin', '©', 'Polaris/laif', 'Mehr zum Thema', 'Teilen']

/** Gekürzter Ausschnitt aus den Absätzen der Fixtur, Lücken mit […] */
const ausschnitt = (indizes: number[]): string => {
  const teile: string[] = []
  indizes.forEach((i, k) => {
    if (k > 0 && i !== indizes[k - 1] + 1) teile.push('[…]')
    teile.push(olk.absaetze[i])
  })
  return teile.join('\n\n')
}

const exam = (patch: Partial<Exam['meta']> = {}, parts: ExamPart[] = []): Exam =>
  ({
    version: 1,
    meta: {
      ...defaultExamMeta('NI', 'gymnasium', 'Gymnasium'),
      subjectId: 'englisch',
      subjectLabel: 'Englisch',
      topic: 'Shakespeare today',
      grade: 12,
      cefrLevel: 'B2',
      minutes: 180,
      ...patch
    },
    parts,
    design: presetDesigns()[0],
    createdAt: ''
  } as unknown as Exam)

const teil = (formatId: string, blocks: ExamPart['blocks'] = [], id = formatId): ExamPart =>
  ({ id, formatId, label: formatId, competence: 'x', minutes: 60, points: 20, weight: 30, blocks } as ExamPart)

describe('Seitenbeiwerk entfernen (Olk/LMU-Fixtur)', () => {
  it('Rubrik, Datum, Vorspann, Bildnachweis und Teilen-Leiste fallen weg; Schlagzeile, Datum und Medium bleiben als Angaben', () => {
    const roh = seite()
    // Die Extraktion allein behält das Beiwerk – genau das war der Befund
    expect(roh).toContain('Polaris/laif')
    const a = bereinigeArtikeltext(roh, { seitentitel: olk.seitentitel })
    for (const m of KOPF_MUELL) expect(a.text).not.toContain(m)
    expect(a.text).not.toContain('Betörend, verstörend**')
    expect(a.text.startsWith('Seit mehr als vierhundert Jahren')).toBe(true)
    expect(a.titel).toBe('Shakespeares Werke: Betörend, verstörend')
    expect(a.datum).toBe('10.03.2025')
    expect(a.medium).toContain('EINSICHTEN')
    expect(a.entfernt.some((z) => z.startsWith('Vorspann') && z.includes('Claudia Olk'))).toBe(true)
    // Der Artikel selbst bleibt vollständig
    expect(wortzahl(a.text)).toBe(olk.absaetze.reduce((n, x) => n + wortzahl(x), 0))
  })

  it('ein echter Einstiegsabsatz bleibt stehen', () => {
    const a = bereinigeArtikeltext(`Die Stadt plant einen neuen Park am Fluss.\n\n${olk.absaetze[0]}\n\n${olk.absaetze[1]}`)
    expect(a.text).toContain('Die Stadt plant einen neuen Park')
  })
})

describe('Ziel-Länge je Teil', () => {
  it('Sprachmittlung Qualifikationsphase 450–650 (NRW-Abitur), Einführungsphase und Sek I eigene Werte', () => {
    expect(materialZiel(exam(), teil('en-mediation'))).toMatchObject({ min: 450, max: 650 })
    expect(materialZiel(exam(), teil('en-mediation')).grund).toContain('NRW')
    expect(materialZiel(exam({ grade: 11 }), teil('en-mediation'))).toMatchObject({ min: 350, max: 500 })
    expect(materialZiel(exam({ grade: 8, cefrLevel: 'B1' }), teil('en-reading'))).toMatchObject({ min: 153, max: 207 })
    // Kurze Klausur: weniger Lesestoff
    expect(materialZiel(exam({ minutes: 45 }), teil('en-mediation')).max).toBeLessThan(650)
  })

  it('„kürzer"/„länger" verschieben den Bereich vom jetzigen Umfang aus', () => {
    expect(zielNachWunsch({ min: 450, max: 650, grund: '' }, 600, 'Kürzerer Ausschnitt').max).toBe(480)
    expect(zielNachWunsch({ min: 450, max: 650, grund: '' }, 400, 'länger bitte').min).toBe(480)
  })
})

describe('Zuschnitt: wörtlich, roter Faden, Quellenangabe „(gekürzt)"', () => {
  const ziel = { min: 450, max: 650, grund: 'NRW-Abitur' }
  const eingabe = {
    text: seite(),
    seitentitel: olk.seitentitel,
    url: olk.url,
    ziel,
    thema: 'Shakespeare today',
    leitgedanke: roterFaden(exam({}, [teil('en-reading', [], 'r'), teil('en-mediation', [], 'm'), teil('en-writing', [], 'w')]), { id: 'm' }),
    teil: 'Sprachmittlung',
    sprache: 'de',
    zielsprache: 'en',
    fach: 'Englisch',
    jahrgang: 12,
    mediation: true
  }

  it('übernimmt einen wörtlichen Ausschnitt der KI im Zielbereich – mit Einleitung, Titel und vollständiger Quellenangabe', async () => {
    const calls: StructuredRequest[] = []
    const gekuerzt = ausschnitt([0, 1, 3, 4, 5, 7])
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      calls.push(req)
      if (req.schemaName === 'material_zuschnitt')
        return {
          gekuerzt,
          begruendung: 'Macht und Jugend',
          worthilfen: [
            { term: 'Spielplänen', explanation: 'theatre programmes' },
            { term: 'Quatsch', explanation: 'x' }
          ]
        } as T
      if (req.schemaName === 'material_artikelpruefung') return { nurArtikeltext: true, fremd: [] } as T
      if (req.schemaName === 'material_einleitung')
        return {
          einleitung: 'Am 10.03.2025 erklärt die LMU-Anglistin Claudia Olk im Magazin EINSICHTEN, warum Shakespeares Dramen lebendig bleiben',
          angaben: []
        } as T
      throw new Error(req.schemaName)
    }
    const r = await schneideZu(eingabe, ai)
    expect(r.weg).toBe('ki')
    expect(r.pruefung.ok).toBe(true)
    const n = wortzahl(r.ablage.text)
    expect(n).toBeGreaterThanOrEqual(450)
    expect(n).toBeLessThanOrEqual(650)
    for (const m of KOPF_MUELL) expect(r.ablage.text).not.toContain(m)
    // Roter Faden und Aufgabe stehen im Auftrag zum Zuschnitt; der Text bleibt deutsch
    const auftrag = calls.find((c) => c.schemaName === 'material_zuschnitt')!.user
    expect(auftrag).toContain('ROTER FADEN')
    expect(auftrag).toContain('Shakespeare today')
    expect(auftrag).toContain('2. en-mediation (dieser Teil)')
    expect(auftrag).toContain('zwischen 450 und 650 Wörtern')
    expect(auftrag).toContain('Nicht übersetzen')
    expect(auftrag).toContain('NIEMALS UMSCHREIBEN')
    // Quellenangabe: Medium, Datum, Adresse, Abrufdatum – und der Kürzungsvermerk
    expect(r.ablage.titel).toBe('Shakespeares Werke: Betörend, verstörend')
    expect(r.ablage.quellenangabe).toContain('EINSICHTEN')
    expect(r.ablage.quellenangabe).toContain('10.03.2025')
    expect(r.ablage.quellenangabe).toContain(olk.url)
    expect(r.ablage.quellenangabe).toContain('abgerufen am')
    expect(r.ablage.hinweis).toBe('(gekürzt)')
    // Worthilfen nur, wenn der Begriff im Text steht
    expect(r.ablage.worthilfen).toEqual([{ term: 'Spielplänen', explanation: 'theatre programmes' }])
    expect(r.ablage.einleitung?.endsWith(':')).toBe(true)
    // Als Baustein: Einleitung, Zeilennummern, Quelle mit „(gekürzt)", Original für den Zauberstab
    const [text] = materialBausteine(r.ablage, { subjectId: 'englisch', skillFocus: 'mediation' }, () => 'm1') as TextBlock[]
    expect(text.intro).toContain('Claudia Olk')
    expect(text.lineNumbers).toBe(true)
    expect(text.language).toBe('de')
    expect(text.source).toContain('(gekürzt)')
    expect(text.source).toContain(olk.url)
    expect(text.zuschnitt?.zielMax).toBe(650)
    expect(text.body).not.toContain('Shakespeares Werke: Betörend')
  })

  it('weicht die KI vom Wortlaut ab, kürzt die App selbst – absatzweise und sicher wörtlich', async () => {
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      if (req.schemaName === 'material_zuschnitt')
        return { gekuerzt: 'Shakespeare ist heute aktueller denn je, sagt die Forschung.', begruendung: '', worthilfen: [] } as T
      if (req.schemaName === 'material_artikelpruefung') return { nurArtikeltext: true, fremd: [] } as T
      throw new Error('keine Einleitung')
    }
    const r = await schneideZu(eingabe, ai)
    expect(r.weg).toBe('app')
    expect(r.pruefung.ok).toBe(true)
    expect(wortzahl(r.ablage.text)).toBeLessThanOrEqual(650)
    expect(wortzahl(r.ablage.text)).toBeGreaterThanOrEqual(450)
    expect(r.ablage.protokoll.join(' ')).toContain('absatzweise')
    // Ohne KI-Einleitung: Ersatzsatz aus den Angaben der Seite
    expect(r.ablage.einleitung).toContain('10.03.2025')
  })

  it('die zweite Prüfung („nur Artikeltext?") entfernt gemeldete Fremdzeilen mit […]', async () => {
    const text = `${olk.absaetze[0]}\n\nFoto des Monats aus dem Archiv der Universität\n\n${olk.absaetze[1]}`
    const ohne = entferneAbsaetze(text, ['Foto des Monats aus dem'])
    expect(ohne.text).not.toContain('Foto des Monats')
    expect(ohne.text).toContain('[…]')
    expect(pruefeKuerzung(text, ohne.text).ok).toBe(true)
  })

  it('absatzweise Auswahl bleibt im Zielbereich und wörtlich', () => {
    const original = olk.absaetze.join('\n\n')
    const aus = absatzAuswahl(original, { min: 300, max: 400, grund: '' }, 'Macht Macbeth', 'de')
    expect(wortzahl(aus)).toBeLessThanOrEqual(400)
    expect(wortzahl(aus)).toBeGreaterThanOrEqual(300)
    expect(pruefeKuerzung(original, aus).ok).toBe(true)
  })

  it('Zauberstab „kürzer" wählt aus dem Original neu, statt umzuschreiben', async () => {
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      if (req.schemaName === 'material_zuschnitt') {
        expect(req.user).toContain('WUNSCH DER LEHRKRAFT')
        return { gekuerzt: ausschnitt([3, 4, 5]), begruendung: '', worthilfen: [] } as T
      }
      if (req.schemaName === 'material_artikelpruefung') return { nurArtikeltext: true, fremd: [] } as T
      throw new Error(req.schemaName)
    }
    const block: TextBlock = {
      ...(newBlock('text') as TextBlock),
      body: ausschnitt([0, 1, 3, 4, 5, 7]),
      language: 'de',
      intro: 'Einleitung:',
      zuschnitt: {
        original: bereinigeArtikeltext(seite()).text,
        url: olk.url,
        zielMin: 450,
        zielMax: 650,
        zielGrund: 'x',
        thema: 'Shakespeare',
        sprache: 'de',
        zielsprache: 'en',
        quellenangabe: 'Q'
      }
    }
    const neu = await neuZuschneiden(block, 'Kürzerer Ausschnitt', 'ueberarbeiten', ai)
    expect(wortzahl(neu.body)).toBeLessThan(wortzahl(block.body))
    expect(neu.intro).toBe('Einleitung:')
    expect(neu.source).toContain('(gekürzt)')
    // Vorschläge am Zauberstab: nur Ausschnitt-Wünsche
    const k = wunschKontextFuer(
      block,
      { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), subjectId: 'englisch', subjectLabel: 'Englisch', topic: 'x', grade: 12 },
      'Klassenarbeit'
    )
    expect(regelVorschlaege(k)).toContain('Kürzerer Ausschnitt')
    expect(regelVorschlaege(k)).not.toContain('Fachbegriffe erklärt')
  })
})

describe('Einleitungssatz', () => {
  const artikel = bereinigeArtikeltext(fliesstext(olk.html, 'de'), { seitentitel: olk.seitentitel })
  const basis = { artikel, text: artikel.text, titel: artikel.titel ?? '', url: olk.url, sprache: 'de', thema: 'Shakespeare today', quellenangabe: 'Q' }

  it('entsteht aus den Angaben der Seite – auch aus dem entfernten Vorspann (Funktion des Verfassers)', async () => {
    let auftrag = ''
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      auftrag = req.user
      return { einleitung: 'Am 10.03.2025 erklärt die LMU-Anglistin Claudia Olk im Magazin EINSICHTEN, warum Shakespeare aktuell bleibt:', angaben: [] } as T
    }
    const e = await einleitungErstellen(basis, ai)
    expect(auftrag).toContain('LMU-Anglistin Claudia Olk')
    expect(auftrag).toContain('Datum: 10.03.2025')
    expect(auftrag).toContain('SPRACHE DES SATZES: Deutsch')
    expect(e.text).toBe('Am 10.03.2025 erklärt die LMU-Anglistin Claudia Olk im Magazin EINSICHTEN, warum Shakespeare aktuell bleibt:')
  })

  it('Sprache je Material: ein englischer Text bekommt eine englische Einleitung', async () => {
    let auftrag = ''
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      auftrag = req.user
      return {
        einleitung: 'In 2025, LMU anglicist Claudia Olk explains in the magazine EINSICHTEN why Shakespeare is more relevant than ever',
        angaben: []
      } as T
    }
    const e = await einleitungErstellen({ ...basis, sprache: 'en' }, ai)
    expect(auftrag).toContain('SPRACHE DES SATZES: Englisch')
    expect(e.text.endsWith('ever:')).toBe(true)
    expect(einleitungAusAngaben({ autor: 'Jane Doe', medium: 'The Guardian', thema: 'Shakespeare' }, 'en')).toBe(
      'Jane Doe writes in The Guardian about Shakespeare:'
    )
  })

  it('rät nicht: ohne belegtes Datum kein Datum – eine erfundene Jahreszahl führt zum Ersatzsatz', async () => {
    const ohneDatum = bereinigeArtikeltext(olk.absaetze.slice(0, 3).join('\n\n'))
    const ai = async <T>(): Promise<T> => ({ einleitung: 'Im Jahr 2019 schreibt eine Anglistin über Shakespeare:', angaben: [] } as T)
    const e = await einleitungErstellen({ ...basis, artikel: { ...ohneDatum, medium: 'EINSICHTEN' }, text: ohneDatum.text, titel: 'Shakespeare' }, ai)
    expect(e.text).not.toContain('2019')
    expect(e.text).not.toMatch(/\d{4}/)
    expect(e.text).toContain('EINSICHTEN')
    expect(einleitungAusAngaben({ thema: 'Shakespeare' }, 'de')).toBe('Ein Text zum Thema „Shakespeare“:')
  })

  it('recherchierte Angaben behalten ihre Fundstelle; fremde Adressen fallen weg', async () => {
    const ohne = bereinigeArtikeltext(olk.absaetze.slice(0, 3).join('\n\n'))
    const gesucht: string[] = []
    const netzsuche = async (auftrag: string) => {
      gesucht.push(auftrag)
      return [
        {
          titel: 'LMU Newsroom',
          url: 'https://www.lmu.de/news/olk',
          auszug: 'Veröffentlicht am 10.03.2025. Claudia Olk ist Professorin für Anglistik an der LMU München.'
        }
      ]
    }
    const ai = async <T>(): Promise<T> =>
      ({
        einleitung: 'Am 10.03.2025 erklärt die Anglistin Claudia Olk, warum Shakespeare aktuell bleibt:',
        angaben: [
          { angabe: 'Erscheinungsdatum 10.03.2025', url: 'https://www.lmu.de/news/olk' },
          { angabe: 'Funktion', url: 'https://erfunden.example/x' }
        ]
      } as T)
    const e = await einleitungErstellen({ ...basis, artikel: ohne, text: ohne.text, netzsuche }, ai)
    expect(gesucht.length).toBe(1)
    expect(e.text).toContain('10.03.2025')
    expect(e.fundstellen).toEqual([{ angabe: 'Erscheinungsdatum 10.03.2025', url: 'https://www.lmu.de/news/olk' }])
  })
})

describe('Darstellung: Einleitung kursiv vor dem Text, keine Hilfen im Schülerblatt der Klassenarbeit', () => {
  const ctx = (patch: Partial<WsContextValue> = {}): WsContextValue => ({
    mode: 'print',
    taskNumbers: new Map([['t1', 1]]),
    materialNumbers: new Map([['m1', 'M1']]),
    showStars: false,
    taskStyle: { numberStyle: 'circle', showSocialFormIcons: false },
    ...patch
  })
  const text: TextBlock = {
    ...(newBlock('text') as TextBlock),
    id: 'm1',
    title: 'Shakespeares Werke',
    intro: 'Am 10.03.2025 äußert sich Claudia Olk:',
    body: olk.absaetze[0],
    source: 'Q (gekürzt)'
  }

  it('Arbeitsblatt/Klassenarbeit: Titel → Einleitung (kursiv) → Wortlaut', () => {
    const html = renderToStaticMarkup(createElement(WsContext.Provider, { value: ctx() }, createElement(BlockInhalt, { block: text })))
    const titel = html.indexOf('Shakespeares Werke')
    const einleitung = html.indexOf('ws-text-intro')
    const wortlaut = html.indexOf('Seit mehr als vierhundert')
    expect(titel).toBeGreaterThan(-1)
    expect(einleitung).toBeGreaterThan(titel)
    expect(wortlaut).toBeGreaterThan(einleitung)
  })

  const aufgabe: TaskBlock = {
    ...(newBlock('task') as TaskBlock),
    id: 't1',
    skill: 'mediation',
    instruction:
      "You are contributing to the website of your British partner school. **Write** an article for the partner school's website based on M1, presenting the expert's view.",
    brief: {
      situation: '',
      audience: "The British partner school's drama group and website readers",
      textType: 'Website article',
      purpose: 'To inform readers about German views on Shakespeare',
      words: 250,
      points: ['Outline why Shakespeare is still performed', 'Explain why the texts stay open'],
      criteria: []
    }
  }

  it('Schülerblatt ohne Rahmenzeile und Teilpunkte; im Erwartungshorizont stehen beide', () => {
    const schueler = renderToStaticMarkup(
      createElement(WsContext.Provider, { value: ctx({ ohneLernhilfen: true }) }, createElement(TaskView, { block: aufgabe }))
    )
    expect(schueler).toContain('You are contributing')
    expect(schueler).not.toContain('Website article')
    expect(schueler).not.toContain('Outline why')
    const loesung = renderToStaticMarkup(
      createElement(WsContext.Provider, { value: ctx({ mode: 'key', ohneLernhilfen: true }) }, createElement(TaskView, { block: aufgabe }))
    )
    expect(loesung).toContain('Situierung und Teilpunkte (nicht auf dem Schülerblatt)')
    expect(loesung).toContain('Website article')
    expect(loesung).toContain('Outline why')
    // Arbeitsblatt (Übung): Hilfen wie bisher
    const blatt = renderToStaticMarkup(createElement(WsContext.Provider, { value: ctx() }, createElement(TaskView, { block: aufgabe })))
    expect(blatt).toContain('Website article')
    expect(blatt).toContain('Outline why')
  })

  it('Klassenarbeit: Voreinstellung ohne Hilfen, Schalter schaltet sie ein; Word-Export mit kursiver Einleitung', async () => {
    const e = exam({}, [teil('en-mediation', [text, aufgabe])])
    expect(worksheetMetaFor(e).lernhilfen).toBe(false)
    expect(worksheetMetaFor(exam({ lernhilfen: true })).lernhilfen).toBe(true)
    const ws: Worksheet = examToWorksheet(e)
    const deps = { logo: null, schoolName: '', sizer: async () => ({ width: 10, height: 10 }), raster: async () => PNG, sidebar: async () => PNG }
    const zip = await JSZip.loadAsync(await buildWorksheetDocx(ws, { sheetIds: [ws.sheets[0].id], includeKey: false }, deps))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).not.toContain('Website article')
    expect(xml).not.toContain('Outline why')
    const i = xml.indexOf('Am 10.03.2025 äußert sich Claudia Olk:')
    expect(i).toBeGreaterThan(-1)
    // Kursiv gesetzt und vor dem Wortlaut
    expect(xml.slice(Math.max(0, i - 400), i)).toContain('<w:i/>')
    expect(xml.indexOf('Seit mehr als vierhundert')).toBeGreaterThan(i)
  })

  it('Arbeitsblatt-Option: „Hilfen für Lernende" aus → Prüfungsformat im Auftrag', () => {
    expect(pruefungsformatRegeln({ lernhilfen: false })).toContain('KEINE Teilaufgaben')
    expect(pruefungsformatRegeln({})).toBe('')
    expect(pruefungsformatRegeln({ lernhilfen: true })).toBe('')
  })
})

describe('Klassenarbeit: Teilpunkte in den Erwartungshorizont, roter Faden, Material je Teil', () => {
  it('Teilpunkte als Teilaufgaben oder Aufzählung wandern nach brief.points; der Hinweis meldet sie', () => {
    const mitTeilen: TaskBlock = {
      ...(newBlock('task') as TaskBlock),
      id: 'a',
      skill: 'mediation',
      instruction: 'Write an article.',
      parts: ['Outline why …', 'Explain why …', 'Present how …', 'Evaluate what …'].map((t, i) => ({
        id: `p${i}`,
        instruction: t,
        answer: { ...(newBlock('task') as TaskBlock).answer, kind: 'none' as const },
        solution: ''
      }))
    }
    const mitListe: TaskBlock = {
      ...(newBlock('task') as TaskBlock),
      id: 'b',
      skill: 'writing',
      instruction: 'Write an email.\n- Outline why …\n- Explain why …'
    }
    const e = exam({}, [teil('en-mediation', [mitTeilen, mitListe])])
    expect(hilfenBefunde(e).map((b) => b.art)).toEqual(['teilaufgaben', 'aufzaehlung'])
    expect(hilfenBefunde({ ...e, meta: { ...e.meta, lernhilfen: true } })).toEqual([])
    const [a, b] = hilfenInsLehrermaterial([mitTeilen, mitListe]) as TaskBlock[]
    expect(a.parts).toEqual([])
    expect(a.brief?.points).toEqual(['Outline why …', 'Explain why …', 'Present how …', 'Evaluate what …'])
    expect(a.answer.kind).toBe('lines')
    expect(b.instruction).toBe('Write an email.')
    expect(b.brief?.points).toEqual(['Outline why …', 'Explain why …'])
  })

  it('der Teilauftrag nennt den roten Faden und verbietet Hilfekästen', () => {
    const e = exam({}, [teil('en-reading'), teil('en-mediation'), teil('en-writing')])
    const prompt = partPrompt(e, e.parts[1], 2)
    expect(prompt).toContain('ROTER FADEN')
    expect(prompt).toContain('2. en-mediation (dieser Teil)')
    expect(prompt).toContain('PRÜFUNGSFORMAT – KEINE HILFEN')
    expect(partPrompt(exam({ lernhilfen: true }, e.parts), e.parts[1], 2)).not.toContain('PRÜFUNGSFORMAT – KEINE HILFEN')
  })

  it('Sprachmittlung nimmt das deutsche Material, Leseverstehen das englische', () => {
    const de = { id: 'de', fileName: 'LMU', kind: 'web' as const, url: olk.url, text: olk.absaetze.join('\n\n'), bilder: [], aktiv: true }
    const en = {
      id: 'en',
      fileName: 'Guardian',
      kind: 'web' as const,
      url: 'https://example.org/en',
      text: 'Shakespeare is still the most performed playwright in the world. The plays are open to new readings, and every generation finds something of its own in them. Young audiences in particular respond to the characters who rebel against their families and fight for the right to choose their own way in life.',
      bilder: [],
      aktiv: true
    }
    const e = exam({ arbeitsmaterial: [en, de] })
    expect(arbeitsmaterialFuerTeil(e, { formatId: 'en-mediation' })?.id).toBe('de')
    expect(arbeitsmaterialFuerTeil(e, { formatId: 'en-reading' })?.id).toBe('en')
    expect(erkenneSprache(de.text, ['de', 'en'])).toBe('de')
    // Nur deutsches Material: kein deutscher Lesetext im Leseverstehen
    expect(arbeitsmaterialFuerTeil(exam({ arbeitsmaterial: [de] }), { formatId: 'en-reading' })).toBeNull()
  })
})
