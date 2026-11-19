/**
 * Klangbild der Klassenspiele am Beamer (19.11.2026, mit der Lehrkraft abgestimmt und in der Hörprobe ausgewählt):
 * Abenteuer-Orchester, nur am Beamer (nie auf den Geräten der Kinder), Musik leise durchgehend und bei großen Momenten
 * kurz leiser (Ducking). Alle Dateien CC0 – Herkunft in assets/klassenspiele/klang/QUELLEN.md.
 *
 * Bewusst nur HTMLAudioElement statt Web Audio: läuft so auch unter file:// in der Exe (kein fetch/CORS); Lautstärke,
 * Überblenden und Ducking rechnet ein kleiner Takt (50 ms) selbst. Geräusche variieren leicht in der Tonhöhe.
 */
const DATEIEN = import.meta.glob<string>('../../../assets/klassenspiele/klang/*.mp3', { eager: true, import: 'default' })
const datei = (n: string): string | undefined => DATEIEN[`../../../assets/klassenspiele/klang/${n}.mp3`]

export interface KlangEinstellung {
  an: boolean
  /** Musik und Atmosphäre, 0–1 */
  musik: number
  /** Geräusche, 0–1 */
  geraeusche: number
}
export const KLANG_STANDARD: KlangEinstellung = { an: true, musik: 0.6, geraeusche: 0.8 }
const SCHLUESSEL = 'klassenspiel-klang'

/** Einstellung je Gerät (nur Bequemlichkeit – fehlt der Speicher, gilt der Standard) */
export function klangLaden(): KlangEinstellung {
  try {
    const x = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? 'null') as Partial<KlangEinstellung> | null
    if (x && typeof x === 'object') return { ...KLANG_STANDARD, ...x }
  } catch {
    /* ohne Speicher */
  }
  return { ...KLANG_STANDARD }
}
export function klangSpeichern(e: KlangEinstellung): void {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(e))
  } catch {
    /* ohne Speicher */
  }
}

export type MusikZustand = 'aus' | 'spannung' | 'kampf' | 'sieg' | 'niederlage'
export type KlangArt = 'treffer' | 'krit' | 'abwehr' | 'fehler' | 'schlag' | 'schild' | 'bruch' | 'heilung' | 'aufstieg' | 'spezial' | 'phase' | 'bruellen'

const KAMPF = ['musik-kampf-1', 'musik-kampf-2', 'musik-kampf-3', 'musik-kampf-4', 'musik-kampf-5']
const BRUELLEN = ['sfx-bruellen-1', 'sfx-bruellen-2', 'sfx-bruellen-3', 'sfx-bruellen-4']
/** Mindestabstand je Geräusch (ms) – viele Fehler zugleich sollen nicht prasseln */
const ABSTAND: Partial<Record<KlangArt, number>> = { fehler: 280, aufstieg: 150, treffer: 70, abwehr: 120 }
/** Atmosphäre je Arena: nur wo die Lehrkraft einen Klang gewählt hat (Weltraum: tiefes Brummen) */
const ATMOSPHAERE: Record<string, string> = { raumstation: 'amb-weltraum', cyberdach: 'amb-weltraum', asteroiden: 'amb-weltraum', mondkrater: 'amb-weltraum' }
/** Grundpegel: Musik deutlich unter den Geräuschen („leise durchgehend“) */
const PEGEL = { musik: 0.55, amb: 0.7, jingle: 0.95 }
const UEBERBLENDEN = 3

type Kanal = 'musik' | 'amb' | 'jingle'
interface Stimme {
  el: HTMLAudioElement
  kanal: Kanal
  fade: number
  ziel: number
  /** Änderung je Sekunde */
  tempo: number
  /** Endlos: kurz vor Schluss in sich selbst überblenden; Liste: nächstes Stück */
  weiter?: () => void
  uebergeben?: boolean
}

let einst: KlangEinstellung = klangLaden()
let zustand: MusikZustand = 'aus'
let pausiert = false
let atmo: string | null = null
const stimmen = new Set<Stimme>()
let musikStimme: Stimme | null = null
let atmoStimme: Stimme | null = null
let duck = 1
let duckBis = 0
let duckTiefe = 1
let takt: ReturnType<typeof setInterval> | null = null
let gesperrt = false
let reihe: string[] = []
let letztesStueck = ''
const zuletzt = new Map<string, number>()
let laufendeGeraeusche = 0
let vorgeladen: HTMLAudioElement[] = []

