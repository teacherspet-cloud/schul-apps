/**
 * Boss-Arena am Beamer (17.11.2026, Entwurf mit der Lehrkraft abgestimmt): links die Figuren der Klasse (selbst gewählt,
 * ohne Namen, gleiche Figur mit Farbring), rechts das Monster vor dem Hintergrund seiner Welt. Der Server schickt den
 * Stand und die letzten Ereignisse mit laufender Nummer; neue Ereignisse werden hier abgespielt – höchstens eins je
 * 250 ms, viele Treffer hintereinander als Kombo. Nach dem Öffnen bzw. einer Neuverbindung wird nichts nachgespielt.
 * Barrierearm: „Bewegung reduzieren" schaltet Wackeln und Sprünge ab; nie mehr als drei Lichtblitze je Sekunde.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { BBlockBoss, BossEreignis } from '@shared/klassenspiel/kern'
import { bossBild, figurBild, type FigurPose } from './bossBilder'
import { klangbild } from './klangbild'

const RING_FARBEN = ['#f59e0b', '#38bdf8', '#f472b6', '#a3e635', '#c084fc', '#fb7185', '#2dd4bf', '#facc15']

const CSS = `
.ba-rahmen { position: relative; width: min(100%, calc((100vh - 170px) * 16 / 9)); aspect-ratio: 16 / 9; margin: 0 auto; overflow: hidden; border-radius: 18px;
  background: #1d2246 center / cover no-repeat; container-type: inline-size; color: #eef1ff; user-select: none }
.ba-rahmen.ba-wackeln { animation: ba-wackeln .35s }
@keyframes ba-wackeln { 20% { transform: translate(-1%, .4%) } 40% { transform: translate(.8%, -.5%) } 60% { transform: translate(-.5%, .2%) } 80% { transform: translate(.3%, 0) } }
.ba-hud { position: absolute; inset: 0 0 auto; display: grid; grid-template-columns: 1fr auto 1fr; gap: 3cqi; align-items: start; padding: 1.6cqi 2.2cqi 4cqi;
  background: linear-gradient(#0b0f22d0, transparent); z-index: 40; font-weight: 800 }
.ba-name { font-size: 2.2cqi; display: flex; justify-content: space-between; gap: 1cqi; align-items: baseline; text-shadow: 0 .2cqi 0 #000a }
.ba-name small { font-size: 1.3cqi; font-weight: 600; opacity: .85; font-variant-numeric: tabular-nums }
.ba-leiste { height: 1.8cqi; border-radius: 99px; background: #0b0f22; position: relative; overflow: hidden; border: .2cqi solid #ffffff38; margin-top: .4cqi }
.ba-leiste i { position: absolute; top: 0; bottom: 0; border-radius: 99px }
.ba-geist { background: #fff; opacity: .8; transition: width .6s .45s ease-out }
.ba-wert { transition: width .25s }
.ba-phasen { display: flex; gap: .5cqi; justify-content: flex-end; margin-top: .5cqi } .ba-phasen b { width: 2.4cqi; height: .6cqi; border-radius: 3px; background: #ffffff30 } .ba-phasen b.an { background: #fbbf24 }
.ba-mitte { text-align: center; font-size: 1.3cqi; opacity: .9 } .ba-mitte b { display: block; font-size: 2.6cqi; font-variant-numeric: tabular-nums }
.ba-platz { position: absolute; transform: translateX(-50%); display: flex; align-items: flex-end; justify-content: center; pointer-events: none }
.ba-platz img.ba-fig { height: 100%; width: auto; display: block; filter: drop-shadow(0 1cqi .5cqi #0008); transition: filter .2s }
.ba-platz.ba-s2 img.ba-fig, .ba-platz.ba-s3 img.ba-fig, .ba-platz.ba-s4 img.ba-fig { filter: drop-shadow(0 0 .9cqi #67e8f9) drop-shadow(0 1cqi .5cqi #0008) }
.ba-platz.ba-s5 img.ba-fig { filter: drop-shadow(0 0 1.2cqi #fbbf24) drop-shadow(0 0 .4cqi #fde68a) drop-shadow(0 1cqi .5cqi #0008) }
.ba-platz img.ba-fig.ba-weiss { filter: brightness(2.2) saturate(.3) }
.ba-platz img.ba-fig.ba-rot { filter: sepia(1) saturate(5) hue-rotate(-25deg) }
.ba-platz img.ba-fig.ba-blau { filter: drop-shadow(0 0 1.4cqi #38bdf8) brightness(1.15) }
.ba-platz img.ba-fig.ba-gruen { filter: drop-shadow(0 0 1.4cqi #4ade80) brightness(1.15) }
.ba-platz img.ba-fig.ba-gold { filter: drop-shadow(0 0 1.4cqi #fde047) brightness(1.25) }
.ba-ring { position: absolute; left: 50%; bottom: -1.5%; width: 70%; height: 9%; transform: translateX(-50%); border-radius: 50%; border: .35cqi solid; opacity: .9 }
.ba-plattform { position: absolute; left: 50%; bottom: -3%; width: 85%; height: 12%; transform: translateX(-50%); border-radius: 50%;
  background: radial-gradient(#fde68a, #b45309 60%, transparent 72%); opacity: .75 }
.ba-schatten { position: absolute; left: 50%; bottom: -2%; width: 65%; height: 8%; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(#000b, transparent 70%) }
.ba-abzeichen { position: absolute; left: 50%; top: -14%; width: 28%; transform: translateX(-50%); animation: ba-schweben 2s ease-in-out infinite }
.ba-begleiter { position: absolute; right: -14%; top: 18%; font-size: 2.2cqi; animation: ba-schweben 1.6s ease-in-out infinite }
@keyframes ba-schweben { 50% { transform: translate(-50%, -12%) } }
.ba-begleiter { animation-name: ba-schweben2 }
.ba-begleiter-bild { position: absolute; right: -22%; top: 30%; width: 34%; animation: ba-schweben2 1.8s ease-in-out infinite; filter: drop-shadow(0 .4cqi .3cqi #0007) } @keyframes ba-schweben2 { 50% { transform: translateY(-25%) } }
.ba-wippen { animation: ba-wippen 1.5s ease-in-out infinite; height: 100%; position: relative }
@keyframes ba-wippen { 50% { transform: translateY(-1.5%) } }
.ba-atmen { animation: ba-atmen 2.6s ease-in-out infinite; transform-origin: 50% 100%; height: 100%; position: relative }
@keyframes ba-atmen { 50% { transform: scale(1.015, 1.03) } }
.ba-kugel { position: absolute; width: 4.2cqi; transform: translate(-50%, -50%); z-index: 35; transition: left .5s, top .5s, width .3s; pointer-events: none; animation: ba-puls 1.2s ease-in-out infinite }
.ba-kugel.reif { width: 5.4cqi }
@keyframes ba-puls { 50% { filter: brightness(1.35) } }
.ba-fx { position: absolute; pointer-events: none; z-index: 36 }
.ba-zahl { position: absolute; font-weight: 900; color: #fff; -webkit-text-stroke: .25cqi #000a; paint-order: stroke fill; z-index: 45; pointer-events: none; transform: translate(-50%, 0); white-space: nowrap }
.ba-banner { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%) scale(.6); font-weight: 900; font-size: 4.4cqi; color: #fff;
  text-shadow: 0 .4cqi 0 #000a, 0 0 2cqi #000a; opacity: 0; pointer-events: none; white-space: nowrap; transition: opacity .25s, transform .35s cubic-bezier(.2, 1.6, .4, 1); z-index: 50 }
.ba-banner.zeigen { opacity: 1; transform: translate(-50%, -50%) scale(1) }
.ba-warnung { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 0 #ef4444; transition: box-shadow .3s; z-index: 38 }
.ba-warnung.an { box-shadow: inset 0 0 9cqi 1.5cqi #ef4444aa }
.ba-fuss { position: absolute; inset: auto 0 0; display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 2cqi; align-items: end; padding: 3cqi 2.2cqi 1.4cqi;
  background: linear-gradient(transparent, #0b0f22d0); z-index: 40; font-weight: 800; font-size: 1.3cqi }
.ba-fuss b { display: block; font-size: 2.2cqi; font-variant-numeric: tabular-nums }
.ba-spezial .ba-leiste { height: 1.3cqi } .ba-spezial .ba-wert { background: linear-gradient(90deg, #fde68a, #f59e0b); left: 0 }
.ba-rolle { position: absolute; left: 50%; top: -9%; transform: translateX(-50%); font-size: 1.7cqi; line-height: 1; background: #0b0f22cc; border-radius: 99px; padding: .25cqi .45cqi; box-shadow: 0 0 .6cqi #0008 }
.ba-schildwand { position: absolute; left: 53%; bottom: 3%; width: 7%; height: 46%; transform: translateX(-50%); border-radius: 50% / 18%; z-index: 33; pointer-events: none;
  background: radial-gradient(ellipse at 30% 50%, #e0f2fe, #38bdf8aa 45%, #0369a155 70%, transparent 72%); box-shadow: 0 0 2.5cqi #38bdf8; transition: opacity .4s }
.ba-schildwand.blitz { animation: ba-schildblitz .45s }
@keyframes ba-schildblitz { 30% { filter: brightness(2.4); transform: translateX(-50%) scale(1.08) } }
.ba-schildleiste { height: .9cqi; border-radius: 99px; background: #0b0f22; margin-top: .35cqi; overflow: hidden; border: .15cqi solid #38bdf866 }
.ba-schildleiste i { display: block; height: 100%; background: linear-gradient(90deg, #7dd3fc, #0284c7); transition: width .3s }
.ba-warn { position: absolute; left: 50%; top: 16%; transform: translateX(-50%); z-index: 45; background: #b91c1ccc; color: #fff; font-weight: 800; font-size: 1.6cqi; border-radius: .8cqi; padding: .5cqi 1.2cqi }
.ba-boss-aus { transition: opacity 1.2s, transform 1.2s } .ba-boss-aus.weg { opacity: 0; transform: translateX(20%) scale(.8) }
@media (prefers-reduced-motion: reduce) {
  .ba-wippen, .ba-atmen, .ba-kugel, .ba-abzeichen, .ba-begleiter { animation: none } .ba-rahmen.ba-wackeln { animation: none }
}
`

/** Plätze der Figuren: vorne zuerst, bis zu drei versetzte Reihen auf der linken Hälfte (x, Boden, Höhe in %) */
export function figurPlaetze(n: number): { x: number; b: number; h: number; z: number }[] {
  const reihen = n <= 5 ? 1 : n <= 14 ? 2 : 3
  const proReihe = Math.ceil(n / reihen)
  const H = [[36], [30, 25], [26, 22, 19]][reihen - 1]
  const B = [[7], [6, 19], [5, 16, 26]][reihen - 1]
  const aus: { x: number; b: number; h: number; z: number }[] = []
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / proReihe)
    const k = i % proReihe
    const inReihe = Math.min(proReihe, n - r * proReihe)
    const breite = 42
    const abstand = breite / inReihe
    const x = 5 + abstand * (k + 0.5) + (r % 2 ? abstand * 0.3 : 0)
    aus.push({ x: Math.min(50, x), b: B[r], h: H[r], z: 30 - r * 8 + (k % 2) })
  }
  return aus
}

