/**
 * Die Hörtexte als eigenes Dokument.
 *
 * Auf dem Schülerblatt steht das Skript nicht – sonst wäre das Hörverstehen keines mehr.
 * Die Lehrkraft braucht es aber: zum Vorlesen, wenn keine Vertonung vorliegt, zum Nachschlagen
 * beim Korrigieren und zum Weitergeben an eine Vertretung.
 *
 * Deshalb ein getrenntes Dokument statt einer Seite im Material: So lässt es sich ausdrucken,
 * ohne dass es versehentlich mit den Blättern in die Klasse wandert.
 *
 * Aufbau je Hörtext: Überschrift mit Textsorte und Spieldauer, die organisatorischen Angaben
 * (wie oft gespielt wird, Hinweis vor dem Hören), dann das Skript mit hervorgehobenen
 * Sprechernamen – so findet man beim Vorlesen die eigene Zeile wieder.
 */
import { kiMetaTag, kiWordEigenschaften, type KiHerkunft } from '@shared/kiKennzeichnung'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { run } from '../../../shared/export/docxKit'
import type { AudioBlock } from '../model/types'
import { audioLength } from '../render/BlockView'
import { scriptTurns } from '../steps/AudioPanel'

export interface TranscriptInfo {
  /** Überschrift des Dokuments, z. B. Titel des Blattes */
  title: string
  /** Fach und Lerngruppe für die Zeile darunter */
  subtitle?: string
  schoolName?: string
  /** KI-Kennzeichnung (Großprogramm 0.4) */
  ki?: KiHerkunft
}

/** Sprecher eines Hörtextes als Zeile: „Anna (Stimme: Rachel) · Ben". */
function speakerLine(block: AudioBlock): string {
  return block.speakers.map((s) => (s.voiceName ? `${s.name} (Stimme: ${s.voiceName})` : s.name)).join(' · ')
}

/** Die organisatorischen Angaben über dem Skript. */
export function transcriptFacts(block: AudioBlock): string[] {
  const facts: string[] = []
  if (block.textType) facts.push(block.textType)
  if (block.seconds) facts.push(audioLength(block.seconds))
  if (block.plays) facts.push(block.plays === 1 ? 'einmal vorspielen' : `${block.plays}-mal vorspielen`)
  const speakers = speakerLine(block)
  if (speakers) facts.push(`Sprecher: ${speakers}`)
  if (block.audio?.dataUrl) facts.push('vertont')
  else facts.push('nicht vertont – zum Vorlesen')
  return facts
}

export async function buildTranscriptDocx(blocks: AudioBlock[], info: TranscriptInfo): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(`Hörtexte – ${info.title}`, { bold: true })] }),
    ...(info.subtitle ? [new Paragraph({ children: [run(info.subtitle, { color: '666666' })] })] : []),
    new Paragraph({
      spacing: { after: 240 },
      children: [run('Nur für die Lehrkraft – nicht an die Lernenden austeilen.', { italics: true, color: '666666', size: 18 })]
    })
  ]

  blocks.forEach((block, i) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 80 },
        children: [run(`${blocks.length > 1 ? `${i + 1}. ` : ''}${block.title || 'Hörtext'}`, { bold: true })]
      })
    )
    children.push(new Paragraph({ spacing: { after: 120 }, children: [run(transcriptFacts(block).join(' · '), { size: 18, color: '666666' })] }))

    if (block.beforeListening.trim()) {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [run('Vor dem Hören: ', { bold: true, size: 20 }), run(block.beforeListening.trim(), { size: 20 })]
        })
      )
    }

    const turns = scriptTurns(block)
    if (turns.length) {
      // Mit Sprecherzeilen: Name fett, damit man beim Vorlesen die eigene Zeile wiederfindet
      for (const turn of turns) {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            children: turn.name ? [run(`${turn.name}: `, { bold: true }), run(turn.text)] : [run(turn.text)]
          })
        )
      }
    } else {
      for (const line of block.transcript.split('\n')) {
        if (line.trim()) children.push(new Paragraph({ spacing: { after: 80 }, children: [run(line.trim())] }))
      }
    }
  })

  if (!blocks.length) {
    children.push(new Paragraph({ children: [run('Auf diesem Material gibt es keine Hörtexte.')] }))
  }

  if (info.schoolName) {
    children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 480 }, children: [run(info.schoolName, { size: 16, color: '999999' })] }))
  }

  const doc = new Document({
    creator: 'Schul-Apps',
    title: `Hörtexte – ${info.title}`,
    ...kiWordEigenschaften(info.ki),
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }]
  })
  return new Uint8Array(await Packer.toArrayBuffer(doc))
}

