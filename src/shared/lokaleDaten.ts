/**
 * Bestandsaufnahme aller lokalen Ablagen (23.10.2026, Nachprüfung des Schulträgers).
 *
 * Befund (kritisch): personenbezogene Daten lagen unverschlüsselt auf den Geräten – Rückmeldungen
 * mit Schülertexten und Namen, Elternbriefe, gemerkte Nachteilsausgleiche je Person; die tägliche
 * Sicherung als Klartext-JSON (iPad: mit Hinweis, sie in die iCloud zu kopieren); unterbrochene
 * KI-Aufträge samt Eingaben im localStorage des iPads. Erlass Niedersachsen: auf privaten
 * Mobilgeräten keine personenbezogenen Daten, auf privaten PCs nur verschlüsselt und genehmigt.
 *
 * Geräte: PC = App am PC (Electron, userData = %APPDATA%/schul-apps) · iPad = iPad-App (Capacitor,
 * userData = Library/SchulApps) · Browser = Oberfläche im Browser (Schulserver oder Netzzugang des
 * PCs) · Online = Exe „Schul-Apps Online" (src/client, lädt die Oberfläche vom Schulserver).
 * Der Schulserver selbst ist kein Endgerät und hier nicht aufgeführt (Ablage je Nutzer, server/).
 *
 * ┌──────────────────────────────┬──────────────┬───────────────┬──────────────┬────────────────────────────────────────────────┐
 * │ Ablage                       │ Art          │ Geräte        │ Personenbez. │ Schutz (Stand 23.10.2026)                       │
 * ├──────────────────────────────┼──────────────┼───────────────┼──────────────┼────────────────────────────────────────────────┤
 * │ rueckmeldungen/              │ Ordner       │ PC, iPad      │ SCHÜLER      │ AES-256-GCM; PC: Schlüssel per DPAPI, iPad:     │
 * │   (Namen, Schülertexte,      │              │               │ (Namen,      │ Schlüsselbund (nur dieses Gerät) + von der      │
 * │   Einstufungen/Noten)        │              │               │ Texte, Noten)│ iCloud-Sicherung ausgenommen                    │
 * │ elternbriefe/                │ Ordner       │ PC, iPad      │ SCHÜLER      │ wie oben                                        │
 * │ nachteilsausgleiche/         │ Ordner       │ PC, iPad      │ SCHÜLER (NTA)│ wie oben                                        │
 * │ sicherungen/ (PC),           │ Ordner       │ PC, iPad      │ SCHÜLER      │ nur verschlüsselt (Umschlag, ruhendFormat.ts);  │
 * │ Dokumente/Sicherungen (iPad) │              │               │ (Kopien)     │ Klartext nur per ausdrücklichem Export          │
 * │ Kopie-Ordner der Sicherung   │ Ordner       │ PC            │ SCHÜLER      │ dieselbe verschlüsselte Datei                   │
 * │ datenschluessel.bin          │ Datei        │ PC            │ – (Schlüssel)│ DPAPI (safeStorage), nie in einer Sicherung     │
 * │ Schlüsselbund „datenschl…"   │ Schlüsselbund│ iPad          │ – (Schlüssel)│ ThisDeviceOnly, nicht in Backups                │
 * │ settings.json                │ Datei        │ PC, iPad, Onl.│ Lehrkraft    │ Klartext (eigene Angaben: Name, Schule, IServ-  │
 * │                              │              │               │              │ Benutzername) – keine Schülerdaten              │
 * │ secrets.json                 │ Datei/Bund   │ PC, iPad      │ Lehrkraft    │ DPAPI bzw. Schlüsselbund (API-Schlüssel)        │
 * │ unterschrift.png             │ Datei        │ PC, iPad      │ Lehrkraft    │ Klartext (eigene Unterschrift)                  │
 * │ übrige Materialordner        │ Ordner       │ PC, iPad      │ nein         │ Unterrichtsmaterial ohne Schülerbezug           │
 * │ Protokoll, Verbrauch, Caches │ Datei        │ PC, iPad      │ nein         │ nur Fehlermeldungen/Zähler (entschärft)         │
 * │ KI-Arbeitsordner, PDF-Temp   │ tmp          │ PC            │ ggf. SCHÜLER │ flüchtig, nach dem Auftrag gelöscht, Reste      │
 * │                              │              │               │ (flüchtig)   │ beim Start (cleanupWorkDirs)                    │
 * │ Dokumente/Schulmaterial      │ Dokumente    │ iPad          │ ggf. SCHÜLER │ nur ausdrückliche Ausgaben (PDF/Word) der       │
 * │                              │              │               │              │ Lehrkraft – bewusst exportiert, NICHT verschl.  │
 * │ schul-apps-auftraege-        │ localStorage │ iPad          │ ENTSCHÄRFT   │ Rückmeldung/Elternbrief: ohne Eingaben, ohne    │
 * │   unterbrochen               │              │               │              │ Titel; beim Abmelden gelöscht                   │
 * │ onlinetest-<id>              │ localStorage │ Browser (Kind)│ SCHÜLER      │ eigene Antworten des Kindes bis zur Abgabe;     │
 * │                              │              │               │ (eigene)     │ nach Abgabe und beim Abmelden gelöscht          │
 * │ sa-regal-daten-<konto>       │ sessionSt.   │ Browser (Kind)│ SCHÜLER      │ nur Sitzung, beim Abmelden gelöscht             │
 * │ schulapps-netz-token         │ localStorage │ Browser (PC-  │ – (Zugang)   │ Anmeldung am Netzzugang des PCs                 │
 * │                              │              │ Netzzugang)   │              │                                                 │
 * │ Sitzungs-Cookie              │ Cookie       │ Browser, Onl. │ – (Zugang)   │ HttpOnly, Partition persist:schulapps-online    │
 * │ iserv-passwort.bin           │ Datei        │ Online        │ Lehrkraft    │ DPAPI (safeStorage)                             │
 * │ server.txt, fenster.json     │ Datei        │ Online, PC    │ nein         │ Adresse, Fensterlage                            │
 * │ übrige localStorage-/session-│ Web-Speicher │ alle          │ nein         │ Ansichten, Auswahl, Zähler (siehe Liste unten)  │
 * │   Storage-Schlüssel          │              │               │              │                                                 │
 * │ IndexedDB „schulapps-ruhend" │ IndexedDB    │ iPad-Prüfbuild│ – (Schlüssel)│ nur im Browser-Prüfbuild: CryptoKey, nicht      │
 * │                              │              │ (Browser)     │              │ auslesbar (schwächer als der Schlüsselbund)     │
 * └──────────────────────────────┴──────────────┴───────────────┴──────────────┴────────────────────────────────────────────────┘
 *
 * Die Listen unten sind die maschinenlesbare Fassung dieser Tabelle. tests/lokaleDaten.test.ts
 * durchsucht die Quellen und verlangt, dass jede Datei, die lokal schreibt (localStorage,
 * sessionStorage, IndexedDB, Ablagen unter userData), hier steht – eine neue Ablage ohne Eintrag
 * fällt so auf, bevor sie Schülerdaten im Klartext ablegt.
 */

