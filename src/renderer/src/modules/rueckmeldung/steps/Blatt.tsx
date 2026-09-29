import { ActionIcon, Button, Menu, Tooltip } from '@mantine/core'
import { IconCheck, IconPlus, IconTrash, IconX } from '@tabler/icons-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLaufendeSchluessel } from '../../../shared/auftraege'
import type { Korrekturzeichen } from '../../../shared/korrekturzeichen'
import { newId } from '../../vokabeltest/model/random'
import { einstufungVon, gesamtAusTabelle, gesamtEinstufen, skalenWerte, tabellenSumme, wertText, type SkalenKontext } from '../art'
import {
  AMPEL_FARBE,
  BLATT_CSS,
  BLATT_MASSE,
  blattModell,
  einstufungHtml,
  kastenTitel,
  mitName,
  notizGruppen,
  ohneName,
  SEITEN_HOEHE_MM,
  seitenUmbrueche,
  SYMBOL,
  type BlattEinstufung,
  type KastenAbschnitt,
  type markenStil
} from '../blattLayout'
import { stelleAuftragsSchluessel, type Stelle } from '../feedbackUeberarbeiten'
import type { Abgabe, Bogen, Einschaetzung, Einstufungswert, RandKommentar, Rueckmeldung } from '../model/types'
import { stelleUeberarbeiten } from '../stelleAuftrag'
import { BlattKontext, Editierbar, useBlatt, Zauberstab, type BlattZusammenhang } from './blattTeile'
import RandEditor, { RandNotiz } from './RandEditor'
import ScanEditor from './ScanEditor'
import TeileWertung from './TeileWertung'
import './blatt.css'

/** Abstand zwischen zwei Seiten in der Ansicht (mm) */
const SEITEN_ABSTAND = 10
const MM_PX = 96 / 25.4

/**
 * Das A4-Blatt der Rückmeldung (29.09.2026, Wunsch der Lehrkraft): statt vieler Textfelder eine
 * echte Seite, die genau zeigt, was die Lernenden bekommen – Kopf mit Einstufung, Schülertext mit
 * Korrekturrand (bzw. Scans mit Markern), darunter der Kasten „Rückmeldung".
 *
 * Alles lässt sich direkt auf dem Blatt bearbeiten: Klick in einen Text, auf die Nummer einer
 * Randnotiz (Art, Korrekturzeichen, Textstelle, löschen) oder auf die Einstufung. Eine markierte
 * Stelle im Schülertext wird mit einem Klick zur neuen Notiz. Der Zauberstab erzeugt eine Stelle
 * neu oder überarbeitet sie.
 *
 * Mehrseitig wie im Druck: Das Blatt besteht aus Blöcken (Absätze bzw. Teilblöcke langer Absätze,
 * Abschnitte des Kastens), die nicht zerteilt werden. Die Ansicht misst sie und schiebt einen Block,
 * der nicht mehr passt, auf die nächste Seite – nach denselben Maßen wie der Druck (blattLayout.ts).
 * Lange Absätze zerlegt schon das Modell (`absatzTeilen`), sodass kein Block höher als eine Seite
 * ist und nichts über den Seitenrand ragt.
 */
