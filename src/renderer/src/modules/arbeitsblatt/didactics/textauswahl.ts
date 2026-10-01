/**
 * Textauswahl-Menü der Materialtexte (01.10.2026) – die reinen Regeln, ohne Oberfläche und KI.
 *
 * Wunsch der Lehrkraft: Ein Wort oder eine Passage im Material markieren, Rechtsklick (iPad:
 * langer Druck) → Kreismenü mit „In Fußnote erklären", „Worthilfe", „Einfacher formulieren",
 * „Auslassen […]", „Aufgabe dazu erzeugen", „Hervorheben", „In Lücke umwandeln", „In Wortspeicher/
 * Vokabelliste" und „Bild dazu". Hier steht, was jede Aktion am Text ändert:
 *   - Stellen im Rohtext finden (die Markierung im Blatt kennt nur den sichtbaren Text),
 *   - ersetzen, auslassen, formatieren, Lücken setzen, Fußnoten einfügen,
 *   - Vermerke in der Quellenangabe („gekürzt", „vereinfacht"),
 *   - die Aufgabe mit eingebautem Zitat (Operator in korrekter Satzstellung, Anführungszeichen
 *     der Sprache, Zeilenangabe),
 *   - die Sprache der Erklärungen (Deutsch oder einsprachig in der Zielsprache).
 */
import { emphasisAbschnitte, type Auszeichnung } from '../../../shared/richtext/parse'
import { operatorSatz, type OperatorAnrede } from '@shared/operatoren/satzbau'
import type { Listensprache } from '@shared/operatoren/typen'
import { CEFR_SCALE, type CefrLevel } from '@shared/types'
import type { Fussnote, TextBlock } from '../model/types'
import { begriffImText } from './anmerkungen'

/** Stelle im Rohtext: Absatz (wie `splitParagraphs`) und Zeichen darin */
export interface TextStelle {
  absatz: number
  index: number
}

export interface TextAuswahl {
  von: TextStelle
  bis: TextStelle
}

