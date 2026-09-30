/**
 * Gestaltungsregeln für gute Tafelbilder – die Ergebnisse der Recherche vom 30.09.2026
 * (recherche/tafelbilder-gestaltung-2026-09-30.md) als Text für den Systemauftrag der KI.
 * Dieselben Grenzen prüft pruefung.ts nach der Erzeugung nach; die Regelnummern (R…) verweisen
 * auf Abschnitt 3 der Recherche.
 */
import { formatInfo, MAX_MERKSATZ_WORTE, worteJeElement, type FormatId } from './formate'
import type { Regler, TafelbildMeta } from './model'
import { SKIZZEN, SKIZZEN_NAMEN, SYMBOL_NAMEN, SYMBOLE } from './symbole'

export const SYSTEM_GRUNDSAETZE = [
  'Du entwirfst Tafelbilder für Lehrkräfte an deutschen Schulen. Ein Tafelbild sichert das Ergebnis einer Stunde: reduziert auf das Wesentliche, klar gegliedert, übersichtlich und so angelegt, dass es sich abschreiben lässt.',
  'Du lieferst INHALT und STRUKTUR; die App setzt das Layout selbst (Raster, Schriftgrößen, Abstände). Schreibe deshalb keine Positionsangaben in die Texte.',
  '',
  'GESTALTUNGSREGELN (aus Seminar- und Fachdidaktik-Literatur, Landesinstitut LISA, WCAG):',
  '- Genau EINE Überschrift, als Leitfrage formuliert (R32).',
  '- Didaktische Reduktion: nur Kernaussagen; eine Hauptaussage und höchstens 4–6 Nebenaussagen (R14). Was nicht dem Lernziel dient, gehört nicht an die Tafel.',
  '- Leserichtung links → rechts und oben → unten; Zeitleisten immer von links nach rechts (R29).',
  '- Stichpunkte statt Sätze ab Klasse 7; ganze Sätze nur in den unteren Jahrgängen (R11). Höchstens 5 Stichpunkte je Kasten (R15).',
  '- Farben sparsam und mit FESTER Bedeutung, höchstens 3 Farben zusätzlich zur Grundfarbe (R19/R20). Übliche Belegung: gelb = Fachbegriff/Überschrift, orange = Merksatz/Ergebnis, rot = Widerspruch/Problem (immer zusammen mit dem Symbol „blitz" oder „achtung"), blau = Beispiel/Ergänzung, gruen = Lösung/positiv (mit „haken" oder „plus"). Die Farbe darf nie das EINZIGE Unterscheidungsmerkmal sein (R23, Farbfehlsichtigkeit).',
  '- Pfeile mit fester Bedeutung (R27): pfeil = Folge/führt zu, doppelpfeil = Wechselwirkung, linie = gehört zu. Jede Beziehung in einem Begriffsnetz trägt eine kurze Beschriftung (1–3 Wörter).',
  `- Merksatz: genau einer, höchstens ${MAX_MERKSATZ_WORTE} Wörter, einprägsam formuliert (R17).`,
  '- Mindestens ein grafisches Element (Pfeile, Symbol, Skizze), wenn Zeichnungen gewünscht sind – ein Tafelbild nur aus Text verführt zum Auswendiglernen.',
  '- Die Mindmap nur für Ober- und Unterbegriffe; für Abläufe das Flussdiagramm, für Vergleiche die Tabelle, für Chronologie die Zeitleiste (konstanter Maßstab!), für wiederkehrende Abläufe den Kreislauf.',
  '- Keine Anrede der Schülerinnen und Schüler im Tafeltext außer in Arbeitsaufträgen; Arbeitsaufträge beginnen mit einem Operator.'
]

/** Fachspezifische Hinweise (Recherche 3.11, R42–R45) */
export function fachRegeln(fach: string): string[] {
  const f = fach.toLowerCase()
  if (/mathe|informatik/.test(f))
    return ['FACH MATHEMATIK: Rechenweg Schritt für Schritt (Gleichungen untereinander, Gleichheitszeichen untereinander), Regel mit durchgerechnetem Beispiel, Formeln in LaTeX (Zeichnung „formel"), Koordinatensystem als Diagramm, Fachbegriffe im Wortspeicher.']
  if (/geschichte|politik|sozial|wirtschaft|gesellschaft|erdkunde|geograph/.test(f))
    return [
      'FACH GESELLSCHAFT: Leitfrage als Überschrift, Ursache → Anlass → Ereignis → Folgen, Zeitleisten von links nach rechts mit Jahreszahlen im Feld „zeit", Gegenüberstellungen zweispaltig (antithetisch), höchstens 4 Kategorien. Bei Kontroversen beide Seiten (Kontroversitätsgebot).'
    ]
  if (/englisch|franz|spanisch|latein|italien|russisch|daz|deutsch/.test(f))
    return [
      'FACH SPRACHEN: gleiche grammatische Kategorien untereinander in derselben Farbe (Tabelle), Nomen mit Artikel und Plural, Verben mit Stammformen, Wortfelder mit höchstens 8 Wörtern, Beispielsatz mit markierter Form.'
    ]
  if (/bio|chemie|physik|technik|naturwiss|nwt/.test(f))
    return [
      'FACH NATURWISSENSCHAFT: Frage → Vermutung → Skizze des Versuchs → Beobachtung → Deutung, Beobachtung und Deutung in GETRENNTEN Kästen; Skizzen als einfache, beschriftete Strichzeichnung; Schaltpläne mit Normsymbolen (Diagramm „schaltplan"); Formeln und Reaktionsgleichungen in LaTeX (\\ce{…}).'
    ]
  return []
}

