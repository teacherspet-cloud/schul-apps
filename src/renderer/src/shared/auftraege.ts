import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import type { StructuredRequest } from '@shared/types'
import { AbbruchFehler, istAbbruch } from '@shared/abbruch'
import { aktuelleKi, stempleKi } from '@shared/kiKennzeichnung'
import type { Netzfund } from '../../../main/services/ai/provider'
import { AiProgressTracker, neverBackwards, overallRatio, phaseRatio, type RunPhase } from './aiProgress'
import { istGeloescht, sichereAlles } from './autosave'
import { kiKennung, merkeAnfrage, merkeAuftrag, ruhigesZiel, schaetzeRest } from './restzeit'
import { useAppSettings } from './settingsStore'
import { offenLesen, offenMerken } from './sitzung'
import { useZwischenstaende, zwischenstandsMelder } from './zwischenstand'

/**
 * Hintergrund-Aufträge: Material entsteht, während die Lehrkraft weiterarbeitet.
 *
 * Wunsch der Lehrkraft (25.09.2026), wörtlich: „dass man in der Hauptapp und den Unterapps
 * weiterarbeiten kann während Material erzeugt wird. Paralleles Erzeugen von Material soll
 * nach Möglichkeit möglich sein." Bis dahin lag über jedem Programm ein Fenster ohne
 * Schließen-Knopf, solange die KI arbeitete – mehrere Minuten, in denen nichts ging.
 *
 * Ein Auftrag
 * - bekommt beim Start eine TIEFE KOPIE seiner Eingaben (`eingabe`). Was die Lehrkraft danach
 *   ändert oder öffnet, verändert den laufenden Auftrag nicht;
 * - gehört zu einem Dokument (`docId`) und legt sein Ergebnis GENAU DORT ab – gleich, welches
 *   Dokument inzwischen offen ist. Vorher schrieb das Ende der Erzeugung in den AKTUELLEN
 *   Speicher und überschrieb damit, was gerade offen war (`ablegen`, siehe `legeAb`);
 * - hat eigene KI-Aufrufe (`k.ai`, `k.bild`, `k.websuche`), deren Fortschritt, Warteplatz und
 *   Abbruch er kennt. Der Hauptprozess lässt höchstens drei Anfragen zugleich laufen
 *   (main/services/ai/kiPlaetze.ts); wer wartet, erscheint als „wartet auf freien Platz";
 * - lässt sich abbrechen. Ein Abbruch ist kein Fehler und erscheint nicht als roter Hinweis.
 *
 * Solange ein SPERRENDER Auftrag für ein Dokument läuft, zeigt das Programm statt des
 * Formulars einen Hinweis (`AuftragsHinweis`). Damit kann niemand dasselbe Dokument
 * gleichzeitig von Hand und von der KI ändern lassen – das Ergebnis ersetzt beim Ablegen die
 * erzeugten Teile, ohne Eingaben zu verlieren, die es nicht gibt. Kleine Aufträge (einen
 * Baustein überarbeiten) sperren nicht; sie ändern nur ihren eigenen Baustein.
 *
 * Die Liste zeigt die Auftragsleiste unten rechts (shell/AuftragsLayer.tsx); daraus leitet
 * die Seitenleiste den Punkt am Programmsymbol ab (navigation.ts).
 *
 * Restzeit (27.09.2026): Jeder Auftrag führt Buch über seine Anfragen (Art, KI, Dauer) und
 * meldet am Ende Dauer, Umfang und Mischung an den Verlauf (shared/restzeit.ts). Daraus
 * schätzt er laufend, wie lange es noch dauert – als Zielzeitpunkt `restBis`, damit der
 * Zähler in der Leiste zwischen zwei Schätzungen von selbst weiterläuft.
 */

export type AuftragsStatus = 'wartend' | 'laufend' | 'fertig' | 'fehler' | 'abgebrochen'

/** Ein Dokument, das ein Auftrag beim Ablegen angelegt hat (08.10.2026) */
export interface AuftragsZiel {
  moduleId: string
  docId: string
}

/** Eine offene Frage des Auftrags an die Lehrkraft (z. B. welche Quelle genommen wird) */
export interface Rueckfrage {
  art: string
  daten: unknown
  antworte: (wert: unknown) => void
}

export interface Auftrag {
  id: string
  moduleId: string
  docId: string
  /** Was entsteht – meist das Thema oder der Name des Dokuments */
  titel: string
  /** Welche Arbeit: „Gliederung planen", „Arbeitsblatt ausformulieren", „Test erstellen" … */
  art: string
  status: AuftragsStatus
  /** Anteil 0 bis 1 – läuft nie zurück */
  anteil: number
  meldung: string
  start: number
  ende?: number
  fehler?: string
  /** Sperrt das Dokument, solange er läuft (Hinweis statt Formular) */
  sperrt: boolean
  /** Kleine Aufträge nennen, woran sie arbeiten (z. B. die Kennung eines Bausteins) */
  schluessel?: string
  rueckfrage?: Rueckfrage
  /** Lässt sich mit denselben Eingaben erneut starten */
  kannErneut: boolean
  /** Warum er wartet, falls das mehr ist als „alle Plätze belegt" (siehe `warteGrund`) */
  wartegrund?: string
  /** Wartend: Platz in der Warteschlange des Hauptprozesses (1 = als Nächster dran; 08.10.2026) */
  platz?: number
  /**
   * Mindestens eine Anfrage hat schon gearbeitet (08.10.2026). Danach ist kurzes Warten auf einen Platz zwischen zwei
   * Anfragen kein neuer Zustand mehr: Anzeigen bleiben bei „Entsteht …" und nennen das Warten nur leise (`wartetKurz`).
   */
  gestartet?: boolean
  /** Fertig: wohin „Öffnen" führt, wenn nicht ins Dokument `docId` (z. B. das neue Arbeitsblatt eines Reihen-Schritts) */
  ziel?: AuftragsZiel
  /** Geschätzter Zeitpunkt des Endes (ms seit 1970) – fehlt, solange keine belastbare Zahl vorliegt */
  restBis?: number
  /** Der Auftrag läuft länger als alle gemerkten Läufe seiner Art */
  restLage?: 'laenger'
  /**
   * Nur über das Netz (iPad-App, Browser; 30.09.2026): Die Verbindung zum PC ist gerade weg –
   * der Auftrag läuft dort weiter – bzw. die Anfrage wird nach der Rückkehr aus dem Hintergrund
   * wiederholt (API-Modus auf dem iPad).
   */
  verbindung?: 'unterbrochen' | 'wiederholt'
  /** Nach einem Neustart der App wieder aufgenommen */
  fortgesetzt?: boolean
}

