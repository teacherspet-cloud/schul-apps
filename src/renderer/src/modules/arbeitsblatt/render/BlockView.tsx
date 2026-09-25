import { RichText } from '../../../shared/richtext/RichText'
import type { Answer, GridBlock, ImageBlock, ImageRole, TaskBlock, TaskPart, WsBlock } from '../model/types'
import { AnswerView, McOptions, gapRenderText } from './Answers'
import { ImageLabelLayer } from './ImageLabels'
import { PictogramIcon } from './Pictogram'
import { pictogramForInstruction, pictogramForSocialForm } from './pictograms'
import { gridDataUrl, gridDrawing } from './gridSvg'
import { qrDataUrl } from './qr'
import { INFO_VARIANTS, SOCIAL_FORM_LABELS, SOCIAL_FORM_SVG } from './icons'
import type { PlacedItem } from './paginate'
import { plainText } from '../../../shared/richtext/parse'
import { isEditMode, isKeyMode, useWs } from './WsContext'
import { COPYRIGHT_NOTE, QR_NOTE, videoKindById, VIEWING_PHASES } from '../didactics/videoTasks'
import { taskItems } from '../model/items'
import { exampleNote } from '../../../shared/exampleNote'
import { continuedNote } from '../../../shared/continuedNote'
import { archivesForSubject, searchesMediaSources } from '../didactics/mediaArchives'
import { headerLine } from '../didactics/sourceHeader'
import { narrationNote } from '../didactics/narration'
import { AI_AUDIO_NOTE, audioRulesFor, playsLabelFor } from '../didactics/audioRules'
import { istAnkreuzAufgabe, istMcListe, mcSpalten, mcZeilen, ohneOperator } from './mcGrid'

/** Ab dieser Länge gilt ein Text als „länger" und wird im Blocksatz gesetzt */
export const LONG_TEXT_CHARS = 320

export const splitParagraphs = (body: string): string[] =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

const stars = (n?: number): string => (n ? '★'.repeat(n) : '')

/**
 * Ein kurzes bearbeitbares Feld: Überschrift, Tabellenkopf, Bildunterschrift, Quellenangabe.
 *
 * Läuft bewusst über `RichText` und nicht über `Editable`. `Editable` gibt den Wert als
 * REINEN TEXT aus – dadurch stand in einer Lernzielkontrolle zu den Potenzgesetzen in der
 * Tabellenzeile die gesetzte Formel, im Tabellenkopf darüber aber wörtlich `$x^2$`. Formeln
 * und **Fettdruck** gehören in jedes Feld eines Arbeitsblatts, nicht nur in den Fließtext.
 */
function Feld({
  value,
  editable,
  onChange,
  className,
  placeholder
}: {
  value: string
  editable: boolean
  onChange?: (v: string) => void
  className?: string
  placeholder?: string
}): React.JSX.Element {
  return <RichText className={className} value={value} placeholder={placeholder} inline editable={editable} onChange={onChange} />
}

/** Alternativtext des Gitternetzes (Barrierefreiheit und Word-Export). */
export function gridAlt(block: GridBlock): string {
  if (block.kind === 'klima') return 'Raster für ein Klimadiagramm: zwölf Monate, links Temperatur, rechts Niederschlag'
  if (block.kind === 'koordinaten') {
    const a = block.axes
    return `Koordinatensystem, x von ${a.xMin} bis ${a.xMax}, y von ${a.yMin} bis ${a.yMax}`
  }
  if (block.kind === 'mm') return 'Millimeterpapier'
  return `Karoraster mit ${block.cellMm} mm Kästchen`
}

/** Spieldauer als m:ss. */
export function audioLength(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')} min`
}

export const playsLabel = (plays: number): string => (plays === 1 ? 'einmal hören' : plays === 2 ? 'zweimal hören' : `${plays}-mal hören`)

/**
 * Die Adresse in lesbarer Länge unter dem QR-Code.
 *
 * Abgetippt wird sie selten – aber sie muss abtippbar BLEIBEN, sonst hilft sie denen nicht,
 * die kein Gerät dabeihaben. Deshalb wird nur die Mitte gekürzt, nie der Anfang und nie das
 * Ende mit der Kennung des Videos.
 */
export function shortLink(url: string): string {
  const clean = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (clean.length <= 44) return clean
  return `${clean.slice(0, 26)}…${clean.slice(-16)}`
}

/** Liefert einen Setter, der einen Entwurf des Bausteins verändert. */
function useSetter<B extends WsBlock>(block: B) {
  const { update } = useWs()
  return (apply: (draft: B, value: string) => void) => (update ? (v: string) => update(block.id, (d) => apply(d as B, v)) : undefined)
}

