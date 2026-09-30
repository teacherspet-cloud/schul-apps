import type { PagePlan } from '../../../shared/render/paginate'
import { kiVermerkText, vermerkSichtbar } from '@shared/kiKennzeichnung'
import { blockPoints, firstLetterOf, formatPoints, letter, variantPoints, wordBankFor } from '../model/blocks'
import type { Block, TestDocument, Variant } from '../model/types'
import { blockHelp, errechneteHilfe } from './helpTexts'
import { isEditable, showsAnswers, T, useRender } from './RenderContext'
import { trueFalseLabels } from '../../../shared/trueFalseLabels'
import { geltendeFachfarbe } from '../../../shared/fachfarben'
import { fachPfad, ueberthemaVon } from '../../../shared/ueberthema'
import { LANGUAGES } from '../model/types'
import { MaskottchenBild } from '../../arbeitsblatt/render/Illustration'
import { vokabeltestFigur } from './maskottchen'
import { kopfTexte } from './aufgabenTexte'
import { istRtl, schriftFamilie } from '../../../shared/sprachSchrift'

/** Seitenaufteilung eines Tests (aus der Messung in useTestLayout). */
export interface PageLayout {
  fontSize: number
  /** Engere Abstände, damit der Test auf die gewünschte Seitenzahl passt */
  compact: boolean
  pages: PagePlan[]
}

/** Ausschnitt eines geteilten Blocks (Items von–bis) */
export interface BlockRange {
  from: number
  to: number
  continued: boolean
}

/** Aufgabenarten, deren Items auf mehrere Seiten verteilt werden dürfen */
export const SPLITTABLE_KINDS = new Set<Block['kind']>(['gap', 'choice', 'open', 'trueFalse', 'oddOneOut', 'scramble'])

/**
 * „Englisch › Unit 3" – Sprache und Überthema für den Kopf (Paket 11); leer ohne Überthema.
 * Vokabeltests haben keine Designvorlage, deshalb immer als Pfad.
 */
export function vokabeltestPfad(doc: TestDocument): string {
  const ueber = ueberthemaVon(doc.header)
  if (!ueber) return ''
  return fachPfad(LANGUAGES.find((l) => l.value === doc.settings.targetLanguage)?.label ?? '', ueber)
}

/** Fachfarbe eines Vokabeltests (nach der Zielsprache) oder null = schwarz – für Vorschau, Druck und Word */
export const vokabeltestFarbe = (doc: TestDocument): string | null => geltendeFachfarbe(doc.settings.targetLanguage, doc.header.vorlagenfarbe)

/**
 * Eine Testvariante als A4-Seiten. Wird für Editor, Druck und PDF gleichermaßen genutzt.
 * Ohne `layout` (z. B. beim Messen) entsteht eine einzige, beliebig lange Seite.
 */
