/**
 * Bewertungsgrundlage (23.10.2026, Multiple Choice mit der Lehrkraft): in Schritt „Material" immer
 * sichtbar, auch im Standardmodus. Zwei Zeilen mit Stand und je drei Wegen:
 *
 * - Musterlösung / Erwartungshorizont (ein Feld): hochladen, von der KI entwerfen lassen, eintippen.
 * - Bewertungstabelle / -raster: hochladen, von der KI entwerfen lassen, selbst anlegen (oder aus
 *   einer Vorlage). Eine Tabelle schaltet die Form „Bewertungstabelle" mit an, Entfernen wieder ab.
 *
 * Vorher lag der Erwartungshorizont in den Expertenfeldern und die Tabelle erschien erst, wenn die
 * Form „Bewertungstabelle" gewählt war.
 */
import { Badge, Button, Card, Collapse, Divider, FileButton, Group, Select, Stack, Text, Textarea } from '@mantine/core'
import { IconPencil, IconSparkles, IconUpload } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { notifyError } from '../../../shared/util'
import { ladeTabellenVorlage, tabellenVorlagen, type TabellenVorlage } from '../ablagen'
import { ENTWURF_VERMERK } from '../aufgabeAusMaterial'
import { hatForm, setzeForm } from '../art'
import { erwartungAusDateien, erwartungEntwerfen, tabelleErzeugen } from '../auftrag'
import type { Rueckmeldung } from '../model/types'
import { useRueckmeldung } from '../store'
import { leereTabelle } from '../tabelle'
import { leseUndPruefe } from './dateiLesen'
import TabelleKarte from './TabelleKarte'

