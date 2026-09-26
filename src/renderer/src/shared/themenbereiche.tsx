import { Button, Group, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { create } from 'zustand'
import {
  leereThemen,
  materialSchluessel,
  verwaisteSchluessel,
  type BereichsUebernahme,
  type ThemenDaten,
  type Themenbereich,
  type Zuordnung
} from '@shared/themen'
import { einsortieren, type ThemenMaterial } from './themenVorschlag'
import { notifyError, uid } from './util'

/**
 * Themenbereiche in der Oberfläche (Paket 10b): Stand, Aktionen, Rückgängig.
 *
 * Der Stand liegt im Hauptprozess (themenbereiche.json, siehe src/shared/themen.ts); jeder
 * Aufruf liefert ihn ganz zurück, der Store übernimmt ihn. So sehen alle fünf Bibliotheken,
 * die Startseite und die übergreifende Seite immer dasselbe.
 *
 * Verschieben, Löschen und Übernehmen zeigen einen Hinweis mit „Rückgängig" – das Ordnen
 * soll man ausprobieren dürfen, ohne Angst, etwas zu verlieren (Entscheidung der Lehrkraft:
 * keine Rückfragen vor Änderungen, stattdessen Rückgängig).
 */
interface ThemenState {
  daten: ThemenDaten
  geladen: boolean
}

export const useThemen = create<ThemenState>(() => ({ daten: leereThemen(), geladen: false }))

const setze = (daten: ThemenDaten): ThemenDaten => {
  useThemen.setState({ daten, geladen: true })
  return daten
}

let laedt: Promise<ThemenDaten> | null = null

/** Stand holen (einmal; mit `neu` erneut, z. B. nach dem Einlesen einer Sicherung) */
export function ladeThemen(neu = false): Promise<ThemenDaten> {
  if (useThemen.getState().geladen && !neu) return Promise.resolve(useThemen.getState().daten)
  laedt ??= window.api.themen
    .list()
    .then(setze)
    .finally(() => {
      laedt = null
    })
  return laedt
}

/** Hinweis unten rechts mit einem Knopf „Rückgängig" */
export function zeigeRueckgaengig(text: string, rueckgaengig: () => Promise<void>): void {
  const id = `themen-${uid()}`
  notifications.show({
    id,
    autoClose: 8000,
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm" data-rueckgaengig-hinweis>
        <Text size="sm">{text}</Text>
        <Button
          size="compact-xs"
          variant="light"
          onClick={() => {
            notifications.hide(id)
            rueckgaengig().catch(notifyError)
          }}
        >
          Rückgängig
        </Button>
      </Group>
    )
  })
}

const anzahl = (n: number): string => (n === 1 ? 'Ein Material' : `${n} Materialien`)

export async function bereichAnlegen(fachId: string, name: string): Promise<Themenbereich | null> {
  try {
    const id = uid()
    const d = setze(await window.api.themen.bereich({ id, fachId, name }))
    return d.bereiche.find((b) => b.id === id) ?? null
  } catch (e) {
    notifyError(e, 'Der Themenbereich ließ sich nicht anlegen')
    return null
  }
}

export async function bereichUmbenennen(b: Themenbereich, name: string): Promise<boolean> {
  try {
    setze(await window.api.themen.bereich({ ...b, name }))
    return true
  } catch (e) {
    notifyError(e, 'Der Themenbereich ließ sich nicht umbenennen')
    return false
  }
}

/** Löschen: Die Materialien kommen nach „Ohne Themenbereich"; Rückgängig stellt Bereich, Zuordnungen und Reihenfolge wieder her. */
export async function bereichLoeschen(b: Themenbereich): Promise<void> {
  const vorher = useThemen.getState().daten
  const betroffen = Object.fromEntries(Object.entries(vorher.zuordnungen).filter(([, z]) => z.bereichId === b.id))
  const reihenfolge = vorher.reihenfolge[b.id]
  try {
    setze(await window.api.themen.delete(b.id))
    zeigeRueckgaengig(`Themenbereich „${b.name}“ gelöscht. ${anzahl(Object.keys(betroffen).length)} jetzt ohne Themenbereich.`, async () => {
      await window.api.themen.bereich(b)
      if (Object.keys(betroffen).length) await window.api.themen.zuordnen(betroffen)
      setze(reihenfolge ? await window.api.themen.reihenfolge(b.id, reihenfolge) : await window.api.themen.list())
    })
  } catch (e) {
    notifyError(e, 'Der Themenbereich ließ sich nicht löschen')
  }
}

/** Von Hand verschieben (Ziehen, „Verschieben nach …"); `ziel` null = „Ohne Themenbereich" */
export async function verschieben(schluessel: string[], ziel: Themenbereich | null): Promise<void> {
  if (!schluessel.length) return
  const vorher = useThemen.getState().daten.zuordnungen
  const alt: Record<string, Zuordnung | null> = Object.fromEntries(schluessel.map((k) => [k, vorher[k] ?? null]))
  const am = new Date().toISOString()
  try {
    setze(
      await window.api.themen.zuordnen(Object.fromEntries(schluessel.map((k) => [k, { bereichId: ziel?.id ?? null, von: 'hand', am } satisfies Zuordnung])))
    )
    zeigeRueckgaengig(`${anzahl(schluessel.length)} ${ziel ? `nach „${ziel.name}“ verschoben` : 'jetzt ohne Themenbereich'}.`, async () => {
      setze(await window.api.themen.zuordnen(alt))
    })
  } catch (e) {
    notifyError(e, 'Das Verschieben ist fehlgeschlagen')
  }
}

