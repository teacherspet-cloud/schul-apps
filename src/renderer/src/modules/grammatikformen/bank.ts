/**
 * Aufgabenbank der Grammatik in der Oberfläche (13.10.2026, abgestimmt; Server: server/grammatikBank.ts).
 *
 *  - Zahlen je Schlüssel und Übungsart für das Pop-up in „Grammatikformen", Lesen und Speichern einzelner Einträge.
 *  - KI-Entwürfe: Der KI-Knopf läuft als Hintergrund-Auftrag; das Ergebnis liegt als Entwurf je Schlüssel bereit
 *    (dieses Gerät), bis die Lehrkraft es durchsieht und speichert oder verwirft – gespeichert wird nur Durchgesehenes.
 */
import { useEffect, useState } from 'react'
import { starteAuftrag, type AuftragsKontext } from '../../shared/auftraege'
import { notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import {
  AUFGABEN_JE_FELD,
  stufeVon,
  STUFEN,
  UEBUNGEN,
  type BankAufgabe,
  type BankEintrag,
  type BankRegel,
  type BankZahlen,
  type Stufe,
  type Uebung
} from '@shared/grammatikBank'
import { aufgabeVorschau } from '../lernen/kurs/AufgabenEditor'
import { erzeugeBankAufgaben, type BankAuftrag } from '../lernen/grammatikBankErzeugen'

export const bankZahlenLaden = (sprache: string): Promise<{ zahlen: BankZahlen; darf: boolean }> =>
  holen<{ zahlen: BankZahlen; darf: boolean }>(`/server/grammatik-bank?sprache=${encodeURIComponent(sprache)}`)

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
/** Entwurf ablegen – ein neuer zum selben Schlüssel kommt zu einem älteren dazu */
export function bankEntwurfAblegen(e: BankEntwurf): void {
  const alle = ladeBankEntwuerfe()
  const alt = alle.find((x) => x.schluessel === e.schluessel)
  const neu = alt ? { ...alt, aufgaben: [...alt.aufgaben, ...e.aufgaben], am: e.am } : e
  speichereBankEntwuerfe([...alle.filter((x) => x.schluessel !== e.schluessel), neu])
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
 * Felder (Schlüssel × Stufe), an denen gerade ein Auftrag schreibt (13.10.2026, Befund der Lehrkraft): „Unit gemischt"
 * steht bei jedem Grammatikpunkt der Unit – wer nacheinander mehrere Punkte ergänzen lässt, stellt dieselbe gemischte
 * Übung mehrfach in die Warteschlange. Ein späterer Schritt wartet auf den laufenden und prüft dann neu.
 */
const inArbeit = new Map<string, Promise<unknown>>()
/**
 * Grammatik-Aufträge nacheinander (13.10.2026, Befund der Lehrkraft: mehrere KI-Läufe gleichzeitig pausierten sich
 * gegenseitig „im Kreis", und jeder prüfte, bevor der andere gespeichert hatte): Ein neuer Auftrag wartet sichtbar auf
 * den vorherigen und prüft erst danach, was noch fehlt.
 */
let kette: Promise<void> = Promise.resolve()
/** So viele Aufgaben je Übungsart mehr als fehlen (die Prüfung streicht im Schnitt etwa ein Viertel) */
const PUFFER = 2

type BankAuftragEingabe = Omit<BankAuftrag, 'vorhanden'> & { vorhanden?: string[]; nurWennLeer?: boolean }

/**
 * KI-Aufgaben für mehrere Schlüssel im Hintergrund erzeugen (eine Anfrage je Schlüssel, nacheinander). Jeder fertige
 * Schlüssel liegt gleich als Entwurf bereit – bricht ein späterer ab, bleibt das Fertige. Vor jedem Schritt wird neu
 * geprüft, was noch fehlt (Bank und Entwürfe, auch aus früheren Schritten der Warteschlange) – Erledigtes entfällt.
 */
export function bankErzeugenStarten(auftraege: BankAuftragEingabe[], titel: string, docId = 'grammatikformen'): void {
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
      const vorher = kette
      let fertig = (): void => undefined
      kette = new Promise<void>((r) => (fertig = r))
      try {
        await k.pausiere('Wartet auf den vorherigen Grammatik-Auftrag', vorher)
        return await bankSchritte(liste, k)
      } finally {
        fertig()
      }
    },
    ablegen: async (n) => {
      notifySuccess(`${n} Aufgaben der KI liegen in „Grammatikformen“ zum Durchsehen bereit.`)
    },
    abschluss: (n) => `${n} Aufgaben fertig – in „Grammatikformen“ durchsehen und speichern`
  })
  notifySuccess('Die KI schreibt die Aufgaben im Hintergrund – sie erscheinen hier zum Durchsehen.')
}

