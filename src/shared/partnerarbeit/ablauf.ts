/**
 * Ablauf einer Gruppe in der Partnerarbeit (24.10.2026, abgestimmt mit der Lehrkraft) – rein rechnend, ohne Server:
 *  - feste Reihenfolge der gewählten Teile (Interview → Monolog → Dialog), danach neue Runde mit neuen Karten bis zum Ende
 *  - Interview: A fragt (Fragen abhakbar, je Frage eine Nachfrage), B antwortet; zu dritt antworten B und C abwechselnd
 *    („dran"). Nach jeder Unterrunde gibt A eine kurze Rückmeldung (3 Smileys, ein Satz – nur für die Gruppe), dann
 *    wechseln die Rollen mit neuer Karte, bis jede Person einmal A war.
 *  - Monolog: A liest den Arbeitsauftrag vor, sieht Zusatzfragen und schaltet B den Bildwortschatz, Phrases und
 *    Beispielsätze frei; B sieht nur Bild und Auftrag. Zu dritt beschreiben B und C je ein Bild (zwei Bilder einer Karte
 *    oder zwei Karten). Uhr (Prüfungszeit) nur bei A, nur wenn eingeschaltet.
 *  - Dialog: Rollen getrennt wie im Druckset (A = Rolle 1, B = Rolle 2, C = Rolle 3); jede Person schaltet sich eigene
 *    Vorschläge, Wortschatz, Phrases und Beispiele frei. Zu dritt ohne dritte Rolle: C ist „Helfer", sieht beide
 *    Rollenkarten mit Hilfen und schaltet sie den Sprechenden frei. Info-Gap: fremde Informationen bleiben verborgen.
 *  - Jedes Set funktioniert zu zweit UND zu dritt (Wahl der Karte nach Gruppengröße).
 * Sichten enthalten nie Namen. Die Lehrkraft nutzt dieselben Funktionen für die Vorschau A|B(|C) im Browser.
 */
import { dialogRollen, karteFuer3, type DialogRolle, type SprechKarte, type Wortschatz } from '../sprechen/karten'
import { minutenJeTeil, stufeVonNiveau, type Niveau, type SprechSprache } from '../sprechen/niveaus'
import { phrasesBis, GRUPPEN, type GruppeId } from '../sprechen/phrases'
import type { PaEinstellungen, PaGruppe, PaSchritt, PaTeil, Rolle } from './typen'

export type Karten = Map<string, SprechKarte>
export type Zufall = () => number

export type HilfeArt = 'wortschatz' | 'phrases' | 'beispiele' | 'vorschlaege' | 'leitfragen'
export const HILFE_NAME: Record<HilfeArt, string> = {
  wortschatz: 'Wortschatz',
  phrases: 'Phrases',
  beispiele: 'Beispielsätze',
  vorschlaege: 'Vorschläge',
  leitfragen: 'Leitfragen'
}

/** Arbeitsauftrag zum Bild, wenn die Karte keinen eigenen hat (statt die Leitfragen aufzuzählen – Befund 24.10.2026) */
const AUFTRAG_ALLGEMEIN: Record<SprechSprache, string> = {
  en: 'Describe the picture: who can you see, where are they and what is happening? What do you think about it?',
  fr: "Décris l'image : qui vois-tu, où sont-ils et que se passe-t-il ? Qu'en penses-tu ?",
  es: 'Describe la imagen: ¿a quién ves, dónde están y qué pasa? ¿Qué opinas?'
}

// ---------------------------------------------------------------- Karten wählen

/** Karten eines Teils, die sich nutzen lassen (Monolog nur mit Bild) */
const nutzbar = (karten: Karten, teil: PaTeil): SprechKarte[] =>
  [...karten.values()].filter((k) => k.art === teil && (k.art !== 'monolog' || k.bilder.length > 0))

const wahl = <T>(l: T[], zufall: Zufall): T | undefined => (l.length ? l[Math.min(l.length - 1, Math.floor(zufall() * l.length))] : undefined)

/**
 * Karte(n) für einen Schritt nach Gruppengröße: Zweier jede Karte; Dreier-Dialog bevorzugt Karten mit dritter Rolle;
 * Dreier-Monolog bevorzugt Karten mit zwei Bildern, sonst zwei Karten. Nicht aus `benutzt`; ist alles benutzt, von vorn.
 */
