/**
 * Qualitätsprüfung nach der Erzeugung (und nach jeder Änderung im Editor) – die Regeln der
 * Recherche als nachprüfbare Grenzen (recherche/tafelbilder-gestaltung-2026-09-30.md, „Regeln
 * für die App"):
 * - Textmenge je Format (Wörter insgesamt, R11/R16) und je Element (R11)
 * - Schriftgrad nie unter der Mindestschrift des Formats, nie unter dem harten Minimum (R6/R7)
 * - höchstens Grund + 3 Farben, jede mit Bedeutung (R19/R20); Rot/Grün nie allein (R23)
 * - keine Überlappung, nichts über den Rand (R3/R4)
 * - Kontrast jeder Farbe zum Grund (R25)
 * - genau eine Überschrift, Merksatz ≤ 25 Wörter (R17/R32), höchstens 8 Schritte, je Schritt ≤ 3 neue Elemente (R33)
 */
import {
  formatInfo,
  HARTES_MINIMUM,
  kontrast,
  MAX_FARBEN,
  MAX_FARBEN_FEHLER,
  MAX_MERKSATZ_WORTE,
  MAX_NEU_JE_SCHRITT,
  MAX_SCHRITTE,
  PALETTEN,
  worteJeElement,
  type Farbe
} from './formate'
import { kastenInhalt, kastenSatz } from './kasten'
import { schneidet } from './layout'
import { elementText, istLinie, istTextElement, worte, type Befund, type Regler, type TbElement, type TbInhalt, type TbTafel } from './model'
import { zusammenfassPaar } from './vorschlaege'

export interface PruefKontext {
  grade: number
  regler: Pick<Regler, 'textmenge' | 'stil'>
  inhalt?: TbInhalt | null
}

