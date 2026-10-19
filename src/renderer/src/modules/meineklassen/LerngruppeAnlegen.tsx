/**
 * Lerngruppen anlegen (10.10.2026, Entscheidung der Lehrkraft): nur noch in „Meine Klassen“ – „+ Lerngruppe anlegen“
 * (von Hand, mit IServ-Gruppe oder Klasse aus der Verwaltung) und „Aus IServ übernehmen“ (Ordner „Gruppen“, nur in der
 * Exe). Die Dialoge stammen aus der App „Onlinetest“ (dort bleiben Liste und Historie der Lerngruppen).
 */
import { Alert, Button, Checkbox, Group, Loader, Modal, Select, SimpleGrid, Stack, Text, TextInput, Textarea, Tooltip } from '@mantine/core'
import { IconFolders, IconPlus } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { FAECHER } from '@shared/faecher'
import HaeufigSelect from '../../shared/components/HaeufigSelect'
import { hatClient } from '../../shared/plattform'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'

/**
 * Gruppen aus den IServ-ORDNERN (02.10.2026, Wunsch der Lehrkraft): Solange IServ die Gruppen
 * nicht über die Anmeldung liefert, zeigt der Ordner „Groups" (Gruppen), wo jemand Mitglied ist –
 * „Klasse 10b" heißt: Lerngruppe 10b. Lesen kann das nur die Exe (IServ-Passwort bleibt am PC).
 */
const KLASSE_ODER_KURS = /^(klasse|kl\.?|jahrgang|jg\.?|kurs|q[12]|e[f]?|\d{1,2}\s*[a-z]{0,2}\b)/i
export const lerngruppenName = (ordner: string): string => ordner.replace(/^klasse\s+/i, '').trim()

export async function iservGruppenordner(): Promise<string[] | null> {
  if (!hatClient()) return null
  const status = (await window.api.iserv.status().catch(() => null)) as { verbunden?: boolean } | null
  if (!status?.verbunden) return null
  return (await window.api.iserv.ordner('Groups')).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
}

/**
 * „Aus IServ übernehmen" (19.10.2026 überarbeitet, Befund der Lehrkraft: Text und Ablauf passten nicht): Zur Auswahl
 * stehen die IServ-Gruppen aus der Anmeldung über IServ und – in der Exe „Schul-Apps Online" mit verbundenem IServ –
 * zusätzlich die Gruppenordner aus IServ. Klassen und Kurse sind vorausgewählt; was es schon gibt, ist ausgegraut.
 */
