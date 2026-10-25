/**
 * Bild eines digitalen Arbeitsblatts bildschirmfüllend (25.10.2026, Wunsch der Lehrkraft): Lernende vergrößern ein Bild,
 * markieren und beschriften es mit denselben Werkzeugen wie auf dem Blatt (Stift, Textmarker, Radierer, Text, Linie,
 * Formen). Die Markierungen gehören zur Abgabe: Tinte als PNG unter `tinte["bild:<id>"]`, Kästchen und Linien als
 * Objekte auf einer eigenen „Seite" je Bild (shared/blattBilder.ts BILD_SEITE + Nummer) – die Lehrkraft sieht sie in
 * der Abgabe (dieselbe Ansicht, nur ansehen) und auf den Seitenbildern für die KI (druck.ts).
 *
 * Stift und Textmarker sind am Bild immer erlaubt – auch wenn der Stift auf dem Blatt nicht freigegeben ist: Markieren
 * ist hier der Zweck, nicht das Beantworten.
 *
 * Die Zeichenfläche hat eine feste logische Breite (1000 px) und wird mit `transform: scale` auf den Bildschirm
 * gebracht – so passen gespeicherte Striche auf jedem Gerät. Schließen: Knopf, Esc oder Tipp auf den dunklen Rand.
 */
import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { BILD_SEITE } from '@shared/blattBilder'
import type { BlattObjekt, FormArt } from '@shared/blattObjekte'
import { ObjektEbene, Werkzeugleiste, type Vorgaben, type VorgabeArt, type Werkzeug } from './blattWerkzeuge'
import type { Stil } from './objektOptionen'
import { TintenSeite } from './tintenSeite'

/** Logische Breite der Zeichenfläche – Tinte wird in dieser Auflösung gespeichert */
export const BILD_LOGISCH = 1000

/** Ein Bild des Blatts, wie `messen` es im iframe findet (Lage in Dokument-Pixeln) */
export interface BildLage {
  id: string
  seite: number
  x: number
  y: number
  w: number
  h: number
  src: string
  natW: number
  natH: number
}

export function BildVollbild(p: {
  bild: BildLage
  index: number
  tinte?: string
  setTinte: (url: string) => void
  objekte: BlattObjekt[]
  setObjekte: (o: BlattObjekt[]) => void
  stiftFarbe: string
  setStiftFarbe: (f: string) => void
  markerFarbe: string
  setMarkerFarbe: (f: string) => void
  vorgaben?: Vorgaben
  setVorgabe?: (art: VorgabeArt, patch: Partial<Stil>) => void
  /** Nach dem Einreichen bzw. in der Lehrkraft-Sicht: nur ansehen */
  gesperrt: boolean
  schliessen: () => void
}): React.JSX.Element {
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('stift')
  const [form, setForm] = useState<FormArt>('dreieck')
  const w = BILD_LOGISCH
  const h = Math.max(200, Math.round((BILD_LOGISCH * (p.bild.natH || p.bild.h)) / (p.bild.natW || p.bild.w || 1)))
  // Der Rahmen entsteht erst mit dem Einblenden des Fensters (Mantine Transition) – deshalb Callback-Ref und
  // ResizeObserver statt einmaliger Messung (Befund im Browsertest: Bild blieb halb so groß)
  const [rahmen, setRahmen] = useState<HTMLDivElement | null>(null)
  const [massstab, setMassstab] = useState(0.5)
  useEffect(() => {
    if (!rahmen) return
    const rechne = (): void => {
      const b = rahmen.getBoundingClientRect()
      if (b.width < 50 || b.height < 50) return
      setMassstab(Math.max(0.1, Math.min((b.width - 16) / w, (b.height - 16) / h, 2)))
    }
    rechne()
    const beobachter = new ResizeObserver(rechne)
    beobachter.observe(rahmen)
    return () => beobachter.disconnect()
  }, [rahmen, w, h])
  const lage = { x: 0, y: 0, w, h }
  const seite = BILD_SEITE + p.index
  const aktiv: Werkzeug = p.gesperrt ? 'tastatur' : werkzeug
  return (
    <Modal opened onClose={p.schliessen} fullScreen withCloseButton={false} padding={0} data-bild-vollbild={p.bild.id}>
      <Stack gap={0} style={{ height: '100dvh' }}>
        <Group p="xs" justify="space-between" wrap="nowrap" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          {p.gesperrt ? (
            <Text size="sm" c="dimmed">
              Markierungen auf dem Bild – nur ansehen
            </Text>
          ) : (
            <Werkzeugleiste
              werkzeug={werkzeug}
              setWerkzeug={setWerkzeug}
              stiftFarbe={p.stiftFarbe}
              setStiftFarbe={p.setStiftFarbe}
              markerFarbe={p.markerFarbe}
              setMarkerFarbe={p.setMarkerFarbe}
              form={form}
              setForm={setForm}
              vorgaben={p.vorgaben}
              setVorgabe={p.setVorgabe}
            />
          )}
          <Button variant="default" leftSection={<IconX size={16} />} onClick={p.schliessen} style={{ flexShrink: 0 }} data-bild-schliessen>
            Schließen
          </Button>
        </Group>
        <div
          ref={setRahmen}
          onClick={(e) => {
            // Tipp auf den dunklen Rand schließt – wie man es von Bildansichten kennt
            if (e.target === e.currentTarget) p.schliessen()
          }}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1f2328', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          data-bild-rand
        >
          <div style={{ width: w * massstab, height: h * massstab, position: 'relative', background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,.5)' }}>
            <div style={{ width: w, height: h, transform: `scale(${massstab})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
              <img src={p.bild.src} alt="Bild aus dem Arbeitsblatt, zum Markieren vergrößert" style={{ width: w, height: h, display: 'block', userSelect: 'none', pointerEvents: 'none' }} draggable={false} />
              <TintenSeite
                seite={seite}
                lage={lage}
                bild={p.tinte}
                werkzeug={aktiv}
                farbe={werkzeug === 'marker' ? p.markerFarbe : p.stiftFarbe}
                stil={werkzeug === 'marker' ? p.vorgaben?.marker : p.vorgaben?.stift}
                setTinte={(_s, url) => p.setTinte(url)}
              />
              <ObjektEbene
                seite={seite}
                lage={lage}
                objekte={p.objekte}
                aendern={p.setObjekte}
                werkzeug={aktiv}
                farbe={p.stiftFarbe}
                gesperrt={p.gesperrt}
                form={form}
                vorgabe={p.vorgaben}
              />
            </div>
          </div>
        </div>
        <Text size="xs" c="dimmed" ta="center" py={4}>
          {p.gesperrt
            ? 'Zurück mit „Schließen“, Esc oder einem Tipp auf den Rand.'
            : 'Markiere oder beschrifte das Bild – zurück mit „Schließen“, Esc oder einem Tipp auf den Rand.'}
        </Text>
      </Stack>
    </Modal>
  )
}
