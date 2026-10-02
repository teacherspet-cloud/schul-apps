/**
 * Haltung und Kontext jeder Rückmeldungs-Anfrage – ohne Bezug zur Oberfläche, damit auch der
 * Server sie nutzen kann (Schüler-Feedback, 02.10.2026). Vorher in auftrag.ts.
 */
import type { AppSettings } from '@shared/types'
import { bewertungsregel, bilingualAktiv, FORM_LABEL } from '../arbeitsblatt/didactics/bilingual'
import { thresholdsForSubject } from '../../shared/gradeScale'
import { zeichenFuer } from '../../shared/korrekturzeichen'
import type { BogenKontext } from './generation'
import type { Rueckmeldung } from './model/types'
import { einstufungVon } from './art'

/**
 * Bilingualer Sachfachunterricht (30.09.2026): Rückmeldung in der Arbeitssprache, Fachbegriffe
 * zweisprachig, bewertet wird die Sachleistung nach der Regel des Landes (arbeitsblatt/didactics/bilingual.ts).
 */
export function bilingualeRueckmeldung(r: Rueckmeldung): string {
  if (!bilingualAktiv(r.meta)) return ''
  const b = r.meta.bilingual!
  const { regel, belegt } = bewertungsregel(r.meta)
  return [
    `Bilingualer Sachfachunterricht (${FORM_LABEL[b.form]}), Arbeitssprache ${b.spracheLabel}: Die Abgaben sind überwiegend in dieser Sprache geschrieben.`,
    `Die Rückmeldung an die Lernenden steht in der Arbeitssprache (${b.spracheLabel}), einfach und klar; Fachbegriffe stehen beim ersten Vorkommen zusätzlich auf Deutsch.`,
    `Bewertet wird die fachliche Leistung im Sachfach: ${regel}${belegt ? '' : ' (KMK-Grundregel; für das Land nicht eigens belegt)'} Sprachliche Mängel nennst du nur, wo sie die fachliche Aussage beeinträchtigen – dann als fachlichen Punkt.`
  ].join('\n')
}

/** Lerngruppe und Haltung für jede Anfrage */
export function rueckmeldungSystem(r: Rueckmeldung): string {
  const bilingual = bilingualeRueckmeldung(r)
  const sprache = bilingual ? `in der Arbeitssprache (${r.meta.bilingual!.spracheLabel})` : 'auf Deutsch'
  return [
    `Du bist eine erfahrene Lehrkraft für ${r.meta.subjectLabel} (Klasse ${r.meta.grade}, ${r.meta.schoolTypeName}) und schreibst lernförderliche Rückmeldungen zu Schülerarbeiten.`,
    'Grundlage ist das Modell von Hattie und Timperley: Wo steht die Arbeit (Feed Back), was ist das Ziel (Feed Up), was ist der nächste Schritt (Feed Forward).',
    einstufungVon(r.meta) === 'keine'
      ? `Du schreibst ${sprache}, in der Sprache der Lerngruppe, konkret und ermutigend – ohne Noten, ohne Punkte.`
      : `Du schreibst ${sprache}, in der Sprache der Lerngruppe, konkret und ermutigend. Die Note vergibt die Lehrkraft; du lieferst nur einen begründeten Vorschlag in den dafür vorgesehenen Feldern.`,
    ...(bilingual ? [bilingual] : [])
  ].join('\n')
}

/** Korrekturzeichen und Notenschlüssel aus den Einstellungen der Lehrkraft */
export function bogenKontextAus(settings: AppSettings, r: Rueckmeldung): BogenKontext {
  return { zeichen: zeichenFuer(r.meta.subjectId, settings), schwellen: thresholdsForSubject(settings.gradeScale, r.meta.subjectId) }
}
