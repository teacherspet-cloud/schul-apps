/**
 * Handlungsbedarf als Pop-up (10.10.2026, Entscheidung der Lehrkraft): Der eigene Kasten „Handlungsbedarf" in der
 * Klassenansicht entfällt. Die Kachel „Handlungsbedarf" im Kasten „Auf einen Blick" (FachKopf, nur mit Inhalt) und die
 * Zahl an der Fach-Leiste öffnen dieses Fenster (am Telefon bildschirmfüllend). Es zeigt klar, wo etwas zu tun ist –
 * nach Art gruppiert („Nicht geübt", „Wackelige Wörter", „Grammatik schwach", „Abgaben & Reihen", „Antworten prüfen",
 * „Test bald", „Entwürfe" …), je Gruppe kurz wer/was (Namen wie bisher) und ein Knopf mit dem passenden nächsten
 * Schritt. Die Knöpfe nutzen die vorhandenen Wege (Reiter + Sprung an die Stelle, Öffnen mit Rückweg, „Im Kurs
 * wiederholen"). „Ausblenden" bleibt je Eintrag möglich; „Ausgeblendet (n)" unten holt Ausgeblendetes wieder.
 */
import { problemWoerterText } from '@shared/problemWoerter'
import { ActionIcon, Badge, Button, Collapse, Group, Modal, Stack, Text, ThemeIcon, Tooltip, UnstyledButton } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBook2,
  IconCalendarEvent,
  IconChevronDown,
  IconChevronRight,
  IconClipboardCheck,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconRepeat,
  IconRoute,
  IconUserExclamation,
  IconUserPlus,
  IconZzz
} from '@tabler/icons-react'
import { useState } from 'react'
import { create } from 'zustand'
import { useAufZu } from '../../shared/sitzung'
import { notifyError } from '../../shared/util'
import { senden } from '../onlinetest/serverApi'
import { kursEintragOeffnen, type KursEintrag } from './kursBedarf'

export type Bedarf = {
  art: 'entscheiden' | 'foerdern' | 'inaktiv' | 'termin' | 'reihe' | 'blatt'
  text: string
  ziel?: { modul: string; id?: string }
  /** Kennung zum Ausblenden (09.10.2026) */
  schluessel: string
} & Partial<Pick<KursEintrag, 'kurs' | 'hinweis' | 'reiter' | 'ids' | 'lokal'>>

/** Offenes Fenster: Lerngruppe (Fach der Klasse), deren Handlungsbedarf gezeigt wird */
export const useBedarfFenster = create<{ gruppe: string | null; oeffne: (gruppe: string) => void; schliesse: () => void }>((set) => ({
  gruppe: null,
  oeffne: (gruppe) => set({ gruppe }),
  schliesse: () => set({ gruppe: null })
}))

/** Gruppen im Fenster, in dieser Reihenfolge */
export type BedarfGruppe = 'inaktiv' | 'wackelig' | 'grammatik' | 'abgaben' | 'pruefen' | 'test' | 'entwurf' | 'leer' | 'sonst'
const REIHENFOLGE: BedarfGruppe[] = ['inaktiv', 'wackelig', 'grammatik', 'abgaben', 'pruefen', 'test', 'entwurf', 'leer', 'sonst']

/** Zu welcher Gruppe ein Eintrag gehört (rein rechnend, auch für Tests) */
export function bedarfGruppeVon(b: Pick<Bedarf, 'art' | 'hinweis'>): BedarfGruppe {
  switch (b.hinweis) {
    case 'inaktiv':
      return 'inaktiv'
    case 'schwach':
      return 'wackelig'
    case 'foerdern':
      return 'grammatik'
    case 'termin':
    case 'geplant':
      return 'test'
    case 'entwurf':
      return 'entwurf'
    case 'leer':
      return 'leer'
  }
  if (b.art === 'reihe' || b.art === 'blatt') return 'abgaben'
  if (b.art === 'entscheiden') return 'pruefen'
  if (b.art === 'inaktiv') return 'inaktiv'
  if (b.art === 'foerdern') return 'wackelig'
  if (b.art === 'termin') return 'test'
  return 'sonst'
}

