/**
 * Elternbrief nachbearbeiten (29.09.2026, Wünsche der Lehrkraft):
 * - Zauberstab an jedem Teil (Absatz, Betreff, Zeile des Rücklaufzettels): kürzer, einfacher,
 *   freundlicher, förmlicher, neu formulieren – oder mit eigenem Änderungshinweis;
 * - Kopfleiste „Ganzen Brief neu formulieren" mit Ton, Hinweis, Einfacher Sprache und „kürzer";
 * - Übersetzungen ziehen nach: Geänderte Teile werden in allen Sprachen neu übersetzt;
 * - FESTE ANGABEN bleiben: Datum, Uhrzeit, Beträge, Fristen und Platzhalter dürfen umformuliert,
 *   aber nicht verändert werden – die App prüft das nach jeder KI-Änderung.
 */
import type { StructuredRequest } from '@shared/types'
import { arr, obj, str } from '../../shared/aiSchema'
import type { Familiensprache } from '../../shared/familiensprachen'
import { BRIEF_SCHEMA, festeAngaben, FETT_REGEL, TOENE, type BriefText, type Elternbrief } from './model'
import { bereinigeFett } from './hervorhebung'

// ---------- Teile eines Briefes ----------

/** Schlüssel eines Teils: betreff, anrede, absatz-0 …, gruss, rl-titel, rl-0 … */
export interface Teil {
  schluessel: string
  text: string
}

export function teileVon(t: BriefText): Teil[] {
  return [
    { schluessel: 'betreff', text: t.betreff },
    { schluessel: 'anrede', text: t.anrede },
    ...t.absaetze.map((a, i) => ({ schluessel: `absatz-${i}`, text: a })),
    { schluessel: 'gruss', text: t.gruss },
    ...(t.ruecklauf ? [{ schluessel: 'rl-titel', text: t.ruecklauf.titel }, ...t.ruecklauf.zeilen.map((z, i) => ({ schluessel: `rl-${i}`, text: z }))] : [])
  ]
}

export function teilLesen(t: BriefText, schluessel: string): string {
  return teileVon(t).find((x) => x.schluessel === schluessel)?.text ?? ''
}

/** Setzt einen Teil (verändert `t`); unbekannte Schlüssel werden übergangen */
export function teilSetzen(t: BriefText, schluessel: string, wert: string): void {
  const a = /^absatz-(\d+)$/.exec(schluessel)
  const z = /^rl-(\d+)$/.exec(schluessel)
  if (schluessel === 'betreff') t.betreff = wert
  else if (schluessel === 'anrede') t.anrede = wert
  else if (schluessel === 'gruss') t.gruss = wert
  else if (schluessel === 'rl-titel' && t.ruecklauf) t.ruecklauf.titel = wert
  else if (a && Number(a[1]) < t.absaetze.length) t.absaetze[Number(a[1])] = wert
  else if (z && t.ruecklauf && Number(z[1]) < t.ruecklauf.zeilen.length) t.ruecklauf.zeilen[Number(z[1])] = wert
}

/** Teile, die sich zwischen zwei Fassungen unterscheiden (gleicher Aufbau vorausgesetzt) */
export function geaenderteTeile(alt: BriefText, neu: BriefText): string[] {
  const a = new Map(teileVon(alt).map((x) => [x.schluessel, x.text]))
  return teileVon(neu)
    .filter((x) => a.get(x.schluessel) !== x.text)
    .map((x) => x.schluessel)
}

/** Haben zwei Fassungen denselben Aufbau (gleich viele Absätze und Rücklaufzeilen)? */
export const gleicherAufbau = (a: BriefText, b: BriefText): boolean =>
  a.absaetze.length === b.absaetze.length && (a.ruecklauf?.zeilen.length ?? -1) === (b.ruecklauf?.zeilen.length ?? -1)

// ---------- Feste Angaben und Platzhalter ----------

const MONATE = ['januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']
const MONAT_DATUM = /\b(\d{1,2})\.\s?(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/gi

const alles = (t: BriefText): string =>
  teileVon(t)
    .map((x) => x.text)
    .join('\n')

/**
 * Angaben, die eine Umformulierung nicht verändern darf: Datumsangaben (12.12. / 12.12.2026),
 * Uhrzeiten (8:00, 8.30 Uhr), Beträge (5 €, 12,50 Euro) und Platzhalter in eckigen Klammern.
 * Verglichen wird in normalisierter Form („8.00 Uhr" = „8:00", „5 Euro" = „5 €").
 */
export function festeWerte(t: BriefText): string[] {
  const text = alles(t)
  const werte = new Set<string>()
  for (const m of text.matchAll(/\b(\d{1,2})\.\s?(\d{1,2})\.(\d{2,4})?/g)) werte.add(`datum:${Number(m[1])}.${Number(m[2])}`)
  // „5. Oktober" ist dasselbe Datum wie „5.10." – ausgeschriebene Monate zählen mit
  for (const m of text.matchAll(MONAT_DATUM)) werte.add(`datum:${Number(m[1])}.${MONATE.indexOf(m[2].toLowerCase().replace('ä', 'ae')) + 1}`)
  for (const m of text.matchAll(/\b(\d{1,2})[:.](\d{2})\s*Uhr|\b(\d{1,2}):(\d{2})\b/g)) {
    const h = m[1] ?? m[3]
    const min = m[2] ?? m[4]
    werte.add(`zeit:${Number(h)}:${min}`)
  }
  for (const m of text.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|Euro\b|EUR\b)|€\s*(\d+(?:[.,]\d{1,2})?)/g))
    werte.add(`betrag:${(m[1] ?? m[2]).replace('.', ',').replace(/,00$/, '')}`)
  for (const m of text.matchAll(/\[[^\]]{2,60}\]/g)) werte.add(`platzhalter:${m[0]}`)
  return [...werte]
}