export function BlockView({ block, placed }: { block: WsBlock; placed?: PlacedItem }): React.JSX.Element | null {
  const ctx = useWs()
  const { mode } = ctx
  const edit = mode === 'edit'
  const set = useSetter(block)

  switch (block.type) {
    case 'learningGoals':
      if (isKeyMode(mode)) return null
      return (
        <div className="ws-block ws-goals">
          <div className="ws-goals-title">
            <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as typeof block).title = v))} />
          </div>
          <ul>
            {block.goals.map((g, i) => (
              <li key={i}>
                <RichText value={g} inline editable={edit} onChange={set((d, v) => ((d as typeof block).goals[i] = v))} />
              </li>
            ))}
          </ul>
        </div>
      )

    case 'infoBox': {
      const v = INFO_VARIANTS[block.variant] ?? INFO_VARIANTS.merke
      return (
        <div className={`ws-block ws-info ws-info-${block.variant}`}>
          <div className="ws-info-head">
            <span className="ws-info-symbol">{v.symbol}</span>
            <Feld className="ws-info-title" value={block.title || v.label} editable={edit} onChange={set((d, val) => ((d as typeof block).title = val))} />
          </div>
          <RichText
            value={block.body}
            editable={edit}
            onChange={set((d, val) => ((d as typeof block).body = val))}
            placeholder="Inhalt des Kastens"
            // Ein Merkkasten darf Lücken tragen, die die Lernenden selbst füllen
            renderText={gapRenderText(isKeyMode(mode))}
          />
        </div>
      )
    }

    case 'text': {
      const materialNo = ctx.materialNumbers?.get(block.id)
      const paragraphs = splitParagraphs(block.body)
      const from = placed?.from ?? 0
      const to = placed?.to ?? paragraphs.length + (block.glossary.length ? 1 : 0)
      const showHead = from === 0
      const showGlossary = block.glossary.length > 0 && to > paragraphs.length
      const lineStart = placed?.lineStart ?? 0
      const lineCount = placed?.lineCount ?? 0
      // Blocksatz nur bei längeren Texten – kurze Absätze würden sonst zerrissen
      const justify = ctx.justify && plainText(block.body).length >= LONG_TEXT_CHARS
      // Auslassungszeichen sind Kennzeichnung, keine Woerter des Originals
      const materialWoerter = (
        plainText(block.body)
          .replace(/\[\s*(?:…|\.\.\.)\s*\]/g, ' ')
          .match(/[\p{L}\p{N}]+/gu) ?? []
      ).length
      return (
        <div
          /*
           * Notizrand: Er verschmaelert die Absaetze, der Text wird dadurch hoeher – und
           * genau so wird er auch GEMESSEN, weil die Messung dieselbe Klasse traegt. Der
           * Seitenumbruch verschiebt sich also von selbst mit.
           */
          className={`ws-block ws-text ${block.lineNumbers ? 'ws-text-numbered' : ''} ${placed?.continued ? 'ws-continued' : ''} ${justify ? 'ws-justify' : ''} ${
            ctx.notesMargin ? 'ws-notizrand' : ''
          }`}
        >
          {showHead && (block.title || materialNo) && (
            <div className="ws-text-title" data-head>
              {/* Die Nummer vergibt die App – so verweist keine Aufgabe auf ein Material, das es nicht gibt */}
              {materialNo && <span className="ws-material-no">{materialNo}</span>}
              <Feld value={stripMaterialNo(block.title)} editable={edit} onChange={set((d, v) => ((d as typeof block).title = v))} />
            </div>
          )}
          {/*
           * Materialkopf einer Quelle: Verfasser · Textsorte · Datum.
           *
           * Ohne diese Angaben lässt sich die Standortgebundenheit nicht beurteilen – und
           * genau darum geht es bei der Quellenanalyse (EPA Geschichte 3.2.2/3.3.3). Er
           * steht ÜBER dem Text, nicht unten bei der Fundstelle: Man muss wissen, wer
           * spricht, BEVOR man liest.
           */}
          {showHead && headerLine(block.sourceHeader) && <div className="ws-source-header">{headerLine(block.sourceHeader)}</div>}
          {/*
           * Hinweis ueber einer Erzaehlung: Sie ist eine Darstellung, keine Quelle.
           * Er steht bewusst im Seiteninhalt und nicht klein darunter - eine Ich-Erzaehlung
           * wird sonst fuer eine Quelle gehalten.
           */}
          {showHead && narrationNote(block.narration) && <div className="ws-narration-note">{narrationNote(block.narration)}</div>}
          <div className="ws-text-body">
            {block.lineNumbers && lineCount > 0 && (
              <div className="ws-line-numbers" aria-hidden>
                {Array.from({ length: lineCount }, (_, i) => lineStart + i + 1)
                  .filter((n) => n % 5 === 0)
                  .map((n) => (
                    // Position in Zeilenhöhen der Textschrift; die Zahl selbst ist kleiner gesetzt
                    <span key={n} style={{ top: `${(n - lineStart - 1) * 1.5}em` }}>
                      <small>{n}</small>
                    </span>
                  ))}
              </div>
            )}
            {edit && paragraphs.length === 0 ? (
              <div data-unit>
                <RichText value="" editable onChange={set((d, v) => ((d as typeof block).body = v))} placeholder="Text (Absätze durch Leerzeile trennen)" />
              </div>
            ) : (
              paragraphs.slice(from, Math.min(to, paragraphs.length)).map((p, i) => (
                <div key={from + i} data-unit className="ws-paragraph">
                  <RichText
                    value={p}
                    editable={edit}
                    onChange={set((d, v) => {
                      // Absatz ersetzen; eine Leerzeile im neuen Text erzeugt weitere Absätze
                      const all = splitParagraphs((d as typeof block).body)
                      all[from + i] = v
                      ;(d as typeof block).body = all.filter((x) => x.trim()).join('\n\n')
                    })}
                  />
                </div>
              ))
            )}
            {showGlossary && (
              <div data-unit className="ws-glossary">
                {block.glossary.map((g, i) => (
                  <div key={i}>
                    <b>{g.term}</b>: {g.explanation}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/*
            WORTZAHL am Ende des Materials, rechtsbuendig.
            Gewuenscht von der Lehrkraft (24.09.2026). In Pruefungsaufgaben steht sie dort,
            weil sie den Aufwand einschaetzbar macht: Wer weiss, dass der Text 700 Woerter
            hat, teilt sich die Lesezeit anders ein.
            Gezaehlt wird der ganze Text, nicht nur das Stueck auf dieser Seite – und die
            Auslassungszeichen zaehlen nicht mit.
          */}
          {to >= paragraphs.length && materialWoerter > 0 && <div className="ws-wortzahl">({materialWoerter} Wörter)</div>}
          {block.source && to >= paragraphs.length && (
            <div className="ws-source">
              Quelle: <Feld value={block.source} editable={edit} onChange={set((d, v) => ((d as typeof block).source = v))} />
            </div>
          )}
        </div>
      )
    }

    case 'image': {
      if (block.items?.length) return <GalleryView block={block} />
      const picture = block.image ? (
        <>
          <img src={block.image.dataUrl} alt={block.description} />
          {/* Art. 50 Abs. 4 KI-Verordnung: erzeugte Bilder werden sichtbar gekennzeichnet –
              am Bild selbst, und auch auf dem Lösungsblatt. */}
          {block.image.source === 'ai' && (
            <span className="ws-ai-mark" title="Dieses Bild wurde von einer KI erzeugt.">
              KI
            </span>
          )}
        </>
      ) : (
        <div className="ws-image-placeholder">{isEditMode(mode) || mode === 'measure' ? `Bild wählen: ${block.description}` : block.description}</div>
      )
      return (
        <figure className="ws-block ws-image" style={{ width: `${block.widthPercent}%` }}>
          {block.labels?.length ? (
            <ImageLabelLayer
              labels={block.labels}
              showAnswers={isKeyMode(mode)}
              onMove={
                edit && ctx.update
                  ? (id, x, y) =>
                      ctx.update?.(block.id, (d) => {
                        const label = (d as typeof block).labels?.find((l) => l.id === id)
                        if (label) {
                          label.x = x
                          label.y = y
                        }
                      })
                  : undefined
              }
            >
              {picture}
            </ImageLabelLayer>
          ) : (
            picture
          )}
          {(block.caption || edit) && (
            <figcaption>
              {/* Der Bildnachweis steht auf der Schlussseite, nicht unter dem Bild */}
              <Feld value={block.caption} editable={edit} onChange={set((d, v) => ((d as typeof block).caption = v))} placeholder="Bildunterschrift" />
            </figcaption>
          )}
        </figure>
      )
    }

    case 'phrases':
      return (
        <div className="ws-block ws-phrases">
          <div className="ws-phrases-head">
            <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as typeof block).title = v))} placeholder="Useful phrases" />
          </div>
          {(block.hint || edit) && (
            <div className="ws-phrases-hint">
              <Feld
                value={block.hint}
                editable={edit}
                onChange={set((d, v) => ((d as typeof block).hint = v))}
                placeholder="Kurzer Hinweis, wie das Blatt zu benutzen ist"
              />
            </div>
          )}
          <div className="ws-phrases-groups">
            {block.groups.map((group, gi) => (
              <div className="ws-phrases-group" key={gi}>
                {group.label && <div className="ws-phrases-label">{group.label}</div>}
                <ul>
                  {group.items.map((item, ii) => (
                    <li key={ii}>
                      <span className="ws-phrases-text">{item.text}</span>
                      {/*
                        Die deutsche Entsprechung steht gedämpft daneben, nicht darunter –
                        so bleibt der Blick auf der Zielsprache. Ab dem mittleren Niveau und
                        ab B1+ entfällt sie ganz; warum, steht in `didactics/phraseRules.ts`.
                      */}
                      {item.german && ctx.phraseGerman && <span className="ws-phrases-de"> – {item.german}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )

    case 'task':
      return <TaskView block={block} placed={placed} />

    case 'scaffold':
      if (isKeyMode(mode)) return null
      return (
        <div className={`ws-block ws-scaffold ws-scaffold-${block.variant}`}>
          <div className="ws-scaffold-title">
            <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as typeof block).title = v))} />
          </div>
          {block.variant === 'wortspeicher' ? (
            <div className="ws-wordbank">
              {block.items.map((it, i) => (
                <span key={i}>
                  <RichText value={it} inline editable={edit} onChange={set((d, v) => ((d as typeof block).items[i] = v))} />
                </span>
              ))}
            </div>
          ) : block.variant === 'hilfekarten' ? (
            <div className="ws-helpcards">
              {block.items.map((it, i) => (
                <div key={i} className="ws-helpcard">
                  <div className="ws-helpcard-num">Hilfe {i + 1}</div>
                  <RichText value={it} editable={edit} onChange={set((d, v) => ((d as typeof block).items[i] = v))} />
                </div>
              ))}
            </div>
          ) : (
            <ul>
              {block.items.map((it, i) => (
                <li key={i}>
                  <RichText value={it} inline editable={edit} onChange={set((d, v) => ((d as typeof block).items[i] = v))} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )

    case 'table': {
      const from = placed?.from ?? 0
      const to = placed?.to ?? block.rows.length
      return (
        <div className={`ws-block ws-table-block ${placed?.continued ? 'ws-continued' : ''}`}>
          {from === 0 && block.title && (
            <div className="ws-table-title" data-head>
              <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as typeof block).title = v))} />
            </div>
          )}
          <table className="ws-table">
            <thead data-head>
              <tr>
                {block.headers.map((h, c) => (
                  <th key={c}>
                    <Feld value={h} editable={edit} onChange={set((d, v) => ((d as typeof block).headers[c] = v))} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.slice(from, to).map((row, r) => (
                <tr key={from + r} data-unit>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <RichText value={cell} inline editable={edit} onChange={set((d, v) => ((d as typeof block).rows[from + r][c] = v))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'workspace':
      if (isKeyMode(mode)) return null
      return (
        <div className="ws-block ws-workspace">
          {block.label && <div className="ws-workspace-label">{block.label}</div>}
          <div className={`ws-workspace-area ws-workspace-${block.kind}`} style={{ height: `${block.heightMm}mm` }} />
        </div>
      )

    case 'grid': {
      const drawing = gridDrawing(block, ctx.contentWidthMm ?? 170)
      return (
        <div className="ws-block ws-grid-block">
          {block.title && (
            <div className="ws-grid-title">
              <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as typeof block).title = v))} />
            </div>
          )}
          <img
            className="ws-grid-img"
            src={gridDataUrl(drawing)}
            alt={gridAlt(block)}
            style={{ width: `${drawing.widthMm}mm`, height: `${drawing.heightMm}mm` }}
          />
          {block.caption && (
            <div className="ws-grid-caption">
              <Feld value={block.caption} editable={edit} onChange={set((d, v) => ((d as typeof block).caption = v))} />
            </div>
          )}
        </div>
      )
    }

    case 'audio': {
      // Fach entscheidet über Abspielzahl und darüber, ob das Transkript aufs Blatt gehört
      const subjectId = ctx.subjectId ?? ''
      const audioRegeln = audioRulesFor(subjectId)
      return (
        // Die Kennung geht mit ins HTML: Der PDF-Export braucht sie, um die MP3 an der
        // richtigen Stelle einzubetten (siehe `main/services/export/audioInPdf.ts`).
        <div className="ws-block ws-audio" data-audio-id={block.id}>
          <div className="ws-audio-head">
            <span className="ws-audio-icon" aria-hidden="true">
              ▶
            </span>
            <span className="ws-audio-title">
              <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as typeof block).title = v))} />
            </span>
            <span className="ws-audio-meta">
              {/*
               * Die Abspielzahl folgt dem Fach: In den Sprachen wird zweimal gehört, im
               * Sachfach so oft wie nötig. Begründung in `didactics/audioRules.ts`.
               */}
              {[block.textType, block.seconds ? audioLength(block.seconds) : '', playsLabelFor(subjectId, block.plays, ctx.anrede)].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="ws-audio-body">
            <div className="ws-audio-texts">
              {block.speakers.length > 1 && <div className="ws-audio-speakers">{block.speakers.map((s) => s.name).join(' · ')}</div>}
              {block.beforeListening && (
                <div className="ws-audio-before">
                  <RichText value={block.beforeListening} inline editable={edit} onChange={set((d, v) => ((d as typeof block).beforeListening = v))} />
                </div>
              )}
            </div>
            {block.url && (
              <figure className="ws-audio-qr">
                <img src={qrDataUrl(block.url, 22)} alt={`QR-Code zum Hörtext: ${block.url}`} />
                <figcaption>Hörtext</figcaption>
              </figure>
            )}
          </div>
          {/*
           * KI-Kennzeichnung – nur bei selbst erzeugten Aufnahmen. Eine verlinkte
           * Archivaufnahme ist echt und darf nicht so ausgewiesen werden.
           */}
          {block.origin !== 'archiv' && block.audio?.fileName && <div className="ws-audio-ai-note">{AI_AUDIO_NOTE}</div>}
          {/*
           * Hinweis auf die Anlage – NUR im PDF, nicht auf dem Ausdruck. Er steht im
           * Seiteninhalt und nicht in der Abspieler-Annotation: In Chrome, Edge und der
           * macOS-Vorschau erscheint der Abspieler nicht, und zwar ohne Meldung. Dort ist
           * dieser Satz das Einzige, was noch weiterhilft.
           */}
          {ctx.audioAttached && block.audio?.fileName && (
            <div className="ws-audio-attach-note">
              🔊 Der Hörtext ist als Anhang in diesem PDF enthalten ({block.audio.fileName}). Falls oben kein Abspieler erscheint: Anhang öffnen.
            </div>
          )}
          {/*
           * Transkript: Im Sachfach gehört es AUF das Blatt (EPA Geschichte 3.3.3 –
           * „in verschriftlichter Form beizufügen"), in den Sprachen nur in den Lösungsteil,
           * sonst prüft man Lesen statt Hören.
           */}
          {(isKeyMode(mode) || audioRegeln.transcriptOnSheet) && block.transcript && (
            <div className="ws-audio-script">
              <div className="ws-audio-script-title">{audioRegeln.transcriptOnSheet && !isKeyMode(mode) ? 'Text der Aufnahme' : 'Skript'}</div>
              <RichText value={block.transcript} editable={mode === 'keyEdit'} onChange={set((d, v) => ((d as typeof block).transcript = v))} />
            </div>
          )}
        </div>
      )
    }

    case 'video': {
      /*
       * Ohne Fundstelle: Suchhilfe statt QR-Code.
       *
       * In Geschichte und Politik sucht die KI eine ECHTE Aufnahme im Archiv, statt eine zu
       * erfinden – findet sie keine, bleibt die Adresse leer. Dann zeigt der Baustein, wo
       * und wonach zu suchen ist, statt still zu verschwinden.
       */
      const suchhilfe = !block.url && searchesMediaSources(ctx.subjectId ?? '')
      const kind = videoKindById(block.kind)
      const facts = [
        kind?.label,
        block.minutes ? `${block.minutes} min` : '',
        block.section ? `Abschnitt ${block.section}` : '',
        block.plays === 1 ? 'einmal sehen' : `${block.plays}-mal sehen`
      ].filter(Boolean)
      return (
        <div className="ws-block ws-video">
          <div className="ws-video-head">
            <span className="ws-video-icon" aria-hidden="true">
              ▶
            </span>
            <span className="ws-video-title">
              <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as typeof block).title = v))} />
            </span>
            <span className="ws-video-meta">{facts.join(' · ')}</span>
          </div>
          <div className="ws-video-body">
            <div className="ws-video-texts">
              {block.sourceTitle && (
                <div className="ws-video-source">
                  <Feld value={block.sourceTitle} editable={edit} onChange={set((d, v) => ((d as typeof block).sourceTitle = v))} />
                  {block.platform ? ` · ${block.platform}` : ''}
                </div>
              )}
              {block.summary && (
                <div className="ws-video-summary">
                  <RichText value={block.summary} inline editable={edit} onChange={set((d, v) => ((d as typeof block).summary = v))} />
                </div>
              )}
              {block.beforeViewing && (
                <div className="ws-video-before">
                  <RichText value={block.beforeViewing} inline editable={edit} onChange={set((d, v) => ((d as typeof block).beforeViewing = v))} />
                </div>
              )}
            </div>
            {block.url && (
              <figure className="ws-video-qr">
                <img src={qrDataUrl(block.url, 24)} alt={`QR-Code zum Video: ${block.url}`} />
                {/* Der Link im Klartext ist kein Beiwerk: Ohne eigenes Gerät kommt man nur
                    über die getippte Adresse an das Video – am Klassenrechner oder zu Hause. */}
                <figcaption>{shortLink(block.url)}</figcaption>
              </figure>
            )}
          </div>
          {/*
           * Keine Fundstelle gefunden: Suchhilfe statt Lücke.
           *
           * Der Kasten steht auf der LEHRERSEITE – die Klasse soll nicht lesen, dass etwas
           * fehlt. Er nennt die Archive und die Suchbegriffe, mit denen die Lehrkraft in
           * einem Handgriff weiterkommt.
           */}
          {suchhilfe && isKeyMode(mode) && (
            <div className="ws-video-note">
              <div className="ws-video-note-title">Aufnahme noch zu suchen</div>
              <div className="ws-video-searchhelp">
                Zu dieser Aufgabe wurde keine gesicherte Originalaufnahme gefunden. Sie wird nicht erfunden – bitte selbst im Archiv suchen und die Adresse oben
                eintragen.
                {block.searchTerms?.length ? (
                  <div className="ws-video-searchterms">
                    <b>Suchbegriffe:</b> {block.searchTerms.join(' · ')}
                  </div>
                ) : null}
                <ul>
                  {archivesForSubject(ctx.subjectId ?? '')
                    .filter((a) => a.frei)
                    .map((a) => (
                      <li key={a.id}>
                        <b>{a.name}</b> ({a.domain}) – {a.inhalt}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          )}
          {isKeyMode(mode) && (block.teacherNote || block.url) && (
            <div className="ws-video-note">
              <div className="ws-video-note-title">Nur für die Lehrkraft</div>
              {block.teacherNote && (
                <RichText value={block.teacherNote} editable={mode === 'keyEdit'} onChange={set((d, v) => ((d as typeof block).teacherNote = v))} />
              )}
              {block.url && <div className="ws-video-url">{block.url}</div>}
              {/* Recht und Technik stehen dort, wo sie gebraucht werden: beim Video, auf der
                  Lehrerseite. Ein Merkblatt an anderer Stelle liest niemand vor der Stunde.
                  Bewusst immer sichtbar und nicht aufklappbar: Ein zugeklappter Kasten wäre im
                  Ausdruck für immer zu, und der Seitenumbruch misst, was er sieht. */}
              <div className="ws-video-hints">
                <div className="ws-video-hints-title">Rechtliches und Hinweise zum QR-Code</div>
                <ul>
                  {COPYRIGHT_NOTE.map((line, i) => (
                    <li key={`r${i}`}>{line}</li>
                  ))}
                  {block.url && QR_NOTE.map((line, i) => <li key={`q${i}`}>{line}</li>)}
                </ul>
                <div className="ws-video-hints-source">
                  Hinweis, keine Rechtsberatung. Grundlage: § 60a UrhG und die FAQ „Was darf ich in der Filmbildung?" (FILM+SCHULE NRW, Institut für Medienrecht
                  der Universität zu Köln, Stand 2023). Teile der Rechtslage sind ausdrücklich umstritten.
                </div>
              </div>
            </div>
          )}
        </div>
      )
    }

    case 'selfCheck':
      if (isKeyMode(mode)) return null
      return (
        <div className="ws-block ws-selfcheck">
          <table>
            <thead>
              <tr>
                <th>
                  <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as typeof block).title = v))} />
                </th>
                {block.format === 'kompetenzraster'
                  ? ['sicher', 'teilweise', 'noch nicht'].map((l) => <th key={l}>{l}</th>)
                  : block.format === 'ampel'
                    ? ['🟢', '🟡', '🔴'].map((l) => <th key={l}>{l}</th>)
                    : ['🙂', '😐', '🙁'].map((l) => <th key={l}>{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {block.statements.map((s, i) => (
                <tr key={i}>
                  <td>
                    <RichText value={s} inline editable={edit} onChange={set((d, v) => ((d as typeof block).statements[i] = v))} />
                  </td>
                  <td className="ws-sc-cell" />
                  <td className="ws-sc-cell" />
                  <td className="ws-sc-cell" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'divider':
      return (
        <div className="ws-block ws-divider">
          <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as typeof block).title = v))} />
        </div>
      )
  }
}

