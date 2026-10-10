/**
 * Material für die Fachschaft freigeben (02.10.2026, Wunsch der Lehrkraft).
 *
 *  - ⋯ › „Für Fachschaft freigeben": Jede Lehrkraft, die das Fach des Materials unterrichtet
 *    (Einstellungen › Schule › eigene Fächer), sieht und öffnet es. Freigegeben wird das
 *    ORIGINAL – wer öffnet, sieht immer den aktuellen Stand der Erstellerin bzw. des Erstellers.
 *  - Öffnen legt eine stille Arbeitskopie in die eigene Ablage (sie steht nicht in der Bibliothek).
 *    Ändert jemand anderes als der Originalersteller etwas, wird daraus eine eigene, namentlich
 *    benannte Kopie („Titel – Kopie Vorname Nachname"). Für die Fachschaft sichtbar wird sie nur,
 *    wenn man sie selbst freigibt.
 *  - Fach: Fach des Materials; Vokabeltest über die Sprache. Seit 10.10.2026 (shared/fachschaftFach.ts): ohne
 *    erkanntes Fach fragt die Freigabe nach dem Fach; „Allgemein" (Altbestand) sehen nur Lehrkräfte ohne eigene Fächer.
 *  - Rückmeldungen sind nicht freigebbar (Namen und Arbeiten von Lernenden).
 *
 * Löst die erste Fassung ab (Fachordner mit Kopien als Schulpaket, server/fachordner.ts): deren
 * Einträge bleiben lesbar und lassen sich weiter übernehmen.
 */
import { createHash, randomBytes } from 'node:crypto'
import { FAECHER } from '@shared/faecher'
import { faecherAusGruppen } from '@shared/iservFaecher'
import { ALLGEMEIN, fachAusDokument, freigabeFach, freigabeSichtbar } from '@shared/fachschaftFach'
import { getSettings } from '../main/services/storage/settings'
import { erstellePaket, lesePaketEin, WEGE } from '../main/services/paket/wege'
import type { PaketArt } from '../main/services/paket/paket'
import { aktuellerNutzer, imNutzer } from './kontext'
import { alleNutzer, datenbank, nutzerNachId, protokolliereServer } from './datenbank'
import { alsNutzer, json, type Anfrage, type Aufruf } from './http'

export const FREIGEBBAR: PaketArt[] = ['arbeitsblatt', 'vokabeltest', 'klassenarbeit', 'lernzielkontrolle', 'grammatiktest', 'elternbrief', 'tafelbild']

