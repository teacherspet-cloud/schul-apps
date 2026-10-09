/**
 * Inhalt der Mehrspieler-Spiele (08.10.2026) – ohne KI beim Spielen: Vokabeln des Kurses (mit Beispielsätzen und
 * Bildern), Aufgaben der Grammatik des Kurses und derselben Katalogform aus Kursen anderer Lehrkräfte (nur die
 * Aufgabentexte), unregelmäßige Verben der Liste, Sätze mit Zeitform. Reine Funktionen für Server und Tests.
 */
import { kernform, ohneAngaben, satzMitLuecke, varianten, type Vokabel } from '../vokabeltrainer'
import { abkuerzungAus, abkVoll } from '../abkuerzung'
import { spielform } from '../vokabelSpiele'
import { normiert, type GrammatikAufgabe } from '../grammatiktrainer'
import { ZEITFORMEN_EN } from '../signalwoerter'
import type { SpielInhalt, SpielItem, VerbFormen, ZeitSatz } from './typen'
import { abschnitteAus, reiheVon, type Buch } from '../vokabelLaufbahn'

const woerterVon = (s: string): string[] => s.split(/\s+/).filter(Boolean)

/** Wort ohne Satzzeichen (Apostroph und Bindestrich bleiben) – so werden angetippte Wörter verglichen */
export const wortKern = (t: string): string => normiert(t.replace(/[^\p{L}\p{N}'’-]/gu, ''))

/**
 * Stellen (Index in den Wörtern des Satzes), an denen `wort` steht – bei mehreren Wörtern alle Stellen der Folge.
 * Leer = das Wort steht so nicht im Satz (dann taugt der Satz nicht als Fehlersatz).
 */
export function fehlerStellen(satz: string, wort: string): number[] {
  const t = woerterVon(satz).map(wortKern)
  const w = woerterVon(wort).map(wortKern).filter(Boolean)
  if (!w.length) return []
  const aus: number[] = []
  for (let i = 0; i + w.length <= t.length; i++) if (w.every((x, j) => t[i + j] === x)) for (let j = 0; j < w.length; j++) aus.push(i + j)
  return aus
}

/**
 * Lücke für das Wort im Beispielsatz (09.10.2026): bevorzugt die Stelle, an der das Wort genau steht („go" in „This
 * is a good day to go." ist das letzte Wort, nicht „good"); sonst eine gebeugte Form ab Wortanfang (satzMitLuecke).
 */
export function lueckeImSatz(satz: string, term: string): { vor: string; nach: string; loesung: string } | null {
  const k = kernform(varianten(term)[0] ?? term).toLowerCase()
  if (k) {
    const klein = satz.toLowerCase()
    for (let i = klein.indexOf(k); i >= 0; i = klein.indexOf(k, i + 1)) {
      const vor = satz.slice(0, i)
      const nach = satz.slice(i + k.length)
      if (!/\p{L}$/u.test(vor) && !/^\p{L}/u.test(nach)) return { vor, nach, loesung: satz.slice(i, i + k.length) }
    }
  }
  return satzMitLuecke(satz, term)
}

/** Abkürzung: Abkürzung allein, Langform allein und der ganze Eintrag; sonst die Varianten */
const abkAlternativen = (term: string, sonst: string[]): string[] => {
  const e = abkuerzungAus(term)
  return e ? [e.kurz, e.lang, abkVoll(e)] : sonst
}

/** Die Lücke steht an Wortgrenzen (nicht mitten in einem längeren Wort) */
const luekeAnWortgrenze = (l: { vor: string; nach: string }): boolean => !/\p{L}$/u.test(l.vor) && !/^\p{L}/u.test(l.nach)

/** Vokabeln → Items (Richtung nach Schwierigkeit: wird beim Fragen gewählt; Vorgabe: Deutsch → Fremdsprache) */
export function vokItems(woerter: Vokabel[]): SpielItem[] {
  const aus: SpielItem[] = []
  for (const w of woerter) {
    const term = spielform(w.term)
    const translation = ohneAngaben(w.translation)
    if (!term || !translation) continue
    const bsp = w.example && woerterVon(w.example).length >= 3 && woerterVon(w.example).length <= 14 ? w.example.trim() : undefined
    const luecke = bsp ? lueckeImSatz(bsp, w.term) ?? undefined : undefined
    const item: SpielItem = {
      id: w.id,
      frage: translation,
      zusatz: 'Wie heißt das Wort?',
      loesung: term,
      // Abkürzungen (09.10.2026): Abkürzung, Langform und ganzer Eintrag zählen
      alternativen: abkAlternativen(w.term, varianten(w.term)).filter((v) => v !== term),
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
  // Fehlersätze aus Beispielsätzen: das Wort durch ein anderes Kurswort ersetzt (für Fehlerdetektive und Fehler-Sniper).
  // 09.10.2026 (Befund der Lehrkraft: Sätze ohne Fehler, Spiel hing): nur ganze Wörter ersetzen, nie durch eine
  // gültige Form (dasselbe Wort, eine Variante, ein Synonym mit gleicher Übersetzung), und die Fehlerstelle merken.
  const mitLuecke = aus.filter((i) => i.vok?.luecke && !/\s/.test(i.vok.luecke.loesung) && luekeAnWortgrenze(i.vok.luecke))
  mitLuecke.forEach((i, k) => {
    const l = i.vok!.luecke!
    const gueltig = new Set([l.loesung, i.vok!.term, ...(i.alternativen ?? [])].map((x) => normiert(kernform(x))))
    const bedeutung = normiert(kernform(i.vok!.translation))
    for (let d = 1; d < mitLuecke.length; d++) {
      const anderes = mitLuecke[(k + d) % mitLuecke.length]
      const falsch = kernform(anderes.vok!.term)
      if (!falsch || /\s/.test(falsch) || gueltig.has(normiert(falsch))) continue
      if (normiert(kernform(anderes.vok!.translation)) === bedeutung) continue
      const satz = `${l.vor}${falsch}${l.nach}`
      const original = `${l.vor}${l.loesung}${l.nach}`
      const stellen = fehlerStellen(satz, falsch)
      if (normiert(satz) === normiert(original) || !stellen.length) continue
      i.fehler = { satz, wort: falsch, korrektur: l.loesung, stellen }
      break
    }
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
      // Nur, wenn das falsche Wort wirklich im Satz steht und sich von der Verbesserung unterscheidet (09.10.2026)
      const stellen = fehlerStellen(a.satz, a.fehlerWort)
      if (stellen.length && !a.loesungen.some((l) => normiert(l) === normiert(a.fehlerWort!)))
        item.fehler = { satz: a.satz, wort: a.fehlerWort, korrektur: loesung, stellen }
      item.frage = a.satz
      // Fragezusatz in der Zielsprache setzt frageAus (kern.ts); ohne gültige Fehlerstelle die Anweisung der Aufgabe
      item.zusatz = item.fehler ? undefined : a.anweisung || undefined
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

/**
 * Lehrwerkswörter bis zum Stand der Klasse (09.10.2026, Reiseplaner): alle Bände derselben Reihe VOR dem aktuellen
 * Band ganz, im aktuellen Band alle Units bis einschließlich der Stand-Unit – nie etwas danach. Kennungen wie im
 * Vokabelweg („b:<band>:<u>:<s>:<i>"), damit der Stand der Kinder dazu passt.
 */
export function lehrwerkBisStand(buecher: Buch[], stand: { buch: string; unit: string }): { id: string; term: string }[] {
  const aktuell = buecher.find((b) => b.id === stand.buch)
  if (!aktuell) return []
  const reihe = reiheVon(aktuell)
  const nummer = (b: Buch): number => {
    const n = parseFloat(String(b.band ?? '').replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) ? n : 99
  }
  const bis = aktuell.units.findIndex((u) => u.name === stand.unit)
  if (bis < 0) return []
  const aus: { id: string; term: string }[] = []
  for (const b of buecher.filter((x) => reiheVon(x) === reihe && (x.id === aktuell.id || nummer(x) < nummer(aktuell)))) {
    const letzte = b.id === aktuell.id ? bis : b.units.length - 1
    for (const a of abschnitteAus(b)) {
      const ui = Number(a.key.split(':').slice(-2)[0])
      if (ui <= letzte) for (const w of a.woerter) aus.push({ id: w.id, term: w.term })
    }
  }
  return aus
}
