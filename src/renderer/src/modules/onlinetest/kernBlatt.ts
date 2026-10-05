/**
 * Onlinetest aus Grammatiktest und Lernzielkontrolle (05.10.2026, Wunsch der Lehrkraft: „aktuell sind nur
 * Vokabeltests möglich – ermögliche auch Grammatiktests und Lernzielkontrollen").
 *
 * Beide bauen auf den Bausteinen des Arbeitsblatts auf (WsBlock, Aufgaben mit Antwortform). Hier werden
 * sie in die Onlinefassung des Kerns übersetzt (kern.ts) – damit gilt alles, was der Onlinetest kann:
 * Start durch die Lehrkraft, Zeitlimit, Abgabe beim Verlassen, Punkte und Note, KI-Prüfung offener
 * Antworten, Überstimmen durch die Lehrkraft, Verlauf je Lerngruppe.
 *
 *  - Material (Text, Bild, Tabelle, Merkkasten …) wird zur Karte „Material" – gezeichnet wie auf dem
 *    Papierblatt (Ausschnitt der Druckfassung OHNE Lösungen, Stil einmal je Fassung).
 *  - Lücken, Auswahl, Richtig/Falsch, Zuordnen, Reihenfolge: eindeutig geprüft.
 *  - Schreibaufgaben, Tabellen zum Ausfüllen, Beschriftungen: die KI prüft gegen Lösung/Musterlösung.
 *  - Zeichnen (Diagramm, Kästchen): bewertet die Lehrkraft.
 * Punkte: die der Aufgabe, auf ihre Teile verteilt (ganze Punkte, wie im Onlinetest üblich).
 */
import { plainText } from '../../shared/richtext/parse'
import type { Answer, TaskBlock, WsBlock } from '../arbeitsblatt/model/types'
import type { Einheit, Feld, Loesung, OnlineAufgabe, OnlineEintrag, OnlineFassung } from './kern'

const t = (s: unknown): string =>
  plainText(String(s ?? ''))
    .replace(/\s+/g, ' ')
    .trim()

/** Gesamtpunkte auf n Teile verteilen (ganze Punkte, mindestens 1 je Teil) */
export function verteile(punkte: number, n: number): number[] {
  const p = Math.max(n, Math.round(Number.isFinite(punkte) && punkte > 0 ? punkte : n))
  const grund = Math.floor(p / n)
  return Array.from({ length: n }, (_, i) => grund + (i < p - grund * n ? 1 : 0))
}

/** Lückentext „…[[Lösung]]…" in Stücke */
export function lueckenTeile(text: string): { vor: string; loesung: string }[] & { rest?: string } {
  const teile: { vor: string; loesung: string }[] & { rest?: string } = []
  const re = /\[\[([^\]]*)\]\]/g
  let letzte = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    teile.push({ vor: text.slice(letzte, m.index), loesung: m[1] })
    letzte = m.index + m[0].length
  }
  teile.rest = text.slice(letzte)
  return teile
}

interface Ziel {
  aufgabe: OnlineAufgabe
  einheiten: Einheit[]
  loesungen: Record<string, Loesung>
}