export async function reihenfolgeSetzen(schluessel: string, liste: string[]): Promise<void> {
  try {
    setze(await window.api.themen.reihenfolge(schluessel, liste))
  } catch (e) {
    notifyError(e)
  }
}

/** Vorschläge übernehmen; Rückgängig löscht die neu angelegten Bereiche und stellt die Zuordnungen und die Automatik wieder her */
export async function vorschlaegeUebernehmen(vorschlaege: BereichsUebernahme[], fachId: string): Promise<void> {
  const vorher = useThemen.getState().daten
  const alteIds = new Set(vorher.bereiche.map((b) => b.id))
  const schluessel = vorschlaege.flatMap((v) => v.schluessel)
  const alt: Record<string, Zuordnung | null> = Object.fromEntries(schluessel.map((k) => [k, vorher.zuordnungen[k] ?? null]))
  const automatikVorher = Boolean(vorher.automatik[fachId])
  try {
    const d = setze(await window.api.themen.uebernehmen(vorschlaege, [fachId]))
    const neu = d.bereiche.filter((b) => !alteIds.has(b.id))
    zeigeRueckgaengig(
      `${neu.length === 1 ? 'Ein Themenbereich' : `${neu.length} Themenbereiche`} angelegt, ${anzahl(schluessel.length).replace('Ein Material', 'ein Material')} einsortiert. Neue Materialien werden jetzt automatisch einsortiert.`,
      async () => {
        await window.api.themen.zuordnen(alt)
        for (const b of neu) await window.api.themen.delete(b.id)
        setze(await window.api.themen.automatik(fachId, automatikVorher))
      }
    )
  } catch (e) {
    notifyError(e, 'Die Vorschläge ließen sich nicht übernehmen')
  }
}

let gleichtAb = false

/**
 * Nach dem Laden der Materialien: neue Materialien automatisch einsortieren (Fächer mit
 * eingeschalteter Automatik) und Einträge zu Materialien wegräumen, die es nicht mehr gibt.
 * Schreibt nur, wenn sich etwas ändert.
 */
export async function abgleichen(materialien: ThemenMaterial[]): Promise<void> {
  if (gleichtAb) return
  gleichtAb = true
  try {
    const d = await ladeThemen()
    const neu: Record<string, Zuordnung | null> = einsortieren(materialien, d)
    const vorhanden = new Set(materialien.map((m) => materialSchluessel(m.moduleId, m.id)))
    for (const k of verwaisteSchluessel(d, vorhanden)) neu[k] = null
    if (Object.keys(neu).length) setze(await window.api.themen.zuordnen(neu))
  } catch {
    // Das Einsortieren ist eine Zugabe – scheitert es, bleibt die Bibliothek trotzdem benutzbar
  } finally {
    gleichtAb = false
  }
}

/** Material wurde als Kopie angelegt: Die Kopie kommt in denselben Bereich (Paket 10b) */
export async function zuordnungKopieren(moduleId: string, altId: string, neuId: string): Promise<void> {
  const z = useThemen.getState().daten.zuordnungen[materialSchluessel(moduleId, altId)]
  if (!z) return
  try {
    setze(await window.api.themen.zuordnen({ [materialSchluessel(moduleId, neuId)]: { ...z, am: new Date().toISOString() } }))
  } catch {
    // Die Kopie ist angelegt – ohne Bereich landet sie nur in „Ohne Themenbereich"
  }
}

/** Material wurde gelöscht: seine Zuordnung mit */
export async function zuordnungVergessen(moduleId: string, id: string): Promise<void> {
  const k = materialSchluessel(moduleId, id)
  if (!useThemen.getState().daten.zuordnungen[k]) return
  try {
    setze(await window.api.themen.zuordnen({ [k]: null }))
  } catch {
    // verwaiste Einträge räumt `abgleichen` später weg
  }
}

/** „Neu in diesem Bereich": das eben angelegte Material gehört von Hand in den Bereich */
export async function neuImBereich(moduleId: string, docId: string, bereich: Themenbereich): Promise<void> {
  try {
    setze(await window.api.themen.zuordnen({ [materialSchluessel(moduleId, docId)]: { bereichId: bereich.id, von: 'hand', am: new Date().toISOString() } }))
  } catch (e) {
    notifyError(e)
  }
}

/**
 * Themenbereich eines Materials – für Paket 11 („Überthema" im Kopf des Blattes: standardmäßig
 * der Themenbereich). null = ohne Bereich. Liest den geladenen Stand; wer sicher gehen will,
 * ruft vorher `ladeThemen()`.
 */
export function themenbereichVon(moduleId: string, docId: string, daten = useThemen.getState().daten): Themenbereich | null {
  const z = daten.zuordnungen[materialSchluessel(moduleId, docId)]
  return z?.bereichId ? (daten.bereiche.find((b) => b.id === z.bereichId) ?? null) : null
}

/** Name des Themenbereichs eines Materials (leer ohne Bereich) */
export const themenbereichName = (moduleId: string, docId: string): string => themenbereichVon(moduleId, docId)?.name ?? ''

/** Dasselbe als Hook – folgt Umbenennen und Verschieben sofort */
export function useThemenbereich(moduleId: string, docId: string): Themenbereich | null {
  return useThemen((s) => themenbereichVon(moduleId, docId, s.daten))
}
