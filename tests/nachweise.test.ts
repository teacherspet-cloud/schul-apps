/**
 * Art und Bezeichnung des Leistungsnachweises je Land/Schulform/Fach/Jahrgang (29.09.2026,
 * Entscheidung der Lehrkraft: automatisch nach Land/Fach, änderbar).
 */
import { describe, expect, it } from 'vitest'
import { fachgruppe, istModerneFremdsprache, nachweisFuer, NACHWEIS_BEZEICHNUNGEN } from '../src/renderer/src/modules/klassenarbeit/model/nachweise'

const LAENDER = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']
const FAECHER = [
  'englisch',
  'franzoesisch',
  'spanisch',
  'italienisch',
  'russisch',
  'latein',
  'griechisch',
  'deutsch',
  'mathematik',
  'biologie',
  'chemie',
  'physik',
  'technik',
  'informatik',
  'geschichte',
  'erdkunde',
  'politik',
  'wirtschaft',
  'religion',
  'ethik',
  'philosophie',
  'werte-und-normen',
  'musik',
  'kunst',
  'sport',
  'irgendein-neues-fach'
]

const nw = (subjectId: string, grade = 8, schoolTypeId = 'gymnasium') => nachweisFuer({ stateId: 'NW', schoolTypeId, subjectId, grade })
const by = (subjectId: string, grade = 8, schoolTypeId = 'gymnasium') => nachweisFuer({ stateId: 'BY', schoolTypeId, subjectId, grade })

describe('nachweisFuer: alle Länder, Fächer und Jahrgänge', () => {
  it('liefert überall eine Bezeichnung aus der Auswahlliste und eine Quelle in allen Ländern der Sek I', () => {
    for (const stateId of LAENDER) {
      for (const subjectId of FAECHER) {
        for (const grade of [5, 7, 9, 10, 12]) {
          for (const schoolTypeId of ['gymnasium', 'realschule', 'gemeinschaftsschule']) {
            const n = nachweisFuer({ stateId, schoolTypeId, subjectId, grade })
            expect(n.bezeichnung, `${stateId} ${subjectId} ${grade}`).toBeTruthy()
            expect(NACHWEIS_BEZEICHNUNGEN as readonly string[]).toContain(n.bezeichnung)
            if (n.keineKlassenarbeit) expect(n.hinweis, `${stateId} ${subjectId}`).toBeTruthy()
          }
        }
        expect(nachweisFuer({ stateId, schoolTypeId: 'gymnasium', subjectId: 'deutsch', grade: 7 }).quelle, stateId).toBeTruthy()
      }
    }
  })

  it('schreibt die Hinweise unpersönlich', () => {
    const du = /\b(du|dich|dir|dein\w*)\b/i
    const sie = /(?:[a-zäöüß,]\s+)(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer)\b/
    for (const stateId of LAENDER) {
      for (const subjectId of FAECHER) {
        for (const grade of [6, 9, 12]) {
          const text = Object.values(nachweisFuer({ stateId, schoolTypeId: 'gymnasium', subjectId, grade })).join(' ')
          expect(du.test(text), `${stateId} ${subjectId}: ${text}`).toBe(false)
          expect(sie.test(text), `${stateId} ${subjectId}: ${text}`).toBe(false)
        }
      }
    }
  })
})

describe('Nordrhein-Westfalen', () => {
  it('Chemie in der Sek I: keine Klassenarbeit, als schriftliche Lernkontrolle nutzbar', () => {
    const n = nw('chemie')
    expect(n.keineKlassenarbeit).toBe(true)
    expect(n.hinweis).toContain('keine Klassenarbeiten')
    expect(n.hinweis).toContain('APO-S I § 6')
    expect(n.hinweis).toContain('schriftliche Lernkontrolle')
  })

  it('Deutsch, Mathematik, Fremdsprachen: Klassenarbeit mit Zahl und Dauer je Jahrgang', () => {
    expect(nw('englisch', 5).anzahl).toContain('6')
    expect(nw('mathematik', 7).dauer).toBe('1 Unterrichtsstunde')
    expect(nw('deutsch', 7).dauer).toBe('1–2 Unterrichtsstunden')
    expect(nw('deutsch', 9).dauer).toBe('2–3 Unterrichtsstunden')
    expect(nw('franzoesisch', 8).bezeichnung).toBe('Klassenarbeit')
    expect(nw('franzoesisch', 8).hinweis).toContain('Schreiben ist Bestandteil')
  })
})