const SPRACHE: Record<Regler['sprache'], string> = {
  einfach: 'EINFACHE SPRACHE: kurze Wörter, keine Nebensätze, Fachbegriffe nur mit Erklärung in Klammern.',
  standard: 'STANDARDSPRACHE: altersgerecht, Fachbegriffe der Klassenstufe.',
  fach: 'FACHSPRACHE: präzise Fachbegriffe, verdichtete Nominalstil-Stichpunkte, wie in der Oberstufe üblich.'
}

const DETAIL: Record<1 | 2 | 3, string> = {
  1: 'DETAILGRAD knapp: 3–4 Knoten mit je höchstens 2 Stichpunkten.',
  2: 'DETAILGRAD mittel: 4–6 Knoten mit je 2–3 Stichpunkten.',
  3: 'DETAILGRAD ausführlich: 6–8 Knoten mit je 3–4 Stichpunkten (die Grenzen der Fläche gelten trotzdem).'
}

const ZEICHNUNG: Record<0 | 1 | 2, string> = {
  0: 'ZEICHNUNGEN: keine (zeichnungen leer, kein symbol in den Knoten).',
  1: 'ZEICHNUNGEN: einige – 1 bis 3 (Symbole an Knoten zählen mit).',
  2: 'ZEICHNUNGEN: viele – 4 bis 6 (Symbole an Knoten zählen mit), wo sie den Inhalt tragen, nicht als Schmuck.'
}

/** Welche Zeichnungsarten erlaubt sind – nach den gewählten Quellen */
export function erlaubteZeichnungen(meta: Pick<TafelbildMeta, 'quellen'>): string[] {
  const a = new Set<string>()
  if (meta.quellen.includes('skizzen')) {
    a.add('symbol')
    a.add('skizze')
  }
  if (meta.quellen.includes('piktogramme')) {
    a.add('symbol')
    a.add('openmoji')
  }
  if (meta.quellen.includes('kibilder')) a.add('kibild')
  if (meta.quellen.includes('fachdiagramme')) {
    a.add('diagramm')
    a.add('formel')
  }
  return [...a]
}

/** Wortgrenze für den Inhalt: die engste der gewählten Tafeln (der Hefteintrag darf mehr) */
export function wortGrenze(formate: FormatId[], textmenge: 1 | 2 | 3): number {
  const tafeln = formate.filter((f) => f !== 'heft')
  const liste = (tafeln.length ? tafeln : formate).map((f) => formatInfo(f).worte[textmenge - 1])
  return Math.min(...liste)
}

