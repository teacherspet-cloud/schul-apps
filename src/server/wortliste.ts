/**
 * Wortliste im Fachordner der Lernenden (09.10.2026, Wunsch der Lehrkraft; Regeln: shared/wortliste.ts).
 *
 *  GET /s/api/wortliste?fach=<Fach>&id=<Kurs>&id=…   alle freigegebenen Wörter des Fachs mit dem eigenen Stand
 *
 * Die Kurse nennt der Ordner (dieselben wie im Register „Vokabeln"); jeder wird hier noch einmal geprüft (für die
 * Person freigegeben, offen) und nur mit seinen freien Abschnitten gelesen (geplante Freischaltung, kursFuerLernende).
 * Dazu bei Konten die freien Abschnitte des Vokabelwegs im Fach. Nur eigene Daten: Lernstand der anfragenden Person.
 */
import { fachAusName } from '../shared/faecher'
import { kursFuerLernende } from '../shared/freigabePlan'
import { abschnitteEinordnen } from '../shared/kursAbschnitte'
import type { Quelle } from '../shared/vokabelLaufbahn'
import type { Vokabel } from '../shared/vokabeltrainer'
import { kursGruppen, suchform, wortAus, zusammenfuehren, type Wortliste, type WortlisteGruppe } from '../shared/wortliste'
import { json, type Anfrage } from './http'
import { istOffen, json_, standVon, teileVon, vokIstFuer, zeile } from './vokabeln'
import { wegAbschnitteFuer } from './vokabelweg'

/** Fachname einheitlich (Kennung, Name oder Sprachkürzel → Name) */
const fachName = (f: string): string => fachAusName(f)?.label ?? f.trim()

export async function wortlisteFuer(ich: Parameters<typeof vokIstFuer>[1], fach: string, kursIds: string[]): Promise<Wortliste> {
  const gruppen: WortlisteGruppe[] = []
  let sprache = ''
  for (const id of [...new Set(kursIds)].slice(0, 40)) {
    const z0 = zeile(id)
    if (!z0 || !istOffen(z0) || !vokIstFuer(z0, ich)) continue
    // Nur freie Abschnitte (geplante Freischaltung, 09.10.2026)
    const z = kursFuerLernende(z0)
    const woerter = json_(z.woerter, [] as Vokabel[])
    if (!woerter.length) continue
    sprache ||= z.sprache
    const teile = teileVon(z)
    const quelle = json_(z.quelle, null as Partial<Quelle> | null)
    gruppen.push(...kursGruppen(z.id, teile, abschnitteEinordnen(teile, quelle), woerter, standVon(z.id, ich.id).woerter))
  }
  // Vokabelweg (nur Konten): freie Lehrwerksabschnitte des Fachs, in Buchreihenfolge
  const soll = fachName(fach)
  // Steht ein Lehrwerkswort schon in einem Kurs, gilt der Kurs (dort liegt der Lernstand) – wie im Kasten des Vokabelwegs
  const imKurs = new Set(gruppen.flatMap((g) => g.woerter.map((v) => suchform(v.term))))
  for (const w of await wegAbschnitteFuer(ich, (f) => fachName(f) === soll).catch(() => [])) {
    sprache ||= w.sprache
    w.abschnitte.forEach((a, i) => {
      gruppen.push({
        key: `lb:${w.key}:${a.key}`,
        titel: `Vokabelweg ${w.name} · ${[a.unit, a.section].filter(Boolean).join(' · ')}`,
        zeit: 0,
        folge: i,
        woerter: a.woerter.filter((v) => !imKurs.has(suchform(v.term))).map((v) => wortAus(v, w.staende[v.id]))
      })
    })
  }
  return { fach: soll, sprache, gruppen: zusammenfuehren(gruppen) }
}

export function wortlisteRoute(): (k: Anfrage) => Promise<boolean> {
  return async ({ url, req, res, sitzung }) => {
    if (url.pathname !== '/s/api/wortliste') return false
    if (req.method !== 'GET') return json(res, 405, { fehler: 'Nur lesen.' }), true
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    if (sitzung.nutzer.rolle !== 'schueler') return json(res, 403, { fehler: 'Die Wortliste gibt es für Lernende.' }), true
    const fach = String(url.searchParams.get('fach') ?? '').slice(0, 60)
    const ids = url.searchParams.getAll('id').map((x) => x.slice(0, 64))
    return json(res, 200, await wortlisteFuer(sitzung.nutzer, fach, ids)), true
  }
}