const TABELLE_ACCEPT = [...MATERIAL_ACCEPT, 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', '.csv'].join(',')

type Update = (f: (d: Rueckmeldung) => void, gruppe?: string) => void

export default function BewertungKarte({ r, update, docId }: { r: Rueckmeldung; update: Update; docId: string }): React.JSX.Element {
  const [loesungAuf, setLoesungAuf] = useState(false)
  const [tabelleAuf, setTabelleAuf] = useState(false)
  const [leseLoesung, setLeseLoesung] = useState<string | null>(null)
  const [leseTabelle, setLeseTabelle] = useState<string | null>(null)
  const [vorlagen, setVorlagen] = useState<TabellenVorlage[]>([])
  useEffect(() => {
    void tabellenVorlagen().then(setVorlagen)
  }, [r.tabelle?.vorlageId])

  const erwartung = r.grundlage.erwartung?.trim() ?? ''
  const entwurf = erwartung.startsWith(ENTWURF_VERMERK)
  const t = r.tabelle
  const summe = t?.kriterien.reduce((s, k) => s + (k.punkte ?? 0), 0) ?? 0
  const ohneAufgabe = !r.grundlage.aufgaben.trim()
  const kiHinweis = ohneAufgabe ? 'Zuerst die Aufgabe eintragen' : undefined

  const loesungHochladen = async (files: File[]): Promise<void> => {
    if (!files.length) return
    try {
      const geprueft = await leseUndPruefe(files, setLeseLoesung)
      const aktuell = useRueckmeldung.getState().dok
      if (geprueft && aktuell) erwartungAusDateien(aktuell, docId, geprueft)
    } catch (e) {
      notifyError(e, 'Die Datei konnte nicht gelesen werden')
    }
  }
  const tabelleHochladen = async (files: File[]): Promise<void> => {
    if (!files.length) return
    try {
      const geprueft = await leseUndPruefe(files, setLeseTabelle, 4)
      const aktuell = useRueckmeldung.getState().dok
      if (geprueft && aktuell) tabelleErzeugen(aktuell, docId, geprueft)
    } catch (e) {
      notifyError(e, 'Die Tabelle konnte nicht gelesen werden')
    }
  }

  return (
    <Card withBorder data-rm-bewertung>
      <Text fw={600}>Bewertungsgrundlage (optional)</Text>
      <Text size="xs" c="dimmed" mb="sm">
        Damit misst die KI jede Abgabe am selben Maßstab.
      </Text>

      {/* ---------- Musterlösung / Erwartungshorizont */}
      <Group justify="space-between" gap="xs" wrap="wrap">
        <Group gap="xs">
          <Text size="sm" fw={600}>
            Musterlösung / Erwartungshorizont
          </Text>
          {leseLoesung ? (
            <Badge size="sm" variant="light" color="blue">
              {leseLoesung}
            </Badge>
          ) : erwartung ? (
            <Badge size="sm" variant="light" color={entwurf ? 'orange' : 'teal'} data-rm-loesung-stand>
              {entwurf ? 'Entwurf der KI – bitte prüfen' : 'vorhanden'}
            </Badge>
          ) : (
            <Badge size="sm" variant="light" color="gray" data-rm-loesung-stand>
              noch keine
            </Badge>
          )}
        </Group>
      </Group>
      <Group gap="xs" mt={6} wrap="wrap">
        <FileButton onChange={(f) => void loesungHochladen(f)} accept={MATERIAL_ACCEPT.join(',')} multiple>
          {(props) => (
            <Button {...props} size="xs" variant="default" leftSection={<IconUpload size={14} />} loading={Boolean(leseLoesung)} data-rm-loesung-hochladen>
              Hochladen
            </Button>
          )}
        </FileButton>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconSparkles size={14} />}
          disabled={ohneAufgabe}
          title={kiHinweis}
          onClick={() => erwartungEntwerfen(r, docId)}
          data-rm-loesung-ki
        >
          KI entwirft
        </Button>
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconPencil size={14} />}
          onClick={() => setLoesungAuf((o) => !o)}
          aria-expanded={loesungAuf}
          data-rm-loesung-auf
        >
          {loesungAuf ? 'Zuklappen' : erwartung ? 'Ansehen / bearbeiten' : 'Eintippen'}
        </Button>
      </Group>
      <Collapse expanded={loesungAuf}>
        <Stack gap={6} mt="xs">
          <Textarea
            aria-label="Musterlösung / Erwartungshorizont"
            placeholder="Erwartete Inhalte, Lösungsschritte oder ein Mustertext – woran eine gelungene Bearbeitung zu erkennen ist"
            autosize
            minRows={3}
            maxRows={14}
            value={r.grundlage.erwartung ?? ''}
            onChange={(e) => {
              const x = e.currentTarget.value
              update((d) => (d.grundlage.erwartung = x), 'rm-erwartung')
            }}
            data-rm-erwartung
          />
          {entwurf && (
            <Group>
              <Button
                size="compact-xs"
                variant="light"
                color="teal"
                onClick={() => update((d) => (d.grundlage.erwartung = (d.grundlage.erwartung ?? '').replace(ENTWURF_VERMERK, '').trimStart()))}
              >
                Durchgesehen
              </Button>
            </Group>
          )}
        </Stack>
      </Collapse>

      <Divider my="md" />

      {/* ---------- Bewertungstabelle / -raster */}
      <Group gap="xs">
        <Text size="sm" fw={600}>
          Bewertungstabelle / -raster
        </Text>
        {leseTabelle ? (
          <Badge size="sm" variant="light" color="blue">
            {leseTabelle}
          </Badge>
        ) : t ? (
          <Badge size="sm" variant="light" color={t.entwurf ? 'orange' : 'teal'} data-rm-tabelle-stand>
            {`${t.kriterien.length} Kriterien${summe ? ` · ${summe} Punkte` : ''}${t.entwurf ? ' · Entwurf der KI' : ''}`}
          </Badge>
        ) : (
          <Badge size="sm" variant="light" color="gray" data-rm-tabelle-stand>
            noch keine
          </Badge>
        )}
      </Group>
      {t ? (
        <>
          <Group gap="xs" mt={6}>
            <Button size="xs" variant="subtle" leftSection={<IconPencil size={14} />} onClick={() => setTabelleAuf((o) => !o)} aria-expanded={tabelleAuf} data-rm-tabelle-auf>
              {tabelleAuf ? 'Zuklappen' : 'Ansehen / bearbeiten'}
            </Button>
          </Group>
          <Collapse expanded={tabelleAuf}>
            <div style={{ marginTop: 'var(--mantine-spacing-xs)' }}>
              <TabelleKarte />
            </div>
          </Collapse>
        </>
      ) : (
        <>
          <Group gap="xs" mt={6} wrap="wrap">
            <FileButton onChange={(f) => void tabelleHochladen(f)} accept={TABELLE_ACCEPT} multiple>
              {(props) => (
                <Button {...props} size="xs" variant="default" leftSection={<IconUpload size={14} />} loading={Boolean(leseTabelle)} data-rm-tabelle-hochladen>
                  Hochladen
                </Button>
              )}
            </FileButton>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconSparkles size={14} />}
              disabled={ohneAufgabe}
              title={kiHinweis}
              onClick={() => tabelleErzeugen(r, docId, null)}
              data-rm-tabelle-ki
            >
              KI entwirft
            </Button>
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconPencil size={14} />}
              onClick={() => {
                update((d) => {
                  d.tabelle = leereTabelle()
                  setzeForm(d.meta, 'tabelle', true)
                })
                setTabelleAuf(true)
              }}
              data-rm-tabelle-selbst
            >
              Selbst anlegen
            </Button>
            {vorlagen.length > 0 && (
              <Select
                size="xs"
                placeholder="Aus Vorlage …"
                aria-label="Bewertungstabelle aus Vorlage"
                data={vorlagen.map((v) => ({ value: v.id, label: `${v.name} (${v.kriterien})` }))}
                value={null}
                onChange={(id) =>
                  id &&
                  void ladeTabellenVorlage(id)
                    .then((neu) =>
                      update((d) => {
                        d.tabelle = neu
                        setzeForm(d.meta, 'tabelle', true)
                      })
                    )
                    .catch(notifyError)
                }
                w={220}
              />
            )}
          </Group>
          {hatForm(r.meta, 'tabelle') && (
            <Text size="xs" c="orange" mt={6}>
              Die Form „Bewertungstabelle“ ist gewählt – dafür bitte eine Tabelle anlegen.
            </Text>
          )}
        </>
      )}
    </Card>
  )
}