/**
 * Die Vorgaben einer Schreibaufgabe auf dem SCHÜLERBLATT.
 *
 * Bis hierher wurden Situation, Adressat, Textsorte, Inhaltspunkte und Umfang zwar erzeugt
 * und sogar geprüft („Es fehlt der Adressat"), aber nie gedruckt. Auf dem Blatt stand nur
 * der nackte Arbeitsauftrag – was wie eine schludrige KI-Aufgabe aussah, obwohl alle
 * Angaben in der Datei standen.
 *
 * Die Reihenfolge folgt den amtlichen Prüfungsaufgaben (Bayern AP Realschule, ZP10
 * Nordrhein-Westfalen, Mittlere Reife Mecklenburg-Vorpommern): Situierung, dann die
 * Inhaltspunkte, zuletzt Umfang und Formvorgaben. Die Bewertungskriterien gehören NICHT
 * hierher – sie stehen im Erwartungshorizont.
 */
function briefAbschnitte({
  block,
  edit,
  set,
  wordLimit
}: {
  block: TaskBlock
  edit: boolean
  set: (apply: (draft: TaskBlock, value: string) => void) => ((v: string) => void) | undefined
  wordLimit?: boolean
}): React.JSX.Element[] {
  const brief = block.brief
  if (!brief) return []
  const rahmen = [brief.audience, brief.textType, brief.purpose].filter(Boolean).join(' · ')
  const notizen = (brief.notes ?? []).filter((s) => s.title || s.items.length || s.prompts.length)
  const form = (brief.form ?? []).filter(Boolean)
  const teile: React.JSX.Element[] = []

  /*
   * Die Situation steht seit dem 24.09.2026 VORN in der Arbeitsanweisung, nicht mehr hier.
   * Sonst staende sie zweimal auf dem Blatt – genau das war die Beschwerde.
   */
  if (rahmen)
    teile.push(
      <div className="ws-brief" data-unit key="situation">
        <p className="ws-brief-frame">{rahmen}</p>
      </div>
    )

  /*
   * Die Notizentabelle ist EINE Einheit und wird nie zerschnitten: Ihre Spalten gehören
   * nebeneinander gelesen. Eine halbe Tabelle am Seitenende wäre schlimmer als ein
   * Seitenumbruch davor.
   */
  if (notizen.length > 0)
    teile.push(
      <div className="ws-brief-notes" data-unit key="notes" style={{ gridTemplateColumns: `repeat(${Math.min(notizen.length, 3)}, 1fr)` }}>
        {notizen.map((spalte, i) => (
          <div key={i} className="ws-brief-note">
            <div className="ws-brief-note-title">
              <RichText value={spalte.title} inline editable={edit} onChange={set((d, v) => (d.brief!.notes![i].title = v))} />
            </div>
            <ul>
              {spalte.items.map((it, j) => (
                <li key={j}>
                  <RichText value={it} inline editable={edit} onChange={set((d, v) => (d.brief!.notes![i].items[j] = v))} />
                </li>
              ))}
            </ul>
            {spalte.prompts.map((p, j) => (
              <div key={j} className="ws-brief-prompt">
                <RichText value={p} inline editable={edit} onChange={set((d, v) => (d.brief!.notes![i].prompts[j] = v))} />
              </div>
            ))}
          </div>
        ))}
      </div>
    )

  if (brief.points.length > 0)
    teile.push(
      <ul className="ws-brief-points" data-unit key="points">
        {brief.points.map((p, i) => (
          <li key={i}>
            <RichText value={p} inline editable={edit} onChange={set((d, v) => (d.brief!.points[i] = v))} />
          </li>
        ))}
      </ul>
    )

  /*
   * Die Wortzahl nur, wenn das Blatt sie nennen soll. Sonst dient `words` allein der Planung
   * (Schreibraum, Erwartungshorizont) – so steht es auch im Auftrag an die KI.
   */
  const zeigtWortzahl = Boolean(wordLimit) && brief.words > 0
  if (zeigtWortzahl || form.length > 0)
    teile.push(
      <p className="ws-brief-form" data-unit key="form">
        {[zeigtWortzahl ? `Umfang: etwa ${brief.words} Wörter` : '', ...form].filter(Boolean).join(' · ')}
      </p>
    )

  return teile
}

