/**
 * Medaillen und Titel einer lernenden Person in „Meine Klassen" (10.10.2026, Wunsch der Lehrkraft): Profilbild, Titel
 * in der Sprache der Lerngruppe und sieben kleine Medaillen (Bronze … Meister) – als Gesprächsanlass, nicht als
 * Rangliste: neutral dargestellt, nicht sortierbar. Seit den Jahresreihen (10.10.2026): die Medaillen des laufenden
 * Schuljahres („Kl. 7 (2026/27)"), der Titel ist der Haupttitel über alle Jahre.
 */
import { Group, Modal, Progress, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { useState } from 'react'
import { KATEGORIEN, STUFEN_NAMEN, stufenName } from '@shared/auszeichnungen'
import { bildAdresse } from '@shared/auszeichnungenBilder'

export interface AuszeichnungLehrkraft {
  titel: string | null
  titelStufe: number
  punkte: number
  avatar: string | null
  medaillen: { kategorie: string; stufe: number; wert?: number; schwellen?: number[]; am?: number }[]
  /** Schuljahr der Medaillen („2026/27") und Beschriftung („Kl. 7 (2026/27)") */
  schuljahr?: string
  jahr?: string
}

/** Stufenfarben wie bei den Lernenden */
export const STUFEN_FARBE = ['#ced4da', '#b8733a', '#8f9aa6', '#d4a017', '#5fa8a8', '#4dabf7', '#7c5cd6']

/**
 * Medaillen-Fenster (12.10.2026, Wunsch der Lehrkraft: „Mach die Medaillen einsehbar von Meine Klassen aus, wenn man
 * darauf klickt"): je Kategorie Stufe, erreicht am, Stand dieses Schuljahres und wie weit es bis zur nächsten Stufe ist.
 */
function MedaillenFenster({ a, name, schliessen }: { a: AuszeichnungLehrkraft; name?: string; schliessen: () => void }): React.JSX.Element {
  return (
    <Modal
      opened
      onClose={schliessen}
      title={<Text fw={700}>{`Medaillen${name ? ` – ${name}` : ''}${a.jahr ? ` · ${a.jahr}` : ''}`}</Text>}
      size="lg"
      data-medaillen-fenster
    >
      <Stack gap="md">
        {(a.titel || a.avatar) && (
          <Group gap="sm">
            {a.avatar && <img src={bildAdresse(a.avatar)} alt="" width={36} height={42} style={{ objectFit: 'contain' }} />}
            {a.titel && <Text fw={600}>Titel: {a.titel}</Text>}
          </Group>
        )}
        {a.medaillen.map((m) => {
          const k = KATEGORIEN.find((x) => x.id === m.kategorie)
          const naechste = m.schwellen && m.stufe < 6 ? m.schwellen[m.stufe] : undefined
          const vorige = m.schwellen && m.stufe > 0 ? m.schwellen[m.stufe - 1] : 0
          const anteil =
            naechste !== undefined && m.wert !== undefined
              ? Math.max(0, Math.min(100, ((m.wert - vorige) / Math.max(1, naechste - vorige)) * 100))
              : m.stufe === 6
              ? 100
              : 0
          return (
            <Group key={m.kategorie} gap="sm" wrap="nowrap" align="flex-start" data-medaille-zeile={m.kategorie}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 22,
                  flexShrink: 0,
                  marginTop: 2,
                  background: STUFEN_FARBE[m.stufe] ?? STUFEN_FARBE[0],
                  outline: m.stufe === 6 ? '2px solid #ffd43b' : undefined,
                  opacity: m.stufe ? 1 : 0.45
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Text size="sm" fw={600}>
                    {k?.name ?? m.kategorie}
                  </Text>
                  <Text size="sm" c={m.stufe ? undefined : 'dimmed'}>
                    {stufenName(m.stufe)}
                    {m.am ? ` · seit ${new Date(m.am).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}` : ''}
                  </Text>
                </Group>
                {m.wert !== undefined && (
                  <>
                    <Progress value={anteil} size="sm" mt={4} color={m.stufe ? 'teal' : 'gray'} aria-label={`${k?.name ?? m.kategorie}: Fortschritt`} />
                    <Text size="xs" c="dimmed" mt={2}>
                      {naechste !== undefined ? `${m.wert} von ${naechste} Punkten bis ${STUFEN_NAMEN[m.stufe]}` : `${m.wert} Punkte – höchste Stufe erreicht`}
                    </Text>
                  </>
                )}
                {k?.text && (
                  <Text size="xs" c="dimmed" mt={2}>
                    Zählt: {k.text}
                  </Text>
                )}
              </div>
            </Group>
          )
        })}
        <Text size="xs" c="dimmed">
          Medaillen sind ein Gesprächsanlass, keine Rangfolge – sie zeigen, was die Person in diesem Schuljahr geübt hat.
        </Text>
      </Stack>
    </Modal>
  )
}

export function LernendeAuszeichnung({ a, name }: { a: AuszeichnungLehrkraft | undefined; name?: string }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  if (!a) return <>–</>
  const beschreibung = `${a.jahr ? `Medaillen ${a.jahr}: ` : ''}${a.medaillen
    .map((m) => `${KATEGORIEN.find((k) => k.id === m.kategorie)?.name ?? m.kategorie}: ${stufenName(m.stufe)}`)
    .join(' · ')}`
  return (
    <>
      {offen && <MedaillenFenster a={a} name={name} schliessen={() => setOffen(false)} />}
      <UnstyledButton
        onClick={(e) => {
          e.stopPropagation()
          setOffen(true)
        }}
        aria-label="Medaillen ansehen"
        data-medaillen-oeffnen
      >
        <Group
          gap={6}
          wrap="nowrap"
          data-lernende-auszeichnung={a.titel ?? ''}
          data-medaillen={a.medaillen.map((m) => m.stufe).join('')}
          data-medaillen-jahr={a.schuljahr ?? ''}
        >
          {a.avatar && <img src={bildAdresse(a.avatar)} alt="" width={22} height={26} style={{ objectFit: 'contain' }} data-lernende-avatar={a.avatar} />}
          {a.titel && (
            <Text size="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>
              {a.titel}
            </Text>
          )}
          <Tooltip label={beschreibung} multiline w={260}>
            <Group gap={3} wrap="nowrap" aria-label={`Medaillen – ${beschreibung}`} role="img">
              {a.medaillen.map((m) => (
                <span
                  key={m.kategorie}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 10,
                    background: STUFEN_FARBE[m.stufe] ?? STUFEN_FARBE[0],
                    outline: m.stufe === 6 ? '2px solid #ffd43b' : undefined,
                    opacity: m.stufe ? 1 : 0.5
                  }}
                />
              ))}
            </Group>
          </Tooltip>
        </Group>
      </UnstyledButton>
    </>
  )
}
