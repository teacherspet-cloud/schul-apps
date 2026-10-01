/**
 * Seitenauswahl für Speichern und Drucken (01.10.2026, Wunsch der Lehrkraft).
 *
 * „Von ursprünglich 9 Seiten nur Seite 1–4 und 6 drucken – dann soll unten nicht ‚Seite 1 von 9'
 * stehen, sondern ‚Seite 1 von 5'." Die Auswahl wird wie ein eigenes Dokument behandelt: Die
 * Seiten werden VOR dem Umrechnen ins PDF ausgewählt, die Seitenzahlen neu gezählt. Ein
 * nachträglicher Schnitt im fertigen PDF ließe „von 9" stehen.
 *
 * Abmachung mit den Programmen, die ihre Seiten selbst setzen (Arbeitsblatt-Familie, Vokabeltest):
 *  - Jede gedruckte Seite ist ein Element mit `data-sa-seite="<teil>"` – teil = blatt | loesung |
 *    material | deckblatt | tafel (bestimmt die Schnellauswahl).
 *  - `data-sa-gruppe`: Seiten mit gemeinsamer Zählung (je Niveaublatt bzw. Testvariante, Schüler-
 *    und Lösungsteil getrennt) – so zählt das Programm schon heute.
 *  - `data-sa-index`: Nummer der Seite in ihrer Gruppe (1-basiert), `data-sa-art` die Art einer
 *    Schlussseite – beides braucht der Word-Export, um dieselben Inhalte auszuwählen.
 *  - Seitenzahl: `<span data-sa-zahl>Seite <span data-sa-nr>3</span> / <span data-sa-von>9</span></span>`.
 *    Bleibt in einer Gruppe nur eine Seite übrig, entfällt die Zahl – wie bei einem einseitigen Blatt.
 *
 * Dokumente ohne diese Marken (Elternbrief, Rückmeldung, Tafelbild-PDF …) tragen keine Seitenzahlen;
 * dort schneidet `seitenPdf.ts` die gewählten Seiten aus dem fertigen PDF – es gibt nichts umzuzählen.
 *
 * Die Verarbeitung arbeitet bewusst auf dem HTML-Text statt auf einem DOM: Sie läuft so gleich im
 * Hauptfenster, auf dem iPad und in den Tests (vitest ohne DOM). Das HTML stammt aus
 * `renderToStaticMarkup` bzw. eigenen Vorlagen – Text und Attributwerte sind dort maskiert.
 */

// ---------- Seitenangaben lesen ----------

export type SeitenAngabe = { ok: true; seiten: number[] } | { ok: false; fehler: string }

/** Striche, die als „bis" gelten: Bindestrich, Gedankenstriche, Minus, „bis" */
const BIS = /\s*(?:[-‐‑‒–—―−]|\bbis\b)\s*/gi

/**
 * Liest Angaben wie „1-4, 6", „1–4 6", „6-" (bis zum Ende) oder „-3" (ab Anfang).
 * Liefert die Seiten aufsteigend und ohne Doppelte – gedruckt wird in der Reihenfolge des Dokuments.
 */
export function leseSeitenAngabe(eingabe: string, anzahl: number): SeitenAngabe {
  const text = eingabe.trim().replace(BIS, '-')
  if (!text) return { ok: false, fehler: 'Keine Seite angegeben – z. B. „1-4, 6".' }
  const teile = text.split(/[\s,;+]+/).filter(Boolean)
  const seiten = new Set<number>()
  for (const teil of teile) {
    const m = /^(\d*)(-?)(\d*)\.?$/.exec(teil)
    if (!m || (!m[1] && !m[3]) || (!m[2] && !m[1])) return { ok: false, fehler: `„${teil}" ist keine Seitenangabe – möglich sind z. B. „1-4, 6" oder „6-".` }
    const von = m[1] ? Number(m[1]) : 1
    const bis = m[2] ? (m[3] ? Number(m[3]) : anzahl) : von
    if (von < 1 || bis < 1) return { ok: false, fehler: 'Seite 0 gibt es nicht – gezählt wird ab 1.' }
    if (von > bis) return { ok: false, fehler: `„${teil}" ist verdreht – gemeint ist wohl „${bis}-${von}".` }
    const zuGross = [von, bis].find((s) => s > anzahl)
    if (zuGross !== undefined)
      return { ok: false, fehler: `Seite ${zuGross} gibt es nicht – ${anzahl === 1 ? 'das Dokument hat nur eine Seite' : `das Dokument hat ${anzahl} Seiten`}.` }
    for (let s = von; s <= bis; s++) seiten.add(s)
  }
  return { ok: true, seiten: [...seiten].sort((a, b) => a - b) }
}

