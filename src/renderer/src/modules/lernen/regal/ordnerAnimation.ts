/**
 * Ordner aus dem Regal nehmen und aufschlagen (08.10.2026, abgestimmt mit der Lehrkraft) – Gegenstück zum Türübergang
 * (tuer.ts): 1. Der Rücken wird ein Stück aus dem Regal gezogen, 2. er fliegt zur Mitte und dreht sich, bis die
 * Vorderseite zu sehen ist, 3. der Deckel klappt auf und gibt das erste Blatt mit den Ringen frei. Die nächste Seite
 * lädt schon während des Aufklappens. Bei „Ruhige Darstellung" bzw. reduzierter Bewegung nur kurz überblenden.
 */

const CSS = `
.sa-ordner-buehne { position: fixed; inset: 0; z-index: 10000; perspective: 1600px; pointer-events: none; }
.sa-ordner-dunkel { position: absolute; inset: 0; background: rgba(15, 18, 25, 0.55); opacity: 0; }
.sa-ordner-ruecken, .sa-ordner-deckel, .sa-ordner-blatt { position: absolute; left: 0; top: 0; border-radius: 6px; transform-origin: 50% 50%; }
.sa-ordner-ruecken { background: linear-gradient(90deg, color-mix(in srgb, var(--f) 78%, #000), var(--f) 30%, var(--f) 70%, color-mix(in srgb, var(--f) 70%, #000));
  box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.sa-ordner-ruecken::after { content: ''; position: absolute; left: 22%; right: 22%; bottom: 9%; height: 13%; border-radius: 999px; background: rgba(0,0,0,.35);
  box-shadow: inset 0 2px 4px rgba(0,0,0,.5); }
.sa-ordner-deckel { background: linear-gradient(135deg, var(--f), color-mix(in srgb, var(--f) 75%, #000)); transform-origin: 0% 50%;
  box-shadow: 0 20px 60px rgba(0,0,0,.45), inset 0 0 0 2px rgba(255,255,255,.12); backface-visibility: hidden; }
.sa-ordner-deckel::before { content: ''; position: absolute; left: 12%; right: 12%; top: 12%; height: 22%; border-radius: 6px; background: rgba(255,255,255,.85); }
.sa-ordner-blatt { background: #fdfcf7; box-shadow: 0 20px 60px rgba(0,0,0,.4); opacity: 0;
  background-image: repeating-linear-gradient(180deg, transparent 0 27px, rgba(70,110,200,.18) 27px 28px); }
.sa-ordner-blatt::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 18%; border-radius: 6px 0 0 6px;
  background: color-mix(in srgb, var(--f) 80%, #000); }
.sa-ordner-blatt::after { content: ''; position: absolute; left: 11%; top: 30%; width: 16px; height: 40%;
  background: radial-gradient(circle at 50% 8px, #d6d9de 7px, transparent 8px) 0 0 / 16px 33.3% repeat-y; }
`

let gestartet = false

/**
 * `quelle`: der Rücken im Regal (Startlage), `farbe`: Fachfarbe. Danach `ziel` öffnen.
 */
