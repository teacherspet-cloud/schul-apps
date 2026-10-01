/**
 * Textauswahl-Menü der Materialtexte (01.10.2026) – Oberfläche.
 *
 * Wort oder Passage im Material markieren, Rechtsklick (iPad: langer Druck auf das Wort bzw. die
 * Markierung) → Kreismenü (Vorbild: shared/components/Kreismenue.tsx) mit den Aktionen aus
 * didactics/textauswahl.ts. Gilt überall, wo Materialtexte im Blatt bearbeitet werden
 * (Arbeitsblatt, Klassenarbeit, Lernzielkontrolle, Grammatiktest): alle nutzen diesen Baustein.
 *
 * - Umschalt + Rechtsklick und der Eintrag „Standardmenü" lassen das gewohnte Bearbeiten zu.
 * - Jede Änderung ist EIN Rückgängig-Schritt (Strg+Z) – sie läuft über `update` des Blattes.
 * - Die KI bekommt nur Fach, Jahrgang, Schulform, Thema und den Textausschnitt, keine Personendaten.
 */
import { Portal } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ScaffoldBlock, TaskBlock, TextBlock, WsBlock } from '../../model/types'
import { newBlock } from '../../model/factory'
import { isEditMode, useWs } from '../WsContext'
import { kreisLage, kreisRadius } from '../../../../shared/components/Kreismenue'
import { enumOf, int, obj, str } from '../../../../shared/aiSchema'
import { plainText } from '../../../../shared/richtext/parse'
import { touchAktiv } from '../../../../shared/touch/touchModus'
import { begriffImText, ohneFussnotenMarken } from '../../didactics/anmerkungen'
import {
  absaetzeVon,
  aufgabeMitZitat,
  auslassen,
  erklaerSprache,
  findeImRohtext,
  formatiere,
  fussnoteEinfuegen,
  SPRACHNAME,
  vereinfachen,
  worthilfeSprache,
  zaehleVorkommen,
  zeilenAusLage,
  zuLuecken,
  type Formatierung,
  type LerngruppeText,
  type TextAuswahl
} from '../../didactics/textauswahl'
import '../../../../shared/components/kreismenue.css'
import './textauswahl.css'

/** Eine Seite der Markierung: sichtbarer Text und das wievielte Vorkommen im Absatz */
interface Rand {
  absatz: number
  gesucht: string
  vorkommen: number
}

/** Die Markierung, wie sie das Menü kennt – aufgelöst wird erst beim Ausführen (gegen den aktuellen Stand) */
export interface Markierung {
  von: Rand
  bis: Rand
  /** sichtbarer Text der ganzen Markierung */
  text: string
  /** Zeilen im Blatt (nur bei Zeilenzählung) */
  zeilen?: [number, number]
  x: number
  y: number
  /** aus einem Eingabefeld (dann Ausschneiden/Einfügen im Standardmenü) */
  feld?: HTMLTextAreaElement
}

/** Die Markierung im aktuellen Rohtext suchen */
export function loeseMarkierung(body: string, m: Pick<Markierung, 'von' | 'bis'>): TextAuswahl | null {
  const p = absaetzeVon(body)
  const a = p[m.von.absatz]
  const b = p[m.bis.absatz]
  if (a === undefined || b === undefined) return null
  if (m.von.absatz === m.bis.absatz) {
    const t = findeImRohtext(a, m.von.gesucht, m.von.vorkommen)
    return t ? { von: { absatz: m.von.absatz, index: t[0] }, bis: { absatz: m.bis.absatz, index: t[1] } } : null
  }
  const s = findeImRohtext(a, m.von.gesucht, m.von.vorkommen)
  const e = findeImRohtext(b, m.bis.gesucht, m.bis.vorkommen)
  return s && e ? { von: { absatz: m.von.absatz, index: s[0] }, bis: { absatz: m.bis.absatz, index: e[1] } } : null
}

// ---------- Markierung aus dem Blatt lesen

/** Sichtbarer Text eines Bereichs – ohne Fußnotenziffern (sup) und Lücken */
function sichtbarerText(range: Range, wurzel: HTMLElement): string {
  let out = ''
  const gang = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT)
  for (let n = gang.nextNode() as Text | null; n; n = gang.nextNode() as Text | null) {
    if (!range.intersectsNode(n)) continue
    if (n.parentElement?.closest('sup, .ws-gap, .rt-math')) continue
    const von = n === range.startContainer ? range.startOffset : 0
    const bis = n === range.endContainer ? range.endOffset : n.data.length
    out += n.data.slice(von, bis)
  }
  return out
}

function absatzVon(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : (node?.parentElement ?? null)
  return el?.closest<HTMLElement>('[data-absatz]') ?? null
}

