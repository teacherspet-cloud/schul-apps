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
import { automatischEinsortieren, einsortierBilanz, neuEinsortierenPlan, type KatalogThema, type ThemenMaterial } from './themenVorschlag'
import { katalogFuer, ladeLehrplan } from './themenKatalog'
import { useAppSettings } from './settingsStore'
import { notifyError, uid } from './util'
import { touchAktiv, TELEFON } from './touch/touchModus'

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
  /**
   * In dieser Sitzung (seit dem Start der App) angelegte Bereiche (Paket 15). Die Bibliotheken
   * blenden bei „nur <Art>" Bereiche ohne Materialien dieser Art aus – ein eben angelegter,
   * noch leerer Ordner verschwände dann sofort, als wäre das Anlegen gescheitert. Diese
   * Bereiche bleiben deshalb sichtbar, bis die App neu startet; danach gilt die Regel wieder.
   * Absichtlich nur im Speicher und für alle Bibliotheken gemeinsam: Wer den Bereich in der
   * Arbeitsblatt-Bibliothek anlegt und zu den Lernzielkontrollen wechselt, will ihn dort befüllen.
   */
  sitzung: string[]
}

export const useThemen = create<ThemenState>(() => ({ daten: leereThemen(), geladen: false, sitzung: [] }))

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

/** Telefon (wie `useTelefon`, ohne React) */
const amTelefon = (): boolean => {
  try {
    return touchAktiv() && window.matchMedia(TELEFON).matches
  } catch {
    return false
  }
}

/**
 * Hinweis unten rechts mit einem Knopf „Rückgängig". Am Telefon (10.10.2026, Befund: der lange Text „N Materialien nach
 * dem Lehrplan einsortiert (…)" verdeckte den Kopf, der Knopf war abgeschnitten) mit `kurz` nur der kurze Text, dazu
 * „Ansehen"; die Knöpfe brechen in eine eigene Zeile um statt abgeschnitten zu werden.
 */
export function zeigeRueckgaengig(text: string, rueckgaengig: () => Promise<void>, kurz?: { text: string; ansehen: () => void }): void {
  const id = `themen-${uid()}`
  const telefon = amTelefon()
  const knapp = telefon && kurz
  notifications.show({
    id,
    autoClose: 8000,
    message: (
      <Group justify="space-between" wrap={telefon ? 'wrap' : 'nowrap'} gap="sm" data-rueckgaengig-hinweis data-kurz={knapp ? true : undefined}>
        <Text size="sm" style={{ minWidth: 0 }}>
          {knapp ? kurz.text : text}
        </Text>
        <Group gap={6} wrap="nowrap" style={{ flex: 'none' }}>
          {knapp && (
            <Button
              size="compact-xs"
              variant="subtle"
              data-hinweis-ansehen
              onClick={() => {
                notifications.hide(id)
                kurz.ansehen()
              }}
            >
              Ansehen
            </Button>
          )}
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
    useThemen.setState((s) => ({ sitzung: [...s.sitzung, id] }))
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

/** Belegte Themen je Material – Lehrplan des Landes und Schulform aus seinen Kopfdaten (ältere Materialien: die Einstellungen) */
async function katalogLader(materialien: ThemenMaterial[]): Promise<(fachId: string, m: ThemenMaterial) => KatalogThema[]> {
  const { stateId, schoolTypeId } = useAppSettings.getState().settings.defaults
  const laender = [...new Set(materialien.map((m) => m.land || stateId))]
  const lehrplaene = new Map(await Promise.all(laender.map(async (l) => [l, await ladeLehrplan(l)] as const)))
  return (fachId, m) => katalogFuer(fachId, lehrplaene.get(m.land || stateId) ?? null, m.schulform || schoolTypeId, m.land || stateId)
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
     * Seit Paket 12 auch in die Hierarchie aus dem Lehrplan, sonst die mitgebrachten Themen
     * (themenKatalog.ts). Seit Paket 13 je MATERIAL: Land und Schulform aus seinen Kopfdaten
     * (ältere Materialien: die Einstellungen). Ein Blatt für Bayern kommt so nie in einen Bereich
     * aus dem niedersächsischen Kerncurriculum, und ein Oberschul-Blatt nicht in einen, den es nur
     * am Gymnasium gibt; den Jahrgang prüft die Automatik selbst (Sek I vs. Oberstufe).
     */
    const { zuordnungen, uebernahmen } = automatischEinsortieren(materialien, d, await katalogLader(materialien))
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
          },
          {
            text: `${anzahl(schluessel.length)} einsortiert`,
            ansehen: () => void import('./navigation').then((n) => n.openModule('themen'))
          }
        )
    }
  } catch {
    // Das Einsortieren ist eine Zugabe – scheitert es, bleibt die Bibliothek trotzdem benutzbar
  } finally {
    gleichtAb = false
  }
}

