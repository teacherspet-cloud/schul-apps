import { Alert, Box, Button, Card, Group, Loader, MultiSelect, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconDeviceFloppy, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { LAENDER, schulformenDes } from '@shared/schulformen'
import type { SchulEinrichtung } from '@shared/schulEinrichtung'
import { pruefeSchule } from '@shared/schulEinrichtung'
import { holen, senden } from '../onlinetest/serverApi'
import { ladeServerSchule, type ServerSchule } from '../../shared/serverSchule'
import { normalizeImage, notifyError, notifySuccess, readFileAsDataUrl } from '../../shared/util'
import DropZone, { FILE_TYPES } from '../../shared/components/DropZone'
import { appSchulform, type SchulTreffer } from '@shared/schulsuche'
import { verzeichnisAbgleich, verzeichnisUebernehmen, type Abweichung } from '@shared/schulVerzeichnisDaten'
import { SchulSuchfeld, VerzeichnisAbweichung } from '../../shell/Schulsuche'

/**
 * Verwaltung › Schule (09.10.2026): die Schule einrichten, die diesen Server nutzt.
 *
 * Name, Bundesland, Schulform(en) aus dem Katalog (shared/schulformen.ts), Anschrift, Telefon und E-Mail für
 * Briefköpfe und das Logo. Lehrkräfte bekommen die Angaben beim ersten Anmelden vorausgefüllt (oder auf Nachfrage,
 * wenn sie noch keine Schuldaten haben); ohne eigene Wahl gelten Bundesland und Schulform der Schule für die
 * Programme (shared/schulEinrichtung.ts). Gespeichert wird auf dem Server (src/server/schule.ts).
 *
 * Schulsuche (09.10.2026): Der Name lässt sich im Schulverzeichnis suchen; die Wahl füllt leere Felder (Anschrift,
 * Telefon, Bundesland, Schulform) – Abweichungen bei gefüllten Feldern nur auf Klick (shared/schulVerzeichnisDaten.ts).
 */
const LEER: SchulEinrichtung = { name: '', stateId: '', schulformen: [], strasse: '', plz: '', ort: '', telefon: '', email: '' }

export function SchuleEinrichten(): React.JSX.Element {
  const [werte, setWerte] = useState<SchulEinrichtung | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const [logoLaedt, setLogoLaedt] = useState(false)
  const [fehler, setFehler] = useState('')
  const [abweichung, setAbweichung] = useState<{ treffer: SchulTreffer; felder: Abweichung[] } | null>(null)

  useEffect(() => {
    void holen<ServerSchule>('/server/schule')
      .then((d) => {
        setWerte({ ...LEER, ...(d.schule ?? {}) })
        setLogo(d.logo)
      })
      .catch((e: unknown) => {
        setWerte({ ...LEER })
        notifyError(e)
      })
  }, [])

  if (!werte) return <Loader />
  const setze = (patch: Partial<SchulEinrichtung>): void => setWerte({ ...werte, ...patch })
  const formen = werte.stateId ? schulformenDes(werte.stateId) : []

  /** Schule aus dem Verzeichnis gewählt: Name setzen, leere Felder füllen, Abweichungen anbieten */
  const waehleSchule = (t: SchulTreffer): void => {
    const { gefuellt, abweichend } = verzeichnisAbgleich(werte, t)
    const patch: Partial<SchulEinrichtung> = { name: t.name, ...gefuellt }
    if (!werte.stateId && LAENDER.some((l) => l.id === t.land)) patch.stateId = t.land
    const land = patch.stateId ?? werte.stateId
    if (!werte.schulformen.length && land && land === t.land) {
      const form = appSchulform(
        t.schulformen,
        schulformenDes(land).map((f) => f.id)
      )
      if (form) patch.schulformen = [form]
    }
    setze(patch)
    setAbweichung(abweichend.length ? { treffer: t, felder: abweichend } : null)
  }

  const speichern = async (): Promise<void> => {
    const p = pruefeSchule(werte)
    if ('fehler' in p) return setFehler(p.fehler)
    setFehler('')
    setSpeichert(true)
    try {
      const r = await senden<{ schule: SchulEinrichtung }>('/server/schule', p.schule)
      setWerte({ ...LEER, ...r.schule })
      void ladeServerSchule(true)
      notifySuccess('Schule gespeichert.')
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setSpeichert(false)
    }
  }

  const logoSetzen = async (neu: string | null): Promise<void> => {
    setLogoLaedt(true)
    try {
      await senden('/server/schule/logo', { logo: neu })
      setLogo(neu)
      void ladeServerSchule(true)
      notifySuccess(neu ? 'Schullogo gespeichert.' : 'Schullogo entfernt.')
    } catch (e) {
      notifyError(e)
    } finally {
      setLogoLaedt(false)
    }
  }

  const feld = (name: 'strasse' | 'plz' | 'ort' | 'telefon' | 'email', label: string, placeholder = ''): React.JSX.Element => (
    <TextInput label={label} placeholder={placeholder} value={werte[name]} onChange={(e) => setze({ [name]: e.currentTarget.value })} data-schule-feld={name} />
  )

  return (
    <Stack maw={720} data-schule-einrichten>
      <Alert variant="light">
        Die Schule, die diesen Server nutzt. Lehrkräfte bekommen diese Angaben beim ersten Anmelden vorausgefüllt und können sie für sich ändern; wer
        noch keine Schuldaten hat, wird einmal gefragt, ob sie übernommen werden sollen. Eigene Angaben der Lehrkräfte werden nie überschrieben. Solange
        eine Lehrkraft kein eigenes Bundesland und keine eigene Schulform gewählt hat, gelten die hier eingetragenen.
      </Alert>
      <Card withBorder padding="lg">
        <Title order={5} mb="sm">
          Schule
        </Title>
        <Stack gap="sm">
          <SchulSuchfeld
            label="Name der Schule"
            description="Beim Tippen erscheinen Schulen aus dem Schulverzeichnis der Länder; die Wahl ergänzt leere Felder (Anschrift, Telefon, Land, Schulform)."
            placeholder="Namen oder Ort der Schule eingeben"
            required
            value={werte.name}
            onChange={(x) => setze({ name: x })}
            onWaehle={waehleSchule}
            land={werte.stateId || undefined}
            schulform={werte.schulformen[0]}
            kennung="verwaltung"
          />
          {abweichung && (
            <VerzeichnisAbweichung
              abweichend={abweichung.felder}
              uebernehmen={() => {
                setze(verzeichnisUebernehmen(abweichung.treffer))
                setAbweichung(null)
              }}
              schliessen={() => setAbweichung(null)}
            />
          )}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Select
              label="Bundesland"
              required
              data={LAENDER.map((l) => ({ value: l.id, label: l.name }))}
              value={werte.stateId || null}
              onChange={(v) => {
                if (!v) return
                // Schulformen eines anderen Landes passen nicht – nur die behalten, die es dort gibt
                const dort = new Set(schulformenDes(v).map((s) => s.id))
                setze({ stateId: v, schulformen: werte.schulformen.filter((s) => dort.has(s)) })
              }}
              allowDeselect={false}
              searchable
              data-schule-feld="land"
            />
            <MultiSelect
              label="Schulform(en)"
              description="Die erste gilt als Vorwahl."
              required
              disabled={!werte.stateId}
              placeholder={werte.stateId ? 'Schulform wählen' : 'Zuerst das Bundesland'}
              data={formen.map((s) => ({ value: s.id, label: s.name }))}
              value={werte.schulformen}
              onChange={(v) => setze({ schulformen: v })}
              maxValues={8}
              data-schule-feld="schulformen"
            />
          </SimpleGrid>
        </Stack>
      </Card>
      <Card withBorder padding="lg">
        <Title order={5} mb={4}>
          Anschrift und Kontakt
        </Title>
        <Text size="xs" c="dimmed" mb="sm">
          Für den Briefkopf der Elternbriefe.
        </Text>
        <Stack gap="sm">
          {feld('strasse', 'Straße und Hausnummer')}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {feld('plz', 'PLZ', 'z. B. 27568')}
            {feld('ort', 'Ort')}
            {feld('telefon', 'Telefon')}
            {feld('email', 'E-Mail', 'z. B. sekretariat@schule.de')}
          </SimpleGrid>
        </Stack>
      </Card>
      {fehler && (
        <Alert color="red" variant="light" data-schule-fehler>
          {fehler}
        </Alert>
      )}
      <Group justify="flex-end">
        <Button leftSection={<IconDeviceFloppy size={16} />} onClick={() => void speichern()} loading={speichert} data-schule-speichern>
          Speichern
        </Button>
      </Group>
      <Card withBorder padding="lg">
        <Title order={5} mb={4}>
          Schullogo
        </Title>
        <Text size="xs" c="dimmed" mb="sm">
          Wird als PNG gespeichert (höchstens 800 Pixel, bis 1 MB) und Lehrkräften ohne eigenes Logo angeboten.
        </Text>
        <Group align="stretch" wrap="nowrap">
          {logo && (
            <Stack gap={6} align="center" justify="center" className="picker-tile" p="sm" w={180}>
              <img src={logo} alt="Schullogo" style={{ maxWidth: 150, maxHeight: 90, objectFit: 'contain' }} />
              <Button size="compact-xs" variant="subtle" color="red" leftSection={<IconTrash size={12} />} onClick={() => void logoSetzen(null)}>
                Entfernen
              </Button>
            </Stack>
          )}
          <Box style={{ flex: 1 }}>
            <DropZone
              onFiles={async (files) => {
                if (!files[0]) return
                try {
                  // Als PNG über die Zeichenfläche: Transparenz bleibt, SVG wird gerastert, Metadaten fallen weg
                  await logoSetzen(await normalizeImage(await readFileAsDataUrl(files[0]), 800, 'png'))
                } catch (e) {
                  notifyError(e)
                }
              }}
              accept={[...FILE_TYPES.image, 'image/svg+xml']}
              multiple={false}
              loading={logoLaedt}
              minHeight={90}
              title={logo ? 'Anderes Logo hierher ziehen' : 'Logo hierher ziehen oder klicken'}
              hint="PNG (am besten mit transparentem Hintergrund), JPG oder SVG"
            />
          </Box>
        </Group>
      </Card>
    </Stack>
  )
}