interface AuftraegeState {
  auftraege: Auftrag[]
  /** Leiste ausgeklappt (gemerkt) */
  offen: boolean
  /** Zählt neue Aufträge – die eingeklappte Leiste pulsiert kurz */
  neu: number
  setzeOffen: (offen: boolean) => void
  entferne: (id: string) => void
}

const OFFEN_KEY = 'schul-apps-auftraege-offen'
/** Standard: eingeklappt – die Liste läge sonst über den Knöpfen unten rechts im Formular. Offen gilt je Sitzung (shared/sitzung.ts, 09.10.2026). */
const leseOffen = (): boolean => offenLesen<boolean>(OFFEN_KEY) === true

export const useAuftraege = create<AuftraegeState>((set) => ({
  auftraege: [],
  offen: leseOffen(),
  neu: 0,
  setzeOffen: (offen) => {
    offenMerken(OFFEN_KEY, offen)
    set({ offen })
  },
  entferne: (id) => {
    const lz = laufzeit.get(id)
    if (lz && !lz.beendet) return
    laufzeit.delete(id)
    set((s) => ({ auftraege: s.auftraege.filter((a) => a.id !== id) }))
  }
}))

export const laeuft = (a: Pick<Auftrag, 'status'>): boolean => a.status === 'laufend' || a.status === 'wartend'

/** Was ein Auftrag zum Arbeiten bekommt */
export interface AuftragsKontext {
  signal: AbortSignal
  /** KI-Aufruf dieses Auftrags – mit Fortschritt, Warteplatz und Abbruch */
  ai: <T>(req: StructuredRequest) => Promise<T>
  /** KI-Bild als data:-URL (roh, noch nicht freigestellt) */
  bild: (prompt: string) => Promise<string>
  websuche: (auftrag: string) => Promise<Netzfund[]>
  /**
   * Zwischenstand melden. Mit `fertig`/`gesamt` wächst der Balken um die erledigten
   * Schritte; der Anteil der gerade laufenden KI-Antwort kommt von selbst hinzu.
   * `abschnitt` teilt einen Lauf in Ausformulieren und Fertigstellen (siehe aiProgress.ts).
   */
  melde: (meldung: string, fertig?: number, gesamt?: number, abschnitt?: RunPhase) => void
  /** Eine Frage an die Lehrkraft; der Auftrag wartet auf die Antwort */
  frage: <T>(art: string, daten: unknown) => Promise<T>
  /**
   * Zwischenstand für die Live-Vorschau (02.10.2026, shared/zwischenstand.ts): wird kopiert und
   * gedrosselt angezeigt, nie abgelegt. `geaendert` fehlt meist – dann vergleicht die App selbst.
   */
  zeige: (stand: unknown, hinweis?: { geaendert?: string[]; was?: string }) => void
  /**
   * Sichtbar warten (06.10.2026, Medienbank der Vokabeln): Der Auftrag steht als „wartend" mit `grund`
   * in der Leiste (z. B. „Sprach-KI ausgelastet – wartet bis 14:35"), bis `warten` erfüllt ist; ein
   * Abbruch beendet das Warten sofort.
   */
  pausiere: <T>(grund: string, warten: Promise<T>) => Promise<T>
}

export interface AuftragsStart<I, E> {
  moduleId: string
  docId: string
  titel: string
  art: string
  /** Eingaben zum Startzeitpunkt – werden tief kopiert */
  eingabe: I
  arbeit: (eingabe: I, k: AuftragsKontext) => Promise<E>
  /**
   * Ergebnis im Dokument `docId` ablegen (siehe `legeAb`). Legt es dabei ein eigenes Dokument an, kann es dessen Ort
   * liefern – „Öffnen" in der Leiste führt dann dorthin (`Auftrag.ziel`).
   */
  ablegen: (ergebnis: E, eingabe: I) => Promise<void | AuftragsZiel>
  /** Ist das Dokument gerade offen? Dann öffnet „Öffnen" nur das Programm. */
  istOffen?: () => boolean
  /** Standard: sperrt das Dokument */
  sperrt?: boolean
  schluessel?: string
  /** Überschrift des Fehlerhinweises */
  fehlerTitel?: string
  /** Abschließende Meldung in der Leiste (z. B. welche Aufgaben entstanden sind) */
  abschluss?: (ergebnis: E) => string
  /**
   * Nach einem Neustart der iPad-App fortsetzbar (siehe `registriereFortsetzung`): die Art und
   * die Argumente, mit denen das Programm denselben Auftrag erneut startet.
   */
  fortsetzen?: Fortsetzung
}

/** Womit ein Programm einen Auftrag nach einem Neustart der App wieder anstößt */
export interface Fortsetzung {
  art: string
  args: unknown[]
}

