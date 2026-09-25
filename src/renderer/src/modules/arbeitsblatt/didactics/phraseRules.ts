/**
 * Wie die „nützlichen Ausdrücke" je nach Lerngruppe aussehen – mit oder ohne deutsche
 * Entsprechung, und wie einzelne Wörter erklärt werden.
 *
 * Wunsch der Lehrkraft (25.09.2026): „beachte beim baustein für useful phrases das Alter und
 * Niveau der Schüler. Zum Beispiel sollte ein Kurs auf erhöhtem Niveau keine deutschen
 * Übersetzungen erhalten, sondern nur die phrases und bei einzelnen Wörtern, die Wörter aus
 * einem Text erklären eine einsprachige Erklärung in der Zielsprache."
 *
 * WAS DIE RECHERCHE ERGEBEN HAT (und was nicht):
 *
 * - BELEGT ist die PRAXIS: In den illustrierenden Abiturprüfungsaufgaben der KMK
 *   (Bildungsstandards fortgeführte Fremdsprache, Beschluss vom 18.10.2012) sind die
 *   Annotationen zu zielsprachigen Texten durchgängig zielsprachlich und kontextbezogen
 *   („SE postcode area – a rather underprivileged part of London", „mirifique – ici :
 *   incroyable"). Deutsch steht dort nur punktuell, wo eine Umschreibung unpräzise bliebe:
 *   Realien, Register, Konnotation.
 * - BELEGT ist außerdem die Regel, dass die Annotation die KONTEXTbedeutung liefert, nicht die
 *   Wörterbuchbedeutung – erkennbar an der Form „here: …" / „ici : …". Sie rechtfertigt sich
 *   dadurch, dass sie etwas gibt, was im Wörterbuch nicht steht.
 * - NICHT BELEGT ist die verbreitete Faustregel „ab der Oberstufe nur noch einsprachig". Weder
 *   die KMK-Standards noch der Gemeinsame europäische Referenzrahmen noch die geprüften
 *   Lehrpläne nennen eine solche Schwelle. Die KMK stellt im Abitur einsprachige Wörterbücher
 *   bereit, lässt zweisprachige aber ausdrücklich zusätzlich zu; Nordrhein-Westfalen erlaubt
 *   im Zentralabitur Englisch beides.
 * - Die empirischen Arbeiten zum BEHALTEN von Wortbedeutungen fallen sogar zugunsten der
 *   deutschen Entsprechung aus (Laufer & Shmueli 1997; Zhao & Macaro 2016; Joyce 2018). Die
 *   belegte Einschränkung: Schwächere Lernende übertragen reines Übersetzungswissen schlechter
 *   in zielsprachliche Zusammenhänge (Prince 1996).
 *
 * Die Schwelle hier ist deshalb KEINE Vorschrift, die die App zitieren dürfte, sondern die
 * Entscheidung der Lehrkraft (25.09.2026), fest nach Jahrgang und Niveau. Sie folgt der
 * Prüfungspraxis, nicht einer Fundstelle – und der Kommentar sagt das, damit niemand sich
 * später auf eine Vorgabe beruft, die es nicht gibt.
 */
import { cefrIndex, type CefrLevel } from '@shared/types'
import { subjectById } from '../model/subjects'
import type { Stars } from './differentiation'
import { bilingualAktiv } from './bilingual'
import type { WorksheetMeta } from '../model/types'

/**
 * Ab diesem Niveau entfällt die deutsche Entsprechung.
 *
 * B1+ ist der Punkt, an dem der Gemeinsame europäische Referenzrahmen das Umschreiben im
 * Repertoire sieht („Can define the features of something concrete for which they can't
 * remember the word") und an dem die Lernerwörterbücher mit ihrem Definitionswortschatz von
 * rund 2.000 Wörtern benutzbar werden. Beides stützt die Wahl, beweist sie aber nicht.
 */
export const EINSPRACHIG_AB: CefrLevel = 'B1+'

/**
 * Ein Fach, in dem AUS einer Sprache ins Deutsche übersetzt wird (Latein).
 *
 * Dort steht die Einsprachigkeits-Schwelle auf dem Kopf: Die deutsche Wiedergabe ist nicht
 * die Hilfe, die man mit steigendem Können weglässt – sie ist das Lernziel.
 */
export function istUebersetzungsfach(meta: Pick<WorksheetMeta, 'subjectId'>): boolean {
  return Boolean(subjectById(meta.subjectId).uebersetzungssprache)
}

