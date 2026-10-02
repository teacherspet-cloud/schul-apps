import { BorderStyle, Paragraph, ParagraphChild, ShadingType, Table, TableCell, TableLayoutType, TableRow, TabStopType, TextRun, WidthType } from 'docx'
import { MUSTER_FORMEN } from '../../generation/solution'
import { imageRun, MM, NO_BORDERS, RED, run } from '../../../../shared/export/docxKit'
import { eigeneBreiten } from '../../render/tabelleMasse'
import { richTextRuns } from '../../../../shared/richtext/docx'
import { plainText } from '../../../../shared/richtext/parse'
import type { TaskBlock } from '../../model/types'
import { SOCIAL_FORM_SVG } from '../../render/icons'
import { pictogramForSocialForm } from '../../render/pictograms'
import { istMcListe, mcSpalten, mcZeilen, ohneOperator } from '../../render/mcGrid'
import { exampleNote } from '../../../../shared/exampleNote'
import { subjectById } from '../../model/subjects'
import { Child, Ctx } from './grundlagen'
import { rich, richRun } from './kopf'
import { spacer, answerContent } from './bausteine'

export async function taskContent(ctx: Ctx, block: TaskBlock, number?: number): Promise<Child[]> {
  const out: Child[] = []
  const indent = 480
  const style = ctx.ws.design.tasks
  const head: ParagraphChild[] = []
  if (number !== undefined)
    head.push(
      new TextRun({
        text: ` ${number} `,
        bold: true,
        color: style.numberStyle === 'plain' ? ctx.accent : 'FFFFFF',
        shading: style.numberStyle === 'plain' ? undefined : { type: ShadingType.CLEAR, color: 'auto', fill: ctx.accent },
        size: ctx.size
      }),
      run('  ')
    )
  if (block.stars && ctx.ws.meta.differentiation.mode === 'combined' && ctx.ws.meta.differentiation.levels > 1)
    head.push(run(`${'★'.repeat(block.stars)} `, { color: 'B8860B' }))
  if (style.showSocialFormIcons) {
    const px = (ctx.size / 2) * (96 / 72) * 1.1
    // Hat die Lehrkraft das Symbol selbst gestalten lassen, gilt ihre Fassung – auch hier
    const own = ctx.deps.pictograms?.[pictogramForSocialForm(block.socialForm)?.id ?? '']
    if (own) {
      head.push(imageRun(own, px, px), run('  '))
    } else {
      const svg = SOCIAL_FORM_SVG[block.socialForm]
      const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)
      const w = Number(vb?.[1] ?? 24)
      const h = Number(vb?.[2] ?? 22)
      const png = await ctx.deps.raster(svg.replace(/currentColor/g, '#444444'), w * 4, h * 4)
      head.push(imageRun(png, (w / h) * px, px), run('  '))
    }
  }
  const instruction = await richTextRuns(block.instruction, { size: ctx.size, raster: ctx.deps.raster })
  /*
   * Die Situation einer Schreibaufgabe steht VOR dem Auftrag – wie am Bildschirm (Wunsch der
   * Lehrkraft vom 24.09.2026). In Word stand sie bis 28.09.2026 dahinter und las sich wie eine
   * zweite Aufgabe. Nummer und Symbol gehören dann an die Situation.
   */
  const situation = block.brief?.situation?.trim()
  if (situation)
    out.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 120, after: 40 },
        indent: { left: indent, hanging: indent },
        children: [...head, ...(await richRun(ctx, situation))]
      })
    )
  out.push(
    new Paragraph({
      keepNext: true,
      spacing: { before: situation ? 0 : 120, after: 60 },
      indent: situation ? { left: indent } : { left: indent, hanging: indent },
      tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentWidth }],
      // Auf Arbeitsblättern werden keine Punkte vergeben.
      // Der Hinweis auf das gelöste Beispiel tritt hinzu, wenn eines da ist – wie am Bildschirm.
      children: [
        ...(situation ? [] : head),
        ...instruction,
        ...(block.example ? [run(` ${exampleNote(subjectById(ctx.ws.meta.subjectId).foreignLanguage ?? 'de')}`, { color: '555555' })] : [])
      ]
    })
  )
  /*
   * Vorgaben einer Schreibaufgabe – dieselbe Reihenfolge wie am Bildschirm.
   *
   * Sie standen lange NUR in der Datei: erzeugt, geprüft, aber weder gedruckt noch
   * exportiert. Die Bewertungskriterien bleiben auch hier draußen; sie gehören in den
   * Erwartungshorizont, nicht in die Hand der Lernenden.
   */
  const brief = block.brief
  if (brief) {
    // Klassenarbeit ohne Hilfen für Lernende (01.10.2026): Rahmenzeile, Teilpunkte, Notizen und Formhinweise nicht auf dem Schülerblatt
    const ohneLernhilfen = ctx.ws.meta.lernhilfen === false
    const rahmen = brief.frameHidden || ohneLernhilfen ? '' : [brief.audience, brief.textType, brief.purpose].filter(Boolean).join(' · ')
    if (rahmen) out.push(new Paragraph({ indent: { left: indent }, spacing: { after: 60 }, children: [run(rahmen, { italics: true })] }))

    // Klausur der Oberstufe: keine Notizentabelle, keine Formhinweise (wie am Bildschirm)
    const notizen = ctx.ws.meta.ohneSchreibhilfen || ohneLernhilfen ? [] : (brief.notes ?? []).filter((s) => s.title || s.items.length || s.prompts.length)
    if (notizen.length) {
      out.push(
        new Table({
          width: { size: ctx.contentWidth - indent, type: WidthType.DXA },
          columnWidths: notizen.map(() => Math.floor((ctx.contentWidth - indent) / notizen.length)),
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({
              children: await Promise.all(
                notizen.map(async (spalte) => {
                  const zellen: Paragraph[] = [new Paragraph({ children: await richRun(ctx, spalte.title, { bold: true }) })]
                  for (const it of spalte.items) zellen.push(new Paragraph({ bullet: { level: 0 }, children: await richRun(ctx, it) }))
                  // Offene Impulse bekommen eine Schreiblinie – sie sind zum Ausfüllen da
                  for (const p of spalte.prompts)
                    zellen.push(
                      new Paragraph({
                        spacing: { before: 60 },
                        border: { bottom: { style: BorderStyle.DOTTED, size: 4, color: '999999' } },
                        children: await richRun(ctx, p)
                      })
                    )
                  return new TableCell({ children: zellen })
                })
              )
            })
          ]
        })
      )
    }

    // Leere Inhaltspunkte auch hier nicht (wie am Bildschirm)
    for (const p of ohneLernhilfen ? [] : brief.points.filter((x) => plainText(x).trim()))
      out.push(new Paragraph({ bullet: { level: 0 }, indent: { left: indent + 200 }, children: await richRun(ctx, p) }))

    // Die Wortzahl nur, wenn das Blatt sie nennen soll – dieselbe Regel wie am Bildschirm
    const zeigtWortzahl = Boolean(ctx.ws.meta.wordLimit) && brief.words > 0
    const formZeile = [zeigtWortzahl ? `Umfang: etwa ${brief.words} Wörter` : '', ...(ctx.ws.meta.ohneSchreibhilfen || ohneLernhilfen ? [] : (brief.form ?? []).filter(Boolean))]
      .filter(Boolean)
      .join(' · ')
    if (formZeile) out.push(new Paragraph({ indent: { left: indent }, spacing: { before: 60, after: 40 }, children: [run(formZeile, { bold: true })] }))
  }

  /*
   * Gelöstes Beispiel als Punkt „0" – wie am Bildschirm vor den echten Items, grau gesetzt
   * und mit eingetragener Lösung. Es steht auch auf dem Schülerblatt; es zeigt die Form der
   * Antwort, es prüft nichts (ÖSZ 2024).
   */
  if (block.example) {
    const grau = '666666'
    out.push(
      new Paragraph({
        keepNext: true,
        indent: { left: indent + 200 },
        spacing: { before: 60, after: 20 },
        children: [run('0. ', { bold: true, color: grau }), ...(await richTextRuns(block.example.instruction, { size: ctx.size, raster: ctx.deps.raster }))]
      })
    )
    const a = block.example.answer
    if (a.kind === 'multipleChoice') {
      a.options.forEach((o, i) => {
        const richtig = a.correct.includes(i)
        out.push(
          new Paragraph({
            indent: { left: indent + 400 },
            spacing: { after: 20 },
            children: [
              run(`${String.fromCharCode(97 + i)}) `, { color: grau }),
              run(richtig ? '☒ ' : '☐ ', { color: grau }),
              run(plainText(o), { color: grau })
            ]
          })
        )
      })
    } else if (block.example.solution) {
      out.push(
        new Paragraph({
          indent: { left: indent + 400 },
          spacing: { after: 20 },
          children: [run(plainText(block.example.solution), { color: grau, bold: true })]
        })
      )
    }
  }

  if (istMcListe(block.parts)) {
    /*
     * Fragenreihe zum Ankreuzen – dieselbe Anordnung wie auf dem Bildschirm: rahmenlose
     * Tabelle, spaltenweise gefüllt, Nummer je Frage und Buchstabe je Möglichkeit.
     * Begründung in `render/mcGrid.ts`.
     */
    const spalten = mcSpalten(block.parts)
    const zeilen = mcZeilen(
      block.parts.map((part, i) => ({ part, i })),
      spalten
    )
    // Von Hand gezogene Spalten und Zeilen (02.10.2026, TaskBlock.mcGitter) – sonst gleich breit
    const eigene = eigeneBreiten(block.mcGitter, spalten)
    const zellBreiten = Array.from({ length: spalten }, (_, sp) => Math.floor(((ctx.contentWidth - indent) * (eigene ? eigene[sp] : 100 / spalten)) / 100))
    out.push(
      new Table({
        width: { size: ctx.contentWidth - indent, type: WidthType.DXA },
        ...(eigene ? { columnWidths: zellBreiten } : {}),
        indent: { size: indent, type: WidthType.DXA },
        borders: { ...NO_BORDERS, insideHorizontal: NO_BORDERS.top, insideVertical: NO_BORDERS.top },
        rows: await Promise.all(
          zeilen.map(
            async (zeile, z) =>
              new TableRow({
                ...(block.mcGitter?.rowHeightsMm?.[z] ? { height: { value: Math.round(block.mcGitter.rowHeightsMm[z] * MM), rule: 'atLeast' as const } } : {}),
                children: await Promise.all(
                  zeile.map(async (eintrag, sp) => {
                    const kinder: Paragraph[] = []
                    if (eintrag) {
                      kinder.push(
                        new Paragraph({
                          keepNext: true,
                          spacing: { before: 60, after: 20 },
                          children: [
                            run(`${eintrag.i + 1}. `, { bold: true }),
                            ...(await richTextRuns(ohneOperator(eintrag.part.instruction, block.operator), { size: ctx.size, raster: ctx.deps.raster }))
                          ]
                        })
                      )
                      const a = eintrag.part.answer
                      if (a.kind === 'multipleChoice') {
                        a.options.forEach((o, oi) => {
                          const richtig = ctx.key && a.correct.includes(oi)
                          kinder.push(
                            new Paragraph({
                              indent: { left: 200 },
                              spacing: { after: 20 },
                              children: [
                                run(`${String.fromCharCode(97 + oi)}) `),
                                run(richtig ? '☒ ' : '☐ ', { color: richtig ? RED : undefined }),
                                run(plainText(o), richtig ? { bold: true, color: RED } : {})
                              ]
                            })
                          )
                        })
                      }
                      if (ctx.key && eintrag.part.solution) {
                        kinder.push(new Paragraph({ indent: { left: 200 }, children: [run(plainText(eintrag.part.solution), { color: RED })] }))
                      }
                    } else {
                      kinder.push(new Paragraph({ children: [] }))
                    }
                    return new TableCell({ width: { size: zellBreiten[sp], type: WidthType.DXA }, borders: NO_BORDERS, children: kinder })
                  })
                )
              })
          )
        )
      })
    )
  } else if (block.parts.length) {
    for (let i = 0; i < block.parts.length; i++) {
      const p = block.parts[i]
      out.push(
        new Paragraph({
          keepNext: true,
          indent: { left: indent * 2, hanging: indent },
          spacing: { before: 60 },
          children: [
            run(`${String.fromCharCode(97 + i)})\t`, { bold: true }),
            ...(await richTextRuns(p.instruction, { size: ctx.size, raster: ctx.deps.raster }))
          ]
        })
      )
      // Musterlösung in Schülerform (Lösungsblatt) an der Stelle von Linien, Kästchen, Fläche
      if (ctx.key && p.modelAnswer && MUSTER_FORMEN.includes(p.answer.kind)) {
        // Diagramm: Fläche bleibt (Word kennt keine Skizze darüber), Beschreibung darunter
        if (p.answer.kind === 'diagram') out.push(...(await answerContent(ctx, p.answer, indent * 2)))
        out.push(...(await rich(ctx, p.modelAnswer, { run: { color: RED }, paragraph: { indent: { left: indent * 2 } } })))
      } else out.push(...(await answerContent(ctx, p.answer, indent * 2)))
      if (ctx.key && p.solution) out.push(...(await rich(ctx, p.solution, { run: { color: RED }, paragraph: { indent: { left: indent * 2 } } })))
    }
  } else {
    /*
     * MUSTERTEXT an der Stelle der Schreiblinien – auf dem Lösungsblatt.
     *
     * Wie am Bildschirm: Wo die Lernenden schreiben, liest die Lehrkraft den ausformulierten
     * Text. Der stichpunktartige Erwartungshorizont bleibt zusätzlich am Ende stehen.
     */
    const mustertextOben = ctx.key && block.answer.kind === 'lines' && Boolean(block.brief?.model)
    if (mustertextOben) out.push(...(await rich(ctx, block.brief!.model!, { run: { color: RED }, paragraph: { indent: { left: indent } } })))
    else if (ctx.key && block.modelAnswer && MUSTER_FORMEN.includes(block.answer.kind)) {
      // Musterlösung in Schülerform (26.09.2026) – die Skizze gibt Word nicht wieder, nur den Text; beim Diagramm bleibt die Fläche
      if (block.answer.kind === 'diagram') out.push(...(await answerContent(ctx, block.answer, indent)))
      out.push(...(await rich(ctx, block.modelAnswer, { run: { color: RED }, paragraph: { indent: { left: indent } } })))
    } else out.push(...(await answerContent(ctx, block.answer, indent)))
  }
  if (ctx.key && block.solution)
    out.push(...(await rich(ctx, `**Lösung:** ${block.solution}`, { run: { color: RED }, paragraph: { indent: { left: indent } } })))

  /*
   * Erwartungshorizont einer Schreibaufgabe – wie am Bildschirm, nur auf dem Lösungsblatt.
   * Aufbau nach den amtlichen Erwartungshorizonten: übergeordnetes Kriterium mit Punktzahl,
   * darunter nicht verbindliche Beispiele, dazu die Öffnungsklausel.
   */
  if (ctx.key && brief && ((brief.expected ?? []).length || brief.criteria.length || brief.model)) {
    const links = { left: indent }
    out.push(new Paragraph({ indent: links, spacing: { before: 120, after: 40 }, children: [run('Erwartungshorizont', { bold: true, color: RED })] }))
    for (const e of brief.expected ?? []) {
      out.push(
        new Paragraph({
          indent: links,
          spacing: { before: 60 },
          children: [...(await richRun(ctx, e.aspect, { bold: true, color: RED })), ...(e.points > 0 ? [run(`  ${e.points} P.`, { color: RED })] : [])]
        })
      )
      if (e.criterion) out.push(new Paragraph({ indent: links, children: await richRun(ctx, e.criterion, { color: RED }) }))
      for (const x of e.examples)
        out.push(new Paragraph({ bullet: { level: 0 }, indent: { left: indent + 200 }, children: await richRun(ctx, x, { color: RED }) }))
    }
    if ((brief.expected ?? []).length)
      out.push(
        new Paragraph({
          indent: links,
          spacing: { before: 60 },
          children: [
            run(
              'Die Beispiele sind nicht verbindlich. Passende Aspekte, die hier nicht vorhergesehen sind, können ebenfalls gewertet werden; die Höchstpunktzahl des Aspekts wird dabei nicht überschritten.',
              { italics: true, color: RED }
            )
          ]
        })
      )
    if (brief.criteria.length) {
      out.push(new Paragraph({ indent: links, spacing: { before: 60 }, children: [run('Bewertung', { bold: true, color: RED })] }))
      for (const c of brief.criteria)
        out.push(new Paragraph({ bullet: { level: 0 }, indent: { left: indent + 200 }, children: await richRun(ctx, c, { color: RED }) }))
    }
    // Nicht doppelt: Bei einer Schreibaufgabe steht er schon oben auf den Linien
    const obenGezeigt = block.answer.kind === 'lines' && !block.parts.length && Boolean(brief.model)
    if (brief.model && !obenGezeigt) {
      out.push(new Paragraph({ indent: links, spacing: { before: 60 }, children: [run('Mustertext', { bold: true, color: RED })] }))
      out.push(...(await rich(ctx, brief.model, { run: { color: RED }, paragraph: { indent: links } })))
    }
  }
  if (ctx.key && (block.afb || block.operator)) {
    out.push(
      new Paragraph({
        indent: { left: indent },
        children: [
          run([block.afb ? `AFB ${block.afb}` : '', block.operator ? `Operator: ${block.operator}` : '', block.afbReason].filter(Boolean).join(' · '), {
            size: ctx.size - 6,
            color: '666666'
          })
        ]
      })
    )
  }
  out.push(spacer())
  return out
}