export type Geraet = 'pc' | 'ipad' | 'browser' | 'online'
export type Personenbezug = 'schueler' | 'lehrkraft' | 'keiner'
export type Speicherart = 'ordner' | 'datei' | 'localStorage' | 'sessionStorage' | 'indexedDB' | 'schluesselbund' | 'cookie' | 'dokumente' | 'tmp'

export interface LokalerSpeicher {
  /** Ordner/Datei unter userData bzw. Schlüssel im Web-Speicher; „*" am Ende = Präfix */
  id: string
  art: Speicherart
  geraete: Geraet[]
  personenbezug: Personenbezug
  inhalt: string
  schutz: string
  /** Quelldateien, die diese Ablage schreiben (relativ zum Projekt) */
  quellen: string[]
}

const DOKUMENTE = 'src/main/services/storage/dokumente.ts'
const VERSCHLUESSELT = 'AES-256-GCM (PC: Datenschlüssel per DPAPI; iPad: Schlüsselbund, nur dieses Gerät, von der iCloud-Sicherung ausgenommen)'

/** Ablagen unter userData (PC und iPad, Online-Exe nur wo angegeben) */
export const DATEI_ABLAGEN: LokalerSpeicher[] = [
  { id: 'rueckmeldungen', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'schueler', inhalt: 'Rückmeldungen: Namen, Schülertexte, Einstufungen, Noten', schutz: VERSCHLUESSELT, quellen: [DOKUMENTE] },
  { id: 'elternbriefe', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'schueler', inhalt: 'Elternbriefe: Namen der Kinder, Anlässe', schutz: VERSCHLUESSELT, quellen: [DOKUMENTE] },
  { id: 'nachteilsausgleiche', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'schueler', inhalt: 'gemerkte Nachteilsausgleiche je Person (Name, Maßnahmen)', schutz: VERSCHLUESSELT, quellen: [DOKUMENTE] },
  { id: 'sicherungen', art: 'ordner', geraete: ['pc'], personenbezug: 'schueler', inhalt: 'tägliche Sicherungen (Kopien aller Ablagen)', schutz: 'nur verschlüsselt (Umschlag mit dem Datenschlüssel)', quellen: ['src/main/services/storage/autoSicherung.ts'] },
  { id: 'bewertungstabellen', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Vorlagen für Bewertungstabellen (Kriterien)', schutz: 'Klartext', quellen: [DOKUMENTE] },
  { id: 'tafelbilder', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Tafelbilder', schutz: 'Klartext', quellen: [DOKUMENTE] },
  { id: 'arbeitsblaetter', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Arbeitsblätter', schutz: 'Klartext', quellen: ['src/main/services/storage/worksheets.ts'] },
  { id: 'vokabeltests', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Vokabeltests', schutz: 'Klartext', quellen: ['src/main/services/storage/vocabTests.ts'] },
  { id: 'klassenarbeiten', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Klassenarbeiten (Aufgaben, keine Ergebnisse)', schutz: 'Klartext', quellen: ['src/main/services/storage/exams.ts'] },
  { id: 'grammatiktests', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Grammatiktests', schutz: 'Klartext', quellen: ['src/main/services/storage/grammarTests.ts'] },
  { id: 'lernzielkontrollen', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Lernzielkontrollen', schutz: 'Klartext', quellen: ['src/main/services/storage/kurztests.ts'] },
  { id: 'piktogramme', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'eigene Piktogramme', schutz: 'Klartext', quellen: ['src/main/services/storage/pictograms.ts'] },
  { id: 'hoertexte', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'vertonte Hörtexte (MP3)', schutz: 'Klartext', quellen: ['src/main/services/audio/elevenlabs.ts', 'src/main/services/audio/importAudio.ts'] },
  { id: 'medienbank', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Beispielbilder und Aussprache der Vokabeln', schutz: 'Klartext', quellen: ['src/main/services/storage/medienbank.ts'] },
  { id: 'lehrwerke', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Lehrwerke und Vokabellisten', schutz: 'Klartext', quellen: ['src/main/services/storage/textbooks.ts', 'src/main/services/storage/verbListen.ts'] },
  { id: 'lehrwerke-grammatik', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Grammatikformen der Lehrwerke', schutz: 'Klartext', quellen: ['src/main/services/storage/lehrwerkGrammatik.ts'] },
  { id: 'maskottchen', art: 'ordner', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Maskottchen (Bilder)', schutz: 'Klartext', quellen: ['src/main/services/storage/maskottchen.ts'] },
  { id: 'ki', art: 'ordner', geraete: [], personenbezug: 'lehrkraft', inhalt: 'nur Server: Anmeldung der KI-Programme je Nutzer', schutz: 'auf dem Server', quellen: ['src/main/services/ai/cli.ts'] },
  { id: 'settings.json', art: 'datei', geraete: ['pc', 'ipad', 'online'], personenbezug: 'lehrkraft', inhalt: 'Einstellungen: Name der Lehrkraft, Schule, IServ-Benutzername – keine Schülerdaten', schutz: 'Klartext (eigene Angaben)', quellen: ['src/main/services/storage/settings.ts'] },
  { id: 'secrets.json', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'lehrkraft', inhalt: 'API-Schlüssel', schutz: 'PC: DPAPI je Eintrag; iPad: Schlüsselbund', quellen: ['src/main/services/storage/settings.ts'] },
  { id: 'datenschluessel.bin', art: 'datei', geraete: ['pc'], personenbezug: 'keiner', inhalt: 'Datenschlüssel der Verschlüsselung', schutz: 'DPAPI (safeStorage); nie in einer Sicherung', quellen: ['src/main/services/storage/ruhend.ts'] },
  { id: 'logo.png', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Schullogo', schutz: 'Klartext', quellen: ['src/main/services/storage/branding.ts'] },
  { id: 'unterschrift.png', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'lehrkraft', inhalt: 'Unterschrift der Lehrkraft für Elternbriefe', schutz: 'Klartext (eigene Daten)', quellen: ['src/main/services/storage/branding.ts'] },
  { id: 'worksheet-designs.json', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Designvorlagen', schutz: 'Klartext', quellen: ['src/main/services/storage/designs.ts'] },
  { id: 'worksheet-designs-version.json', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Fassung der Designvorlagen', schutz: 'Klartext', quellen: ['src/main/services/storage/designs.ts'] },
  { id: 'model-cache.json', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Modelllisten der Anbieter', schutz: 'Klartext', quellen: ['src/main/services/ai/models.ts'] },
  { id: 'themenbereiche.json', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Themenbereiche und Zuordnung der Materialien', schutz: 'Klartext', quellen: ['src/main/services/storage/themen.ts'] },
  { id: 'quellen-ablehnungen.json', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'abgelehnte Quellen', schutz: 'Klartext', quellen: ['src/main/services/storage/quellenAblehnungen.ts'] },
  { id: 'vocab-library.json', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'eigene Vokabellisten', schutz: 'Klartext', quellen: ['src/main/services/storage/settings.ts'] },
  { id: 'verbrauch.json', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'KI-Verbrauchszähler', schutz: 'Klartext', quellen: ['src/main/services/ai/verbrauch.ts'] },
  { id: 'aussprache-woerterbuecher.json', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Kennungen der Aussprache-Wörterbücher', schutz: 'Klartext', quellen: ['src/main/services/audio/elevenlabs.ts'] },
  { id: 'protokoll.log', art: 'datei', geraete: ['pc', 'ipad'], personenbezug: 'keiner', inhalt: 'Fehlerprotokoll (Meldungen entschärft, keine Inhalte)', schutz: 'Klartext', quellen: ['src/main/services/protokoll.ts'] },
  { id: 'fenster.json', art: 'datei', geraete: ['pc', 'online'], personenbezug: 'keiner', inhalt: 'Fensterlage', schutz: 'Klartext', quellen: ['src/main/index.ts', 'src/client/main.ts'] },
  { id: 'server.txt', art: 'datei', geraete: ['online'], personenbezug: 'keiner', inhalt: 'Adresse des Schulservers (optional)', schutz: 'Klartext', quellen: ['src/client/main.ts'] },
  { id: 'iserv-passwort.bin', art: 'datei', geraete: ['online'], personenbezug: 'lehrkraft', inhalt: 'IServ-Passwort der Lehrkraft', schutz: 'DPAPI (safeStorage)', quellen: ['src/client/main.ts'] },
  { id: 'KI-Arbeitsordner (tmp)', art: 'tmp', geraete: ['pc'], personenbezug: 'schueler', inhalt: 'Eingaben an die KI-Programme (Abo-Zugang), flüchtig', schutz: 'nach dem Auftrag gelöscht, Reste beim Start (cleanupWorkDirs)', quellen: ['src/main/services/ai/cli.ts'] },
  { id: 'PDF-Zwischendateien (tmp)', art: 'tmp', geraete: ['pc'], personenbezug: 'schueler', inhalt: 'HTML für den PDF-Druck, flüchtig', schutz: 'nach dem Druck gelöscht', quellen: ['src/main/services/export/pdf.ts', 'src/main/services/export/fillablePdf.ts'] },
  { id: 'Dokumente/Sicherungen', art: 'dokumente', geraete: ['ipad'], personenbezug: 'schueler', inhalt: 'tägliche Sicherungen der iPad-App', schutz: 'nur verschlüsselt (Umschlag, Schlüssel im Schlüsselbund)', quellen: ['src/mobil/sicherung/autoSicherung.ts'] },
  { id: 'Dokumente/Schulmaterial', art: 'dokumente', geraete: ['ipad'], personenbezug: 'schueler', inhalt: 'ausdrückliche Ausgaben (PDF, Word, MP3) – bei Rückmeldungen/Elternbriefen personenbezogen', schutz: 'bewusster Export der Lehrkraft, nicht verschlüsselt', quellen: ['src/mobil/umgebung.ts'] },
  { id: 'Schlüsselbund (secrets, iserv, datenschluessel)', art: 'schluesselbund', geraete: ['ipad'], personenbezug: 'lehrkraft', inhalt: 'API-Schlüssel, IServ-Passwort, Datenschlüssel', schutz: 'iOS-Schlüsselbund, ThisDeviceOnly', quellen: ['src/mobil/plugins.ts', 'src/mobil/vfs/ruhendIos.ts'] }
]

/** Web-Speicher (localStorage, sessionStorage, IndexedDB, Cookies) */
export const BROWSER_SPEICHER: LokalerSpeicher[] = [
  {
    id: 'schul-apps-auftraege-unterbrochen',
    art: 'localStorage',
    geraete: ['ipad'],
    personenbezug: 'keiner',
    inhalt: 'laufende KI-Aufträge zum Fortsetzen nach einem Neustart',
    schutz: 'Rückmeldung/Elternbrief ENTSCHÄRFT: ohne Eingaben und ohne Titel (shared/auftraege.ts); beim Abmelden gelöscht',
    quellen: ['src/renderer/src/shared/auftraege.ts']
  },
  { id: 'onlinetest-*', art: 'localStorage', geraete: ['browser'], personenbezug: 'schueler', inhalt: 'eigene Antworten des Kindes bis zur Abgabe (Schutz vor Verbindungsabbruch)', schutz: 'nach Abgabe und beim Abmelden gelöscht', quellen: ['src/renderer/src/modules/onlinetest/SchuelerBereich.tsx'] },
  { id: 'sa-regal-daten-*', art: 'sessionStorage', geraete: ['browser'], personenbezug: 'schueler', inhalt: 'Lernstand des Kindes (Regal), Zwischenspeicher der Sitzung', schutz: 'nur Sitzung, beim Abmelden gelöscht', quellen: ['src/renderer/src/modules/lernen/regal/regalDaten.ts'] },
  { id: 'schulapps-netz-token', art: 'localStorage', geraete: ['browser'], personenbezug: 'keiner', inhalt: 'Anmeldung am Netzzugang des PCs (Zugang, kein Inhalt)', schutz: 'Klartext', quellen: ['src/renderer/src/shared/netzZugang.ts'] },
  { id: 'Sitzungs-Cookie', art: 'cookie', geraete: ['browser', 'online'], personenbezug: 'keiner', inhalt: 'Sitzung am Schulserver', schutz: 'HttpOnly; Online-Exe: Partition persist:schulapps-online', quellen: ['src/client/main.ts'] },
  { id: 'schulapps.secrets*', art: 'localStorage', geraete: ['ipad'], personenbezug: 'lehrkraft', inhalt: 'nur Browser-Prüfbuild: Ersatz des Schlüsselbunds', schutz: 'im Betrieb nie benutzt (Schlüsselbund)', quellen: ['src/mobil/plugins.ts'] },
  { id: 'schulapps-ruhend', art: 'indexedDB', geraete: ['ipad'], personenbezug: 'keiner', inhalt: 'nur Browser-Prüfbuild: Datenschlüssel als nicht auslesbarer CryptoKey', schutz: 'schwächer als der Schlüsselbund (Browserprofil)', quellen: ['src/mobil/vfs/ruhendIos.ts'] },
  { id: 'schulapps.pcKi.*', art: 'localStorage', geraete: ['ipad'], personenbezug: 'keiner', inhalt: 'KI-Stand des PCs, offene Aufträge (nur Fingerabdruck und Kanal), Gerätekennung', schutz: 'Klartext', quellen: ['src/mobil/start.ts'] },
  {
    id: 'Ansichten, Auswahl, Entwürfe von Unterrichtsmaterial, Zähler',
    art: 'localStorage',
    geraete: ['pc', 'ipad', 'browser', 'online'],
    personenbezug: 'keiner',
    inhalt: 'Leiste, Filter, zuletzt gewählte Fächer/Lehrwerke, Entwürfe von Aufgaben (ohne Schülerbezug), Zähler, Dauern – keine Namen',
    schutz: 'Klartext',
    quellen: [
      'src/renderer/src/App.tsx',
      'src/renderer/src/modules/arbeitsblatt/didactics/grammatikAuswahl.ts',
      'src/renderer/src/modules/elternbrief/steps/Bibliothek.tsx',
      'src/renderer/src/modules/grammatikformen/bank.ts',
      'src/renderer/src/modules/grammatikformen/GrammatikformenModule.tsx',
      'src/renderer/src/modules/lernen/apostrophHinweis.ts',
      'src/renderer/src/modules/lernen/GrammatikTraining.tsx',
      'src/renderer/src/modules/lernen/kurs/Kasten.tsx',
      'src/renderer/src/modules/lernen/regal/Wortliste.tsx',
      'src/renderer/src/modules/lernen/VokabelLeiter.tsx',
      'src/renderer/src/modules/meineklassen/klassenAblage.ts',
      'src/renderer/src/modules/meineklassen/klassenMaterial.ts',
      'src/renderer/src/modules/onlinetest/ErinnerungenFrage.tsx',
      'src/renderer/src/modules/onlinetest/OnlinetestModule.tsx',
      'src/renderer/src/modules/onlinetest/schuelerDarstellung.ts',
      'src/renderer/src/modules/sprechpruefungen/SprechpruefungenModule.tsx',
      'src/renderer/src/modules/tafelbild/steps/Bearbeiten.tsx',
      'src/renderer/src/modules/unterrichtsreihe/planungAuftrag.ts',
      'src/renderer/src/modules/unterrichtsreihe/reiheAusSchulbuch.ts',
      'src/renderer/src/modules/unterrichtsreihe/ReiheKopf.tsx',
      'src/renderer/src/modules/unterrichtsreihe/reiheTest.ts',
      'src/renderer/src/modules/vokabelliste/VokabellisteModule.tsx',
      'src/renderer/src/modules/vokabeltest/generation/formatAuswahl.ts',
      'src/renderer/src/modules/vokabeltest/steps/TextbookPicker.tsx',
      'src/renderer/src/modules/vokabeltest/steps/VocabStep.tsx',
      'src/renderer/src/shared/aiProgress.ts',
      'src/renderer/src/shared/components/Fachordner.tsx',
      'src/renderer/src/shared/components/MaterialienMobil.tsx',
      'src/renderer/src/shared/components/PrintPreview.tsx',
      'src/renderer/src/shared/components/SortierTabelle.tsx',
      'src/renderer/src/shared/components/Themenbereiche.tsx',
      'src/renderer/src/shared/components/ThemenBibliothek.tsx',
      'src/renderer/src/shared/fachschaftNeu.ts',
      'src/renderer/src/shared/haeufig.ts',
      'src/renderer/src/shared/lastChoice.ts',
      'src/renderer/src/shared/loesungen.ts',
      'src/renderer/src/shared/reiheZuordnung.tsx',
      'src/renderer/src/shared/restzeit.ts',
      'src/renderer/src/shared/sitzung.ts',
      'src/renderer/src/shared/touch/zoom.tsx',
      'src/renderer/src/shell/SettingsPage.tsx',
      'src/renderer/src/shell/StartAnzahl.tsx'
    ]
  },
  {
    id: 'Aufklappzustände und Rücksprünge der Sitzung',
    art: 'sessionStorage',
    geraete: ['pc', 'ipad', 'browser', 'online'],
    personenbezug: 'keiner',
    inhalt: 'offene Bögen (nur Kennungen), Rücksprung im Regal, gewählter Kurs, Neuladesperre',
    schutz: 'nur Sitzung',
    quellen: [
      'src/renderer/src/modules/lernen/regal/ordnerAnimation.ts',
      'src/renderer/src/modules/lernen/regal/Sprachstand.tsx',
      'src/renderer/src/modules/rueckmeldung/steps/bogenListe.ts',
      'src/renderer/src/shared/components/Fehlergrenze.tsx'
    ]
  }
]

export const ALLE_LOKALEN_SPEICHER: LokalerSpeicher[] = [...DATEI_ABLAGEN, ...BROWSER_SPEICHER]

/**
 * Ordner unter userData mit Schülerdaten – sie werden verschlüsselt (PC: storage/ruhend.ts,
 * iPad: vfs/ruhendIos.ts) und auf dem iPad von der iCloud-Sicherung ausgenommen.
 */
export const PERSONENBEZOGENE_ORDNER: readonly string[] = DATEI_ABLAGEN.filter(
  (a) => a.art === 'ordner' && a.personenbezug === 'schueler' && a.id !== 'sicherungen'
).map((a) => a.id)

/** Liegt ein Pfad relativ zu userData („rueckmeldungen/x.json") in einem personenbezogenen Ordner? */
export function istPersonenbezogenerPfad(rel: string): boolean {
  const erster = rel.replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0]
  return PERSONENBEZOGENE_ORDNER.includes(erster)
}

/**
 * Programme, deren unterbrochene KI-Aufträge (iPad) Personenbezug haben können: Sie werden ohne
 * Eingaben und mit neutralem Titel gemerkt (shared/auftraege.ts) – fortsetzen geht dann nicht,
 * der Auftrag erscheint als unterbrochen und kann neu gestartet werden.
 */
export const AUFTRAEGE_MIT_PERSONENBEZUG: Readonly<Record<string, string>> = {
  rueckmeldung: 'Rückmeldung',
  elternbrief: 'Elternbrief'
}

/** Schlüssel im localStorage, die beim Abmelden der Lehrkraft gelöscht werden */
export const BEIM_ABMELDEN_LOESCHEN: readonly string[] = ['schul-apps-auftraege-unterbrochen']

/** Beim Abmelden: Personenbezogenes dieses Kontos aus dem Web-Speicher nehmen */
export function personenbezogenesAbmelden(speicher: Pick<Storage, 'removeItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): void {
  if (!speicher) return
  for (const k of BEIM_ABMELDEN_LOESCHEN) {
    try {
      speicher.removeItem(k)
    } catch {
      // Speicher gesperrt – nichts zu tun
    }
  }
}
