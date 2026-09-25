import { describe, expect, it } from 'vitest'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { makeFillable, MEASURE_SCRIPT, type FieldBox } from '../src/main/services/export/fillablePdf'
import { attachAudio, type AudioFile } from '../src/main/services/export/audioInPdf'

/** Ein leeres A4-PDF als Grundlage – so wie es aus `printToPDF` käme. */
async function leeresA4(seiten = 1): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < seiten; i++) doc.addPage([595.276, 841.89])
  return Buffer.from(await doc.save())
}

/** Die Seite ist in CSS 210 mm breit: bei 96 dpi sind das 793,7 px. */
const SEITE = { widthPx: 793.7, heightPx: 1122.5 }

const feld = (patch: Partial<FieldBox>): FieldBox => ({ page: 0, kind: 'line', x: 100, y: 100, w: 400, h: 24, ...patch })

const lade = async (bytes: Buffer) => {
  const doc = await PDFDocument.load(bytes)
  const form = doc.getForm()
  return { doc, form, felder: form.getFields(), seite: doc.getPages()[0] }
}

/*
 * Der heikle Teil ist die Umrechnung: Das Fenster misst in CSS-Pixeln mit dem Nullpunkt oben
 * links, das PDF rechnet in Punkten mit dem Nullpunkt unten links. Stimmt der Maßstab oder
 * die Spiegelung nicht, sitzen ALLE Felder verschoben – und das merkt man erst beim
 * Ausfüllen, nicht beim Ansehen.
 */
describe('Formularfelder ins PDF setzen', () => {
  it('rechnet Pixel in Punkte um – 210 mm sind 793,7 px und 595,28 pt', async () => {
    const bytes = await makeFillable(await leeresA4(), [feld({ x: 0, y: 0, w: 793.7, h: 100 })], SEITE)
    const { felder, seite } = await lade(bytes)
    expect(felder).toHaveLength(1)
    const r = felder[0].acroField.getWidgets()[0].getRectangle()
    // Volle Blattbreite in px muss die volle Seitenbreite in pt ergeben
    expect(r.width).toBeCloseTo(seite.getWidth(), 1)
    expect(r.x).toBeCloseTo(0, 1)
  })

  it('spiegelt die y-Achse – oben im Fenster ist oben auf der Seite', async () => {
    const bytes = await makeFillable(await leeresA4(), [feld({ x: 0, y: 0, w: 400, h: 40 })], SEITE)
    const { felder, seite } = await lade(bytes)
    const r = felder[0].acroField.getWidgets()[0].getRectangle()
    /*
     * Ein Feld ganz oben liegt im PDF an der Oberkante, nicht unten – und ragt NICHT
     * darüber hinaus. Textfelder werden um 1 pt angehoben, damit die gedruckte Linie
     * sichtbar bleibt; ganz oben muss diese Anhebung entfallen, sonst läge das Feld
     * außerhalb der Seite und wäre in manchen Betrachtern nicht erreichbar.
     */
    expect(r.y + r.height).toBeCloseTo(seite.getHeight(), 2)
    expect(r.y).toBeGreaterThan(seite.getHeight() / 2)
  })

  it('macht aus Kästchen Ankreuzfelder und aus Linien Textfelder', async () => {
    const bytes = await makeFillable(
      await leeresA4(),
      [feld({ kind: 'line' }), feld({ kind: 'check', x: 50, y: 200, w: 16, h: 16 }), feld({ kind: 'area', x: 50, y: 300, w: 400, h: 120 })],
      SEITE
    )
    const { felder } = await lade(bytes)
    const arten = felder.map((f) => f.constructor.name)
    expect(arten.filter((a) => a.includes('CheckBox'))).toHaveLength(1)
    expect(arten.filter((a) => a.includes('TextField'))).toHaveLength(2)
  })

  it('lässt Kästchen zu, die für ein Textfeld zu klein wären', async () => {
    /*
     * Der Fehler der ersten Fassung: Eine gemeinsame Untergrenze von 12 pt warf genau die
     * Ankreuzkästchen weg – sie sind auf dem Blatt 4,2 mm breit, also 11,9 pt. Von fünf
     * Kästchen blieben zwei übrig.
     */
    const kaestchen = feld({ kind: 'check', x: 50, y: 50, w: 15.9, h: 15.9 })
    const bytes = await makeFillable(await leeresA4(), [kaestchen], SEITE)
    expect((await lade(bytes)).felder).toHaveLength(1)
  })

  it('übergeht Felder, die zu klein zum Hineinschreiben sind', async () => {
    const bytes = await makeFillable(await leeresA4(), [feld({ kind: 'line', w: 10, h: 4 })], SEITE)
    expect((await lade(bytes)).felder).toEqual([])
  })

  it('verteilt die Felder auf die richtigen Seiten', async () => {
    const bytes = await makeFillable(await leeresA4(3), [feld({ page: 0 }), feld({ page: 2, x: 60, y: 60 })], SEITE)
    const doc = await PDFDocument.load(bytes)
    const proSeite = doc.getPages().map((p) => p.node.Annots()?.size() ?? 0)
    expect(proSeite).toEqual([1, 0, 1])
  })

  it('lässt ein PDF ohne Messwerte unverändert', async () => {
    // Schlägt das Messen fehl, ist ein gewöhnliches PDF besser als ein kaputtes
    const roh = await leeresA4()
    expect(await makeFillable(roh, [], { widthPx: 0, heightPx: 0 })).toBe(roh)
  })

  it('lässt ein einzelnes fehlerhaftes Feld den Export nicht abbrechen', async () => {
    const bytes = await makeFillable(await leeresA4(), [feld({ page: 99 }), feld({ page: 0 })], SEITE)
    expect((await lade(bytes)).felder).toHaveLength(1)
  })
})

