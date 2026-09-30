/**
 * Verbformen im Zusammenhang (30.09.2026): Lückensätze, Text in die Vergangenheit setzen, Sätze
 * übersetzen. Hier – und nur hier – schreibt die KI.
 *
 * Die KI bekommt je Item das Verb, die verlangte Form und die LÖSUNG aus der Liste; sie schreibt nur
 * den Satz drumherum. Danach prüft die App: Steht die Lösung in der Liste (auch als Variante wie
 * „burnt/burned")? Genau eine Lücke? Verrät der Satz die Lösung nicht? Was nicht passt, fällt weg –
 * lieber ein Satz weniger als eine falsche Lösung im Lösungsblatt.
 */
import { grundformVon, varianten, VERB_SPALTEN, SPRACH_NAMEN, type VerbEintrag } from '@shared/verben'
import type { StructuredRequest } from '@shared/types'
import type { Anrede } from '../anrede'
import { arr, int, obj, str } from '../aiSchema'
import { anweisung, formatVon, type VerbAufgabe, type VerbFormatId } from './formate'
import { FEHLERART, verbenDerFassung, type VerbTask } from './erzeugen'

export type AiCall = <T>(req: StructuredRequest) => Promise<T>

const ENGLISCHE_SPRACHE: Record<string, string> = { en: 'English', fr: 'French', es: 'Spanish', it: 'Italian', ru: 'Russian', la: 'Latin' }

interface KontextItem {
  nr: number
  verb: VerbEintrag
  grundform: string
  loesungen: string[]
}

const SATZ_SCHEMA = obj({
  items: arr(
    obj({
      nr: int('Nummer des Items aus der Vorgabe'),
      satz: str('Der Satz mit genau einer Lücke „___" an der Stelle der Verbform'),
      loesung: str('Die Form in der Lücke – genau eine der vorgegebenen Lösungen'),
      deutsch: str('nur beim Übersetzen: der deutsche Satz; sonst leer')
    })
  )
})

const TEXT_SCHEMA = obj({
  titel: str('Kurzer Titel des Textes in der Zielsprache'),
  text: str('Zusammenhängender Text; jede Verbstelle als [[nr]] (z. B. [[3]])'),
  items: arr(obj({ nr: int(), hinweis: str('Die Form in Klammern hinter der Lücke: Grundform oder Präsensform'), loesung: str('Die verlangte Form') }))
})

const normal = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Stimmt die Lösung der KI mit der Liste überein? Liefert die Form wie in der Liste oder null. */
export function passendeLoesung(vorschlag: string, loesungen: string[]): string | null {
  const v = normal(vorschlag)
  return loesungen.find((l) => normal(l) === v) ?? null
}

function vorgabe(items: KontextItem[], zielLabel: string): string {
  return items.map((it) => `${it.nr}. ${it.grundform} → ${zielLabel}: ${it.loesungen.join(' ODER ')}`).join('\n')
}

function rahmen(a: VerbAufgabe, format: VerbFormatId, items: KontextItem[], zielLabel: string): string {
  const sprache = ENGLISCHE_SPRACHE[a.sprache] ?? a.sprache
  return [
    `Du schreibst Sätze für einen Test zu unregelmäßigen Verben (${SPRACH_NAMEN[a.sprache]}, ${a.lernjahr}. Lernjahr).`,
    `Jedes Item verlangt die Form „${zielLabel}" des angegebenen Verbs. Die LÖSUNG steht fest – sie kommt aus der Verbliste des Schulbuchs. Du schreibst nur den Zusammenhang.`,
    '- Einfacher Wortschatz des Lernjahrs, kurze Sätze, keine unbekannten Wörter.',
    '- Der Zusammenhang macht die verlangte Zeitform eindeutig (Zeitangabe wie „yesterday", „last week", „hier", „ayer").',
    '- Die Lösung darf im Satz sonst nicht vorkommen.',
    format === 'uebersetzen'
      ? `- Schreibe je Item einen deutschen Satz, dessen Übersetzung ins ${sprache} genau diese Form verlangt; „satz" ist die Übersetzung mit „___" an der Stelle der Form.`
      : `- Die Sätze stehen auf ${sprache}; genau eine Lücke „___" je Satz.`,
    '',
    'Items (Nummer. Grundform → Form: Lösung):',
    vorgabe(items, zielLabel)
  ].join('\n')
}

async function saetze(a: VerbAufgabe, format: VerbFormatId, items: KontextItem[], zielLabel: string, ai: AiCall): Promise<{ it: KontextItem; satz: string; loesung: string; deutsch: string }[]> {
  const antwort = await ai<{ items: { nr: number; satz: string; loesung: string; deutsch?: string }[] }>({
    system: rahmen(a, format, items, zielLabel),
    user: 'Schreibe die Sätze.',
    schemaName: 'verb_saetze',
    schema: SATZ_SCHEMA as Record<string, unknown>
  })
  const out: { it: KontextItem; satz: string; loesung: string; deutsch: string }[] = []
  for (const r of antwort?.items ?? []) {
    const it = items.find((x) => x.nr === r.nr)
    if (!it || out.some((o) => o.it === it)) continue
    const loesung = passendeLoesung(String(r.loesung ?? ''), it.loesungen)
    const satz = String(r.satz ?? '').trim()
    // Genau eine Lücke, und der Satz verrät die Lösung nicht
    if (!loesung || (satz.match(/_{3,}/g) ?? []).length !== 1 || normal(satz.replace(/_{3,}/, '')).includes(normal(loesung))) continue
    if (format === 'uebersetzen' && !String(r.deutsch ?? '').trim()) continue
    out.push({ it, satz, loesung, deutsch: String(r.deutsch ?? '').trim() })
  }
  return out
}

