/**
 * Einstellungen für OpenAI-kompatible Anbieter (09.10.2026): Mistral, IONOS, STACKIT, Azure,
 * Gemini (OpenAI-Endpunkt), OpenRouter, lokal, eigener Endpunkt – siehe shared/kiAnbieter.ts.
 *
 * Adresse (vorbelegt, änderbar), bei Azure die API-Version, der Schlüssel (Feld aus SettingsPage)
 * und das Modell: aus der Liste des Anbieters ODER von Hand eingetragen (Azure: Name der
 * Bereitstellung). Getestet wird nur auf Knopfdruck („Testen" am Schlüssel bzw. hier bei lokalen
 * Modellen ohne Schlüssel).
 */
import { Alert, Anchor, Autocomplete, Badge, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { IconMapPin, IconPlugConnected } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { kompatibelVorgabe, type KompatibelId } from '@shared/kiAnbieter'
import type { AppSettings, DeepPartial } from '@shared/types'
import { notifyError, notifySuccess } from '../shared/util'
import { aufServer } from '../shared/plattform'

type Update = (patch: DeepPartial<AppSettings>) => void | Promise<void>

/** Anbieterauswahl in Gruppen: Kernanbieter, dann OpenAI-kompatible (lokal nur am PC) */
export function anbieterGruppen(
  liste: { id: string; label: string; kompatibel?: boolean; nurPc?: boolean }[],
  nurPcAusblenden: boolean
): { group: string; items: { value: string; label: string }[] }[] {
  const zu = (p: { id: string; label: string }): { value: string; label: string } => ({ value: p.id, label: p.label })
  return [
    { group: 'Mit API-Schlüssel oder Abo', items: liste.filter((p) => !p.kompatibel).map(zu) },
    { group: 'Weitere Anbieter (OpenAI-kompatibel)', items: liste.filter((p) => p.kompatibel && !(nurPcAusblenden && p.nurPc)).map(zu) }
  ]
}

export function KompatibelZugang({
  id,
  settings,
  update,
  schluesselFeld
}: {
  id: KompatibelId
  settings: AppSettings
  update: Update
  /** Das Schlüsselfeld der Einstellungen (mit Speichern/Testen) */
  schluesselFeld: React.ReactNode
}): React.JSX.Element {
  const vorgabe = kompatibelVorgabe(id)!
  const eigene = settings.ai.kompatibel?.[id] ?? {}
  const [adresse, setAdresse] = useState(eigene.basisUrl ?? '')
  const [version, setVersion] = useState(eigene.apiVersion ?? '')
  const [modell, setModell] = useState(settings.ai.textModels[id] ?? '')
  const [liste, setListe] = useState<string[]>(vorgabe.modelle)
  const [laedt, setLaedt] = useState(false)
  const [testet, setTestet] = useState(false)
  useEffect(() => {
    setAdresse(settings.ai.kompatibel?.[id]?.basisUrl ?? '')
    setVersion(settings.ai.kompatibel?.[id]?.apiVersion ?? '')
    setModell(settings.ai.textModels[id] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const server = aufServer()

  const speichereAdresse = (): void => {
    if ((eigene.basisUrl ?? '') === adresse.trim() && (eigene.apiVersion ?? '') === version.trim()) return
    void update({ ai: { kompatibel: { [id]: { basisUrl: adresse.trim(), apiVersion: version.trim() } } } })
  }
  const speichereModell = (v = modell): void => {
    const m = v.trim()
    if (m && m !== settings.ai.textModels[id]) void update({ ai: { textModels: { [id]: m }, autoLatest: false } })
  }
  const listeLaden = async (): Promise<void> => {
    setLaedt(true)
    try {
      const res = await window.api.ai.models(id, 'text', true)
      const ids = res.models.map((m) => m.id)
      setListe([...new Set([...ids, ...vorgabe.modelle])])
      if (res.error) notifyError(res.error, 'Modellliste konnte nicht geladen werden')
      else notifySuccess(`${ids.length} Modelle gefunden.`)
    } catch (e) {
      notifyError(e)
    } finally {
      setLaedt(false)
    }
  }
  const testen = async (): Promise<void> => {
    setTestet(true)
    try {
      await window.api.ai.test(id)
      notifySuccess('Die Verbindung funktioniert.')
    } catch (e) {
      notifyError(e, 'Keine Verbindung')
    } finally {
      setTestet(false)
    }
  }

  return (
    <Stack gap="sm" data-testid="kompatibel-zugang">
      <Alert variant="light" color={vorgabe.empfohlen || vorgabe.ohneSchluessel ? 'teal' : 'yellow'} icon={<IconMapPin size={16} />} p="xs">
        <Group gap={6} mb={2}>
          <Text size="sm" fw={600}>
            Datenort
          </Text>
          {vorgabe.empfohlen && (
            <Badge size="xs" color="teal">
              für Schulen geeignet
            </Badge>
          )}
        </Group>
        <Text size="sm">{vorgabe.datenort}.</Text>
        <Text size="xs" c="dimmed" mt={4}>
          Klarnamen werden auch hier vor jeder Anfrage ersetzt. Bilder erzeugt dieser Zugang nicht – dafür gilt die Bild-KI im Reiter „Bilder und Hörtexte“.
        </Text>
      </Alert>
      <TextInput
        label="Adresse (Basis-URL)"
        description={
          vorgabe.azure
            ? 'Endpunkt der Azure-Ressource, z. B. https://meine-ressource.openai.azure.com – für die EU-Datenzone die Bereitstellungsart „Data Zone Standard“ in einer EU-Region wählen.'
            : vorgabe.basisUrl
            ? `Leer lassen für die Voreinstellung (${vorgabe.basisUrl}).`
            : 'Adresse des Anbieters, endet meist auf /v1.'
        }
        placeholder={vorgabe.basisUrl || vorgabe.basisUrlBeispiel}
        value={adresse}
        onChange={(e) => setAdresse(e.currentTarget.value)}
        onBlur={speichereAdresse}
        error={server && adresse.trim() && !adresse.trim().startsWith('https://') ? 'Auf dem Server nur https-Adressen' : undefined}
      />
      {vorgabe.azure && (
        <TextInput
          label="API-Version (nur ältere Ressourcen)"
          description="Leer lassen für die aktuelle v1-Schnittstelle. Nur eintragen, wenn die Ressource die v1-Schnittstelle noch nicht kennt (z. B. 2025-04-01-preview)."
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
          onBlur={speichereAdresse}
        />
      )}
      {vorgabe.ohneSchluessel ? (
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Kein Schlüssel nötig. Ollama bzw. LM Studio muss auf diesem Rechner laufen.{' '}
            <Anchor href={`https://${vorgabe.keyUrl}`} target="_blank" size="sm">
              {vorgabe.keyUrl}
            </Anchor>
          </Text>
          <Button variant="light" leftSection={<IconPlugConnected size={16} />} loading={testet} onClick={() => void testen()}>
            Verbindung testen
          </Button>
        </Group>
      ) : (
        schluesselFeld
      )}
      <Group align="end" wrap="nowrap">
        <Autocomplete
          style={{ flex: 1 }}
          label={vorgabe.azure ? 'Name der Bereitstellung (Deployment)' : 'Modell'}
          description={
            vorgabe.azure
              ? 'So, wie die Bereitstellung in Azure AI Foundry heißt.'
              : 'Aus der Liste wählen oder die Modell-ID des Anbieters von Hand eintragen.'
          }
          data={liste}
          value={modell}
          onChange={setModell}
          onOptionSubmit={(v) => (setModell(v), speichereModell(v))}
          onBlur={() => speichereModell()}
          placeholder={vorgabe.modelle[0] ?? 'Modell-ID'}
        />
        {!(vorgabe.azure && version.trim()) && (
          <Button variant="default" loading={laedt} onClick={() => void listeLaden()}>
            Liste laden
          </Button>
        )}
      </Group>
    </Stack>
  )
}