function entsperrenSpaeter(): void {
  if (gesperrt) return
  gesperrt = true
  const los = (): void => {
    gesperrt = false
    document.removeEventListener('pointerdown', los, true)
    document.removeEventListener('keydown', los, true)
    for (const s of stimmen) if (s.el.paused && s.ziel > 0) void s.el.play().catch(() => undefined)
  }
  document.addEventListener('pointerdown', los, true)
  document.addEventListener('keydown', los, true)
}

function abspielen(el: HTMLAudioElement): void {
  void el.play().catch((x: unknown) => {
    // Autoplay-Sperre: beim nächsten Klick/Tastendruck nachholen
    if ((x as { name?: string })?.name === 'NotAllowedError') entsperrenSpaeter()
  })
}

function pegel(s: Stimme): number {
  if (!einst.an) return 0
  const basis = PEGEL[s.kanal] * einst.musik
  const d = s.kanal === 'jingle' ? 1 : duck
  const p = pausiert && s.kanal === 'musik' ? 0.35 : 1
  return Math.max(0, Math.min(1, basis * d * p * s.fade))
}

function starteTakt(): void {
  if (takt) return
  takt = setInterval(schritt, 50)
}

function schritt(): void {
  const jetzt = performance.now()
  // Ducking: schnell runter, langsam wieder hoch
  const duckZiel = jetzt < duckBis ? duckTiefe : 1
  duck += (duckZiel - duck) * (duckZiel < duck ? 0.45 : 0.08)
  for (const s of [...stimmen]) {
    if (s.fade !== s.ziel) {
      const d = s.tempo * 0.05
      s.fade = s.fade < s.ziel ? Math.min(s.ziel, s.fade + d) : Math.max(s.ziel, s.fade - d)
    }
    if (s.fade <= 0 && s.ziel <= 0) {
      s.el.pause()
      s.el.removeAttribute('src')
      stimmen.delete(s)
      continue
    }
    s.el.volume = pegel(s)
    // Kurz vor Schluss überblenden (Liste: nächstes Stück, Schleife: von vorn)
    if (s.weiter && !s.uebergeben && s.el.duration > 0 && s.el.duration - s.el.currentTime < UEBERBLENDEN) {
      s.uebergeben = true
      s.weiter()
    }
  }
  if (!stimmen.size && takt) {
    clearInterval(takt)
    takt = null
  }
}

function neueStimme(name: string, kanal: Kanal, einblenden: number): Stimme | null {
  const src = datei(name)
  if (!src) return null
  const el = new Audio(src)
  el.preload = 'auto'
  el.dataset.klang = name
  const s: Stimme = { el, kanal, fade: einblenden > 0 ? 0 : 1, ziel: 1, tempo: einblenden > 0 ? 1 / einblenden : 99 }
  el.volume = pegel(s)
  stimmen.add(s)
  starteTakt()
  abspielen(el)
  return s
}

function ausblenden(s: Stimme | null, sek: number): void {
  if (!s) return
  s.ziel = 0
  s.tempo = 1 / Math.max(0.05, sek)
  s.weiter = undefined
}

function naechstesKampfstueck(): string {
  if (!reihe.length) {
    // Zufällige Reihenfolge, nie dasselbe Stück zweimal hintereinander
    reihe = [...KAMPF].sort(() => Math.random() - 0.5)
    if (reihe[0] === letztesStueck && reihe.length > 1) reihe.push(reihe.shift()!)
  }
  letztesStueck = reihe.shift()!
  return letztesStueck
}

function musikStarten(name: string, folge: () => string, einblenden = UEBERBLENDEN): void {
  const s = neueStimme(name, 'musik', einblenden)
  if (!s) return
  s.weiter = () => {
    if (musikStimme !== s) return
    ausblenden(s, UEBERBLENDEN)
    musikStarten(folge(), folge)
  }
  musikStimme = s
}

function atmoStarten(name: string, einblenden = 2): void {
  const s = neueStimme(name, 'amb', einblenden)
  if (!s) return
  s.weiter = () => {
    if (atmoStimme !== s) return
    ausblenden(s, UEBERBLENDEN)
    atmoStarten(name, UEBERBLENDEN)
  }
  atmoStimme = s
}