interface Laufzeit {
  steuerung: AbortController
  /** Anfragen, die gerade beim Hauptprozess liegen */
  anfragen: Set<string>
  beendet: boolean
  /** Legt gerade ab – ein Abbruch käme zu spät und ließe ein halb gespeichertes Dokument zurück */
  legtAb?: boolean
  istOffen?: () => boolean
  erneut?: () => void
  /** Wartet gerade sichtbar (`k.pausiere`) – mit diesem Grund */
  pause?: string
  /** Eine Anfrage hat schon gearbeitet (Meldung „laufend" des Hauptprozesses oder fertig) */
  gestartet?: boolean
}

const laufzeit = new Map<string, Laufzeit>()
/**
 * Anfragen, die auf einen freien Platz warten (Meldung des Hauptprozesses) – mit der Zahl der
 * Plätze, die dabei noch abgebrochene Anfragen halten (davon Bilder).
 */
const wartendeAnfragen = new Map<string, { abgebrochen: number; bilder: number; platz?: number }>()
/** Anfragen, die der Hauptprozess als „laufend" gemeldet hat (08.10.2026) – bis dahin ist ihr Zustand unbekannt */
const angelaufen = new Set<string>()
let zaehler = 0

/**
 * Wie ein Fehler gemeldet wird, stellt die Oberfläche ein (shell/AuftragsLayer.tsx). So kommt
 * diese Datei ohne Mantine aus und lässt sich ohne Oberfläche prüfen.
 */
let meldeFehler: (e: unknown, titel: string) => void = () => undefined
export const setzeFehlerMeldung = (fn: (e: unknown, titel: string) => void): void => {
  meldeFehler = fn
}

/*
 * Wartezeit je Anfrage (07.10.2026, Befund der Lehrkraft): Eine Anfrage, die 30 Minuten auf einen freien Platz gewartet
 * hat, zeigte „noch etwa 20 Min." – die Restzeit rechnete die Wartezeit als Arbeitszeit. Gezählt wird deshalb, wie
 * lange jede Anfrage wartete; Restzeit und gelernte Dauern rechnen nur mit der Zeit, in der wirklich gearbeitet wurde.
 */
const anfrageWarten = new Map<string, { summe: number; seit?: number }>()
/** Bisherige Wartezeit einer Anfrage (ms), die laufende eingeschlossen */
export function gewartetVon(id: string, nun = Date.now()): number {
  const w = anfrageWarten.get(id)
  return w ? w.summe + (w.seit !== undefined ? nun - w.seit : 0) : 0
}
/** Wartezustand einer Anfrage festhalten (auch für Tests) */
export function merkeWartezustand(id: string, wartend: boolean, nun = Date.now()): void {
  const w = anfrageWarten.get(id) ?? { summe: 0 }
  if (wartend && w.seit === undefined) w.seit = nun
  if (!wartend && w.seit !== undefined) {
    w.summe += nun - w.seit
    w.seit = undefined
  }
  anfrageWarten.set(id, w)
}
/** Aufträge hören mit, wenn eine ihrer Anfragen zu warten beginnt oder aufhört */
const platzHoerer = new Set<() => void>()

let platzAbo: (() => void) | null = null
function horchePlatz(): void {
  if (platzAbo || typeof window === 'undefined' || !window.api?.ai.onPlatz) return
  platzAbo = window.api.ai.onPlatz(({ id, zustand, abgebrochen, abgebrocheneBilder, platz }) => {
    if (zustand === 'wartend') wartendeAnfragen.set(id, { abgebrochen: abgebrochen ?? 0, bilder: abgebrocheneBilder ?? 0, platz })
    else {
      wartendeAnfragen.delete(id)
      // Die Anfrage arbeitet: ihr Auftrag hat begonnen
      if (anfrageWarten.has(id)) angelaufen.add(id)
      for (const lz of laufzeit.values()) if (lz.anfragen.has(id)) lz.gestartet = true
    }
    if (anfrageWarten.has(id)) merkeWartezustand(id, zustand === 'wartend')
    for (const fn of platzHoerer) fn()
    for (const [auftragId, lz] of laufzeit) if (lz.anfragen.has(id)) aendere(auftragId, (a) => ({ ...a, ...lage(lz, a) }))
  })
  // Verbindung zum PC unterbrochen bzw. wieder da (iPad-App, Browser) – die Leiste sagt es
  window.api.ai.onVerbindung?.(({ id, zustand }) => {
    for (const [auftragId, lz] of laufzeit) {
      if (lz.anfragen.has(id))
        aendere(auftragId, (a) => ({
          ...a,
          verbindung: zustand === 'verbunden' ? undefined : zustand
        }))
    }
  })
}

/*
 * ---------- Nach einem Neustart der iPad-App fortsetzen (30.09.2026) ----------
 *
 * Wunsch der Lehrkraft: Aufträge, die vom iPad aus aufgegeben wurden, sollen nach einer
 * Unterbrechung abgerufen und im richtigen Dokument abgelegt werden – auch wenn iOS die App
 * im Hintergrund beendet hat. Die KI-Anfragen selbst liegen dann noch im Auftragsregister am PC
 * (mobil/pcKi.ts merkt ihre IDs). Was fehlt, ist der Auftrag in der Oberfläche: Er ist
 * Programmcode (`arbeit`, `ablegen`) und überlebt keinen Neustart.
 *
 * Deshalb merkt sich die iPad-App jeden laufenden Auftrag (localStorage). Programme, die einen
 * Auftrag aus seinen Argumenten erneut anstoßen können, melden das an (`registriereFortsetzung`)
 * und geben beim Start `fortsetzen` mit. Nach dem Neustart startet `nimmUnterbrocheneAuf` sie
 * mit denselben Eingaben neu; dieselben KI-Anfragen finden dabei ihre Aufträge am PC wieder –
 * laufende laufen weiter, fertige kommen sofort, nichts wird doppelt berechnet. Das Ergebnis
 * landet über `ablegen` wie immer im Dokument `docId`. Aufträge ohne Fortsetzung erscheinen in
 * der Leiste als unterbrochen.
 */