/** Was von `vorher` in `nachher` fehlt – lesbar für die Lehrkraft */
export function verloreneAngaben(vorher: string[], nachher: BriefText): string[] {
  const jetzt = new Set(festeWerte(nachher))
  return vorher
    .filter((w) => !jetzt.has(w))
    .map((w) => {
      const [art, wert] = [w.slice(0, w.indexOf(':')), w.slice(w.indexOf(':') + 1)]
      return art === 'datum' ? `Datum ${wert}.` : art === 'zeit' ? `Uhrzeit ${wert}` : art === 'betrag' ? `Betrag ${wert} €` : wert
    })
}

/** Platzhalter, die zum Ausfüllen durch die Eltern gedacht sind – kein Befund */
const GEWOLLT = /^\[(Name des Kindes|Name|Unterschrift|Datum der Unterschrift|Klasse)\]$/i

/** Platzhalter, die die Lehrkraft noch füllen muss („[Datum]", „[Rückgabefrist]") */
export function offenePlatzhalter(t: BriefText): string[] {
  return [...new Set([...alles(t).matchAll(/\[[^\]]{2,60}\]/g)].map((m) => m[0]))].filter((p) => !GEWOLLT.test(p))
}

/** Prüfbefunde nach dem Schreiben bzw. einer Änderung */
export function pruefeBrief(b: Elternbrief, t: BriefText, verloren: string[] = []): string[] {
  const befunde: string[] = []
  const offen = offenePlatzhalter(t)
  if (offen.length) befunde.push(`Noch auszufüllen: ${offen.join(', ')}`)
  if (b.meta.ruecklauf && !b.meta.rueckgabeBis && t.ruecklauf) befunde.push('Für den Rücklaufzettel ist keine Rückgabefrist eingetragen.')
  if (verloren.length) befunde.push(`Nach der Änderung fehlen: ${verloren.join(', ')} – bitte prüfen oder Rückgängig (Strg+Z).`)
  return befunde
}

// ---------- KI-Anfragen ----------

export type Aktion = 'kuerzer' | 'einfacher' | 'freundlicher' | 'foermlicher' | 'neu'

export const AKTIONEN: { value: Aktion; label: string; auftrag: string }[] = [
  { value: 'kuerzer', label: 'Kürzer', auftrag: 'Fasse den Teil kürzer, ohne Inhalt wegzulassen.' },
  { value: 'einfacher', label: 'Einfacher', auftrag: 'Formuliere den Teil in einfacher Sprache: kurze Sätze, bekannte Wörter, keine Fachbegriffe.' },
  { value: 'freundlicher', label: 'Freundlicher', auftrag: 'Formuliere den Teil freundlicher und wärmer, ohne anbiedernd zu werden.' },
  { value: 'foermlicher', label: 'Förmlicher', auftrag: 'Formuliere den Teil förmlicher und sachlicher.' },
  { value: 'neu', label: 'Neu formulieren', auftrag: 'Formuliere den Teil neu – gleicher Inhalt, andere Worte.' }
]

const FEST_REGEL =
  'FESTE ANGABEN: Datumsangaben, Uhrzeiten, Beträge, Fristen, Orte und Platzhalter in eckigen Klammern bleiben inhaltlich gleich und in derselben Schreibweise (12.12.2026 bleibt 12.12.2026, 8:00 Uhr bleibt 8:00 Uhr, 5 € bleibt 5 €). Umformuliert wird nur der Satz drumherum. Nichts dazuerfinden. Fettmarkierungen **…** um wichtige Angaben bleiben erhalten.'

const TEIL_SCHEMA = obj({ text: str('Der neu formulierte Teil') })

const teilName = (schluessel: string): string =>
  schluessel === 'betreff'
    ? 'die Betreffzeile'
    : schluessel === 'anrede'
      ? 'die Anrede'
      : schluessel === 'gruss'
        ? 'die Grußformel'
        : schluessel === 'rl-titel'
          ? 'die Überschrift des Rücklaufzettels'
          : schluessel.startsWith('rl-')
            ? 'eine Zeile des Rücklaufzettels'
            : 'einen Absatz'