export function kartenWaehlen(teil: PaTeil, groesse: number, karten: Karten, benutzt: string[], zufall: Zufall = Math.random): SprechKarte[] {
  const alle = nutzbar(karten, teil)
  if (!alle.length) return []
  const frisch = alle.filter((k) => !benutzt.includes(k.id))
  const vorrat = frisch.length ? frisch : alle
  if (teil === 'dialog' && groesse >= 3) {
    const mitDritter = vorrat.filter(karteFuer3)
    return [wahl(mitDritter.length ? mitDritter : vorrat, zufall)!]
  }
  if (teil === 'monolog' && groesse >= 3) {
    const zwei = vorrat.filter((k) => k.art === 'monolog' && k.bilder.length >= 2)
    if (zwei.length) return [wahl(zwei, zufall)!]
    const erste = wahl(vorrat, zufall)!
    const rest = (frisch.length > 1 ? frisch : alle).filter((k) => k.id !== erste.id)
    const zweite = wahl(rest, zufall)
    return zweite ? [erste, zweite] : [erste]
  }
  return [wahl(vorrat, zufall)!]
}

// ---------------------------------------------------------------- Schritte

const unterrunden = (teil: PaTeil, g: PaGruppe): number => (teil === 'dialog' ? 1 : g.mitglieder.length)

/** Rollen je Unterrunde: A wandert durch die Gruppe, die übrigen sind B (und C); Dialog ohne dritte Rolle → Helfer */
function rollenFuer(teil: PaTeil, g: PaGruppe, unterrunde: number, karte: SprechKarte | undefined): Record<string, Rolle> {
  const m = g.mitglieder
  const aus: Record<string, Rolle> = {}
  const start = unterrunde % m.length
  const reihe = [...m.slice(start), ...m.slice(0, start)]
  reihe.forEach((id, i) => (aus[id] = (['A', 'B', 'C'] as Rolle[])[i] ?? 'C'))
  if (teil === 'dialog' && m.length >= 3 && karte && !karteFuer3(karte)) aus[reihe[2]] = 'helfer'
  return aus
}

export function schrittNeu(teil: PaTeil, g: PaGruppe, unterrunde: number, karten: Karten, jetzt: number, zufall: Zufall = Math.random): PaSchritt | null {
  const k = kartenWaehlen(teil, g.mitglieder.length, karten, g.benutzt, zufall)
  if (!k.length) return null
  const rollen = rollenFuer(teil, g, unterrunde, k[0])
  const antwortende = g.mitglieder.filter((id) => rollen[id] !== 'A' && rollen[id] !== 'helfer')
  return {
    teil,
    karten: k.map((x) => x.id),
    rollen,
    ...(teil !== 'dialog' && antwortende.length > 1 ? { dran: antwortende[0] } : {}),
    unterrunde,
    haken: [],
    frei: {},
    fertig: [],
    seit: jetzt
  }
}

/** Nächsten Teil der Reihenfolge finden, für den es Karten gibt (ab `ab`), sonst null */
function naechsterTeil(e: PaEinstellungen, karten: Karten, ab: number): number | null {
  for (let i = ab; i < e.teile.length; i++) if (nutzbar(karten, e.teile[i]).length) return i
  return null
}

/** Gruppe mit erstem Schritt (oder ohne, wenn es keine Karten gibt) */
export function gruppeStarten(g: PaGruppe, e: PaEinstellungen, karten: Karten, jetzt: number, zufall: Zufall = Math.random): PaGruppe {
  const i = naechsterTeil(e, karten, 0)
  if (i === null) return { ...g, teilIndex: 0, schritt: null }
  const schritt = schrittNeu(e.teile[i], g, 0, karten, jetzt, zufall)
  return { ...g, teilIndex: i, schritt, benutzt: schritt ? [...g.benutzt, ...schritt.karten] : g.benutzt }
}