/** Rand einer Markierung im Absatz `el` zwischen den Stellen [start, ende) */
function randAus(el: HTMLElement, start: [Node, number] | null, ende: [Node, number] | null): Rand {
  const r = document.createRange()
  r.selectNodeContents(el)
  if (start) r.setStart(start[0], start[1])
  if (ende) r.setEnd(ende[0], ende[1])
  const gesucht = sichtbarerText(r, el)
  const davor = document.createRange()
  davor.selectNodeContents(el)
  if (start) davor.setEnd(start[0], start[1])
  else davor.collapse(true)
  return { absatz: Number(el.dataset.absatz), gesucht, vorkommen: zaehleVorkommen(sichtbarerText(davor, el), gesucht) }
}

/** Zeilen der Markierung aus ihrer Lage (Zeilenzählung wie die Nummern am Rand) */
function zeilenVon(koerper: HTMLElement, rects: DOMRect[], zeilenHoehe: number): [number, number] | undefined {
  if (!rects.length) return undefined
  const box = koerper.getBoundingClientRect()
  const massstab = koerper.offsetHeight ? box.height / koerper.offsetHeight : 1
  const start = Number(koerper.dataset.zeileStart ?? 0)
  const oben = (rects[0].top - box.top) / massstab
  const unten = (rects[rects.length - 1].bottom - box.top) / massstab
  return zeilenAusLage(oben, unten, zeilenHoehe, start)
}

/** Lage eines Zeichens im Eingabefeld (Spiegel-Element mit derselben Schrift) */
function zeichenOben(feld: HTMLTextAreaElement, index: number): number {
  const stil = getComputedStyle(feld)
  const spiegel = document.createElement('div')
  for (const k of [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'paddingTop',
    'paddingLeft',
    'paddingRight',
    'borderTopWidth',
    'boxSizing'
  ] as const)
    spiegel.style[k] = stil[k]
  spiegel.style.width = `${feld.clientWidth}px`
  spiegel.style.whiteSpace = 'pre-wrap'
  spiegel.style.wordWrap = 'break-word'
  spiegel.style.position = 'absolute'
  spiegel.style.visibility = 'hidden'
  spiegel.textContent = feld.value.slice(0, index)
  const marke = document.createElement('span')
  marke.textContent = '​'
  spiegel.appendChild(marke)
  document.body.appendChild(spiegel)
  const oben = marke.offsetTop
  spiegel.remove()
  return oben
}

/** Markierung im Blatt (Auswahl oder Eingabefeld) lesen; null, wenn nichts im Text markiert ist */
export function markierungLesen(koerper: HTMLElement, x: number, y: number, zeilenzaehlung: boolean): Markierung | null {
  const aktiv = document.activeElement
  if (aktiv instanceof HTMLTextAreaElement && koerper.contains(aktiv) && aktiv.selectionEnd > aktiv.selectionStart) {
    const absatz = absatzVon(aktiv)
    if (!absatz) return null
    const s = aktiv.selectionStart
    const e = aktiv.selectionEnd
    const gesucht = aktiv.value.slice(s, e)
    const rand: Rand = { absatz: Number(absatz.dataset.absatz), gesucht, vorkommen: zaehleVorkommen(aktiv.value.slice(0, s), gesucht) }
    let zeilen: [number, number] | undefined
    if (zeilenzaehlung) {
      const box = koerper.getBoundingClientRect()
      const massstab = koerper.offsetHeight ? box.height / koerper.offsetHeight : 1
      const feldOben = (aktiv.getBoundingClientRect().top - box.top) / massstab
      const lh = parseFloat(getComputedStyle(aktiv).lineHeight) || 16
      const z = parseFloat(getComputedStyle(absatz).lineHeight) || lh
      const vor = Math.round(feldOben / z)
      const start = Number(koerper.dataset.zeileStart ?? 0) + vor
      zeilen = zeilenAusLage(zeichenOben(aktiv, s), zeichenOben(aktiv, e) + lh * 0.8, lh, start)
    }
    return { von: rand, bis: rand, text: plainText(gesucht).trim(), zeilen, x, y, feld: aktiv }
  }
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null
  const range = sel.getRangeAt(0)
  const a = absatzVon(range.startContainer)
  const b = absatzVon(range.endContainer)
  if (!a || !b || !koerper.contains(a) || !koerper.contains(b)) return null
  const gleich = a === b
  const von = randAus(a, [range.startContainer, range.startOffset], gleich ? [range.endContainer, range.endOffset] : null)
  const bis = gleich ? von : randAus(b, null, [range.endContainer, range.endOffset])
  if (!von.gesucht.trim() || !bis.gesucht.trim()) return null
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
  const zeilenHoehe = parseFloat(getComputedStyle(a).lineHeight) || 16
  return {
    von,
    bis,
    text: sichtbarerText(range, koerper).replace(/\s+/g, ' ').trim(),
    zeilen: zeilenzaehlung ? zeilenVon(koerper, rects, zeilenHoehe) : undefined,
    x,
    y
  }
}

