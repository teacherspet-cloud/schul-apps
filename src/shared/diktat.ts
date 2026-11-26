/**
 * Fehlerzählung für eingetippte Übungsdiktate (26.11.2026, mit der Lehrkraft abgestimmt).
 *
 * BELEGT (ISB Bayern, Handreichung „Leistungserhebungen im Fach Deutsch", S. 67): „Es sind so viele
 * Fehler möglich, wie es Wörter und Satzzeichen enthält" – also höchstens ein Fehler je Wort, und
 * Satzzeichen zählen eigenständig; Satzschlusszeichen werden angesagt, Kommas in der Regel nicht.
 * BELEGT (ISB, S. 23, zu Aufsätzen): Zeichensetzungsfehler „in der Regel als halbe Fehler".
 * BELEGT (Hessen, Fehlerindex 9/10): Zeichensetzung als ganze Fehler – Grundlage der Stufe „streng".
 * FAUSTREGEL (Schulpraxis, z. B. Fachkonferenz Schubart-Gymnasium Aalen 2024): Wiederholungsfehler
 * zählen einmal; das/dass ist keine Wiederholung, sondern jedes Mal eine Entscheidung.
 * FAUSTREGEL (Lehrerfreund, Stufe „normal"): Note 6 ab 10 % Fehlern, dazwischen gleichmäßig –
 * nur als Vorschlag für die Lehrkraft (RLP und Berlin lehnen berechnete Noten ab).
 *
 * Abgestimmter Standard „ISB-nah": ein Fehler je Wort, Groß-/Kleinschreibung voll, diktierte
 * Satzzeichen halb, nicht angesagte Kommas gar nicht, Wiederholungsfehler einmal (außer das/dass).
 */

export type DiktatZaehlart = 'isb' | 'streng' | 'woerter'

export interface DiktatRegeln {
  zaehlart: DiktatZaehlart
  /** Werden Kommas mitdiktiert? Sonst zählen Kommafehler nicht. */
  kommasDiktiert: boolean
  /** Note 6 ab diesem Anteil Fehler je Wort (Prozent) – Vorschlag 10 */
  sechsAbProzent: number
}

export const STANDARD_REGELN: DiktatRegeln = { zaehlart: 'isb', kommasDiktiert: false, sechsAbProzent: 10 }

export type FehlerArt = 'schreibung' | 'grossklein' | 'fehlt' | 'zuviel' | 'getrenntzusammen' | 'zeichen'

export interface DiktatStelle {
  /** Wort/Zeichen des Diktattextes ('' bei überzähligem Wort) */
  soll: string
  /** Was geschrieben wurde ('' bei fehlendem Wort) */
  ist: string
  art: FehlerArt | 'richtig'
  /** Gezählte Fehler an dieser Stelle (0, 0.5 oder 1) */
  fehler: number
  /** Gleicher Fehler wie schon vorher – angezeigt, aber nicht noch einmal gezählt */
  wiederholung?: boolean
  /** Fehlerkategorie (Kennung aus DIKTAT_SCHWERPUNKTE) – für „Fehler nach Strategie" */
  kategorie?: string
}

export interface DiktatAuswertung {
  stellen: DiktatStelle[]
  fehler: number
  woerter: number
  richtigeWoerter: number
  /** Richtig geschriebene Wörter in Prozent */
  prozentRichtig: number
  /** Fehler je 100 Wörter */
  fehlerJe100: number
  /** Notenvorschlag 1–6 (nur für die Lehrkraft) */
  notenvorschlag: number
}

type Token = { t: string; zeichen: boolean }

