import { Alert, Badge, Button, Card, CloseButton, Container, Group, SimpleGrid, Stack, Text, TextInput, ThemeIcon, Title, UnstyledButton } from '@mantine/core'
import { IconAlertTriangle, IconDeviceFloppy, IconFolder, IconSearch } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { modules } from '../modules/registry'
import { useAppSettings } from '../shared/settingsStore'
import { openDocument, openModule, openSettings, openThemen } from '../shared/navigation'
import { imNetz } from '../shared/netzZugang'
import { fachAnzeige, ladeMaterialien, Material, neueste, suche } from './materialien'
import { FachPunkt, useFachFarbe } from '../shared/components/FachFarbe'
import { abgleichen, ladeThemen, useThemen } from '../shared/themenbereiche'
import { AB_MATERIALIEN } from '../shared/themenVorschlag'
import { nachfahrenVon, pfadVon, type Themenbereich } from '@shared/themen'
import { useSichtbareProgramme } from './programme'
import SchulpaketKnoepfe from './Schulpaket'

/** So viele Einträge zeigt „Zuletzt bearbeitet" */
const ZULETZT_ANZAHL = 8
/** Ab so vielen Tagen ohne Sicherung erinnert die Startseite daran */
const SICHERUNG_NACH_TAGEN = 30

const TAG = 24 * 60 * 60 * 1000
const uhrzeit = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' })
const datum = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })

/** „heute, 14:05", „gestern, 09:12" oder das Datum */
function wann(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const heute = new Date()
  heute.setHours(0, 0, 0, 0)
  const tag = new Date(d)
  tag.setHours(0, 0, 0, 0)
  const diff = Math.round((heute.getTime() - tag.getTime()) / TAG)
  if (diff === 0) return `heute, ${uhrzeit.format(d)}`
  if (diff === 1) return `gestern, ${uhrzeit.format(d)}`
  return datum.format(d)
}

/**
 * Die Startseite.
 *
 * Neu gefasst nach der Rückmeldung der Lehrkraft (25.09.2026): Sie war eine reine
 * Kachelwand. Wer an gestern anknüpfen wollte, musste das Programm wissen, darin die
 * Bibliothek öffnen und dort suchen. Jetzt stehen oben die zuletzt bearbeiteten Materialien
 * aller Programme (ein Klick öffnet sie direkt), eine Suche über alles und – nur wenn es
 * etwas zu tun gibt – Hinweise auf den fehlenden KI-Zugang oder eine lange zurückliegende
 * Sicherung.
 *
 * Die Seite wird bei jedem Zurückkommen neu aufgebaut (App.tsx zeigt sie nur, solange sie
 * vorn liegt) – damit ist die Liste immer auf dem Stand der Bibliotheken.
 */
