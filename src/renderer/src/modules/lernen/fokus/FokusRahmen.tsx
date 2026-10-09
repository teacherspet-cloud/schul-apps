/**
 * Vollbild beim Lernen (09.10.2026, Entscheidung der Lehrkraft): Wo Lernende aktiv üben oder arbeiten (Vokabelrunde,
 * Grammatikrunde, Spiele, Mehrspieler-Spiel, digitales Arbeitsblatt, Aufgabe mit Feedback, Schritte einer Reihe),
 * füllt die Übung den ganzen Bildschirm – Kopfzeile, Leisten und Ordner treten zurück. Dazu, wo es geht, der echte
 * Vollbildmodus des Browsers (nicht am iPhone). Reine Ansichten (Mappen, Ergebnisse, Merkzettel) bleiben normal;
 * Onlinetests haben ihre eigene Aufsicht und nutzen das hier nicht.
 *
 *  - Vorgabe aus den Einstellungen (Lesen/Lernen › „Vollbild beim Lernen", an). Die Lehrkraft kann es nicht erzwingen.
 *  - In der Übung: „Vollbild aus" schaltet es NUR für diese Übung ab (die Übung läuft in der normalen Ansicht weiter,
 *    mit „Vollbild an" zum Wiedereinschalten); die nächste Übung folgt wieder der Einstellung. Die Einstellung selbst
 *    ändert sich dadurch nicht.
 *  - „× Beenden" oben rechts und Esc beenden die Übung (`onEnde`, der Stand bleibt gespeichert). Verlässt der Browser
 *    das echte Vollbild (Esc), bleibt die Fokusansicht – mit „Ganzer Bildschirm" zum Zurückholen.
 *  - Endet die Übung (Runde geschafft, Spiel vorbei), verschwindet der Rahmen mit ihr (`aktiv` bzw. Abbau) – zurück zur
 *    vorigen Ansicht, im Fachordner mit dem Zurückblättern. Arbeitsblätter und Feedback-Aufgaben schließen nie von selbst.
 *  - Zurück-Geste: außerhalb des Fachordners ein eigener Eintrag im Verlauf – Zurück verlässt die Fokusansicht, nicht
 *    die Seite. Im Fachordner ist die Übung schon eine eigene Seite (regal/blaettern.tsx): Zurück blättert zurück.
 *
 * Gebaut als Ebene AN ORT UND STELLE (position: fixed, kein Portal): So behalten Übungen ihren Zustand beim Umschalten,
 * Arbeitsblätter laden ihr iframe nicht neu, und die Farben des Fachs (CSS-Variablen der Hülle) gelten weiter.
 * Alles andere auf der Seite wird unsichtbar (visibility), Fenster von Mantine (Portale) bleiben darüber sichtbar.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Button, Group, Tooltip } from '@mantine/core'
import { IconMaximize, IconMinimize, IconX } from '@tabler/icons-react'
import { useDarstellung } from '../../onlinetest/schuelerDarstellung'
import { useOrdnerBlaettern } from '../regal/blaettern'
import { escBeendet, fokusVorgabe, imVollbild, istEigenerEintrag, mitFokus, vollbildAnfordern, vollbildMoeglich, vollbildVerlassen } from './fokusLogik'

const CSS = `
html.sa-fokus-aktiv, html.sa-fokus-aktiv body { overflow: hidden !important; }
html.sa-fokus-aktiv body > :not([data-portal]) { visibility: hidden; }
html.sa-fokus-aktiv .sa-fokus[data-fokus="an"], html.sa-fokus-aktiv [data-verbindung-gestoert], html.sa-fokus-aktiv .sa-vorlese-leiste { visibility: visible; }
/* Was die Ebene umschließt, darf sie nicht an sich binden (transform/filter machen aus „fixed" sonst „im Kasten") */
html.sa-fokus-aktiv :has(.sa-fokus[data-fokus="an"]) { transform: none !important; filter: none !important; perspective: none !important;
  contain: none !important; will-change: auto !important; backdrop-filter: none !important; animation: none !important; }
