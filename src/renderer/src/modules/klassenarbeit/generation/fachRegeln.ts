/**
 * Fachregeln der Fächer vom 29.09.2026 für die KI-Aufträge der Klassenarbeit (Grundlage:
 * recherche/klassenarbeiten-faecher-neu-2026-09-29.md, Abschnitt 13). Eingebunden in
 * `partPrompt` (generateExam.ts) – je Teil nur, was zu Fach und Format gehört.
 */
import { pruefungsVersuchRegeln, setzeProtokollInPruefung, versuchAnfrage, versuchAus } from '../../arbeitsblatt/didactics/protokoll'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import { fachDerArbeit, hatVersuche } from '../model/faecher'
import { istUebersetzungsformat } from '../model/formats'
import { fehlerZeile, grenzeFuerLand, woerterRichtwert, type Fehlerquote } from '../model/fehlerquote'
import type { Exam, ExamPart } from '../model/types'

type AiCall = <T>(req: import('@shared/types').StructuredRequest) => Promise<T>

const istOberstufe = (grade: number): boolean => grade >= 11

/** Fehlerquote der Übersetzung: gespeichert oder Richtwert aus Land, Jahrgang und Zeit */
export function uebersetzungFuer(exam: Exam, part?: ExamPart): Fehlerquote {
  const m = exam.meta
  return m.uebersetzung ?? { woerter: woerterRichtwert(m.grade, part?.minutes ?? Math.round((m.minutes * 2) / 3), m.subjectId === 'griechisch'), grenzeAusreichend: grenzeFuerLand(m.stateId) }
}

