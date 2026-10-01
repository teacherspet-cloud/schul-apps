import { useState } from 'react'

/**
 * Zahlenfelder, die sich leeren lassen (01.10.2026).
 *
 * Befund der Lehrkraft: „Die Bearbeitungszeit lässt sich nicht mit der Rücktaste leeren – wird
 * die letzte Ziffer gelöscht, springt das Feld auf den Standard zurück; aus 60 wird beim Tippen
 * 6045." Ursache: Die Felder melden jede Eingabe sofort weiter, und der Aufrufer macht aus dem
 * leeren Feld seinen Standard (`Number(v) || 45`) – noch während getippt wird.
 *
 * Entschieden: Beim Tippen darf das Feld leer sein. Nur fertige Zahlen werden sofort
 * übernommen; ein leeres oder halbes Feld („-", „1,") bleibt Entwurf. Verlässt man das Feld
 * leer, bekommt der Aufrufer `''` – und setzt wie bisher seinen Standard ein.
 */

/** Wert eines Zahlenfeldes, wie Mantine ihn meldet: Zahl, sonst der Text (leer oder unfertig) */
export type ZahlWert = number | string

/** Was eine Eingabe weitergibt: die fertige Zahl – oder nichts (Entwurf) */
export function zahlEingabe(v: ZahlWert): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Was beim Verlassen weitergeht: leer → `''` (der Aufrufer setzt seinen Standard), sonst nichts */
export function zahlVerlassen(entwurf: ZahlWert | null): '' | null {
  return typeof entwurf === 'string' && entwurf.trim() === '' ? '' : null
}

/** Ein Schritt im Feld: Tippen (`eingabe`) oder Verlassen */
export type ZahlEreignis = { art: 'eingabe'; wert: ZahlWert } | { art: 'verlassen' }

/**
 * Zustand nach einem Schritt: `entwurf` ist, was das Feld zeigt (`null` = den Wert von außen),
 * `melden` das, was an den Aufrufer geht (`null` = nichts).
 */
export function zahlSchritt(entwurf: ZahlWert | null, e: ZahlEreignis): { entwurf: ZahlWert | null; melden: number | '' | null } {
  if (e.art === 'eingabe') return { entwurf: e.wert, melden: zahlEingabe(e.wert) }
  return { entwurf: null, melden: zahlVerlassen(entwurf) }
}

/**
 * Entwurf eines Zahlenfeldes: `value`/`onChange`/`onBlur` für das Feld. Solange getippt wird,
 * zeigt es den Entwurf; danach wieder den Wert von außen (der dort vielleicht begrenzt wurde).
 */
export function useZahlEntwurf(
  value: ZahlWert | undefined,
  onChange: ((v: ZahlWert) => void) | undefined
): { value: ZahlWert; onChange: (v: ZahlWert) => void; onBlur: () => void } {
  const [entwurf, setEntwurf] = useState<ZahlWert | null>(null)
  const schritt = (e: ZahlEreignis): void => {
    const neu = zahlSchritt(entwurf, e)
    setEntwurf(neu.entwurf)
    if (neu.melden !== null) onChange?.(neu.melden)
  }
  return {
    value: entwurf ?? value ?? '',
    onChange: (wert) => schritt({ art: 'eingabe', wert }),
    onBlur: () => schritt({ art: 'verlassen' })
  }
}
