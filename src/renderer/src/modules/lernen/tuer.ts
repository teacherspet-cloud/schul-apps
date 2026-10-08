/**
 * Türübergang (03.10.2026, Befund der Lehrkraft: Bei „Meine Materialien" kam keine Türanimation – das
 * Fenster hellte nur auf und sprang ins Menü). Wie die Türen im Lernraum: Eine Tür in der Fachfarbe
 * schwingt auf, dahinter scheint der Raum – dann öffnet sich das Material. Bei „Ruhige Darstellung"
 * bzw. reduzierter Bewegung geht es ohne Animation sofort weiter.
 */
const CSS = `
.sa-tuer-buehne { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; perspective: 1400px;
  background: rgba(15, 18, 25, 0); animation: sa-tuer-dunkel .75s ease-out forwards; }
.sa-tuer-rahmen { position: relative; width: min(46vw, 230px); height: min(64vh, 330px); border-radius: 10px 10px 0 0; padding: 8px 8px 0;
  background: #3b2f2a; box-shadow: 0 20px 60px rgba(0,0,0,0.45); transform-style: preserve-3d; animation: sa-tuer-ran .75s cubic-bezier(.3,.7,.2,1) forwards; }
.sa-tuer-licht { position: absolute; inset: 8px 8px 0; border-radius: 6px 6px 0 0; background: radial-gradient(circle at 50% 40%, #fffbe6, var(--sa-tuer-farbe) 160%); }
.sa-tuer-blatt { position: absolute; inset: 8px 8px 0; border-radius: 6px 6px 0 0; transform-origin: left center;
  background: linear-gradient(160deg, var(--sa-tuer-farbe), color-mix(in srgb, var(--sa-tuer-farbe) 70%, #000));
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.12); animation: sa-tuer-auf .7s .05s cubic-bezier(.3,.7,.2,1) forwards; }
.sa-tuer-blatt::before, .sa-tuer-blatt::after { content: ''; position: absolute; left: 14%; right: 14%; border-radius: 6px; border: 2px solid rgba(255,255,255,0.18); }
.sa-tuer-blatt::before { top: 10%; height: 34%; } .sa-tuer-blatt::after { top: 52%; height: 38%; }
.sa-tuer-griff { position: absolute; right: 12%; top: 52%; width: 10px; height: 10px; border-radius: 50%; background: #f8d77a; box-shadow: 0 0 0 2px rgba(0,0,0,0.2); }
@keyframes sa-tuer-auf { to { transform: rotateY(-104deg); box-shadow: 18px 0 30px rgba(0,0,0,0.35); } }
@keyframes sa-tuer-ran { to { transform: scale(1.18); } }
@keyframes sa-tuer-dunkel { to { background: rgba(15, 18, 25, 0.55); } }
`

let gestartet = false

/** Tür aufschwingen lassen, dann `ziel` öffnen */
export function mitTuer(ziel: string, farbe = '#ea580c'): void {
  const ruhig = document.documentElement.classList.contains('sa-ruhig') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (ruhig || gestartet) return void window.location.assign(ziel)
  gestartet = true
  const stil = document.createElement('style')
  stil.textContent = CSS
  const buehne = document.createElement('div')
  buehne.className = 'sa-tuer-buehne'
  buehne.setAttribute('data-tuer-uebergang', '')
  buehne.style.setProperty('--sa-tuer-farbe', farbe)
  buehne.innerHTML = '<div class="sa-tuer-rahmen"><div class="sa-tuer-licht"></div><div class="sa-tuer-blatt"><span class="sa-tuer-griff"></span></div></div>'
  document.head.appendChild(stil)
  document.body.appendChild(buehne)
  // Schon während die Tür aufschwingt laden (08.10.2026): Der Browser zeigt die Tür, bis die neue Seite da ist
  setTimeout(() => window.location.assign(ziel), 420)
  // Zurück im Browser (Seite aus dem Zwischenspeicher): Tür wieder entfernen
  window.addEventListener(
    'pageshow',
    () => {
      buehne.remove()
      gestartet = false
    },
    { once: true }
  )
}

/** Für Links: Klick abfangen und mit Tür öffnen (Strg/Mittelklick bleiben normale Links) */
export const tuerKlick =
  (ziel: string, farbe?: string) =>
  (e: React.MouseEvent): void => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    mitTuer(ziel, farbe)
  }
