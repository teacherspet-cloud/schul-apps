import { RichText } from '../../../../shared/richtext/RichText'
import type { TextBlock, WsBlock } from '../../model/types'
import { gapRenderText, Spalten, TabellenGriffe } from '../Answers'
import { eigeneBreiten, zugUebernehmen } from '../tabelleMasse'
import type { ZugErgebnis } from '../tabelleZiehen'
import { ImageLabelLayer } from '../ImageLabels'
import { schaltplanEinrasten } from '../schaltplanSvg'
import { imageSizeFromDataUrl } from '../../../../shared/imageSize'
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
import { STANDARD_ABLAUF } from '../../didactics/hoerablauf'
import { ablaufZeile, dauerAngabe, hoerzeit, minSek, scriptTurns } from '../../../../shared/verstehen/hoerzeit'
import { Illustriert, IllustrationView } from '../Illustration'
import { LONG_TEXT_CHARS, kastenZeilen, splitParagraphs, Feld, FortsetzungsHinweis, gridAlt, linieGebunden, shortLink, useSetter } from './hilfen'
import { TabelleAnsicht } from './tabelle'
import { TaskView } from './aufgabe'
import { stripMaterialNo, GalleryView } from './galerie'
import { ProtokollView } from './protokoll'
import { wortzahlText, zaehleWoerter } from '../../../../shared/kopfSprache'
import { anmerkungenVon, ohneFussnotenMarken, type Anmerkung } from '../../didactics/anmerkungen'
import { fassungWechseln } from '../../didactics/textauswahl'
import { useTextAuswahl } from './textauswahl'

/**
 * Jeder Baustein mit angehefteter Illustration bekommt die Figur an die Ecke (26.09.2026) –
 * nur auf dem Schülerblatt; im Lösungsteil lenkt sie nur ab.
 */

/** Die Angaben des Materialkopfs in der Reihenfolge von `headerLine` */
const KOPF_ANGABEN = ['author', 'textType', 'date'] as const

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

/**
 * Hinweis „Bild fehlt" im Editor (08.10.2026): nur für die Lehrkraft, ohne Höhe im Satz. Die Beschreibung bleibt
 * bearbeitbar (sie ist die Suchgrundlage), „Bild suchen" öffnet die Bildwahl.
 */
export function BildFehlt({
  beschreibung,
  onChange,
  onSuchen
}: {
  beschreibung: string
  onChange?: (v: string) => void
  onSuchen?: () => void
}): React.JSX.Element {
  return (
    <div className="ws-bild-fehlt-anker" data-bild-fehlt>
      <div className="ws-bild-fehlt">
        <strong>Bild fehlt</strong>
        <span className="ws-bild-fehlt-text">
          <Feld value={beschreibung} editable={Boolean(onChange)} onChange={(v) => onChange?.(v)} placeholder="Was das Bild zeigen soll" />
        </span>
        {onSuchen && (
          <button type="button" className="ws-bild-fehlt-knopf" onClick={onSuchen}>
            Bild suchen
          </button>
        )}
      </div>
    </div>
  )
}

/** Einheiten [von, bis) des gesetzten Stücks; ohne Aufteilung alle */
const stueck = (placed: PlacedItem | undefined, anzahl: number): [number, number] => [placed?.from ?? 0, placed?.to ?? anzahl]

