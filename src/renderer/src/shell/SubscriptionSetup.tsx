import { Alert, Anchor, Badge, Button, Checkbox, Collapse, Group, Image, Loader, Progress, Select, Stack, Text, TextInput, ThemeIcon } from '@mantine/core'
import { aufServer } from '../shared/plattform'
import { IconAlertTriangle, IconCheck, IconDownload, IconExternalLink, IconLogin, IconPhoto, IconRefresh } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { AiProviderId, AppSettings, DeepPartial, aboInfo, ModelOption, SubscriptionStatus } from '@shared/types'
import { notifyError, notifySuccess } from '../shared/util'

type Update = (patch: DeepPartial<AppSettings>) => Promise<void>

type Phase =
  | { kind: 'idle' }
  | { kind: 'installing'; message: string; received?: number; total?: number }
  | { kind: 'login'; message: string; url?: string; needsCode?: boolean }

const MB = 1024 * 1024

/** Hinweise, welche Modelle das Abo-Kontingent schonen */
const MODEL_HINTS: Partial<Record<AiProviderId, string>> = {
  openai:
    'Für Vokabeltests und Arbeitsblätter reicht meist GPT-5.6-Luna – es verbraucht das Kontingent am wenigsten. GPT-6-Astra ist am stärksten, aber sehr schnell aufgebraucht.',
  anthropic: 'Haiku ist schnell und schont das Kontingent; Sonnet ist ausgewogen; Opus ist am stärksten und verbraucht am meisten.',
  google: 'Welche Modelle verfügbar sind, hängt vom Abo ab. Kleinere Modelle sind schneller und schonen das Kontingent.'
}

/**
 * Abo-Zugang ohne Terminal: Die App lädt das offizielle Programm des Anbieters, startet dessen Anmeldung im Browser
 * und prüft den Zugang. Die Zugangsdaten gibt man nur auf der Anmeldeseite des Anbieters ein.
 */
