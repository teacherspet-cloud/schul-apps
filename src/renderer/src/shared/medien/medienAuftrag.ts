/**
 * Medienaufträge der Vokabellisten (06.10.2026, Wunsch der Lehrkraft): Beispielbilder suchen, Bilder von der KI
 * erzeugen, Aussprache und Satz-Aussprache erzeugen – als Hintergrund-Aufträge in der Auftragsleiste unten rechts
 * (shared/auftraege.ts), wie beim Arbeitsblatt.
 *
 * - Jeder Auftrag gehört zu einer STELLE: einer eigenen Liste (docId = Kennung der Liste) oder einem Abschnitt
 *   eines Schulbuchs (docId = „buch:<Kennung>|<Unit>|<Abschnitt>"). „Öffnen" in der Leiste führt genau dorthin
 *   (VokabellisteModule meldet den Öffner an).
 * - Mehrere Abschnitte lassen sich auf einmal in Auftrag geben; es laufen höchstens zwei Medienaufträge
 *   zugleich, die übrigen warten sichtbar der Reihe nach.
 * - Meldet ein Dienst eine Begrenzung (429, Kontingent, Nutzungsgrenze des Abos), wartet der Auftrag – „wartet
 *   bis 14:35" – und macht danach weiter (medienWarten.ts). Die Sperre gilt für alle Aufträge desselben Dienstes.
 * - Ein Pop-up („Von der KI erzeugen") darf geschlossen werden: Der Auftrag läuft weiter, die Tabelle zeigt das
 *   Bild, sobald es da ist (`medienGeaendert`).
 */
import { satzSchluessel, saetzeVon, sprachKurz, istGanzerSatz, STIMMLAGEN, tonPasst, tonVon, type Bildstufe, type MedienSicht, type Stimmen, type Stimmlage } from '@shared/medienbank'
import { starteAuftrag, type AuftragsKontext } from '../auftraege'
import { bildErzeugen, bildKandidaten, kandidatUebernehmen, kiWaehltMehr, MOTIVE_JE_ANFRAGE, motiveWaehlen, motivWaehlen, stufeDer, tonErzeugen, type Ki, type Lernende, type Vokabel } from './medienbank'
import { istBildBlockiert } from '@shared/bildBlockiert'
import { DIENST_NAME, DienstSperren, MAX_WARTEN_MS, Plaetze, uhrzeitLabel, wartezeit, type Dienst } from './medienWarten'
import { sprechText, sprechTextFuerWort } from '@shared/sprechtext'
import { figurenAus, fassungenAusAntwort, fassungsAuftrag, istFassungsKandidat, satzFuerLage, type FassungsAntwort } from '@shared/satzFassung'

/**
 * Sprechtext (09.10.2026): Abkürzungen gesprochen statt gelesen („YA (= young adults)" → „Y. A., young adults",
 * „sb" → „somebody"), eigene Aussprache der Lehrkraft zuerst. Wörter ohne Abkürzung bleiben, wie sie sind.
 */
export const gesprochenFuer = (art: 'wort' | 'satz', text: string, v: Pick<Vokabel, 'term' | 'aussprache'>, sprache: string): string =>
  art === 'wort' ? sprechTextFuerWort(v, sprache) : sprechText(text, sprache)

/** Passt die Aufnahme noch zum Wort und zu seinem Sprechtext? (seit 10.10.2026 gemeinsam in shared/medienbank.ts) */
export { tonPasst }

export const MEDIEN_MODUL = 'vokabelliste'

/** Wo die Vokabeln stehen – Ziel von „Öffnen" */
export interface MedienZiel {
  docId: string
  /** Name in der Auftragsleiste („Green Line 1 – Unit 2, A") */
  titel: string
  /** Klassenstufe der Lernenden (Bildart: Cliparts bis Klasse 6) */
  klasse?: number
  /** Bildstufe – von Hand gewählt (Medienleiste), sonst aus der Klasse */
  stufe?: Bildstufe
}

export const zielListe = (id: string, name: string, klasse?: number): MedienZiel => ({ docId: id, titel: name || 'Vokabelliste', klasse })
export const zielBuch = (buchId: string, buchName: string, unit: string, abschnitt: string, klasse?: number): MedienZiel => ({
  docId: `buch:${buchId}|${unit}|${abschnitt}`,
  titel: `${buchName} – ${unit}, ${abschnitt}`,
  klasse
})
/** Kennung eines Schulbuch-Abschnitts zurücklesen (null = eine eigene Liste) */
export function leseBuchZiel(docId: string): { buchId: string; unit: string; abschnitt: string } | null {
  if (!docId.startsWith('buch:')) return null
  const [buchId, unit = '', abschnitt = ''] = docId.slice(5).split('|')
  return buchId ? { buchId, unit, abschnitt } : null
}

