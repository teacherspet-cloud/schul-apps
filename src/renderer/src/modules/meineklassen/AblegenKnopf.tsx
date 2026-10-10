/**
 * „Ablegen ▾" je Material in „Meine Klassen" (06.10.2026): PDF, Word, Drucken, In IServ ablegen (Ordner aus der
 * Ablagestruktur der Verwaltung). IServ nur, wo das IServ-Passwort liegt (Exe „Schul-Apps Online" bzw. Exe am PC,
 * jeweils mit verbundenem IServ) – sonst ausgegraut mit Hinweis.
 *
 * Kursordner (10.10.2026): „In IServ ablegen" öffnet eine Rückfrage mit dem Zielordner. Kurse quer zu den Klassen
 * („FR 7 Kon", „RE 7b/c Abc", „EN 13 eA Kon") werden in den IServ-Gruppenordnern erkannt (shared/kursAblage.ts); passen
 * mehrere, fragt sie „In welchen Kursordner?" und merkt sich die Wahl je Lerngruppe und Fach. „Anderer Ordner …" wählt
 * frei.
 */
import { ActionIcon, Anchor, Breadcrumbs, Button, Group, Loader, Menu, Modal, Radio, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconCloudUpload, IconDownload, IconFileTypePdf, IconFileWord, IconFolder, IconPrinter } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { anzeigeTeil, iservAnzeige } from '@shared/iserv'
import { orteDiesesGeraets } from '../../shared/export/ausgabeOrt'
import { notifyError, notifySuccess } from '../../shared/util'
import {
  ablegen,
  gemerkterOrdner,
  iservPfadAus,
  iservZiele,
  kursOrdnerPfad,
  ordnerMerken,
  type AblageArt,
  type AblageQuelle,
  type IservZiele
} from './klassenAblage'

let iservStand: Promise<boolean> | null = null
/** Ist IServ auf diesem Gerät verbunden und erreichbar? (einmal je Sitzung gefragt) */
function useIservMoeglich(): boolean {
  const [ja, setJa] = useState(false)
  useEffect(() => {
    iservStand ??= window.api.iserv
      .status()
      .then((s) => s.verbunden && orteDiesesGeraets(true).includes('iserv'))
      .catch(() => false)
    void iservStand.then(setJa)
  }, [])
  return ja
}

export function AblegenKnopf({
  quelle,
  klasse,
  fach,
  muster,
  programm,
  klein,
  iservGruppe,
  kuerzel
}: {
  quelle: AblageQuelle
  klasse: string
  fach: string
  muster: string
  programm: string
  klein?: boolean
  /** Kurs aus IServ (10.10.2026): Name der IServ-Gruppe – abgelegt wird in ihren Gruppenordner */
  iservGruppe?: string
  /** Kürzel der Lehrkraft (Kursordner-Erkennung) */
  kuerzel?: string | null
}): React.JSX.Element {
  const iserv = useIservMoeglich()
  const [laeuft, setLaeuft] = useState<AblageArt | null>(null)
  const [frage, setFrage] = useState(false)
  const ordner = iservAnzeige(iservGruppe ? kursOrdnerPfad(iservGruppe) : iservPfadAus(muster, klasse, fach))
  const los = async (art: AblageArt, iservPfad?: string[]): Promise<void> => {
    setLaeuft(art)
    try {
      const wo = await ablegen(art, quelle, { klasse, fach, muster, programm, iservGruppe, iservPfad })
      if (art === 'iserv' && wo) notifySuccess(`In IServ abgelegt: ${iservAnzeige(iservPfad ?? [])}`)
      else if (wo) notifySuccess('Gespeichert.')
    } catch (e) {
      notifyError(e, art === 'iserv' ? 'Nicht in IServ abgelegt' : 'Nicht gespeichert')
    } finally {
      setLaeuft(null)
    }
  }
  return (
    <>
      {frage && (
        <IservZielFrage
          ort={{ klasse, fach, muster, iservGruppe, kuerzel }}
          abbrechen={() => setFrage(false)}
          ablegen={(pfad) => {
            setFrage(false)
            void los('iserv', pfad)
          }}
        />
      )}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          {klein ? (
            <Tooltip label="Ablegen: PDF, Word, Drucken, IServ">
              <ActionIcon variant="light" loading={Boolean(laeuft)} aria-label="Ablegen" data-ablegen>
                <IconDownload size={16} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button size="compact-xs" variant="light" leftSection={<IconDownload size={13} />} loading={Boolean(laeuft)} data-ablegen>
              Ablegen
            </Button>
          )}
        </Menu.Target>
        <Menu.Dropdown data-ablegen-menue>
          <Menu.Item leftSection={<IconFileTypePdf size={15} />} onClick={() => void los('pdf')} data-ablegen-art="pdf">
            Als PDF speichern
          </Menu.Item>
          <Tooltip label="Word gibt es, wo das Original vorliegt (Arbeitsblatt in der Bibliothek, Vokabeltest)" disabled={Boolean(quelle.word)} position="left">
            <div>
              <Menu.Item leftSection={<IconFileWord size={15} />} disabled={!quelle.word} onClick={() => void los('word')} data-ablegen-art="word">
                Als Word speichern
              </Menu.Item>
            </div>
          </Tooltip>
          <Menu.Item leftSection={<IconPrinter size={15} />} onClick={() => void los('drucken')} data-ablegen-art="drucken">
            Drucken
          </Menu.Item>
          <Menu.Divider />
          <Tooltip
            label={
              iserv
                ? `Vor dem Ablegen steht der Zielordner da – Kursordner (z. B. „FR 7 Kon“) werden erkannt, sonst ${ordner}`
                : 'IServ geht in der Exe „Schul-Apps Online“ mit verbundenem IServ (Einstellungen › Dienste). Im Browser bitte als PDF speichern.'
            }
            position="left"
            multiline
            w={260}
          >
            <div>
              <Menu.Item leftSection={<IconCloudUpload size={15} />} disabled={!iserv} onClick={() => setFrage(true)} data-ablegen-art="iserv">
                In IServ ablegen …
              </Menu.Item>
            </div>
          </Tooltip>
        </Menu.Dropdown>
      </Menu>
    </>
  )
}