/** Braucht diese Lerngruppe die deutsche Entsprechung neben der Wendung? */
export function zeigtUebersetzung(meta: Pick<WorksheetMeta, 'cefrLevel' | 'subjectId' | 'bilingual'>, stars?: Stars): boolean {
  // In Latein immer: Ohne deutsche Wiedergabe wäre die Angabe wertlos
  if (istUebersetzungsfach(meta)) return true
  /*
   * Bilingual ebenfalls immer – Entscheidung der Lehrkraft (25.09.2026): „Bilingual sticht".
   * Das Glossar ist dort keine Hilfe auf Zeit; der deutsche Fachbegriff ist Lernziel.
   */
  if (bilingualAktiv(meta)) return true
  /*
   * Die Binnendifferenzierung schlägt das Kursniveau – in beide Richtungen.
   *
   * Vorgabe der Lehrkraft (24.09.2026): „Bei mittlerem und erweitertem Niveau soll keine
   * Übersetzung der Phrases und des Vokabulars gegeben werden … Das grundlegende Niveau soll
   * weiterhin Übersetzungen haben." Wer auf dem Blatt die ★-Stufe bearbeitet, braucht die
   * Brücke auch dann, wenn der Kurs im Schnitt darüber liegt (Prince 1996).
   */
  if (stars && stars >= 2) return false
  if (stars === 1) return true
  return cefrIndex(meta.cefrLevel) < cefrIndex(EINSPRACHIG_AB)
}

/**
 * Wie einzelne Wörter erklärt werden, die aus einem Text stammen.
 *
 * Unterhalb der Schwelle die deutsche Entsprechung, darüber eine Umschreibung in der
 * Zielsprache – und zwar die KONTEXTbedeutung, nicht die des Wörterbuchs.
 */
export type Worterklaerung = 'deutsch' | 'zielsprachlich'

export function worterklaerung(meta: Pick<WorksheetMeta, 'cefrLevel' | 'subjectId' | 'bilingual'>, stars?: Stars): Worterklaerung {
  return zeigtUebersetzung(meta, stars) ? 'deutsch' : 'zielsprachlich'
}

/**
 * Wie die Liste aufgebaut ist – Umfang, Metasprache, Form der Einträge.
 *
 * Grundlage ist die Berliner Handreichung „Textsortenspezifisches Schreiben im
 * Englischunterricht der Sekundarstufe I" (Senatsverwaltung für Bildung, Jugend und
 * Wissenschaft 2016), die dieselbe Textsorte in drei Stufen ausarbeitet, und die
 * Oberstufenfassung „Text production" (2021). Nachgezählt am Beispiel „Speech": rund 9, 15
 * und 22 Einträge bei gleichbleibend sechs bis sieben Funktionsgruppen.
 *
 * Der eigentliche Abbau läuft dort NICHT über die Menge, sondern über drei andere Achsen:
 * vom fertigen Textgerüst über die Auswahl zur offenen Referenz, von deutscher zu englischer
 * Metasprache, und von der abgeschlossenen Liste zu „This is not a comprehensive list. You
 * might want to add your own."
 *
 * Die Zahlen sind deshalb ORIENTIERUNG, keine Vorgabe: Weder in der Forschung noch in einem
 * Lehrplan steht, wie lang eine Redemittelliste sein soll.
 */
export interface PhrasenAufbau {
  /** Wendungen insgesamt */
  eintraege: string
  /** Funktionsgruppen */
  gruppen: string
  /** Sprache der Gruppenüberschriften */
  metasprache: 'deutsch' | 'zielsprachlich'
  /** Form der einzelnen Einträge */
  form: string
  /** Deutsche Entsprechung neben der Wendung? */
  uebersetzung: boolean
}

export function phrasenAufbau(meta: Pick<WorksheetMeta, 'cefrLevel' | 'subjectId' | 'bilingual'>, stars?: Stars): PhrasenAufbau {
  /*
   * Latein hat keine GER-Stufen, und das Blatt heißt dort nicht „useful phrases": Gebraucht
   * werden die wiederkehrenden KONSTRUKTIONEN mit ihren deutschen Wiedergaben. Eine
   * Niveauschwelle wird hier bewusst nicht erfunden – die Lernjahre erfasst die App nicht.
   */
  if (istUebersetzungsfach(meta))
    return {
      eintraege: '8–14',
      gruppen: '3–5',
      metasprache: 'deutsch',
      form: 'je Eintrag die lateinische Fügung und ein bis zwei deutsche Wiedergaben',
      uebersetzung: true
    }
  const stufe = cefrIndex(meta.cefrLevel)
  const deutsch = zeigtUebersetzung(meta, stars)
  // A1/A2: das Gerüst trägt den ganzen Text, die Überschriften sind deutsch
  if (stufe <= cefrIndex('A2'))
    return {
      eintraege: '6–10',
      gruppen: '2–4',
      metasprache: 'deutsch',
      form: 'vollständige, kurze Wendungen in der Reihenfolge, in der sie gebraucht werden',
      uebersetzung: deutsch
    }
  // A2+/B1: Satzanfänge mit Leerstelle, mehrere zur Auswahl
  if (stufe <= cefrIndex('B1'))
    return {
      eintraege: '12–18',
      gruppen: '4–6',
      metasprache: 'deutsch',
      form: 'Satzanfänge mit Leerstelle („I think … because …“), mehrere je Funktion zur Auswahl',
      uebersetzung: deutsch
    }
  // B1+/B2: englische Überschriften, Varianten statt Vorgaben
  if (stufe <= cefrIndex('B2'))
    return {
      eintraege: '12–18',
      gruppen: '5–7',
      metasprache: 'zielsprachlich',
      form: 'Satzanfänge und Satzmuster, je Funktion drei bis fünf Varianten',
      uebersetzung: deutsch
    }
  // B2+/C1: nur noch, was die Textsorte und den Gedankengang trägt
  return {
    eintraege: '6–12',
    gruppen: '3–5',
    metasprache: 'zielsprachlich',
    form: 'nur register- und gattungstypische Wendungen, die den Gedankengang gliedern – keine inhaltstragenden Sätze',
    uebersetzung: deutsch
  }
}