/*
 * Welche Stelle gerade im Programm zu sehen ist – dann genügt bei „Öffnen" der Wechsel ins Programm.
 * Listen- und Buch-Editor melden sich hier an und ab.
 */
let ansicht: string | null = null
export function setzeVokabelAnsicht(docId: string | null): void {
  ansicht = docId
}
export const istVokabelAnsicht = (docId: string): boolean => ansicht === docId

/* Tabellen hören mit: Nach jedem erledigten Wort zeigen sie den neuen Stand (auch nach geschlossenem Pop-up) */
const hoerer = new Set<(sprache: string) => void>()
export function aufMedienAenderung(fn: (sprache: string) => void): () => void {
  hoerer.add(fn)
  return () => void hoerer.delete(fn)
}
export function medienGeaendert(sprache: string): void {
  for (const fn of hoerer) fn(sprachKurz(sprache))
}

export type MedienArt = 'bilder' | 'aussprache' | 'satz' | 'bildKi' | 'formen' | 'hinweis'

const ART_NAME: Record<MedienArt, string> = {
  bilder: 'Beispielbilder suchen',
  aussprache: 'Aussprache erzeugen',
  satz: 'Satz-Aussprache erzeugen',
  bildKi: 'Beispielbild von der KI',
  formen: 'Aussprache der Verbformen',
  hinweis: 'Aussprache der Hinweise'
}

/*
 * Unregelmäßige Verben (07.10.2026): Die Formen und der Hinweis einer Zeile liegen als „Sätze" im Eintrag der
 * Grundform – so teilen alle Bände (und die Vokabellisten) Bild und Aussprache eines Verbs.
 */
const fehlendeTexte = (art: MedienArt, v: Vokabel, sicht: MedienSicht | undefined, lage: Stimmlage): string[] => {
  const texte = art === 'formen' ? v.formen ?? [] : art === 'hinweis' && v.hinweis?.trim() ? [v.hinweis] : []
  const da = saetzeVon(sicht, lage) ?? {}
  return [...new Set(texte.map((t) => t.trim()).filter(Boolean))].filter((t) => !da[satzSchluessel(t)])
}

/** Schlüssel des Auftrags (Knöpfe zeigen „läuft", solange er da ist) */
export const medienSchluessel = (art: MedienArt, wort?: string): string => `medien:${art}${wort ? `:${wort}` : ''}`

const sperren = new DienstSperren()
/** Letzte Begrenzungsmeldung je Dienst – für einen ehrlichen Wartetext (12.10.2026) */
const grund = new Map<Dienst, string>()
/**
 * „ausgelastet" stimmte meist nicht (12.10.2026): Ist das Codex-Kontingent des ChatGPT-Abos (5-Stunden-Fenster)
 * ausgeschöpft, steht das so da – Bilder auf chatgpt.com laufen über ein eigenes Kontingent und gehen dann oft noch.
 */
function warteGrund(dienst: Dienst): string {
  const m = grund.get(dienst) ?? ''
  if (/nutzungsgrenze|usage limit/i.test(m)) return 'Das KI-Kontingent des ChatGPT-Abos (Codex, 5-Stunden-Fenster) ist ausgeschöpft'
  if (/\b429\b|zu viele anfragen|too many requests|rate.?limit/i.test(m)) return `${DIENST_NAME[dienst]} meldet zu viele Anfragen`
  return `${DIENST_NAME[dienst]} ist ausgelastet`
}
const plaetze = new Plaetze(2)
const schlafe = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms))

/**
 * Einen Schritt bei einem Dienst ausführen – mit Warten bei Begrenzung. Vorher: Ist der Dienst gesperrt
 * (eben 429 bekommen, auch in einem anderen Auftrag), erst bis dahin warten.
 */
export async function beimDienst<T>(k: Pick<AuftragsKontext, 'signal' | 'pausiere'>, dienst: Dienst, schritt: () => Promise<T>): Promise<T> {
  let gewartet = 0
  for (let versuch = 0; ; versuch++) {
    const bis = sperren.gesperrtBis(dienst)
    if (bis) {
      const ms = bis - Date.now()
      gewartet += ms
      await k.pausiere(`${warteGrund(dienst)} – wartet bis ${uhrzeitLabel(bis)}`, schlafe(ms))
    }
    try {
      return await schritt()
    } catch (e) {
      if (k.signal.aborted) throw e
      const ms = wartezeit(e, versuch)
      if (ms === null || gewartet + ms > MAX_WARTEN_MS) throw e
      grund.set(dienst, e instanceof Error ? e.message : String(e))
      sperren.sperre(dienst, Date.now() + ms)
    }
  }
}

