/**
 * Onlinetest als DIN-A4-Blatt (02.10.2026, Wunsch der Lehrkraft: „auf Knopfdruck den ganzen
 * Test als DIN-A4-Blatt sehen mit den Eingaben der Schüler").
 *
 * Abgestimmt: wie das gedruckte Blatt. Dafür braucht es keinen eigenen Zeichner – der
 * Vokabeltest kann seine Lösungen ins Blatt eintragen (Lösungsblatt). Hier werden an die
 * Stellen der Lösungen die ANTWORTEN der Schülerin bzw. des Schülers gesetzt; der Kopf zeigt
 * Name, Datum, erreichte Punkte und Note (RenderContext `abgabe`), die Eintragungen stehen in
 * Stiftblau (test.css, `.vt-abgabe`), an jeder Wortlücke ✓ bzw. ✗.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import type { Block, TestDocument, Variant } from '../vokabeltest/model/types'
import { RenderContext, type RenderContextValue } from '../vokabeltest/render/RenderContext'
import { TestPage } from '../vokabeltest/render/TestPage'
import testCss from '../vokabeltest/render/test.css?raw'
import type { Antworten, Bewertung } from './kern'

/** Was der Server je Test mitliefert (Kopf und Einstellungen des Vokabeltests) */
export type BlattKopf = Pick<TestDocument, 'header' | 'settings' | 'fontSize'>

const feldId = (block: string, item: string, teil = 'a'): string => `${block}.${item}.${teil}`

/** Zeichen hinter einer Wortlücke: richtig, falsch oder noch offen */
function marke(b: Bewertung, einheit: string): string {
  const x = b[einheit]
  if (!x) return ''
  if (x.status === 'richtig') return ' ✓'
  if (x.status === 'falsch' && !(x.pruefen && x.quelle !== 'lehrkraft')) return ' ✗'
  return ' ?'
}

/** Die Variante mit den Antworten an den Stellen der Lösungen */
export function mitAntworten(v: Variant, a: Antworten, b: Bewertung = {}): Variant {
  const text = (id: string, einheit = id): string => {
    const w = (a[id] ?? '').trim()
    return w ? `${w}${marke(b, einheit)}` : marke(b, einheit) ? `—${marke(b, einheit)}` : ''
  }
  const blocks = v.blocks.map((blk): Block => {
    const k = structuredClone(blk) as Block
    switch (k.kind) {
      case 'gap':
        k.items.forEach((it) => {
          // Zweiteilige Wendung: beide Felder, die Marke einmal am Ende
          if (it.sentences.length === 1 && it.sentences[0].mitte !== undefined && it.answer.includes('…')) {
            const e = feldId(k.id, it.id)
            it.answer = `${(a[e] ?? '').trim() || '—'} … ${(a[feldId(k.id, it.id, 'b')] ?? '').trim() || '—'}${marke(b, e)}`
          } else it.answer = text(feldId(k.id, it.id))
        })
        break
      case 'gapText': {
        let vorige = ''
        k.parts.forEach((p) => {
          if (p.type !== 'gap') return
          // Zweiter Teil einer Wendung: Bewertung steht an der Lücke davor
          p.answer = p.folge && vorige ? text(feldId(k.id, p.id), vorige) : text(feldId(k.id, p.id))
          if (!p.folge) vorige = feldId(k.id, p.id)
        })
        break
      }
      case 'match':
        k.left.forEach((l) => (l.answerId = a[feldId(k.id, l.id)] ?? ''))
        break
      case 'choice':
        k.items.forEach((it) => {
          const w = a[feldId(k.id, it.id)]
          it.correct = w === undefined || w === '' ? -1 : Number(w)
        })
        break
      case 'open':
        k.items.forEach((it) => (it.modelAnswer = text(feldId(k.id, it.id))))
        break
      case 'trueFalse':
        k.items.forEach((it) => {
          const w = feldId(k.id, it.id, 'w')
          it.isTrue = a[w] === 'true'
          it.correction = (a[feldId(k.id, it.id, 'k')] ?? '').trim()
        })
        break
      case 'oddOneOut':
        k.items.forEach((it) => {
          it.answer = a[feldId(k.id, it.id, 'w')] ?? ''
          it.reason = (a[feldId(k.id, it.id, 'r')] ?? '').trim()
        })
        break
      case 'categorize':
        k.words.forEach((w) => (w.categoryId = a[feldId(k.id, w.id)] ?? ''))
        break
      case 'mindmap':
        k.items.forEach((it) => (it.answer = text(feldId(k.id, it.id))))
        break
      case 'picture':
        k.items.forEach((it) => (it.answer = text(feldId(k.id, it.id))))
        break
      case 'scramble':
        k.items.forEach((it) => (it.answer = text(feldId(k.id, it.id))))
        break
      case 'crossword':
        // Das Gitter braucht die Länge des Lösungsworts: kürzer auffüllen, länger abschneiden
        k.entries.forEach((e) => {
          const soll = e.answer.replace(/\s/g, '').length
          e.answer = (a[feldId(k.id, e.id)] ?? '').replace(/\s/g, '').padEnd(soll, ' ').slice(0, soll)
        })
        break
      case 'latinForms':
        k.items.forEach((it) => {
          it.form = text(feldId(k.id, it.id, 'f'))
          it.meanings = text(feldId(k.id, it.id, 'b'))
        })
        break
      case 'verbTable':
        k.rows.forEach((r) => {
          r.solution = r.solution.map((s, i) => (r.cells[i] ? s : text(feldId(k.id, r.id, String(i)))))
        })
        break
      case 'freeText':
        // Der Schreibauftrag hat kein Lösungsfeld – der Text der Lernenden steht unter dem Auftrag
        k.text = `${k.text}\n\n${(a[feldId(k.id, 'text')] ?? '').trim() || '—'}`
        break
    }
    return k
  })
  return { ...v, blocks }
}

