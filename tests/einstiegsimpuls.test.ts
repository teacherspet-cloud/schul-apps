import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { OnlineImageHit, StructuredRequest } from '../src/shared/types'
import type { ImageServices } from '../src/renderer/src/shared/imageChoice'
import { regelVorschlaege } from '../src/renderer/src/shared/kiWunsch'
import { verlaufDocx } from '../src/renderer/src/shared/stundenverlauf/docx'
import {
  bildKennzeichnung,
  brauchtBild,
  einstiegMaxMinuten,
  fachEmpfehlung,
  impulsAus,
  impulsHinweise,
  impulsRegeln,
  lizenzHinweis,
  type Einstiegsimpuls
} from '../src/renderer/src/shared/stundenverlauf/einstiegsimpuls'
import { beschaffeImpulsBild, impulsBildPrompt, impulsBildRegeln, type ImpulsBildDeps } from '../src/renderer/src/shared/stundenverlauf/impulsBild'
import { verlaufAus, verlaufHtml, verlaufsAnfrage } from '../src/renderer/src/shared/stundenverlauf/stundenverlauf'

/*
 * Einstiegsimpulse im Stundenverlauf (01.10.2026): Regeln aus recherche/einstiegsimpulse-2026-10-01.md
 * im Auftrag, Bereinigung der Antwort, Bildbeschaffung Suche → KI-Prüfung → KI-Entwurf, Kennzeichnung.
 */
const GESCHICHTE = {
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  grade: 8,
  topic: 'Industrialisierung',
  learningGoals: 'Die Lernenden erklären Folgen der Kinderarbeit.'
}
const BIO = { subjectId: 'biologie', subjectLabel: 'Biologie', grade: 6, topic: 'Fotosynthese', learningGoals: 'Die Lernenden erklären, wovon Pflanzen leben.' }

const KI_EINSTIEG = {
  art: 'bild',
  titel: 'Foto: Kresse im Dunkeln und im Licht',
  beschreibung: 'Zwei Kresseschalen, eine bleich, eine grün.',
  bezug: 'Der Unterschied führt zur Frage nach der Rolle des Lichts.',
  leitfrage: 'Warum ist die Kresse im Dunkeln bleich?',
  erwartungen: ['Die Kresse hatte kein Wasser → Hinweis: beide gleich gegossen', 'Licht fehlt → festhalten', 'Sie ist krank'],
  ueberleitung: 'Ob Licht der Grund ist, klären wir mit M1.',
  moderation: ['Bild stumm zeigen', 'Denkzeit, dann beschreiben', 'Vermutungen an der Tafel sammeln', 'Leitfrage festhalten'],
  bild: {
    motiv: 'Zwei Kresseschalen, bleich und grün',
    suche: 'cress seedlings dark light',
    original: false,
    werk: '',
    stil: 'foto',
    entwurf: 'Two trays of cress seedlings side by side'
  },
  zitat: { text: '', quelle: '' }
}

const hit = (id: string, title: string, license = 'CC BY-SA 4.0'): OnlineImageHit => ({
  id,
  title,
  thumbnail: `https://t/${id}`,
  url: `https://u/${id}`,
  creator: 'Fotografin',
  license,
  licenseUrl: `https://commons/${id}`,
  source: 'wikimedia'
})

function dienste(treffer: OnlineImageHit[], log: string[] = []): ImageServices {
  return {
    searchOpenMoji: async () => [],
    openMojiPng: async (hex) => hex,
    search: async (q, source) => {
      log.push(`${source}:${q}`)
      return source === 'wikimedia' ? treffer : []
    },
    fetchImage: async (url) => `data:image/jpeg;base64,${btoa(url)}`,
    normalize: async (d) => d
  }
}

/** Prüf-KI: wählt das erste Bild, wenn `nimmt` zustimmt */
const pruefKi =
  (nimmt: boolean, calls: StructuredRequest[] = []) =>
  async <T>(req: StructuredRequest): Promise<T> => {
    calls.push(req)
    const ids = [...req.user.matchAll(/- id="([^"]+)":.*\n {2}Kandidaten: Bild (\d+)/g)]
    return {
      choices: ids.map(([, id, n]) =>
        nimmt ? { id, image: Number(n), fit: 'eindeutig', reason: 'passt' } : { id, image: 0, fit: 'ungeeignet', reason: 'Motiv falsch' }
      )
    } as T
  }