/** Langer Druck ohne Markierung: das Wort unter dem Finger markieren */
function wortAmPunkt(x: number, y: number): boolean {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
  let knoten: Node | null = null
  let stelle = 0
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    if (p) [knoten, stelle] = [p.offsetNode, p.offset]
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y)
    if (r) [knoten, stelle] = [r.startContainer, r.startOffset]
  }
  if (!(knoten instanceof Text)) return false
  const t = knoten.data
  let s = stelle
  let e = stelle
  const buchstabe = /[\p{L}\p{N}'’-]/u
  while (s > 0 && buchstabe.test(t[s - 1])) s--
  while (e < t.length && buchstabe.test(t[e])) e++
  if (e <= s) return false
  const r = document.createRange()
  r.setStart(knoten, s)
  r.setEnd(knoten, e)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(r)
  return true
}

// ---------- KI

type Ki = <T>(req: { system: string; user: string; schemaName: string; schema: Record<string, unknown> }) => Promise<T>
const ki: Ki = (req) => window.api.ai.structured(req)

const systemFuer = (g: LerngruppeText): string =>
  [
    `Du hilfst einer Lehrkraft, einen Materialtext für den Unterricht aufzubereiten: Fach ${g.fach}, Jahrgang ${g.jahrgang}${g.schulform ? `, ${g.schulform}` : ''}${g.cefr ? `, Niveau ${g.cefr}` : ''}.`,
    g.thema ? `Thema der Einheit: ${g.thema}.` : '',
    'Antworte knapp und sachlich richtig, ohne Anrede und ohne Kommentar.'
  ]
    .filter(Boolean)
    .join(' ')

/** Der Satz bzw. Abschnitt um die Markierung – Zusammenhang für die Bedeutung */
function zusammenhang(block: TextBlock, m: Markierung): string {
  const p = absaetzeVon(ohneFussnotenMarken(block.body))
  const t = plainText(p.slice(m.von.absatz, m.bis.absatz + 1).join('\n\n')).replace(/\s+/g, ' ')
  if (t.length <= 900) return t
  const i = Math.max(0, t.indexOf(m.text.slice(0, 40)))
  return `… ${t.slice(Math.max(0, i - 400), i + m.text.length + 400)} …`
}

const sprachname = (code: string): string => SPRACHNAME[code] ?? code

// ---------- Menü

type Aktion =
  | 'fussnote'
  | 'worthilfe'
  | 'vereinfachen'
  | 'auslassen'
  | 'aufgabe'
  | 'hervorheben'
  | 'luecke'
  | 'woerter'
  | 'bild'
  | 'standard'
  | `format:${Formatierung}`
  | 'wortspeicher'
  | 'vokabelliste'
  | 'kopieren'
  | 'ausschneiden'
  | 'einfuegen'
  | 'zurueck'

interface Eintrag {
  id: Aktion
  label: string
  titel?: string
  aus?: boolean
}

const HAUPT: Eintrag[] = [
  { id: 'fussnote', label: 'In Fußnote erklären', titel: 'Die KI erklärt die Stelle; hochgestellte Ziffer im Text, Erklärung unter dem Material' },
  { id: 'worthilfe', label: 'Worthilfe/Annotation', titel: 'Übersetzung bzw. Synonym in die Worthilfen unter dem Text' },
  { id: 'vereinfachen', label: 'Einfacher formulieren', titel: 'Für schwächere Lernende; das Original bleibt als Fassung erhalten' },
  { id: 'auslassen', label: 'Auslassen […]', titel: 'Stelle durch […] ersetzen; Quelle „(gekürzt)"' },
  { id: 'aufgabe', label: 'Aufgabe dazu erzeugen', titel: 'Neue Aufgabe mit eingebautem Zitat und Zeilenangabe' },
  { id: 'hervorheben', label: 'Hervorheben …', titel: 'Fett, kursiv, unterstrichen, farbig markiert' },
  { id: 'luecke', label: 'In Lücke umwandeln', titel: 'Jedes markierte Wort wird eine Lücke; die Lösung steht im Lösungsteil' },
  { id: 'woerter', label: 'In Wortspeicher/Vokabelliste …' },
  { id: 'bild', label: 'Bild/Erklärgrafik dazu', titel: 'Kleine Erklärgrafik der Bild-KI (als KI-Bild gekennzeichnet) an der Fußnote' },
  { id: 'standard', label: 'Standardmenü …', titel: 'Kopieren, Ausschneiden, Einfügen – oder Umschalt + Rechtsklick' }
]

