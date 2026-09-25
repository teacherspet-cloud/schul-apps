import { describe, expect, it } from 'vitest'
import { bloecke, fliesstext } from '../src/main/services/sources/fliesstext'

/*
 * Nachgemessen am 24.09.2026 mit echten Suchtreffern: Die Websuche fand ausgezeichnete
 * Quellen – bpb.de, Deutschlandfunk, tagesschau.de, goethe.de –, und die Qualitätsprüfung
 * verwarf JEDE einzelne mit „überwiegend Listenzeilen ohne Satzzeichen" bzw. „überwiegend
 * Seitenbeiwerk".
 *
 * Beides lag an der Aufbereitung, nicht an den Quellen: Das platte Entfernen der Tags machte
 * aus der ganzen Seite eine Zeile und ließ Navigation, Cookie-Hinweis und Impressum darin
 * stehen. Diese Tests halten fest, dass das jetzt anders ist.
 */
const ABSATZ_1 =
  'Der Wohnungsmarkt in den Großstädten hat sich in den vergangenen Jahren deutlich verändert, und die Mieten sind in vielen Lagen schneller gestiegen als die Einkommen der Menschen, die dort wohnen und arbeiten wollen.'
const ABSATZ_2 =
  'Fachleute nennen dafür mehrere Gründe, die sich gegenseitig verstärken, und sie verweisen darauf, dass der Neubau die Nachfrage seit Jahren nicht mehr deckt, obwohl in vielen Städten neue Viertel geplant werden.'

const SEITE = `<!doctype html>
<html lang="de"><head><title>Wohnungsmangel</title>
<script>var x = 1;</script><style>.a{color:red}</style></head>
<body>
<nav><a href="/">Startseite</a> <a href="/politik">Politik</a> <a href="/wirtschaft">Wirtschaft</a> <a href="/sport">Sport</a></nav>
<header><a href="/">Zur Startseite</a></header>
<article>
  <h1>Warum Wohnen teurer wird</h1>
  <p>${ABSATZ_1}</p>
  <p>${ABSATZ_2}</p>
  <ul><li><a href="/a">Mehr zum Thema</a></li><li><a href="/b">Auch interessant</a></li></ul>
</article>
<aside><a href="/c">Meistgelesen</a> <a href="/d">Newsletter</a></aside>
<footer>Impressum Datenschutz Nutzungsbedingungen Alle Rechte vorbehalten</footer>
</body></html>`

describe('Fließtext aus einer Internetseite', () => {
  const text = fliesstext(SEITE)

  it('behält den Artikeltext', () => {
    expect(text).toContain('Der Wohnungsmarkt in den Großstädten')
    expect(text).toContain('Fachleute nennen dafür mehrere Gründe')
  })

  it('wirft Navigation und Fußzeile heraus', () => {
    /*
     * jusText (corpus.tools): Ein Block mit hoher Linkdichte oder niedriger Stoppwortdichte
     * ist fast immer Beiwerk. Ohne diese Reinigung schlug die Prüfung „überwiegend
     * Seitenbeiwerk" bei jedem Nachrichtenartikel an.
     */
    expect(text).not.toContain('Startseite')
    expect(text).not.toContain('Impressum')
    expect(text).not.toContain('Meistgelesen')
  })

  it('wirft Skripte und Formatangaben heraus', () => {
    expect(text).not.toContain('var x')
    expect(text).not.toContain('color:red')
  })

  it('erhält die Absätze', () => {
    /*
     * Ohne Absätze ist der Quellentext auf dem Arbeitsblatt eine Bleiwüste – und die
     * Kürzungsregel „streiche ganze Absätze" hätte nichts, woran sie sich halten könnte.
     */
    const absaetze = text.split(/\n{2,}/).filter(Boolean)
    expect(absaetze.length).toBeGreaterThanOrEqual(2)
  })

  it('macht aus der Seite nicht eine einzige Zeile', () => {
    // Genau daran scheiterte vorher die Prüfung „enden die Zeilen auf einem Satzzeichen?"
    expect(text.includes('\n')).toBe(true)
  })

  it('löst Umlaut- und Anführungszeichen-Entities auf', () => {
    const roh =
      '<html><body><p>Er nannte es einen &bdquo;Aufbruch&ldquo; &ndash; und meinte das ernst. Die Stadt h&auml;tte davon profitiert, sagen viele.</p></body></html>'
    const t = fliesstext(roh)
    expect(t).toContain('„Aufbruch“')
    expect(t).toContain('hätte')
  })
})