export interface MedienStart {
  art: MedienArt
  sprache: string
  vokabeln: Vokabel[]
  ziel: MedienZiel
  /** Nur diese Fassungen der Aussprache – fehlt = alle, für die eine Standardstimme eingestellt ist */
  lagen?: Stimmlage[]
  /** Nur diese Wörter, auch wenn sie schon Medien haben (einzelne Zelle, Pop-up) – sonst nur, was fehlt */
  einzeln?: boolean
  /**
   * „Neue Aussprache erzeugen" der Admins (12.10.2026, Rechtsklick auf das Aussprache-Symbol): auch eine passende
   * Aufnahme ersetzen; die bisherige bleibt als Rückfall (`vorher`). `grund`: was bemängelt wurde.
   */
  neu?: { grund?: string }
  /** Figuren des Lehrwerks für angepasste Beispielsätze (12.10.2026) – fehlt = aus den Beispielsätzen geschätzt */
  figuren?: string[]
}

export interface MedienErgebnis {
  erledigt: number
  leer: number
  fehler: number
  gesamt: number
  /** Wörter, deren KI-Bild das Sicherheitssystem abgelehnt hat (12.10.2026) – Ersatz kam aus der Bildsuche */
  blockiert?: string[]
}

/** Fehlt diesem Wort die Aussprache in dieser Fassung? */
const tonFehlt = (art: MedienArt, v: Vokabel, sicht: MedienSicht | undefined, lage: Stimmlage, sprache: string): boolean => {
  if (art === 'formen' || art === 'hinweis') return fehlendeTexte(art, v, sicht, lage).length > 0
  if (art === 'aussprache') return !tonPasst(tonVon(sicht, lage), v.term, gesprochenFuer('wort', v.term, v, sprachKurz(sprache)))
  if (!istGanzerSatz(v.example)) return false
  /*
   * Geschlechtsbezogene Beispielsätze (12.10.2026, shared/satzFassung.ts): Ein Kandidat des Vorfilters ohne gemerkte
   * Entscheidung ist offen (die KI prüft ihn im Auftrag); sonst spricht jede Stimme ihre Fassung – fehlt deren Aufnahme,
   * ist der Satz offen, auch wenn das Original schon vertont ist.
   */
  if (istFassungsKandidat(v.example, sprache) && !sicht?.fassungen?.[satzSchluessel(v.example!)]) return true
  return !saetzeVon(sicht, lage)?.[satzSchluessel(satzFuerLage(v.example!, sicht?.fassungen, lage))]
}

/**
 * Was einem Wort fehlt – nur das wird in Auftrag gegeben. `lagen`: Fassungen der Aussprache, die es geben soll
 * (eingestellte Standardstimmen, 07.10.2026) – fehlt eine davon, ist das Wort offen.
 */
export function offeneVokabeln(
  art: MedienArt,
  vokabeln: Vokabel[],
  daten: Record<string, MedienSicht>,
  lagen: Stimmlage[] = ['w'],
  stufe: Bildstufe = 's2',
  /** Sprache der Wörter – für den Sprechtext von Abkürzungen (09.10.2026) */
  sprache = 'en'
): Vokabel[] {
  const woerter = vokabeln.filter((v) => v.term.trim())
  // Bildstufen (07.10.2026): offen ist, was in DIESER Stufe kein Bild hat – außer die KI sah dafür kein eindeutiges
  if (art === 'bilder' || art === 'bildKi')
    return woerter.filter((v) => !daten[v.term]?.bildStufenDa?.includes(stufe) && !daten[v.term]?.ohneBild?.includes(stufe))
  return woerter.filter((v) => lagen.some((l) => tonFehlt(art, v, daten[v.term], l, sprache)))
}

/** Fassungen, für die eine Standardstimme eingestellt ist */
export const lagenVon = (s: Stimmen | undefined): Stimmlage[] => STIMMLAGEN.filter((l) => Boolean(s?.[l]))

