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
 * es erscheint dann automatisch als Kachel auf der Startseite.
 */
export interface SchulModule {
  id: string
  name: string
  description: string
  icon: Icon
  color: string
  /** active: das Programm ist gerade geöffnet (Module bleiben im Hintergrund erhalten) */
  component: ComponentType<{ active: boolean }>
  /** Dateitypen, die das Modul per Drag & Drop verarbeitet (nur zur Anzeige) */
  acceptedFiles?: string[]
}

export const modules: SchulModule[] = [
  {
    id: 'vokabeltest',
    name: 'Vokabeltest',
    description: 'Kontextbasierte Vokabeltests aus Vokabellisten erstellen, auch aus Fotos, PDF- und Word-Dateien.',
    icon: IconLanguage,
    color: 'teal',
    component: VokabeltestModule,
    acceptedFiles: ['Bild', 'PDF', 'DOCX', 'CSV', 'XLSX']
  },
  {
    id: 'vokabelliste',
    name: 'Vokabellisten',
    description: 'Eigene Vokabellisten anlegen und pflegen – mit grau markierten Wörtern, die nicht abgefragt werden müssen.',
    icon: IconListLetters,
    color: 'cyan',
    component: VokabellisteModule,
    acceptedFiles: ['Bild', 'PDF', 'DOCX', 'CSV', 'XLSX']
  },
  {
    id: 'arbeitsblatt',
    name: 'Arbeitsblatt',
    description: 'Didaktisch aufbereitete Arbeitsblätter zu jedem Thema – passend zu Jahrgang, Schulform und Bundesland, mit eigenem Design.',
    icon: IconFileText,
    color: 'indigo',
    component: ArbeitsblattModule,
    acceptedFiles: ['Bild', 'PDF', 'DOCX', 'TXT']
  },
  {
    id: 'lernzielkontrolle',
    name: 'Lernzielkontrolle',
    description:
      'Kurze schriftliche Leistungskontrollen – im Format des eigenen Bundeslandes, mit dessen Zeitgrenze und Operatorenliste. Nur Aufgaben und Material, keine Lernhilfen.',
    icon: IconClipboardCheck,
    color: 'grape',
    component: LernzielkontrolleModule
  },
  {
    id: 'grammatiktest',
    name: 'Grammatiktest',
    description: 'Kurze Tests zu einer Grammatikform – mit Notenschlüssel und einem Fehlerprofil, das zeigt, woran als Nächstes zu arbeiten ist.',
    icon: IconAbc,
    color: 'orange',
    component: GrammatiktestModule
  },
  {
    id: 'klassenarbeit',
    name: 'Klassenarbeiten',
    description: 'Klassenarbeiten für Englisch und Geschichte entwerfen – mit Aufgabenformaten, Punkteverteilung und Erwartungshorizont.',
    icon: IconPencilCheck,
    color: 'grape',
    component: KlassenarbeitModule,
    acceptedFiles: ['PDF', 'DOCX', 'TXT']
  }
]
