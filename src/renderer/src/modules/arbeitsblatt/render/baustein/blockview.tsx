import { RichText } from '../../../../shared/richtext/RichText'
import type { WsBlock } from '../../model/types'
import { gapRenderText } from '../Answers'
import { ImageLabelLayer } from '../ImageLabels'
import { gridDataUrl, gridDrawing } from '../gridSvg'
import { diagramDrawing } from '../diagramSvg'
import { qrDataUrl } from '../qr'
import { INFO_VARIANTS } from '../icons'
import type { PlacedItem } from '../paginate'
import { plainText } from '../../../../shared/richtext/parse'
import { isEditMode, isKeyMode, useWs } from '../WsContext'
import { COPYRIGHT_NOTE, QR_NOTE, videoKindById } from '../../didactics/videoTasks'
import { archivesForSubject, searchesMediaSources } from '../../didactics/mediaArchives'
import { headerLine } from '../../didactics/sourceHeader'
import { narrationNote } from '../../didactics/narration'
import { AI_AUDIO_NOTE, audioRulesFor, playsLabelFor } from '../../didactics/audioRules'
import { Illustriert, IllustrationView } from '../Illustration'
import { LONG_TEXT_CHARS, splitParagraphs, Feld, gridAlt, audioLength, shortLink, useSetter } from './hilfen'
import { TabelleAnsicht } from './tabelle'
import { TaskView } from './aufgabe'
import { stripMaterialNo, GalleryView } from './galerie'
import { ProtokollView } from './protokoll'

/**
 * Jeder Baustein mit angehefteter Illustration bekommt die Figur an die Ecke (26.09.2026) –
 * nur auf dem Schülerblatt; im Lösungsteil lenkt sie nur ab.
 */

/** „Wörter" in der Sprache des Kopfes (Klassenarbeit Französisch/Spanisch/Englisch) */
const WOERTER: Record<'de' | 'en' | 'fr' | 'es', string> = { de: 'Wörter', en: 'words', fr: 'mots', es: 'palabras' }
export function BlockView({ block, placed }: { block: WsBlock; placed?: PlacedItem }): React.JSX.Element | null {
  const { mode } = useWs()
  const set = useSetter(block)
  const kern = <BlockInhalt block={block} placed={placed} />
  // Nur im Lösungsteil (didactics/loesungsteil.ts): im Editor sichtbar mit Vermerk, sonst nur auf den Lösungen
  const inhalt =
    block.nurLoesung && mode === 'edit' ? (
      <div className="ws-nur-loesung" data-nur-loesung>
        <span className="ws-nur-loesung-label">nur im Lösungsteil</span>
        {kern}
      </div>
    ) : (
      kern
    )
  if (!block.illustration || isKeyMode(mode) || placed?.continued) return inhalt
  return (
    <Illustriert block={block} editable={mode === 'edit'} onBubble={set((d, v) => (d.illustration ? (d.illustration.bubble = v) : undefined))}>
      {inhalt}
    </Illustriert>
  )
}

export function BlockInhalt({ block, placed }: { block: WsBlock; placed?: PlacedItem }): React.JSX.Element | null {
  const ctx = useWs()
  const { mode } = ctx
  const edit = mode === 'edit'
  const set = useSetter(block)

  // Lehrerbausteine fehlen auf dem Schülerblatt – auch beim Messen der Seiten
  if (block.nurLoesung && (mode === 'print' || mode === 'measure')) return null

  switch (block.type) {
    case 'illustration':
      if (isKeyMode(mode)) return null
      return <IllustrationView block={block} editable={edit} onBubble={set((d, v) => ((d as typeof block).bubble = v))} />
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
          {to >= paragraphs.length && materialWoerter > 0 && (
            <div className="ws-wortzahl" data-foot>
              ({materialWoerter} {WOERTER[ctx.labelLanguage ?? 'de']})
            </div>
          )}
          {block.source && to >= paragraphs.length && (
            <div className="ws-source" data-foot>
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
              // Für den Setzer der Schilder (26.09.2026): Blockbreite in mm und das Bild (Seitenverhältnis)
              widthMm={((ctx.contentWidthMm ?? 170) * block.widthPercent) / 100}
              imageDataUrl={block.image?.dataUrl}
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
          {(block.caption || edit || ctx.materialNumbers?.get(block.id)) && (
            <figcaption>
              {/* Die Nummer steht am Bild wie am Text: Eine Aufgabe „mithilfe von M3" braucht ein sichtbares M3 (27.09.2026) */}
              {ctx.materialNumbers?.get(block.id) && <span className="ws-material-no">{ctx.materialNumbers.get(block.id)}</span>}
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
                placeholder="Hinweis zur Nutzung (optional), z. B. „Für Aufgabe 2: …“"
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
                      {/* **fett** wie überall auf dem Blatt – vorher standen die Sternchen im Druck */}
                      <span className="ws-phrases-text">
                        <RichText value={item.text} inline editable={false} />
                      </span>
                      {/*
                        Die deutsche Entsprechung steht gedämpft daneben, nicht darunter –
                        so bleibt der Blick auf der Zielsprache. Ab dem mittleren Niveau und
                        ab B1+ entfällt sie ganz; warum, steht in `didactics/phraseRules.ts`.
                      */}
                      {item.german && ctx.phraseGerman && (
                        <span className="ws-phrases-de">
                          {' – '}
                          <RichText value={item.german} inline editable={false} />
                        </span>
                      )}
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

    case 'table':
      return <TabelleAnsicht block={block} placed={placed} />

    case 'workspace':
      if (isKeyMode(mode)) return null
      return (
        <div className="ws-block ws-workspace">
          {block.label && <div className="ws-workspace-label">{block.label}</div>}
          <div className={`ws-workspace-area ws-workspace-${block.kind}`} style={{ height: `${block.heightMm}mm` }} />
        </div>
      )

    case 'grid': {
      // Fertig gezeichnete Zeitleiste (Material) oder leeres Gitternetz (Zeichenfläche)
      const drawing = block.diagram
        ? diagramDrawing(block.diagram, ctx.contentWidthMm ?? 170, { raster: false })
        : gridDrawing(block, ctx.contentWidthMm ?? 170)
      return (
        <div className="ws-block ws-grid-block">
          {(block.title || ctx.materialNumbers?.get(block.id)) && (
            <div className="ws-grid-title">
              {ctx.materialNumbers?.get(block.id) && <span className="ws-material-no">{ctx.materialNumbers.get(block.id)}</span>}
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
              {ctx.materialNumbers?.get(block.id) && <span className="ws-material-no">{ctx.materialNumbers.get(block.id)}</span>}
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
              {ctx.materialNumbers?.get(block.id) && <span className="ws-material-no">{ctx.materialNumbers.get(block.id)}</span>}
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
    case 'protocol':
      return <ProtokollView block={block} placed={placed} />
  }
}
