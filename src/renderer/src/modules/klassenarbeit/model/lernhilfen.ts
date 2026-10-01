/**
 * Hilfen für Lernende in Klassenarbeiten (01.10.2026).
 *
 * Befund der Lehrkraft: „Bei Aufgabenstellungen in Klassenarbeiten werden für die Schüler
 * Hilfestellungen zusätzlich zur Aufgabe gegeben." Gemeint waren der Kasten „Adressat · Textsorte ·
 * Zweck" und die Unterteilung „Outline why … Explain why … Present how … Evaluate what …" einer
 * Sprachmittlungsaufgabe. In den amtlichen Aufgabenformaten (NI, NRW, IQB) steht beides nicht auf
 * dem Prüfungsblatt: Die Aufgabe nennt Situation, Adressat und Auftrag im Fließtext; was eine gute
 * Lösung inhaltlich abdeckt, steht im Erwartungshorizont.
 *
 * Rahmenzeile und Inhaltspunkte (`brief`) blendet die Darstellung selbst aus (`lernhilfen: false`,
 * render/baustein/brief.tsx) und zeigt sie im Erwartungshorizont. Hier geht es um das, was die
 * Darstellung nicht erkennen kann: Teilpunkte, die als Teilaufgaben ohne eigene Antwort oder als
 * Aufzählung in der Arbeitsanweisung stehen. Sie wandern in `brief.points` – damit sind sie im
 * Erwartungshorizont und nicht mehr auf dem Schülerblatt.
 */
import { plainText } from '../../../shared/richtext/parse'
import type { TaskBlock, TaskBrief, WsBlock } from '../../arbeitsblatt/model/types'
import { alleFassungen } from './fassungen'
import type { Exam } from './types'

/** Schreib- oder Sprachmittlungsaufgabe? */
const istSchreibaufgabe = (b: TaskBlock): boolean => b.skill === 'writing' || b.skill === 'mediation' || Boolean(b.brief)

/** Zeilen der Arbeitsanweisung, die eine Aufzählung von Teilpunkten sind („- Outline why …") */
const AUFZAEHLUNG = /^\s*(?:[-–•*]|\d+[.)]|[a-z][.)])\s+(.+)$/

const leererBrief = (): TaskBrief => ({ situation: '', audience: '', textType: '', purpose: '', words: 0, points: [], criteria: [] })

export interface Hilfenbefund {
  blockId: string
  /** was gefunden wurde – für den Hinweis */
  art: 'teilaufgaben' | 'aufzaehlung'
  anzahl: number
}

/** Was an einer Aufgabe verschoben würde (leer = nichts) */
export function hilfenBefund(b: WsBlock): Hilfenbefund | null {
  if (b.type !== 'task' || !istSchreibaufgabe(b)) return null
  // Teilaufgaben ohne eigene Antwort sind Inhaltspunkte, keine Aufgaben
  if (b.parts.length >= 2 && b.parts.every((p) => p.answer.kind === 'none' || (p.answer.kind === 'lines' && !p.answer.count)))
    return { blockId: b.id, art: 'teilaufgaben', anzahl: b.parts.length }
  const zeilen = b.instruction.split('\n')
  const liste = zeilen.slice(1).filter((z) => AUFZAEHLUNG.test(z) && plainText(z).trim())
  if (liste.length >= 2) return { blockId: b.id, art: 'aufzaehlung', anzahl: liste.length }
  return null
}

/** Teilpunkte einer Aufgabe in den Erwartungshorizont (`brief.points`) verschieben. Gibt die Aufgabe zurück (unverändert, wenn nichts zu tun ist). */
export function hilfenVerschieben(b: TaskBlock): TaskBlock {
  const befund = hilfenBefund(b)
  if (!befund) return b
  const brief = structuredClone(b.brief ?? leererBrief())
  if (befund.art === 'teilaufgaben') {
    const punkte = b.parts.map((p) => p.instruction.trim()).filter((t) => plainText(t).trim())
    brief.points = [...brief.points, ...punkte.filter((p) => !brief.points.includes(p))]
    const loesungen = b.parts.map((p) => p.solution?.trim()).filter(Boolean)
    return {
      ...b,
      parts: [],
      brief,
      // Die Antwortform der Aufgabe: ein zusammenhängender Text
      answer: b.answer.kind === 'none' ? { ...b.answer, kind: 'lines' as const, count: Math.max(8, b.parts.length * 3) } : b.answer,
      solution: [b.solution, ...loesungen].filter(Boolean).join('\n')
    }
  }
  const zeilen = b.instruction.split('\n')
  const bleibt: string[] = [zeilen[0]]
  const punkte: string[] = []
  for (const z of zeilen.slice(1)) {
    const m = AUFZAEHLUNG.exec(z)
    if (m && plainText(z).trim()) punkte.push(m[1].trim())
    else bleibt.push(z)
  }
  brief.points = [...brief.points, ...punkte.filter((p) => !brief.points.includes(p))]
  return { ...b, instruction: bleibt.join('\n').trim(), brief }
}

/** Alle Aufgaben einer Bausteinliste (z. B. einer Fassung) */
export const hilfenInsLehrermaterial = (blocks: WsBlock[]): WsBlock[] => blocks.map((b) => (b.type === 'task' ? hilfenVerschieben(b) : b))

/** Befunde der ganzen Arbeit – nur, solange die Hilfen für Lernende aus sind */
export function hilfenBefunde(exam: Exam): Hilfenbefund[] {
  if (exam.meta.lernhilfen) return []
  return exam.parts.flatMap((p) => alleFassungen(p).flatMap((liste) => liste.map(hilfenBefund).filter((x): x is Hilfenbefund => Boolean(x))))
}
