/**
 * Cover eines Schulbuch-Bands (09.10.2026): klein links neben dem Band, direkt vom Verlag geladen (nichts wird gespeichert –
 * Wunsch der Lehrkraft, Urheberrecht). Ausgabe nach Bundesland, Regeln in src/shared/lehrwerkCover.ts. Ohne bekanntes
 * Cover, ohne Netz oder bei geänderter Adresse: Kachel in der Bandfarbe mit der Bandnummer.
 *
 * Gemeinsam genutzt (09.10.2026): Vokabellisten, Kursseite (Units je Band), „Meine Klassen" (Abschnitte und Grammatik je
 * Band). Ohne `land` gilt das Bundesland aus den Einstellungen.
 */
import { Collapse, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useState } from 'react'
import { bandFarbe, bandKuerzel, coverAusgabe, type CoverBand } from '@shared/lehrwerkCover'
import { useAppSettings } from '../settingsStore'
import { useOffenGemerkt } from '../sitzung'

export function BandCover({ band, land, breite = 48 }: { band: CoverBand; land?: string; breite?: number }): React.JSX.Element {
  const eingestellt = useAppSettings((s) => s.settings.defaults?.stateId ?? '')
  const cover = coverAusgabe(band, land ?? eingestellt)
  const [fehler, setFehler] = useState<string | null>(null)
  const masse: React.CSSProperties = { width: breite, height: Math.round((breite * 4) / 3), borderRadius: breite < 40 ? 3 : 4, flexShrink: 0 }
  if (cover && fehler !== cover.url)
    return (
      <img
        src={cover.url}
        alt={`Cover ${band.name}`}
        title={`${cover.reihe} ${cover.band} · ${cover.ausgabe} (${cover.verlag})`}
        loading="lazy"
        referrerPolicy="no-referrer"
        draggable={false}
        data-cover={cover.isbn}
        onError={() => setFehler(cover.url)}
        style={{ ...masse, objectFit: 'cover', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
      />
    )
  const farbe = bandFarbe(band)
  return (
    <div
      aria-hidden
      data-cover-ersatz
      style={{
        ...masse,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `var(--mantine-color-${farbe}-6)`,
        color: 'white',
        fontWeight: 700,
        fontSize: Math.max(11, Math.round(breite * 0.42))
      }}
    >
      {bandKuerzel(band)}
    </div>
  )
}

/**
 * Auf/Zu der Band-Gruppen (10.10.2026, Wunsch der Lehrkraft: mehrere Bände in einem Kurs): der erste (neueste bzw. aktuelle)
 * Band offen, ältere zugeklappt; Vokabeln ohne Band (eigene Listen) offen. Gemerkt nur für die Sitzung (shared/sitzung.ts) – je Ansicht und Kurs (`schluessel`).
 */
export function useBaendeOffen(schluessel: string, baende: string[]): { offen: (buch: string) => boolean; umschalten: (buch: string) => void } {
  const [abweichend, setAbweichend] = useOffenGemerkt<Record<string, boolean>>(`schulapps-baende-${schluessel}`, {})
  // Ohne Band („Weitere Vokabeln", eigene Listen) offen – das ist kein älterer Band
  const vorgabe = (buch: string): boolean => buch === baende[0] || !buch
  const offen = (buch: string): boolean => abweichend[buch || '-'] ?? vorgabe(buch)
  return {
    offen,
    umschalten: (buch) => setAbweichend((a) => ({ ...a, [buch || '-']: !(a[buch || '-'] ?? vorgabe(buch)) }))
  }
}

/**
 * Gruppe je Band (09.10.2026, Wunsch der Lehrkraft): links das Cover, rechts der Bandname und der Inhalt (Units).
 * Ohne Band („Weitere Vokabeln", eigene Listen): eine schlichte graue Kachel. Mit `umschalten` (10.10.2026) klappt ein
 * Klick auf den Kopf (Cover, Name, Zusatz) die Gruppe auf und zu.
 */
export function BandGruppe({
  buch,
  ohneBand = 'Weitere',
  zusatz,
  offen = true,
  umschalten,
  children,
  ...rest
}: {
  buch: string
  ohneBand?: string
  zusatz?: React.ReactNode
  offen?: boolean
  umschalten?: () => void
  children: React.ReactNode
} & Record<`data-${string}`, string | boolean>): React.JSX.Element {
  if (umschalten) {
    const Pfeil = offen ? IconChevronDown : IconChevronRight
    return (
      <div data-band-gruppe={buch || ohneBand} data-band-offen={offen || undefined} {...rest}>
        <UnstyledButton onClick={umschalten} aria-expanded={offen} w="100%" data-band-kopf>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Pfeil size={14} style={{ flexShrink: 0 }} />
            {buch ? (
              <BandCover band={{ name: buch }} breite={offen ? 34 : 26} />
            ) : (
              <div
                aria-hidden
                data-cover-ersatz
                style={{ width: offen ? 34 : 26, height: offen ? 45 : 35, borderRadius: 3, flexShrink: 0, background: 'var(--mantine-color-gray-3)', color: 'var(--mantine-color-gray-7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
              >
                …
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--mantine-font-size-sm)' }}>{buch || ohneBand}</span>
              {zusatz && <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' }}>{zusatz}</span>}
            </div>
          </div>
        </UnstyledButton>
        <Collapse expanded={offen}>
          <div style={{ paddingLeft: 24, marginTop: 4 }}>{children}</div>
        </Collapse>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }} data-band-gruppe={buch || ohneBand} {...rest}>
      {buch ? (
        <BandCover band={{ name: buch }} breite={34} />
      ) : (
        <div
          aria-hidden
          data-cover-ersatz
          style={{ width: 34, height: 45, borderRadius: 3, flexShrink: 0, background: 'var(--mantine-color-gray-3)', color: 'var(--mantine-color-gray-7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
        >
          …
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--mantine-font-size-sm)' }}>{buch || ohneBand}</span>
          {zusatz && <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' }}>{zusatz}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}
