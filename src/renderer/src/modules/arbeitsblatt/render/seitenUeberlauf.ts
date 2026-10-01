/**
 * PRÜFUNG NACH DEM SETZEN: Ragt etwas über den Satzspiegel einer Seite hinaus?
 *
 * Befund der Lehrkraft (30.09.2026): „Auf einem Arbeitsblatt war z. B. die letzte Zeile einer
 * Tabelle nur halb sichtbar." Der Seitenumbruch rechnet mit gemessenen Höhen; wo die Rechnung
 * und die gesetzte Seite auseinanderlaufen (Tabellenstücke mit anderen Spaltenbreiten, Abstände
 * zwischen Einheiten, Rundung px/mm), schnitt die Inhaltsfläche das Überstehende einfach ab.
 *
 * Hier wird die FERTIG GESETZTE Seite nachgemessen: Jedes sichtbare Element der Inhaltsfläche
 * muss innerhalb ihrer Unterkante liegen. Was ein Vorfahr mit `overflow` ≠ visible selbst
 * beschneidet, zählt nur bis zu dessen Kante – sichtbar ist dort ohnehin nur der Vorfahr.
 * In SVG wird nicht hineingesehen (Pfade einer Formel sind kein eigener Inhalt), frei gezogene
 * Bausteine und Werkzeuge des Editors zählen nicht: Sie stehen bewusst außerhalb des Flusses.
 */

const AUSNAHMEN = '.ws-free, .editor-block-toolbar, .editor-ai-revise-slot, .ws-zeilen-griff, .ws-spalten-griff, [data-seitenrand-ignorieren]'

/**
 * Wie weit (px, Bildschirmmaß) der Inhalt unten über die Inhaltsfläche `flaeche` hinausragt; 0 = nichts.
 *
 * Fußnoten unten auf der Seite (01.10.2026): Steht ein Fußnotenbereich (`data-fussnoten-seite`)
 * unten in der Fläche, endet der Satzspiegel für den übrigen Inhalt an dessen Oberkante – was in
 * die Fußnoten hineinragt, zählt als Überlauf und wandert beim nächsten Umbruch weiter.
 */
export function ueberlaufUnten(flaeche: HTMLElement): number {
  const fussnoten = Array.from(flaeche.children).find((k) => k.hasAttribute('data-fussnoten-seite'))
  const unterkante = fussnoten ? fussnoten.getBoundingClientRect().top : flaeche.getBoundingClientRect().bottom
  let tiefste = unterkante
  const lauf = (el: Element, clipUnten: number): void => {
    for (const kind of Array.from(el.children)) {
      if (kind === fussnoten || kind.matches(AUSNAHMEN)) continue
      const st = getComputedStyle(kind)
      // Nicht nach `visibility` fragen: Der Messbereich der App ist als Ganzes unsichtbar
      if (st.display === 'none') continue
      const r = kind.getBoundingClientRect()
      if (r.width > 0.5 && r.height > 0.5) {
        const unten = Math.min(r.bottom, clipUnten)
        if (unten > tiefste && unten > r.top) tiefste = unten
      }
      if (kind instanceof SVGElement) continue
      const beschnitten = st.overflowY !== 'visible'
      lauf(kind, beschnitten ? Math.min(clipUnten, r.bottom) : clipUnten)
    }
  }
  lauf(flaeche, Infinity)
  return Math.max(0, tiefste - unterkante)
}