const UNTERBROCHEN_KEY = 'schul-apps-auftraege-unterbrochen'
/** Höchstens so oft wird derselbe Auftrag nach Neustarts fortgesetzt – ein Auftrag, der die App abstürzen lässt, soll sie nicht dauerhaft lahmlegen */
const MAX_FORTSETZUNGEN = 2

interface GemerkterAuftrag {
  id: string
  moduleId: string
  docId: string
  titel: string
  art: string
  start: number
  fortsetzen?: Fortsetzung
  versuche: number
}

const fortsetzer = new Map<string, (...args: never[]) => unknown>()
/** Wie oft der gerade (wieder) startende Auftrag schon fortgesetzt wurde */
let laufendeFortsetzung = 0

/** Ein Programm kann Aufträge dieser Art aus ihren Argumenten erneut starten */
export function registriereFortsetzung<A extends unknown[]>(art: string, fn: (...args: A) => unknown): void {
  fortsetzer.set(art, fn as unknown as (...args: never[]) => unknown)
}

const merkenAn = (): boolean => typeof window !== 'undefined' && window.__plattform === 'ios'

function leseGemerkte(): GemerkterAuftrag[] {
  try {
    const liste = JSON.parse(localStorage.getItem(UNTERBROCHEN_KEY) ?? '[]') as GemerkterAuftrag[]
    return Array.isArray(liste) ? liste.filter((a) => a && typeof a.id === 'string') : []
  } catch {
    return []
  }
}

function schreibeGemerkte(liste: GemerkterAuftrag[]): void {
  try {
    localStorage.setItem(UNTERBROCHEN_KEY, JSON.stringify(liste))
  } catch {
    // Zu groß (Bilder in den Eingaben): ohne Argumente merken – dann erscheint er nach einem Neustart als unterbrochen
    try {
      localStorage.setItem(UNTERBROCHEN_KEY, JSON.stringify(liste.map(({ fortsetzen: _f, ...rest }) => rest)))
    } catch {
      // ohne Speicher gibt es kein Fortsetzen
    }
  }
}

function merkeLaufenden(a: GemerkterAuftrag): void {
  if (!merkenAn()) return
  schreibeGemerkte([...leseGemerkte().filter((x) => x.id !== a.id), a])
}

function vergissLaufenden(id: string): void {
  if (!merkenAn()) return
  const liste = leseGemerkte()
  if (liste.some((a) => a.id === id)) schreibeGemerkte(liste.filter((a) => a.id !== id))
}

/**
 * Beim Start der Oberfläche: Aufträge, die beim letzten Beenden der App noch liefen, fortsetzen
 * oder als unterbrochen zeigen. Liefert die Zahl der fortgesetzten.
 */
let aufgenommen = false
export function nimmUnterbrocheneAuf(): number {
  // Nur einmal je Start – sonst fände ein zweiter Aufruf die eben fortgesetzten Aufträge und startete sie doppelt
  if (!merkenAn() || aufgenommen) return 0
  aufgenommen = true
  const liste = leseGemerkte()
  if (!liste.length) return 0
  schreibeGemerkte([])
  let fortgesetzt = 0
  for (const g of liste) {
    const fn = g.fortsetzen ? fortsetzer.get(g.fortsetzen.art) : undefined
    if (fn && g.fortsetzen && (g.versuche ?? 0) < MAX_FORTSETZUNGEN) {
      laufendeFortsetzung = (g.versuche ?? 0) + 1
      try {
        fn(...(g.fortsetzen.args as never[]))
        fortgesetzt++
        continue
      } catch (e) {
        console.error(e)
      } finally {
        laufendeFortsetzung = 0
      }
    }
    useAuftraege.setState((s) => ({
      neu: s.neu + 1,
      auftraege: [
        ...s.auftraege,
        {
          id: `u-${g.id}`,
          moduleId: g.moduleId,
          docId: g.docId,
          titel: g.titel,
          art: g.art,
          status: 'fehler',
          anteil: 0,
          meldung: 'Durch Beenden der App unterbrochen',
          fehler: 'Die App wurde beendet, während der Auftrag lief. Ein erneuter Start mit denselben Eingaben übernimmt, was der PC davon schon fertig hat.',
          start: g.start,
          ende: Date.now(),
          sperrt: false,
          kannErneut: false
        }
      ]
    }))
  }
  return fortgesetzt
}

/**
 * Wartet ein Auftrag nur noch auf Plätze, heißt er „wartend" – sonst „laufend".
 *
 * Kein Aufblitzen (08.10.2026): Eine neue Anfrage ist kurz weder als wartend noch als laufend gemeldet. Wartete der
 * Auftrag, bleibt er so lange „wartend", statt für einen Augenblick „laufend" zu zeigen.
 */
function lage(lz: Laufzeit, a: Auftrag): Pick<Auftrag, 'status' | 'wartegrund' | 'platz' | 'gestartet'> {
  const gestartet = lz.gestartet || a.gestartet ? true : undefined
  if (!laeuft(a)) return { status: a.status, wartegrund: undefined, platz: undefined, gestartet }
  if (lz.pause) return { status: 'wartend', wartegrund: lz.pause, platz: undefined, gestartet }
  const ids = [...lz.anfragen]
  const wartet = ids.length > 0 && ids.every((id) => wartendeAnfragen.has(id))
  if (!wartet) {
    const unbekannt = Boolean(platzAbo) && ids.length > 0 && ids.every((id) => wartendeAnfragen.has(id) || !angelaufen.has(id))
    if (unbekannt && a.status === 'wartend') return { status: 'wartend', wartegrund: a.wartegrund, platz: a.platz, gestartet }
    return { status: 'laufend', wartegrund: undefined, platz: undefined, gestartet }
  }
  const lagen = ids.map((id) => wartendeAnfragen.get(id)!)
  // Der vorderste Platz seiner Anfragen – mit ihm geht es weiter
  const plaetze = lagen.map((l) => l.platz).filter((p): p is number => typeof p === 'number' && p > 0)
  return { status: 'wartend', wartegrund: warteGrund(lagen), platz: plaetze.length ? Math.min(...plaetze) : undefined, gestartet }
}

