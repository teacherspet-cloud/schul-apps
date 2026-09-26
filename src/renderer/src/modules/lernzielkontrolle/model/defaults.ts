/**
 * Voreinstellungen einer neuen Lernzielkontrolle.
 *
 * Die Werte sind nicht frei gewählt, sondern aus der Länderrecherche abgeleitet:
 * 20 Minuten ist die Obergrenze in Bayern und Baden-Württemberg und liegt innerhalb aller
 * übrigen belegten Grenzen; der Notenschlüssel ist aus, weil die echten Vorlagen keinen
 * tragen und er nirgends vorgeschrieben ist.
 */
import { presetDesigns } from '@shared/design'
import { OHNE_AUSGLEICH } from '../didactics/bausteine'
import { STANDARD_BEWERTUNG } from '../didactics/bewertung'
import { standardFormat, standardMinuten } from '../didactics/formate'
import type { Stufe } from '../didactics/operatoren'
import type { Kurztest, KurztestMeta } from './types'
import { anredeFuerStufe, type Anrede } from '../../../shared/anrede'
import { gehoertZurSekII } from '../../arbeitsblatt/didactics/bildungsgang'

/**
 * Sek I oder Sek II aus dem Jahrgang.
 *
 * Ab Jahrgang 11 gilt die Oberstufe. Das ist eine Faustregel – in den Ländern mit G8 beginnt
 * die Qualifikationsphase früher, und an beruflichen Gymnasien später. Deshalb ist die Stufe
 * im Modell überschreibbar und nicht aus dem Jahrgang errechnet.
 */
export const stufeFuerJahrgang = (grade: number): Stufe => (grade >= 11 ? 'sek2' : 'sek1')

/**
 * Anrede einer Lernzielkontrolle: nach der gewählten Stufe (Paket 8b). Steht die Stufe noch auf
 * der Voreinstellung aus dem Jahrgang, zählt Klasse 10 im G8-Gymnasium als Sek II („Sie"), weil
 * sie dort die Einführungsphase der Oberstufe ist (Regel der Lehrkraft: Sek II siezen). Die Stufe
 * selbst bleibt dort Sek I – sie bestimmt auch die Operatorengrundlage, und die Länderlisten der
 * Sek II sind Abiturdokumente (arbeitsblatt/didactics/bildungsgang.ts). Hat die Lehrkraft die
 * Stufe ausdrücklich umgestellt (etwa für ein berufliches Gymnasium), gilt ihre Wahl.
 */
export const anredeFuerKurztest = (m: Pick<KurztestMeta, 'stufe' | 'grade' | 'schoolTypeId' | 'stateId'>): Anrede =>
  m.stufe === stufeFuerJahrgang(m.grade) ? anredeFuerStufe(gehoertZurSekII(m.grade, m.schoolTypeId, m.stateId) ? 'sek2' : 'sek1') : anredeFuerStufe(m.stufe)

export function defaultKurztestMeta(stateId: string, schoolTypeId: string, schoolTypeName: string): KurztestMeta {
  const format = standardFormat(stateId)
  return {
    subjectId: 'mathematik',
    subjectLabel: 'Mathematik',
    stateId,
    schoolTypeId,
    schoolTypeName,
    grade: 8,
    stufe: 'sek1',
    formatId: format?.id ?? '',
    bezeichnung: format?.bezeichnung ?? 'Lernzielkontrolle',
    title: '',
    thema: '',
    stoff: '',
    stoffQuellen: [],
    minutes: standardMinuten(format),
    bevorzugteOperatoren: [],
    varianten: 1,
    nachteilsausgleich: OHNE_AUSGLEICH,
    bewertung: STANDARD_BEWERTUNG,
    answerKey: true,
    nameFeld: true
  }
}

export function emptyKurztest(stateId: string, schoolTypeId: string, schoolTypeName: string): Kurztest {
  return {
    version: 1,
    meta: defaultKurztestMeta(stateId, schoolTypeId, schoolTypeName),
    design: presetDesigns()[0],
    varianten: [{ id: 'v1', label: '', blocks: [] }],
    createdAt: new Date().toISOString()
  }
}
