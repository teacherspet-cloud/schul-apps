/**
 * Art und Bezeichnung des Leistungsnachweises je Land/Schulform/Fach/Jahrgang (29.09.2026,
 * Entscheidung der Lehrkraft: automatisch nach Land/Fach, änderbar).
 */
import { describe, expect, it } from 'vitest'
import { BY_GYM_ZWEIG_KERNFAECHER, byGymErsatzBeispiel, byGymFsAnzahl, fachgruppe, istModerneFremdsprache, nachweisFuer, NACHWEIS_BEZEICHNUNGEN } from '../src/renderer/src/modules/klassenarbeit/model/nachweise'

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
    expect(by('deutsch', 12).hinweis).toContain('drei Wochen')
    expect(by('deutsch', 11).dauer).toContain('60 min')
    expect(by('englisch', 13).hinweis).toContain('mündlich')
    expect(by('sport', 12).keineKlassenarbeit).toBe(true)
  })

  // GSO § 16 Abs. 2 und Anlage 1 (Recherche 29.09.2026)
  it('Physik ist ab Jgst. 8 überall Kernfach mit mindestens 2 Schulaufgaben', () => {
    expect(by('physik', 8)).toMatchObject({
      bezeichnung: 'Schulaufgabe',
      anzahl: 'mindestens 2 im Schuljahr'
    })
    expect(by('physik', 8).nichtGesichert).toBeFalsy()
    expect(by('physik', 7).keineKlassenarbeit).toBe(true)
    expect(by('physik', 7).hinweis).toContain('Natur und Technik')
  })

  it('Kernfach der Ausbildungsrichtung: Schulaufgabe, wo nur diese Richtung das Fach hat', () => {
    // Chemie in Jgst. 8 und 11 nur am NTG, Wirtschaft und Recht in Jgst. 8/9 nur am WWG, Politik und Gesellschaft nur am SWG
    for (const [fach, grade] of [
      ['chemie', 8],
      ['chemie', 11],
      ['wirtschaft', 9],
      ['politik', 8]
    ] as const) {
      expect(by(fach, grade).bezeichnung, `${fach} ${grade}`).toBe('Schulaufgabe')
      expect(by(fach, grade).anzahl).toBe('mindestens 2 im Schuljahr')
    }
    // Sonst hängt es an der Ausbildungsrichtung: Vorschlag Kurzarbeit, Hinweis nennt beide Fälle
    const ch = by('chemie', 9)
    expect(ch.bezeichnung).toBe('Kurzarbeit')
    expect(ch.keineKlassenarbeit).toBeFalsy()
    expect(ch.anzahl).toContain('NTG')
    expect(ch.hinweis).toContain('Naturwissenschaftlich-technologischen')
    expect(by('musik', 6).anzahl).toContain('MuG')
    expect(by('wirtschaft', 10).anzahl).toContain('WWG')
    expect(by('politik', 11).anzahl).toContain('SWG')
  })

  it('Fächer ohne Kernfach-Status: belegt keine Schulaufgaben', () => {
    for (const fach of ['biologie', 'geschichte', 'erdkunde', 'informatik', 'kunst', 'religion']) {
      const n = by(fach, 9)
      expect(n.keineKlassenarbeit, fach).toBe(true)
      expect(n.nichtGesichert, fach).toBeFalsy()
    }
    expect(by('wirtschaft', 7).keineKlassenarbeit).toBe(true)
  })

  it('Fremdsprachen: Mindestzahl nach Wochenstunden der Stundentafel', () => {
    expect(byGymFsAnzahl('englisch', 5)).toBe('mindestens 4 im Schuljahr')
    expect(byGymFsAnzahl('englisch', 7)).toBe('mindestens 4 im Schuljahr')
    expect(byGymFsAnzahl('englisch', 8)).toBe('als 1. Fremdsprache mindestens 3, als 2. Fremdsprache mindestens 4 im Schuljahr')
    expect(byGymFsAnzahl('latein', 10)).toBe('mindestens 3 im Schuljahr')
    expect(byGymFsAnzahl('griechisch', 9)).toBe('mindestens 4 im Schuljahr')
    expect(byGymFsAnzahl('spanisch', 11)).toContain('spät beginnende Fremdsprache (vierstündig) mindestens 4')
    expect(by('franzoesisch', 9).anzahl).toContain('als 3. Fremdsprache mindestens 4')
  })

  it('Deutsch: keine Diktate, Korrekturfrist ab Jgst. 10 drei Wochen', () => {
    expect(by('deutsch', 6).hinweis).toContain('Diktate')
    expect(by('deutsch', 10).hinweis).toContain('drei Wochen')
    expect(by('deutsch', 9).hinweis).toContain('zwei Wochen')
    expect(by('mathematik', 6).hinweis).toContain('sechs Unterrichtswochen')
    expect(by('deutsch', 6).hinweis).not.toContain('sechs Unterrichtswochen')
  })

  // Nachrecherche 2 (29.09.2026): GSO Anlage 1 Fußnoten 5 und 9, KMS vom 18.06.2026
  it('Fremdsprachen: Intensivierungsstunden zählen nicht, gleichzeitiger Beginn nach Stundenverteilung', () => {
    const e5 = by('englisch', 5)
    expect(e5.anzahl).toBe('mindestens 4 im Schuljahr')
    expect(e5.hinweis).toContain('Intensivierungsstunden')
    expect(e5.hinweis).toContain('gleichzeitig')
    expect(by('latein', 7).hinweis).toContain('gleichzeitig')
    expect(by('englisch', 8).hinweis).not.toContain('gleichzeitig')
    expect(by('spanisch', 9).hinweis).not.toContain('gleichzeitig')
    expect(e5.nichtGesichert).toBeFalsy()
  })

  it('Ersatzformate: Beispiele aus dem KMS vom 18.06.2026 je Fach', () => {
    expect(by('deutsch', 9).hinweis).toContain('Debattenschulaufgabe')
    expect(by('deutsch', 11).hinweis).toContain('Literarische Debatte')
    expect(by('deutsch', 6).hinweis).toContain('Jahrgangsstufentest')
    expect(by('deutsch', 7).hinweis).not.toContain('Jahrgangsstufentest')
    expect(by('latein', 10).hinweis).toContain('Dialogschulaufgabe')
    expect(by('griechisch', 9).hinweis).toContain('Dialogschulaufgabe')
    expect(by('physik', 9).hinweis).toContain('Laborexperimente')
    expect(by('mathematik', 9).hinweis).not.toContain('Laborexperimente')
    expect(by('englisch', 9).hinweis).toContain('eine Woche Ankündigung')
    expect(byGymErsatzBeispiel('englisch', 'fremdsprache', 9)).toBeUndefined()
  })

  it('Tabelle der Ausbildungsrichtungen deckt alle sechs Zweige ab', () => {
    expect(BY_GYM_ZWEIG_KERNFAECHER.map((z) => z.zweig)).toEqual(['HG', 'SG', 'NTG', 'MuG', 'WWG', 'SWG'])
    for (const z of BY_GYM_ZWEIG_KERNFAECHER) for (const g of z.nurDort) expect(g >= z.jahrgaenge[0] && g <= z.jahrgaenge[1], z.zweig).toBe(true)
  })

  it('Realschule: Physik und Chemie auch in Gruppe II/III, Kunst bis Jgst. 10', () => {
    expect(by('physik', 9, 'realschule').anzahl).toContain('Gruppe II/III: 2')
    expect(by('chemie', 8, 'realschule').hinweis).toContain('ab Jgst. 9')
    expect(by('chemie', 10, 'realschule')).toMatchObject({
      bezeichnung: 'Schulaufgabe',
      anzahl: '2 im Schuljahr'
    })
    expect(by('chemie', 10, 'realschule').nichtGesichert).toBeFalsy()
    expect(by('kunst', 10, 'realschule').bezeichnung).toBe('Schulaufgabe')
    expect(by('deutsch', 10, 'realschule').hinweis).toContain('drei Wochen')
  })

  it('Mittelschule: keine Schulaufgaben, angekündigte schriftliche Leistungsnachweise', () => {
    const n = by('deutsch', 6, 'mittelschule')
    expect(n.bezeichnung).toBe('schriftlicher Leistungsnachweis')
    expect(n.hinweis).toContain('Projektarbeit')
    expect(by('geschichte', 8, 'mittelschule').quelle).toBe('MSO § 12')
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
