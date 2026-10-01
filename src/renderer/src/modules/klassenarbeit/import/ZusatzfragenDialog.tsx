import { Alert, Button, Group, Modal, Stack, Text, Tooltip } from '@mantine/core'
import ZahlFeld from '../../../shared/components/ZahlFeld'
import { IconPlaylistAdd } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { starteAuftrag } from '../../../shared/auftraege'
import { pruefeDeckel, SEHR_LEICHT_DECKEL, STUFEN, STUFEN_WERTE, stufenVorschlag, verteileAufStufen, type VerstehensStufe } from '../../../shared/verstehen/stufen'
import { listeningRules } from '../../arbeitsblatt/didactics/listeningFormats'
import { trueFalseZugelassen } from '../../arbeitsblatt/didactics/listeningStates'
import type { TaskBlock } from '../../arbeitsblatt/model/types'
import { arbeitOffen, defaultExamName, legeArbeitAb } from '../library'
import { bloeckeDerFassung } from '../model/fassungen'
import type { Exam } from '../model/types'
import Rechtshinweis from './Rechtshinweis'
import { bezugFuer, formatDer, fuegeEin, neueItemsAus, vorhandeneItems, zusatzfragenAnfrage } from './zusatzfragen'

/**
 * „Weitere Fragen im gleichen Format" (29.09.2026): Anzahl und Stufenmix wählen, dann ergänzt
 * die KI die Aufgabe anhand des Transkripts bzw. Lesetextes. Vorschlag je Jahrgang/GER; „sehr
 * leicht" ist in Klassenarbeiten auf ein Viertel aller Items gedeckelt.
 */