export function pruefeTafel(t: TbTafel, k: PruefKontext): Befund[] {
  const f = formatInfo(t.format)
  const b: Befund[] = []
  const W = f.breite
  const H = f.hoehe
  const auf = (x: Omit<Befund, 'format'>): void => void b.push({ format: t.format, ...x })
  const flaechig = t.elemente.filter((e) => !istLinie(e))
  const texte = t.elemente.filter(istTextElement)

  // Textmenge insgesamt
  const grenze = f.worte[k.regler.textmenge - 1] ?? f.worte[1]
  const summe = t.elemente.reduce((n, e) => n + worte(elementText(e)), 0)
  if (summe > grenze * 1.15)
    auf({ art: 'text', text: `${summe} Wörter – für ${f.kurz} sind höchstens etwa ${grenze} lesbar. Kürzen oder Stichpunkte statt Sätzen.`, schwer: summe > grenze * 1.4 })

  // Wörter je Element (Überschrift, Merksatz und Hausaufgabe ausgenommen)
  const jeElement = worteJeElement(k.grade, k.regler.stil === 'ausformuliert') * (t.format === 'heft' ? 2 : 1)
  for (const e of t.elemente.filter((x) => x.typ === 'kasten')) {
    const zeilenWorte = e.text.split('\n').map(worte)
    const lang = zeilenWorte.filter((n) => n > jeElement)
    if (lang.length) auf({ element: e.id, art: 'text', text: `„${e.titel || e.text.slice(0, 30)}": ein Stichpunkt hat mehr als ${jeElement} Wörter.` })
  }

  // Elementzahl
  if (texte.length > f.maxElemente) auf({ art: 'aufbau', text: `${texte.length} Textelemente – mehr als ${f.maxElemente} überfordern auf ${f.kurz} (R14).` })

  // Schrift
  const minimum = f.schrift.min
  const klein: string[] = []
  for (const e of texte) {
    const s = e.schrift ?? f.schrift.text
    if (s < Math.min(minimum, HARTES_MINIMUM) * 0.98 && t.format !== 'heft') {
      auf({ element: e.id, art: 'schrift', text: `„${(e.titel || e.text).slice(0, 30)}": Schrift unter dem harten Minimum – aus der letzten Reihe nicht lesbar.`, schwer: true })
      klein.push(e.id)
    }
    else if (s < minimum * 0.98) klein.push(e.id)
    // Passt der Text in seinen Kasten?
    const satz = kastenSatz(kastenInhalt(e), e.w * W, s * H, t.schrift)
    if (satz.hoehe > e.h * H * 1.04 + 2) auf({ element: e.id, art: 'text', text: `„${(e.titel || e.text).slice(0, 30)}": Der Text passt nicht in den Kasten.`, schwer: satz.hoehe > e.h * H * 1.3 })
  }
  // Zu kleine Schrift als EIN Befund – meist ist schlicht zu viel Text auf der Fläche. Dazu die
  // Vorschläge der App: KI kürzt die Kästen; wo es der Aufbau erlaubt, fasst die App zwei Kästen zusammen
  if (klein.length)
    auf({
      element: klein[0],
      elemente: klein,
      art: 'schrift',
      text: `${klein.length === 1 ? 'Ein Element hat' : `${klein.length} Elemente haben`} eine kleinere Schrift als für ${f.kurz} empfohlen – Text kürzen oder Elemente zusammenfassen.`,
      vorschlaege: ['kiKuerzen', ...(k.inhalt && zusammenfassPaar(k.inhalt) ? (['zusammenfassen'] as const) : [])]
    })
  const grade = new Set(texte.map((e) => Math.round((e.schrift ?? 0) * 1000)))
  if (grade.size > 4) auf({ art: 'schrift', text: `${grade.size} verschiedene Schriftgrößen – höchstens drei wirken ruhig (R9).` })

  // Farben
  const farben = new Set<Farbe>(t.elemente.map((e) => e.farbe))
  farben.add('grund')
  if (farben.size > MAX_FARBEN)
    auf({ art: 'farbe', text: `${farben.size} Farben (mit der Grundfarbe) – empfohlen sind höchstens ${MAX_FARBEN}, jede mit fester Bedeutung.`, schwer: farben.size >= MAX_FARBEN_FEHLER })
  const legende = k.inhalt?.farbLegende ?? []
  const ohneBedeutung = [...farben].filter((c) => c !== 'grund' && !legende.some((l) => l.farbe === c && l.bedeutung.trim()))
  if (legende.length && ohneBedeutung.length) auf({ art: 'farbe', text: `Farbe ohne Bedeutung in der Legende: ${ohneBedeutung.join(', ')}.` })
  if (farben.has('rot') && farben.has('gruen')) {
    const nurFarbe = t.elemente.filter((e) => (e.farbe === 'rot' || e.farbe === 'gruen') && e.typ === 'kasten' && !e.symbol)
    if (nurFarbe.length >= 2) auf({ art: 'kontrast', text: 'Rot und Grün unterscheiden sich nur durch die Farbe – für Farbfehlsichtige ein Symbol (✓/✗, +/−) ergänzen (R23).' })
  }
  const p = PALETTEN[f.medium]
  for (const c of farben) {
    const wert = p.farben[c]
    const k2 = kontrast(wert, p.hintergrund)
    if (k2 < 4.5 && !(c === 'gelb' && p.marker)) auf({ art: 'kontrast', text: `Farbe ${c}: Kontrast ${k2.toFixed(1)} : 1 zum Grund – mindestens 4,5 : 1 (WCAG).`, schwer: k2 < 3 })
  }

  // Überlappung und Rand
  for (let i = 0; i < flaechig.length; i++) {
    const a = flaechig[i]
    const ra = { x: a.x * W, y: a.y * H, w: a.w * W, h: a.h * H }
    if (a.x < -0.001 || a.y < -0.001 || a.x + a.w > 1.001 || a.y + a.h > 1.001)
      auf({ element: a.id, art: 'rand', text: `„${(a.titel || a.text || a.typ).slice(0, 30)}" ragt über den Rand der Fläche.`, schwer: true })
    for (let j = i + 1; j < flaechig.length; j++) {
      const c = flaechig[j]
      if (schneidet(ra, { x: c.x * W, y: c.y * H, w: c.w * W, h: c.h * H }, -1))
        auf({ element: c.id, art: 'ueberlappung', text: `„${(a.titel || a.text || a.typ).slice(0, 24)}" und „${(c.titel || c.text || c.typ).slice(0, 24)}" überlappen sich.`, schwer: true })
    }
  }

  // Aufbau
  const titel = t.elemente.filter((e) => e.typ === 'text' && (e.schrift ?? 0) >= f.schrift.titel * 0.7 && e.schritt === 1 && !e.titel)
  if (!titel.length) auf({ art: 'aufbau', text: 'Die Überschrift fehlt – sie ist Pflicht (R32), am besten als Leitfrage.' })
  const merksatz = t.elemente.filter((e) => e.typ === 'merksatz')
  for (const m of merksatz) {
    const n = worte(m.text)
    if (n > MAX_MERKSATZ_WORTE) auf({ element: m.id, art: 'text', text: `Der Merksatz hat ${n} Wörter – höchstens ${MAX_MERKSATZ_WORTE}, damit er sich einprägt (R17).` })
  }
  if (merksatz.length > 1) auf({ art: 'aufbau', text: 'Mehr als ein Merksatz – in einer Stunde genügt einer (R17).' })
  const schritte = Math.max(1, ...t.elemente.map((e) => e.schritt || 1))
  if (schritte > MAX_SCHRITTE) auf({ art: 'aufbau', text: `${schritte} Aufbauschritte – höchstens ${MAX_SCHRITTE} bleiben überschaubar (R33).` })
  for (let s = 1; s <= schritte; s++) {
    const neu = t.elemente.filter((e) => (e.schritt || 1) === s && !istLinie(e)).length
    if (neu > MAX_NEU_JE_SCHRITT + 1 && schritte > 1) {
      auf({ art: 'aufbau', text: `Schritt ${s} bringt ${neu} neue Elemente – mehr als ${MAX_NEU_JE_SCHRITT} auf einmal überfordern (R33).` })
      break
    }
  }
  return b
}

/** Alle Tafeln prüfen, doppelte Befunde (gleicher Text) zusammenfassen */
export function pruefeAlle(tafeln: TbTafel[], k: PruefKontext, zusatz: Befund[] = []): Befund[] {
  const alle = [...zusatz, ...tafeln.flatMap((t) => pruefeTafel(t, k))]
  const gesehen = new Set<string>()
  return alle.filter((x) => {
    const s = `${x.format}|${x.text}`
    if (gesehen.has(s)) return false
    gesehen.add(s)
    return true
  })
}

/** Text-Elemente mit kleinerer Schrift als empfohlen (Auslöser der automatischen Kürzung) */
export function kleineSchrift(t: TbTafel): TbElement[] {
  const min = formatInfo(t.format).schrift.min
  return t.elemente.filter((e) => istTextElement(e) && (e.schrift ?? min) < min * 0.98)
}

/** Knoten, deren Text die Grenzen sprengt – für die automatische Kürzung */
export function zuLangeKnoten(inhalt: TbInhalt, grade: number, stil: Regler['stil']): string[] {
  const grenze = worteJeElement(grade, stil === 'ausformuliert')
  return inhalt.knoten.filter((k) => k.punkte.some((p) => worte(p) > grenze) || k.punkte.length > 5).map((k) => k.id)
}