export interface Abgabe {
  name: string
  datum: string
  punkte: number
  max: number
  note: number | null
}

/**
 * Haken grün, Kreuze rot, offene Fragezeichen orange (Wunsch der Lehrkraft, 02.10.2026). Die
 * Zeichen stehen als Text in den Antwortfeldern – gefärbt wird im fertigen HTML.
 */
export const faerbeMarken = (html: string): string =>
  html.replace(/ (✓|✗|\?)(?=<)/g, (_m, z: string) => ` <span class="vt-marke ${z === '✓' ? 'vt-marke-ok' : z === '✗' ? 'vt-marke-falsch' : 'vt-marke-offen'}">${z}</span>`)

const blattHtml = (kopf: BlattKopf, variante: Variant, antworten: Antworten, bewertung: Bewertung, abgabe: Abgabe): string => {
  const v = mitAntworten(variante, antworten, bewertung)
  const wert: RenderContextValue = { mode: 'key', language: kopf.settings.targetLanguage, abgabe }
  return faerbeMarken(
    renderToStaticMarkup(
      <RenderContext.Provider value={wert}>
        <TestPage doc={dokument(kopf, [v])} variant={v} />
      </RenderContext.Provider>
    )
  )
}

/** Ein Blatt für die Anzeige in der App (nur zum Ansehen – deshalb als fertiges HTML) */
export function AbgabeBlatt({
  kopf,
  variante,
  antworten,
  bewertung,
  abgabe
}: {
  kopf: BlattKopf
  variante: Variant
  antworten: Antworten
  bewertung: Bewertung
  abgabe: Abgabe
}): React.JSX.Element {
  return <div className="editor-sheet" data-abgabe-blatt dangerouslySetInnerHTML={{ __html: blattHtml(kopf, variante, antworten, bewertung, abgabe) }} />
}

const dokument = (kopf: BlattKopf, variants: Variant[]): TestDocument => ({ ...kopf, variants, version: 1, vocab: [], createdAt: '' }) as unknown as TestDocument

/** Druck/PDF: ein Blatt je Abgabe, jedes auf eigenen Seiten */
export function abgabenHtml(kopf: BlattKopf, abgaben: { variante: Variant; antworten: Antworten; bewertung: Bewertung; abgabe: Abgabe }[]): string {
  const seiten = abgaben.map(({ variante, antworten, bewertung, abgabe }) => blattHtml(kopf, variante, antworten, bewertung, abgabe))
  const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  return `<!doctype html>
<html lang="${esc(kopf.settings.targetLanguage || 'en')}"><head><meta charset="utf-8"><title>${esc(kopf.header.title)}</title>
<style>
html, body { margin: 0; padding: 0; background: #fff; }
.vt-page { page-break-after: always; break-after: page; min-height: auto; }
.vt-page:last-child { page-break-after: auto; break-after: auto; }
${testCss}
</style></head><body>${seiten.join('\n')}</body></html>`
}
