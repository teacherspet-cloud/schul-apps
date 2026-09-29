import { ActionIcon, Badge, Button, Card, Group, NumberInput, SegmentedControl, Select, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core'
import { IconPlus, IconSparkles, IconTrash } from '@tabler/icons-react'
import { einstufungVon } from '../art'
import { teileErkennen } from '../auftrag'
import type { Rueckmeldung } from '../model/types'
import { aufHundert, fremdsprachlich, getrennt, inhaltVorgabe, INHALT_STANDARD, TEIL_ARTEN, type BewertungsTeil, type TeilArt, type Verrechnung } from '../teilbewertung'

const QUELLE: Record<BewertungsTeil['quelle'], string> = {
  klassenarbeit: 'aus der Klassenarbeit',
  material: 'aus dem Material',
  vorgabe: 'Voreinstellung',
  lehrkraft: 'eigene Angabe'
}

/**
 * Bewertung nach Teilen (29.09.2026, Wunsch der Lehrkraft): Schreib- und Sprachmittlungsteile
 * getrennt nach Inhalt und Sprache, Gesamtleistung nach Prozent oder Punkten. Die Teile kommen
 * aus der Klassenarbeit, aus dem Material (mit den dort genannten Gewichten) oder von der
 * Lehrkraft.
 */
export default function TeileKarte({
  r,
  docId,
  update
}: {
  r: Rueckmeldung
  docId: string
  update: (f: (d: Rueckmeldung) => void, gruppe?: string) => void
}): React.JSX.Element | null {
  const teile = r.grundlage.teile ?? []
  const fs = fremdsprachlich(r.meta.subjectId)
  // Nur, wo es passt: Fremdsprachen oder schon erkannte Teile
  if (!fs && !teile.length) return null
  const verrechnung: Verrechnung = r.grundlage.verrechnung ?? 'prozent'
  const setzeTeil = (i: number, p: Partial<BewertungsTeil>): void =>
    update((d) => {
      const t = d.grundlage.teile?.[i]
      if (!t) return
      Object.assign(t, p, { quelle: 'lehrkraft' })
      if (p.art && getrennt(t) && typeof t.inhalt !== 'number') t.inhalt = inhaltVorgabe(d.meta.stateId, d.meta.grade, t.art, d.meta.schoolTypeId).inhalt
      if (p.art === 'sonstig') delete t.inhalt
    }, `rm-teil-${i}`)
  const neu = (): void =>
    update((d) => {
      const liste = d.grundlage.teile ?? []
      const art: TeilArt = fs && !liste.some((t) => t.art === 'schreiben') ? 'schreiben' : 'sonstig'
      liste.push({
        id: `t${Math.max(0, ...liste.map((t) => Number(t.id.replace(/\D/g, '')) || 0)) + 1}`,
        titel: art === 'schreiben' ? 'Schreiben' : `Teil ${liste.length + 1}`,
        art,
        gewicht: liste.length ? Math.round(100 / (liste.length + 1)) : 100,
        ...(art !== 'sonstig' ? { inhalt: inhaltVorgabe(d.meta.stateId, d.meta.grade, art, d.meta.schoolTypeId).inhalt } : {}),
        quelle: 'lehrkraft'
      })
      d.grundlage.teile = aufHundert(liste)
      d.grundlage.verrechnung ??= 'prozent'
    })
  const summe = teile.reduce((s, t) => s + (t.gewicht ?? 0), 0)
  const ohneNote = einstufungVon(r.meta) === 'keine'

  return (
    <Card withBorder data-teile>
      <Group justify="space-between" mb="xs">
        <Title order={4}>Bewertung nach Teilen</Title>
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconSparkles size={14} />}
            disabled={!r.grundlage.aufgaben.trim()}
            onClick={() => teileErkennen(r, docId)}
          >
            Teile erkennen
          </Button>
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={neu}>
            Teil
          </Button>
        </Group>
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        Schreib- und Sprachmittlungsaufgaben werden nach Inhalt und Sprache getrennt bewertet (in der Regel {INHALT_STANDARD} % Inhalt, {100 - INHALT_STANDARD} %
        Sprache). Gewichte auf dem Material gehen vor.
        {ohneNote ? ' Ohne Einstufung spricht der Bogen Inhalt und Sprache getrennt an, ohne Prozentwerte.' : ''}
      </Text>
      {teile.length > 0 && (
        <Stack gap="xs">
          {teile.length > 1 && (
            <SegmentedControl
              size="xs"
              value={verrechnung}
              onChange={(v) => update((d) => (d.grundlage.verrechnung = v as Verrechnung))}
              data={[
                { value: 'prozent', label: 'Gewichtung in Prozent' },
                { value: 'punkte', label: 'nach Punkten' }
              ]}
            />
          )}
          {teile.map((t, i) => (
            <Group key={t.id} gap="xs" align="flex-end" wrap="wrap">
              <TextInput size="xs" label={i === 0 ? 'Teil' : undefined} value={t.titel} onChange={(e) => setzeTeil(i, { titel: e.currentTarget.value })} w={170} />
              <Select
                size="xs"
                label={i === 0 ? 'Art' : undefined}
                data={TEIL_ARTEN}
                value={t.art}
                onChange={(v) => v && setzeTeil(i, { art: v as TeilArt })}
                allowDeselect={false}
                w={220}
              />
              {verrechnung === 'prozent' ? (
                <NumberInput
                  size="xs"
                  label={i === 0 ? 'Gewicht %' : undefined}
                  min={0}
                  max={100}
                  value={t.gewicht ?? 0}
                  onChange={(v) => setzeTeil(i, { gewicht: Number(v) || 0 })}
                  w={90}
                />
              ) : (
                <NumberInput size="xs" label={i === 0 ? 'Punkte' : undefined} min={0} value={t.punkte ?? 0} onChange={(v) => setzeTeil(i, { punkte: Number(v) || 0 })} w={90} />
              )}
              {t.art === 'sprachmittlung' && (
                <Select
                  size="xs"
                  label={i === 0 || teile[0].art !== 'sprachmittlung' ? 'Ergebnis auf' : undefined}
                  data={[
                    { value: 'deutsch', label: 'Deutsch' },
                    { value: 'zielsprache', label: r.meta.subjectLabel || 'Zielsprache' },
                    { value: 'offen', label: 'unklar' }
                  ]}
                  value={t.ergebnisSprache ?? 'offen'}
                  onChange={(v) => setzeTeil(i, { ergebnisSprache: v === 'deutsch' || v === 'zielsprache' ? v : undefined })}
                  allowDeselect={false}
                  w={120}
                />
              )}
              {getrennt(t) && (
                <NumberInput
                  size="xs"
                  label={i === 0 || !getrennt(teile[0]) ? 'Inhalt %' : undefined}
                  min={0}
                  max={100}
                  value={t.inhalt ?? INHALT_STANDARD}
                  onChange={(v) => setzeTeil(i, { inhalt: Number(v) || 0 })}
                  w={90}
                  rightSection={<Text size="xs" c="dimmed">/{100 - (t.inhalt ?? INHALT_STANDARD)}</Text>}
                  rightSectionWidth={34}
                />
              )}
              <Badge variant="light" color={t.quelle === 'vorgabe' ? 'gray' : 'blue'}>
                {QUELLE[t.quelle]}
              </Badge>
              <Tooltip label="Teil entfernen">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label="Teil entfernen"
                  onClick={() =>
                    update((d) => {
                      const rest = (d.grundlage.teile ?? []).filter((_, j) => j !== i)
                      if (rest.length) d.grundlage.teile = aufHundert(rest)
                      else {
                        delete d.grundlage.teile
                        delete d.grundlage.verrechnung
                      }
                    })
                  }
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ))}
          {verrechnung === 'prozent' && teile.length > 1 && summe !== 100 && (
            <Group gap="xs">
              <Text size="xs" c="orange">
                Die Gewichte ergeben {summe} %.
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={() => update((d) => (d.grundlage.teile = aufHundert(d.grundlage.teile ?? [])))}>
                Auf 100 % bringen
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Card>
  )
}