/** Wartet, bevor überhaupt eine Anfrage gearbeitet hat – „Wartet – Platz n" */
export const wartetVorStart = (a: Pick<Auftrag, 'status' | 'gestartet'>): boolean => a.status === 'wartend' && !a.gestartet

/** Hat schon gearbeitet und wartet gerade zwischen zwei Anfragen auf einen Platz – bleibt „Entsteht …", leiser Hinweis */
export const wartetKurz = (a: Pick<Auftrag, 'status' | 'gestartet'>): boolean => a.status === 'wartend' && Boolean(a.gestartet)

/**
 * Hält ein ABGEBROCHENER Auftrag noch einen Platz, sagt die Leiste das – leise, aber ehrlich.
 *
 * Anlass (Nachtrag der Lehrkraft zu Paket 3): Die Bild-KI von OpenAI lässt sich nicht
 * unterbrechen. Der Auftrag erscheint sofort als abgebrochen, der Anbieter rechnet das Bild
 * aber zu Ende, und so lange ist der Platz belegt. Ohne Erklärung sähe der wartende Auftrag
 * aus, als hinge er grundlos.
 */
export function warteGrund(lagen: { abgebrochen: number; bilder: number }[]): string | undefined {
  const n = Math.max(0, ...lagen.map((l) => l.abgebrochen))
  if (!n) return undefined
  const bilder = Math.max(0, ...lagen.map((l) => l.bilder))
  if (n === 1)
    return bilder ? 'Wartet – ein abgebrochener Bildauftrag gibt seinen Platz gleich frei' : 'Wartet – ein abgebrochener Auftrag gibt seinen Platz gleich frei'
  return bilder === n ? 'Wartet – abgebrochene Bildaufträge geben ihre Plätze gleich frei' : 'Wartet – abgebrochene Aufträge geben ihre Plätze gleich frei'
}

function aendere(id: string, fn: (a: Auftrag) => Auftrag): void {
  useAuftraege.setState((s) => ({ auftraege: s.auftraege.map((a) => (a.id === id ? fn(a) : a)) }))
}

/** Endet sofort, wenn der Auftrag abgebrochen wird – auch wenn die Arbeit selbst noch läuft. */
function rennen<T>(arbeit: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((ok, fehler) => {
    if (signal.aborted) return fehler(new AbbruchFehler())
    const ab = (): void => fehler(new AbbruchFehler())
    signal.addEventListener('abort', ab, { once: true })
    arbeit.then(
      (w) => {
        signal.removeEventListener('abort', ab)
        ok(w)
      },
      (e) => {
        signal.removeEventListener('abort', ab)
        fehler(e)
      }
    )
  })
}

/**
 * Startet einen Auftrag im Hintergrund.
 *
 * Liefert das Ergebnis, sobald es abgelegt ist – oder `null` bei Abbruch und Fehler (der
 * Fehler ist dann schon gemeldet). Wer nur anstoßen will, wartet nicht darauf.
 */
