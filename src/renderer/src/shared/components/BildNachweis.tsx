/**
 * Bildnachweis für Lernende (22.10.2026, Prüfung des Schulträgers, Punkt 12): kleine Zeile unter einem Bild –
 * „KI-generiert“ bzw. Urheber und Lizenz bei Bildern aus Wikimedia/Openverse/Pixabay. Regeln: shared/bildLizenz.ts.
 *
 * Kompakt (23.10.2026, Bildnachweise – Wunsch: „vorhanden, aber nicht dominant“): nur ein kleines ⓘ in der Ecke des
 * Bildes; Zeigen, Fokus oder Tippen öffnet „Bild: Urheber · Lizenz (Link)“ bzw. „KI-generiert“. Der Knopf löst die
 * Karte darunter nicht aus (Ereignisse enden am Knopf). `loesung`: Wörter, die der Nachweis während eines Spiels oder
 * Tests nicht zeigen darf (shared/bildLizenz.ts `nachweisOhneLoesung`). Gesammelt wird der volle Nachweis für die
 * Liste „Bildnachweise“ am Ende der Runde bzw. am Fuß von Test und Blatt (`BildNachweisSammler`, `BildNachweisListe`).
 */
import { Anchor, Popover, Stack, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { createContext, useContext, useEffect, useState } from 'react'
import { lernendenNachweis, nachweisOhneLoesung, nachweisTeile, type BildHerkunft } from '@shared/bildLizenz'

export interface NachweisEintrag {
  /** Wofür (am Ende der Runde darf es das Wort sein): „apple“, „Aufgabe 2“ */
  label?: string
  text: string
}

/** Sammelt die Nachweise aller gezeigten Bilder (Spielrunde) – ohne Anbieter wird nichts gesammelt */
export const BildNachweisSammler = createContext<((e: NachweisEintrag) => void) | null>(null)

/** Doppelte Nachweise (gleiches Bild mehrmals gezeigt) nur einmal */
export function nachweiseOhneDoppelte(liste: NachweisEintrag[]): NachweisEintrag[] {
  const aus: NachweisEintrag[] = []
  for (const e of liste) if (e.text && !aus.some((x) => x.text === e.text && x.label === e.label)) aus.push(e)
  return aus
}

const halt = (e: React.SyntheticEvent): void => e.stopPropagation()

function NachweisText({ text }: { text: string }): React.JSX.Element {
  const t = nachweisTeile(text)
  return (
    <>
      {t.text}
      {t.link && (
        <>
          {' ('}
          <Anchor href={t.link} target="_blank" rel="noopener noreferrer" size="xs" onClick={halt}>
            Link
          </Anchor>
          {')'}
        </>
      )}
    </>
  )
}

/** Das kleine ⓘ mit dem Nachweis im Aufklapper */
function KompaktKnopf({ zeile, ecke, anfangsOffen }: { zeile: string; ecke: boolean; anfangsOffen?: boolean }): React.JSX.Element {
  const [fest, setFest] = useState(Boolean(anfangsOffen))
  const [zeigen, setZeigen] = useState(false)
  const [fokus, setFokus] = useState(false)
  const offen = fest || zeigen || fokus
  const art = nachweisTeile(zeile).art
  return (
    <Popover opened={offen} onChange={setFest} position="top" withArrow shadow="sm" withinPortal={!anfangsOffen} zIndex={400}>
      <Popover.Target>
        {/*
          Kein <button>: ein span mit role="button" (fokussierbar, Enter/Leertaste) – so steht kein Knopf im Knopf, und
          Abfragen nach den Knöpfen eines Spiels (Antworten, Karten) treffen das ⓘ nicht.
        */}
        <span
          role="button"
          tabIndex={0}
          aria-label="Bildnachweis"
          aria-expanded={offen}
          data-bild-nachweis-knopf={art}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            setFest((x) => !x)
          }}
          onPointerDown={halt}
          onMouseDown={halt}
          onTouchStart={halt}
          onKeyDown={(e: React.KeyboardEvent) => {
            e.stopPropagation()
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setFest((x) => !x)
            }
            if (e.key === 'Escape') {
              setFest(false)
              setFokus(false)
            }
          }}
          onMouseEnter={() => setZeigen(true)}
          onMouseLeave={() => setZeigen(false)}
          onFocus={() => setFokus(true)}
          onBlur={() => setFokus(false)}
          style={{
            width: 24,
            height: 24,
            display: 'inline-grid',
            placeItems: 'center',
            borderRadius: '50%',
            color: 'var(--mantine-color-dimmed)',
            background: ecke ? 'rgba(255, 255, 255, 0.7)' : 'transparent',
            flex: 'none',
            cursor: 'pointer',
            ...(ecke ? { position: 'absolute', right: 2, bottom: 2, zIndex: 2 } : {})
          }}
        >
          <IconInfoCircle size={13} stroke={1.6} aria-hidden="true" />
        </span>
      </Popover.Target>
      <Popover.Dropdown p={6} maw={260} onClick={halt} onPointerDown={halt}>
        <Text size="xs" style={{ overflowWrap: 'anywhere' }} data-bild-nachweis-inhalt={art}>
          <NachweisText text={zeile} />
        </Text>
      </Popover.Dropdown>
    </Popover>
  )
}

