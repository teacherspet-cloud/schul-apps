import { Button, Group, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { create } from 'zustand'
import {
  automatikAn,
  leereThemen,
  materialSchluessel,
  nachfahrenVon,
  obersterBereich,
  pfadVon,
  verwaisteSchluessel,
  type BereichsUebernahme,
  type ThemenDaten,
  type Themenbereich,
  type Zuordnung
} from '@shared/themen'
import { automatischEinsortieren, type ThemenMaterial } from './themenVorschlag'
import { katalogFuer, ladeLehrplan } from './themenKatalog'
import { useAppSettings } from './settingsStore'
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

/** Neuer Bereich – mit `elternId` als Unterbereich (Paket 12) */
export async function bereichAnlegen(fachId: string, name: string, elternId?: string | null): Promise<Themenbereich | null> {
  try {
    const id = uid()
    const d = setze(await window.api.themen.bereich({ id, fachId, name, ...(elternId ? { elternId } : {}) }))
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

/**
 * Löschen samt Unterbereichen: Die Materialien rücken in den Oberbereich (bzw. nach „Ohne
 * Themenbereich"); Rückgängig stellt alle Bereiche, Zuordnungen und Reihenfolgen wieder her.
 */
export async function bereichLoeschen(b: Themenbereich): Promise<void> {
  const vorher = useThemen.getState().daten
  const weg = new Set([b.id, ...nachfahrenVon(vorher, b.id)])
  // Von oben nach unten – beim Wiederherstellen muss der Oberbereich zuerst da sein
  const bereiche = vorher.bereiche.filter((x) => weg.has(x.id)).sort((x, y) => pfadVon(vorher, x.id).length - pfadVon(vorher, y.id).length)
  const betroffen = Object.fromEntries(Object.entries(vorher.zuordnungen).filter(([, z]) => z.bereichId && weg.has(z.bereichId)))
  const reihenfolgen = [...weg].flatMap((id) => (vorher.reihenfolge[id] ? [[id, vorher.reihenfolge[id]] as const] : []))
  const eltern = b.elternId ? vorher.bereiche.find((x) => x.id === b.elternId) : undefined
  const n = Object.keys(betroffen).length
  try {
    setze(await window.api.themen.delete(b.id))
    const unter = bereiche.length - 1
    zeigeRueckgaengig(
      `Themenbereich „${b.name}“${unter ? ` mit ${unter === 1 ? 'einem Unterbereich' : `${unter} Unterbereichen`}` : ''} gelöscht.${n ? ` ${anzahl(n)} jetzt ${eltern ? `in „${eltern.name}“` : 'ohne Themenbereich'}.` : ''}`,
      async () => {
        for (const x of bereiche) await window.api.themen.bereich(x)
        if (n) await window.api.themen.zuordnen(betroffen)
        for (const [id, liste] of reihenfolgen) await window.api.themen.reihenfolge(id, [...liste])
        setze(await window.api.themen.list())
      }
    )
  } catch (e) {
    notifyError(e, 'Der Themenbereich ließ sich nicht löschen')
  }
}

/** Einen Bereich unter einen anderen hängen oder nach oben (`ziel` null) – mit Rückgängig (Paket 12) */
export async function bereichUmhaengen(b: Themenbereich, ziel: Themenbereich | null): Promise<void> {
  const vorher = b.elternId ?? null
  if (vorher === (ziel?.id ?? null)) return
  try {
    setze(await window.api.themen.verschieben(b.id, ziel?.id ?? null))
    zeigeRueckgaengig(`„${b.name}“ ${ziel ? `liegt jetzt unter „${ziel.name}“` : 'steht jetzt oben'}.`, async () => {
      setze(await window.api.themen.verschieben(b.id, vorher))
    })
  } catch (e) {
    notifyError(e, 'Der Themenbereich ließ sich nicht verschieben')
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
  const automatikVorher = automatikAn(vorher, fachId)
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
    /*
     * Seit Paket 12 auch in die Hierarchie aus dem Lehrplan: Die Lehrplandatei des eigenen
     * Landes (Einstellungen › Schule), sonst die mitgebrachten Themen (themenKatalog.ts).
     */
    const { stateId, schoolTypeId } = useAppSettings.getState().settings.defaults
    const lehrplan = await ladeLehrplan(stateId)
    const { zuordnungen, uebernahmen } = automatischEinsortieren(materialien, d, (fachId) => katalogFuer(fachId, lehrplan, schoolTypeId))
    const neu: Record<string, Zuordnung | null> = zuordnungen
    const vorhanden = new Set(materialien.map((m) => materialSchluessel(m.moduleId, m.id)))
    for (const k of verwaisteSchluessel(d, vorhanden)) neu[k] = null
    if (Object.keys(neu).length) setze(await window.api.themen.zuordnen(neu))
    if (uebernahmen.length) {
      // Neue Bereiche aus dem Lehrplan: sichtbar melden und rückgängig machbar – nichts soll ungefragt verschwinden
      const alteIds = new Set(useThemen.getState().daten.bereiche.map((b) => b.id))
      const schluessel = uebernahmen.flatMap((u) => u.schluessel)
      const danach = setze(await window.api.themen.uebernehmen(uebernahmen, []))
      const angelegt = danach.bereiche.filter((b) => !alteIds.has(b.id))
      if (angelegt.length)
        zeigeRueckgaengig(
          `${anzahl(schluessel.length)} nach dem Lehrplan einsortiert (${uebernahmen
            .slice(0, 3)
            .map((u) => [...(u.pfad ?? []), u.name].join(' › '))
            .join('; ')}${uebernahmen.length > 3 ? ' …' : ''}).`,
          async () => {
            // Als „Ohne Themenbereich" von Hand festhalten – sonst sortierte die Automatik sofort wieder ein
            const am = new Date().toISOString()
            await window.api.themen.zuordnen(Object.fromEntries(schluessel.map((k) => [k, { bereichId: null, von: 'hand', am } satisfies Zuordnung])))
            for (const b of [...angelegt].reverse()) await window.api.themen.delete(b.id).catch(() => undefined)
            setze(await window.api.themen.list())
          }
        )
    }
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
 * Themenbereich eines Materials – der, in dem es direkt liegt (mit Unterbereichen der tiefste).
 * null = ohne Bereich. Liest den geladenen Stand; wer sicher gehen will, ruft vorher `ladeThemen()`.
 */
export function themenbereichVon(moduleId: string, docId: string, daten = useThemen.getState().daten): Themenbereich | null {
  const z = daten.zuordnungen[materialSchluessel(moduleId, docId)]
  return z?.bereichId ? (daten.bereiche.find((b) => b.id === z.bereichId) ?? null) : null
}

/**
 * Der Bereich, der als ÜBERTHEMA im Kopf steht (Paket 11, festgelegt in Paket 12): der OBERSTE
 * Bereich über dem Material, also die Unterrichtseinheit direkt unter dem Fach – nicht der
 * Unterbereich, in dem es liegt (Begründung bei `obersterBereich` in src/shared/themen.ts).
 * Ohne Unterbereiche ist das derselbe wie bisher.
 */
export function ueberthemaBereichVon(moduleId: string, docId: string, daten = useThemen.getState().daten): Themenbereich | null {
  const b = themenbereichVon(moduleId, docId, daten)
  return b ? obersterBereich(daten, b.id) : null
}

/** Name des Überthema-Bereichs eines Materials (leer ohne Bereich) */
export const themenbereichName = (moduleId: string, docId: string): string => ueberthemaBereichVon(moduleId, docId)?.name ?? ''

/** Dasselbe als Hook – folgt Umbenennen und Verschieben sofort. Liefert den Bereich fürs Überthema (den obersten). */
export function useThemenbereich(moduleId: string, docId: string): Themenbereich | null {
  return useThemen((s) => ueberthemaBereichVon(moduleId, docId, s.daten))
}
