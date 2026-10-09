/**
 * Register „Wortliste" im Fachordner (09.10.2026, Wunsch der Lehrkraft; Regeln: shared/wortliste.ts, Server:
 * server/wortliste.ts): alle Wörter, die du in diesem Fach bekommen hast – nach Unit/Abschnitt, neueste zuerst,
 * zum Auf- und Zuklappen. Je Zeile Wort (mit Aussprache, wo das Gerät eine Stimme hat oder es eine Aufnahme gibt),
 * Bedeutung und ein Punkt für deinen Stand; der Beispielsatz klappt beim Antippen auf.
 * Suche oben: sofort, in beiden Sprachen und im Beispielsatz, ohne Rücksicht auf Groß/klein und Akzente.
 * Schnell auch bei 2000 Wörtern: Suchtexte einmal je Liste, Filter gemerkt, höchstens GRENZE Zeilen auf einmal.
 */
import { ActionIcon, Button, Loader, Stack, Text } from '@mantine/core'
import { IconVolume } from '@tabler/icons-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { STATUS_NAME, suchindex, wortlisteFiltern, type Wortliste as Liste, type WortlisteWort, type WortStatus } from '@shared/wortliste'
import { holen } from '../../onlinetest/serverApi'
import { kannSprechen, sprich } from '../VokabelTrainer'
import { medienErgaenzen, medium } from '../medienCache'
import { beschriftung } from './beschriftung'
import type { FachOrdner } from './regalDaten'

const GRENZE = 300

const CSS = `
.wl-legende { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .8rem; opacity: .8; }
.wl-legende span { display: inline-flex; align-items: center; gap: 5px; }
.wl-punkt { flex: none; width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--wl-f); display: inline-block; box-sizing: border-box; }
.wl-punkt[data-wort-status="neu"] { --wl-f: #868e96; background: transparent; }
.wl-punkt[data-wort-status="aufbau"] { --wl-f: #e8590c; background: linear-gradient(90deg, var(--wl-f) 50%, transparent 50%); }
.wl-punkt[data-wort-status="sicher"] { --wl-f: #2b8a3e; background: var(--wl-f); }
.wl-zeile { display: grid; grid-template-columns: 14px minmax(0, 1fr) 30px; align-items: center; gap: 2px 10px;
  padding: 5px 4px; border-bottom: 1px solid var(--og-linie, rgba(0,0,0,.08)); }
.wl-paar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2px 10px; align-items: baseline; min-width: 0;
  border: 0; background: transparent; color: inherit; font: inherit; text-align: left; padding: 0; }
button.wl-paar { cursor: pointer; border-radius: 6px; }
button.wl-paar:focus-visible { outline: 2px solid var(--og-akzent); outline-offset: 2px; }
.wl-wort { font-weight: 700; overflow-wrap: anywhere; }
.wl-bed { overflow-wrap: anywhere; }
.wl-beispiel { grid-column: 2 / -1; font-size: .9rem; padding: 2px 0 4px; display: flex; gap: 6px; align-items: flex-start; }
.wl-pos { font-weight: 400; opacity: .6; font-size: .85em; margin-left: 4px; }
@media (max-width: 560px) {
  .wl-paar { grid-template-columns: minmax(0, 1fr); }
  .wl-bed { opacity: .85; }
}
`

/** Punkt für den eigenen Stand – Form und Farbe (leer, halb, voll), dazu der Name für Vorlesehilfen */
function Punkt({ s }: { s: WortStatus }): React.JSX.Element {
  return <span className="wl-punkt" data-wort-status={s} role="img" aria-label={`Stand: ${STATUS_NAME[s]}`} title={STATUS_NAME[s]} />
}

/** Wort (mit Wortart) und Bedeutung */
const paar = (w: WortlisteWort): React.JSX.Element => (
  <>
    <span className="wl-wort">
      {w.term}
      {w.pos && <span className="wl-pos">{w.pos}</span>}
    </span>
    <span className="wl-bed">{w.translation}</span>
  </>
)