describe('Bayern', () => {
  it('Kernfach am Gymnasium: Schulaufgabe', () => {
    expect(by('deutsch').bezeichnung).toBe('Schulaufgabe')
    expect(by('latein').bezeichnung).toBe('Schulaufgabe')
    expect(by('mathematik', 6).anzahl).toContain('mindestens 4')
    expect(by('mathematik', 9).anzahl).toContain('mindestens 3')
    expect(by('englisch').dauer).toBe('höchstens 60 min')
  })

  it('Nicht-Kernfach am Gymnasium: Kurzarbeit bzw. Stegreifaufgabe', () => {
    const n = by('geschichte')
    expect(n.bezeichnung).toBe('Kurzarbeit')
    expect(n.dauer).toBe('höchstens 30 min')
    expect(n.hinweis).toContain('Stegreifaufgabe')
    expect(n.keineKlassenarbeit).toBe(true)
  })

  it('Realschule: Schulaufgabenzahl nach RSO § 18', () => {
    expect(by('englisch', 9, 'realschule').bezeichnung).toBe('Schulaufgabe')
    expect(by('englisch', 9, 'realschule').anzahl).toContain('3')
    expect(by('geschichte', 9, 'realschule').keineKlassenarbeit).toBe(true)
  })

  it('Oberstufe: Schulaufgabe mit 90 Minuten', () => {
    expect(by('deutsch', 12).bezeichnung).toBe('Schulaufgabe')
    expect(by('deutsch', 12).dauer).toBe('höchstens 90 min')
    expect(by('deutsch', 11).dauer).toContain('60 min')
  })
})

describe('weitere Länder', () => {
  it('Niedersachsen: übrige Fächer schriftliche Lernkontrolle, Kernfächer Klassenarbeit', () => {
    const ge = nachweisFuer({ stateId: 'NI', schoolTypeId: 'gymnasium', subjectId: 'geschichte', grade: 8 })
    expect(ge.bezeichnung).toBe('schriftliche Lernkontrolle')
    expect(ge.keineKlassenarbeit).toBeFalsy()
    const fr = nachweisFuer({ stateId: 'NI', schoolTypeId: 'gymnasium', subjectId: 'franzoesisch', grade: 8 })
    expect(fr.bezeichnung).toBe('Klassenarbeit')
    expect(fr.anzahl).toContain('3–4')
    expect(nachweisFuer({ stateId: 'NI', schoolTypeId: 'gymnasium', subjectId: 'sport', grade: 8 }).keineKlassenarbeit).toBe(true)
  })

  it('Bremen: Kurzarbeit außerhalb der Kernfächer', () => {
    const n = nachweisFuer({ stateId: 'HB', schoolTypeId: 'oberschule', subjectId: 'biologie', grade: 8 })
    expect(n.bezeichnung).toBe('Kurzarbeit')
    expect(n.keineKlassenarbeit).toBe(true)
    expect(nachweisFuer({ stateId: 'HB', schoolTypeId: 'oberschule', subjectId: 'englisch', grade: 8 }).anzahl).toBe('3 je Halbjahr')
  })

  it('Oberstufe: Klausur (Rheinland-Pfalz: Kursarbeit)', () => {
    for (const stateId of ['NI', 'NW', 'HE', 'BE', 'SH', 'TH']) {
      expect(nachweisFuer({ stateId, schoolTypeId: 'gymnasium', subjectId: 'geschichte', grade: 12 }).bezeichnung, stateId).toBe('Klausur')
    }
    expect(nachweisFuer({ stateId: 'RP', schoolTypeId: 'gymnasium', subjectId: 'deutsch', grade: 12 }).bezeichnung).toBe('Kursarbeit')
    // Einführungsphase in Klasse 10 (G8): Bremen und Mecklenburg-Vorpommern
    expect(nachweisFuer({ stateId: 'MV', schoolTypeId: 'gymnasium', subjectId: 'deutsch', grade: 10 }).bezeichnung).toBe('Klausur')
    expect(nachweisFuer({ stateId: 'HH', schoolTypeId: 'gymnasium', subjectId: 'deutsch', grade: 10 }).bezeichnung).toBe('Klassenarbeit')
  })

  it('kennzeichnet nicht Gesichertes', () => {
    expect(nachweisFuer({ stateId: 'ST', schoolTypeId: 'sekundarschule', subjectId: 'deutsch', grade: 8 }).nichtGesichert).toBe(true)
    expect(nachweisFuer({ stateId: 'HB', schoolTypeId: 'gymnasium', subjectId: 'deutsch', grade: 8 }).nichtGesichert).toBe(true)
  })

  it('bleibt bei unbekanntem Land neutral', () => {
    expect(nachweisFuer({ stateId: 'XX', schoolTypeId: 'gymnasium', subjectId: 'chemie', grade: 8 })).toMatchObject({ bezeichnung: 'Klassenarbeit' })
  })
})

describe('Fächergruppen', () => {
  it('erkennt moderne Fremdsprachen, nicht aber Latein oder unbekannte Fächer', () => {
    expect(istModerneFremdsprache('franzoesisch')).toBe(true)
    expect(istModerneFremdsprache('italienisch')).toBe(true)
    expect(istModerneFremdsprache('latein')).toBe(false)
    expect(istModerneFremdsprache('mathematik')).toBe(false)
    expect(fachgruppe('irgendein-neues-fach')).toBe('sonstiges')
    expect(fachgruppe('religion-evangelisch')).toBe('religion')
  })
})