export function mitOrdner(ziel: string, farbe: string, quelle: HTMLElement | null): void {
  const ruhig = document.documentElement.classList.contains('sa-ruhig') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (gestartet) return
  if (ruhig || !quelle || typeof document.body.animate !== 'function') {
    // Nur überblenden
    if (!ruhig || !document.body.animate) return void window.location.assign(ziel)
    gestartet = true
    document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' })
    return void setTimeout(() => window.location.assign(ziel), 150)
  }
  gestartet = true
  const r = quelle.getBoundingClientRect()
  const stil = document.createElement('style')
  stil.textContent = CSS
  const buehne = document.createElement('div')
  buehne.className = 'sa-ordner-buehne'
  buehne.setAttribute('data-ordner-uebergang', '')
  buehne.style.setProperty('--f', farbe)
  buehne.innerHTML = '<div class="sa-ordner-dunkel"></div><div class="sa-ordner-blatt"></div><div class="sa-ordner-ruecken"></div><div class="sa-ordner-deckel"></div>'
  document.head.appendChild(stil)
  document.body.appendChild(buehne)
  const [dunkel, blatt, ruecken, deckel] = [...buehne.children] as HTMLElement[]

  // Ziel: der Ordner liegt groß in der Mitte
  const H = Math.min(window.innerHeight * 0.7, 460)
  const W = Math.min(H * 0.74, window.innerWidth * 0.8)
  const zx = (window.innerWidth - W) / 2
  const zy = (window.innerHeight - H) / 2
  const groesse = (el: HTMLElement, b: number, h: number): void => {
    el.style.width = `${b}px`
    el.style.height = `${h}px`
  }
  groesse(ruecken, r.width, r.height)
  groesse(deckel, W, H)
  groesse(blatt, W, H)
  quelle.style.visibility = 'hidden'

  const lage = (x: number, y: number, extra = ''): string => `translate(${x}px, ${y}px) ${extra}`
  const ease = 'cubic-bezier(.3,.7,.2,1)'
  dunkel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, fill: 'forwards' })
  // 1. Herausziehen (nach vorn, leicht gekippt)
  ruecken.animate(
    [
      { transform: lage(r.left, r.top) },
      { transform: lage(r.left, r.top + 6, 'scale(1.08) rotateX(8deg)'), offset: 0.35 },
      // 2. zur Mitte fliegen und wegdrehen (Kante voraus)
      { transform: lage(zx + W / 2 - r.width / 2, zy + H / 2 - r.height / 2, `scale(${H / r.height}) rotateY(90deg)`) }
    ],
    { duration: 620, easing: ease, fill: 'forwards' }
  )
  // … die Vorderseite dreht sich herein
  deckel.animate(
    [
      { transform: lage(zx, zy, 'rotateY(-90deg)'), opacity: 0 },
      { transform: lage(zx, zy, 'rotateY(-90deg)'), opacity: 1, offset: 0.01 },
      { transform: lage(zx, zy, 'rotateY(0deg)'), opacity: 1 }
    ],
    { duration: 300, delay: 600, easing: 'ease-out', fill: 'both' }
  )
  // 3. Deckel aufklappen, das Blatt mit den Ringen erscheint
  blatt.animate([{ opacity: 0, transform: lage(zx, zy) }, { opacity: 1, transform: lage(zx, zy) }], { duration: 10, delay: 900, fill: 'both' })
  deckel.animate([{ transform: lage(zx, zy, 'rotateY(0deg)') }, { transform: lage(zx, zy, 'rotateY(-165deg)') }], {
    duration: 520,
    delay: 920,
    easing: ease,
    fill: 'forwards',
    composite: 'replace'
  })
  // Schon beim Aufklappen laden – der Browser zeigt den Ordner, bis die neue Seite da ist
  setTimeout(() => window.location.assign(ziel), 1050)
  window.addEventListener(
    'pageshow',
    () => {
      buehne.remove()
      quelle.style.visibility = ''
      gestartet = false
    },
    { once: true }
  )
}

/** Zurück ins Regal: Ordner kurz zuklappen, dann zur Regalseite */
export function ordnerZu(ziel: string, farbe: string): void {
  const ruhig = document.documentElement.classList.contains('sa-ruhig') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (ruhig || gestartet || typeof document.body.animate !== 'function') return void window.location.assign(ziel)
  gestartet = true
  const stil = document.createElement('style')
  stil.textContent = CSS
  const buehne = document.createElement('div')
  buehne.className = 'sa-ordner-buehne'
  buehne.style.setProperty('--f', farbe)
  buehne.innerHTML = '<div class="sa-ordner-deckel"></div>'
  document.head.appendChild(stil)
  document.body.appendChild(buehne)
  const deckel = buehne.firstElementChild as HTMLElement
  const H = Math.min(window.innerHeight * 0.7, 460)
  const W = Math.min(H * 0.74, window.innerWidth * 0.8)
  deckel.style.width = `${W}px`
  deckel.style.height = `${H}px`
  const x = (window.innerWidth - W) / 2
  const y = (window.innerHeight - H) / 2
  deckel.animate(
    [
      { transform: `translate(${x}px, ${y}px) rotateY(-165deg)`, opacity: 0.6 },
      { transform: `translate(${x}px, ${y}px) rotateY(0deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${x}px, ${y + 40}px) scale(.3) rotateY(80deg)`, opacity: 0 }
    ],
    { duration: 520, easing: 'ease-in', fill: 'forwards' }
  )
  setTimeout(() => window.location.assign(ziel), 380)
  window.addEventListener(
    'pageshow',
    () => {
      buehne.remove()
      gestartet = false
    },
    { once: true }
  )
}
