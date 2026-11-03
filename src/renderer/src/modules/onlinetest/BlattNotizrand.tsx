/**
 * Notizrand im Schülerblatt (03.11.2026, abgestimmt mit der Lehrkraft; Konstanten: shared/blattNotizrand.ts).
 *  - `NotizStreifen`: rechts neben einer Seite ein Streifen (gut 5 cm) mit Stift, Marker und Textkästchen – eigene
 *    Zeichenfläche wie die Bild-Vollansicht (TintenSeite + ObjektEbene), das Blatt bleibt unverändert.
 *  - `NotizFaehnchen`: Rand ausgeblendet, aber Notizen da – je Notizstelle ein Fähnchen am Seitenrand auf ihrer Höhe;
 *    Antippen zeigt die Notiz als Vorschau mit „Notizrand einblenden". Nichts geht verloren.
 */
import { ActionIcon, Button, Popover, Stack, Text, Tooltip } from '@mantine/core'
import { IconNote } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { BlattObjekt, FormArt } from '@shared/blattObjekte'
import { RAND_BREITE, RAND_SEITE, randTinteSchluessel } from '@shared/blattNotizrand'
import { ObjektEbene, type Vorgaben, type Werkzeug } from './blattWerkzeuge'
import { TintenSeite } from './tintenSeite'
import type { TintenApi } from './stiftAutomatik'

interface Lage {
  x: number
  y: number
  w: number
  h: number
}

export function NotizStreifen(p: {
  /** Seitennummer (0 …) */
  i: number
  seite: Lage
  /** Linke Kante des Streifens (Blattpunkte) */
  x: number
  tinte?: string
  setTinte: (schluessel: string, url: string) => void
  objekte: BlattObjekt[]
  setObjekte: (o: BlattObjekt[]) => void
  werkzeug: Werkzeug
  stiftFarbe: string
  markerFarbe: string
  vorgaben?: Vorgaben
  form?: FormArt
  gesperrt: boolean
  anmelden?: (seite: number, api: TintenApi | null) => void
}): React.JSX.Element {
  const lage = { x: p.x, y: p.seite.y, w: RAND_BREITE, h: p.seite.h }
  const seite = RAND_SEITE + p.i
  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: lage.x,
          top: lage.y,
          width: lage.w,
          height: lage.h,
          background: '#fffdf5',
          borderLeft: '2px dashed #c9d3e0',
          // zarte Linien wie auf Notizpapier
          backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #e6ebf2 27px, #e6ebf2 28px)',
          boxShadow: '0 1px 4px rgba(0,0,0,.12)'
        }}
        data-notizrand={p.i}
      >
        {p.i === 0 && (
          <Text size="10px" c="#8a96a8" ta="center" mt={4} style={{ pointerEvents: 'none' }}>
            Notizen
          </Text>
        )}
      </div>
      <TintenSeite
        seite={seite}
        lage={lage}
        bild={p.tinte}
        werkzeug={p.gesperrt ? 'tastatur' : p.werkzeug}
        farbe={p.werkzeug === 'marker' ? p.markerFarbe : p.stiftFarbe}
        stil={p.werkzeug === 'marker' ? p.vorgaben?.marker : p.vorgaben?.stift}
        setTinte={(_s, url) => p.setTinte(randTinteSchluessel(p.i), url)}
        anmelden={p.anmelden}
      />
      <ObjektEbene
        seite={seite}
        lage={lage}
        objekte={p.objekte}
        aendern={p.setObjekte}
        werkzeug={p.gesperrt ? 'tastatur' : p.werkzeug}
        farbe={p.stiftFarbe}
        gesperrt={p.gesperrt}
        form={p.form}
        vorgabe={p.vorgaben}
      />
    </>
  )
}