export function fachRegeln(exam: Exam, part: ExamPart): string {
  const m = exam.meta
  const art = fachDerArbeit(m.subjectId).art
  const zeilen: string[] = []
  if (art === 'mathematik') {
    const teilA = part.formatId === 'ma-basis'
    zeilen.push(
      'MATHEMATIK:',
      '- Punkte je Teilaufgabe; der Lösungsweg muss nachvollziehbar sein. Im Erwartungshorizont die Bewertungseinheiten je Schritt.',
      '- Folgefehler werden in der Regel berücksichtigt (richtiges Weiterrechnen mit falschem Zwischenergebnis) – im Erwartungshorizont vermerken, wo das greift.',
      '- Einheiten und Darstellung gehören zur Lösung.',
      teilA && m.hilfsmittelfreierTeil !== false
        ? '- TEIL A OHNE HILFSMITTEL: einzelne, voneinander unabhängige Aufgaben mit 1–3 Punkten, die ohne Taschenrechner und Formelsammlung lösbar sind (Kopfrechnen, einfache Umformungen, Graphen zuordnen). Dieser Teil wird vor Ausgabe der Hilfsmittel abgegeben.'
        : m.hilfsmittelfreierTeil !== false && exam.parts.some((p) => p.formatId === 'ma-basis')
          ? `- TEIL B MIT HILFSMITTELN (${m.aids || 'Taschenrechner, Formelsammlung'}): komplexere Aufgaben; Teilaufgaben möglichst unabhängig, bei Bedarf Zwischenergebnis angeben.`
          : ''
    )
  }
  if (art === 'alte-sprache') {
    if (istUebersetzungsformat(part.formatId)) {
      const q = uebersetzungFuer(exam, part)
      zeilen.push(
        'ÜBERSETZUNG (verbindlich):',
        `- Ein zusammenhängender ${m.subjectId === 'griechisch' ? 'griechischer' : 'lateinischer'} Text von GENAU etwa ${q.woerter} Wörtern mit deutscher Überschrift, einer knappen deutschen Einleitung und Wortangaben für unbekannte Wörter.`,
        '- Nur Formen und Konstruktionen, die laut Unterrichtseinheit behandelt wurden.',
        '- Die Übersetzung wird NICHT über Punkte bewertet, sondern über die Fehlerquote: points = 0.',
        `- Fehlerschlüssel (Richtwert): ${fehlerZeile(q)}.`,
        '- Erwartungshorizont: eine Musterübersetzung und die Stellen, an denen typische Fehler zu erwarten sind (mit Gewicht: halber, ganzer oder Doppelfehler). Folge- und Wiederholungsfehler werden nicht eigens gezählt; Positivkorrektur ist zulässig (EPA).'
      )
    } else
      zeilen.push(
        'BEGLEITAUFGABEN:',
        '- Alle Aufgaben beziehen sich auf den Übersetzungstext bzw. einen weiteren Textabschnitt; Formen und Syntax werden am Text geprüft, nicht isoliert.',
        '- Bewertung über Punkte; „ausreichend" in der Regel ab 40 % (Niedersachsen).'
      )
  }
  if (art === 'naturwissenschaft' || art === 'informatik') {
    zeilen.push(
      art === 'informatik' ? 'INFORMATIK:' : 'NATURWISSENSCHAFT:',
      '- Punkte je Teilaufgabe; fehlende oder falsche Einheiten, Fachsprachfehler und Ungenauigkeiten in Zeichnungen gelten als fachliche Fehler (KMK-Standards).',
      '- Operatoren nach der IQB-Liste: „beurteilen" = Sachurteil nach fachlichen Kriterien, „bewerten" = Werturteil mit offengelegten Werten und Normen.',
      '- Beobachtung und Deutung werden getrennt.'
    )
    if (art === 'informatik')
      zeilen.push(
        m.amRechner
          ? '- Die Arbeit wird AM RECHNER geschrieben: Aufgaben mit Abgabe als Datei (Dateiname angeben); Code wird ausgeführt und getestet.'
          : '- Code, Pseudocode oder Struktogramm wird AUF PAPIER geschrieben; die verwendeten Sprachelemente stehen als Material (Sprachreferenz) bei. Kleine Syntaxfehler mindern die Bewertung nur, wenn sie den Algorithmus verfälschen (keine amtliche Regel – Fachkonferenz).'
      )
    if (/-experiment$/.test(part.formatId)) zeilen.push(pruefungsVersuchRegeln(m.versuch))
    if (istOberstufe(m.grade) && /-experiment$/.test(part.formatId))
      zeilen.push(
        '- Oberstufe, fachpraktische Aufgabe möglich (KMK-Standards 2020): Wird ein Schülerexperiment durchgeführt, nenne im Lehrkraft-Hinweis Material, Sicherheit und ERSATZDATEN (Messwerte bzw. Beobachtungen) für den Fall, dass das Experiment misslingt.'
      )
  }
  if (art === 'musisch')
    zeilen.push(
      'MUSIK/KUNST:',
      '- Kurzer schriftlicher Leistungsnachweis; das Material (Hörbeispiel, Notentext, Werk) ist genau angegeben (Titel, Künstlerin bzw. Komponist, Jahr).',
      '- Stichworte allein genügen nicht als schriftlicher Anteil (EPA Kunst).'
    )
  if (['religion', 'ethik', 'philosophie', 'werte-und-normen'].includes(m.subjectId))
    zeilen.push(
      'WERTEBEZOGENES FACH:',
      '- Bei „bewerten" und „Stellung nehmen" werden die Wertmaßstäbe offengelegt; unterschiedliche weltanschauliche Positionen werden respektvoll dargestellt.',
      '- Keine Bewertung von Glaubens- oder Gewissensentscheidungen der Lernenden selbst.'
    )
  return zeilen.filter(Boolean).join('\n')
}

/** Versuch vor dem Erzeugen ausarbeiten (einmal für alle Fassungen) */
export async function versuchFuerArbeit(exam: Exam, ai: AiCall): Promise<Exam> {
  const v = exam.meta.versuch
  if (!v?.aktiv || v.daten || !hatVersuche(exam.meta.subjectId)) return exam
  const m = exam.meta
  const daten = versuchAus(
    await ai<unknown>(versuchAnfrage({ subjectId: m.subjectId, subjectLabel: m.subjectLabel, grade: m.grade, schoolTypeName: m.schoolTypeName, topic: m.topic }, v))
  )
  return { ...exam, meta: { ...m, versuch: { ...v, daten } } }
}

/** Die Protokollvorlage hinter die Aufgabe „protokollieren" im Versuchsteil setzen */
export function mitProtokoll(exam: Exam, part: ExamPart, blocks: WsBlock[]): WsBlock[] {
  if (!/-experiment$/.test(part.formatId) || !exam.meta.versuch?.aktiv) return blocks
  return setzeProtokollInPruefung(blocks, exam.meta.versuch, exam.meta, true)
}
