/**
 * „Meine Klassen" (06.10.2026, abgestimmt mit der Lehrkraft): je Lerngruppe der Lernstand (Vokabeln und Grammatik),
 * Tests und Noten, Reihen und Blätter, oben der Handlungsbedarf, dazu Vorschläge für Material aus dem Lernstand.
 *
 * Runde 2 (06.10.2026): EINE Karte je Klasse – Lerngruppen gleichen Namens („5b" mit Englisch, Geschichte …) sind die
 * Fächer der Klasse; in der Klasse eine Fach-Leiste mit „+ Fach hinzufügen" (gleiche Lernenden, onlinetest.ts
 * `fachHinzufuegen`). Materialien mit mehr Details (auch beendete) und der vom Admin hinterlegten IServ-Ablagestruktur.
 *
 *   GET  /server/klassen               Übersicht: Klassen mit ihren Fächern
 *   GET  /server/klassen/<id>          eine Lerngruppe (Klasse + Fach) im Detail
 *   POST /server/klassen/<id>/fach     {fach} → Fach hinzufügen, liefert {id}
 *   POST /server/klassen/<id>/wackelig-wiederholen   wackelige Wörter im Kurs wieder fällig machen (09.10.2026)
 *   GET  /server/klassen/vorwahl?kurs=<id>            Lehrwerk-Vorwahl für „Vokabeln/Grammatik hinzufügen" (09.10.2026)
 *
 * Nur für Lehrkräfte; nur die eigenen Lerngruppen. Namen der Lernenden gehen nur an die Lehrkraft selbst.
 */
import { fachAusName, SPRACHFAECHER } from '../shared/faecher'
import { blaetterDerGruppe } from './arbeitsblaetter'
import { createHash } from 'node:crypto'
import { datenbank, serverWert } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { fachAbwaehlen, fachHinzufuegen, fehlerSchwerpunkte, historie, lerngruppe, lerngruppenVon, mitgliederVon, testDetailsDerGruppe, type Lerngruppe } from './onlinetest'
import { reihenDerGruppe } from './reihen'
import {
  db as vokDb,
  json_,
  klasseFuer,
  klassenKurseSichern,
  leerenKursLoeschen,
  lernendeVon,
  sprachfaecherDerGruppe,
  standSpeichern,
  standVon,
  ueberschriftVon,
  vokabelnDerGruppe,
  zeile,
  type Zeile
} from './vokabeln'
import type { Vokabel } from '../shared/vokabeltrainer'
import { grammatikDerGruppe, hoechsteUnit, lehrwerkStandVon } from './grammatik'
import { quelleUnits, type Quelle } from '../shared/vokabelLaufbahn'
import type { VorwahlDaten } from '../shared/lehrwerkVorwahl'
import type { NutzerInfo } from './datenbank'

const TAG = 86_400_000

/** Standard der IServ-Ablage (Verwaltung › IServ-Anbindung kann es ändern): Platzhalter {Klasse}, {Fach}, {Schuljahr} */
export const ABLAGE_STANDARD = 'Gruppen/Klasse {Klasse}/{Fach}'
export const ablageMuster = (): string => serverWert<string>('iserv-ablage', ABLAGE_STANDARD) || ABLAGE_STANDARD

/** „5b – Englisch"; ohne Fach nur der Name */
export const klassenTitel = (g: Pick<Lerngruppe, 'name' | 'fach'>): string => (g.fach ? `${g.name} – ${g.fach}` : g.name)

/** Alphabetisch, Zahlen natürlich („5b" vor „10a"), dann das Fach */
export const nachKlasse = (a: Pick<Lerngruppe, 'name' | 'fach'>, b: Pick<Lerngruppe, 'name' | 'fach'>): number =>
  a.name.localeCompare(b.name, 'de', { numeric: true }) || a.fach.localeCompare(b.fach, 'de')

/** Lerngruppen gleichen Namens bilden eine Klasse */
export const klassenSchluessel = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** Fremdsprache (oder alte Sprache, DaZ): dann gibt es den Reiter „Vokabeln & Grammatik" */
export const istSprachfach = (fach: string): boolean => {
  const f = fachAusName(fach)
  return Boolean(f && SPRACHFAECHER.includes(f.id))
}