/**
 * Erwartungshorizont einer Schreibaufgabe – NUR auf dem Lösungsblatt.
 *
 * Aufgebaut wie die amtlichen Erwartungshorizonte, weil Nordrhein-Westfalen und Bayern
 * unabhängig voneinander zur selben Architektur kommen:
 *
 *   - je Inhaltspunkt ein ÜBERGEORDNETES Kriterium mit eigener Höchstpunktzahl,
 *   - darunter Beispiellösungen, die ausdrücklich NICHT verbindlich sind,
 *   - eine Öffnungsklausel für passende, nicht vorhergesehene Aspekte.
 *
 * Der Satz zur Öffnungsklausel steht wörtlich so in den Vorgaben von QUA-LiS NRW zur ZP10;
 * ohne ihn läse sich die Liste wie eine abschließende Aufzählung, und eine gute eigene Idee
 * der Lernenden bekäme keine Punkte.
 */
function erwartungsAbschnitte({
  block,
  edit,
  set,
  mitMustertext
}: {
  block: TaskBlock
  edit: boolean
  set: (apply: (draft: TaskBlock, value: string) => void) => ((v: string) => void) | undefined
  /** false, wenn der Mustertext schon oben auf den Schreiblinien steht */
  mitMustertext: boolean
}): React.JSX.Element[] {
  const brief = block.brief
  const erwartet = brief?.expected ?? []
  const kriterien = (brief?.criteria ?? []).filter(Boolean)
  if (!brief || (!erwartet.length && !kriterien.length && !(mitMustertext && brief.model))) return []

  /*
   * JEDE Zeile ist eine eigene Umbruch-Einheit.
   *
   * Vorher hing der ganze Erwartungshorizont als unteilbarer Anhang an der Aufgabe. Er wurde
   * beim Umbruch nicht berücksichtigt und lief unten aus der Seite heraus – gemeldet von der
   * Lehrkraft am 24.09.2026 mit einem Mustertext, der mitten im Satz abbrach.
   */
  const out: React.JSX.Element[] = [
    <div className="ws-expectation ws-expectation-title" data-unit key="eh-titel">
      Erwartungshorizont
    </div>
  ]
  const weitere: (React.JSX.Element | null)[] = [
    ...erwartet.map((e, i) => (
      <div key={i} className="ws-expectation ws-expectation-row" data-unit>
        <div className="ws-expectation-head">
          <RichText value={e.aspect} inline editable={edit} onChange={set((d, v) => (d.brief!.expected![i].aspect = v))} />
          {e.points > 0 && <span className="ws-expectation-points">{e.points} P.</span>}
        </div>
        <RichText value={e.criterion} editable={edit} onChange={set((d, v) => (d.brief!.expected![i].criterion = v))} />
        {e.examples.length > 0 && (
          <ul className="ws-expectation-examples">
            {e.examples.map((x, j) => (
              <li key={j}>
                <RichText value={x} inline editable={edit} onChange={set((d, v) => (d.brief!.expected![i].examples[j] = v))} />
              </li>
            ))}
          </ul>
        )}
      </div>
    )),
    erwartet.length > 0 ? (
      <p className="ws-expectation ws-expectation-note" data-unit key="eh-hinweis">
        Die Beispiele sind nicht verbindlich. Passende Aspekte, die hier nicht vorhergesehen sind, können ebenfalls gewertet werden; die Höchstpunktzahl des
        Aspekts wird dabei nicht überschritten.
      </p>
    ) : null,
    kriterien.length > 0 ? (
      <div className="ws-expectation ws-expectation-row" data-unit key="eh-bewertung">
        <div className="ws-expectation-head">Bewertung</div>
        <ul className="ws-expectation-examples">
          {kriterien.map((c, i) => (
            <li key={i}>
              <RichText value={c} inline editable={edit} onChange={set((d, v) => (d.brief!.criteria[i] = v))} />
            </li>
          ))}
        </ul>
      </div>
    ) : null,
    mitMustertext && brief.model ? (
      <div className="ws-expectation ws-expectation-row" data-unit key="eh-muster">
        <div className="ws-expectation-head">Mustertext</div>
        <RichText value={brief.model} editable={edit} onChange={set((d, v) => (d.brief!.model = v))} />
      </div>
    ) : null
  ]
  return [...out, ...weitere.filter((x): x is React.JSX.Element => Boolean(x))]
}