/** Felder und Lösungen einer Antwortform – als Einträge einer Aufgabe, mit `punkte` für das Ganze */
function antwortForm(ziel: Ziel, idBasis: string, frage: string, a: Answer, loesung: string, muster: string | undefined, punkte: number, text?: string): void {
  const { aufgabe, einheiten, loesungen } = ziel
  const einheit = (id: string, felder: string[], p: number): void => void einheiten.push({ id, aufgabe: aufgabe.id, felder, punkte: Math.max(1, p) })
  const erwartung = [loesung, muster]
    .map((x) => t(x))
    .filter(Boolean)
    .join(' – Musterlösung: ')
  switch (a.kind) {
    case 'gapText': {
      const teile = lueckenTeile(a.gapText ?? '')
      if (!teile.length) break
      const verteilt = verteile(punkte, teile.length)
      teile.forEach((s, i) => {
        const f = `${idBasis}.l${i}`
        aufgabe.eintraege.push({ einheit: f, vor: (i === 0 && text ? `${text} ` : '') + t(s.vor), felder: [{ id: f, art: 'text' }] })
        loesungen[f] = { art: 'genau', werte: [s.loesung] }
        einheit(f, [f], verteilt[i])
      })
      if (teile.rest?.trim()) aufgabe.vorlage = `${aufgabe.vorlage ?? ''}${t(teile.rest)}`
      if (!text) aufgabe.art = 'gapText'
      return
    }
    case 'multipleChoice': {
      const optionen = (a.options ?? []).map((o, i) => ({ wert: String(i), text: `${String.fromCharCode(97 + i)}) ${t(o)}` }))
      if ((a.correct ?? []).length === 1) {
        const f = `${idBasis}.mc`
        aufgabe.eintraege.push({ einheit: f, ...(text ? { text } : {}), felder: [{ id: f, art: 'auswahl', optionen }] })
        loesungen[f] = { art: 'auswahl', wert: String(a.correct[0]) }
        einheit(f, [f], punkte)
        return
      }
      // Mehrere richtige: je Möglichkeit „trifft zu / trifft nicht zu", alle zusammen eine Einheit
      const ids: string[] = []
      optionen.forEach((o, i) => {
        const f = `${idBasis}.mc${i}`
        aufgabe.eintraege.push({
          einheit: `${idBasis}.mc`,
          text: i === 0 && text ? `${text}\n${o.text}` : o.text,
          felder: [
            {
              id: f,
              art: 'wahr',
              optionen: [
                { wert: 'true', text: 'trifft zu' },
                { wert: 'false', text: 'trifft nicht zu' }
              ]
            }
          ]
        })
        loesungen[f] = { art: 'auswahl', wert: String(a.correct.includes(i)) }
        ids.push(f)
      })
      einheit(`${idBasis}.mc`, ids, punkte)
      return
    }
    case 'trueFalse': {
      const verteilt = verteile(punkte, Math.max(1, a.statements.length))
      a.statements.forEach((s, i) => {
        const f = `${idBasis}.w${i}`
        aufgabe.eintraege.push({
          einheit: f,
          text: i === 0 && text ? `${text}\n${t(s.text)}` : t(s.text),
          felder: [
            {
              id: f,
              art: 'wahr',
              optionen: [
                { wert: 'true', text: 'richtig' },
                { wert: 'false', text: 'falsch' }
              ]
            }
          ]
        })
        loesungen[f] = { art: 'auswahl', wert: String(s.isTrue) }
        einheit(f, [f], verteilt[i])
      })
      return
    }
    case 'matching': {
      aufgabe.rechts = a.right.map((r, i) => ({ wert: String(i), text: `${String.fromCharCode(97 + i)}) ${t(r)}` }))
      if (!text) aufgabe.art = 'match'
      const verteilt = verteile(punkte, Math.max(1, a.left.length))
      a.left.forEach((l, i) => {
        const f = `${idBasis}.z${i}`
        aufgabe.eintraege.push({ einheit: f, text: t(l), felder: [{ id: f, art: 'auswahl', optionen: aufgabe.rechts }] })
        loesungen[f] = { art: 'auswahl', wert: String(a.pairs[i]) }
        einheit(f, [f], verteilt[i])
      })
      return
    }
    case 'ordering': {
      const anzeige = a.displayOrder?.length === a.items.length ? a.displayOrder : a.items.map((_, i) => i)
      const optionen = anzeige.map((k) => ({ wert: String(k), text: t(a.items[k]) }))
      const ids: string[] = []
      a.items.forEach((_, pos) => {
        const f = `${idBasis}.r${pos}`
        aufgabe.eintraege.push({
          einheit: `${idBasis}.r`,
          ...(pos === 0 && text ? { text } : {}),
          felder: [{ id: f, art: 'auswahl', beschriftung: `${pos + 1}.`, optionen }]
        })
        loesungen[f] = { art: 'auswahl', wert: String(pos) }
        ids.push(f)
      })
      einheit(`${idBasis}.r`, ids, punkte)
      return
    }
    case 'tableFill': {
      const zellen: { r: number; c: number }[] = []
      a.rows.forEach((row, r) => row.forEach((zelle, c) => !String(zelle ?? '').trim() && zellen.push({ r, c })))
      if (!zellen.length) break
      const verteilt = verteile(punkte, a.rows.length)
      a.rows.forEach((row, r) => {
        const leer = zellen.filter((z) => z.r === r)
        if (!leer.length) return
        const kontext = row.map((z, c) => `${t(a.headers[c]) || `Spalte ${c + 1}`}: ${t(z) || '…'}`).join(' · ')
        const felder: Feld[] = leer.map((z) => ({ id: `${idBasis}.t${r}.${z.c}`, art: 'text', beschriftung: t(a.headers[z.c]) || `Spalte ${z.c + 1}` }))
        aufgabe.eintraege.push({ einheit: `${idBasis}.t${r}`, text: `${r === 0 && text ? `${text}\n` : ''}${kontext}`, felder })
        for (const z of leer)
          loesungen[`${idBasis}.t${r}.${z.c}`] = {
            art: 'ki',
            frage: `${frage}\nTabellenzeile: ${kontext}\nGefragt: ${t(a.headers[z.c])}`,
            erwartung: t(a.solutionRows?.[r]?.[z.c])
          }
        einheit(
          `${idBasis}.t${r}`,
          felder.map((f) => f.id),
          verteilt[r]
        )
      })
      return
    }
    case 'labels': {
      const n = Math.max(1, a.count || a.labels.length)
      const ids: string[] = []
      const felder: Feld[] = Array.from({ length: n }, (_, i) => ({ id: `${idBasis}.b${i}`, art: 'text', beschriftung: `${i + 1}` }))
      aufgabe.eintraege.push({ einheit: `${idBasis}.b`, ...(text ? { text } : {}), felder })
      felder.forEach((f, i) => {
        loesungen[f.id] = { art: 'ki', frage: `${frage}\nBeschriftung ${i + 1}`, erwartung: t(a.labels[i]) }
        ids.push(f.id)
      })
      einheit(`${idBasis}.b`, ids, punkte)
      return
    }
    case 'diagram':
    case 'grid': {
      // Zeichnen geht im Onlinetest nicht – beschreiben lassen, die Lehrkraft bewertet
      const f = `${idBasis}.d`
      aufgabe.eintraege.push({
        einheit: f,
        ...(text ? { text } : {}),
        hinweis: 'Beschreibe in Worten, was du zeichnen würdest.',
        felder: [{ id: f, art: 'langtext' }]
      })
      loesungen[f] = { art: 'lehrkraft', frage, ...(erwartung ? { erwartung } : {}) }
      einheit(f, [f], punkte)
      return
    }
    default:
      break
  }
  // Schreiben (Linien, Freiraum) und alles Übrige: offene Antwort, die KI prüft gegen Lösung/Musterlösung
  const f = `${idBasis}.o`
  aufgabe.eintraege.push({ einheit: f, ...(text ? { text } : {}), felder: [{ id: f, art: 'langtext' }] })
  loesungen[f] = erwartung ? { art: 'ki', frage, erwartung } : { art: 'lehrkraft', frage }
  einheit(f, [f], punkte)
}