export function TextAuswahlMenue({
  block,
  markierung,
  onSchliessen
}: {
  block: TextBlock
  markierung: Markierung
  onSchliessen: () => void
}): React.JSX.Element | null {
  const ctx = useWs()
  const g = ctx.lerngruppeText
  const [ebene, setEbene] = useState<'haupt' | 'format' | 'woerter' | 'standard'>('haupt')
  const autoSprache = g ? erklaerSprache(g, block.language) : 'de'
  const [sprache, setSprache] = useState(autoSprache)
  const ersterRef = useRef<HTMLButtonElement>(null)
  const [offen, setOffen] = useState(false)
  useLayoutEffect(() => {
    ersterRef.current?.focus({ preventScroll: true })
    const t = requestAnimationFrame(() => setOffen(true))
    return () => cancelAnimationFrame(t)
  }, [ebene])
  useEffect(() => {
    const taste = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onSchliessen()
      }
    }
    window.addEventListener('keydown', taste, true)
    return () => window.removeEventListener('keydown', taste, true)
  }, [onSchliessen])

  const zielsprache = g?.zielsprache && g.zielsprache !== 'la' ? g.zielsprache : undefined
  const eintraege: Eintrag[] =
    ebene === 'format'
      ? [
          { id: 'format:fett', label: 'Fett' },
          { id: 'format:kursiv', label: 'Kursiv' },
          { id: 'format:unterstrichen', label: 'Unterstreichen' },
          { id: 'format:markiert', label: 'Farbig markieren' },
          { id: 'zurueck', label: '← Zurück' }
        ]
      : ebene === 'woerter'
        ? [
            { id: 'wortspeicher', label: 'In den Wortspeicher', titel: 'Wortspeicher des Blattes (wird bei Bedarf angelegt)' },
            {
              id: 'vokabelliste',
              label: 'In die Vokabelliste',
              titel: zielsprache ? 'Mit Übersetzung der KI in die Vokabellisten (Strg+9)' : 'Nur in Fremdsprachenfächern',
              aus: !zielsprache
            },
            { id: 'zurueck', label: '← Zurück' }
          ]
        : ebene === 'standard'
          ? [
              { id: 'kopieren', label: 'Kopieren' },
              { id: 'ausschneiden', label: 'Ausschneiden', aus: !markierung.feld },
              { id: 'einfuegen', label: 'Einfügen', aus: !markierung.feld },
              { id: 'zurueck', label: '← Zurück' }
            ]
          : HAUPT.map((e) => (e.id === 'aufgabe' && !ctx.einfuegenNach ? { ...e, aus: true, titel: 'Hier lassen sich keine Bausteine einfügen' } : e))

  const liste = typeof window !== 'undefined' && window.innerWidth < 640
  const radius = kreisRadius(eintraege.length)
  const breite = 196
  const rand = radius + breite / 2 + 8
  const x = Math.min(Math.max(markierung.x, rand), Math.max(rand, window.innerWidth - rand))
  const y = Math.min(Math.max(markierung.y, radius + 30), Math.max(radius + 30, window.innerHeight - radius - 30))

  const waehle = (id: Aktion): void => {
    if (id === 'hervorheben') return setEbene('format')
    if (id === 'woerter') return setEbene('woerter')
    if (id === 'standard') return setEbene('standard')
    if (id === 'zurueck') return setEbene('haupt')
    onSchliessen()
    void ausfuehren(id, block, markierung, ctx, sprache)
  }

  const kurz = markierung.text.length > 28 ? `${markierung.text.slice(0, 26)}…` : markierung.text
  return (
    <Portal>
      <div className="kreismenue-schleier" onMouseDown={onSchliessen} onContextMenu={(e) => e.preventDefault()} />
      <div
        className={`kreismenue textmenue ${liste ? 'textmenue-liste' : ''} ${offen ? 'kreismenue-offen' : ''}`}
        style={liste ? undefined : { left: x, top: y }}
        role="menu"
        aria-label="Aktionen zur markierten Textstelle"
        data-textmenue
      >
        {!liste && (
          <svg className="kreismenue-ring" width={radius * 2} height={radius * 2} style={{ left: -radius, top: -radius }} aria-hidden>
            <circle cx={radius} cy={radius} r={radius - 1} />
          </svg>
        )}
        {eintraege.map((e, i) => {
          const lage = kreisLage(i, eintraege.length, radius)
          return (
            <button
              key={e.id}
              ref={i === 0 ? ersterRef : undefined}
              type="button"
              role="menuitem"
              title={e.titel}
              disabled={e.aus}
              data-textaktion={e.id}
              className="kreismenue-eintrag textmenue-eintrag"
              style={
                liste
                  ? undefined
                  : { width: breite, transform: offen ? `translate(calc(${lage.x}px - 50%), calc(${lage.y}px - 50%))` : 'translate(-50%, -50%) scale(0.4)' }
              }
              onClick={() => waehle(e.id)}
            >
              <span>{e.label}</span>
            </button>
          )
        })}
        <div className="textmenue-mitte">
          <span className="textmenue-wort" title={markierung.text}>
            „{kurz}“
          </span>
          {zielsprache && ebene === 'haupt' && (
            <button
              type="button"
              className="textmenue-sprache"
              data-erklaersprache={sprache}
              title="Sprache der Erklärung in Fußnote und Worthilfe umschalten"
              onClick={() => setSprache((s) => (s === 'de' ? zielsprache : 'de'))}
            >
              Erklärung: {sprachname(sprache)}
            </button>
          )}
        </div>
      </div>
    </Portal>
  )
}