export default function ZusatzfragenDialog({
  aufgabeId,
  onClose,
  exam,
  fassung,
  docId
}: {
  aufgabeId: string | null
  onClose: () => void
  exam: Exam
  fassung: number
  docId: string
}): React.JSX.Element {
  const ort = useMemo(() => {
    if (!aufgabeId) return null
    for (const p of exam.parts) {
      const bloecke = bloeckeDerFassung(p, fassung)
      const block = bloecke.find((b) => b.id === aufgabeId)
      if (block?.type === 'task') return { teilId: p.id, block, bezug: bezugFuer(bloecke, aufgabeId) }
    }
    return null
  }, [aufgabeId, exam, fassung])

  const vorhanden = useMemo(() => (ort ? vorhandeneItems(ort.block) : []), [ort])
  const vorschlag = stufenVorschlag({ grade: exam.meta.grade, cefrLevel: exam.meta.cefrLevel })
  const richtzahl = listeningRules(exam.meta.cefrLevel).items[1]
  const [anzahl, setAnzahl] = useState(3)
  const [mix, setMix] = useState<number[]>([0, 0, 0, 0, 0])
  const [bestaetigt, setBestaetigt] = useState(false)

  const vorschlagFuer = (n: number): number[] =>
    verteileAufStufen(n, vorschlag.anteile, {
      deckel: SEHR_LEICHT_DECKEL,
      vorhanden: vorhanden.length,
      vorhandenSehrLeicht: vorhanden.filter((v) => v.stufe === 1).length
    })

  // Beim Öffnen: Anzahl bis zur Richtzahl des Niveaus (mindestens 1, höchstens 6), Mix nach Vorschlag
  useEffect(() => {
    if (!ort) return
    const n = Math.max(1, Math.min(6, richtzahl - vorhanden.length))
    setAnzahl(n)
    setMix(vorschlagFuer(n))
    setBestaetigt(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aufgabeId])

  const summe = mix.reduce((a, b) => a + b, 0)
  const deckel = pruefeDeckel([
    ...vorhanden.map((v) => v.stufe),
    ...mix.flatMap((n, i) => Array.from({ length: n }, () => (i + 1) as VerstehensStufe))
  ])
  const ueberRichtzahl = vorhanden.length + summe > richtzahl
  const brauchtHinweis = Boolean(ort?.bezug?.fremd)
  const stufe = exam.meta.grade >= 11 ? 'sek2' : 'sek1'

  const start = (): void => {
    if (!ort?.bezug || !summe) return
    const { teilId, bezug } = ort
    const block: TaskBlock = ort.block
    const f = fassung
    onClose()
    void starteAuftrag({
      moduleId: 'klassenarbeit',
      docId,
      titel: defaultExamName(exam),
      art: `${summe} weitere Fragen ergänzen`,
      eingabe: exam,
      istOffen: () => arbeitOffen(docId),
      sperrt: false,
      schluessel: `block-${block.id}`,
      fehlerTitel: 'Die Fragen konnten nicht ergänzt werden',
      arbeit: async (e, k) => {
        k.melde('Die KI schreibt weitere Fragen im gleichen Format …')
        const antwort = await k.ai<unknown>(
          zusatzfragenAnfrage({
            aufgabe: block,
            bezug,
            mix,
            trueFalseErlaubt: trueFalseZugelassen(e.meta.stateId, stufe),
            fach: e.meta.subjectLabel,
            niveau: e.meta.cefrLevel,
            klasse: e.meta.grade
          })
        )
        return neueItemsAus(antwort)
      },
      abschluss: (items) => `${items.length} Fragen ergänzt – die Stufen stehen im Erwartungshorizont.`,
      ablegen: (items, e) =>
        legeArbeitAb(docId, e, (aktuell) => {
          const next = structuredClone(aktuell)
          const teil = next.parts.find((p) => p.id === teilId)
          if (!teil) return aktuell
          fuegeEin(bloeckeDerFassung(teil, f), block.id, items, bezug.text)
          return next
        })
    })
  }

  return (
    <Modal opened={Boolean(aufgabeId)} onClose={onClose} size="lg" title="Weitere Fragen im gleichen Format">
      {!ort?.bezug ? (
        <Text size="sm">
          Zu dieser Aufgabe gehört kein Hörtext mit Transkript und kein Lesetext. Das Transkript lässt sich im Reiter „Hörtexte" einlesen oder
          einfügen.
        </Text>
      ) : (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Bezug: {ort.bezug.art === 'audio' ? 'Transkript des Hörtextes' : 'Lesetext'} „{ort.bezug.titel || 'ohne Titel'}". Vorhanden: {vorhanden.length}{' '}
            {vorhanden.length === 1 ? 'Item' : 'Items'} (Format {formatDer(ort.block)}). Die KI nutzt nur den Text; im Unterricht läuft die Originalaufnahme.
          </Text>
          <Group align="flex-end" gap="sm">
            <ZahlFeld
              label="Zahl der neuen Fragen"
              min={1}
              max={12}
              w={170}
              value={anzahl}
              onChange={(v) => {
                const n = Math.max(1, Math.min(12, Number(v) || 1))
                setAnzahl(n)
                setMix(vorschlagFuer(n))
              }}
            />
            <Button variant="subtle" size="xs" onClick={() => setMix(vorschlagFuer(anzahl))}>
              Vorschlag: {vorschlag.label}
            </Button>
          </Group>
          <Group gap="xs" wrap="nowrap">
            {STUFEN_WERTE.map((s, i) => (
              <Tooltip key={s} label={STUFEN[s].merkmal} multiline w={280}>
                <ZahlFeld
                  label={`Stufe ${s}`}
                  description={STUFEN[s].name}
                  min={0}
                  max={12}
                  w={96}
                  value={mix[i]}
                  onChange={(v) => setMix((m) => m.map((x, k) => (k === i ? Math.max(0, Math.min(12, Number(v) || 0)) : x)))}
                />
              </Tooltip>
            ))}
          </Group>
          {deckel && (
            <Alert color="orange" variant="light" p="xs">
              <Text size="xs">{deckel}</Text>
            </Alert>
          )}
          {ueberRichtzahl && (
            <Text size="xs" c="orange">
              Zusammen {vorhanden.length + summe} Items – mehr als die Richtzahl des Niveaus ({richtzahl}). Die Items müssen während des Hörens lösbar bleiben.
            </Text>
          )}
          <Text size="xs" c="dimmed">
            Die Stufe steht nur im Erwartungshorizont, nie auf dem Blatt der Lernenden. Die App prüft sie anschließend an der Wortgleichheit mit dem Text.
          </Text>
          {brauchtHinweis && <Rechtshinweis bestaetigt={bestaetigt} onChange={setBestaetigt} />}
          <Group justify="flex-end">
            <Button leftSection={<IconPlaylistAdd size={16} />} disabled={!summe || (brauchtHinweis && !bestaetigt)} onClick={start}>
              {summe === 1 ? 'Eine Frage ergänzen' : `${summe} Fragen ergänzen`}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
