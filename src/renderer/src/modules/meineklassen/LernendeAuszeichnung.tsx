/**
 * Medaillen und Titel einer lernenden Person in „Meine Klassen" (10.10.2026, Wunsch der Lehrkraft): Profilbild, Titel
 * in der Sprache der Lerngruppe und sieben kleine Medaillen (Bronze … Meister) – als Gesprächsanlass, nicht als
 * Rangliste: neutral dargestellt, nicht sortierbar. Seit den Jahresreihen (10.10.2026): die Medaillen des laufenden
 * Schuljahres („Kl. 7 (2026/27)"), der Titel ist der Haupttitel über alle Jahre.
 */
import { Group, Text, Tooltip } from '@mantine/core'
import { KATEGORIEN, stufenName } from '@shared/auszeichnungen'
import { bildAdresse } from '@shared/auszeichnungenBilder'

export interface AuszeichnungLehrkraft {
  titel: string | null
  titelStufe: number
  punkte: number
  avatar: string | null
  medaillen: { kategorie: string; stufe: number }[]
  /** Schuljahr der Medaillen („2026/27") und Beschriftung („Kl. 7 (2026/27)") */
  schuljahr?: string
  jahr?: string
}

/** Stufenfarben wie bei den Lernenden */
export const STUFEN_FARBE = ['#ced4da', '#b8733a', '#8f9aa6', '#d4a017', '#5fa8a8', '#4dabf7', '#7c5cd6']

export function LernendeAuszeichnung({ a }: { a: AuszeichnungLehrkraft | undefined }): React.JSX.Element {
  if (!a) return <>–</>
  const beschreibung = `${a.jahr ? `Medaillen ${a.jahr}: ` : ''}${a.medaillen.map((m) => `${KATEGORIEN.find((k) => k.id === m.kategorie)?.name ?? m.kategorie}: ${stufenName(m.stufe)}`).join(' · ')}`
  return (
    <Group gap={6} wrap="nowrap" data-lernende-auszeichnung={a.titel ?? ''} data-medaillen={a.medaillen.map((m) => m.stufe).join('')} data-medaillen-jahr={a.schuljahr ?? ''}>
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
  )
}
