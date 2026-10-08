/**
 * Inhalt der Mehrspieler-Spiele (08.10.2026) – ohne KI beim Spielen: Vokabeln des Kurses (mit Beispielsätzen und
 * Bildern), Aufgaben der Grammatik des Kurses und derselben Katalogform aus Kursen anderer Lehrkräfte (nur die
 * Aufgabentexte), unregelmäßige Verben der Liste, Sätze mit Zeitform. Reine Funktionen für Server und Tests.
 */
import { kernform, ohneAngaben, satzMitLuecke, varianten, type Vokabel } from '../vokabeltrainer'
import { normiert, type GrammatikAufgabe } from '../grammatiktrainer'
import { ZEITFORMEN_EN } from '../signalwoerter'
import type { SpielInhalt, SpielItem, VerbFormen, ZeitSatz } from './typen'

const spielform = (t: string): string => ohneAngaben(varianten(t)[0] ?? t)
const woerterVon = (s: string): string[] => s.split(/\s+/).filter(Boolean)

/** Vokabeln → Items (Richtung nach Schwierigkeit: wird beim Fragen gewählt; Vorgabe: Deutsch → Fremdsprache) */
export function vokItems(woerter: Vokabel[]): SpielItem[] {
  const aus: SpielItem[] = []
  for (const w of woerter) {
    const term = spielform(w.term)
    const translation = ohneAngaben(w.translation)
    if (!term || !translation) continue
    const bsp = w.example && woerterVon(w.example).length >= 3 && woerterVon(w.example).length <= 14 ? w.example.trim() : undefined
    const luecke = bsp ? satzMitLuecke(bsp, w.term) ?? undefined : undefined
    const item: SpielItem = {
      id: w.id,
      frage: translation,
      zusatz: 'Wie heißt das Wort?',
      loesung: term,
      alternativen: varianten(w.term).filter((v) => v !== term),
      ablenker: [],
      vok: {
        term,
        translation,
        ...(w.pos ? { pos: w.pos } : {}),
        ...(w.note ? { note: w.note } : {}),
        ...(luecke ? { luecke } : {}),
        ...(bsp ? { beispiel: bsp } : {}),
        ...(bsp && w.exampleTranslation ? { beispielDe: w.exampleTranslation.trim() } : {}),
        ...(w.bild ? { bild: w.bild } : {})
      }
    }
    if (bsp && woerterVon(bsp).length >= 4) {
      item.satz = woerterVon(bsp)
      item.satzHinweis = w.exampleTranslation ? w.exampleTranslation.trim() : `Ein Satz mit „${translation}“`
      if (w.exampleTranslation) item.uebersetzung = { de: w.exampleTranslation.trim(), teile: woerterVon(bsp) }
    }
    aus.push(item)
  }
  // Fehlersätze aus Beispielsätzen: das Wort durch ein anderes Kurswort ersetzt (für Fehlerdetektive und Fehler-Sniper)
  const mitLuecke = aus.filter((i) => i.vok?.luecke && !/\s/.test(i.vok.luecke.loesung))
  mitLuecke.forEach((i, k) => {
    const anderes = mitLuecke[(k + 1) % mitLuecke.length]
    if (!anderes || anderes === i) return
    const l = i.vok!.luecke!
    const falsch = kernform(anderes.vok!.term)
    if (!falsch || /\s/.test(falsch) || normiert(falsch) === normiert(l.loesung)) return
    i.fehler = { satz: `${l.vor}${falsch}${l.nach}`, wort: falsch, korrektur: l.loesung }
  })
  return aus
}

const AUFGABE_TAUGT = new Set(['auswahl', 'luecke', 'umformen', 'fehler', 'satzbau', 'uebersetzen'])

