/**
 * Fächer und Schulbücher der Schule (27.10.2026, abgestimmt; Regeln in shared/schulbuecher.ts).
 *
 *   GET  /server/schulbuecher            – alle Lehrkräfte: { faecher: { liste, gespeichert, abgeleitet }, buecher, lehrwerke, darf }
 *   POST /server/schulbuecher/faecher    – { liste } (nur Admin)
 *   POST /server/schulbuecher/buch       – { buch } anlegen oder ändern (Admin; Fachobleute für Bücher ihrer Fächer)
 *   POST /server/schulbuecher/loeschen   – { id } (Admin; Fachobleute für Bücher ihrer Fächer)
 *
 * Gespeichert in server_einstellungen ('schulfaecher', 'schulbuecher') – schulweit, ohne Personenbezug (nur „zuletzt
 * geändert von“ mit Namen, wie bei den Fachvorgaben). Beim ersten Lesen entsteht der Katalog aus den gemeinsamen
 * Lehrwerksdateien (Green Line, Découvertes, ¡Apúntate!), damit die Sprachen nicht leer beginnen.
 */
import { FAECHER, fachVon } from '@shared/faecher'
import {
  buchAusLehrwerk,
  buecherBereinigt,
  faecherAbgeleitet,
  faecherBereinigt,
  schulbuchBereinigt,
  type LehrwerkKurz,
  type SchulFaecher,
  type Schulbuch
} from '@shared/schulbuecher'
import { getSettings } from '../main/services/storage/settings'
import { listTextbooks } from '../main/services/storage/textbooks'
import { alleNutzer, protokolliereServer, serverWert, setzeServerWert, type NutzerInfo } from './datenbank'
import { alleFachobleute, fachobmannFaecher } from './fachobleute'
import { iservFaecher } from './fachschaft'
import { alsNutzer, json, type Anfrage } from './http'
import { imNutzer } from './kontext'
import { alleLerngruppen } from './onlinetest'

const SCHLUESSEL_BUECHER = 'schulbuecher'
const SCHLUESSEL_FAECHER = 'schulfaecher'

export function alleSchulbuecher(): Schulbuch[] {
  return buecherBereinigt(serverWert<unknown>(SCHLUESSEL_BUECHER, []))
}

export function schulFaecher(): SchulFaecher | null {
  const w = serverWert<unknown>(SCHLUESSEL_FAECHER, null) as { liste?: unknown; stand?: unknown } | null
  if (!w || typeof w !== 'object') return null
  return { liste: faecherBereinigt(w.liste), ...(typeof w.stand === 'string' ? { stand: w.stand } : {}) }
}

/** Fächer, die aus den Daten der Schule hervorgehen (Lerngruppen, IServ-Fachschaften, eigene Fächer, Fachobleute) */
export function abgeleiteteFaecher(): string[] {
  const lerngruppen = alleLerngruppen()
    .map((g) => g.fach)
    .filter(Boolean)
  const iserv: string[] = []
  const eigene: string[] = []
  for (const n of alleNutzer()) {
    if (n.rolle === 'schueler' || n.gesperrt) continue
    try {
      iserv.push(...iservFaecher(n.id))
      eigene.push(...imNutzer(alsNutzer(n), () => getSettings().eigeneFaecher ?? []))
    } catch {
      // ein Konto ohne lesbare Einstellungen zählt nicht
    }
  }
  const obleute = Object.values(alleFachobleute()).flat()
  const buecher = alleSchulbuecher().flatMap((b) => b.faecher)
  return faecherAbgeleitet({ lerngruppen, iserv, eigene, obleute, buecher })
}

/** Lehrwerksdateien (gemeinsame), knapp – für Verknüpfung und „Aus Lehrwerk übernehmen“ */
async function lehrwerkeKurz(ich: NutzerInfo): Promise<LehrwerkKurz[]> {
  const liste = (await imNutzer(alsNutzer(ich), async () => listTextbooks()).catch(() => [])) as LehrwerkKurz[]
  return liste.map((l) => ({
    id: l.id,
    name: l.name,
    language: l.language,
    ...(l.grade ? { grade: l.grade } : {}),
    ...(l.publisher ? { publisher: l.publisher } : {}),
    ...(l.edition ? { edition: l.edition } : {}),
    ...(l.reihe ? { reihe: l.reihe } : {}),
    ...(l.ausgabe ? { ausgabe: l.ausgabe } : {}),
    ...(l.band ? { band: l.band } : {}),
    ...(l.schoolTypeId ? { schoolTypeId: l.schoolTypeId } : {}),
    ...(l.platzhalter ? { platzhalter: true } : {}),
    ...(typeof l.entryCount === 'number' ? { entryCount: l.entryCount } : {})
  }))
}

/** Erster Katalog aus den Lehrwerksdateien – nur einmal, danach pflegt die Schule selbst */
function erstbestand(lehrwerke: LehrwerkKurz[]): Schulbuch[] {
  const aus: Schulbuch[] = []
  for (const l of lehrwerke) {
    const b = buchAusLehrwerk(l)
    if (b && !aus.some((x) => x.id === b.id)) aus.push(b)
  }
  return aus
}