const deps = (over: Partial<ImpulsBildDeps> = {}): ImpulsBildDeps => ({
  ai: pruefKi(true),
  services: dienste([hit('a', 'Cress in the dark'), hit('b', 'Cress in light')]),
  variants: (q) => [q],
  ...over
})

describe('Einstiegsimpuls: Regeln im Auftrag', () => {
  it('der Verlaufsauftrag enthält die recherchierten Einstiegsregeln und das Schema', () => {
    const r = verlaufsAnfrage('SYS', 'M1: Text', 45, 'Einstieg über ein Bild', BIO)
    expect(r.user).toMatch(/EINSTIEG \(didaktische Regeln/)
    expect(r.user).toMatch(/Leitfrage/)
    expect(r.user).toMatch(/Wahrnehmen – Beschreiben – Deuten/)
    expect(r.user).toMatch(/stummer Impuls/)
    expect(r.user).toMatch(/drei bis fünf/)
    expect(r.user).toMatch(/Schock/)
    expect(r.user).toMatch(/nie ein Zitat oder eine Quelle erfinden/)
    expect(r.user).toMatch(/Einstieg über ein Bild/)
    const schema = r.schema as { properties: Record<string, { properties?: Record<string, unknown> }> }
    expect(Object.keys(schema.properties.einstieg.properties!)).toEqual(
      expect.arrayContaining(['art', 'leitfrage', 'erwartungen', 'ueberleitung', 'moderation', 'bild', 'zitat', 'bezug'])
    )
  })

  it('Fach und Jahrgang bestimmen die empfohlene Impulsart', () => {
    expect(fachEmpfehlung(GESCHICHTE)).toMatch(/historische Bildquelle|Karikatur/)
    expect(fachEmpfehlung({ subjectId: 'englisch', subjectLabel: 'Englisch', grade: 7 })).toMatch(/picture description/)
    expect(fachEmpfehlung({ subjectId: 'physik', subjectLabel: 'Physik', grade: 8 })).toMatch(/Phänomen|Experiment/)
    expect(fachEmpfehlung({ subjectId: 'politik', subjectLabel: 'Politik', grade: 9 })).toMatch(/Beutelsbacher/)
    expect(impulsRegeln(BIO, 45)).toMatch(/Jüngere Lernende/)
    expect(impulsRegeln({ ...GESCHICHTE, grade: 12 }, 90)).toMatch(/Oberstufe/)
  })

  it('Dauer des Einstiegs: 10 bei 45, 15 bei 90, nie über 20 %, Grundschule 5', () => {
    expect(einstiegMaxMinuten(45)).toBe(9)
    expect(einstiegMaxMinuten(90)).toBe(15)
    expect(einstiegMaxMinuten(60)).toBe(10)
    expect(einstiegMaxMinuten(45, 3)).toBe(5)
  })
})

describe('Einstiegsimpuls: Antwort bereinigen', () => {
  it('hängt den Impuls an die Einstiegsphase', () => {
    const v = verlaufAus(
      {
        ziel: 'Z',
        phasen: [
          { phase: 'Einstieg', minuten: 5, geschehen: '', sozialform: 'UG', medien: 'Beamer' },
          { phase: 'Erarbeitung', minuten: 30, geschehen: 'M1', sozialform: 'EA', medien: 'M1' }
        ],
        hinweise: '',
        einstieg: KI_EINSTIEG
      },
      45
    )
    const e = v.phasen[0].impuls!
    expect(e.art).toBe('bild')
    expect(e.bild?.suche).toBe('cress seedlings dark light')
    expect(e.zitat).toBeUndefined()
    expect(v.phasen[0].geschehen).toMatch(/Bildimpuls/)
    expect(v.phasen[1].impuls).toBeUndefined()
    expect(brauchtBild(e)).toBe(true)
  })

  it('Quellenbild ist immer ein echtes Werk; ohne Leitfrage und Beschreibung kein Impuls', () => {
    const q = impulsAus({
      ...KI_EINSTIEG,
      art: 'quellenbild',
      bild: { ...KI_EINSTIEG.bild, original: false, stil: 'quelle', werk: 'Lewis Hine, Spinner girl, 1908' }
    })!
    expect(q.bild?.original).toBe(true)
    expect(impulsAus({ art: 'bild', leitfrage: '', beschreibung: '' })).toBeUndefined()
    expect(impulsAus({ ...KI_EINSTIEG, art: 'quatsch' })).toBeUndefined()
    // Zitat ohne Bild
    const z = impulsAus({
      ...KI_EINSTIEG,
      art: 'zitat',
      bild: { motiv: '', suche: '', original: false, werk: '', stil: 'foto', entwurf: '' },
      zitat: { text: 'Wissen ist Macht.', quelle: '' }
    })!
    expect(brauchtBild(z)).toBe(false)
    expect(impulsHinweise(z).join(' ')).toMatch(/Zitat ohne Quelle/)
  })

  it('Hinweise: Leitfrage ohne Fragezeichen, zu langer Einstieg', () => {
    const e = impulsAus({ ...KI_EINSTIEG, leitfrage: 'Rolle des Lichts' })!
    const h = impulsHinweise(e, 14, 45).join(' ')
    expect(h).toMatch(/keine Frage/)
    expect(h).toMatch(/14 Minuten recht lang/)
  })
})

describe('Einstiegsimpuls: Bild beschaffen (Suche → Prüfung → KI-Entwurf)', () => {
  const impuls = (): Einstiegsimpuls => impulsAus(KI_EINSTIEG)!

  it('nimmt zuerst ein gefundenes, von der KI geprüftes Bild mit Quellenangabe', async () => {
    const calls: StructuredRequest[] = []
    const erzeugt: string[] = []
    const r = await beschaffeImpulsBild(
      impuls(),
      BIO,
      deps({ ai: pruefKi(true, calls), generateImage: async (p) => (erzeugt.push(p), 'data:image/png;base64,AAA') })
    )
    expect(r.weg).toBe('suche')
    expect(r.image?.source).toBe('wikimedia')
    expect(r.image?.citation?.url).toBe('https://commons/a')
    expect(erzeugt).toHaveLength(0)
    // Die Prüfung kennt Leitfrage und Einstiegszweck
    expect(calls[0].user).toMatch(/EINSTIEG/)
    expect(calls[0].user).toMatch(/Warum ist die Kresse im Dunkeln bleich/)
    expect(bildKennzeichnung(r.image)).toMatch(/Fotografin.*CC BY-SA 4.0.*Wikimedia Commons/)
    expect(lizenzHinweis(r.image)).toMatch(/TULLU/)
  })

  it('passt kein Fund: Entwurf per Bild-KI, gekennzeichnet und mit Auftrag', async () => {
    const erzeugt: string[] = []
    const r = await beschaffeImpulsBild(impuls(), BIO, deps({ ai: pruefKi(false), generateImage: async (p) => (erzeugt.push(p), 'data:image/png;base64,AAA') }))
    expect(r.weg).toBe('ki')
    expect(r.image?.source).toBe('ai')
    expect(r.image?.aiPrompt).toBe(erzeugt[0])
    expect(erzeugt[0]).toMatch(/Two trays of cress/)
    expect(erzeugt[0]).toMatch(/Warum ist die Kresse/)
    expect(erzeugt[0]).toMatch(/no text/)
    expect(r.hinweis).toMatch(/KI-Bild kennzeichnen/)
    expect(bildKennzeichnung(r.image)).toMatch(/KI-generiert/)
  })

  it('historische Quelle: nie automatisch ein KI-Bild – nur auf ausdrücklichen Wunsch, dann als nachgestellt', async () => {
    const q = impulsAus({ ...KI_EINSTIEG, art: 'quellenbild', bild: { ...KI_EINSTIEG.bild, stil: 'quelle', werk: 'Lewis Hine, Spinner girl, 1908' } })!
    const erzeugt: string[] = []
    const gen = async (p: string): Promise<string> => (erzeugt.push(p), 'data:image/png;base64,AAA')
    const auto = await beschaffeImpulsBild(q, GESCHICHTE, deps({ ai: pruefKi(false), generateImage: gen }))
    expect(auto.weg).toBe('keins')
    expect(erzeugt).toHaveLength(0)
    expect(auto.hinweis).toMatch(/keine historische Quelle/)
    const ki = await beschaffeImpulsBild(q, GESCHICHTE, deps({ generateImage: gen }), { modus: 'ki' })
    expect(ki.image?.source).toBe('ai')
    expect(ki.hinweis).toMatch(/nachgestellte Darstellung/)
    expect(impulsHinweise({ ...q, image: ki.image }).join(' ')).toMatch(/nachgestellte Darstellung/)
    // „Nur KI-Bilder" sucht bei echten Werken trotzdem
    const log: string[] = []
    await beschaffeImpulsBild(q, { ...GESCHICHTE, imageSource: 'ai' }, deps({ services: dienste([hit('h', 'Spinner girl')], log), generateImage: gen }))
    expect(log.length).toBeGreaterThan(0)
  })

  it('„Anderes Bild" schließt schon gezeigte Funde aus; Einstellung „nur freie Bilder" erzeugt nichts', async () => {
    const erstes = await beschaffeImpulsBild(impuls(), BIO, deps())
    const zweites = await beschaffeImpulsBild({ ...impuls(), gesehen: erstes.gesehen }, BIO, deps(), { modus: 'suche' })
    expect(zweites.image?.citation?.url).toBe('https://commons/b')
    const drittes = await beschaffeImpulsBild({ ...impuls(), gesehen: zweites.gesehen }, BIO, deps(), { modus: 'suche' })
    expect(drittes.image).toBeUndefined()
    expect(drittes.hinweis).toMatch(/KI-Bild entwerfen/)
    const web = await beschaffeImpulsBild(impuls(), { ...BIO, imageSource: 'web' }, deps({ ai: pruefKi(false), generateImage: async () => 'x' }))
    expect(web.weg).toBe('keins')
  })

  it('Zauberstab-Wunsch fließt in Prüfung und Entwurf ein', async () => {
    const calls: StructuredRequest[] = []
    await beschaffeImpulsBild(impuls(), BIO, deps({ ai: pruefKi(true, calls) }), { wunsch: 'Foto statt Zeichnung' })
    expect(calls[0].user).toMatch(/Wunsch der Lehrkraft: Foto statt Zeichnung/)
    expect(impulsBildPrompt(impuls(), BIO, 'Mehr Kontrast')).toMatch(/Teacher's request \(implement exactly\): Mehr Kontrast/)
    expect(impulsBildRegeln(BIO, impuls())).toMatch(/Schock/)
    expect(regelVorschlaege({ typ: 'einstiegsbild', inhalt: 'x', fachId: 'geschichte' })).toEqual(
      expect.arrayContaining(['Näher an der Leitfrage', 'Als Karikatur'])
    )
  })
})

describe('Einstiegsimpuls: Ausgabe', () => {
  it('PDF-Vorlage und Word zeigen Bild, Kennzeichnung und Leitfrage', async () => {
    const v = verlaufAus(
      { ziel: 'Z', phasen: [{ phase: 'Einstieg', minuten: 5, geschehen: 'x', sozialform: 'UG', medien: 'Beamer' }], hinweise: '', einstieg: KI_EINSTIEG },
      45
    )
    // 1×1-PNG
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    v.phasen[0].impuls!.image = { dataUrl: png, source: 'ai', credit: 'KI-generiert', aiPrompt: 'p' }
    v.phasen[0].impuls!.bildFormat = 16 / 9
    const html = verlaufHtml(v, 'Fotosynthese', 'Biologie · Klasse 6')
    expect(html).toContain('class="impuls"')
    expect(html).toContain(png)
    expect(html).toMatch(/KI-generiertes Bild/)
    expect(html).toMatch(/Leitfrage:<\/b> Warum ist die Kresse/)
    const zip = await JSZip.loadAsync(await verlaufDocx(v, 'Fotosynthese', 'Biologie · Klasse 6'))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Warum ist die Kresse im Dunkeln bleich?')
    expect(xml).toContain('KI-generiertes Bild')
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true)
  })
})