/** Seiten als kurze Angabe: [1, 2, 3, 4, 6] → „1-4, 6" */
export function seitenText(seiten: number[]): string {
  const s = [...new Set(seiten)].sort((a, b) => a - b)
  const teile: string[] = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    teile.push(j > i + 1 ? `${s[i]}-${s[j]}` : j === i + 1 ? `${s[i]}, ${s[j]}` : `${s[i]}`)
    i = j
  }
  return teile.join(', ')
}

/** Alle Seiten 1 … anzahl */
export const alleSeiten = (anzahl: number): number[] => Array.from({ length: anzahl }, (_, i) => i + 1)

// ---------- Marken der Seiten ----------

export type SeitenTeil = 'blatt' | 'loesung' | 'material' | 'deckblatt' | 'tafel'

export interface SeitenMarke {
  /** Wozu die Seite gehört – Grundlage der Schnellauswahl */
  teil?: SeitenTeil | string
  /** Seiten mit gemeinsamer Zählung */
  gruppe?: string
  /** Nummer in der Gruppe (1-basiert) */
  index?: number
  /** Art einer Sonderseite (z. B. hilfekarten, nachweise) */
  art?: string
  /** Trägt die Seite eine Seitenzahl? */
  nummeriert: boolean
}

/** Attribute für die Wurzel einer Seite (React: als Props verteilen; Vorlagen: `attributText`) */
export function seitenAttribute(m: Omit<SeitenMarke, 'nummeriert'>): Record<string, string> {
  const a: Record<string, string> = { 'data-sa-seite': m.teil ?? 'blatt' }
  if (m.gruppe !== undefined) a['data-sa-gruppe'] = m.gruppe
  if (m.index !== undefined) a['data-sa-index'] = String(m.index)
  if (m.art) a['data-sa-art'] = m.art
  return a
}

const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unescAttr = (s: string): string => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// ---------- HTML-Abtaster ----------

interface Tag {
  start: number
  ende: number
  name: string
  schliessend: boolean
  attrText: string
}

/** Tags in Reihenfolge; Kommentare, <script>- und <style>-Inhalte werden übersprungen */
function* tags(html: string, ab = 0, bis = html.length): Generator<Tag> {
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  re.lastIndex = ab
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && m.index < bis) {
    if (!m[2]) continue
    const tag: Tag = { start: m.index, ende: m.index + m[0].length, name: m[2].toLowerCase(), schliessend: m[1] === '/', attrText: m[3] }
    yield tag
    if (!tag.schliessend && (tag.name === 'script' || tag.name === 'style')) {
      const zu = html.toLowerCase().indexOf(`</${tag.name}`, tag.ende)
      if (zu < 0) return
      re.lastIndex = zu
    }
  }
}

const LEER = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

/** Ende (Index hinter dem schließenden Tag) des Elements, das mit `offen` beginnt */
function elementEnde(html: string, offen: Tag): number {
  if (LEER.has(offen.name) || /\/\s*$/.test(offen.attrText)) return offen.ende
  let tiefe = 1
  for (const t of tags(html, offen.ende)) {
    if (t.name !== offen.name) continue
    if (t.schliessend) tiefe--
    else if (!/\/\s*$/.test(t.attrText)) tiefe++
    if (tiefe === 0) return t.ende
  }
  return html.length
}