const darfBuch = (rolle: string, obmann: string[], faecher: readonly string[]): boolean =>
  rolle === 'admin' || (rolle === 'lehrkraft' && faecher.length > 0 && faecher.every((f) => obmann.includes(f)))

export async function schulbuecherRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  if (url.pathname !== '/server/schulbuecher' && !url.pathname.startsWith('/server/schulbuecher/')) return false
  if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
  const ich = sitzung.nutzer
  if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
  const obmann = ich.rolle === 'admin' ? [] : fachobmannFaecher(ich.id)
  const was = url.pathname.slice('/server/schulbuecher'.length).replace(/^\//, '')

  if (req.method === 'GET' && !was) {
    const lehrwerke = await lehrwerkeKurz(ich)
    let buecher = alleSchulbuecher()
    // Erster Aufruf (noch nie gespeichert): die Lehrwerksdateien als Grundbestand übernehmen
    if (serverWert<unknown>(SCHLUESSEL_BUECHER, null) === null) {
      buecher = erstbestand(lehrwerke)
      setzeServerWert(SCHLUESSEL_BUECHER, buecher)
    }
    const gespeichert = schulFaecher()
    const abgeleitet = abgeleiteteFaecher()
    return (
      json(res, 200, {
        faecher: {
          liste: gespeichert?.liste ?? abgeleitet,
          gespeichert: Boolean(gespeichert),
          abgeleitet,
          ...(gespeichert?.stand ? { stand: gespeichert.stand } : {})
        },
        buecher,
        lehrwerke,
        darf: ich.rolle === 'admin' ? 'alle' : obmann
      }),
      true
    )
  }
  if (req.method !== 'POST') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
  if (typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
  const b = ((await k.koerper()) ?? {}) as Record<string, unknown>

  if (was === 'faecher') {
    if (ich.rolle !== 'admin') return json(res, 403, { fehler: 'Die Fächerliste pflegt die Verwaltung.' }), true
    const liste = faecherBereinigt(b.liste)
    const f: SchulFaecher = { liste, stand: new Date().toISOString() }
    setzeServerWert(SCHLUESSEL_FAECHER, f)
    protokolliereServer('verwaltung', `Fächer der Schule geändert (${liste.length})`, ich.id)
    return json(res, 200, { faecher: { ...f, gespeichert: true, abgeleitet: abgeleiteteFaecher() } }), true
  }
  if (was === 'buch') {
    const neu = schulbuchBereinigt(b.buch)
    if (!neu) return json(res, 400, { fehler: 'Das Buch braucht mindestens ein Fach und einen Namen (Reihe und Band oder Titel).' }), true
    const buecher = alleSchulbuecher()
    const alt = neu.id ? buecher.find((x) => x.id === neu.id) : undefined
    if (!darfBuch(ich.rolle, obmann, [...neu.faecher, ...(alt?.faecher ?? [])]))
      return json(res, 403, { fehler: 'Nur Admins und die Fachobleute aller Fächer dieses Buchs.' }), true
    const fertig: Schulbuch = {
      ...neu,
      id: neu.id || `b-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      geaendert: { von: ich.name || ich.benutzer, am: new Date().toISOString() }
    }
    const liste = alt ? buecher.map((x) => (x.id === fertig.id ? fertig : x)) : [...buecher, fertig]
    setzeServerWert(SCHLUESSEL_BUECHER, liste)
    protokolliereServer('verwaltung', `Schulbuch ${alt ? 'geändert' : 'angelegt'}: ${fertig.reihe} ${fertig.band}`.trim(), ich.id)
    return json(res, 200, { buch: fertig, buecher: liste }), true
  }
  if (was === 'loeschen') {
    const id = typeof b.id === 'string' ? b.id : ''
    const buecher = alleSchulbuecher()
    const alt = buecher.find((x) => x.id === id)
    if (!alt) return json(res, 404, { fehler: 'Unbekanntes Buch.' }), true
    if (!darfBuch(ich.rolle, obmann, alt.faecher)) return json(res, 403, { fehler: 'Nur Admins und die Fachobleute aller Fächer dieses Buchs.' }), true
    const liste = buecher.filter((x) => x.id !== id)
    setzeServerWert(SCHLUESSEL_BUECHER, liste)
    protokolliereServer('verwaltung', `Schulbuch entfernt: ${alt.reihe} ${alt.band}`.trim(), ich.id)
    return json(res, 200, { buecher: liste }), true
  }
  return json(res, 404, { fehler: 'Unbekannt.' }), true
}

/** Für andere Server-Teile: Namen der Fächer der Schule (gespeichert oder abgeleitet) */
export function faecherDerSchule(): { id: string; label: string }[] {
  const liste = schulFaecher()?.liste ?? abgeleiteteFaecher()
  return FAECHER.filter((f) => liste.includes(f.id)).map((f) => ({ id: f.id, label: fachVon(f.id)?.label ?? f.id }))
}
