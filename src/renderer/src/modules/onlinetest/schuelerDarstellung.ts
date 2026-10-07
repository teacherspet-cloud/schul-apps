/**
 * Einstellungen der Lernenden als Speicher (03.10.2026; erweitert 06.10.2026 um „Lesen und Hören" und „Lernen").
 *
 * Die Darstellung hängt am Konto (Server, /s/api/darstellung) und folgt so auf jedes Gerät; im Browser liegt
 * eine Kopie, damit die Seite sofort richtig aussieht. Zwei Angaben bleiben NUR auf dem Gerät:
 *  - die lesefreundliche Schrift (soll nicht wie eine Diagnose am Konto hängen – Recherche Teil A2),
 *  - die gewählten Stimmen (jedes Gerät hat andere).
 * Hier auch die kleinen Helfer, die die Einstellungen an den Stellen wirksam machen: Vorlesen (Deutsch),
 * Tempo und Stimme der Aussprache, Töne.
 */
import { create } from 'zustand'

export interface Darstellung {
  modus: 'hell' | 'dunkel' | 'auto'
  schrift: 'normal' | 'gross' | 'sehrgross'
  farbe: 'blue' | 'teal' | 'grape' | 'orange' | 'pink' | 'green'
  ruhig: boolean
  /** Lernbereiche (Vokabeltraining): Farbe des Fachs wie im Kopfband der Arbeitsblätter, oder die eigene Farbe */
  design: 'fach' | 'eigen'
  /** Dunkel als Vorgabe übernommen (05.10.2026) – fehlt sie, wird „automatisch" einmalig zu „dunkel" */
  dunkelVorgabe?: boolean
  // ---------- Lesen und Hören (06.10.2026)
  zeilen: 'normal' | 'weit' | 'sehrweit'
  kontrast: boolean
  /** Nur auf dem Gerät */
  leseschrift: boolean
  /** Vorlesen-Knopf an Texten */
  vorlesen: boolean
  /** Sprechtempo (Vorlesen und Aussprache) */
  tempo: 'langsam' | 'normal' | 'schnell'
  /** Gewählte Stimme je Sprache („en" → Name der Stimme) – nur auf dem Gerät */
  stimmen: Record<string, string>
  // ---------- Lernen (06.10.2026)
  /** Übungstage je Woche */
  wochenziel: number
  tipps: boolean
  /** Spiele nach dem Karteikasten */
  spiele: boolean
  /** Spiele mit Uhr (Blitzrunde, fallende Wörter …) */
  zeitdruck: boolean
  toene: boolean
}

/** Nur auf dem Gerät – gehen nicht an den Server */
const NUR_GERAET = ['leseschrift', 'stimmen'] as const

export const VORGABE: Darstellung = {
  modus: 'dunkel',
  schrift: 'normal',
  farbe: 'blue',
  ruhig: false,
  design: 'fach',
  dunkelVorgabe: true,
  zeilen: 'normal',
  kontrast: false,
  leseschrift: false,
  vorlesen: false,
  tempo: 'normal',
  stimmen: {},
  wochenziel: 3,
  tipps: true,
  spiele: true,
  zeitdruck: true,
  // Töne aus: im Klassenraum klingen sonst 30 Geräte zugleich
  toene: false
}
const SPEICHER = 'schulapps-darstellung'

/** Dunkel als Vorgabe (05.10.2026): ältere gespeicherte Darstellung mit „automatisch" einmalig auf „dunkel" */
export const mitDunkelVorgabe = (d: Darstellung): Darstellung =>
  d.dunkelVorgabe ? d : { ...d, modus: d.modus === 'auto' ? 'dunkel' : d.modus, dunkelVorgabe: true }

const ausSpeicher = (): Darstellung => {
  try {
    const roh = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as Partial<Darstellung>
    return mitDunkelVorgabe({ ...VORGABE, dunkelVorgabe: false, ...roh, ...(Object.keys(roh).length ? {} : { dunkelVorgabe: true }) })
  } catch {
    return VORGABE
  }
}

export const useDarstellung = create<{ d: Darstellung; setze: (d: Darstellung) => void }>((set) => ({
  d: ausSpeicher(),
  setze: (d) => {
    try {
      localStorage.setItem(SPEICHER, JSON.stringify(d))
    } catch {
      /* privates Fenster: dann nur für diese Sitzung */
    }
    set({ d })
  }
}))

/** Für den Server: ohne die Angaben, die auf dem Gerät bleiben */
export const fuerServer = (d: Darstellung): Partial<Darstellung> => {
  const kopie: Partial<Darstellung> = { ...d }
  for (const k of NUR_GERAET) delete kopie[k]
  return kopie
}

/** Vom Server geladen: Gerät-Angaben von hier behalten */
export const vomServer = (server: Partial<Darstellung>): Darstellung => {
  const hier = useDarstellung.getState().d
  return mitDunkelVorgabe({ ...VORGABE, dunkelVorgabe: false, ...server, leseschrift: hier.leseschrift, stimmen: hier.stimmen })
}

// ---------------------------------------------------------------- Helfer, die die Einstellungen wirksam machen

/** Faktor für das Sprechtempo */
export const tempoFaktor = (): number => {
  const t = useDarstellung.getState().d.tempo
  return t === 'langsam' ? 0.8 : t === 'schnell' ? 1.2 : 1
}

/** Gewählte Stimme einer Sprache (Name), falls auf diesem Gerät eingestellt */
export const gewaehlteStimme = (lang: string): string | undefined => useDarstellung.getState().d.stimmen?.[lang.slice(0, 2).toLowerCase()]

export const sprachausgabeDa = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window

/** Deutsche Stimme: die gewählte, sonst eine natürliche, sonst irgendeine deutsche */
function deutscheStimme(): SpeechSynthesisVoice | undefined {
  const alle = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('de'))
  const wahl = gewaehlteStimme('de')
  return alle.find((v) => v.name === wahl) ?? alle.find((v) => /natural|neural|online|google/i.test(v.name)) ?? alle[0]
}

/** Einen deutschen Text vorlesen (Gerätestimme, kostenlos, ohne Server) */
export function vorlesenText(text: string, onEnde?: () => void): void {
  if (!sprachausgabeDa()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, ' ').trim().slice(0, 4000))
  const v = deutscheStimme()
  if (v) u.voice = v
  u.lang = v?.lang ?? 'de-DE'
  u.rate = 0.95 * tempoFaktor()
  if (onEnde) {
    u.onend = onEnde
    u.onerror = onEnde
  }
  window.speechSynthesis.speak(u)
}

export const vorlesenStopp = (): void => {
  if (sprachausgabeDa()) window.speechSynthesis.cancel()
}

let klang: AudioContext | null = null
/**
 * Kurzer Ton (Einstellungen › Lernen › Töne): leiser Zweiklang bei „richtig", kleine Melodie bei „geschafft".
 * Bewusst kein Ton bei Fehlern – ein Fehler ist ein Hinweis, keine Strafe.
 */
export function ton(art: 'richtig' | 'geschafft'): void {
  if (!useDarstellung.getState().d.toene) return
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    klang ??= new AC()
    const ctx = klang
    void ctx.resume?.()
    const noten = art === 'richtig' ? [660, 880] : [523, 659, 784, 1047]
    noten.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const t = ctx.currentTime + i * 0.09
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.25)
    })
  } catch {
    // ohne Ton geht es auch
  }
}