export function starteAuftrag<I, E>(start: AuftragsStart<I, E>): Promise<E | null> {
  horchePlatz()
  const id = `a${++zaehler}-${Date.now().toString(36)}`
  // Eingefroren: spätere Änderungen am Dokument gehen den laufenden Auftrag nichts an
  const eingabe = structuredClone(start.eingabe)
  const lz: Laufzeit = { steuerung: new AbortController(), anfragen: new Set(), beendet: false, istOffen: start.istOffen }
  lz.erneut = () => {
    useAuftraege.getState().entferne(id)
    void starteAuftrag({ ...start, eingabe })
  }
  laufzeit.set(id, lz)
  const signal = lz.steuerung.signal
  const jetzt = Date.now()
  useAuftraege.setState((s) => ({
    neu: s.neu + 1,
    auftraege: [
      ...s.auftraege,
      {
        id,
        moduleId: start.moduleId,
        docId: start.docId,
        titel: start.titel,
        art: start.art,
        status: 'laufend',
        anteil: 0,
        meldung: laufendeFortsetzung ? 'Nach dem Neustart fortgesetzt …' : 'Start …',
        start: jetzt,
        sperrt: start.sperrt ?? true,
        schluessel: start.schluessel,
        kannErneut: false,
        ...(laufendeFortsetzung ? { fortgesetzt: true } : {})
      }
    ]
  }))
  // iPad-App: für den Fall merken, dass iOS die App beendet, bevor der Auftrag fertig ist
  merkeLaufenden({
    id,
    moduleId: start.moduleId,
    docId: start.docId,
    titel: start.titel,
    art: start.art,
    start: jetzt,
    fortsetzen: start.fortsetzen,
    versuche: laufendeFortsetzung
  })

  // Fortschritt: erledigte Schritte plus Anteil der laufenden Antwort, nie rückwärts
  let stufe: { fertig: number; gesamt: number; abschnitt?: RunPhase } = { fertig: 0, gesamt: 1 }
  let gezeigt = 0
  const tracker = new AiProgressTracker(() => aktualisiere())

  // Buch über die Anfragen dieses Auftrags – Grundlage der Restzeit und des Verlaufs
  const buch = {
    erledigt: {} as Record<string, number>,
    laufend: new Map<string, { art: string; ki: string; start: number }>(),
    /** Größte gemeldete Schrittzahl – der Umfang, an dem die Mischung gemessen wird */
    umfang: 1
  }
  const kiFuer = (art: string, req?: StructuredRequest): string => kiKennung(useAppSettings.getState().settings.ai, art === 'bild' ? 'bild' : 'text', req)
  /*
   * Wartezeit des ganzen Auftrags: sichtbares Warten (`pausiere`, z. B. auf andere Medienaufträge) und Zeiten, in denen
   * alle seine Anfragen auf einen Platz warten. Sie zählt nicht als Arbeitszeit (07.10.2026).
   */
  const warten = { summe: 0, seit: undefined as number | undefined }
  const pruefeWarten = (nun = Date.now()): void => {
    const ids = [...lz.anfragen]
    const wartet = Boolean(lz.pause) || (ids.length > 0 && ids.every((x) => wartendeAnfragen.has(x)))
    if (wartet && warten.seit === undefined) warten.seit = nun
    if (!wartet && warten.seit !== undefined) {
      warten.summe += nun - warten.seit
      warten.seit = undefined
    }
  }
  const gewartet = (nun: number): number => warten.summe + (warten.seit !== undefined ? nun - warten.seit : 0)
  /** Arbeitszeit einer Anfrage: seit ihrem Start, ohne ihre Wartezeit auf einen Platz */
  const arbeitszeit = (anfrageId: string, l: { start: number }, nun: number): number => Math.max(0, nun - l.start - gewartetVon(anfrageId, nun))

  // Ruhige Restzeit (08.10.2026, restzeit.ts `ruhigesZiel`): Ziel und Zeitpunkt seiner letzten Änderung
  let restStand: { ziel: number; seit: number } | undefined
  const restzeit = (): Pick<Auftrag, 'restBis' | 'restLage'> => {
    const nun = Date.now()
    pruefeWarten(nun)
    const { sekunden, laenger } = schaetzeRest({
      art: start.art,
      umfang: buch.umfang,
      elapsedMs: Math.max(0, nun - jetzt - gewartet(nun)),
      ratio: gezeigt,
      erledigt: buch.erledigt,
      laufend: [...buch.laufend].map(([anfrageId, l]) => ({ art: l.art, ki: l.ki, elapsedMs: arbeitszeit(anfrageId, l, nun), ...tracker.stand(anfrageId) })),
      ki: (art) => kiFuer(art)
    })
    if (laenger) {
      restStand = undefined
      return { restBis: undefined, restLage: 'laenger' }
    }
    if (sekunden === null) {
      restStand = undefined
      return { restBis: undefined, restLage: undefined }
    }
    restStand = ruhigesZiel(restStand, nun + sekunden * 1000, nun)
    return { restBis: restStand.ziel, restLage: undefined }
  }

  const aktualisiere = (meldung?: string): void => {
    const chunk = tracker.ratio()
    const roh = stufe.abschnitt ? phaseRatio(stufe.abschnitt, stufe.fertig, stufe.gesamt, chunk) : overallRatio(stufe.fertig, stufe.gesamt, chunk)
    gezeigt = neverBackwards(gezeigt, roh)
    const rest = restzeit()
    aendere(id, (a) => (laeuft(a) ? { ...a, anteil: gezeigt, meldung: meldung ?? a.meldung, ...lage(lz, a), ...rest } : a))
  }
  // Beginnt oder endet das Warten einer Anfrage, gleich neu schätzen
  const platzGeaendert = (): void => {
    if (!lz.beendet && !signal.aborted) aktualisiere()
  }
  platzHoerer.add(platzGeaendert)
  // Ohne Zeichenstrom (Bilder, Abo-Zugang) käme sonst minutenlang keine neue Schätzung
  const takt = setInterval(() => {
    if (!lz.beendet && !signal.aborted) aktualisiere()
  }, 5000)

  const anfrage = async <T>(art: string, senden: (anfrageId: string) => Promise<T>, req?: StructuredRequest): Promise<T> => {
    if (signal.aborted) throw new AbbruchFehler()
    // Kennung „<auftrag>~<anfrage>": Der Hauptprozess bedient wartende Anfragen im Wechsel je Auftrag (kiPlaetze.ts)
    const anfrageId = tracker.begin(art, `${id}~`)
    anfrageWarten.set(anfrageId, { summe: 0 })
    lz.anfragen.add(anfrageId)
    buch.laufend.set(anfrageId, { art, ki: kiFuer(art, req), start: Date.now() })
    // Schon jetzt schätzen: Mit Verlauf steht die Restzeit ab der ersten Sekunde da
    aktualisiere()
    let ok = false
    try {
      const wert = await senden(anfrageId)
      ok = true
      return wert
    } catch (e) {
      throw signal.aborted ? new AbbruchFehler() : e
    } finally {
      const lauf = buch.laufend.get(anfrageId)
      buch.laufend.delete(anfrageId)
      if (ok) lz.gestartet = true
      angelaufen.delete(anfrageId)
      if (ok && lauf) {
        buch.erledigt[art] = (buch.erledigt[art] ?? 0) + 1
        merkeAnfrage(art, lauf.ki, { ms: arbeitszeit(anfrageId, lauf, Date.now()), chars: tracker.stand(anfrageId).chars })
      }
      anfrageWarten.delete(anfrageId)
      tracker.end(anfrageId, ok)
      lz.anfragen.delete(anfrageId)
      wartendeAnfragen.delete(anfrageId)
      if (!signal.aborted) aktualisiere()
    }
  }

  const vorschau = zwischenstandsMelder(id)
  const k: AuftragsKontext = {
    signal,
    zeige: (stand, hinweis) => {
      if (!signal.aborted) vorschau.zeige(stand, hinweis)
    },
    pausiere: async <T>(grund: string, warten: Promise<T>): Promise<T> => {
      lz.pause = grund
      aktualisiere()
      try {
        return await rennen(warten, signal)
      } finally {
        lz.pause = undefined
        if (!signal.aborted) aktualisiere()
      }
    },
    ai: <T>(req: StructuredRequest) =>
      anfrage(
        req.schemaName,
        async (progressId) => {
          // Live-Vorschau: den bisher gelieferten Text an den Aufrufer (nur bei Anbietern mit Antwortstrom)
          const { onTeilText, ...ohne } = req
          const weg = onTeilText ? window.api.ai.onProgress((p) => p.id === progressId && p.text && !signal.aborted && onTeilText(p.text)) : undefined
          try {
            return await window.api.ai.structured<T>({ ...ohne, progressId, ...(onTeilText ? { teilText: true } : {}) })
          } finally {
            weg?.()
          }
        },
        req
      ),
    bild: (prompt) => anfrage('bild', (anfrageId) => window.api.ai.image(prompt, anfrageId)),
    websuche: (auftrag) => anfrage('websuche', (anfrageId) => window.api.ai.websuche(auftrag, anfrageId)),
    melde: (meldung, fertig, gesamt, abschnitt) => {
      if (signal.aborted) return
      if (fertig !== undefined && gesamt !== undefined) {
        stufe = { fertig, gesamt, abschnitt }
        buch.umfang = Math.max(buch.umfang, gesamt)
      }
      aktualisiere(meldung)
    },
    frage: <T>(art: string, daten: unknown) =>
      rennen(
        new Promise<T>((antwort) => {
          aendere(id, (a) => ({
            ...a,
            meldung: 'Wartet auf eine Auswahl',
            rueckfrage: {
              art,
              daten,
              antworte: (wert) => {
                aendere(id, (x) => ({ ...x, rueckfrage: undefined, meldung: 'Weiter …' }))
                antwort(wert as T)
              }
            }
          }))
        }),
        signal
      )
  }

  return (async () => {
    try {
      // Was am Dokument noch ansteht, zuerst sichern – der Entwurf soll in der Bibliothek liegen
      await rennen(sichereAlles(), signal)
      /*
       * `rennen`: Der Abbruch wirkt für die Lehrkraft SOFORT – auch wenn der Anbieter die Anfrage
       * nicht beenden kann (die Bild-KI von OpenAI nimmt kein Abbruchsignal) oder die Antwort
       * über das Netz erst später eintrifft. Ein spätes Ergebnis landet nirgends: `arbeit`
       * läuft ins Leere, abgelegt wird nichts.
       */
      const ergebnis = await rennen(start.arbeit(eingabe, k), signal)
      if (signal.aborted) throw new AbbruchFehler()
      lz.legtAb = true
      aendere(id, (a) => ({ ...a, meldung: 'Wird abgelegt …' }))
      const ziel = (await start.ablegen(ergebnis, eingabe)) as AuftragsZiel | undefined
      const ende = Date.now()
      pruefeWarten(ende)
      // Aus diesem Lauf lernen: Dauer (ohne Wartezeit), Umfang und Mischung der Anfragen dieser Auftragsart
      merkeAuftrag(start.art, { ms: Math.max(0, ende - jetzt - gewartet(ende)), umfang: buch.umfang, ki: kiFuer('text'), mix: { ...buch.erledigt } })
      aendere(id, (a) => ({
        ...a,
        status: 'fertig',
        anteil: 1,
        ende,
        platz: undefined,
        ...(ziel ? { ziel } : {}),
        rueckfrage: undefined,
        restBis: undefined,
        restLage: undefined,
        meldung: start.abschluss?.(ergebnis) ?? 'Fertig – in der Bibliothek gespeichert'
      }))
      return ergebnis
    } catch (e) {
      if (signal.aborted || istAbbruch(e)) {
        aendere(id, (a) => ({ ...a, status: 'abgebrochen', ende: Date.now(), rueckfrage: undefined, meldung: 'Abgebrochen' }))
      } else {
        const text = e instanceof Error ? e.message : String(e)
        aendere(id, (a) => ({ ...a, status: 'fehler', ende: Date.now(), rueckfrage: undefined, fehler: text, meldung: text, kannErneut: true }))
        meldeFehler(e, start.fehlerTitel ?? `${start.art} fehlgeschlagen`)
      }
      return null
    } finally {
      lz.beendet = true
      vorschau.ende()
      clearInterval(takt)
      platzHoerer.delete(platzGeaendert)
      tracker.dispose()
      vergissLaufenden(id)
    }
  })()
}

