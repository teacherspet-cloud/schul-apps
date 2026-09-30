import { Button, Group, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { useState } from 'react'
import { diakritikonSetzen, EINGABE_HINWEIS, GRIECHISCHE_DIAKRITIKA, UMWANDLUNG, ZEICHEN } from '../sonderzeichen'
import { schriftFamilie } from '../sprachSchrift'

/**
 * Leiste mit den Sonderzeichen einer Sprache über einer Eingabetabelle (30.09.2026).
 *
 * Ein Klick setzt das Zeichen in das Feld, in dem die Schreibmarke zuletzt stand – über
 * `document.execCommand('insertText')`: Das löst dieselben Eingabeereignisse aus wie Tippen, React
 * übernimmt den Wert also wie eine Tastatureingabe (auch Strg+Z im Feld funktioniert). Die Knöpfe
 * nehmen beim Drücken den Fokus nicht weg (preventDefault auf mousedown).
 *
 * „Zeichen setzen" (Altgriechisch: Spiritus/Akzente, Arabisch: Vokalzeichen, Russisch: Betonung)
 * verbindet das Zeichen mit dem Buchstaben VOR der Schreibmarke zu einem vorkomponierten Zeichen.
 */
export default function SonderzeichenLeiste({ sprache }: { sprache: string | undefined }): React.JSX.Element | null {
  const [offen, setOffen] = useState(false)
  const gruppen = ZEICHEN[sprache ?? '']
  if (!gruppen?.length) return null
  const umwandlung = UMWANDLUNG[sprache ?? '']
  const hinweis = EINGABE_HINWEIS[sprache ?? '']
  const schrift = schriftFamilie(sprache)

  return (
    <div className="sonderzeichen-leiste" data-sonderzeichen={sprache}>
      <Group gap="xs" wrap="nowrap">
        <Button size="compact-xs" variant="subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => setOffen((o) => !o)} aria-expanded={offen}>
          {offen ? 'Sonderzeichen ausblenden' : 'Sonderzeichen …'}
        </Button>
        {umwandlung && (
          <Tooltip label="Wandelt den Text im zuletzt bearbeiteten Feld um" withArrow>
            <Button size="compact-xs" variant="light" onMouseDown={(e) => e.preventDefault()} onClick={() => feldUmwandeln(umwandlung.umwandeln)}>
              {umwandlung.titel}
            </Button>
          </Tooltip>
        )}
      </Group>
      {offen && (
        <div style={{ marginTop: 4 }}>
          {gruppen.map((g) => (
            <Group key={g.titel} gap={2} mb={2} wrap="wrap" align="center">
              <Text size="xs" c="dimmed" w={90}>
                {g.titel}
              </Text>
              {g.zeichen.map((z) => (
                <UnstyledButton
                  key={z}
                  className="sonderzeichen-knopf"
                  aria-label={g.art === 'setzen' ? `${zeichenName(z)} setzen` : `${z} einfügen`}
                  title={g.art === 'setzen' ? zeichenName(z) : z}
                  style={{ fontFamily: schrift, minWidth: 24, padding: '1px 5px', border: '1px solid var(--mantine-color-gray-4)', borderRadius: 4, textAlign: 'center' }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (g.art === 'setzen' ? zeichenSetzen(z) : einfuegen(z))}
                >
                  {g.art === 'setzen' ? `◌${z}` : z}
                </UnstyledButton>
              ))}
            </Group>
          ))}
          {hinweis && (
            <Text size="xs" c="dimmed" mt={2}>
              {hinweis}
            </Text>
          )}
        </div>
      )}
    </div>
  )
}

const zeichenName = (kombi: string): string => GRIECHISCHE_DIAKRITIKA.find((d) => d.kombi === kombi)?.name ?? (kombi === '́' ? 'Betonung' : 'Zeichen')

type Feld = HTMLInputElement | HTMLTextAreaElement

const aktivesFeld = (): Feld | HTMLElement | null => {
  const el = document.activeElement as HTMLElement | null
  if (!el) return null
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable) return el
  return null
}

function einfuegen(text: string): void {
  if (!aktivesFeld()) return
  document.execCommand('insertText', false, text)
}

/** Kombinierendes Zeichen auf den Buchstaben vor der Schreibmarke setzen (NFC) */
function zeichenSetzen(kombi: string): void {
  const el = aktivesFeld()
  if (!el) return
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const pos = el.selectionStart ?? el.value.length
    const vorher = el.value.slice(0, pos)
    // Den letzten Buchstaben samt seinen Zeichen markieren und ersetzen
    const m = vorher.match(/(\P{M}\p{M}*)$/u)
    if (!m) return
    el.setSelectionRange(pos - m[1].length, pos)
    document.execCommand('insertText', false, diakritikonSetzen(m[1], kombi))
    return
  }
  // Bearbeitbarer Text im Blatt: das kombinierende Zeichen einfach anhängen
  document.execCommand('insertText', false, kombi)
}

function feldUmwandeln(umwandeln: (s: string) => string): void {
  const el = aktivesFeld()
  if (!el) return
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const neu = umwandeln(el.value)
    if (neu === el.value) return
    el.select()
    document.execCommand('insertText', false, neu)
    return
  }
  const alt = el.textContent ?? ''
  const neu = umwandeln(alt)
  if (neu === alt) return
  document.execCommand('selectAll')
  document.execCommand('insertText', false, neu)
}