export default function SubscriptionSetup({
  provider,
  settings,
  update,
  purpose = 'text'
}: {
  provider: AiProviderId
  settings: AppSettings
  update: Update
  /** Für Texte (Modellwahl, Test-Anfrage) oder Bilder (Testbild) */
  purpose?: 'text' | 'image'
}): React.JSX.Element {
  // Nur für Kernanbieter eingeblendet (SettingsPage) – OpenAI-kompatible haben kein Abo
  const info = aboInfo(provider)!
  const { ai } = settings
  const accepted = ai.subscriptionAccepted[provider]
  const savedPath = ai.cliPaths[provider]
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const [code, setCode] = useState('')
  const [models, setModels] = useState<ModelOption[]>([{ id: '', label: 'Voreinstellung des Programms' }])
  const [testing, setTesting] = useState(false)
  const [advanced, setAdvanced] = useState(Boolean(savedPath))
  const [customPath, setCustomPath] = useState(savedPath)

  const check = async (): Promise<SubscriptionStatus | null> => {
    setChecking(true)
    try {
      const st = await window.api.ai.subscriptionStatus(provider)
      setStatus(st)
      if (st.path && st.loggedIn !== false) setModels(await window.api.ai.subscriptionModels(provider))
      return st
    } catch (e) {
      notifyError(e)
      return null
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, savedPath])

  useEffect(
    () =>
      window.api.ai.onSetupEvent((ev) => {
        if (ev.provider !== provider) return
        if (ev.type === 'progress')
          setPhase({
            kind: 'installing',
            message: ev.message,
            received: ev.received,
            total: ev.total
          })
        if (ev.type === 'login-url')
          setPhase({
            kind: 'login',
            message: ev.message,
            url: ev.url,
            needsCode: ev.needsCode
          })
        if (ev.type === 'logged-in') {
          setPhase({ kind: 'idle' })
          setCode('')
          notifySuccess(`Mit ${info.account} angemeldet.`)
          void check()
        }
        // Fehler der Einrichtung meldet der Aufruf selbst; hier nur Fehler der Anmeldung
        if (ev.type === 'error' && phaseRef.current.kind === 'login') {
          setPhase({ kind: 'idle' })
          notifyError(new Error(ev.message), 'Anmeldung fehlgeschlagen')
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider]
  )

  // Beim Verlassen eine offene Anmeldung beenden
  useEffect(() => () => void window.api.ai.loginCancel(provider).catch(() => undefined), [provider])

  const install = async (): Promise<void> => {
    setPhase({ kind: 'installing', message: 'Download wird vorbereitet …' })
    try {
      await window.api.ai.install(provider)
      setPhase({ kind: 'idle' })
      const st = await check()
      notifySuccess(`${info.program} ist eingerichtet.`)
      // Direkt weiter zur Anmeldung, wenn nötig
      if (st && st.loggedIn !== true) await login()
    } catch (e) {
      setPhase({ kind: 'idle' })
      notifyError(e, 'Einrichtung fehlgeschlagen')
    }
  }

  const login = async (): Promise<void> => {
    setCode('')
    setPhase({ kind: 'login', message: 'Anmeldung wird gestartet …' })
    try {
      await window.api.ai.loginStart(provider)
    } catch (e) {
      setPhase({ kind: 'idle' })
      notifyError(e, 'Anmeldung fehlgeschlagen')
    }
  }

  const cancelLogin = async (): Promise<void> => {
    await window.api.ai.loginCancel(provider).catch(() => undefined)
    setPhase({ kind: 'idle' })
  }

  const installed = Boolean(status?.path)
  const loggedIn = installed && status?.loggedIn === true
  const busy = phase.kind !== 'idle'
  const modelOptions = models.some((m) => m.id === ai.subscriptionModels[provider])
    ? models
    : [
        ...models,
        {
          id: ai.subscriptionModels[provider],
          label: ai.subscriptionModels[provider]
        }
      ]

  const [showSetup, setShowSetup] = useState(false)
  // Läuft der Zugang (Programm da, angemeldet, Hinweis bestätigt), verschwindet der
  // Einrichtungsteil: Dann ist nur noch die Modellwahl interessant.
  const ready = loggedIn && accepted

  return (
    <Stack gap="md">
      {ready ? (
        <Group justify="space-between">
          <Group gap="xs">
            <IconCheck size={16} color="var(--mantine-color-teal-6)" />
            <Text size="sm">
              {info.program} eingerichtet und mit {info.account} angemeldet.
            </Text>
          </Group>
          <Button size="compact-xs" variant="subtle" onClick={() => setShowSetup((v) => !v)}>
            {showSetup ? 'Einrichtung ausblenden' : 'Einrichtung anzeigen'}
          </Button>
        </Group>
      ) : null}
      {(!ready || showSetup) && (
        <Alert color="orange" icon={<IconAlertTriangle />} title="Nutzungsbedingungen beachten">
          <Text size="sm">{info.termsWarning}</Text>
          <Anchor size="sm" href={info.termsUrl} target="_blank">
            Bedingungen des Anbieters ansehen
          </Anchor>
          <Checkbox
            mt="sm"
            checked={accepted}
            onChange={(e) =>
              update({
                ai: {
                  subscriptionAccepted: { [provider]: e.currentTarget.checked }
                }
              })
            }
            label={`Ich habe den Hinweis gelesen und nutze mein ${info.plan}-Abo auf eigenes Risiko.`}
          />
        </Alert>
      )}

      {/* Schritt 1 und 2 sind nach erfolgreicher Einrichtung ausgeblendet */}
      {(!ready || showSetup) && (
        <>
          {/* Schritt 1: Programm */}
          <SetupStep number={1} done={installed} title={`${info.program} einrichten`} badge={info.experimental ? 'experimentell' : undefined}>
            {phase.kind === 'installing' ? (
              <Stack gap={4}>
                <Text size="sm">{phase.message}</Text>
                <Progress value={phase.total ? ((phase.received ?? 0) / phase.total) * 100 : 100} animated={!phase.total} striped={!phase.total} />
                {phase.total ? (
                  <Text size="xs" c="dimmed">
                    {Math.round((phase.received ?? 0) / MB)} von {Math.round(phase.total / MB)} MB
                  </Text>
                ) : null}
              </Stack>
            ) : installed ? (
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  {status?.version ?? 'eingerichtet'}
                  {status?.managed ? '' : ' (bereits auf dem PC vorhanden)'}
                </Text>
                {status?.managed && (
                  <Button variant="subtle" size="compact-xs" leftSection={<IconRefresh size={12} />} disabled={busy} onClick={() => void install()}>
                    Aktualisieren
                  </Button>
                )}
              </Group>
            ) : (
              <Stack gap={6} align="flex-start">
                <Text size="sm" c="dimmed">
                  Die App lädt das offizielle Programm von{' '}
                  {info.program.includes('Claude') ? 'Anthropic' : info.program.includes('Codex') ? 'OpenAI' : 'Google'} herunter (ca. {info.downloadMb} MB),
                  prüft die Prüfsumme und legt es in einen eigenen Ordner der App. Am System wird nichts verändert.
                </Text>
                <Button leftSection={<IconDownload size={16} />} disabled={!accepted || busy || checking} onClick={() => void install()}>
                  Jetzt einrichten
                </Button>
                {!accepted && (
                  <Text size="xs" c="orange">
                    Bitte zuerst den Hinweis oben bestätigen.
                  </Text>
                )}
              </Stack>
            )}
          </SetupStep>

          {/* Schritt 2: Anmeldung */}
          <SetupStep number={2} done={loggedIn} title={`Mit ${info.account} anmelden`}>
            {phase.kind === 'login' ? (
              <Stack gap="xs">
                <Group gap="xs" wrap="nowrap" align="start">
                  <Loader size="sm" mt={2} />
                  <Text size="sm">{phase.message}</Text>
                </Group>
                {phase.needsCode && (
                  <Group align="end">
                    <TextInput
                      style={{ flex: 1 }}
                      label="Code von der Anmeldeseite"
                      placeholder="Code hier einfügen"
                      value={code}
                      onChange={(e) => setCode(e.currentTarget.value)}
                      // Enter bestätigt (09.10.2026)
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && code.trim()) (e.currentTarget.closest('.mantine-Group-root')?.querySelector('[data-code-bestaetigen]') as HTMLButtonElement | null)?.click()
                      }}
                      autoFocus
                    />
                    <Button
                      disabled={!code.trim()}
                      data-code-bestaetigen
                      onClick={async () => {
                        try {
                          await window.api.ai.loginCode(provider, code)
                          setPhase({
                            kind: 'login',
                            message: 'Code wird geprüft …'
                          })
                        } catch (e) {
                          notifyError(e)
                        }
                      }}
                    >
                      Bestätigen
                    </Button>
                  </Group>
                )}
                <Group gap="xs">
                  {phase.url &&
                    (aufServer() ? (
                      // Server: Das Programm läuft dort – die Seite öffnet hier der eigene Browser
                      <Button component="a" href={phase.url} target="_blank" rel="noreferrer" size="xs" leftSection={<IconExternalLink size={14} />}>
                        Anmeldeseite öffnen
                      </Button>
                    ) : (
                      <Button
                        variant="light"
                        size="xs"
                        leftSection={<IconExternalLink size={14} />}
                        onClick={() => void window.api.ai.openLoginPage(phase.url!)}
                      >
                        Anmeldeseite erneut öffnen
                      </Button>
                    ))}
                  <Button variant="subtle" size="xs" color="gray" onClick={() => void cancelLogin()}>
                    Abbrechen
                  </Button>
                </Group>
              </Stack>
            ) : loggedIn ? (
              <Stack gap={6}>
                <Group gap="xs">
                  <Text size="sm" c="dimmed">
                    {status?.account ?? 'angemeldet'}
                  </Text>
                  <Button variant="subtle" size="compact-xs" disabled={busy} onClick={() => void login()}>
                    Anderes Konto
                  </Button>
                </Group>
                {status?.warnung && (
                  <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} title="Kostenloser Tarif" data-abo-warnung>
                    {status.warnung}
                  </Alert>
                )}
              </Stack>
            ) : (
              <Stack gap={6} align="flex-start">
                <Text size="sm" c="dimmed">
                  Die Anmeldung öffnet sich im Browser auf der Seite von {info.account}. Die Zugangsdaten gibt man nur dort ein – die App sieht sie nicht.
                </Text>
                {status?.detail && installed && (
                  <Text size="xs" c="orange">
                    {status.detail}
                  </Text>
                )}
                <Button leftSection={<IconLogin size={16} />} disabled={!installed || !accepted || busy} onClick={() => void login()}>
                  Mit {info.account} anmelden
                </Button>
              </Stack>
            )}
          </SetupStep>
        </>
      )}

      {/* Schritt 3: Modell und Test */}
      {purpose === 'image' ? (
        <SetupStep number={3} done={false} title="Testbild erzeugen">
          <ImageTestRow provider={provider} note={info.imageNote} disabled={!loggedIn || !accepted || busy} />
        </SetupStep>
      ) : (
        <SetupStep number={3} done={false} title="Modell wählen und testen">
          <Group align="end">
            <Select
              style={{ flex: 1 }}
              data={modelOptions.map((m) => ({ value: m.id, label: m.label }))}
              value={ai.subscriptionModels[provider]}
              onChange={(v) => update({ ai: { subscriptionModels: { [provider]: v ?? '' } } })}
              allowDeselect={false}
              description={MODEL_HINTS[provider]}
            />
            <Button
              variant="light"
              disabled={!loggedIn || !accepted || busy}
              loading={testing}
              onClick={async () => {
                setTesting(true)
                try {
                  const seconds = await window.api.ai.subscriptionTest(provider)
                  notifySuccess(`Abo-Zugang funktioniert – die Test-Anfrage dauerte ${seconds.toLocaleString('de-DE')} Sekunden.`)
                } catch (e) {
                  notifyError(e, 'Test fehlgeschlagen')
                } finally {
                  setTesting(false)
                }
              }}
            >
              Testen
            </Button>
          </Group>
        </SetupStep>
      )}

      <Text size="xs" c="dimmed">
        Jede KI-Anfrage startet {info.program} kurz im Hintergrund. Das dauert einige Sekunden länger als mit API-Schlüssel und zählt auf die Nutzungsgrenzen
        des Abos. Höchstens drei Anfragen laufen gleichzeitig.{' '}
        <Anchor size="xs" component="button" type="button" onClick={() => setAdvanced((a) => !a)}>
          {advanced ? 'Erweitert ausblenden' : 'Erweitert'}
        </Anchor>
      </Text>
      <Collapse expanded={advanced}>
        <Group align="end">
          <TextInput
            style={{ flex: 1 }}
            size="xs"
            label="Eigenes Programm verwenden (Pfad, optional)"
            placeholder={`z. B. C:\\Tools\\${info.command}.exe`}
            value={customPath}
            onChange={(e) => setCustomPath(e.currentTarget.value)}
            onBlur={() => {
              if (customPath.trim() !== savedPath)
                void update({
                  ai: { cliPaths: { [provider]: customPath.trim() } }
                })
            }}
          />
          <Button variant="subtle" size="xs" leftSection={<IconRefresh size={14} />} loading={checking} onClick={() => void check()}>
            Erneut prüfen
          </Button>
        </Group>
        {status?.path && (
          <Text size="xs" c="dimmed" mt={4} style={{ wordBreak: 'break-all' }}>
            Verwendet: {status.path}
          </Text>
        )}
      </Collapse>
    </Stack>
  )
}

