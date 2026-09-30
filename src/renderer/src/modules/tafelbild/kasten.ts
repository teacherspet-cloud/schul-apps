/**
 * Maße eines Text-Elements (Kasten, Text, Merksatz) – dieselbe Rechnung für Layout, Zeichnung und
 * Prüfung, damit nie etwas anderes gezeichnet wird, als das Layout eingeplant hat.
 */
import { ZEILENHOEHE, type Schriftart } from './formate'
import type { TbElement } from './model'
import { umbrechen } from './textsatz'

export interface KastenInhalt {
  titel?: string
  text: string
  /** Symbol oder Bild oben links im Kasten */
  mitIcon?: boolean
  typ: TbElement['typ']
}

export interface KastenSatz {
  pad: number
  titelGroesse: number
  titelZeilen: string[]
  textZeilen: string[]
  icon: number
  /** Nötige Höhe in Einheiten */
  hoehe: number
}

/** Innenabstand und Titelgröße aus dem Schriftgrad */
export const innenabstand = (typ: TbElement['typ'], g: number): number => (typ === 'text' ? g * 0.15 : g * 0.45)
export const titelFaktor = (typ: TbElement['typ']): number => (typ === 'text' ? 1 : 1.12)

/** Setzt Überschrift und Text eines Kastens in die Breite `w` bei Schriftgrad `g` (Einheiten) */
export function kastenSatz(k: KastenInhalt, w: number, g: number, schrift: Schriftart): KastenSatz {
  const pad = innenabstand(k.typ, g)
  const gt = g * titelFaktor(k.typ)
  const icon = k.mitIcon ? g * 1.9 : 0
  const innen = Math.max(g, w - 2 * pad)
  const titelZeilen = k.titel?.trim() ? umbrechen(k.titel.trim(), innen - (icon ? icon + pad * 0.6 : 0), gt, schrift) : []
  const textZeilen = k.text.trim() ? umbrechen(k.text.trim(), innen, g, schrift) : []
  const kopf = Math.max(titelZeilen.length * gt * ZEILENHOEHE, icon)
  const luft = titelZeilen.length && textZeilen.length ? g * 0.25 : 0
  const hoehe = 2 * pad + kopf + luft + textZeilen.length * g * ZEILENHOEHE
  return { pad, titelGroesse: gt, titelZeilen, textZeilen, icon, hoehe }
}

export const kastenInhalt = (e: TbElement): KastenInhalt => ({
  titel: e.titel,
  text: e.text,
  mitIcon: Boolean(e.typ === 'kasten' && (e.symbol || e.bild)),
  typ: e.typ
})
