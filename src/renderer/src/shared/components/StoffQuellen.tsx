import { schulbuchAusSeiten } from '../schulbuch/SchulbuchDialog'
import { ActionIcon, Checkbox, Group, Stack, Text } from '@mantine/core'
import { pruefeHochladen } from '../datenschutz'
import { IconWorld, IconMovie, IconFileText, IconPhoto, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import DropZone from './DropZone'
import UrlQuelleEingabe from './UrlQuelleEingabe'
import { extractContent, MATERIAL_ACCEPT } from '../files/extractContent'
import { stoffQuelleAus, type StoffQuelle } from '../files/stoffQuelle'
import { notifyError } from '../util'

interface Props {
  quellen: StoffQuelle[]
  /** Neu gelesene Dateien anhängen */
  onHinzu: (neu: StoffQuelle[]) => void
  onAktiv: (id: string, aktiv: boolean) => void
  onEntfernen: (id: string) => void
  title: string
  hint: string
  /** Satz unter der Liste: was die KI mit den Unterlagen anfängt */
  erklaerung: string
}

/**
 * Unterlagen aus dem Unterricht hineinziehen und als Liste zeigen – mit Schalter, ob sie der
 * KI mitgegeben werden, und Entfernen.
 *
 * Bis 25.09.2026 stand das nur in der Lernzielkontrolle. Die Klassenarbeit bekam dieselbe
 * Fläche; statt sie zu kopieren, nutzen beide Programme diese Komponente.
 *
 * Bei einem Foto bleibt der Text leer – dort trägt allein das Bild die Information, und die
 * KI bekommt es als Bild. Bei einem PDF mit Textebene wird beides mitgegeben.
 */
export default function StoffQuellen({ quellen, onHinzu, onAktiv, onEntfernen, title, hint, erklaerung }: Props): React.JSX.Element {
  const [lese, setLese] = useState<string | null>(null)

  const dateienLesen = async (files: File[]): Promise<void> => {
    setLese('wird gelesen …')
    try {
      const neu: StoffQuelle[] = []
      for (const f of files) {
        setLese(`${f.name} wird gelesen …`)
        const c = await extractContent(f, (msg) => setLese(`${f.name}: ${msg}`))
        neu.push(stoffQuelleAus(c, `q${Date.now()}-${neu.length}`))
      }
      setLese(null)
      // Datenschutz (Großprogramm 0.4): Hinweis und Namen ersetzen, bevor etwas zur KI geht
      const geprueft = await pruefeHochladen(neu.map((q) => ({ ...q, pageImages: q.bilder })))
      if (!geprueft) return
      // Schulbuchseiten (Phase 6b): nach der Namensprüfung erkennen – verweisen/übernehmen statt Seitenbild
      const fertig: StoffQuelle[] = []
      for (const { pageImages: _b, ...q } of geprueft) {
        const sb = q.bilder.length ? await schulbuchAusSeiten(q.bilder, '', (t) => setLese(`${q.fileName}: ${t}`)) : null
        fertig.push(sb ? { ...q, text: sb.text, bilder: [] } : q)
      }
      onHinzu(fertig)
    } catch (e) {
      notifyError(e, 'Die Datei konnte nicht gelesen werden')
    } finally {
      setLese(null)
    }
  }

  return (
    <>
      <DropZone onFiles={(f) => void dateienLesen(f)} accept={MATERIAL_ACCEPT} title={lese ?? title} hint={hint} loading={Boolean(lese)} minHeight={70} />
      {/* Internetadresse als Unterlage – Webseite oder Video (26.09.2026) */}
      <UrlQuelleEingabe onInhalt={(c) => onHinzu([stoffQuelleAus(c, `q${Date.now()}-url`)])} />
      {quellen.length > 0 && (
        <Stack gap={4}>
          {quellen.map((q) => (
            <Group key={q.id} gap="xs" wrap="nowrap">
              <Checkbox size="xs" aria-label={`${q.fileName} verwenden`} checked={q.aktiv} onChange={(e) => onAktiv(q.id, e.currentTarget.checked)} />
              {q.kind === 'image' ? (
                <IconPhoto size={15} />
              ) : q.kind === 'video' ? (
                <IconMovie size={15} />
              ) : q.kind === 'web' ? (
                <IconWorld size={15} />
              ) : (
                <IconFileText size={15} />
              )}
              <Text size="xs" style={{ flex: 1 }} truncate>
                {q.fileName}
              </Text>
              <Text size="xs" c="dimmed">
                {q.text.trim() ? `${Math.round(q.text.length / 100) / 10}k Zeichen` : 'nur Bild'}
                {q.bilder.length ? ` · ${q.bilder.length} Seite${q.bilder.length > 1 ? 'n' : ''}` : ''}
              </Text>
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label={`${q.fileName} entfernen`} onClick={() => onEntfernen(q.id)}>
                <IconX size={14} />
              </ActionIcon>
            </Group>
          ))}
          <Text size="xs" c="dimmed">
            {erklaerung}
          </Text>
        </Stack>
      )}
    </>
  )
}
