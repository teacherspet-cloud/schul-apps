/**
 * Reiter „KI-Zugänge" der Verwaltung (09.10.2026, Auftrag des Admins) – vorher `Schluessel` in
 * VerwaltungModule.tsx.
 *
 * Aufbau seit 10.10.2026 (Entscheidung der Lehrkraft):
 *  - Oben die KI-Nutzung der Lehrkräfte über die Schlüssel der Schule, grafisch (KiNutzung.tsx): Zeitraum,
 *    Kennzahlen, Budget, Kosten-Schätzung, anonym je Lehrkraft.
 *  - Darunter EINE große, zu Beginn zugeklappte Karte „KI-Zugänge der Schule (n)" (KlappKarte, offen/zu je Sitzung).
 *    Darin je Zugang eine kompakte Zeile: Anbieter/Modell, Statuspunkt, Schlüssel-Hinweis, ⋯ (Bearbeiten,
 *    Verbindung testen, Entfernen); Aufklappen zeigt die Eingabefelder.
 *  - OpenAI-kompatible Anbieter (Mistral, Azure, IONOS, STACKIT, Gemini, OpenRouter, eigener Endpunkt) mit Adresse,
 *    Azure-Version und Vorgabemodell; Verbindungstest NUR auf Knopfdruck.
 *
 * Abos (ChatGPT, Claude) sind bewusst NICHT teilbar (Nutzungsbedingungen).
 */