/**
 * Kampfreihe mit Rollen (17.11.2026, Entscheidung der Lehrkraft): Tanks als Wand direkt vor dem Boss, Angreifer
 * dahinter, Heiler ganz hinten links und etwas höher (Tiefe). Viele einer Rolle: zwei gestaffelte Reihen.
 */
export function rollenPlaetze(rollen: (string | undefined)[]): { x: number; b: number; h: number; z: number }[] {
  const aus: { x: number; b: number; h: number; z: number }[] = new Array(rollen.length)
  const gruppe = (rolle: string, x0: number, x1: number, b0: number, h: number, z0: number): void => {
    const idx = rollen.map((r, i) => (r === rolle ? i : -1)).filter((i) => i >= 0)
    const reihen = idx.length > 6 ? 2 : 1
    const pro = Math.ceil(idx.length / reihen)
    idx.forEach((i, k) => {
      const r = Math.floor(k / pro)
      const c = k % pro
      const inReihe = Math.min(pro, idx.length - r * pro)
      const ab = (x1 - x0) / inReihe
      const klein = idx.length > 8 ? 0.85 : 1
      aus[i] = { x: x0 + ab * (c + 0.5) + (r % 2 ? ab * 0.3 : 0), b: b0 + r * 8, h: h * (r ? 0.9 : 1) * klein, z: z0 - r * 4 + (c % 2) }
    })
  }
  // Tanks enden vor dem Boss (sein Bild beginnt bei etwa 50 %), Angreifer dahinter, Heiler hinten links
  gruppe('tank', 34, 50, 4, 32, 32)
  gruppe('angreifer', 16, 35, 12, 27, 22)
  gruppe('heiler', 2, 17, 22, 23, 12)
  return aus
}