/**
 * Aufeinanderfolgende Teilaufgaben wieder zu EINER nummerierten Liste zusammenfassen.
 *
 * Wird eine Aufgabe über zwei Seiten geteilt, beginnt die Zählung sonst auf jeder Seite
 * wieder bei a). `start` setzt sie fort: Steht die dritte Teilaufgabe oben auf der zweiten
 * Seite, heißt sie dort c) und nicht a).
 */
/**
 * Ein Stück einer Aufgabe, an dem über Seiten getrennt werden darf.
 *
 * `teil` ist die Nummer der Teilaufgabe, zu der das Stück gehört (die Liste entsteht erst
 * beim Rendern); `teilWeiter` kennzeichnet das erste Stück nach einem Seitenwechsel.
 */
interface Abschnitt {
  node: React.JSX.Element
  teil?: number
  teilWeiter?: boolean
}

function gruppiereTeilaufgaben(abschnitte: Abschnitt[]): { node: React.JSX.Element }[] {
  const out: { node: React.JSX.Element }[] = []
  let lauf: Abschnitt[] = []
  const abschliessen = (): void => {
    if (!lauf.length) return
    /*
     * Mehrere Einheiten derselben Teilaufgabe gehören in EINEN Listenpunkt.
     *
     * Eine Teilaufgabe liefert die Anweisung und ihre Schreiblinien als getrennte Einheiten,
     * damit sie über Seiten umbrechen kann. Zusammengesetzt werden sie erst hier – sonst
     * bekäme jede Linie einen eigenen Buchstaben.
     */
    const punkte: { teil: number; teile: React.JSX.Element[]; weiter: boolean }[] = []
    for (const a of lauf) {
      const letzter = punkte[punkte.length - 1]
      if (letzter && letzter.teil === a.teil) letzter.teile.push(a.node)
      else punkte.push({ teil: a.teil!, teile: [a.node], weiter: Boolean(a.teilWeiter) })
    }
    out.push({
      node: (
        <ol className="ws-parts" type="a" start={lauf[0].teil! + 1} key={`parts-${lauf[0].teil}`}>
          {punkte.map((p) => (
            // Die Fortsetzung auf der nächsten Seite bekommt keinen neuen Buchstaben
            <li key={p.teil} className={p.weiter ? 'ws-part-continued' : undefined}>
              {p.teile}
            </li>
          ))}
        </ol>
      )
    })
    lauf = []
  }
  for (const a of abschnitte) {
    if (a.teil === undefined) {
      abschliessen()
      out.push({ node: a.node })
    } else {
      lauf.push(a)
    }
  }
  abschliessen()
  return out
}

