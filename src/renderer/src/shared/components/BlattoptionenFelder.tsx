import { Checkbox, Select, Tooltip } from '@mantine/core'
import type { DesignTemplate } from '@shared/design'
import { KI_VERMERK_STANDARD, type KiHerkunft, type KiVermerk } from '@shared/kiKennzeichnung'
import { canaryNote, canaryWordFor, canaryWords } from '../aiCanary'
import type { UeberthemaFelder } from '../ueberthema'
import UeberthemaFeld from './UeberthemaFeld'
import VorlagenfarbeSchalter from './VorlagenfarbeSchalter'

/**
 * Die Felder des Fensters „Blattoptionen" – dieselben in allen Programmen (27.09.2026).
 *
 * Bis dahin gab es sie nur beim Arbeitsblatt; die Klassenarbeit hatte die Ränder als
 * Kästchen unter dem Text, Lernzielkontrolle und Grammatiktest gar nichts. Reihenfolge wie
 * beim Arbeitsblatt (Designvorlage oben – Wunsch der Lehrkraft vom 26.09.2026): Designvorlage,
 * [Eigenes], Schulangaben, [Eigenes], Korrekturrand, Notizrand, Blocksatz, Vorlagenfarbe,
 * Überthema, [Eigenes], KI-Test. Was ein Programm nicht hat, lässt es weg.
 */
export interface Schalter {
  checked: boolean
  onChange: (an: boolean) => void
}

export interface KiTestOption {
  an: boolean
  /** Die gewählten Wörter, für die Erklärung im Tooltip */
  woerter?: string
  /** Schlüssel für den Wortvorschlag (Titel|Thema) */
  vorschlagFuer: string
  /** Einschalten – öffnet den Dialog mit der Wortwahl */
  onEin: () => void
  onAus: () => void
}