describe('Was gemessen wird', () => {
  it('nimmt Schreiblinien, Kästchen, Lücken und Flächen beider Programme', () => {
    // Arbeitsblatt (und damit Klassenarbeit und Grammatiktest) sowie Vokabeltest
    for (const klasse of ['.ws-line', '.ws-check', '.ws-gap', '.ws-space', '.vt-checkbox', '.vt-gap', '.vt-line']) {
      expect(MEASURE_SCRIPT, klasse).toContain(klasse)
    }
  })

  it('nimmt das angekreuzte Beispiel-Kästchen ausdrücklich AUS', () => {
    /*
     * Es zeigt, was zu tun ist, und ist selbst nichts zum Ankreuzen. Ein Feld darüber lud
     * nicht nur zum falschen Klick ein, es verdeckte auch das gedruckte Kreuz – im ersten
     * Versuch genau so passiert.
     */
    expect(MEASURE_SCRIPT).toContain('.ws-check:not(.ws-check-demo)')
    expect(MEASURE_SCRIPT).toContain(".closest('.ws-example')")
  })
})

/*
 * Hörtexte im PDF.
 *
 * Belegte Ausgangslage: Ein eingebetteter Abspieler (RichMedia) funktioniert in Acrobat,
 * Foxit, Okular und seit Mitte 2026 in Firefox – NICHT in Chrome, Edge und der
 * macOS-Vorschau, und dort STUMM. Die Dateianlage dagegen zeigen Acrobat, Chrome, Edge,
 * Firefox und Okular. Deshalb immer beides, mit der Anlage als Grundlage.
 */
describe('Hörtext ins PDF einbetten', () => {
  const mp3 = (n = 2048): AudioFile => ({ id: 'a1', fileName: 'hoertext.mp3', title: 'At school', bytes: new Uint8Array(n).fill(7) })
  const box = { id: 'a1', page: 0, x: 40, y: 80, w: 700, h: 200 }

  it('hängt die Datei an und legt einen Abspieler darüber', async () => {
    const res = await attachAudio(await leeresA4(), [mp3()], [box], SEITE.widthPx)
    expect(res.attached).toBe(1)
    expect(res.players).toBe(1)
  })

  it('bettet die Datei NUR EINMAL ein – sonst wird das PDF doppelt so groß', async () => {
    /*
     * Anlage und Abspieler zeigen auf dieselbe Filespec. Naiv getrennt eingebettet ergab die
     * Messung 5,0 MB statt 2,5 MB.
     */
    const res = await attachAudio(await leeresA4(), [mp3()], [box], SEITE.widthPx)
    const roh = res.pdf.toString('latin1')
    expect((roh.match(/\/EmbeddedFile/g) ?? []).length).toBe(1)
  })

  it('hängt die Datei auch ohne bekannte Lage an – dann eben ohne Abspieler', async () => {
    // Der Abspieler ist die Zugabe; die Anlage darf nie daran scheitern
    const res = await attachAudio(await leeresA4(), [mp3()], [], SEITE.widthPx)
    expect(res.attached).toBe(1)
    expect(res.players).toBe(0)
  })

  it('trägt die Anlage in den Namensbaum und in AF ein', async () => {
    const res = await attachAudio(await leeresA4(), [mp3()], [box], SEITE.widthPx)
    const doc = await PDFDocument.load(res.pdf)
    const names = doc.catalog.lookup(PDFName.of('Names')) as PDFDict
    expect(names.lookup(PDFName.of('EmbeddedFiles'))).toBeTruthy()
    expect(doc.catalog.lookup(PDFName.of('AF'))).toBeTruthy()
  })

  it('übergeht leere Dateien, statt einen kaputten Anhang zu erzeugen', async () => {
    const res = await attachAudio(await leeresA4(), [{ ...mp3(), bytes: new Uint8Array(0) }], [box], SEITE.widthPx)
    expect(res.attached).toBe(0)
  })

  it('lässt das PDF unverändert, wenn es nichts zu vertonen gibt', async () => {
    const roh = await leeresA4()
    expect((await attachAudio(roh, [], [], SEITE.widthPx)).pdf).toBe(roh)
  })

  it('verteilt mehrere Hörtexte auf ihre Seiten', async () => {
    const res = await attachAudio(
      await leeresA4(2),
      [mp3(), { ...mp3(), id: 'a2', fileName: 'zweiter.mp3' }],
      [box, { id: 'a2', page: 1, x: 40, y: 80, w: 700, h: 200 }],
      SEITE.widthPx
    )
    expect(res.attached).toBe(2)
    expect(res.players).toBe(2)
  })
})
