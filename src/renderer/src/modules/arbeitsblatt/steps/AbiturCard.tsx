import { Alert, Badge, Card, Group, List, Select, Stack, Switch, Text, Title } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { abiturProfil, NIVEAU_LABEL } from '../didactics/abitur'
import { abiturZusammenfassung, aufgabenartFuer } from '../generation/abiturPrompt'
import type { AbiturVorgaben, WorksheetMeta } from '../model/types'

/**
 * Vorgaben für eine abiturbezogene Übungsaufgabe oder Übungsklausur.
 *
 * Wunsch der Lehrkraft (24.09.2026): „Passe hierfür bei der Auswahl des 12./13. Jahrgangs per
 * Knopfdruck unter Kompetenzniveau das Menü ‚Thema & Lerngruppe' grundlegend so daran an,
 * dass man Vorgaben für an Abituraufgaben angelehnte Übungsaufgaben und Übungsklausuren
 * entwerfen lassen kann."
 *
 * Die Karte zeigt nur, was das jeweilige Fach wirklich kennt: Deutsch hat vier Aufgabenarten
 * und keine Prüfungsteile, die Fremdsprachen haben drei getrennt gewichtete Prüfungsteile,
 * Mathematik einen hilfsmittelfreien Teil. Ein gemeinsames Formular für alle Fächer wäre für
 * jedes einzelne falsch.
 *
 * Ganz unten steht, worauf sich die App beruft – und was daran NICHT amtlich vorgegeben ist.
 * Ohne diesen Hinweis hielte die Lehrkraft die Richtwerte für Vorschriften und beriefe sich
 * im Zweifel darauf.
 */
export interface AbiturCardProps {
  meta: WorksheetMeta
  onChange: (vorgaben: AbiturVorgaben) => void
}

export default function AbiturCard({ meta, onChange }: AbiturCardProps): React.JSX.Element | null {
  const profil = abiturProfil(meta.subjectId)
  const v = meta.abitur
  if (!profil || !v?.an) return null

  const setzen = (teil: Partial<AbiturVorgaben>): void => onChange({ ...v, ...teil })
  const afb = profil.afb[v.niveau]
  // Nach einem Fachwechsel kann die gespeicherte Aufgabenart hier gar nicht vorkommen;
  // in den Fremdsprachen ergibt sie sich ohnehin aus dem Kompetenzschwerpunkt
  const art = aufgabenartFuer(meta, profil)

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={4}>Abiturbezogene Vorgaben</Title>
        <Badge variant="light">{profil.label}</Badge>
      </Group>
      <Stack gap="sm">
        <Group grow align="start">
          <Select
            label="Anforderungsniveau"
            description={`Anforderungsbereiche etwa ${afb.I}/${afb.II}/${afb.III} %`}
            data={[
              { value: 'gA', label: NIVEAU_LABEL.gA },
              { value: 'eA', label: NIVEAU_LABEL.eA }
            ]}
            value={v.niveau}
            onChange={(x) => x && setzen({ niveau: x as AbiturVorgaben['niveau'] })}
            allowDeselect={false}
          />
          {/*
            In den Fremdsprachen wird die Aufgabenart NICHT eigens gefragt.
            Gemeldet am 24.09.2026: Sie doppelt sich mit dem Kompetenzschwerpunkt weiter
            oben – die drei Pruefungsteile des Abiturs (Hoerverstehen, Sprachmittlung,
            Schreiben) sind genau diese Schwerpunkte. Zweimal dasselbe zu fragen, laedt nur
            dazu ein, sich zu widersprechen.
          */}
          {!profil.pruefungsteile && (
            <Select
              label="Aufgabenart"
              description={profil.aufgabenarten.find((a) => a.id === art)?.beschreibung}
              data={profil.aufgabenarten.map((a) => ({ value: a.id, label: a.label }))}
              value={art}
              onChange={(x) => x && setzen({ aufgabenart: x })}
              allowDeselect={false}
            />
          )}
        </Group>

        {profil.pruefungsteile && (
          <Text size="xs" c="dimmed">
            Die Aufgabenart ergibt sich aus dem Kompetenzschwerpunkt oben: <b>{profil.aufgabenarten.find((a) => a.id === art)?.label}</b>
            {profil.pruefungsteile.find((p) => p.id === art) ? ` – im Abitur ${profil.pruefungsteile.find((p) => p.id === art)!.anteil} % der Bewertung.` : '.'}
          </Text>
        )}

        <Switch
          label="Als Übungsklausur"
          description={
            v.klausur
              ? `Bildet die Prüfungssituation nach: ${profil.zeit[v.niveau]} Minuten, Hilfsmittelangabe, Erwartungshorizont mit Gewichtung – und keine Hilfen.`
              : 'Eine einzelne Übungsaufgabe mit Erwartungshorizont. Eingeschaltet entsteht stattdessen eine vollständige Klausur.'
          }
          checked={v.klausur}
          onChange={(e) => setzen({ klausur: e.currentTarget.checked })}
        />

        <Alert variant="light" color="gray" icon={<IconInfoCircle size={16} />} title="Worauf sich das stützt">
          <List size="xs" spacing={2}>
            {abiturZusammenfassung(meta).map((z) => (
              <List.Item key={z}>{z}</List.Item>
            ))}
          </List>
          {/*
            Das Wichtigste an dieser Karte: Was NICHT vorgegeben ist, steht dabei. Die App
            liefert für die meisten Fächer abgeleitete Richtwerte, keine Vorschriften.
          */}
          {profil.offen && (
            <Text size="xs" mt={6} c="dimmed">
              Nicht amtlich vorgegeben: {profil.offen}
            </Text>
          )}
          <Text size="xs" mt={6} c="dimmed">
            Es entsteht eine Übungsaufgabe in Anlehnung an das Zentralabitur, keine amtliche Prüfungsaufgabe.
          </Text>
        </Alert>
      </Stack>
    </Card>
  )
}