export function IservGruppenUebernehmen({
  vorhanden,
  iservGruppen,
  fertig
}: {
  vorhanden: string[]
  /** Gruppen aus der IServ-Anmeldung (Server) */
  iservGruppen: { id: string; name: string }[]
  fertig: () => void
}): React.JSX.Element {
  const [ordner, setOrdner] = useState<{ id: string; name: string }[] | null>(null)
  const [wahl, setWahl] = useState<Set<string>>(new Set())
  useEffect(() => {
    void iservGruppenordner()
      .catch(() => null)
      .then((o) => {
        const ausOrdner = (o ?? []).map((n) => ({ id: n, name: n }))
        const alle = [...iservGruppen, ...ausOrdner.filter((x) => !iservGruppen.some((g) => g.name.toLowerCase() === x.name.toLowerCase()))].sort((x, y) =>
          x.name.localeCompare(y.name, 'de', { numeric: true })
        )
        setOrdner(alle)
        setWahl(new Set(alle.filter((g) => KLASSE_ODER_KURS.test(g.name) && !vorhanden.includes(lerngruppenName(g.name).toLowerCase())).map((g) => g.id)))
      })
  }, [vorhanden, iservGruppen])
  const uebernehmen = async (): Promise<void> => {
    try {
      for (const g of (ordner ?? []).filter((x) => wahl.has(x.id))) await senden('/server/lerngruppen/anlegen', { name: lerngruppenName(g.name), iservGruppe: g.id })
      notifySuccess(`${wahl.size} Lerngruppe${wahl.size === 1 ? '' : 'n'} angelegt.`)
      fertig()
    } catch (e) {
      notifyError(e)
    }
  }
  return (
    <Modal opened onClose={fertig} title="Klassen und Kurse aus IServ übernehmen" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Wähle die IServ-Gruppen, die du als Lerngruppen anlegen möchtest. Klassen und Kurse sind schon ausgewählt. Wer in einer Gruppe ist und sich
          anmeldet, gehört danach automatisch zur Lerngruppe – aus „Klasse 10b“ wird die Lerngruppe „10b“.
        </Text>
        {!ordner && <Loader />}
        {ordner?.length === 0 && (
          <Alert color="orange" data-iserv-keine-gruppen>
            Es sind noch keine IServ-Gruppen bekannt. Melde dich einmal über IServ an – dann kennt die App deine Klassen und Kurse.
            {hatClient() ? ' Oder verbinde IServ hier in der Exe unter Einstellungen › Material › IServ.' : ' Alternativ liest die Exe „Schul-Apps Online“ mit verbundenem IServ deine Gruppenordner.'}
          </Alert>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {ordner?.map((g) => {
            const da = vorhanden.includes(lerngruppenName(g.name).toLowerCase())
            return (
              <Checkbox
                key={g.id}
                label={da ? `${g.name} (schon angelegt)` : g.name}
                disabled={da}
                checked={wahl.has(g.id)}
                onChange={(e) => {
                  const w = new Set(wahl)
                  if (e.currentTarget.checked) w.add(g.id)
                  else w.delete(g.id)
                  setWahl(w)
                }}
                data-iserv-gruppe={g.name}
              />
            )
          })}
        </SimpleGrid>
        <Group justify="flex-end">
          <Button disabled={!wahl.size} onClick={() => void uebernehmen()} data-iserv-uebernehmen>
            {wahl.size === 1 ? '1 Lerngruppe anlegen' : `${wahl.size} Lerngruppen anlegen`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

export function NeueGruppe({ iservGruppen, fertig }: { iservGruppen: { id: string; name: string }[]; fertig: () => void }): React.JSX.Element {
  const [name, setName] = useState('')
  const [fach, setFach] = useState('')
  const [iserv, setIserv] = useState<string | null>(null)
  const [mitglieder, setMitglieder] = useState('')
  return (
    <Modal opened onClose={fertig} title="Lerngruppe anlegen">
      <Stack>
        <Select
          label="IServ-Gruppe (Klasse oder Kurs)"
          description="Wer in dieser Gruppe ist und sich anmeldet, gehört automatisch dazu."
          data={iservGruppen.map((g) => ({ value: g.id, label: g.name }))}
          value={iserv}
          onChange={(v) => {
            setIserv(v)
            if (v && !name) setName(lerngruppenName(iservGruppen.find((g) => g.id === v)?.name ?? ''))
          }}
          searchable
          clearable
          nothingFoundMessage={
            iservGruppen.length ? 'Nicht gefunden' : 'Keine Gruppen – Anmeldung über IServ oder die Exe „Schul-Apps Online“ mit verbundenem IServ'
          }
        />
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="z. B. 8b Englisch" />
        <HaeufigSelect
          art="fach"
          label="Fach (optional)"
          searchable
          clearable
          data={FAECHER.filter((f) => f.id !== 'anderes').map((f) => ({ value: f.label, label: f.label }))}
          value={fach || null}
          onChange={(v) => setFach(v ?? '')}
        />
        <Textarea
          label="Weitere Mitglieder (IServ-Benutzernamen, optional)"
          description="Eine Zeile je Person, z. B. für Kurse ohne eigene IServ-Gruppe."
          value={mitglieder}
          onChange={(e) => setMitglieder(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Button
          disabled={!name.trim()}
          onClick={() =>
            void senden('/server/lerngruppen/anlegen', { name, fach, iservGruppe: iserv ?? '', mitglieder: mitglieder.split(/[\s,;]+/).filter(Boolean) })
              .then(fertig)
              .catch((e: unknown) => notifyError(e))
          }
        >
          Anlegen
        </Button>
      </Stack>
    </Modal>
  )
}

/** Knöpfe „+ Lerngruppe anlegen“ und „Aus IServ übernehmen“ für die Übersicht von „Meine Klassen“ */
export function LerngruppeAnlegenKnoepfe({ geaendert }: { geaendert: () => void }): React.JSX.Element {
  const [d, setD] = useState<{ gruppen: { name: string }[]; iservGruppen: { id: string; name: string }[] } | null>(null)
  const [neu, setNeu] = useState(false)
  const [ausIserv, setAusIserv] = useState(false)
  const [ordnerGruppen, setOrdnerGruppen] = useState<{ id: string; name: string }[]>([])
  const laden = useCallback(() => {
    void holen<NonNullable<typeof d>>('/server/lerngruppen').then(setD, () => setD({ gruppen: [], iservGruppen: [] }))
  }, [])
  // Erst beim Öffnen eines Dialogs laden; in der Exe die Gruppenordner still mitlesen (stehen dann beim Anlegen zur Auswahl)
  useEffect(() => {
    if (!neu && !ausIserv) return
    laden()
    if (neu)
      void iservGruppenordner()
        .then((o) => setOrdnerGruppen((o ?? []).map((n) => ({ id: n, name: n }))))
        .catch(() => undefined)
  }, [neu, ausIserv, laden])
  const fertig = (): void => {
    setNeu(false)
    setAusIserv(false)
    setD(null)
    geaendert()
  }
  const auswahl = [...(d?.iservGruppen ?? []), ...ordnerGruppen.filter((o) => !d?.iservGruppen.some((g) => g.id === o.id))]
  return (
    <Group gap="xs" data-lerngruppe-anlegen-knoepfe>
      <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setNeu(true)} data-lerngruppe-anlegen>
        Lerngruppe anlegen
      </Button>
      <Tooltip label="Deine Klassen und Kurse aus IServ als Lerngruppen anlegen">
        <Button size="xs" variant="light" leftSection={<IconFolders size={14} />} onClick={() => setAusIserv(true)} data-iserv-gruppen>
          Aus IServ übernehmen
        </Button>
      </Tooltip>
      {(neu || ausIserv) && !d && <Loader size="xs" />}
      {ausIserv && d && <IservGruppenUebernehmen vorhanden={d.gruppen.map((g) => g.name.toLowerCase())} iservGruppen={d.iservGruppen} fertig={fertig} />}
      {neu && d && <NeueGruppe iservGruppen={auswahl} fertig={fertig} />}
    </Group>
  )
}
