/**
 * Unregelmäßige Verben zum Üben freigeben (07.10.2026, im Plan-Modus mit der Lehrkraft abgestimmt): Verbliste eines
 * Bandes „bis zu einer Stelle", frühere Bände zuschaltbar, einzelne Verben abwählbar; ohne Band die Standardliste bis
 * zum Lernjahr. Ohne KI – die Formen stammen aus der Liste.
 */
import { Badge, Checkbox, Collapse, Group, Select, SimpleGrid, Stack, Switch, Text, UnstyledButton } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { grundformVon, VERB_SPALTEN, type VerbEintrag, type VerbListeMeta, type VerbSprache } from '@shared/verben'
import { fruehereBaende, fuehreZusammen } from '../../shared/verben/quellen'
import { standardBis } from '../../shared/verben/standard'

const STANDARD = '__standard__'

export function VerbFreigabe({
  sprache,
  lernjahr,
  wahl
}: {
  sprache: VerbSprache
  lernjahr: number
  /** Gewählte Verben und ein Titel („Unregelmäßige Verben – Green Line 2, bis buy") */
  wahl: (verben: VerbEintrag[], titel: string) => void
}): React.JSX.Element {
  const [listen, setListen] = useState<VerbListeMeta[]>([])
  const [listeId, setListeId] = useState<string>(STANDARD)
  const [frueher, setFrueher] = useState(false)
  const [eintraege, setEintraege] = useState<VerbEintrag[]>([])
  const [bis, setBis] = useState<string | null>(null)
  const [ab, setAb] = useState<Set<string>>(new Set())
  const [offen, setOffen] = useState(false)
  useEffect(() => {
    void window.api.verbLists
      .list()
      .then((l) => {
        const eigene = l.filter((x) => x.sprache === sprache)
        setListen(eigene)
        if (eigene[0]) setListeId(eigene[0].id)
      })
      .catch(() => setListen([]))
  }, [sprache])
  const liste = listen.find((l) => l.id === listeId)
  useEffect(() => {
    let weg = false
    setBis(null)
    setAb(new Set())
    if (!liste) {
      setEintraege(standardBis(sprache, lernjahr))
      return
    }
    void Promise.all([...(frueher ? fruehereBaende(listen, liste).map((l) => l.id) : []), liste.id].map((id) => window.api.verbLists.get(id))).then(
      (l) => !weg && setEintraege(fuehreZusammen(l))
    )
    return () => {
      weg = true
    }
  }, [listeId, frueher, sprache, lernjahr, listen.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const grund = (e: VerbEintrag): string => grundformVon(e, sprache)
  // „bis Verb …" bezieht sich auf den gewählten Band (frühere Bände stehen davor ganz drin)
  const eigeneIds = useMemo(() => eintraege.filter((e) => !liste || e.id.startsWith(`${liste.id}:`)).map((e) => e.id), [eintraege, liste])
  const gewaehlt = useMemo(() => {
    const grenze = bis ? eigeneIds.indexOf(bis) : -1
    return eintraege.filter((e) => {
      if (ab.has(e.id)) return false
      if (grenze < 0) return true
      const i = eigeneIds.indexOf(e.id)
      return i < 0 || i <= grenze
    })
  }, [eintraege, eigeneIds, bis, ab])
  useEffect(() => {
    const titel = `Unregelmäßige Verben – ${liste ? liste.name : `Standardliste bis ${lernjahr}. Lernjahr`}${
      bis ? `, bis ${grund(eintraege.find((e) => e.id === bis)!)}` : ''
    }`
    wahl(gewaehlt, titel)
  }, [gewaehlt]) // eslint-disable-line react-hooks/exhaustive-deps
  const spalten = VERB_SPALTEN[sprache].filter((s) => !s.deutsch)
  return (
    <Stack gap="xs" data-verb-freigabe>
      <Group grow align="flex-end">
        <Select
          label="Verbliste"
          data={[
            ...listen.map((l) => ({ value: l.id, label: `${l.name} (${l.anzahl})` })),
            { value: STANDARD, label: `Standardliste bis ${lernjahr}. Lernjahr` }
          ]}
          value={listeId}
          onChange={(v) => setListeId(v ?? STANDARD)}
          allowDeselect={false}
          data-verb-liste
        />
        <Select
          label="Bis Verb (im gewählten Band)"
          placeholder="alle"
          clearable
          searchable
          data={eintraege.filter((e) => eigeneIds.includes(e.id)).map((e) => ({ value: e.id, label: grund(e) }))}
          value={bis}
          onChange={setBis}
          data-verb-bis
        />
      </Group>
      {liste && fruehereBaende(listen, liste).length > 0 && (
        <Switch
          label={`Frühere Bände dazu (${fruehereBaende(listen, liste)
            .map((l) => l.name)
            .join(', ')})`}
          checked={frueher}
          onChange={(e) => setFrueher(e.currentTarget.checked)}
        />
      )}
      <Group gap="xs">
        <Badge variant="light" size="lg" data-verb-anzahl={gewaehlt.length}>
          {gewaehlt.length} Verben
        </Badge>
        <UnstyledButton onClick={() => setOffen((x) => !x)}>
          <Text size="sm" c="var(--mantine-primary-color-filled)">
            {offen ? 'Liste ausblenden' : 'Einzelne abwählen …'}
          </Text>
        </UnstyledButton>
      </Group>
      <Collapse expanded={offen}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={4} mah={260} style={{ overflowY: 'auto' }}>
          {eintraege
            .filter((e) => {
              const grenze = bis ? eigeneIds.indexOf(bis) : -1
              const i = eigeneIds.indexOf(e.id)
              return grenze < 0 || i < 0 || i <= grenze
            })
            .map((e) => (
              <Checkbox
                key={e.id}
                size="xs"
                checked={!ab.has(e.id)}
                onChange={(x) => {
                  const neu = new Set(ab)
                  if (x.currentTarget.checked) neu.delete(e.id)
                  else neu.add(e.id)
                  setAb(neu)
                }}
                label={spalten
                  .map((s) => e.formen[s.id])
                  .filter(Boolean)
                  .join(' – ')}
              />
            ))}
        </SimpleGrid>
      </Collapse>
      {!listen.length && (
        <Text size="xs" c="dimmed">
          Für diese Sprache ist noch keine Verbliste eines Lehrwerks eingelesen (Vokabellisten › Lehrwerk › „Unregelmäßige Verben") – es gilt die mitgelieferte
          Standardliste.
        </Text>
      )}
    </Stack>
  )
}