/** Bricht einen Auftrag ab – laufende KI-Anfragen werden im Hauptprozess beendet. */
export function brichAb(id: string): void {
  const lz = laufzeit.get(id)
  if (!lz || lz.beendet || lz.legtAb || lz.steuerung.signal.aborted) return
  lz.steuerung.abort()
  for (const anfrageId of lz.anfragen) void window.api.ai.cancel(anfrageId).catch(() => undefined)
}

/** Alle laufenden Aufträge abbrechen (Fenster wird trotzdem geschlossen). */
export function brichAlleAb(): void {
  for (const a of useAuftraege.getState().auftraege) if (laeuft(a)) brichAb(a.id)
}

/** Denselben Auftrag noch einmal starten (nach einem Fehler) */
export function versucheErneut(id: string): void {
  laufzeit.get(id)?.erneut?.()
}

/** Ist das Dokument dieses Auftrags gerade im Programm offen? */
export function dokumentOffen(id: string): boolean {
  return laufzeit.get(id)?.istOffen?.() ?? false
}

/** Laufende Aufträge (für die Rückfrage beim Schließen) */
export const laufendeAuftraege = (): Auftrag[] => useAuftraege.getState().auftraege.filter(laeuft)

/** Der Auftrag, der dieses Dokument gerade sperrt – falls einer läuft */
export function useSperrenderAuftrag(docId: string | null | undefined): Auftrag | undefined {
  return useAuftraege((s) => (docId ? s.auftraege.find((a) => a.docId === docId && a.sperrt && laeuft(a)) : undefined))
}

