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
 *
 * Nur für Lehrkräfte; nur die eigenen Lerngruppen. Namen der Lernenden gehen nur an die Lehrkraft selbst.
 */
import { fachAusName, SPRACHFAECHER } from '../shared/faecher'
import { blaetterDerGruppe } from './arbeitsblaetter'
import { serverWert } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { fachHinzufuegen, fehlerSchwerpunkte, historie, lerngruppe, lerngruppenVon, mitgliederVon, testDetailsDerGruppe, type Lerngruppe } from './onlinetest'
import { reihenDerGruppe } from './reihen'
import { vokabelnDerGruppe } from './vokabeln'
import { grammatikDerGruppe } from './grammatik'

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

interface Bedarf {
  art: 'entscheiden' | 'foerdern' | 'inaktiv' | 'termin' | 'reihe' | 'blatt'
  text: string
  /** Wohin der Klick führt */
  ziel?: { modul: string; id?: string }
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
  return {
    art: schwach.length ? 'foerdern' : termin ? 'termin' : 'inaktiv',
    text: teile.join(' · '),
    ziel: { modul: 'vokabeltraining', id: (termin ?? kurs).id }
  }
}

function detail(g: Lerngruppe, lehrkraftId: string, jetzt = Date.now()) {
  const mitglieder = mitgliederVon(g)
  const h = historie(g)
  const testDetails = testDetailsDerGruppe(g)
  const vok = vokabelnDerGruppe(lehrkraftId, g.id, jetzt)
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
      const t = h.schueler.find((s) => (gast ? !s.benutzer && s.name === n.name : s.benutzer === n.benutzer))
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
        ziel: { modul: 'onlinetest', id: t.id }
      })
  if (offeneVok.length) {
    const v = vokabelBedarf(offeneVok, vok.jePerson, lernende, g.fach, jetzt)
    if (v) bedarf.push(v)
  }
  for (const r of reihen) for (const b of r.bedarf.slice(0, 3)) bedarf.push({ art: 'reihe', text: `${r.titel}: ${b}`, ziel: { modul: 'laufendereihen' } })
  for (const b of blaetter) {
    if (b.status !== 'offen') continue
    if (b.gesamt && b.eingereicht < b.gesamt && b.begonnen < b.gesamt / 2)
      bedarf.push({ art: 'blatt', text: `Blatt „${b.titel}": erst ${b.begonnen} von ${b.gesamt} haben begonnen`, ziel: { modul: 'freigaben', id: b.id } })
    else if (b.bis && b.bis < jetzt && b.eingereicht < b.gesamt)
      bedarf.push({
        art: 'blatt',
        text: `Blatt „${b.titel}": Frist vorbei, ${b.gesamt - b.eingereicht} noch nicht eingereicht`,
        ziel: { modul: 'freigaben', id: b.id }
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
      text: `Ein kurzes Vokabeltraining mit den ${vok.wackelig.length} Wörtern, die gerade am meisten wackeln (höchstens 20: zuerst Wörter für den nächsten Test, dann die, die bei den meisten Kindern zuletzt danebengingen).`,
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
    bedarf,
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
        const d = detail(g, ich.id)
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
    const g = lerngruppe(teile[0])
    if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true)
    return (json(res, 200, { ...detail(g, ich.id), ablageMuster: ablageMuster() }), true)
  }
}