/**
 * Bausteine (eines Blattes) → Onlinefassung. `materialHtml`: Druckbild eines Material-Bausteins (ohne
 * Lösungen), `stil`: die Stilregeln der Druckfassung für diese Bilder.
 */
export function onlineFassungAusBloecke(
  bloecke: WsBlock[],
  opts: { materialHtml: (id: string) => string; stil: string; nummern: Map<string, number> }
): OnlineFassung {
  const aufgaben: OnlineAufgabe[] = []
  const einheiten: Einheit[] = []
  const loesungen: Record<string, Loesung> = {}
  for (const b of bloecke) {
    if (b.type === 'task') {
      const task = b as TaskBlock
      const nr = opts.nummern.get(task.id) ?? aufgaben.filter((a) => a.art !== 'material').length + 1
      const aufgabe: OnlineAufgabe = { id: task.id, art: 'open', titel: `Aufgabe ${nr}`, anweisung: t(task.instruction), eintraege: [], punkte: 0 }
      const ziel: Ziel = { aufgabe, einheiten, loesungen }
      const vorher = einheiten.length
      if (task.parts.length) {
        const verteilt = verteile(task.points, task.parts.length)
        task.parts.forEach((p, i) =>
          antwortForm(
            ziel,
            `${task.id}.${p.id}`,
            `${t(task.instruction)} ${String.fromCharCode(97 + i)}) ${t(p.instruction)}`,
            p.answer,
            p.solution,
            p.modelAnswer,
            verteilt[i],
            `${String.fromCharCode(97 + i)}) ${t(p.instruction)}`
          )
        )
      } else antwortForm(ziel, task.id, t(task.instruction), task.answer, task.solution, task.modelAnswer, task.points)
      aufgabe.punkte = einheiten.slice(vorher).reduce((s, e) => s + e.punkte, 0)
      if (aufgabe.eintraege.length) aufgaben.push(aufgabe)
      continue
    }
    // Material: wie gedruckt (nur wenn es etwas zu zeigen gibt)
    const html = opts.materialHtml(b.id)
    if (html.trim()) aufgaben.push({ id: b.id, art: 'material', titel: 'Material', anweisung: '', eintraege: [], punkte: 0, html })
  }
  return { aufgaben, einheiten, loesungen, punkte: einheiten.reduce((s, e) => s + e.punkte, 0), stil: opts.stil }
}

/** Material-Ausschnitte aus der Druckfassung (ohne Lösungen): je Baustein das gedruckte HTML, dazu die Stilregeln */
export function materialAusDruck(html: string): { stil: string; material: (id: string) => string } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const stil = [...doc.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n')
  const seite = doc.querySelector('.ws-page')
  const seitenStil = seite?.getAttribute('style') ?? ''
  return {
    stil,
    material: (id: string) => {
      const stuecke = [...doc.querySelectorAll(`[data-fluss="${CSS.escape(id)}"]`)]
      if (!stuecke.length) return ''
      return `<div class="ws-page ws-online-material" style="${seitenStil.replace(/"/g, '&quot;')};height:auto;min-height:0;width:auto;padding:4mm"><div class="ws-body">${stuecke.map((s) => s.innerHTML).join('')}</div></div>`
    }
  }
}

export type { OnlineEintrag }