/**
 * Merkmal eines Handlungsbedarf-Eintrags (09.10.2026, „Ausblenden"): woran sich erkennen lässt, ob die Lage gleich
 * geblieben ist. Nur Kennungen, Zahlen und ein Prüfwert des Textes – keine Namen (gespeichert trotzdem verschlüsselt).
 */
export interface Merkmal {
  art: string
  /** Betroffene (Lernenden-Kennungen, ggf. mit Vorsilbe je Grund) */
  ids?: string[]
  /** Anzahl (offene Antworten, fehlende Abgaben …) */
  zahl?: number
  /** Termin (Testtermin, Frist) */
  termin?: number | null
  /** Prüfwert des Textes (wenn es keine besseren Merkmale gibt) */
  text?: string
}

export interface Bedarf {
  art: 'entscheiden' | 'foerdern' | 'inaktiv' | 'termin' | 'reihe' | 'blatt'
  text: string
  /** Wohin der Klick führt */
  ziel?: { modul: string; id?: string }
  /** Stabile Kennung des Eintrags (Art + Ziel), zum Ausblenden */
  schluessel: string
  merkmal: Merkmal
}

/** Kurzer Prüfwert eines Textes */
export const pruefwert = (t: string): string => createHash('sha256').update(t).digest('hex').slice(0, 16)

/**
 * Ausgeblendeter Eintrag wieder sichtbar? (09.10.2026, Wunsch der Lehrkraft): Er bleibt verborgen, solange die Lage
 * gleich bleibt oder besser wird; er kommt wieder bei anderer Art, neuem Termin, neuen Betroffenen, höherer Zahl oder
 * (ohne solche Merkmale) anderem Text.
 */
export function bedarfWiederSichtbar(alt: Merkmal, neu: Merkmal): boolean {
  if (alt.art !== neu.art) return true
  if ((neu.termin ?? null) !== null && neu.termin !== (alt.termin ?? null)) return true
  const vorher = new Set(alt.ids ?? [])
  if ((neu.ids ?? []).some((id) => !vorher.has(id))) return true
  if (typeof neu.zahl === 'number' && neu.zahl > (alt.zahl ?? 0)) return true
  if (neu.text !== undefined && neu.text !== alt.text) return true
  return false
}

/** Einträge nach den gemerkten Merkmalen aufteilen; `veraltet` = gemerkte Schlüssel, die nicht mehr gelten */
export function bedarfAufteilen(
  liste: Bedarf[],
  gemerkt: Map<string, Merkmal>
): { sichtbar: Bedarf[]; ausgeblendet: Bedarf[]; veraltet: string[] } {
  const sichtbar: Bedarf[] = []
  const ausgeblendet: Bedarf[] = []
  const gueltig = new Set<string>()
  for (const b of liste) {
    const m = gemerkt.get(b.schluessel)
    if (m && !bedarfWiederSichtbar(m, b.merkmal)) {
      ausgeblendet.push(b)
      gueltig.add(b.schluessel)
    } else sichtbar.push(b)
  }
  return { sichtbar, ausgeblendet, veraltet: [...gemerkt.keys()].filter((k) => !gueltig.has(k)) }
}

// ---------------------------------------------------------------- Ausgeblendeter Handlungsbedarf (je Lehrkraft und Lerngruppe)

