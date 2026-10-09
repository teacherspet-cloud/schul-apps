/**
 * Vokabeln hinzufügen, Grammatik-Vorgabe und unregelmäßige Verben einer Liste (aus VokabelTraining.tsx herausgelöst am
 * 09.10.2026 – die gemeinsame Kursseite in Sprachenlernen und „Meine Klassen" braucht sie).
 */
import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import type { GrammatikVorgabe } from '../GrammatikTraining'
import { lehrwerkeMitGrammatik } from '../../arbeitsblatt/didactics/grammatikAuswahl'
import { notifyError, notifySuccess } from '../../../shared/util'
import { senden } from '../../onlinetest/serverApi'
import { mitBildern, VokabelQuelle, type VokabelAuswahl } from '../VokabelQuelle'
import FreigabePlanen, { planGeaendert, planKnopf, planKoerper, planMeldung, planStart, type PlanWahl } from '../../../shared/components/FreigabePlanen'
import { istVerbSprache } from '@shared/verben'
import { verbKarten, type VerbKarte } from '@shared/verbTraining'
import { ladeVerbPool, verbenAusVokabeln } from '../../../shared/verben/quellen'

/**
 * Grammatik zu einem Vokabeltraining (08.10.2026, abgestimmt): Empfänger fest = dessen Lernende; Band und Unit der
 * Vokabelliste werden in der Grammatikauswahl vorgeschlagen, wenn der Band dort Unit-Grammatik hat.
 */
export function grammatikVorgabe(
  vokId: string,
  titel: string,
  sprache: string,
  quelle?: { lehrwerk?: string; unit?: string } | null,
  /** Kurs einer festen Klasse (09.10.2026): ohne „Übungszeitraum bis" */
  klassenKurs?: boolean
): GrammatikVorgabe {
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const fach = sprache === 'la' ? 'latein' : 'englisch'
  const id = norm(quelle?.lehrwerk ?? '')
  const buch = id
    ? lehrwerkeMitGrammatik(fach)
        .filter((b) => id.startsWith(norm(b)))
        .sort((a, b) => b.length - a.length)[0]
    : undefined
  return { vokId, titel, sprache, ...(buch ? { lehrwerk: { buch, unit: quelle?.unit } } : {}), ...(klassenKurs !== undefined ? { klassenKurs } : {}) }
}

/**
 * Unregelmäßige Verben einer Liste (07.10.2026, abgestimmt: automatisch im Vokabeltraining): aus der Verbliste des
 * Lehrwerks (mit früheren Bänden), sonst aus der Standardliste – für Stammformen-Übung und Verbspiele der Lernenden.
 */
export async function verbenDerListe(a: VokabelAuswahl): Promise<{ sprache: string; karten: VerbKarte[] } | null> {
  if (!istVerbSprache(a.sprache)) return null
  try {
    const pool = await ladeVerbPool({
      quelle: a.quelle?.lehrwerk ? 'lehrwerk' : 'standard',
      listeId: a.quelle?.lehrwerk,
      kumulativ: true,
      sprache: a.sprache,
      lernjahr: 6
    })
    const karten = verbKarten(verbenAusVokabeln(a.woerter, pool, a.sprache), a.sprache)
    return karten.length ? { sprache: a.sprache, karten } : null
  } catch {
    return null
  }
}

/**
 * Vokabeln nachträglich zu einer Freigabe hinzufügen (08.10.2026): Lernstand bleibt, Doppeltes wird übersprungen.
 * Auch aus „Meine Klassen" (09.10.2026) – derselbe Dialog für denselben Kurs der Klasse.
 */
export function Hinzufuegen({ id, schliessen }: { id: string; schliessen: () => void }): React.JSX.Element {
  const [auswahl, setAuswahl] = useState<VokabelAuswahl | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  // „Planen …" / „nacheinander freischalten" (09.10.2026)
  const [plan, setPlan] = useState<PlanWahl>(planStart)
  const los = async (): Promise<void> => {
    if (!auswahl) return
    setLaeuft(true)
    try {
      const mit = await mitBildern(auswahl)
      const verben = await verbenDerListe(mit)
      // Herkunft und Abschnitte mitschicken (08.10.2026): weitere Units zählen für Grammatik, Vokabelweg und Abzeichen
      const r = await senden<{ neu: number; wieder?: number }>(`/server/vokabeln/${id}/woerter`, {
        woerter: mit.woerter,
        titel: auswahl.titel,
        ...(auswahl.quelle ? { quelle: auswahl.quelle } : {}),
        ...(auswahl.teile ? { teile: auswahl.teile } : {}),
        ...(verben ? { verben } : {}),
        ...planKoerper(plan, { abschnitte: auswahl.teile?.length ?? 1 })
      })
      planGeaendert()
      notifySuccess(
        r.neu && planMeldung(plan, `${r.neu} Vokabeln`)
          ? planMeldung(plan, `${r.neu} Vokabeln`)
          : !r.neu
          ? 'Alle diese Vokabeln waren schon dabei.'
          : r.wieder
          ? `${r.neu} Vokabeln hinzugefügt – ${r.wieder} davon waren schon einmal im Kurs, ihr Lernstand gilt weiter.`
          : `${r.neu} Vokabeln hinzugefügt – sie kommen als neue Wörter in den Kasten.`
      )
      schliessen()
    } catch (e) {
      notifyError(e, 'Nicht hinzugefügt')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Modal opened onClose={schliessen} title="Vokabeln hinzufügen" size="lg">
      <Stack>
        <VokabelQuelle wahl={setAuswahl} kurs={id} />
        {auswahl && (
          <Text size="sm" c="dimmed">
            {auswahl.woerter.length} Wörter gewählt – schon vorhandene werden übersprungen.
          </Text>
        )}
        <FreigabePlanen wert={plan} aendern={setPlan} abschnitte={auswahl?.teile?.map((t) => t.titel) ?? (auswahl ? [auswahl.titel] : undefined)} mitTest />
        <Group justify="flex-end" className="dialog-fuss">
          <Button variant="default" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button onClick={() => void los()} loading={laeuft} disabled={!auswahl?.woerter.length} data-vokabel-hinzufuegen-los>
            {planKnopf(plan, 'Hinzufügen')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
