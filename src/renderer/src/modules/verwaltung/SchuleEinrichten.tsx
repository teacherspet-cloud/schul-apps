import { Alert, Box, Button, Group, Loader, MultiSelect, Paper, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { IconDeviceFloppy, IconTrash } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { LAENDER, schulformenDes } from '@shared/schulformen'
import type { SchulEinrichtung } from '@shared/schulEinrichtung'
import { pruefeSchule } from '@shared/schulEinrichtung'
import { holen, senden } from '../onlinetest/serverApi'
import { ladeServerSchule, type ServerSchule } from '../../shared/serverSchule'
import { normalizeImage, notifyError, notifySuccess, readFileAsDataUrl } from '../../shared/util'
import DropZone, { FILE_TYPES } from '../../shared/components/DropZone'
import { KlappKarte } from '../../shared/components/KlappKarte'
import { appSchulform, type SchulTreffer } from '@shared/schulsuche'
import { schulWahl, verzeichnisUebernehmen, type Abweichung } from '@shared/schulVerzeichnisDaten'
import { SchulSuchfeld, VerzeichnisAbweichung } from '../../shell/Schulsuche'
import { SchulkalenderKarte } from './SchulkalenderKarte'

/**
 * Verwaltung › Schule (09.10.2026): die Schule einrichten, die diesen Server nutzt.
 *
 * Name, Bundesland, Schulform(en) aus dem Katalog (shared/schulformen.ts), Anschrift, Telefon und E-Mail für
 * Briefköpfe und das Logo. Lehrkräfte bekommen die Angaben beim ersten Anmelden vorausgefüllt (oder auf Nachfrage,
 * wenn sie noch keine Schuldaten haben); ohne eigene Wahl gelten Bundesland und Schulform der Schule für die
 * Programme (shared/schulEinrichtung.ts). Gespeichert wird auf dem Server (src/server/schule.ts).
 *
 * Schulsuche (09.10.2026): Der Name lässt sich im Schulverzeichnis suchen; die Wahl füllt leere Felder (Anschrift,
 * Telefon, E-Mail, Bundesland, Schulform) – Abweichungen bei gefüllten Feldern nur auf Klick (shared/schulVerzeichnisDaten.ts).
 *
 * 10.10.2026 (Befund der Lehrkraft „Kreisgymnasium Wesermünde"): Die Wahl setzt auch hier das Vorgabe-Logo der Schule
 * (resources/schulen/logos, bisher nur in den Einstellungen der Lehrkraft verdrahtet), wenn noch keins hinterlegt ist –
 * bei einem anderen nach Rückfrage. Ein eigener längerer Name („Kreisgymnasium …" statt „Gymnasium …") bleibt stehen.
 * Alle Kästen sind einklappbar (Vorgabe: zu) mit Statuszeile im Kopf; offen/zu bleibt dauerhaft je Gerät
 * (KlappKarte `dauerhaft`, Entscheidung der Lehrkraft – anders als die übrigen Kästen, die je Sitzung gelten).
 */
const LEER: SchulEinrichtung = { name: '', stateId: '', schulformen: [], strasse: '', plz: '', ort: '', telefon: '', email: '' }

/** Statuszeile „Kreisgymnasium Wesermünde · NI · Gymnasium" */
function schulStatus(w: SchulEinrichtung): string {
  const form = w.stateId && w.schulformen[0] ? schulformenDes(w.stateId).find((s) => s.id === w.schulformen[0])?.name : ''
  return [w.name.trim(), w.stateId, form].filter(Boolean).join(' · ')
}

/** Statuszeile „Humboldtstraße 12-14, 27570 Bremerhaven · sekretariat@…" */
function kontaktStatus(w: SchulEinrichtung): string {
  const ort = [w.plz.trim(), w.ort.trim()].filter(Boolean).join(' ')
  return [[w.strasse.trim(), ort].filter(Boolean).join(', '), w.email.trim()].filter(Boolean).join(' · ')
}

export function SchuleEinrichten(): React.JSX.Element {
  const [werte, setWerte] = useState<SchulEinrichtung | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const [logoLaedt, setLogoLaedt] = useState(false)
  const [fehler, setFehler] = useState('')
  const [abweichung, setAbweichung] = useState<{ treffer: SchulTreffer; felder: Abweichung[] } | null>(null)
  const [logoFrage, setLogoFrage] = useState<{ schule: string; png: string } | null>(null)

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
  const setze = (patch: Partial<SchulEinrichtung>): void => setWerte((alt) => ({ ...(alt ?? LEER), ...patch }))
  const formen = werte.stateId ? schulformenDes(werte.stateId) : []

  const logoSetzen = async (neu: string | null, meldung?: string): Promise<void> => {
    setLogoLaedt(true)
    try {
      await senden('/server/schule/logo', { logo: neu })
      setLogo(neu)
      void ladeServerSchule(true)
      notifySuccess(meldung ?? (neu ? 'Schullogo gespeichert.' : 'Schullogo entfernt.'))
    } catch (e) {
      notifyError(e)
    } finally {
      setLogoLaedt(false)
    }
  }

  /** Schule aus dem Verzeichnis gewählt: Name setzen, leere Felder füllen, Abweichungen anbieten, Vorgabe-Logo */
  const waehleSchule = async (t: SchulTreffer): Promise<void> => {
    const w = schulWahl(werte, t, logo, null)
    const patch: Partial<SchulEinrichtung> = { name: w.name, ...w.gefuellt }
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
    setAbweichung(w.abweichend.length ? { treffer: t, felder: w.abweichend } : null)
    setLogoFrage(null)
    if (!t.logo) return
    try {
      const png = await window.api.schulen.logo(t.id)
      const art = schulWahl(werte, t, logo, png).logo
      if (art === 'setzen' && png) await logoSetzen(png, `Schullogo von „${t.name}“ übernommen.`)
      else if (art === 'fragen' && png) setLogoFrage({ schule: t.name, png })
    } catch (e) {
      notifyError(e, 'Das Logo der Schule ließ sich nicht laden')
    }
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

  const feld = (name: 'strasse' | 'plz' | 'ort' | 'telefon' | 'email', label: string, placeholder = ''): React.JSX.Element => (
    <TextInput label={label} placeholder={placeholder} value={werte[name]} onChange={(e) => setze({ [name]: e.currentTarget.value })} data-schule-feld={name} />
  )

  const schule = schulStatus(werte)
  const kontakt = kontaktStatus(werte)

  return (
    <Stack maw={720} data-schule-einrichten>
      <Alert variant="light">
        Die Schule, die diesen Server nutzt. Lehrkräfte bekommen diese Angaben beim ersten Anmelden vorausgefüllt und können sie für sich ändern; wer
        noch keine Schuldaten hat, wird einmal gefragt, ob sie übernommen werden sollen. Eigene Angaben der Lehrkräfte werden nie überschrieben. Solange
        eine Lehrkraft kein eigenes Bundesland und keine eigene Schulform gewählt hat, gelten die hier eingetragenen.
      </Alert>
      <KlappKarte
        id="verwaltung-schule"
        dauerhaft
        titel="Schule"
        status={schule || 'noch nicht eingerichtet'}
        ton={schule ? 'neutral' : 'warnung'}
        rahmen={{ 'data-schule-karte': 'schule' }}
      >
        <Stack gap="sm">
          <SchulSuchfeld
            label="Name der Schule"
            description="Beim Tippen erscheinen Schulen aus dem Schulverzeichnis der Länder; die Wahl ergänzt leere Felder (Anschrift, Telefon, E-Mail, Land, Schulform) und das Logo der Schule, falls eins beiliegt."
            placeholder="Namen oder Ort der Schule eingeben"
            required
            value={werte.name}
            onChange={(x) => setze({ name: x })}
            onWaehle={(t) => void waehleSchule(t)}
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
          {logoFrage && (
            <Paper withBorder p="xs" radius="sm" data-logo-frage>
              <Group gap="xs" justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <img src={logoFrage.png} alt="" style={{ height: 28, width: 'auto' }} />
                  <Text size="xs">Logo von „{logoFrage.schule}“ übernehmen? Das bisherige Schullogo wird dabei ersetzt.</Text>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <Button
                    size="compact-xs"
                    variant="light"
                    onClick={() => {
                      void logoSetzen(logoFrage.png, 'Schullogo übernommen.')
                      setLogoFrage(null)
                    }}
                  >
                    Übernehmen
                  </Button>
                  <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setLogoFrage(null)}>
                    Nein
                  </Button>
                </Group>
              </Group>
            </Paper>
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
      </KlappKarte>
      <KlappKarte id="verwaltung-kontakt" dauerhaft titel="Anschrift und Kontakt" status={kontakt || 'noch leer'} rahmen={{ 'data-schule-karte': 'kontakt' }}>
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
      </KlappKarte>
      {fehler && (
        <Alert color="red" variant="light" data-schule-fehler>
          {fehler}
        </Alert>
      )}
      <Group justify="flex-end">
        <Button leftSection={<IconDeviceFloppy size={16} />} onClick={() => void speichern()} loading={speichert} data-schule-speichern>
          Schule und Kontakt speichern
        </Button>
      </Group>
      <KlappKarte
        id="verwaltung-logo"
        dauerhaft
        titel="Schullogo"
        status={logo ? 'Logo hinterlegt' : 'kein Logo'}
        rahmen={{ 'data-schule-karte': 'logo', 'data-logo-gesetzt': logo ? 'true' : 'false' }}
      >
        <Text size="xs" c="dimmed" mb="sm">
          Wird als PNG gespeichert (höchstens 800 Pixel, bis 1 MB) und Lehrkräften ohne eigenes Logo angeboten.
        </Text>
        <Group align="stretch" wrap="nowrap">
          {logo && (
            <Stack gap={6} align="center" justify="center" className="picker-tile" p="sm" w={180}>
              <img src={logo} alt="Schullogo" style={{ maxWidth: 150, maxHeight: 90, objectFit: 'contain' }} data-schullogo />
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
      </KlappKarte>
      <SchulkalenderKarte />
    </Stack>
  )
}