export function teilAnfrage(b: Elternbrief, schluessel: string, aktion: Aktion | null, hinweis: string): StructuredRequest {
  const t = b.text!
  const auftrag = aktion ? AKTIONEN.find((a) => a.value === aktion)!.auftrag : 'Überarbeite den Teil.'
  return {
    system:
      'Du überarbeitest Elternbriefe deutscher Schulen: klar, freundlich, verständlich (kurze Sätze), rechtlich unverfänglich. Du änderst nur den verlangten Teil.',
    user: [
      `Überarbeite ${teilName(schluessel)} dieses Elternbriefs. ${auftrag}`,
      hinweis.trim() ? `HINWEIS DER LEHRKRAFT (umsetzen): ${hinweis.trim()}` : '',
      FEST_REGEL,
      '- KEINE Namen von Kindern oder Eltern.',
      `- Ton des Briefes: ${TOENE.find((x) => x.value === b.meta.ton)?.label ?? b.meta.ton}.`,
      ...festeAngaben(b.meta),
      'ZU ÜBERARBEITEN:',
      teilLesen(t, schluessel),
      'DER GANZE BRIEF ZUM ZUSAMMENHANG (nicht zurückgeben):',
      teileVon(t)
        .map((x) => x.text)
        .join('\n')
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'elternbrief_teil',
    schema: TEIL_SCHEMA
  }
}

export function teilAus(daten: unknown): string {
  const text = bereinigeFett(String((daten as { text?: unknown } | null)?.text ?? '')).trim()
  if (!text) throw new Error('Die KI hat keinen Text geliefert.')
  return text
}

export interface Neuformulierung {
  ton: string
  hinweis: string
  einfach: boolean
  kuerzer: boolean
}

export function neuAnfrage(b: Elternbrief, o: Neuformulierung): StructuredRequest {
  const t = b.text!
  return {
    system:
      'Du überarbeitest Elternbriefe deutscher Schulen: klar, verständlich, rechtlich unverfänglich. Termine, Orte, Beträge und Fristen stehen gut auffindbar.',
    user: [
      `Formuliere diesen Elternbrief neu. Ton: ${TOENE.find((x) => x.value === o.ton)?.label ?? o.ton}.`,
      o.einfach
        ? '- Einfache Sprache: kurze Sätze (höchstens 12 Wörter), bekannte Wörter, eine Aussage je Satz – für Eltern mit wenig Deutschkenntnissen.'
        : '',
      o.kuerzer ? '- Deutlich kürzer: nur das Nötige, 2–3 Absätze.' : '',
      o.hinweis.trim() ? `HINWEIS DER LEHRKRAFT (umsetzen): ${o.hinweis.trim()}` : '',
      FEST_REGEL,
      FETT_REGEL,
      '- KEINE Namen von Kindern oder Eltern; der Rücklaufzettel bleibt erhalten (gleiche Angaben).',
      b.meta.ruecklauf ? '' : '- Ohne Rücklaufzettel: ruecklaufTitel leer, ruecklaufZeilen leer.',
      ...festeAngaben(b.meta),
      'BISHERIGER BRIEF:',
      JSON.stringify({
        betreff: t.betreff,
        anrede: t.anrede,
        absaetze: t.absaetze,
        gruss: t.gruss,
        ruecklaufTitel: t.ruecklauf?.titel ?? '',
        ruecklaufZeilen: t.ruecklauf?.zeilen ?? []
      })
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'elternbrief_text',
    schema: BRIEF_SCHEMA
  }
}

const TEILE_SCHEMA = obj({
  teile: arr(obj({ schluessel: str('Schlüssel des Teils, unverändert'), text: str('Der Teil in der Zielsprache') }))
})

/** Nur die geänderten Teile übersetzen – Platzhalter bleiben deutsch, Zahlen unverändert */
export function teileUebersetzungsAnfrage(teile: Teil[], sprache: Familiensprache): StructuredRequest {
  return {
    system: `Du übersetzt Teile von Elternbriefen deutscher Schulen in die Familiensprache der Eltern: ${sprache.name} (${sprache.eigen}). Genau, vollständig, in einfacher, höflicher Alltagssprache.`,
    user: [
      `Übersetze jeden Teil ins ${sprache.name}. Den Schlüssel unverändert zurückgeben. Platzhalter in eckigen Klammern [ ] bleiben unverändert auf Deutsch stehen. Zahlen von Datum, Uhrzeit und Betrag unverändert; Wörter wie „Uhr" oder „bis" werden mitübersetzt. Fettmarkierungen **…** bleiben um dieselben Angaben stehen.`,
      JSON.stringify(teile)
    ].join('\n\n'),
    schemaName: 'elternbrief_teile',
    schema: TEILE_SCHEMA
  }
}

export function teileUebersetzungAus(daten: unknown, erwartet: Teil[]): Teil[] {
  const liste = (daten as { teile?: unknown } | null)?.teile
  const raus = (Array.isArray(liste) ? liste : [])
    .map((x) => ({ schluessel: String((x as Teil)?.schluessel ?? ''), text: bereinigeFett(String((x as Teil)?.text ?? '')).trim() }))
    .filter((x) => x.text && erwartet.some((e) => e.schluessel === x.schluessel))
  if (raus.length !== erwartet.length) throw new Error('Die Übersetzung ist unvollständig.')
  return raus
}
