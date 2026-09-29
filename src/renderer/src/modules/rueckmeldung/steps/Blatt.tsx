import { ActionIcon, Button, Menu, Tooltip } from '@mantine/core'
import { IconCheck, IconPlus, IconTrash, IconX } from '@tabler/icons-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLaufendeSchluessel } from '../../../shared/auftraege'
import type { Korrekturzeichen } from '../../../shared/korrekturzeichen'
import { newId } from '../../vokabeltest/model/random'
import { einstufungVon, gesamtAusTabelle, gesamtEinstufen, skalenWerte, wertText, type SkalenKontext } from '../art'
import {
  AMPEL_FARBE,
  BLATT_CSS,
  BLATT_MASSE,
  blattBloecke,
  blattModell,
  einstufungHtml,
  kastenTitel,
  leererPlan,
  mitName,
  planCss,
  ohneName,
  RASTER_KOPF,
  SEITE_NUTZ_MM,
  SEITEN_HOEHE_MM,
  SYMBOL,
  tabellenZeilen,
  type BlattBlock,
  type BlattEinstufung,
  type markenStil,
  type SeitenPlan
} from '../blattLayout'
import { stelleAuftragsSchluessel, type Stelle } from '../feedbackUeberarbeiten'
import type { Abgabe, Bogen, Einschaetzung, Einstufungswert, RandKommentar, Rueckmeldung } from '../model/types'
import { seitenPlanen } from '../seitenPlan'
import { blockeMessen, LINEAL_MM, masseVon, MAX_DURCHGAENGE, mitSchnitt, notizenPlanen } from '../seitenMessen'
import { stelleUeberarbeiten } from '../stelleAuftrag'
import { BlattKontext, Editierbar, useBlatt, Zauberstab, type BlattZusammenhang } from './blattTeile'
import RandEditor, { RandNotiz } from './RandEditor'
import ScanEditor from './ScanEditor'
import TeileWertung from './TeileWertung'
import './blatt.css'

/** Abstand zwischen zwei Seiten in der Ansicht (mm) */
const SEITEN_ABSTAND = 10
const MM_PX = 96 / 25.4
/** Vom Ende des Seiteninhalts bis zum Anfang der nächsten Seite (mm): ungenutzter Rest, Rand unten, Abstand, Rand oben */
const LUECKE = SEITEN_HOEHE_MM - SEITE_NUTZ_MM + BLATT_MASSE.unten + SEITEN_ABSTAND + BLATT_MASSE.oben

