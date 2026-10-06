/**
 * Symbol am Seitenrand im Editor (06.10.2026, Wunsch der Lehrkraft): diese Seite hoch oder quer. Umgeschaltet wird
 * der Abschnitt ab dem ersten Baustein der Seite bis zum ersten der nächsten (model/seitenformat.ts) – der Inhalt
 * wird dann in der neuen Breite gesetzt und neu umbrochen. Gilt in allen Editoren, die `SheetPages` nutzen.
 */
import { ActionIcon, Tooltip } from '@mantine/core'
import type { PagePlan } from '../../../shared/render/paginate'
import { seiteUmschalten, type FormatAnker } from '../model/seitenformat'

/** Breite, auf die der Editor einpasst: mit Querseiten die einer Querseite (sonst undefined = A4 hoch) */
export const blattBreitePx = (plans: readonly PagePlan[] | undefined): number | undefined => (plans?.some((p) => p.quer) ? (297 * 96) / 25.4 : undefined)

function Blatt({ quer }: { quer: boolean }): React.JSX.Element {
  // Ein kleines Blatt, gedreht – mit Pfeil zum anderen Format
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {quer ? <rect x="7" y="3" width="10" height="14" rx="1.5" /> : <rect x="3" y="7" width="14" height="10" rx="1.5" />}
      <path d="M18 19a5 5 0 0 0 3-4.5" />
      <path d="M21 17.5v-3h-3" />
    </svg>
  )
}

/**
 * Werkzeug für `SheetPages.seitenWerkzeug`. `aendern` ist die Änderung EINES Bausteins, die jeder Editor ohnehin hat
 * (`context.update`) – so passt derselbe Knopf in Arbeitsblatt, Klassenarbeit, LZK und Grammatiktest.
 */
export function seitenFormatWerkzeug(
  sheet: { blocks: readonly FormatAnker[] },
  aendern: (blockId: string, fn: (draft: FormatAnker) => void) => void,
  /** Wie die Seiten jetzt stehen (Arbeitsblatt: samt Prüfung nach Maßen); sonst nach den Ankern */
  querJetzt?: Set<string>
): (seite: number, plan: PagePlan) => React.ReactNode {
  const setzen = (neu: FormatAnker[]): void => {
    const alt = new Map(sheet.blocks.map((b) => [b.id, b]))
    for (const b of neu) {
      const vorher = alt.get(b.id)
      if (!vorher || (vorher.seitenFormat === b.seitenFormat && vorher.seitenFormatFest === b.seitenFormatFest)) continue
      aendern(b.id, (d) => {
        if (b.seitenFormat) d.seitenFormat = b.seitenFormat
        else delete d.seitenFormat
        if (b.seitenFormatFest) d.seitenFormatFest = true
        else delete d.seitenFormatFest
      })
    }
  }
  return function SeitenFormat(_seite, plan) {
    const erster = plan.items.find((it) => !it.continued)
    const letzter = plan.items[plan.items.length - 1]
    const i = letzter ? sheet.blocks.findIndex((b) => b.id === letzter.id) : -1
    const naechster = i >= 0 ? sheet.blocks[i + 1]?.id : undefined
    const quer = Boolean(plan.quer)
    const text = !erster
      ? 'Diese Seite setzt nur einen Baustein der Seite davor fort – das Format dort umschalten'
      : quer
        ? 'Diese Seite ins Hochformat'
        : 'Diese Seite ins Querformat'
    return (
      <Tooltip label={text} position="left" withArrow multiline maw={260}>
        <ActionIcon
          variant="default"
          radius="xl"
          size="lg"
          disabled={!erster}
          aria-label={text}
          onClick={() => erster && setzen(seiteUmschalten(sheet.blocks, erster.id, naechster, !quer, querJetzt))}
          className="ws-seitenformat-knopf"
          data-seitenformat-knopf={quer ? 'quer' : 'hoch'}
        >
          <Blatt quer={quer} />
        </ActionIcon>
      </Tooltip>
    )
  }
}