// ---------- Aktionen

type Ctx = ReturnType<typeof useWs>

/** Rückmeldung während eines KI-Auftrags */
function laeuft(titel: string): { fertig: (text: string) => void; fehler: (e: unknown) => void } {
  const id = `textauswahl-${Date.now()}`
  notifications.show({ id, loading: true, title: titel, message: 'Die KI arbeitet …', autoClose: false, withCloseButton: false })
  return {
    fertig: (text) => notifications.update({ id, loading: false, title: titel, message: text, autoClose: 3500, withCloseButton: true }),
    fehler: (e) =>
      notifications.update({
        id,
        loading: false,
        color: 'red',
        title: `${titel} – nicht möglich`,
        message: e instanceof Error ? e.message : String(e),
        autoClose: 8000,
        withCloseButton: true
      })
  }
}

/** Änderung am Materialtext gegen den AKTUELLEN Stand – Markierung dort neu suchen */
function amText(ctx: Ctx, block: TextBlock, m: Markierung, fn: (d: TextBlock, a: TextAuswahl) => void): boolean {
  let ok = false
  ctx.update?.(block.id, (d) => {
    if (d.type !== 'text') return
    const a = loeseMarkierung(d.body, m)
    if (!a) return
    fn(d, a)
    ok = true
  })
  if (!ok)
    notifications.show({
      color: 'orange',
      title: 'Textstelle nicht gefunden',
      message: 'Die markierte Stelle hat sich inzwischen geändert – bitte neu markieren.'
    })
  return ok
}

/** Wo eine neue Aufgabe hinkommt: hinter das Material bzw. hinter die Aufgaben, die direkt folgen */
function ankerFuerAufgabe(bloecke: WsBlock[], materialId: string): string {
  const i = bloecke.findIndex((b) => b.id === materialId)
  if (i < 0) return materialId
  let k = i
  while (bloecke[k + 1]?.type === 'task' || bloecke[k + 1]?.type === 'workspace') k++
  return bloecke[k].id
}