export default function Wortliste({ o }: { o: FachOrdner }): React.JSX.Element {
  const ids = o.vokabeln.map((v) => v.id)
  const schluessel = `${o.fach}|${ids.join(',')}`
  const [d, setD] = useState<Liste | null>(null)
  const [fehler, setFehler] = useState('')
  useEffect(() => {
    let aktiv = true
    const q = new URLSearchParams({ fach: o.fach })
    for (const id of ids) q.append('id', id)
    void holen<Liste>(`/s/api/wortliste?${q.toString()}`).then(
      (x) => aktiv && setD(x),
      (e: unknown) => aktiv && setFehler(e instanceof Error ? e.message : String(e))
    )
    return () => {
      aktiv = false
    }
  }, [schluessel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Aussprache: Aufnahmen der Medienbank dazuladen (ohne die des Trainers zu verwerfen); Stimmen kommen u. U. später
  const [, setNeu] = useState(0)
  useEffect(() => {
    if (!d?.sprache) return
    const terme = d.gruppen.flatMap((g) => g.woerter.map((w) => w.term)).slice(0, 600)
    void medienErgaenzen(d.sprache, terme).then(() => setNeu((n) => n + 1))
    const s = (): void => setNeu((n) => n + 1)
    window.speechSynthesis?.addEventListener?.('voiceschanged', s)
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', s)
  }, [d])

  const [suche, setSuche] = useState('')
  const verzoegert = useDeferredValue(suche)
  const index = useMemo(() => (d ? suchindex(d.gruppen) : null), [d])
  const treffer = useMemo(() => (d && index ? wortlisteFiltern(d.gruppen, verzoegert, index) : null), [d, index, verzoegert])
  const [offen, setOffen] = useState<Record<string, boolean>>({})
  const [beispiel, setBeispiel] = useState<string | null>(null)
  const [grenze, setGrenze] = useState(GRENZE)
  useEffect(() => setGrenze(GRENZE), [verzoegert])

  if (fehler) return <Text c="dimmed">{fehler}</Text>
  if (!d || !treffer) return <Loader size="sm" />
  const s = beschriftung(o.fach)
  const sprechen = Boolean(d.sprache) && kannSprechen(d.sprache)
  const tonDa = (w: WortlisteWort): boolean => sprechen || Boolean(medium(w.term.trim())?.ton?.url)
  const gesamt = d.gruppen.reduce((n, g) => n + g.woerter.length, 0)
  if (!gesamt)
    return (
      <Text c="dimmed" data-wortliste-leer>
        Hier stehen bald alle Wörter, die du in diesem Fach lernst – sobald deine Lehrkraft welche freigibt.
      </Text>
    )
  const sucht = Boolean(verzoegert.trim())
  let gezeigt = 0
  return (
    <Stack gap="xs" data-wortliste>
      <style>{CSS}</style>
      <input
        type="search"
        className="og-suche"
        value={suche}
        onChange={(e) => setSuche(e.currentTarget.value)}
        placeholder={`Wort suchen – ${s.sprache ? `${s.fach} oder Deutsch` : 'Wort oder Bedeutung'} …`}
        aria-label="Wortliste durchsuchen"
        data-wortliste-suche
      />
      <Text size="sm" c="dimmed" aria-live="polite" data-wortliste-anzahl={treffer.anzahl}>
        {sucht
          ? treffer.anzahl
            ? `${treffer.anzahl} Treffer`
            : `Nichts gefunden zu „${verzoegert.trim()}“.`
          : `${gesamt} ${gesamt === 1 ? 'Wort' : 'Wörter'}`}
      </Text>
      <div className="wl-legende" aria-hidden>
        {(['neu', 'aufbau', 'sicher'] as const).map((x) => (
          <span key={x}>
            <span className="wl-punkt" data-wort-status={x} />
            {STATUS_NAME[x]}
          </span>
        ))}
      </div>
      {treffer.gruppen.map((g, i) => {
        // Neueste Gruppe offen; bei einer Suche alle mit Treffern
        const auf = sucht || (offen[g.key] ?? i === 0)
        const zeilen = auf ? g.woerter.slice(0, Math.max(0, grenze - gezeigt)) : []
        gezeigt += zeilen.length
        return (
          <div key={g.key} data-wortliste-gruppe={g.titel} data-offen={auf}>
            <button
              type="button"
              className="og-jahr"
              aria-expanded={auf}
              disabled={sucht}
              onClick={() => setOffen({ ...offen, [g.key]: !auf })}
            >
              <span aria-hidden>{auf ? '▾' : '▸'}</span>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{g.titel}</span>
              <span className="og-jahr-zahl">{g.woerter.length}</span>
            </button>
            {zeilen.map((w) => {
              const k = `${g.key}|${w.id}`
              const zu = beispiel !== k
              return (
                <div key={w.id} className="wl-zeile" data-wortliste-wort={w.term}>
                  <Punkt s={w.status} />
                  {w.example ? (
                    <button type="button" className="wl-paar" aria-expanded={!zu} onClick={() => setBeispiel(zu ? k : null)} data-wortliste-aufklappen>
                      {paar(w)}
                    </button>
                  ) : (
                    <div className="wl-paar">{paar(w)}</div>
                  )}
                  <span className="wl-ton">
                    {tonDa(w) && (
                      <ActionIcon variant="subtle" size="md" onClick={() => sprich(w.term, d.sprache)} aria-label={`${w.term} anhören`} data-wortliste-anhoeren>
                        <IconVolume size={16} />
                      </ActionIcon>
                    )}
                  </span>
                  {!zu && w.example && (
                    <div className="wl-beispiel" data-wortliste-beispiel>
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" fs="italic">
                          {w.example}
                        </Text>
                        {w.exampleTranslation && (
                          <Text size="sm" c="dimmed">
                            {w.exampleTranslation}
                          </Text>
                        )}
                      </div>
                      {sprechen && (
                        <ActionIcon variant="subtle" size="sm" onClick={() => sprich(w.example!, d.sprache)} aria-label="Beispielsatz anhören">
                          <IconVolume size={14} />
                        </ActionIcon>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {treffer.anzahl > grenze && gezeigt >= grenze && (
        <Button variant="subtle" size="xs" w="fit-content" onClick={() => setGrenze((x) => x + GRENZE)} data-wortliste-mehr>
          Weitere Wörter zeigen
        </Button>
      )}
    </Stack>
  )
}
