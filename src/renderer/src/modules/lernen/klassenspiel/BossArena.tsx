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
.ba-platz img.ba-fig.ba-gold { filter: drop-shadow(0 0 1.4cqi #fde047) brightness(1.25) }
.ba-ring { position: absolute; left: 50%; bottom: -1.5%; width: 70%; height: 9%; transform: translateX(-50%); border-radius: 50%; border: .35cqi solid; opacity: .9 }
.ba-plattform { position: absolute; left: 50%; bottom: -3%; width: 85%; height: 12%; transform: translateX(-50%); border-radius: 50%;
  background: radial-gradient(#fde68a, #b45309 60%, transparent 72%); opacity: .75 }
.ba-schatten { position: absolute; left: 50%; bottom: -2%; width: 65%; height: 8%; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(#000b, transparent 70%) }
.ba-abzeichen { position: absolute; left: 50%; top: -14%; width: 28%; transform: translateX(-50%); animation: ba-schweben 2s ease-in-out infinite }
.ba-begleiter { position: absolute; right: -14%; top: 18%; font-size: 2.2cqi; animation: ba-schweben 1.6s ease-in-out infinite }
@keyframes ba-schweben { 50% { transform: translate(-50%, -12%) } }
.ba-begleiter { animation-name: ba-schweben2 } @keyframes ba-schweben2 { 50% { transform: translateY(-25%) } }
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
  const plaetze = useMemo(() => figurPlaetze(b.figuren.length), [b.figuren.length])

  const bossRuhe = (x: BBlockBoss): string => `boss-${x.monster}-${x.phase === 1 ? 'ruhe' : x.phase === 2 ? 'ruestung' : 'raserei'}`
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
  const fliegendeKugeln = (anzahl: number): void => {
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
          el.style.left = `${12 + Math.random() * 32}%`
          el.style.top = `${55 + Math.random() * 20}%`
        })
      )
      setTimeout(() => el.remove(), 520 + i * 40)
    }
  }
  const angriffVon = (i: number): void => {
    figurPose(i, 'angriff', 420)
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
      const wer = slots.length ? [...new Set(slots)] : n ? [Math.floor(Math.random() * n)] : []
      if (anzahl > 3 && !slots.length) for (let k = 0; k < Math.min(6, n); k++) wer.push(Math.floor(Math.random() * n))
      wer.slice(0, 8).forEach((i, k) => setTimeout(() => angriffVon(i), k * 50))
      for (const i of slots) blitz(figurBilder.current[i], 'ba-gold', 380)
      setTimeout(() => {
        bossPose('getroffen', krit || anzahl > 3 ? 520 : 320)
        blitz(bossImg.current, 'ba-weiss')
        stoss(bossPlatz.current, 4, 220)
        effekt('hieb', BOSS_PLATZ.x - 6 + Math.random() * 6, 45 + Math.random() * 10, 16, 380, Math.random() * 40 - 20)
        if (krit || anzahl > 3) effekt('stern', BOSS_PLATZ.x - 3, 45, 14, 500)
        zahl(anzahl > 1 ? `×${anzahl}  −${Math.round(schaden)}` : `−${Math.round(schaden * 10) / 10}`, BOSS_PLATZ.x, 22, krit ? '#fde047' : '#fff', krit || anzahl > 3)
        if (krit) wackeln()
      }, 160)
    } else if (e.art === 'abwehr') {
      const p = e.slot !== undefined ? plaetze[e.slot] : null
      effekt('schild', p ? p.x + 4 : 40, p ? 100 - p.b - p.h / 2 : 60, p ? 12 : 20, 600)
    } else if (e.art === 'aufstieg') {
      if (e.slot !== undefined) {
        blitz(figurBilder.current[e.slot], 'ba-gold', 900)
        const p = plaetze[e.slot]
        if (p) zahl('⬆', p.x, 100 - p.b - p.h - 2, '#fde047', false)
      }
    } else if (e.art === 'fehler') {
      if (e.slot !== undefined) {
        figurPose(e.slot, 'getroffen', 450)
        blitz(figurBilder.current[e.slot], 'ba-rot', 220)
      }
    } else if (e.art === 'schlag') {
      bossPose('angriff', 750)
      stoss(bossPlatz.current, -10, 500)
      fliegendeKugeln(Math.max(1, Math.round((e.wert ?? 1) / 2)))
      setTimeout(() => {
        for (let i = 0; i < n; i++) {
          if (!aktuell.current.ausgang) figurPose(i, 'getroffen', 520)
          blitz(figurBilder.current[i], 'ba-rot', 200)
          stoss(figurPlaetzeEl.current[i], -8, 380)
        }
        effekt('stern', 26, 60, 12, 400)
        wackeln()
        zahl(`−${Math.round(e.wert ?? 0)}`, 24, 30, '#f87171', true)
      }, 520)
    } else if (e.art === 'phase') {
      if (bossImg.current) bossImg.current.src = bossBild(bossRuhe(x)) ?? ''
      zeigeBanner(e.wert === 2 ? x.texte?.ruestung ?? '' : x.texte?.raserei ?? '', 2200)
      wackeln()
    } else if (e.art === 'spezial') {
      zeigeBanner(x.texte?.klassenangriff ?? '', 1500)
      for (let i = 0; i < n; i++) setTimeout(() => angriffVon(i), (i % 8) * 50)
      setTimeout(() => {
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
    if (b.warnung && !warnungVorher.current) zeigeBanner(b.texte?.holtAus ?? '', 1600)
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
        </div>
        <div className="ba-mitte">
          {!b.ausgang && (
            <>
              {b.texte?.naechster}
              <b>{b.kugeln.some((k) => k.reif) ? `${sek} s` : '–'}</b>
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
              {f.stufe >= 3 && <div className="ba-begleiter">✨</div>}
              {f.stufe >= 4 && <img className="ba-abzeichen" src={bossBild('effekte-stern')} alt="" aria-hidden />}
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