/** Kanalname der Ablage je Art (main/kanaele.ts) */
export const KANAL: Record<string, string> = {
  arbeitsblatt: 'sheets',
  vokabeltest: 'tests',
  klassenarbeit: 'exams',
  lernzielkontrolle: 'kurztests',
  grammatiktest: 'grammarTests',
  elternbrief: 'elternbriefe',
  tafelbild: 'tafelbilder'
}
const ART_ZU_KANAL = new Map(Object.entries(KANAL).map(([art, k]) => [k, art as PaketArt]))

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fach_freigaben (
  id TEXT PRIMARY KEY,
  besitzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  art TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  fach TEXT NOT NULL,
  erstellt TEXT NOT NULL,
  UNIQUE (besitzer_id, art, doc_id)
);
CREATE TABLE IF NOT EXISTS fach_iserv (
  nutzer_id TEXT PRIMARY KEY REFERENCES nutzer(id) ON DELETE CASCADE,
  faecher TEXT NOT NULL DEFAULT '[]',
  stand TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fach_kopien (
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  art TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  freigabe_id TEXT NOT NULL,
  pruefsumme TEXT NOT NULL,
  geaendert INTEGER NOT NULL DEFAULT 0,
  titel TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (nutzer_id, art, doc_id)
);
`
let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    // Nachgerüstet: Titel des Originals (die Oberfläche speichert weiter unter dem alten Namen)
    const spalten = new Set((d.prepare('PRAGMA table_info(fach_kopien)').all() as { name: string }[]).map((x) => x.name))
    if (!spalten.has('titel')) d.exec("ALTER TABLE fach_kopien ADD COLUMN titel TEXT NOT NULL DEFAULT ''")
    bereit = true
  }
  return d
}
export const fachschaftZuruecksetzen = (): void => {
  bereit = false
}

interface Freigabe {
  id: string
  besitzer_id: string
  art: PaketArt
  doc_id: string
  fach: string
  erstellt: string
}
interface Kopie {
  nutzer_id: string
  art: string
  doc_id: string
  freigabe_id: string
  pruefsumme: string
  geaendert: number
  titel: string
}

const pruefsumme = (payload: unknown): string => createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex')

/** Fach eines Materials (aus dem gespeicherten Dokument) – „allgemein", wenn keins zu erkennen ist */
export function fachVon(art: PaketArt, dok: Record<string, unknown>): string {
  return fachAusDokument(art, dok) ?? ALLGEMEIN
}

const name = (dok: Record<string, unknown> | null): string => String(dok?.name ?? '').trim() || 'Material'
const lesen = (besitzer: string, art: PaketArt, id: string): Record<string, unknown> | null => {
  const n = nutzerNachId(besitzer)
  if (!n) return null
  try {
    return imNutzer(alsNutzer(n), () => WEGE[art].get(id))
  } catch {
    return null
  }
}

/** Darf diese Lehrkraft die Freigabe sehen? Eigene Fächer (leer = alle); „Allgemein" seit 10.10.2026 nur ohne Fächer */
function sichtbarFuer(f: Freigabe, eigeneFaecher: string[]): boolean {
  return freigabeSichtbar(f.fach, eigeneFaecher)
}


/** Gespeicherte Fächer aus IServ je Lehrkraft (die Exe „Schul-Apps Online" liest die Gruppenordner) */
const iservFaecher = (nutzerId: string): string[] => {
  const z = db().prepare('SELECT faecher FROM fach_iserv WHERE nutzer_id = ?').get(nutzerId) as { faecher: string } | undefined
  try {
    return z ? (JSON.parse(z.faecher) as string[]) : []
  } catch {
    return []
  }
}

/** Kopie für Lehrkraft `nutzerName` – „Titel – Kopie Vorname Nachname" */
export const kopieName = (titel: string, nutzerName: string): string => `${titel.replace(/ – Kopie .+$/, '')} – Kopie ${nutzerName}`.slice(0, 200)

/**
 * Hülle um die Aufrufe der Programme: Arbeitskopien bleiben aus der Bibliothek, bis sie geändert
 * werden; beim ersten geänderten Speichern bekommen sie ihren Kopie-Namen.
 */
export function mitFachschaft(aufruf: Aufruf): Aufruf {
  return async (kanal, args) => {
    const [vorne, was] = kanal.split(':')
    const art = ART_ZU_KANAL.get(vorne)
    const ich = aktuellerNutzer()
    if (!art || !ich || ich.rolle === 'schueler') return aufruf(kanal, args)
    if (was === 'list') {
      const liste = (await aufruf(kanal, args)) as { id: string }[]
      const versteckt = new Set((db().prepare('SELECT doc_id FROM fach_kopien WHERE nutzer_id = ? AND art = ? AND geaendert = 0').all(ich.id, art) as { doc_id: string }[]).map((x) => x.doc_id))
      return Array.isArray(liste) ? liste.filter((m) => !versteckt.has(m.id)) : liste
    }
    if (was === 'save') {
      const eingabe = args[0] as { id?: string; name?: string; payload?: unknown } | undefined
      const k = eingabe?.id ? (db().prepare('SELECT * FROM fach_kopien WHERE nutzer_id = ? AND art = ? AND doc_id = ?').get(ich.id, art, eingabe.id) as Kopie | undefined) : undefined
      if (k && !k.geaendert && pruefsumme(eingabe!.payload) !== k.pruefsumme) {
        db().prepare('UPDATE fach_kopien SET geaendert = 1 WHERE nutzer_id = ? AND art = ? AND doc_id = ?').run(ich.id, art, k.doc_id)
        protokolliereServer('fachschaft', `Eigene Kopie aus freigegebenem Material (${art})`, ich.id)
        return aufruf(kanal, [{ ...eingabe, name: kopieName(eingabe!.name || 'Material', ich.name || ich.benutzer) }, ...args.slice(1)])
      }
      // Die Oberfläche kennt den Kopie-Namen erst nach dem Neuladen – unter dem alten Namen bleibt es die Kopie
      if (k && k.geaendert && k.titel && eingabe!.name === k.titel)
        return aufruf(kanal, [{ ...eingabe, name: kopieName(k.titel, ich.name || ich.benutzer) }, ...args.slice(1)])
      return aufruf(kanal, args)
    }
    if (was === 'delete') {
      const wert = await aufruf(kanal, args)
      const id = String(args[0] ?? '')
      db().prepare('DELETE FROM fach_kopien WHERE nutzer_id = ? AND art = ? AND doc_id = ?').run(ich.id, art, id)
      // Gelöschtes Original: auch die Freigabe endet
      db().prepare('DELETE FROM fach_freigaben WHERE besitzer_id = ? AND art = ? AND doc_id = ?').run(ich.id, art, id)
      return wert
    }
    return aufruf(kanal, args)
  }
}

export function fachschaftRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (!url.pathname.startsWith('/server/fachschaft')) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const n = sitzung.nutzer
    if (n.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const ich = alsNutzer(n, sitzung.kennung)
    const was = url.pathname.slice('/server/fachschaft'.length).replace(/^\//, '')
    // Eigene Fächer: Einstellungen › Schule und die Fachschafts-Ordner aus IServ
    const eingestellt = imNutzer(ich, () => getSettings().eigeneFaecher ?? [])
    const ausIserv = iservFaecher(n.id)
    const eigeneFaecher = eingestellt.length || ausIserv.length ? [...new Set([...eingestellt, ...ausIserv])] : []

    if (req.method === 'GET' && !was) {
      const namen = new Map(alleNutzer().map((x) => [x.id, x]))
      const alle = db().prepare('SELECT * FROM fach_freigaben ORDER BY erstellt DESC').all() as unknown as Freigabe[]
      const eintraege = alle
        .filter((f) => f.besitzer_id === n.id || sichtbarFuer(f, eigeneFaecher))
        .flatMap((f) => {
          const dok = lesen(f.besitzer_id, f.art, f.doc_id)
          if (!dok) return []
          const b = namen.get(f.besitzer_id)
          // Thema und Jahrgang (10.10.2026): die Materialien-Seite am Telefon zeigt Freigaben im passenden Thema
          const st = { ...((dok.stats ?? {}) as Record<string, unknown>), ...dok }
          const text = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
          const thema = text(st.ueberthema) || text(st.topic) || text(st.thema)
          const jahrgang = typeof st.grade === 'number' ? st.grade : undefined
          return [
            {
              id: f.id,
              art: f.art,
              docId: f.doc_id,
              fach: f.fach,
              titel: name(dok),
              vonName: b?.name || b?.benutzer || '',
              eigen: f.besitzer_id === n.id,
              datum: String(dok.updatedAt ?? f.erstellt),
              ...(thema ? { thema } : {}),
              ...(jahrgang ? { jahrgang } : {})
            }
          ]
        })
      const faecher = [...new Set(eintraege.map((e) => e.fach))].map((id) => ({ id, label: id === 'allgemein' ? 'Allgemein' : (FAECHER.find((f) => f.id === id)?.label ?? id) }))
      return (json(res, 200, { eintraege, faecher }), true)
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const k0 = (await k.koerper()) as Record<string, unknown>

    if (was === 'iserv-gruppen') {
      // Die Exe meldet die Namen der Gruppenordner; gespeichert werden nur die erkannten Fächer
      const ordner = Array.isArray(k0.ordner) ? (k0.ordner as unknown[]).map((x) => String(x).slice(0, 120)).slice(0, 500) : []
      const faecher = faecherAusGruppen(ordner)
      db().prepare('INSERT OR REPLACE INTO fach_iserv (nutzer_id, faecher, stand) VALUES (?, ?, ?)').run(n.id, JSON.stringify(faecher), new Date().toISOString())
      return (json(res, 200, { faecher }), true)
    }
    if (was === 'freigeben' || was === 'zuruecknehmen') {
      const art = String(k0.art ?? '') as PaketArt
      const docId = String(k0.id ?? '')
      if (!FREIGEBBAR.includes(art)) return (json(res, 400, { fehler: art === 'rueckmeldung' ? 'Rückmeldungen enthalten Schülerdaten und lassen sich nicht freigeben.' : 'Dieses Material lässt sich nicht freigeben.' }), true)
      if (was === 'zuruecknehmen') {
        db().prepare('DELETE FROM fach_freigaben WHERE besitzer_id = ? AND art = ? AND doc_id = ?').run(n.id, art, docId)
        return (json(res, 200, { ok: true }), true)
      }
      const dok = lesen(n.id, art, docId)
      if (!dok) return (json(res, 404, { fehler: 'Das Material gibt es nicht.' }), true)
      // Eine noch unveränderte Arbeitskopie ist kein eigenes Material
      const k = db().prepare('SELECT geaendert FROM fach_kopien WHERE nutzer_id = ? AND art = ? AND doc_id = ?').get(n.id, art, docId) as { geaendert: number } | undefined
      if (k && !k.geaendert) return (json(res, 400, { fehler: 'Das ist das Material eines anderen – es ist bereits freigegeben.' }), true)
      // Kein Fach im Material: die Oberfläche fragt nach (k0.fach) – ohne Fach keine Freigabe (10.10.2026)
      const ergebnis = freigabeFach(art, dok, k0.fach)
      if ('fachNoetig' in ergebnis) return (json(res, 400, { fehler: 'Für welches Fach ist das Material? Bitte ein Fach wählen.', fachNoetig: true }), true)
      const fach = ergebnis.fach
      const id = randomBytes(8).toString('hex')
      db().prepare('INSERT OR IGNORE INTO fach_freigaben (id, besitzer_id, art, doc_id, fach, erstellt) VALUES (?, ?, ?, ?, ?, ?)').run(id, n.id, art, docId, fach, new Date().toISOString())
      protokolliereServer('fachschaft', `Material freigegeben (${art}, ${fach})`, n.id)
      return (json(res, 200, { ok: true, fach, label: fach === 'allgemein' ? 'Allgemein' : (FAECHER.find((f) => f.id === fach)?.label ?? fach) }), true)
    }

    if (was === 'oeffnen') {
      const f = db().prepare('SELECT * FROM fach_freigaben WHERE id = ?').get(String(k0.freigabe ?? '')) as Freigabe | undefined
      if (!f || (f.besitzer_id !== n.id && !sichtbarFuer(f, eigeneFaecher))) return (json(res, 404, { fehler: 'Diese Freigabe gibt es nicht (mehr).' }), true)
      // Eigenes Material: das Original
      if (f.besitzer_id === n.id) return (json(res, 200, { art: f.art, id: f.doc_id }), true)
      const besitzer = nutzerNachId(f.besitzer_id)
      const dok = lesen(f.besitzer_id, f.art, f.doc_id)
      if (!besitzer || !dok) return (json(res, 404, { fehler: 'Das Material gibt es nicht mehr.' }), true)
      try {
        // Frühere, unveränderte Arbeitskopie ersetzen – sie zeigt einen alten Stand
        for (const alt of db().prepare('SELECT * FROM fach_kopien WHERE nutzer_id = ? AND freigabe_id = ? AND geaendert = 0').all(n.id, f.id) as unknown as Kopie[]) {
          imNutzer(ich, () => {
            try {
              void Promise.resolve(entferne(alt.art as PaketArt, alt.doc_id))
            } catch {
              // schon weg
            }
          })
          db().prepare('DELETE FROM fach_kopien WHERE nutzer_id = ? AND art = ? AND doc_id = ?').run(n.id, alt.art, alt.doc_id)
        }
        const paket = imNutzer(alsNutzer(besitzer), () => erstellePaket(name(dok), [{ art: f.art, id: f.doc_id }]))
        const [neu] = imNutzer(ich, () => lesePaketEin(paket)).filter((x) => x.art === f.art)
        if (!neu) throw new Error('Das Material ließ sich nicht öffnen.')
        const kopie = imNutzer(ich, () => WEGE[f.art].get(neu.id))
        db()
          .prepare('INSERT OR REPLACE INTO fach_kopien (nutzer_id, art, doc_id, freigabe_id, pruefsumme, geaendert, titel) VALUES (?, ?, ?, ?, ?, 0, ?)')
          .run(n.id, f.art, neu.id, f.id, pruefsumme(kopie?.payload), name(kopie))
        return (json(res, 200, { art: f.art, id: neu.id }), true)
      } catch (e) {
        return (json(res, 400, { fehler: e instanceof Error ? e.message : String(e) }), true)
      }
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}

/** Arbeitskopie entfernen (über die Ablage des Programms) */
let entferneAufruf: Aufruf | null = null
export const setzeEntferner = (a: Aufruf): void => {
  entferneAufruf = a
}
const entferne = (art: PaketArt, id: string): unknown => entferneAufruf?.(`${KANAL[art]}:delete`, [id])
