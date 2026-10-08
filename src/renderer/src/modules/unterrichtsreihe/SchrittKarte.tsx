/**
 * Kompakte Schrittkarte der Reihe (08.10.2026, Plan „Übersicht" B4/B6): Symbol der Art, Titel, Dauer, Rolle, Stand der
 * KI-Erstellung und Marke „KI-Entwurf" (PlatzhalterKnopf/SchrittStatus.tsx) in einer Zeile. Beschreibung, Begründung
 * und Lernziele stehen hinter „Warum?" (eine Ebene); Platzhalter zeigen darunter die Zeile „Grundlage:" (abwählbar).
 * „Verdoppeln", „In Stunde …", „In Teil …", „Test hier erstellen" und „Entfernen" liegen im Menü „⋯" – der Knopf
 * „Test hier erstellen" steht nicht mehr dauerhaft unter jedem Schritt.
 */
import { ActionIcon, Badge, Button, Collapse, Group, Menu, Paper, Stack, Text, Tooltip } from '@mantine/core'
import {
  IconArrowDown,
  IconArrowUp,
  IconCards,
  IconChecklist,
  IconClipboardCheck,
  IconClock,
  IconCopy,
  IconDots,
  IconFileText,
  IconGripVertical,
  IconLanguage,
  IconListCheck,
  IconMessage,
  IconMicrophone,
  IconMoodSmile,
  IconNotebook,
  IconPencil,
  IconTrash,
  IconTrophy,
  IconUsers
} from '@tabler/icons-react'
import { useState } from 'react'
import { SCHRITT_ARTEN, type Reihe, type Schritt, type SchrittArt } from '@shared/reihe'
import { DruckMenue, PlatzhalterKnopf } from './ReiheKi'
import { GrundlageZeile } from './GrundlageChips'
import { funktionVon } from './grundlage'
import { KI_ARTEN } from './reihePlanungKi'
import type { TestZiel } from './reiheTest'
import { SchrittMaterial } from './SchrittStatus'
import { TestHierPunkte } from './TestHierKnopf'
import { nichtAmGeraet } from './reihePlanung'

const ROLLE: Record<Schritt['rolle'], { label: string; farbe: string }> = {
  pflicht: { label: 'Pflicht', farbe: 'blue' },
  wahl: { label: 'Wahl', farbe: 'grape' },
  foerder: { label: 'Förderung', farbe: 'orange' },
  forder: { label: '★ Forder', farbe: 'yellow' },
  optional: { label: 'Optional', farbe: 'teal' }
}

const SYMBOL: Record<SchrittArt, typeof IconFileText> = {
  arbeitsblatt: IconFileText,
  vokabeln: IconLanguage,
  onlinetest: IconClipboardCheck,
  rueckmeldung: IconMessage,
  aufgabe: IconListCheck,
  lernkarten: IconCards,
  reflexion: IconMoodSmile,
  diagnose: IconChecklist,
  praesenz: IconUsers,
  hefter: IconNotebook,
  abschluss: IconTrophy,
  sprechen: IconMicrophone
}

