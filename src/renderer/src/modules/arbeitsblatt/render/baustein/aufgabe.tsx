import { RichText } from '../../../../shared/richtext/RichText'
import type { Answer, TaskBlock, TaskPart } from '../../model/types'
import { AnswerView, DiagramView, McOptions, diagramWidthMm } from '../Answers'
import { PictogramIcon } from '../Pictogram'
import { pictogramForInstruction, pictogramForSocialForm } from '../pictograms'
import { SOCIAL_FORM_LABELS, SOCIAL_FORM_SVG } from '../icons'
import type { PlacedItem } from '../paginate'
import { plainText } from '../../../../shared/richtext/parse'
import { isKeyMode, useWs } from '../WsContext'
import { VIEWING_PHASES } from '../../didactics/videoTasks'
import { taskItems } from '../../model/items'
import { exampleNote } from '../../../../shared/exampleNote'
import { continuedNote } from '../../../../shared/continuedNote'
import { bereinigeSkizze } from '../../generation/solution'
import { istAnkreuzAufgabe, istMcListe, mcSpalten, mcZeilen, ohneOperator } from '../mcGrid'
import { stars, useSetter } from './hilfen'
import { stufenZeile } from '../../../../shared/verstehen/anzeige'
import { briefAbschnitte, erwartungsAbschnitte, Abschnitt, gruppiereTeilaufgaben } from './brief'

export function TaskView({ block, placed }: { block: TaskBlock; placed?: PlacedItem }): React.JSX.Element {
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
    correctionMargin,
    contentWidthMm
  } = useWs()
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
    const kopf = (
      <div className="ws-part-kopf" data-unit key={`${part.id}-kopf`}>
        {/*
          Der Buchstabe steht IM gemessenen Kasten, nicht als Listenzeichen davor.
          Ein `::marker` erzeugt eine eigene Zeilenbox, deren Höhe beim Umbruch niemand
          mitzählt – auf Seite 2 lief der Inhalt dadurch über den Rand hinaus.
        */}
        <span className="ws-part-letter">{String.fromCharCode(97 + i)})</span>
        <RichText value={part.instruction} editable={edit} onChange={set((d, v) => ((d as TaskBlock).parts[i].instruction = v))} />
        {/* In der Lösungsansicht tritt die Musterlösung an die Stelle von Kästchen und Fläche */}
        {part.answer.kind !== 'lines' &&
          !(key && hatMuster(part) && (part.answer.kind === 'grid' || part.answer.kind === 'space' || part.answer.kind === 'diagram')) && (
            <AnswerView answer={part.answer} onChange={onAnswer((d) => d.parts[i].answer)} />
          )}
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
    const muster = key
      ? musterKnoten(part.answer, part.modelAnswer, part.modelSketch, part.id, (d, v) => (d.parts[i].modelAnswer = v)).map((n) => ({
          node: n,
          teil: i,
          teilWeiter: true
        }))
      : []
    return [{ node: kopf, teil: i }, ...linien, ...muster, ...(schluss ? [{ node: schluss, teil: i, teilWeiter: true }] : [])]
  }

  /*
   * Die Abschnitte in der Reihenfolge, in der sie auf dem Blatt stehen. `teil` merkt sich,
   * welche davon Teilaufgaben sind: Sie müssen beim Rendern wieder in EINE nummerierte Liste
   * zusammengefasst werden, sonst begänne die Zählung auf jeder Seite neu bei a).
   */
  // Der Mustertext steht oben auf den Linien – dann nicht noch einmal am Ende
  const mustertextGezeigt = Boolean(key && block.answer.kind === 'lines' && !block.parts.length && block.brief?.model)
  const abschnitte: Abschnitt[] = []
  for (const teil of briefAbschnitte({ block, edit, set, wordLimit, ohneHilfen: ohneSchreibhilfen })) abschnitte.push({ node: teil })
  if (block.example) abschnitte.push({ node: beispielKnoten })
  if (mcListe) abschnitte.push({ node: mcGitter })
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
    // Schwierigkeitsstufe (29.09.2026): nur hier im Lösungsteil, nie auf dem Schülerblatt
    const stufe = stufenZeile(block)
    if (block.afb || block.operator || taskItems(block) > 1 || stufe) {
      abschnitte.push({
        node: (
          <div className="ws-teacher-note" data-unit key="hinweis">
            {[
              block.afb ? `AFB ${block.afb}` : '',
              stufe,
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
