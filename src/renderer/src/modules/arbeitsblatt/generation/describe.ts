import { plainText } from '../../../shared/richtext/parse'
import type { Answer, Sheet, WsBlock } from '../model/types'

function describeAnswer(a: Answer): string {
  switch (a.kind) {
    case 'gapText':
      return `Lückentext: ${a.gapText}`
    case 'matching':
      return `Zuordnen: ${a.left.map((l, i) => `${l} → ${a.right[a.pairs[i]] ?? '?'}`).join('; ')} (rechts insgesamt: ${a.right.join(', ')})`
    case 'multipleChoice':
      return `Multiple Choice: ${a.options.map((o, i) => (a.correct.includes(i) ? `[richtig] ${o}` : o)).join(' | ')}`
    case 'trueFalse':
      return `Richtig/falsch: ${a.statements.map((s) => `${s.text} (${s.isTrue ? 'richtig' : 'falsch'})`).join('; ')}`
    case 'ordering':
      return `Ordnen (richtige Reihenfolge): ${a.items.join(' → ')}`
    case 'tableFill':
      return `Tabelle ausfüllen: ${a.headers.join(' | ')}`
    case 'labels':
      return `Beschriften: ${a.labels.join(', ')}`
    default:
      return `Antwortbereich: ${a.kind}${a.count ? ` (${a.count})` : ''}`
  }
}

/** Textfassung eines Bausteins für die KI-Prüfung und die gezielte Neu-Erzeugung. */
export function describeBlock(b: WsBlock): string {
  const stars = b.stars ? ` ${'★'.repeat(b.stars)}` : ''
  switch (b.type) {
    case 'learningGoals':
      return `Lernziele: ${b.goals.join('; ')}`
    case 'infoBox':
      return `Kasten (${b.variant}) „${b.title}“: ${plainText(b.body)}`
    case 'text':
      return `Text „${b.title}“: ${plainText(b.body)}${b.glossary.length ? ` | Worterklärungen: ${b.glossary.map((g) => g.term).join(', ')}` : ''}`
    case 'phrases':
      return `Nützliche Ausdrücke „${b.title}“: ${b.groups.map((g) => `${g.label}: ${g.items.map((it) => it.text).join(', ')}`).join(' | ')}`
    case 'image':
      if (b.items?.length)
        return `Bildreihe „${b.caption}“: ${b.items.map((it, k) => `${k + 1}) ${it.description}${it.caption ? ` [${it.caption}]` : ''}`).join('; ')}`
      return `Bild: ${b.description}${b.image ? ' (vorhanden)' : ' (fehlt noch)'}`
    case 'task':
      return [
        `Aufgabe${stars} [AFB ${b.afb ?? '?'}, ${b.operator || 'kein Operator'}, ${b.socialForm}, ${b.minutes} Min.${b.skill ? `, ${b.skill}` : ''}]: ${plainText(b.instruction)}`,
        b.brief
          ? `  Vorgaben: ${[b.brief.situation, b.brief.audience, b.brief.textType, b.brief.purpose, b.brief.words ? `${b.brief.words} Wörter` : ''].filter(Boolean).join(' | ')}`
          : '',
        b.parts.length
          ? b.parts
              .map((p, i) => `  ${String.fromCharCode(97 + i)}) ${plainText(p.instruction)} – ${describeAnswer(p.answer)} – Lösung: ${plainText(p.solution)}`)
              .join('\n')
          : `  ${describeAnswer(b.answer)}`,
        `  Lösung: ${plainText(b.solution)}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'illustration':
      return `Illustration (Maskottchen, ${b.pose})${b.bubble ? ` mit Sprechblase: ${b.bubble}` : ''}`
    case 'scaffold':
      return `Hilfe (${b.variant}) „${b.title}“: ${b.items.join(' | ')}`
    case 'table':
      return `Tabelle „${b.title}“: ${b.headers.join(' | ')} / ${b.rows.map((r) => r.join(' | ')).join(' / ')}`
    case 'workspace':
      return `Arbeitsfläche (${b.kind}, ${b.heightMm} mm)`
    case 'grid': {
      const a = b.axes
      const axes =
        b.kind === 'koordinaten'
          ? `, x ${a.xMin}…${a.xMax} (${a.xLabel}), y ${a.yMin}…${a.yMax} (${a.yLabel})`
          : b.kind === 'klima'
            ? ', zwölf Monate, Temperatur und Niederschlag'
            : ''
      return `Gitternetz (${b.kind}${axes})${b.title ? ` „${b.title}“` : ''}`
    }
    case 'audio':
      return [
        `Hörtext „${b.title}“ (${b.textType}, ${b.plays}× hören, ca. ${b.seconds} s)`,
        b.beforeListening ? `  Vor dem Hören: ${plainText(b.beforeListening)}` : '',
        `  Skript: ${plainText(b.transcript)}`
      ]
        .filter(Boolean)
        .join('\n')
    case 'video':
      return [
        `Film/Video „${b.title}“: ${b.sourceTitle || 'ohne Titel'} (${b.kind}${b.minutes ? `, ${b.minutes} min` : ''}${b.section ? `, Abschnitt ${b.section}` : ''}, ${b.plays}× zeigen)`,
        b.summary ? `  Worum es geht: ${plainText(b.summary)}` : '',
        b.beforeViewing ? `  Vor dem Sehen: ${plainText(b.beforeViewing)}` : '',
        b.url ? `  Adresse: ${b.url}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    case 'selfCheck':
      return `Selbsteinschätzung: ${b.statements.join('; ')}`
    case 'divider':
      return `Abschnitt: ${b.title}`
    case 'protocol':
      return [
        `${b.title} (Protokoll, zum Ausfüllen) – Abschnitte: ${b.abschnitte.map((a) => a.titel).join(', ')}`,
        ...b.abschnitte.filter((a) => a.vorgabe).map((a) => `${a.titel} (vorgegeben): ${a.vorgabe}`),
        b.chemikalien?.length ? `Chemikalien: ${b.chemikalien.map((c) => c.name).join(', ')}` : '',
        b.abschnitte.some((a) => a.muster) ? `Erwartung: ${b.abschnitte.filter((a) => a.muster).map((a) => `${a.titel}: ${a.muster}`).join(' | ')}` : ''
      ]
        .filter(Boolean)
        .join('\n')
  }
}

export function describeSheet(sheet: Sheet): string {
  return sheet.blocks.map((b, i) => `(${i + 1}) ${describeBlock(b)}`).join('\n\n')
}