let ausBereit = false
const ausDb = () => {
  const d = datenbank()
  if (!ausBereit) {
    d.exec(`CREATE TABLE IF NOT EXISTS klassen_ausgeblendet (
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  gruppe_id TEXT NOT NULL,
  schluessel TEXT NOT NULL,
  merkmal TEXT NOT NULL,
  zeit INTEGER NOT NULL,
  PRIMARY KEY (lehrkraft_id, gruppe_id, schluessel)
)`)
    ausBereit = true
  }
  return d
}
export function ausgeblendetVon(lehrkraftId: string, gruppeId: string): Map<string, Merkmal> {
  const m = new Map<string, Merkmal>()
  for (const z of ausDb().prepare('SELECT schluessel, merkmal FROM klassen_ausgeblendet WHERE lehrkraft_id = ? AND gruppe_id = ?').all(lehrkraftId, gruppeId) as {
    schluessel: string
    merkmal: string
  }[])
    m.set(z.schluessel, json_(z.merkmal, { art: '' } as Merkmal))
  return m
}
export function bedarfAusblenden(lehrkraftId: string, gruppeId: string, schluessel: string, merkmal: Merkmal): void {
  ausDb()
    .prepare(
      'INSERT INTO klassen_ausgeblendet (lehrkraft_id, gruppe_id, schluessel, merkmal, zeit) VALUES (?, ?, ?, ?, ?) ON CONFLICT (lehrkraft_id, gruppe_id, schluessel) DO UPDATE SET merkmal = excluded.merkmal, zeit = excluded.zeit'
    )
    .run(lehrkraftId, gruppeId, schluessel, JSON.stringify(merkmal), Date.now())
}
export function bedarfEinblenden(lehrkraftId: string, gruppeId: string, schluessel: string[]): void {
  if (!schluessel.length) return
  const weg = ausDb().prepare('DELETE FROM klassen_ausgeblendet WHERE lehrkraft_id = ? AND gruppe_id = ? AND schluessel = ?')
  for (const k of schluessel) weg.run(lehrkraftId, gruppeId, k)
}

/**
 * Vokabeln im Handlungsbedarf (08.10.2026, Befund der Lehrkraft: frisch gestartete Klassen wurden mit „Vokabeln unter
 * 30 % sicher" überflutet). „Sicher" braucht zwei Treffer im Abstand einer Woche – deshalb:
 *  - „unter 30 % sicher" zählt nur Wörter, die seit mindestens 14 Tagen freigegeben sind, und erst, wenn im Kurs seit
 *    mindestens 14 Tagen geübt wird;
 *  - vorher das frühe Zeichen: wer seit 7 Tagen nicht geübt hat;
 *  - höchstens EIN Vokabel-Eintrag je Klasse (mehrere Kurse zusammengefasst, nächster Testtermin vorne). Ein Klick
 *    öffnet den Kurs: den mit dem Termin, sonst den jüngsten offenen Kurs im Fach der Lerngruppe.
 */
export function vokabelBedarf(
  offene: { id: string; titel: string; fach: string; testTermin: number | null; sicherSchnitt: number; ersterTag: string | null; reifeWoerter: number }[],
  jePerson: Record<string, { reifSicher: number; reifGesamt: number; zuletzt: string | null }>,
  lernende: { id: string; name: string }[],
  fach: string,
  jetzt = Date.now()
): Bedarf | null {
  if (!offene.length) return null
  const kurs = offene.find((t) => t.fach === fach) ?? offene[0]
  const termin = offene
    .filter((t) => t.testTermin && t.testTermin > jetzt && t.testTermin - jetzt < 8 * TAG)
    .sort((a, b) => (a.testTermin ?? 0) - (b.testTermin ?? 0))[0]
  const tag14 = new Date(jetzt - 14 * TAG).toISOString().slice(0, 10)
  const lange = offene.some((t) => t.ersterTag && t.ersterTag <= tag14 && t.reifeWoerter > 0)
  const schwach = lange
    ? lernende.filter((l) => {
        const p = jePerson[l.id]
        return p && p.reifGesamt > 0 && p.reifSicher / p.reifGesamt < 0.3
      })
    : []
  const grenze = new Date(jetzt - 7 * TAG).toISOString().slice(0, 10)
  const inaktiv = lernende.filter((l) => jePerson[l.id] && (!jePerson[l.id].zuletzt || jePerson[l.id].zuletzt! < grenze))
  const teile: string[] = []
  if (termin)
    teile.push(
      `Vokabeltest „${termin.titel}" am ${new Date(termin.testTermin!).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} – Klasse im Schnitt ${Math.round(termin.sicherSchnitt * 100)} % sicher`
    )
  if (schwach.length) teile.push(`Vokabeln unter 30 % sicher (Wörter seit mind. 14 Tagen): ${schwach.map((l) => l.name).join(', ')}`)
  if (inaktiv.length)
    teile.push(`${inaktiv.length} ${inaktiv.length === 1 ? 'Lernende/r hat' : 'Lernende haben'} in den letzten 7 Tagen nicht geübt: ${inaktiv.map((l) => l.name).join(', ')}`)
  if (!teile.length) return null
  const art = schwach.length ? 'foerdern' : termin ? 'termin' : 'inaktiv'
  return {
    art,
    text: teile.join(' · '),
    ziel: { modul: 'vokabeltraining', id: (termin ?? kurs).id },
    // Ein Vokabel-Eintrag je Klasse
    schluessel: 'vokabeln',
    merkmal: { art, termin: termin?.testTermin ?? null, ids: [...schwach.map((l) => `s:${l.id}`), ...inaktiv.map((l) => `i:${l.id}`)] }
  }
}