const ROLLEN_ZEICHEN: Record<string, string> = { tank: '🛡️', heiler: '💚', angreifer: '⚔️' }

const BOSS_PLATZ = { x: 74, b: 6, h: 62 }

export function BossArena({ b }: { b: BBlockBoss }): React.JSX.Element {
  const rahmen = useRef<HTMLDivElement>(null)
  const fx = useRef<HTMLDivElement>(null)
  const banner = useRef<HTMLDivElement>(null)
  const figurBilder = useRef<(HTMLImageElement | null)[]>([])
  const figurPlaetzeEl = useRef<(HTMLDivElement | null)[]>([])
  const bossImg = useRef<HTMLImageElement>(null)
  const bossPlatz = useRef<HTMLDivElement>(null)
  const zuletzt = useRef<number | null>(null)
  const schlange = useRef<BossEreignis[]>([])
  const uhr = useRef<ReturnType<typeof setInterval> | null>(null)
  const timer = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const aktuell = useRef(b)
  aktuell.current = b
  const ruhig = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const rollenSchluessel = b.rollen ? b.figuren.map((f) => f.rolle ?? '').join() : ''
  const plaetze = useMemo(
    () => (b.rollen ? rollenPlaetze(b.figuren.map((f) => f.rolle)) : figurPlaetze(b.figuren.length)),
    [b.figuren.length, b.rollen, rollenSchluessel] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const schildwand = useRef<HTMLDivElement>(null)
  /** Plätze einer Rolle (mit Rollen nur Angreifer schlagen zu) */
  const slotsMit = (rolle: string): number[] => aktuell.current.figuren.map((f, i) => (f.rolle === rolle ? i : -1)).filter((i) => i >= 0)

  const bossRuhe = (x: BBlockBoss): string => {
    const n = `boss-${x.monster}-${x.phase === 1 ? 'ruhe' : x.phase === 2 ? 'ruestung' : 'raserei'}`
    // Monster ohne Rüstungs-/Raserei-Bild (noch nicht erzeugt): Ruhepose
    return bossBild(n) ? n : `boss-${x.monster}-ruhe`
  }
  const figurRuhe = (x: BBlockBoss): FigurPose => (x.ausgang === 'niederlage' ? 'besiegt' : x.ausgang === 'sieg' ? 'angriff' : 'ruhe')
  const bossStand = (x: BBlockBoss): string => (x.ausgang === 'sieg' ? `boss-${x.monster}-besiegt` : bossRuhe(x))

  // ---------- kleine Werkzeuge (direkt am DOM – 30 Figuren ohne Neuzeichnen von React)
  const spaeter = (k: string, ms: number, f: () => void): void => {
    const t = timer.current.get(k)
    if (t) clearTimeout(t)
    timer.current.set(k, setTimeout(f, ms))
  }
  const figurPose = (i: number, pose: FigurPose, ms: number): void => {
    const img = figurBilder.current[i]
    const f = aktuell.current.figuren[i]
    if (!img || !f) return
    img.src = figurBild(f.figur, pose) ?? ''
    spaeter(`f${i}`, ms, () => {
      const jetzt = aktuell.current
      if (jetzt.figuren[i]) img.src = figurBild(jetzt.figuren[i].figur, figurRuhe(jetzt)) ?? ''
    })
  }
  const bossPose = (pose: 'angriff' | 'getroffen', ms: number): void => {
    const x = aktuell.current
    if (!bossImg.current || x.phase !== 1 || x.ausgang) return
    bossImg.current.src = bossBild(`boss-${x.monster}-${pose}`) ?? ''
    spaeter('boss', ms, () => bossImg.current && (bossImg.current.src = bossBild(bossStand(aktuell.current)) ?? ''))
  }
  const blitz = (el: HTMLElement | null | undefined, klasse: string, ms = 150): void => {
    if (!el) return
    el.classList.add(klasse)
    setTimeout(() => el.classList.remove(klasse), ms)
  }
  const stoss = (el: HTMLElement | null | undefined, dx: number, ms = 300): void => {
    if (!el || ruhig || !el.animate) return
    el.animate([{ translate: '0 0' }, { translate: `${dx}% 0` }, { translate: '0 0' }], { duration: ms, easing: 'ease-out' })
  }
  const wackeln = (): void => {
    const r = rahmen.current
    if (!r || ruhig) return
    r.classList.remove('ba-wackeln')
    void r.offsetWidth
    r.classList.add('ba-wackeln')
  }
  const zeigeBanner = (text: string, ms = 1500): void => {
    const el = banner.current
    if (!el) return
    el.textContent = text
    el.classList.add('zeigen')
    spaeter('banner', ms, () => el.classList.remove('zeigen'))
  }
  const effekt = (name: string, x: number, y: number, breite: number, ms = 450, dreh = 0): void => {
    const src = bossBild(`effekte-${name}`)
    if (!fx.current || !src) return
    const el = document.createElement('img')
    el.src = src
    el.alt = ''
    el.className = 'ba-fx'
    Object.assign(el.style, { left: `${x}%`, top: `${y}%`, width: `${breite}%`, transform: `translate(-50%,-50%) rotate(${dreh}deg)` })
    fx.current.appendChild(el)
    const t = `translate(-50%,-50%) rotate(${dreh}deg)`
    const a = el.animate?.([{ opacity: 0, transform: `${t} scale(.5)` }, { opacity: 1, transform: `${t} scale(1.05)`, offset: 0.3 }, { opacity: 0, transform: `${t} scale(1.15)` }], { duration: ms, easing: 'ease-out' })
    if (a) a.onfinish = () => el.remove()
    else setTimeout(() => el.remove(), ms)
  }
  const zahl = (text: string, x: number, y: number, farbe: string, gross: boolean): void => {
    if (!fx.current) return
    const el = document.createElement('div')
    el.className = 'ba-zahl'
    el.textContent = text
    Object.assign(el.style, { left: `${x + Math.random() * 6 - 3}%`, top: `${y}%`, color: farbe, fontSize: gross ? '5cqi' : '3.4cqi' })
    fx.current.appendChild(el)
    const a = el.animate?.([{ transform: 'translate(-50%,0)', opacity: 1 }, { transform: 'translate(-50%,-160%)', opacity: 0 }], { duration: 1000, easing: 'ease-out' })
    if (a) a.onfinish = () => el.remove()
    else setTimeout(() => el.remove(), 1000)
  }
  /** Heilfunken: steigen von der Heilerin zum Lebensbalken der Klasse */
  const heilFunken = (x0: number, y0: number): void => {
    if (!fx.current) return
    for (let k = 0; k < 5; k++) {
      const el = document.createElement('div')
      el.className = 'ba-zahl'
      el.textContent = k % 2 ? '✚' : '✦'
      Object.assign(el.style, { left: `${x0 + (Math.random() * 6 - 3)}%`, top: `${y0}%`, color: '#86efac', fontSize: '2cqi', transition: `left .9s ${k * 70}ms ease-in, top .9s ${k * 70}ms ease-in, opacity .9s ${k * 70}ms` })
      fx.current.appendChild(el)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.left = `${16 + Math.random() * 10}%`
          el.style.top = '7%'
          el.style.opacity = '0.2'
        })
      )
      setTimeout(() => el.remove(), 1100 + k * 70)
    }
  }
  const fliegendeKugeln = (anzahl: number, zielX?: number): void => {
    const src = bossBild('effekte-kugel')
    if (!fx.current || !src) return
    for (let i = 0; i < Math.min(anzahl, 12); i++) {
      const el = document.createElement('img')
      el.src = src
      el.alt = ''
      el.className = 'ba-kugel'
      Object.assign(el.style, { left: `${BOSS_PLATZ.x - 6}%`, top: '40%', transition: `left .45s ${i * 40}ms ease-in, top .45s ${i * 40}ms ease-in` })
      fx.current.appendChild(el)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.left = zielX !== undefined ? `${zielX + Math.random() * 2}%` : `${12 + Math.random() * 32}%`
          el.style.top = zielX !== undefined ? `${35 + Math.random() * 25}%` : `${55 + Math.random() * 20}%`
        })
      )
      setTimeout(() => el.remove(), 520 + i * 40)
    }
  }
  const angriffVon = (i: number, spezial = false): void => {
    figurPose(i, spezial ? 'spezial' : 'angriff', spezial ? 1100 : 420)
    stoss(figurPlaetzeEl.current[i], 14)
  }

  // ---------- Ereignisse abspielen
  const spielen = (): void => {
    const e = schlange.current.shift()
    if (!e) {
      if (uhr.current) clearInterval(uhr.current)
      uhr.current = null
      return
    }
    const x = aktuell.current
    const n = x.figuren.length
    if (e.art === 'treffer') {
      let schaden = e.wert ?? 1
      let anzahl = 1
      let krit = Boolean(e.krit)
      const slots = e.slot !== undefined ? [e.slot] : []
      while (schlange.current[0]?.art === 'treffer') {
        const w = schlange.current.shift()!
        schaden += w.wert ?? 1
        anzahl++
        krit ||= Boolean(w.krit)
        if (w.slot !== undefined) slots.push(w.slot)
      }
      const pool = x.rollen ? slotsMit('angreifer') : Array.from({ length: n }, (_, i) => i)
      const wer = slots.length ? [...new Set(slots)] : pool.length ? [pool[Math.floor(Math.random() * pool.length)]] : []
      if (anzahl > 3 && !slots.length) for (let k = 0; k < Math.min(6, pool.length); k++) wer.push(pool[Math.floor(Math.random() * pool.length)])
      wer.slice(0, 8).forEach((i, k) => setTimeout(() => angriffVon(i), k * 50))
      for (const i of slots) blitz(figurBilder.current[i], 'ba-gold', 380)
      setTimeout(() => {
        klangbild.ton(krit || anzahl > 3 ? 'krit' : 'treffer')
        if (anzahl > 1) setTimeout(() => klangbild.ton('treffer', 0.8), 110)
        bossPose('getroffen', krit || anzahl > 3 ? 520 : 320)
        blitz(bossImg.current, 'ba-weiss')
        stoss(bossPlatz.current, 4, 220)
        effekt('hieb', BOSS_PLATZ.x - 6 + Math.random() * 6, 45 + Math.random() * 10, 16, 380, Math.random() * 40 - 20)
        if (krit || anzahl > 3) effekt('stern', BOSS_PLATZ.x - 3, 45, 14, 500)
        zahl(anzahl > 1 ? `×${anzahl}  −${Math.round(schaden)}` : `−${Math.round(schaden * 10) / 10}`, BOSS_PLATZ.x, 22, krit ? '#fde047' : '#fff', krit || anzahl > 3)
        if (krit) wackeln()
      }, 160)
    } else if (e.art === 'abwehr') {
      klangbild.ton('abwehr', 0.8)
      const p = e.slot !== undefined ? plaetze[e.slot] : null
      effekt('schild', p ? p.x + 4 : 40, p ? 100 - p.b - p.h / 2 : 60, p ? 12 : 20, 600)
      if (e.slot !== undefined && x.figuren[e.slot]?.rolle === 'tank') figurPose(e.slot, 'rolle1', 700)
    } else if (e.art === 'aufstieg') {
      klangbild.ton('aufstieg', 0.7)
      if (e.slot !== undefined) {
        blitz(figurBilder.current[e.slot], 'ba-gold', 900)
        const p = plaetze[e.slot]
        if (p) zahl('⬆', p.x, 100 - p.b - p.h - 2, '#fde047', false)
      }
    } else if (e.art === 'fehler') {
      klangbild.ton('fehler', 0.6)
      if (e.slot !== undefined) {
        figurPose(e.slot, 'getroffen', 450)
        blitz(figurBilder.current[e.slot], 'ba-rot', 220)
      }
    } else if (e.art === 'schild' || e.art === 'heilung') {
      // Rollen: Schild aufbauen bzw. heilen – mehrere kurz hintereinander zusammenfassen
      let summe = e.wert ?? 0
      const slots = e.slot !== undefined ? [e.slot] : []
      while (schlange.current[0]?.art === e.art) {
        const w = schlange.current.shift()!
        summe += w.wert ?? 0
        if (w.slot !== undefined) slots.push(w.slot)
      }
      klangbild.ton(e.art, 0.85)
      const quelle = slots.length ? slots : slotsMit(e.art === 'schild' ? 'tank' : 'heiler').slice(0, 1)
      const viele = new Set(quelle).size > 1
      for (const i of [...new Set(quelle)].slice(0, 6)) {
        // Rollenpose: Tank hebt den Schild, Heiler wirkt den Heilzauber (mehrere zugleich: große Heilwelle)
        if (!aktuell.current.ausgang) figurPose(i, e.art === 'heilung' && viele ? 'rolle2' : 'rolle1', 750)
        blitz(figurBilder.current[i], e.art === 'schild' ? 'ba-blau' : 'ba-gruen', 450)
        const p = plaetze[i]
        if (p && e.art === 'heilung') heilFunken(p.x, 100 - p.b - p.h * 0.6)
      }
      if (e.art === 'schild') {
        const w = schildwand.current
        if (w) (w.classList.remove('blitz'), void w.offsetWidth, w.classList.add('blitz'))
        zahl(`+${Math.round(summe * 10) / 10} 🛡️`, 53, 40, '#7dd3fc', false)
      } else zahl(`+${Math.round(summe * 10) / 10} 💚`, 18, 12, '#86efac', false)
    } else if (e.art === 'schlag') {
      bossPose('angriff', 750)
      stoss(bossPlatz.current, -10, 500)
      const abgefangen = e.abgefangen ?? 0
      // Grundangriff ohne Kugel: eine kleine Kugel, kein Wackeln (18.11.2026)
      const grund = Boolean(e.grund)
      fliegendeKugeln(grund ? 1 : Math.max(1, Math.round(((e.wert ?? 0) + abgefangen) / 2)), abgefangen > 0 && !(e.wert ?? 0) ? 53 : undefined)
      setTimeout(() => {
        klangbild.ton('schlag', grund ? 0.5 : 1)
        if (!grund) klangbild.ducken(900, 0.55)
        // Schild der Tanks fängt ab – bricht er, gehen die Tanks kurz in die Knie
        if (abgefangen > 0) {
          const w = schildwand.current
          if (w) (w.classList.remove('blitz'), void w.offsetWidth, w.classList.add('blitz'))
          klangbild.ton(e.bruch ? 'bruch' : 'abwehr', 0.8)
          zahl(`🛡️ ${abgefangen < 3 ? Math.round(abgefangen * 10) / 10 : Math.round(abgefangen)}`, 53, 34, '#7dd3fc', !grund)
          if (e.bruch) {
            effekt('schild', 53, 55, 16, 700)
            for (const i of slotsMit('tank')) if (!aktuell.current.ausgang) figurPose(i, 'rolle2', 1300)
          } else for (const i of slotsMit('tank')) if (!aktuell.current.ausgang) figurPose(i, 'rolle1', 650)
        }
        if ((e.wert ?? 0) > 0) {
          // Grundangriff: nur zwei, drei Figuren zucken – sonst bewegte sich alle paar Sekunden die ganze Klasse
          const ziele = grund ? new Set(Array.from({ length: Math.min(3, n) }, () => Math.floor(Math.random() * n))) : null
          for (let i = 0; i < n; i++) {
            if (ziele && !ziele.has(i)) continue
            // Tanks mit gebrochenem Schild bleiben in der Knie-Pose
            if (!aktuell.current.ausgang && !(e.bruch && x.figuren[i]?.rolle === 'tank')) figurPose(i, 'getroffen', 520)
            blitz(figurBilder.current[i], 'ba-rot', 200)
            stoss(figurPlaetzeEl.current[i], -8, 380)
          }
          effekt('stern', 26, 60, grund ? 8 : 12, 400)
          if (!grund) wackeln()
          // Kleine Werte mit einer Nachkommastelle (Grundangriff ≈ 0,4)
          const w = e.wert ?? 0
          zahl(`−${w < 3 ? Math.round(w * 10) / 10 : Math.round(w)}`, 24, 30, '#f87171', !grund)
        }
      }, 520)
    } else if (e.art === 'phase') {
      if (bossImg.current) bossImg.current.src = bossBild(bossRuhe(x)) ?? ''
      klangbild.ton('phase')
      klangbild.ducken(2200, 0.35)
      zeigeBanner(e.wert === 2 ? x.texte?.ruestung ?? '' : x.texte?.raserei ?? '', 2200)
      wackeln()
    } else if (e.art === 'spezial') {
      zeigeBanner(x.texte?.klassenangriff ?? '', 1500)
      const angreifer = x.rollen ? slotsMit('angreifer') : Array.from({ length: n }, (_, i) => i)
      angreifer.forEach((i, k) => setTimeout(() => angriffVon(i, true), (k % 8) * 50))
      setTimeout(() => {
        klangbild.ton('spezial')
        klangbild.ducken(1600, 0.4)
        effekt('stern', BOSS_PLATZ.x - 2, 45, 30, 700)
        bossPose('getroffen', 520)
        blitz(bossImg.current, 'ba-weiss', 300)
        wackeln()
        zahl(`−${e.wert ?? ''}`, BOSS_PLATZ.x, 22, '#fde047', true)
      }, 220)
    }
  }

  useEffect(() => {
    const neu = b.ereignisse.filter((e) => zuletzt.current !== null && e.nr > zuletzt.current)
    const hoechste = b.ereignisse.reduce((m, e) => Math.max(m, e.nr), zuletzt.current ?? 0)
    // Erstes Bild bzw. Neuverbindung: nichts nachspielen
    zuletzt.current = hoechste
    if (!neu.length) return
    schlange.current.push(...neu)
    if (schlange.current.length > 30) schlange.current = schlange.current.slice(-30)
    if (!uhr.current) {
      uhr.current = setInterval(spielen, 250)
      spielen()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.ereignisse])

  // Vorwarnung als Banner (einmal je Warnung)
  const warnungVorher = useRef(false)
  useEffect(() => {
    if (b.warnung && !warnungVorher.current) {
      zeigeBanner(b.texte?.holtAus ?? '', 1600)
      klangbild.ton('bruellen')
      klangbild.ducken(1300, 0.5)
    }
    warnungVorher.current = b.warnung
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.warnung])

  useEffect(
    () => () => {
      if (uhr.current) clearInterval(uhr.current)
      for (const t of timer.current.values()) clearTimeout(t)
    },
    []
  )

  const hg = b.hintergrund ? bossBild(`hg-${b.hintergrund}`) : undefined
  const prozent = (w: number, m: number): string => `${Math.max(0, Math.min(100, (w / Math.max(1, m)) * 100))}%`
  const kugeln = b.kugeln.slice(0, 12)
  const sek = Math.ceil(b.naechsterIn / 1000)

  return (
    <div ref={rahmen} className="ba-rahmen" style={hg ? { backgroundImage: `url(${hg})` } : undefined} data-beamer-boss={b.hp} data-boss-arena={b.monster} data-boss-figuren={b.figuren.length}>
      <style>{CSS}</style>
      <div className="ba-hud">
        <div>
          <div className="ba-name">
            <span>🛡️ {b.texte?.klasse ?? ''}</span>
            <small data-boss-held={Math.round(b.held)}>
              {Math.ceil(b.held)} / {b.heldMax}
            </small>
          </div>
          <div className="ba-leiste">
            <i className="ba-geist" style={{ left: 0, width: prozent(b.held, b.heldMax) }} />
            <i className="ba-wert" style={{ left: 0, width: prozent(b.held, b.heldMax), background: 'linear-gradient(#4ade80, #16a34a)' }} />
          </div>
          {b.rollen && (
            <div className="ba-schildleiste" title={b.texte?.schild} data-boss-schild={Math.round(b.schild ?? 0)}>
              <i style={{ width: prozent(b.schild ?? 0, b.schildMax ?? 30) }} />
            </div>
          )}
        </div>
        <div className="ba-mitte">
          {!b.ausgang && (
            <>
              {b.texte?.naechster}
              {/* Seit dem Grundangriff (18.11.2026) trifft jeder Takt – die Uhr läuft immer */}
              <b>{`${sek} s`}</b>
            </>
          )}
        </div>
        <div>
          <div className="ba-name" style={{ flexDirection: 'row-reverse' }}>
            <span>{b.name}</span>
            <small>
              {b.hp} / {b.max}
            </small>
          </div>
          <div className="ba-leiste">
            <i className="ba-geist" style={{ right: 0, width: prozent(b.hp, b.max) }} />
            <i className="ba-wert" style={{ right: 0, width: prozent(b.hp, b.max), background: 'linear-gradient(#f87171, #b91c1c)' }} />
          </div>
          <div className="ba-phasen" aria-label={b.leben}>
            {[1, 2, 3].map((i) => (
              <b key={i} className={i <= b.phase ? 'an' : ''} />
            ))}
          </div>
        </div>
      </div>

      {b.figuren.map((f, i) => {
        const p = plaetze[i]
        if (!p) return null
        return (
          <div
            key={i}
            ref={(el) => {
              figurPlaetzeEl.current[i] = el
            }}
            className={`ba-platz ba-s${f.stufe}`}
            style={{ left: `${p.x}%`, bottom: `${p.b}%`, height: `${p.h}%`, zIndex: p.z }}
            data-boss-figur={f.figur}
          >
            <div className={ruhig ? '' : 'ba-wippen'} style={{ animationDelay: `-${(i * 0.37) % 1.5}s` }}>
              {f.stufe >= 1 ? <div className="ba-plattform" /> : <div className="ba-schatten" />}
              {f.ring !== null && <div className="ba-ring" style={{ borderColor: RING_FARBEN[f.ring % RING_FARBEN.length] }} />}
              <img ref={(el) => {
                  figurBilder.current[i] = el
                }} className="ba-fig" src={figurBild(f.figur, figurRuhe(b))} alt="" aria-hidden />
              {f.stufe >= 3 && (f.begleiter && bossBild(`begleiter-${f.begleiter}`) ? <img className="ba-begleiter-bild" src={bossBild(`begleiter-${f.begleiter}`)} alt="" aria-hidden /> : <div className="ba-begleiter">✨</div>)}
              {f.stufe >= 4 && !f.rolle && <img className="ba-abzeichen" src={bossBild('effekte-stern')} alt="" aria-hidden />}
              {f.rolle && <div className="ba-rolle">{ROLLEN_ZEICHEN[f.rolle]}</div>}
            </div>
          </div>
        )
      })}

      <div
        ref={bossPlatz}
        className={`ba-platz ba-boss-aus${b.ausgang === 'entkommen' ? ' weg' : ''}`}
        style={{ left: `${BOSS_PLATZ.x}%`, bottom: `${BOSS_PLATZ.b}%`, height: `${BOSS_PLATZ.h}%`, zIndex: 30 }}
      >
        <div className={ruhig || b.ausgang ? '' : 'ba-atmen'}>
          <div className="ba-schatten" style={{ width: '80%' }} />
          <img ref={bossImg} className="ba-fig" src={bossBild(bossStand(b))} alt={b.name} />
        </div>
      </div>

      {!b.ausgang &&
        kugeln.map((k, i) => {
          const w = Math.PI * (0.95 + (kugeln.length > 1 ? i / (kugeln.length - 1) : 0.5) * 1.1)
          return (
            <img
              key={k.id}
              className={`ba-kugel${k.reif ? ' reif' : ''}`}
              src={bossBild('effekte-kugel')}
              alt=""
              aria-hidden
              style={{ left: `${BOSS_PLATZ.x + Math.cos(w) * 17}%`, top: `${40 + Math.sin(w) * 22}%` }}
              data-boss-kugel
            />
          )
        })}

      {b.rollen && !b.ausgang && (
        <div ref={schildwand} className="ba-schildwand" style={{ opacity: (b.schild ?? 0) > 0 ? 0.25 + 0.65 * Math.min(1, (b.schild ?? 0) / (b.schildMax ?? 30)) : 0 }} aria-hidden />
      )}
      {b.texte?.keinAngreifer && !b.ausgang && <div className="ba-warn">{b.texte.keinAngreifer}</div>}
      <div ref={fx} />
      <div ref={banner} className="ba-banner" />
      <div className={`ba-warnung${b.warnung ? ' an' : ''}`} />

      <div className="ba-fuss">
        <div className="ba-spezial">
          {b.texte?.spezial}
          <div className="ba-leiste">
            <i className="ba-wert" style={{ width: `${Math.round(b.spezial * 100)}%` }} />
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          {b.texte?.treffer}
          <b>{b.treffer}</b>
        </div>
        <div style={{ textAlign: 'center' }}>
          {b.texte?.abgewehrt}
          <b>{b.abgewehrt}</b>
        </div>
      </div>
    </div>
  )
}
