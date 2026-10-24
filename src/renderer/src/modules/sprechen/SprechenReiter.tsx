/**
 * Reiter „Sprechen" (24.10.2026, abgestimmt mit der Lehrkraft) in „Meine Klassen" und auf der Kursseite: immer bei
 * Englisch, Französisch und Spanisch. Oben die Partnerarbeit im Unterricht (ohne KI), darunter das KI-Sprechtraining –
 * nur, wenn die Gesprächs-KI eingerichtet ist (bisheriger Reiter „Sprechprüfungstraining").
 */
import { Divider, Stack, Text } from '@mantine/core'
import { PartnerarbeitLehrkraft } from '../partnerarbeit/PartnerarbeitLehrkraft'
import { SprechLehrkraft, useSprechVerfuegbar } from './SprechLehrkraft'

export const istSprechSprache = (sprache: string | null | undefined): boolean => ['en', 'fr', 'es'].includes(sprache ?? '')

export function SprechenReiter({ vokId, lernende }: { vokId: string; lernende?: { benutzer: string; name: string }[] }): React.JSX.Element {
  const sprechDa = useSprechVerfuegbar()
  return (
    <Stack gap="lg" data-sprechen-reiter>
      <PartnerarbeitLehrkraft vokId={vokId} />
      {sprechDa ? (
        <>
          <Divider label="Sprechtraining mit der Gesprächs-KI" labelPosition="left" />
          <SprechLehrkraft vokId={vokId} lernende={lernende} />
        </>
      ) : (
        <Text size="xs" c="dimmed" data-sprechen-ohne-ki>
          Das Sprechtraining mit einer Gesprächs-KI erscheint hier, sobald die Gesprächs-KI eingerichtet ist (Einstellungen › Bilder und Hörtexte).
        </Text>
      )}
    </Stack>
  )
}