/**
 * Die Regeln für den Prompt.
 *
 * Zwei Punkte stehen bewusst darin, weil sie in den Studien den Ausschlag geben:
 *
 * - **Ordnung nach Sprachhandlung.** Belegt bei Nattinger (1980) und in der Academic Formulas
 *   List (Simpson-Vlach & Ellis 2010); keine der geprüften amtlichen Sammlungen ordnet
 *   alphabetisch oder nach Wortart.
 * - **Keine Liste ohne Verwendung.** Boers u. a. (2006) fanden nur eine schwache Wirkung des
 *   bloßen Bewusstmachens, die Replikation von Stengers u. a. (2010) gar keine; deutliche
 *   Effekte zeigten sich erst bei McGuire & Larson-Hall (2017), wo die Wendungen aktiv
 *   produziert werden mussten. Eine Liste, die niemand benutzen muss, ist Papier.
 */
export function phrasenRegeln(meta: Pick<WorksheetMeta, 'cefrLevel' | 'subjectLabel' | 'subjectId'>, stars?: Stars): string[] {
  if (istUebersetzungsfach(meta)) {
    const l = phrasenAufbau(meta, stars)
    return [
      `- Umfang: ${l.eintraege} Einträge in ${l.gruppen} Gruppen.`,
      '- Ordne nach KONSTRUKTION, nicht alphabetisch: Partizipialkonstruktionen, Ablativus absolutus, AcI, nd-Formen, Konjunktiv im Nebensatz – je nachdem, was im Text dieses Blattes vorkommt.',
      '- Jeder Eintrag zeigt die lateinische Fügung und ein bis zwei mögliche deutsche Wiedergaben („cum + Konj. → als / weil / obwohl – je nach Zusammenhang").',
      '- german ist hier PFLICHT: Das Übersetzen ins Deutsche ist das Lernziel, eine Angabe ohne deutsche Wiedergabe wäre wertlos.',
      '- Nimm nur auf, was im Text dieses Blattes wirklich vorkommt, und nenne dazu die Stelle. Eine allgemeine Grammatikübersicht gehört nicht hierher.',
      '- Keine Vollübersetzung von Sätzen des Textes: Die Angabe zeigt das Muster, nicht die Lösung.'
    ]
  }
  const a = phrasenAufbau(meta, stars)
  const ziel = meta.subjectLabel
  return [
    `- Umfang: ${a.eintraege} Wendungen in ${a.gruppen} Gruppen. Mehr überfordert; die Lernenden sollen auswählen, nicht abarbeiten.`,
    `- Form der Einträge: ${a.form}.`,
    a.metasprache === 'deutsch'
      ? '- Die Gruppenüberschriften stehen auf DEUTSCH („Die eigene Meinung sagen:", „Begründen:"), die Wendungen selbst in der Zielsprache.'
      : `- Die Gruppenüberschriften stehen auf ${ziel} („Giving my opinion:", „Drawing conclusions:").`,
    a.uebersetzung
      ? '- german: die deutsche Entsprechung, wo sie hilft – bei Wendungen sinngemäß, nicht wörtlich. Wo der Ausdruck selbsterklärend ist, bleibt das Feld leer.'
      : `- KEINE deutschen Übersetzungen: german bleibt bei ALLEN Einträgen leer. Auf diesem Niveau soll in der Zielsprache gearbeitet werden. Muss ein einzelnes Wort erklärt werden, steht die Erklärung als kurze Umschreibung auf ${ziel} im Eintrag selbst („to concede – to admit that something is true"), und zwar die Bedeutung IM TEXT, nicht die des Wörterbuchs.`,
    '- Nimm nur auf, was für die Aufgaben dieses Blattes gebraucht wird. Die Aufgabe muss die Wendungen auch wirklich verlangen – eine Liste, die niemand benutzen muss, wird nicht gelernt.'
  ]
}
