import { RichText } from '../../../../shared/richtext/RichText'
import type { Answer, TaskBlock, TaskPart } from '../../model/types'
import { AnswerView, DiagramView, McOptions, Spalten, TabellenGriffe, antwortRaum, diagramWidthMm, teilbareAntwort } from '../Answers'
import { eigeneBreiten, zugUebernehmen } from '../tabelleMasse'
import type { ZugErgebnis } from '../tabelleZiehen'
import { PictogramIcon } from '../Pictogram'
import { pictogramForInstruction, pictogramForSocialForm } from '../pictograms'
import { SOCIAL_FORM_LABELS, SOCIAL_FORM_SVG } from '../icons'
import type { PlacedItem } from '../paginate'
import { plainText } from '../../../../shared/richtext/parse'
import { isEditMode, isKeyMode, useWs } from '../WsContext'
import { VIEWING_PHASES } from '../../didactics/videoTasks'
import { taskItems } from '../../model/items'
import { exampleNote } from '../../../../shared/exampleNote'
import { continuedNote } from '../../../../shared/continuedNote'
import { bereinigeSkizze } from '../../generation/solution'
import { istAnkreuzAufgabe, istMcListe, mcSpalten, mcZeilen, ohneOperator } from '../mcGrid'
import { linieGebunden, stars, useSetter } from './hilfen'
import { stufenZeile } from '../../../../shared/verstehen/anzeige'
import { fundstellen, hoertextZu, hoerzeit } from '../../../../shared/verstehen/hoerzeit'
import { briefAbschnitte, erwartungsAbschnitte, Abschnitt, gruppiereAntworten, gruppiereTeilaufgaben } from './brief'