type KastenBlock = Extract<BlattBlock, { art: 'k' }>

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
 * Seiten wie im Druck (29.09.2026 nachts, EINE Paginierung): Das Blatt besteht aus Blöcken
 * (`blattBloecke`). Nach jedem Zeichnen wird gemessen (seitenMessen.ts) und nach den Regeln in
 * seitenPlan.ts entschieden, wo eine Seite endet – ein Absatz wird an der Zeile geteilt, eine
 * Tabelle zwischen zwei Zeilen; Randnotizen, die unten nicht mehr passen, weichen nach oben aus.
 * Das PDF misst dasselbe Druck-HTML in einem unsichtbaren Rahmen nach denselben Regeln – so haben
 * Ansicht und PDF dieselben Seiten. Solange ein Text bearbeitet wird, bleibt der Plan stehen (sonst
 * spränge die Schreibmarke); danach wird neu gemessen.
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
  const md = blattModell(r, a, { zeichen, ansicht: true, vorteilen: false })
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

  // ---------- Seiten ----------
  const { buehne, blatt, lineal, zoom, plan, weiterMessen, vonVorn } = useSeitenPlan(blattInhalt(r, a, zeichen.length))
  const bloecke = blattBloecke(r, a, md, plan.schnitte, true)
  const anfang = new Map(plan.seiten.map((s) => [s.start, s.rest]))
  const seiten = 1 + plan.seiten.filter((s) => bloecke.some((b) => b.key === s.start)).length

  const knoten = (b: BlattBlock): React.ReactNode => {
    switch (b.art) {
      case 'kopf':
        return <Kopf e={md.kopf.einstufung} titel={md.kopf.titel} unter={md.kopf.unter} name={md.kopf.name} />
      case 'scan':
        return <ScanEditor seite={b.seite} src={b.src} notizen={b.notizen} markerSetzen={markerSetzen} gesetzt={() => setMarkerSetzen(false)} />
      case 'abs':
        return <RandEditor index={b.index} teile={b.teile} notizen={b.notizen} stil={stil} verschieben={setVerschiebt} />
      case 'ohne':
        return (
          <div className="bl-block bl-ohne">
            <div className="bl-text">{b.erst ? 'Ohne Stelle im Text:' : ''}</div>
            <div className="bl-rand">
              {b.notizen.map((g) => (
                <RandNotiz key={g.k.id} g={g} verschieben={setVerschiebt} />
              ))}
            </div>
          </div>
        )
      case 'luft':
        return <div className="bl-block bl-luft" />
      case 'k':
        return <KastenTeil teil={b} skala={skala} />
      case 'fuss':
        return (
          <div className="bl-block bl-fuss">
            {md.legende.map((z, i) => (
              <span key={i}>
                <p>{z}</p>
                <br />
              </span>
            ))}
          </div>
        )
    }
  }

  const kinder: React.ReactNode[] = []
  for (const b of bloecke) {
    const rest = anfang.get(b.key)
    if (rest != null && kinder.length) {
      // Abstand bis zum Anfang der nächsten Seite; standen Randnotizen über (nach oben gerückt), ist er kleiner
      const abstand = rest + LUECKE
      kinder.push(<div key={`u-${b.key}`} className="rm-umbruch" style={{ height: `${Math.max(0, abstand)}mm`, marginTop: `${Math.min(0, abstand)}mm` }} />)
    }
    kinder.push(
      <div key={b.key} data-bl={b.key} data-bl-basis={b.basis} data-bl-von={b.von} data-bl-art={b.art}>
        {knoten(b)}
      </div>
    )
  }
  const hoehe = `calc(${seiten} * ${BLATT_MASSE.hoehe}mm + ${seiten - 1} * ${SEITEN_ABSTAND}mm)`
  const bereich = `[data-rm-blatt-id="${a.id.replace(/[^\w-]/g, '')}"]`

  return (
    <BlattKontext.Provider value={c}>
      <style>{BLATT_CSS}</style>
      {(Object.keys(plan.notizen).length > 0 || Object.keys(plan.kappen).length > 0) && <style>{planCss(plan, bereich)}</style>}
      <div className={`rm-buehne${verschiebt ? ' rm-verschiebt' : ''}`} ref={buehne} data-rm-blatt data-rm-seiten={seiten}>
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
            <section
              className={`blatt${md.gross ? ' gross' : ''}`}
              ref={blatt}
              onMouseUp={markiert}
              onBlur={weiterMessen}
              onLoadCapture={vonVorn}
              data-rm-rand
              data-rm-blatt-id={a.id.replace(/[^\w-]/g, '')}
            >
              <div ref={lineal} style={{ position: 'absolute', left: 0, top: 0, width: 1, height: `${LINEAL_MM}mm`, visibility: 'hidden', pointerEvents: 'none' }} />
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

/** Was auf dem Blatt steht – ändert es sich, beginnt der Seitenplan von vorn (Elternfassung, Hinweise u. Ä. stehen nicht darauf) */
function blattInhalt(r: Rueckmeldung, a: Abgabe, zeichen: number): string {
  const { eltern: _e, elternUebersetzt: _u, fehler: _f, hinweise: _h, ...bogen } = a.bogen ?? ({} as Bogen)
  void [_e, _u, _f, _h]
  return JSON.stringify([a.text, bogen, a.name, a.ausgleich, a.scans?.length ?? 0, r.meta, r.tabelle, r.grundlage.titel, r.grundlage.teile, r.grundlage.verrechnung, zeichen])
}

const planLeer = (p: SeitenPlan): boolean => !Object.keys(p.schnitte).length && !p.seiten.length && !Object.keys(p.notizen).length && !Object.keys(p.kappen).length

/**
 * Der Seitenplan der Ansicht: nach jedem Zeichnen messen und planen, bis er steht. Ändert sich der
 * Inhalt (`inhalt`), beginnt der Plan von vorn – aber erst, wenn nichts mehr bearbeitet wird.
 */
function useSeitenPlan(inhalt: string): {
  buehne: React.RefObject<HTMLDivElement | null>
  blatt: React.RefObject<HTMLElement | null>
  lineal: React.RefObject<HTMLDivElement | null>
  zoom: number
  plan: SeitenPlan
  weiterMessen: () => void
  vonVorn: () => void
} {
  const buehne = useRef<HTMLDivElement>(null)
  const blatt = useRef<HTMLElement>(null)
  const lineal = useRef<HTMLDivElement>(null)
  const [plan, setPlan] = useState<SeitenPlan>(leererPlan)
  const [zoom, setZoom] = useState(1)
  // Schriften geladen, Bild geladen: von vorn messen; verlassenes Textfeld: weiter messen
  const [stand, setStand] = useState(0)
  const [, setTakt] = useState(0)
  const zustand = useRef({ sig: '', runden: 0 })
  const sig = `${inhalt}|${zoom}|${stand}`

  useLayoutEffect(() => {
    const el = blatt.current
    const m = lineal.current ? masseVon(lineal.current) : null
    // Verstecktes Programm (display: none): nichts messen
    if (!el || !m) return
    const aktiv = el.ownerDocument.activeElement as HTMLElement | null
    if (aktiv && el.contains(aktiv) && (aktiv.isContentEditable || aktiv.matches('input, textarea, select'))) return
    if (zustand.current.sig !== sig) {
      zustand.current = { sig, runden: 0 }
      if (!planLeer(plan)) {
        setPlan(leererPlan())
        return
      }
    }
    if (++zustand.current.runden > MAX_DURCHGAENGE) return
    const { bloecke, els } = blockeMessen(el, m)
    const erg = seitenPlanen(bloecke)
    if (erg.schnitt) {
      const s = erg.schnitt
      setPlan((p) => mitSchnitt(p, s))
      return
    }
    // Kappen bleiben (gekappt misst der Absatz passend – sonst schaltete der Plan hin und her)
    const neu: SeitenPlan = { ...plan, seiten: erg.seiten, notizen: notizenPlanen(el, els, erg.seiten, m), kappen: { ...plan.kappen, ...erg.kappen } }
    if (JSON.stringify(neu) !== JSON.stringify(plan)) setPlan(neu)
    else zustand.current.runden = 0
  })

  // Fensterbreite → Zoom; Schriften geladen → neu messen
  useEffect(() => {
    const el = buehne.current
    if (!el) return
    const beobachter = new ResizeObserver(() => {
      const breite = el.clientWidth
      if (breite) setZoom(Math.round(Math.min(1, Math.max(0.35, (breite - 24) / (BLATT_MASSE.breite * MM_PX))) * 1000) / 1000)
    })
    beobachter.observe(el)
    void document.fonts?.ready.then(() => setStand((s) => s + 1))
    return () => beobachter.disconnect()
  }, [])

  return {
    buehne,
    blatt,
    lineal,
    zoom,
    plan,
    // Nach dem Bearbeiten (Fokus weg): weiter messen – ein geänderter Inhalt beginnt dann von vorn
    weiterMessen: () => setTakt((t) => t + 1),
    // Ein Bild ist geladen: seine Höhe ist jetzt bekannt – von vorn
    vonVorn: () => setStand((s) => s + 1)
  }
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

/** Liste (Stärken, Schritte) mit direkt bearbeitbaren Einträgen – bzw. ihr Teil auf dieser Seite */
function Liste({ feld, platzhalter, von, bis }: { feld: 'staerken' | 'schritte'; platzhalter: string; von: number; bis: number | null }): React.JSX.Element {
  const c = useBlatt()
  const b = c.a.bogen as Bogen
  const eintraege = b[feld]
    .map((s, k) => ({ s, k }))
    .slice(von, bis ?? undefined)
    .map(({ s, k }) => (
      <li key={k} className="rm-zeile" data-bl-teil>
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
  return feld === 'staerken' ? <ul className="bl-staerken">{eintraege}</ul> : <ol start={von + 1}>{eintraege}</ol>
}

/** Bewertungstabelle als Raster (29.09.2026): Kriterium fett, Beschreibung klein, Punkte rechts, Bereiche als Zwischenzeilen */
function Raster({ skala, von, bis }: { skala: SkalenKontext; von: number; bis: number | null }): React.JSX.Element {
  const c = useBlatt()
  const b = c.a.bogen as Bogen
  const m = c.r.meta
  const art = einstufungVon(m)
  const t = c.r.tabelle!
  const zeilen = tabellenZeilen(c.r, b).slice(von, bis ?? undefined)
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
  return (
    <table className="bl-raster" data-rm-wertung>
      <colgroup>
        <col className="k" />
        <col className="p" />
        <col className="b" />
      </colgroup>
      <thead>
        <tr>
          <th>{RASTER_KOPF[0]}</th>
          <th className="p">{t.kriterien.some((k) => k.punkte) ? RASTER_KOPF[1] : 'Stufe'}</th>
          <th>{RASTER_KOPF[2]}</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map((z, j) => {
          if (z.art === 'bereich')
            return (
              <tr key={`b-${von + j}`} className="bereich" data-bl-teil>
                <td>{z.titel}</td>
                <td className="p">{z.moeglich ? `${String(z.erreicht).replace('.', ',')} / ${z.moeglich}` : ''}</td>
                <td />
              </tr>
            )
          if (z.art === 'summe')
            return (
              <tr key="summe" className="summe" data-bl-teil>
                <td>Summe</td>
                <td className="p">
                  {String(z.erreicht).replace('.', ',')} / {z.moeglich}
                </td>
                <td />
              </tr>
            )
          return (
            <tr key={z.id} data-bl-teil>
              <td>
                {z.bereich && <span className="kb">{z.bereich}</span>}
                <span className="kn">{z.name}</span>
                {z.deskriptor && <span className="kd">{z.deskriptor}</span>}
              </td>
              <td className="p">
                {z.max ? (
                  <>
                    <input
                      className="rm-zahl"
                      type="number"
                      min={0}
                      max={z.max}
                      step={0.5}
                      value={z.punkte ?? ''}
                      placeholder="–"
                      onChange={(e) => {
                        const v = e.currentTarget.value
                        const max = z.max!
                        setzeWertung(z.id, (w) => (w.punkte = v === '' ? undefined : Math.min(max, Math.max(0, Number(v)))), `rm-w-${z.id}`)
                      }}
                      aria-label={`Punkte ${z.name}`}
                    />
                    {` / ${z.max}`}
                  </>
                ) : (
                  <Menu withinPortal position="bottom-start">
                    <Menu.Target>
                      <span className="rm-wahl" role="button" tabIndex={0} aria-label={`Stufe ${z.name}`}>
                        {z.stufeText || '–'}
                      </span>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {t.stufen.map((s, n) => (
                        <Menu.Item key={n} onClick={() => setzeWertung(z.id, (w) => (w.stufe = n))}>
                          {s}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                )}
              </td>
              <td className="b">
                <Editierbar
                  wert={c.n(z.begruendung)}
                  onText={(v) => setzeWertung(z.id, (w) => (w.begruendung = c.roh(v)), `rm-wb-${z.id}`)}
                  platzhalter="Begründung"
                  label={`Begründung ${z.name}`}
                  mehrzeilig
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function KastenTeil({ teil, skala }: { teil: KastenBlock; skala: SkalenKontext }): React.JSX.Element {
  const c = useBlatt()
  const b = c.a.bogen as Bogen
  const m = c.r.meta
  const art = einstufungVon(m)
  const x = teil.abschnitt
  const { von, bis, erst, letzt } = teil
  const anfang = von === 0
  const kastenLaeuft = c.laeuft({ art: 'kasten' })
  const neueZeile = (feld: 'staerken' | 'schritte'): void => {
    const k = b[feld].length
    c.setzeBogen((y) => y[feld].push(''))
    c.setFokus(`${feld}-${k}`)
  }
  const titel = anfang ? <h3>{x.titel}</h3> : null
  let inhalt: React.ReactNode = null
  let werkzeug: React.ReactNode = null
  let laeuft = false
  switch (x.art) {
    case 'teile':
      inhalt = (
        <>
          {titel}
          <TeileWertung r={c.r} bogen={b} art={art} skala={skala} setzeBogen={c.setzeBogen} variante="blatt" />
        </>
      )
      break
    case 'tabelle':
      inhalt = (
        <>
          {titel}
          <Raster skala={skala} von={von} bis={bis} />
        </>
      )
      break
    case 'staerken':
      laeuft = c.laeuft({ art: 'staerken' })
      if (anfang) werkzeug = <Werkzeug stelle={{ art: 'staerken' }} plus={{ label: 'Stärke hinzufügen', onClick: () => neueZeile('staerken') }} />
      inhalt = (
        <>
          {titel}
          <Liste feld="staerken" platzhalter="Stärke" von={von} bis={bis} />
        </>
      )
      break
    case 'schritte':
      laeuft = c.laeuft({ art: 'schritte' })
      if (anfang) werkzeug = <Werkzeug stelle={{ art: 'schritte' }} plus={{ label: 'Schritt hinzufügen', onClick: () => neueZeile('schritte') }} />
      inhalt = (
        <>
          {titel}
          <Liste feld="schritte" platzhalter="Schritt" von={von} bis={bis} />
        </>
      )
      break
    case 'kriterien':
      if (anfang)
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
          {titel}
          <table className="bl-tab">
            <tbody>
              {b.kriterien
                .map((k, i) => ({ k, i }))
                .slice(von, bis ?? undefined)
                .map(({ k, i }) => {
                  const stelle: Stelle = { art: 'kriterium', index: i }
                  const w = b.kriterienStufen?.[i]
                  return (
                    <tr key={i} className={c.laeuft(stelle) ? 'rm-laeuft' : undefined} data-bl-teil>
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
                                {w?.wert ? art === 'ampel' ? <span className="bl-ampel" style={{ background: AMPEL_FARBE[w.wert] }} /> : wertText(art, w.wert) : '–'}
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
          {titel}
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
    <div className={`bl-block bl-k${erst ? ' erst' : ''}${letzt ? ' letzt' : ''}${von ? ' fort' : ''}${laeuft || kastenLaeuft ? ' rm-laeuft' : ''}`} data-rm-abschnitt={x.art}>
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