import { ActionIcon, Alert, Badge, Button, Card, Collapse, Group, Loader, Menu, PasswordInput, Stack, Switch, Text, TextInput, Title, UnstyledButton } from '@mantine/core'
import { IconDots, IconKey, IconMapPin, IconPencil, IconPlugConnected, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { istKompatibel, kompatibelVorgabe, type KompatibelEinstellung } from '@shared/kiAnbieter'
import type { KiBudget, KiPreise } from '@shared/kiKosten'
import { AI_PROVIDERS } from '@shared/types'
import { holen, senden } from '../onlinetest/serverApi'
import { notifyError, notifySuccess } from '../../shared/util'
import { KlappKarte } from '../../shared/components/KlappKarte'
import KiNutzung, { type KiNutzungDaten, type KiZeitraum } from './KiNutzung'

export interface SchluesselEintrag {
  name: string
  hinterlegt: string
  fuerAlle: boolean
}

interface KiZugaengeDaten {
  endpunkte: Record<string, KompatibelEinstellung>
  nutzung: KiNutzungDaten
}

const DIENSTE: Record<string, string> = {
  elevenlabs: 'ElevenLabs (Hörtexte)',
  pixabay: 'Pixabay (Bilder)'
}

export const anbieterName = (id: string): string => AI_PROVIDERS.find((p) => p.id === id)?.label ?? DIENSTE[id] ?? id

/** Kopfzeile eines Zugangs: „eingerichtet · für alle · Modell X · 3 Lehrkräfte" */
export function standZeile(s: SchluesselEintrag, endpunkt: KompatibelEinstellung | undefined, lehrkraefte: number | undefined): string {
  if (!s.hinterlegt) return 'nicht eingerichtet'
  const teile = ['eingerichtet', s.fuerAlle ? 'für alle' : 'nicht freigegeben']
  const modell = modellVon(s, endpunkt)
  if (modell) teile.push(`Modell ${modell}`)
  if (lehrkraefte !== undefined) teile.push(`${lehrkraefte} ${lehrkraefte === 1 ? 'Lehrkraft' : 'Lehrkräfte'}`)
  return teile.join(' · ')
}

const modellVon = (s: SchluesselEintrag, endpunkt: KompatibelEinstellung | undefined): string =>
  endpunkt?.modell?.trim() || (istKompatibel(s.name) ? (kompatibelVorgabe(s.name)?.modelle[0] ?? '') : '')

/** Status eines Zugangs: aktiv (grün), gesperrt (gelb), leer (grau) */
export const zugangsStatus = (s: SchluesselEintrag): 'aktiv' | 'gesperrt' | 'leer' => (s.hinterlegt ? (s.fuerAlle ? 'aktiv' : 'gesperrt') : 'leer')
const PUNKT: Record<ReturnType<typeof zugangsStatus>, string> = {
  aktiv: 'var(--mantine-color-green-6)',
  gesperrt: 'var(--mantine-color-yellow-6)',
  leer: 'var(--mantine-color-gray-5)'
}
const STATUS_TEXT: Record<ReturnType<typeof zugangsStatus>, string> = { aktiv: 'aktiv, für alle freigegeben', gesperrt: 'eingerichtet, nicht freigegeben', leer: 'nicht eingerichtet' }

function ZugangZeile({
  s,
  endpunkt,
  lehrkraefte,
  speichern,
  endpunktSpeichern
}: {
  s: SchluesselEintrag
  endpunkt?: KompatibelEinstellung
  lehrkraefte?: number
  speichern: (name: string, patch: object, danach?: () => void) => void
  endpunktSpeichern: (name: string, e: KompatibelEinstellung) => void
}): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  const [wert, setWert] = useState('')
  const [adresse, setAdresse] = useState(endpunkt?.basisUrl ?? '')
  const [version, setVersion] = useState(endpunkt?.apiVersion ?? '')
  const [modell, setModell] = useState(endpunkt?.modell ?? '')
  const [testet, setTestet] = useState(false)
  useEffect(() => {
    setAdresse(endpunkt?.basisUrl ?? '')
    setVersion(endpunkt?.apiVersion ?? '')
    setModell(endpunkt?.modell ?? '')
  }, [endpunkt])
  const vorgabe = istKompatibel(s.name) ? kompatibelVorgabe(s.name) : undefined
  const ki = AI_PROVIDERS.some((p) => p.id === s.name)
  const geaendert = (endpunkt?.basisUrl ?? '') !== adresse.trim() || (endpunkt?.apiVersion ?? '') !== version.trim() || (endpunkt?.modell ?? '') !== modell.trim()
  const testen = async (): Promise<void> => {
    setTestet(true)
    try {
      const r = await senden<{ ok: boolean; fehler?: string; modell?: string; sekunden?: number }>('/server/verwaltung/ki-test', { name: s.name })
      if (r.ok) notifySuccess(`Verbindung steht (${r.modell}, ${String(r.sekunden).replace('.', ',')} s).`)
      else notifyError(r.fehler ?? 'Unbekannter Fehler', 'Keine Verbindung')
    } catch (e) {
      notifyError(e)
    } finally {
      setTestet(false)
    }
  }
  const entfernen = (): void => void (window.confirm('Schlüssel entfernen?') && speichern(s.name, { wert: '', fuerAlle: false }))
  const status = zugangsStatus(s)
  const stand = standZeile(s, endpunkt, ki ? (lehrkraefte ?? 0) : undefined)
  const m = modellVon(s, endpunkt)
  return (
    <Card withBorder padding={6} px="sm" data-anbieter={s.name} data-ki-zugang={s.name} data-status={status} data-offen={offen ? 'true' : 'false'}>
      <Group gap="xs" wrap="nowrap">
        <UnstyledButton onClick={() => setOffen((o) => !o)} aria-expanded={offen} style={{ flex: 1, minWidth: 0 }} title={stand}>
          <Group gap="xs" wrap="nowrap">
            <span
              role="img"
              aria-label={STATUS_TEXT[status]}
              style={{ width: 10, height: 10, borderRadius: '50%', background: PUNKT[status], flexShrink: 0, display: 'inline-block' }}
            />
            <Text fw={600} size="sm" truncate style={{ minWidth: 0 }}>
              {anbieterName(s.name)}
              {m && (
                <Text span size="xs" c="dimmed" fw={400}>
                  {' '}
                  · {m}
                </Text>
              )}
            </Text>
            {vorgabe?.empfohlen && (
              <Badge size="xs" color="teal" variant="light" style={{ flexShrink: 0 }}>
                EU/DE
              </Badge>
            )}
          </Group>
        </UnstyledButton>
        <Text size="xs" c="dimmed" ff="monospace" visibleFrom="xs" style={{ whiteSpace: 'nowrap' }} data-schluessel-hinweis>
          {s.hinterlegt || '—'}
        </Text>
        {testet && <Loader size="xs" />}
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label={`Aktionen für ${anbieterName(s.name)}`} data-ki-menue={s.name}>
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setOffen(true)}>
              Bearbeiten
            </Menu.Item>
            {ki && s.hinterlegt && (
              <Menu.Item leftSection={<IconPlugConnected size={14} />} onClick={() => void testen()} disabled={testet}>
                Verbindung testen
              </Menu.Item>
            )}
            {s.hinterlegt && (
              <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={entfernen}>
                Entfernen
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Collapse expanded={offen}>
        <Stack gap="sm" mt="xs" mb={4}>
          <Text size="xs" c="dimmed">
            {stand}
          </Text>
          {vorgabe && (
            <Alert variant="light" color={vorgabe.empfohlen ? 'teal' : 'yellow'} icon={<IconMapPin size={16} />} p="xs">
              <Text size="sm">{vorgabe.datenort}.</Text>
            </Alert>
          )}
          <Group align="end" wrap="wrap">
            <PasswordInput
              style={{ flex: 1, minWidth: 200 }}
              leftSection={<IconKey size={14} />}
              label={s.hinterlegt ? `Schlüssel hinterlegt (${s.hinterlegt})` : 'Schlüssel'}
              placeholder={s.hinterlegt ? 'neuen Schlüssel eintragen' : vorgabe?.keyPlaceholder || 'Schlüssel eintragen'}
              value={wert}
              onChange={(e) => setWert(e.currentTarget.value)}
            />
            <Button disabled={!wert.trim()} onClick={() => speichern(s.name, { wert }, () => setWert(''))}>
              Speichern
            </Button>
          </Group>
          {vorgabe && (
            <>
              <TextInput
                label="Adresse (Basis-URL)"
                description={vorgabe.basisUrl ? `Leer lassen für ${vorgabe.basisUrl}` : 'Pflichtfeld, nur https.'}
                placeholder={vorgabe.basisUrl || vorgabe.basisUrlBeispiel}
                value={adresse}
                onChange={(e) => setAdresse(e.currentTarget.value)}
              />
              {vorgabe.azure && (
                <TextInput
                  label="API-Version (nur ältere Ressourcen)"
                  description="Leer lassen für die v1-Schnittstelle."
                  value={version}
                  onChange={(e) => setVersion(e.currentTarget.value)}
                />
              )}
              <TextInput
                label={vorgabe.azure ? 'Bereitstellung (Deployment) für alle' : 'Vorgabemodell für alle'}
                description="Gilt für Lehrkräfte, die kein eigenes Modell gewählt haben."
                placeholder={vorgabe.modelle[0] ?? 'Modell-ID'}
                value={modell}
                onChange={(e) => setModell(e.currentTarget.value)}
              />
              <Group justify="flex-end">
                <Button variant="light" disabled={!geaendert} onClick={() => endpunktSpeichern(s.name, { basisUrl: adresse, apiVersion: version, modell })}>
                  Adresse und Modell speichern
                </Button>
              </Group>
            </>
          )}
          <Group justify="space-between">
            <Switch
              label="Für alle Lehrkräfte freigeben"
              checked={s.fuerAlle}
              disabled={!s.hinterlegt}
              onChange={(e) => speichern(s.name, { fuerAlle: e.currentTarget.checked })}
            />
            <Button size="xs" variant="subtle" color="gray" onClick={() => setOffen(false)}>
              Zuklappen
            </Button>
          </Group>
        </Stack>
      </Collapse>
    </Card>
  )
}

export function KiZugaenge({ schluessel, neu }: { schluessel: SchluesselEintrag[]; neu: () => void }): React.JSX.Element {
  const [daten, setDaten] = useState<KiZugaengeDaten | null>(null)
  const [zeitraum, setZeitraum] = useState<KiZeitraum>('monat')
  const laden = useCallback(() => {
    void holen<KiZugaengeDaten>(`/server/verwaltung/ki-zugaenge?zeitraum=${zeitraum}`)
      .then(setDaten)
      .catch((e: unknown) => notifyError(e))
  }, [zeitraum])
  useEffect(() => laden(), [laden, schluessel])
  const speichern = (name: string, patch: object, danach?: () => void): void =>
    void senden('/server/verwaltung/schluessel', { name, ...patch }).then(
      () => {
        notifySuccess('Gespeichert.')
        danach?.()
        neu()
      },
      (e: unknown) => notifyError(e)
    )
  const nachSenden = (pfad: string, koerper: object): void =>
    void senden(pfad, koerper).then(
      () => {
        notifySuccess('Gespeichert.')
        laden()
      },
      (err: unknown) => notifyError(err)
    )
  const endpunktSpeichern = (name: string, e: KompatibelEinstellung): void => nachSenden('/server/verwaltung/ki-endpunkt', { name, ...e })
  const budgetSpeichern = (budget: KiBudget | null): void => nachSenden('/server/verwaltung/ki-budget', { budget })
  const preiseSpeichern = (preise: KiPreise): void => nachSenden('/server/verwaltung/ki-preise', { preise })
  const ki = schluessel.filter((s) => AI_PROVIDERS.some((p) => p.id === s.name))
  const kern = ki.filter((s) => !istKompatibel(s.name))
  const weitere = ki.filter((s) => istKompatibel(s.name))
  const dienste = schluessel.filter((s) => !AI_PROVIDERS.some((p) => p.id === s.name))
  const eingerichtet = schluessel.filter((s) => s.hinterlegt).length
  const aktiv = schluessel.filter((s) => s.hinterlegt && s.fuerAlle).length
  const zeile = (s: SchluesselEintrag): React.JSX.Element => (
    <ZugangZeile
      key={s.name}
      s={s}
      endpunkt={daten?.endpunkte[s.name]}
      lehrkraefte={daten?.nutzung.jeAnbieter[s.name]?.lehrkraefte}
      speichern={speichern}
      endpunktSpeichern={endpunktSpeichern}
    />
  )
  return (
    <Stack>
      {daten ? (
        <KiNutzung
          daten={daten.nutzung}
          zeitraum={zeitraum}
          setZeitraum={setZeitraum}
          anbieterName={anbieterName}
          anbieter={ki.filter((s) => s.hinterlegt).map((s) => s.name)}
          budgetSpeichern={budgetSpeichern}
          preiseSpeichern={preiseSpeichern}
        />
      ) : (
        <Loader size="sm" />
      )}
      <KlappKarte
        id="verwaltung-ki-zugaenge"
        titel={`KI-Zugänge der Schule (${eingerichtet})`}
        status={`${aktiv} freigegeben · ${schluessel.length - eingerichtet} leer`}
        rahmen={{ 'data-ki-zugaenge': 'true' }}
      >
        <Stack gap="sm">
          <Alert variant="light" p="xs">
            <Text size="sm">
              Freigegebene API-Schlüssel nutzen alle Lehrkräfte, die keinen eigenen hinterlegt haben – die Kosten trägt das Konto des Schlüssels. Schlüssel liegen verschlüsselt auf
              dem Server und werden nie wieder angezeigt. Klarnamen werden vor jeder KI-Anfrage ersetzt, gleich welcher Anbieter. ChatGPT-/Claude-Abos sind nicht teilbar
              (Nutzungsbedingungen): Jede Lehrkraft meldet ihr eigenes in den Einstellungen an. Hinweise zu Datenort und Eignung der Anbieter: Recherche vom 09.10.2026 (Mistral,
              Azure mit EU-Datenzone, IONOS und STACKIT sind für Schulen am besten geeignet).
            </Text>
          </Alert>
          <Title order={6}>KI für Texte</Title>
          <Stack gap={6}>{kern.map(zeile)}</Stack>
          <Title order={6}>Weitere Anbieter (OpenAI-kompatibel)</Title>
          <Stack gap={6}>{weitere.map(zeile)}</Stack>
          <Title order={6}>Weitere Dienste</Title>
          <Stack gap={6}>{dienste.map(zeile)}</Stack>
        </Stack>
      </KlappKarte>
    </Stack>
  )
}
