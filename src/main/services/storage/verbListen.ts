/**
 * Listen unregelmäßiger Verben je Lehrwerk-Band (30.09.2026) – Regeln in src/shared/verben.ts.
 *
 * Ablage: userData/lehrwerke/verben/<kennung>.json. Der Ordner `lehrwerke` ist beim Zurücksetzen
 * geschützt und steckt in jeder Sicherung (wartung.ts) – eine abgetippte Verbliste lässt sich so
 * wenig wiederbeschaffen wie ein Lehrwerk. Mitgelieferte Lehrwerke bleiben unberührt: Die Liste ist
 * eine eigene Datei neben dem Buch.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { alsMeta, bereinigeVerbListe, pruefeListenId, type VerbListe, type VerbListeMeta } from '@shared/verben'
import { loescheDatei, writeAtomic } from './atomar'

function dir(): string {
  const d = join(app.getPath('userData'), 'lehrwerke', 'verben')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function lies(datei: string): VerbListe | null {
  try {
    return bereinigeVerbListe(JSON.parse(readFileSync(datei, 'utf8')))
  } catch {
    // beschädigte Datei überspringen
    return null
  }
}

const collator = new Intl.Collator('de', { numeric: true })

export function listVerbLists(): VerbListeMeta[] {
  const d = dir()
  return readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .map((f) => lies(join(d, f)))
    .filter((l): l is VerbListe => Boolean(l))
    .map(alsMeta)
    .sort((a, b) => a.sprache.localeCompare(b.sprache) || collator.compare(a.name, b.name))
}

export function getVerbList(id: string): VerbListe {
  const liste = lies(join(dir(), `${pruefeListenId(id)}.json`))
  if (!liste) throw new Error('Die Verbliste wurde nicht gefunden.')
  return liste
}

/** Speichert eine Liste (gleiche Kennung wird ersetzt) und gibt die Übersicht zurück. */
export function saveVerbList(input: VerbListe): VerbListeMeta[] {
  const liste = { ...bereinigeVerbListe(input), aktualisiert: new Date().toISOString() }
  writeAtomic(join(dir(), `${liste.id}.json`), JSON.stringify(liste, null, 1))
  return listVerbLists()
}

export function deleteVerbList(id: string): VerbListeMeta[] {
  loescheDatei(join(dir(), `${pruefeListenId(id)}.json`))
  return listVerbLists()
}
