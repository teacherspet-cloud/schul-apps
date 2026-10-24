/**
 * App-Freigaben (23.10.2026, Wunsch der Lehrkraft; abgestimmt per Multiple Choice): Admins geben in „Schule & Daten"
 * › „App-Freigaben" Apps für Gruppen von Lehrkräften frei.
 *
 * - Eigene Gruppen: Der Admin legt sie an und ordnet Lehrkräfte zu (auch mehreren Gruppen). Eine Lehrkraft darf jede
 *   App, die eine ihrer Gruppen darf.
 * - Grundgruppe „Alle Lehrkräfte" (Kennung `alle`): Zu ihr gehört jede Lehrkraft. Anfangs sind dort alle Apps von heute
 *   freigegeben (STAND_APPS) – es ändert sich erst etwas, wenn der Admin etwas wegnimmt. Eine NEUE App steht in keiner
 *   Gruppe und ist damit zunächst nur für Admins da.
 * - Admins sehen und nutzen grundsätzlich alles.
 * - Fehlende Freigabe = gesperrt: unsichtbar in der Oberfläche und auf dem Server keine Änderungen (save/thumb/delete);
 *   eigene Materialien bleiben lesbar und lassen sich exportieren.
 *
 * Diese Datei kennt weder Datenbank noch Oberfläche – Server (server/appFreigaben.ts) und App nutzen dieselben Regeln.
 */

export interface AppGruppe {
  id: string
  name: string
  /** Kennungen der freigegebenen Apps (Programm-IDs aus renderer/modules/registry.ts) */
  apps: string[]
  /** Kennungen der Lehrkräfte (bei `alle` leer – dazu gehört jede Lehrkraft) */
  mitglieder: string[]
}

export const ALLE_GRUPPE = 'alle'

/** Die Apps für Lehrkräfte am Tag der Einführung (0.4.169) – Vorgabe der Grundgruppe */
export const STAND_APPS = [
  'arbeitsblatt',
  'vokabeltest',
  'grammatiktest',
  'lernzielkontrolle',
  'onlinetest',
  'laufendereihen',
  'freigaben',
  'sprachenlernen',
  'unterrichtsreihe',
  'meineklassen',
  'klassenarbeit',
  'rueckmeldung',
  'tafelbild',
  'elternbrief',
  'vokabelliste',
  'grammatikformen',
  'sprechpruefungen'
] as const

/** Seiten, die keine App sind und immer offen bleiben */
export const IMMER_OFFEN = ['home', 'settings', 'themen']

export const grundgruppe = (): AppGruppe => ({ id: ALLE_GRUPPE, name: 'Alle Lehrkräfte', apps: [...STAND_APPS], mitglieder: [] })

const kennung = /^[a-z0-9-]{1,40}$/

/** Gruppen aus Eingabe oder Speicher prüfen: gültige Felder, Grundgruppe immer vorhanden und vorn, keine doppelten Kennungen */
export function pruefeGruppen(roh: unknown): AppGruppe[] {
  const liste = Array.isArray(roh) ? roh : []
  const aus: AppGruppe[] = []
  const gesehen = new Set<string>()
  for (const g of liste as Record<string, unknown>[]) {
    if (!g || typeof g !== 'object') continue
    const id = String(g.id ?? '')
    if (!kennung.test(id) || gesehen.has(id)) continue
    gesehen.add(id)
    const name =
      String(g.name ?? '')
        .trim()
        .slice(0, 80) || (id === ALLE_GRUPPE ? 'Alle Lehrkräfte' : 'Gruppe')
    const apps = [...new Set((Array.isArray(g.apps) ? g.apps : []).map(String).filter((a) => kennung.test(a)))]
    const mitglieder =
      id === ALLE_GRUPPE ? [] : [...new Set((Array.isArray(g.mitglieder) ? g.mitglieder : []).map(String).filter((m) => m.length > 0 && m.length < 80))]
    aus.push({ id, name, apps, mitglieder })
  }
  const alle = aus.find((g) => g.id === ALLE_GRUPPE)
  return [alle ?? grundgruppe(), ...aus.filter((g) => g.id !== ALLE_GRUPPE)]
}