/** Nach „Weiter": nächste Unterrunde, sonst nächster Teil, sonst neue Runde */
export function weiterNachTeil(g: PaGruppe, e: PaEinstellungen, karten: Karten, jetzt: number, zufall: Zufall = Math.random): void {
  const s = g.schritt
  const teil = s?.teil ?? e.teile[g.teilIndex] ?? e.teile[0]
  const naechsteUnterrunde = s ? s.unterrunde + 1 : 0
  let neu: PaSchritt | null = null
  if (s && naechsteUnterrunde < unterrunden(teil, g)) neu = schrittNeu(teil, g, naechsteUnterrunde, karten, jetzt, zufall)
  else {
    let i = naechsterTeil(e, karten, g.teilIndex + 1)
    if (i === null) {
      g.runde++
      i = naechsterTeil(e, karten, 0)
    }
    if (i !== null) {
      g.teilIndex = i
      neu = schrittNeu(e.teile[i], g, 0, karten, jetzt, zufall)
    }
  }
  g.schritt = neu
  if (neu) g.benutzt = [...g.benutzt, ...neu.karten].slice(-200)
}

const antwortendeVon = (s: PaSchritt): string[] =>
  Object.entries(s.rollen)
    .filter(([, r]) => r !== 'A' && r !== 'helfer')
    .map(([id]) => id)

/**
 * Aktion einer Person auf den Schritt anwenden – Rückgabe: Fehlertext oder null.
 *  haken {index} · freischalten {was, fuer?} · naechste · wechsel · fertig · weiter
 */
export function schrittAktion(
  g: PaGruppe,
  wer: string,
  aktion: string,
  wert: unknown,
  e: PaEinstellungen,
  karten: Karten,
  jetzt: number,
  zufall: Zufall = Math.random
): string | null {
  const s = g.schritt
  if (!s) {
    if (aktion === 'weiter') return weiterNachTeil(g, e, karten, jetzt, zufall), null
    return 'Gerade läuft kein Schritt.'
  }
  const rolle = s.rollen[wer]
  if (!rolle) return 'Du gehörst nicht zu dieser Gruppe.'
  const w = (wert ?? {}) as Record<string, unknown>
  switch (aktion) {
    case 'haken': {
      if (rolle !== 'A' || s.teil === 'dialog') return 'Nur wer fragt, hakt ab.'
      const i = Math.round(Number(w.index))
      if (!Number.isFinite(i) || i < 0) return 'Unbekannte Frage.'
      s.haken = s.haken.includes(i) ? s.haken.filter((x) => x !== i) : [...s.haken, i]
      return null
    }
    case 'freischalten': {
      const was = String(w.was ?? '') as HilfeArt
      if (!(was in HILFE_NAME)) return 'Unbekannte Hilfe.'
      // Interview/Monolog: A schaltet den Antwortenden frei; Dialog: jede Person sich selbst, der Helfer den Sprechenden
      const ziele =
        s.teil === 'dialog'
          ? rolle === 'helfer'
            ? Object.keys(s.rollen).filter((id) => s.rollen[id] !== 'helfer')
            : [wer]
          : rolle === 'A'
          ? antwortendeVon(s)
          : []
      if (!ziele.length) return 'Hilfen schaltet frei, wer fragt.'
      const an = w.an !== false
      for (const id of ziele) {
        const l = s.frei[id] ?? []
        s.frei[id] = an ? [...new Set([...l, was])] : l.filter((x) => x !== was)
      }
      return null
    }
    case 'naechste': {
      if (rolle !== 'A' || !s.dran) return 'Nur zu dritt wechselt, wer antwortet.'
      const a = antwortendeVon(s)
      s.dran = a[(a.indexOf(s.dran) + 1) % a.length]
      return null
    }
    case 'wechsel':
    case 'fertig': {
      if (s.teil !== 'dialog' && rolle !== 'A') return 'Nur wer fragt, beendet die Runde.'
      if (s.rueckmeldung) return null
      s.rueckmeldung = true
      s.fertig = [...new Set([...s.fertig, wer])]
      return null
    }
    case 'weiter': {
      if (!s.rueckmeldung) return 'Erst die Runde beenden.'
      weiterNachTeil(g, e, karten, jetzt, zufall)
      return null
    }
    default:
      return 'Unbekannte Aktion.'
  }
}

// ---------------------------------------------------------------- Sicht

