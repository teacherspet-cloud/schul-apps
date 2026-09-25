import type { Icon } from '@tabler/icons-react'
import { IconAbc, IconClipboardCheck, IconFileText, IconLanguage, IconListLetters, IconPencilCheck } from '@tabler/icons-react'
import type { ComponentType } from 'react'
import ArbeitsblattModule from './arbeitsblatt/ArbeitsblattModule'
import GrammatiktestModule from './grammatiktest/GrammatiktestModule'
import KlassenarbeitModule from './klassenarbeit/KlassenarbeitModule'
import LernzielkontrolleModule from './lernzielkontrolle/LernzielkontrolleModule'
import VokabellisteModule from './vokabelliste/VokabellisteModule'
import VokabeltestModule from './vokabeltest/VokabeltestModule'

/**
 * Jedes Programm der Schul-Apps ist ein Modul.
 * Neues Programm: Ordner unter modules/ anlegen und hier eintragen –
 * es erscheint dann automatisch als Kachel auf der Startseite und in der Leiste.
 *
 * Die Reihenfolge ist zugleich die der Tastenkürzel Strg+1 … Strg+6.
 *
 * Die Kacheltexte sagen, WANN man welches Programm nimmt – vor allem bei Lernzielkontrolle,
 * Grammatiktest und Klassenarbeit, die sich auf den ersten Blick ähneln (Rückmeldung der
 * Lehrkraft, 25.09.2026). Deshalb haben LZK und Klassenarbeit auch nicht mehr dieselbe Farbe.
 */
export interface SchulModule {
  id: string
  name: string
  description: string
  icon: Icon
  color: string
  /** active: das Programm ist gerade geöffnet (Module bleiben im Hintergrund erhalten) */
  component: ComponentType<{ active: boolean }>
}

export const modules: SchulModule[] = [
  {
    id: 'vokabeltest',
    name: 'Vokabeltest',
    description: 'Vokabeltests mit Aufgaben im Satzzusammenhang – aus eigenen Listen, Schulbuchvokabeln, Fotos, PDF- oder Word-Dateien.',
    icon: IconLanguage,
    color: 'teal',
    component: VokabeltestModule
  },
  {
    id: 'vokabelliste',
    name: 'Vokabellisten',
    description: 'Schulbuchvokabeln und eigene Listen anlegen und pflegen – Grundlage für Vokabeltests und Klassenarbeiten.',
    icon: IconListLetters,
    color: 'cyan',
    component: VokabellisteModule
  },
  {
    id: 'arbeitsblatt',
    name: 'Arbeitsblatt',
    description: 'Didaktisch aufbereitete Arbeitsblätter zu jedem Thema – passend zu Jahrgang, Schulform und Bundesland, mit eigenem Design.',
    icon: IconFileText,
    color: 'indigo',
    component: ArbeitsblattModule
  },
  {
    id: 'lernzielkontrolle',
    name: 'Lernzielkontrolle',
    description: 'Kurze schriftliche Überprüfung in jedem Fach – im Format des Bundeslandes (Bezeichnung, Zeitgrenze, Operatoren). Nur Aufgaben und Material.',
    icon: IconClipboardCheck,
    color: 'blue',
    component: LernzielkontrolleModule
  },
  {
    id: 'grammatiktest',
    name: 'Grammatiktest',
    description: 'Test zu einer Grammatikform zur Diagnose – das Fehlerprofil zeigt, woran als Nächstes zu arbeiten ist. Benotet oder ohne Note.',
    icon: IconAbc,
    color: 'orange',
    component: GrammatiktestModule
  },
  {
    id: 'klassenarbeit',
    name: 'Klassenarbeiten',
    description:
      'Große schriftliche Arbeit in Englisch oder Geschichte – mit Material, Punkteverteilung, Erwartungshorizont und A/B-Fassungen, auch aus eigenen Unterlagen (PDF, Word, Foto).',
    icon: IconPencilCheck,
    color: 'grape',
    component: KlassenarbeitModule
  }
]
