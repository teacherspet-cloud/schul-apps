import { Alert, Badge, Button, Group, Stack, Text, Tooltip } from '@mantine/core'
import { IconInfoCircle, IconPlus, IconSparkles } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { notifyError } from '../../../shared/util'
import {
  alsZeile,
  ART_LABEL,
  ARTEN_VORWISSEN,
  steht,
  stoffVorschlaege,
  vorwissenVorschlaege,
  zeileEinfuegen,
  type VorwissenAnfrage,
  type VorwissenArt,
  type VorwissenVorschlag
} from '../didactics/vorwissen/vorwissen'
import { kiStoff, kiVorwissen, type KiAufruf } from '../didactics/vorwissen/ki'

/**
 * Anklickbare Vorschläge unter einem Vorwissens- oder Stoff-Feld.
 *
 * Entscheidungen der Lehrkraft (25.09.2026): Chips statt Automatik – ein Klick übernimmt den
 * Vorschlag als Zeile ins Feld, wo er bearbeitbar bleibt. Je Gruppe wenige sichtbar, der Rest
 * unter „Mehr“. Jeder Chip zeigt seine Herkunft: grün = belegt (Lehrplan, Lehrwerk, Forschung),
 * umrandet = plausibel, bitte prüfen, violett = KI-Vorschlag.
 */
const SICHTBAR = 3

export default function VorwissenChips({
  anfrage,
  wert,
  onChange,
  modus = 'vorwissen',
  ai
}: {
  anfrage: VorwissenAnfrage
  wert: string
  onChange: (wert: string) => void
  modus?: 'vorwissen' | 'stoff'
  ai: KiAufruf
}): React.JSX.Element | null {
  const ergebnis = useMemo(() => (modus === 'stoff' ? stoffVorschlaege(anfrage) : vorwissenVorschlaege(anfrage)), [anfrage, modus])
  const [ki, setKi] = useState<{ fuer: string; liste: VorwissenVorschlag[] }>({ fuer: '', liste: [] })
  const [laeuft, setLaeuft] = useState(false)
  const [offen, setOffen] = useState<Partial<Record<VorwissenArt, boolean>>>({})

  // KI-Vorschläge gelten nur für das Thema, zu dem sie erzeugt wurden
  const schluessel = `${anfrage.subjectId}|${anfrage.grade}|${anfrage.topic}|${anfrage.learningGoals ?? ''}`
  const kiListe = ki.fuer === schluessel ? ki.liste : []
  const alle = [...ergebnis.vorschlaege, ...kiListe].filter((v) => !steht(wert, v))
  const arten: VorwissenArt[] = modus === 'stoff' ? ['stoff'] : ARTEN_VORWISSEN

  const ergaenzen = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const liste = modus === 'stoff' ? await kiStoff(anfrage, ergebnis, ai) : await kiVorwissen(anfrage, ergebnis, ai)
      setKi({ fuer: schluessel, liste })
    } catch (e) {
      notifyError(e, 'Die KI konnte keine Vorschläge machen')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Stack gap={6} data-testid="vorwissen-chips">
      {ergebnis.hinweise.map((h) => (
        <Alert key={h} variant="light" color="yellow" icon={<IconInfoCircle size={16} />} p="xs">
          <Text size="xs">{h}</Text>
        </Alert>
      ))}
      {arten.map((art) => {
        const gruppe = alle.filter((v) => v.art === art)
        if (!gruppe.length) return null
        const zeigen = offen[art] ? gruppe : gruppe.slice(0, SICHTBAR)
        return (
          <div key={art}>
            {modus === 'vorwissen' && (
              <Text size="xs" c="dimmed" fw={500} mb={2}>
                {ART_LABEL[art]}
              </Text>
            )}
            <Group gap={6}>
              {zeigen.map((v) => {
                /*
                 * GER-Kennzeichen (Paket 12): das belegte Niveau des Vorschlags, sonst – nur in den
                 * Fremdsprachen – der Richtwert der Lerngruppe mit „≈" davor. So sieht die Lehrkraft
                 * auf einen Blick, was über oder unter dem Niveau der Klasse liegt.
                 */
                const niveau = v.niveau ?? anfrage.gerRichtwert
                const richtwert = !v.niveau && Boolean(anfrage.gerRichtwert)
                const niveauText = niveau ? (richtwert ? `GER-Richtwert der Lerngruppe: ${niveau}` : `GER-Niveau der Einführung: ${niveau}`) : ''
                return (
                  <Tooltip key={v.text} label={niveauText ? `${v.quelle} · ${niveauText}` : v.quelle} multiline maw={360} withArrow openDelay={300}>
                    <Button
                      size="compact-xs"
                      radius="xl"
                      variant={v.ki ? 'light' : v.sicher ? 'light' : 'outline'}
                      color={v.ki ? 'violet' : v.sicher ? 'teal' : 'gray'}
                      leftSection={v.ki ? <IconSparkles size={12} /> : <IconPlus size={12} />}
                      rightSection={
                        niveau ? (
                          <Badge
                            size="xs"
                            radius="sm"
                            variant={richtwert ? 'outline' : 'filled'}
                            color={richtwert ? 'gray' : 'indigo'}
                            className="ger-kennzeichen"
                            data-ger={niveau}
                            styles={{ root: { textTransform: 'none', paddingInline: 4 } }}
                          >
                            {richtwert ? `≈${niveau}` : niveau}
                          </Badge>
                        ) : undefined
                      }
                      styles={{
                        root: { height: 'auto', minHeight: 24, paddingBlock: 3 },
                        label: { whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.35, overflow: 'visible' }
                      }}
                      aria-label={`${alsZeile(v)} übernehmen (${v.quelle}${niveauText ? `, ${niveauText}` : ''})`}
                      title={v.quelle}
                      data-art={art}
                      data-sicher={v.sicher ? 'ja' : 'nein'}
                      onClick={() => onChange(zeileEinfuegen(wert, alsZeile(v)))}
                    >
                      {v.text}
                    </Button>
                  </Tooltip>
                )
              })}
              {gruppe.length > SICHTBAR && (
                <Button size="compact-xs" variant="subtle" onClick={() => setOffen((o) => ({ ...o, [art]: !o[art] }))}>
                  {offen[art] ? 'Weniger' : `Mehr (${gruppe.length - SICHTBAR})`}
                </Button>
              )}
            </Group>
          </div>
        )
      })}
      <Group gap="xs" justify="space-between" wrap="nowrap" align="center">
        <Text size="xs" c="dimmed">
          Klick übernimmt ins Feld. Grün = belegt, umrandet = bitte prüfen, violett = KI. Die Herkunft steht im Tooltip.
          {alle.some((v) => v.niveau) || anfrage.gerRichtwert ? ' Kennzeichen A1 … C1 = GER-Niveau, „≈“ = Richtwert der Lerngruppe.' : ''}
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          color="violet"
          leftSection={<IconSparkles size={13} />}
          style={{ flexShrink: 0 }}
          loading={laeuft}
          disabled={!anfrage.topic.trim()}
          title={anfrage.topic.trim() ? undefined : 'Bitte zuerst ein Thema eintragen'}
          onClick={() => void ergaenzen()}
        >
          Mit KI ergänzen
        </Button>
      </Group>
    </Stack>
  )
}