export interface PhraseSicht {
  text: string
  deutsch: string
}
export interface HilfenSicht {
  wortschatz?: Wortschatz[]
  /** Zur Karte passende Phrases (KI) – sonst der allgemeine Bestand */
  phrases?: PhraseSicht[]
  /** Allgemeiner Bestand, wenn die Karte eigene Phrases hat (ausklappbar „mehr Phrases") */
  mehrPhrases?: PhraseSicht[]
  beispiele?: string[]
  vorschlaege?: string[]
}
export interface SchrittSicht {
  teil: PaTeil
  rolle: Rolle
  phase: 'arbeit' | 'rueckmeldung'
  unterrunde: number
  unterrunden: number
  /** Zu dritt: bin ich dran (B/C) bzw. wer ist dran (A: Symbol kommt vom Server) */
  dran?: boolean
  dranId?: string
  titel: string
  interview?: { fragen: { text: string; nachfrage?: string; haken: boolean }[] }
  /**
   * Monolog: der Sprechende sieht Bild und Auftrag; `leitfragen` nur, wenn A sie freischaltet. A sieht statt der
   * Leitfragen die zusammengeführten `impulse` (Leitfragen + Zusatzfragen, ohne Doppelung) als „Wenn es stockt".
   */
  monolog?: { bilder: string[]; auftrag: string; leitfragen: string[]; impulse?: string[]; beschreibung?: string }
  dialog?: { form: string; situation: string; ziel: string; punkte: string[]; rolle: DialogRolle | null; alleRollen?: DialogRolle[] }
  /** Was ich selbst sehe (A: alles; B/C: Freigeschaltetes; Dialog: eigene freigeschaltete) */
  hilfen: HilfenSicht
  /** Hilfen, die ich freischalten kann (A, Helfer, Dialog: für mich) mit Zustand */
  schalter: { was: HilfeArt; an: boolean }[]
  uhr?: { seit: number; zielMinuten: number }
  rueckmeldung?: { geber: boolean; abgegeben: boolean; erhalten: { smileys: number[]; satz: string }[] }
  kann: { haken: boolean; naechste: boolean; wechsel: boolean; fertig: boolean; weiter: boolean }
}

export interface Umfeld {
  sprache: SprechSprache
  niveau: Niveau
  uhr: boolean
  jetzt: number
}

const PHRASE_GRUPPEN: Record<PaTeil, GruppeId[]> = {
  interview: ['person', 'familie', 'freizeit', 'ferien', 'vorlieben', 'verbinden', 'zeit'],
  monolog: ['bild', 'meinung', 'verbinden', 'zeit'],
  dialog: ['meinung', 'diskussion', 'zustimmen', 'widersprechen', 'nachfragen', 'unterbrechen', 'einigen', 'rollenspiel', 'zeit']
}

function phrasesFuer(teil: PaTeil, u: Umfeld, form?: string): PhraseSicht[] {
  let gruppen = PHRASE_GRUPPEN[teil]
  if (teil === 'dialog' && form)
    gruppen = gruppen.filter((g) => (form === 'infogap' ? g !== 'widersprechen' && g !== 'einigen' : form === 'diskussion' ? g !== 'rollenspiel' : true))
  const erlaubt = new Set<GruppeId>(gruppen.filter((g) => GRUPPEN.some((x) => x.id === g)))
  return phrasesBis(stufeVonNiveau(u.niveau))
    .filter((p) => erlaubt.has(p.gruppe))
    .map((p) => ({ text: p.text[u.sprache], deutsch: p.situation }))
}

const nurFrei = (alle: HilfenSicht, frei: string[]): HilfenSicht =>
  Object.fromEntries(Object.entries(alle).filter(([k]) => frei.includes(k === 'mehrPhrases' ? 'phrases' : k))) as HilfenSicht

/** Phrases der Karte zuerst, der Bestand als „mehr" */
function phrasesVon(k: SprechKarte, teil: PaTeil, u: Umfeld, form?: string): Pick<HilfenSicht, 'phrases' | 'mehrPhrases'> {
  const eigene = k.hilfen?.phrases ?? []
  const bestand = phrasesFuer(teil, u, form)
  return eigene.length ? { phrases: eigene.map((p) => ({ text: p.text, deutsch: p.wann })), mehrPhrases: bestand } : { phrases: bestand }
}