export default function Blatt({
  r,
  a,
  docId,
  zeichen,
  skala,
  setzeBogen,
  setzeRand,
  markerSetzen,
  setMarkerSetzen
}: {
  r: Rueckmeldung
  a: Abgabe
  docId: string
  zeichen: Korrekturzeichen[]
  skala: SkalenKontext
  setzeBogen: (fn: (b: Bogen) => void, gruppe?: string) => void
  setzeRand: (fn: (rand: RandKommentar[]) => void, gruppe?: string) => void
  markerSetzen: boolean
  setMarkerSetzen: (an: boolean) => void
}): React.JSX.Element {
  const [fokus, setFokus] = useState<string | null>(null)
  const [verschiebt, setVerschiebt] = useState<string | null>(null)
  const [auswahl, setAuswahl] = useState<{ text: string; x: number; y: number } | null>(null)
  const laufend = useLaufendeSchluessel(docId)
  const md = blattModell(r, a, { zeichen, ansicht: true })
  const stil = (nr: number | undefined): ReturnType<typeof markenStil> => (nr != null ? (md.stilVon.get(nr) ?? 'fehler') : 'fehler')

  const c: BlattZusammenhang = {
    r,
    a,
    docId,
    zeichen,
    n: (s) => mitName(s, a),
    roh: (s) => ohneName(s, a),
    setzeBogen,
    setzeRand,
    stab: (s, modus, hinweis) => stelleUeberarbeiten(r, docId, a.id, s, modus, hinweis),
    laeuft: (s) => laufend.has(stelleAuftragsSchluessel(docId, a.id, s)),
    fokus,
    setFokus
  }
  // Fokus nur einmal vergeben (nach dem Anlegen einer Notiz)
  useEffect(() => {
    if (fokus) setFokus(null)
  }, [fokus])
  // Andere Abgabe: Auswahl und Verschieben beenden
  useEffect(() => {
    setAuswahl(null)
    setVerschiebt(null)
  }, [a.id])

  // ---------- Text markieren → Notiz ----------
  const markiert = (): void => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return setAuswahl(null)
    const range = sel.getRangeAt(0)
    const knoten = range.commonAncestorContainer
    const el = knoten instanceof Element ? knoten : knoten.parentElement
    // Nur im Schülertext – nicht in einer Randnotiz (die steht als Float mitten im Absatz)
    if (!el?.closest('.bl-text[data-absatz]') || el.closest('.bl-notiz')) return setAuswahl(null)
    const stueck = range.cloneContents()
    stueck.querySelectorAll('[data-kein-text]').forEach((x) => x.remove())
    const text = (stueck.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return setAuswahl(null)
    if (verschiebt) {
      const id = verschiebt
      setzeRand((rand) => {
        const k = rand.find((x) => x.id === id)
        if (k) k.zitat = ohneName(text, a)
      })
      setVerschiebt(null)
      sel.removeAllRanges()
      return
    }
    const b = range.getBoundingClientRect()
    setAuswahl({ text, x: b.left + b.width / 2, y: b.bottom })
  }
  useEffect(() => {
    if (!auswahl) return
    const weg = (): void => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) setAuswahl(null)
    }
    document.addEventListener('selectionchange', weg)
    return () => document.removeEventListener('selectionchange', weg)
  }, [auswahl])
  const notizAnlegen = (art: RandKommentar['art']): void => {
    if (!auswahl) return
    const id = newId()
    const zitat = ohneName(auswahl.text, a)
    setzeRand((rand) => rand.push({ id, zitat, text: '', art }))
    setFokus(id)
    setAuswahl(null)
    window.getSelection()?.removeAllRanges()
  }

  // ---------- Blöcke ----------
  const bloecke: { key: string; node: React.ReactNode }[] = [{ key: 'kopf', node: <Kopf e={md.kopf.einstufung} titel={md.kopf.titel} unter={md.kopf.unter} name={md.kopf.name} /> }]
  if (md.scans)
    md.scans.forEach((s, i) =>
      bloecke.push({
        key: `scan-${i}`,
        node: <ScanEditor seite={i} src={s.src} notizen={s.notizen} markerSetzen={markerSetzen} gesetzt={() => setMarkerSetzen(false)} />
      })
    )
  else if (md.absaetze) {
    md.absaetze.forEach((abs, i) =>
      bloecke.push({ key: `abs-${i}`, node: <RandEditor index={i} teile={abs.teile} notizen={abs.notizen} stil={stil} verschieben={setVerschiebt} /> })
    )
    notizGruppen(md.ohneStelle, md.gross).forEach((gruppe, k) =>
      bloecke.push({
        key: `ohne-${k}`,
        node: (
          <div className="bl-block bl-ohne">
            <div className="bl-text">{k ? '' : 'Ohne Stelle im Text:'}</div>
            <div className="bl-rand">
              {gruppe.map((g) => (
                <RandNotiz key={g.k.id} g={g} verschieben={setVerschiebt} />
              ))}
            </div>
          </div>
        )
      })
    )
  }
  if (md.kasten.length) {
    bloecke.push({ key: 'luft', node: <div className="bl-block bl-luft" /> })
    md.kasten.forEach((x, i) =>
      bloecke.push({
        key: `k-${x.art}`,
        node: <KastenTeil x={x} erst={i === 0} letzt={i === md.kasten.length - 1} skala={skala} />
      })
    )
  }
  bloecke.push({
    key: 'fuss',
    node: (
      <div className="bl-block bl-fuss">
        {md.legende.map((z, i) => (
          <span key={i}>
            <p>{z}</p>
            <br />
          </span>
        ))}
      </div>
    )
  })

  const { buehne, zoom, lineal, refs, umbruch, seiten } = useSeiten(bloecke.map((b) => b.key))

  const kinder: React.ReactNode[] = []
  for (const b of bloecke) {
    if (umbruch[b.key]) kinder.push(<div key={`u-${b.key}`} className="rm-umbruch" style={{ height: umbruch[b.key] }} />)
    kinder.push(
      <div
        key={b.key}
        ref={(el) => {
          if (el) refs.current.set(b.key, el)
          else refs.current.delete(b.key)
        }}
      >
        {b.node}
      </div>
    )
  }
  const hoehe = `calc(${seiten} * ${BLATT_MASSE.hoehe}mm + ${seiten - 1} * ${SEITEN_ABSTAND}mm)`

  return (
    <BlattKontext.Provider value={c}>
      <style>{BLATT_CSS}</style>
      <div className={`rm-buehne${verschiebt ? ' rm-verschiebt' : ''}`} ref={buehne} data-rm-blatt>
        <div style={{ zoom }}>
          <div className="rm-seiten" style={{ height: hoehe }}>
            {Array.from({ length: seiten }, (_, k) => (
              <div key={k} className="rm-seite" style={{ top: `calc(${k} * (${BLATT_MASSE.hoehe}mm + ${SEITEN_ABSTAND}mm))` }}>
                <div className="rm-seite-linie" />
                {seiten > 1 && (
                  <span className="rm-seite-nr">
                    Seite {k + 1} von {seiten}
                  </span>
                )}
              </div>
            ))}
            <section className={`blatt${md.gross ? ' gross' : ''}`} onMouseUp={markiert} data-rm-rand>
              <div ref={lineal} style={{ position: 'absolute', left: 0, top: 0, width: 1, height: `${SEITEN_HOEHE_MM}mm`, visibility: 'hidden', pointerEvents: 'none' }} />
              {kinder}
            </section>
          </div>
        </div>
      </div>
      {verschiebt && (
        <div className="rm-auswahl" style={{ left: '50%', top: 70, transform: 'translateX(-50%)' }}>
          Neue Textstelle für die Notiz im Schülertext markieren …
          <ActionIcon size="sm" variant="subtle" onClick={() => setVerschiebt(null)} aria-label="Abbrechen">
            <IconX size={14} />
          </ActionIcon>
        </div>
      )}
      {auswahl && (
        <div className="rm-auswahl" style={{ left: auswahl.x, top: auswahl.y }} onMouseDown={(e) => e.preventDefault()} data-rm-auswahl>
          <span style={{ marginRight: 4 }}>Notiz:</span>
          <Button size="compact-xs" color="red" variant="light" onClick={() => notizAnlegen('fehler')} data-rm-notiz-neu="fehler">
            Fehler
          </Button>
          <Button size="compact-xs" color="green" variant="light" onClick={() => notizAnlegen('lob')} data-rm-notiz-neu="lob">
            Lob ✓
          </Button>
          <Button size="compact-xs" color="gray" variant="light" onClick={() => notizAnlegen('hinweis')} data-rm-notiz-neu="hinweis">
            Hinweis
          </Button>
        </div>
      )}
    </BlattKontext.Provider>
  )
}

