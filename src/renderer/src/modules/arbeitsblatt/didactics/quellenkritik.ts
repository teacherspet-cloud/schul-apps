/**
 * Die quellenkritische Einleitung – was in welchem Jahrgang verlangt wird und wie sie in den
 * Erwartungshorizont kommt.
 *
 * Wunsch der Lehrkraft (25.09.2026): ein Bewertungsmaßstab mit „abstufende[n] Anforderungen je
 * Jahrgang … für die Erwartungshorizonte neuer Materialien, die quellenkritisch eingeleitet
 * werden müssen."
 *
 * SIE IST KEINE EIGENE AUFGABE, sondern Bestandteil einer. Die Lehrkraft formuliert typisch:
 * „Fasse das Material nach einer quellenkritischen Einleitung zusammen." Den
 * Anforderungsbereich bestimmt also der Hauptoperator („zusammenfassen"), nicht die Einleitung.
 * Sie bekommt dafür eine eigene Zeile im Erwartungshorizont.
 *
 * WAS DIE RECHERCHE ERGEBEN HAT (25.09.2026):
 *
 * - Die verbreitete Acht-Punkte-Liste (Verfasser – Textsorte – Zeit – Ort – Adressat – Anlass –
 *   Intention – Kontext) steht in KEINEM amtlichen Dokument als geschlossene Liste. Belegter
 *   Kern sind vier Merkmale: Urheber, Quellengattung, Adressat, Intention (KMK, Einheitliche
 *   Prüfungsanforderungen Geschichte, i. d. F. vom 10.02.2005, Abschnitt 3.2.2 – die Aufzählung
 *   endet dort mit „usw.").
 * - Das Unterstützungsmaterial des Lehrplannavigators NRW nennt die ausführlichste Liste und
 *   setzt ausdrücklich dazu: „Je nach Text können unterschiedliche Merkmale in unterschiedlicher
 *   Gewichtung von Bedeutung sein." Eine starre Checkliste ist amtlich also gerade nicht gedeckt.
 * - Der ENTSTEHUNGSORT wird in NRW überhaupt nicht genannt; nur Schleswig-Holstein verlangt
 *   „Zeit, Ort und historischen Zusammenhang" (Fachanforderungen Geschichte 2016).
 * - Der HISTORISCHE KONTEXT ist in NRW und in der KMK-EPA ein eigener, späterer Arbeitsschritt.
 *   Entscheidung der Lehrkraft (25.09.2026): trotzdem in die Einleitung, aber „als grober
 *   Kontext, nicht mit ‚Einordnen' als Operator verwechseln". Genau diese Unterscheidung steht
 *   deshalb in den Regeln: Der Operator „einordnen" verlangt AFB II; ein Satz zur Zeitlage
 *   verlangt das nicht.
 *
 * DIE ABSTUFUNG LÄUFT NICHT ÜBER DIE ZAHL DER BESTANDTEILE.
 *
 * Das ist der überraschendste Befund. Niedersachsen verlangt die äußere Quellenkritik schon in
 * Klasse 5/6 – „setzen Ergebnisse der äußeren Quellenkritik ansatzweise in Beziehung zum
 * erschlossenen Inhalt" (Kerncurriculum Geschichte Gymnasium 5–10, gültig ab 01.08.2015).
 * Gestuft wird über drei andere Achsen, am klarsten in Schleswig-Holstein ablesbar, wo dieselbe
 * Leistung dreimal erscheint:
 *
 *   „auf der Basis von bereitgestellten Informationen" → „größtenteils selbstständig" → „selbstständig"
 *   „nennen Zeit, Ort …" → „und stellen diese sprachlich angemessen dar" → „sprachlich angemessen und umfassend"
 *
 * Also: wie viel Hilfe die Aufgabe mitgibt, ob abgelesen oder erschlossen wird, und wie
 * ausführlich dargestellt werden muss.
 */
import type { WorksheetMeta } from '../model/types'
import { schoolProfileFor } from './schoolProfiles'
import { wantsSourceHeader } from './sourceHeader'

/**
 * Die Niveaustufen des Rahmenlehrplans Berlin/Brandenburg (Teil C Geschichte, amtliche Fassung
 * vom 10.11.2015), Kompetenzbereich „Historische Quellen untersuchen".
 *
 * Sie sind die einzige jahrgangsscharfe Progression, die die Recherche gefunden hat – und sie
 * bringen die Schulform gleich mit: Der Rahmenlehrplan ordnet sie am GYMNASIUM den Jahrgängen
 * 7 bis 10 einzeln zu, an der integrierten Sekundarschule und der Gesamtschule dagegen
 * „Jahrgangsstufen 7–8 → Niveaustufe D; Jahrgangsstufen 9–10 → Niveaustufen D–E".
 *
 * Diese Spreizung ist beträchtlich: Was das Gymnasium in Klasse 7 verlangt, ist an der
 * Gesamtschule das Ziel von Klasse 10. Die App bildet das ab, statt eine mittlere Linie zu
 * erfinden.
 */
