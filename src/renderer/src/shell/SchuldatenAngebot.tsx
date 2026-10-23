import { Button, Group, Notification, Text } from '@mantine/core'
import { IconSchool } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { ohneSchuldaten, schulVorbelegung } from '@shared/schulEinrichtung'
import { schuleFest } from '@shared/schulFest'
import { useAppSettings } from '../shared/settingsStore'
import { aufServer, serverIch } from '../shared/plattform'
import { ladeServerSchule, logoFingerabdruck, type ServerSchule } from '../shared/serverSchule'

/**
 * Schuldaten aus der Verwaltung übernehmen (09.10.2026).
 *
 * - Im Einrichtungsassistenten (erstes Anmelden auf dem Server) werden leere Felder still vorbelegt – sichtbar im
 *   Schritt „Schule" und dort änderbar (`useSchulVorbelegung`).
 * - Wer schon eingerichtet ist, aber keine Schuldaten hat, bekommt einmal das Angebot (`SchuldatenAngebot`).
 *
 * In beiden Fällen gilt: nur Leeres wird gefüllt (shared/schulEinrichtung.ts › schulVorbelegung), das Logo nur, wenn
 * noch keins hinterlegt ist. Eigene Angaben werden nie überschrieben.
 */
async function uebernehmen(daten: ServerSchule, zusatz: Partial<AppSettings> = {}): Promise<boolean> {
  const { settings, update, logoDataUrl, setLogo } = useAppSettings.getState()
  const patch = schulVorbelegung(settings, daten.schule)
  // Logo der Schule übernommen: merken, damit es künftigen Änderungen der Verwaltung folgt (23.10.2026)
  const logoNeu = Boolean(daten.logo && !logoDataUrl)
  const logoMarke: Partial<AppSettings> = logoNeu ? { logoVonSchule: logoFingerabdruck(daten.logo), logoEigen: false } : {}
  if (patch || Object.keys(zusatz).length || logoNeu) await update({ ...(patch ?? {}), ...zusatz, ...logoMarke })
  if (logoNeu) await setLogo(daten.logo)
  return Boolean(patch) || logoNeu
}

/**
 * Schullogo nachziehen (23.10.2026, Befund der Lehrkraft: „Das Schullogo des Einzelnutzers wird nicht aktualisiert,
 * wenn das Schullogo vom Admin geändert wird"). Bisher wurde es einmal kopiert. Jetzt folgt ein Logo, das aus der
 * Verwaltung stammt, jeder Änderung dort (auch dem Entfernen) – bis die Lehrkraft selbst ein Logo wählt (`logoEigen`).
 * Wer die Schuldaten vor dieser Fassung übernommen hat, gilt als „stammt von der Schule".
 */
export async function schulLogoAbgleich(neu = false): Promise<void> {
  if (!aufServer()) return
  const { settings, update, logoDataUrl, setLogo, loaded } = useAppSettings.getState()
  if (!loaded || settings.logoEigen) return
  const folgt = settings.logoVonSchule !== undefined || settings.schuldatenAngebot === 'uebernommen'
  if (!folgt) return
  const daten = await ladeServerSchule(neu)
  if (!daten) return
  const fp = logoFingerabdruck(daten.logo)
  if (fp === settings.logoVonSchule && (fp === '' ? !logoDataUrl : Boolean(logoDataUrl))) return
  if (daten.logo) await setLogo(daten.logo)
  else if (settings.logoVonSchule && logoDataUrl) await setLogo(null)
  await update({ logoVonSchule: fp })
}

/** Beim Start einmal nachziehen (Einrichtung.tsx – immer eingehängt) */
export function useSchulLogoAbgleich(): void {
  const geladen = useAppSettings((s) => s.loaded)
  useEffect(() => {
    if (geladen) void schulLogoAbgleich().catch(() => undefined)
  }, [geladen])
}

/** Assistent: einmal beim Öffnen leere Schulfelder aus der Verwaltung füllen. Liefert, ob etwas übernommen wurde. */
export function useSchulVorbelegung(offen: boolean): boolean {
  const geladen = useAppSettings((s) => s.loaded)
  const [vorbelegt, setVorbelegt] = useState(false)
  const [erledigt, setErledigt] = useState(false)
  useEffect(() => {
    if (!offen || !geladen || erledigt || !aufServer()) return
    setErledigt(true)
    void ladeServerSchule().then(async (d) => {
      if (!d?.schule) return
      if (await uebernehmen(d, { schuldatenAngebot: 'uebernommen' })) setVorbelegt(true)
    })
  }, [offen, geladen, erledigt])
  return vorbelegt
}

/** Einmaliges Angebot für eingerichtete Lehrkräfte ohne Schuldaten */
export function SchuldatenAngebot(): React.JSX.Element | null {
  const settings = useAppSettings((s) => s.settings)
  const geladen = useAppSettings((s) => s.loaded)
  const update = useAppSettings((s) => s.update)
  const [daten, setDaten] = useState<ServerSchule | null>(null)
  const [weg, setWeg] = useState(false)
  // IServ-Konten haben die Schule ohnehin fest (09.10.2026, shared/schulFest.ts) – kein Angebot
  const infrage =
    aufServer() && geladen && Boolean(serverIch()?.eingerichtet) && !schuleFest(serverIch()) && !settings.schuldatenAngebot && ohneSchuldaten(settings)
  useEffect(() => {
    if (infrage) void ladeServerSchule().then(setDaten)
  }, [infrage])
  if (!infrage || weg || !daten?.schule || !schulVorbelegung(settings, daten.schule)) return null
  const s = daten.schule
  return (
    <Notification
      icon={<IconSchool size={18} />}
      title="Schuldaten aus der Verwaltung übernehmen?"
      withCloseButton={false}
      style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 300, maxWidth: 'min(420px, calc(100vw - 32px))' }}
      data-schuldaten-angebot
    >
      <Text size="sm">
        Für diesen Server ist „{s.name}“ eingerichtet{s.ort ? ` (${s.ort})` : ''}. Übernommen werden Name, Bundesland, Schulform, Anschrift für den Briefkopf
        {daten.logo ? ' und das Logo' : ''} – nur, wo noch nichts eingetragen ist. Alles bleibt in den Einstellungen änderbar.
      </Text>
      <Group gap="xs" mt="sm" justify="flex-end">
        <Button
          size="xs"
          variant="subtle"
          onClick={() => {
            setWeg(true)
            void update({ schuldatenAngebot: 'abgelehnt' })
          }}
        >
          Nein, danke
        </Button>
        <Button
          size="xs"
          onClick={() => {
            setWeg(true)
            void uebernehmen(daten, { schuldatenAngebot: 'uebernommen' })
          }}
        >
          Übernehmen
        </Button>
      </Group>
    </Notification>
  )
}
