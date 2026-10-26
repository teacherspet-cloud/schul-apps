/**
 * „Lösung zeigen" (09.10.2026, Wunsch der Lehrkraft): überall, wo Lernende eine Antwort TIPPEN oder LEGEN müssen
 * (Vokabeltrainer: Schreiben, Diktat, Lücke, „Lege das Wort"; Grammatik: Lücke, Umformen, Fehler verbessern,
 * Übersetzen, Tabelle; Spiele mit Eingabe). Wer es nicht weiß, sieht die richtige Antwort und macht mit „Weiter"
 * weiter – das zählt wie „nicht gewusst" (Vokabeln: wie eine falsche Antwort im Kasten bzw. wackelig im Spiel;
 * Grammatik: falsch). Ein echter Knopf: mit Tab erreichbar, Enter/Leertaste lösen aus; in Formularen sendet er nicht ab.
 *
 * Steht die Antwort schon da (26.10.2026, Befund der Lehrkraft, 10b: „quota" vollständig gelegt, dann „Lösung zeigen"
 * gedrückt – rot, „Lösung: quota", im Kasten als Fehler gezählt, für das Kind sah es aus, als wäre „quota" falsch
 * gewertet), wird sie GEPRÜFT statt verworfen: `antwortDa` + `pruefen`. Eine vorhandene Antwort zu prüfen ist für die
 * Lernenden nie schlechter als aufzugeben – richtig zählt richtig, falsch zeigt ebenfalls die Lösung. Gilt in allen
 * Trainern und Spielen mit einer Eingabe (Vokabeln, Grammatik, Hör- und Bildspiele).
 */
import { Button } from '@mantine/core'
import { IconEye } from '@tabler/icons-react'

export const LOESUNG_ZEIGEN_HINWEIS = 'Weißt du es nicht? Dann sieh dir die Lösung an – das zählt als „noch nicht gewusst“ und kommt bald wieder.'
export const ANTWORT_PRUEFEN_HINWEIS = 'Deine Antwort steht schon da – sie wird geprüft, die Lösung siehst du gleich.'

export default function LoesungZeigen({
  zeigen,
  gesperrt = false,
  antwortDa = false,
  pruefen
}: {
  zeigen: () => void
  gesperrt?: boolean
  /**
   * Eine Antwort ist schon eingetragen bzw. vollständig gelegt – dann prüft der Knopf sie (`pruefen`). Als Funktion,
   * wenn der Aufrufer beim Tippen nicht neu zeichnet (Grammatik-Trainer): dann wird beim Klick nachgefragt.
   */
  antwortDa?: boolean | (() => boolean)
  pruefen?: () => void
}): React.JSX.Element {
  const da = (): boolean => (typeof antwortDa === 'function' ? antwortDa() : antwortDa)
  const prueft = da() && Boolean(pruefen)
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
        if (gesperrt) return
        if (pruefen && da()) pruefen()
        else zeigen()
      }}
      title={prueft ? ANTWORT_PRUEFEN_HINWEIS : LOESUNG_ZEIGEN_HINWEIS}
      data-loesung-zeigen={prueft ? 'prueft' : 'zeigt'}
    >
      Lösung zeigen
    </Button>
  )
}