async function text(a: VerbAufgabe, items: KontextItem[], zielLabel: string, ai: AiCall): Promise<string | null> {
  const antwort = await ai<{ titel: string; text: string; items: { nr: number; hinweis: string; loesung: string }[] }>({
    system: [
      rahmen(a, 'zeitform', items, zielLabel),
      '',
      'Statt einzelner Sätze: EIN zusammenhängender kurzer Text (Erlebnisbericht, Tagebuch, Nachricht) mit allen Items.',
      'Jede Verbstelle steht im Text als [[nr]]. „hinweis" ist die Form, die in Klammern dahinter steht (Grundform bzw. Präsensform), „loesung" die verlangte Form.'
    ].join('\n'),
    user: 'Schreibe den Text.',
    schemaName: 'verb_text',
    schema: TEXT_SCHEMA as Record<string, unknown>
  })
  let body = String(antwort?.text ?? '')
  let luecken = 0
  for (const it of items) {
    const r = (antwort?.items ?? []).find((x) => x.nr === it.nr)
    const loesung = r ? passendeLoesung(String(r.loesung ?? ''), it.loesungen) : null
    const marke = `[[${it.nr}]]`
    if (!body.includes(marke)) continue
    // Passt die Lösung nicht zur Liste, gilt die Form der Liste mit der Grundform als Hinweis
    const hinweis = (loesung && String(r?.hinweis ?? '').trim()) || it.grundform
    body = body.replace(marke, `[[${loesung ?? it.loesungen[0]}]] (${hinweis})`)
    luecken++
  }
  // Übrig gebliebene Marken ohne Item: entfernen
  body = body.replace(/\[\[\d+\]\]/g, '…')
  if (!luecken) return null
  const titel = String(antwort?.titel ?? '').trim()
  return titel ? `**${titel}**\n\n${body}` : body
}

/**
 * Aufgaben mit KI für eine Fassung. Formate ohne verwertbares Ergebnis fallen weg (und werden
 * gemeldet); die Formate ohne KI (erzeugeOhneKi) laufen davon unabhängig.
 */
export async function erzeugeMitKi(a: VerbAufgabe, anrede: Anrede, ai: AiCall, fassung = 0, anzahlFassungen = 1): Promise<VerbTask[]> {
  const pool = verbenDerFassung(a, fassung, anzahlFassungen)
  const zielSpalte = VERB_SPALTEN[a.sprache].find((s) => s.id === a.zielform) ?? VERB_SPALTEN[a.sprache][1]
  const out: VerbTask[] = []
  for (const [i, format] of a.formate.entries()) {
    const f = formatVon(format)
    if (!f.ki) continue
    const anzahl = a.anzahl[format] ?? f.standardAnzahl
    // Reihum wie die Formate ohne KI; Verben ohne die verlangte Form fallen weg
    const verben = pool
      .map((_, j) => pool[(i * anzahl + j) % pool.length])
      .filter((e) => e.formen[zielSpalte.id] && !/^[-–—]+$/.test(e.formen[zielSpalte.id]))
      .slice(0, anzahl)
    const items: KontextItem[] = verben.map((verb, j) => ({ nr: j + 1, verb, grundform: grundformVon(verb, a.sprache), loesungen: varianten(verb.formen[zielSpalte.id]) }))
    if (!items.length) continue
    if (format === 'zeitform') {
      const body = await text(a, items, zielSpalte.label, ai)
      if (body) {
        const luecken = (body.match(/\[\[/g) ?? []).length
        out.push({ format, anweisung: anweisung(format, a, anrede), punkte: luecken, fehlerart: FEHLERART[format], teil: { art: 'lueckentext', text: body, luecken } })
      }
      continue
    }
    const liste = await saetze(a, format, items, zielSpalte.label, ai)
    if (!liste.length) continue
    if (format === 'lueckensatz') {
      const body = liste.map((s, j) => `${j + 1}. ${s.satz.replace(/_{3,}/, `[[${s.loesung}]] (${s.it.grundform})`)}`).join('\n')
      out.push({ format, anweisung: anweisung(format, a, anrede), punkte: liste.length, fehlerart: FEHLERART[format], teil: { art: 'lueckentext', text: body, luecken: liste.length } })
    } else {
      // Übersetzen: deutscher Satz vorgegeben, die Übersetzung ist die Lösung (bewertet wird die Verbform)
      const kopf = ['Deutsch', SPRACH_NAMEN[a.sprache]]
      out.push({
        format,
        anweisung: anweisung(format, a, anrede),
        punkte: liste.length,
        fehlerart: FEHLERART[format],
        teil: { art: 'tabelle', kopf, zeilen: liste.map((s) => ({ verbId: s.it.verb.id, zellen: [s.deutsch, ''], loesung: ['', s.satz.replace(/_{3,}/, s.loesung)] })) }
      })
    }
  }
  return out
}
