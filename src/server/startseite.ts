/**
 * Startseite der Lehrkraft (10.10.2026): Daten für die Karte „Termine & Vokabeltraining" und den Kasten „Meine Klassen"
 * am Smartphone – mit EINER Anfrage, ohne die schwere Übersicht von „Meine Klassen" (keine Tests, Reihen, Blätter).
 *
 *   GET /server/startseite   → StartseiteDaten (shared/startseiteKurse.ts)
 *
 * Kurse: jeder laufende Kurs einer eigenen (nicht verborgenen) Lerngruppe mit Wörtern oder Grammatik – auch ohne
 * Testtermin (Befund der Lehrkraft: die Karte zeigte nur Kurse mit Termin). Handlungsbedarf wie in „Meine Klassen"
 * (`kursBedarfDerGruppe`, Ausgeblendetes bleibt ausgeblendet), knapp und ohne Namen. Nur für Lehrkräfte.
 */
import { json, type Anfrage } from './http'
import { lerngruppenVon } from './onlinetest'
import { vokabelnDerGruppe } from './vokabeln'
import { grammatikDerGruppe } from './grammatik'
import { ausgeblendetVon, bedarfAufteilen, kursBedarfDerGruppe, klassenSchluessel, nachKlasse, type Bedarf } from './klassen'
import { verborgeneGruppen } from './iservKursgruppen'
import {
  abschnittText,
  endetHinweis,
  hinweisKurz,
  kursZeilenTitel,
  problemHinweis,
  type StartHinweis,
  type StartKlasse,
  type StartKurs,
  type StartseiteDaten
} from '../shared/startseiteKurse'
import { HINWEIS_FARBE, type KursHinweisArt } from '../shared/kursHinweise'

export function startseiteDaten(lehrkraftId: string, jetzt = Date.now()): StartseiteDaten {
  const verborgen = verborgeneGruppen(lehrkraftId)
  const gruppen = lerngruppenVon(lehrkraftId)
    .filter((g) => !verborgen.has(g.id))
    .sort(nachKlasse)
  const klassen = new Map<string, StartKlasse>()
  const kurse: StartKurs[] = []
  for (const g of gruppen) {
    const s = klassenSchluessel(g.name)
    const kl = klassen.get(s) ?? { schluessel: s, name: g.name.trim(), gruppeId: g.id, faecher: [] }
    klassen.set(s, kl)
    // Abgewähltes Fach: nicht in der Fach-Leiste, keine Kurse auf der Startseite
    if (g.ausgeblendet) continue
    if (g.fach.trim()) kl.faecher.push({ id: g.id, fach: g.fach })
    const vok = vokabelnDerGruppe(lehrkraftId, g.id, jetzt)
    const offen = vok.trainings.filter((t) => t.status === 'offen')
    if (!offen.length) continue
    const gram = grammatikDerGruppe(lehrkraftId, g.id, jetzt).trainings.filter((t) => t.vokId && !t.extra && t.status === 'offen')
    // Handlungsbedarf wie in „Meine Klassen" – Ausgeblendetes zählt nicht
    const { sichtbar } = bedarfAufteilen(kursBedarfDerGruppe(vok.hinweisDaten, offen, lehrkraftId, jetzt) as Bedarf[], ausgeblendetVon(lehrkraftId, g.id))
    for (const t of offen) {
      const grammatik = gram
        .filter((x) => x.vokId === t.id)
        .map((x) => ({
          id: x.id,
          titel: x.titel,
          status: x.geplantAb && x.geplantAb > jetzt ? ('geplant' as const) : ('laeuft' as const),
          sicher: x.sicherSchnitt,
          geplantAb: x.geplantAb
        }))
      if (!t.woerter && !grammatik.length) continue
      const hinweise: StartHinweis[] = []
      for (const b of sichtbar) {
        if (b.kurs !== t.id || !b.hinweis || !b.reiter) continue
        const text = hinweisKurz(b.hinweis, b.ids?.length, b.text)
        if (text) hinweise.push({ hinweis: b.hinweis, text, reiter: b.reiter, farbe: HINWEIS_FARBE[b.hinweis as KursHinweisArt] ?? 'gray', ...(b.ids ? { ids: b.ids } : {}) })
      }
      const problem = problemHinweis(vok.wackelig.filter((w) => w.kurs === t.id).length)
      if (problem) hinweise.push(problem)
      const endet = endetHinweis(t.bis, jetzt)
      if (endet) hinweise.push(endet)
      kurse.push({
        id: t.id,
        gruppeId: g.id,
        titel: kursZeilenTitel(g.name, g.fach || t.fach, abschnittText(vok.hinweisDaten[t.id]?.eingabe.teile ?? [], t.baende, t.titel, jetzt)),
        woerter: t.woerter,
        sicher: t.woerter ? t.sicherSchnitt : null,
        lernende: t.lernende,
        heute: t.heuteAktiv,
        testTermin: t.testTermin && t.testTermin >= jetzt - 86_400_000 ? t.testTermin : null,
        hinweise,
        grammatik
      })
    }
  }
  return {
    kurse,
    klassen: [...klassen.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
  }
}

export function startseiteRoute(): (k: Anfrage) => Promise<boolean> {
  return async ({ url, req, res, sitzung }) => {
    if (url.pathname !== '/server/startseite') return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    if (sitzung.nutzer.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    if (req.method !== 'GET') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    return (json(res, 200, startseiteDaten(sitzung.nutzer.id)), true)
  }
}
