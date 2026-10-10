/**
 * Startseite der Lehrkraft (10.10.2026): Daten für die Karte „Termine & Vokabeltraining" und den Kasten „Meine Klassen"
 * am Smartphone – mit EINER Anfrage, ohne die schwere Übersicht von „Meine Klassen" (keine Tests, Reihen, Blätter).
 *
 *   GET /server/startseite   → StartseiteDaten (shared/startseiteKurse.ts)
 *
 * Kurse: jeder laufende Kurs einer eigenen (nicht verborgenen) Lerngruppe mit Wörtern oder Grammatik – auch ohne
 * Testtermin (Befund der Lehrkraft: die Karte zeigte nur Kurse mit Termin). Je Kurs EIN Abzeichen (10.10.2026, zweite
 * Fassung: Test bald > nicht geübt > Problemwörter > ✓, shared/startseiteKurse.ts `kursAbzeichen`); „nicht geübt" aus
 * dem Handlungsbedarf wie in „Meine Klassen" (`kursBedarfDerGruppe`, Ausgeblendetes bleibt ausgeblendet). Nur für
 * Lehrkräfte.
 *
 * Abschnitt je Kurszeile (10.10.2026, Entscheidung der Lehrkraft): der am weitesten fortgeschrittene freigeschaltete
 * Abschnitt in Buchreihenfolge mit Fortschritt – „Green Line 3 · Unit 2 (Abschnitt 3 von 5)" (shared/startseiteKurse.ts
 * `weitesterAbschnitt`); die Gliederung kommt aus der Lehrwerk-Datei (mitgeliefert, gemeinsam oder eigener Import,
 * zwischengespeichert). Einzelfreigaben (nur für ausgewählte Lernende) stehen nicht als eigene Zeile neben dem Kurs der
 * ganzen Lerngruppe in derselben Sprache.
 */
import { json, type Anfrage } from './http'
import { lerngruppenVon } from './onlinetest'
import { vokabelnDerGruppe } from './vokabeln'
import { grammatikDerGruppe } from './grammatik'
import { ausgeblendetVon, bedarfAufteilen, kursBedarfDerGruppe, klassenSchluessel, nachKlasse, type Bedarf } from './klassen'
import { verborgeneGruppen } from './iservKursgruppen'
import type { Quelle } from '../shared/vokabelLaufbahn'
import { lehrwerkGliederung, lehrwerkName } from './wartungAbschnitteTeilen'
import { kursAbzeichen, kursStand, type StartKlasse, type StartKurs, type StartseiteDaten } from '../shared/startseiteKurse'

const quelleVon = (roh: string | undefined): Partial<Quelle> | null => {
  try {
    return roh ? (JSON.parse(roh) as Partial<Quelle>) : null
  } catch {
    return null
  }
}

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
    // Handlungsbedarf wie in „Meine Klassen" – Ausgeblendetes zählt nicht (für „n nicht geübt")
    const { sichtbar } = bedarfAufteilen(kursBedarfDerGruppe(vok.hinweisDaten, offen, lehrkraftId, jetzt) as Bedarf[], ausgeblendetVon(lehrkraftId, g.id))
    const mitInhalt = offen.filter((t) => t.woerter || gram.some((x) => x.vokId === t.id))
    const ganzeGruppe = new Set(mitInhalt.filter((t) => !vok.hinweisDaten[t.id]?.einzeln).map((t) => t.sprache))
    for (const t of mitInhalt) {
      const h = vok.hinweisDaten[t.id]
      if (h?.einzeln && ganzeGruppe.has(t.sprache)) continue
      const teile = h?.eingabe.teile ?? []
      const testTermin = t.testTermin && t.testTermin >= jetzt - 86_400_000 ? t.testTermin : null
      const inaktiv = sichtbar.find((b) => b.kurs === t.id && b.hinweis === 'inaktiv')?.ids ?? []
      kurse.push({
        id: t.id,
        gruppeId: g.id,
        gruppe: g.name.trim(),
        fach: (g.fach || t.fach || '').trim(),
        ...kursStand(teile, t.baende, t.titel, jetzt, {
          quelle: quelleVon(h?.quelle),
          nameVon: (k) => lehrwerkName(k, lehrkraftId),
          gliederung: (k, buch) => lehrwerkGliederung(k, buch, lehrkraftId)
        }),
        woerter: t.woerter,
        sicher: t.woerter ? t.sicherSchnitt : null,
        lernende: t.lernende,
        testTermin,
        // Problemwörter (10.10.2026): dieselbe Zahl wie Kursseite und „Meine Klassen" (shared/problemWoerter.ts)
        abzeichen: kursAbzeichen({ testTermin, inaktiv, problem: t.problemZahl, lernende: t.lernende }, jetzt)
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
