/**
 * Vorwissen einer Lerngruppe (13.10.2026, abgestimmt mit der Lehrkraft; Zusammenfassung in shared/vorwissenLerngruppe.ts).
 *
 *   GET /server/vorwissen?gruppe=<ID>   eigene Lerngruppe → Jahrgang, Lehrwerk, bekannte Wörter, Vorwissen (+ Text)
 *
 * Quellen: der eigene Kurs (Reihen, Blätter, Tests, Grammatik, Vokabeln, Lernende) und ALLE anderen Lerngruppen der Schule
 * mit mindestens MIN_GEMEINSAM gemeinsamen Lernenden – auch anderer Lehrkräfte und früherer Jahre (die Lerngruppe behält
 * beim Schuljahreswechsel ihre Kennung). Aus fremden Kursen nur Themen und Fehlerschwerpunkte, Kinderdaten nur der
 * gemeinsamen Lernenden; keine Noten, keine Testschnitte, keine Namen, keine Herkunft (Fach, Jahr, Lehrkraft).
 * Die Antwort geht nur an die Lehrkraft der Lerngruppe; an die KI geht erst der Text, den sie gesehen hat.
 */
import { kursFuerLernende } from '../shared/freigabePlan'
import { jahrgangAus } from '../shared/lernstand'
import { curriculumBand, curriculumThemen } from '../shared/fachvorgaben'
import { fachVorgaben } from './fachvorgaben'
import type { Vokabel } from '../shared/vokabeltrainer'
import { MIN_GEMEINSAM, vorwissenAus, vorwissenText, type KindKurz, type KursDaten, type VorwissenAntwort } from '../shared/vorwissenLerngruppe'
import { blaetterDerGruppe } from './arbeitsblaetter'
import { foerderDaten } from './foerdern'
import { grammatikDerGruppe, lehrwerkAutomatisch, lehrwerkStandVon } from './grammatik'
import { json, type Anfrage } from './http'
import { alleLerngruppen, gepruefteMitglieder, historie, lerngruppe, mitgliederVon, testDetailsDerGruppe, type Lerngruppe } from './onlinetest'
import { reihenDerGruppe } from './reihen'
import { db as vokDb, istOffen, json_, type Zeile as VokZeile } from './vokabeln'

/** Bekannte Wörter höchstens (wie KNOWN_WORD_LIMIT im Arbeitsblatt) */
const WOERTER_MAX = 400

/**
 * Lehrwerk-Stand einer Lerngruppe: von Hand gesetzt, sonst die zuletzt freigegebene Unit der Vokabeln. Den nur nach dem
 * Jahrgang GERATENEN Band (lehrwerkAutomatisch ohne Freigaben) nicht – das wäre kein Wissen über die Lerngruppe (Befund
 * im Test: Klasse 8 mit Green Line 2 stand als „Green Line 4" da).
 */
export function lehrwerkVon(g: Lerngruppe): { buch: string; unit: string } | null {
  const hand = lehrwerkStandVon(g.id)
  if (hand?.buch) return hand
  const letzte = lehrwerkAutomatisch(g.id)?.freigegeben.at(-1)
  if (letzte) return { buch: letzte.buch, unit: letzte.unit }
  // Schulinternes Curriculum (13.10.2026): Band des Jahrgangs – Wissen der Schule, nicht geraten
  const laut = curriculumBand(fachVorgaben(g.fach), jahrgangAus(g.name))
  return laut ? { buch: laut, unit: '' } : null
}

const lehrwerkText = (l: { buch: string; unit: string } | null): string | undefined => (l?.buch ? (l.unit ? `${l.buch}, bis ${l.unit}` : l.buch) : undefined)

/** Was ein Kurs weiß – `nur` beschränkt die Kinderdaten auf die gemeinsamen Lernenden (fremde Kurse) */
export function kursDaten(g: Lerngruppe, nur: Set<string> | null, jetzt = Date.now()): KursDaten {
  const lk = g.lehrkraft_id
  const themen: string[] = []
  const reihen = reihenDerGruppe(lk, g.id).filter((r) => !(r.geplantAb && r.geplantAb > jetzt))
  for (const r of reihen) themen.push(`Reihe „${r.titel}"${r.oberthema && r.oberthema !== r.titel ? ` (${r.oberthema})` : ''}`)
  const gram = grammatikDerGruppe(lk, g.id, jetzt).trainings.filter((t) => !t.extra)
  for (const t of gram) themen.push(`Grammatik: ${t.thema || t.titel}`)
  for (const b of blaetterDerGruppe(lk, g.id)) if (!(b.geplantAb && b.geplantAb > jetzt)) themen.push(`Arbeitsblatt „${b.thema || b.titel}"`)
  const details = testDetailsDerGruppe(g)
  const testSchwerpunkte: string[] = []
  for (const t of historie(g).tests) {
    const d = details[t.id]
    themen.push(`Test „${d?.thema || t.titel}"`)
    // „Fehlerart (3×)" – die Zahl bleibt weg, sie sagt ohne Teilnehmerzahl nichts
    for (const s of d?.schwerpunkte ?? []) testSchwerpunkte.push(`${s.replace(/\s*\(\d+×\)$/, '')} (Test „${d?.thema || t.titel}")`)
  }
  const kinder: KindKurz[] = foerderDaten(g, lk, jetzt, !nur)
    .filter((k) => !nur || nur.has(k.id))
    .map((k) => ({
      id: k.id,
      vokSicher: k.vokabeln && k.vokabeln.gesamt ? k.vokabeln.sicher / k.vokabeln.gesamt : null,
      wackelig: k.wackelig.map((w) => `${w.term} – ${w.translation}`),
      grammatik: k.grammatik.map((x) => ({ titel: x.titel, ampel: x.ampel })),
      blattSchwierig: k.blaetter?.schwierig ?? [],
      bedarf: k.handlungsbedarf
    }))
  return {
    themen,
    lernziele: reihen.flatMap((r) => r.lernziele),
    grammatik: gram.map((t) => ({
      thema: t.thema || t.titel,
      sicher: t.sicherSchnitt,
      fehler: t.probleme
        .filter((p) => p.typisch[0] && p.loesung && p.quote >= 0.3)
        .slice(0, 2)
        .map((p) => `${t.thema || t.titel}: „${p.typisch[0]}" statt „${p.loesung}"`)
    })),
    testSchwerpunkte,
    lehrwerk: lehrwerkText(lehrwerkVon(g)),
    kinder
  }
}

