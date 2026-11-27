/**
 * Wörterbuch für Lernende (27.11.2026, abgestimmt): Buch-Knopf in der Werkzeugleiste → verschiebbares Fenster mit
 * Suche. Nur die von der Lehrkraft freigeschalteten Wörterbücher; gesucht wird auf dem Server (`pfad` je Blatt bzw.
 * Test, mit Freigabe-Prüfung). In Prüfungen liefert der Server keine ähnlichen Wörter (kein „Meinten Sie").
 */
import { ActionIcon, Badge, Group, Loader, SegmentedControl, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { IconBook2, IconSearch } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { Schwebefenster } from '../../shared/Schwebefenster'
import { WOERTERBUECHER, type WoerterbuchAntwort, type WoerterbuchEintrag, type WoerterbuchId } from '@shared/woerterbuecher'
import { holen } from './serverApi'

function Eintrag({ e, zweisprachig }: { e: WoerterbuchEintrag; zweisprachig: boolean }): React.JSX.Element {
  const d = e.daten
  const kopf = [d.genus, e.lemma].filter(Boolean).join(' ')
  return (
    <Stack gap={4} data-woerterbuch-eintrag={e.lemma} style={{ borderBottom: '1px solid var(--mantine-color-default-border)', paddingBottom: 8 }}>
      <Group gap={6} wrap="wrap" align="baseline">
        <Text fw={700} size="md">
          {kopf}
        </Text>
        {e.wortart && (
          <Text size="xs" c="dimmed" fs="normal">
            {e.wortart}
          </Text>
        )}
        {d.ipa && (
          <Text size="xs" c="dimmed">
            {d.ipa}
          </Text>
        )}
        {d.fremdwort && (
          <Badge size="xs" variant="light" color="grape">
            Fremdwort
          </Badge>
        )}
      </Group>
      {e.ueberForm && (
        <Text size="xs" c="dimmed">
          „{e.ueberForm}" ist eine Form von „{e.lemma}"
        </Text>
      )}
      {(d.silben || d.plural) && (
        <Text size="xs">
          {d.silben && <>Trennung: <b>{d.silben}</b></>}
          {d.silben && d.plural ? ' · ' : ''}
          {d.plural && <>Plural: <b>{d.plural}</b></>}
        </Text>
      )}
      {d.formen?.length ? (
        <Text size="xs" c="dimmed">
          {d.formen.join(' · ')}
        </Text>
      ) : null}
      {d.uebersetzungen?.length ? (
        <Text size="sm">
          {zweisprachig ? '→ ' : ''}
          <b>{d.uebersetzungen.map((u) => (u.hinweis ? `${u.wort} (${u.hinweis})` : u.wort)).join(', ')}</b>
        </Text>
      ) : null}
      {d.bedeutungen?.length ? (
        <Stack gap={3} component="ol" style={{ margin: 0, paddingLeft: 20 }}>
          {d.bedeutungen.map((b, i) => (
            <li key={i}>
              <Text size="sm" span>
                {b.text}
              </Text>
              {b.beispiele?.map((x, k) => (
                <Text key={k} size="xs" c="dimmed">
                  {x}
                </Text>
              ))}
            </li>
          ))}
        </Stack>
      ) : null}
      {d.synonyme?.length ? (
        <Text size="xs">
          Synonyme: {d.synonyme.join(', ')}
        </Text>
      ) : null}
      {d.herkunft && (
        <Text size="xs" c="dimmed">
          Herkunft: {d.herkunft}
        </Text>
      )}
    </Stack>
  )
}

/** Fenster mit Suche; `pfad(wb, q)` liefert die Adresse der Suche (Blatt oder Test) */
export function WoerterbuchFenster({
  erlaubt,
  pfad,
  schliessen
}: {
  erlaubt: WoerterbuchId[]
  pfad: (wb: WoerterbuchId, q: string) => string
  schliessen: () => void
}): React.JSX.Element {
  const liste = WOERTERBUECHER.filter((w) => erlaubt.includes(w.id))
  const [wb, setWb] = useState<WoerterbuchId>(liste[0]?.id ?? 'de')
  const [q, setQ] = useState('')
  const [antwort, setAntwort] = useState<WoerterbuchAntwort | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')
  const nr = useRef(0)
  const suche = (wort: string, w: WoerterbuchId = wb): void => {
    const t = wort.trim()
    if (!t) return setAntwort(null)
    const meine = ++nr.current
    setLaeuft(true)
    setFehler('')
    holen<WoerterbuchAntwort>(pfad(w, t))
      .then((a) => meine === nr.current && setAntwort(a))
      .catch((e: unknown) => meine === nr.current && (setAntwort(null), setFehler(e instanceof Error ? e.message : 'Die Suche ging gerade nicht.')))
      .finally(() => meine === nr.current && setLaeuft(false))
  }
  // Beim Tippen kurz warten, dann suchen
  useEffect(() => {
    const t = setTimeout(() => suche(q), 300)
    return () => clearTimeout(t)
  }, [q, wb]) // eslint-disable-line react-hooks/exhaustive-deps
  const zweisprachig = WOERTERBUECHER.find((w) => w.id === wb)?.art === 'zweisprachig'
  return (
    <Schwebefenster titel="Wörterbuch" schliessen={schliessen} merken="woerterbuch" breite={380} hoehe="65vh" farbe="var(--mantine-color-teal-7)" kennung={{ 'data-woerterbuch': '' }}>
      <Stack gap="xs">
        {liste.length > 1 && (
          <SegmentedControl
            size="xs"
            fullWidth
            value={wb}
            onChange={(v) => setWb(v as WoerterbuchId)}
            data={liste.map((w) => ({ value: w.id, label: w.kurz }))}
            styles={{ label: { padding: '2px 4px' } }}
            data-woerterbuch-wahl
          />
        )}
        <TextInput
          autoFocus
          size="sm"
          placeholder={liste.length === 1 ? `${liste[0].kurz}: Wort eingeben` : 'Wort eingeben'}
          leftSection={laeuft ? <Loader size={14} /> : <IconSearch size={16} />}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          lang={WOERTERBUECHER.find((w) => w.id === wb)?.sprache}
          data-woerterbuch-suche
        />
        {fehler && (
          <Text size="sm" c="red">
            {fehler}
          </Text>
        )}
        {antwort && !antwort.treffer.length && (
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Kein Eintrag gefunden.
            </Text>
            {antwort.aehnlich?.length ? (
              <Group gap={6}>
                <Text size="sm">Ähnliche Wörter:</Text>
                {antwort.aehnlich.map((w) => (
                  <UnstyledButton key={w} onClick={() => setQ(w)} style={{ textDecoration: 'underline' }} data-woerterbuch-aehnlich={w}>
                    <Text size="sm">{w}</Text>
                  </UnstyledButton>
                ))}
              </Group>
            ) : null}
          </Stack>
        )}
        {antwort?.treffer.map((e, i) => <Eintrag key={`${e.lemma}-${i}`} e={e} zweisprachig={zweisprachig} />)}
        {antwort && (
          <Text size="xs" c="dimmed" data-woerterbuch-quelle>
            Quelle: {antwort.quelle}
          </Text>
        )}
      </Stack>
    </Schwebefenster>
  )
}

/** Buch-Knopf für die Werkzeugleiste */
export function WoerterbuchKnopf({ offen, umschalten }: { offen: boolean; umschalten: () => void }): React.JSX.Element {
  return (
    <Tooltip label={offen ? 'Wörterbuch schließen' : 'Wörterbuch öffnen'}>
      <ActionIcon variant={offen ? 'filled' : 'light'} color="teal" radius="xl" size="lg" aria-label="Wörterbuch" aria-pressed={offen} onClick={umschalten} data-woerterbuch-knopf>
        <IconBook2 size={20} />
      </ActionIcon>
    </Tooltip>
  )
}
