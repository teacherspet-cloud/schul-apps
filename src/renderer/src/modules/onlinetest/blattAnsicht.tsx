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
import type { Antworten, Bewertung, Zeichen } from './kern'
import { useLayoutEffect, useRef, useState } from 'react'

/** Was der Server je Test mitliefert (Kopf und Einstellungen des Vokabeltests) */
export type BlattKopf = Pick<TestDocument, 'header' | 'settings' | 'fontSize'>

const feldId = (block: string, item: string, teil = 'a'): string => `${block}.${item}.${teil}`

/**
 * Zeichen hinter einer Wortlücke: richtig, knapp richtig, falsch, zu allgemein oder noch offen.
 * Dahinter steht die Kennung der Einheit (⟦…⟧) – `faerbeMarken` macht daraus ein anklickbares
 * Zeichen; die Lehrkraft kann es in der Blattansicht ändern (03.10.2026).
 */
function marke(b: Bewertung, einheit: string): string {
  const x = b[einheit]
  if (!x) return ''
  const z =
    x.status === 'richtig'
      ? x.knapp
        ? '(✓)'
        : '✓'
      : x.status === 'falsch' && x.frage
      ? '?'
      : x.status === 'falsch' && !(x.pruefen && x.quelle !== 'lehrkraft')
      ? '✗'
      : '?'
  return ` ${z}⟦${einheit}⟧`
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
      // Kästchen-Aufgaben (07.10.2026): das Zeichen steht hinter dem Wort bzw. dem Satz – im Kästchen ist kein Platz
      case 'match':
        k.left.forEach((l) => {
          const f = feldId(k.id, l.id)
          l.answerId = a[f] ?? ''
          l.text = `${l.text}${marke(b, f)}`
        })
        break
      case 'choice':
        k.items.forEach((it) => {
          const f = feldId(k.id, it.id)
          const w = a[f]
          it.correct = w === undefined || w === '' ? -1 : Number(w)
          it.after = `${it.after}${marke(b, f)}`
        })
        break
      case 'open':
        k.items.forEach((it) => (it.modelAnswer = text(feldId(k.id, it.id))))
        break
      case 'trueFalse':
        k.items.forEach((it) => {
          const w = feldId(k.id, it.id, 'w')
          it.isTrue = a[w] === 'true'
          // Mit Zeichen der Einheit (06.10.2026) – so lässt sich die Korrektur im Blatt finden und entscheiden.
          // Ohne sichtbare Korrekturzeile (nicht verlangt oder „richtig" angekreuzt) steht das Zeichen hinter der Aussage.
          if (k.askCorrection && !it.isTrue) it.correction = text(feldId(k.id, it.id, 'k'), w)
          else it.statement = `${it.statement}${marke(b, w)}`
        })
        break
      case 'oddOneOut':
        k.items.forEach((it) => {
          const w = feldId(k.id, it.id, 'w')
          it.answer = a[w] ?? ''
          if (k.askReason) it.reason = text(feldId(k.id, it.id, 'r'), w)
          else {
            // Ohne Begründung trägt das gewählte Wort das Zeichen
            const i = it.words.indexOf(it.answer)
            if (i >= 0) it.answer = it.words[i] = `${it.answer}${marke(b, w)}`
          }
        })
        break
      case 'categorize':
        k.words.forEach((w) => {
          const f = feldId(k.id, w.id)
          w.categoryId = a[f] ?? ''
          w.text = `${w.text}${marke(b, f)}`
        })
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
 * Zeichen stehen als Text in den Antwortfeldern – gefärbt wird im fertigen HTML. Mit der Kennung
 * der Einheit werden sie in der Ansicht anklickbar (data-einheit); im Druck bleibt nur das Zeichen.
 */
export const faerbeMarken = (html: string): string =>
  html.replace(/ (\(✓\)|✓|✗|\?)(?:⟦([^⟧<]*)⟧)?(?=<)/g, (_m, z: string, einheit?: string) => {
    const art = z === '✓' ? 'vt-marke-ok' : z === '(✓)' ? 'vt-marke-ok vt-marke-knapp' : z === '✗' ? 'vt-marke-falsch' : 'vt-marke-offen'
    return ` <span class="vt-marke ${art}"${einheit ? ` data-einheit="${einheit.replace(/"/g, '&quot;')}"` : ''}>${z}</span>`
  })

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
  abgabe,
  aendern,
  fokus,
  entscheiden
}: {
  kopf: BlattKopf
  variante: Variant
  antworten: Antworten
  bewertung: Bewertung
  abgabe: Abgabe
  /** Lehrkraft: Korrekturzeichen ändern (Klick aufs Zeichen) */
  aendern?: (einheit: string, zeichen: Zeichen) => void
  /**
   * „Im Test ansehen" aus dem Pop-up „Zu entscheiden" (06.10.2026): diese Einheit wie mit Textmarker hervorheben –
   * den Satz bzw. die Aussage, bei langen Texten nur die Lücke –, hinrollen und daneben ✓/✗ anbieten.
   */
  fokus?: string
  entscheiden?: (richtig: boolean) => void
}): React.JSX.Element {
  const html = blattHtml(kopf, variante, antworten, bewertung, abgabe)
  const [menue, setMenue] = useState<{ einheit: string; x: number; y: number } | null>(null)
  const huelle = useRef<HTMLDivElement>(null)
  const [fokusLage, setFokusLage] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const root = huelle.current
    if (!root || !fokus) return
    root.querySelectorAll('.vt-fokus, .vt-fokus-luecke').forEach((x) => x.classList.remove('vt-fokus', 'vt-fokus-luecke'))
    const marke = root.querySelector<HTMLElement>(`[data-einheit="${CSS.escape(fokus)}"]`)
    if (!marke) return setFokusLage(null)
    // Satz/Aussage (eine Einheit des Blatts); ist sie ein langer Text, nur die Lücke selbst
    const satz = marke.closest<HTMLElement>('[data-unit]')
    const luecke = marke.parentElement
    const bereich = satz && (satz.textContent ?? '').length <= 260 ? satz : luecke ?? marke
    bereich.classList.add('vt-fokus')
    if (luecke && luecke !== bereich) luecke.classList.add('vt-fokus-luecke')
    const r = bereich.getBoundingClientRect()
    const basis = root.getBoundingClientRect()
    // Rechts neben der Stelle – passt die Leiste dort nicht mehr ins Blatt, rechtsbündig darunter
    const leiste = 116
    const rechts = r.right - basis.left + 8
    setFokusLage(
      rechts + leiste <= root.clientWidth
        ? { x: rechts, y: r.top - basis.top }
        : { x: Math.max(0, r.right - basis.left - leiste), y: r.bottom - basis.top + 10 }
    )
    bereich.scrollIntoView({ block: 'center' })
  }, [html, fokus])
  if (!aendern && !fokus) return <div className="editor-sheet" data-abgabe-blatt dangerouslySetInnerHTML={{ __html: html }} />
  return (
    <div style={{ position: 'relative' }} ref={huelle}>
      {fokus && entscheiden && fokusLage && (
        <div
          style={{
            position: 'absolute',
            left: fokusLage.x,
            top: Math.max(0, fokusLage.y - 6),
            zIndex: 21,
            display: 'flex',
            gap: 6,
            padding: 5,
            background: 'var(--mantine-color-body)',
            border: '2px solid #fcc419',
            borderRadius: 10,
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)'
          }}
          data-fokus-entscheiden
        >
          <button
            type="button"
            title="Punkt geben"
            aria-label="Punkt geben"
            style={ENTSCHEIDEN_KNOPF('#2f9e44')}
            onClick={() => entscheiden(true)}
            data-fokus-ja
          >
            ✓
          </button>
          <button
            type="button"
            title="Keinen Punkt"
            aria-label="Keinen Punkt"
            style={ENTSCHEIDEN_KNOPF('#e03131')}
            onClick={() => entscheiden(false)}
            data-fokus-nein
          >
            ✗
          </button>
        </div>
      )}
      <div
        className={aendern ? 'editor-sheet vt-zeichen-aenderbar' : 'editor-sheet'}
        data-abgabe-blatt
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          if (!aendern) return
          const el = (e.target as HTMLElement).closest('[data-einheit]') as HTMLElement | null
          if (!el) return setMenue(null)
          const r = el.getBoundingClientRect()
          const basis = e.currentTarget.getBoundingClientRect()
          setMenue({ einheit: el.dataset.einheit!, x: r.left - basis.left, y: r.bottom - basis.top + 4 })
        }}
      />
      {menue && (
        <div
          style={{
            position: 'absolute',
            left: menue.x,
            top: menue.y,
            zIndex: 20,
            display: 'flex',
            gap: 4,
            padding: 4,
            background: 'var(--mantine-color-body)',
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 8,
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
          }}
          data-zeichen-menue
        >
          {(
            [
              ['richtig', '✓', 'richtig', '#2f9e44'],
              ['knapp', '(✓)', 'knapp richtig – volle Punkte, aber nicht fehlerfrei', '#2f9e44'],
              ['falsch', '✗', 'falsch', '#e03131'],
              ['frage', '?', 'zu allgemein / unklar – keine Punkte', '#f08c00']
            ] as const
          ).map(([z, zeichen, titel, farbe]) => (
            <button
              key={z}
              type="button"
              title={titel}
              aria-label={titel}
              style={{
                font: 'inherit',
                fontWeight: 800,
                color: farbe,
                minWidth: 40,
                height: 34,
                borderRadius: 6,
                border: '1px solid var(--mantine-color-default-border)',
                background: 'var(--mantine-color-body)',
                cursor: 'pointer'
              }}
              onClick={() => {
                aendern?.(menue.einheit, z)
                setMenue(null)
              }}
              data-zeichen={z}
            >
              {zeichen}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const ENTSCHEIDEN_KNOPF = (farbe: string): React.CSSProperties => ({
  font: 'inherit',
  fontSize: 20,
  fontWeight: 800,
  color: '#fff',
  background: farbe,
  minWidth: 46,
  height: 40,
  borderRadius: 8,
  border: 0,
  cursor: 'pointer'
})

const dokument = (kopf: BlattKopf, variants: Variant[]): TestDocument =>
  ({ ...kopf, variants, version: 1, vocab: [], createdAt: '' } as unknown as TestDocument)

/** Druck/PDF: ein Blatt je Abgabe, jedes auf eigenen Seiten */
export function abgabenHtml(kopf: BlattKopf, abgaben: { variante: Variant; antworten: Antworten; bewertung: Bewertung; abgabe: Abgabe }[]): string {
  const seiten = abgaben.map(({ variante, antworten, bewertung, abgabe }) => blattHtml(kopf, variante, antworten, bewertung, abgabe))
  const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  return `<!doctype html>
<html lang="${esc(kopf.settings.targetLanguage || 'en')}"><head><meta charset="utf-8"><title>${esc(kopf.header.title)}</title>
<style>
html, body { margin: 0; padding: 0; background: #fff; }
.vt-page { page-break-after: always; break-after: page; min-height: auto; }
.vt-page:last-child { page-break-after: auto; break-after: auto; }
${testCss}
</style></head><body>${seiten.join('\n')}</body></html>`
}