/** Ein Wort bearbeiten; false = kein passendes Bild gefunden */
async function eines(
  art: MedienArt,
  sp: string,
  v: Vokabel,
  stimmen: Stimmen,
  lagen: Stimmlage[],
  sicht: MedienSicht | undefined,
  einzeln: boolean,
  lernende: Lernende,
  k: AuftragsKontext,
  /** Meldet ein vom Sicherheitssystem abgelehntes Bild (12.10.2026) */
  abgelehnt?: (wort: string) => void,
  /** „Neue Aussprache erzeugen" (12.10.2026): ersetzen, bisherige als Rückfall */
  neu?: { grund?: string },
  /** Schon gebündelt geplantes Bildmotiv (12.10.2026, `motiveWaehlen`) – sonst plant das Wort einzeln */
  geplant?: { eindeutig: boolean; motiv: string }
): Promise<boolean> {
  const ki: Ki = { ai: k.ai, bild: k.bild }
  if (art === 'formen' || art === 'hinweis') {
    for (const l of lagen) {
      const texte = einzeln
        ? [...new Set((art === 'formen' ? v.formen ?? [] : [v.hinweis ?? '']).map((t) => t.trim()).filter(Boolean))]
        : fehlendeTexte(art, v, sicht, l)
      // Verbformen: Sprechtext der Zelle (Varianten mit Pause, „read" der Vergangenheit /rɛd/ – 09.10.2026)
      const gesprochen = (t: string): string => (art === 'formen' && v.formenGesprochen?.[t]) || gesprochenFuer('satz', t, v, sp)
      for (const t of texte) await beimDienst(k, 'sprache', () => tonErzeugen(sp, v.term, 'satz', t, stimmen[l]!, l, gesprochen(t)))
    }
    return true
  }
  if (art === 'aussprache' || art === 'satz') {
    // Je Fassung mit eingestellter Stimme – nur die fehlende, außer bei einzelnem Neu-Erzeugen
    for (const l of lagen) {
      if (!einzeln && !tonFehlt(art, v, sicht, l, sp)) continue
      // Beispielsatz: die Fassung dieser Stimme (geschlechtsbezogene Sätze, 12.10.2026), sonst das Original
      const satzFuer = (lage: Stimmlage): string => satzFuerLage(v.example ?? '', sicht?.fassungen, lage)
      const neuOpt = neu ? { behalteVorher: true, grund: neu.grund } : {}
      const stimme = stimmen[l]!
      await beimDienst(k, 'sprache', () =>
        art === 'aussprache'
          ? tonErzeugen(sp, v.term, 'wort', v.term, stimme, l, gesprochenFuer('wort', v.term, v, sp), Boolean(neu), neuOpt)
          : tonErzeugen(sp, v.term, 'satz', satzFuer(l), stimme, l, gesprochenFuer('satz', satzFuer(l), v, sp), Boolean(neu), neuOpt)
      )
    }
    return true
  }
  const stufe = stufeDer(lernende)
  if (art === 'bildKi') {
    // Erst das Motiv (und ob es sich für diese Stufe eindeutig zeigen lässt); einzeln angefordert, wird es trotzdem versucht
    const m = geplant ?? (await beimDienst(k, 'ki', () => motivWaehlen(sp, v, lernende, ki)))
    if (!m.eindeutig && !einzeln) return await window.api.medien.ohneBild(sp, v.term, stufe), false
    /*
     * Abgelehnt (12.10.2026, abgestimmt mit der Lehrkraft): Lehnt das Sicherheitssystem das Motiv ab, wird sofort – ohne
     * Warten – einmal mit einem vorsichtigeren, kindgerechten Motiv versucht; klappt auch das nicht, kommt das Bild aus
     * der Bildsuche und das Wort wird in der Vokabelliste markiert. Früher hieß das „ausgelastet" und der Auftrag wartete.
     */
    const blockiert = (e: unknown): boolean => !k.signal.aborted && istBildBlockiert(e instanceof Error ? e.message : String(e))
    try {
      return await beimDienst(k, 'bildki', () => bildErzeugen(sp, v, lernende, ki, m.motiv)), true
    } catch (e) {
      if (!blockiert(e)) throw e
    }
    try {
      const vorsichtig = await beimDienst(k, 'ki', () => motivWaehlen(sp, v, lernende, ki, m.motiv || v.term))
      return await beimDienst(k, 'bildki', () => bildErzeugen(sp, v, lernende, ki, vorsichtig.motiv)), true
    } catch (e) {
      if (!blockiert(e)) throw e
    }
    abgelehnt?.(v.term)
    const ersatz = await beimDienst(k, 'bildsuche', () => bildKandidaten(sp, v, lernende))
    if (!ersatz.length) return false
    const wahl = await beimDienst(k, 'ki', () => kiWaehltMehr(sp, v, ersatz, lernende, ki))
    if (wahl.i < 0) return false
    await beimDienst(k, 'bildsuche', () => kandidatUebernehmen(sp, v.term, ersatz[wahl.i], ersatz, stufe, true))
    return true
  }
  const kandidaten = await beimDienst(k, 'bildsuche', () => bildKandidaten(sp, v, lernende))
  if (!kandidaten.length) return false
  const w = await beimDienst(k, 'ki', () => kiWaehltMehr(sp, v, kandidaten, lernende, ki))
  if (w.nichtZeigbar && !einzeln) await window.api.medien.ohneBild(sp, v.term, stufe)
  if (w.i < 0) return false
  await beimDienst(k, 'bildsuche', () => kandidatUebernehmen(sp, v.term, kandidaten[w.i], kandidaten, stufe))
  return true
}