/** Höhen (Blattpunkte, relativ zur Seite) mit Tinte: Zeilenbänder mit Strichen, zu Gruppen zusammengefasst */
function tintenHoehen(url: string | undefined, h: number): Promise<number[]> {
  return new Promise((ok) => {
    if (!url) return ok([])
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const g = c.getContext('2d')
      if (!g) return ok([])
      g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, c.width, c.height).data
      const faktor = img.height / Math.max(1, h)
      const aus: number[] = []
      let zuletzt = -1e9
      for (let y = 0; y < c.height; y += 4) {
        let tinte = false
        for (let x = 0; x < c.width && !tinte; x += 3) if (d[(y * c.width + x) * 4 + 3] > 30) tinte = true
        if (!tinte) continue
        const yb = y / faktor
        // Neue Gruppe, wenn mehr als 60 Punkte seit dem letzten Strich frei waren
        if (yb - zuletzt > 60) aus.push(yb)
        zuletzt = yb
      }
      ok(aus)
    }
    img.onerror = () => ok([])
    img.src = url
  })
}

/** Fähnchen am rechten Seitenrand für ausgeblendete Notizen einer Seite */
export function NotizFaehnchen(p: {
  i: number
  seite: Lage
  /** Rechte Kante der Seite (Blattpunkte) */
  x: number
  tinte?: string
  objekte: BlattObjekt[]
  einblenden: () => void
}): React.JSX.Element | null {
  const eigene = p.objekte.filter((o) => o.s === RAND_SEITE + p.i)
  const [tintenY, setTintenY] = useState<number[]>([])
  useEffect(() => {
    let aktiv = true
    void tintenHoehen(p.tinte, p.seite.h).then((y) => aktiv && setTintenY(y))
    return () => {
      aktiv = false
    }
  }, [p.tinte, p.seite.h])
  // Stellen: Textkästchen und Tintengruppen, nahe beieinander zusammengefasst
  const stellen = [...eigene.map((o) => o.y), ...tintenY].sort((a, b) => a - b).reduce<number[]>((l, y) => (l.length && y - l[l.length - 1] < 60 ? l : [...l, y]), [])
  if (!stellen.length) return null
  return (
    <>
      {stellen.map((y) => (
        <Faehnchen key={y} y={p.seite.y + Math.max(0, Math.min(p.seite.h - 30, y))} x={p.x} tinte={p.tinte} oben={y} texte={eigene.filter((o) => o.t === 'text' && Math.abs(o.y - y) < 120)} einblenden={p.einblenden} />
      ))}
    </>
  )
}

function Faehnchen(p: { y: number; x: number; oben: number; tinte?: string; texte: BlattObjekt[]; einblenden: () => void }): React.JSX.Element {
  const [offen, setOffen] = useState(false)
  // Ausschnitt der Tinte um die Stelle (Blattpunkte): 220 hoch, im Streifen 200 breit
  const von = Math.max(0, p.oben - 40)
  return (
    <Popover opened={offen} onChange={setOffen} position="left" withArrow shadow="md" width={260}>
      <Popover.Target>
        <Tooltip label="Notiz am Rand (ausgeblendet)">
          <ActionIcon
            variant="light"
            color="yellow"
            size="sm"
            radius="xl"
            style={{ position: 'absolute', left: p.x - 12, top: p.y, zIndex: 25 }}
            onClick={() => setOffen((o) => !o)}
            aria-label="Notiz am Rand ansehen"
            data-notiz-faehnchen
          >
            <IconNote size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          {p.tinte && (
            <div
              style={{
                width: RAND_BREITE,
                height: 220,
                overflow: 'hidden',
                position: 'relative',
                background: '#fffdf5',
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 6
              }}
            >
              <img src={p.tinte} alt="Notiz mit dem Stift" style={{ position: 'absolute', left: 0, top: -von, width: RAND_BREITE }} />
            </div>
          )}
          {p.texte.map((t) => (
            <Text key={t.id} size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {t.text || '…'}
            </Text>
          ))}
          <Button size="xs" variant="light" onClick={() => (setOffen(false), p.einblenden())} data-notizrand-einblenden>
            Notizrand einblenden
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
