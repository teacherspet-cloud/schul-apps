/**
 * Aufgabenbank der Grammatik in der Oberfläche (13.10.2026, abgestimmt; Server: server/grammatikBank.ts).
 *
 *  - Zahlen je Schlüssel und Übungsart für das Seitenfenster in „Grammatikformen", Lesen und Speichern einzelner Einträge.
 *  - KI-Entwürfe: Der KI-Knopf läuft als Hintergrund-Auftrag; das Ergebnis liegt als Entwurf je Schlüssel bereit
 *    (dieses Gerät), bis die Lehrkraft es durchsieht und speichert oder verwirft – gespeichert wird nur Durchgesehenes.
 */
import { useEffect, useState } from 'react'
import { starteAuftrag } from '../../shared/auftraege'
import { notifySuccess } from '../../shared/util'
import { holen, senden } from '../onlinetest/serverApi'
import { AUFGABEN_JE_FELD, UEBUNGEN, type BankAufgabe, type BankEintrag, type BankRegel, type BankZahlen, type Uebung } from '@shared/grammatikBank'
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

/** Nach dem Speichern: offene Seitenfenster und Kurse laden neu */
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

/** Übungsarten, in denen noch weniger als AUFGABEN_JE_FELD Aufgaben (samt Entwurf) liegen */
export function fehlendeUebungen(zahl: Partial<Record<Uebung, number>> | undefined, entwurf?: BankEntwurf): Uebung[] {
  return UEBUNGEN.filter((u) => (zahl?.[u] ?? 0) + (entwurf?.aufgaben.filter((a) => a.uebung === u).length ?? 0) < AUFGABEN_JE_FELD)
}

/**
 * KI-Aufgaben für mehrere Schlüssel im Hintergrund erzeugen (eine Anfrage je Schlüssel, nacheinander). Jeder fertige
 * Schlüssel liegt gleich als Entwurf bereit – bricht ein späterer ab, bleibt das Fertige.
 */
export function bankErzeugenStarten(auftraege: (Omit<BankAuftrag, 'vorhanden'> & { vorhanden?: string[] })[], titel: string): void {
  if (!auftraege.length) return
  void starteAuftrag({
    moduleId: 'grammatikformen',
    docId: 'grammatikformen',
    titel,
    art: 'Grammatikaufgaben',
    eingabe: auftraege,
    sperrt: false,
    fehlerTitel: 'Aufgaben konnten nicht erzeugt werden',
    arbeit: async (liste, k) => {
      let n = 0
      for (const [i, a] of liste.entries()) {
        k.melde(`${i + 1} von ${liste.length}: ${a.titel} …`)
        // Vorhandenes nicht wiederholen: aus der Bank lesen (die Liste der Sätze bleibt kurz)
        const da = a.vorhanden ?? (await bankLesen([a.schluessel]).catch(() => []))[0]?.aufgaben.map((x) => aufgabeVorschau(x).aufgabe.slice(0, 120)) ?? []
        const r = await erzeugeBankAufgaben({ ...a, vorhanden: da }, k.ai, (t) => k.melde(`${i + 1} von ${liste.length}: ${t}`))
        bankEntwurfAblegen({ schluessel: a.schluessel, sprache: a.sprache, regel: r.regel, aufgaben: r.aufgaben, am: Date.now() })
        n += r.aufgaben.length
      }
      return n
    },
    ablegen: async (n) => {
      notifySuccess(`${n} Aufgaben der KI liegen in „Grammatikformen“ zum Durchsehen bereit.`)
    },
    abschluss: (n) => `${n} Aufgaben fertig – in „Grammatikformen“ durchsehen und speichern`
  })
  notifySuccess('Die KI schreibt die Aufgaben im Hintergrund – sie erscheinen hier zum Durchsehen.')
}