function TaskView({ block, placed }: { block: TaskBlock; placed?: PlacedItem }): React.JSX.Element {
  const { mode, update, taskNumbers, showStars, taskStyle, phaseStarts, showTimecodes, answerLanguage, wordLimit, correctionMargin } = useWs()
  const edit = mode === 'edit'
  const key = isKeyMode(mode)
  const keyEdit = mode === 'keyEdit'
  const set = useSetter(block)
  const number = taskNumbers.get(block.id)
  const onAnswer = (path: (d: TaskBlock) => Answer) => (update ? (fn: (a: Answer) => void) => update(block.id, (d) => fn(path(d as TaskBlock))) : undefined)
  // Nur bei eindeutigen Handlungsverben; im Zweifel lieber kein Symbol als ein falsches
  const instructionPicto = taskStyle.pictograms ? pictogramForInstruction(plainText(block.instruction)) : undefined
  const socialPicto = pictogramForSocialForm(block.socialForm)

  const phase = block.viewingPhase && phaseStarts?.has(block.id) ? VIEWING_PHASES.find((p) => p.id === block.viewingPhase) : undefined
  // Fragenreihe zum Ankreuzen? Dann Gitterdarstellung und Kästchen an der Anweisung.
  const mcListe = istMcListe(block.parts)
  // Das Kästchen an der Anweisung gilt auch für eine einzelne Ankreuzfrage
  const ankreuzen = istAnkreuzAufgabe(block)

  /*
   * Gelöstes Beispiel als Punkt „0" – vor den echten Items und optisch zurückgenommen.
   * Es ist keine Aufgabe, sondern zeigt, WIE geantwortet wird (ÖSZ 2024; Goethe- und
   * Cambridge-Modellsätze). Deshalb steht die Lösung hier auch auf dem Schülerblatt.
   */
  const beispielKnoten = block.example ? (
    <div className="ws-example" data-unit key="example">
      <div className="ws-mc-question">
        <span className="ws-mc-num">0.</span>
        <RichText value={block.example.instruction} editable={edit} onChange={set((d, v) => ((d as TaskBlock).example!.instruction = v))} />
      </div>
      {block.example.answer.kind === 'multipleChoice' ? (
        <McOptions answer={block.example.answer} showSolution />
      ) : (
        <div className="ws-example-solution">
          <RichText value={block.example.solution} editable={edit} onChange={set((d, v) => ((d as TaskBlock).example!.solution = v))} />
        </div>
      )}
    </div>
  ) : (
    <></>
  )

  /*
   * Fragenreihe zum Ankreuzen: rahmenlose Tabelle, spaltenweise gefüllt.
   * Die Begründung für Aufteilung und fehlenden Rahmen steht in `render/mcGrid.ts`.
   * Sie bleibt EINE Einheit: Spaltenweise gelesen wäre eine halbe Tabelle sinnlos.
   */
  const mcGitter = (
    <table className="ws-mc-grid" data-unit key="mc">
      <tbody>
        {mcZeilen(
          block.parts.map((part, i) => ({ part, i })),
          mcSpalten(block.parts)
        ).map((zeile, z) => (
          <tr key={z}>
            {zeile.map((eintrag, sp) => (
              <td key={sp}>
                {eintrag && (
                  <>
                    <div className="ws-mc-question">
                      <span className="ws-mc-num">{eintrag.i + 1}.</span>
                      <RichText
                        value={ohneOperator(eintrag.part.instruction, block.operator)}
                        editable={edit}
                        onChange={set((d, v) => ((d as TaskBlock).parts[eintrag.i].instruction = v))}
                      />
                    </div>
                    <McOptions answer={eintrag.part.answer} onChange={onAnswer((d) => d.parts[eintrag.i].answer)} />
                    {key && (eintrag.part.solution || keyEdit) && (
                      <div className="ws-solution">
                        <RichText
                          value={eintrag.part.solution}
                          editable={keyEdit}
                          onChange={set((d, v) => ((d as TaskBlock).parts[eintrag.i].solution = v))}
                          placeholder="Lösung"
                        />
                      </div>
                    )}
                  </>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )

  /*
   * Schreiblinien werden in kleinen Päckchen ausgegeben, nicht als ein Klotz.
   *
   * Gemeldet von der Lehrkraft (23.09.2026): „linien zum schreiben beginnen auf dem
   * arbeitsblatt auf der seite nach der aufgabe". Ursache: Der ganze Linienblock war EINE
   * Umbruch-Einheit. Passte er nicht mehr unter die Arbeitsanweisung, wanderte er vollständig
   * auf die nächste Seite – und ließ unter der Aufgabe eine große Lücke zurück.
   *
   * EINE Linie je Einheit. Zuerst waren es zwei – bis der Wunsch dazukam, Bild und Tabelle
   * neben die Linien zu stellen. Dort zeigte sich die zweite Aufgabe dieser Päckchen: Jedes
   * ist ein eigener Satzbereich (CSS `flow-root`) und wird neben dem Bild schmal, darunter
   * wieder breit. Mit Zweierpäckchen blieben unter der Bildunterkante bis zu zwei Linien
   * unnötig kurz – gemessen 74 Punkte ungenutztes Papier. Einzeln sitzt der Übergang bündig.
   */
  const LINIEN_PRO_EINHEIT = 1

  const linienAbschnitte = (count: number): React.JSX.Element[] =>
    Array.from({ length: Math.ceil(count / LINIEN_PRO_EINHEIT) }, (_, k) => (
      <div className={`ws-lines ${correctionMargin ? 'ws-lines-rand' : ''}`} data-unit key={`lines-${k}`}>
        {Array.from({ length: Math.min(LINIEN_PRO_EINHEIT, count - k * LINIEN_PRO_EINHEIT) }, (_, j) => (
          <div key={j} className="ws-line" />
        ))}
      </div>
    ))

  /*
   * MUSTERTEXT statt Schreiblinien – nur in der Lösungsansicht.
   *
   * Gewünscht von der Lehrkraft (24.09.2026): „bei den Lösungen sind die Linien nicht
   * notwendig – es könnte aber stattdessen ein ausformulierter Mustertext auf den Linien
   * sein (zusätzlich zum stichpunktartigen Erwartungshorizont am Ende)".
   *
   * Das löst zugleich das Platzproblem: 26 leere Linien beanspruchten auf dem Lösungsblatt
   * eine halbe Seite, ohne irgendetwas zu zeigen.
   *
   * Je Absatz eine Einheit, damit ein langer Mustertext über Seiten laufen kann, statt
   * unten aus der Seite herauszulaufen.
   */
  const mustertextAbschnitte = (text: string): React.JSX.Element[] =>
    text
      .split(/\n{2,}/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((absatz, i) => (
        <div className="ws-model-text" data-unit key={`muster-${i}`}>
          <RichText value={absatz} editable={keyEdit} onChange={i === 0 ? set((d, v) => ((d as TaskBlock).brief!.model = v)) : undefined} />
        </div>
      ))

  /**
   * Eine Teilaufgabe – in Stücke zerlegt, an denen über Seiten getrennt werden darf.
   *
   * Vorher war die ganze Teilaufgabe EINE Einheit: Anweisung und alle Schreiblinien zusammen.
   * Passte sie unten nicht mehr hin, wanderte sie vollständig auf die nächste Seite – auf
   * Seite 1 blieben dadurch bis zu 95 mm leer (gemeldet am 24.09.2026). Jetzt kann der
   * Linienteil weiterlaufen; der Listenpunkt wird beim Rendern wieder zusammengesetzt.
   */
  const teilaufgabe = (part: TaskPart, i: number): Abschnitt[] => {
    const kopf = (
      <div className="ws-part-kopf" data-unit key={`${part.id}-kopf`}>
        {/*
          Der Buchstabe steht IM gemessenen Kasten, nicht als Listenzeichen davor.
          Ein `::marker` erzeugt eine eigene Zeilenbox, deren Höhe beim Umbruch niemand
          mitzählt – auf Seite 2 lief der Inhalt dadurch über den Rand hinaus.
        */}
        <span className="ws-part-letter">{String.fromCharCode(97 + i)})</span>
        <RichText value={part.instruction} editable={edit} onChange={set((d, v) => ((d as TaskBlock).parts[i].instruction = v))} />
        {part.answer.kind !== 'lines' && <AnswerView answer={part.answer} onChange={onAnswer((d) => d.parts[i].answer)} />}
      </div>
    )
    const schluss =
      key && (part.solution || keyEdit) ? (
        <div className="ws-solution" data-unit key={`${part.id}-loesung`}>
          <RichText value={part.solution} editable={keyEdit} onChange={set((d, v) => ((d as TaskBlock).parts[i].solution = v))} placeholder="Lösung" />
        </div>
      ) : null
    // Nur Schreiblinien werden zerlegt; alle anderen Antwortformen bleiben eine Einheit
    const linien = part.answer.kind === 'lines' && !key ? linienAbschnitte(part.answer.count).map((n) => ({ node: n, teil: i, teilWeiter: true })) : []
    return [{ node: kopf, teil: i }, ...linien, ...(schluss ? [{ node: schluss, teil: i, teilWeiter: true }] : [])]
  }

  /*
   * Die Abschnitte in der Reihenfolge, in der sie auf dem Blatt stehen. `teil` merkt sich,
   * welche davon Teilaufgaben sind: Sie müssen beim Rendern wieder in EINE nummerierte Liste
   * zusammengefasst werden, sonst begänne die Zählung auf jeder Seite neu bei a).
   */
  // Der Mustertext steht oben auf den Linien – dann nicht noch einmal am Ende
  const mustertextGezeigt = Boolean(key && block.answer.kind === 'lines' && !block.parts.length && block.brief?.model)
  const abschnitte: Abschnitt[] = []
  for (const teil of briefAbschnitte({ block, edit, set, wordLimit })) abschnitte.push({ node: teil })
  if (block.example) abschnitte.push({ node: beispielKnoten })
  if (mcListe) abschnitte.push({ node: mcGitter })
  else if (block.parts.length > 0) block.parts.forEach((part, i) => abschnitte.push(...teilaufgabe(part, i)))
  /*
   * Lösungsansicht: Wo die Lernenden schreiben, steht der Mustertext – und wo es keinen
   * gibt, bleibt die Fläche leer statt mit Linien gefüllt. Linien sind für die Lernenden da.
   */
  else if (key && block.answer.kind === 'lines') {
    if (mustertextGezeigt) for (const n of mustertextAbschnitte(block.brief!.model!)) abschnitte.push({ node: n })
  } else if (block.answer.kind === 'lines' && block.answer.count > LINIEN_PRO_EINHEIT)
    for (const n of linienAbschnitte(block.answer.count)) abschnitte.push({ node: n })
  else
    abschnitte.push({
      node: (
        <div data-unit key="answer">
          <AnswerView answer={block.answer} onChange={onAnswer((d) => d.answer)} />
        </div>
      )
    })

  /*
   * LÖSUNGSTEIL als eigene Einheiten, nicht als Anhang.
   *
   * Vorher hingen Lösung, Erwartungshorizont und Lehrkraftnotiz hinter den Einheiten und
   * wurden beim Seitenumbruch nicht mitgerechnet: Ihre Höhe zählte zum Kopf der Aufgabe, und
   * was unten nicht mehr passte, lief aus der Seite heraus. Gemeldet am 24.09.2026 mit einem
   * Mustertext, der mitten im Satz abbrach. Als Einheiten brechen sie sauber um.
   */
  if (key) {
    if (block.solution || keyEdit) {
      abschnitte.push({
        node: (
          <div className="ws-solution" data-unit key="loesung">
            <b>Lösung: </b>
            <RichText
              value={block.solution}
              editable={keyEdit}
              onChange={set((d, v) => ((d as TaskBlock).solution = v))}
              placeholder="Lösung / Erwartungshorizont"
            />
          </div>
        )
      })
    }
    if (block.brief) {
      for (const n of erwartungsAbschnitte({ block, edit: keyEdit, set, mitMustertext: !mustertextGezeigt })) abschnitte.push({ node: n })
    }
    if (block.afb || block.operator || taskItems(block) > 1) {
      abschnitte.push({
        node: (
          <div className="ws-teacher-note" data-unit key="hinweis">
            {[
              block.afb ? `AFB ${block.afb}` : '',
              block.operator ? `Operator: ${block.operator}` : '',
              /* Zahl der einzeln bewerteten Einheiten – sonst muss die Lehrkraft beim
                 Korrigieren nachzählen, ob die Punkte zur Aufgabe passen. Erst ab zwei:
                 Bei einer offenen Aufgabe wäre „1 Item" nur Rauschen. */
              taskItems(block) > 1 ? `${taskItems(block)} Items` : '',
              block.points ? `${block.points} Punkte` : '',
              block.minutes ? `ca. ${block.minutes} Min.` : '',
              block.afbReason
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )
      })
    }
  }

  const von = placed?.from ?? 0
  const bis = placed?.to ?? abschnitte.length
  const zeigtKopf = von === 0
  const sichtbar = gruppiereTeilaufgaben(abschnitte.slice(von, bis))

  return (
    <div className={`ws-block ws-task ${placed?.continued ? 'ws-continued' : ''}`}>
      {phase && zeigtKopf && <div className="ws-phase">{phase.label}</div>}
      {/*
       * Auf dem Folgestück steht statt der Arbeitsanweisung ein knapper Hinweis. Ohne ihn
       * stünden dort Schreiblinien ohne erkennbare Zugehörigkeit.
       */}
      {/* In der Sprache des Faches: „Task 3 (continued)" statt „Aufgabe 3 (Fortsetzung)" */}
      {!zeigtKopf && number !== undefined && <div className="ws-task-continued">{continuedNote(answerLanguage, number)}</div>}
      {zeigtKopf && (
        <div className="ws-task-head">
          {number !== undefined && <span className={`ws-task-num ws-num-${taskStyle.numberStyle}`}>{number}</span>}
          {block.observerGroup && <span className="ws-group">Gruppe {block.observerGroup}</span>}
          {block.timecode && showTimecodes && <span className="ws-timecode">{block.timecode}</span>}
          {showStars && block.stars && <span className="ws-stars">{stars(block.stars)}</span>}
          {taskStyle.showSocialFormIcons &&
            // Derselbe Symbolsatz wie bei den Arbeitsanweisungen – damit eine selbst gestaltete
            // Fassung auch hier gilt und nicht zwei Sätze nebeneinanderlaufen
            (socialPicto ? (
              <span className="ws-social" title={SOCIAL_FORM_LABELS[block.socialForm]}>
                <PictogramIcon picto={socialPicto} size={17} />
              </span>
            ) : (
              <span
                className="ws-social"
                title={SOCIAL_FORM_LABELS[block.socialForm]}
                dangerouslySetInnerHTML={{ __html: SOCIAL_FORM_SVG[block.socialForm] }}
              />
            ))}
          <div className={`ws-task-instruction ${ankreuzen ? 'ws-with-check' : ''}`}>
            {/* Das Symbol steht VOR der Anweisung, ersetzt sie aber nie: Wer das Zeichen nicht
              kennt, liest weiterhin das Wort. */}
            {instructionPicto && <PictogramIcon picto={instructionPicto} size={15} />}
            {/*
             * Angekreuztes Kästchen bei einer Ankreuzaufgabe – so wie in der Vorlage der
             * Lehrkraft („choose ☒ the correct answer"). Es zeigt in einem Zeichen, was zu tun
             * ist, und macht damit das wiederholte „Tick" vor jeder einzelnen Frage entbehrlich.
             */}
            {ankreuzen && (
              <span className="ws-check ws-check-demo" aria-hidden="true">
                ✗
              </span>
            )}
            {/*
              Die SITUATION steht VOR dem Auftrag, im selben Absatz.
              Gemeldet von der Lehrkraft (24.09.2026): Auf dem Blatt stand erst „**Write** an
              article …" und darunter „You are a member of your school website's editorial
              team. …". Das liest sich wie zwei Aufgaben. Gewuenscht ist die natuerliche
              Reihenfolge: erst die Lage, dann der Auftrag.
            */}
            {block.brief?.situation && (
              <span className="ws-task-situation">
                <RichText value={block.brief.situation} inline editable={edit} onChange={set((d, v) => ((d as TaskBlock).brief!.situation = v))} />{' '}
              </span>
            )}
            <RichText
              value={block.instruction}
              editable={edit}
              onChange={set((d, v) => ((d as TaskBlock).instruction = v))}
              // Ohne Sternchen: Der Platzhalter laeuft jetzt durch RichText und wuerde sie sonst woertlich zeigen
              placeholder="Arbeitsanweisung – Operator fett hervorheben"
            />
            {/*
             * „There is one example." – ERGÄNZT, nicht in die Anweisung geschrieben.
             * Wird das Beispiel entfernt, verschwindet der Satz von selbst mit.
             */}
            {block.example && <span className="ws-example-note">{exampleNote(answerLanguage)}</span>}
          </div>
        </div>
      )}

      {/*
       * ABSCHNITTE der Aufgabe – die Einheiten, an denen sie über Seiten geteilt werden darf.
       *
       * Vorher war eine Aufgabe unteilbar. Mit Situierung, Notizentabelle, Inhaltspunkten und
       * Schreiblinien wurde eine Schreibaufgabe größer als eine Seite, und die App konnte nur
       * noch warnen („Ein Baustein ist größer als die Seite").
       *
       * Was NICHT geteilt wird: die Notizentabelle (ihre Spalten gehören nebeneinander) und
       * das Gitter einer Ankreuzreihe (es wird spaltenweise gelesen). Beide bleiben je eine
       * Einheit – lieber ein Umbruch davor als eine halbe Tabelle.
       */}
      {sichtbar.map((a) => a.node)}
      {/*
        Schreiblinien bis zum Seitenende – siehe `linienAuffuellen`. Sie stehen bewusst
        AUSSERHALB der Umbruch-Einheiten: Sie fuellen genau den gemessenen Rest und duerfen
        die Aufteilung nicht noch einmal veraendern.
      */}
      {!key && (placed?.fillLines ?? 0) > 0 && (
        <div className={`ws-lines ws-lines-fill ${correctionMargin ? 'ws-lines-rand' : ''}`}>
          {Array.from({ length: placed!.fillLines! }, (_, i) => (
            <div key={i} className="ws-line" />
          ))}
        </div>
      )}
    </div>
  )
}

/** „M3 Die Schultaschen" → „Die Schultaschen" (die Nummer setzt die App selbst davor) */
export const stripMaterialNo = (title: string): string => String(title ?? '').replace(/^\s*[MQB]\s?\d+\s*[:.–-]?\s*/, '')

/** Bildreihe: Einzelbilder nebeneinander mit Unterschriften, Bildnachweise gesammelt darunter. */
/**
 * Spalten einer Bildreihe.
 *
 * Material-Bilder (Karten, Quellen, Diagramme) werden ausgewertet – sie brauchen Fläche und
 * stehen deshalb höchstens zu zweit nebeneinander. Piktogramme zum Beschriften dürfen eng
 * stehen.
 */
export function galleryColumns(count: number, role: ImageRole = 'illustration'): number {
  if (role === 'material') return Math.min(count, 2)
  return count <= 4 ? count : count <= 6 ? 3 : 4
}

function GalleryView({ block }: { block: ImageBlock }): React.JSX.Element {
  const { mode, actions } = useWs()
  const edit = mode === 'edit'
  const set = useSetter(block)
  const items = block.items ?? []
  return (
    <figure className={`ws-block ws-image ws-gallery ws-gallery-${block.role}`}>
      <div className="ws-gallery-grid" style={{ gridTemplateColumns: `repeat(${galleryColumns(items.length, block.role)}, 1fr)` }}>
        {items.map((it, k) => (
          <div className="ws-gallery-item" key={it.id}>
            <div
              className={`ws-gallery-frame ${edit ? 'ws-gallery-pick' : ''}`}
              onClick={edit ? () => actions?.pickImage?.(block.id, it.id) : undefined}
              title={edit ? 'Bild wählen' : undefined}
            >
              {it.image ? <img src={it.image.dataUrl} alt={it.description} /> : <div className="ws-image-placeholder">{it.description}</div>}
              {items.length > 1 && <span className="ws-gallery-number">{k + 1}</span>}
            </div>
            {(it.caption || edit) && (
              <div className="ws-gallery-caption">
                <Feld
                  value={it.caption}
                  editable={edit}
                  placeholder="Unterschrift"
                  onChange={set((d, v) => {
                    const item = (d as ImageBlock).items?.[k]
                    if (item) item.caption = v
                  })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {(block.caption || edit) && (
        <figcaption>
          <Feld value={block.caption} editable={edit} onChange={set((d, v) => ((d as ImageBlock).caption = v))} placeholder="Bildunterschrift" />
        </figcaption>
      )}
    </figure>
  )
}