/** Hinweis zu Bildern über das Abo und ein Testbild mit Vorschau. */
export function ImageTestRow({ provider, note, disabled }: { provider: AiProviderId; note: string; disabled?: boolean }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{
    url: string
    seconds: number
  } | null>(null)
  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        {note}
      </Text>
      <Group align="center">
        <Button
          variant="light"
          leftSection={<IconPhoto size={16} />}
          disabled={disabled}
          loading={busy}
          onClick={async () => {
            setBusy(true)
            const started = Date.now()
            try {
              const url = await window.api.ai.subscriptionImageTest(provider)
              setPreview({
                url,
                seconds: Math.round((Date.now() - started) / 1000)
              })
            } catch (e) {
              notifyError(e, 'Testbild fehlgeschlagen')
            } finally {
              setBusy(false)
            }
          }}
        >
          Testbild erzeugen
        </Button>
        {busy && (
          <Text size="xs" c="dimmed">
            Das kann bis zu einer Minute dauern …
          </Text>
        )}
      </Group>
      {preview && (
        <Group align="end" gap="sm">
          <Image src={preview.url} w={120} h={120} fit="contain" radius="sm" bg="white" style={{ border: '1px solid var(--mantine-color-default-border)' }} />
          <Text size="xs" c="dimmed">
            Testbild nach {preview.seconds} Sekunden erhalten.
          </Text>
        </Group>
      )}
    </Stack>
  )
}

function SetupStep({
  number,
  done,
  title,
  badge,
  children
}: {
  number: number
  done: boolean
  title: string
  badge?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Group align="start" wrap="nowrap" gap="sm">
      <ThemeIcon radius="xl" size={28} variant={done ? 'filled' : 'light'} color={done ? 'teal' : undefined}>
        {done ? (
          <IconCheck size={16} />
        ) : (
          <Text size="sm" fw={700}>
            {number}
          </Text>
        )}
      </ThemeIcon>
      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6}>
          <Text fw={600}>{title}</Text>
          {badge && (
            <Badge color="grape" size="xs">
              {badge}
            </Badge>
          )}
        </Group>
        {children}
      </Stack>
    </Group>
  )
}