export type Niveaustufe = 'D' | 'E' | 'F' | 'G' | 'H' | 'SekII'

/** Eine Stufe der Anforderung – bewusst über Selbstständigkeit, nicht über Vollständigkeit. */
export interface Quellenkritik {
  stufe: Niveaustufe
  /** Was in dieser Stufe verlangt wird */
  bestandteile: string[]
  /** Wie viel die Aufgabe vorgibt */
  hilfe: string
  /** Ablesen oder erschließen */
  tiefe: string
  /** Wie ausführlich dargestellt wird */
  darstellung: string
  /** Punkte für die Einleitung im Erwartungshorizont */
  punkte: { von: number; bis: number }
}

/**
 * Ab dieser Klassenstufe wird überhaupt quellenkritisch eingeleitet.
 *
 * Fünf, weil Geschichte in den meisten Ländern dort beginnt und Niedersachsen die äußere
 * Quellenkritik ausdrücklich schon für 5/6 vorsieht.
 */
export const AB_KLASSE = 5

/**
 * Die Punktspanne folgt der einzigen amtlichen Rechnung, die die Recherche gefunden hat.
 *
 * abitur.nrw, „Vorgaben für die Konstruktion von Aufgaben … im Fach Geschichte" (18.12.2015):
 * „Für die Punktvergabe wird im Fach Geschichte ein Basiswert von 2 Punkten zugrunde gelegt,
 * wobei in der Regel für ein Kriterium höchstens das Drei- bis Vierfache des Punkt-Basiswerts
 * vergeben wird." Die Gesamtpunktzahl beträgt dort 100. Die Einleitung ist typischerweise EIN
 * Kriterium – also 2 bis 8 Punkte.
 *
 * Die verbreitete Faustregel „etwa 10 % für die Einleitung" ist nirgends amtlich bestätigt.
 *
 * Schleswig-Holstein vergibt für die Einleitung gar keine Punkte, sondern eine fünfstufige
 * Skala („vollständig / weitgehend / in Ansätzen / fehlt / sachliche Fehler", Leitfaden
 * Geschichte 2018). Wer so korrigiert, liest die Punktzahl als Gewichtung.
 */
const PUNKTE_BASIS = 2
const PUNKTE_MAX = 8

/** Welche Fächer leiten quellenkritisch ein? */
export function brauchtQuellenkritik(meta: Pick<WorksheetMeta, 'subjectId' | 'grade'>): boolean {
  return wantsSourceHeader(meta) && meta.grade >= AB_KLASSE
}

/**
 * Welche Niveaustufe gilt für diesen Jahrgang an dieser Schulform?
 *
 * Gymnasium: 7→E, 8→F, 9→G, 10→H (Rahmenlehrplan Berlin/Brandenburg, Zuordnung Gymnasium).
 * Integrierte Formen: 7–8→D, 9–10→E (ebenda, „Niveaustufen D–E").
 *
 * Dass auch Hauptschule und Förderschwerpunkt Lernen der integrierten Zuordnung folgen, ist
 * eine Übertragung – Berlin und Brandenburg kennen diese Schulformen nicht.
 */
export function niveaustufe(meta: Pick<WorksheetMeta, 'grade' | 'schoolTypeId'>): Niveaustufe {
  if (meta.grade >= 11) return 'SekII'
  if (meta.grade <= 6) return 'D'
  const gymnasial = schoolProfileFor(meta.schoolTypeId).id === 'gymnasium'
  if (!gymnasial) return meta.grade <= 8 ? 'D' : 'E'
  if (meta.grade === 7) return 'E'
  if (meta.grade === 8) return 'F'
  if (meta.grade === 9) return 'G'
  return 'H'
}

/**
 * Was auf dieser Stufe verlangt wird.
 *
 * Die Stufen E bis H bleiben nah am Wortlaut des Rahmenlehrplans: „die Aussagekraft von Quellen
 * anhand eines Merkmals … vergleichen und begründen" (E), „die Perspektive der Quellenautorin
 * oder des -autors beschreiben" (F), „verschiedene Perspektiven als Ausdruck von Werten …
 * erklären" und „die Interessen und Ziele … begründen" (G), „die Aussagekraft einer Quellenart
 * und -gattung untersuchen" sowie „die (verdeckten/offenen) Absichten … erklären und beurteilen"
 * (H).
 */
