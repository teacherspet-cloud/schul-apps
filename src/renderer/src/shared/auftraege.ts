import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import type { StructuredRequest } from '@shared/types'
import { AbbruchFehler, istAbbruch } from '@shared/abbruch'
import { aktuelleKi, stempleKi } from '@shared/kiKennzeichnung'
import type { Netzfund } from '../../../main/services/ai/provider'
import { AiProgressTracker, neverBackwards, overallRatio, phaseRatio, type RunPhase } from './aiProgress'
import { istGeloescht, sichereAlles } from './autosave'
import { glaetteZiel, kiKennung, merkeAnfrage, merkeAuftrag, schaetzeRest } from './restzeit'
import { useAppSettings } from './settingsStore'

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
  /** Geschätzter Zeitpunkt des Endes (ms seit 1970) – fehlt, solange keine belastbare Zahl vorliegt */
  restBis?: number
  /** Der Auftrag läuft länger als alle gemerkten Läufe seiner Art */
  restLage?: 'laenger'
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
/** Standard: eingeklappt – die Liste läge sonst über den Knöpfen unten rechts im Formular */
const leseOffen = (): boolean => {
  try {
    return localStorage.getItem(OFFEN_KEY) === '1'
  } catch {
    return false
  }
}

export const useAuftraege = create<AuftraegeState>((set) => ({
  auftraege: [],
  offen: leseOffen(),
  neu: 0,
  setzeOffen: (offen) => {
    try {
      localStorage.setItem(OFFEN_KEY, offen ? '1' : '0')
    } catch {
      // ohne lokalen Speicher gilt die Wahl nur für diese Sitzung
    }
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
}

export interface AuftragsStart<I, E> {
  moduleId: string
  docId: string
  titel: string
  art: string
  /** Eingaben zum Startzeitpunkt – werden tief kopiert */
  eingabe: I
  arbeit: (eingabe: I, k: AuftragsKontext) => Promise<E>
  /** Ergebnis im Dokument `docId` ablegen (siehe `legeAb`) */
  ablegen: (ergebnis: E, eingabe: I) => Promise<void>
  /** Ist das Dokument gerade offen? Dann öffnet „Öffnen" nur das Programm. */
  istOffen?: () => boolean
  /** Standard: sperrt das Dokument */
  sperrt?: boolean
  schluessel?: string
  /** Überschrift des Fehlerhinweises */
  fehlerTitel?: string
  /** Abschließende Meldung in der Leiste (z. B. welche Aufgaben entstanden sind) */
  abschluss?: (ergebnis: E) => string
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
}

const laufzeit = new Map<string, Laufzeit>()
/**
 * Anfragen, die auf einen freien Platz warten (Meldung des Hauptprozesses) – mit der Zahl der
 * Plätze, die dabei noch abgebrochene Anfragen halten (davon Bilder).
 */
const wartendeAnfragen = new Map<string, { abgebrochen: number; bilder: number }>()
let zaehler = 0

/**
 * Wie ein Fehler gemeldet wird, stellt die Oberfläche ein (shell/AuftragsLayer.tsx). So kommt
 * diese Datei ohne Mantine aus und lässt sich ohne Oberfläche prüfen.
 */
let meldeFehler: (e: unknown, titel: string) => void = () => undefined
export const setzeFehlerMeldung = (fn: (e: unknown, titel: string) => void): void => {
  meldeFehler = fn
}

let platzAbo: (() => void) | null = null
function horchePlatz(): void {
  if (platzAbo || typeof window === 'undefined' || !window.api?.ai.onPlatz) return
  platzAbo = window.api.ai.onPlatz(({ id, zustand, abgebrochen, abgebrocheneBilder }) => {
    if (zustand === 'wartend') wartendeAnfragen.set(id, { abgebrochen: abgebrochen ?? 0, bilder: abgebrocheneBilder ?? 0 })
    else wartendeAnfragen.delete(id)
    for (const [auftragId, lz] of laufzeit) if (lz.anfragen.has(id)) aendere(auftragId, (a) => ({ ...a, ...lage(lz, a) }))
  })
}

/** Wartet ein Auftrag nur noch auf Plätze, heißt er „wartend" – sonst „laufend". */
function lage(lz: Laufzeit, a: Auftrag): Pick<Auftrag, 'status' | 'wartegrund'> {
  if (!laeuft(a)) return { status: a.status, wartegrund: undefined }
  const ids = [...lz.anfragen]
  const wartet = ids.length > 0 && ids.every((id) => wartendeAnfragen.has(id))
  return { status: wartet ? 'wartend' : 'laufend', wartegrund: wartet ? warteGrund(ids.map((id) => wartendeAnfragen.get(id)!)) : undefined }
}

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
        meldung: 'Start …',
        start: jetzt,
        sperrt: start.sperrt ?? true,
        schluessel: start.schluessel,
        kannErneut: false
      }
    ]
  }))

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
  let restBis: number | undefined
  const restzeit = (): Pick<Auftrag, 'restBis' | 'restLage'> => {
    const nun = Date.now()
    const { sekunden, laenger } = schaetzeRest({
      art: start.art,
      umfang: buch.umfang,
      elapsedMs: nun - jetzt,
      ratio: gezeigt,
      erledigt: buch.erledigt,
      laufend: [...buch.laufend].map(([anfrageId, l]) => ({ art: l.art, ki: l.ki, elapsedMs: nun - l.start, ...tracker.stand(anfrageId) })),
      ki: (art) => kiFuer(art)
    })
    if (laenger) {
      restBis = undefined
      return { restBis: undefined, restLage: 'laenger' }
    }
    if (sekunden === null) {
      restBis = undefined
      return { restBis: undefined, restLage: undefined }
    }
    restBis = glaetteZiel(restBis, nun + sekunden * 1000)
    return { restBis, restLage: undefined }
  }

  const aktualisiere = (meldung?: string): void => {
    const chunk = tracker.ratio()
    const roh = stufe.abschnitt ? phaseRatio(stufe.abschnitt, stufe.fertig, stufe.gesamt, chunk) : overallRatio(stufe.fertig, stufe.gesamt, chunk)
    gezeigt = neverBackwards(gezeigt, roh)
    const rest = restzeit()
    aendere(id, (a) => (laeuft(a) ? { ...a, anteil: gezeigt, meldung: meldung ?? a.meldung, ...lage(lz, a), ...rest } : a))
  }
  // Ohne Zeichenstrom (Bilder, Abo-Zugang) käme sonst minutenlang keine neue Schätzung
  const takt = setInterval(() => {
    if (!lz.beendet && !signal.aborted) aktualisiere()
  }, 5000)

  const anfrage = async <T>(art: string, senden: (anfrageId: string) => Promise<T>, req?: StructuredRequest): Promise<T> => {
    if (signal.aborted) throw new AbbruchFehler()
    const anfrageId = tracker.begin(art)
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
      if (ok && lauf) {
        buch.erledigt[art] = (buch.erledigt[art] ?? 0) + 1
        merkeAnfrage(art, lauf.ki, { ms: Date.now() - lauf.start, chars: tracker.stand(anfrageId).chars })
      }
      tracker.end(anfrageId, ok)
      lz.anfragen.delete(anfrageId)
      wartendeAnfragen.delete(anfrageId)
      if (!signal.aborted) aktualisiere()
    }
  }

  const k: AuftragsKontext = {
    signal,
    ai: <T>(req: StructuredRequest) => anfrage(req.schemaName, (progressId) => window.api.ai.structured<T>({ ...req, progressId }), req),
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
      await start.ablegen(ergebnis, eingabe)
      const ende = Date.now()
      // Aus diesem Lauf lernen: Dauer, Umfang und Mischung der Anfragen dieser Auftragsart
      merkeAuftrag(start.art, { ms: ende - jetzt, umfang: buch.umfang, ki: kiFuer('text'), mix: { ...buch.erledigt } })
      aendere(id, (a) => ({
        ...a,
        status: 'fertig',
        anteil: 1,
        ende,
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
      clearInterval(takt)
      tracker.dispose()
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