export function BildNachweis({
  bild,
  text,
  mt = 2,
  kompakt = false,
  loesung,
  label,
  ecke = true,
  anfangsOffen
}: {
  bild?: BildHerkunft | null
  text?: string | null
  mt?: number
  /** Nur ein kleines ⓘ (23.10.2026) statt der Zeile */
  kompakt?: boolean
  /** Wörter, die der Nachweis nicht zeigen darf (gesuchtes Wort, Übersetzung) */
  loesung?: (string | undefined | null)[]
  /** Eintrag in der gesammelten Liste („Bildnachweise“) */
  label?: string
  /** Kompakt: in der Ecke des umgebenden Bildes (das `position: relative` hat) statt im Fluss */
  ecke?: boolean
  /** Nur für Tests: Aufklapper offen zeichnen */
  anfangsOffen?: boolean
}): React.JSX.Element | null {
  const voll = text ?? (bild ? lernendenNachweis(bild) : null)
  const zeile = voll && loesung ? nachweisOhneLoesung(voll, loesung) : voll
  const sammeln = useContext(BildNachweisSammler)
  useEffect(() => {
    if (voll && sammeln) sammeln({ ...(label ? { label } : {}), text: voll })
  }, [voll, label, sammeln])
  if (!zeile) return null
  if (kompakt) return <KompaktKnopf zeile={zeile} ecke={ecke} anfangsOffen={anfangsOffen} />
  return (
    <Text
      size="10px"
      c="dimmed"
      ta="center"
      mt={mt}
      lineClamp={2}
      title={zeile}
      style={{ maxWidth: 260, overflowWrap: 'anywhere' }}
      data-bild-nachweis={zeile === 'KI-generiert' ? 'ki' : 'fremd'}
    >
      {zeile}
    </Text>
  )
}

/**
 * Gesammelte Bildnachweise (23.10.2026): ein kleiner Link „Bildnachweise (n)“, der eine kurze Liste aufklappt –
 * am Ende einer Spielrunde und am Fuß von Onlinetest und Onlineblatt. Ohne Einträge nichts.
 */
export function BildNachweisListe({ eintraege, anfangsOffen = false }: { eintraege: NachweisEintrag[]; anfangsOffen?: boolean }): React.JSX.Element | null {
  const [offen, setOffen] = useState(anfangsOffen)
  const liste = nachweiseOhneDoppelte(eintraege)
  if (!liste.length) return null
  return (
    <Stack gap={2} align="center" data-bild-nachweise={liste.length}>
      <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => setOffen((x) => !x)} aria-expanded={offen} data-bild-nachweise-knopf>
        Bildnachweise ({liste.length})
      </Anchor>
      {offen && (
        <ul style={{ margin: 0, paddingLeft: 16, maxWidth: 480 }} data-bild-nachweise-liste>
          {liste.map((e, i) => (
            <Text key={i} component="li" size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
              {e.label ? <b>{e.label}: </b> : null}
              <NachweisText text={e.text} />
            </Text>
          ))}
        </ul>
      )}
    </Stack>
  )
}
