import type { ComponentType } from 'react'
import MeineKlassenModule from './meineklassen/MeineKlassenModule'
import { SprachenlernenModule } from './lernen/VokabelTraining'
import VerwaltungLehrkraft from './verwaltung/DatenUndMaterial'
import LaufendeReihenModule from './unterrichtsreihe/LaufendeReihenModule'
import FreigegebeneBlaetterModule from './freigaben/FreigegebeneBlaetterModule'
import { programmSymbol, type ProgrammIcon } from '../shared/components/ProgrammSymbol'
import ArbeitsblattModule from './arbeitsblatt/ArbeitsblattModule'
import GrammatiktestModule from './grammatiktest/GrammatiktestModule'
import KlassenarbeitModule from './klassenarbeit/KlassenarbeitModule'
import LernzielkontrolleModule from './lernzielkontrolle/LernzielkontrolleModule'
import VokabellisteModule from './vokabelliste/VokabellisteModule'
import VokabeltestModule from './vokabeltest/VokabeltestModule'
import RueckmeldungModule from './rueckmeldung/RueckmeldungModule'
import ElternbriefModule from './elternbrief/ElternbriefModule'
import TafelbildModule from './tafelbild/TafelbildModule'
import OnlinetestModule from './onlinetest/OnlinetestModule'
import UnterrichtsreiheModule from './unterrichtsreihe/UnterrichtsreiheModule'
import VerwaltungModule from './verwaltung/VerwaltungModule'
import { aufServer, serverIch } from '../shared/plattform'
import { PROGRAMM_FAECHER, SPRACH_FAECHER, type ProgrammFaecher } from '../shared/programmSichtbarkeit'