function attribut(attrText: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?(?=\\s|/|$)`, 'i').exec(attrText)
  if (!m) return undefined
  return unescAttr(m[1] ?? m[2] ?? m[3] ?? '')
}

interface SeiteImHtml {
  start: number
  ende: number
  marke: SeitenMarke
}

/** Die äußersten Seiten-Elemente (Vorschauen im Deckblatt enthalten weitere – die zählen nicht) */
function seitenImHtml(html: string): SeiteImHtml[] {
  const aus: SeiteImHtml[] = []
  let weiterAb = 0
  for (const t of tags(html)) {
    if (t.start < weiterAb || t.schliessend) continue
    const teil = attribut(t.attrText, 'data-sa-seite')
    if (teil === undefined) continue
    const ende = elementEnde(html, t)
    const index = attribut(t.attrText, 'data-sa-index')
    const inhalt = html.slice(t.ende, ende)
    aus.push({
      start: t.start,
      ende,
      marke: {
        teil: teil || 'blatt',
        gruppe: attribut(t.attrText, 'data-sa-gruppe') ?? '',
        ...(index ? { index: Number(index) } : {}),
        ...(attribut(t.attrText, 'data-sa-art') ? { art: attribut(t.attrText, 'data-sa-art') } : {}),
        // Das Deckblatt zeigt verkleinerte Seiten MIT deren Zahlen – es selbst trägt keine
        nummeriert: teil !== 'deckblatt' && /\sdata-sa-nr\b/.test(inhalt)
      }
    })
    weiterAb = ende
  }
  return aus
}

/** Die Seiten eines Druck-HTML mit ihren Marken; leer, wenn das Dokument keine Marken trägt */
export function seitenMarken(html: string): SeitenMarke[] {
  return seitenImHtml(html).map((s) => s.marke)
}

/**
 * Setzt Marken an die obersten Elemente eines HTML-Stücks (z. B. alle Seiten, die `SheetPages`
 * für EIN Blatt erzeugt). `marke(i)` bekommt den Index des Elements im Stück.
 */
export function markiereSeiten(stueck: string, marke: (i: number, anzahl: number) => Omit<SeitenMarke, 'nummeriert'>): string {
  const wurzeln: Tag[] = []
  let weiterAb = 0
  for (const t of tags(stueck)) {
    if (t.start < weiterAb || t.schliessend) continue
    wurzeln.push(t)
    weiterAb = elementEnde(stueck, t)
  }
  let aus = ''
  let pos = 0
  wurzeln.forEach((t, i) => {
    const a = seitenAttribute(marke(i, wurzeln.length))
    // Vorhandene Marken (z. B. aus der Seite selbst) bleiben, die neuen ergänzen sie
    const neu = Object.entries(a)
      .filter(([k]) => attribut(t.attrText, k) === undefined)
      .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
      .join('')
    const kopfEnde = t.ende - 1 - (/\/\s*$/.test(t.attrText) ? t.attrText.length - t.attrText.replace(/\/\s*$/, '').length : 0)
    aus += stueck.slice(pos, kopfEnde) + neu
    pos = kopfEnde
  })
  return aus + stueck.slice(pos)
}

// ---------- Neu zählen ----------

/** Neue Seitenzahlen der gewählten Seiten: je Gruppe 1 … n, n = gewählte nummerierte Seiten der Gruppe */
export function neueNummern(marken: SeitenMarke[], seiten: number[]): Map<number, { nr: number; von: number }> {
  const gewaehlt = [...new Set(seiten)].filter((s) => s >= 1 && s <= marken.length).sort((a, b) => a - b)
  const jeGruppe = new Map<string, number[]>()
  for (const s of gewaehlt) {
    const m = marken[s - 1]
    if (!m.nummeriert) continue
    const g = m.gruppe ?? ''
    jeGruppe.set(g, [...(jeGruppe.get(g) ?? []), s])
  }
  const aus = new Map<number, { nr: number; von: number }>()
  for (const liste of jeGruppe.values()) liste.forEach((s, i) => aus.set(s, { nr: i + 1, von: liste.length }))
  return aus
}

/** Inhalt eines Elements (per Marken-Attribut gefunden) ersetzen */
function ersetzeInhalt(html: string, attr: string, neu: (alt: string) => string): string {
  let aus = ''
  let pos = 0
  let weiterAb = 0
  for (const t of tags(html)) {
    if (t.start < weiterAb || t.schliessend || attribut(t.attrText, attr) === undefined) continue
    const ende = elementEnde(html, t)
    const zu = html.lastIndexOf('</', ende - 1)
    aus += html.slice(pos, t.ende) + neu(html.slice(t.ende, zu))
    pos = zu
    weiterAb = ende
  }
  return aus + html.slice(pos)
}

/** Eine Seite neu nummerieren: „Seite 3 / 9" → „Seite 1 / 5"; bei nur einer Seite ohne Zahl */
function nummeriere(seite: string, nr: { nr: number; von: number } | undefined): string {
  if (!nr) return seite
  if (nr.von <= 1) return ersetzeInhalt(seite, 'data-sa-zahl', () => '')
  return ersetzeInhalt(ersetzeInhalt(seite, 'data-sa-nr', () => String(nr.nr)), 'data-sa-von', () => String(nr.von))
}

/**
 * Nur die gewählten Seiten (1-basiert) behalten und neu zählen. Trägt das HTML keine Marken,
 * kommt es unverändert zurück – dann schneidet `seitenPdf.ts` im fertigen PDF.
 */
export function waehleSeitenImHtml(html: string, seiten: number[]): string {
  const liste = seitenImHtml(html)
  if (!liste.length) return html
  const gewaehlt = new Set(seiten)
  const nummern = neueNummern(
    liste.map((s) => s.marke),
    seiten
  )
  let aus = ''
  let pos = 0
  liste.forEach((s, i) => {
    aus += html.slice(pos, s.start)
    if (gewaehlt.has(i + 1)) aus += nummeriere(html.slice(s.start, s.ende), nummern.get(i + 1))
    pos = s.ende
  })
  return aus + html.slice(pos)
}

// ---------- Schnellauswahl ----------

export interface SchnellWahl {
  id: string
  label: string
  seiten: number[]
}

const TEIL_LABEL: Record<string, string> = {
  blatt: 'Nur Schülerseiten',
  loesung: 'Nur Lösungen',
  material: 'Nur Material',
  deckblatt: 'Nur Deckblatt',
  tafel: 'Nur Tafelbild'
}

/**
 * Schnellauswahl je nach Dokument: „Alle", dann je Teil, den es gibt (nur wenn es mehr als einen
 * Teil gibt – sonst wäre „Nur Schülerseiten" dasselbe wie „Alle"), zuletzt „Aktuelle Seite".
 * `loesungsBegriff`: z. B. „Erwartungshorizont" bei der Klassenarbeit.
 */
export function schnellAuswahl(teile: (string | undefined)[], opt: { aktuelleSeite?: number; loesungsBegriff?: string } = {}): SchnellWahl[] {
  const aus: SchnellWahl[] = [{ id: 'alle', label: 'Alle', seiten: alleSeiten(teile.length) }]
  const vorhanden = [...new Set(teile.map((t) => t ?? ''))].filter((t) => t in TEIL_LABEL)
  // Nur anbieten, wenn es außer diesem Teil noch etwas anderes gibt
  if (vorhanden.length > 1 || (vorhanden.length === 1 && teile.some((t) => !t || !(t in TEIL_LABEL))))
    for (const teil of Object.keys(TEIL_LABEL)) {
      if (!vorhanden.includes(teil)) continue
      const label = teil === 'loesung' && opt.loesungsBegriff ? `Nur ${opt.loesungsBegriff}` : TEIL_LABEL[teil]
      aus.push({ id: teil, label, seiten: teile.flatMap((t, i) => (t === teil ? [i + 1] : [])) })
    }
  if (opt.aktuelleSeite && opt.aktuelleSeite <= teile.length) aus.push({ id: 'aktuell', label: 'Aktuelle Seite', seiten: [opt.aktuelleSeite] })
  return aus
}

/** Kurzer Satz unter der Auswahl: was herauskommt und wie gezählt wird */
export function auswahlHinweis(seiten: number[], anzahl: number): string {
  const n = seiten.length
  if (!n) return 'Keine Seite gewählt.'
  if (n === anzahl) return `Alle ${anzahl} ${anzahl === 1 ? 'Seite' : 'Seiten'}.`
  return `${n} von ${anzahl} Seiten (${seitenText(seiten)}). Die Seitenzahlen werden für die Auswahl neu gezählt.`
}