function vorladen(): void {
  if (vorgeladen.length) return
  // Geräusche einmal laden, damit der erste Treffer nicht verspätet klingt
  vorgeladen = Object.entries(DATEIEN)
    .filter(([k]) => k.includes('/sfx-'))
    .map(([, src]) => {
      const a = new Audio(src)
      a.preload = 'auto'
      return a
    })
}

export const klangbild = {
  einstellen(e: KlangEinstellung): void {
    einst = e
    klangSpeichern(e)
    for (const s of stimmen) s.el.volume = pegel(s)
  },

  /** Musikzustand setzen – mehrfach mit demselben Wert ist harmlos */
  musik(neu: MusikZustand, pause = false): void {
    pausiert = pause
    if (neu === zustand) return
    zustand = neu
    vorladen()
    const alt = musikStimme
    musikStimme = null
    if (neu === 'spannung') {
      ausblenden(alt, 1.5)
      musikStarten('musik-spannung', () => 'musik-spannung', 2)
    } else if (neu === 'kampf') {
      ausblenden(alt, 2)
      musikStarten(naechstesKampfstueck(), naechstesKampfstueck, 2)
    } else if (neu === 'sieg' || neu === 'niederlage') {
      ausblenden(alt, 0.8)
      ausblenden(atmoStimme, 2.5)
      atmoStimme = null
      atmo = null
      // Jingle einmal, ohne Schleife
      setTimeout(() => zustand === neu && neueStimme(neu === 'sieg' ? 'jingle-sieg' : 'jingle-niederlage', 'jingle', 0), 350)
    } else {
      ausblenden(alt, 1.5)
      for (const s of stimmen) if (s.kanal === 'jingle') ausblenden(s, 1.5)
    }
  },

  /** Atmosphäre zur Arena (Hintergrund-Kennung wie „raumstation-56“); null = keine */
  atmosphaere(hintergrund: string | null): void {
    const name = hintergrund ? ATMOSPHAERE[hintergrund.replace(/-\d+$/, '')] ?? null : null
    if (name === atmo) return
    atmo = name
    ausblenden(atmoStimme, 2)
    atmoStimme = null
    if (name) atmoStarten(name)
  },

  /** Geräusch abspielen; staerke 0–1 (z. B. Grundangriff leiser) */
  ton(art: KlangArt, staerke = 1): void {
    // Nur während der Beamer das Klangbild führt (sonst still, z. B. in Vorschauen)
    if (!einst.an || einst.geraeusche <= 0 || zustand === 'aus') return
    const jetzt = performance.now()
    if (jetzt - (zuletzt.get(art) ?? -1e9) < (ABSTAND[art] ?? 50)) return
    if (laufendeGeraeusche >= 8) return
    zuletzt.set(art, jetzt)
    const name = art === 'bruellen' ? BRUELLEN[Math.floor(Math.random() * BRUELLEN.length)] : `sfx-${art}`
    const src = datei(name)
    if (!src) return
    const el = new Audio(src)
    // Kennung für Tests (kleine Dateien bettet der Bau als data:-Adresse ein)
    el.dataset.klang = name
    el.volume = Math.max(0, Math.min(1, einst.geraeusche * staerke))
    // Leichte Tonhöhen-Abweichung, damit Wiederholungen nicht mechanisch klingen
    const p = el as HTMLAudioElement & { mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean }
    p.preservesPitch = false
    p.mozPreservesPitch = false
    p.webkitPreservesPitch = false
    el.playbackRate = 0.94 + Math.random() * 0.12
    laufendeGeraeusche++
    const fertig = (): void => {
      laufendeGeraeusche = Math.max(0, laufendeGeraeusche - 1)
      el.removeEventListener('ended', fertig)
      el.removeEventListener('error', fertig)
    }
    el.addEventListener('ended', fertig)
    el.addEventListener('error', fertig)
    void el.play().catch(fertig)
  },

  /** Musik und Atmosphäre kurz leiser (große Momente) */
  ducken(ms = 1400, tiefe = 0.4): void {
    const jetzt = performance.now()
    duckTiefe = jetzt < duckBis ? Math.min(duckTiefe, tiefe) : tiefe
    duckBis = Math.max(duckBis, jetzt + ms)
    if (stimmen.size) starteTakt()
  },

  /** Alles aus (Beamer geschlossen) */
  stopp(): void {
    zustand = 'aus'
    atmo = null
    musikStimme = null
    atmoStimme = null
    for (const s of stimmen) ausblenden(s, 0.6)
  }
}