/**
 * Geschlechtsbezogene Beispielsätze (12.10.2026, shared/satzFassung.ts): Kandidaten des Vorfilters ohne gemerkte
 * Entscheidung gehen gebündelt an die KI (ein Aufruf je Liste, höchstens 40 Sätze je Aufruf). Das Ergebnis – auch
 * „keine Anpassung nötig" – kommt in die Medienbank. Scheitert die KI, geht es ohne Fassungen weiter (die Sätze bleiben
 * offen und werden beim nächsten Auftrag erneut geprüft). true = es wurde etwas gespeichert.
 */
async function fassungenErmitteln(sp: string, liste: Vokabel[], daten: Record<string, MedienSicht>, figuren: string[], k: AuftragsKontext): Promise<boolean> {
  const offen = liste.filter((v) => istFassungsKandidat(v.example, sp) && !daten[v.term]?.fassungen?.[satzSchluessel(v.example!)])
  let gespeichert = false
  for (let i = 0; i < offen.length && !k.signal.aborted; i += 40) {
    const teil = offen.slice(i, i + 40)
    const kandidaten = teil.map((v, j) => ({ nr: j + 1, satz: v.example!, ...(v.exampleTranslation ? { uebersetzung: v.exampleTranslation } : {}) }))
    k.melde(`Beispielsätze prüfen: Ich-Form mit Geschlecht (${teil.length})`, 0, Math.max(1, liste.length))
    try {
      const antwort = await beimDienst(k, 'ki', () => k.ai<FassungsAntwort>(fassungsAuftrag(sp, kandidaten, figuren)))
      const neu = fassungenAusAntwort(kandidaten, antwort)
      for (const v of teil) {
        const f = neu[satzSchluessel(v.example!)]
        if (!f) continue
        await window.api.medien.fassungSetzen(sp, v.term, v.example!, f)
        gespeichert = true
      }
    } catch (fehler) {
      if (k.signal.aborted) throw fehler
    }
  }
  return gespeichert
}

/**
 * Startet einen Medienauftrag. Liefert das Ergebnis, sobald er fertig ist (null bei Abbruch oder Fehler –
 * der Fehler steht dann schon als Hinweis da). Wer nur anstoßen will, wartet nicht darauf.
 */