/** Grammatikaufgaben → Items (nur Arten, die sich antippen bzw. kurz schreiben lassen) */
export function gramItems(aufgaben: GrammatikAufgabe[]): SpielItem[] {
  const aus: SpielItem[] = []
  for (const a of aufgaben) {
    if (!AUFGABE_TAUGT.has(a.art) || !a.loesungen?.[0]) continue
    const loesung = a.loesungen[0]
    const item: SpielItem = {
      id: a.id,
      frage: a.art === 'satzbau' ? a.anweisung : a.satz || a.anweisung,
      zusatz: [a.anweisung, a.vorgabe].filter(Boolean).join(' ') || undefined,
      loesung,
      alternativen: a.loesungen.slice(1),
      ablenker: (a.optionen ?? []).filter((o) => !a.loesungen.some((l) => normiert(l) === normiert(o)))
    }
    if (a.art === 'satzbau' && a.teile && a.teile.length >= 3) {
      item.satz = [...a.teile]
      item.satzHinweis = a.anweisung
      // Als Frage taugt „Satzbau" nicht (Lösung ist der ganze Satz)
      item.frage = ''
    } else if ((a.art === 'luecke' || a.art === 'auswahl') && a.satz.includes('___')) {
      const ganz = a.satz.replace('___', loesung)
      if (woerterVon(ganz).length >= 4 && woerterVon(ganz).length <= 14) {
        item.satz = woerterVon(ganz)
        item.satzHinweis = [a.anweisung, a.vorgabe].filter(Boolean).join(' ')
      }
    } else if (a.art === 'fehler' && a.fehlerWort) {
      item.fehler = { satz: a.satz, wort: a.fehlerWort, korrektur: loesung }
      item.frage = a.satz
      item.zusatz = 'Wie heißt das falsche Wort richtig?'
    } else if (a.art === 'umformen') {
      item.umformen = { satz: a.satz, vorgabe: a.vorgabe ?? a.anweisung, loesung }
      if (loesung.length > 60) item.frage = ''
    } else if (a.art === 'uebersetzen') {
      if (woerterVon(loesung).length >= 3 && woerterVon(loesung).length <= 14) item.uebersetzung = { de: a.satz, teile: woerterVon(loesung) }
      item.frage = ''
    }
    aus.push(item)
  }
  return aus
}

/** Taugt das Item als Frage mit Möglichkeiten bzw. zum Schreiben (kurze Lösung)? */
export const istFrageItem = (i: SpielItem): boolean => Boolean(i.frage) && i.loesung.length <= 60

/** Sätze mit Zeitform aus Aufgaben, deren Freigabe eine englische Zeitform ist (Katalog-Kennung) */
export function zeitSaetzeAus(gruppen: { themen: string[]; aufgaben: GrammatikAufgabe[] }[]): ZeitSatz[] {
  const RANG: Record<string, number> = {
    'en.verb.past_simple': 0,
    'en.verb.past_progressive': 0,
    'en.verb.present_perfect': 1,
    'en.verb.present_simple': 2,
    'en.verb.present_progressive': 2,
    'en.verb.will_future': 3,
    'en.verb.going_to': 3
  }
  const aus: ZeitSatz[] = []
  for (const g of gruppen) {
    const zf = ZEITFORMEN_EN.filter((z) => g.themen.some((t) => t === z.id || t.startsWith(`${z.id}/`)))
    if (zf.length !== 1) continue
    for (const a of g.aufgaben) {
      if (!(a.art === 'luecke' || a.art === 'auswahl') || !a.satz.includes('___') || !a.loesungen[0]) continue
      const satz = a.satz.replace('___', a.loesungen[0])
      if (woerterVon(satz).length > 16) continue
      aus.push({ id: a.id, satz, zeitform: zf[0].id, name: zf[0].name, rang: RANG[zf[0].id] ?? 2 })
    }
  }
  return aus
}

/** Gleichbedeutende Wörter: gleiche (kernige) Übersetzung oder „= …" in der Notiz */
export function synonymeAus(woerter: Vokabel[]): SpielInhalt['synonyme'] {
  const je = new Map<string, { de: string; woerter: Set<string> }>()
  for (const w of woerter) {
    const term = spielform(w.term)
    for (const de of varianten(w.translation)) {
      const k = normiert(kernform(de))
      if (!k) continue
      const e = je.get(k) ?? { de, woerter: new Set<string>() }
      e.woerter.add(term)
      je.set(k, e)
    }
    const gl = /(?:^|\s)=\s*([\p{L}' -]{2,30})/u.exec(w.note ?? '')
    if (gl) {
      const k = `=${normiert(term)}`
      const e = je.get(k) ?? { de: ohneAngaben(w.translation), woerter: new Set<string>([term]) }
      e.woerter.add(gl[1].trim())
      je.set(k, e)
    }
  }
  return [...je.values()].filter((e) => e.woerter.size >= 2).map((e) => ({ de: e.de, woerter: [...e.woerter] }))
}

/** Unregelmäßige Verben (Karten der Liste) → Formen mit Beschriftung */
export function verbFormenAus(karten: { id: string; de: string; formen: Record<string, string> }[], spalten: { id: string; label: string }[]): VerbFormen[] {
  return karten
    .map((k) => ({
      id: k.id,
      de: k.de,
      formen: spalten.map((s) => ({ label: s.label, wert: ohneAngaben(k.formen[s.id] ?? '') })).filter((f) => f.wert)
    }))
    .filter((v) => v.formen.length >= 2)
}

export const leererInhalt = (bereich: SpielInhalt['bereich'], sprache: string): SpielInhalt => ({
  bereich,
  sprache,
  items: [],
  verben: [],
  zeitSaetze: [],
  synonyme: []
})