export function inhaltsRegeln(meta: TafelbildMeta): string[] {
  const r = meta.regler
  const grenze = wortGrenze(meta.formate, r.textmenge)
  const jeElement = worteJeElement(meta.grade, r.stil === 'ausformuliert')
  const erlaubt = erlaubteZeichnungen(meta)
  const aus: string[] = [
    'VORGABEN DER LEHRKRAFT:',
    `- TEXTMENGE: insgesamt höchstens etwa ${grenze} Wörter auf der Tafel (Überschrift, Knoten, Merksatz, Hausaufgabe zusammen). Je Stichpunkt höchstens ${jeElement} Wörter.`,
    `- ${DETAIL[r.detail]}`,
    `- ${SPRACHE[r.sprache]}`,
    r.stil === 'stichpunkte' ? '- STIL: Stichpunkte (Wortgruppen, keine ganzen Sätze).' : '- STIL: ausformuliert – kurze, vollständige Sätze, je Stichpunkt ein Satz.',
    `- ${ZEICHNUNG[r.zeichnungen]}`
  ]
  if (r.zeichnungen > 0) {
    aus.push(`- Erlaubte Zeichnungsarten: ${erlaubt.join(', ') || 'keine'}.`)
    if (erlaubt.includes('symbol'))
      aus.push(`  symbol: name aus dem Vorrat: ${SYMBOL_NAMEN.map((n) => `${n} (${SYMBOLE[n].label})`).join(', ')}. Ein Symbol an einem Knoten steht im Feld „symbol" des Knotens.`)
    if (erlaubt.includes('skizze')) aus.push(`  skizze: name aus den Vorlagen: ${SKIZZEN_NAMEN.map((n) => `${n} (${SKIZZEN[n].label})`).join(', ')}.`)
    if (erlaubt.includes('openmoji')) aus.push('  openmoji: name = ein deutsches oder englisches Suchwort für ein Piktogramm (z. B. „castle", „Fabrik").')
    if (erlaubt.includes('kibild'))
      aus.push('  kibild: prompt = kurze englische Bildbeschreibung eines EINFACHEN Motivs (die App ergänzt den Tafelstil); höchstens 2 KI-Bilder.')
    if (erlaubt.includes('diagramm'))
      aus.push(
        '  diagramm: art zeitstrahl (eintraege: label + wert = Jahr), koordinatensystem (funktionen als Terme in x wie „0.5*x^2-1", bereich, eintraege = Punkte mit x/y), schaltplan (schaltplan = JSON-Netzliste {"version":2,"kreise":[{"titel":"","bauteile":[{"id":"B1","art":"batterie","von":"a","nach":"b"},{"id":"L1","art":"lampe","von":"b","nach":"a"}]}]}), kreislauf (eintraege = Stationen), kartenskizze (eintraege = Orte mit x/y 0–1), tabelle (spalten, zeilen). Felder, die nicht passen, leer bzw. 0.'
      )
    if (erlaubt.includes('formel')) aus.push('  formel: tex = LaTeX ohne $-Zeichen (Chemie mit \\ce{…}).')
  }
  const v = meta.varianten
  if (v.luecke)
    aus.push(
      '- LÜCKENTAFELBILD: je Knoten und im Merksatz höchstens EIN bis zwei Fachbegriffe als „lueckenWoerter" (genau so geschrieben wie im Text), insgesamt höchstens 30 % der Fachbegriffe (R39). Keine Lücken in der Überschrift.'
    )
  else aus.push('- Keine Lücken: lueckenWoerter leer.')
  if (v.schritte)
    aus.push(
      '- SCHRITTWEISER AUFBAU: „schritt" je Knoten (1 = zuerst an der Tafel). Höchstens 8 Schritte, je Schritt höchstens 3 neue Elemente (R33). Die Mitte füllt sich vor den Flügeln. Zu jedem Schritt in „schritte" die Unterrichtsphase und den Impuls der Lehrkraft (Planungshilfe).'
    )
  if (v.niveaus)
    aus.push(
      '- DIFFERENZIERUNG ★/★★/★★★: „niveau" je Knoten – 1 = Kern, den alle brauchen (höchstens 60 % der Knoten), 2 = weitere Aspekte, 3 = Vertiefung (abstrakte Oberbegriffe, Transfer). Überschrift und Merksatz gelten für alle (R40).'
    )
  else aus.push('- Keine Differenzierung: niveau überall 1.')
  aus.push(v.merksatz ? '- MERKSATZ-/SICHERUNGSKASTEN: ja.' : '- Kein Merksatz: merksatz.text leer.')
  if (meta.operatoren.length)
    aus.push(`- OPERATOREN: Arbeitsaufträge (impuls, hausaufgabe) mit diesen Operatoren formulieren: ${meta.operatoren.join(', ')}.`)
  if (meta.bilingual?.an)
    aus.push(
      `- BILINGUALER SACHFACHUNTERRICHT: Tafeltext in der Arbeitssprache ${meta.bilingual.spracheLabel || meta.bilingual.sprache}; zentrale Fachbegriffe beim ersten Vorkommen zusätzlich auf Deutsch in Klammern.`
    )
  return aus
}

/** Strukturvorgabe */
export function strukturRegel(meta: Pick<TafelbildMeta, 'struktur'>): string {
  switch (meta.struktur) {
    case 'netz':
      return 'STRUKTUR: Begriffsnetz/Mindmap – genau ein Knoten mit rolle „zentrum", die übrigen „aspekt"; Beziehungen vom Zentrum zu den Aspekten mit Beschriftung.'
    case 'tabelle':
      return 'STRUKTUR: Tabelle/Gegenüberstellung – 2–4 Knoten mit rolle „spalte" (Überschrift = Spaltenkopf), in „aspekte" die Vergleichsaspekte als Zeilen; jede Spalte hat in „punkte" GENAU einen Eintrag je Aspekt in derselben Reihenfolge.'
    case 'fluss':
      return 'STRUKTUR: Flussdiagramm/Ursache–Wirkung – Knoten in Reihenfolge (rolle „schritt"), Beziehungen als Pfeile mit kurzer Beschriftung („führt zu", „verstärkt").'
    case 'zeitleiste':
      return 'STRUKTUR: Zeitleiste – Knoten mit rolle „ereignis" und Jahreszahl im Feld „zeit"; chronologisch.'
    case 'kreislauf':
      return 'STRUKTUR: Kreislauf – 4–6 Stationen (rolle „schritt") in Umlaufrichtung; optional ein „zentrum" für die Mitte.'
    default:
      return 'STRUKTUR: Wähle, was zum Inhalt passt (netz, tabelle, fluss, zeitleiste, kreislauf oder gliederung) und begründe die Wahl in einem Satz (strukturGrund). Die Mindmap NUR bei Ober- und Unterbegriffen.'
  }
}