async function ausfuehren(id: Aktion, block: TextBlock, m: Markierung, ctx: Ctx, sprache: string): Promise<void> {
  const g = ctx.lerngruppeText
  const sys = g ? systemFuer(g) : 'Du hilfst einer Lehrkraft bei einem Materialtext. Antworte knapp, ohne Anrede.'
  const textSprache = block.language === 'de' || !g?.zielsprache ? 'de' : g.zielsprache
  const stelle = `Markierte Stelle: „${m.text}"\nZusammenhang: ${zusammenhang(block, m)}`
  switch (id) {
    case 'auslassen':
      amText(ctx, block, m, (d, a) => auslassen(d, a))
      return
    case 'luecke':
      amText(ctx, block, m, (d, a) => (d.body = zuLuecken(d.body, a)))
      return
    case 'format:fett':
    case 'format:kursiv':
    case 'format:unterstrichen':
    case 'format:markiert':
      amText(ctx, block, m, (d, a) => (d.body = formatiere(d.body, a, id.slice(7) as Formatierung)))
      return
    case 'kopieren':
      await navigator.clipboard?.writeText(m.feld ? m.feld.value.slice(m.feld.selectionStart, m.feld.selectionEnd) : m.text).catch(() => undefined)
      return
    case 'ausschneiden':
    case 'einfuegen': {
      const f = m.feld
      if (!f) return
      f.focus()
      if (id === 'ausschneiden') {
        await navigator.clipboard?.writeText(f.value.slice(f.selectionStart, f.selectionEnd)).catch(() => undefined)
        f.setRangeText('', f.selectionStart, f.selectionEnd, 'end')
      } else {
        const t = await navigator.clipboard?.readText().catch(() => '')
        if (t) f.setRangeText(t, f.selectionStart, f.selectionEnd, 'end')
      }
      f.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    case 'wortspeicher': {
      const wort = m.text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      if (!wort) return
      const speicher = ctx.blattBausteine?.find((b): b is ScaffoldBlock => b.type === 'scaffold' && b.variant === 'wortspeicher')
      if (speicher)
        ctx.update?.(speicher.id, (d) => {
          if (d.type !== 'scaffold') return
          if (!d.items.some((x) => x.trim().toLocaleLowerCase() === wort.toLocaleLowerCase())) d.items = [...d.items.filter((x) => x.trim()), wort]
        })
      else if (ctx.einfuegenNach) {
        const neu = newBlock('scaffold') as ScaffoldBlock
        ctx.einfuegenNach(block.id, { ...neu, variant: 'wortspeicher', title: 'Wortspeicher', items: [wort] })
      }
      return
    }
    case 'vokabelliste': {
      if (!g?.zielsprache) return
      const r = laeuft('In die Vokabelliste')
      try {
        const a = await ki<{ grundform: string; uebersetzung: string; wortart: string }>({
          system: sys,
          user: `${stelle}\n\nGib die Grundform (Wörterbuchform) des markierten Ausdrucks in der Sprache des Textes, die deutsche Übersetzung in DIESER Bedeutung und die Wortart (kurz, deutsch).`,
          schemaName: 'textauswahl_vokabel',
          schema: obj({ grundform: str('Grundform in der Zielsprache'), uebersetzung: str('deutsche Übersetzung'), wortart: str('Wortart, z. B. Verb, Nomen') })
        })
        const listeId = `materialwoerter-${g.zielsprache}`
        const listen = await window.api.library.list()
        const alt = listen.find((l) => l.id === listeId)
        const eintrag = { term: a.grundform.trim() || m.text, translation: a.uebersetzung.trim(), ...(a.wortart?.trim() ? { pos: a.wortart.trim() } : {}) }
        const eintraege = [...(alt?.entries ?? []).filter((e) => e.term.toLocaleLowerCase() !== eintrag.term.toLocaleLowerCase()), eintrag]
        await window.api.library.save({
          id: listeId,
          name: alt?.name ?? `Wörter aus Materialtexten (${sprachname(g.zielsprache)})`,
          updatedAt: '',
          language: g.zielsprache,
          grade: g.jahrgang,
          source: 'Materialtexte',
          entries: eintraege
        })
        r.fertig(
          `„${eintrag.term} – ${eintrag.translation}“ steht in der Vokabelliste „${alt?.name ?? `Wörter aus Materialtexten (${sprachname(g.zielsprache)})`}“.`
        )
      } catch (e) {
        r.fehler(e)
      }
      return
    }
    case 'fussnote': {
      const r = laeuft('In Fußnote erklären')
      try {
        const einsprachig = sprache !== 'de' && sprache === g?.zielsprache
        const a = await ki<{ wort: string; erklaerung: string }>({
          system: sys,
          user: [
            stelle,
            `Erkläre den markierten Ausdruck so, wie er HIER gemeint ist (Bedeutung im Zusammenhang), für Lernende dieser Lerngruppe – höchstens 15 Wörter, auf ${sprachname(sprache)}.`,
            einsprachig
              ? `Einsprachig auf ${sprachname(sprache)} mit einfachen Wörtern (Abkürzungen wie sth./sb. sind erlaubt), keine Übersetzung ins Deutsche.`
              : textSprache !== 'de'
                ? 'Auf Deutsch: Übersetzung bzw. kurze Erklärung.'
                : '',
            `Im Feld wort steht die Grundform des Ausdrucks in der Sprache des Textes${textSprache === 'en' ? ' (Verben mit „to")' : ''}.`
          ]
            .filter(Boolean)
            .join('\n'),
          schemaName: 'textauswahl_fussnote',
          schema: obj({ wort: str('Grundform des markierten Ausdrucks'), erklaerung: str('kurze Erklärung') })
        })
        const ok = amText(ctx, block, m, (d, sel) => {
          fussnoteEinfuegen(d, sel, { wort: (a.wort ?? '').trim() || m.text, text: (a.erklaerung ?? '').trim(), sprache })
        })
        if (ok) r.fertig('Die Fußnote steht unter dem Material.')
        else r.fehler(new Error('Die Textstelle hat sich geändert.'))
      } catch (e) {
        r.fehler(e)
      }
      return
    }
    case 'worthilfe': {
      const r = laeuft('Worthilfe')
      try {
        const ziel = sprache === 'de' ? worthilfeSprache({ ...g!, zielsprache: g?.zielsprache }, block.language) : sprache
        const a = await ki<{ begriff: string; eintrag: string }>({
          system: sys,
          user: [
            stelle,
            ziel === textSprache
              ? `Gib ein bekanntes Synonym oder eine sehr kurze Umschreibung auf ${sprachname(ziel)} (höchstens 6 Wörter).`
              : `Gib die Übersetzung auf ${sprachname(ziel)} in DIESER Bedeutung (höchstens 6 Wörter).`,
            'Im Feld begriff steht der Ausdruck in der Grundform – so, dass er im Text wiederzufinden ist.'
          ].join('\n'),
          schemaName: 'textauswahl_worthilfe',
          schema: obj({ begriff: str('Ausdruck (Grundform)'), eintrag: str('Übersetzung bzw. Synonym') })
        })
        let term = (a.begriff ?? '').trim()
        ctx.update?.(block.id, (d) => {
          if (d.type !== 'text') return
          // Die hochgestellte Ziffer hängt am Begriff: steht die Grundform nicht im Text, gilt die markierte Form
          if (!term || begriffImText(d.body, term) < 0) term = m.text
          if (d.glossary.some((x) => x.term.toLocaleLowerCase() === term.toLocaleLowerCase())) return
          d.glossary = [...d.glossary, { term, explanation: (a.eintrag ?? '').trim() }]
        })
        r.fertig(`Worthilfe „${term} – ${(a.eintrag ?? '').trim()}“ unter dem Text.`)
      } catch (e) {
        r.fehler(e)
      }
      return
    }
    case 'vereinfachen': {
      const r = laeuft('Einfacher formulieren')
      try {
        const a = await ki<{ text: string }>({
          system: sys,
          user: [
            stelle,
            `Formuliere NUR die markierte Stelle einfacher für schwächere Lernende dieser Lerngruppe: kürzere Sätze, häufige Wörter, dieselbe Aussage, keine neuen Inhalte. Sprache: ${sprachname(textSprache)} (wie das Original).`,
            'Die Antwort ersetzt die markierte Stelle wörtlich – ohne Anführungszeichen, ohne Einleitung. Absätze durch Leerzeile.'
          ].join('\n'),
          schemaName: 'textauswahl_vereinfachen',
          schema: obj({ text: str('vereinfachte Fassung der markierten Stelle') })
        })
        if (!a.text?.trim()) throw new Error('Die KI hat keine Fassung geliefert.')
        const ok = amText(ctx, block, m, (d, sel) => vereinfachen(d, sel, a.text))
        if (ok) r.fertig('Vereinfacht – das Original bleibt als Fassung erhalten (Umschalter unter dem Text).')
        else r.fehler(new Error('Die Textstelle hat sich geändert.'))
      } catch (e) {
        r.fehler(e)
      }
      return
    }
    case 'aufgabe': {
      if (!ctx.einfuegenNach || !g) return
      const r = laeuft('Aufgabe dazu erzeugen')
      const aSprache = g.aufgabenSprache || 'de'
      try {
        const a = await ki<{ operator: string; rahmen: string; erwartung: string; afb: 'I' | 'II' | 'III'; punkte: number }>({
          system: sys,
          user: [
            stelle,
            `Entwirf EINE Aufgabe zu dieser Stelle, in der die Lernenden mit dem Zitat arbeiten. Sprache der Aufgabe: ${sprachname(aSprache)}.`,
            `operator: ein Operator im INFINITIV aus der üblichen Operatorenliste (${aSprache === 'de' ? 'z. B. erläutern, analysieren, erklären, herausarbeiten, beurteilen' : 'e.g. explain, analyse, describe, assess, comment on'}).`,
            'rahmen: der REST des Arbeitsauftrags OHNE Operator, mit dem Platzhalter {ZITAT} genau an der Stelle, an der das Zitat grammatisch im Satz steht (als Objekt oder im Nebensatz), z. B. „inwiefern Shakespeare laut Olk {ZITAT} überschreitet" bzw. „why the author claims that Shakespeare\'s plays are {ZITAT}".',
            'Das Zitat NICHT abgesetzt hinter einem Doppelpunkt, KEINE Anführungszeichen (setzt die App), KEINE Zeilenangabe (setzt die App), kein Satzzeichen am Ende. Der Satz um {ZITAT} muss grammatisch zum wörtlichen Zitat passen.',
            'erwartung: Erwartungshorizont in 2–4 Stichpunkten (je Zeile ein Punkt, mit „- ").',
            'afb: Anforderungsbereich I, II oder III; punkte: angemessene Punktzahl.'
          ].join('\n'),
          schemaName: 'textauswahl_aufgabe',
          schema: obj({ operator: str(), rahmen: str(), erwartung: str(), afb: enumOf(['I', 'II', 'III']), punkte: int() })
        })
        const materialien = (ctx.blattBausteine ?? []).filter((b) => b.type === 'text')
        const instruction = aufgabeMitZitat({
          operator: a.operator,
          rahmen: a.rahmen,
          zitat: m.text,
          sprache: aSprache,
          anrede: g.anrede,
          zeilen: block.lineNumbers ? m.zeilen : undefined,
          material: materialien.length > 1 || !block.lineNumbers || !m.zeilen ? `M{${block.id}}` : undefined
        })
        const mitPunkten = (ctx.blattBausteine ?? []).some((b) => b.type === 'task' && (b.points ?? 0) > 0)
        const neu = newBlock('task') as TaskBlock
        const aufgabe: TaskBlock = {
          ...neu,
          instruction,
          operator: a.operator.trim(),
          afb: ['I', 'II', 'III'].includes(a.afb) ? a.afb : 'II',
          solution: (a.erwartung ?? '').trim(),
          points: mitPunkten ? Math.max(1, Math.round(a.punkte || 0)) : 0
        }
        ctx.einfuegenNach(ankerFuerAufgabe(ctx.blattBausteine ?? [], block.id), aufgabe)
        r.fertig('Die Aufgabe steht hinter dem Material; der Erwartungshorizont im Lösungsteil.')
      } catch (e) {
        r.fehler(e)
      }
      return
    }
    case 'bild': {
      const r = laeuft('Erklärgrafik')
      try {
        const prompt = `Kleine, sachlich richtige Erklärgrafik zum Begriff „${m.text}" (Fach ${g?.fach ?? ''}, Thema ${g?.thema ?? ''}) für Lernende, Jahrgang ${g?.jahrgang ?? ''}: einfache klare Zeichnung, weißer Hintergrund, ohne Text und ohne Beschriftung.`
        const dataUrl = await window.api.ai.image(prompt)
        const bild = { dataUrl, source: 'ai' as const, aiPrompt: prompt }
        const ok = amText(ctx, block, m, (d, sel) => {
          const vorhanden = (d.fussnoten ?? []).find((f) => f.wort.toLocaleLowerCase() === m.text.toLocaleLowerCase() && d.body.includes(`[^${f.id}]`))
          if (vorhanden) vorhanden.bild = bild
          else fussnoteEinfuegen(d, sel, { wort: m.text, text: '', bild })
        })
        if (ok) r.fertig('Die Grafik steht in der Fußnote (als KI-Bild gekennzeichnet).')
        else r.fehler(new Error('Die Textstelle hat sich geändert.'))
      } catch (e) {
        r.fehler(e)
      }
      return
    }
    default:
      return
  }
}

// ---------- Anbindung an den Textkörper

/**
 * Rechtsklick und langer Druck am Textkörper eines Materials. Liefert die Eigenschaften für den
 * Textkörper und das offene Menü. Nur in den Bearbeitungsansichten mit `update`.
 */
export function useTextAuswahl(block: TextBlock): {
  ref: React.RefObject<HTMLDivElement | null>
  onContextMenu?: (e: React.MouseEvent) => void
  menue: React.ReactNode
} {
  const ctx = useWs()
  const ref = useRef<HTMLDivElement | null>(null)
  const [markierung, setMarkierung] = useState<Markierung | null>(null)
  const aktiv = Boolean(ctx.update) && isEditMode(ctx.mode)
  const oeffnen = (x: number, y: number): boolean => {
    const k = ref.current
    if (!k) return false
    const m = markierungLesen(k, x, y, block.lineNumbers)
    if (!m) return false
    setMarkierung(m)
    return true
  }
  useEffect(() => {
    const k = ref.current
    if (!k || !aktiv) return
    // Langer Druck (shared/touch/gesten.ts): auf die Markierung – oder ohne Markierung auf ein Wort
    const lang = (e: Event): void => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail ?? { x: 0, y: 0 }
      if (!touchAktiv()) return
      const feld = document.activeElement
      if (feld instanceof HTMLTextAreaElement && k.contains(feld) && feld.selectionEnd === feld.selectionStart) return
      if (oeffnen(x, y)) return
      if (wortAmPunkt(x, y)) oeffnen(x, y)
    }
    k.addEventListener('langerdruck', lang)
    return () => k.removeEventListener('langerdruck', lang)
  })
  if (!aktiv) return { ref, menue: null }
  return {
    ref,
    onContextMenu: (e) => {
      // Umschalt + Rechtsklick: das Menü des Systems (Rechtschreibung, Einfügen …)
      if (e.shiftKey) return
      if (oeffnen(e.clientX, e.clientY)) e.preventDefault()
    },
    menue: markierung ? <TextAuswahlMenue block={block} markierung={markierung} onSchliessen={() => setMarkierung(null)} /> : null
  }
}

/** Für Tests und Hinweise: die Aktionen des Hauptkreises */
export const TEXTAUSWAHL_AKTIONEN = HAUPT.map((e) => e.label)