const STUFEN: Record<Niveaustufe, Omit<Quellenkritik, 'stufe'>> = {
  D: {
    bestandteile: ['Wer hat das geschrieben?', 'Wann ist es entstanden?', 'Was für ein Text ist es?'],
    hilfe: 'Die Angaben stehen im Materialkopf; die Aufgabe nennt die drei Fragen ausdrücklich.',
    tiefe: 'ablesen',
    darstellung: 'ein bis zwei Sätze',
    punkte: { von: PUNKTE_BASIS, bis: PUNKTE_BASIS + 1 }
  },
  E: {
    bestandteile: [
      'Verfasser',
      'Entstehungszeit',
      'Textsorte',
      'EIN Merkmal, das die Aussagekraft betrifft (war der Verfasser dabei? wie lange danach geschrieben? von welcher Seite?)'
    ],
    hilfe: 'Der Materialkopf liefert die ersten drei Angaben; das Merkmal der Aussagekraft gibt die Aufgabe zur Auswahl vor.',
    tiefe: 'ablesen, ein Merkmal begründen',
    darstellung: 'zusammenhängende Sätze, kein Stichwortzettel',
    punkte: { von: PUNKTE_BASIS, bis: PUNKTE_BASIS + 2 }
  },
  F: {
    bestandteile: ['Verfasser', 'Entstehungszeit', 'Textsorte', 'Adressat', 'die Sicht, aus der der Verfasser schreibt (Stellung, Gruppe, Überzeugung)'],
    hilfe: 'Der Materialkopf liefert drei Angaben; Adressat und Sichtweise werden aus dem Text erschlossen.',
    tiefe: 'ablesen, die Perspektive beschreiben',
    darstellung: 'zusammenhängende Sätze',
    punkte: { von: PUNKTE_BASIS + 1, bis: PUNKTE_BASIS + 2 }
  },
  G: {
    bestandteile: [
      'Verfasser und seine Stellung',
      'Entstehungszeit',
      'Quellengattung',
      'Adressat',
      'Anlass',
      'welche Interessen und Ziele hinter der Aussage stehen'
    ],
    hilfe: 'Ohne vorgegebene Fragen; die Aufgabe verlangt die Einleitung als Ganzes.',
    tiefe: 'ablesen und erschließen',
    darstellung: 'ein zusammenhängender Absatz',
    punkte: { von: PUNKTE_BASIS + 2, bis: PUNKTE_MAX - 2 }
  },
  H: {
    bestandteile: [
      'Verfasser und seine Stellung',
      'Entstehungszeit',
      'Quellengattung und was sie für die Aussagekraft bedeutet',
      'Adressat',
      'Anlass',
      'die offenen und die verdeckten Absichten',
      'grober zeitlicher Zusammenhang'
    ],
    hilfe: 'keine',
    tiefe: 'erschließen, mit Belegen aus dem Text',
    darstellung: 'ein zusammenhängender Absatz',
    punkte: { von: PUNKTE_BASIS + 2, bis: PUNKTE_MAX }
  },
  SekII: {
    bestandteile: [
      'Verfasser und seine Standortgebundenheit',
      'Entstehungszeit und – wo er abweicht – der Zeitpunkt des Bekanntwerdens',
      'Quellengattung und was sie für die Aussagekraft bedeutet',
      'Adressat und dessen Verhältnis zum Verfasser',
      'Anlass',
      'Absicht',
      'grober zeitlicher Zusammenhang'
    ],
    hilfe: 'keine; die Einleitung wird selbstständig verfasst',
    tiefe: 'erschließen, mit Belegen aus dem Text',
    darstellung: 'ein knapper, vollständiger Absatz in fachsprachlich angemessener Form',
    punkte: { von: PUNKTE_MAX - 2, bis: PUNKTE_MAX }
  }
}

/** Was diese Lerngruppe leisten soll. */
export function quellenkritik(meta: Pick<WorksheetMeta, 'subjectId' | 'grade' | 'schoolTypeId'>): Quellenkritik | null {
  if (!brauchtQuellenkritik(meta)) return null
  const stufe = niveaustufe(meta)
  return { stufe, ...STUFEN[stufe] }
}