/**
 * Seiten wie im Druck: Blockhöhen messen, Umbrüche setzen (Abstandhalter vor dem ersten Block
 * einer neuen Seite), Seitenzahl, Zoom auf schmalen Fenstern.
 */
function useSeiten(keys: string[]): {
  buehne: React.RefObject<HTMLDivElement | null>
  zoom: number
  lineal: React.RefObject<HTMLDivElement | null>
  refs: React.RefObject<Map<string, HTMLElement>>
  umbruch: Record<string, number>
  seiten: number
} {
  const buehne = useRef<HTMLDivElement>(null)
  const lineal = useRef<HTMLDivElement>(null)
  const refs = useRef(new Map<string, HTMLElement>())
  const [umbruch, setUmbruch] = useState<Record<string, number>>({})
  const [zoom, setZoom] = useState(1)
  const [, setTakt] = useState(0)

  useLayoutEffect(() => {
    const seite = lineal.current?.offsetHeight ?? 0
    // Verstecktes Programm (display: none): nichts messen
    if (!seite) return
    const f = seite / SEITEN_HOEHE_MM
    const luecke = (BLATT_MASSE.unten + SEITEN_ABSTAND + BLATT_MASSE.oben) * f
    const neu: Record<string, number> = {}
    for (const u of seitenUmbrueche(
      keys.map((k) => refs.current.get(k)?.offsetHeight ?? 0),
      seite
    ))
      neu[keys[u.index]] = Math.round((u.rest + luecke) * 10) / 10
    if (JSON.stringify(neu) !== JSON.stringify(umbruch)) setUmbruch(neu)
  })

  // Größenänderungen ohne neues Zeichnen (Bilder geladen, Schrift da, Fensterbreite)
  useEffect(() => {
    const el = buehne.current
    if (!el) return
    const beobachter = new ResizeObserver(() => {
      const breite = el.clientWidth
      if (breite) setZoom(Math.min(1, Math.max(0.35, (breite - 24) / (BLATT_MASSE.breite * MM_PX))))
      setTakt((t) => t + 1)
    })
    beobachter.observe(el)
    const blatt = el.querySelector('.blatt')
    if (blatt) beobachter.observe(blatt)
    void document.fonts?.ready.then(() => setTakt((t) => t + 1))
    return () => beobachter.disconnect()
  }, [])

  return { buehne, zoom, lineal, refs, umbruch, seiten: 1 + Object.keys(umbruch).length }
}

