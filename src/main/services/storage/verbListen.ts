/**
 * Listen unregelmäßiger Verben je Lehrwerk-Band (30.09.2026) – Regeln in src/shared/verben.ts.
 *
 * Ablage: userData/lehrwerke/verben/<kennung>.json. Der Ordner `lehrwerke` ist beim Zurücksetzen
 * geschützt und steckt in jeder Sicherung (wartung.ts) – eine abgetippte Verbliste lässt sich so
 * wenig wiederbeschaffen wie ein Lehrwerk. Mitgelieferte Lehrwerke bleiben unberührt: Die Liste ist
 * eine eigene Datei neben dem Buch.
 *
 * Mitgelieferte und gemeinsame Verblisten (27.10.2026, Entscheidung der Lehrkraft): Aus dem Navigium-Export kommen
 * Verblisten zu Green Line 2–6 (resources/lehrwerke/verben). Am Server liegen geänderte gemeinsame Fassungen unter
 * <SCHULAPPS_DATEN>/lehrwerke/verben und gelten für alle – pflegen dürfen Admins und die Fachobleute der Sprache, genau
 * wie bei den gemeinsamen Lehrwerken (textbooks.ts). Eigene Listen der Lehrkraft bleiben eigene; am Server hat die
 * gemeinsame Fassung Vorrang, in der Exe die eigene.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { alsMeta, bereinigeVerbListe, pruefeListenId, type VerbListe, type VerbListeMeta } from '@shared/verben'
import { resourcePath } from './paths'
import { loescheDatei, writeAtomic } from './atomar'
import { aufServer, darfLehrwerkSprache } from '../rolle'

function dir(): string {
  const d = join(app.getPath('userData'), 'lehrwerke', 'verben')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

/** Gemeinsame (vom Admin bzw. den Fachobleuten bearbeitete) Fassungen am Server */
function gemeinsamDir(): string {
  const d = join(process.env.SCHULAPPS_DATEN || './server-daten', 'lehrwerke', 'verben')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function lies(datei: string, gemeinsam: boolean): VerbListe | null {
  try {
    const l = bereinigeVerbListe(JSON.parse(readFileSync(datei, 'utf8')))
    return gemeinsam ? { ...l, gemeinsam: true } : l
  } catch {
    // beschädigte Datei überspringen
    return null
  }
}

function liesOrdner(d: string, gemeinsam: boolean): VerbListe[] {
  if (!existsSync(d)) return []
  return readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .map((f) => lies(join(d, f), gemeinsam))
    .filter((l): l is VerbListe => Boolean(l))
}

/** Mitgelieferte Listen, am Server überlagert von den gemeinsamen Fassungen */
function gemeinsame(): VerbListe[] {
  const mit = liesOrdner(join(resourcePath('lehrwerke'), 'verben'), true)
  if (!aufServer()) return mit
  const geaendert = liesOrdner(gemeinsamDir(), true)
  const ids = new Set(geaendert.map((l) => l.id))
  return [...mit.filter((l) => !ids.has(l.id)), ...geaendert]
}

function alle(): VerbListe[] {
  const gem = gemeinsame()
  const own = liesOrdner(dir(), false)
  if (aufServer()) {
    const ids = new Set(gem.map((l) => l.id))
    return [...gem, ...own.filter((l) => !ids.has(l.id))]
  }
  const ownIds = new Set(own.map((l) => l.id))
  return [...gem.filter((l) => !ownIds.has(l.id)), ...own]
}

const collator = new Intl.Collator('de', { numeric: true })

export function listVerbLists(): VerbListeMeta[] {
  return alle()
    .map(alsMeta)
    .sort((a, b) => a.sprache.localeCompare(b.sprache) || collator.compare(a.name, b.name))
}

export function getVerbList(id: string): VerbListe {
  const liste = alle().find((l) => l.id === pruefeListenId(id))
  if (!liste) throw new Error('Die Verbliste wurde nicht gefunden.')
  return liste
}

/** Speichert eine Liste (gleiche Kennung wird ersetzt) und gibt die Übersicht zurück. */
export function saveVerbList(input: VerbListe): VerbListeMeta[] {
  const liste = { ...bereinigeVerbListe(input), aktualisiert: new Date().toISOString() }
  const istGemeinsam = aufServer() && gemeinsame().some((l) => l.id === liste.id)
  if (istGemeinsam) {
    if (!darfLehrwerkSprache(liste.sprache)) throw new Error('Die gemeinsamen Verblisten dürfen nur Admins und die Fachobleute des Fachs bearbeiten.')
    writeAtomic(join(gemeinsamDir(), `${liste.id}.json`), JSON.stringify(liste, null, 1))
  } else writeAtomic(join(dir(), `${liste.id}.json`), JSON.stringify(liste, null, 1))
  return listVerbLists()
}

export function deleteVerbList(id: string): VerbListeMeta[] {
  const kennung = pruefeListenId(id)
  if (aufServer() && gemeinsame().some((l) => l.id === kennung)) {
    if (!darfLehrwerkSprache(getVerbList(kennung).sprache))
      throw new Error('Die gemeinsamen Verblisten dürfen nur Admins und die Fachobleute des Fachs bearbeiten.')
    const eigene = join(gemeinsamDir(), `${kennung}.json`)
    if (!existsSync(eigene)) throw new Error('Mitgelieferte Verblisten lassen sich nicht löschen – nur ändern.')
    // Zurück zur mitgelieferten Fassung
    loescheDatei(eigene)
    return listVerbLists()
  }
  loescheDatei(join(dir(), `${kennung}.json`))
  return listVerbLists()
}