/** Apps einer Lehrkraft: Grundgruppe und alle Gruppen, in denen sie Mitglied ist */
export function appsAus(gruppen: readonly AppGruppe[], nutzerId: string): string[] {
  const apps = new Set<string>()
  for (const g of gruppen) if (g.id === ALLE_GRUPPE || g.mitglieder.includes(nutzerId)) for (const a of g.apps) apps.add(a)
  return [...apps].sort()
}

/**
 * Wer in welche Ablage schreiben darf (Kanal-Präfix → Apps). Mehrere Apps, weil manche Apps über die Ablage einer
 * anderen speichern: „Meine Klassen" legt Arbeitsblätter und Vokabeltests an, die Unterrichtsreihe Platzhalter-Blätter
 * und Tests, das Tafelbild ein Arbeitsblatt, die Vokabelliste einen Vokabeltest.
 */
export const SCHREIBER: Record<string, readonly string[]> = {
  sheets: ['arbeitsblatt', 'meineklassen', 'unterrichtsreihe', 'laufendereihen', 'tafelbild', 'onlinetest', 'freigaben'],
  exams: ['klassenarbeit', 'unterrichtsreihe', 'laufendereihen'],
  tests: ['vokabeltest', 'meineklassen', 'vokabelliste', 'unterrichtsreihe', 'laufendereihen', 'sprachenlernen'],
  kurztests: ['lernzielkontrolle', 'unterrichtsreihe', 'laufendereihen'],
  grammarTests: ['grammatiktest', 'unterrichtsreihe', 'laufendereihen'],
  rueckmeldungen: ['rueckmeldung'],
  bewertungstabellen: ['rueckmeldung'],
  nachteilsausgleiche: ['rueckmeldung'],
  elternbriefe: ['elternbrief'],
  tafelbilder: ['tafelbild']
}

const SCHREIBEN = new Set(['save', 'thumb', 'delete'])

/**
 * Darf jemand mit diesen Apps diesen Kanal nutzen? `apps = null` heißt: alles (Admin, Exe ohne Server). Gesperrt
 * werden nur Änderungen an einer Ablage, deren Apps alle fehlen – Lesen (list/get) bleibt, damit eigenes Material
 * erreichbar und exportierbar bleibt.
 */
export function kanalErlaubt(kanal: string, apps: readonly string[] | null): boolean {
  if (!apps) return true
  const [vorne, was] = kanal.split(':')
  const schreiber = SCHREIBER[vorne]
  if (!schreiber || !SCHREIBEN.has(was)) return true
  return schreiber.some((a) => apps.includes(a))
}

/**
 * Server-Routen der Apps, die es nur auf dem Server gibt (Pfad-Anfang → Apps). Gesperrt werden dort nur Änderungen
 * (alles außer GET); Lernende sind nicht betroffen. Bewusst nur Routen, die keine andere App mitbenutzt.
 */
export const ROUTEN_APPS: Record<string, readonly string[]> = {
  '/server/onlinetest': ['onlinetest'],
  '/server/reihen': ['unterrichtsreihe', 'laufendereihen'],
  '/server/sprech-bank': ['sprechpruefungen'],
  '/server/sprechen': ['sprechpruefungen'],
  // Partnerarbeit Sprechen (24.10.2026): Reiter „Sprechen" in Meine Klassen und Sprachenlernen
  '/server/partnerarbeit': ['meineklassen', 'sprachenlernen'],
  // Prüfung der Freigaben am VPS (23.10.2026): Wege, die nur Apps für Lernende und Auswertung nutzen
  '/server/blaetter': ['freigaben', 'meineklassen', 'onlinetest', 'unterrichtsreihe', 'laufendereihen'],
  '/server/tafeln': ['meineklassen', 'freigaben'],
  '/server/feedback': ['rueckmeldung', 'freigaben', 'sprachenlernen', 'unterrichtsreihe', 'laufendereihen', 'meineklassen'],
  '/server/vokabeln': ['sprachenlernen', 'meineklassen', 'sprechpruefungen']
}

export function routeErlaubt(pfad: string, methode: string, apps: readonly string[] | null): boolean {
  if (!apps || methode === 'GET') return true
  for (const [anfang, erlaubt] of Object.entries(ROUTEN_APPS))
    if (pfad === anfang || pfad.startsWith(`${anfang}/`)) return erlaubt.some((a) => apps.includes(a))
  return true
}