export function TestPage({
  doc,
  variant,
  layout,
  wrapBlock,
  footer
}: {
  doc: TestDocument
  variant: Variant
  layout?: PageLayout
  /** Im Editor: Rahmen mit Werkzeugleiste um jede Aufgabe */
  wrapBlock?: (block: Block, index: number, content: React.JSX.Element) => React.ReactNode
  /** Erscheint am Ende der letzten Seite */
  footer?: React.ReactNode
}): React.JSX.Element {
  const { mode } = useRender()
  const fontSize = layout?.fontSize ?? doc.fontSize
  const pages: PagePlan[] = layout?.pages ?? [{ items: variant.blocks.map((b) => ({ id: b.id })), overflow: false }]
  const pageClass = `vt-page ${showsAnswers(mode) ? 'vt-key' : ''} ${layout?.compact ? 'vt-compact' : ''} ${layout ? 'vt-page-fixed' : ''}`
  // Kopflinie und Aufgabennummern in der Fachfarbe der Sprache (Paket 10a); ohne sie schwarz wie bisher
  const akzent = vokabeltestFarbe(doc)
  // Schlussfigur (27.09.2026): jubelnd unten rechts im Seitenrand der letzten Seite – nie im Lösungsteil
  const figur = showsAnswers(mode) ? null : vokabeltestFigur(doc)
  /*
   * Schrift und Schreibrichtung der Testsprache (30.09.2026): Altgriechisch polyton (Palatino
   * Linotype), Chinesisch/Japanisch mit Schriftzeichen-Schrift, Arabisch von rechts nach links.
   * Deutsche Wörter in einem arabischen Test bleiben durch den Unicode-Bidi-Algorithmus lesbar.
   */
  const sprache = doc.settings.targetLanguage
  const schrift = schriftFamilie(sprache)
  const rtl = istRtl(sprache)

  return (
    <>
      {pages.map((plan, pi) => (
        <div
          key={pi}
          className={pageClass}
          lang={sprache || undefined}
          dir={rtl ? 'rtl' : undefined}
          style={{ fontSize: `${fontSize}pt`, ...(schrift ? { fontFamily: schrift } : {}), ...(akzent ? { ['--vt-accent' as string]: akzent } : {}) }}
          data-page={pi + 1}
        >
          {pi === 0 && <TestHeader doc={doc} variant={variant} />}
          {plan.items.map((placed) => {
            const index = variant.blocks.findIndex((b) => b.id === placed.id)
            const block = variant.blocks[index]
            if (!block) return null
            const range =
              placed.from !== undefined && placed.to !== undefined ? { from: placed.from, to: placed.to, continued: Boolean(placed.continued) } : undefined
            const key = `${block.id}-${placed.from ?? 0}`
            const content = <BlockView key={key} block={block} number={index + 1} lang={doc.settings.targetLanguage} range={range} />
            return wrapBlock ? <div key={key}>{wrapBlock(block, index, content)}</div> : content
          })}
          {pi === pages.length - 1 && footer}
          {figur && pi === pages.length - 1 && <MaskottchenBild id={figur.maskottchenId} pose="jubelnd" className="vt-illu vt-illu-schluss" />}
          {/* KI-Vermerk (Großprogramm 0.4) am Ende der letzten Seite */}
          {pi === pages.length - 1 && vermerkSichtbar(doc.ki, doc.kiVermerk, showsAnswers(mode)) && (
            <div className="vt-ki-vermerk">{kiVermerkText(doc.ki!, 'de')}</div>
          )}
          {pages.length > 1 && (
            <div className="vt-page-number">
              {pi + 1} / {pages.length}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

export function TestHeader({ doc, variant }: { doc: TestDocument; variant: Variant }): React.JSX.Element {
  const { mode } = useRender()
  const key = showsAnswers(mode)
  const h = doc.header
  const total = variantPoints(variant)
  const multi = doc.variants.length > 1
  // Überthema (Paket 11): „Englisch › Unit 3" oben rechts im Kopf; ohne Überthema wie bisher
  const pfad = vokabeltestPfad(doc)
  // Kopffigur (27.09.2026): winkend oben rechts; Kopfzeile und Titelzeile rücken ihr aus dem Weg
  const figur = key ? null : vokabeltestFigur(doc)
  // Feste Kopftexte in der Testsprache (30.09.2026) – vorher immer englisch
  const k = kopfTexte(doc.settings.targetLanguage)
  return (
    <header className={`vt-header${figur ? ' vt-header-illu' : ''}`}>
      {figur && <MaskottchenBild id={figur.maskottchenId} pose="winkend" className="vt-illu vt-illu-kopf" />}
      {pfad ? (
        <div className="vt-kopfzeile">
          <span className="vt-school">{h.showSchool ? h.schoolName : ''}</span>
          <span className="vt-ueberthema" data-ueberthema={ueberthemaVon(h)}>
            {pfad}
          </span>
        </div>
      ) : (
        h.showSchool && h.schoolName && <div className="vt-school">{h.schoolName}</div>
      )}
      <div className="vt-title-row">
        <h1 className="vt-title">
          {h.title}
          {key && ` – ${k.loesung}`}
        </h1>
        {h.showVariant && multi && <div className="vt-variant">{k.gruppe(variant.label)}</div>}
      </div>
      {h.subtitle && <div className="vt-subtitle">{h.subtitle}</div>}
      {!key && (h.showName || h.showClass || h.showDate) && (
        <div className="vt-fields">
          {h.showName && (
            <div className="vt-field vt-field-name">
              <span>{k.name}</span>
              <span className="vt-field-line" />
            </div>
          )}
          {h.showClass && (
            <div className="vt-field vt-field-class">
              <span>{k.klasse}</span>
              <span className="vt-field-line" />
            </div>
          )}
          {h.showDate && (
            <div className="vt-field vt-field-date">
              <span>{k.datum}</span>
              <span className="vt-field-line" />
            </div>
          )}
        </div>
      )}
      {(h.showPoints || h.showGrade) && (
        <div className="vt-score">
          {h.showPoints && (
            <span>
              {k.punkte} {key ? '' : <span className="vt-score-blank" />} / {formatPoints(total)}
            </span>
          )}
          {h.showGrade && !key && (
            <span>
              {k.note} <span className="vt-score-blank" />
            </span>
          )}
        </div>
      )}
    </header>
  )
}

export function BlockView({ block, number, lang = 'en', range }: { block: Block; number: number; lang?: string; range?: BlockRange }): React.JSX.Element {
  const { mode, updateBlock } = useRender()
  const set = <K extends keyof Block>(key: K) =>
    updateBlock
      ? (v: string) =>
          updateBlock(block.id, (d) => {
            ;(d as unknown as Record<string, unknown>)[key as string] = v
          })
      : undefined
  const points = blockPoints(block)
  const continued = range?.continued ?? false
  const help = !showsAnswers(mode) ? blockHelp(block, lang) : []

  return (
    <section className={`vt-block vt-kind-${block.kind} ${continued ? 'vt-block-continued' : ''}`}>
      {!continued && (
        <>
          <div className="vt-block-head">
            <span className="vt-num">{number}</span>
            <T className="vt-block-title" value={block.title} onChange={set('title')} />
            {points > 0 && (
              <span className="vt-points">
                {showsAnswers(mode) ? '' : '____ '}/ {formatPoints(points)} P.
              </span>
            )}
          </div>
          {(block.instruction || isEditable(mode)) && (
            <T className="vt-instruction" value={block.instruction} onChange={set('instruction')} block placeholder="Arbeitsanweisung" />
          )}
          {/*
           * Hinweiszeile (ⓘ) – seit 30.09.2026 im Editor bearbeitbar wie die Arbeitsanweisung.
           * Entspricht die Eingabe wieder dem errechneten Hinweis, gilt wieder dieser (er folgt
           * dann Änderungen an der Aufgabe); leer = keine Hinweiszeile auf dem Blatt.
           */}
          {(help.length > 0 || (mode === 'edit' && block.showHelp !== false && block.helpText !== undefined)) && (
            <div className="vt-help">
              <span className="vt-help-icon">i</span>
              <T
                className="vt-help-text"
                value={help.join(' ')}
                placeholder="Hinweiszeile (leer = keine)"
                onChange={
                  updateBlock
                    ? (v) =>
                        updateBlock(block.id, (d) => {
                          const neu = v.replace(/\s+/g, ' ').trim()
                          if (neu === errechneteHilfe(d, lang).join(' ')) delete d.helpText
                          else d.helpText = neu
                        })
                    : undefined
                }
              />
            </div>
          )}
        </>
      )}
      <BlockBody block={block} range={range} />
    </section>
  )
}

// ---------- Hilfskomponenten ----------

/** Liefert einen onChange-Handler, der einen Wert in einem Entwurf setzt. */
function useSetter<B extends Block>(block: B) {
  const { updateBlock } = useRender()
  return (apply: (draft: B, value: string) => void) => (updateBlock ? (v: string) => updateBlock(block.id, (d) => apply(d as B, v)) : undefined)
}

function Gap({ answer, hintFirstLetter, width }: { answer: string; hintFirstLetter?: boolean; width?: number }): React.JSX.Element {
  const { mode } = useRender()
  // Einheitliche Länge: die Lücke darf die Länge der Lösung nicht verraten
  const em = width ?? 9
  if (showsAnswers(mode)) return <span className="vt-gap vt-gap-answer">{answer}</span>
  return (
    <span className="vt-gap" style={{ minWidth: `${em}em` }}>
      {hintFirstLetter ? <span className="vt-first-letter">{firstLetterOf(answer)}</span> : ' '}
    </span>
  )
}

/** Lösung nur im Lösungsblatt sichtbar (dort im Editor bearbeitbar), auf dem Schülerblatt eine leere Lücke. */
function EditableGap({ answer, onChange, hintFirstLetter }: { answer: string; onChange?: (v: string) => void; hintFirstLetter?: boolean }): React.JSX.Element {
  const { mode } = useRender()
  if (mode === 'editKey') {
    return (
      <span className="vt-gap vt-gap-answer vt-gap-edit">
        <T value={answer} onChange={onChange} />
      </span>
    )
  }
  return <Gap answer={answer} hintFirstLetter={hintFirstLetter} />
}

const LEADING_PUNCTUATION = /^[,.;:!?)\]}»«"'’”…]+/

/**
 * Text direkt nach einer Lücke. Satzzeichen am Anfang werden fest an die Lücke gebunden,
 * damit z. B. ein Komma nie allein an den Anfang der nächsten Zeile rutscht.
 */
function AfterGap({ glued, text, onChange }: { glued: React.ReactNode; text: string; onChange?: (v: string) => void }): React.JSX.Element {
  const punct = LEADING_PUNCTUATION.exec(text)?.[0] ?? ''
  const rest = text.slice(punct.length)
  return (
    <>
      <span className="vt-nowrap">
        {glued}
        {punct && <T value={punct} onChange={onChange ? (v) => onChange(v + rest) : undefined} />}
      </span>
      {rest && (punct || /^\s/.test(rest) ? '' : ' ')}
      {(rest || !punct) && <T value={rest} onChange={onChange ? (v) => onChange(punct + v) : undefined} />}
    </>
  )
}

function ItemControls({
  blockId,
  itemId,
  canRegenerate = true,
  image,
  firstLetter
}: {
  blockId: string
  itemId: string
  canRegenerate?: boolean
  image?: boolean
  /** Schalter „Anfangsbuchstabe vorgeben" für dieses Item */
  firstLetter?: { active: boolean; toggle?: (v: string) => void }
}): React.JSX.Element | null {
  const { mode, actions } = useRender()
  if (mode !== 'edit' || !actions) return null
  const busy = actions.busyItems?.has(itemId)
  return (
    <span className="vt-item-controls">
      {firstLetter?.toggle && (
        <button
          type="button"
          className={firstLetter.active ? 'vt-control-active' : undefined}
          title={firstLetter.active ? 'Anfangsbuchstabe nicht mehr vorgeben' : 'Anfangsbuchstaben als Hilfe vorgeben'}
          onClick={() => firstLetter.toggle!('')}
        >
          A_
        </button>
      )}
      {image && actions.pickImage && (
        <button type="button" title="Bild wählen" onClick={() => actions.pickImage!(blockId, itemId)}>
          🖼
        </button>
      )}
      {canRegenerate && actions.regenerateItem && (
        <button type="button" title="Neu generieren" disabled={busy} onClick={() => actions.regenerateItem!(blockId, itemId)}>
          {busy ? '…' : '↻'}
        </button>
      )}
      {actions.deleteItem && (
        <button type="button" title="Entfernen" onClick={() => actions.deleteItem!(blockId, itemId)}>
          ✕
        </button>
      )}
    </span>
  )
}

function WordBank({ words }: { words: string[] }): React.JSX.Element | null {
  if (!words.length) return null
  return (
    <div className="vt-wordbank">
      {words.map((w, i) => (
        <span key={i} className="vt-wordbank-word">
          {w}
        </span>
      ))}
    </div>
  )
}

function Lines({ count }: { count: number }): React.JSX.Element {
  return (
    <div className="vt-lines">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="vt-line" />
      ))}
    </div>
  )
}

/** Nummerierte Liste; bei geteilten Blöcken nur der Ausschnitt mit fortlaufender Nummerierung. */
function ItemList<I extends { id: string }>({
  items,
  range,
  render
}: {
  items: I[]
  range?: BlockRange
  render: (item: I, index: number) => React.ReactNode
}): React.JSX.Element {
  const from = range?.from ?? 0
  const to = range?.to ?? items.length
  return (
    <ol className="vt-items" start={from + 1}>
      {items.slice(from, to).map((it, i) => (
        <li key={it.id} className="vt-item" data-unit>
          {render(it, from + i)}
        </li>
      ))}
    </ol>
  )
}

// ---------- Blockinhalte ----------

function BlockBody({ block, range }: { block: Block; range?: BlockRange }): React.JSX.Element | null {
  const { mode, language } = useRender()
  const lang = language ?? 'en'
  const answers = showsAnswers(mode)
  const editKey = mode === 'editKey'
  const set = useSetter(block)
  const head = !range?.continued

  switch (block.kind) {
    case 'gap': {
      const wrongWord = block.taskType === 'wrongWord'
      const twoSentences = block.taskType === 'twoSentences'
      return (
        <>
          {head && block.wordBank && !answers && <WordBank words={wordBankFor(block)} />}
          <ItemList
            items={block.items}
            range={range}
            render={(it, idx) => (
              <>
                {it.sentences.map((s, si) => {
                  const gap = wrongWord ? (
                    <span className="vt-wrong">
                      <T value={it.hint ?? ''} onChange={set((d, v) => ((d as typeof block).items[idx].hint = v))} />
                    </span>
                  ) : twoSentences ? (
                    // Kurze Lücke ohne Lösung; die Antwort gehört auf die gemeinsame Linie darunter
                    <span className="vt-gap vt-gap-short" />
                  ) : (
                    <EditableGap
                      answer={it.answer}
                      hintFirstLetter={block.firstLetterHint || it.firstLetter}
                      onChange={set((d, v) => ((d as typeof block).items[idx].answer = v))}
                    />
                  )
                  const glued =
                    !wrongWord && it.hint !== undefined ? (
                      <>
                        {gap}{' '}
                        <span className="vt-hint">
                          (<T value={it.hint} onChange={set((d, v) => ((d as typeof block).items[idx].hint = v))} />)
                        </span>
                      </>
                    ) : (
                      gap
                    )
                  return (
                    <div key={si} className={it.sentences.length > 1 ? 'vt-subsentence' : undefined}>
                      {it.sentences.length > 1 && <span className="vt-sub-label">{letter(si)})</span>}
                      <T value={s.before} onChange={set((d, v) => ((d as typeof block).items[idx].sentences[si].before = v))} />{' '}
                      <AfterGap glued={glued} text={s.after} onChange={set((d, v) => ((d as typeof block).items[idx].sentences[si].after = v))} />
                    </div>
                  )
                })}
                {(wrongWord || twoSentences) && (
                  <div className="vt-correction">
                    →{' '}
                    <EditableGap
                      answer={it.answer}
                      hintFirstLetter={block.firstLetterHint || it.firstLetter}
                      onChange={set((d, v) => ((d as typeof block).items[idx].answer = v))}
                    />
                  </div>
                )}
                <ItemControls
                  blockId={block.id}
                  itemId={it.id}
                  firstLetter={{
                    active: Boolean(it.firstLetter),
                    toggle: set((d) => ((d as typeof block).items[idx].firstLetter = !(d as typeof block).items[idx].firstLetter))
                  }}
                />
              </>
            )}
          />
        </>
      )
    }

    case 'gapText': {
      let n = 0
      const gluedPunct = new Map<number, string>()
      block.parts.forEach((p, idx) => {
        const next = block.parts[idx + 1]
        if (p.type === 'gap' && next?.type === 'text') {
          const punct = LEADING_PUNCTUATION.exec(next.text)?.[0]
          if (punct) gluedPunct.set(idx + 1, punct)
        }
      })
      return (
        <>
          {block.wordBank && !answers && <WordBank words={wordBankFor(block)} />}
          <div className="vt-gaptext">
            {block.parts.map((p, idx) => {
              if (p.type === 'text') {
                const cut = gluedPunct.get(idx)?.length ?? 0
                return (
                  <T
                    key={idx}
                    value={p.text.slice(cut)}
                    onChange={set((d, v) => {
                      const part = (d as typeof block).parts[idx] as { text: string }
                      part.text = part.text.slice(0, cut) + v
                    })}
                  />
                )
              }
              const punct = gluedPunct.get(idx + 1)
              return (
                <span key={p.id} className="vt-gaptext-gap vt-nowrap">
                  <span className="vt-gap-number">({++n})</span>
                  <EditableGap
                    answer={p.answer}
                    hintFirstLetter={block.firstLetterHint || p.firstLetter}
                    onChange={set((d, v) => (((d as typeof block).parts[idx] as { answer: string }).answer = v))}
                  />
                  {punct && (
                    <T
                      value={punct}
                      onChange={set((d, v) => {
                        const part = (d as typeof block).parts[idx + 1] as { text: string }
                        part.text = v + part.text.slice(punct.length)
                      })}
                    />
                  )}
                  <ItemControls
                    blockId={block.id}
                    itemId={p.id}
                    canRegenerate={false}
                    firstLetter={{
                      active: Boolean(p.firstLetter),
                      toggle: set((d) => {
                        const part = (d as typeof block).parts[idx] as { firstLetter?: boolean }
                        part.firstLetter = !part.firstLetter
                      })
                    }}
                  />
                </span>
              )
            })}
          </div>
        </>
      )
    }

    case 'match':
      return (
        <table className="vt-match">
          <tbody>
            {Array.from({ length: Math.max(block.left.length, block.right.length) }, (_, row) => {
              const l = block.left[row]
              const r = block.right[row]
              const answerIndex = l ? block.right.findIndex((x) => x.id === l.answerId) : -1
              return (
                <tr key={row}>
                  <td className="vt-match-box">{l && <span className="vt-box">{answers ? letter(answerIndex) : ''}</span>}</td>
                  <td className="vt-match-left">
                    {l && (
                      <>
                        <span className="vt-match-num">{row + 1}</span>
                        <T value={l.text} onChange={set((d, v) => ((d as typeof block).left[row].text = v))} />
                        <ItemControls blockId={block.id} itemId={l.id} canRegenerate={false} />
                      </>
                    )}
                  </td>
                  <td className="vt-match-right">
                    {r && (
                      <>
                        <span className="vt-match-letter">{letter(row)})</span>
                        <T value={r.text} onChange={set((d, v) => ((d as typeof block).right[row].text = v))} />
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )

    case 'choice':
      return (
        <ItemList
          items={block.items}
          range={range}
          render={(it, idx) => (
            <>
              <div>
                <T value={it.before} onChange={set((d, v) => ((d as typeof block).items[idx].before = v))} />{' '}
                <AfterGap
                  glued={<Gap answer={it.options[it.correct] ?? ''} width={6} />}
                  text={it.after}
                  onChange={set((d, v) => ((d as typeof block).items[idx].after = v))}
                />
              </div>
              <div className="vt-options">
                {it.options.map((o, oi) => (
                  <span
                    key={oi}
                    className={`vt-option ${answers && oi === it.correct ? 'vt-option-correct' : ''}`}
                    onDoubleClick={() => editKey && set((d) => ((d as typeof block).items[idx].correct = oi))?.('')}
                    title={editKey ? 'Doppelklick: als richtige Antwort markieren' : undefined}
                  >
                    {/*
                     * Buchstabe vor der Möglichkeit – dieselbe Form wie auf dem Arbeitsblatt
                     * und in der Klassenarbeit. Ohne Marke lässt sich eine Antwort beim
                     * Besprechen und im Erwartungshorizont nicht benennen („1 b").
                     */}
                    <span className="vt-option-letter">{String.fromCharCode(97 + oi)})</span>
                    <span className="vt-checkbox">{answers && oi === it.correct ? '✗' : ''}</span>
                    <T value={o} onChange={set((d, v) => ((d as typeof block).items[idx].options[oi] = v))} />
                  </span>
                ))}
              </div>
              <ItemControls blockId={block.id} itemId={it.id} />
            </>
          )}
        />
      )

    case 'open':
      return (
        <ItemList
          items={block.items}
          range={range}
          render={(it, idx) => (
            <>
              <T className="vt-open-prompt" value={it.prompt} onChange={set((d, v) => ((d as typeof block).items[idx].prompt = v))} />
              <ItemControls blockId={block.id} itemId={it.id} />
              {answers ? (
                <T
                  block
                  className="vt-model-answer"
                  value={it.modelAnswer}
                  onChange={set((d, v) => ((d as typeof block).items[idx].modelAnswer = v))}
                  placeholder="Musterlösung"
                />
              ) : (
                <Lines count={it.lines} />
              )}
            </>
          )}
        />
      )

    /*
     * LATEIN: der Muster-Vokabeltest als Tabelle „Vokabel | Form | Bedeutungen".
     *
     * Aufbau nach dem Leitfaden Latein SH 2016, S. 25. Die mittlere Spalte sagt an, WELCHE
     * Form verlangt wird – bei einem Substantiv wäre sonst unklar, ob Genitiv oder Akkusativ
     * gemeint ist, und beides steht je nach Lehrwerk und Lernstand in der Vokabelliste.
     */
    case 'latinForms':
      return (
        <table className="vt-latin-forms">
          <tbody>
            {block.items.slice(range?.from ?? 0, range?.to ?? block.items.length).map((it, i) => {
              const idx = (range?.from ?? 0) + i
              return (
                <tr key={it.id}>
                  <td className="vt-latin-term">
                    <T value={it.term} onChange={set((d, v) => ((d as typeof block).items[idx].term = v))} />
                    {/* Umschrift (Altgriechisch, optional) klein hinter dem Wort */}
                    {it.transliteration && <span className="vt-umschrift"> [{it.transliteration}]</span>}
                  </td>
                  <td className="vt-latin-form">
                    {/*
                      Bei Wörtern ohne eigene Nennform (Adverbien, Konjunktionen) steht im
                      Mustertest ein Strich und KEINE Lücke – sonst suchte man dort nach
                      etwas, das es nicht gibt.
                    */}
                    <span className="vt-latin-label">{it.formLabel}</span>
                    {it.formLabel === '—' ? null : answers ? (
                      <T className="vt-key-text" value={it.form} onChange={set((d, v) => ((d as typeof block).items[idx].form = v))} />
                    ) : (
                      <span className="vt-latin-blank" />
                    )}
                  </td>
                  <td className="vt-latin-meaning">
                    {answers ? (
                      <T className="vt-key-text" value={it.meanings} onChange={set((d, v) => ((d as typeof block).items[idx].meanings = v))} />
                    ) : (
                      <span className="vt-latin-blank" />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )

    /*
     * Unregelmäßige Verben (30.09.2026): die Tabelle des Schulbuchs – vorgegebene Zellen stehen da,
     * leere werden ergänzt; im Lösungsteil stehen die Formen der Liste in den Lücken.
     */
    case 'verbTable':
      return (
        <table className="vt-verb-table" data-verbtabelle>
          <thead>
            <tr>
              {block.headers.map((h, c) => (
                <th key={c}>
                  <T value={h} onChange={set((d, v) => ((d as typeof block).headers[c] = v))} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.slice(range?.from ?? 0, range?.to ?? block.rows.length).map((r, i) => {
              const idx = (range?.from ?? 0) + i
              return (
                <tr key={r.id}>
                  {r.cells.map((cell, c) =>
                    cell ? (
                      <td key={c}>
                        <T value={cell} onChange={set((d, v) => ((d as typeof block).rows[idx].cells[c] = v))} />
                      </td>
                    ) : (
                      <td key={c} className="vt-verb-blank">
                        {answers && <T className="vt-key-text" value={r.solution[c] ?? ''} onChange={set((d, v) => ((d as typeof block).rows[idx].solution[c] = v))} />}
                      </td>
                    )
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )

    case 'trueFalse':
      return (
        <ItemList
          items={block.items}
          range={range}
          render={(it, idx) => (
            <>
              <div className="vt-tf-row">
                <T value={it.statement} onChange={set((d, v) => ((d as typeof block).items[idx].statement = v))} />
                <span className="vt-tf-boxes">
                  <span className="vt-tf" onDoubleClick={() => editKey && set((d) => ((d as typeof block).items[idx].isTrue = true))?.('')}>
                    <span className="vt-checkbox">{answers && it.isTrue ? '✗' : ''}</span> {trueFalseLabels(lang).yes}
                  </span>
                  <span className="vt-tf" onDoubleClick={() => editKey && set((d) => ((d as typeof block).items[idx].isTrue = false))?.('')}>
                    <span className="vt-checkbox">{answers && !it.isTrue ? '✗' : ''}</span> {trueFalseLabels(lang).no}
                  </span>
                </span>
                <ItemControls blockId={block.id} itemId={it.id} />
              </div>
              {block.askCorrection &&
                (answers ? (
                  !it.isTrue && (
                    <T block className="vt-model-answer" value={it.correction} onChange={set((d, v) => ((d as typeof block).items[idx].correction = v))} />
                  )
                ) : (
                  <Lines count={1} />
                ))}
            </>
          )}
        />
      )

    case 'oddOneOut':
      return (
        <ItemList
          items={block.items}
          range={range}
          render={(it, idx) => (
            <>
              <div className="vt-odd-words">
                {it.words.map((w, wi) => (
                  <span key={wi} className={`vt-odd-word ${answers && w === it.answer ? 'vt-odd-answer' : ''}`}>
                    <T value={w} onChange={set((d, v) => ((d as typeof block).items[idx].words[wi] = v))} />
                  </span>
                ))}
                <ItemControls blockId={block.id} itemId={it.id} />
              </div>
              {block.askReason &&
                (answers ? (
                  <T block className="vt-model-answer" value={it.reason} onChange={set((d, v) => ((d as typeof block).items[idx].reason = v))} />
                ) : (
                  <div className="vt-reason">
                    Reason: <span className="vt-gap" style={{ minWidth: '70%' }} />
                  </div>
                ))}
            </>
          )}
        />
      )

    case 'categorize': {
      const rows = Math.max(...block.categories.map((c) => block.words.filter((w) => w.categoryId === c.id).length), 1)
      return (
        <>
          {!answers && <WordBank words={block.words.map((w) => w.text)} />}
          <table className="vt-categories">
            <thead>
              <tr>
                {block.categories.map((c, ci) => (
                  <th key={c.id}>
                    <T value={c.name} onChange={set((d, v) => ((d as typeof block).categories[ci].name = v))} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  {block.categories.map((c) => {
                    const w = block.words.filter((x) => x.categoryId === c.id)[r]
                    return <td key={c.id}>{answers && w ? w.text : ' '}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )
    }

    case 'mindmap': {
      // Oberbegriff in der Mitte, ringsum so viele leere Äste wie erwartete Wörter
      return (
        <div className="vt-mindmap">
          <div className="vt-mindmap-topic">
            <T value={block.topic} onChange={set((d, v) => ((d as typeof block).topic = v))} />
          </div>
          <div className="vt-mindmap-branches">
            {block.items.map((it, i) => (
              <div key={it.id} className="vt-mindmap-branch">
                <span className="vt-mindmap-dot">{i + 1}</span>
                <span className="vt-mindmap-line">{answers ? it.answer : ' '}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }

    case 'picture':
      return (
        <>
          {block.wordBank && !answers && <WordBank words={wordBankFor(block)} />}
          <div className="vt-pictures" style={{ gridTemplateColumns: `repeat(${block.columns}, 1fr)` }}>
            {block.items.map((it, idx) => (
              <div key={it.id} className="vt-picture">
                <div className="vt-picture-img">
                  {it.image ? <img src={it.image.dataUrl} alt="" /> : <span className="vt-picture-missing">Bild fehlt</span>}
                  <span className="vt-picture-num">{idx + 1}</span>
                </div>
                {answers ? (
                  <div className="vt-picture-answer">
                    <T value={it.answer} onChange={set((d, v) => ((d as typeof block).items[idx].answer = v))} />
                  </div>
                ) : (
                  <div className="vt-picture-line" />
                )}
                <ItemControls blockId={block.id} itemId={it.id} canRegenerate={false} image />
              </div>
            ))}
          </div>
        </>
      )

    case 'scramble':
      return (
        <ItemList
          items={block.items}
          range={range}
          render={(it, idx) => (
            <>
              <span className="vt-scrambled">{it.scrambled}</span>{' '}
              <T className="vt-scramble-hint" value={it.hint} onChange={set((d, v) => ((d as typeof block).items[idx].hint = v))} />
              <div className="vt-correction">
                → <EditableGap answer={it.answer} onChange={set((d, v) => ((d as typeof block).items[idx].answer = v))} />
              </div>
              <ItemControls blockId={block.id} itemId={it.id} />
            </>
          )}
        />
      )

    case 'crossword':
      return <Crossword block={block} />

    case 'freeText':
      return (
        <>
          <T block className="vt-freetext" value={block.text} onChange={set((d, v) => ((d as typeof block).text = v))} placeholder="Eigener Text …" />
          {block.lines > 0 && <Lines count={block.lines} />}
        </>
      )
  }
}

function Crossword({ block }: { block: Extract<Block, { kind: 'crossword' }> }): React.JSX.Element {
  const { mode, updateBlock } = useRender()
  const cells = new Map<string, { letter: string; number?: number }>()
  for (const e of block.entries) {
    for (let i = 0; i < e.answer.length; i++) {
      const r = e.row + (e.dir === 'down' ? i : 0)
      const c = e.col + (e.dir === 'across' ? i : 0)
      const k = `${r},${c}`
      const existing = cells.get(k)
      cells.set(k, { letter: e.answer[i], number: i === 0 ? e.number : existing?.number })
    }
  }
  const cellSize = Math.max(0.55, Math.min(0.95, 17 / Math.max(block.cols, 1)))
  const clueList = (dir: 'across' | 'down') => (
    <div className="vt-clues">
      <div className="vt-clues-title">{dir === 'across' ? 'Across →' : 'Down ↓'}</div>
      {block.entries
        .filter((e) => e.dir === dir)
        .map((e) => (
          <div key={e.id} className="vt-clue">
            <b>{e.number}</b>{' '}
            <T
              value={e.clue}
              onChange={
                updateBlock
                  ? (v) =>
                      updateBlock(block.id, (d) => {
                        const entry = (d as typeof block).entries.find((x) => x.id === e.id)
                        if (entry) entry.clue = v
                      })
                  : undefined
              }
            />
          </div>
        ))}
    </div>
  )

  return (
    <div className="vt-crossword">
      <table className="vt-crossword-grid" style={{ ['--cell' as string]: `${cellSize}cm` }}>
        <tbody>
          {Array.from({ length: block.rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: block.cols }, (_, c) => {
                const cell = cells.get(`${r},${c}`)
                return (
                  <td key={c} className={cell ? 'vt-cw-cell' : 'vt-cw-empty'}>
                    {cell?.number && <span className="vt-cw-number">{cell.number}</span>}
                    {cell && showsAnswers(mode) ? <span className="vt-cw-letter">{cell.letter}</span> : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="vt-clue-columns">
        {clueList('across')}
        {clueList('down')}
      </div>
    </div>
  )
}
