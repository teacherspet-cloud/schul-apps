/**
 * Abgelehnte Quellen – EINE Liste für alle Programme (01.10.2026).
 *
 * Anlass, gemeldet von der Lehrkraft: Zum Thema „German Macbeth Adaptations" schlug die
 * Klassenarbeit wiederholt die Wikisource-Seite „Die Musikforschung" und die Autorenseite
 * „Friedrich Gundolf" vor – obwohl beide schon aussortiert worden waren. Das Aussortieren
 * („Keine davon") wurde nirgends gespeichert: Es galt genau für diesen einen Lauf. Die
 * nächste Suche lief mit denselben Suchwörtern gegen dasselbe Archiv und lieferte dieselben
 * Treffer in derselben Reihenfolge.
 *
 * Diese Datei hält die Ablehnungen als reine Daten – gespeichert wird im Hauptprozess
 * (`main/services/storage/quellenAblehnungen.ts`), geprüft in jeder Materialsuche
 * (Arbeitsblatt, Klassenarbeit, Bildsuche für Arbeitsblatt und Stundenverlauf). Zwei Arten:
 *
 * - `thema`:  „Für dieses Thema ausblenden" – die Seite kann zu einem anderen Thema durchaus
 *             passen (Gundolf zu „Shakespeare-Rezeption um 1900").
 * - `global`: „Nie wieder vorschlagen" – gilt für jedes Thema und jedes Programm.
 *
 * Verglichen wird über die NORMALISIERTE Adresse. Dieselbe Seite kommt in vielen Schreibweisen
 * an: mobil („de.m.wikisource.org"), mit Leerzeichen oder Unterstrich, prozentkodiert, mit
 * Anker oder Verfolgungsparametern, als Gutenberg-Textdatei oder Buchseite. Ohne Normalisierung
 * griffe eine Ablehnung nur bei genau der Schreibweise, in der sie ausgesprochen wurde.
 */

export type AblehnungsUmfang = 'thema' | 'global'
/** Text- oder Bildquelle – beide teilen dieselbe Liste, die Art steht nur zur Anzeige da */
export type AblehnungsArt = 'text' | 'bild'

export interface QuellenAblehnung {
  /** normalisierte Adresse (Vergleichsschlüssel) */
  schluessel: string
  /** Adresse, wie sie vorgeschlagen wurde – zum Anzeigen und Öffnen */
  url: string
  titel: string
  umfang: AblehnungsUmfang
  /** Themenschlüssel (nur bei `umfang: 'thema'`) */
  thema?: string
  /** Thema im Wortlaut der Lehrkraft – zur Anzeige */
  themaText?: string
  art: AblehnungsArt
  /** Programm, in dem abgelehnt wurde (nur zur Anzeige – die Ablehnung gilt überall) */
  programm?: string
  grund?: string
  /** ISO-Datum */
  datum: string
}

export interface AblehnungsDaten {
  version: 1
  eintraege: QuellenAblehnung[]
}

/** Was die Oberfläche zum Ablehnen schickt – Schlüssel und Datum ergänzt die App */
export type AblehnungsEingabe = Pick<QuellenAblehnung, 'url' | 'titel' | 'umfang' | 'art'> & Partial<Pick<QuellenAblehnung, 'themaText' | 'programm' | 'grund'>>

/** Obergrenze, damit die Datei nicht unbemerkt wächst – die ältesten Themen-Einträge fallen zuerst */
export const MAX_ABLEHNUNGEN = 5000

/** Parameter, die nur der Verfolgung dienen und dieselbe Seite unter einer anderen Adresse erscheinen lassen */
const VERFOLGUNG = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_[a-z]+|igshid|ref|ref_src|src|source|campaign|wt_mc|wt\.mc_id|at_[a-z_]+|cmp|ito|xtor)$/i

/** Kennung des Projekts Gutenberg aus allen üblichen Adressformen */
const GUTENBERG = /\/(?:ebooks|cache\/epub|files)\/(\d+)(?:[/.-]|$)/

const MEDIAWIKI = /(^|\.)(wikipedia|wikisource|wiktionary|wikibooks|wikiquote|wikiversity|wikivoyage|wikimedia)\.org$/