/** Dateiname ohne Zeichen, die Windows nicht zulässt. */
export const transcriptFileName = (title: string): string => `Hoertexte – ${(title || 'Material').replace(/[\\/:*?"<>|]/g, '')}.docx`

/** Sonderzeichen, die in HTML eine Bedeutung haben, unschädlich machen. */
const esc = (text: string): string =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/**
 * Dieselben Hörtexte als druckfertige Seite.
 *
 * Grundlage für den PDF-Export: Der Hauptprozess druckt HTML nach PDF. Bewusst eine eigene,
 * schlichte Seite statt der Arbeitsblatt-Darstellung – das Transkript ist ein Lesetext für die
 * Lehrkraft, kein Unterrichtsmaterial, und soll sich mit wenig Farbe schnell ausdrucken lassen.
 */
export function buildTranscriptHtml(blocks: AudioBlock[], info: TranscriptInfo): string {
  const body = blocks.length
    ? blocks
        .map((block, i) => {
          const turns = scriptTurns(block)
          const script = turns.length
            ? turns.map((t) => `<p>${t.name ? `<b>${esc(t.name)}:</b> ` : ''}${esc(t.text)}</p>`).join('')
            : block.transcript
                .split('\n')
                .filter((l) => l.trim())
                .map((l) => `<p>${esc(l.trim())}</p>`)
                .join('')
          return [
            `<section>`,
            `<h2>${blocks.length > 1 ? `${i + 1}. ` : ''}${esc(block.title || 'Hörtext')}</h2>`,
            `<p class="facts">${esc(transcriptFacts(block).join(' · '))}</p>`,
            block.beforeListening.trim() ? `<p class="before"><b>Vor dem Hören:</b> ${esc(block.beforeListening.trim())}</p>` : '',
            script,
            `</section>`
          ].join('')
        })
        .join('')
    : '<p>Auf diesem Material gibt es keine Hörtexte.</p>'

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Hörtexte – ${esc(info.title)}</title>${kiMetaTag(info.ki)}
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #000; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 2mm; }
  h2 { font-size: 13pt; margin: 8mm 0 1mm; }
  .subtitle { color: #555; margin: 0 0 1mm; }
  .note { color: #555; font-style: italic; font-size: 9pt; margin: 0 0 6mm; }
  .facts { color: #555; font-size: 9pt; margin: 0 0 2mm; }
  .before { margin: 0 0 3mm; }
  p { margin: 0 0 1.6mm; }
  /* Ein Hörtext soll nicht mitten im Satz umbrechen, wenn er auf eine Seite passt */
  section { break-inside: auto; }
  h2 { break-after: avoid; }
</style></head><body>
<h1>Hörtexte – ${esc(info.title)}</h1>
${info.subtitle ? `<p class="subtitle">${esc(info.subtitle)}</p>` : ''}
<p class="note">Nur für die Lehrkraft – nicht an die Lernenden austeilen.</p>
${body}
</body></html>`
}

/** Dateiname für das PDF. */
export const transcriptPdfName = (title: string): string => transcriptFileName(title).replace(/\.docx$/, '.pdf')