/** Einträge nach Gruppe, leere Gruppen weg; `mitWackelig` = Vorschlag „Wackelige Wörter" vorhanden (Gruppe auch ohne Eintrag) */
export function bedarfGruppiert<T extends Pick<Bedarf, 'art' | 'hinweis'>>(liste: T[], mitWackelig = false): { gruppe: BedarfGruppe; eintraege: T[] }[] {
  return REIHENFOLGE.map((gruppe) => ({ gruppe, eintraege: liste.filter((b) => bedarfGruppeVon(b) === gruppe) })).filter(
    (g) => g.eintraege.length > 0 || (g.gruppe === 'wackelig' && mitWackelig)
  )
}

const GRUPPE: Record<BedarfGruppe, { titel: string; farbe: string; symbol: React.ReactNode }> = {
  inaktiv: { titel: 'Nicht geübt', farbe: 'gray', symbol: <IconZzz size={16} /> },
  wackelig: { titel: 'Problemwörter & schwache Vokabeln', farbe: 'red', symbol: <IconBook2 size={16} /> },
  grammatik: { titel: 'Grammatik schwach', farbe: 'orange', symbol: <IconUserExclamation size={16} /> },
  abgaben: { titel: 'Abgaben & Reihen', farbe: 'cyan', symbol: <IconFileText size={16} /> },
  pruefen: { titel: 'Antworten prüfen', farbe: 'orange', symbol: <IconClipboardCheck size={16} /> },
  test: { titel: 'Test bald', farbe: 'blue', symbol: <IconCalendarEvent size={16} /> },
  entwurf: { titel: 'Entwürfe zum Prüfen', farbe: 'yellow', symbol: <IconClipboardCheck size={16} /> },
  leer: { titel: 'Kurs ohne Lernende', farbe: 'blue', symbol: <IconUserPlus size={16} /> },
  sonst: { titel: 'Weiteres', farbe: 'gray', symbol: <IconAlertTriangle size={16} /> }
}

/** Vorgeschlagener nächster Schritt je Eintrag (vorhandene Wege) */
function aktionVon(b: Bedarf): { text: string; symbol: React.ReactNode } {
  switch (bedarfGruppeVon(b)) {
    case 'inaktiv':
      return { text: 'Im Kurs ansehen', symbol: <IconArrowRight size={14} /> }
    case 'wackelig':
      return { text: 'Zu den Lernenden', symbol: <IconArrowRight size={14} /> }
    case 'grammatik':
      return { text: 'Förderaufgaben erstellen', symbol: <IconUserExclamation size={14} /> }
    case 'abgaben':
      return b.art === 'reihe' ? { text: 'Zur Reihe', symbol: <IconRoute size={14} /> } : { text: 'Zum Blatt', symbol: <IconFileText size={14} /> }
    case 'pruefen':
      return { text: 'Zum Test', symbol: <IconClipboardCheck size={14} /> }
    case 'test':
      return { text: 'Test vorbereiten', symbol: <IconCalendarEvent size={14} /> }
    case 'entwurf':
      return { text: 'Prüfen und freigeben', symbol: <IconClipboardCheck size={14} /> }
    case 'leer':
      return { text: 'Lernende eintragen', symbol: <IconUserPlus size={14} /> }
    default:
      return { text: 'Öffnen', symbol: <IconArrowRight size={14} /> }
  }
}

/**
 * Ein Eintrag: links „Ausblenden" (Auge), dann wer/was, rechts der nächste Schritt. Ausgeblendet bleibt er, solange die
 * Lage gleich bleibt; ändert sie sich, kommt er wieder (server/klassen.ts).
 */