/** Absätze wie in der Anzeige (render/baustein/hilfen.tsx `splitParagraphs`) */
export const absaetzeVon = (body: string): string[] =>
  (body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

const fuege = (absaetze: string[]): string => absaetze.filter((x) => x.trim()).join('\n\n')

/** Der markierte Rohtext */
export function auswahlRoh(body: string, a: TextAuswahl): string {
  const p = absaetzeVon(body)
  if (a.von.absatz === a.bis.absatz) return (p[a.von.absatz] ?? '').slice(a.von.index, a.bis.index)
  const teile = [(p[a.von.absatz] ?? '').slice(a.von.index)]
  for (let i = a.von.absatz + 1; i < a.bis.absatz; i++) teile.push(p[i] ?? '')
  teile.push((p[a.bis.absatz] ?? '').slice(0, a.bis.index))
  return teile.join('\n\n')
}

/** Die Markierung durch `ersatz` ersetzen (über Absätze hinweg: die Absätze verschmelzen) */
export function ersetzeAuswahl(body: string, a: TextAuswahl, ersatz: string): string {
  const p = absaetzeVon(body)
  const vorn = (p[a.von.absatz] ?? '').slice(0, a.von.index)
  const hinten = (p[a.bis.absatz] ?? '').slice(a.bis.index)
  p.splice(a.von.absatz, a.bis.absatz - a.von.absatz + 1, vorn + ersatz + hinten)
  return fuege(p)
}

// ---------- Markierung im Blatt → Stelle im Rohtext

/** Zeichen, die im Blatt nicht sichtbar sind: Auszeichnungen, Fußnotenmarken, Hochgestelltes, Lücken */
const UNSICHTBAR = '(?:\\*\\*|\\*|==|\\+\\+|\\[\\^[^\\]]*\\]|\\^\\{[^}]*\\}|\\[\\[[^\\]]*\\]\\])*'
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Wo steht der sichtbare Text `gesucht` im Rohtext? `vorkommen` zählt ab 0 (das wievielte
 * Vorkommen im sichtbaren Text des Absatzes). Zwischen den Zeichen dürfen unsichtbare Marken
 * stehen; Leerraum darf abweichen. Liefert [von, bis) oder null.
 */
export function findeImRohtext(roh: string, gesucht: string, vorkommen = 0): [number, number] | null {
  const kern = gesucht.replace(/\s+/g, ' ').trim()
  if (!kern) return null
  const teile = [...kern].map((c) => (c === ' ' ? `${UNSICHTBAR}\\s+${UNSICHTBAR}` : esc(c)))
  const re = new RegExp(teile.join(UNSICHTBAR), 'g')
  const treffer: [number, number][] = []
  for (let m = re.exec(roh); m; m = re.exec(roh)) {
    treffer.push([m.index, m.index + m[0].length])
    if (m[0].length === 0) re.lastIndex++
  }
  if (!treffer.length) return null
  return treffer[Math.min(Math.max(0, vorkommen), treffer.length - 1)]
}

/** Wie oft steht `gesucht` (nicht überlappend) in `text`? */
export const zaehleVorkommen = (text: string, gesucht: string): number => {
  const kern = gesucht.replace(/\s+/g, ' ').trim()
  if (!kern) return 0
  return text.replace(/\s+/g, ' ').split(kern).length - 1
}

// ---------- Quellenangabe

export type Vermerk = 'gekürzt' | 'vereinfacht' | 'adaptiert'
const VERMERKE: Vermerk[] = ['gekürzt', 'vereinfacht', 'adaptiert']

/**
 * Vermerk an der Quellenangabe – nur bei einer Quelle (ein eigener Text braucht keinen) und nur
 * einmal: „… (gekürzt)", mit einem zweiten Vermerk „… (gekürzt, vereinfacht)". Steht das Wort
 * schon im Hinweis (z. B. „Der Text wurde für diese Aufgabe gekürzt."), bleibt alles, wie es ist.
 */
export function quelleMitVermerk(source: string, vermerk: Vermerk): string {
  const q = (source ?? '').trim()
  if (!q) return source ?? ''
  if (new RegExp(`\\b${vermerk.slice(0, -1)}`, 'i').test(q)) return q
  const klammer = /\(([^()]*)\)\s*$/.exec(q)
  if (klammer && klammer[1].split(/,\s*/).every((v) => VERMERKE.includes(v.trim() as Vermerk)))
    return `${q.slice(0, klammer.index)}(${[...klammer[1].split(/,\s*/), vermerk].join(', ')})`
  return `${q} (${vermerk})`
}

/** Vermerk wieder entfernen (Umschalten auf das Original) */
export function quelleOhneVermerk(source: string, vermerk: Vermerk): string {
  const q = (source ?? '').trim()
  const klammer = /\s*\(([^()]*)\)\s*$/.exec(q)
  if (!klammer) return q
  const rest = klammer[1]
    .split(/,\s*/)
    .map((v) => v.trim())
    .filter((v) => v !== vermerk)
  if (!rest.length) return q.slice(0, klammer.index)
  if (!rest.every((v) => VERMERKE.includes(v as Vermerk))) return q
  return `${q.slice(0, klammer.index)} (${rest.join(', ')})`
}

// ---------- Auslassen

/**
 * Markierung durch „[…]" ersetzen. Benachbarte Auslassungen verschmelzen, Leerraum wird
 * bereinigt, die Quelle bekommt „(gekürzt)". Worthilfen, deren Begriff danach nicht mehr im Text
 * steht, fallen weg; Fußnoten an der Stelle verschwinden mit ihrer Marke.
 */
export function auslassen(block: TextBlock, a: TextAuswahl): void {
  const vorher = block.body
  let body = ersetzeAuswahl(vorher, a, ' […] ')
  body = body
    .replace(/\[…\](\s*\[…\])+/g, '[…]')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\[…\] +([.,;:!?])/g, '[…]$1')
  block.body = absaetzeVon(body)
    .map((p) => p.replace(/^ +| +$/gm, ''))
    .join('\n\n')
  block.glossary = (block.glossary ?? []).filter((g) => begriffImText(vorher, g.term) < 0 || begriffImText(block.body, g.term) >= 0)
  block.source = quelleMitVermerk(block.source, 'gekürzt')
}

// ---------- Formatieren

