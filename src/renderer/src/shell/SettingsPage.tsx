import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Container,
  Divider,
  Group,
  PasswordInput,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme
} from '@mantine/core'
import {
  IconCheck,
  IconDeviceDesktop,
  IconDeviceTablet,
  IconTool,
  IconExternalLink,
  IconFileText,
  IconMoon,
  IconPalette,
  IconPhoto,
  IconRefresh,
  IconSchool,
  IconSparkles,
  IconSun
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import {
  AI_PROVIDERS,
  AiAccess,
  AiProviderId,
  AppSettings,
  CefrTable,
  ColorSchemeSetting,
  ImageProviderId,
  ModelKind,
  ModelListResult,
  SecretName,
  SUBSCRIPTIONS
} from '@shared/types'
import { useAppSettings } from '../shared/settingsStore'
import { openSettings, SettingsTab, useNavigation } from '../shared/navigation'
import SubscriptionSetup, { ImageTestRow } from './SubscriptionSetup'
import { AppTheme, mix, THEMES } from '../shared/themes'
import DropZone, { FILE_TYPES } from '../shared/components/DropZone'
import { normalizeImage, notifyError, notifySuccess, readFileAsDataUrl } from '../shared/util'
import { CITATION_STYLES } from '../shared/citation'
import GradeScaleSettings from './GradeScaleSettings'
import KorrekturzeichenSettings from './KorrekturzeichenSettings'
import SchreibanteilSettings from './SchreibanteilSettings'
import MaskottchenSettings from './MaskottchenSettings'
import FachfarbenSettings from './FachfarbenSettings'
import NetzwerkCard from './NetzwerkCard'
import WartungCard from './WartungCard'
import SicherungenCard from './SicherungenCard'
import VerbrauchCard from './VerbrauchCard'
import { imNetz } from '../shared/netzZugang'
import { amPc, aufIos } from '../shared/plattform'
import PictogramStudio from './PictogramStudio'
import { PcKiVerbindung, PcKiWahl } from './PcKiZugang'
import AblageCard from './AblageCard'
import { PICTOGRAMS } from '../modules/arbeitsblatt/render/pictograms'
import { PictogramIcon } from '../modules/arbeitsblatt/render/Pictogram'
import HaeufigSelect from '../shared/components/HaeufigSelect'
import SchulnameFeld from './Schulsuche'
import BriefkopfFelder from './BriefkopfFelder'
import { stateInfo } from '../modules/arbeitsblatt/didactics/states'
import { EigeneFaecherFeld, ProgrammeAnzeigenCard } from './ProgrammeAnzeigen'

/**
 * Die Einstellungen in Reitern.
 *
 * Vorher standen alle Karten untereinander auf einer sehr langen Seite – der
 * Notenschlüssel lag hinter dem KI-Zugang, und wer ihn suchte, scrollte an sechs Karten
 * vorbei. Die Reiter sind nach der Frage geordnet, die man im Kopf hat, wenn man hierher
 * kommt: Wo unterrichte ich? Wie soll Material aussehen? Womit arbeitet die KI?
 *
 * Der gewählte Reiter wird NICHT gespeichert: Man kommt fast immer wegen einer bestimmten
 * Sache her, und dann ist der erste Reiter der bessere Startpunkt als der letzte, den man
 * vor drei Wochen offen hatte. Kommt man über einen Hinweis in einem Programm her
 * („KI-Zugang einrichten"), öffnet der Navigations-Store gleich den passenden Reiter.
 */
export default function SettingsPage(): React.JSX.Element {
  const { settings, update } = useAppSettings()
  const gewuenscht = useNavigation((s) => s.settingsTab)
  const setTab = useNavigation((s) => s.setSettingsTab)
  // KI-Zugang, Netzwerk und Wartung gibt es nur am Rechner – vom Tablet aus gilt dann der erste Reiter
  const tab = (imNetz() && ['ki', 'netzwerk', 'wartung'].includes(gewuenscht)) || (aufIos() && gewuenscht === 'netzwerk') ? 'schule' : gewuenscht

  return (
    <Tabs
      value={tab}
      onChange={(v) => v && setTab(v as SettingsTab)}
      orientation="horizontal"
      keepMounted={false}
      h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <Container size="md" pt={40} pb={0} w="100%">
        <Title order={2} mb="md">
          Einstellungen
        </Title>
        <Tabs.List>
          <Tabs.Tab value="schule" leftSection={<IconSchool size={16} />}>
            Schule
          </Tabs.Tab>
          <Tabs.Tab value="material" leftSection={<IconFileText size={16} />}>
            Material
          </Tabs.Tab>
          <Tabs.Tab value="darstellung" leftSection={<IconPalette size={16} />}>
            Darstellung
          </Tabs.Tab>
          {/*
           * KI-Zugang und Netzwerk gibt es nur am Rechner.
           *
           * Beide richten etwas auf DIESEM Rechner ein – Anmeldefenster der KI-Anbieter,
           * den Netzzugang selbst. Vom Tablet aus wäre das wirkungslos oder gefährlich,
           * deshalb sind die Aufrufe gesperrt. Die Reiter dann trotzdem zu zeigen hieße,
           * jemanden in eine Fehlermeldung laufen zu lassen.
           */}
          {!imNetz() && (
            <Tabs.Tab value="ki" leftSection={<IconSparkles size={16} />}>
              KI-Zugang
            </Tabs.Tab>
          )}
          <Tabs.Tab value="dienste" leftSection={<IconPhoto size={16} />}>
            Bilder und Hörtexte
          </Tabs.Tab>
          {/* Den Zugang aus dem Netz gibt es nur am PC – nicht im Browser und nicht in der iPad-App */}
          {amPc() && (
            <Tabs.Tab value="netzwerk" leftSection={<IconDeviceTablet size={16} />}>
              Netzwerk
            </Tabs.Tab>
          )}
          {/*
           * Wartung nur am Rechner: Das Zurücksetzen leert die Ablage DIESES Rechners.
           * Vom Tablet aus wäre das eine Fernsteuerung, die niemand erwartet.
           */}
          {!imNetz() && (
            <Tabs.Tab value="wartung" leftSection={<IconTool size={16} />}>
              Wartung
            </Tabs.Tab>
          )}
        </Tabs.List>
      </Container>

      <ScrollArea style={{ flex: 1 }}>
        <Container size="md" py="lg">
          <Tabs.Panel value="schule">
            <Stack gap="lg">
              <SchoolCard settings={settings} update={update} />
              <ProgrammeAnzeigenCard settings={settings} update={update} />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="material">
            <Stack gap="lg">
              {/* Nur iPad: wohin erstellte Dateien kommen (30.09.2026) */}
              {aufIos() && <AblageCard settings={settings} update={update} />}
              <FachfarbenSettings settings={settings} update={update} />
              <GradeScaleSettings settings={settings} update={update} />
              <KorrekturzeichenSettings settings={settings} update={update} />
              <SchreibanteilSettings settings={settings} update={update} />
              <MaskottchenSettings settings={settings} update={update} />
              <Card withBorder padding="lg">
                <Title order={4} mb="md">
                  KI-Kennzeichnung und Datenschutz
                </Title>
                <Stack gap="sm">
                  <Select
                    label="KI-Vermerk auf neuen Materialien"
                    description="Mit KI erstellte Materialien tragen in den Dateieigenschaften von Word und PDF immer eine maschinenlesbare Kennzeichnung. Sichtbar steht der Vermerk nach der Wahl hier; am einzelnen Material lässt sie sich in den Blattoptionen ändern."
                    data={[
                      { value: 'loesung', label: 'Nur im Lösungsteil' },
                      { value: 'ueberall', label: 'Auf jeder Seite' },
                      { value: 'aus', label: 'Nicht anzeigen' }
                    ]}
                    value={settings.kiVermerk ?? 'loesung'}
                    onChange={(v) => v && update({ kiVermerk: v as AppSettings['kiVermerk'] })}
                    allowDeselect={false}
                  />
                  <Switch
                    label="Namen vor dem Senden an die KI durch Kürzel ersetzen"
                    description="Erkannte Vor- und Nachnamen in hochgeladenen Texten werden vor der Anfrage durch S1, S2 … ersetzt. Die Zuordnung bleibt auf diesem Rechner. In Fotos und Scans lassen sich Namen nicht zuverlässig finden – die bitte vorher schwärzen."
                    checked={settings.datenschutz?.namenErsetzen !== false}
                    onChange={(e) => update({ datenschutz: { ...settings.datenschutz, namenErsetzen: e.currentTarget.checked } })}
                  />
                  {settings.datenschutz?.hinweisBestaetigt && (
                    <Group gap="xs">
                      <Text size="xs" c="dimmed">
                        Datenschutzhinweis bestätigt am {new Date(settings.datenschutz.hinweisBestaetigt).toLocaleDateString('de-DE')}.
                      </Text>
                      <Button size="compact-xs" variant="subtle" onClick={() => update({ datenschutz: { ...settings.datenschutz, hinweisBestaetigt: '' } })}>
                        Beim nächsten Hochladen wieder zeigen
                      </Button>
                    </Group>
                  )}
                </Stack>
              </Card>
              <Card withBorder padding="lg">
                <Title order={4} mb="md">
                  Quellenangaben
                </Title>
                <Select
                  label="Quellenangaben nach"
                  description={CITATION_STYLES.find((c) => c.value === (settings.citationStyle ?? 'deutsch'))?.description}
                  data={CITATION_STYLES.map((c) => ({ value: c.value, label: c.label }))}
                  value={settings.citationStyle ?? 'deutsch'}
                  onChange={(v) => v && update({ citationStyle: v as AppSettings['citationStyle'] })}
                  allowDeselect={false}
                />
                <Text size="xs" c="dimmed" mt={6}>
                  Beispiel: {CITATION_STYLES.find((c) => c.value === (settings.citationStyle ?? 'deutsch'))?.example}
                </Text>
              </Card>
              <Card withBorder padding="lg">
                <Title order={4} mb="md">
                  Symbole
                </Title>
                <PictogramField />
              </Card>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="darstellung">
            <AppearanceCard settings={settings} update={update} />
          </Tabs.Panel>

          {!imNetz() && (
            <Tabs.Panel value="ki">
              <Stack gap="md">
                <AiCard settings={settings} update={update} />
                <VerbrauchCard />
              </Stack>
            </Tabs.Panel>
          )}

          <Tabs.Panel value="dienste">
            <Stack gap="lg">
              {/*
                Die Bild-KI stand bis 25.09.2026 im Reiter „KI-Zugang". Gesucht wurde sie aber hier,
                bei Bildern und Hörtexten – und die Piktogramm-Werkstatt verwies auf sie. Am Tablet
                nicht: Die Anmeldung beim Anbieter läuft auf dem Rechner.
              */}
              {!imNetz() && <ImageAiCard settings={settings} update={update} />}
              <Card withBorder padding="lg">
                <Title order={4} mb="md">
                  Bildsuche
                </Title>
                <SecretField
                  name="pixabay"
                  label="Pixabay-API-Schlüssel (optional)"
                  placeholder="kostenlos unter pixabay.com/api/docs"
                  keyUrl="pixabay.com/api/docs"
                />
                <Text size="xs" c="dimmed" mt="xs">
                  Die Openverse-Suche funktioniert ohne Schlüssel.
                </Text>
              </Card>

              <HoertextCard settings={settings} update={update} />
            </Stack>
          </Tabs.Panel>

          {amPc() && (
            <Tabs.Panel value="netzwerk">
              <NetzwerkCard settings={settings} update={update} />
            </Tabs.Panel>
          )}
          {!imNetz() && (
            <Tabs.Panel value="wartung">
              <Stack gap="md">
                <SicherungenCard />
                <WartungCard />
              </Stack>
            </Tabs.Panel>
          )}
        </Container>
      </ScrollArea>
    </Tabs>
  )
}

type Update = (patch: Parameters<ReturnType<typeof useAppSettings.getState>['update']>[0]) => Promise<void>

// ---------- Darstellung ----------

export function AppearanceCard({ settings, update }: { settings: AppSettings; update: Update }): React.JSX.Element {
  const scheme = useComputedColorScheme('light')
  /*
   * Ohne Einklappen: Die Karte steht allein in ihrem Reiter (und allein im Schritt der
   * Einrichtung). Zugeklappt stand dort nur eine Überschrift, und der Pfeil war ein Klick
   * mehr ohne Nutzen.
   */
  return (
    <Card withBorder padding="lg">
      <Title order={4} mb="md">
        Darstellung
      </Title>
      <div>
        <Text size="sm" fw={500} mb={4}>
          Modus
        </Text>
        <SegmentedControl
          value={settings.appearance.colorScheme}
          onChange={(v) => update({ appearance: { colorScheme: v as ColorSchemeSetting } })}
          data={[
            {
              value: 'light',
              label: <ModeLabel icon={<IconSun size={16} />} text="Hell" />
            },
            {
              value: 'dark',
              label: <ModeLabel icon={<IconMoon size={16} />} text="Dunkel" />
            },
            {
              value: 'auto',
              label: <ModeLabel icon={<IconDeviceDesktop size={16} />} text="Wie Windows" />
            }
          ]}
        />
        <Text size="sm" fw={500} mt="lg" mb={6}>
          Thema
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          {THEMES.map((t) => (
            <UnstyledButton
              key={t.id}
              className="theme-swatch"
              data-active={settings.appearance.theme === t.id}
              onClick={() => update({ appearance: { theme: t.id } })}
              p="sm"
              style={{ borderRadius: 10 }}
            >
              <ThemePreview theme={t} scheme={scheme} />
              <Text size="sm" fw={600} mt={8}>
                {t.label}
              </Text>
              <Text size="xs" c="dimmed" lh={1.3}>
                {t.description}
              </Text>
            </UnstyledButton>
          ))}
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="sm">
          Das Thema ändert Farben, Schriften, Ecken, Navigation und Karten der Oberfläche. Tests und Arbeitsblätter werden davon nicht verändert.
        </Text>
      </div>
    </Card>
  )
}

/** Miniatur der Oberfläche im jeweiligen Thema (Leiste, Kopfbereich, Karte, Knopf). */
function ThemePreview({ theme: t, scheme }: { theme: AppTheme; scheme: 'light' | 'dark' }): React.JSX.Element {
  const p = scheme === 'dark' ? t.dark : t.light
  const radius = { xs: 2, sm: 4, md: 6, lg: 9, xl: 13 }[String(t.radius)] ?? 0
  const primary = t.primary[scheme === 'dark' ? t.primaryShade.dark : t.primaryShade.light]
  const filledNav = t.nav === 'filled'
  const card: React.CSSProperties = {
    background: t.cards === 'flat' ? mix(p.surface, p.bg, 0.3) : p.surface,
    borderRadius: radius,
    padding: '5px 7px',
    border: t.cards === 'bold' ? `2px solid ${p.text}` : t.cards === 'border' ? `1px solid ${p.border}` : '1px solid transparent',
    boxShadow: t.cards === 'shadow' ? '0 2px 6px rgba(0,0,0,0.15)' : t.cards === 'bold' ? `2px 2px 0 ${primary}` : 'none'
  }
  return (
    <div className="theme-preview" style={{ background: p.bg }}>
      <div
        style={{
          width: 22,
          background: p.nav,
          borderRight: `1px solid ${filledNav ? 'transparent' : p.border}`,
          padding: '6px 4px'
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 12,
              marginBottom: 4,
              borderRadius: Math.min(radius, 4),
              background: i === 0 ? (filledNav ? '#fff' : primary) : filledNav ? 'rgba(255,255,255,0.25)' : p.border
            }}
          />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          minWidth: 0
        }}
      >
        <div
          style={{
            background: p.hero,
            borderRadius: radius,
            color: '#fff',
            padding: '3px 7px',
            fontFamily: t.headingFontFamily,
            fontWeight: Number(t.headingWeight),
            fontSize: 12
          }}
        >
          Aa Schul-Apps
        </div>
        <div style={card}>
          <div
            style={{
              fontFamily: t.fontFamily,
              fontSize: 9,
              color: p.dimmed,
              whiteSpace: 'nowrap',
              overflow: 'hidden'
            }}
          >
            Vokabeltest
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            <div
              style={{
                height: 8,
                width: 30,
                borderRadius: radius,
                background: primary
              }}
            />
            <div
              style={{
                height: 8,
                width: 22,
                borderRadius: radius,
                border: `1px solid ${p.border}`,
                background: p.surface
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ModeLabel({ icon, text }: { icon: React.ReactNode; text: string }): React.JSX.Element {
  return (
    <Group gap={6} wrap="nowrap" px={4}>
      {icon}
      <span>{text}</span>
    </Group>
  )
}

// ---------- KI ----------

export function AiCard({ settings, update }: { settings: AppSettings; update: Update }): React.JSX.Element {
  const { ai } = settings
  const textInfo = AI_PROVIDERS.find((p) => p.id === ai.textProvider)!
  const [reloadKey, setReloadKey] = useState(0)
  /*
   * Den Abo-Zugang gibt es auf dem iPad nicht direkt (kein Programm des Anbieters). Dort heißt
   * die Wahl „API-Schlüssel" oder „Abo über den PC": Die App am PC erzeugt mit IHREM Zugang
   * (30.09.2026, mobil/pcKi.ts).
   */
  const ios = aufIos()
  const ueberPc = ios && Boolean(settings.pcKi?.texte)
  const zugang: AiAccess = ios ? 'api' : ai.access[ai.textProvider]

  return (
    <Card withBorder padding="lg">
      <Title order={4} mb={4}>
        Künstliche Intelligenz
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        {ios
          ? 'Die KI erstellt Aufgaben und liest Vokabellisten aus Fotos. Zugang entweder über einen API-Schlüssel (nutzungsabhängig bezahlt; er liegt verschlüsselt im Schlüsselbund dieses Geräts) oder über Schul-Apps am PC: Dann erzeugt der PC mit seinem Abo oder Schlüssel, das iPad schickt nur den Auftrag.'
          : 'Die KI erstellt Aufgaben und liest Vokabellisten aus Fotos. Zugang entweder über einen API-Schlüssel (schnell, nutzungsabhängig bezahlt; Schlüssel werden verschlüsselt auf diesem PC gespeichert) oder über ein privates Abo mithilfe des offiziellen Programms des Anbieters (langsamer, mit Nutzungsgrenzen des Abos).'}{' '}
        Die KI für Bilder steht im Reiter{' '}
        <Anchor component="button" size="sm" onClick={() => openSettings('dienste')}>
          Bilder und Hörtexte
        </Anchor>
        .
      </Text>

      <Stack gap="md">
        {ios && <PcKiWahl settings={settings} update={update} gruppe="texte" />}
        {/* Über den PC wählt der PC Anbieter und Modell */}
        {!ueberPc && (
          <Select
            label="KI für Aufgaben und Texterkennung"
            data={AI_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
            value={ai.textProvider}
            onChange={(v) => v && update({ ai: { textProvider: v as AiProviderId } })}
            allowDeselect={false}
          />
        )}
        {!ios && (
          <SegmentedControl
            value={ai.access[ai.textProvider]}
            onChange={(v) => update({ ai: { access: { [ai.textProvider]: v as AiAccess } } })}
            data={[
              { value: 'api', label: 'API-Schlüssel' },
              {
                value: 'subscription',
                label: `Abo (${SUBSCRIPTIONS[ai.textProvider].plan})`
              }
            ]}
          />
        )}
        {ueberPc ? (
          <PcKiVerbindung settings={settings} update={update} />
        ) : zugang === 'subscription' ? (
          <SubscriptionSetup key={`sub-${ai.textProvider}`} provider={ai.textProvider} settings={settings} update={update} />
        ) : (
          <>
            <SecretField
              key={`text-${ai.textProvider}`}
              name={ai.textProvider}
              label={`API-Schlüssel für ${textInfo.label}`}
              placeholder={textInfo.keyPlaceholder}
              description={`Erhältlich unter ${textInfo.keyUrl}`}
              keyUrl={textInfo.keyUrl}
              onSaved={() => setReloadKey((k) => k + 1)}
              testable
            />
            <ModelSelect
              key={`text-model-${ai.textProvider}-${reloadKey}`}
              provider={ai.textProvider}
              kind="text"
              value={ai.textModels[ai.textProvider]}
              onChange={(id) =>
                update({
                  ai: {
                    textModels: { [ai.textProvider]: id },
                    autoLatest: false
                  }
                })
              }
              label="Modell"
            />
          </>
        )}

        {/* Über den PC gelten Sparmodus und Modellwahl des PCs */}
        {!ueberPc && (
          <>
            <Select
              label="Sparmodus"
              data={[
                { value: 'auto', label: 'Automatisch – beim Abo an' },
                { value: 'on', label: 'Immer an' },
                { value: 'off', label: 'Aus – größte Sorgfalt (mehr Anfragen)' }
              ]}
              value={ai.economy}
              onChange={(v) => v && update({ ai: { economy: v as AppSettings['ai']['economy'] } })}
              allowDeselect={false}
              description="Im Sparmodus entstehen alle Aufgaben einer Testvariante in einer einzigen KI-Anfrage, die zusätzliche Prüfrunde entfällt. Das spart beim Abo einen Großteil des Kontingents (etwa 5- bis 10-mal weniger Anfragen). Kleinere Modelle sparen zusätzlich."
            />

            <Divider />

            <Checkbox
              checked={ai.autoLatest}
              onChange={(e) => update({ ai: { autoLatest: e.currentTarget.checked } })}
              label="Modelle automatisch aktuell halten"
              description="Die Modellliste wird beim Start und alle 12 Stunden direkt beim Anbieter abgefragt. Ist diese Option aktiv, wird immer das empfohlene neueste Modell genutzt. Abgekündigte Modelle werden in jedem Fall automatisch ersetzt."
            />
          </>
        )}
      </Stack>
    </Card>
  )
}

/**
 * KI für Bilder – eigene Karte im Reiter „Bilder und Hörtexte" (vorher im Reiter „KI-Zugang").
 * Die Einstellungen selbst sind unverändert: Anbieter, Zugang per Schlüssel oder Abo, Modell.
 */
export function ImageAiCard({ settings, update }: { settings: AppSettings; update: Update }): React.JSX.Element {
  const { ai } = settings
  const imageProvider = ai.imageProvider === 'none' ? null : ai.imageProvider
  // iPad: API-Schlüssel oder über den PC (siehe AiCard)
  const ios = aufIos()
  const ueberPc = ios && Boolean(settings.pcKi?.bilder)
  const imageAccess = imageProvider && !ios ? ai.imageAccess[imageProvider] : 'api'
  const textZugang: AiAccess = ios ? 'api' : ai.access[ai.textProvider]
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <Card withBorder padding="lg">
      <Title order={4} mb={4}>
        Bilder mit KI
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Erzeugt auf Wunsch Bilder für Arbeitsblätter und gestaltet Piktogramme neu. Der Zugang lässt sich getrennt von der KI für Texte wählen.
      </Text>
      <Stack gap="md">
        {ios && <PcKiWahl settings={settings} update={update} gruppe="bilder" />}
        {ueberPc && <PcKiVerbindung settings={settings} update={update} />}
        {!ueberPc && (
        <Select
          label="KI für Bilder"
          data={[
            { value: 'openai', label: 'OpenAI (ChatGPT)' },
            { value: 'google', label: 'Google (Gemini)' },
            {
              value: 'anthropic',
              label: 'Anthropic (Claude) – zeichnet Vektorgrafiken'
            },
            { value: 'none', label: 'Keine KI-Bilder' }
          ]}
          value={ai.imageProvider}
          onChange={(v) => v && update({ ai: { imageProvider: v as ImageProviderId } })}
          allowDeselect={false}
          description="Claude erzeugt keine Fotos, zeichnet aber einfache Vektorgrafiken (gut für Piktogramme)."
        />
        )}
        {imageProvider && !ueberPc && (
          <>
            {!ios && (
              <SegmentedControl
                value={imageAccess}
                onChange={(v) =>
                  update({
                    ai: { imageAccess: { [imageProvider]: v as AiAccess } }
                  })
                }
                data={[
                  { value: 'api', label: 'API-Schlüssel' },
                  {
                    value: 'subscription',
                    label: `Abo (${SUBSCRIPTIONS[imageProvider].plan})`
                  }
                ]}
              />
            )}
            {imageAccess === 'subscription' ? (
              textZugang === 'subscription' && ai.textProvider === imageProvider ? (
                <ImageTestRow
                  provider={imageProvider}
                  note={`Nutzt den im Reiter „KI-Zugang“ eingerichteten Abo-Zugang. ${SUBSCRIPTIONS[imageProvider].imageNote}`}
                />
              ) : (
                <SubscriptionSetup key={`sub-image-${imageProvider}`} provider={imageProvider} settings={settings} update={update} purpose="image" />
              )
            ) : (
              <>
                {(imageProvider !== ai.textProvider || textZugang === 'subscription') && (
                  <SecretField
                    key={`image-${imageProvider}`}
                    name={imageProvider}
                    label={`API-Schlüssel für ${AI_PROVIDERS.find((p) => p.id === imageProvider)!.label}`}
                    placeholder={AI_PROVIDERS.find((p) => p.id === imageProvider)!.keyPlaceholder}
                    keyUrl={AI_PROVIDERS.find((p) => p.id === imageProvider)!.keyUrl}
                    onSaved={() => setReloadKey((k) => k + 1)}
                    testable
                  />
                )}
                {imageProvider === 'anthropic' ? (
                  <Text size="xs" c="dimmed">
                    Für Zeichnungen wird das im Reiter „KI-Zugang“ zuletzt gewählte Claude-Textmodell verwendet ({ai.textModels.anthropic}).
                  </Text>
                ) : (
                  <ModelSelect
                    key={`image-model-${imageProvider}-${reloadKey}`}
                    provider={imageProvider}
                    kind="image"
                    value={ai.imageModels[imageProvider]}
                    onChange={(id) =>
                      update({
                        ai: {
                          imageModels: { [imageProvider]: id },
                          autoLatest: false
                        }
                      })
                    }
                    label="Bildmodell"
                  />
                )}
              </>
            )}
          </>
        )}
      </Stack>
    </Card>
  )
}

/**
 * Hörtexte vertonen – eigene Karte (30.09.2026 herausgelöst), damit Einstellungsseite und
 * Einrichtungsassistent DIESELBE Karte zeigen.
 *
 * Vertont wird über ElevenLabs oder einen OpenAI-API-Schlüssel (services/audio). In der
 * iPad-App geht es auch über den PC: Dann vertont Schul-Apps am PC mit seinen Schlüsseln, und
 * die fertige Hördatei landet auf dem iPad.
 */
export function HoertextCard({ settings, update }: { settings: AppSettings; update: Update }): React.JSX.Element {
  const ios = aufIos()
  const ueberPc = ios && Boolean(settings.pcKi?.hoertexte)
  return (
    <Card withBorder padding="lg">
      <Title order={4} mb="md">
        Hörtexte
      </Title>
      <Stack gap="sm">
        {ios && <PcKiWahl settings={settings} update={update} gruppe="hoertexte" lokal="Eigener Schlüssel" />}
        {ueberPc ? (
          <PcKiVerbindung settings={settings} update={update} />
        ) : (
          <div>
            <SecretField
              name="elevenlabs"
              label="ElevenLabs-API-Schlüssel (optional)"
              placeholder="sk_… (elevenlabs.io → Profil → API Keys)"
              keyUrl="elevenlabs.io/app/settings/api-keys"
            />
            <Text size="xs" c="dimmed" mt="xs">
              Nötig, um Hörverstehens-Aufgaben zu vertonen: Die KI schreibt das Skript, gesprochene Sprache erzeugt keiner der Abo-Zugänge. Ein
              OpenAI-API-Schlüssel (Reiter „KI-Zugang“) vertont ebenfalls – mit den OpenAI-Stimmen. Ohne Schlüssel bleibt das Skript als Lesetext für die
              Lehrkraft erhalten.
            </Text>
            {/* Der häufigste Einrichtungsfehler – die Seite zeigt beides untereinander an */}
            <Text size="xs" c="dimmed" mt={4}>
              Achtung: Der Schlüssel beginnt mit <b>sk_</b> und wird nur <b>einmal</b> angezeigt – beim Anlegen oder Erneuern. Die lange Zeichenfolge, die in
              der Übersicht steht, ist nur die Kennung des Schlüssels und funktioniert nicht.
            </Text>
          </div>
        )}
      </Stack>
    </Card>
  )
}

function ModelSelect({
  provider,
  kind,
  value,
  onChange,
  label
}: {
  provider: AiProviderId
  kind: ModelKind
  value: string
  onChange: (id: string) => void
  label: string
}): React.JSX.Element {
  const [list, setList] = useState<ModelListResult | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async (refresh: boolean): Promise<void> => {
    setLoading(true)
    try {
      const res = await window.api.ai.models(provider, kind, refresh)
      setList(res)
      if (refresh && res.error) notifyError(res.error, 'Modellliste konnte nicht aktualisiert werden')
      else if (refresh) notifySuccess(`${res.models.length} passende Modelle gefunden.`)
    } catch (e) {
      notifyError(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, kind])

  const options = list?.models ?? []
  const data = options.map((m) => ({
    value: m.id,
    label: m.recommended ? `${m.label} · empfohlen` : m.label
  }))
  if (value && !options.some((m) => m.id === value)) data.unshift({ value, label: `${value} (aktuell gewählt)` })

  const status =
    list?.source === 'builtin'
      ? 'Vorläufige Liste – nach Eingabe des Schlüssels wird die aktuelle Liste des Anbieters geladen.'
      : list?.fetchedAt
        ? `Liste vom Anbieter, Stand ${new Date(list.fetchedAt).toLocaleString('de-DE')}`
        : ''

  return (
    <Group align="end" wrap="nowrap">
      <Select
        style={{ flex: 1 }}
        label={label}
        description={status}
        data={data}
        value={value}
        onChange={(v) => v && v !== value && onChange(v)}
        allowDeselect={false}
        maxDropdownHeight={320}
        nothingFoundMessage="Keine Modelle gefunden"
      />
      <Tooltip label="Modellliste jetzt beim Anbieter abfragen">
        <ActionIcon size={36} variant="default" loading={loading} onClick={() => load(true)} aria-label="Modellliste aktualisieren">
          <IconRefresh size={18} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}

/** Merkt sich je Anbieter, dass ein Schlüssel einmal erfolgreich getestet wurde. */
const verifiedKey = (name: SecretName): string => `schul-apps-key-geprueft-${name}`
const readVerified = (name: SecretName): boolean => {
  try {
    return localStorage.getItem(verifiedKey(name)) === '1'
  } catch {
    return false
  }
}
const writeVerified = (name: SecretName, value: boolean): void => {
  try {
    if (value) localStorage.setItem(verifiedKey(name), '1')
    else localStorage.removeItem(verifiedKey(name))
  } catch {
    // ohne lokalen Speicher bleibt der Knopf sichtbar – unkritisch
  }
}

function SecretField({
  name,
  label,
  placeholder,
  description,
  keyUrl,
  onSaved,
  testable
}: {
  name: SecretName
  label: string
  placeholder: string
  description?: string
  /** Seite des Anbieters, auf der man den Schlüssel anlegt oder nachschaut */
  keyUrl?: string
  onSaved?: () => void
  testable?: boolean
}): React.JSX.Element {
  const [value, setValue] = useState('')
  const [stored, setStored] = useState(false)
  const [testing, setTesting] = useState(false)
  const [verified, setVerified] = useState(() => readVerified(name))

  useEffect(() => {
    window.api.secrets.has(name).then(setStored).catch(notifyError)
    setVerified(readVerified(name))
  }, [name])

  return (
    <Group align="end">
      <PasswordInput
        style={{ flex: 1 }}
        description={description}
        label={
          <Group gap={6}>
            {label}
            {stored ? (
              <Badge color="teal" size="xs" leftSection={<IconCheck size={10} />}>
                gespeichert
              </Badge>
            ) : (
              <Badge color="gray" size="xs">
                nicht hinterlegt
              </Badge>
            )}
          </Group>
        }
        placeholder={stored ? '•••••••• (zum Ändern neu eingeben)' : placeholder}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
      />
      <Button
        disabled={!value}
        onClick={async () => {
          try {
            await window.api.secrets.set(name, value.trim())
            setValue('')
            setStored(true)
            setVerified(false)
            writeVerified(name, false)
            notifySuccess('Schlüssel gespeichert.')
            onSaved?.()
          } catch (e) {
            notifyError(e)
          }
        }}
      >
        Speichern
      </Button>
      {keyUrl && !(stored && verified) && (
        <Button
          variant="default"
          leftSection={<IconExternalLink size={16} />}
          component="a"
          href={keyUrl.startsWith('http') ? keyUrl : `https://${keyUrl}`}
          target="_blank"
        >
          Schlüssel anlegen / ansehen
        </Button>
      )}
      {stored && name === 'elevenlabs' && (
        <Button
          variant="light"
          loading={testing}
          onClick={async () => {
            setTesting(true)
            try {
              const voices = await window.api.audio.voices()
              notifySuccess(`Der Schlüssel funktioniert – ${voices.length} Stimmen verfügbar.`)
              setVerified(true)
              writeVerified(name, true)
              onSaved?.()
            } catch (e) {
              notifyError(e, 'ElevenLabs antwortet nicht')
            } finally {
              setTesting(false)
            }
          }}
        >
          Testen
        </Button>
      )}
      {stored && testable && name !== 'pixabay' && name !== 'elevenlabs' && (
        <Button
          variant="light"
          loading={testing}
          onClick={async () => {
            setTesting(true)
            try {
              const count = await window.api.ai.test(name as AiProviderId)
              notifySuccess(`Verbindung und Guthaben in Ordnung – eine Test-Anfrage hat funktioniert (${count} Modelle verfügbar).`)
              setVerified(true)
              writeVerified(name, true)
              onSaved?.()
            } catch (e) {
              notifyError(e, 'Verbindung fehlgeschlagen')
            } finally {
              setTesting(false)
            }
          }}
        >
          Testen
        </Button>
      )}
      {stored && (
        <Button
          variant="subtle"
          color="red"
          onClick={async () => {
            await window.api.secrets.set(name, '')
            setStored(false)
            setVerified(false)
            writeVerified(name, false)
          }}
        >
          Entfernen
        </Button>
      )}
    </Group>
  )
}

// ---------- Schule ----------

/** Schulname sowie Bundesland und Schulform als Standard für neue Materialien. */
export function SchoolCard({ settings, update }: { settings: AppSettings; update: Update }): React.JSX.Element {
  const [table, setTable] = useState<CefrTable | null>(null)

  useEffect(() => {
    window.api.cefr.get().then(setTable).catch(notifyError)
  }, [])

  const { stateId, schoolTypeId } = settings.defaults
  const state = table?.states.find((s) => s.id === stateId)

  return (
    <Card withBorder padding="lg">
      <Title order={4} mb={4}>
        Schule
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Bundesland und Schulform gelten für alle Programme. Dort werden sie nicht mehr abgefragt, sondern stehen nur noch als Zeile da – wer für eine andere
        Lerngruppe etwas erstellt, klappt sie mit „ändern" auf. Das Sprachniveau wird weiterhin im Programm gewählt.
      </Text>
      <Stack gap="md">
        <Switch
          label="Angaben zur Schule auf den Materialien abdrucken"
          description="Gilt für Arbeitsblätter, Vokabeltests und Klassenarbeiten. Am einzelnen Arbeitsblatt lässt sich das oben im Editor jederzeit umschalten."
          checked={settings.showSchool !== false}
          onChange={(e) => update({ showSchool: e.currentTarget.checked })}
        />
        {/* Mit Schulsuche im Verzeichnis der Länder (Paket 13) – auch im Einrichtungsassistenten */}
        <SchulnameFeld settings={settings} update={update} table={table} disabled={settings.showSchool === false} />
        <LogoField />
        {!imNetz() && <BriefkopfFelder settings={settings} update={update} />}
        <Group grow>
          <HaeufigSelect
            art="bundesland"
            label="Bundesland"
            data={(table?.states ?? []).map((s) => ({
              value: s.id,
              label: s.name
            }))}
            value={stateId}
            onChange={(v) => {
              if (!v) return
              const firstType = table?.states.find((s) => s.id === v)?.schoolTypes[0]?.id ?? ''
              update({ defaults: { stateId: v, schoolTypeId: firstType } })
            }}
            allowDeselect={false}
            maxDropdownHeight={400}
          />
          <HaeufigSelect
            art="schulform"
            label="Schulform"
            data={(state?.schoolTypes ?? []).map((s) => ({
              value: s.id,
              label: s.name
            }))}
            value={schoolTypeId}
            onChange={(v) => v && update({ defaults: { schoolTypeId: v } })}
            allowDeselect={false}
          />
        </Group>
        {/* Eigene Fächer (Paket 12) – hier, damit sie auch im Einrichtungsassistenten gefragt werden */}
        <EigeneFaecherFeld settings={settings} update={update} />
        {schoolTypeId !== 'grundschule' && (
          /*
           * G8 oder G9 an der eigenen Schule: In Ländern im Übergang und an Schulen mit eigener
           * Wahl ist das aus dem Land allein nicht abzulesen. Es entscheidet, ob Klasse 10 schon
           * Einführungsphase ist – dort werden die Lernenden auf dem Material gesiezt.
           */
          <Select
            label="Abitur an dieser Schule nach"
            description="Im G8 ist Klasse 10 die Einführungsphase der Oberstufe – dort werden die Lernenden auf dem Material gesiezt."
            data={[
              { value: 'land', label: `wie im Land üblich (${schoolTypeId === 'gymnasium' ? stateInfo(stateId).gymnasium : 'G9'})` },
              { value: 'G8', label: 'Klasse 12 (G8)' },
              { value: 'G9', label: 'Klasse 13 (G9)' }
            ]}
            value={settings.defaults.abiturNach ?? 'land'}
            onChange={(v) => v && update({ defaults: { abiturNach: v as 'land' | 'G8' | 'G9' } })}
            allowDeselect={false}
          />
        )}
      </Stack>
    </Card>
  )
}

/** Zugang zur Piktogramm-Werkstatt; zeigt zugleich, wie viele Symbole eigene sind. */
function PictogramField(): React.JSX.Element {
  const pictograms = useAppSettings((s) => s.pictograms)
  const [open, setOpen] = useState(false)
  const own = PICTOGRAMS.filter((p) => pictograms[p.id]).length

  return (
    <div>
      <Text size="sm" fw={500}>
        Piktogramme
      </Text>
      <Text size="xs" c="dimmed" mb={6}>
        Symbole für Arbeitsanweisungen und Sozialformen. Einzelne lassen sich von der Bild-KI neu gestalten; sie gelten dann in allen Programmen.
      </Text>
      <Group gap="xs" align="center">
        <Group gap={4}>
          {PICTOGRAMS.slice(0, 8).map((p) => (
            <PictogramIcon key={p.id} picto={p} size={18} />
          ))}
        </Group>
        <Button size="compact-sm" variant="light" onClick={() => setOpen(true)}>
          Gestalten
        </Button>
        {own > 0 && (
          <Text size="xs" c="dimmed">
            {own} selbst gestaltet
          </Text>
        )}
      </Group>
      <PictogramStudio opened={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function LogoField(): React.JSX.Element {
  const { logoDataUrl, setLogo } = useAppSettings()
  const [busy, setBusy] = useState(false)

  const onFiles = async (files: File[]): Promise<void> => {
    if (!files[0]) return
    setBusy(true)
    try {
      // Als PNG speichern: Transparenz bleibt erhalten, SVG wird gerastert
      const png = await normalizeImage(await readFileAsDataUrl(files[0]), 800, 'png')
      await setLogo(png)
      notifySuccess('Schullogo gespeichert.')
    } catch (e) {
      notifyError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Text size="sm" fw={500}>
        Schullogo
      </Text>
      <Text size="xs" c="dimmed" mb={6}>
        Das Logo kann in den Designvorlagen für Arbeitsblätter im Kopf- oder Fußbereich verwendet werden.
      </Text>
      <Group align="stretch" wrap="nowrap">
        {logoDataUrl && (
          <Stack gap={6} align="center" justify="center" className="picker-tile" p="sm" w={180}>
            <img src={logoDataUrl} alt="Schullogo" style={{ maxWidth: 150, maxHeight: 90, objectFit: 'contain' }} />
            <Button size="compact-xs" variant="subtle" color="red" onClick={() => setLogo(null)}>
              Entfernen
            </Button>
          </Stack>
        )}
        <Box style={{ flex: 1 }}>
          <DropZone
            onFiles={onFiles}
            accept={[...FILE_TYPES.image, 'image/svg+xml']}
            multiple={false}
            loading={busy}
            minHeight={90}
            title={logoDataUrl ? 'Anderes Logo hierher ziehen' : 'Logo hierher ziehen oder klicken'}
            hint="PNG (am besten mit transparentem Hintergrund), JPG oder SVG"
          />
        </Box>
      </Group>
    </div>
  )
}
