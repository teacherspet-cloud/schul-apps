import { Badge, Button, Group, Stack, Text, Textarea, Tooltip, UnstyledButton } from '@mantine/core'
import { IconCheck, IconPlus, IconSparkles } from '@tabler/icons-react'
import { useState } from 'react'
import { notifyError } from '../../../shared/util'
import { materialFuer } from '../auftrag'
import { lernzielAnfrage, lernzieleAus, lernzielEntfernen, lernzielGewaehlt, lernzielOperatoren, lernzielUebernehmen, lernzielZeilen, type LernzielVorschlag } from '../lernziele'
import type { TafelbildMeta } from '../model'

const AFB = ['', 'I', 'II', 'III']
const AFB_FARBE = ['', 'teal', 'blue', 'grape']

/**
 * Lernziele des Tafelbilds (Wunsch 30.09.2026): Feld wie im Arbeitsblatt, dazu „Lernziele vorschlagen
 * (KI)" – mehrere operatorisierte Vorschläge (Operatoren der Landesliste, gemischte AFB) zum
 * Anklicken. Ein Klick übernimmt den Vorschlag als Zeile ins Feld, ein zweiter nimmt ihn wieder heraus.
 */
export default function LernzielFeld({ meta, onChange, kiDa }: { meta: TafelbildMeta; onChange: (lernziel: string) => void; kiDa: boolean }): React.JSX.Element {
  const [vorschlaege, setVorschlaege] = useState<{ fuer: string; liste: LernzielVorschlag[] }>({ fuer: '', liste: [] })
  const [laeuft, setLaeuft] = useState(false)
  const material = materialFuer(meta).texte
  // Vorschläge gelten für die Lerngruppe und das Thema, zu denen sie entstanden
  const schluessel = `${meta.subjectId}|${meta.grade}|${meta.stateId}|${meta.schoolTypeId}|${meta.thema.trim()}`
  const liste = vorschlaege.fuer === schluessel ? vorschlaege.liste : []
  const grundlage = Boolean(meta.thema.trim() || material.length)
  const gewaehlt = lernzielZeilen(meta.lernziel)

  const vorschlagen = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const { operatoren } = lernzielOperatoren(meta)
      const d = await window.api.ai.structured<unknown>(lernzielAnfrage(meta, material, gewaehlt))
      const neu = lernzieleAus(d, operatoren)
      if (!neu.length) throw new Error('Die KI hat keine passenden Lernziele geliefert.')
      setVorschlaege({ fuer: schluessel, liste: neu })
    } catch (e) {
      notifyError(e, 'Lernziele konnten nicht vorgeschlagen werden')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Stack gap={6} data-tb-lernziele>
      <Textarea
        label="Lernziele (optional)"
        description="Ein Lernziel je Zeile – sie steuern Aufbau, Merksatz und Prüfung des Tafelbilds."
        placeholder="Die Schülerinnen und Schüler … (z. B. die Ursachen der Hyperinflation 1923 erläutern)"
        autosize
        minRows={2}
        value={meta.lernziel}
        onChange={(e) => onChange(e.currentTarget.value)}
        data-tb-lernziel
      />
      <Group gap="xs">
        <Tooltip label={!kiDa ? 'Ohne KI-Zugang nicht verfügbar' : grundlage ? 'Mehrere Vorschläge zu Fach, Jahrgang, Land, Schulform, Thema und Material' : 'Zuerst Thema oder Material angeben'}>
          <Button
            size="compact-sm"
            variant="light"
            leftSection={<IconSparkles size={14} />}
            loading={laeuft}
            disabled={!kiDa || !grundlage}
            onClick={() => void vorschlagen()}
            data-tb-lernziele-vorschlagen
          >
            Lernziele vorschlagen (KI)
          </Button>
        </Tooltip>
        {liste.length > 0 && (
          <Text size="xs" c="dimmed">
            Antippen übernimmt ein Ziel ins Feld.
          </Text>
        )}
      </Group>
      {liste.map((v) => {
        const an = lernzielGewaehlt(meta.lernziel, v)
        return (
          <UnstyledButton
            key={v.text}
            className="tb-lernziel-vorschlag"
            data-gewaehlt={an || undefined}
            aria-pressed={an}
            onClick={() => onChange(an ? lernzielEntfernen(meta.lernziel, v) : lernzielUebernehmen(meta.lernziel, v))}
            data-tb-lernziel-vorschlag
          >
            <Group gap={8} wrap="nowrap" align="flex-start">
              {an ? <IconCheck size={16} style={{ flex: 'none', marginTop: 2 }} /> : <IconPlus size={16} style={{ flex: 'none', marginTop: 2 }} />}
              <Text size="sm" style={{ flex: 1 }}>
                {v.text}
              </Text>
              <Badge size="xs" variant="light" color={AFB_FARBE[v.afb]} style={{ flex: 'none' }} title={v.operator ? `Operator: ${v.operator}` : undefined}>
                AFB {AFB[v.afb]}
              </Badge>
            </Group>
          </UnstyledButton>
        )
      })}
    </Stack>
  )
}