/** Freigegebene Wörter der laufenden Kurse der Lerngruppe, die zuletzt freigegebenen zuerst */
function bekannteWoerter(g: Lerngruppe, jetzt = Date.now()): { woerter: string[]; zahl: number } {
  let zeilen: VokZeile[] = []
  try {
    zeilen = vokDb()
      .prepare("SELECT * FROM vok_zuweisungen WHERE lehrkraft_id = ? AND lerngruppe_id = ? AND reihe = '' ORDER BY erstellt DESC")
      .all(g.lehrkraft_id, g.id) as unknown as VokZeile[]
  } catch {
    return { woerter: [], zahl: 0 }
  }
  const alle: string[] = []
  for (const z of zeilen.filter((x) => istOffen(x)).map((x) => kursFuerLernende(x, jetzt)))
    for (const v of [...json_(z.woerter, [] as Vokabel[])].reverse()) if (v.term && !alle.includes(v.term)) alle.push(v.term)
  return { woerter: alle.slice(0, WOERTER_MAX), zahl: alle.length }
}

/** Vorwissen einer Lerngruppe aus allen Kursen der Schule */
export function vorwissenDerGruppe(g: Lerngruppe, jetzt = Date.now()): VorwissenAntwort {
  // Nur geprüfte Mitglieder (23.10.2026): frei eingetragene Namen öffnen keine Lernstände aus fremden Kursen
  const ids = new Set(gepruefteMitglieder(g).map((n) => n.id))
  const eigen = kursDaten(g, null, jetzt)
  const andere: KursDaten[] = []
  if (ids.size >= MIN_GEMEINSAM)
    for (const x of alleLerngruppen()) {
      if (x.id === g.id) continue
      const gemeinsam = new Set(
        mitgliederVon(x)
          .map((n) => n.id)
          .filter((id) => ids.has(id))
      )
      if (gemeinsam.size < MIN_GEMEINSAM) continue
      try {
        andere.push(kursDaten(x, gemeinsam, jetzt))
      } catch {
        // Ein fremder Kurs mit kaputten Daten soll das Vorwissen nicht verhindern
      }
    }
  const vorwissen = vorwissenAus(eigen, andere)
  // Schulinternes Curriculum (13.10.2026): frühere Jahrgänge behandelt, spätere noch nicht (je höchstens 8)
  const jg = jahrgangAus(g.name)
  const vg = fachVorgaben(g.fach)
  if (vg?.themen && jg) {
    const spaeter: string[] = []
    for (let j = jg + 1; j <= 13; j++) spaeter.push(...(vg.themen[String(j)] ?? []))
    const frueher = curriculumThemen(vg, jg).frueher.slice(-8)
    if (frueher.length || spaeter.length) vorwissen.curriculum = { frueher, spaeter: spaeter.slice(0, 8) }
  }
  const w = bekannteWoerter(g, jetzt)
  return {
    gruppe: { id: g.id, name: g.name, fach: g.fach },
    jahrgang: jahrgangAus(g.name),
    lernende: ids.size,
    lehrwerk: lehrwerkVon(g),
    woerter: w.woerter,
    wortZahl: w.zahl,
    vorwissen,
    text: vorwissenText(vorwissen)
  }
}

export function vorwissenRoute(): (k: Anfrage) => Promise<boolean> {
  return async ({ url, req, res, sitzung }) => {
    if (url.pathname !== '/server/vorwissen') return false
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    if (sitzung.nutzer.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    if (req.method !== 'GET') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
    const g = lerngruppe(String(url.searchParams.get('gruppe') ?? ''))
    if (!g || g.lehrkraft_id !== sitzung.nutzer.id) return json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true
    return json(res, 200, vorwissenDerGruppe(g)), true
  }
}