/**
 * Ein laufender, NICHT sperrender Auftrag dieses Dokuments mit Zwischenstand (Live-Vorschau,
 * 02.10.2026) – etwa ein Tafelbild, das entsteht, während das Formular offen bleibt.
 */
export function useLiveAuftrag(docId: string | null | undefined): Auftrag | undefined {
  const mitStand = useZwischenstaende((s) => Object.keys(s.staende).sort().join('|'))
  return useAuftraege((s) => {
    if (!docId || !mitStand) return undefined
    const ids = new Set(mitStand.split('|'))
    return s.auftraege.find((a) => a.docId === docId && !a.sperrt && laeuft(a) && ids.has(a.id))
  })
}

/**
 * Laufende kleine Aufträge eines Dokuments, nach ihrem Schlüssel (z. B. Baustein).
 *
 * Gewählt wird eine Zeichenkette statt der Liste: Sonst würde der Editor bei jeder
 * Fortschrittsmeldung irgendeines Auftrags neu zeichnen – fünfmal je Sekunde das ganze Blatt.
 */
export function useLaufendeSchluessel(docId: string | null | undefined): Set<string> {
  const kette = useAuftraege((s) =>
    s.auftraege
      .filter((a) => a.docId === docId && a.schluessel && laeuft(a))
      .map((a) => a.schluessel!)
      .sort()
      .join('|')
  )
  return useMemo(() => new Set(kette ? kette.split('|') : []), [kette])
}

/** Offene Rückfrage eines Auftrags für dieses Dokument */
export function useRueckfrage(docId: string | null | undefined, art: string): Rueckfrage | undefined {
  return useAuftraege((s) => (docId ? s.auftraege.find((a) => a.docId === docId && a.rueckfrage?.art === art)?.rueckfrage : undefined))
}

/** Verstrichene Zeit als „0:42" bzw. „12:05" */
export function dauerLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Sekundentakt, solange etwas läuft – für verstrichene Zeit und Restzeit */
export function useSekundentakt(an: boolean): number {
  const [jetzt, setJetzt] = useState(() => Date.now())
  useEffect(() => {
    if (!an) return
    const t = setInterval(() => setJetzt(Date.now()), 1000)
    return () => clearInterval(t)
  }, [an])
  return jetzt
}

/**
 * Wo und wie ein Programm sein Ergebnis ablegt.
 *
 * `imOffenen` ändert das offene Dokument als EINEN Rückgängig-Schritt; `laden`/`speichern`
 * gehen direkt an die Bibliothek.
 */
export interface DokumentAblage<D> {
  istOffen: (docId: string) => boolean
  imOffenen: (einarbeiten: (aktuell: D) => D) => void
  laden: (docId: string) => Promise<{ name: string; dok: D }>
  speichern: (docId: string, name: string | null, dok: D) => Promise<void>
}

/**
 * Legt ein Ergebnis im Dokument `docId` ab – unabhängig davon, was gerade offen ist.
 *
 * - Ist genau dieses Dokument offen, ändert sich der Stand im Programm als Rückgängig-Schritt,
 *   und die Sicherung läuft sofort (kein zweiter, konkurrierender Schreibvorgang: gespeichert
 *   wird über denselben Weg wie sonst auch).
 * - Sonst wird der gespeicherte Stand geladen, das Ergebnis eingearbeitet und unter derselben
 *   Kennung gespeichert – der Entwurf wird zum fertigen Dokument. Liegt noch nichts in der
 *   Bibliothek, dient der Schnappschuss vom Start als Grundlage.
 *
 * `einarbeiten` ersetzt nur, was der Auftrag erzeugt hat (Gliederung, Aufgaben …); Eingaben
 * aus dem gespeicherten Stand bleiben. Das offene Dokument war während des Laufs gesperrt –
 * wer also danach eingreift (etwa „Erneut versuchen" nach Änderungen), findet den vorigen
 * Stand über Strg+Z wieder.
 */
export async function legeAb<D>(ablage: DokumentAblage<D>, docId: string, schnappschuss: D, einarbeitenRoh: (aktuell: D) => D): Promise<void> {
  /*
   * KI-Kennzeichnung (Großprogramm 0.4): Jedes Ergebnis, das hier ankommt, stammt von einer KI.
   * Das Dokument merkt sich, welche – Word und PDF tragen es in die Dateieigenschaften ein.
   */
  const { settings } = useAppSettings.getState()
  const ki = aktuelleKi(settings)
  const einarbeiten = (aktuell: D): D => stempleKi(einarbeitenRoh(aktuell), ki, settings.kiVermerk)
  // Inzwischen gelöscht: Das Ergebnis wird verworfen – sonst legte es das Dokument aus dem Schnappschuss neu an
  if (istGeloescht(docId)) return
  if (ablage.istOffen(docId)) {
    ablage.imOffenen(einarbeiten)
    await sichereAlles()
    return
  }
  const gespeichert = await ablage.laden(docId).catch(() => null)
  await ablage.speichern(docId, gespeichert?.name ?? null, einarbeiten(gespeichert?.dok ?? schnappschuss))
  // Wurde das Dokument genau jetzt geöffnet (älterer Stand aus der Bibliothek), dort nachziehen
  if (ablage.istOffen(docId)) {
    ablage.imOffenen(einarbeiten)
    await sichereAlles()
  }
}