/** Sicht einer Person auf den laufenden Schritt – nie fremde Rollenkarten (Info-Gap), nie Namen */
export function sichtSchritt(
  g: PaGruppe,
  wer: string,
  karten: Karten,
  u: Umfeld,
  rueckmeldungen: { von: string; smileys: number[]; satz: string; zeit: number }[]
): SchrittSicht | null {
  const s = g.schritt
  if (!s) return null
  const rolle = s.rollen[wer]
  if (!rolle) return null
  const k = karten.get(s.karten[0])
  const istA = rolle === 'A'
  const frei = s.frei[wer] ?? []
  const phase: SchrittSicht['phase'] = s.rueckmeldung ? 'rueckmeldung' : 'arbeit'
  const basis: SchrittSicht = {
    teil: s.teil,
    rolle,
    phase,
    unterrunde: s.unterrunde,
    unterrunden: unterrunden(s.teil, g),
    titel: k ? (k.art === 'interview' ? k.thema : k.titel) : '',
    hilfen: {},
    schalter: [],
    kann: { haken: false, naechste: false, wechsel: false, fertig: false, weiter: Boolean(s.rueckmeldung) }
  }
  if (s.dran) {
    basis.dran = s.dran === wer
    if (istA) basis.dranId = s.dran
  }
  const erhalten = rueckmeldungen.filter((r) => r.zeit >= s.seit && r.von !== wer).map((r) => ({ smileys: r.smileys, satz: r.satz }))
  if (s.rueckmeldung) {
    const geber = s.teil !== 'dialog' && istA
    basis.rueckmeldung = { geber, abgegeben: rueckmeldungen.some((r) => r.zeit >= s.seit && r.von === wer), erhalten }
  }
  if (!k) return basis
  const oberstufe = u.niveau.startsWith('B2') || u.niveau === 'B1+'
  const uhr = (): void => {
    if (u.uhr && istA && phase === 'arbeit') basis.uhr = { seit: s.seit, zielMinuten: minutenJeTeil(u.niveau, oberstufe)[s.teil] }
  }

  if (k.art === 'interview' && s.teil === 'interview') {
    const alle: HilfenSicht = { wortschatz: k.hilfen?.wortschatz ?? [], ...phrasesVon(k, 'interview', u), beispiele: k.hilfen?.beispiele ?? [] }
    if (istA) {
      basis.interview = { fragen: k.fragen.map((f, i) => ({ text: f, nachfrage: k.hilfen?.nachfragen[i], haken: s.haken.includes(i) })) }
      basis.hilfen = alle
      const ziel = antwortendeVon(s)[0]
      basis.schalter = (['wortschatz', 'phrases', 'beispiele'] as HilfeArt[]).map((was) => ({ was, an: Boolean(ziel && s.frei[ziel]?.includes(was)) }))
      basis.kann = { ...basis.kann, haken: phase === 'arbeit', naechste: Boolean(s.dran) && phase === 'arbeit', wechsel: phase === 'arbeit' }
    } else basis.hilfen = nurFrei(alle, frei)
    uhr()
    return basis
  }
  if (k.art === 'monolog' && s.teil === 'monolog') {
    // Zu dritt: B das erste Bild, C das zweite (zweite Karte oder zweites Bild)
    const antwortende = antwortendeVon(s)
    const zweite = karten.get(s.karten[1])
    const bilderVon = (id: string): { karte: SprechKarte & { art: 'monolog' }; bilder: string[] } => {
      const i = antwortende.indexOf(id)
      if (i <= 0) return { karte: k, bilder: k.bilder.length >= 2 && antwortende.length > 1 ? [k.bilder[0]] : k.bilder }
      if (zweite?.art === 'monolog') return { karte: zweite, bilder: zweite.bilder }
      return { karte: k, bilder: k.bilder.length >= 2 ? [k.bilder[1]] : k.bilder }
    }
    const auftrag = (kk: SprechKarte & { art: 'monolog' }): string => kk.hilfen?.auftrag || AUFTRAG_ALLGEMEIN[u.sprache]
    const alleFuer = (kk: SprechKarte & { art: 'monolog' }): HilfenSicht => ({
      wortschatz: kk.hilfen?.wortschatz ?? [],
      ...phrasesVon(kk, 'monolog', u),
      beispiele: kk.hilfen?.beispiele ?? []
    })
    if (istA) {
      const wen = s.dran ?? antwortende[0]
      const { karte: kk, bilder } = bilderVon(wen)
      basis.titel = kk.titel
      // Leitfragen der Karte und Zusatzfragen der KI zusammen als Impulse, ohne Doppelung
      const impulse = [...new Set([...kk.leitfragen, ...(kk.hilfen?.zusatzfragen ?? [])].map((x) => x.trim()).filter(Boolean))]
      basis.monolog = { bilder, auftrag: auftrag(kk), leitfragen: [], impulse, beschreibung: kk.bildBeschreibung }
      basis.hilfen = alleFuer(kk)
      basis.schalter = (['leitfragen', 'wortschatz', 'phrases', 'beispiele'] as HilfeArt[]).map((was) => ({
        was,
        an: Boolean(wen && s.frei[wen]?.includes(was))
      }))
      basis.kann = { ...basis.kann, naechste: Boolean(s.dran) && phase === 'arbeit', wechsel: phase === 'arbeit' }
    } else {
      const { karte: kk, bilder } = bilderVon(wer)
      basis.titel = kk.titel
      // Der Sprechende sieht nur Bild und Auftrag; die Leitfragen erst, wenn A sie freischaltet
      basis.monolog = { bilder, auftrag: auftrag(kk), leitfragen: frei.includes('leitfragen') ? kk.leitfragen : [] }
      basis.hilfen = nurFrei(alleFuer(kk), frei)
    }
    uhr()
    return basis
  }
  if (k.art === 'dialog' && s.teil === 'dialog') {
    const rollen = dialogRollen(k)
    const index = rolle === 'A' ? 0 : rolle === 'B' ? 1 : rolle === 'C' ? 2 : -1
    const meine = index >= 0 ? rollen[index] ?? null : null
    const alleFuer = (r: DialogRolle | null): HilfenSicht => ({
      vorschlaege: r?.vorschlaege ?? [],
      wortschatz: r?.wortschatz ?? [],
      ...phrasesVon(k, 'dialog', u, k.form),
      beispiele: r?.beispiele ?? []
    })
    const arten: HilfeArt[] = ['vorschlaege', 'wortschatz', 'phrases', 'beispiele']
    if (rolle === 'helfer') {
      // Rückfall ohne dritte Rolle: sieht beide Rollenkarten samt Hilfen, schaltet den Sprechenden frei
      const sprechende = Object.keys(s.rollen).filter((id) => s.rollen[id] !== 'helfer')
      basis.dialog = { form: k.form, situation: k.situation, ziel: k.ziel, punkte: k.punkte, rolle: null, alleRollen: rollen.slice(0, 2) }
      basis.hilfen = {
        ...phrasesVon(k, 'dialog', u, k.form),
        vorschlaege: rollen.slice(0, 2).flatMap((r) => r.vorschlaege),
        wortschatz: rollen.slice(0, 2).flatMap((r) => r.wortschatz),
        beispiele: rollen.slice(0, 2).flatMap((r) => r.beispiele)
      }
      basis.schalter = arten.map((was) => ({ was, an: sprechende.every((id) => s.frei[id]?.includes(was)) }))
    } else {
      basis.dialog = { form: k.form, situation: k.situation, ziel: k.ziel, punkte: k.punkte, rolle: meine }
      basis.hilfen = nurFrei(alleFuer(meine), frei)
      basis.schalter = arten.map((was) => ({ was, an: frei.includes(was) }))
    }
    basis.kann = { ...basis.kann, fertig: phase === 'arbeit' }
    uhr()
    return basis
  }
  return basis
}

/** Für die Vorschau der Lehrkraft und Tests: eine Probegruppe mit Kennungen A/B(/C) */
export function probeGruppe(groesse: 2 | 3, jetzt = 0): PaGruppe {
  return { id: 'probe', mitglieder: groesse === 3 ? ['pa', 'pb', 'pc'] : ['pa', 'pb'], runde: 1, teilIndex: 0, schritt: null, benutzt: [], seit: jetzt }
}