export function starteMedienAuftrag(s: MedienStart): Promise<MedienErgebnis | null> {
  const sp = sprachKurz(s.sprache)
  const wort = s.einzeln && s.vokabeln.length === 1 ? s.vokabeln[0].term : undefined
  return starteAuftrag<MedienStart, MedienErgebnis>({
    moduleId: MEDIEN_MODUL,
    docId: s.ziel.docId,
    titel: wort ? `„${wort}" – ${s.ziel.titel}` : s.ziel.titel,
    art: ART_NAME[s.art],
    eingabe: s,
    istOffen: () => istVokabelAnsicht(s.ziel.docId),
    // Medien ändern die Liste nicht – das Dokument bleibt bearbeitbar
    sperrt: false,
    schluessel: medienSchluessel(s.art, wort),
    fehlerTitel: `${ART_NAME[s.art]}: fehlgeschlagen`,
    arbeit: async (e, k) => {
      let frei = plaetze.nimm()
      if (!frei) {
        const platz = plaetze.belege(k.signal)
        try {
          frei = await k.pausiere('Wartet, bis andere Medienaufträge fertig sind …', platz)
        } catch (fehler) {
          // Platz kam zugleich mit dem Abbruch: gleich wieder freigeben
          platz.then(
            (f) => f(),
            () => undefined
          )
          throw fehler
        }
      }
      try {
        let liste = e.vokabeln.filter((v) => v.term.trim())
        const ton = e.art === 'aussprache' || e.art === 'satz' || e.art === 'formen' || e.art === 'hinweis'
        // Weibliche und männliche Fassung (07.10.2026): je eingestellter Standardstimme
        const stimmen: Stimmen = ton ? (await window.api.medien.stimmen())[sp] ?? {} : {}
        const lagen = lagenVon(stimmen).filter((l) => !e.lagen || e.lagen.includes(l))
        if (ton && !lagen.length)
          throw new Error('Für diese Sprache ist keine Standardstimme eingestellt (Einstellungen › Bilder und Hörtexte › „Aussprache der Vokabeln“).')
        // Frisch nachsehen, was fehlt – inzwischen kann ein anderer Auftrag einiges erledigt haben
        let daten = await window.api.medien.eintraege(
          sp,
          liste.map((v) => v.term)
        )
        if (!e.einzeln) liste = offeneVokabeln(e.art, liste, daten, lagen, stufeDer({ klasse: e.ziel.klasse, stufe: e.ziel.stufe }), sp)
        // Geschlechtsbezogene Beispielsätze (12.10.2026): ungeprüfte Kandidaten vorher in EINEM KI-Aufruf, dann frisch laden
        if (e.art === 'satz' && (await fassungenErmitteln(sp, liste, daten, e.figuren ?? figurenAus(e.vokabeln.map((v) => v.example)), k)))
          daten = await window.api.medien.eintraege(
            sp,
            liste.map((v) => v.term)
          )
        const erg: MedienErgebnis = { erledigt: 0, leer: 0, fehler: 0, gesamt: liste.length }
        let ersterFehler: unknown = null
        // Bildmotive gebündelt planen (12.10.2026): je 20 Wörter EINE Abo-Anfrage statt einer je Wort
        const motive = new Map<string, { eindeutig: boolean; motiv: string }>()
        for (const [i, v] of liste.entries()) {
          if (k.signal.aborted) break
          k.melde(`„${v.term}" (${i + 1} von ${liste.length})`, i, liste.length)
          try {
            const abgelehnt = (w: string): void => void (erg.blockiert ??= []).push(w)
            const lernende = { klasse: e.ziel.klasse, stufe: e.ziel.stufe }
            if (e.art === 'bildKi' && liste.length > 1 && i % MOTIVE_JE_ANFRAGE === 0)
              try {
                const teil = liste.slice(i, i + MOTIVE_JE_ANFRAGE)
                for (const [t, m] of await beimDienst(k, 'ki', () => motiveWaehlen(sp, teil, lernende, { ai: k.ai, bild: k.bild }))) motive.set(t, m)
              } catch (f) {
                if (k.signal.aborted) throw f
                // Ohne Bündel plant jedes Wort einzeln – wie bisher
              }
            if (await eines(e.art, sp, v, stimmen, lagen, daten[v.term], Boolean(e.einzeln), lernende, k, abgelehnt, e.neu, motive.get(v.term))) erg.erledigt++
            else erg.leer++
            medienGeaendert(sp)
          } catch (fehler) {
            if (k.signal.aborted) throw fehler
            erg.fehler++
            ersterFehler ??= fehler
          }
        }
        k.melde('Fertig', liste.length, Math.max(1, liste.length))
        // Nichts ging: Der Fehler gehört in die Leiste (mit „Erneut versuchen"), nicht in eine Zusammenfassung
        if (erg.fehler && !erg.erledigt && !erg.leer) throw ersterFehler
        return erg
      } finally {
        frei?.()
      }
    },
    abschluss: (r) =>
      r.gesamt === 0
        ? 'Nichts zu tun – alles schon vorhanden.'
        : `${r.erledigt} von ${r.gesamt} erledigt${r.leer ? `, ${r.leer} ohne passendes Bild` : ''}${r.fehler ? `, ${r.fehler} mit Fehler` : ''}.${
            r.blockiert?.length
              ? ` KI-Bild vom Sicherheitssystem abgelehnt (Ersatz aus der Bildsuche, in der Liste markiert): ${r.blockiert.slice(0, 8).join(', ')}${r.blockiert.length > 8 ? ' …' : ''}.`
              : ''
          }`,
    ablegen: async () => medienGeaendert(sp)
  })
}

/** Nur für Tests: Sperren vergessen */
export const vergissSperren = (): void => sperren.leeren()
