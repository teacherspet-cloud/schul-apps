import type { ComponentType } from 'react'
import { programmSymbol, type ProgrammIcon } from '../shared/components/ProgrammSymbol'
import ArbeitsblattModule from './arbeitsblatt/ArbeitsblattModule'
import GrammatiktestModule from './grammatiktest/GrammatiktestModule'
import KlassenarbeitModule from './klassenarbeit/KlassenarbeitModule'
import LernzielkontrolleModule from './lernzielkontrolle/LernzielkontrolleModule'
import VokabellisteModule from './vokabelliste/VokabellisteModule'
import VokabeltestModule from './vokabeltest/VokabeltestModule'
import RueckmeldungModule from './rueckmeldung/RueckmeldungModule'
import ElternbriefModule from './elternbrief/ElternbriefModule'
import { PROGRAMM_FAECHER, type ProgrammFaecher } from '../shared/programmSichtbarkeit'

/**
 * Jedes Programm der Schul-Apps ist ein Modul.
 * Neues Programm: Ordner unter modules/ anlegen und hier eintragen –
 * es erscheint dann automatisch als Kachel auf der Startseite und in der Leiste.
 *
 * Die Reihenfolge ist zugleich die der Tastenkürzel Strg+1 … Strg+6 – gezählt werden nur die
 * sichtbaren Programme. Seit Paket 12 (Wunsch der Lehrkraft, 26.09.2026) gilt überall:
 * Arbeitsblätter, Vokabeltest, Grammatiktest, Lernzielkontrollen, Klassenarbeiten,
 * Vokabellisten – die meistgenutzten zuerst, die Listen als Werkzeug der Vokabeltests zuletzt.
 * Dieselbe Folge steht in shared/programmSichtbarkeit.ts (`PROGRAMM_REIHENFOLGE`).
 *
 * Die Kacheltexte sagen, WANN man welches Programm nimmt – vor allem bei Lernzielkontrolle,
 * Grammatiktest und Klassenarbeit, die sich auf den ersten Blick ähneln (Rückmeldung der
 * Lehrkraft, 25.09.2026). Deshalb haben LZK und Klassenarbeit auch nicht mehr dieselbe Farbe.
 */
export interface SchulModule {
  id: string
  name: string
  description: string
  /** Vektorsymbol (Aufträge; Rückfall für Leiste und Zuletzt bearbeitet, solange kein Bild da ist) – Fläche in der Programmfarbe */
  icon: ProgrammIcon
  color: string
  /** Große Illustration für die Startseiten-Kachel; fehlt sie, zeigt die Kachel das Vektorsymbol */
  illustration?: string
  /**
   * Dieselbe Illustration klein (96 px) für die Leiste und „Zuletzt bearbeitet" (Paket 10a,
   * Entscheidung der Lehrkraft: dort die Bilder statt der Vektorsymbole). Fehlt sie, gilt das
   * Vektorsymbol.
   */
  leistenbild?: string
  /**
   * Für welche Fächer das Programm gedacht ist (Paket 12). Passt keines der eigenen Fächer
   * (Einstellungen › Schule), wird es ausgeblendet – siehe shared/programmSichtbarkeit.ts.
   */
  faecher: ProgrammFaecher
  /** active: das Programm ist gerade geöffnet (Module bleiben im Hintergrund erhalten) */
  component: ComponentType<{ active: boolean }>
}

/*
 * Illustrationen der Startseite: liegen als assets/programme/<id>.webp (oder .png) bereit und
 * werden hier automatisch gefunden. Erzeugt werden sie mit scripts/programmbilder.mjs aus den
 * großen Vorlagen; solange ein Bild fehlt, bleibt es beim Vektorsymbol.
 */
const bilder = import.meta.glob<string>('../assets/programme/*.{webp,png}', { eager: true, import: 'default' })
const illustration = (id: string): string | undefined => bilder[`../assets/programme/${id}.webp`] ?? bilder[`../assets/programme/${id}.png`]
// Die kleine Fassung, sonst die große (der Browser verkleinert sie dann selbst)
const leistenbild = (id: string): string | undefined => bilder[`../assets/programme/${id}-96.webp`] ?? illustration(id)

