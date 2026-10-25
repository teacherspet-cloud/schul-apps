/**
 * Aufgabenbank der Grammatik in der Oberfläche (13.10.2026, abgestimmt; Server: server/grammatikBank.ts).
 *
 *  - Zahlen je Schlüssel und Übungsart für das Pop-up in „Grammatikformen", Lesen und Speichern einzelner Einträge.
 *  - KI-Entwürfe: Der KI-Knopf läuft als Hintergrund-Auftrag; das Ergebnis liegt als Entwurf je Schlüssel bereit
 *    (dieses Gerät), bis die Lehrkraft es durchsieht und speichert oder verwirft – gespeichert wird nur Durchgesehenes.
 */
import { ansicht, appFreigegeben, aufServer } from '../../shared/plattform'
import { useEffect, useState } from 'react'
import { starteAuftrag, type AuftragsKontext } from '../../shared/auftraege'
import { notifyError, notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import {
  AUFGABEN_JE_FELD,
  stufeVon,
  STUFEN,
  STUFE_NAME,
  MIN_JE_UEBUNG,
  istKern,
  UEBUNG_NAME,
  aufgabeKern,
  ohneDoppelte,
  UEBUNGEN,
  type BankAufgabe,
  type BankEintrag,
  type BankRegel,
  type BankZahlen,
  type Stufe,
  type Uebung
} from '@shared/grammatikBank'
import { aufgabeVorschau } from '../lernen/kurs/AufgabenEditor'
import { ergaenzeAlternativen, erzeugeBankAufgaben, type BankAuftrag, type BankBericht } from '../lernen/grammatikBankErzeugen'

/**
 * Übungsaufgaben und Schüleransicht gehören zu den Kursen im Sprachenlernen (App-Freigaben, 23.10.2026): ohne diese
 * App bleibt Grammatikformen ein Nachschlagewerk der Lehrwerke – ohne Aufgabenbank und Schülersicht.
 */
export const kurseFreigegeben = (): boolean => aufServer() && appFreigegeben('sprachenlernen')

export const bankZahlenLaden = (sprache: string): Promise<{ zahlen: BankZahlen; darf: boolean }> =>
  holen<{ zahlen: BankZahlen; darf: boolean }>(`/server/grammatik-bank?sprache=${encodeURIComponent(sprache)}`).then((r) => ({
    ...r,
    // „Ansicht zeigen": Rechte wie eine Lehrkraft, auch wenn der Server das Fenster als Admin kennt
    darf: r.darf && !ansicht()
  }))

export const bankLesen = async (schluessel: string[]): Promise<BankEintrag[]> =>
  (await senden<{ eintraege: BankEintrag[] }>('/server/grammatik-bank/lesen', { schluessel })).eintraege

export const bankSpeichern = (
  sprache: string,
  schluessel: string,
  regel: BankRegel,
  aufgaben: BankAufgabe[]
): Promise<{ aufgaben: number; kurse: number; zahlen: BankZahlen }> => senden('/server/grammatik-bank/speichern', { sprache, schluessel, regel, aufgaben })

/** Nach dem Speichern: offene Pop-ups und Kurse laden neu */
export const BANK_EREIGNIS = 'grammatik-bank-geaendert'

// ---------------------------------------------------------------- Entwürfe der KI (je Schlüssel)

export interface BankEntwurf {
  schluessel: string
  sprache: string
  regel: BankRegel
  aufgaben: BankAufgabe[]
  am: number
}
const ENTWUERFE = 'grammatik-bank-entwuerfe'
const EREIGNIS = 'grammatik-bank-entwuerfe'

export function ladeBankEntwuerfe(): BankEntwurf[] {
  try {
    return JSON.parse(localStorage.getItem(ENTWUERFE) ?? '[]') as BankEntwurf[]
  } catch {
    return []
  }
}
export function speichereBankEntwuerfe(l: BankEntwurf[]): void {
  try {
    localStorage.setItem(ENTWUERFE, JSON.stringify(l))
  } catch {
    // ohne Speicher bleibt der Entwurf nur bis zum Neuladen
  }
  window.dispatchEvent(new Event(EREIGNIS))
}
/** Entwurf ablegen – ein neuer zum selben Schlüssel kommt zu einem älteren dazu (ohne Dopplungen, 13.10.2026) */
export function bankEntwurfAblegen(e: BankEntwurf): void {
  const alle = ladeBankEntwuerfe()
  const alt = alle.find((x) => x.schluessel === e.schluessel)
  const neu = alt ? { ...alt, aufgaben: ohneDoppelte([...alt.aufgaben, ...e.aufgaben]), am: e.am } : { ...e, aufgaben: ohneDoppelte(e.aufgaben) }
  speichereBankEntwuerfe([...alle.filter((x) => x.schluessel !== e.schluessel), neu])
}
/**
 * Entwürfe bereinigen (13.10.2026, Wunsch der Lehrkraft: „Dopplungen zu den noch zur Durchsicht verfügbaren Aufgaben
 * entfernen"): Aufgaben, die es in der Bank schon gibt oder die im Entwurf doppelt stehen, fallen weg; leere Entwürfe
 * ganz. Liefert die Zahl entfernter Aufgaben. Läuft beim Öffnen von „Grammatikformen".
 */
export async function entwuerfeBereinigen(): Promise<number> {
  // Entwürfe aus der Zeit vor dem Leeren der Bank (13.10.2026, Wunsch der Lehrkraft) verwerfen
  const geleert = await holen<{ geleert?: number }>('/server/grammatik-bank?sprache=en').then(
    (d) => d.geleert ?? 0,
    () => 0
  )
  const vorher = ladeBankEntwuerfe()
  const alle = vorher.filter((e) => !geleert || e.am > geleert)
  if (alle.length !== vorher.length) speichereBankEntwuerfe(alle)
  const verworfen = vorher.length - alle.length ? vorher.filter((e) => !alle.includes(e)).reduce((n, e) => n + e.aufgaben.length, 0) : 0
  if (!alle.length) return verworfen
  const bank = new Map((await bankLesen(alle.map((e) => e.schluessel))).map((e) => [e.schluessel, e.aufgaben]))
  let weg = 0
  const neu = alle
    .map((e) => {
      const schon = new Set((bank.get(e.schluessel) ?? []).map(aufgabeKern).filter(Boolean))
      const aufgaben = ohneDoppelte(e.aufgaben, schon)
      weg += e.aufgaben.length - aufgaben.length
      return { ...e, aufgaben }
    })
    .filter((e) => e.aufgaben.length)
  if (weg || neu.length !== alle.length) speichereBankEntwuerfe(neu)
  return weg + verworfen
}

export const bankEntwurfWeg = (schluessel: string): void => speichereBankEntwuerfe(ladeBankEntwuerfe().filter((x) => x.schluessel !== schluessel))

export function useBankEntwuerfe(): BankEntwurf[] {
  const [l, setL] = useState(ladeBankEntwuerfe)
  useEffect(() => {
    const neu = (): void => setL(ladeBankEntwuerfe())
    window.addEventListener(EREIGNIS, neu)
    window.addEventListener('storage', neu)
    return () => {
      window.removeEventListener(EREIGNIS, neu)
      window.removeEventListener('storage', neu)
    }
  }, [])
  return l
}

/**
 * Stufen, die die Aufgabenbank füllt (Ampel und KI-Knopf). Seit 13.10.2026 (Entscheidung der Lehrkraft) überall alle drei:
 * auch am Gymnasium grundlegend – Lernende bekommen dort standardmäßig mittel/anspruchsvoll (Kurs-Stufen am Server,
 * `stufenFuerSchulform`), die grundlegenden dienen als Förderreserve bei Schwierigkeiten (shared/grammatikVorrang.ts).
 */
export function useSchulStufen(): Stufe[] {
  return STUFEN
}

/** Aufgaben eines Felds (Übungsart × Stufe) in der Bank; ältere Zahlen ohne Stufen gelten als mittel */
export const feldZahl = (zahl: BankZahlen[string] | undefined, u: Uebung, st: Stufe): number =>
  zahl?.stufen ? zahl.stufen[u]?.[st] ?? 0 : st === 'm' ? zahl?.[u] ?? 0 : 0

/** Je Stufe die Übungsarten, in denen noch weniger als AUFGABEN_JE_FELD Aufgaben (samt Entwurf) liegen */
export function fehlendeFelder(zahl: BankZahlen[string] | undefined, stufen: readonly Stufe[], entwurf?: BankEntwurf): { stufe: Stufe; uebungen: Uebung[] }[] {
  return stufen
    .map((st) => ({
      stufe: st,
      uebungen: UEBUNGEN.filter(
        (u) => feldZahl(zahl, u, st) + (entwurf?.aufgaben.filter((a) => a.uebung === u && stufeVon(a) === st).length ?? 0) < AUFGABEN_JE_FELD
      )
    }))
    .filter((f) => f.uebungen.length)
}

/** Übungsarten, in denen in irgendeiner der Stufen noch Aufgaben fehlen */
export function fehlendeUebungen(zahl: BankZahlen[string] | undefined, entwurf?: BankEntwurf, stufen: readonly Stufe[] = ['m']): Uebung[] {
  const f = fehlendeFelder(zahl, stufen, entwurf)
  return UEBUNGEN.filter((u) => f.some((x) => x.uebungen.includes(u)))
}

/**
 * Schlüssel, an denen gerade ein Durchgang liest, erzeugt und speichert (13.10.2026, Befund der Lehrkraft: „Unit gemischt"
 * steht bei jedem Grammatikpunkt der Unit). Seit 21.10.2026 je Schlüssel statt je Stufe: Das direkte Speichern ersetzt
 * den ganzen Schlüssel – zwei Stufen desselben Schlüssels gleichzeitig hätten sich das Gespeicherte überschrieben.
 */
const inArbeit = new Map<string, Promise<void>>()

/** Schlüssel sperren: wartet sichtbar auf einen laufenden Durchgang; Prüfen und Setzen ohne Pause dazwischen */
async function schluesselSperren(schluessel: string, k: AuftragsKontext, warte: () => void): Promise<() => void> {
  for (let w = inArbeit.get(schluessel); w; w = inArbeit.get(schluessel)) {
    warte()
    // Als Warten melden: zählt nicht als Arbeitszeit der Restzeit (19.10.2026)
    await k.pausiere('Wartet auf einen anderen Auftrag zu diesem Bereich', w)
  }
  let frei = (): void => undefined
  inArbeit.set(schluessel, new Promise<void>((r) => (frei = r)))
  return () => {
    inArbeit.delete(schluessel)
    frei()
  }
}

/**
 * Höchstens so viele Grammatik-Aufträge gleichzeitig (21.10.2026, Wunsch der Lehrkraft: „Ergänzen"-Aufträge nicht nur
 * nacheinander). Bis dahin lief immer nur einer (13.10.2026: gleichzeitige Läufe prüften, bevor der andere gespeichert
 * hatte – das verhindert jetzt die Sperre je Schlüssel). Drei wie die KI-Plätze (main/services/ai/kiPlaetze.ts), die
 * die Anfragen reihum auf die Aufträge verteilen.
 */
export const GLEICHZEITIG = 3
let laufend = 0
const wartend: (() => void)[] = []
async function platzNehmen(k: AuftragsKontext): Promise<() => void> {
  if (laufend >= GLEICHZEITIG) await k.pausiere('Wartet, bis ein anderer Grammatik-Auftrag fertig ist', new Promise<void>((r) => wartend.push(r)))
  else laufend++
  return () => {
    const naechster = wartend.shift()
    // Der Platz geht direkt an den Nächsten über
    if (naechster) naechster()
    else laufend--
  }
}
/** So viele Aufgaben je Übungsart mehr als fehlen (die Prüfung streicht im Schnitt etwa ein Viertel) */
const PUFFER = 2
/**
 * Höchstens so viele Durchgänge je Stufe (13.10.2026, Befund am VPS: nach „Ergänzen" blieben Felder bei 6–7, ganze Stufen
 * leer). Je Durchgang höchstens ARTEN_JE_ANFRAGE Übungsarten – alle fünf in einer Anfrage (bis zu 60 Aufgaben) lieferte
 * die KI nur zum Teil; ein Durchgang ohne Ertrag beendet die Stufe erst beim zweiten Mal in Folge.
 */
const RUNDEN = 6
const ARTEN_JE_ANFRAGE = 3

type BankAuftragEingabe = Omit<BankAuftrag, 'vorhanden'> & {
  vorhanden?: string[]
  nurWennLeer?: boolean
  /** Ohne Durchsicht gleich in die Bank (13.10.2026, Knopf „Ergänzen" je Zeile) – sonst als Entwurf */
  direkt?: boolean
}

/**
 * KI-Aufgaben für mehrere Schlüssel im Hintergrund erzeugen (eine Anfrage je Schlüssel, nacheinander). Jeder fertige
 * Schlüssel liegt gleich als Entwurf bereit – bricht ein späterer ab, bleibt das Fertige. Vor jedem Schritt wird neu
 * geprüft, was noch fehlt (Bank und Entwürfe, auch aus früheren Schritten der Warteschlange) – Erledigtes entfällt.
 */
export function bankErzeugenStarten(auftraege: BankAuftragEingabe[], titel: string, docId = 'grammatikformen'): void {
  const direkt = auftraege.every((a) => a.direkt)
  if (!auftraege.length) return
  void starteAuftrag({
    moduleId: 'grammatikformen',
    // „Öffnen" führt zum Grammatikpunkt (grammatikformen.ts `zielDocId`, 13.10.2026)
    docId,
    titel,
    art: 'Grammatikaufgaben',
    eingabe: auftraege,
    sperrt: false,
    fehlerTitel: 'Aufgaben konnten nicht erzeugt werden',
    arbeit: async (liste, k) => {
      const frei = await platzNehmen(k)
      try {
        return await bankSchritte(liste, k)
      } finally {
        frei()
      }
    },
    ablegen: async (n) => {
      // Ohne Ertrag meldet bankSchritte den Grund (21.10.2026) – kein „0 Aufgaben ergänzt" als Erfolg
      if (n) notifySuccess(direkt ? `${n} Aufgaben ergänzt und gespeichert.` : `${n} Aufgaben der KI liegen in „Grammatikformen“ zum Durchsehen bereit.`)
    },
    abschluss: (n) =>
      !n
        ? 'Keine neuen Aufgaben – der Grund steht im Hinweis'
        : direkt
        ? `${n} Aufgaben ergänzt und gespeichert`
        : `${n} Aufgaben fertig – in „Grammatikformen“ durchsehen und speichern`
  })
  notifySuccess(
    direkt
      ? 'Die KI ergänzt die fehlenden Aufgaben im Hintergrund und speichert sie gleich.'
      : 'Die KI schreibt die Aufgaben im Hintergrund – sie erscheinen hier zum Durchsehen.'
  )
}

/**
 * Geplante KI-Anfragen eines Schritts (19.10.2026, Befund der Lehrkraft: die Restzeit in der Warteschlange war „völlig
 * unaussagefähig"): je ARTEN_JE_ANFRAGE fehlende Übungsarten eine Anfrage. Vorher meldete der Auftrag keine Schrittzahl –
 * die Restzeit rechnete nur die gerade laufende Anfrage hoch und begann bei jeder neuen von vorn.
 */
export const geplanteAnfragen = (a: Pick<BankAuftragEingabe, 'uebungen'>): number => Math.max(1, Math.ceil(a.uebungen.length / ARTEN_JE_ANFRAGE))

/**
 * Fortschritt in Anfragen: erledigte plus geschätzter Rest. Der Rest sind die geplanten Anfragen der übrigen Schritte,
 * mal dem Verhältnis „tatsächlich gebraucht / geplant" der schon fertigen Schritte dieses Auftrags (Nachlegen, wenn die
 * Prüfung viel streicht; übersprungene Schritte zählen dabei nicht mit). Rein rechnend, für Tests.
 */
export function bankFortschritt(p: { plan: number[]; i: number; imSchritt: number; anfragen: number; planFertig: number; istFertig: number }): {
  fertig: number
  gesamt: number
} {
  const faktor = p.planFertig ? Math.min(3, Math.max(0.5, p.istFertig / p.planFertig)) : 1
  const hier = Math.max(p.plan[p.i] * faktor - p.imSchritt, p.imSchritt < RUNDEN ? 0.5 : 0)
  const danach = p.plan.slice(p.i + 1).reduce((s, x) => s + x, 0) * faktor
  return { fertig: p.anfragen, gesamt: Math.max(p.anfragen + 1, Math.round(p.anfragen + hier + danach)) }
}

/** Zusammenfassung aller Durchgänge eines Auftrags: was die KI schrieb und warum davon etwas wegfiel */
export interface BankSumme extends BankBericht {
  /** Gab es schon (Bank oder Entwurf) bzw. verwarf der Server beim Speichern */
  doppelt: number
}
export const leereBankSumme = (): BankSumme => ({ geprueft: 0, gestrichen: 0, zuLeicht: 0, gruende: [], zeitform: 0, doppelt: 0 })

/**
 * Warum nichts dazukam (21.10.2026, Befund der Lehrkraft: „Ergänzen" meldete 0 neue Aufgaben ohne Grund). Rein
 * rechnend, für Tests; leer, wenn die KI gar nichts geschrieben hat.
 */
export function bankBerichtText(s: BankSumme): string {
  if (!s.geprueft) return ''
  const teile = [
    s.gestrichen ? `${s.gestrichen} strich die Prüfung${s.zuLeicht ? ` (davon ${s.zuLeicht} als zu leicht für das Niveau)` : ''}` : '',
    s.zeitform ? `${s.zeitform} brauchten eine Zeitform, die die Lerngruppe laut Lehrwerk noch nicht kennt` : '',
    s.doppelt ? `${s.doppelt} gab es schon` : ''
  ].filter(Boolean)
  const gruende = s.gruende.slice(0, 3).map((g) => `„${g}“`)
  return `Die KI schrieb ${s.geprueft} Aufgaben, keine kam dazu${teile.length ? `: ${teile.join(', ')}` : ''}.${
    gruende.length ? ` Gründe u. a.: ${gruende.join('; ')}.` : ''
  }`
}

/** Die Schritte eines Auftrags: je Schlüssel und Stufe neu prüfen, dann erzeugen und als Entwurf ablegen */
async function bankSchritte(liste: BankAuftragEingabe[], k: AuftragsKontext): Promise<number> {
  let n = 0
  // Restzeit (19.10.2026): Fortschritt in KI-Anfragen statt ohne Schrittzahl
  const plan = liste.map(geplanteAnfragen)
  let anfragen = 0
  let planFertig = 0
  let istFertig = 0
  let schritt = 0
  let imSchritt = 0
  const melde = (text: string): void => {
    const f = bankFortschritt({ plan, i: schritt, imSchritt, anfragen, planFertig, istFertig })
    k.melde(text, f.fertig, f.gesamt)
  }
  // Bricht die KI in einem Schritt ab, laufen die übrigen Schritte trotzdem (vorher endete der ganze Auftrag)
  let fehler: unknown = null
  let fehlerZahl = 0
  const summe = leereBankSumme()
  for (const [i, a] of liste.entries()) {
    schritt = i
    imSchritt = 0
    melde(`${i + 1} von ${liste.length}: ${a.titel} …`)
    // Bis zu RUNDEN Durchgänge (13.10.2026, Wunsch der Lehrkraft): Streicht die Prüfung zu viel, legt die KI gezielt nach
    let ohneErtrag = 0
    // Streicht die Prüfung einen ganzen Durchgang als „zu leicht", legt die KI ohne diese Prüfung nach (21.10.2026)
    let ohneLeicht = false
    for (let runde = 0; runde < RUNDEN; runde++) {
      // Schreibt ein anderer Auftrag gerade an diesem Schlüssel, erst sein Ergebnis abwarten – danach neu prüfen
      const frei = await schluesselSperren(a.schluessel, k, () =>
        melde(`${i + 1} von ${liste.length}: ${a.titel} – wartet auf einen anderen Auftrag zu diesem Bereich …`)
      )
      try {
        // Vorhandenes nicht wiederholen: aus der Bank lesen (die Liste der Sätze bleibt kurz)
        const bank = (await bankLesen([a.schluessel]).catch(() => []))[0]?.aufgaben ?? []
        // Neu prüfen: Was liegt inzwischen in Bank und Entwurf (auch aus früheren Schritten)? Beim direkten Ergänzen zählt
        // nur die Bank – ein ungesehener Entwurf füllt kein Feld
        const entwurf = a.direkt ? [] : ladeBankEntwuerfe().find((e) => e.schluessel === a.schluessel)?.aufgaben ?? []
        const st = a.niveau ?? 'm'
        const zahl = (u: Uebung): number => [...bank, ...entwurf].filter((x) => x.uebung === u && stufeVon(x) === st).length
        const offen = a.uebungen.filter((u) => zahl(u) < AUFGABEN_JE_FELD)
        // Die am weitesten zurückliegenden Übungsarten zuerst
        const uebungen = [...offen].sort((x, y) => zahl(x) - zahl(y)).slice(0, ARTEN_JE_ANFRAGE)
        // Gemischtes bei „Alle fehlenden" (13.10.2026, Befund am VPS: „Unit 1 gemischt" mehrfach): nur, wenn in dieser
        // Stufe noch gar nichts da ist – Auffüllen geht über „Ergänzen" bzw. „Mit KI erzeugen" im eigenen Reiter
        if (!uebungen.length || (runde === 0 && a.nurWennLeer && UEBUNGEN.some((u) => zahl(u) > 0))) {
          if (runde === 0) {
            // Übersprungen: fällt aus dem Plan, ohne das Verhältnis der übrigen zu verfälschen
            plan[i] = 0
            melde(`${i + 1} von ${liste.length}: ${a.titel} – schon vorhanden, übersprungen`)
          }
          break
        }
        if (runde > 0) melde(`${i + 1} von ${liste.length}: ${a.titel} – noch nicht vollständig, die KI legt nach (Durchgang ${runde + 1})`)
        // Puffer: Die Prüfung streicht Fehlerhaftes – ohne Puffer bleiben Felder unter dem Ziel und gelten als „fehlend"
        const anzahl = Math.min(12, Math.max(...uebungen.map((u) => AUFGABEN_JE_FELD - zahl(u))) + PUFFER)
        const da = a.vorhanden ?? [...bank, ...entwurf].map((x) => aufgabeVorschau(x).aufgabe.slice(0, 120))
        const lauf = erzeugeBankAufgaben({ ...a, uebungen, anzahl, vorhanden: da, ohneLeichtPruefung: ohneLeicht }, k.ai, (t) =>
          melde(`${i + 1} von ${liste.length}: ${t}`)
        ).then((r) => {
          if (a.direkt) return direktSpeichern(a, r)
          bankEntwurfAblegen({ schluessel: a.schluessel, sprache: a.sprache, regel: r.regel, aufgaben: r.aufgaben, am: Date.now() })
          return { ...r, doppelt: 0 }
        })
        try {
          const r = await lauf
          const neu = r.aufgaben.length
          n += neu
          summe.geprueft += r.bericht.geprueft
          summe.gestrichen += r.bericht.gestrichen
          summe.zuLeicht += r.bericht.zuLeicht
          summe.zeitform += r.bericht.zeitform
          summe.doppelt += r.doppelt
          for (const g of r.bericht.gruende) if (!summe.gruende.includes(g)) summe.gruende.push(g)
          if (!neu && !ohneLeicht && r.bericht.zuLeicht && r.bericht.zuLeicht * 2 >= r.bericht.gestrichen) {
            ohneLeicht = true
            melde(`${i + 1} von ${liste.length}: ${a.titel} – die Prüfung fand alles zu leicht, die KI legt ohne diese Prüfung nach`)
            continue
          }
          // Zweimal in Folge nichts Brauchbares: nicht endlos weiterfragen
          ohneErtrag = neu ? 0 : ohneErtrag + 1
          if (ohneErtrag >= 2) break
        } catch (e) {
          // Abbruch der KI (Zeitüberschreitung, Abo): diese Stufe beenden, mit der nächsten weitermachen
          if (k.signal.aborted) throw e
          fehler = e
          fehlerZahl++
          break
        } finally {
          anfragen++
          imSchritt++
        }
      } finally {
        frei()
      }
    }
    if (plan[i]) {
      planFertig += plan[i]
      istFertig += imSchritt
    }
  }
  if (fehler && !n) throw fehler
  // Nichts dazu, obwohl die KI geschrieben hat: sagen, woran es lag (21.10.2026)
  if (!n && summe.geprueft) notifyError(bankBerichtText(summe))
  if (fehler)
    notifyError(`Bei ${fehlerZahl} ${fehlerZahl === 1 ? 'Schritt' : 'Schritten'} brach die KI ab – das Übrige ist gespeichert. „Ergänzen" noch einmal drücken.`)
  return n
}

/**
 * Ohne Durchsicht speichern (13.10.2026, Wunsch der Lehrkraft: Knopf „Ergänzen"): zu den hinterlegten Aufgaben hinzu,
 * ohne Dopplungen; die Regelkarte bleibt, wenn es schon eine gibt.
 */
async function direktSpeichern(
  a: BankAuftragEingabe,
  r: { regel: BankRegel; aufgaben: BankAufgabe[]; bericht: BankBericht }
): Promise<{ regel: BankRegel; aufgaben: BankAufgabe[]; bericht: BankBericht; doppelt: number }> {
  const da = (await bankLesen([a.schluessel]))[0]
  const neu = ohneDoppelte(r.aufgaben, new Set((da?.aufgaben ?? []).map(aufgabeKern).filter(Boolean)))
  const gespeichert = await bankSpeichern(a.sprache, a.schluessel, da?.regel?.titel ? da.regel : r.regel, [...(da?.aufgaben ?? []), ...neu])
  window.dispatchEvent(new Event(BANK_EREIGNIS))
  // Was der Server wirklich aufgenommen hat (er sortiert Unbrauchbares aus)
  const dazu = Math.max(0, gespeichert.aufgaben - (da?.aufgaben.length ?? 0))
  return { regel: r.regel, aufgaben: neu.slice(0, dazu), bericht: r.bericht, doppelt: r.aufgaben.length - Math.min(dazu, neu.length) }
}

/** Schlüssel mit Aufgaben, bei denen Alternativlösungen nachgetragen werden können – mit Zahl der Aufgaben */
export function alternativenKandidaten(schluessel: readonly string[], zahlen: BankZahlen): { schluessel: string; aufgaben: number }[] {
  return [...new Set(schluessel)]
    .map((k) => ({ schluessel: k, aufgaben: UEBUNGEN.reduce((n, u) => n + (zahlen[k]?.[u] ?? 0), 0) }))
    .filter((x) => x.aufgaben > 0)
}

/** Geschätzte KI-Anfragen für das Nachtragen (eine je 25 Aufgaben und Schlüssel, Auswahlaufgaben zählen mit) */
export const alternativenAnfragen = (k: readonly { aufgaben: number }[]): number => k.reduce((n, x) => n + Math.max(1, Math.ceil(x.aufgaben / 25)), 0)

/**
 * Alternativlösungen nachtragen (25.10.2026, Befund der Lehrkraft: „It is said / believed / thought that …" – nur eine
 * Fassung galt): je Schlüssel die Aufgaben aus der Bank lesen, die KI nennt weitere gleichwertige Antworten, die
 * Aufgaben werden mit erweiterten `loesungen` direkt gespeichert (Kennungen bleiben, der Lernstand hängt weiter an ihnen;
 * die Kurse bauen ihre Pakete am Server neu). Nur für Admins bzw. Fachobleute – der Server prüft das beim Speichern.
 */
export function bankAlternativenStarten(
  liste: { schluessel: string; titel: string }[],
  rahmen: { sprache: string; fach: string; jahrgang: number },
  titel: string,
  docId = 'grammatikformen'
): void {
  if (!liste.length) return
  void starteAuftrag({
    moduleId: 'grammatikformen',
    docId,
    titel,
    art: 'Alternativlösungen',
    eingabe: { liste, rahmen },
    sperrt: false,
    fehlerTitel: 'Alternativlösungen konnten nicht ergänzt werden',
    arbeit: async (e, k) => {
      const frei = await platzNehmen(k)
      try {
        let betroffen = 0
        let ergaenzt = 0
        let geprueft = 0
        let fehler: unknown = null
        const n = e.liste.length
        for (const [i, s] of e.liste.entries()) {
          k.melde(`${i + 1} von ${n}: ${s.titel} …`, i, n)
          const sperre = await schluesselSperren(s.schluessel, k, () => k.melde(`${i + 1} von ${n}: ${s.titel} – wartet auf einen anderen Auftrag …`, i, n))
          try {
            const da = (await bankLesen([s.schluessel]))[0]
            if (!da?.aufgaben.length) continue
            const r = await ergaenzeAlternativen({ ...e.rahmen, titel: s.titel, regel: da.regel, aufgaben: da.aufgaben }, k.ai, (t) =>
              k.melde(`${i + 1} von ${n}: ${t}`, i, n)
            )
            geprueft += r.geprueft
            if (r.ergaenzt) {
              await bankSpeichern(e.rahmen.sprache, s.schluessel, da.regel, r.aufgaben)
              betroffen += r.betroffen
              ergaenzt += r.ergaenzt
            }
          } catch (er) {
            // Abbruch der KI bei einem Schlüssel: die übrigen laufen weiter
            if (k.signal.aborted) throw er
            fehler = er
          } finally {
            sperre()
          }
        }
        window.dispatchEvent(new Event(BANK_EREIGNIS))
        if (fehler && !ergaenzt) throw fehler
        return { betroffen, ergaenzt, geprueft }
      } finally {
        frei()
      }
    },
    ablegen: async (r) => {
      notifySuccess(
        r.ergaenzt
          ? `${r.ergaenzt} weitere Lösungen bei ${r.betroffen} von ${r.geprueft} Aufgaben ergänzt – sie gelten sofort in allen Kursen.`
          : `Keine weiteren Lösungen nötig – die KI fand bei ${r.geprueft} Aufgaben nichts Gleichwertiges.`
      )
    },
    abschluss: (r) => (r.ergaenzt ? `${r.ergaenzt} Lösungen bei ${r.betroffen} Aufgaben ergänzt` : `Keine weiteren Lösungen (${r.geprueft} Aufgaben geprüft)`)
  })
  notifySuccess('Die KI prüft im Hintergrund, welche weiteren Antworten richtig sind, und trägt sie nach.')
}

/**
 * Was fehlt noch? (13.10.2026, Tooltip in Grammatikformen): je Stufe die Übungsarten unter dem Ziel mit ihrer Zahl, dazu
 * ein Hinweis auf Entwürfe, die erst nach dem Speichern zählen.
 */
export function fehltText(zahl: BankZahlen[string] | undefined, stufen: readonly Stufe[], entwurf?: BankEntwurf): string[] {
  const zeilen = stufen.flatMap((st) => {
    const fehlt = UEBUNGEN.filter((u) => feldZahl(zahl, u, st) < AUFGABEN_JE_FELD)
    return fehlt.length ? [`${STUFE_NAME[st]}: ${fehlt.map((u) => `${UEBUNG_NAME[u]} ${feldZahl(zahl, u, st)} von ${AUFGABEN_JE_FELD}`).join(', ')}`] : []
  })
  if (entwurf?.aufgaben.length) zeilen.push(`${entwurf.aufgaben.length} Aufgaben der KI warten aufs Durchsehen – sie zählen erst nach dem Speichern.`)
  return zeilen
}

/**
 * Ampel der Übungsaufgaben eines Grammatikpunkts (13.10.2026, Unit-Karten und Regal): vollständig, wenn jeder
 * Teilbereich in jeder Übungsart genug Aufgaben hat; teilweise, wenn es überhaupt welche gibt; sonst keine.
 */
export function aufgabenAmpel(teile: readonly string[], zahlen: BankZahlen, stufen: readonly Stufe[] = ['m']): 'voll' | 'teil' | 'keine' {
  if (!teile.length) return 'keine'
  const n = teile.reduce((m, k) => m + UEBUNGEN.reduce((x, u) => x + (zahlen[k]?.[u] ?? 0), 0), 0)
  if (!n) return 'keine'
  // Grün = genug zum Üben (13.10.2026, Entscheidung der Lehrkraft) – „vollständig" zeigt die Zeile im Pop-up zusätzlich
  return teile.every((k) => bankStand(zahlen[k], stufen) !== 'wenig' && bankStand(zahlen[k], stufen) !== 'keine') ? 'voll' : 'teil'
}

/**
 * Stand eines Bereichs (13.10.2026, Entscheidung der Lehrkraft): „keine"; „wenig" – für Lernende noch zu wenig; „genug" –
 * genug zum Üben (je Stufe die Kern-Übungsarten Erkennen, Bilden, Anwenden mit mindestens MIN_JE_UEBUNG Aufgaben, wie die
 * „sicher"-Regel); „voll" – vollständig (alle Übungsarten in allen Stufen mit AUFGABEN_JE_FELD).
 */
export type BankStand = 'keine' | 'wenig' | 'genug' | 'voll'
export function bankStand(zahl: BankZahlen[string] | undefined, stufen: readonly Stufe[]): BankStand {
  const n = UEBUNGEN.reduce((m, u) => m + (zahl?.[u] ?? 0), 0)
  if (!n) return 'keine'
  if (!fehlendeFelder(zahl, stufen).length) return 'voll'
  return stufen.every((st) => UEBUNGEN.filter(istKern).every((u) => feldZahl(zahl, u, st) >= MIN_JE_UEBUNG)) ? 'genug' : 'wenig'
}
