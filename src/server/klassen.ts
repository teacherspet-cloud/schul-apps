/**
 * „Meine Klassen" (06.10.2026, abgestimmt mit der Lehrkraft): je Lerngruppe – angezeigt als „5b – Englisch", alphabetisch –
 * der Lernstand (Vokabeln; Grammatik folgt mit der Grammatik-Lern-App), Tests und Noten, laufende Reihen und Blätter,
 * oben der Handlungsbedarf, dazu Vorschläge für Material aus dem Lernstand.
 *
 *   GET /server/klassen          Übersicht aller eigenen Lerngruppen (knapp)
 *   GET /server/klassen/<id>     eine Lerngruppe im Detail
 *
 * Nur für Lehrkräfte; nur die eigenen Lerngruppen. Namen der Lernenden gehen nur an die Lehrkraft selbst.
 */
import { blaetterDerGruppe } from './arbeitsblaetter'
import { alsNutzer, json, type Anfrage } from './http'
import { fehlerSchwerpunkte, historie, lerngruppe, lerngruppenVon, mitgliederVon, type Lerngruppe } from './onlinetest'
import { reihenDerGruppe } from './reihen'
import { vokabelnDerGruppe } from './vokabeln'

const TAG = 86_400_000

/** „5b – Englisch"; ohne Fach nur der Name */
export const klassenTitel = (g: Pick<Lerngruppe, 'name' | 'fach'>): string => (g.fach ? `${g.name} – ${g.fach}` : g.name)

/** Alphabetisch, Zahlen natürlich („5b" vor „10a"), dann das Fach */
export const nachKlasse = (a: Pick<Lerngruppe, 'name' | 'fach'>, b: Pick<Lerngruppe, 'name' | 'fach'>): number =>
  a.name.localeCompare(b.name, 'de', { numeric: true }) || a.fach.localeCompare(b.fach, 'de')

interface Bedarf {
  art: 'entscheiden' | 'foerdern' | 'inaktiv' | 'termin' | 'reihe' | 'blatt'
  text: string
  /** Wohin der Klick führt */
  ziel?: { modul: string; id?: string }
}