// ---------- Kopf ----------

function Kopf({ e, titel, unter, name }: { e: BlattEinstufung | null; titel: string; unter: string; name: string }): React.JSX.Element {
  const c = useBlatt()
  const m = c.r.meta
  const art = einstufungVon(m)
  const b = c.a.bogen as Bogen
  const setze = (w: Einstufungswert): void => c.setzeBogen((x) => (x.gesamt = w))
  return (
    <div className="bl-block bl-kopf">
      <div className="bl-kopf-innen">
        <div className="bl-kopf-links">
          <div className="bl-titel">{titel}</div>
          <div className="bl-unter">{unter}</div>
          <div className="bl-name">
            <small>Name</small>
            <b>{name}</b>
          </div>
        </div>
        {gesamtEinstufen(m) && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <div className={`bl-note rm-note-knopf${e?.bestaetigt ? '' : ' vorschlag'}`} role="button" tabIndex={0} aria-label="Einstufung wählen" data-rm-note>
                <small>{e?.skala || 'Einstufung'}</small>
                <span className="bl-note-wert" dangerouslySetInnerHTML={{ __html: e ? einstufungHtml(e) : '–' }} />
                {e && (e.text || e.art === 'ampel') && (
                  <>
                    <br />
                    <span className="bl-note-text">{e.art === 'ampel' ? e.wert : e.text}</span>
                  </>
                )}
                {!e?.bestaetigt && <span className="rm-note-hinweis rm-nur-ansicht">{e ? 'Vorschlag der KI' : 'noch offen'}</span>}
              </div>
            </Menu.Target>
            <Menu.Dropdown>
              {e && !e.bestaetigt && b.gesamt && (
                <>
                  <Menu.Item color="teal" leftSection={<IconCheck size={14} />} onClick={() => setze({ ...b.gesamt!, bestaetigt: true })} data-rm-note-bestaetigen>
                    Vorschlag „{e.wert}“ bestätigen
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              <Menu.Label>{b.gesamt ? `Erfüllungsgrad laut Vorschlag: ${b.gesamt.anteil} %` : 'Einstufung'}</Menu.Label>
              <div className="rm-zeichenwahl">
                {skalenWerte(art).map((v) => (
                  <Tooltip key={v} label={wertText(art, v)} withinPortal>
                    <button
                      type="button"
                      className={b.gesamt?.wert === v ? 'aktiv' : ''}
                      style={art === 'ampel' ? { color: AMPEL_FARBE[v] } : undefined}
                      onClick={() => setze({ anteil: b.gesamt?.anteil ?? 0, ...(b.gesamt?.begruendung ? { begruendung: b.gesamt.begruendung } : {}), wert: v, bestaetigt: true })}
                    >
                      {art === 'ampel' ? '●' : v}
                    </button>
                  </Tooltip>
                ))}
              </div>
              {b.gesamt?.begruendung && <Menu.Label style={{ whiteSpace: 'normal', maxWidth: 260 }}>{b.gesamt.begruendung}</Menu.Label>}
            </Menu.Dropdown>
          </Menu>
        )}
      </div>
    </div>
  )
}

// ---------- Kasten ----------

function Werkzeug({ stelle, plus }: { stelle?: Stelle; plus?: { label: string; onClick: () => void } }): React.JSX.Element {
  return (
    <span className="rm-abschnitt-werkzeug rm-nur-ansicht">
      {plus && (
        <Tooltip label={plus.label}>
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={plus.onClick} aria-label={plus.label}>
            <IconPlus size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      {stelle && <Zauberstab stelle={stelle} />}
    </span>
  )
}

function Weg({ onClick, label = 'Zeile entfernen' }: { onClick: () => void; label?: string }): React.JSX.Element {
  return (
    <Tooltip label={label}>
      <ActionIcon size="sm" variant="subtle" color="red" onClick={onClick} aria-label={label}>
        <IconTrash size={13} />
      </ActionIcon>
    </Tooltip>
  )
}

/** Liste (Stärken, Schritte) mit direkt bearbeitbaren Einträgen */
function Liste({ feld, platzhalter }: { feld: 'staerken' | 'schritte'; platzhalter: string }): React.JSX.Element {
  const c = useBlatt()
  const b = c.a.bogen as Bogen
  const eintraege = b[feld].map((s, k) => (
    <li key={k} className="rm-zeile">
      <Editierbar
        wert={c.n(s)}
        onText={(x) => c.setzeBogen((y) => (y[feld][k] = c.roh(x)), `rm-${c.a.id}-${feld}-${k}`)}
        platzhalter={platzhalter}
        label={`${platzhalter} ${k + 1}`}
        mehrzeilig
        autoFokus={c.fokus === `${feld}-${k}`}
      />
      <span className="rm-zeilen-werkzeug rm-nur-ansicht">
        <Weg onClick={() => c.setzeBogen((y) => y[feld].splice(k, 1))} />
      </span>
    </li>
  ))
  return feld === 'staerken' ? <ul className="bl-staerken">{eintraege}</ul> : <ol>{eintraege}</ol>
}

function KastenTeil({ x, erst, letzt, skala }: { x: KastenAbschnitt; erst: boolean; letzt: boolean; skala: SkalenKontext }): React.JSX.Element {
  const c = useBlatt()
  const b = c.a.bogen as Bogen
  const m = c.r.meta
  const art = einstufungVon(m)
  const kastenLaeuft = c.laeuft({ art: 'kasten' })
  const neueZeile = (feld: 'staerken' | 'schritte'): void => {
    const k = b[feld].length
    c.setzeBogen((y) => y[feld].push(''))
    c.setFokus(`${feld}-${k}`)
  }
  let inhalt: React.ReactNode = null
  let werkzeug: React.ReactNode = null
  let laeuft = false
  switch (x.art) {
    case 'teile':
      inhalt = (
        <>
          <h3>{x.titel}</h3>
          <TeileWertung r={c.r} bogen={b} art={art} skala={skala} setzeBogen={c.setzeBogen} variante="blatt" />
        </>
      )
      break
    case 'tabelle': {
      const t = c.r.tabelle!
      const summe = tabellenSumme(t, b.tabelle)
      const setzeWertung = (id: string, fn: (w: { punkte?: number; stufe?: number; begruendung?: string }) => void, gruppe?: string): void =>
        c.setzeBogen((y) => {
          if (!y.tabelle) y.tabelle = []
          let w = y.tabelle.find((z) => z.kriteriumId === id)
          if (!w) {
            w = { kriteriumId: id }
            y.tabelle.push(w)
          }
          fn(w)
          // Punkte geändert: Die Einstufung folgt als neuer Vorschlag (wieder zu bestätigen)
          if (gesamtEinstufen(m)) y.gesamt = gesamtAusTabelle(t, y, art, skala)
        }, gruppe)
      inhalt = (
        <>
          <h3>{x.titel}</h3>
          <table className="bl-tab" data-rm-wertung>
            <tbody>
              {t.kriterien.map((k) => {
                const w = b.tabelle?.find((z) => z.kriteriumId === k.id)
                return (
                  <tr key={k.id}>
                    <td className="k">
                      {k.bereich && <small>{k.bereich}</small>}
                      {k.kriterium}
                    </td>
                    <td className="e">
                      {k.punkte ? (
                        <>
                          <input
                            className="rm-zahl"
                            type="number"
                            min={0}
                            max={k.punkte}
                            step={0.5}
                            value={w?.punkte ?? ''}
                            placeholder="–"
                            onChange={(e) => {
                              const v = e.currentTarget.value
                              setzeWertung(k.id, (z) => (z.punkte = v === '' ? undefined : Math.min(k.punkte!, Math.max(0, Number(v)))), `rm-w-${k.id}`)
                            }}
                            aria-label={`Punkte ${k.kriterium}`}
                          />{' '}
                          / {k.punkte}
                        </>
                      ) : (
                        <Menu withinPortal position="bottom-start">
                          <Menu.Target>
                            <span className="rm-wahl" role="button" tabIndex={0} aria-label={`Stufe ${k.kriterium}`}>
                              {w?.stufe != null ? (t.stufen[w.stufe] ?? '–') : '–'}
                            </span>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {t.stufen.map((s, n) => (
                              <Menu.Item key={n} onClick={() => setzeWertung(k.id, (z) => (z.stufe = n))}>
                                {s}
                              </Menu.Item>
                            ))}
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </td>
                    <td>
                      <Editierbar
                        wert={c.n(w?.begruendung ?? '')}
                        onText={(v) => setzeWertung(k.id, (z) => (z.begruendung = c.roh(v)), `rm-wb-${k.id}`)}
                        platzhalter="Begründung"
                        label={`Begründung ${k.kriterium}`}
                        mehrzeilig
                      />
                    </td>
                  </tr>
                )
              })}
              {summe.moeglich > 0 && (
                <tr className="summe">
                  <td className="k">Summe</td>
                  <td className="e">
                    {summe.erreicht} / {summe.moeglich}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </>
      )
      break
    }
    case 'staerken':
      laeuft = c.laeuft({ art: 'staerken' })
      werkzeug = <Werkzeug stelle={{ art: 'staerken' }} plus={{ label: 'Stärke hinzufügen', onClick: () => neueZeile('staerken') }} />
      inhalt = (
        <>
          <h3>{x.titel}</h3>
          <Liste feld="staerken" platzhalter="Stärke" />
        </>
      )
      break
    case 'schritte':
      laeuft = c.laeuft({ art: 'schritte' })
      werkzeug = <Werkzeug stelle={{ art: 'schritte' }} plus={{ label: 'Schritt hinzufügen', onClick: () => neueZeile('schritte') }} />
      inhalt = (
        <>
          <h3>{x.titel}</h3>
          <Liste feld="schritte" platzhalter="Schritt" />
        </>
      )
      break
    case 'kriterien':
      werkzeug = (
        <Werkzeug
          plus={{
            label: 'Kriterium hinzufügen',
            onClick: () =>
              c.setzeBogen((y) => {
                y.kriterien.push({ kriterium: '', einschaetzung: 'teilweise' })
                if (y.kriterienStufen) y.kriterienStufen.push(null)
              })
          }}
        />
      )
      inhalt = (
        <>
          <h3>{x.titel}</h3>
          <table className="bl-tab">
            <tbody>
              {b.kriterien.map((k, i) => {
                const stelle: Stelle = { art: 'kriterium', index: i }
                const w = b.kriterienStufen?.[i]
                return (
                  <tr key={i} className={c.laeuft(stelle) ? 'rm-laeuft' : undefined}>
                    <td className="k rm-zeile">
                      <Editierbar
                        wert={c.n(k.kriterium)}
                        onText={(v) => c.setzeBogen((y) => (y.kriterien[i].kriterium = c.roh(v)), `rm-k-${i}`)}
                        platzhalter="Kriterium"
                        label={`Kriterium ${i + 1}`}
                      />
                      <span className="rm-zeilen-werkzeug rm-nur-ansicht">
                        <Zauberstab stelle={stelle} label="Kriterium mit KI bearbeiten" />
                        <Weg
                          label="Kriterium entfernen"
                          onClick={() =>
                            c.setzeBogen((y) => {
                              y.kriterien.splice(i, 1)
                              y.kriterienStufen?.splice(i, 1)
                            })
                          }
                        />
                      </span>
                    </td>
                    <td className="e">
                      {x.mitStufe ? (
                        <Menu withinPortal position="bottom-start">
                          <Menu.Target>
                            <span className={`rm-wahl${w?.bestaetigt ? '' : ' rm-vorschlag'}`} role="button" tabIndex={0} aria-label={`Einstufung ${k.kriterium}`}>
                              {w?.wert ? (art === 'ampel' ? <span className="bl-ampel" style={{ background: AMPEL_FARBE[w.wert] }} /> : wertText(art, w.wert)) : '–'}
                              {w?.wert && !w.bestaetigt && <span className="rm-note-hinweis rm-nur-ansicht">Vorschlag</span>}
                            </span>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {skalenWerte(art).map((v) => (
                              <Menu.Item
                                key={v}
                                leftSection={w?.wert === v ? <IconCheck size={14} /> : <span style={{ width: 14 }} />}
                                onClick={() =>
                                  c.setzeBogen((y) => {
                                    if (!y.kriterienStufen) y.kriterienStufen = y.kriterien.map(() => null)
                                    y.kriterienStufen[i] = { anteil: w?.anteil ?? 0, wert: v, bestaetigt: true }
                                  })
                                }
                              >
                                {wertText(art, v)}
                                {w?.wert === v && !w.bestaetigt ? ' – bestätigen' : ''}
                              </Menu.Item>
                            ))}
                          </Menu.Dropdown>
                        </Menu>
                      ) : (
                        <Menu withinPortal position="bottom-start">
                          <Menu.Target>
                            <span className="rm-wahl" role="button" tabIndex={0} aria-label={`Einschätzung ${k.kriterium}`}>
                              {SYMBOL[k.einschaetzung]} {k.einschaetzung}
                            </span>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {(['sicher', 'teilweise', 'noch nicht'] as Einschaetzung[]).map((v) => (
                              <Menu.Item key={v} onClick={() => c.setzeBogen((y) => (y.kriterien[i].einschaetzung = v))}>
                                {SYMBOL[v]} {v}
                              </Menu.Item>
                            ))}
                          </Menu.Dropdown>
                        </Menu>
                      )}
                    </td>
                    <td>
                      {k.beleg ? '„' : ''}
                      <Editierbar
                        wert={c.n(k.beleg ?? '')}
                        onText={(v) => c.setzeBogen((y) => (y.kriterien[i].beleg = c.roh(v)), `rm-b-${i}`)}
                        platzhalter="Beleg"
                        label={`Beleg ${i + 1}`}
                        mehrzeilig
                      />
                      {k.beleg ? '“' : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )
      break
    case 'ueberarbeitung':
      laeuft = c.laeuft({ art: 'ueberarbeitung' })
      werkzeug = <Werkzeug stelle={{ art: 'ueberarbeitung' }} />
      inhalt = (
        <>
          <h3>{x.titel}</h3>
          <div className="bl-auftrag">
            <p className="bl-zitat">
              „
              <Editierbar
                wert={c.n(b.ueberarbeitung?.zitat ?? '')}
                onText={(v) => c.setzeBogen((y) => (y.ueberarbeitung = { auftrag: y.ueberarbeitung?.auftrag ?? '', zitat: c.roh(v) }), `rm-ue-z-${c.a.id}`)}
                platzhalter="Textstelle (wörtlich)"
                label="Textstelle für den Überarbeitungsauftrag"
                mehrzeilig
              />
              “
            </p>
            <p>
              <Editierbar
                wert={c.n(b.ueberarbeitung?.auftrag ?? '')}
                onText={(v) => c.setzeBogen((y) => (y.ueberarbeitung = { zitat: y.ueberarbeitung?.zitat ?? '', auftrag: c.roh(v) }), `rm-ue-a-${c.a.id}`)}
                platzhalter="Auftrag"
                label="Überarbeitungsauftrag"
                mehrzeilig
              />
            </p>
          </div>
        </>
      )
      break
    case 'schluss':
      laeuft = c.laeuft({ art: 'schluss' })
      werkzeug = <Werkzeug stelle={{ art: 'schluss' }} />
      inhalt = (
        <p className="bl-schluss">
          <Editierbar
            wert={c.n(b.schluss ?? '')}
            onText={(v) => c.setzeBogen((y) => (y.schluss = c.roh(v)), `rm-schluss-${c.a.id}`)}
            platzhalter="Schlusssatz"
            label="Schlusssatz"
            mehrzeilig
          />
        </p>
      )
      break
  }
  return (
    <div className={`bl-block bl-k${erst ? ' erst' : ''}${letzt ? ' letzt' : ''}${laeuft || kastenLaeuft ? ' rm-laeuft' : ''}`} data-rm-abschnitt={x.art}>
      {erst && (
        <div className="bl-k-kopf">
          <span>{kastenTitel(c.a.name.trim() || c.a.kuerzel)}</span>
          <span className="rm-nur-ansicht">
            <Zauberstab stelle={{ art: 'kasten' }} label="Ganze Rückmeldung mit KI bearbeiten" />
          </span>
        </div>
      )}
      {werkzeug}
      {inhalt}
    </div>
  )
}
