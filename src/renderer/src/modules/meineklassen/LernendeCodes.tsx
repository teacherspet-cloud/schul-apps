/**
 * Lernende mit Anmeldecode in „Meine Klassen" › Lernende (09.10.2026, Wunsch der Lehrkraft):
 *  - „Codezettel drucken" für alle, die sich mit Code anmelden (nur sichtbar, wenn es mindestens eine Person gibt)
 *  - Klick auf den Namen: Fenster wie in „Sprachenlernen" mit dem persönlichen Code, Zettel drucken oder als PDF
 *    sichern, neuen Code erzeugen – und „Namen ändern" (Format „Vorname N.", Server: src/server/klassenGaeste.ts).
 * Zettel und Druck kommen aus lernen/LernendeEintragen.tsx (ZettelDruck, zettelAlsPdf) – dieselben wie im Kurs.
 */
import { Alert, Button, Group, Modal, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconDownload, IconEye, IconPrinter } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { holen, senden } from '../onlinetest/serverApi'
import { ZettelDruck, zettelAlsPdf, zettelVorschau, type Zettel } from '../lernen/LernendeEintragen'
import { notifyError, notifySuccess } from '../../shared/util'

export interface GastMitCode {
  id: string
  name: string
  /** persönlicher Anmeldecode (8 Zeichen) oder leer, wenn er nicht lesbar gespeichert ist */
  zugang: string
}

const NAME_OK = /^\p{L}[\p{L}'-]*(?: \p{L}[\p{L}'-]*)? \p{L}{1,3}\.?$/u

/** Gäste der Lerngruppe mit Code – lädt nur, wenn die Tabelle Gäste zeigt */
export function useGaesteMitCode(gruppeId: string, aktiv: boolean): { gaeste: GastMitCode[]; laden: () => void } {
  const [gaeste, setGaeste] = useState<GastMitCode[]>([])
  const laden = useCallback(() => {
    if (!aktiv) return setGaeste([])
    void holen<{ gaeste: GastMitCode[] }>(`/server/klassen/${encodeURIComponent(gruppeId)}/gaeste`).then(
      (r) => setGaeste(r.gaeste ?? []),
      (e: unknown) => notifyError(e)
    )
  }, [gruppeId, aktiv])
  useEffect(laden, [laden])
  return { gaeste, laden }
}

/** Knopf „Codezettel drucken" für alle Gäste mit lesbarem Code */
export function CodezettelKnopf({ titel, gaeste }: { titel: string; gaeste: GastMitCode[] }): React.JSX.Element | null {
  const [druck, setDruck] = useState(false)
  const zettel: Zettel[] = gaeste.filter((g) => g.zugang.length === 8).map((g) => ({ name: g.name, zugang: g.zugang }))
  if (!zettel.length) return null
  return (
    <>
      <Button variant="default" size="xs" leftSection={<IconPrinter size={14} />} onClick={() => setDruck(true)} data-codezettel-alle>
        Codezettel drucken ({zettel.length})
      </Button>
      {druck && <ZettelDruck titel={titel} zettel={zettel} adresse={window.location.origin} schliessen={() => setDruck(false)} />}
    </>
  )
}

/** Fenster zu einer Person mit Anmeldecode: Code, Zettel, neuer Code, Namen ändern */
export function GastFenster({
  gruppeId,
  titel,
  gast,
  schliessen,
  geaendert
}: {
  gruppeId: string
  titel: string
  gast: GastMitCode
  schliessen: () => void
  geaendert: () => void
}): React.JSX.Element {
  const [g, setG] = useState(gast)
  const [druck, setDruck] = useState(false)
  const [name, setName] = useState(gast.name)
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const nameOk = NAME_OK.test(name.trim().replace(/\s+/g, ' '))
  const zettel: Zettel[] = g.zugang.length === 8 ? [{ name: g.name, zugang: g.zugang }] : []
  const umbenennen = async (): Promise<void> => {
    setLaeuft(true)
    setFehler('')
    try {
      const r = await senden<{ name: string }>(`/server/klassen/${encodeURIComponent(gruppeId)}/gast-name`, { id: g.id, name })
      setG({ ...g, name: r.name })
      setName(r.name)
      notifySuccess(`Name geändert: ${r.name}`)
      geaendert()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setLaeuft(false)
    }
  }
  const neuerCode = async (): Promise<void> => {
    try {
      const r = await senden<{ zugang: string }>(`/server/klassen/${encodeURIComponent(gruppeId)}/gast-code`, { id: g.id })
      setG({ ...g, zugang: r.zugang })
      geaendert()
    } catch (e) {
      notifyError(e)
    }
  }
  return (
    <>
      <Modal opened onClose={schliessen} title={`Zugang für ${g.name}`} data-gast-fenster>
        <Stack gap="sm" data-gast-zugang>
          <Text size="sm">
            {g.zugang.length === 8
              ? `${g.name} meldet sich auf der Lernseite unter „Mit Code öffnen“ direkt mit dem persönlichen Code an.`
              : `Für ${g.name} ist kein lesbarer Code gespeichert – ein neuer Code ersetzt den alten.`}
          </Text>
          <SimpleGrid cols={2}>
            <div>
              <Text size="xs" c="dimmed">
                Persönlicher Code
              </Text>
              <Title order={3} ff="monospace" data-gast-code>
                {g.zugang || '–'}
              </Title>
            </div>
          </SimpleGrid>
          <Group gap="xs">
            {zettel.length > 0 && (
              <Button leftSection={<IconPrinter size={16} />} onClick={() => setDruck(true)} data-gast-zettel-drucken>
                Zettel drucken
              </Button>
            )}
            {zettel.length > 0 && (
              <Button variant="default" leftSection={<IconDownload size={16} />} onClick={() => zettelAlsPdf(titel, zettel, window.location.origin)} data-gast-zettel-pdf>
                Als PDF sichern
              </Button>
            )}
            {zettel.length > 0 && (
              <Button variant="default" leftSection={<IconEye size={16} />} onClick={() => zettelVorschau(titel, zettel, window.location.origin)} data-pdf-vorschau-knopf>
                Vorschau
              </Button>
            )}
            <Button variant="subtle" onClick={() => void neuerCode()} data-gast-code-neu>
              Neuen Code erzeugen
            </Button>
          </Group>
          {/* Namen ändern (09.10.2026): Enter bestätigt */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (nameOk && !laeuft && name.trim() !== g.name) void umbenennen()
            }}
          >
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <TextInput
                style={{ flex: 1 }}
                label="Namen ändern"
                description="Vorname und Anfangsbuchstabe des Nachnamens, z. B. „Anna K.“"
                value={name}
                onChange={(e) => {
                  setName(e.currentTarget.value)
                  setFehler('')
                }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                error={name.trim() && !nameOk ? 'Format: Vorname und Anfangsbuchstabe, z. B. „Anna K.“' : undefined}
                data-gast-name-feld
              />
              <Button type="submit" variant="light" loading={laeuft} disabled={!nameOk || name.trim() === g.name} data-gast-name-speichern>
                Speichern
              </Button>
            </Group>
          </form>
          {fehler && (
            <Alert color="red" p="xs">
              {fehler}
            </Alert>
          )}
        </Stack>
      </Modal>
      {druck && <ZettelDruck titel={titel} zettel={zettel} adresse={window.location.origin} schliessen={() => setDruck(false)} />}
    </>
  )
}
