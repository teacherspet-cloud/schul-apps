import { ActionIcon, Badge, Button, Group, Modal, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core'
import { IconFileText, IconHeartHandshake, IconMessageCheck, IconPhoto, IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import DropZone from '../../../shared/components/DropZone'
import type { HochladeInhalt } from '../../../shared/datenschutz'
import { MATERIAL_ACCEPT } from '../../../shared/files/extractContent'
import { notifyError } from '../../../shared/util'
import { abgabenLesen, aufgabentextAbtrennen, neueAbgabe, trennSchluessel, warteAufAuftrag } from '../abgabeAnlegen'
import { ladeGedaechtnis, speichereGedaechtnis } from '../ablagen'
import { rueckmeldungenErzeugen } from '../auftrag'
import { ausgleichKurz, gemerkterAusgleich, hatAusgleich, merkeAusgleich, type AusgleichGedaechtnis } from '../nachteilsausgleich'
import type { Abgabe, Nachteilsausgleich, Rueckmeldung } from '../model/types'
import { useRueckmeldung } from '../store'
import AusgleichFenster from './AusgleichFenster'

/**
 * „Weitere Abgabe" in „Bögen & Export" (29.09.2026 nachts, Wunsch der Lehrkraft: „oben ein Knopf,
 * der ein Fenster öffnet, in dem man eine weitere Abgabe einfügen und auswerten lassen kann – sie
 * soll dann im Hauptfenster erscheinen wie die anderen auch").
 *
 * Derselbe Weg wie in „Einrichten" (abgabeAnlegen.ts): Datei hineinziehen (Foto, Scan, PDF, Word,
 * Text – mit Datenschutzprüfung) oder Text eintippen, Name nur auf diesem Rechner, Nachteilsausgleich
 * optional. „Auswerten" legt die Abgabe an, trennt bei Dateien den Aufgabentext ab (Abgleich, bei
 * Verdacht die KI – dann wird darauf gewartet) und schreibt den Bogen NUR für diese Abgabe.
 */
export default function WeitereAbgabe({
  offen,
  schliessen,
  angelegt
}: {
  offen: boolean
  schliessen: () => void
  /** Die neue Abgabe steht im Dokument (die Liste klappt sie auf und zeigt den Lader) */
  angelegt: (id: string) => void
}): React.JSX.Element {
  const { dok: r, update, docId } = useRueckmeldung()
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [datei, setDatei] = useState<HochladeInhalt | null>(null)
  const [lese, setLese] = useState<string | null>(null)
  const [ausgleich, setAusgleich] = useState<Nachteilsausgleich | undefined>(undefined)
  const [ausgleichOffen, setAusgleichOffen] = useState(false)
  const [gedaechtnis, setGedaechtnis] = useState<AusgleichGedaechtnis | null>(null)
  useEffect(() => {
    if (!offen) return
    setName('')
    setText('')
    setDatei(null)
    setLese(null)
    setAusgleich(undefined)
    void ladeGedaechtnis().then(setGedaechtnis)
  }, [offen])

  const lesen = async (files: File[]): Promise<void> => {
    try {
      const geprueft = await abgabenLesen(files.slice(0, 1), setLese)
      if (!geprueft?.length) return
      const g = geprueft[0]
      setDatei(g)
      setText(g.text.trim())
    } catch (e) {
      notifyError(e, 'Die Datei konnte nicht gelesen werden')
    } finally {
      setLese(null)
    }
  }

  const bilder = !text.trim() && datei?.pageImages?.length ? datei.pageImages.length : 0
  const bereit = Boolean(r) && !lese && (Boolean(text.trim()) || bilder > 0)
  const gemerkt = !hatAusgleich(ausgleich) ? gemerkterAusgleich(gedaechtnis, name) : null
  // Entwurf der Abgabe für das Fenster „Nachteilsausgleich"
  const entwurf: Abgabe = { id: 'neu', kuerzel: 'neu', name, dateiname: datei?.fileName ?? 'getippt', text, bilder: [], ...(ausgleich ? { ausgleich } : {}) }

  const auswerten = (): void => {
    const d = useRueckmeldung.getState().dok
    if (!d || !bereit) return
    const ausDatei = Boolean(datei && text.trim())
    let id = ''
    update((x) => {
      const neu = neueAbgabe(
        x.abgaben,
        { fileName: datei?.fileName ?? 'getippt', text: text.trim(), pageImages: text.trim() ? [] : (datei?.pageImages ?? []), pseudonyme: datei?.pseudonyme },
        { name, ausgleich }
      )
      x.abgaben.push(neu)
      id = neu.id
    })
    angelegt(id)
    schliessen()
    void (async () => {
      // Aufgabenstellung und Material aus Word/PDF-Abgaben abtrennen – trennt die KI noch, wird darauf gewartet
      if (ausDatei && aufgabentextAbtrennen(update, docId, [id])) await warteAufAuftrag(docId, trennSchluessel(docId))
      const aktuell = useRueckmeldung.getState().dok
      const neu = aktuell?.abgaben.find((a) => a.id === id)
      // Nur diese Abgabe auswerten – die übrigen bleiben, wie sie sind
      if (aktuell && neu && !neu.bogen) rueckmeldungenErzeugen({ ...aktuell, abgaben: [neu] } as Rueckmeldung, docId)
    })().catch(notifyError)
  }

  return (
    <>
      <Modal opened={offen && !ausgleichOffen} onClose={schliessen} title="Weitere Abgabe auswerten" size="lg" centered data-rm-weitere>
        <Stack gap="sm">
          <TextInput
            label="Name"
            description="Bleibt auf diesem Rechner – die KI sieht nur das Kürzel."
            placeholder="z. B. Vorname Nachname"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-rm-weitere-name
          />
          {gemerkt && (
            <Group gap={6}>
              <Text size="xs" c="grape">
                Für „{name.trim()}" ist ein Nachteilsausgleich gemerkt.
              </Text>
              <Button size="compact-xs" variant="light" color="grape" onClick={() => setAusgleich(gemerkt)} data-rm-weitere-ausgleich-uebernehmen>
                Übernehmen
              </Button>
            </Group>
          )}
          {datei ? (
            <Group gap="xs" wrap="nowrap" data-rm-weitere-datei>
              {bilder ? <IconPhoto size={16} /> : <IconFileText size={16} />}
              <Text size="sm" style={{ flex: 1 }} truncate>
                {datei.fileName}
                {bilder ? ` · ${bilder} Seite${bilder > 1 ? 'n' : ''} – der Text wird beim Auswerten übertragen` : ''}
              </Text>
              <Tooltip label="Datei entfernen">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    setDatei(null)
                    setText('')
                  }}
                  aria-label="Datei entfernen"
                >
                  <IconX size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ) : (
            <DropZone
              onFiles={(f) => void lesen(f)}
              accept={MATERIAL_ACCEPT}
              multiple={false}
              title={lese ?? 'Abgabe hierher ziehen'}
              hint="Foto, Scan, PDF, Word oder Textdatei. Namen auf Fotos vorher schwärzen."
              loading={Boolean(lese)}
              minHeight={70}
            />
          )}
          {!bilder && (
            <Textarea
              label={datei ? 'Text der Abgabe (aus der Datei, änderbar)' : 'Oder den Text der Abgabe eintippen'}
              autosize
              minRows={4}
              maxRows={12}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              data-rm-weitere-text
            />
          )}
          <Group gap="xs">
            <Button
              size="xs"
              variant={hatAusgleich(ausgleich) ? 'light' : 'subtle'}
              color={hatAusgleich(ausgleich) ? 'grape' : 'gray'}
              leftSection={<IconHeartHandshake size={14} />}
              onClick={() => setAusgleichOffen(true)}
              data-rm-weitere-ausgleich
            >
              {hatAusgleich(ausgleich) ? 'Nachteilsausgleich ändern' : 'Nachteilsausgleich (optional)'}
            </Button>
            {hatAusgleich(ausgleich) && (
              <Badge size="sm" color="grape" variant="light">
                {ausgleichKurz(ausgleich)}
              </Badge>
            )}
          </Group>
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button variant="default" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button leftSection={<IconMessageCheck size={16} />} disabled={!bereit} onClick={auswerten} data-rm-weitere-auswerten>
              Auswerten
            </Button>
          </Group>
        </Stack>
      </Modal>
      {r && (
        <AusgleichFenster
          abgabe={entwurf}
          meta={r.meta}
          offen={offen && ausgleichOffen}
          schliessen={() => setAusgleichOffen(false)}
          speichern={(a, merken) => {
            setAusgleich(a)
            if (merken && name.trim()) {
              const neu = merkeAusgleich(gedaechtnis, name, a ?? null)
              setGedaechtnis(neu)
              void speichereGedaechtnis(neu).catch(notifyError)
            }
            setAusgleichOffen(false)
          }}
        />
      )}
    </>
  )
}
