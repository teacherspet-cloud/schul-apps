/**
 * KI-Nutzung der Lehrkräfte über die Schlüssel der SCHULE (09.10.2026, Auftrag des Admins).
 *
 * Für den Reiter „KI-Zugänge" der Verwaltung (Übersicht je Lehrkraft, Balken je Tag) und die
 * Zusammenfassung im Reiter „Server" (serverZustand.ts, `setzeKiNutzungQuelle`).
 *
 * DATENSCHUTZ – ausdrücklicher Wunsch des Admins: Gezählt wird NUR, was über einen API-Schlüssel
 * läuft, den die Schule in „KI-Zugänge" hinterlegt und freigegeben hat. Private Zugänge der
 * Lehrkräfte – eigenes Abo (Codex, Claude Code …) oder eigener API-Schlüssel – werden weder
 * gezählt noch angezeigt (`zugangsArt`, `mitKiNutzung`). Ebenso nichts von Lernenden: Aufrufe im
 * Namen eines Schülerkontos zählen nicht, und gespeichert werden je Tag und Lehrkraft nur Zahlen
 * (Art des Auftrags, Anbieter, Anzahl, Fehler, Limits) – keine Inhalte, keine Titel.
 * Die Zahlen liegen verschlüsselt in `ki_nutzung.daten` (feldschutz.ts) und werden nach
 * 400 Tagen gelöscht (bis 10.10.2026: 90 Tage; länger, damit der Zeitraum „Schuljahr" vollständig ist).
 *
 * Seit 10.10.2026 (Übersicht mit Diagrammen, Kosten und Budget): je Eintrag zusätzlich Eingabe-/Ausgabe-Token und
 * das Modell (Schlüssel „art|anbieter|modell"), soweit der Anbieter Token meldet (`meldeTokens`, Haken in
 * main/services/ai/verbrauch.ts). Die Übersicht je Lehrkraft ist ANONYM: Die Antwort an die Oberfläche enthält
 * weder Namen noch Kennungen, nur „Lehrkraft A, B, C …" nach Nutzung im gewählten Zeitraum (`kiNutzungDashboard`).
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomBytes } from 'node:crypto'
import type { StructuredRequest } from '@shared/types'
import { istKompatibel } from '@shared/kiAnbieter'
import { budgetStand, buchstabe, kostenSchaetzen, preisFuer, type BudgetStufe, type KiBudget, type KiPreise } from '@shared/kiKosten'
import { schuljahrNachAugust } from '@shared/schulkalender'
import { alleNutzer, datenbank } from './datenbank'
import type { Aufruf } from './http'

// Arten der Aufträge und Limit-Erkennung: gemeinsam mit dem eigenen Verbrauch der Lehrkraft (09.10.2026, shared/kiArten.ts)
import { artVonSchema, istLimit, KI_ARTEN, type KiArt } from '@shared/kiArten'
export { artVonSchema, istLimit, KI_ARTEN, type KiArt }

export type Zugangsart = 'schule' | 'privat' | 'keiner'

/**
 * Über welchen Zugang läuft die Anfrage? Nur 'schule' wird gezählt.
 * Abo (Kommandozeilenprogramm) oder eigener Schlüssel der Lehrkraft = privat – auch wenn die
 * Schule für denselben Anbieter einen Schlüssel freigegeben hat (der eigene geht vor, settings.ts).
 */
export function zugangsArt(z: { abo: boolean; eigenerSchluessel: boolean; schulSchluessel: boolean }): Zugangsart {
  if (z.abo || z.eigenerSchluessel) return 'privat'
  return z.schulSchluessel ? 'schule' : 'keiner'
}

// ---------------------------------------------------------------- Speicher