export type Formatierung = 'fett' | 'kursiv' | 'unterstrichen' | 'markiert'
const FLAG: Record<Formatierung, keyof Auszeichnung> = { fett: 'bold', kursiv: 'italic', unterstrichen: 'underline', markiert: 'mark' }
const MARKE: Record<keyof Auszeichnung, string> = { bold: '**', italic: '*', underline: '++', mark: '==', sup: '' }

/**
 * Eine Auszeichnung für [von, bis) eines Absatzes setzen – oder entfernen, wenn alles Markierte
 * sie schon trägt. Formeln bleiben unberührt; berührte Textstücke werden neu ausgezeichnet.
 */
export function formatiereAbsatz(absatz: string, von: number, bis: number, art: Formatierung): string {
  const flag = FLAG[art]
  // Stücke: Formeln ($…$) und Zeilenwechsel bleiben, wie sie sind
  const stuecke: { text: string; start: number; fest: boolean }[] = []
  const re = /\$[^$]*\$|\n/g
  let pos = 0
  for (let m = re.exec(absatz); m; m = re.exec(absatz)) {
    if (m.index > pos) stuecke.push({ text: absatz.slice(pos, m.index), start: pos, fest: false })
    stuecke.push({ text: m[0], start: m.index, fest: true })
    pos = m.index + m[0].length
  }
  if (pos < absatz.length) stuecke.push({ text: absatz.slice(pos), start: pos, fest: false })
  // Zeichen der berührten Stücke mit ihrer Auszeichnung
  const zeichen = (s: (typeof stuecke)[number]): { c: string; abs: number; f: Auszeichnung }[] =>
    emphasisAbschnitte(s.text).flatMap((a) => [...s.text.slice(a.von, a.bis)].map((c, k) => ({ c, abs: s.start + a.von + k, f: { ...a } as Auszeichnung })))
  const beruehrt = stuecke.filter((s) => !s.fest && s.start < bis && s.start + s.text.length > von)
  const alle = beruehrt.flatMap(zeichen)
  const markiert = alle.filter((z) => z.abs >= von && z.abs < bis && z.c.trim())
  if (!markiert.length) return absatz
  const setzen = !markiert.every((z) => z.f[flag])
  return stuecke
    .map((s) => {
      if (!beruehrt.includes(s)) return s.text
      const zs = zeichen(s).map((z) => (z.abs >= von && z.abs < bis ? { ...z, f: { ...z.f, [flag]: setzen } } : z))
      return auszeichnen(zs)
    })
    .join('')
}

/** Zeichen mit Auszeichnung wieder als Textformat schreiben; Leerraum steht außerhalb der Marken */
function auszeichnen(zs: { c: string; f: Auszeichnung }[]): string {
  const ARTEN: (keyof Auszeichnung)[] = ['bold', 'italic', 'underline', 'mark']
  // Läufe gleicher Auszeichnung; Leerraum am Rand eines Laufs gehört nach außen
  const laeufe: { text: string; f: Auszeichnung }[] = []
  for (const z of zs) {
    const f: Auszeichnung = {}
    for (const a of ARTEN) if (z.f[a]) f[a] = true
    const letzter = laeufe[laeufe.length - 1]
    if (letzter && ARTEN.every((a) => !!letzter.f[a] === !!f[a])) letzter.text += z.c
    else laeufe.push({ text: z.c, f })
  }
  return laeufe
    .map((l) => {
      const offen = ARTEN.filter((a) => l.f[a])
      if (!offen.length) return l.text
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(l.text)!
      if (!m[2]) return l.text
      return `${m[1]}${offen.map((a) => MARKE[a]).join('')}${m[2]}${[...offen]
        .reverse()
        .map((a) => MARKE[a])
        .join('')}${m[3]}`
    })
    .join('')
}

/** Formatieren über die Markierung (auch über mehrere Absätze) */
export function formatiere(body: string, a: TextAuswahl, art: Formatierung): string {
  const p = absaetzeVon(body)
  for (let i = a.von.absatz; i <= a.bis.absatz; i++) {
    if (p[i] === undefined) continue
    const von = i === a.von.absatz ? a.von.index : 0
    const bis = i === a.bis.absatz ? a.bis.index : p[i].length
    p[i] = formatiereAbsatz(p[i], von, bis, art)
  }
  return fuege(p)
}

