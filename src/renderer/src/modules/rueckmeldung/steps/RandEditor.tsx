import { ActionIcon, Menu, Tooltip } from '@mantine/core'
import { IconCheck, IconCursorText, IconTrash } from '@tabler/icons-react'
import { Fragment } from 'react'
import { absatzFolge, markenStil } from '../blattLayout'
import type { NummerierterKommentar, Textteil } from '../korrekturrand'
import type { RandKommentar } from '../model/types'
import { Editierbar, useBlatt, Zauberstab } from './blattTeile'

export const ART_FARBE: Record<RandKommentar['art'], string> = { fehler: '#c62828', lob: '#2e7d32', hinweis: '#c62828' }
export const ARTEN: { value: RandKommentar['art']; label: string }[] = [
  { value: 'fehler', label: 'Fehler' },
  { value: 'lob', label: 'Lob' },
  { value: 'hinweis', label: 'Hinweis' }
]

/**
 * Eine Randnotiz auf dem Blatt (29.09.2026): Nummer, Häkchen bzw. Korrekturzeichen und Text in
 * Handschrift – der Text direkt bearbeitbar. Ein Klick auf die Nummer öffnet Art, Korrekturzeichen,
 * „Textstelle neu markieren" und Löschen; daneben der Zauberstab.
 */
export function RandNotiz({ g, verschieben }: { g: NummerierterKommentar; verschieben?: (id: string) => void }): React.JSX.Element {
  const c = useBlatt()
  const k = g.k
  const aendern = (fn: (x: RandKommentar) => void, gruppe?: string): void =>
    c.setzeRand((rand) => {
      const x = rand.find((y) => y.id === k.id)
      if (x) fn(x)
    }, gruppe)
  const loeschen = (): void =>
    c.setzeRand((rand) => {
      const i = rand.findIndex((y) => y.id === k.id)
      if (i >= 0) rand.splice(i, 1)
    })
  const stelle = { art: 'rand' as const, id: k.id }
  return (
    <div className={`bl-notiz ${k.art} rm-notiz${c.laeuft(stelle) ? ' rm-laeuft' : ''}`} data-rand-kommentar data-notiz={k.id} data-notiz-nr={g.nr} data-kein-text>
      <Menu position="bottom-start" width={230} withinPortal>
        <Menu.Target>
          <span className="bl-nr rm-klick" role="button" tabIndex={0} aria-label={`Notiz ${g.nr}: Art und Zeichen`}>
            {g.nr}
          </span>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Art</Menu.Label>
          {ARTEN.map((x) => (
            <Menu.Item key={x.value} leftSection={k.art === x.value ? <IconCheck size={14} /> : <span style={{ width: 14 }} />} onClick={() => aendern((y) => (y.art = x.value))}>
              {x.label}
            </Menu.Item>
          ))}
          <Menu.Label>Korrekturzeichen</Menu.Label>
          <div className="rm-zeichenwahl">
            <button type="button" className={!k.zeichen ? 'aktiv' : ''} onClick={() => aendern((y) => delete y.zeichen)}>
              –
            </button>
            {c.zeichen
              .filter((z) => z.zeichen)
              .map((z) => (
                <Tooltip key={z.zeichen} label={z.bedeutung} withinPortal>
                  <button type="button" className={k.zeichen === z.zeichen ? 'aktiv' : ''} onClick={() => aendern((y) => (y.zeichen = z.zeichen))}>
                    {z.zeichen}
                  </button>
                </Tooltip>
              ))}
          </div>
          <Menu.Divider />
          {verschieben && (
            <Menu.Item leftSection={<IconCursorText size={14} />} onClick={() => verschieben(k.id)} data-rm-verschieben>
              Textstelle neu markieren
            </Menu.Item>
          )}
          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={loeschen}>
            Notiz löschen
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {k.art === 'lob' && <span className="bl-haken">✓</span>}
      {k.zeichen && <span className="bl-zeichen">{k.zeichen}:</span>}
      <Editierbar
        wert={c.n(k.text)}
        onText={(x) => aendern((y) => (y.text = c.roh(x)), `rm-notiz-${k.id}`)}
        platzhalter="Notiz"
        label={`Randnotiz ${g.nr}`}
        mehrzeilig
        autoFokus={c.fokus === k.id}
      />
      {k.ohneWertung && <span className="bl-ow"> (ohne Wertung)</span>}
      <span className="rm-werkzeug rm-nur-ansicht">
        <Zauberstab stelle={stelle} label="Notiz mit KI bearbeiten" />
        <Tooltip label="Notiz löschen">
          <ActionIcon size="sm" variant="subtle" color="red" onClick={loeschen} aria-label="Notiz löschen">
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </span>
    </div>
  )
}

/** Eine Stelle im Schülertext – angestrichen und nummeriert (wie `teilHtml` im Druck) */
export function TextTeil({ t, stil }: { t: Textteil; stil: (nr: number | undefined) => ReturnType<typeof markenStil> }): React.JSX.Element {
  if (!t.art) return <Fragment>{t.text}</Fragment>
  const s = t.nr != null ? stil(t.nr) : t.art === 'lob' ? 'lob' : t.art === 'hinweis' ? 'hinweis' : 'fehler'
  return (
    <>
      {t.text && <span className={`bl-m ${s}`}>{t.text}</span>}
      {t.nr != null && (
        <sup className={`bl-nr-t ${s === 'lob' ? 'lob' : ''}`} data-kein-text>
          {s === 'lob' ? '✓' : ''}
          {t.text ? '' : ','}
          {t.nr}
        </sup>
      )}
    </>
  )
}

/**
 * Ein Absatz des Schülertexts mit seinen Randnotizen (29.09.2026). Im Text lässt sich eine
 * Stelle markieren – das Blatt bietet dann an, eine Notiz dazu anzulegen.
 *
 * Jede Notiz steht direkt hinter ihrer Stelle und floatet von dort in den Korrekturrand – so steht
 * sie auf der Höhe ihrer Zeile, genau wie im Druck (`absatzFolge`, CSS in blattLayout.ts).
 */
export default function RandEditor({
  index,
  teile,
  notizen,
  stil,
  verschieben
}: {
  index: number
  teile: Textteil[]
  notizen: NummerierterKommentar[]
  stil: (nr: number | undefined) => ReturnType<typeof markenStil>
  verschieben: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="bl-block bl-abs">
      <div className="bl-text" data-absatz={index}>
        {absatzFolge(teile, notizen).map((x, j) =>
          'teil' in x ? <TextTeil key={j} t={x.teil} stil={stil} /> : <RandNotiz key={x.notiz.k.id} g={x.notiz} verschieben={verschieben} />
        )}
      </div>
    </div>
  )
}
