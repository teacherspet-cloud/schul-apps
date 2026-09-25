/**
 * Hörtexte IM PDF: als Dateianlage und als Abspieler.
 *
 * WARUM BEIDES UND NICHT NUR EINS:
 *
 * Ein eingebetteter Abspieler (RichMedia-Annotation) funktioniert in Acrobat, Foxit, Okular
 * und – erst seit Mitte 2026 – in Firefox. In Chrome, Edge und der macOS-Vorschau
 * funktioniert er NICHT, und zwar STUMM: Dort steht ein leeres Rechteck, ohne Meldung.
 * Genau das sind die verbreitetsten Betrachter.
 *
 * Die Dateianlage dagegen zeigen Acrobat, Chrome, Edge, Firefox und Okular alle an. Sie ist
 * deshalb die Grundlage, der Abspieler die Zugabe. Der sichtbare Hinweis steht im
 * SEITENINHALT und nicht in der Annotation – sonst verschwände er dort, wo der Abspieler
 * nicht unterstützt wird, also genau da, wo er gebraucht wird.
 *
 * DIE DATEI WIRD NUR EINMAL EINGEBETTET.
 *
 * Anlage und Abspieler zeigen auf DIESELBE Filespec. Naiv getrennt eingebettet, verdoppelt
 * sich das PDF – gemessen 5,0 MB statt 2,5 MB. Der Mehraufwand der Anlage selbst ist
 * dagegen vernachlässigbar: gemessen 1919 Byte auf 2,5 MB, also 0,08 %.
 *
 * NICHT BENUTZT: die `Sound`-Annotation. Sie speichert rohe PCM-Daten – ein Hörtext von drei
 * Minuten würde damit rund 30 MB statt 3 MB. Außerdem ist sie in PDF 2.0 abgekündigt,
 * ebenso die `Movie`-Annotation.
 */
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFString } from 'pdf-lib'

export interface AudioFile {
  /** id des Hörtext-Bausteins – verbindet Datei und Fundstelle auf der Seite */
  id: string
  fileName: string
  /** Die MP3 als Bytes */
  bytes: Uint8Array
  /** Titel des Hörtextes, erscheint als Beschreibung der Anlage */
  title: string
}

/** Wo der Hörtext-Baustein auf der Seite steht (gemessen, in CSS-Pixeln). */
export interface AudioBox {
  id: string
  page: number
  x: number
  y: number
  w: number
  h: number
}

/** Höhe des Abspielbalkens in PDF-Punkten. */
const PLAYER_HOEHE = 26

/**
 * Bettet die Hörtexte ein und legt, wo die Lage bekannt ist, einen Abspieler darüber.
 *
 * Liefert zurück, wie viele Dateien angehängt und wie viele Abspieler gesetzt wurden –
 * daraus entsteht der Hinweis für die Lehrkraft.
 */
export async function attachAudio(
  pdfBytes: Buffer,
  files: AudioFile[],
  boxes: AudioBox[],
  seiteBreitePx: number
): Promise<{ pdf: Buffer; attached: number; players: number }> {
  if (!files.length) return { pdf: pdfBytes, attached: 0, players: 0 }
  const doc = await PDFDocument.load(pdfBytes)
  const ctx = doc.context
  const seiten = doc.getPages()
  if (!seiten.length) return { pdf: pdfBytes, attached: 0, players: 0 }
  const scale = seiteBreitePx ? seiten[0].getWidth() / seiteBreitePx : 0

  const namen: (PDFHexString | PDFRef)[] = []
  const alleFilespecs: PDFRef[] = []
  let players = 0

  for (const f of files) {
    if (!f.bytes.length) continue
    /*
     * Der Datenstrom wird OHNE Kompression abgelegt. Eine MP3 ist bereits komprimiert;
     * Flate darüber bringt nichts und kostet nur Zeit.
     */
    const efRef = ctx.register(
      PDFRawStream.of(
        ctx.obj({
          Type: 'EmbeddedFile',
          // „audio/mpeg" – der Schrägstrich muss im Namen als #2F stehen
          Subtype: PDFName.of('audio#2Fmpeg'),
          Params: ctx.obj({ Size: f.bytes.length })
        }),
        f.bytes
      )
    )
    const fsRef = ctx.register(
      ctx.obj({
        Type: 'Filespec',
        F: PDFString.of(f.fileName),
        UF: PDFHexString.fromText(f.fileName),
        Desc: PDFHexString.fromText(f.title || 'Hörtext'),
        EF: ctx.obj({ F: efRef })
      })
    )
    namen.push(PDFHexString.fromText(f.fileName), fsRef)
    alleFilespecs.push(fsRef)

    // Abspieler an die Stelle des Hörtext-Bausteins – auf DIESELBE eingebettete Datei
    const box = boxes.find((b) => b.id === f.id)
    const page = box ? seiten[box.page] : undefined
    if (box && page && scale) {
      const x = box.x * scale
      const breite = Math.min(box.w * scale, page.getWidth() - x)
      // Unten im Baustein, damit der Balken nichts überdeckt
      const y = Math.max(0, page.getHeight() - (box.y + box.h) * scale)
      const inst = ctx.register(ctx.obj({ Type: 'RichMediaInstance', Subtype: 'Video', Asset: fsRef }))
      const cfg = ctx.register(ctx.obj({ Type: 'RichMediaConfiguration', Subtype: 'Audio', Instances: ctx.obj([inst]) }))
      const annot = ctx.register(
        ctx.obj({
          Type: 'Annot',
          Subtype: 'RichMedia',
          // 4 = Print: Der Abspieler soll den Ausdruck nicht verändern, aber sichtbar sein
          F: 4,
          Rect: ctx.obj([x, y, x + breite, y + PLAYER_HOEHE]),
          RichMediaContent: ctx.obj({
            Type: 'RichMediaContent',
            Assets: ctx.obj({ Names: ctx.obj([PDFString.of(f.fileName), fsRef]) }),
            Configurations: ctx.obj([cfg])
          }),
          RichMediaSettings: ctx.obj({
            Type: 'RichMediaSettings',
            // XA/XD: beim Öffnen der Seite bereit, beim Verlassen aus
            Activation: ctx.obj({ Type: 'RichMediaActivation', Condition: 'XA' }),
            Deactivation: ctx.obj({ Type: 'RichMediaDeactivation', Condition: 'XD' })
          })
        })
      )
      const vorhandene = page.node.Annots()
      if (vorhandene) vorhandene.push(annot)
      else page.node.set(PDFName.of('Annots'), ctx.obj([annot]))
      players++
    }
  }

  if (!alleFilespecs.length) return { pdf: pdfBytes, attached: 0, players: 0 }

  /*
   * Anlagen eintragen. `Names/EmbeddedFiles` ist der Weg, über den die Betrachter die
   * Anlagenleiste füllen; `AF` (Associated Files) macht die Zuordnung für neuere Fassungen
   * ausdrücklich.
   */
  const embedded = ctx.obj({ Names: ctx.obj(namen) })
  const vorhanden = doc.catalog.lookup(PDFName.of('Names'))
  if (vorhanden instanceof PDFDict) {
    // Ein vorhandenes Names-Verzeichnis (z. B. mit Sprungmarken) bleibt erhalten
    vorhanden.set(PDFName.of('EmbeddedFiles'), embedded)
  } else {
    doc.catalog.set(PDFName.of('Names'), ctx.obj({ EmbeddedFiles: embedded }))
  }
  doc.catalog.set(PDFName.of('AF'), ctx.obj(alleFilespecs))

  return { pdf: Buffer.from(await doc.save()), attached: alleFilespecs.length, players }
}