interface Zahl {
  /** Anfragen */
  a: number
  /** Aufträge (verschiedene Fortschrittskennungen; ohne Kennung zählt jede Anfrage) */
  j: number
  /** Fehler */
  f: number
  /** davon Limits */
  l: number
  /** Eingabe-Token (seit 10.10.2026) */
  e?: number
  /** Ausgabe-Token (seit 10.10.2026) */
  o?: number
  /** Erfolgreiche Anfragen OHNE Token-Angabe des Anbieters (Kosten dann unvollständig) */
  u?: number
}
/** Schlüssel „art|anbieter" bzw. seit 10.10.2026 „art|anbieter|modell" → Zahlen */
type TagDaten = Record<string, Zahl>

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ki_nutzung (
  tag TEXT NOT NULL,
  nutzer_id TEXT NOT NULL,
  daten TEXT NOT NULL,
  PRIMARY KEY (tag, nutzer_id)
);`
const bereit = new WeakSet<object>()
const db = (): ReturnType<typeof datenbank> => {
  const d = datenbank()
  if (!bereit.has(d)) {
    d.exec(SCHEMA)
    bereit.add(d)
  }
  return d
}

const tagVon = (d: Date): string => d.toISOString().slice(0, 10)
export const HALTEN_TAGE = 400

export interface Nutzungsfall {
  nutzerId: string
  anbieter: string
  art: KiArt
  ergebnis: 'ok' | 'fehler' | 'limit'
  neuerAuftrag: boolean
  /** Vom Anbieter gemeldete Token (10.10.2026); fehlen sie, zählt die Anfrage als „ohne Token-Angabe" */
  eingabe?: number
  ausgabe?: number
  modell?: string
}

/** Zählt einen Aufruf. Fehler beim Zählen werden verschluckt – Zählen darf nie eine Anfrage scheitern lassen. */
export function merkeKiNutzung(f: Nutzungsfall, jetzt = new Date()): void {
  try {
    const d = db()
    const tag = tagVon(jetzt)
    const zeile = d.prepare('SELECT daten FROM ki_nutzung WHERE tag = ? AND nutzer_id = ?').get(tag, f.nutzerId) as { daten?: string } | undefined
    const daten = lies(zeile?.daten)
    const modell = (f.modell ?? '').replace(/\|/g, '/').slice(0, 120)
    const k = modell ? `${f.art}|${f.anbieter}|${modell}` : `${f.art}|${f.anbieter}`
    const z = (daten[k] ??= { a: 0, j: 0, f: 0, l: 0 })
    z.a += 1
    if (f.neuerAuftrag) z.j += 1
    if (f.ergebnis !== 'ok') z.f += 1
    if (f.ergebnis === 'limit') z.l += 1
    const e = Number.isFinite(f.eingabe) ? Math.max(0, f.eingabe!) : 0
    const o = Number.isFinite(f.ausgabe) ? Math.max(0, f.ausgabe!) : 0
    if (e) z.e = (z.e ?? 0) + e
    if (o) z.o = (z.o ?? 0) + o
    if (f.ergebnis === 'ok' && !e && !o) z.u = (z.u ?? 0) + 1
    if (zeile) d.prepare('UPDATE ki_nutzung SET daten = ? WHERE tag = ? AND nutzer_id = ?').run(JSON.stringify(daten), tag, f.nutzerId)
    else d.prepare('INSERT INTO ki_nutzung (tag, nutzer_id, daten) VALUES (?, ?, ?)').run(tag, f.nutzerId, JSON.stringify(daten))
    d.prepare('DELETE FROM ki_nutzung WHERE tag < ?').run(tagVon(new Date(jetzt.getTime() - HALTEN_TAGE * 864e5)))
  } catch {
    // Zählen ist Beiwerk
  }
}

const lies = (s: string | undefined): TagDaten => {
  try {
    return s ? (JSON.parse(s) as TagDaten) : {}
  } catch {
    return {}
  }
}

function zeilenAb(tage: number, jetzt: Date): { tag: string; nutzer_id: string; daten: TagDaten }[] {
  return zeilenSeit(tagVon(new Date(jetzt.getTime() - (tage - 1) * 864e5)))
}

function zeilenSeit(ab: string): { tag: string; nutzer_id: string; daten: TagDaten }[] {
  try {
    return (db().prepare('SELECT tag, nutzer_id, daten FROM ki_nutzung WHERE tag >= ?').all(ab) as { tag: string; nutzer_id: string; daten: string }[]).map((z) => ({
      tag: z.tag,
      nutzer_id: z.nutzer_id,
      daten: lies(z.daten)
    }))
  } catch {
    return []
  }
}

/** Die letzten `tage` Tage (älteste zuerst) */
export function tageListe(tage: number, jetzt = new Date()): string[] {
  return Array.from({ length: tage }, (_, i) => tagVon(new Date(jetzt.getTime() - (tage - 1 - i) * 864e5)))
}

/** Für den Reiter „Server" (serverZustand.ts): Aufträge und Anfragen je Tag, nur über Schlüssel der Schule */
export function kiNutzungJeTag(tage: number, jetzt = new Date()): { tag: string; auftraege: number; anfragen: number }[] {
  const summe = new Map<string, { auftraege: number; anfragen: number }>()
  for (const z of zeilenAb(tage, jetzt)) {
    const s = summe.get(z.tag) ?? { auftraege: 0, anfragen: 0 }
    for (const w of Object.values(z.daten)) {
      s.auftraege += w.j
      s.anfragen += w.a
    }
    summe.set(z.tag, s)
  }
  return tageListe(tage, jetzt).map((tag) => ({ tag, ...(summe.get(tag) ?? { auftraege: 0, anfragen: 0 }) }))
}

export type KiZeitraum = 'woche' | 'monat' | 'schuljahr'
export const KI_ZEITRAEUME: KiZeitraum[] = ['woche', 'monat', 'schuljahr']

/** Anfragen, Token, Euro (geschätzt; nur Anteile mit hinterlegtem Preis) */
export interface KiWerte {
  a: number
  t: number
  k: number
}

/** Eine Lehrkraft OHNE Namen und Kennung – nur Bezeichnung nach Rang im Zeitraum */
export interface KiAnonymeLehrkraft {
  bezeichnung: string
  anfragen: number
  tokens: number
  euro: number
  /** Anteil an der Gesamtnutzung (Token, ohne Token-Angaben: Anfragen) */
  anteil: number
}

export interface KiNutzungDashboard {
  zeitraum: KiZeitraum
  von: string
  bis: string
  summe: {
    anfragen: number
    auftraege: number
    eingabe: number
    ausgabe: number
    tokens: number
    /** Erfolgreiche Anfragen ohne Token-Angabe des Anbieters (ältere Einträge, Bilder …) */
    ohneToken: number
    /** null = keine Preise hinterlegt */
    euro: number | null
    /** Für einen Teil der Nutzung fehlt ein Preis oder die Token-Angabe */
    euroUnvollstaendig: boolean
    /** Für mindestens einen Anbieter ist nur EIN Preis eingetragen – er galt für alle Token */
    nurGesamtpreis: boolean
    fehler: number
    limits: number
    aktiveLehrkraefte: number
  }
  /** Letzte 30 Tage (älteste zuerst) – unabhängig vom Zeitraum */
  tage: string[]
  jeTagAnbieter: Record<string, KiWerte>[]
  jeTagArt: Record<string, KiWerte>[]
  /** Im Zeitraum */
  jeArt: Record<string, KiWerte>
  jeAnbieterZeitraum: Record<string, KiWerte>
  lehrkraefte: KiAnonymeLehrkraft[]
  monate: { monat: string; werte: KiWerte }[]
  /** 30 Tage: je Anbieter Zahl der Lehrkräfte und Anfragen (Köpfe der Zugänge) */
  jeAnbieter: Record<string, { lehrkraefte: number; anfragen: number }>
  /** Gesehene „anbieter|modell" (für die Preiseingabe) */
  modelle: string[]
  preise: KiPreise
  hatPreise: boolean
  budget: KiBudget | null
  budgetMonat: { monat: string; verbraucht: number; anteil: number; stufe: BudgetStufe; ohnePreise: boolean } | null
  arten: typeof KI_ARTEN
  haltenTage: number
}

/** Zufälliges Salz je Serverstart: Gleichstände werden damit unvorhersehbar, aber im Zeitraum fest geordnet */
const SALZ = randomBytes(16).toString('hex')
const ordnung = (id: string, kontext: string): string => createHash('sha256').update(`${SALZ}|${kontext}|${id}`).digest('hex')

function zerlege(k: string): { art: KiArt; anbieter: string; modell: string } {
  const [artRoh, anbieter = '?', ...rest] = k.split('|')
  return { art: (artRoh in KI_ARTEN ? artRoh : 'sonstiges') as KiArt, anbieter, modell: rest.join('|') }
}

const leer = (): KiWerte => ({ a: 0, t: 0, k: 0 })
function plus(m: Record<string, KiWerte>, schluessel: string, w: KiWerte): void {
  const z = (m[schluessel] ??= leer())
  z.a += w.a
  z.t += w.t
  z.k += w.k
}

/** Beginn des Zeitraums (JJJJ-MM-TT) */
export function zeitraumBeginn(zeitraum: KiZeitraum, jetzt: Date, schuljahrBeginn?: string): string {
  const heute = tagVon(jetzt)
  if (zeitraum === 'woche') return tageListe(7, jetzt)[0]
  if (zeitraum === 'monat') return tageListe(30, jetzt)[0]
  const sj = schuljahrBeginn && schuljahrBeginn <= heute ? schuljahrBeginn : `${schuljahrNachAugust(heute)}-08-01`
  const aeltester = tageListe(HALTEN_TAGE, jetzt)[0]
  return sj < aeltester ? aeltester : sj
}

/**
 * Übersicht für den Reiter „KI-Zugänge" (nur Admin; nur Schlüssel der Schule; keine Lernenden).
 * DATENSCHUTZ: Je Lehrkraft nur „Lehrkraft A, B …" nach Nutzung im Zeitraum – keine Namen, keine Kennungen.
 */
export function kiNutzungDashboard(
  zeitraum: KiZeitraum,
  o: { jetzt?: Date; preise?: KiPreise; budget?: KiBudget | null; schuljahrBeginn?: string } = {}
): KiNutzungDashboard {
  const jetzt = o.jetzt ?? new Date()
  const preise = o.preise ?? {}
  const hatPreise = Object.keys(preise).length > 0
  const heute = tagVon(jetzt)
  const tage = tageListe(30, jetzt)
  const index = new Map(tage.map((t, i) => [t, i]))
  const von = zeitraumBeginn(zeitraum, jetzt, o.schuljahrBeginn)
  const monat = heute.slice(0, 7)
  const monatBeginn = `${monat}-01`
  const ab = [von, tage[0], monatBeginn].sort()[0]
  const konten = new Map(alleNutzer().map((n) => [n.id, n]))

  const jeTagAnbieter = tage.map(() => ({}) as Record<string, KiWerte>)
  const jeTagArt = tage.map(() => ({}) as Record<string, KiWerte>)
  const jeArt: Record<string, KiWerte> = {}
  const jeAnbieterZeitraum: Record<string, KiWerte> = {}
  const jeMonat: Record<string, KiWerte> = {}
  const jeLk = new Map<string, KiWerte>()
  const anbieterNutzer = new Map<string, Set<string>>()
  const anbieterAnfragen = new Map<string, number>()
  const modelle = new Set<string>()
  const summe = { anfragen: 0, auftraege: 0, eingabe: 0, ausgabe: 0, tokens: 0, ohneToken: 0, fehler: 0, limits: 0 }
  let euro = 0
  let euroUnvollstaendig = false
  let nurGesamtpreis = false
  let monatTokens = 0
  let monatEuro = 0

  for (const z of zeilenSeit(ab)) {
    // Lernende nie (Zählung nimmt sie ohnehin nicht auf – doppelt sicher)
    if (konten.get(z.nutzer_id)?.rolle === 'schueler') continue
    if (z.tag > heute) continue
    const i = index.get(z.tag)
    const imZeitraum = z.tag >= von
    for (const [k, w] of Object.entries(z.daten)) {
      const { art, anbieter, modell } = zerlege(k)
      const e = w.e ?? 0
      const aus = w.o ?? 0
      const kosten = kostenSchaetzen(e, aus, preisFuer(preise, anbieter, modell || undefined))
      const werte: KiWerte = { a: w.a, t: e + aus, k: kosten.euro ?? 0 }
      modelle.add(modell ? `${anbieter}|${modell}` : anbieter)
      if (i !== undefined) {
        plus(jeTagAnbieter[i], anbieter, werte)
        plus(jeTagArt[i], art, werte)
        ;(anbieterNutzer.get(anbieter) ?? anbieterNutzer.set(anbieter, new Set()).get(anbieter)!).add(z.nutzer_id)
        anbieterAnfragen.set(anbieter, (anbieterAnfragen.get(anbieter) ?? 0) + w.a)
      }
      if (z.tag >= monatBeginn) {
        monatTokens += werte.t
        monatEuro += werte.k
      }
      if (!imZeitraum) continue
      summe.anfragen += w.a
      summe.auftraege += w.j
      summe.eingabe += e
      summe.ausgabe += aus
      summe.tokens += werte.t
      summe.ohneToken += w.u ?? 0
      summe.fehler += w.f
      summe.limits += w.l
      euro += werte.k
      if (hatPreise && ((kosten.euro === null && w.a > w.f) || (w.u ?? 0) > 0)) euroUnvollstaendig = true
      if (kosten.nurGesamtpreis && werte.t) nurGesamtpreis = true
      plus(jeArt, art, werte)
      plus(jeAnbieterZeitraum, anbieter, werte)
      plus(jeMonat, z.tag.slice(0, 7), werte)
      const lk = jeLk.get(z.nutzer_id) ?? leer()
      lk.a += werte.a
      lk.t += werte.t
      lk.k += werte.k
      jeLk.set(z.nutzer_id, lk)
    }
  }

  // Anonym: nach Nutzung (Token, ohne Token-Angaben Anfragen), Gleichstand nach gesalzenem Prüfwert – Kennungen bleiben hier
  const nachToken = summe.tokens > 0
  const mass = (w: KiWerte): number => (nachToken ? w.t : w.a)
  const gesamt = Math.max(1, [...jeLk.values()].reduce((s, w) => s + mass(w), 0))
  const kontext = `${zeitraum}|${von}`
  const lehrkraefte: KiAnonymeLehrkraft[] = [...jeLk.entries()]
    .filter(([, w]) => w.a > 0)
    .map(([id, w]) => ({ w, o: ordnung(id, kontext) }))
    .sort((x, y) => mass(y.w) - mass(x.w) || y.w.a - x.w.a || x.o.localeCompare(y.o))
    .map(({ w }, rang) => ({ bezeichnung: `Lehrkraft ${buchstabe(rang)}`, anfragen: w.a, tokens: w.t, euro: w.k, anteil: mass(w) / gesamt }))

  let budgetMonat: KiNutzungDashboard['budgetMonat'] = null
  if (o.budget) {
    const ohnePreise = o.budget.art === 'euro' && !hatPreise
    const verbraucht = o.budget.art === 'euro' ? monatEuro : monatTokens
    budgetMonat = { monat, verbraucht, ohnePreise, ...(ohnePreise ? { anteil: 0, stufe: 'ok' as BudgetStufe } : budgetStand(verbraucht, o.budget.wert)) }
  }

  return {
    zeitraum,
    von,
    bis: heute,
    summe: { ...summe, euro: hatPreise ? euro : null, euroUnvollstaendig, nurGesamtpreis, aktiveLehrkraefte: lehrkraefte.length },
    tage,
    jeTagAnbieter,
    jeTagArt,
    jeArt,
    jeAnbieterZeitraum,
    lehrkraefte,
    monate: Object.entries(jeMonat)
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([m, werte]) => ({ monat: m, werte })),
    jeAnbieter: Object.fromEntries([...anbieterNutzer].map(([a, s]) => [a, { lehrkraefte: s.size, anfragen: anbieterAnfragen.get(a) ?? 0 }])),
    modelle: [...modelle].sort(),
    preise,
    hatPreise,
    budget: o.budget ?? null,
    budgetMonat,
    arten: KI_ARTEN,
    haltenTage: HALTEN_TAGE
  }
}

// ---------------------------------------------------------------- Token aus dem Verbrauch (10.10.2026)

/** Sammelt während eines gezählten Aufrufs die vom Anbieter gemeldeten Token (mitKiNutzung) */
const tokenSammler = new AsyncLocalStorage<{ e: number; o: number; modell?: string }>()

/**
 * Haken für main/services/ai/verbrauch.ts › merkeVerbrauch: Läuft gerade ein gezählter Aufruf über einen Schlüssel der
 * Schule, landen dessen Token (und das Modell) bei diesem Aufruf. Außerhalb (private Zugänge) passiert nichts.
 */
export function meldeTokens(_anbieter: string, modell: string, teil: { eingabe?: number; ausgabe?: number }): void {
  const s = tokenSammler.getStore()
  if (!s) return
  if (Number.isFinite(teil.eingabe)) s.e += teil.eingabe!
  if (Number.isFinite(teil.ausgabe)) s.o += teil.ausgabe!
  if (modell && !s.modell) s.modell = modell
}

// ---------------------------------------------------------------- Zählen beim Aufruf

/** Was die Zählung über den angemeldeten Nutzer und seinen Zugang wissen muss (für Tests austauschbar) */
export interface NutzungsUmgebung {
  nutzer: () => { id: string; rolle: string } | undefined
  /** Eingestellter Anbieter und Zugang (Abo/API) für Text bzw. Bild */
  einstellung: () => {
    textProvider: string
    access: Record<string, string>
    imageProvider: string
    imageAccess: Record<string, string>
  }
  /** Hat der Nutzer SELBST einen Schlüssel für diesen Anbieter? */
  eigenerSchluessel: (anbieter: string) => boolean
  /** Hat die Schule einen Schlüssel für diesen Anbieter freigegeben? */
  schulSchluessel: (anbieter: string) => boolean
  merke: (f: Nutzungsfall) => void
}

const KI_KANAELE = new Set(['ai:structured', 'ai:image', 'ai:websuche'])

/** Bereits gezählte Fortschrittskennungen (ein Auftrag mit mehreren Anfragen zählt einmal als Auftrag) */
const gesehen = new Map<string, number>()
const neuerAuftrag = (id: string | undefined): boolean => {
  if (!id) return true
  if (gesehen.has(id)) return false
  gesehen.set(id, Date.now())
  if (gesehen.size > 5000) for (const k of [...gesehen.keys()].slice(0, 1000)) gesehen.delete(k)
  return true
}

/** Umhüllt den Aufruf der Kanäle: zählt KI-Aufrufe über Schlüssel der Schule – sonst nichts */
export function mitKiNutzung(aufruf: Aufruf, u: NutzungsUmgebung): Aufruf {
  return async (kanal, args) => {
    if (!KI_KANAELE.has(kanal)) return aufruf(kanal, args)
    let fall: Omit<Nutzungsfall, 'ergebnis'> | null = null
    try {
      const n = u.nutzer()
      if (n && n.rolle !== 'schueler') {
        const e = u.einstellung()
        const req = kanal === 'ai:structured' && args[0] && typeof args[0] === 'object' ? (args[0] as StructuredRequest) : undefined
        const anbieter = kanal === 'ai:image' ? e.imageProvider : (req?.provider ?? e.textProvider)
        const abo = istKompatibel(anbieter) ? false : (kanal === 'ai:image' ? e.imageAccess[anbieter] : e.access[anbieter]) === 'subscription'
        const art = zugangsArt({ abo, eigenerSchluessel: u.eigenerSchluessel(anbieter), schulSchluessel: u.schulSchluessel(anbieter) })
        // NUR Schlüssel der Schule – private Zugänge werden nicht gezählt (Wunsch des Admins, Datenschutz)
        if (art === 'schule' && anbieter !== 'none') {
          fall = { nutzerId: n.id, anbieter, art: artVonSchema(req?.schemaName, kanal), neuerAuftrag: neuerAuftrag(req?.progressId ?? (typeof args[1] === 'string' ? args[1] : undefined)) }
        }
      }
    } catch {
      fall = null
    }
    // Token des Aufrufs sammeln (meldeTokens) – nur bei gezählten Aufrufen über den Schlüssel der Schule
    const token = { e: 0, o: 0 } as { e: number; o: number; modell?: string }
    const mitToken = (f: Omit<Nutzungsfall, 'ergebnis'>): Omit<Nutzungsfall, 'ergebnis'> => ({
      ...f,
      ...(token.e ? { eingabe: token.e } : {}),
      ...(token.o ? { ausgabe: token.o } : {}),
      ...(token.modell ? { modell: token.modell } : {})
    })
    try {
      const wert = fall ? await tokenSammler.run(token, () => aufruf(kanal, args)) : await aufruf(kanal, args)
      if (fall) u.merke({ ...mitToken(fall), ergebnis: 'ok' })
      return wert
    } catch (e) {
      const meldung = e instanceof Error ? e.message : String(e)
      const abbruch = e instanceof Error && (e.name === 'AbortError' || /abgebrochen/i.test(meldung))
      if (fall && !abbruch) u.merke({ ...mitToken(fall), ergebnis: istLimit(meldung) ? 'limit' : 'fehler' })
      throw e
    }
  }
}