export const modules: SchulModule[] = [
  {
    id: 'arbeitsblatt',
    name: 'Arbeitsblatt',
    description: 'Didaktisch aufbereitete Arbeitsblätter zu jedem Thema – passend zu Jahrgang, Schulform und Bundesland, mit eigenem Design.',
    icon: programmSymbol('arbeitsblatt', 'indigo'),
    color: 'indigo',
    illustration: illustration('arbeitsblatt'),
    leistenbild: leistenbild('arbeitsblatt'),
    faecher: PROGRAMM_FAECHER.arbeitsblatt,
    component: ArbeitsblattModule
  },
  {
    id: 'vokabeltest',
    name: 'Vokabeltest',
    description: 'Vokabeltests mit Aufgaben im Satzzusammenhang – aus eigenen Listen, Schulbuchvokabeln, Fotos, PDF- oder Word-Dateien.',
    icon: programmSymbol('vokabeltest', 'teal'),
    color: 'teal',
    illustration: illustration('vokabeltest'),
    leistenbild: leistenbild('vokabeltest'),
    faecher: PROGRAMM_FAECHER.vokabeltest,
    component: VokabeltestModule
  },
  {
    id: 'grammatiktest',
    name: 'Grammatiktest',
    description: 'Test zu einer Grammatikform zur Diagnose – das Fehlerprofil zeigt, woran als Nächstes zu arbeiten ist. Benotet oder ohne Note.',
    icon: programmSymbol('grammatiktest', 'orange'),
    color: 'orange',
    illustration: illustration('grammatiktest'),
    leistenbild: leistenbild('grammatiktest'),
    faecher: PROGRAMM_FAECHER.grammatiktest,
    component: GrammatiktestModule
  },
  {
    id: 'lernzielkontrolle',
    name: 'Lernzielkontrolle',
    description: 'Kurze schriftliche Überprüfung in jedem Fach – im Format des Bundeslandes (Bezeichnung, Zeitgrenze, Operatoren). Nur Aufgaben und Material.',
    icon: programmSymbol('lernzielkontrolle', 'blue'),
    color: 'blue',
    illustration: illustration('lernzielkontrolle'),
    leistenbild: leistenbild('lernzielkontrolle'),
    faecher: PROGRAMM_FAECHER.lernzielkontrolle,
    component: LernzielkontrolleModule
  },
  {
    id: 'klassenarbeit',
    name: 'Klassenarbeiten',
    description:
      'Große schriftliche Arbeit in Englisch, Französisch, Spanisch, Deutsch, Geschichte, Politik oder Erdkunde – mit Material, Punkteverteilung, Erwartungshorizont und A/B-Fassungen, auch aus eigenen Unterlagen (PDF, Word, Foto).',
    icon: programmSymbol('klassenarbeit', 'grape'),
    color: 'grape',
    illustration: illustration('klassenarbeit'),
    leistenbild: leistenbild('klassenarbeit'),
    faecher: PROGRAMM_FAECHER.klassenarbeit,
    component: KlassenarbeitModule
  },
  {
    id: 'vokabelliste',
    name: 'Vokabellisten',
    description: 'Schulbuchvokabeln und eigene Listen anlegen und pflegen – Grundlage für Vokabeltests und Klassenarbeiten.',
    icon: programmSymbol('vokabelliste', 'cyan'),
    color: 'cyan',
    illustration: illustration('vokabelliste'),
    leistenbild: leistenbild('vokabelliste'),
    faecher: PROGRAMM_FAECHER.vokabelliste,
    component: VokabellisteModule
  },
  {
    id: 'rueckmeldung',
    name: 'Rückmeldung',
    description:
      'Lernförderliche Rückmeldung ohne Note zu Schülerarbeiten – aus einem Arbeitsblatt, einer Klassenarbeit oder einem Test heraus oder zu einer eigenen Aufgabe. Namen bleiben auf dem Rechner.',
    icon: programmSymbol('rueckmeldung', 'green'),
    color: 'green',
    illustration: illustration('rueckmeldung'),
    leistenbild: leistenbild('rueckmeldung'),
    faecher: PROGRAMM_FAECHER.rueckmeldung,
    component: RueckmeldungModule
  },
  {
    id: 'elternbrief',
    name: 'Elternbriefe',
    description: 'Elternbriefe aus Anlass und Stichpunkten – verständlich formuliert, mit Rücklaufzettel und übersetzt in die Familiensprachen der Eltern.',
    icon: programmSymbol('elternbrief', 'yellow'),
    color: 'yellow',
    illustration: illustration('elternbrief'),
    leistenbild: leistenbild('elternbrief'),
    faecher: PROGRAMM_FAECHER.elternbrief,
    component: ElternbriefModule
  }
]