function detail(g: Lerngruppe, lehrkraftId: string, jetzt = Date.now()) {
  const mitglieder = mitgliederVon(g)
  const h = historie(g)
  const vok = vokabelnDerGruppe(lehrkraftId, g.id, jetzt)
  const reihen = reihenDerGruppe(lehrkraftId, g.id)
  const blaetter = blaetterDerGruppe(lehrkraftId, g.id)
  const fehler = fehlerSchwerpunkte(g)

  const lernende = mitglieder
    .map((n) => {
      const v = vok.jePerson[n.id]
      const t = h.schueler.find((s) => s.benutzer === n.benutzer)
      const r = reihen.flatMap((x) => x.lernende.filter((l) => l.id === n.id).map((l) => l.fortschritt))
      return {
        id: n.id,
        name: n.name,
        benutzer: n.benutzer,
        vokabelnSicher: v && v.gesamt ? v.sicher / v.gesamt : null,
        zuletztGeuebt: v?.zuletzt ?? null,
        testSchnitt: t?.durchschnitt ?? null,
        tests: t?.tests ?? 0,
        reihenFortschritt: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null,
        blaetterEingereicht: blaetter.filter((b) => b.eingereichtVon.includes(n.id)).length
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))

  // ---------- Handlungsbedarf
  const bedarf: Bedarf[] = []
  for (const t of h.tests)
    if (t.offen > 0)
      bedarf.push({
        art: 'entscheiden',
        text: `„${t.titel}": ${t.offen} Antwort${t.offen === 1 ? '' : 'en'} zu prüfen`,
        ziel: { modul: 'onlinetest', id: t.id }
      })
  if (vok.trainings.length) {
    const schwach = lernende.filter((l) => l.vokabelnSicher !== null && l.vokabelnSicher < 0.3)
    if (schwach.length)
      bedarf.push({ art: 'foerdern', text: `Vokabeln unter 30 % sicher: ${schwach.map((l) => l.name).join(', ')}`, ziel: { modul: 'vokabeltraining' } })
    const grenze = new Date(jetzt - 7 * TAG).toISOString().slice(0, 10)
    const inaktiv = lernende.filter((l) => l.vokabelnSicher !== null && (!l.zuletztGeuebt || l.zuletztGeuebt < grenze))
    if (inaktiv.length)
      bedarf.push({ art: 'inaktiv', text: `Seit einer Woche nicht geübt: ${inaktiv.map((l) => l.name).join(', ')}`, ziel: { modul: 'vokabeltraining' } })
    for (const t of vok.trainings)
      if (t.testTermin && t.testTermin > jetzt && t.testTermin - jetzt < 8 * TAG)
        bedarf.push({
          art: 'termin',
          text: `Vokabeltest „${t.titel}" am ${new Date(t.testTermin).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} – Klasse im Schnitt ${Math.round(t.sicherSchnitt * 100)} % sicher`,
          ziel: { modul: 'vokabeltraining', id: t.id }
        })
  }
  for (const r of reihen) for (const b of r.bedarf.slice(0, 3)) bedarf.push({ art: 'reihe', text: `${r.titel}: ${b}`, ziel: { modul: 'laufendereihen' } })
  for (const b of blaetter)
    if (b.gesamt && b.eingereicht < b.gesamt && b.begonnen < b.gesamt / 2)
      bedarf.push({ art: 'blatt', text: `Blatt „${b.titel}": erst ${b.begonnen} von ${b.gesamt} haben begonnen`, ziel: { modul: 'freigaben', id: b.id } })

  // ---------- Vorschläge für Material aus dem Lernstand
  const vorschlaege: (
    | { art: 'vokabeln'; titel: string; text: string; sprache: string; fach: string; woerter: { term: string; translation: string; example?: string }[] }
    | { art: 'blatt'; titel: string; text: string; testId: string; thema: string; schwerpunkte: string[]; testArt: string }
  )[] = []
  if (vok.wackelig.length >= 5)
    vorschlaege.push({
      art: 'vokabeln',
      titel: `Wackelige Wörter – ${klassenTitel(g)}`,
      text: `Ein kurzes Vokabeltraining mit den ${vok.wackelig.length} Wörtern, die der Klasse am häufigsten danebengehen.`,
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
    lernende,
    tests: h.tests.map((t) => ({
      id: t.id,
      titel: t.titel,
      datum: t.datum,
      status: t.status,
      teilnehmer: t.teilnehmer,
      offen: t.offen,
      durchschnitt: t.durchschnitt,
      verteilung: t.verteilung
    })),
    vokabeln: vok.trainings,
    wackelig: vok.wackelig,
    reihen: reihen.map(({ zid, titel, schnitt, fertig, lernende: l }) => ({ zid, titel, schnitt, fertig, lernende: l.length })),
    blaetter: blaetter.map(({ id, titel, gesamt, begonnen, eingereicht }) => ({ id, titel, gesamt, begonnen, eingereicht })),
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
    if (req.method !== 'GET') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    if (!teile.length) {
      const klassen = lerngruppenVon(ich.id)
        .sort(nachKlasse)
        .map((g) => {
          const d = detail(g, ich.id)
          const mitWert = (f: (l: (typeof d.lernende)[number]) => number | null): number[] => d.lernende.map(f).filter((x): x is number => x !== null)
          const schnitt = (l: number[]): number | null => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null)
          return {
            id: d.id,
            name: d.name,
            fach: d.fach,
            titel: d.titel,
            lernende: d.lernende.length,
            vokabelnSicher: schnitt(mitWert((l) => l.vokabelnSicher)),
            testSchnitt: schnitt(d.tests.map((t) => t.durchschnitt).filter((x): x is number => x !== null)),
            tests: d.tests.length,
            reihen: d.reihen.length,
            blaetter: d.blaetter.length,
            bedarf: d.bedarf.length,
            vorschlaege: d.vorschlaege.length
          }
        })
      return (json(res, 200, { klassen }), true)
    }
    const g = lerngruppe(teile[0])
    if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true)
    return (json(res, 200, detail(g, ich.id)), true)
  }
}
