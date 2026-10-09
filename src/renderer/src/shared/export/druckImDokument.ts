/**
 * Drucken im Browser OHNE neuen Tab (09.10.2026, Befund der Lehrkraft: Am iPad (Opera) und an einem Schul-PC erschien
 * die Druckvorschau, das PDF im neuen Tab blockierte dann aber der Popup-Blocker – gedruckt wurde nichts).
 *
 * Jetzt: Die Seiten des fertigen PDFs werden mit pdf.js zu Bildern (druckSeite.ts `druckBilder`, genau so, wie der
 * Server sie gesetzt hat; Querformat gedreht) und liegen in einem Druckbereich IM AKTUELLEN Dokument – am Bildschirm
 * unsichtbar. `drucken()` schaltet per Klasse am <html> auf „nur der Druckbereich" (@media print blendet die App aus)
 * und ruft window.print() direkt auf – synchron, damit der Aufruf noch als Folge des Tippens/Klicks gilt (Safari/WebKit
 * auf iPad und iPhone, also auch Opera, Chrome und Firefox dort). Deshalb wird VORHER vorbereitet: Bilder erzeugt und
 * dekodiert, bevor der Knopf „Drucken" bereitsteht. Nach dem Druckdialog (afterprint) wird aufgeräumt.
 *
 * „Als PDF sichern" bleibt als zweiter Weg (Herunterladen). App am PC, iPad-App und die Exe „Schul-Apps Online"
 * (Druck-Brücke) drucken weiter auf ihrem eigenen Weg – das hier gilt nur im reinen Browser.
 */
import { druckBilder } from './druckSeite'

const BEREICH_ID = 'sa-druckbereich'
const STIL_ID = 'sa-druckbereich-stil'
const KLASSE = 'sa-druckt'

/*
 * Am Bildschirm ist der Bereich nie zu sehen. Beim Drucken (nur mit der Klasse am <html>) ist er das Einzige: alle
 * anderen Kinder von <body> (App, Mantine-Fenster, Hinweise) fallen weg. Höhe/overflow der App würden sonst auf eine
 * Seite kürzen. Querformat liegt gedreht auf Hochformat – EIN Seitenformat (Safari kennt `@page size` je Seite nicht).
 */
const STIL = `
#${BEREICH_ID} { display: none; }
@media print {
  html.${KLASSE}, html.${KLASSE} body { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; margin: 0 !important; padding: 0 !important; }
  html.${KLASSE} body > *:not(#${BEREICH_ID}) { display: none !important; }
  html.${KLASSE} #${BEREICH_ID} { display: block !important; }
  #${BEREICH_ID} .sa-druckseite { margin: 0 auto; width: 100%; break-inside: avoid; page-break-inside: avoid; break-after: page; page-break-after: always; }
  #${BEREICH_ID} .sa-druckseite:last-child { break-after: auto; page-break-after: auto; }
  #${BEREICH_ID} img { display: block; width: 100%; height: auto; max-height: 100vh; object-fit: contain; margin: 0 auto; }
}
`

function stilEinbauen(): void {
  if (document.getElementById(STIL_ID)) return
  const s = document.createElement('style')
  s.id = STIL_ID
  s.textContent = STIL
  document.head.appendChild(s)
}

let seitenStil: HTMLStyleElement | null = null
let aktiv: DruckVorlage | null = null

export interface DruckVorlage {
  /** Druckdialog öffnen – SYNCHRON im Klick aufrufen */
  drucken: () => boolean
  /** PDF herunterladen („Als PDF sichern") */
  sichern: () => void
  /** Druckbereich entfernen (während eines laufenden Drucks erst nach afterprint) */
  entfernen: () => void
  seiten: number
}

/**
 * Druckbereich aus einem fertigen PDF vorbereiten. Danach liegt er (unsichtbar) im Dokument; eine frühere Vorlage
 * wird ersetzt. Erst wenn das Versprechen erfüllt ist, darf der Knopf „Drucken" bereitstehen.
 */