const pfadText = (p: string[]): string => p.join('/')

/** Rückfrage vor dem Ablegen in IServ: Zielordner sehen, ggf. Kursordner wählen, „Anderer Ordner …" */
function IservZielFrage({
  ort,
  abbrechen,
  ablegen
}: {
  ort: { klasse: string; fach: string; muster: string; iservGruppe?: string; kuerzel?: string | null }
  abbrechen: () => void
  ablegen: (pfad: string[]) => void
}): React.JSX.Element {
  const [ziele, setZiele] = useState<IservZiele | null>(null)
  const [wahl, setWahl] = useState('')
  const [anderer, setAnderer] = useState<string[] | null>(null)
  const [blaettern, setBlaettern] = useState(false)
  useEffect(() => {
    let weg = false
    iservZiele(ort).then(
      (z) => {
        if (weg) return
        setZiele(z)
        // Gemerkte Wahl je Lerngruppe und Fach; sonst der eine Kursordner bzw. (ohne Kursordner) der Klassenordner
        const gemerkt = gemerkterOrdner(ort.klasse, ort.fach)
        const vorhanden = [...z.kurse, z.klasse].map(pfadText)
        if (gemerkt && !vorhanden.includes(pfadText(gemerkt))) setAnderer(gemerkt)
        if (gemerkt) setWahl(pfadText(gemerkt))
        else if (z.kurse.length === 1) setWahl(pfadText(z.kurse[0]))
        else if (!z.kurse.length) setWahl(pfadText(z.klasse))
      },
      () => {
        if (weg) return
        const klasse = iservPfadAus(ort.muster, ort.klasse, ort.fach)
        setZiele({ kurse: [], klasse })
        setWahl(pfadText(klasse))
      }
    )
    return () => {
      weg = true
    }
    // Einmal beim Öffnen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const optionen: { pfad: string[]; art: 'kurs' | 'klasse' | 'anderer' }[] = ziele
    ? [
        ...ziele.kurse.map((pfad) => ({ pfad, art: 'kurs' as const })),
        { pfad: ziele.klasse, art: 'klasse' as const },
        ...(anderer ? [{ pfad: anderer, art: 'anderer' as const }] : [])
      ]
    : []
  const gewaehlt = optionen.find((o) => pfadText(o.pfad) === wahl)
  return (
    <Modal opened onClose={abbrechen} title="In IServ ablegen" size="lg" data-iserv-ziel-frage>
      {!ziele ? (
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm">Gruppenordner in IServ werden gelesen …</Text>
        </Group>
      ) : (
        <Stack gap="sm">
          {ziele.kurse.length > 1 && (
            <Text size="sm" fw={600} data-kursordner-frage>
              In welchen Kursordner?
            </Text>
          )}
          {ziele.kurse.length === 1 && (
            <Text size="sm" c="dimmed">
              Kursordner in IServ erkannt.
            </Text>
          )}
          <Radio.Group value={wahl} onChange={setWahl}>
            <Stack gap={6}>
              {optionen.map((o) => (
                <Radio
                  key={pfadText(o.pfad)}
                  value={pfadText(o.pfad)}
                  data-iserv-ziel={pfadText(o.pfad)}
                  data-iserv-ziel-art={o.art}
                  label={`${iservAnzeige(o.pfad)}${o.art === 'kurs' ? ' (Kursordner)' : o.art === 'klasse' ? ' (Klassenordner)' : ''}`}
                />
              ))}
            </Stack>
          </Radio.Group>
          {blaettern ? (
            <OrdnerBlaettern
              start={['Gruppen']}
              waehlen={(p) => {
                if (!optionen.some((o) => pfadText(o.pfad) === pfadText(p))) setAnderer(p)
                setWahl(pfadText(p))
                setBlaettern(false)
              }}
            />
          ) : (
            <Anchor size="sm" onClick={() => setBlaettern(true)} data-anderer-ordner>
              Anderer Ordner …
            </Anchor>
          )}
          <Text size="sm" data-ablage-ziel={gewaehlt ? pfadText(gewaehlt.pfad) : ''}>
            Ziel: <b>{gewaehlt ? iservAnzeige(gewaehlt.pfad) : '– bitte einen Ordner wählen –'}</b>
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={abbrechen}>
              Abbrechen
            </Button>
            <Button
              disabled={!gewaehlt}
              leftSection={<IconCloudUpload size={15} />}
              onClick={() => {
                if (!gewaehlt) return
                ordnerMerken(ort.klasse, ort.fach, gewaehlt.pfad)
                ablegen(gewaehlt.pfad)
              }}
              data-ablegen-speichern
            >
              Ablegen
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

/** Ordner in IServ frei wählen („Anderer Ordner …") */
function OrdnerBlaettern({ start, waehlen }: { start: string[]; waehlen: (pfad: string[]) => void }): React.JSX.Element {
  const [pfad, setPfad] = useState<string[]>(start)
  const [eintraege, setEintraege] = useState<{ name: string }[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const versucht = useRef(false)
  useEffect(() => {
    let weg = false
    setEintraege(null)
    setFehler(null)
    window.api.iserv
      .ordner(pfad.join('/'))
      .then((l) => {
        if (!weg) setEintraege(l)
      })
      .catch((e: unknown) => {
        if (weg) return
        // Oberste Ebene heißt hier anders („Gruppen" ↔ „Groups") – sonst von oben
        const anders = pfad.length === 1 ? ({ gruppen: 'Groups', groups: 'Gruppen' } as Record<string, string>)[pfad[0].toLowerCase()] : undefined
        if (anders && !versucht.current) {
          versucht.current = true
          setPfad([anders])
        } else if (pfad.length) setPfad([])
        else setFehler(e instanceof Error ? e.message : String(e))
      })
    return () => {
      weg = true
    }
  }, [pfad])
  return (
    <Stack gap={6} p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }} data-iserv-blaettern>
      <Breadcrumbs separator="›">
        <Anchor size="sm" onClick={() => setPfad([])}>
          IServ
        </Anchor>
        {pfad.map((t, i) => (
          <Anchor key={i} size="sm" onClick={() => setPfad(pfad.slice(0, i + 1))}>
            {anzeigeTeil(t, i)}
          </Anchor>
        ))}
      </Breadcrumbs>
      {fehler && (
        <Text size="sm" c="red">
          {fehler}
        </Text>
      )}
      {!eintraege && !fehler && <Loader size="sm" />}
      {eintraege && (
        <Stack gap={2} mah={220} style={{ overflowY: 'auto' }}>
          {eintraege.length === 0 && (
            <Text size="sm" c="dimmed">
              Keine Unterordner.
            </Text>
          )}
          {eintraege.map((e) => (
            <UnstyledButton key={e.name} onClick={() => setPfad([...pfad, e.name])} py={3} data-iserv-eintrag={e.name}>
              <Group gap={6}>
                <IconFolder size={15} />
                <Text size="sm">{anzeigeTeil(e.name, pfad.length)}</Text>
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      )}
      {pfad.length > 0 && (
        <Button size="xs" variant="light" onClick={() => waehlen(pfad)} data-iserv-hier>
          Diesen Ordner nehmen: {iservAnzeige(pfad)}
        </Button>
      )}
    </Stack>
  )
}