// ---------- Lücken

/**
 * Die markierten Wörter werden zu Lücken `[[Wort]]` – jedes Wort eine eigene Lücke, so lassen sich
 * mehrere hintereinander setzen. Satzzeichen bleiben stehen. Die Lösung zeigt der Lösungsteil.
 */
export function zuLuecken(body: string, a: TextAuswahl): string {
  const roh = auswahlRoh(body, a)
  // Schon vorhandene Lücken und Fußnotenmarken bleiben, wie sie sind
  const neu = roh.replace(/\[\[[\s\S]*?\]\]|\[\^[^\]]*\]|([\p{L}\p{N}][\p{L}\p{N}'’-]*)/gu, (ganz, wort?: string) => (wort ? `[[${wort}]]` : ganz))
  return ersetzeAuswahl(body, a, neu)
}

// ---------- Fußnoten

/** Neue Kennung einer Fußnote, eindeutig im Block */
export function neueFussnotenId(block: Pick<TextBlock, 'fussnoten'>): string {
  const vergeben = new Set((block.fussnoten ?? []).map((f) => f.id))
  let n = vergeben.size + 1
  while (vergeben.has(`f${n}`)) n++
  return `f${n}`
}

/** Fußnote an das Ende der Markierung setzen (hinter das letzte Wort, vor Satzzeichen) */
export function fussnoteEinfuegen(block: TextBlock, a: TextAuswahl, f: Omit<Fussnote, 'id'>): string {
  const id = neueFussnotenId(block)
  const roh = auswahlRoh(block.body, a)
  // Leerraum und Satzzeichen am Ende der Markierung stehen hinter der Marke
  const rest = /[\s.,;:!?»“”"')]*$/.exec(roh)?.[0] ?? ''
  const kern = roh.slice(0, roh.length - rest.length)
  block.body = ersetzeAuswahl(block.body, a, `${kern}[^${id}]${rest}`)
  block.fussnoten = [...(block.fussnoten ?? []), { id, ...f }]
  return id
}

// ---------- Vereinfachen

/** Markierung durch die vereinfachte Fassung ersetzen; das Original bleibt als andere Fassung */
export function vereinfachen(block: TextBlock, a: TextAuswahl, neu: string): void {
  if (!block.andereFassung || block.andereFassung.art !== 'original') block.andereFassung = { art: 'original', body: block.body, source: block.source }
  block.body = ersetzeAuswahl(block.body, a, neu.trim())
  block.source = quelleMitVermerk(block.source, 'vereinfacht')
}

/** Zwischen Original und vereinfachter Fassung umschalten */
export function fassungWechseln(block: TextBlock): void {
  const andere = block.andereFassung
  if (!andere) return
  block.andereFassung = { art: andere.art === 'original' ? 'vereinfacht' : 'original', body: block.body, source: block.source }
  block.body = andere.body
  block.source = andere.source
}

// ---------- Sprache der Erklärungen

export interface LerngruppeText {
  fach: string
  fachId: string
  jahrgang: number
  schulform: string
  thema: string
  /** Zielsprache des Fachs (en, fr …), sonst leer */
  zielsprache?: string
  cefr?: CefrLevel | ''
  anrede: OperatorAnrede
  /** Sprache der Arbeitsanweisungen (de oder Zielsprache) */
  aufgabenSprache: string
}

/**
 * Sprache einer Erklärung in der Fußnote – automatisch, im Menü umschaltbar.
 *   - Kein Fremdsprachenfach (oder Latein): Deutsch.
 *   - Deutscher Ausgangstext einer Sprachmittlung: Deutsch.
 *   - Ab Jahrgang 10 oder ab Niveau B1: einsprachig in der Zielsprache (Sek II Englisch → Englisch).
 *   - Sonst (niedrige Jahrgänge): Deutsch.
 */
export function erklaerSprache(g: Pick<LerngruppeText, 'zielsprache' | 'jahrgang' | 'cefr'>, textSprache?: TextBlock['language']): string {
  const ziel = g.zielsprache
  if (!ziel || ziel === 'la' || ziel === 'grc') return 'de'
  if (textSprache === 'de') return 'de'
  const b1 = g.cefr ? CEFR_SCALE.indexOf(g.cefr) >= CEFR_SCALE.indexOf('B1') : false
  return g.jahrgang >= 10 || b1 ? ziel : 'de'
}

/**
 * Sprache einer Worthilfe: Beim deutschen Ausgangstext einer Sprachmittlung die Entsprechung in der
 * Zielsprache („Pfand – deposit"), sonst wie die Fußnote (Übersetzung ins Deutsche bzw. Synonym).
 */
export function worthilfeSprache(g: Pick<LerngruppeText, 'zielsprache' | 'jahrgang' | 'cefr'>, textSprache?: TextBlock['language']): string {
  if (g.zielsprache && g.zielsprache !== 'la' && textSprache === 'de') return g.zielsprache
  return erklaerSprache(g, textSprache)
}

export const SPRACHNAME: Record<string, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch',
  ru: 'Russisch',
  la: 'Latein',
  nl: 'Niederländisch',
  pl: 'Polnisch',
  tr: 'Türkisch'
}

// ---------- Aufgabe mit eingebautem Zitat

/** Anführungszeichen der Sprache; innere Anführungszeichen werden zu halben */
export function zitiere(text: string, sprache: string): string {
  const t = text.trim()
  switch (sprache) {
    case 'de':
      return `„${t.replace(/[„“"]([^„“"]*)[“"]/g, '‚$1‘')}“`
    case 'en':
      return `“${t.replace(/[“"]([^“”"]*)[”"]/g, '‘$1’')}”`
    case 'fr':
      return `« ${t.replace(/[«“"]\s*([^«»“”"]*?)\s*[»”"]/g, '“$1”')} »`
    case 'es':
    case 'it':
    case 'ru':
      return `«${t.replace(/[«“"]([^«»“”"]*)[»”"]/g, '“$1”')}»`
    default:
      return `“${t}”`
  }
}

/** Zeilenangabe in der Sprache der Aufgabe: „Z. 12–14", „l. 5", „ll. 5–7", „l. 3–4" (fr) … */
export function zeilenAngabe(von: number, bis: number, sprache: string): string {
  const mehr = bis > von
  const z = mehr ? `${von}–${bis}` : `${von}`
  switch (sprache) {
    case 'en':
      return `${mehr ? 'll.' : 'l.'} ${z}`
    case 'fr':
    case 'es':
      return `l. ${z}`
    case 'it':
      return `${mehr ? 'rr.' : 'r.'} ${z}`
    case 'ru':
      return `${mehr ? 'строки' : 'строка'} ${z}`
    default:
      return `Z. ${z}`
  }
}

/** Rahmen, wenn die KI das Zitat nicht eingebaut hat – das Zitat bleibt Teil des Satzes */
const ERSATZRAHMEN: Record<string, string> = {
  de: 'die Aussage {ZITAT}',
  en: 'the statement {ZITAT}',
  fr: "l'affirmation {ZITAT}",
  es: 'la afirmación {ZITAT}',
  it: "l'affermazione {ZITAT}",
  ru: 'высказывание {ZITAT}'
}

/** Einleitungen deutscher Nebensätze – vor ihnen steht ein Komma („Erläutern Sie, inwiefern …") */
const NEBENSATZ_DE =
  /^(inwiefern|inwieweit|warum|weshalb|weswegen|wieso|wie|ob|dass|was|welche[nmrs]?|wodurch|wozu|womit|worin|wofür|woran|inwiefern|wann|wo|weil)\b/i

/** Das Zitat für den Satz vorbereiten: ohne äußere Anführungszeichen und ohne Schlusszeichen */
export function zitatKern(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[„“”"«»‚‘’'\s]+|[„“”"«»‚‘’'\s]+$/g, '')
    .replace(/[.,;:]+$/, '')
    .trim()
}

/**
 * Die Arbeitsanweisung mit eingebautem Zitat.
 *
 * Die KI liefert den Operator (Infinitiv) und den RAHMEN der Ergänzung mit dem Platzhalter
 * `{ZITAT}` („inwiefern Shakespeare laut Olk {ZITAT} überschreitet"). Die App setzt daraus den
 * Satz: Imperativ in der Anrede der Lerngruppe und korrekter Stellung (shared/operatoren/satzbau.ts),
 * das Zitat in den Anführungszeichen der Sprache MITTEN im Satz (nie abgesetzt hinter einem
 * Doppelpunkt), dahinter die Zeilenangabe, am Ende der Punkt. Der Operator steht fett.
 */
export function aufgabeMitZitat(p: {
  operator: string
  rahmen: string
  zitat: string
  sprache: string
  anrede: OperatorAnrede
  zeilen?: [number, number]
  /** Verweis auf das Material (z. B. „M{q1}"), wenn das Blatt mehrere Materialien hat */
  material?: string
}): string {
  const sprache = (['de', 'en', 'fr', 'es', 'it', 'ru'].includes(p.sprache) ? p.sprache : 'de') as Listensprache
  const kern = zitatKern(p.zitat)
  let rahmen = (p.rahmen ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '')
  // Hat die KI das Zitat ausgeschrieben statt den Platzhalter zu setzen: zurückführen
  if (!rahmen.includes('{ZITAT}') && kern && rahmen.includes(kern)) {
    const i = rahmen.indexOf(kern)
    const vor = rahmen.slice(0, i).replace(/[„“”"«»‚‘\s]+$/, '')
    const nach = rahmen.slice(i + kern.length).replace(/^[“”"«»‘’\s]+/, '')
    rahmen = `${vor} {ZITAT} ${nach}`.trim()
  }
  if (!rahmen.includes('{ZITAT}')) rahmen = rahmen ? `${rahmen} – ${ERSATZRAHMEN[sprache]}` : ERSATZRAHMEN[sprache]
  // Kein abgesetztes Zitat hinter einem Doppelpunkt; Anführungszeichen setzt die App
  rahmen = rahmen
    .replace(/\s*:\s*\{ZITAT\}/, ' {ZITAT}')
    .replace(/[„“”"«»‚‘’]+\s*\{ZITAT\}\s*[„“”"«»‚‘’]+/g, '{ZITAT}')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // Deutsch: Nebensatz am Anfang mit Komma abtrennen
  if (sprache === 'de' && NEBENSATZ_DE.test(rahmen)) rahmen = `, ${rahmen}`
  const verweis = [p.material, p.zeilen ? zeilenAngabe(p.zeilen[0], p.zeilen[1], sprache) : ''].filter(Boolean).join(', ')
  // Platzhalter statt Zitat und Verweis: Satzzeichen IM Zitat dürfen die Satzklammer nicht stören
  const ZITAT = ''
  const VERWEIS = ''
  const ergaenzung = `${rahmen.replace('{ZITAT}', ZITAT)}${verweis ? ` ${VERWEIS}` : ''}`
  let satz = operatorSatz(p.operator.trim(), ergaenzung, p.anrede, sprache)
  satz = satz.replace(/\s+,/g, ',')
  satz = satz.replace(ZITAT, zitiere(kern, sprache)).replace(VERWEIS, `(${verweis})`)
  // Verweis steht vor dem Satzpunkt, nie hinter einer nachgestellten Verbpartikel allein
  satz = satz.replace(/\s+\.$/, '.')
  // Operator fett (wie in allen Arbeitsanweisungen der App)
  return satz.replace(/^(\p{L}+)/u, '**$1**')
}

/**
 * Zeilen einer Markierung aus den Lagen im Blatt: `oben`/`unten` sind die Abstände der ersten
 * und letzten markierten Zeile vom Beginn des Textkörpers, `zeile` die Zeilenhöhe (alles in
 * derselben Einheit), `start` die Zahl der Zeilen vor diesem Stück (Folgeseite).
 */
export function zeilenAusLage(oben: number, unten: number, zeile: number, start = 0): [number, number] {
  const z = Math.max(1, zeile)
  const von = start + Math.floor(Math.max(0, oben) / z + 0.25) + 1
  const bis = start + Math.max(Math.floor(Math.max(0, unten) / z - 0.25) + 1, von - start)
  return [von, Math.max(von, bis)]
}