function BedarfZeile({
  b,
  gruppeId,
  los,
  geaendert,
  ausgeblendet = false
}: {
  b: Bedarf
  gruppeId: string
  los: (b: Bedarf) => void
  geaendert: () => void
  ausgeblendet?: boolean
}): React.JSX.Element {
  const [laeuft, setLaeuft] = useState(false)
  const umschalten = async (): Promise<void> => {
    setLaeuft(true)
    try {
      await senden(`/server/klassen/${gruppeId}/${ausgeblendet ? 'bedarf-einblenden' : 'bedarf-ausblenden'}`, { schluessel: b.schluessel })
      geaendert()
    } catch (e) {
      notifyError(e)
    } finally {
      setLaeuft(false)
    }
  }
  const aktion = aktionVon(b)
  return (
    <Group gap={6} wrap="nowrap" align="flex-start" data-bedarf-zeile={b.schluessel} style={{ opacity: ausgeblendet ? 0.7 : 1 }}>
      {/* Entwürfe liegen nur in diesem Gerät (kursBedarf.ts) – nicht ausblendbar */}
      {b.lokal ? (
        <div style={{ width: 22, flexShrink: 0 }} />
      ) : (
        <Tooltip label={ausgeblendet ? 'Wieder einblenden' : 'Ausblenden – kommt wieder, sobald sich etwas ändert'} withinPortal>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            mt={2}
            loading={laeuft}
            onClick={() => void umschalten()}
            aria-label={ausgeblendet ? 'Wieder einblenden' : 'Ausblenden'}
            data-bedarf-ausblenden={ausgeblendet ? undefined : true}
            data-bedarf-einblenden={ausgeblendet ? true : undefined}
          >
            {ausgeblendet ? <IconEye size={16} /> : <IconEyeOff size={16} />}
          </ActionIcon>
        </Tooltip>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <UnstyledButton onClick={() => los(b)} className="klassen-bedarf" data-bedarf={b.art} data-ziel-reiter={b.reiter} w="100%">
          <Text size="sm">{b.text}</Text>
        </UnstyledButton>
      </div>
      <Button
        size="compact-xs"
        variant="light"
        rightSection={aktion.symbol}
        onClick={() => los(b)}
        style={{ flexShrink: 0 }}
        data-bedarf-aktion={bedarfGruppeVon(b)}
      >
        {aktion.text}
      </Button>
    </Group>
  )
}

export function HandlungsbedarfFenster({
  gruppeId,
  titel,
  bedarf,
  ausgeblendet,
  wackelig,
  oeffnen,
  setzeReiter,
  geaendert,
  wackeligAnsehen,
  wackeligWiederholen,
  wiederholtLaeuft = false
}: {
  gruppeId: string
  /** „Englisch · 5b" */
  titel: string
  bedarf: Bedarf[]
  ausgeblendet: Bedarf[]
  /** Vorschlag „Problemwörter" (10.10.2026): `woerter` im Vorschlag (höchstens 20) von `gesamt` (alle, shared/problemWoerter.ts) */
  wackelig: { woerter: number; gesamt: number } | null
  oeffnen: (modul: string, id?: string) => void
  setzeReiter: (reiter: string) => void
  geaendert: () => void
  wackeligAnsehen: () => void
  wackeligWiederholen: () => void
  wiederholtLaeuft?: boolean
}): React.JSX.Element {
  const schliesse = useBedarfFenster((s) => s.schliesse)
  const telefon = useMediaQuery('(max-width: 700px)') ?? false
  const [zeigeAus, setZeigeAus] = useAufZu('bedarf-ausgeblendet', false)
  const gruppen = bedarfGruppiert(bedarf, Boolean(wackelig))
  // Klick: Fenster zu, dann in „Meine Klassen" an die Stelle (Kurs-Einträge) bzw. das Ziel mit Rückweg öffnen
  const los = (b: Bedarf): void => {
    schliesse()
    if (kursEintragOeffnen(b, setzeReiter)) return
    if (b.ziel) oeffnen(b.ziel.modul, b.ziel.id)
  }
  return (
    <Modal
      opened
      onClose={schliesse}
      size="lg"
      fullScreen={telefon}
      title={
        <Group gap={6}>
          <IconAlertTriangle size={18} color="var(--mantine-color-orange-6)" />
          <Text fw={700}>Handlungsbedarf · {titel}</Text>
        </Group>
      }
    >
      <Stack gap="md" data-handlungsbedarf data-gruppe={gruppeId}>
        {gruppen.length === 0 && (
          <Text size="sm" c="dimmed" data-bedarf-leer>
            {ausgeblendet.length ? 'Nichts weiter – der übrige Handlungsbedarf ist ausgeblendet.' : 'Gerade ist nichts zu tun.'}
          </Text>
        )}
        {gruppen.map(({ gruppe, eintraege }) => {
          const g = GRUPPE[gruppe]
          return (
            <div
              key={gruppe}
              data-bedarf-gruppe={gruppe}
              style={{ borderLeft: `3px solid var(--mantine-color-${g.farbe}-5)`, paddingLeft: 10 }}
            >
              <Group gap={8} mb={6} wrap="nowrap">
                <ThemeIcon size="sm" variant="light" color={g.farbe}>
                  {g.symbol}
                </ThemeIcon>
                <Text fw={700} size="sm">
                  {g.titel}
                </Text>
                {eintraege.length > 0 && (
                  <Badge size="xs" variant="light" color={g.farbe}>
                    {eintraege.length}
                  </Badge>
                )}
              </Group>
              <Stack gap={6}>
                {eintraege.map((b) => (
                  <BedarfZeile key={b.schluessel} b={b} gruppeId={gruppeId} los={los} geaendert={geaendert} />
                ))}
                {/* Problemwörter (Vorschlag der Klasse): im Kurs gleich wiederholen lassen – ohne neuen Kurs; dieselbe Zahl wie oben */}
                {gruppe === 'wackelig' && wackelig && (
                  <Group gap={6} wrap="wrap" pl={28} data-bedarf-wackelig={wackelig.woerter}>
                    <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 160 }}>
                      {problemWoerterText(wackelig.gesamt, wackelig.woerter)} – wackeln gerade bei mehreren Kindern.
                    </Text>
                    <Button size="compact-xs" variant="default" onClick={() => (schliesse(), wackeligAnsehen())} data-bedarf-wackelig-ansehen>
                      Wörter ansehen
                    </Button>
                    <Button
                      size="compact-xs"
                      leftSection={<IconRepeat size={14} />}
                      loading={wiederholtLaeuft}
                      onClick={wackeligWiederholen}
                      data-bedarf-wackelig-wiederholen
                    >
                      Im Kurs wiederholen lassen
                    </Button>
                  </Group>
                )}
              </Stack>
            </div>
          )
        })}
        {ausgeblendet.length > 0 && (
          <div data-bedarf-ausgeblendet={ausgeblendet.length}>
            <UnstyledButton onClick={() => setZeigeAus((o) => !o)} aria-expanded={zeigeAus} data-bedarf-ausgeblendet-knopf>
              <Group gap={4}>
                {zeigeAus ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                <Text size="xs" c="dimmed">
                  Ausgeblendet ({ausgeblendet.length})
                </Text>
              </Group>
            </UnstyledButton>
            <Collapse expanded={zeigeAus}>
              <Stack gap={6} mt={6}>
                {ausgeblendet.map((b) => (
                  <BedarfZeile key={b.schluessel} b={b} gruppeId={gruppeId} los={los} geaendert={geaendert} ausgeblendet />
                ))}
              </Stack>
            </Collapse>
          </div>
        )}
      </Stack>
    </Modal>
  )
}
