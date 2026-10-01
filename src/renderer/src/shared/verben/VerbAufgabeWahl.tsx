/**
 * Auswahl für Aufgaben zu unregelmäßigen Verben (30.09.2026) – dieselbe Karte im Grammatiktest,
 * im Arbeitsblatt und im Vokabeltest.
 *
 * Quelle (Liste des Lehrwerk-Bandes, auf Wunsch mit den früheren Bänden, oder Standardliste nach
 * Lernjahr) → Verben ankreuzen → Formate, Spalten und Bewertung. Die Voreinstellung folgt dem
 * Lernjahr (formate.ts); alles bleibt änderbar.
 */
import { Alert, Badge, Button, Checkbox, Group, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text, Tooltip } from '@mantine/core'
import ZahlFeld from '../components/ZahlFeld'
import { IconListDetails, IconSparkles } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { grundformVon, verbSchluessel, VERB_SPALTEN, type VerbEintrag, type VerbListeMeta } from '@shared/verben'
import { notifyError } from '../util'
import { formatHinweis } from './erzeugen'
import { formatVon, immerDeutsch, VERB_FORMATE, verbzahlFuerLernjahr, type VerbAufgabe, type VerbFormatId } from './formate'
import { fruehereBaende, ladeVerbPool, verbenAusVokabeln } from './quellen'
import VerbListeDialog from './VerbListeDialog'
import { shuffle, createRng } from '../../modules/vokabeltest/model/random'