export default function BlattoptionenFelder({
  designs,
  designId,
  onDesign,
  nachDesign,
  schulangaben,
  nachSchule,
  korrekturrand,
  notizrand,
  blocksatz,
  anmerkungen,
  fach,
  vorlagenfarbe,
  ueberthema,
  vorKiTest,
  kiTest,
  kiVermerk
}: {
  designs: DesignTemplate[]
  designId: string | null
  onDesign: (design: DesignTemplate) => void
  nachDesign?: React.ReactNode
  schulangaben: Schalter
  nachSchule?: React.ReactNode
  korrekturrand?: Schalter
  notizrand?: Schalter
  blocksatz?: Schalter
  /**
   * Fußnoten oder Endnoten (01.10.2026) – nur übergeben, wenn ein Material Anmerkungen hat
   * (didactics/anmerkungen.ts, `hatAnmerkungen`); sonst erscheint die Wahl nicht.
   */
  anmerkungen?: { wert: 'fussnoten' | 'endnoten'; onChange: (art: 'fussnoten' | 'endnoten') => void }
  fach: string | undefined
  vorlagenfarbe: Schalter
  ueberthema?: { werte: UeberthemaFelder; bereich: string; onChange: (patch: Pick<UeberthemaFelder, 'ueberthema' | 'ueberthemaAus'>) => void }
  vorKiTest?: React.ReactNode
  kiTest?: KiTestOption
  /** Sichtbarer KI-Vermerk (Großprogramm 0.4) – nur angeboten, wenn eine KI mitgewirkt hat */
  kiVermerk?: { wert: KiVermerk | undefined; ki: KiHerkunft | undefined; onChange: (v: KiVermerk) => void }
}): React.JSX.Element {
  return (
    <>
      <Select
        size="sm"
        label="Designvorlage"
        data={designs.map((d) => ({ value: d.id, label: d.name }))}
        value={designs.some((d) => d.id === designId) ? designId : null}
        placeholder="Design wählen"
        onChange={(v) => {
          const d = designs.find((x) => x.id === v)
          if (d) onDesign(d)
        }}
      />
      {nachDesign}
      <Checkbox
        size="sm"
        label="Schulangaben"
        description="Schulname und Logo auf diesem Material abdrucken – unabhängig von der Designvorlage"
        checked={schulangaben.checked}
        onChange={(e) => schulangaben.onChange(e.currentTarget.checked)}
      />
      {nachSchule}
      {korrekturrand && (
        <Checkbox
          size="sm"
          label="Korrekturrand"
          description="Neben den Schreiblinien 45 mm für Korrekturzeichen freihalten; eine senkrechte Linie trennt den Streifen ab."
          checked={korrekturrand.checked}
          onChange={(e) => korrekturrand.onChange(e.currentTarget.checked)}
        />
      )}
      {notizrand && (
        <Checkbox
          size="sm"
          label="Notizrand"
          description="Neben den Materialtexten 42 mm zum Mitschreiben freihalten; eine senkrechte Linie trennt den Streifen ab. Der Seitenumbruch verschiebt sich entsprechend."
          checked={notizrand.checked}
          onChange={(e) => notizrand.onChange(e.currentTarget.checked)}
        />
      )}
      {blocksatz && (
        <Checkbox
          size="sm"
          label="Blocksatz"
          description="Längere Texte im Blocksatz setzen. Flattersatz gilt als besser lesbar (Ofqual 2021, DIN 1450); bei Einfacher und Leichter Sprache ist Blocksatz immer aus."
          checked={blocksatz.checked}
          onChange={(e) => blocksatz.onChange(e.currentTarget.checked)}
        />
      )}
      {anmerkungen && (
        <Select
          size="sm"
          label="Fußnoten und Worthilfen"
          description="Fußnoten stehen unten auf der Seite des markierten Worts, Endnoten gesammelt am Ende des Materials. Die Zählung beginnt je Material bei ¹."
          data={[
            { value: 'endnoten', label: 'Endnoten (am Ende des Materials)' },
            { value: 'fussnoten', label: 'Fußnoten (unten auf der Seite)' }
          ]}
          value={anmerkungen.wert}
          onChange={(v) => v && anmerkungen.onChange(v as 'fussnoten' | 'endnoten')}
          allowDeselect={false}
          data-testid="blattoption-anmerkungen"
        />
      )}
      <VorlagenfarbeSchalter fach={fach} checked={vorlagenfarbe.checked} onChange={vorlagenfarbe.onChange} />
      {ueberthema && <UeberthemaFeld werte={ueberthema.werte} bereich={ueberthema.bereich} onChange={ueberthema.onChange} />}
      {vorKiTest}
      {kiTest && (
        <Tooltip
          multiline
          w={320}
          label={
            kiTest.an
              ? canaryNote(canaryWords(kiTest.woerter, canaryWordFor(kiTest.vorschlagFuer)))
              : 'Setzt einen für Lernende unsichtbaren Satz auf das Schülerblatt, der ein Sprachmodell zu einem verräterischen Wort verleitet.'
          }
        >
          <Checkbox
            size="sm"
            label="KI-Test"
            checked={kiTest.an}
            onChange={(e) => {
              if (e.currentTarget.checked) kiTest.onEin()
              else kiTest.onAus()
            }}
          />
        </Tooltip>
      )}
      {kiVermerk?.ki && (
        <Select
          size="sm"
          label="KI-Vermerk"
          description={`Hinweis auf die KI-Unterstützung (${[kiVermerk.ki.anbieter, kiVermerk.ki.modell].filter(Boolean).join(' · ')}). In den Dateieigenschaften von Word und PDF steht er immer.`}
          data={[
            { value: 'loesung', label: 'Nur im Lösungsteil' },
            { value: 'ueberall', label: 'Auf jeder Seite' },
            { value: 'aus', label: 'Nicht anzeigen' }
          ]}
          value={kiVermerk.wert ?? KI_VERMERK_STANDARD}
          onChange={(v) => v && kiVermerk.onChange(v as KiVermerk)}
          allowDeselect={false}
        />
      )}
    </>
  )
}