export default function Home(): React.JSX.Element {
  const schoolName = useAppSettings((s) => s.settings.schoolName)
  const letzteSicherung = useAppSettings((s) => s.settings.letzteSicherung)
  const [materialien, setMaterialien] = useState<Material[] | null>(null)
  const [ohneKi, setOhneKi] = useState(false)
  const [suchtext, setSuchtext] = useState('')
  // Kacheln nur für die Programme zu den eigenen Fächern (Paket 12); „Zuletzt bearbeitet" und die Suche zeigen weiter alles
  const programme = useSichtbareProgramme()

  useEffect(() => {
    let weg = false
    void ladeMaterialien().then((m) => {
      if (weg) return
      setMaterialien(m)
      // Neue Materialien in die Themenbereiche einsortieren (Paket 10b) – auch wer nur die Startseite sieht, findet sie dort
      void abgleichen(m.filter((x) => x.moduleId !== 'vokabelliste'))
    })
    void ladeThemen().catch(() => undefined)
    // Am Tablet richtet niemand den KI-Zugang ein – dort wäre der Hinweis nur Lärm
    if (!imNetz())
      window.api.ai
        .status()
        .then((s) => !weg && setOhneKi(!s.hasTextKey))
        .catch(() => undefined)
    return () => {
      weg = true
    }
  }, [])

  const zuletzt = useMemo(() => neueste(materialien ?? [], ZULETZT_ANZAHL), [materialien])
  const treffer = useMemo(() => suche(materialien ?? [], suchtext), [materialien, suchtext])
  const suchtAktiv = suchtext.trim().length > 0
  const themen = useThemen((s) => s.daten)
  // Themenbereiche passend zur Suche (Name oder Fach) – vor den Materialien
  const bereichTreffer = useMemo(() => {
    const woerter = suchtext.toLocaleLowerCase('de').split(/\s+/).filter(Boolean)
    if (!woerter.length) return []
    return themen.bereiche.filter((b) => woerter.every((w) => `${b.name} ${fachAnzeige(b.fachId)}`.toLocaleLowerCase('de').includes(w))).slice(0, 6)
  }, [suchtext, themen])
  // Mit Unterbereichen gezählt (Paket 12) – die Zahl am Ordner zeigt, was darin steckt
  const bereichZahl = (b: Themenbereich): number => {
    const ids = new Set([b.id, ...nachfahrenVon(themen, b.id)])
    return (materialien ?? []).filter((m) => ids.has(themen.zuordnungen[`${m.moduleId}:${m.id}`]?.bereichId ?? '')).length
  }
  /*
   * Abschnitt „Themenbereiche": je Fach ein Knopf. Nur, wenn es Bereiche gibt oder so viel
   * Material, dass die Vorschläge greifen – vorher wäre er nur Lärm.
   */
  const themenFaecher = useMemo(() => {
    const map = new Map<string, number>()
    // Nur die obersten Bereiche – die Unterrichtseinheiten; Unterbereiche zählen nicht extra
    for (const b of themen.bereiche) if (!b.elternId) map.set(b.fachId, (map.get(b.fachId) ?? 0) + 1)
    return [...map.entries()].sort((a, b) => fachAnzeige(a[0]).localeCompare(fachAnzeige(b[0]), 'de'))
  }, [themen])
  const themenZeigen = themenFaecher.length > 0 || (materialien ?? []).filter((m) => m.moduleId !== 'vokabelliste').length >= AB_MATERIALIEN

  /*
   * Erinnerung ans Sichern: nur, wenn es überhaupt Material gibt, und erst nach einem Monat.
   * Ein Hinweis, der immer dasteht, wird nicht mehr gelesen.
   */
  const tageSeitSicherung = letzteSicherung ? Math.floor((Date.now() - Date.parse(letzteSicherung)) / TAG) : null
  const sicherungFaellig =
    !imNetz() && (materialien?.length ?? 0) > 0 && (tageSeitSicherung === null || Number.isNaN(tageSeitSicherung) || tageSeitSicherung > SICHERUNG_NACH_TAGEN)

  return (
    <Container size="lg" py={48} style={{ height: '100%', overflow: 'auto' }}>
      <Stack gap={4} className="home-hero">
        <Title order={1}>Schul-Apps</Title>
        <Text opacity={0.92}>{schoolName ? `${schoolName} · ` : ''}Material für den Unterricht und Organisatorisches schnell erstellen.</Text>
      </Stack>

      {(ohneKi || sicherungFaellig) && (
        <Stack gap="sm" mb="xl">
          {ohneKi && (
            <Alert color="orange" icon={<IconAlertTriangle />} title="Kein KI-Zugang eingerichtet" className="home-hinweis">
              <Group justify="space-between" gap="sm">
                <Text size="sm">
                  Ohne Zugang entsteht kein neues Material. Nach dem Einlesen einer Sicherung auf einem anderen Rechner fehlt er ebenfalls – Schlüssel und
                  Abo-Anmeldung stehen aus Sicherheitsgründen nicht in der Sicherung.
                </Text>
                <Button size="xs" variant="white" color="orange" onClick={() => openSettings('ki')}>
                  KI-Zugang einrichten
                </Button>
              </Group>
            </Alert>
          )}
          {sicherungFaellig && (
            <Alert
              color="blue"
              icon={<IconDeviceFloppy />}
              title={tageSeitSicherung === null ? 'Noch keine Sicherung' : 'Sicherung empfohlen'}
              className="home-hinweis"
            >
              <Group justify="space-between" gap="sm">
                <Text size="sm">
                  {tageSeitSicherung === null || Number.isNaN(tageSeitSicherung)
                    ? 'Von den erstellten Materialien gibt es noch keine Sicherung.'
                    : `Die letzte Sicherung liegt ${tageSeitSicherung} Tage zurück.`}{' '}
                  Eine Sicherungsdatei, etwa auf einem USB-Stick, bewahrt alles vor einem Rechnerausfall.
                </Text>
                <Button size="xs" variant="white" onClick={() => openSettings('wartung')}>
                  Zur Sicherung
                </Button>
              </Group>
            </Alert>
          )}
        </Stack>
      )}

      {!imNetz() && (
        <Group justify="flex-end" mb="xs">
          <SchulpaketKnoepfe eingelesen={() => void ladeMaterialien().then(setMaterialien)} />
        </Group>
      )}

      {(materialien?.length ?? 0) > 0 && (
        <Stack gap="sm" mb={40}>
          <Group justify="space-between" align="end" wrap="wrap" gap="sm">
            <Title order={3}>{suchtAktiv ? 'Suchergebnis' : 'Zuletzt bearbeitet'}</Title>
            <TextInput
              aria-label="Materialien durchsuchen"
              placeholder="Alle Materialien durchsuchen (Name, Thema, Fach)"
              leftSection={<IconSearch size={16} />}
              rightSection={suchtAktiv ? <CloseButton size="sm" aria-label="Suche leeren" onClick={() => setSuchtext('')} /> : null}
              value={suchtext}
              onChange={(e) => setSuchtext(e.currentTarget.value)}
              onKeyDown={(e) => {
                // Enter öffnet den ersten Treffer, Escape leert die Suche
                if (e.key === 'Enter' && treffer[0]) void openDocument(treffer[0].moduleId, treffer[0].id)
                if (e.key === 'Escape') setSuchtext('')
              }}
              w={380}
              maw="100%"
            />
          </Group>
          {suchtAktiv && bereichTreffer.length > 0 && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {bereichTreffer.map((b) => (
                <BereichZeile
                  key={b.id}
                  bereich={b}
                  anzahl={bereichZahl(b)}
                  oben={pfadVon(themen, b.id)
                    .slice(0, -1)
                    .map((x) => x.name)}
                />
              ))}
            </SimpleGrid>
          )}
          {suchtAktiv && treffer.length === 0 ? (
            bereichTreffer.length === 0 && (
              <Text c="dimmed" size="sm">
                Keine Materialien gefunden.
              </Text>
            )
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {(suchtAktiv ? treffer.slice(0, 40) : zuletzt).map((m) => (
                <MaterialZeile key={`${m.moduleId}-${m.id}`} material={m} />
              ))}
            </SimpleGrid>
          )}
          {suchtAktiv && treffer.length > 40 && (
            <Text c="dimmed" size="xs">
              {treffer.length - 40} weitere Treffer – Suche genauer fassen.
            </Text>
          )}
        </Stack>
      )}

      {themenZeigen && !suchtAktiv && (
        <Stack gap="sm" mb={40} data-home-themen>
          <Group justify="space-between" align="end">
            <Title order={3}>Themenbereiche</Title>
            <Button size="compact-sm" variant="subtle" onClick={() => openThemen()}>
              Alle Themenbereiche
            </Button>
          </Group>
          {themenFaecher.length ? (
            <Group gap="xs">
              {themenFaecher.map(([fachId, n]) => (
                <Button key={fachId} variant="default" leftSection={<FachPunkt fach={fachId} />} onClick={() => openThemen(fachId)}>
                  {fachAnzeige(fachId)} · {n === 1 ? '1 Bereich' : `${n} Bereiche`}
                </Button>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Materialien aller Programme lassen sich je Fach in Themenbereiche ordnen – etwa „Ökologie“ mit Arbeitsblättern, Kontrollen und Tests. Die
              Bibliotheken schlagen passende Bereiche vor.
            </Text>
          )}
        </Stack>
      )}

      <Title order={3} mb="sm">
        Programme
      </Title>
      <SimpleGrid cols={{ base: 2, md: 3 }} spacing="lg">
        {programme.map((m) => (
          // Als Knopf: mit Tab erreichbar, mit Enter oder Leertaste zu öffnen
          <Card key={m.id} component="button" type="button" withBorder padding="xl" className="home-tile" onClick={() => openModule(m.id)}>
            {/* Illustration, sobald eine vorliegt (registry.ts); sonst das Vektorsymbol in gleicher Größe */}
            {m.illustration ? (
              <img src={m.illustration} className="home-illustration" width={96} height={96} alt="" draggable={false} />
            ) : (
              <ThemeIcon size={96} radius="lg" variant="light" color={m.color} className="home-illustration">
                <m.icon size={56} />
              </ThemeIcon>
            )}
            <Text fw={700} size="lg">
              {m.name}
            </Text>
            <Text size="sm" c="dimmed" mt={4}>
              {m.description}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Container>
  )
}

/** Ein Eintrag in „Zuletzt bearbeitet" bzw. im Suchergebnis; ein Klick öffnet das Dokument. */
function MaterialZeile({ material: m }: { material: Material }): React.JSX.Element {
  const modul = modules.find((x) => x.id === m.moduleId)
  return (
    <UnstyledButton className="home-material" onClick={() => void openDocument(m.moduleId, m.id)}>
      <Group gap="sm" wrap="nowrap">
        {/* Das Programmbild wie in der Leiste (Paket 10a); ohne Bild das Vektorsymbol */}
        {modul?.leistenbild ? (
          <img src={modul.leistenbild} className="home-material-bild" width={36} height={36} alt="" title={modul.name} draggable={false} />
        ) : (
          modul && (
            <ThemeIcon size={36} variant="light" color={modul.color} title={modul.name}>
              <modul.icon size={20} />
            </ThemeIcon>
          )
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <Group gap={6} wrap="nowrap">
            {/* Farbpunkt des Fachs (Paket 10a) */}
            <FachPunkt fach={m.fach} />
            <Text fw={600} size="sm" truncate>
              {m.name}
            </Text>
            {m.entwurf && (
              <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                Entwurf
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {zeileMitModul(modul?.name, m.detail, wann(m.updatedAt))}
          </Text>
        </div>
      </Group>
    </UnstyledButton>
  )
}

const zeileMitModul = (...teile: (string | undefined)[]): string => teile.filter(Boolean).join(' · ')

/** Suchtreffer „Themenbereich": öffnet die übergreifende Seite in diesem Bereich */
function BereichZeile({ bereich: b, anzahl, oben = [] }: { bereich: Themenbereich; anzahl: number; oben?: string[] }): React.JSX.Element {
  const farbe = useFachFarbe(b.fachId) ?? undefined
  return (
    <UnstyledButton className="home-material" onClick={() => openThemen(b.fachId, b.id)} data-home-bereich={b.name}>
      <Group gap="sm" wrap="nowrap">
        <IconFolder size={32} color={farbe} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm" truncate>
            {b.name}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {/* Unterbereiche (Paket 12): der Weg dorthin, damit „Ursachen" nicht ohne Einheit dasteht */}
            {zeileMitModul(
              oben.length ? 'Unterbereich' : 'Themenbereich',
              [fachAnzeige(b.fachId), ...oben].join(' › '),
              anzahl === 1 ? '1 Material' : `${anzahl} Materialien`
            )}
          </Text>
        </div>
      </Group>
    </UnstyledButton>
  )
}