const ZEICHEN = /^[.,;:!?„“”"«»‚‘'()–—-]$/
export function zerlege(text: string): Token[] {
  const norm = text
    .normalize('NFC')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/…/g, '...')
  const out: Token[] = []
  for (const m of norm.matchAll(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*|[.,;:!?„“”"«»‚()–—]/gu)) out.push({ t: m[0], zeichen: !/[\p{L}\p{N}]/u.test(m[0]) })
  return out
}

/** Ähnlichkeit zweier Wörter (0–1) für die Zuordnung – damit „Farrad" als falsches „Fahrrad" gilt, nicht als fehlendes */
function aehnlich(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (x === y) return 1
  const m = x.length
  const n = y.length
  if (!m || !n) return 0
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    prev = cur
  }
  return 1 - prev[n] / Math.max(m, n)
}

type Schritt = { a: 'gleich' | 'ersetzt' | 'fehlt' | 'zuviel' | 'zusammen' | 'getrennt'; i: number; j: number; li?: number; lj?: number }

/** Zuordnung Soll ↔ Ist über die kleinste Abweichung (Wörter und Zeichen getrennt behandelt) */
function zuordnen(soll: Token[], ist: Token[]): Schritt[] {
  const m = soll.length
  const n = ist.length
  const INF = 1e9
  const kosten: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(INF))
  const weg: (Schritt | null)[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(null))
  kosten[0][0] = 0
  const setze = (i: number, j: number, k: number, s: Schritt): void => {
    if (k < kosten[i][j]) {
      kosten[i][j] = k
      weg[i][j] = s
    }
  }
  for (let i = 0; i <= m; i++)
    for (let j = 0; j <= n; j++) {
      const k = kosten[i][j]
      if (k >= INF) continue
      if (i < m) setze(i + 1, j, k + 1, { a: 'fehlt', i, j })
      if (j < n) setze(i, j + 1, k + 1, { a: 'zuviel', i, j })
      if (i < m && j < n && soll[i].zeichen === ist[j].zeichen) {
        const s = aehnlich(soll[i].t, ist[j].t)
        if (soll[i].t === ist[j].t) setze(i + 1, j + 1, k, { a: 'gleich', i, j })
        else if (soll[i].zeichen || s >= 0.4) setze(i + 1, j + 1, k + (1 - s) + 0.2, { a: 'ersetzt', i, j })
      }
      // Getrennt-/Zusammenschreibung: zwei Soll-Wörter als eines geschrieben oder umgekehrt
      if (i + 1 < m && j < n && !soll[i].zeichen && !soll[i + 1].zeichen && !ist[j].zeichen) {
        if ((soll[i].t + soll[i + 1].t).toLowerCase() === ist[j].t.toLowerCase()) setze(i + 2, j + 1, k + 0.5, { a: 'zusammen', i, j })
      }
      if (i < m && j + 1 < n && !soll[i].zeichen && !ist[j].zeichen && !ist[j + 1].zeichen) {
        if ((ist[j].t + ist[j + 1].t).toLowerCase() === soll[i].t.toLowerCase()) setze(i + 1, j + 2, k + 0.5, { a: 'getrennt', i, j })
      }
    }
  const schritte: Schritt[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    const s = weg[i][j]
    if (!s) break
    schritte.push(s)
    i = s.i
    j = s.j
  }
  return schritte.reverse()
}

const ist_das_dass = (w: string): boolean => /^(das|dass)$/i.test(w)

/** Gezählter Wert eines Zeichenfehlers je Zählart */
function zeichenWert(zeichen: string, r: DiktatRegeln): number {
  if (r.zaehlart === 'woerter') return 0
  if (zeichen === ',' && !r.kommasDiktiert) return 0
  return r.zaehlart === 'streng' ? 1 : 0.5
}

export function notenvorschlag(fehler: number, woerter: number, sechsAbProzent: number): number {
  if (woerter <= 0) return 1
  const grenze6 = (Math.max(1, sechsAbProzent) * woerter) / 100
  return Math.min(6, 1 + Math.floor((fehler / grenze6) * 5))
}

export function werteDiktatAus(sollText: string, istText: string, regeln: DiktatRegeln = STANDARD_REGELN): DiktatAuswertung {
  const soll = zerlege(sollText)
  const ist = zerlege(istText)
  const stellen: DiktatStelle[] = []
  const gesehen = new Set<string>()
  const wortFehler = (s: string, i: string, art: FehlerArt): DiktatStelle => {
    const schluessel = `${s.toLowerCase()}→${i}`
    const wiederholung = gesehen.has(schluessel) && !ist_das_dass(s)
    gesehen.add(schluessel)
    return { soll: s, ist: i, art, fehler: wiederholung ? 0 : 1, ...(wiederholung ? { wiederholung: true } : {}) }
  }
  for (const s of zuordnen(soll, ist)) {
    const a = soll[s.i]
    const b = ist[s.j]
    if (s.a === 'gleich') stellen.push({ soll: a.t, ist: b.t, art: 'richtig', fehler: 0 })
    else if (s.a === 'fehlt') stellen.push(a.zeichen ? { soll: a.t, ist: '', art: 'zeichen', fehler: zeichenWert(a.t, regeln) } : wortFehler(a.t, '', 'fehlt'))
    else if (s.a === 'zuviel') stellen.push(b.zeichen ? { soll: '', ist: b.t, art: 'zeichen', fehler: zeichenWert(b.t, regeln) } : wortFehler('', b.t, 'zuviel'))
    else if (s.a === 'zusammen') stellen.push(wortFehler(`${a.t} ${soll[s.i + 1].t}`, b.t, 'getrenntzusammen'))
    else if (s.a === 'getrennt') stellen.push(wortFehler(a.t, `${b.t} ${ist[s.j + 1].t}`, 'getrenntzusammen'))
    else if (a.zeichen) stellen.push({ soll: a.t, ist: b.t, art: 'zeichen', fehler: zeichenWert(a.t === ',' || b.t === ',' ? ',' : a.t, regeln) })
    else stellen.push(wortFehler(a.t, b.t, a.t.toLowerCase() === b.t.toLowerCase() ? 'grossklein' : 'schreibung'))
  }
  // Kategorie je Wortfehler (Satzanfang/Bezugswort aus dem Soll-Text davor)
  let vorher = ''
  let anfang = true
  for (const st of stellen) {
    if (st.art !== 'richtig' && st.art !== 'zeichen' && st.soll && st.ist) st.kategorie = st.art === 'getrenntzusammen' ? 'getrennt' : fehlerKategorie(st.soll, st.ist, vorher, anfang)
    else if (st.art === 'zeichen') st.kategorie = st.soll === ',' || st.ist === ',' ? 'komma_neben' : 'zeichen_satz'
    if (st.soll) {
      anfang = /^[.!?:]$/.test(st.soll)
      if (!/^[.,;:!?„“”"«»‚()–—]$/.test(st.soll)) vorher = st.soll
    }
  }
  // Zeichen, die nicht zählen, gelten als richtig (keine Markierung)
  for (const st of stellen) if (st.art === 'zeichen' && st.fehler === 0) st.art = 'richtig'
  const woerter = soll.filter((t) => !t.zeichen).length
  const fehler = stellen.reduce((s, x) => s + x.fehler, 0)
  const richtigeWoerter = stellen.filter((x) => x.art === 'richtig' && x.soll && !ZEICHEN.test(x.soll)).length
  return {
    stellen,
    fehler,
    woerter,
    richtigeWoerter,
    prozentRichtig: woerter ? Math.round((richtigeWoerter / woerter) * 100) : 100,
    fehlerJe100: woerter ? Math.round((fehler / woerter) * 1000) / 10 : 0,
    notenvorschlag: notenvorschlag(fehler, woerter, regeln.sechsAbProzent)
  }
}

/*
 * Fehler einer Kategorie zuordnen (26.11.2026) – Kennungen wie DIKTAT_SCHWERPUNKTE
 * (renderer/…/arbeitsblatt/didactics/diktat.ts). Reihenfolge nach der Recherche (spezifisch zuerst):
 * gleich klingende Wörter → nur Groß/klein → nur Leerzeichen → Buchstabenregeln → Rest „lauttreu".
 * Eine Regel „passt", wenn Soll und Ist nach ihrer Vereinheitlichung gleich sind; trifft keine allein,
 * werden Paare versucht (zwei Fehlerarten in einem Wort – gezählt wird trotzdem ein Fehler je Wort).
 */
const GLEICHKLANG: [string, string][] = [
  ['das', 'dass'],
  ['seid', 'seit'],
  ['wider', 'wieder'],
  ['wal', 'wahl'],
  ['lid', 'lied'],
  ['mahlen', 'malen'],
  ['war', 'wahr'],
  ['wen', 'wenn'],
  ['den', 'denn'],
  ['endlich', 'entlich'],
  ['tod', 'tot']
]
const ARTIKELWORT = /^(das|dem|des|beim|zum|zur|vom|im|am|ins|ans|aufs|viel|etwas|nichts|alles|wenig|allerlei)$/i
const TAGESZEIT = /^(morgen|vormittag|mittag|nachmittag|abend|nacht)s?$/i
const ANREDE = /^(sie|ihnen|ihr|ihre|ihren|ihrem|ihrer|ihres)$/i

const REGELN: [string, (s: string) => string, (soll: string) => boolean][] = [
  ['slaute', (s) => s.replace(/ß|ss/g, 's'), () => true],
  ['auslaut', (s) => s.replace(/d(?=$|[^aeiouäöüyh])/g, 't').replace(/b(?=$|[^aeiouäöüy])/g, 'p').replace(/g(?=$|[^aeiouäöüy])/g, 'k'), () => true],
  ['umlaut', (s) => s.replace(/äu/g, 'eu').replace(/ä/g, 'e'), () => true],
  ['ie', (s) => s.replace(/ie/g, 'i'), () => true],
  ['silbenh', (s) => s.replace(/([aeiouäöü])h(?=[aeiouäöü])/g, '$1'), (soll) => /[aeiouäöü]h[aeiouäöü]/.test(soll)],
  ['dehnung', (s) => s.replace(/([aeiouäöü])h/g, '$1').replace(/aa/g, 'a').replace(/ee/g, 'e').replace(/oo/g, 'o'), () => true],
  ['ck_tz', (s) => s.replace(/ck|kk/g, 'k').replace(/tz|zz/g, 'z'), () => true],
  ['doppelkonsonant', (s) => s.replace(/([bdfglmnprt])\1/g, '$1'), () => true],
  ['fvph', (s) => s.replace(/ph/g, 'f').replace(/v/g, 'f'), () => true],
  ['nachsilben', (s) => s.replace(/(ig|ich)(?=(e[nmrs]?|er|st)?$)/g, 'ig').replace(/niss?(?=$|e)/g, 'nis').replace(/lig(?=$|e)/g, 'lich'), () => true],
  ['vorsilben', (s) => s.replace(/^end|^ent/, 'ent').replace(/^fer/, 'ver').replace(/(.)\1\1/g, '$1$1'), () => true],
  ['besondere', (s) => s.replace(/chs|ks|x/g, 'x').replace(/kw/g, 'qu').replace(/^schp/, 'sp').replace(/^scht/, 'st'), () => true],
  ['fremdwoerter', (s) => s.replace(/th/g, 't').replace(/rh/g, 'r').replace(/y/g, 'i').replace(/c(?![hk])/g, 'k'), (soll) => /th|rh|y|c(?![hk])/.test(soll)]
]

export function fehlerKategorie(soll: string, ist: string, vorher = '', satzanfang = false): string {
  const a = soll.toLowerCase()
  const b = ist.toLowerCase()
  if (GLEICHKLANG.some(([x, y]) => (a === x && b === y) || (a === y && b === x))) return 'gleichklang'
  if (a === b) {
    if (ANREDE.test(soll) && !satzanfang) return 'gross_anrede'
    if (TAGESZEIT.test(soll) || (!satzanfang && ARTIKELWORT.test(vorher))) return 'gross_nominal'
    return 'gross_nomen'
  }
  if (a.replace(/[\s-]/g, '') === b.replace(/[\s-]/g, '')) return 'getrennt'
  for (const [k, f, gilt] of REGELN) if (gilt(a) && f(a) === f(b)) return k
  for (const [k1, f1, g1] of REGELN)
    for (const [, f2] of REGELN) if (g1(a) && f2(f1(a)) === f2(f1(b))) return k1
  return 'lauttreu'
}