/** Die Schritte eines Auftrags: je Schlüssel und Stufe neu prüfen, dann erzeugen und als Entwurf ablegen */
async function bankSchritte(liste: BankAuftragEingabe[], k: AuftragsKontext): Promise<number> {
  let n = 0
  for (const [i, a] of liste.entries()) {
    k.melde(`${i + 1} von ${liste.length}: ${a.titel} …`)
    const feld = `${a.schluessel}|${a.niveau ?? 'm'}`
    // Schreibt ein anderer Auftrag gerade an diesem Feld, erst sein Ergebnis abwarten
    for (let w = inArbeit.get(feld); w; w = inArbeit.get(feld)) {
      k.melde(`${i + 1} von ${liste.length}: ${a.titel} – wartet auf einen früheren Auftrag …`)
      await w.catch(() => undefined)
    }
    // Vorhandenes nicht wiederholen: aus der Bank lesen (die Liste der Sätze bleibt kurz)
    const bank = (await bankLesen([a.schluessel]).catch(() => []))[0]?.aufgaben ?? []
    // Neu prüfen: Was liegt inzwischen in Bank und Entwurf (auch aus früheren Schritten)?
    const entwurf = ladeBankEntwuerfe().find((e) => e.schluessel === a.schluessel)?.aufgaben ?? []
    const st = a.niveau ?? 'm'
    const zahl = (u: Uebung): number => [...bank, ...entwurf].filter((x) => x.uebung === u && stufeVon(x) === st).length
    const uebungen = a.uebungen.filter((u) => zahl(u) < AUFGABEN_JE_FELD)
    // Gemischtes bei „Alle fehlenden" (13.10.2026, Befund am VPS: „Unit 1 gemischt" mehrfach): nur, wenn in dieser
    // Stufe noch gar nichts da ist – Auffüllen geht über „Mit KI erzeugen" im eigenen Reiter
    if (!uebungen.length || (a.nurWennLeer && UEBUNGEN.some((u) => zahl(u) > 0))) {
      k.melde(`${i + 1} von ${liste.length}: ${a.titel} – schon vorhanden, übersprungen`)
      continue
    }
    // Puffer: Die Prüfung streicht Fehlerhaftes – ohne Puffer bleiben Felder unter dem Ziel und gelten als „fehlend"
    const anzahl = Math.min(12, Math.max(...uebungen.map((u) => AUFGABEN_JE_FELD - zahl(u))) + PUFFER)
    const da = a.vorhanden ?? bank.map((x) => aufgabeVorschau(x).aufgabe.slice(0, 120))
    const lauf = erzeugeBankAufgaben({ ...a, uebungen, anzahl, vorhanden: da }, k.ai, (t) => k.melde(`${i + 1} von ${liste.length}: ${t}`)).then((r) => {
      bankEntwurfAblegen({ schluessel: a.schluessel, sprache: a.sprache, regel: r.regel, aufgaben: r.aufgaben, am: Date.now() })
      return r
    })
    inArbeit.set(feld, lauf)
    try {
      n += (await lauf).aufgaben.length
    } finally {
      if (inArbeit.get(feld) === lauf) inArbeit.delete(feld)
    }
  }
  return n
}

/**
 * Ampel der Übungsaufgaben eines Grammatikpunkts (13.10.2026, Unit-Karten und Regal): vollständig, wenn jeder
 * Teilbereich in jeder Übungsart genug Aufgaben hat; teilweise, wenn es überhaupt welche gibt; sonst keine.
 */
export function aufgabenAmpel(teile: readonly string[], zahlen: BankZahlen, stufen: readonly Stufe[] = ['m']): 'voll' | 'teil' | 'keine' {
  if (!teile.length) return 'keine'
  const n = teile.reduce((m, k) => m + UEBUNGEN.reduce((x, u) => x + (zahlen[k]?.[u] ?? 0), 0), 0)
  if (!n) return 'keine'
  return teile.every((k) => !fehlendeFelder(zahlen[k], stufen).length) ? 'voll' : 'teil'
}