export function SchrittKarte(p: {
  reihe: Reihe
  s: Schritt
  nummer: number
  /** Teile-Ansicht: Ziehgriff und Pfeile; Stunden-Ansicht: verschieben über das Menü */
  teileAnsicht: boolean
  teile: string[]
  setze: (patch: Partial<Schritt>) => void
  bearbeiten: () => void
  verdoppeln: () => void
  entfernen: () => void
  hoch?: () => void
  runter?: () => void
  /** In einen anderen Teil (undefined = ohne Teil) */
  inTeil: (teil: string | undefined) => void
  speichernVorher: () => Promise<Reihe | null>
  testHier: (ziel: TestZiel) => void
  /** „Fertig – ansehen" bei Schritten ohne Arbeitsblatt */
  ansehen: (s: Schritt) => void
  /** Ziehen und Ablegen (Teile-Ansicht) – Handler und Stil des Rahmens */
  rahmen?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean }
}): React.JSX.Element {
  const { reihe: r, s } = p
  const [warum, setWarum] = useState(false)
  const art = SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)
  const Symbol = SYMBOL[s.inhalt.art] ?? IconFileText
  const stunden = r.stunden ?? []
  const beschreibung = s.platzhalter?.beschreibung?.trim() ?? ''
  const funktion = funktionVon(s)
  const ziele = s.lernziele.map((l) => l.ichKann || l.text).filter(Boolean)
  // „Grundlage" am fertigen Schritt: nur bei Arten, die die KI erstellt
  const grundlageFertig = !s.platzhalter && (s.kiEntwurf || Boolean(s.begruendung)) && KI_ARTEN.includes(s.inhalt.art)
  const hatWarum = Boolean(beschreibung || funktion || ziele.length || grundlageFertig)
  return (
    <Paper withBorder p="sm" radius="md" data-schritt={s.id} data-schritt-art-karte={s.inhalt.art} {...p.rahmen}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          {p.teileAnsicht && <IconGripVertical size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />}
          <Badge variant="filled" color="gray" circle style={{ flexShrink: 0 }}>
            {p.nummer}
          </Badge>
          <Tooltip label={art?.label ?? s.inhalt.art}>
            <Symbol size={18} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} aria-label={art?.label} />
          </Tooltip>
          <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
            <Text fw={600} truncate maw={360}>
              {s.titel || '(ohne Titel)'}
            </Text>
            {s.minuten ? (
              <Badge size="xs" variant="outline" color="gray" leftSection={<IconClock size={10} />} style={{ textTransform: 'none' }}>
                {s.minuten} min
              </Badge>
            ) : null}
            {s.rolle === 'pflicht' || s.rolle === 'optional' ? (
              <Tooltip label={s.rolle === 'pflicht' ? 'Klick: optional machen' : 'Klick: Pflicht machen'}>
                <Badge
                  size="xs"
                  variant="light"
                  color={ROLLE[s.rolle].farbe}
                  style={{ cursor: 'pointer' }}
                  onClick={() => p.setze({ rolle: s.rolle === 'pflicht' ? 'optional' : 'pflicht' })}
                  data-rolle-umschalten={s.rolle}
                >
                  {ROLLE[s.rolle].label}
                </Badge>
              </Tooltip>
            ) : (
              <Badge size="xs" variant="light" color={ROLLE[s.rolle].farbe}>
                {ROLLE[s.rolle].label}
                {s.rolle === 'wahl' && s.wahlGruppe ? ` ${s.wahlGruppe} (${s.wahlMindestens ?? 1})` : ''}
              </Badge>
            )}
            {p.teileAnsicht && s.stunde !== undefined && stunden.length > 0 && (
              <Badge size="xs" variant="outline" color="gray">
                Std. {s.stunde + 1}
              </Badge>
            )}
            {s.platzhalter && (
              <Badge size="xs" variant="light" color="orange" data-platzhalter>
                Platzhalter
              </Badge>
            )}
            {/* Reihenarten (08.10.2026, Plan E): „Im Unterricht" geht in digitalen Reihen nicht am Gerät */}
            {nichtAmGeraet(r, s) && (
              <Tooltip label="Digitale Reihe: Lernende bearbeiten alles am Gerät – diesen Schritt bitte durch eine Aufgabe ersetzen oder entfernen." multiline w={280}>
                <Badge size="xs" variant="filled" color="orange" data-nicht-am-geraet>
                  nicht am Gerät
                </Badge>
              </Tooltip>
            )}
            {s.ersetzen && s.platzhalter && (
              <Tooltip label="Aus einer Unterrichtsphase der Planung – daraus muss noch eine Aufgabe am Gerät werden (bearbeiten oder „Mit KI erstellen“)." multiline w={280}>
                <Badge size="xs" variant="filled" color="red" data-bitte-ersetzen>
                  bitte ersetzen
                </Badge>
              </Tooltip>
            )}
            <PlatzhalterKnopf reihe={r} s={s} setze={p.setze} speichernVorher={p.speichernVorher} ansehen={p.ansehen} />
          </Group>
        </Group>
        <Group gap={2} wrap="nowrap">
          {hatWarum && (
            <Button
              size="compact-xs"
              variant={warum ? 'light' : 'subtle'}
              color="gray"
              onClick={() => setWarum((w) => !w)}
              aria-expanded={warum}
              data-schritt-warum
            >
              Warum?
            </Button>
          )}
          {p.teileAnsicht && (
            <>
              <ActionIcon variant="subtle" onClick={p.hoch} disabled={!p.hoch} aria-label="nach oben">
                <IconArrowUp size={16} />
              </ActionIcon>
              <ActionIcon variant="subtle" onClick={p.runter} disabled={!p.runter} aria-label="nach unten">
                <IconArrowDown size={16} />
              </ActionIcon>
            </>
          )}
          <SchrittMaterial s={s} setze={p.setze} kompakt />
          {!s.platzhalter && <DruckMenue schritt={s} />}
          <Tooltip label="Bearbeiten">
            <ActionIcon variant="subtle" onClick={p.bearbeiten} aria-label="bearbeiten" data-schritt-bearbeiten>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" withinPortal width={300}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label="Weitere Aktionen" data-schritt-mehr>
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconCopy size={14} />} onClick={p.verdoppeln} data-schritt-verdoppeln>
                Verdoppeln
              </Menu.Item>
              {stunden.length > 0 && (
                <Menu.Sub position="left-start">
                  <Menu.Sub.Target>
                    <Menu.Sub.Item leftSection={<IconClock size={14} />} data-schritt-stunde-menue>
                      In Stunde …
                    </Menu.Sub.Item>
                  </Menu.Sub.Target>
                  <Menu.Sub.Dropdown>
                    {stunden.map((a, i) => (
                      <Menu.Item key={i} disabled={s.stunde === i} onClick={() => p.setze({ stunde: i })} data-in-stunde={i}>
                        Stunde {i + 1} · {a === 'doppel' ? 'Doppelstunde' : 'Einzelstunde'}
                      </Menu.Item>
                    ))}
                    <Menu.Item disabled={s.stunde === undefined} onClick={() => p.setze({ stunde: undefined })} data-in-stunde="">
                      Ohne Stunde
                    </Menu.Item>
                  </Menu.Sub.Dropdown>
                </Menu.Sub>
              )}
              {p.teile.length > 0 && (
                <Menu.Sub position="left-start">
                  <Menu.Sub.Target>
                    <Menu.Sub.Item data-schritt-teil-menue>In Teil …</Menu.Sub.Item>
                  </Menu.Sub.Target>
                  <Menu.Sub.Dropdown>
                    {p.teile.map((t) => (
                      <Menu.Item key={t} disabled={s.abschnitt === t} onClick={() => p.inTeil(t)} data-in-teil={t}>
                        {t}
                      </Menu.Item>
                    ))}
                    <Menu.Item disabled={!s.abschnitt || !p.teile.includes(s.abschnitt)} onClick={() => p.inTeil(undefined)} data-in-teil="">
                      Ohne Teil
                    </Menu.Item>
                  </Menu.Sub.Dropdown>
                </Menu.Sub>
              )}
              {!s.test && (
                <>
                  <Menu.Divider />
                  <TestHierPunkte nach={s.id} waehle={p.testHier} />
                </>
              )}
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={p.entfernen} aria-label="entfernen" data-schritt-entfernen>
                Entfernen
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      {s.platzhalter && (
        <div style={{ marginTop: 6 }}>
          <GrundlageZeile reihe={r} schritt={s} setze={p.setze} />
        </div>
      )}
      <Collapse expanded={warum}>
        <Stack gap={4} mt="xs" pl={4} data-schritt-warum-text>
          {beschreibung && (
            <Text size="sm">
              <Text span fw={500}>
                Was entstehen soll:{' '}
              </Text>
              {beschreibung}
            </Text>
          )}
          {funktion && (
            <Text size="sm">
              <Text span fw={500}>
                Warum an dieser Stelle:{' '}
              </Text>
              {funktion}
            </Text>
          )}
          {ziele.length > 0 && (
            <Text size="sm" c="dimmed">
              {ziele.join(' · ')}
            </Text>
          )}
          {grundlageFertig && <GrundlageZeile reihe={r} schritt={s} />}
        </Stack>
      </Collapse>
    </Paper>
  )
}