function sicherDekodieren(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * Vergleichsschlüssel einer Adresse.
 *
 * Bewusst großzügig: Lieber zwei verschiedene Seiten für gleich halten (dann bleibt eine
 * Seite zu viel ausgeblendet – sichtbar und aufhebbar) als eine abgelehnte Seite in einer
 * neuen Schreibweise wieder vorschlagen (genau der gemeldete Fehler).
 */
export function normalisiereQuellenUrl(adresse: string): string {
  const roh = String(adresse ?? '').trim()
  if (!roh) return ''
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(roh) ? roh : `https://${roh}`)
  } catch {
    return roh.toLowerCase()
  }
  let host = url.hostname.toLowerCase().replace(/^www\./, '')
  // Mobile Fassungen: de.m.wikisource.org, m.youtube.com, mobile.twitter.com …
  host = host.replace(/(^|\.)m\.(?=[^.]+\.[^.]+)/, '$1').replace(/^mobile\./, '')

  const gutenberg = host.endsWith('gutenberg.org') ? GUTENBERG.exec(url.pathname)?.[1] : undefined
  if (gutenberg) return `gutenberg.org/ebooks/${gutenberg}`

  if (MEDIAWIKI.test(host)) {
    // /w/index.php?title=X und /wiki/X sind dieselbe Seite
    const titel = url.pathname.startsWith('/wiki/') ? url.pathname.slice(6) : url.searchParams.get('title') ?? url.pathname
    const sauber = sicherDekodieren(titel).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    return `${host}/wiki/${sauber}`
  }

  const pfad = sicherDekodieren(url.pathname)
    .replace(/\/{2,}/g, '/')
    .replace(/\/(index|default)\.(html?|php|aspx?)$/i, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
  const parameter = [...url.searchParams.entries()]
    .filter(([k]) => !VERFOLGUNG.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .join('&')
  return `${host}${pfad}${parameter ? `?${parameter}` : ''}`
}

/**
 * Themenschlüssel: dieselben Wörter in beliebiger Reihenfolge und Schreibung.
 *
 * „German Macbeth Adaptations", „german macbeth adaptations" und „Macbeth – German
 * adaptations" sind für die Lehrkraft dasselbe Thema. Teil-Bezeichnungen der Klassenarbeit
 * („– Teil B: Mediation") gehören nicht dazu; deshalb übergibt die Klassenarbeit das Thema der
 * Arbeit, nicht das des Teils.
 */
export function themenSchluessel(thema: string): string {
  const woerter = String(thema ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
  return [...new Set(woerter)].sort().join(' ')
}

export const leereAblehnungen = (): AblehnungsDaten => ({ version: 1, eintraege: [] })

/** Liest eine gespeicherte Liste – Unbrauchbares fällt weg, statt die ganze Liste zu verwerfen */
export function pruefeAblehnungen(roh: unknown): AblehnungsDaten {
  const liste = (roh as { eintraege?: unknown } | null)?.eintraege
  if (!Array.isArray(liste)) return leereAblehnungen()
  const eintraege: QuellenAblehnung[] = []
  for (const e of liste as Partial<QuellenAblehnung>[]) {
    if (!e || typeof e.url !== 'string' || !e.url.trim()) continue
    const umfang: AblehnungsUmfang = e.umfang === 'global' ? 'global' : 'thema'
    const thema = typeof e.thema === 'string' ? e.thema : ''
    if (umfang === 'thema' && !thema) continue
    eintraege.push({
      schluessel: normalisiereQuellenUrl(e.url),
      url: e.url,
      titel: typeof e.titel === 'string' ? e.titel : '',
      umfang,
      ...(umfang === 'thema' ? { thema } : {}),
      ...(typeof e.themaText === 'string' && e.themaText ? { themaText: e.themaText } : {}),
      art: e.art === 'bild' ? 'bild' : 'text',
      ...(typeof e.programm === 'string' && e.programm ? { programm: e.programm } : {}),
      ...(typeof e.grund === 'string' && e.grund ? { grund: e.grund } : {}),
      datum: typeof e.datum === 'string' ? e.datum : new Date(0).toISOString()
    })
  }
  return { version: 1, eintraege }
}

/** Ist die Adresse abgelehnt – für dieses Thema oder überhaupt? Liefert den greifenden Eintrag. */
export function findeAblehnung(daten: AblehnungsDaten, url: string, thema = ''): QuellenAblehnung | undefined {
  const schluessel = normalisiereQuellenUrl(url)
  if (!schluessel) return undefined
  const t = thema ? themenSchluessel(thema) : ''
  return daten.eintraege.find((e) => e.schluessel === schluessel && (e.umfang === 'global' || (t !== '' && e.thema === t)))
}

/** Prüffunktion für eine Suche – einmal gebaut, für viele Treffer benutzt */
export function ablehnungsPruefer(daten: AblehnungsDaten, thema = ''): (url: string) => QuellenAblehnung | undefined {
  const t = thema ? themenSchluessel(thema) : ''
  const global = new Map<string, QuellenAblehnung>()
  const imThema = new Map<string, QuellenAblehnung>()
  for (const e of daten.eintraege) {
    if (e.umfang === 'global') global.set(e.schluessel, e)
    else if (t && e.thema === t) imThema.set(e.schluessel, e)
  }
  return (url) => {
    const s = normalisiereQuellenUrl(url)
    return global.get(s) ?? imThema.get(s)
  }
}

/**
 * Nimmt eine Ablehnung auf.
 *
 * „Nie wieder" ersetzt die Themen-Einträge derselben Adresse (sie sind dann überflüssig); eine
 * Themen-Ablehnung neben einer globalen ändert nichts.
 */
export function ablehnen(daten: AblehnungsDaten, eingabe: AblehnungsEingabe & { thema?: string }, jetzt = new Date()): AblehnungsDaten {
  const schluessel = normalisiereQuellenUrl(eingabe.url)
  if (!schluessel) return daten
  const umfang: AblehnungsUmfang = eingabe.umfang === 'global' ? 'global' : 'thema'
  const thema = umfang === 'thema' ? themenSchluessel(eingabe.thema ?? eingabe.themaText ?? '') : ''
  if (umfang === 'thema' && !thema) return daten
  if (daten.eintraege.some((e) => e.schluessel === schluessel && (e.umfang === 'global' || (umfang === 'thema' && e.thema === thema)))) return daten
  const eintrag: QuellenAblehnung = {
    schluessel,
    url: eingabe.url,
    titel: eingabe.titel ?? '',
    umfang,
    ...(thema ? { thema } : {}),
    ...(eingabe.themaText ? { themaText: eingabe.themaText } : {}),
    art: eingabe.art === 'bild' ? 'bild' : 'text',
    ...(eingabe.programm ? { programm: eingabe.programm } : {}),
    ...(eingabe.grund ? { grund: eingabe.grund } : {}),
    datum: jetzt.toISOString()
  }
  const rest = umfang === 'global' ? daten.eintraege.filter((e) => e.schluessel !== schluessel) : daten.eintraege
  let eintraege = [...rest, eintrag]
  if (eintraege.length > MAX_ABLEHNUNGEN) {
    // Zuerst die ältesten Themen-Einträge – „Nie wieder" bleibt
    const zuViel = eintraege.length - MAX_ABLEHNUNGEN
    const alteThemen = new Set(
      eintraege
        .filter((e) => e.umfang === 'thema')
        .sort((a, b) => a.datum.localeCompare(b.datum))
        .slice(0, zuViel)
    )
    eintraege = eintraege.filter((e) => !alteThemen.has(e))
  }
  return { version: 1, eintraege }
}

/**
 * Hebt Ablehnungen wieder auf.
 * - mit `url`: genau diese Seite (bei Thema nur für dieses Thema, sonst überall)
 * - ohne `url`, mit `thema`: alle Ausblendungen dieses Themas
 */
export function aufheben(daten: AblehnungsDaten, auswahl: { url?: string; thema?: string }): AblehnungsDaten {
  const schluessel = auswahl.url ? normalisiereQuellenUrl(auswahl.url) : ''
  const thema = auswahl.thema ? themenSchluessel(auswahl.thema) : ''
  if (!schluessel && !thema) return daten
  const trifft = (e: QuellenAblehnung): boolean => {
    if (schluessel && e.schluessel !== schluessel) return false
    // Mit Thema: nur die Ausblendungen dieses Themas – „Nie wieder" bleibt
    if (thema) return e.umfang === 'thema' && e.thema === thema
    return true
  }
  const eintraege = daten.eintraege.filter((e) => !trifft(e))
  return { version: 1, eintraege }
}

/** Zahl der Ausblendungen zu einem Thema (für den Hinweis „3 Quellen ausgeblendet") */
export function ausgeblendetImThema(daten: AblehnungsDaten, thema: string): number {
  const t = themenSchluessel(thema)
  return t ? daten.eintraege.filter((e) => e.umfang === 'thema' && e.thema === t).length : 0
}