/**
 * Gleich nach dem Speichern eines Materials einsortieren (27.09.2026). Bis dahin lief die
 * Automatik nur beim Aufruf der Startseite oder einer Bibliothek – ein eben erzeugtes Blatt
 * stand bis dahin in keinem Bereich. Mit der ganzen Materialliste, weil `abgleichen` daran
 * auch verwaiste Zuordnungen erkennt. Der Import ist dynamisch: Die Bibliotheken der Programme
 * hängen von dieser Datei ab, nicht umgekehrt.
 */
export async function einsortierenNachSpeichern(): Promise<void> {
  try {
    const { ladeMaterialien } = await import('../shell/materialien')
    const alle = await ladeMaterialien()
    await abgleichen(alle.filter((m) => m.moduleId !== 'vokabelliste'))
  } catch {
    // Das Einsortieren ist eine Zugabe – das Blatt ist gespeichert
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

/** Programme, deren Materialien in den übergreifenden Themenbereichen stehen (shell/materialien.ts › ladeMaterialien) */
export const ZENTRAL_GEORDNET: ReadonlySet<string> = new Set([
  'vokabeltest',
  'arbeitsblatt',
  'lernzielkontrolle',
  'grammatiktest',
  'klassenarbeit',
  'vokabelliste',
  'tafelbild'
])

const gleicherName = (a: string, b: string): boolean => a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de')

/**
 * Themenbereich von Hand in einer Themen-Bibliothek gewählt (09.10.2026, Befund aus der Tafelbild-Bibliothek): Der Name
 * stand bisher nur im Dokument – Startseite und Themenübersicht (diese Zuordnungen) zeigten weiter den alten Bereich.
 * Jetzt auch hier: der gleichnamige Bereich des Fachs (oberste Ebene zuerst; fehlt er, wird er angelegt), von Hand.
 * Liegt das Material schon in diesem Bereich (oder einem seiner Unterbereiche), bleibt es dort. `null` = wieder
 * automatisch: eine Zuordnung von Hand fällt weg.
 */
export async function themenbereichVonHand(moduleId: string, docId: string, fachId: string, name: string | null): Promise<void> {
  if (!ZENTRAL_GEORDNET.has(moduleId)) return
  const k = materialSchluessel(moduleId, docId)
  const d = await ladeThemen()
  const jetzt = d.zuordnungen[k]
  const am = new Date().toISOString()
  if (name === null) {
    if (jetzt?.von === 'hand') setze(await window.api.themen.zuordnen({ [k]: null }))
    return
  }
  const n = name.trim()
  if (!n) return
  const aktuell = jetzt?.bereichId ? d.bereiche.find((b) => b.id === jetzt.bereichId) : undefined
  if (jetzt && aktuell && gleicherName(obersterBereich(d, aktuell.id)?.name ?? aktuell.name, n)) {
    if (jetzt.von !== 'hand') setze(await window.api.themen.zuordnen({ [k]: { ...jetzt, von: 'hand', am } }))
    return
  }
  if (!fachId) return
  const passend = d.bereiche.filter((b) => b.fachId === fachId && gleicherName(b.name, n))
  const ziel = passend.find((b) => !b.elternId) ?? passend[0] ?? (await bereichAnlegen(fachId, n))
  if (!ziel) return
  setze(await window.api.themen.zuordnen({ [k]: { bereichId: ziel.id, von: 'hand', am } }))
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

/**
 * „Alle Materialien automatisch einsortieren" im ⋯ am Fach (Paket 15): das ganze Fach neu
 * ordnen – im Standard nur, was nicht oder automatisch zugeordnet ist, auf Wunsch auch von Hand
 * Zugeordnetes (Plan und Regeln: `neuEinsortierenPlan`). Danach eine Zusammenfassung
 * („12 einsortiert, 3 verschoben") mit EINEM Rückgängig-Schritt: Es stellt alle Zuordnungen
 * wieder her – auch die Kennzeichnung „von Hand" – und löscht die dabei angelegten Bereiche.
 *
 * `materialien`: alle Materialien des Fachs, alle Programme (das Fach ist bei Materialien in
 * einem Bereich das Fach des Bereichs, siehe `fachVon` in Themenbereiche.tsx).
 */
export async function allesEinsortieren(fachId: string, materialien: ThemenMaterial[], umfang: 'auto' | 'alle'): Promise<void> {
  /*
   * Ohne Fach kein Themenbereich – das sagt die Meldung jetzt auch (26.09.2026). Vorher hieß
   * es „Nichts zu ändern", was die Lehrkraft als Fehler der Automatik las; der Grund war ein
   * Vokabeltest, der seine Sprache verloren hatte.
   */
  if (fachId === 'ohne-fach') {
    notifications.show({
      color: 'orange',
      message:
        'Diese Materialien haben kein Fach – ohne Fach kann die Automatik keinen Themenbereich finden. Beim Vokabeltest ergibt sich das Fach aus der Zielsprache in den Testeinstellungen oder aus dem Schulbuch (z. B. „Green Line 1“ = Englisch).'
    })
    return
  }
  try {
    const vorher = await ladeThemen()
    const plan = neuEinsortierenPlan(materialien, vorher, fachId, await katalogLader(materialien), umfang)
    const alteIds = new Set(vorher.bereiche.map((b) => b.id))
    if (Object.keys(plan.zuordnungen).length) setze(await window.api.themen.zuordnen(plan.zuordnungen))
    if (plan.uebernahmen.length) setze(await window.api.themen.uebernehmen(plan.uebernahmen, []))
    const nachher = useThemen.getState().daten
    const { einsortiert, verschoben } = einsortierBilanz(vorher, nachher, plan.betroffen)
    const angelegt = nachher.bereiche.filter((b) => !alteIds.has(b.id))
    const geaendert = plan.betroffen.filter((k) => JSON.stringify(vorher.zuordnungen[k] ?? null) !== JSON.stringify(nachher.zuordnungen[k] ?? null))
    if (!geaendert.length && !angelegt.length) {
      notifications.show({ message: 'Nichts zu ändern – die Materialien liegen schon dort, wo die Automatik sie einsortieren würde.' })
      return
    }
    const teile = [
      `${einsortiert} einsortiert`,
      `${verschoben} verschoben`,
      ...(angelegt.length ? [`${angelegt.length === 1 ? '1 Themenbereich' : `${angelegt.length} Themenbereiche`} angelegt`] : [])
    ]
    const alt: Record<string, Zuordnung | null> = Object.fromEntries(geaendert.map((k) => [k, vorher.zuordnungen[k] ?? null]))
    zeigeRueckgaengig(`${teile.join(', ')}.`, async () => {
      // Erst die neuen Bereiche weg (von unten nach oben), dann die alten Zuordnungen zurück
      for (const b of [...angelegt].reverse()) await window.api.themen.delete(b.id).catch(() => undefined)
      await window.api.themen.zuordnen(alt)
      setze(await window.api.themen.list())
    })
  } catch (e) {
    notifyError(e, 'Das Einsortieren ist fehlgeschlagen')
  }
}