/**
 * Kurs der Klasse in Sprachenlernen (09.10.2026): „Vokabeln hinzufügen" / „Grammatik hinzufügen" in „Meine Klassen"
 * wirken auf denselben Kurs wie in Sprachenlernen – den Kurs dieser Lerngruppe in ihrer Sprache (klassenKurseSichern,
 * auch an einer gleichnamigen Lerngruppe). Vorrang: eigene Lerngruppe, offen, für die ganze Gruppe, ältester zuerst.
 */
export function klassenKursVon(g: Lerngruppe, lehrkraftId: string): string | null {
  const sprachen = sprachfaecherDerGruppe(g.fach).map((s) => s.sprache)
  if (!sprachen.length) return null
  const name = g.name.trim().toLowerCase()
  const geschwister = new Set(lerngruppenVon(lehrkraftId).filter((x) => x.name.trim().toLowerCase() === name).map((x) => x.id))
  geschwister.add(g.id)
  const kurse = (
    vokDb()
      .prepare("SELECT * FROM vok_zuweisungen WHERE lehrkraft_id = ? AND reihe = '' AND lerngruppe_id != '' ORDER BY erstellt ASC")
      .all(lehrkraftId) as unknown as Zeile[]
  ).filter((k) => geschwister.has(k.lerngruppe_id ?? '') && sprachen.includes(k.sprache))
  const rang = (k: Zeile): number =>
    (k.lerngruppe_id === g.id ? 0 : 4) + (k.status === 'offen' ? 0 : 2) + (json_(k.schueler, [] as string[]).length ? 1 : 0)
  return [...kurse].sort((a, b) => rang(a) - rang(b))[0]?.id ?? null
}

/**
 * „Wackelige Wörter" im Kurs wiederholen (09.10.2026, Wunsch der Lehrkraft – statt eines zweiten Kurses): Die Wörter
 * stehen schon in den Kursen der Klasse. Wer ein Wort schon gesehen hat (Versuche > 0) und darin wackelt (Fehler oder
 * Fach 1–2), bekommt es jetzt fällig – es kommt in der nächsten Tagesrunde. Kein Fachwechsel, kein neuer Kurs.
 */
export function wackeligWiederholen(
  g: Lerngruppe,
  lehrkraftId: string,
  jetzt = Date.now()
): { woerter: number; lernende: number; kurse: string[] } {
  const vok = vokabelnDerGruppe(lehrkraftId, g.id, jetzt)
  const schluessel = new Set(vok.wackelig.map((w) => `${w.sprache}|${w.term}`))
  const woerter = new Set<string>()
  const lernende = new Set<string>()
  const kurse = new Set<string>()
  for (const t of vok.trainings) {
    if (t.status !== 'offen') continue
    const z = zeile(t.id)
    if (!z || z.lehrkraft_id !== lehrkraftId) continue
    const liste = json_(z.woerter, [] as Vokabel[]).filter((v) => schluessel.has(`${z.sprache}|${v.term}`))
    if (!liste.length) continue
    for (const n of lernendeVon(z)) {
      const st = standVon(z.id, n.id)
      let anders = false
      for (const v of liste) {
        const w = st.woerter[v.id]
        if (!w || !w.versuche || !(w.falsch > 0 || w.fach <= 2)) continue
        if (w.faellig > jetzt) {
          w.faellig = jetzt
          anders = true
        }
        woerter.add(`${z.sprache}|${v.term}`)
        lernende.add(n.id)
        kurse.add(ueberschriftVon(z))
      }
      if (anders) standSpeichern(z.id, n.id, st)
    }
  }
  return { woerter: woerter.size, lernende: lernende.size, kurse: [...kurse] }
}