export async function druckVorbereiten(pdf: Uint8Array, dateiname: string): Promise<DruckVorlage> {
  const bilder = await druckBilder(pdf)
  stilEinbauen()
  const bereich = document.createElement('div')
  bereich.id = BEREICH_ID
  bereich.setAttribute('aria-hidden', 'true')
  bereich.dataset.druckSeiten = String(bilder.length)
  for (const [i, src] of bilder.entries()) {
    const seite = document.createElement('div')
    seite.className = 'sa-druckseite'
    const img = document.createElement('img')
    img.alt = `Seite ${i + 1}`
    img.src = src
    seite.appendChild(img)
    bereich.appendChild(seite)
  }
  // Bilder fertig dekodieren, bevor gedruckt werden kann – sonst druckt Safari leere Seiten
  await Promise.all(Array.from(bereich.querySelectorAll('img')).map((b) => b.decode().catch(() => undefined)))
  const url = URL.createObjectURL(new Blob([new Uint8Array(pdf).slice().buffer], { type: 'application/pdf' }))
  let druckt = false
  let weg = false
  const aufraeumen = (): void => {
    if (weg) return
    weg = true
    bereich.remove()
    // Später freigeben – ein gerade gestartetes Herunterladen braucht die Adresse noch
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    window.removeEventListener('afterprint', nachDruck)
    if (aktiv === vorlage) aktiv = null
  }
  const nachDruck = (): void => {
    if (!druckt) return
    druckt = false
    document.documentElement.classList.remove(KLASSE)
    seitenStil?.remove()
    seitenStil = null
    // Etwas warten: WebKit fängt das Seitenbild teils erst nach dem Ereignis ein
    setTimeout(aufraeumen, 1500)
  }
  const vorlage: DruckVorlage = {
    seiten: bilder.length,
    drucken: () => {
      if (weg) return false
      for (const alt of document.querySelectorAll(`#${BEREICH_ID}`)) if (alt !== bereich) alt.remove()
      if (!bereich.isConnected) document.body.appendChild(bereich)
      // @page nur für diesen Druck – andere Druckwege (z. B. Druckrahmen der Blätter) bleiben unberührt
      seitenStil?.remove()
      seitenStil = document.createElement('style')
      seitenStil.textContent = '@page { size: A4 portrait; margin: 0; }'
      document.head.appendChild(seitenStil)
      document.documentElement.classList.add(KLASSE)
      druckt = true
      window.addEventListener('afterprint', nachDruck)
      try {
        window.print()
      } catch {
        nachDruck()
        return false
      }
      // Browser mit blockierendem print() (Chrome, Edge, Firefox am PC) sind hier schon fertig; afterprint kam dann
      // bereits. Ohne afterprint (manche WebKit-Fassungen) bleibt der Bereich unsichtbar liegen, bis die nächste Vorlage
      // ihn ersetzt – die Klasse fällt nach einer Weile trotzdem, damit ein späteres Strg+P die App druckt.
      setTimeout(() => {
        if (druckt) nachDruck()
      }, 60_000)
      return true
    },
    sichern: () => {
      const a = document.createElement('a')
      a.href = url
      a.download = dateiname
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
    entfernen: () => {
      // Läuft der Druck noch (WebKit kehrt sofort zurück), räumt afterprint auf
      if (!druckt) aufraeumen()
    }
  }
  if (aktiv && aktiv !== vorlage) aktiv.entfernen()
  aktiv = vorlage
  document.body.appendChild(bereich)
  return vorlage
}

/**
 * Drucken ohne Druckvorschau der App (z. B. Ergebnislisten): erst vorbereiten, dann ein kleines Fenster IM Dokument mit
 * „Drucken …" – das Tippen darauf ist die Geste, die Safari für den Druckdialog verlangt. Kein neuer Tab, kein Popup.
 */
export async function druckeMitKnopf(pdf: Promise<Uint8Array>, dateiname: string): Promise<void> {
  const huelle = document.createElement('div')
  huelle.dataset.druckKnopfFenster = ''
  huelle.setAttribute('role', 'dialog')
  huelle.setAttribute('aria-modal', 'true')
  huelle.setAttribute('aria-label', 'Drucken')
  huelle.style.cssText =
    'position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:rgba(0,0,0,.45);font:16px/1.4 -apple-system,system-ui,"Segoe UI",sans-serif'
  const karte = document.createElement('div')
  karte.style.cssText =
    'background:#fff;color:#111;border-radius:14px;padding:20px 22px;width:min(380px,calc(100vw - 32px));box-shadow:0 10px 40px rgba(0,0,0,.3);text-align:center'
  const text = document.createElement('p')
  text.style.cssText = 'margin:0 0 14px'
  text.textContent = 'Druck wird vorbereitet …'
  const knoepfe = document.createElement('div')
  knoepfe.style.cssText = 'display:flex;flex-direction:column;gap:8px'
  const knopf = (beschriftung: string, haupt: boolean): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = beschriftung
    b.style.cssText = `font:600 16px inherit;font-family:inherit;padding:11px 16px;border-radius:10px;border:0;cursor:pointer;touch-action:manipulation;${
      haupt ? 'background:#1c7ed6;color:#fff' : 'background:#f1f3f5;color:#1c3d5a'
    }`
    return b
  }
  const drucken = knopf('Drucken …', true)
  drucken.dataset.druckJetzt = ''
  const sichern = knopf('Als PDF sichern', false)
  const zu = knopf('Schließen', false)
  drucken.disabled = true
  sichern.disabled = true
  drucken.style.opacity = '.5'
  knoepfe.append(drucken, sichern, zu)
  karte.append(text, knoepfe)
  huelle.appendChild(karte)
  document.body.appendChild(huelle)
  let vorlage: DruckVorlage | null = null
  const schliessen = (): void => {
    huelle.remove()
    vorlage?.entfernen()
  }
  zu.addEventListener('click', schliessen)
  try {
    vorlage = await druckVorbereiten(await pdf, dateiname)
  } catch (e) {
    huelle.remove()
    throw e
  }
  if (!huelle.isConnected) return vorlage.entfernen()
  const v = vorlage
  text.textContent = `Bereit: ${v.seiten} ${v.seiten === 1 ? 'Seite' : 'Seiten'}. Im Druckdialog lassen sich Drucker, Exemplare und Doppelseitig wählen.`
  drucken.disabled = false
  sichern.disabled = false
  drucken.style.opacity = '1'
  drucken.addEventListener('click', () => {
    huelle.remove()
    v.drucken()
    v.entfernen()
  })
  sichern.addEventListener('click', () => {
    v.sichern()
    schliessen()
  })
  drucken.focus()
}