export default function VerbAufgabeWahl({
  wert,
  onChange,
  nurOhneKi = false,
  vokabeln,
  lehrwerkId,
  lehrwerkName
}: {
  wert: VerbAufgabe
  onChange: (a: VerbAufgabe) => void
  /** Vokabeltest: nur Formate, die ohne KI aus der Liste entstehen */
  nurOhneKi?: boolean
  /** Vokabeln des Tests – daraus lassen sich die unregelmäßigen Verben übernehmen */
  vokabeln?: { term: string }[]
  /** Lehrwerk, das in diesem Programm gewählt ist – seine Liste wird vorgeschlagen */
  lehrwerkId?: string
  /** Dasselbe über den Namen des Bandes (der Vokabeltest kennt nur ihn) */
  lehrwerkName?: string
}): React.JSX.Element {
  const a = wert
  const [listen, setListen] = useState<VerbListeMeta[]>([])
  const [pool, setPool] = useState<VerbEintrag[]>([])
  const [dialog, setDialog] = useState(false)
  // Nach dem Speichern einer Liste neu laden – auch wenn derselbe Band gewählt bleibt
  const [stand, setStand] = useState(0)
  const spalten = VERB_SPALTEN[a.sprache]

  const ladeListen = (): void => {
    window.api.verbLists
      .list()
      .then((l) => setListen(l.filter((x) => x.sprache === a.sprache)))
      .catch(notifyError)
  }
  useEffect(ladeListen, [a.sprache])

  // Liste des gewählten Lehrwerks vorschlagen, solange noch die Standardliste gilt
  useEffect(() => {
    const vorschlag = listen.find((l) => l.id === lehrwerkId || (lehrwerkName && l.name === lehrwerkName))
    if (vorschlag && a.quelle === 'standard' && !a.listeId) onChange({ ...a, quelle: 'lehrwerk', listeId: vorschlag.id, listenName: vorschlag.name })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lehrwerkId, lehrwerkName, listen])

  // Pool neu laden, wenn sich die Quelle ändert; die Auswahl bleibt, soweit die Verben darin stehen
  useEffect(() => {
    let aktuell = true
    ladeVerbPool(a)
      .then((p) => {
        if (!aktuell) return
        setPool(p)
        const schluessel = new Set(p.map((e) => verbSchluessel(grundformVon(e, a.sprache))))
        const bleiben = a.verben.filter((e) => schluessel.has(verbSchluessel(grundformVon(e, a.sprache))))
        if (bleiben.length !== a.verben.length || !a.verben.length) {
          // Neu gewählte Quelle: frisch vorbelegen (die ersten N der Liste)
          const neu = bleiben.length ? p.filter((e) => bleiben.some((b) => verbSchluessel(grundformVon(b, a.sprache)) === verbSchluessel(grundformVon(e, a.sprache)))) : p.slice(0, verbzahlFuerLernjahr(a.lernjahr, a.sprache))
          onChange({ ...a, verben: neu })
        }
      })
      .catch(notifyError)
    return () => {
      aktuell = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.quelle, a.listeId, a.kumulativ, a.lernjahr, a.sprache, stand])

  const gewaehlt = useMemo(() => new Set(a.verben.map((e) => verbSchluessel(grundformVon(e, a.sprache)))), [a.verben, a.sprache])
  const liste = listen.find((l) => l.id === a.listeId)
  const frueher = liste ? fruehereBaende(listen, liste) : []
  const ausVokabeln = useMemo(() => (vokabeln?.length ? verbenAusVokabeln(vokabeln, pool, a.sprache) : []), [vokabeln, pool, a.sprache])
  const formate = VERB_FORMATE.filter((f) => !nurOhneKi || !f.ki)
  const zufallszahl = Math.min(pool.length, verbzahlFuerLernjahr(a.lernjahr, a.sprache))

  const umschalten = (e: VerbEintrag, an: boolean): void => {
    const k = verbSchluessel(grundformVon(e, a.sprache))
    onChange({ ...a, verben: an ? [...a.verben, e] : a.verben.filter((x) => verbSchluessel(grundformVon(x, a.sprache)) !== k) })
  }
  const setzeFormat = (id: VerbFormatId, an: boolean): void => onChange({ ...a, formate: an ? [...a.formate, id] : a.formate.filter((f) => f !== id) })
  const zeigtTabelle = a.formate.some((f) => f === 'tabelle' || f === 'tabelleGemischt' || f === 'fehler' || f === 'auswahl')

  return (
    <Stack gap="sm" data-verbaufgabe>
      <Group align="end" gap="sm" grow>
        <SegmentedControl
          size="xs"
          value={a.quelle}
          onChange={(v) => onChange({ ...a, quelle: v as VerbAufgabe['quelle'], ...(v === 'lehrwerk' && !a.listeId && listen[0] ? { listeId: listen[0].id, listenName: listen[0].name } : {}) })}
          data={[
            { value: 'lehrwerk', label: 'Liste des Lehrwerks', disabled: !listen.length },
            { value: 'standard', label: `Standardliste bis Lernjahr ${a.lernjahr}` }
          ]}
        />
      </Group>
      {a.quelle === 'lehrwerk' && (
        <Group align="end" gap="sm">
          <Select
            size="xs"
            label="Band"
            data={listen.map((l) => ({ value: l.id, label: `${l.name} (${l.anzahl} Verben)` }))}
            value={a.listeId ?? null}
            onChange={(v) => v && onChange({ ...a, listeId: v, listenName: listen.find((l) => l.id === v)?.name })}
            allowDeselect={false}
            style={{ flex: 1 }}
            data-verbaufgabe-band
          />
          <Tooltip label={frueher.length ? `Dazu: ${frueher.map((l) => l.name).join(', ')}` : 'Keine früheren Bände dieser Reihe eingepflegt'}>
            <Switch size="xs" label="Frühere Bände mitnehmen" checked={a.kumulativ} onChange={(e) => onChange({ ...a, kumulativ: e.currentTarget.checked })} />
          </Tooltip>
        </Group>
      )}
      <Group gap="xs">
        <Button size="compact-xs" variant="light" leftSection={<IconListDetails size={12} />} onClick={() => setDialog(true)} data-verbliste-oeffnen>
          {listen.length ? 'Listen der Lehrwerke pflegen …' : 'Liste eines Lehrwerks einpflegen (Scan) …'}
        </Button>
        {ausVokabeln.length > 0 && (
          <Button size="compact-xs" variant="light" onClick={() => onChange({ ...a, verben: ausVokabeln })}>
            {ausVokabeln.length} unregelmäßige Verben aus der Vokabelliste übernehmen
          </Button>
        )}
      </Group>

      <div>
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={500}>
            Verben ({a.verben.length} von {pool.length} gewählt)
          </Text>
          <Group gap={4}>
            <Button size="compact-xs" variant="subtle" onClick={() => onChange({ ...a, verben: pool })}>
              alle
            </Button>
            <Button size="compact-xs" variant="subtle" onClick={() => onChange({ ...a, verben: [] })}>
              keine
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => onChange({ ...a, verben: shuffle(pool, createRng(Date.now())).slice(0, zufallszahl) })}
              disabled={pool.length <= zufallszahl}
            >
              zufällig {zufallszahl}
            </Button>
          </Group>
        </Group>
        <ScrollArea.Autosize mah={180} type="auto">
          <Group gap={4}>
            {pool.map((e) => {
              const an = gewaehlt.has(verbSchluessel(grundformVon(e, a.sprache)))
              return (
                <Badge
                  key={e.id}
                  variant={an ? 'filled' : 'outline'}
                  color={an ? 'blue' : 'gray'}
                  style={{ cursor: 'pointer', textTransform: 'none' }}
                  onClick={() => umschalten(e, !an)}
                  title={spalten.map((s) => e.formen[s.id]).filter(Boolean).join(' – ')}
                  data-verb={grundformVon(e, a.sprache)}
                >
                  {grundformVon(e, a.sprache)}
                </Badge>
              )
            })}
          </Group>
        </ScrollArea.Autosize>
      </div>

      <div>
        <Text size="sm" fw={500} mb={4}>
          Aufgabenformen
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={6}>
          {formate.map((f) => {
            const an = a.formate.includes(f.id)
            const hinweis = an ? formatHinweis(a, f.id) : undefined
            return (
              <Stack key={f.id} gap={2}>
                <Group gap={6} wrap="nowrap" align="start">
                  <Checkbox
                    size="xs"
                    checked={an}
                    onChange={(e) => setzeFormat(f.id, e.currentTarget.checked)}
                    label={
                      <Group gap={4}>
                        <Text size="xs" fw={500}>
                          {f.label}
                        </Text>
                        {f.ki && (
                          <Badge size="xs" variant="light" color="grape" leftSection={<IconSparkles size={10} />}>
                            KI
                          </Badge>
                        )}
                      </Group>
                    }
                    description={f.beschreibung}
                    data-verbformat={f.id}
                  />
                  {an && (
                    <ZahlFeld
                      size="xs"
                      w={64}
                      hideControls
                      style={{ flexShrink: 0 }}
                      min={1}
                      max={30}
                      value={a.anzahl[f.id] ?? f.standardAnzahl}
                      onChange={(v) => onChange({ ...a, anzahl: { ...a.anzahl, [f.id]: Number(v) || formatVon(f.id).standardAnzahl } })}
                      aria-label={`Anzahl ${f.label}`}
                    />
                  )}
                </Group>
                {hinweis && (
                  <Text size="xs" c="orange">
                    {hinweis}
                  </Text>
                )}
              </Stack>
            )
          })}
        </SimpleGrid>
      </div>

      {zeigtTabelle && (
        <Group align="end" gap="sm" grow>
          <Checkbox.Group label="Spalten in der Tabelle" value={a.spalten} onChange={(v) => v.length >= 2 && onChange({ ...a, spalten: v })}>
            <Group gap={8} mt={4}>
              {spalten.map((s) => (
                <Checkbox key={s.id} size="xs" value={s.id} label={s.label} />
              ))}
            </Group>
          </Checkbox.Group>
          {a.formate.includes('tabelle') && (
            <Select
              size="xs"
              label="Vorgegebene Spalte"
              data={spalten.filter((s) => a.spalten.includes(s.id)).map((s) => ({ value: s.id, label: s.label }))}
              value={a.vorgabe}
              onChange={(v) => v && onChange({ ...a, vorgabe: v })}
              allowDeselect={false}
            />
          )}
        </Group>
      )}
      {a.formate.some((f) => formatVon(f).ki) && (
        <Select
          size="xs"
          label="Verlangte Form in Sätzen und Texten"
          data={spalten.filter((s) => !s.deutsch && !s.grundform).map((s) => ({ value: s.id, label: s.label }))}
          value={a.zielform}
          onChange={(v) => v && onChange({ ...a, zielform: v })}
          allowDeselect={false}
        />
      )}
      <Group gap="md">
        <SegmentedControl
          size="xs"
          value={a.rechtschreibung}
          onChange={(v) => onChange({ ...a, rechtschreibung: v as VerbAufgabe['rechtschreibung'] })}
          data={[
            { value: 'halb', label: 'Schreibfehler: ½ Punkt' },
            { value: 'streng', label: 'Schreibfehler: 0 Punkte' }
          ]}
        />
        {!immerDeutsch(a.sprache) && (
          <Switch size="xs" label="Anweisungen auf Deutsch" checked={a.anweisungDeutsch} onChange={(e) => onChange({ ...a, anweisungDeutsch: e.currentTarget.checked })} />
        )}
      </Group>
      {!a.verben.length && (
        <Alert color="orange" p="xs">
          <Text size="sm">Noch kein Verb gewählt.</Text>
        </Alert>
      )}

      <VerbListeDialog
        opened={dialog}
        onClose={() => setDialog(false)}
        sprache={a.sprache}
        lehrwerkId={a.listeId ?? lehrwerkId}
        onGespeichert={(neu, id) => {
          setListen(neu.filter((x) => x.sprache === a.sprache))
          setStand((n) => n + 1)
          onChange({ ...a, quelle: 'lehrwerk', listeId: id, listenName: neu.find((l) => l.id === id)?.name, verben: [] })
        }}
      />
    </Stack>
  )
}
