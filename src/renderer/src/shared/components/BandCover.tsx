/**
 * Cover eines Schulbuch-Bands (09.10.2026): klein links neben dem Band, direkt vom Verlag geladen (nichts wird gespeichert –
 * Wunsch der Lehrkraft, Urheberrecht). Ausgabe nach Bundesland, Regeln in src/shared/lehrwerkCover.ts. Ohne bekanntes
 * Cover, ohne Netz oder bei geänderter Adresse: Kachel in der Bandfarbe mit der Bandnummer.
 *
 * Gemeinsam genutzt (09.10.2026): Vokabellisten, Kursseite (Units je Band), „Meine Klassen" (Abschnitte und Grammatik je
 * Band). Ohne `land` gilt das Bundesland aus den Einstellungen.
 */
import { useState } from 'react'
import { bandFarbe, bandKuerzel, coverAusgabe, type CoverBand } from '@shared/lehrwerkCover'
import { useAppSettings } from '../settingsStore'

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
        title={`${cover.reihe} ${cover.band} · ${cover.ausgabe} (Klett)`}
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
 * Gruppe je Band (09.10.2026, Wunsch der Lehrkraft): links das Cover, rechts der Bandname und der Inhalt (Units).
 * Ohne Band („Weitere Vokabeln", eigene Listen): eine schlichte graue Kachel.
 */
export function BandGruppe({
  buch,
  ohneBand = 'Weitere',
  zusatz,
  children,
  ...rest
}: { buch: string; ohneBand?: string; zusatz?: React.ReactNode; children: React.ReactNode } & Record<`data-${string}`, string | boolean>): React.JSX.Element {
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
