/**
 * „Ablegen ▾" je Material in „Meine Klassen" (06.10.2026): PDF, Word, Drucken, In IServ ablegen (Ordner aus der
 * Ablagestruktur der Verwaltung). IServ nur, wo das IServ-Passwort liegt (Exe „Schul-Apps Online" bzw. Exe am PC,
 * jeweils mit verbundenem IServ) – sonst ausgegraut mit Hinweis.
 */
import { ActionIcon, Button, Menu, Tooltip } from '@mantine/core'
import { IconCloudUpload, IconDownload, IconFileTypePdf, IconFileWord, IconPrinter } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { iservAnzeige } from '@shared/iserv'
import { orteDiesesGeraets } from '../../shared/export/ausgabeOrt'
import { notifyError, notifySuccess } from '../../shared/util'
import { ablegen, iservPfadAus, type AblageArt, type AblageQuelle } from './klassenAblage'

let iservStand: Promise<boolean> | null = null
/** Ist IServ auf diesem Gerät verbunden und erreichbar? (einmal je Sitzung gefragt) */
function useIservMoeglich(): boolean {
  const [ja, setJa] = useState(false)
  useEffect(() => {
    iservStand ??= window.api.iserv
      .status()
      .then((s) => s.verbunden && orteDiesesGeraets(true).includes('iserv'))
      .catch(() => false)
    void iservStand.then(setJa)
  }, [])
  return ja
}

export function AblegenKnopf({
  quelle,
  klasse,
  fach,
  muster,
  programm,
  klein
}: {
  quelle: AblageQuelle
  klasse: string
  fach: string
  muster: string
  programm: string
  klein?: boolean
}): React.JSX.Element {
  const iserv = useIservMoeglich()
  const [laeuft, setLaeuft] = useState<AblageArt | null>(null)
  const ordner = iservAnzeige(iservPfadAus(muster, klasse, fach))
  const los = async (art: AblageArt): Promise<void> => {
    setLaeuft(art)
    try {
      const wo = await ablegen(art, quelle, { klasse, fach, muster, programm })
      if (art === 'iserv' && wo) notifySuccess(`In IServ abgelegt: ${ordner}`)
      else if (wo) notifySuccess('Gespeichert.')
    } catch (e) {
      notifyError(e, art === 'iserv' ? 'Nicht in IServ abgelegt' : 'Nicht gespeichert')
    } finally {
      setLaeuft(null)
    }
  }
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        {klein ? (
          <Tooltip label="Ablegen: PDF, Word, Drucken, IServ">
            <ActionIcon variant="light" loading={Boolean(laeuft)} aria-label="Ablegen" data-ablegen>
              <IconDownload size={16} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Button size="compact-xs" variant="light" leftSection={<IconDownload size={13} />} loading={Boolean(laeuft)} data-ablegen>
            Ablegen
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown data-ablegen-menue>
        <Menu.Item leftSection={<IconFileTypePdf size={15} />} onClick={() => void los('pdf')} data-ablegen-art="pdf">
          Als PDF speichern
        </Menu.Item>
        <Tooltip label="Word gibt es, wo das Original vorliegt (Arbeitsblatt in der Bibliothek, Vokabeltest)" disabled={Boolean(quelle.word)} position="left">
          <div>
            <Menu.Item leftSection={<IconFileWord size={15} />} disabled={!quelle.word} onClick={() => void los('word')} data-ablegen-art="word">
              Als Word speichern
            </Menu.Item>
          </div>
        </Tooltip>
        <Menu.Item leftSection={<IconPrinter size={15} />} onClick={() => void los('drucken')} data-ablegen-art="drucken">
          Drucken
        </Menu.Item>
        <Menu.Divider />
        <Tooltip
          label={
            iserv ? ordner : 'IServ geht in der Exe „Schul-Apps Online“ mit verbundenem IServ (Einstellungen › Dienste). Im Browser bitte als PDF speichern.'
          }
          position="left"
          multiline
          w={260}
        >
          <div>
            <Menu.Item leftSection={<IconCloudUpload size={15} />} disabled={!iserv} onClick={() => void los('iserv')} data-ablegen-art="iserv">
              In IServ ablegen
            </Menu.Item>
          </div>
        </Tooltip>
      </Menu.Dropdown>
    </Menu>
  )
}
