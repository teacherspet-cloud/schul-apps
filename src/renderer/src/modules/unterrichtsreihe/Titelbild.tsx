/**
 * Titelbild einer Unterrichtsreihe (25.10.2026, Wunsch der Lehrkraft): Lernende sehen es als Kachel im Fachordner und
 * oben in der Reihe. Hier im Kopf der Reihe: Vorschau, „Mit KI erstellen" (Bild-KI im Hintergrund, Ergebnis landet über
 * `reiheAendernUeberall` in der offenen oder gespeicherten Reihe), „Bild hochladen" und „Entfernen". Bilder werden auf
 * 640 px (JPEG) verkleinert, damit die Reihe klein bleibt.
 */
import { ActionIcon, FileButton, Group, Menu, Paper, Text, Tooltip } from '@mantine/core'
import { IconPhoto, IconRoute, IconSparkles, IconTrash, IconUpload } from '@tabler/icons-react'
import { useState } from 'react'
import type { Reihe } from '@shared/reihe'
import { starteAuftrag } from '../../shared/auftraege'
import { normalizeImage, notifyError, notifySuccess } from '../../shared/util'
import { reiheAendernUeberall, reiheOffen } from './platzhalterAuftrag'

/** Längste Seite des gespeicherten Titelbilds */
const GROESSE = 640

const prompt = (e: { titel: string; fach: string; grade: number; leitfrage?: string; oberthema?: string }): string =>
  [
    'Flat, friendly illustration for the title card of a teaching unit. No text, no letters, no words, no numbers.',
    `Subject: ${e.fach}, grade ${e.grade}. Topic: "${e.titel}".`,
    e.oberthema ? `Wider theme: ${e.oberthema}.` : '',
    e.leitfrage ? `Guiding question: ${e.leitfrage}` : '',
    'Clear shapes, warm colours, landscape format, suitable for school children.'
  ]
    .filter(Boolean)
    .join(' ')

/** Titelbild im Hintergrund zeichnen lassen – die Reihe muss gespeichert sein (Kennung) */
export function titelbildErzeugen(r: Reihe): void {
  if (!r.id) throw new Error('Bitte die Reihe zuerst speichern.')
  const eingabe = { id: r.id, titel: r.titel || 'Unterrichtsreihe', fach: r.fachLabel, grade: r.grade, leitfrage: r.leitfrage, oberthema: r.oberthema }
  void starteAuftrag({
    moduleId: 'unterrichtsreihe',
    docId: r.id,
    titel: eingabe.titel,
    art: 'Titelbild zeichnen',
    eingabe,
    istOffen: () => reiheOffen(eingabe.id),
    sperrt: false,
    schluessel: `reihe-titelbild:${eingabe.id}`,
    fehlerTitel: 'Das Titelbild konnte nicht erzeugt werden',
    arbeit: async (e, k) => {
      k.melde('Die Bild-KI zeichnet das Titelbild …')
      const roh = await k.bild(prompt(e))
      return normalizeImage(roh, GROESSE, 'jpeg')
    },
    ablegen: async (bild, e) => {
      await reiheAendernUeberall(e.id, { titelbild: { dataUrl: bild, quelle: 'ki' } })
    },
    abschluss: () => 'Titelbild fertig – in der Reihe übernommen'
  })
  notifySuccess('Die Bild-KI zeichnet das Titelbild im Hintergrund – es erscheint gleich im Kopf der Reihe.')
}

export function TitelbildFeld({
  reihe,
  setze,
  speichernVorher
}: {
  reihe: Reihe
  setze: (teil: Partial<Reihe>) => void
  /** Die Reihe muss für den Hintergrund-Auftrag gespeichert sein (liefert den gespeicherten Stand) */
  speichernVorher: () => Promise<Reihe | null>
}): React.JSX.Element {
  const [laeuft, setLaeuft] = useState(false)
  const bild = reihe.titelbild?.dataUrl
  const hochladen = async (datei: File | null): Promise<void> => {
    if (!datei) return
    setLaeuft(true)
    try {
      const roh = await new Promise<string>((ok, nein) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.onerror = () => nein(new Error('Die Datei ließ sich nicht lesen.'))
        r.readAsDataURL(datei)
      })
      setze({ titelbild: { dataUrl: await normalizeImage(roh, GROESSE, 'jpeg'), quelle: 'upload' } })
    } catch (e) {
      notifyError(e, 'Bild nicht übernommen')
    } finally {
      setLaeuft(false)
    }
  }
  const mitKi = async (): Promise<void> => {
    setLaeuft(true)
    try {
      const gespeichert = await speichernVorher()
      if (!gespeichert?.id) throw new Error('Die Reihe ließ sich nicht speichern.')
      titelbildErzeugen(gespeichert)
    } catch (e) {
      notifyError(e, 'Kein Titelbild')
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <Group gap="sm" wrap="nowrap" align="center" data-reihe-titelbild-feld>
      <Paper
        withBorder
        radius="md"
        style={{
          width: 120,
          height: 76,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--mantine-color-default-hover)',
          flexShrink: 0
        }}
      >
        {bild ? (
          <img src={bild} alt="Titelbild der Reihe" style={{ width: '100%', height: '100%', objectFit: 'cover' }} data-reihe-titelbild-vorschau />
        ) : (
          <IconRoute size={28} style={{ opacity: 0.4 }} />
        )}
      </Paper>
      <div style={{ minWidth: 0 }}>
        <Text size="sm" fw={500}>
          Titelbild
        </Text>
        <Text size="xs" c="dimmed">
          {bild ? (reihe.titelbild?.quelle === 'ki' ? 'von der Bild-KI' : 'hochgeladen') : 'Lernende sehen sonst Fachfarbe und Symbol'}
        </Text>
      </div>
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <Tooltip label="Titelbild ändern">
            <ActionIcon variant="light" loading={laeuft} aria-label="Titelbild ändern" data-reihe-titelbild-menue>
              <IconPhoto size={16} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconSparkles size={14} />} onClick={() => void mitKi()} data-reihe-titelbild-ki>
            Mit KI erstellen
          </Menu.Item>
          <FileButton onChange={(f) => void hochladen(f)} accept="image/png,image/jpeg,image/webp">
            {(props) => (
              <Menu.Item {...props} leftSection={<IconUpload size={14} />} closeMenuOnClick={false} data-reihe-titelbild-upload>
                Bild hochladen …
              </Menu.Item>
            )}
          </FileButton>
          {bild && (
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setze({ titelbild: undefined })} data-reihe-titelbild-weg>
              Entfernen
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
