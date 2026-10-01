import { RichText } from '../../../../shared/richtext/RichText'
import type { TaskBlock } from '../../model/types'
import { plainText } from '../../../../shared/richtext/parse'

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
export function briefAbschnitte({
  block,
  edit,
  set,
  wordLimit,
  ohneHilfen
}: {
  block: TaskBlock
  edit: boolean
  set: (apply: (draft: TaskBlock, value: string) => void) => ((v: string) => void) | undefined
  wordLimit?: boolean
  /** Klausur der Oberstufe (27.09.2026): keine Formhinweise, keine Notizentabelle – das wären Hilfen in einer Leistungssituation */
  ohneHilfen?: boolean
}): React.JSX.Element[] {
  const brief = block.brief
  if (!brief) return []
  const rahmen = brief.frameHidden ? '' : [brief.audience, brief.textType, brief.purpose].filter(Boolean).join(' · ')
  const notizen = ohneHilfen ? [] : (brief.notes ?? []).filter((s) => s.title || s.items.length || s.prompts.length)
  const form = ohneHilfen ? [] : (brief.form ?? []).filter(Boolean)
  const teile: React.JSX.Element[] = []

  /*
   * Alle Vorgaben sind GEBUNDEN (`data-bindet`, 01.10.2026): Sie gehören zur Aufgabenstellung und
   * stehen nie allein am Seitenende – nach ihnen folgt mindestens die erste Schreiblinie auf
   * derselben Seite, sonst wandert die Aufgabe als Ganzes (Wunsch der Lehrkraft).
   */
  /*
   * Die Situation steht seit dem 24.09.2026 VORN in der Arbeitsanweisung, nicht mehr hier.
   * Sonst staende sie zweimal auf dem Blatt – genau das war die Beschwerde.
   */
  /*
   * Die Rahmenzeile ist im Editor Feld für Feld bearbeitbar (Befund der Lehrkraft vom
   * 27.09.2026: sie ließ sich weder ändern noch entfernen). Ausblenden: Bausteineinstellungen.
   */
  if (rahmen)
    teile.push(
      <div className="ws-brief" data-unit data-bindet key="situation">
        <p className="ws-brief-frame">
          {edit
            ? (['audience', 'textType', 'purpose'] as const)
                .filter((k) => brief[k])
                .map((k, i) => (
                  <span key={k}>
                    {i > 0 && ' · '}
                    <RichText value={brief[k]} inline editable onChange={set((d, v) => (d.brief![k] = v))} />
                  </span>
                ))
            : rahmen}
        </p>
      </div>
    )

  /*
   * Die Notizentabelle ist EINE Einheit und wird nie zerschnitten: Ihre Spalten gehören
   * nebeneinander gelesen. Eine halbe Tabelle am Seitenende wäre schlimmer als ein
   * Seitenumbruch davor.
   */
  if (notizen.length > 0)
    teile.push(
      <div className="ws-brief-notes" data-unit data-bindet key="notes" style={{ gridTemplateColumns: `repeat(${Math.min(notizen.length, 3)}, 1fr)` }}>
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

  /*
   * Leere Inhaltspunkte gibt es nicht (Befund der Lehrkraft vom 27.09.2026): Wer den Text eines
   * Punktes löscht, löscht den Punkt – sonst blieb ein nackter Aufzählungspunkt stehen, den man
   * nicht mehr loswurde. Bereits leere Punkte älterer Blätter werden nicht dargestellt.
   */
  const punkte = brief.points.map((p, i) => ({ p, i })).filter(({ p }) => plainText(p).trim())
  if (punkte.length > 0)
    teile.push(
      <ul className="ws-brief-points" data-unit data-bindet key="points">
        {punkte.map(({ p, i }) => (
          <li key={i}>
            <RichText
              value={p}
              inline
              editable={edit}
              onChange={set((d, v) => {
                if (plainText(v).trim()) d.brief!.points[i] = v
                else d.brief!.points.splice(i, 1)
              })}
            />
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
      <p className="ws-brief-form" data-unit data-bindet key="form">
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
export function erwartungsAbschnitte({
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
    <div className="ws-expectation ws-expectation-title" data-unit data-bindet key="eh-titel">
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
export interface Abschnitt {
  node: React.JSX.Element
  teil?: number
  teilWeiter?: boolean
  /**
   * Einheiten, die auf dem Blatt in EINEM Rahmen stehen (Zeilen einer Zuordnung, Aussagen einer
   * Richtig/Falsch-Tabelle …, 01.10.2026). Jede Zeile ist eine eigene Umbruch-Einheit; erst beim
   * Rendern setzt `wrap` die Zeilen eines Stücks wieder in ihre Tabelle bzw. Liste – auf einer
   * Folgeseite mit wiederholter Kopfzeile.
   */
  gruppe?: { id: string; wrap: (teile: Abschnitt[]) => React.JSX.Element }
  /** Laufende Nummer innerhalb der Gruppe (z. B. Zeile der Ankreuz-Fragenreihe) */
  zeile?: number
}

/** Aufeinanderfolgende Abschnitte derselben Gruppe in ihren gemeinsamen Rahmen setzen (siehe `Abschnitt.gruppe`) */
export function gruppiereAntworten(abschnitte: Abschnitt[]): Abschnitt[] {
  const out: Abschnitt[] = []
  for (let i = 0; i < abschnitte.length; ) {
    const g = abschnitte[i].gruppe
    if (!g) {
      out.push(abschnitte[i++])
      continue
    }
    let j = i
    while (j < abschnitte.length && abschnitte[j].gruppe?.id === g.id) j++
    const lauf = abschnitte.slice(i, j)
    out.push({ node: g.wrap(lauf), teil: lauf[0].teil, teilWeiter: lauf[0].teilWeiter })
    i = j
  }
  return out
}

export function gruppiereTeilaufgaben(abschnitte: Abschnitt[]): { node: React.JSX.Element }[] {
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
