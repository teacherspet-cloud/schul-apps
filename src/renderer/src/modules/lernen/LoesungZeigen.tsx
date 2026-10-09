/**
 * „Lösung zeigen" (09.10.2026, Wunsch der Lehrkraft): überall, wo Lernende eine Antwort TIPPEN oder LEGEN müssen
 * (Vokabeltrainer: Schreiben, Diktat, Lücke, „Lege das Wort"; Grammatik: Lücke, Umformen, Fehler verbessern,
 * Übersetzen, Tabelle; Spiele mit Eingabe). Wer es nicht weiß, sieht die richtige Antwort und macht mit „Weiter"
 * weiter – das zählt wie „nicht gewusst" (Vokabeln: wie eine falsche Antwort im Kasten bzw. wackelig im Spiel;
 * Grammatik: falsch). Ein echter Knopf: mit Tab erreichbar, Enter/Leertaste lösen aus; in Formularen sendet er nicht ab.
 */
import { Button } from '@mantine/core'
import { IconEye } from '@tabler/icons-react'

export const LOESUNG_ZEIGEN_HINWEIS = 'Weißt du es nicht? Dann sieh dir die Lösung an – das zählt als „noch nicht gewusst“ und kommt bald wieder.'

export default function LoesungZeigen({ zeigen, gesperrt = false }: { zeigen: () => void; gesperrt?: boolean }): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="subtle"
      color="gray"
      size="sm"
      radius="xl"
      leftSection={<IconEye size={16} />}
      disabled={gesperrt}
      onClick={(e) => {
        // Kein Absenden des umgebenden Formulars, kein „Weiter" über die Eingabetaste im selben Zug
        e.preventDefault()
        e.stopPropagation()
        if (!gesperrt) zeigen()
      }}
      title={LOESUNG_ZEIGEN_HINWEIS}
      data-loesung-zeigen
    >
      Lösung zeigen
    </Button>
  )
}