export function BlockInhalt({ block, placed }: { block: WsBlock; placed?: PlacedItem }): React.JSX.Element | null {
  const ctx = useWs()
  const { mode } = ctx
  const edit = mode === 'edit'
  // Texte auch in der Lösungsansicht bearbeitbar (30.09.2026) – Anzeige und Platzhalter folgen weiter `edit`
  const schreiben = isEditMode(mode)
  const set = useSetter(block)

  // Lehrerbausteine fehlen auf dem Schülerblatt – auch beim Messen der Seiten
  if (block.nurLoesung && (mode === 'print' || mode === 'measure')) return null

  switch (block.type) {
    case 'illustration':
      if (isKeyMode(mode)) return null
      return <IllustrationView block={block} editable={schreiben} onBubble={set((d, v) => ((d as typeof block).bubble = v))} />
    case 'learningGoals': {
      if (isKeyMode(mode)) return null
      // Teilbar zwischen zwei Lernzielen (01.10.2026)
      const [von, bis] = stueck(placed, block.goals.length)
      return (
        <div className={`ws-block ws-goals ${placed?.continued ? 'ws-continued' : ''}`}>
          {von === 0 ? (
            <div className="ws-goals-title">
              <Feld value={block.title} editable={schreiben} onChange={set((d, v) => ((d as typeof block).title = v))} />
            </div>
          ) : (
            <FortsetzungsHinweis bezeichnung={block.title} />
          )}
          <ul>
            {block.goals.slice(von, bis).map((g, k) => (
              <li key={von + k} data-unit>
                <RichText value={g} inline editable={schreiben} onChange={set((d, v) => ((d as typeof block).goals[von + k] = v))} />
              </li>
            ))}
          </ul>
        </div>
      )
    }

    case 'infoBox': {
      const v = INFO_VARIANTS[block.variant] ?? INFO_VARIANTS.merke
      /*
       * Ein Kasten mit mehreren Absätzen ist zwischen zwei Absätzen teilbar (01.10.2026); das
       * Folgestück ist wieder ein Kasten, oben mit „Merke (Fortsetzung)". Ein einzelner Absatz
       * bleibt die gewohnte Darstellung und wird nie geteilt (mitten im Satz).
       */
      const absaetze = splitParagraphs(block.body ?? '')
      // Zweispaltig (Operatorenliste): ein Paar Listenpunkte je Zeile – die Umbruchstellen sind die Zeilen
      const zeilen = kastenZeilen(absaetze, block.spalten)
      const [von, bis] = stueck(placed, zeilen.length)
      const absatzFeld = (i: number): React.JSX.Element => (
        <RichText
          value={absaetze[i]}
          editable={schreiben}
          onChange={set((d, val) => {
            const alle = splitParagraphs((d as typeof block).body ?? '')
            alle[i] = val
            ;(d as typeof block).body = alle.filter((x) => x.trim()).join('\n\n')
          })}
          renderText={gapRenderText(isKeyMode(mode))}
        />
      )
      return (
        <div
          className={`ws-block ws-info ws-info-${block.variant} ${block.spalten === 2 ? 'ws-info-spalten' : ''} ${block.abgesetzt ? 'ws-info-abgesetzt' : ''} ${placed?.continued ? 'ws-continued' : ''}`}
        >
          {von === 0 ? (
            <div className="ws-info-head">
              <span className="ws-info-symbol">{v.symbol}</span>
              <Feld
                className="ws-info-title"
                value={block.title || v.label}
                editable={schreiben}
                onChange={set((d, val) => ((d as typeof block).title = val))}
              />
            </div>
          ) : (
            <FortsetzungsHinweis bezeichnung={block.title || v.label} />
          )}
          {absaetze.length < 2 ? (
            <RichText
              value={block.body}
              editable={schreiben}
              onChange={set((d, val) => ((d as typeof block).body = val))}
              placeholder="Inhalt des Kastens"
              // Ein Merkkasten darf Lücken tragen, die die Lernenden selbst füllen
              renderText={gapRenderText(isKeyMode(mode))}
            />
          ) : (
            zeilen.slice(von, bis).map((zeile, k) =>
              zeile.length > 1 || block.spalten === 2 ? (
                <div key={von + k} data-unit className={`ws-info-absatz ${zeile.length > 1 ? 'ws-info-paar' : ''}`}>
                  {zeile.map((i) => (
                    <div key={i} className="ws-info-spalte">
                      {absatzFeld(i)}
                    </div>
                  ))}
                </div>
              ) : (
                <div key={von + k} data-unit className="ws-info-absatz">
                  {absatzFeld(zeile[0])}
                </div>
              )
            )
          )}
        </div>
      )
    }

    case 'text': {
      return <MaterialText block={block} placed={placed} />
    }

    case 'image': {
      if (block.items?.length) return <GalleryView block={block} />
      /*
       * OHNE BILD (08.10.2026, Befund „Vom Krieg zur Krise", Geschichte Kl. 9): Auf dem Schülerblatt stand ein
       * gestrichelter Kasten mit dem Suchauftrag der KI („Bild wählen: Foto eines …"). Schülerblatt, Druck, Lösung
       * und Messung zeigen jetzt NICHTS. Im Editor steht ein Hinweis „Bild fehlt" mit Knopf „Bild suchen" – ohne
       * Höhe im Satz (er liegt über dem Folgenden), damit Editor und Druck gleich umbrechen.
       */
      if (!block.image)
        return schreiben ? (
          <BildFehlt
            beschreibung={block.description}
            onChange={set((d, v) => ((d as typeof block).description = v))}
            onSuchen={ctx.actions?.pickImage ? () => ctx.actions?.pickImage?.(block.id) : undefined}
          />
        ) : null
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
      ) : null
      return (
        <figure className="ws-block ws-image" style={{ width: `${block.widthPercent}%` }}>
          {block.labels?.length ? (
            <ImageLabelLayer
              labels={block.labels}
              showAnswers={isKeyMode(mode)}
              // Für den Setzer der Schilder (26.09.2026): Blockbreite in mm und das Bild (Seitenverhältnis)
              widthMm={((ctx.contentWidthMm ?? 170) * block.widthPercent) / 100}
              imageDataUrl={block.image?.dataUrl}
              // Punkt und Schild frei nachjustieren – in jedem Editor, der Bausteine bearbeiten lässt (ein Zug = ein Rückgängig-Schritt)
              onChange={
                edit && ctx.update
                  ? (id, aendern) =>
                      ctx.update?.(block.id, (d) => {
                        const label = (d as typeof block).labels?.find((l) => l.id === id)
                        if (label) aendern(label)
                      })
                  : undefined
              }
              einrasten={block.schaltplan ? (p) => schaltplanEinrasten(block.schaltplan!, imageSizeFromDataUrl(block.image?.dataUrl), p) : undefined}
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
              <Feld value={block.caption} editable={schreiben} onChange={set((d, v) => ((d as typeof block).caption = v))} placeholder="Bildunterschrift" />
            </figcaption>
          )}
        </figure>
      )
    }

    case 'phrases':
      return (
        <div className="ws-block ws-phrases">
          <div className="ws-phrases-head">
            <Feld value={block.title} editable={schreiben} onChange={set((d, v) => ((d as typeof block).title = v))} placeholder="Useful phrases" />
          </div>
          {(block.hint || edit) && (
            <div className="ws-phrases-hint">
              <Feld
                value={block.hint}
                editable={schreiben}
                onChange={set((d, v) => ((d as typeof block).hint = v))}
                placeholder="Hinweis zur Nutzung (optional), z. B. „Für Aufgabe 2: …“"
              />
            </div>
          )}
          <div className="ws-phrases-groups">
            {block.groups.map((group, gi) => (
              <div className="ws-phrases-group" key={gi}>
                {group.label && (
                  <div className="ws-phrases-label">
                    <Feld value={group.label} editable={schreiben} onChange={set((d, v) => ((d as typeof block).groups[gi].label = v))} />
                  </div>
                )}
                <ul>
                  {group.items.map((item, ii) => (
                    <li key={ii}>
                      {/* **fett** wie überall auf dem Blatt – vorher standen die Sternchen im Druck; seit 30.09.2026 bearbeitbar */}
                      <span className="ws-phrases-text">
                        <RichText value={item.text} inline editable={schreiben} onChange={set((d, v) => ((d as typeof block).groups[gi].items[ii].text = v))} />
                      </span>
                      {/*
                        Die deutsche Entsprechung steht gedämpft daneben, nicht darunter –
                        so bleibt der Blick auf der Zielsprache. Ab dem mittleren Niveau und
                        ab B1+ entfällt sie ganz; warum, steht in `didactics/phraseRules.ts`.
                      */}
                      {/* Vokabelgruppe (Hörtext/Video, 02.10.2026): die Erklärung gehört immer dazu */}
                      {item.german && (ctx.phraseGerman || group.art === 'vokabeln') && (
                        <span className="ws-phrases-de">
                          {' – '}
                          <RichText
                            value={item.german}
                            inline
                            editable={schreiben}
                            onChange={set((d, v) => ((d as typeof block).groups[gi].items[ii].german = v))}
                          />
                        </span>
                      )}
                      {group.art === 'vokabeln' && (item.kontext || edit) && (
                        <div className="ws-phrases-kontext">
                          <Feld
                            value={item.kontext ?? ''}
                            editable={schreiben}
                            onChange={set((d, v) => ((d as typeof block).groups[gi].items[ii].kontext = v))}
                            placeholder="Satz aus dem Text (optional)"
                          />
                        </div>
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

    case 'scaffold': {
      if (isKeyMode(mode)) return null
      // Listen (Tipps, Satzanfänge) teilbar zwischen zwei Punkten (01.10.2026); Wortspeicher und Hilfekarten nicht
      const [von, bis] = stueck(placed, block.items.length)
      return (
        <div
          className={`ws-block ws-scaffold ws-scaffold-${block.variant} ${placed?.continued ? 'ws-continued' : ''}`}
          // Zu welcher Aufgabe die Hilfe gehört (06.10.2026): gesperrt bis zur Freischaltung, Hilfekarten digital am ?-Symbol
          data-hilfe-fuer={ctx.hilfeFuer?.get(block.id)}
          data-hilfe-block={block.id}
        >
          {von === 0 ? (
            <div className="ws-scaffold-title">
              <Feld value={block.title} editable={schreiben} onChange={set((d, v) => ((d as typeof block).title = v))} />
            </div>
          ) : (
            <FortsetzungsHinweis bezeichnung={block.title} />
          )}
          {block.variant === 'wortspeicher' ? (
            <div className="ws-wordbank">
              {block.items.map((it, i) => (
                <span key={i}>
                  <RichText value={it} inline editable={schreiben} onChange={set((d, v) => ((d as typeof block).items[i] = v))} />
                </span>
              ))}
            </div>
          ) : block.variant === 'hilfekarten' ? (
            <div className="ws-helpcards">
              {block.items.map((it, i) => (
                <div key={i} className="ws-helpcard">
                  <div className="ws-helpcard-num">Hilfe {i + 1}</div>
                  <RichText value={it} editable={schreiben} onChange={set((d, v) => ((d as typeof block).items[i] = v))} />
                </div>
              ))}
            </div>
          ) : (
            <ul>
              {block.items.slice(von, bis).map((it, k) => (
                <li key={von + k} data-unit>
                  <RichText value={it} inline editable={schreiben} onChange={set((d, v) => ((d as typeof block).items[von + k] = v))} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }

    case 'table':
      return <TabelleAnsicht block={block} placed={placed} />

    case 'workspace': {
      if (isKeyMode(mode)) return null
      /*
       * Ein LINIERTER Schreibraum ist zwischen zwei Linien teilbar (01.10.2026) – wie die
       * Schreiblinien einer Aufgabe: je Linie eine Einheit (8,5 mm), die letzte nimmt den Rest.
       * Kästchen und freie Fläche bleiben ein Stück (Zeichnung, Rechnung).
       */
      // Linienabstand nach Jahrgang (02.10.2026) – derselbe wie `--ws-linie` der Seite
      const LINIE_MM = ctx.schreibRegel?.linieMm ?? 8.5
      const linien = block.kind === 'lines' ? Math.max(1, Math.round(block.heightMm / LINIE_MM)) : 1
      const [von, bis] = stueck(placed, linien)
      const hoehe = (k: number): number => (k < linien - 1 ? LINIE_MM : Math.max(1, block.heightMm - (linien - 1) * LINIE_MM))
      // Korrekturrand auch an den Linien eines Schreibraums (08.10.2026) – bis dahin nur an den Schreiblinien der Aufgaben
      const rand = block.kind === 'lines' && ctx.correctionMargin ? ' ws-lines-rand' : ''
      return (
        <div className={`ws-block ws-workspace ${placed?.continued ? 'ws-continued' : ''}`}>
          {von > 0 && <FortsetzungsHinweis bezeichnung={block.label} />}
          {von === 0 && block.label && (
            <div className="ws-workspace-label">
              <Feld value={block.label} editable={schreiben} onChange={set((d, v) => ((d as typeof block).label = v))} />
            </div>
          )}
          {linien < 2 ? (
            <div className={`ws-workspace-area ws-workspace-${block.kind}${rand}`} style={{ height: `${block.heightMm}mm` }} />
          ) : (
            Array.from({ length: bis - von }, (_, k) => (
              <div
                key={von + k}
                data-unit
                // Mindestens zwei Linien je Stück – siehe `linieGebunden`
                {...(linieGebunden(von + k, linien) ? { 'data-bindet': '' } : {})}
                className={`ws-workspace-area ws-workspace-${block.kind}${rand}`}
                style={{ height: `${hoehe(von + k)}mm` }}
              />
            ))
          )}
        </div>
      )
    }

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
              <Feld value={block.title} editable={schreiben} onChange={set((d, v) => ((d as typeof block).title = v))} />
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
              <Feld value={block.caption} editable={schreiben} onChange={set((d, v) => ((d as typeof block).caption = v))} />
            </div>
          )}
        </div>
      )
    }

    case 'audio': {
      // Fach entscheidet über Abspielzahl und darüber, ob das Transkript aufs Blatt gehört
      const subjectId = ctx.subjectId ?? ''
      const audioRegeln = audioRulesFor(subjectId)
      // Dauer und Zeitmarken: aus der Aufnahme, sonst geschätzt und mit „ca." (01.10.2026)
      const zeit = hoerzeit(block)
      const zeilen = scriptTurns(block)
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
              <Feld value={block.title} editable={schreiben} onChange={set((d, v) => ((d as typeof block).title = v))} />
            </span>
            <span className="ws-audio-meta">
              {/*
               * Die Abspielzahl folgt dem Fach: In den Sprachen wird zweimal gehört, im
               * Sachfach so oft wie nötig. Begründung in `didactics/audioRules.ts`.
               */}
              {[block.textType, zeit.sekunden ? dauerAngabe(zeit) : '', playsLabelFor(subjectId, block.plays, ctx.anrede)].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="ws-audio-body">
            <div className="ws-audio-texts">
              {block.speakers.length > 1 && <div className="ws-audio-speakers">{block.speakers.map((s) => s.name).join(' · ')}</div>}
              {block.beforeListening && (
                <div className="ws-audio-before">
                  <RichText value={block.beforeListening} inline editable={schreiben} onChange={set((d, v) => ((d as typeof block).beforeListening = v))} />
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
          {/*
           * Bearbeitungszeit des Hörteils (01.10.2026, nur Lehrkraft): Einlesezeit, Durchgänge, Pausen
           * und Nachbearbeitung nach den Vorgaben des Landes – aus der gemessenen Dauer, sobald vertont ist.
           */}
          {isKeyMode(mode) && !audioRegeln.transcriptOnSheet && zeit.sekunden > 0 && (
            <div className="ws-teacher-note" data-hoerablauf>
              Hörteil: {ablaufZeile(zeit, block.plays, ctx.hoerablauf ?? STANDARD_ABLAUF)}
            </div>
          )}
          {(isKeyMode(mode) || audioRegeln.transcriptOnSheet) && block.transcript && (
            <div className="ws-audio-script">
              <div className="ws-audio-script-title">
                {audioRegeln.transcriptOnSheet && !isKeyMode(mode) ? 'Text der Aufnahme' : 'Skript'}
                {isKeyMode(mode) && zeilen.length > 0 ? ` · Zeitmarken ${zeit.markenEcht ? 'aus der Aufnahme' : 'geschätzt'}` : ''}
              </div>
              {/*
               * Lösungsteil: je Sprecherzeile ihre Zeitmarke (01.10.2026). Jede Zeile bleibt in der
               * Lösungsansicht bearbeitbar; das Skript wird danach aus den Zeilen neu zusammengesetzt.
               */}
              {isKeyMode(mode) && zeilen.length > 0 ? (
                zeilen.map((z, i) => (
                  <div className="ws-audio-zeile" key={i} data-zeitmarke={zeit.marken[i] ?? 0}>
                    <span className="ws-zeitmarke">{minSek(zeit.marken[i] ?? 0)}</span>
                    <RichText
                      value={z.name ? `${z.name}: ${z.text}` : z.text}
                      inline
                      editable={mode === 'keyEdit'}
                      onChange={set((d, v) => {
                        const b = d as typeof block
                        const liste = scriptTurns(b).map((t) => (t.name ? `${t.name}: ${t.text}` : t.text))
                        if (v.trim()) liste[i] = v.trim()
                        else liste.splice(i, 1)
                        b.transcript = liste.join('\n')
                      })}
                    />
                  </div>
                ))
              ) : (
                <RichText value={block.transcript} editable={mode === 'keyEdit'} onChange={set((d, v) => ((d as typeof block).transcript = v))} />
              )}
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
              <Feld value={block.title} editable={schreiben} onChange={set((d, v) => ((d as typeof block).title = v))} />
            </span>
            <span className="ws-video-meta">{facts.join(' · ')}</span>
          </div>
          <div className="ws-video-body">
            <div className="ws-video-texts">
              {block.sourceTitle && (
                <div className="ws-video-source">
                  <Feld value={block.sourceTitle} editable={schreiben} onChange={set((d, v) => ((d as typeof block).sourceTitle = v))} />
                  {block.platform ? ` · ${block.platform}` : ''}
                </div>
              )}
              {block.summary && (
                <div className="ws-video-summary">
                  <RichText value={block.summary} inline editable={schreiben} onChange={set((d, v) => ((d as typeof block).summary = v))} />
                </div>
              )}
              {block.beforeViewing && (
                <div className="ws-video-before">
                  <RichText value={block.beforeViewing} inline editable={schreiben} onChange={set((d, v) => ((d as typeof block).beforeViewing = v))} />
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

    case 'selfCheck': {
      if (isKeyMode(mode)) return null
      // Teilbar zwischen zwei Aussagen (01.10.2026); die Kopfzeile steht auf jedem Stück
      const [von, bis] = stueck(placed, block.statements.length)
      /*
       * Ziehbare Maße (02.10.2026, render/tabelleZiehen.ts): Spalten und Zeilen von Hand, ein
       * Rückgängig-Schritt je Geste. Ohne Maße die bisherige Aufteilung (ws.css).
       */
      const scBreiten = eigeneBreiten(block, 4)
      const scZiehbar = schreiben && Boolean(ctx.update)
      const scZug = (z: ZugErgebnis): void =>
        ctx.update?.(block.id, (d) => {
          if (d.type === 'selfCheck') zugUebernehmen(d, z, d.statements.length)
        })
      const scGriffe = (r: number | 'kopf', c: number): React.ReactNode =>
        scZiehbar && <TabellenGriffe c={c} spalten={4} zeile={r} breiten={scBreiten} onZug={scZug} />
      const kopf =
        block.format === 'kompetenzraster' ? ['sicher', 'teilweise', 'noch nicht'] : block.format === 'ampel' ? ['🟢', '🟡', '🔴'] : ['🙂', '😐', '🙁']
      return (
        <div className={`ws-block ws-selfcheck ${placed?.continued ? 'ws-continued' : ''}`}>
          {von > 0 && <FortsetzungsHinweis bezeichnung={block.title} />}
          <table className={scZiehbar ? 'ws-table-ziehbar' : undefined} style={scBreiten ? { tableLayout: 'fixed' } : undefined}>
            <Spalten n={4} breiten={scBreiten} />
            <thead>
              <tr style={block.headerHeightMm ? { height: `${block.headerHeightMm}mm` } : undefined}>
                <th>
                  <Feld value={block.title} editable={schreiben} onChange={set((d, v) => ((d as typeof block).title = v))} />
                  {scGriffe('kopf', 0)}
                </th>
                {kopf.map((l, c) => (
                  <th key={l}>
                    {l}
                    {scGriffe('kopf', c + 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.statements.slice(von, bis).map((s, k) => (
                <tr key={von + k} data-unit style={block.rowHeightsMm?.[von + k] ? { height: `${block.rowHeightsMm[von + k]}mm` } : undefined}>
                  <td>
                    <RichText value={s} inline editable={schreiben} onChange={set((d, v) => ((d as typeof block).statements[von + k] = v))} />
                    {scGriffe(von + k, 0)}
                  </td>
                  {[1, 2, 3].map((c) => (
                    <td key={c} className="ws-sc-cell">
                      {scGriffe(von + k, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'divider':
      return (
        <div className="ws-block ws-divider">
          <Feld value={block.title} editable={schreiben} onChange={set((d, v) => ((d as typeof block).title = v))} />
        </div>
      )
    case 'protocol':
      return <ProtokollView block={block} placed={placed} />
  }
}

/**
 * Materialtext (M1, M2 …) – eigene Komponente seit dem Textauswahl-Menü (01.10.2026): Rechtsklick
 * bzw. langer Druck auf eine Markierung öffnet das Kreismenü (textauswahl.tsx). Fußnoten und
 * Worthilfen tragen EINE Zählung mit hochgestellten Ziffern (didactics/anmerkungen.ts).
 */
function MaterialText({ block, placed }: { block: TextBlock; placed?: PlacedItem }): React.JSX.Element {
  const ctx = useWs()
  const { mode } = ctx
  const edit = mode === 'edit'
  const schreiben = isEditMode(mode)
  const set = useSetter(block)
  const auswahl = useTextAuswahl(block)
  const materialNo = ctx.materialNumbers?.get(block.id)
  const paragraphs = splitParagraphs(block.body)
  // Anzeige mit hochgestellten Ziffern an Fußnoten- und Worthilfe-Stellen; Rohtext bleibt zum Bearbeiten
  const anm = anmerkungenVon(block)
  const anzeigeAbsaetze = splitParagraphs(anm.anzeige)
  const gleichGeteilt = anzeigeAbsaetze.length === paragraphs.length
  const from = placed?.from ?? 0
  /*
   * Fußnoten (01.10.2026, Blattoptionen): Die Anmerkungen stehen unten auf der Seite ihres Worts –
   * gesetzt von SheetPages (`SeitenFussnoten`), nicht hier. Frei gezogene Materialien stehen außerhalb
   * des Seitenflusses und behalten ihre Liste am Ende.
   */
  const fussModus = ctx.anmerkungsArt === 'fussnoten' && !block.free
  const to = placed?.to ?? paragraphs.length + (anm.anmerkungen.length && !fussModus ? 1 : 0)
  /*
   * Kopf (Titel, Quellenangabe, Einleitung) nur auf dem ersten Stück. Nicht an `from` ablesbar: Teilt
   * der Umbruch schon den ERSTEN Absatz, beginnt auch das Folgestück bei Absatz 0 – der Kopf stand dann
   * auf der neuen Seite ein zweites Mal (03.10.2026, Befund der Lehrkraft). `continued` setzt paginate
   * nach Zeilen, also auch mitten im Absatz.
   */
  const showHead = placed ? !placed.continued : from === 0
  const showGlossary = !fussModus && anm.anmerkungen.length > 0 && to > paragraphs.length
  const lineStart = placed?.lineStart ?? 0
  const lineCount = placed?.lineCount ?? 0
  // Endet das Stück mitten im letzten Absatz, folgen Wortzahl und Quelle erst unter dem Rest (02.10.2026)
  const endetImAbsatz = placed?.absatzBis !== undefined
  // Blocksatz nur bei längeren Texten – kurze Absätze würden sonst zerrissen
  const justify = ctx.justify && plainText(block.body).length >= LONG_TEXT_CHARS
  // Auslassungszeichen sind Kennzeichnung, keine Woerter des Originals
  // Chinesisch/Japanisch: Schriftzeichen statt Wörter (shared/kopfSprache.ts)
  const materialWoerter = zaehleWoerter(plainText(ohneFussnotenMarken(block.body)).replace(/\[\s*(?:…|\.\.\.)\s*\]/g, ' '), ctx.labelLanguage)
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
      {/* Folgestück: „M2 (Fortsetzung)" – derselbe Wegweiser wie bei Aufgaben (01.10.2026) */}
      {!showHead && <FortsetzungsHinweis bezeichnung={materialNo ?? stripMaterialNo(block.title)} />}
      {showHead && (block.title || materialNo) && (
        <div className="ws-text-title" data-head>
          {/* Die Nummer vergibt die App – so verweist keine Aufgabe auf ein Material, das es nicht gibt */}
          {materialNo && <span className="ws-material-no">{materialNo}</span>}
          <Feld value={stripMaterialNo(block.title)} editable={schreiben} onChange={set((d, v) => ((d as typeof block).title = v))} />
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
      {/* Jede Angabe einzeln bearbeitbar (30.09.2026) – die Zeile setzt sich wie `headerLine` zusammen */}
      {showHead && headerLine(block.sourceHeader) && (
        <div className="ws-source-header">
          {KOPF_ANGABEN.filter((k) => block.sourceHeader?.[k]?.trim()).map((k, i) => (
            <span key={k}>
              {i > 0 && ' · '}
              <Feld
                value={block.sourceHeader![k]}
                editable={schreiben}
                onChange={set((d, v) => {
                  const kopf = (d as typeof block).sourceHeader
                  if (kopf) kopf[k] = v
                })}
              />
            </span>
          ))}
        </div>
      )}
      {/*
       * Hinweis ueber einer Erzaehlung: Sie ist eine Darstellung, keine Quelle.
       * Er steht bewusst im Seiteninhalt und nicht klein darunter - eine Ich-Erzaehlung
       * wird sonst fuer eine Quelle gehalten.
       */}
      {showHead && narrationNote(block.narration) && <div className="ws-narration-note">{narrationNote(block.narration)}</div>}
      {/*
       * Einleitungssatz (01.10.2026): kursiv zwischen „M1 Titel" und dem Wortlaut – wer spricht,
       * wann, wo, worüber. Nicht Teil des Zitats und nicht der Zeilenzählung.
       */}
      {showHead && (block.intro?.trim() || (edit && block.zuschnitt)) && (
        <div className="ws-text-intro" data-testid="material-einleitung">
          <Feld value={block.intro ?? ''} editable={schreiben} onChange={set((d, v) => ((d as typeof block).intro = v))} />
        </div>
      )}
      <div
        className="ws-text-body"
        ref={auswahl.ref}
        onContextMenu={auswahl.onContextMenu}
        data-zeile-start={lineStart}
        // Langer Druck (iPad) öffnet das Textauswahl-Menü – shared/touch/gesten.ts
        data-langdruck={auswahl.onContextMenu ? '' : undefined}
      >
        {/* Umschalter der Fassungen (Textauswahl „Einfacher formulieren") – nur im Editor, außerhalb des Flusses */}
        {edit && showHead && block.andereFassung && (
          <div className="ws-fassung" data-fassung={block.andereFassung.art === 'original' ? 'vereinfacht' : 'original'}>
            {block.andereFassung.art === 'original' ? 'Vereinfachte Fassung' : 'Originalfassung'}
            <button type="button" onClick={() => ctx.update?.(block.id, (d) => d.type === 'text' && fassungWechseln(d))}>
              {block.andereFassung.art === 'original' ? 'Original zeigen' : 'Vereinfachte Fassung zeigen'}
            </button>
          </div>
        )}
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
          paragraphs.slice(from, Math.min(to, paragraphs.length)).map((p, i) => {
            /*
             * ZEILENWEISE TEILUNG (02.10.2026, render/zeilenTeilung.ts): Steht ein Absatz nur zum
             * Teil auf dieser Seite, wird er GANZ gesetzt – so bricht er um wie beim Messen – und ein
             * Rahmen zeigt nur seine Zeilen auf dieser Seite: oben um die schon gezeigten Zeilen
             * verschoben, unten auf die Höhe der Zeilen bis zur Schnittstelle begrenzt.
             * `ws-absatz-folgt` trägt die Einrückung „Absatz nach Absatz" (ws.css), die im Rahmen
             * keinen Vorgänger mehr fände.
             */
            const ab = i === 0 ? placed?.absatzAb : undefined
            const bis = from + i === to - 1 ? placed?.absatzBis : undefined
            const absatz = (
              <div
                key={from + i}
                data-unit
                className={`ws-paragraph ${from + i > 0 ? 'ws-absatz-folgt' : ''}`}
                data-absatz={from + i}
                style={ab ? { marginTop: -ab } : undefined}
              >
                <RichText
                  value={p}
                  anzeige={gleichGeteilt ? anzeigeAbsaetze[from + i] : undefined}
                  // Lücken aus dem Textauswahl-Menü: im Lösungsteil mit Lösung
                  renderText={gapRenderText(isKeyMode(mode))}
                  editable={schreiben}
                  onChange={set((d, v) => {
                    // Absatz ersetzen; eine Leerzeile im neuen Text erzeugt weitere Absätze
                    const all = splitParagraphs((d as typeof block).body)
                    all[from + i] = v
                    ;(d as typeof block).body = all.filter((x) => x.trim()).join('\n\n')
                  })}
                />
              </div>
            )
            if (ab === undefined && bis === undefined) return absatz
            return (
              <div key={from + i} className="ws-zeilen-schnitt" data-zeilen-schnitt style={bis !== undefined ? { height: bis - (ab ?? 0) } : undefined}>
                {absatz}
              </div>
            )
          })
        )}
        {showGlossary && (
          <div data-unit className="ws-glossary">
            {/* Fußnoten und Worthilfen in EINER Zählung, jede mit ihrer hochgestellten Ziffer (01.10.2026) */}
            {anm.anmerkungen.map((a) => (
              <AnmerkungZeile key={`${a.art}-${a.index}`} block={block} a={a} />
            ))}
          </div>
        )}
      </div>
      {auswahl.menue}
      {/*
            WORTZAHL am Ende des Materials, rechtsbuendig.
            Gewuenscht von der Lehrkraft (24.09.2026). In Pruefungsaufgaben steht sie dort,
            weil sie den Aufwand einschaetzbar macht: Wer weiss, dass der Text 700 Woerter
            hat, teilt sich die Lesezeit anders ein.
            Gezaehlt wird der ganze Text, nicht nur das Stueck auf dieser Seite – und die
            Auslassungszeichen zaehlen nicht mit.
          */}
      {to >= paragraphs.length && !endetImAbsatz && materialWoerter > 0 && (
        <div className="ws-wortzahl" data-foot>
          ({wortzahlText(materialWoerter, ctx.labelLanguage)})
        </div>
      )}
      {block.source && to >= paragraphs.length && !endetImAbsatz && (
        <div className="ws-source" data-foot>
          Quelle: <Feld value={block.source} editable={schreiben} onChange={set((d, v) => ((d as typeof block).source = v))} />
        </div>
      )}
    </div>
  )
}

/**
 * Eine Anmerkung (Fußnote oder Worthilfe) mit ihrer hochgestellten Ziffer – am Ende des Materials
 * (Endnoten) und unten auf der Seite (Fußnoten) dieselbe Zeile, in beiden Fällen bearbeitbar.
 */
function AnmerkungZeile({ block, a }: { block: TextBlock; a: Anmerkung }): React.JSX.Element {
  const ctx = useWs()
  const schreiben = isEditMode(ctx.mode)
  const set = useSetter(block)
  const f = a.art === 'fussnote' ? block.fussnoten?.[a.index] : undefined
  const feld = (welches: 'wort' | 'text') =>
    set((d, v) => {
      const t = d as typeof block
      if (a.art === 'fussnote') {
        const fn = t.fussnoten?.[a.index]
        if (fn) fn[welches] = v
      } else if (t.glossary[a.index]) {
        if (welches === 'wort') t.glossary[a.index].term = v
        else t.glossary[a.index].explanation = v
      }
    })
  return (
    <div className={`ws-anmerkung ${f?.bild ? 'ws-anmerkung-bild' : ''}`} data-anmerkung={a.art} data-fn-block={block.id} data-fn-nr={a.nr}>
      <sup className="ws-anmerkung-nr">{a.nr}</sup>{' '}
      {f?.bild && (
        <span className="ws-fussnote-bild">
          <img src={f.bild.dataUrl} alt={a.wort} />
          <span className="ws-ai-mark" title="Dieses Bild wurde von einer KI erzeugt.">
            KI
          </span>
        </span>
      )}
      <b>
        <Feld value={a.wort} editable={schreiben} onChange={feld('wort')} />
      </b>
      {(a.text || schreiben) && (
        <>
          : <Feld value={a.text} editable={schreiben} onChange={feld('text')} />
        </>
      )}
      {ctx.mode === 'edit' && a.art === 'fussnote' && (
        <button
          type="button"
          className="ws-anmerkung-weg"
          title="Fußnote entfernen"
          aria-label="Fußnote entfernen"
          onClick={() =>
            ctx.update?.(block.id, (d) => {
              if (d.type !== 'text' || !f) return
              d.body = d.body.split(`[^${f.id}]`).join('')
              d.fussnoten = (d.fussnoten ?? []).filter((x) => x.id !== f.id)
            })
          }
        >
          ×
        </button>
      )}
    </div>
  )
}

/**
 * FUSSNOTEN UNTEN AUF DER SEITE (01.10.2026, Blattoptionen „Fußnoten").
 *
 * Steht unten in der Inhaltsfläche – über der Fußzeile, durch eine kurze Linie vom Text getrennt –
 * und zeigt nur die Anmerkungen, deren Wort auf DIESER Seite steht. Den Platz hält der
 * Seitenumbruch frei (`noteUnits` in shared/render/paginate.ts); die Prüfung nach dem Setzen
 * (seitenUeberlauf.ts) misst bis zur Oberkante dieses Bereichs. Stehen Anmerkungen mehrerer
 * Materialien auf einer Seite, trägt jede Gruppe vorn die Materialnummer – jede Zählung beginnt
 * bei ¹. `messung`: im Fluss statt unten angeheftet, für die Höhenmessung in SheetPages.
 */
export function SeitenFussnoten({
  gruppen,
  messung
}: {
  gruppen: { block: TextBlock; anmerkungen: Anmerkung[] }[]
  messung?: boolean
}): React.JSX.Element | null {
  const ctx = useWs()
  const belegt = gruppen.filter((g) => g.anmerkungen.length > 0)
  if (!belegt.length) return null
  const mitNummer = !messung && belegt.length > 1
  return (
    <div
      className={`ws-fussnoten-seite ${messung ? 'ws-fussnoten-messung' : ''}`}
      data-fussnoten-seite={messung ? undefined : ''}
      data-fn-messung={messung ? '' : undefined}
    >
      {belegt.map((g) => (
        <div key={g.block.id} className="ws-fussnoten-gruppe" data-fn-gruppe={g.block.id}>
          {g.anmerkungen.map((a, i) => (
            <div key={`${a.art}-${a.index}`} className="ws-fussnote-zeile">
              {mitNummer && i === 0 && <span className="ws-fussnoten-material">{ctx.materialNumbers?.get(g.block.id) ?? stripMaterialNo(g.block.title)}</span>}
              <AnmerkungZeile block={g.block} a={a} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