/**
 * Lehrwerk-Vorwahl (09.10.2026, Wunsch der Lehrkraft; Auswahl in shared/lehrwerkVorwahl.ts): was Kurs, Lerngruppe, die
 * übrigen Kurse der Klasse und die Lehrkraft insgesamt an Lehrwerken nutzen.
 */
export function vorwahlDaten(z: Zeile, ich: NutzerInfo): VorwahlDaten {
  const q = json_(z.quelle, {} as Partial<Quelle>)
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  const alle = vokDb()
    .prepare("SELECT * FROM vok_zuweisungen WHERE lehrkraft_id = ? AND reihe = '' ORDER BY erstellt DESC")
    .all(ich.id) as unknown as Zeile[]
  const lehrwerk = (k: Zeile): string => json_(k.quelle, {} as Partial<Quelle>).lehrwerk ?? ''
  const name = g?.name.trim().toLowerCase() ?? ''
  const klasse = new Set(name ? lerngruppenVon(ich.id).filter((x) => x.name.trim().toLowerCase() === name).map((x) => x.id) : [])
  const klassenLehrwerke = [
    ...new Set(alle.filter((k) => k.id !== z.id && k.sprache === z.sprache && klasse.has(k.lerngruppe_id)).map(lehrwerk).filter(Boolean))
  ]
  const zahl = new Map<string, number>()
  for (const k of alle) if (k.sprache === z.sprache && lehrwerk(k)) zahl.set(lehrwerk(k), (zahl.get(lehrwerk(k)) ?? 0) + 1)
  let stand: { buch: string; unit: string } | null = null
  if (g) {
    stand = lehrwerkStandVon(g.id)
    if (!stand)
      stand = hoechsteUnit(alle.filter((k) => k.lerngruppe_id === g.id && k.status === 'offen').map((k) => k.quelle ?? ''))
  }
  return {
    sprache: z.sprache,
    jahrgang: klasseFuer(z, ich),
    kursLehrwerk: q.lehrwerk || null,
    kursUnits: quelleUnits(q),
    stand,
    klassenLehrwerke,
    ueblicheLehrwerke: [...zahl.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  }
}

/**
 * Eine Lerngruppe im Detail. `leicht` (09.10.2026, Leistung): für die Übersicht aller Klassen ohne die Übersicht je
 * Abschnitt und ohne Test-Einzelheiten – Zahlen, Handlungsbedarf und Vorschläge bleiben gleich.
 */
function detail(g: Lerngruppe, lehrkraftId: string, jetzt = Date.now(), leicht = false) {
  const mitglieder = mitgliederVon(g)
  const h = historie(g)
  const testDetails = leicht ? ({} as ReturnType<typeof testDetailsDerGruppe>) : testDetailsDerGruppe(g)
  // Mit Übersicht je Abschnitt (Reiter „Vokabeln", 09.10.2026)
  const vok = vokabelnDerGruppe(lehrkraftId, g.id, jetzt, !leicht)
  const gram = grammatikDerGruppe(lehrkraftId, g.id, jetzt)
  const reihen = reihenDerGruppe(lehrkraftId, g.id)
  const blaetter = blaetterDerGruppe(lehrkraftId, g.id)
  const fehler = fehlerSchwerpunkte(g)
  const offeneVok = vok.trainings.filter((t) => t.status === 'offen')

  const lernende = mitglieder
    .map((n) => {
      const v = vok.jePerson[n.id]
      const gr = gram.jePerson[n.id]
      // Gäste (Anmeldecode, 08.10.2026) führt die Testhistorie ohne Benutzernamen, über ihren Namen
      const gast = n.quelle === 'gast'
      // Zuerst über die Kennung (09.10.2026: nach dem Umbenennen bleiben die Ergebnisse dran), sonst wie bisher
      const t =
        h.schueler.find((s) => s.ids.includes(n.id)) ?? h.schueler.find((s) => (gast ? !s.benutzer && s.name === n.name : s.benutzer === n.benutzer))
      const r = reihen.filter((x) => x.status === 'offen').flatMap((x) => x.lernende.filter((l) => l.id === n.id).map((l) => l.fortschritt))
      return {
        id: n.id,
        name: n.name || n.benutzer,
        // Interne Kennung der Gäste („gast-…") ist kein IServ-Name – nicht anzeigen
        benutzer: gast ? '' : n.benutzer,
        gast,
        vokabelnSicher: v && v.gesamt ? v.sicher / v.gesamt : null,
        grammatikSicher: gr && gr.gesamt ? gr.sicher / gr.gesamt : null,
        zuletztGeuebt: v?.zuletzt ?? null,
        testSchnitt: t?.durchschnitt ?? null,
        tests: t?.tests ?? 0,
        reihenFortschritt: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null,
        blaetterEingereicht: blaetter.filter((b) => b.eingereichtVon.includes(n.id)).length
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))

  // ---------- Handlungsbedarf (nur Laufendes)
  const bedarf: Bedarf[] = []
  for (const t of h.tests)
    if (t.offen > 0)
      bedarf.push({
        art: 'entscheiden',
        text: `„${t.titel}": ${t.offen} Antwort${t.offen === 1 ? '' : 'en'} zu prüfen`,
        ziel: { modul: 'onlinetest', id: t.id },
        schluessel: `test:${t.id}`,
        merkmal: { art: 'entscheiden', zahl: t.offen }
      })
  if (offeneVok.length) {
    const v = vokabelBedarf(offeneVok, vok.jePerson, lernende, g.fach, jetzt)
    if (v) bedarf.push(v)
  }
  for (const r of reihen)
    for (const [i, b] of r.bedarf.slice(0, 3).entries())
      bedarf.push({
        art: 'reihe',
        text: `${r.titel}: ${b}`,
        ziel: { modul: 'laufendereihen' },
        schluessel: `reihe:${r.zid}:${i}`,
        merkmal: { art: 'reihe', text: pruefwert(`${r.titel}: ${b}`) }
      })
  for (const b of blaetter) {
    // Geplant (09.10.2026): noch bei niemandem – kein Handlungsbedarf
    if (b.status !== 'offen' || b.geplantAb) continue
    if (b.gesamt && b.eingereicht < b.gesamt && b.begonnen < b.gesamt / 2)
      bedarf.push({
        art: 'blatt',
        text: `Blatt „${b.titel}": erst ${b.begonnen} von ${b.gesamt} haben begonnen`,
        ziel: { modul: 'freigaben', id: b.id },
        schluessel: `blatt:${b.id}:begonnen`,
        merkmal: { art: 'blatt', zahl: b.gesamt - b.begonnen, termin: b.bis ?? null }
      })
    else if (b.bis && b.bis < jetzt && b.eingereicht < b.gesamt)
      bedarf.push({
        art: 'blatt',
        text: `Blatt „${b.titel}": Frist vorbei, ${b.gesamt - b.eingereicht} noch nicht eingereicht`,
        ziel: { modul: 'freigaben', id: b.id },
        schluessel: `blatt:${b.id}:frist`,
        merkmal: { art: 'blatt', zahl: b.gesamt - b.eingereicht, termin: b.bis }
      })
  }

  // ---------- Vorschläge für Material aus dem Lernstand
  const vorschlaege: (
    | { art: 'vokabeln'; titel: string; text: string; sprache: string; fach: string; woerter: { term: string; translation: string; example?: string }[] }
    | { art: 'blatt'; titel: string; text: string; testId: string; thema: string; schwerpunkte: string[]; testArt: string }
  )[] = []
  if (vok.wackelig.length >= 5)
    vorschlaege.push({
      art: 'vokabeln',
      titel: `Wackelige Wörter – ${klassenTitel(g)}`,
      text: `Die ${vok.wackelig.length} Wörter, die gerade am meisten wackeln (höchstens 20: zuerst Wörter für den nächsten Test, dann die, die bei den meisten Kindern zuletzt danebengingen) – im Kurs gleich wiederholen lassen oder als kurzes Arbeitsblatt.`,
      sprache: vok.wackelig[0].sprache,
      fach: vok.wackelig[0].fach,
      woerter: vok.wackelig.map(({ term, translation, example }) => ({ term, translation, ...(example ? { example } : {}) }))
    })
  if (fehler && fehler.schwerpunkte.length)
    vorschlaege.push({
      art: 'blatt',
      titel: `Übungsblatt zu „${fehler.titel}"`,
      text: `Gezielte Übungen zu den Fehlerschwerpunkten des letzten Tests (${Math.round(fehler.quote * 100)} % falsch oder zu entscheiden).`,
      testId: fehler.testId,
      thema: fehler.thema || fehler.titel,
      schwerpunkte: fehler.schwerpunkte,
      testArt: fehler.art
    })

  return {
    id: g.id,
    name: g.name,
    fach: g.fach,
    titel: klassenTitel(g),
    sprachfach: istSprachfach(g.fach),
    lernende,
    tests: h.tests.map((t) => ({
      id: t.id,
      titel: t.titel,
      datum: t.datum,
      status: t.status,
      teilnehmer: t.teilnehmer,
      offen: t.offen,
      durchschnitt: t.durchschnitt,
      verteilung: t.verteilung,
      ...(testDetails[t.id] ?? {})
    })),
    vokabeln: vok.trainings,
    grammatik: gram.trainings,
    wackelig: vok.wackelig,
    reihen: reihen.map(({ lernende: l, bedarf: _b, ...rest }) => ({ ...rest, lernende: l.length })),
    blaetter: blaetter.map(({ eingereichtVon: _e, ...rest }) => rest),
    // Ausgeblendetes (09.10.2026) zählt nicht mit; überholte Merkmale fallen weg
    ...(() => {
      const gemerkt = ausgeblendetVon(lehrkraftId, g.id)
      const { sichtbar, ausgeblendet, veraltet } = bedarfAufteilen(bedarf, gemerkt)
      if (veraltet.length) bedarfEinblenden(lehrkraftId, g.id, veraltet)
      const ohneMerkmal = ({ merkmal: _m, ...b }: Bedarf) => b
      return { bedarf: sichtbar.map(ohneMerkmal), bedarfAusgeblendet: ausgeblendet.map(ohneMerkmal), bedarfAlle: bedarf }
    })(),
    vorschlaege
  }
}

export function klassenRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (!url.pathname.startsWith('/server/klassen')) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    if (sitzung.nutzer.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const ich = alsNutzer(sitzung.nutzer, sitzung.kennung)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)

    if (req.method === 'POST') {
      if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      // Wackelige Wörter im Kurs wiederholen (09.10.2026)
      if (teile.length === 2 && teile[1] === 'wackelig-wiederholen') {
        const g = lerngruppe(teile[0])
        if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true)
        return (json(res, 200, wackeligWiederholen(g, ich.id)), true)
      }
      // Fach abwählen (08.10.2026): mit Material nur ausblenden, sonst entfernen (leere Kurse gehen mit)
      if (teile.length === 2 && teile[1] === 'abwaehlen') {
        const g = lerngruppe(teile[0])
        if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true)
        const d = detail(g, ich.id)
        const material = d.tests.length + d.vokabeln.filter((v) => v.woerter > 0).length + d.grammatik.length + d.reihen.length + d.blaetter.length
        if (!material) for (const v of d.vokabeln) leerenKursLoeschen(v.id, ich.id)
        return (json(res, 200, { art: fachAbwaehlen(ich.id, g.id, material > 0), material }), true)
      }
      // Handlungsbedarf ausblenden / wieder einblenden (09.10.2026): {schluessel}
      if (teile.length === 2 && (teile[1] === 'bedarf-ausblenden' || teile[1] === 'bedarf-einblenden')) {
        const g = lerngruppe(teile[0])
        if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true)
        const k0 = (await k.koerper()) as Record<string, unknown>
        const schluessel = String(k0.schluessel ?? '').slice(0, 200)
        if (teile[1] === 'bedarf-einblenden') return (bedarfEinblenden(ich.id, g.id, [schluessel]), json(res, 200, { ok: true }), true)
        const b = detail(g, ich.id).bedarfAlle.find((x) => x.schluessel === schluessel)
        if (!b) return (json(res, 404, { fehler: 'Diesen Eintrag gibt es nicht mehr.' }), true)
        bedarfAusblenden(ich.id, g.id, b.schluessel, b.merkmal)
        return (json(res, 200, { ok: true }), true)
      }
      if (teile.length !== 2 || teile[1] !== 'fach') return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      const k0 = (await k.koerper()) as Record<string, unknown>
      try {
        return (json(res, 200, { id: fachHinzufuegen(ich.id, teile[0], String(k0.fach ?? '')) }), true)
      } catch (e) {
        return (json(res, 400, { fehler: e instanceof Error ? e.message : String(e) }), true)
      }
    }
    if (req.method !== 'GET') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)

    if (!teile.length) {
      // Je Klasse (Name) ihre Fächer – Lerngruppen ohne Fach zählen als Klasse ohne Fach
      const klassen = new Map<
        string,
        {
          schluessel: string
          name: string
          gruppen: string[]
          lernende: Set<string>
          bedarf: number
          vorschlaege: number
          faecher: {
            id: string
            fach: string
            bedarf: number
            vorschlaege: number
            vokabelnSicher: number | null
            testSchnitt: number | null
            tests: number
            reihen: number
            blaetter: number
          }[]
        }
      >()
      for (const g of lerngruppenVon(ich.id).sort(nachKlasse)) {
        const s = klassenSchluessel(g.name)
        const kl = klassen.get(s) ?? { schluessel: s, name: g.name.trim(), gruppen: [], lernende: new Set<string>(), bedarf: 0, vorschlaege: 0, faecher: [] }
        klassen.set(s, kl)
        kl.gruppen.push(g.id)
        // Abgewähltes Fach (08.10.2026): nicht in der Fach-Leiste, die Klasse bleibt
        if (g.ausgeblendet) continue
        const d = detail(g, ich.id, Date.now(), true)
        for (const l of d.lernende) kl.lernende.add(l.id)
        kl.bedarf += d.bedarf.length
        kl.vorschlaege += d.vorschlaege.length
        if (!g.fach.trim()) continue
        const werte = d.lernende.map((l) => l.vokabelnSicher).filter((x): x is number => x !== null)
        const noten = d.tests.map((t) => t.durchschnitt).filter((x): x is number => x !== null)
        kl.faecher.push({
          id: g.id,
          fach: g.fach,
          bedarf: d.bedarf.length,
          vorschlaege: d.vorschlaege.length,
          vokabelnSicher: werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null,
          testSchnitt: noten.length ? noten.reduce((a, b) => a + b, 0) / noten.length : null,
          tests: d.tests.length,
          reihen: d.reihen.filter((r) => r.status === 'offen').length,
          blaetter: d.blaetter.filter((b) => b.status === 'offen').length
        })
      }
      return (
        json(res, 200, {
          klassen: [...klassen.values()]
            .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
            .map(({ lernende, ...rest }) => ({ ...rest, lernende: lernende.size }))
        }),
        true
      )
    }
    if (teile[0] === 'vorwahl') {
      const z = zeile(String(url.searchParams.get('kurs') ?? ''))
      if (!z || z.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diesen Kurs gibt es nicht.' }), true)
      return (json(res, 200, vorwahlDaten(z, sitzung.nutzer)), true)
    }
    const g = lerngruppe(teile[0])
    if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true)
    // Kurs der Klasse (09.10.2026) – fehlt er (z. B. gelöscht), wie bei neuen Lerngruppen gleich anlegen
    let klassenKurs = istSprachfach(g.fach) ? klassenKursVon(g, ich.id) : null
    if (istSprachfach(g.fach) && !klassenKurs && klassenKurseSichern(ich.id)) klassenKurs = klassenKursVon(g, ich.id)
    const { bedarfAlle: _alle, ...d } = detail(g, ich.id)
    return (json(res, 200, { ...d, ablageMuster: ablageMuster(), klassenKurs }), true)
  }
}