describe('Einstufung der Blöcke', () => {
  it('erkennt eine Linkleiste an der Linkdichte', () => {
    const liste = bloecke(SEITE)
    const leiste = liste.find((b) => b.text.includes('Mehr zum Thema'))
    expect(leiste?.linkdichte).toBeGreaterThan(0.2)
  })

  it('erkennt Fließtext an der Stoppwortdichte', () => {
    const liste = bloecke(SEITE)
    const absatz = liste.find((b) => b.text.startsWith('Der Wohnungsmarkt'))
    expect(absatz?.stoppdichte).toBeGreaterThan(0.32)
    expect(absatz?.einstufung).toBe('gut')
  })

  it('gibt nichts zurück, wenn die Seite nur Navigation enthält', () => {
    /*
     * Eine Übersichtsseite ist kein Unterrichtsmaterial. Dass hier nichts herauskommt, ist
     * eine Antwort und kein Fehler – die Suche nimmt dann den nächsten Treffer.
     */
    const nurNavigation = '<html><body><nav><a href="/a">Eins</a><a href="/b">Zwei</a></nav><ul><li><a href="/c">Drei</a></li></ul></body></html>'
    expect(fliesstext(nurNavigation).length).toBeLessThan(40)
  })
})

describe('Zwischenüberschriften des Originals', () => {
  /*
   * Gemeldet von der Lehrkraft (24.09.2026) zu einem Artikel von nachtkritik.de: „In Zeile 35
   * ist außerdem aus irgendeinem Grund ein abgebrochener Satz ‚Der Körper verhärtet'."
   *
   * Es war kein abgebrochener Satz, sondern eine ZWISCHENÜBERSCHRIFT – der Artikel hatte
   * drei davon („Helft dem Tyrannen!", „Inkompetente Mörderinnen", „Der Körper verhärtet").
   * Die Extraktion gab sie als gewöhnlichen Absatz aus, und auf dem Arbeitsblatt stand damit
   * mitten im Text ein Satz ohne Verb. Wer das liest, hält den Originaltext für fehlerhaft.
   */
  const ARTIKEL = `<html><body><article>
    <h1>Der braucht einen Arzt!</h1>
    <p>${ABSATZ_1}</p>
    <h2>Der Körper verhärtet</h2>
    <p>${ABSATZ_2}</p>
  </article></body></html>`

  const text = fliesstext(ARTIKEL)

  it('behält die Zwischenüberschrift', () => {
    expect(text).toContain('Der Körper verhärtet')
  })

  it('setzt sie fett, damit sie nicht wie ein abgebrochener Satz aussieht', () => {
    expect(text).toContain('**Der Körper verhärtet**')
  })

  it('macht aus ihr einen eigenen Absatz', () => {
    const absaetze = text.split(/\n{2,}/)
    expect(absaetze.some((a) => a.trim() === '**Der Körper verhärtet**')).toBe(true)
  })

  it('wirft sie nicht wegen zu weniger Stoppwörter heraus', () => {
    /*
     * Überschriften enthalten kaum Stoppwörter. Ohne Ausnahme würden sie als Beiwerk
     * verworfen – obwohl sie den Text gliedern.
     */
    const kopf = bloecke(ARTIKEL).find((b) => b.text === 'Der Körper verhärtet')
    expect(kopf?.ueberschrift).toBe(true)
    expect(kopf?.einstufung).not.toBe('schlecht')
  })

  it('lässt den Wortlaut unangetastet', () => {
    // Die Sternchen sind Formatierung, keine Änderung am Text – die Prüfung vergleicht Wörter
    expect(text.replace(/\*\*/g, '')).toContain('Der Körper verhärtet')
  })
})