/**
 * Die Regeln für den Prompt.
 *
 * Zwei Sätze stehen bewusst darin, weil beide Länder sie wörtlich führen und weil sie im
 * Erwartungshorizont sonst fehlen:
 *
 * - „Lösungswege, die sinnvoll und begründet vom Erwartungshorizont abweichen, sind zu
 *   akzeptieren und gegebenenfalls positiv zu bewerten" (KMK-EPA Geschichte; wortgleich im
 *   Leitfaden Geschichte Schleswig-Holstein 2018).
 * - „Lediglich zur Illustration bereits vorhandener Erkenntnisse darf das Quellenmaterial nicht
 *   dienen" (KMK-EPA Geschichte) – das häufigste Fehlerbild.
 */
export function quellenkritikRegeln(meta: Pick<WorksheetMeta, 'subjectId' | 'grade' | 'schoolTypeId'>): string {
  const q = quellenkritik(meta)
  if (!q) return ''
  const geschichte = meta.subjectId === 'geschichte'
  return [
    'QUELLENKRITISCHE EINLEITUNG:',
    '- Steht eine QUELLE auf dem Blatt, verlangt die erste Aufgabe dazu ausdrücklich eine quellenkritische Einleitung („Fassen Sie das Material nach einer quellenkritischen Einleitung zusammen"). Sie ist Teil der Aufgabe, KEINE eigene Teilaufgabe, und bekommt keinen eigenen Anforderungsbereich – den bestimmt der Operator der Aufgabe.',
    `- Auf dieser Stufe gehören hinein: ${q.bestandteile.join('; ')}.`,
    `- Hilfestellung: ${q.hilfe}`,
    `- Tiefe: ${q.tiefe}. Was im Materialkopf steht, wird genannt; was nicht dasteht, wird aus dem Text erschlossen und begründet.`,
    `- Form: ${q.darstellung}.`,
    /*
     * Die Unterscheidung, auf die die Lehrkraft ausdrücklich hingewiesen hat (25.09.2026):
     * „als grober Kontext, nicht mit ‚Einordnen' als Operator verwechseln".
     */
    q.bestandteile.some((b) => b.includes('Zusammenhang'))
      ? '- Der zeitliche Zusammenhang bleibt GROB: ein Satz zur Lage, in der die Quelle entstand. Er ersetzt NICHT den Operator „einordnen" – eine ausgeführte historische Einordnung ist eine eigene Leistung und gehört, wenn sie verlangt wird, in eine eigene Teilaufgabe.'
      : '',
    geschichte
      ? '- Die Standortgebundenheit des Verfassers ist kein Mangel der Quelle, sondern der Gegenstand: Eine Quelle verkörpert nicht „die historische Wahrheit", sondern eine subjektiv bedingte Aussage.'
      : '- Bei Karikatur, Statistik oder Zeitungstext geht es um Interessenbindung und Aktualität des Verfassers, nicht um Epochenwissen.',
    '- Bei nicht-schriftlichen Quellen bleibt die Quellengattung die Kategorie, sie wird nur anders gefüllt (Karikatur, Plakat, Gemälde statt Rede, Brief, Verordnung); aus dem Verfasser wird der Bildautor.',
    '',
    'BEI EINER DARSTELLUNG STATT EINER QUELLE:',
    /*
     * Eigener Katalog nach dem Unterstützungsmaterial des Lehrplannavigators NRW, das dafür den
     * Begriff „textbeschreibende Charakterisierung" verwendet. Zwei Dinge sind dort
     * bemerkenswert: „Thema" taucht NUR hier auf, und es heißt „Textsorte" statt
     * „Quellengattung".
     */
    '- Ein Sach- oder Verfassertext ist eine DARSTELLUNG, also heutiges Wissen über die Vergangenheit. Statt einer quellenkritischen Einleitung bekommt er eine textbeschreibende Charakterisierung: Verfasser, Adressat, THEMA des Textes, Textsorte (wissenschaftliche Abhandlung, populärwissenschaftlicher Text, Essay, Schulbuchtext), gegebenenfalls Entstehungszeit, Anlass und Absicht.',
    '- Nach der „Standortgebundenheit" wird bei einer Darstellung NICHT gefragt: Sie ist keine Aussage aus der behandelten Zeit.',
    '',
    'IM ERWARTUNGSHORIZONT:',
    `- Die Einleitung bekommt eine eigene Zeile mit ${q.punkte.von} bis ${q.punkte.bis} Punkten, je nachdem wie viele Bestandteile verlangt werden.`,
    '- Dazu der Satz: „Lösungswege, die sinnvoll und begründet vom Erwartungshorizont abweichen, sind zu akzeptieren und positiv zu bewerten."',
    '- Nenne, was NICHT genügt: das bloße Aufzählen der Angaben aus dem Materialkopf ohne Bezug zum Inhalt, und die Quelle nur als Beleg für bereits vorhandenes Wissen zu verwenden.'
  ]
    .filter(Boolean)
    .join('\n')
}