export function TaskView({ block, placed }: { block: TaskBlock; placed?: PlacedItem }): React.JSX.Element {
  const ctx = useWs()
  const {
    mode,
    update,
    taskNumbers,
    showStars,
    taskStyle,
    phaseStarts,
    showTimecodes,
    answerLanguage,
    wordLimit,
    ohneSchreibhilfen,
    ohneLernhilfen,
    correctionMargin,
    contentWidthMm,
    blattBausteine
  } = ctx
  const edit = mode === 'edit'
  // Texte auch in der Lösungsansicht bearbeitbar (30.09.2026) – Anzeige und Platzhalter folgen weiter `edit`
  const schreiben = isEditMode(mode)
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
   * LEERE LÖSUNG (01.10.2026). In der Lösungsansicht des Editors steht für eine noch leere Lösung
   * ein Platzhalter zum Hineinschreiben, im Druck nichts. Bis dahin war der Platzhalter eine
   * EIGENE Umbruch-Einheit, die es im Druck nicht gab: Die Einheiten der Ansicht passten nicht
   * mehr zu denen der Messung (Stücke zeigten Einheiten doppelt oder gar nicht), und die Zeile
   * „Lösung" ragte unten über den Rand (Seitenrand-Wache, Fragenreihen mit leeren Lösungen).
   * Jetzt gibt es die Einheit in beiden Fassungen – ohne Höhe; der Platzhalter liegt rechts über
   * der Zeile davor und nimmt keinen Platz ein.
   */
  const loesungsKnoten = (wert: string | undefined, onChange: ((v: string) => void) | undefined, platzhalter: string, k: string, einheit: boolean, label?: string): React.JSX.Element | null => {
    const u = einheit ? { 'data-unit': '' } : {}
    if (String(wert ?? '').trim())
      return (
        <div className="ws-solution" key={k} {...u}>
          {label && <b>{label} </b>}
          <RichText value={wert ?? ''} editable={keyEdit} onChange={onChange} placeholder={platzhalter} />
        </div>
      )
    if (!keyEdit && !einheit) return null
    return (
      <div className="ws-solution ws-solution-leer" key={k} {...u}>
        {keyEdit && <RichText value="" editable onChange={onChange} placeholder={platzhalter} />}
      </div>
    )
  }

  /*
   * Gelöstes Beispiel als Punkt „0" – vor den echten Items und optisch zurückgenommen.
   * Es ist keine Aufgabe, sondern zeigt, WIE geantwortet wird (ÖSZ 2024; Goethe- und
   * Cambridge-Modellsätze). Deshalb steht die Lösung hier auch auf dem Schülerblatt.
   */
  const beispielKnoten = block.example ? (
    // Gebunden: Das gelöste Beispiel leitet die Fragen ein und steht nie allein am Seitenende
    <div className="ws-example" data-unit data-bindet key="example">
      <div className="ws-mc-question">
        <span className="ws-mc-num">0.</span>
        <RichText value={block.example.instruction} editable={schreiben} onChange={set((d, v) => ((d as TaskBlock).example!.instruction = v))} />
      </div>
      {block.example.answer.kind === 'multipleChoice' ? (
        <McOptions answer={block.example.answer} showSolution />
      ) : (
        <div className="ws-example-solution">
          <RichText value={block.example.solution} editable={schreiben} onChange={set((d, v) => ((d as TaskBlock).example!.solution = v))} />
        </div>
      )}
    </div>
  ) : (
    <></>
  )

  /*
   * Fragenreihe zum Ankreuzen: rahmenlose Tabelle, spaltenweise gefüllt.
   * Die Begründung für Aufteilung und fehlenden Rahmen steht in `render/mcGrid.ts`.
   *
   * Jede ZEILE ist eine Umbruch-Einheit (01.10.2026) – vorher war das ganze Gitter eine, und
   * eine lange Fragenreihe schob die Aufgabe vollständig auf die nächste Seite. Damit die
   * Spalten auch geteilt von oben nach unten gelesen werden, ordnet jedes Stück SEINE Fragen
   * neu spaltenweise an: Ein Stück mit den Zeilen [a, b) enthält die Fragen [a·S, b·S) – auf
   * Seite 1 stehen 1–6, auf Seite 2 7–10, nie 1 neben 7. Ungeteilt ist es das bisherige Gitter.
   * Eine Frage bleibt mit ihren Antwortmöglichkeiten immer zusammen (sie steht in EINER Zelle).
   */
  const mcAlle = block.parts.map((part, i) => ({ part, i }))
  const mcS = mcSpalten(block.parts)
  /*
   * Ziehbare Maße der Fragenreihe (02.10.2026): Spaltenbreiten und Zeilenhöhen von Hand, gespeichert
   * in `mcGitter` – ein Rückgängig-Schritt je Geste. Ohne Maße gleich breite Spalten wie bisher.
   */
  const mcBreiten = eigeneBreiten(block.mcGitter, mcS)
  const mcZiehbar = schreiben && Boolean(update)
  const mcZug = (z: ZugErgebnis): void =>
    update?.(block.id, (d) => {
      const t = d as TaskBlock
      const m = { ...t.mcGitter }
      zugUebernehmen(m, z, Math.ceil(t.parts.length / mcS))
      t.mcGitter = m
    })
  const mcGruppe: Abschnitt['gruppe'] = {
    id: 'mc',
    wrap: (teile) => {
      const a = teile[0].zeile ?? 0
      const b = (teile[teile.length - 1].zeile ?? 0) + 1
      return (
        <table className={`ws-mc-grid ${mcZiehbar ? 'ws-table-ziehbar' : ''}`} key={`mc-${a}`}>
          <Spalten n={mcS} breiten={mcBreiten} />
          <tbody>
            {mcZeilen(mcAlle.slice(a * mcS, Math.min(mcAlle.length, b * mcS)), mcS).map((zeile, z) => (
              <tr key={a + z} data-unit style={block.mcGitter?.rowHeightsMm?.[a + z] ? { height: `${block.mcGitter.rowHeightsMm[a + z]}mm` } : undefined}>
                {zeile.map((eintrag, sp) => (
                  <td key={sp}>
                    {mcZiehbar && <TabellenGriffe c={sp} spalten={mcS} zeile={a + z} breiten={mcBreiten} onZug={mcZug} />}
                    {eintrag && (
                      <>
                        <div className="ws-mc-question">
                          <span className="ws-mc-num">{eintrag.i + 1}.</span>
                          <RichText
                            value={ohneOperator(eintrag.part.instruction, block.operator)}
                            editable={schreiben}
                            onChange={set((d, v) => ((d as TaskBlock).parts[eintrag.i].instruction = v))}
                          />
                        </div>
                        <McOptions answer={eintrag.part.answer} onChange={onAnswer((d) => d.parts[eintrag.i].answer)} />
                        {key && loesungsKnoten(eintrag.part.solution, set((d, v) => ((d as TaskBlock).parts[eintrag.i].solution = v)), 'Lösung', 'loesung', false)}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
  }
  const mcZeilenAbschnitte = (): Abschnitt[] =>
    Array.from({ length: Math.ceil(mcAlle.length / mcS) }, (_, z) => ({ node: <></>, gruppe: mcGruppe, zeile: z }))

  /*
   * TEILBARE ANTWORTFORMEN (Zuordnung, Richtig/Falsch, Reihenfolge, Beschriftung,
   * Ausfülltabelle, Lückentext mit mehreren Absätzen bzw. Punkten): je Zeile eine Einheit, der
   * Rahmen (Tabelle samt Kopfzeile, Liste) entsteht je Stück – siehe `teilbareAntwort`.
   */
  const antwortZeilen = (answer: Answer, onChange: ((fn: (a: Answer) => void) => void) | undefined, id: string, teil?: number): Abschnitt[] | null => {
    const t = teilbareAntwort(answer, {
      key,
      editText: edit && Boolean(onChange),
      editKey: keyEdit && Boolean(onChange),
      editRoh: schreiben,
      answerLanguage: answerLanguage ?? 'de',
      onChange,
      // Schreibraum der Ausfülltabellen nach Jahrgang (02.10.2026, didactics/schreibraum.ts)
      raum: antwortRaum(ctx)
    })
    if (!t || t.einheiten.length < 2) return null
    const gruppe: Abschnitt['gruppe'] = {
      id,
      wrap: (teile) => (
        // Dieselbe Hülle wie die ungeteilte Antwort (`<div><AnswerView/></div>`), in Teilaufgaben mit dem Einzug der Anweisung
        <div className={teil !== undefined ? 'ws-part-antwort' : undefined} key={`${id}-${teile[0].zeile ?? 0}`}>
          {t.rahmen(teile.map((x) => x.node))}
        </div>
      )
    }
    return t.einheiten.map((node, z) => ({ node, gruppe, zeile: z, ...(teil !== undefined ? { teil, teilWeiter: true } : {}) }))
  }

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

  /*
   * MINDESTENS ZWEI LINIEN je Stück (Entscheidung der Lehrkraft, 01.10.2026): Eine einzelne Linie
   * oben auf der Folgeseite unter „Aufgabe 3 (Fortsetzung)" – oder allein unten – wirkt verloren.
   * Die erste Linie ist deshalb an die zweite gebunden und die vorletzte an die letzte
   * (`data-bindet`); passt das nicht, wandert der Rest mit.
   */
  const linienAbschnitte = (count: number): React.JSX.Element[] =>
    Array.from({ length: Math.ceil(count / LINIEN_PRO_EINHEIT) }, (_, k) => (
      <div
        className={`ws-lines ${correctionMargin ? 'ws-lines-rand' : ''}`}
        data-unit
        {...(linieGebunden(k, Math.ceil(count / LINIEN_PRO_EINHEIT)) ? { 'data-bindet': '' } : {})}
        key={`lines-${k}`}
      >
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

  /** Hat die Aufgabe bzw. Teilaufgabe eine Musterlösung in Schülerform? */
  const hatMuster = (p: { modelAnswer?: string; modelSketch?: string }): boolean => Boolean(p.modelAnswer?.trim() || bereinigeSkizze(p.modelSketch))

  /*
   * MUSTERLÖSUNG in Schülerform – nur in der Lösungsansicht (26.09.2026).
   *
   * Wunsch der Lehrkraft: Die Lösung soll „in den Rechenkästchen erfolgen oder die
   * Rechenkästchen im Lösungen-Bildschirm so ersetzen, dass es aussieht, wie es bei den
   * Schülern aussehen müsste". Deshalb bleibt der Antwortbereich in seiner Form stehen –
   * Kästchenraster oder Rahmen der freien Fläche – und trägt den Lösungstext (rot, wie alle
   * Lösungen) und, wo die Aufgabe zeichnen lässt, die Skizze. Bei Schreiblinien steht der
   * Text an ihrer Stelle, je Absatz eine Einheit, damit er über Seiten laufen kann.
   *
   * `schreiben` legt die Änderung am Baustein ab; bei Absätzen wird nur der bearbeitete
   * Absatz ersetzt, die übrigen bleiben – sonst schriebe ein Absatz den ganzen Text.
   */
  const musterKnoten = (
    answer: Answer,
    text: string | undefined,
    skizze: string | undefined,
    k: string,
    schreiben: (d: TaskBlock, v: string) => void
  ): React.JSX.Element[] => {
    const svg = bereinigeSkizze(skizze)
    const txt = (text ?? '').trim()
    if (!txt && !svg) return []
    const skizzeKnoten = svg ? <div className="ws-muster-skizze" dangerouslySetInnerHTML={{ __html: svg }} /> : null
    if (answer.kind === 'diagram') {
      // Zeichenfläche bleibt stehen, die Skizze liegt deckungsgleich darauf, der Text darunter
      return [
        <div className="ws-diagram-muster" data-unit key={`${k}-muster`}>
          <DiagramView spec={answer.diagram} widthMm={diagramWidthMm(contentWidthMm)} sketch={svg || undefined} />
          {txt && (
            <RichText
              className="ws-muster-text"
              value={txt}
              editable={keyEdit}
              onChange={set((d, v) => schreiben(d as TaskBlock, v))}
              placeholder="Musterlösung"
            />
          )}
        </div>
      ]
    }
    if (answer.kind === 'grid' || answer.kind === 'space') {
      const klasse = answer.kind === 'grid' ? 'ws-grid ws-grid-muster' : 'ws-space ws-space-muster'
      const hoehe = answer.kind === 'grid' ? `${Math.max(1, answer.count) * 5}mm` : `${Math.max(5, answer.heightMm)}mm`
      return [
        <div className={klasse} style={{ minHeight: hoehe }} data-unit key={`${k}-muster`}>
          {skizzeKnoten}
          {txt && (
            <RichText
              className="ws-muster-text"
              value={txt}
              editable={keyEdit}
              onChange={set((d, v) => schreiben(d as TaskBlock, v))}
              placeholder="Musterlösung"
            />
          )}
        </div>
      ]
    }
    const absaetze = txt
      .split(/\n{2,}/)
      .map((a) => a.trim())
      .filter(Boolean)
    return absaetze.map((absatz, i) => (
      <div className="ws-model-text" data-unit key={`${k}-muster-${i}`}>
        <RichText
          value={absatz}
          editable={keyEdit}
          onChange={set((d, v) => {
            const neu = [...absaetze]
            neu[i] = v
            schreiben(d as TaskBlock, neu.join('\n\n'))
          })}
        />
      </div>
    ))
  }

  /**
   * Eine Teilaufgabe – in Stücke zerlegt, an denen über Seiten getrennt werden darf.
   *
   * Vorher war die ganze Teilaufgabe EINE Einheit: Anweisung und alle Schreiblinien zusammen.
   * Passte sie unten nicht mehr hin, wanderte sie vollständig auf die nächste Seite – auf
   * Seite 1 blieben dadurch bis zu 95 mm leer (gemeldet am 24.09.2026). Jetzt kann der
   * Linienteil weiterlaufen; der Listenpunkt wird beim Rendern wieder zusammengesetzt.
   */
  const teilaufgabe = (part: TaskPart, i: number): Abschnitt[] => {
    // Teilbare Antwortform: ihre Zeilen folgen dem Kopf als eigene Einheiten (in der Lösungsansicht mit Musterlösung statt Fläche wie bisher)
    const zeilen = antwortZeilen(part.answer, onAnswer((d) => d.parts[i].answer), `teil-${part.id}`, i)
    const schluss = key ? loesungsKnoten(part.solution, set((d, v) => ((d as TaskBlock).parts[i].solution = v)), 'Lösung', `${part.id}-loesung`, true) : null
    // Schreiblinien werden ohnehin zerlegt; alle anderen Antwortformen ohne Zeilen bleiben im Kopf
    const linien = part.answer.kind === 'lines' && !key ? linienAbschnitte(part.answer.count).map((n) => ({ node: n, teil: i, teilWeiter: true })) : []
    const muster = key
      ? musterKnoten(part.answer, part.modelAnswer, part.modelSketch, part.id, (d, v) => (d.parts[i].modelAnswer = v)).map((n) => ({
          node: n,
          teil: i,
          teilWeiter: true
        }))
      : []
    const folgt = [...(zeilen ?? []), ...linien, ...muster, ...(schluss ? [{ node: schluss, teil: i, teilWeiter: true }] : [])]
    /*
     * Der Kopf („b) Ergänze …") ist GEBUNDEN, wenn noch etwas zur Teilaufgabe folgt
     * (01.10.2026): Er stünde sonst allein unten auf der Seite und seine Zeilen oben auf der
     * nächsten – genau das, was die Lehrkraft ausgeschlossen hat.
     */
    const kopf = (
      <div className="ws-part-kopf" data-unit {...(folgt.length ? { 'data-bindet': '' } : {})} key={`${part.id}-kopf`}>
        {/*
          Der Buchstabe steht IM gemessenen Kasten, nicht als Listenzeichen davor.
          Ein `::marker` erzeugt eine eigene Zeilenbox, deren Höhe beim Umbruch niemand
          mitzählt – auf Seite 2 lief der Inhalt dadurch über den Rand hinaus.
        */}
        <span className="ws-part-letter">{String.fromCharCode(97 + i)})</span>
        <RichText value={part.instruction} editable={schreiben} onChange={set((d, v) => ((d as TaskBlock).parts[i].instruction = v))} />
        {/* In der Lösungsansicht tritt die Musterlösung an die Stelle von Kästchen und Fläche */}
        {!zeilen &&
          part.answer.kind !== 'lines' &&
          !(key && hatMuster(part) && (part.answer.kind === 'grid' || part.answer.kind === 'space' || part.answer.kind === 'diagram')) && (
            <AnswerView answer={part.answer} onChange={onAnswer((d) => d.parts[i].answer)} />
          )}
      </div>
    )
    return [{ node: kopf, teil: i }, ...folgt]
  }

  /*
   * Die Abschnitte in der Reihenfolge, in der sie auf dem Blatt stehen. `teil` merkt sich,
   * welche davon Teilaufgaben sind: Sie müssen beim Rendern wieder in EINE nummerierte Liste
   * zusammengefasst werden, sonst begänne die Zählung auf jeder Seite neu bei a).
   */
  // Der Mustertext steht oben auf den Linien – dann nicht noch einmal am Ende
  const mustertextGezeigt = Boolean(key && block.answer.kind === 'lines' && !block.parts.length && block.brief?.model)
  const hauptZeilen = block.parts.length ? null : antwortZeilen(block.answer, onAnswer((d) => d.answer), 'antwort')
  const abschnitte: Abschnitt[] = []
  for (const teil of briefAbschnitte({ block, edit, set, wordLimit, ohneHilfen: ohneSchreibhilfen, ohneLernhilfen })) abschnitte.push({ node: teil })
  if (block.example) abschnitte.push({ node: beispielKnoten })
  if (mcListe) abschnitte.push(...mcZeilenAbschnitte())
  else if (block.parts.length > 0) block.parts.forEach((part, i) => abschnitte.push(...teilaufgabe(part, i)))
  /*
   * Lösungsansicht: Wo die Lernenden schreiben, steht der Mustertext – und wo es keinen
   * gibt, bleibt die Fläche leer statt mit Linien gefüllt. Linien sind für die Lernenden da.
   */
  else if (key && block.answer.kind === 'lines') {
    if (mustertextGezeigt) for (const n of mustertextAbschnitte(block.brief!.model!)) abschnitte.push({ node: n })
    else
      for (const n of musterKnoten(block.answer, block.modelAnswer, block.modelSketch, 'aufgabe', (d, v) => (d.modelAnswer = v))) abschnitte.push({ node: n })
  } else if (key && (block.answer.kind === 'grid' || block.answer.kind === 'space' || block.answer.kind === 'diagram') && hatMuster(block)) {
    // Kästchen bzw. Fläche bleiben stehen und tragen die Musterlösung
    for (const n of musterKnoten(block.answer, block.modelAnswer, block.modelSketch, 'aufgabe', (d, v) => (d.modelAnswer = v))) abschnitte.push({ node: n })
  } else if (block.answer.kind === 'lines' && block.answer.count > LINIEN_PRO_EINHEIT)
    for (const n of linienAbschnitte(block.answer.count)) abschnitte.push({ node: n })
  else if (hauptZeilen) abschnitte.push(...hauptZeilen)
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
    abschnitte.push({ node: loesungsKnoten(block.solution, set((d, v) => ((d as TaskBlock).solution = v)), 'Lösung / Erwartungshorizont', 'loesung', true, 'Lösung:')! })
    if (block.brief) {
      for (const n of erwartungsAbschnitte({ block, edit: keyEdit, set, mitMustertext: !mustertextGezeigt, ohneLernhilfen })) abschnitte.push({ node: n })
    }
    // Schwierigkeitsstufe (29.09.2026): nur hier im Lösungsteil, nie auf dem Schülerblatt
    const stufe = stufenZeile(block)
    // Hörverstehen (01.10.2026): wo im Hörtext die Antworten stehen – „a) ab 0:45" aus der Aufnahme, sonst geschätzt
    const hoertext = blattBausteine ? hoertextZu(block, blattBausteine) : undefined
    const fund = hoertext ? fundstellen(block, hoertext, hoerzeit(hoertext)) : []
    if (block.afb || block.operator || taskItems(block) > 1 || stufe || fund.length) {
      const angaben = [
        block.afb ? `AFB ${block.afb}` : '',
        stufe,
        fund.length ? `Hörtext: ${fund.join(' · ')}` : '',
        block.operator ? `Operator: ${block.operator}` : '',
        /* Zahl der einzeln bewerteten Einheiten – sonst muss die Lehrkraft beim
           Korrigieren nachzählen, ob die Punkte zur Aufgabe passen. Erst ab zwei:
           Bei einer offenen Aufgabe wäre „1 Item" nur Rauschen. */
        taskItems(block) > 1 ? `${taskItems(block)} Items` : '',
        block.points ? `${block.points} Punkte` : '',
        block.minutes ? `ca. ${block.minutes} Min.` : ''
      ]
        .filter(Boolean)
        .join(' · ')
      abschnitte.push({
        node: (
          <div className="ws-teacher-note" data-unit key="hinweis">
            {angaben}
            {/* Die Begründung des Anforderungsbereichs ist Text der Lehrkraft – bearbeitbar (30.09.2026) */}
            {block.afbReason && (
              <>
                {angaben ? ' · ' : ''}
                <RichText value={block.afbReason} inline editable={keyEdit} onChange={set((d, v) => ((d as TaskBlock).afbReason = v))} />
              </>
            )}
          </div>
        )
      })
    }
  }

  const von = placed?.from ?? 0
  const bis = placed?.to ?? abschnitte.length
  const zeigtKopf = von === 0
  // Erst die Zeilen eines Stücks in ihre Tabelle/Liste, dann die Teilaufgaben in ihre Liste
  const sichtbar = gruppiereTeilaufgaben(gruppiereAntworten(abschnitte.slice(von, bis)))

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
                <RichText value={block.brief.situation} inline editable={schreiben} onChange={set((d, v) => ((d as TaskBlock).brief!.situation = v))} />{' '}
              </span>
            )}
            <RichText
              value={block.instruction}
              editable={schreiben}
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