/**
 * Jedes Programm der Schul-Apps ist ein Modul.
 * Neues Programm: Ordner unter modules/ anlegen und hier eintragen –
 * es erscheint dann automatisch als Kachel auf der Startseite und in der Leiste.
 *
 * Die Reihenfolge ist zugleich die der Tastenkürzel Strg+1 … Strg+9 – gezählt werden nur die
 * sichtbaren Programme. Seit Paket 12 (Wunsch der Lehrkraft, 26.09.2026) gilt überall:
 * Arbeitsblätter, Vokabeltest, Grammatiktest, Lernzielkontrollen, Klassenarbeiten,
 * Rückmeldung, Tafelbilder (seit 30.09.2026), Elternbriefe, Vokabellisten – die meistgenutzten zuerst, die Listen als Werkzeug der
 * Vokabeltests zuletzt (seit 29.09.2026 auch hinter den Elternbriefen, Wunsch der Lehrkraft).
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
  /*
   * Nur mit dem Schul-Apps-Server (02.10.2026): Onlinetest (Lerngruppen, Live-Stand, Auswertung),
   * direkt unter der Lernzielkontrolle (Wunsch der Lehrkraft). In der Exe ohne Server und auf dem iPad gibt es ihn nicht.
   */
  ...(aufServer()
    ? [
        {
          id: 'onlinetest',
          name: 'Onlinetest',
          description: 'Vokabeltests am iPad der Lernenden: Code oder QR-Code, Zeitlimit, Live-Stand, Auswertung mit KI – dazu Lerngruppen mit Notenverlauf.',
          icon: programmSymbol('onlinetest', 'teal'),
          color: 'teal',
          illustration: illustration('onlinetest'),
          leistenbild: leistenbild('onlinetest'),
          // Nur mit dem Schul-Apps-Server – deshalb nicht in PROGRAMM_FAECHER (feste Folge der Programme überall)
          faecher: SPRACH_FAECHER,
          component: OnlinetestModule
        },
        // Laufende Reihen und freigegebene Blätter (03.10.2026): Überblick über den laufenden Unterricht
        {
          id: 'laufendereihen',
          name: 'Laufende Reihen',
          description: 'Aktive Unterrichtsreihen der eigenen Lerngruppen: Fortschritt, Handlungsbedarf, Haltepunkte – mit Korrektur-Eingang.',
          icon: programmSymbol('laufendereihen', 'violet'),
          color: 'violet',
          illustration: illustration('laufendereihen'),
          leistenbild: leistenbild('laufendereihen'),
          faecher: 'alle' as const,
          component: LaufendeReihenModule
        },
        {
          id: 'freigaben',
          name: 'Freigegebene Blätter',
          description:
            'Alle für Lernende freigegebenen Arbeitsblätter: wer begonnen und eingereicht hat, jedes ausgefüllte Blatt mit Feedback ansehen und sichern.',
          icon: programmSymbol('freigaben', 'blue'),
          color: 'blue',
          illustration: illustration('freigaben'),
          leistenbild: leistenbild('freigaben'),
          faecher: 'alle' as const,
          component: FreigegebeneBlaetterModule
        },
        // Sprachenlernen (08.10.2026, abgestimmt): Vokabeltraining und Grammatiktraining in einer App – je Gruppe ein Kurs
        {
          id: 'sprachenlernen',
          name: 'Sprachenlernen',
          description:
            'Vokabeln und Grammatik je Gruppe als Kurs üben lassen – Karteikasten, Spiele, Regelkarten; mit Lernstand, Stärken und Schwächen und Förder-/Forderaufgaben je Kind.',
          icon: programmSymbol('sprachenlernen', 'orange'),
          color: 'orange',
          illustration: illustration('sprachenlernen') ?? illustration('vokabeltraining'),
          leistenbild: leistenbild('sprachenlernen') ?? leistenbild('vokabeltraining'),
          faecher: SPRACH_FAECHER,
          component: SprachenlernenModule
        },
        // Unterrichtsreihe (Etappe 6, 02.10.2026): Lernpfad für Lernende mit Freischalten – alle Fächer
        {
          id: 'unterrichtsreihe',
          name: 'Unterrichtsreihe',
          description:
            'Lernpfade für Lernende: Schritte freischalten, Lernziele aus dem Kerncurriculum, eigenes Tempo mit Haltepunkten, Übersicht mit Handlungsbedarf.',
          icon: programmSymbol('unterrichtsreihe', 'indigo'),
          color: 'indigo',
          illustration: illustration('unterrichtsreihe'),
          leistenbild: leistenbild('unterrichtsreihe'),
          faecher: 'alle' as const,
          component: UnterrichtsreiheModule
        },
        // „Meine Klassen" (06.10.2026): Lernstand, Tests und Handlungsbedarf je Lerngruppe – Gruppe Verwaltung
        {
          id: 'meineklassen',
          name: 'Meine Klassen',
          description: 'Lernstand, Tests und Handlungsbedarf je Klasse und Fach – mit passendem Material auf einen Klick.',
          icon: programmSymbol('verwaltung', 'cyan'),
          color: 'cyan',
          illustration: illustration('meineklassen'),
          leistenbild: leistenbild('meineklassen'),
          faecher: 'alle' as const,
          component: MeineKlassenModule
        }
      ]
    : []),
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
    id: 'rueckmeldung',
    name: 'Rückmeldung',
    description:
      'Rückmeldung zu Schülerarbeiten – schriftlich, mit Tipps, Bewertungstabelle, Korrekturrand oder Kommentaren am Scan; ohne Note oder mit Einstufung, Nachteilsausgleich je Abgabe. Namen bleiben auf dem Rechner.',
    icon: programmSymbol('rueckmeldung', 'green'),
    color: 'green',
    illustration: illustration('rueckmeldung'),
    leistenbild: leistenbild('rueckmeldung'),
    faecher: PROGRAMM_FAECHER.rueckmeldung,
    component: RueckmeldungModule
  },
  {
    id: 'tafelbild',
    name: 'Tafelbilder',
    description:
      'Übersichtliche Tafelbilder für Klapptafel, Whiteboard, Flipchart und Heft – mit oder ohne eigenes Material, frei bearbeitbar, als Lückenfassung, schrittweise präsentiert, als PDF, PNG oder PowerPoint.',
    icon: programmSymbol('tafelbild', 'lime'),
    color: 'lime',
    illustration: illustration('tafelbild'),
    leistenbild: leistenbild('tafelbild'),
    faecher: PROGRAMM_FAECHER.tafelbild,
    component: TafelbildModule
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
  // Verwaltung (03.10.2026 zusammengelegt mit der Datenverwaltung): für alle – Admins sehen zusätzlich
  // Nutzer, KI-Zugänge, IServ, Hörtexte und Server
  {
    id: 'verwaltung',
    name: 'Verwaltung',
    description: 'Freigaben der Fachschaften, Themenbereiche und Sicherung – für Admins dazu Nutzer, KI-Schlüssel, IServ-Anbindung und Server.',
    icon: programmSymbol('verwaltung', 'gray'),
    color: 'gray',
    illustration: illustration('verwaltung'),
    leistenbild: leistenbild('verwaltung'),
    faecher: 'alle' as const,
    component: aufServer() && serverIch()?.rolle === 'admin' ? VerwaltungModule : VerwaltungLehrkraft
  }
]

/**
 * Gruppen der Seitenleiste (03.10.2026, Entscheidung der Lehrkraft): vier Übermenüs; ein Klick
 * klappt die Apps der Gruppe auf. Apps, die es gerade nicht gibt (Exe ohne Server, kein Admin),
 * fallen weg; eine leere Gruppe erscheint nicht.
 */
/** Bild eines Obermenüs (KI-Bild „gruppe-<id>“, 03.10.2026); ohne Bild zeigt die Leiste das Vektorsymbol */
export const gruppenBild = (id: string): string | undefined => leistenbild(`gruppe-${id}`)

export interface ModulGruppe {
  id: string
  name: string
  apps: string[]
}
export const MODUL_GRUPPEN: ModulGruppe[] = [
  { id: 'unterricht', name: 'Unterricht', apps: ['laufendereihen', 'freigaben', 'rueckmeldung', 'onlinetest', 'sprachenlernen'] },
  { id: 'planung', name: 'Unterrichtsplanung', apps: ['arbeitsblatt', 'unterrichtsreihe', 'tafelbild'] },
  { id: 'pruefung', name: 'Leistungsüberprüfungen', apps: ['vokabeltest', 'grammatiktest', 'lernzielkontrolle', 'klassenarbeit'] },
  { id: 'verwaltung', name: 'Verwaltung', apps: ['meineklassen', 'elternbrief', 'vokabelliste', 'verwaltung'] }
]