.sa-fokus[data-fokus="aus"], .sa-fokus[data-fokus="ruht"] { display: contents; }
.sa-fokus[data-fokus="aus"] > .sa-fokus-inhalt, .sa-fokus[data-fokus="ruht"] > .sa-fokus-inhalt { display: contents; }
.sa-fokus[data-fokus="aus"] > .sa-fokus-leiste { display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 4px; }
/* Oben die schmale Leiste (rollt nicht mit), darunter rollt die Übung – so bleiben eigene klebende Leisten der Übung
   (Werkzeuge im Arbeitsblatt, „Einreichen") unter bzw. über ihr und verdecken „× Beenden" nie */
.sa-fokus[data-fokus="an"] { position: fixed; inset: 0; z-index: 190; display: flex; flex-direction: column; overflow: hidden;
  background: var(--mantine-color-body); color: var(--mantine-color-text); outline: none;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);
  animation: sa-fokus-ein .18s ease-out; }
/* Im Vollbild nur ein „Beenden" (09.10.2026): das eigene der Übung weicht dem der Leiste */
.sa-fokus[data-fokus="an"] [data-eigenes-beenden] { visibility: hidden; }
.sa-fokus[data-fokus="an"] > .sa-fokus-leiste { flex: none; display: flex; justify-content: flex-end; gap: 6px; padding: 8px 16px 6px; }
.sa-fokus[data-fokus="an"] > .sa-fokus-inhalt { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch; padding: 0 max(16px, calc((100% - 860px) / 2)) max(16px, env(safe-area-inset-bottom)); }
.sa-fokus[data-fokus="an"][data-fokus-breit] > .sa-fokus-inhalt { padding-left: max(16px, calc((100% - 1200px) / 2)); padding-right: max(16px, calc((100% - 1200px) / 2)); }
.sa-fokus-knopf { backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
@keyframes sa-fokus-ein { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .sa-fokus[data-fokus="an"] { animation: none; } }
html.sa-ruhig .sa-fokus[data-fokus="an"] { animation: none; }
`

/** Ein Rahmen in einem anderen (etwa ein Spiel in einer Übung): nur der äußere zählt */
const Verschachtelt = createContext(false)

/** Gerade gezeigte Fokusansichten (Abbau und Neuaufbau im StrictMode: erst danach aufräumen) */
const gezeigt = new Set<string>()
/** Wurde das echte Vollbild von hier angefordert? Nur dann wird es auch wieder verlassen */
let vonHierVollbild = false
let laufendeNr = 0

/** Die Ebene, die gerade rollt (für Seiten, die sonst `window.scrollTo` nutzen) – sonst null */
export function fokusScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.sa-fokus[data-fokus="an"] > .sa-fokus-inhalt')
}

/** Um `dy` Pixel weiterrollen – in der Fokusansicht in der Ebene, sonst im Fenster */
export function seiteRollenUm(dy: number, behavior: ScrollBehavior = 'smooth'): void {
  const s = fokusScroller()
  if (s) s.scrollBy({ top: dy, behavior })
  else window.scrollTo({ top: window.scrollY + dy, behavior })
}

/** Ganz nach oben – in der Fokusansicht in der Ebene, sonst im Fenster */
export function seiteNachOben(behavior: ScrollBehavior = 'smooth'): void {
  ;(fokusScroller() ?? window).scrollTo({ top: 0, behavior })
}

export interface FokusRahmenProps {
  children: React.ReactNode
  /** Übung beenden (× und Esc); fehlt es, schließen × und Esc nur die Fokusansicht */
  onEnde?: () => void
  /** false: gerade nichts zu üben (Ergebnis, abgeschlossen) – normale Ansicht ohne Knöpfe */
  aktiv?: boolean
  /** Für Tests und Diagnose: welche Übung */
  name: string
  /** Breiter Inhalt (Arbeitsblätter) */
  breit?: boolean
  /** Esc verlässt nur die Fokusansicht, beendet aber nicht (Mehrspieler: ein Tastendruck soll niemanden aus dem Spiel werfen) */
  escNurAnsicht?: boolean
}

export function FokusRahmen(p: FokusRahmenProps): React.JSX.Element {
  const innen = useContext(Verschachtelt)
  if (innen) return <>{p.children}</>
  return <FokusEbene {...p} />
}

function FokusEbene({ children, onEnde, aktiv = true, name, breit = false, escNurAnsicht = false }: FokusRahmenProps): React.JSX.Element {
  const vorgabe = fokusVorgabe(useDarstellung((s) => s.d.vollbild))
  // Nur für diese Übung – die Einstellung bleibt, wie sie ist
  const [an, setAn] = useState(vorgabe)
  const [echt, setEcht] = useState(() => imVollbild(document))
  const id = useRef('')
  if (!id.current) id.current = `f${Date.now().toString(36)}${++laufendeNr}`
  // Im Fachordner als eigene Seite geöffnet: Zurück blättert dort zurück, kein eigener Eintrag im Verlauf
  const ordner = useOrdnerBlaettern()
  const ordnerSeite = useRef((ordner?.tiefe ?? 0) > 0).current
  const ebene = useRef<HTMLDivElement>(null)
  const endeRef = useRef(onEnde)
  endeRef.current = onEnde
  // „Vollbild an" fordert das echte Vollbild selbst im Klick an (Geste) – der Effekt dann nicht noch einmal
  const schonAngefordert = useRef(false)
  const vollbildEnde = useRef(0)
  const zeigen = an && aktiv

  // Beenden mit eigenem Eintrag im Verlauf: erst den Eintrag zurücknehmen, dann beenden – sonst landete ein „Zurück"
  // der Übung (etwa Mehrspieler: Spiel verlassen) nur auf der Seite selbst
  const endeNachZurueck = useRef<(() => void) | null>(null)
  const beenden = (): void => {
    const ende = endeRef.current
    if (!ende) return setAn(false)
    if (!ordnerSeite && istEigenerEintrag(window.history.state, id.current)) {
      endeNachZurueck.current = ende
      window.history.back()
    } else ende()
  }

  useEffect(() => {
    if (!zeigen) return
    const fid = id.current
    gezeigt.add(fid)
    document.documentElement.classList.add('sa-fokus-aktiv')
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!ebene.current?.contains(document.activeElement)) ebene.current?.focus({ preventScroll: true })
    if (!schonAngefordert.current && vollbildAnfordern(document)) vonHierVollbild = true
    schonAngefordert.current = false
    if (!ordnerSeite && !istEigenerEintrag(window.history.state, fid)) window.history.pushState(mitFokus(window.history.state, fid), '', window.location.href)

    // Zurück-Geste: Fokusansicht verlassen, die Übung läuft normal weiter
    const zurueck = (): void => {
      if (ordnerSeite || istEigenerEintrag(window.history.state, fid)) return
      const ende = endeNachZurueck.current
      endeNachZurueck.current = null
      if (ende) ende()
      else setAn(false)
    }
    const taste = (e: KeyboardEvent): void => {
      const ziel = e.target instanceof Element ? e.target : null
      const inFenster = Boolean(
        ziel && ((ziel.closest('[data-portal]') && !ebene.current?.contains(ziel)) || ziel.closest('[aria-expanded="true"]'))
      )
      if (
        !escBeendet({
          key: e.key,
          behandelt: e.defaultPrevented || e.isComposing,
          inFenster,
          vollbild: imVollbild(document),
          seitVollbildEnde: Date.now() - vollbildEnde.current
        })
      )
        return
      e.preventDefault()
      if (escNurAnsicht) setAn(false)
      else beenden()
    }
    const wechsel = (): void => {
      const jetzt = imVollbild(document)
      if (!jetzt) vollbildEnde.current = Date.now()
      setEcht(jetzt)
    }
    window.addEventListener('popstate', zurueck)
    window.addEventListener('keydown', taste)
    document.addEventListener('fullscreenchange', wechsel)
    document.addEventListener('webkitfullscreenchange', wechsel)
    return () => {
      window.removeEventListener('popstate', zurueck)
      window.removeEventListener('keydown', taste)
      document.removeEventListener('fullscreenchange', wechsel)
      document.removeEventListener('webkitfullscreenchange', wechsel)
      gezeigt.delete(fid)
      if (!gezeigt.size) document.documentElement.classList.remove('sa-fokus-aktiv')
      // Erst nach dem Zeichnen aufräumen: Kommt dieselbe Ansicht gleich wieder (StrictMode, schnelles Umschalten), bleibt alles
      setTimeout(() => {
        if (gezeigt.has(fid)) return
        if (istEigenerEintrag(window.history.state, fid)) window.history.back()
        if (!gezeigt.size && vonHierVollbild) {
          vonHierVollbild = false
          vollbildVerlassen(document)
        }
        const fokusWeg = !document.activeElement || document.activeElement === document.body
        if (vorher?.isConnected && fokusWeg) vorher.focus({ preventScroll: true })
      }, 0)
    }
  }, [zeigen]) // eslint-disable-line react-hooks/exhaustive-deps

  const einschalten = (): void => {
    // Im Klick: nur so erlaubt der Browser das echte Vollbild
    if (vollbildAnfordern(document)) vonHierVollbild = true
    schonAngefordert.current = true
    setAn(true)
  }
  const ganzerBildschirm = (): void => {
    if (vollbildAnfordern(document)) vonHierVollbild = true
  }

  const zustand = !aktiv ? 'ruht' : an ? 'an' : 'aus'
  return (
    <Verschachtelt.Provider value>
      <style>{CSS}</style>
      <div
        ref={ebene}
        className="sa-fokus"
        data-fokus={zustand}
        data-fokus-name={name}
        data-fokus-breit={breit || undefined}
        data-fokus-echt={zeigen && echt ? '' : undefined}
        tabIndex={zeigen ? -1 : undefined}
        role={zeigen ? 'region' : undefined}
        aria-label={zeigen ? 'Übung im Vollbild' : undefined}
      >
        {aktiv && (
          <div className="sa-fokus-leiste" data-fokus-leiste>
            {zeigen ? (
              <Group gap={6} wrap="nowrap">
                {!echt && vollbildMoeglich(document) && (
                  <Tooltip label="Ganzen Bildschirm nutzen">
                    <Button className="sa-fokus-knopf" size="compact-sm" variant="default" radius="xl" onClick={ganzerBildschirm} aria-label="Ganzen Bildschirm nutzen" data-fokus-ganz>
                      <IconMaximize size={16} />
                    </Button>
                  </Tooltip>
                )}
                <Button
                  className="sa-fokus-knopf"
                  size="compact-sm"
                  variant="default"
                  radius="xl"
                  leftSection={<IconMinimize size={15} />}
                  onClick={() => setAn(false)}
                  data-fokus-umschalten="aus"
                >
                  Vollbild aus
                </Button>
                <Button className="sa-fokus-knopf" size="compact-sm" variant="default" radius="xl" leftSection={<IconX size={15} />} onClick={beenden} data-fokus-beenden>
                  Beenden
                </Button>
              </Group>
            ) : (
              <Button size="compact-sm" variant="subtle" radius="xl" leftSection={<IconMaximize size={15} />} onClick={einschalten} data-fokus-umschalten="an">
                Vollbild an
              </Button>
            )}
          </div>
        )}
        <div className="sa-fokus-inhalt">{children}</div>
      </div>
    </Verschachtelt.Provider>
  )
}
