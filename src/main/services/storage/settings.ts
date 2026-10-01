import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { writeAtomic } from './atomar'
import { join } from 'path'
import { AppSettings, DEFAULT_SETTINGS, DeepPartial, SecretName, SavedVocabList } from '@shared/types'

function dataDir(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(dataDir(), file), 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJson(file: string, value: unknown): void {
  writeAtomic(join(dataDir(), file), JSON.stringify(value, null, 2))
}

// ---------- Einstellungen ----------

/** Führt gespeicherte Einstellungen (auch aus älteren Versionen) mit den Standardwerten zusammen. */
function mergeSettings(base: AppSettings, stored: DeepPartial<AppSettings> & { ai?: Record<string, unknown> }): AppSettings {
  const ai = (stored.ai ?? {}) as Record<string, unknown>
  // Version 0.1 speicherte nur ein OpenAI-Textmodell als Zeichenkette
  const legacyText = typeof ai.textModel === 'string' ? { openai: ai.textModel } : {}
  const legacyImage = typeof ai.imageModel === 'string' ? { openai: ai.imageModel } : {}
  return {
    ...base,
    ...(stored as Partial<AppSettings>),
    ai: {
      textProvider: (ai.textProvider as AppSettings['ai']['textProvider']) ?? base.ai.textProvider,
      textModels: { ...base.ai.textModels, ...legacyText, ...(ai.textModels as object) },
      imageProvider: (ai.imageProvider as AppSettings['ai']['imageProvider']) ?? base.ai.imageProvider,
      imageModels: { ...base.ai.imageModels, ...legacyImage, ...(ai.imageModels as object) },
      imageAccess: { ...base.ai.imageAccess, ...(ai.imageAccess as object) },
      autoLatest: typeof ai.autoLatest === 'boolean' ? ai.autoLatest : base.ai.autoLatest,
      access: { ...base.ai.access, ...(ai.access as object) },
      subscriptionModels: { ...base.ai.subscriptionModels, ...(ai.subscriptionModels as object) },
      subscriptionAccepted: { ...base.ai.subscriptionAccepted, ...(ai.subscriptionAccepted as object) },
      cliPaths: { ...base.ai.cliPaths, ...(ai.cliPaths as object) },
      economy: (ai.economy as AppSettings['ai']['economy']) ?? base.ai.economy,
      // Blindprobe für Ankreuzfragen (01.10.2026): fehlt der Wert, ist sie an
      ...((v) => (typeof v === 'boolean' ? { mcBlindprobe: v } : {}))(ai.mcBlindprobe ?? base.ai.mcBlindprobe)
    },
    appearance: { ...base.appearance, ...stored.appearance },
    // iPad: Adresse, PIN und Auswahl getrennt änderbar (30.09.2026)
    ...(base.pcKi || stored.pcKi ? { pcKi: { adresse: '', pin: '', texte: false, bilder: false, hoertexte: false, ...base.pcKi, ...(stored.pcKi as object) } } : {}),
    // Netzzugang: Einzelne Felder (Port, PIN, Autostart) ändern, ohne die übrigen zu verlieren (30.09.2026)
    ...(base.lan || stored.lan ? { lan: { port: 8420, pin: '', ...base.lan, ...(stored.lan as object) } } : {}),
    // IServ: Ziel ändern, ohne Adresse und Benutzer zu verlieren (01.10.2026)
    ...(base.iserv || stored.iserv ? { iserv: { schule: '', benutzer: '', ...base.iserv, ...(stored.iserv as object) } } : {}),
    sicherung: { ...base.sicherung, ...(stored.sicherung as object) },
    datenschutz: { ...base.datenschutz, ...(stored.datenschutz as object) },
    briefkopf: { ...base.briefkopf, ...(stored.briefkopf as object) },
    defaults: { ...base.defaults, ...stored.defaults },
    audio: { voices: { ...base.audio.voices, ...(stored.audio?.voices as Record<string, string>) } },
    // Je Fach zusammenführen: Eine geänderte Fachfarbe darf die übrigen nicht löschen
    fachfarben: { ...base.fachfarben, ...(stored.fachfarben as Record<string, string>) },
    // Schreibanteil je Fach: Das Ändern des einen Fachs darf die übrigen nicht löschen
    schreibanteil: { ...base.schreibanteil, ...(stored.schreibanteil as Record<string, { k5: number; ab6: number }>) },
    // Korrekturzeichen je Fachgruppe: Das Ändern der einen Gruppe darf die übrigen nicht löschen
    korrekturzeichen: {
      ...base.korrekturzeichen,
      ...(stored.korrekturzeichen as Record<string, { zeichen: string; bedeutung: string }[]>)
    },
    // Ebenso je Programm: Das Einblenden des einen darf die Wahl bei den anderen nicht löschen
    // (null nimmt die Festlegung für ein Programm zurück – dann gilt wieder die Regel nach den Fächern)
    programmeAnzeigen: Object.fromEntries(
      Object.entries({ ...base.programmeAnzeigen, ...(stored.programmeAnzeigen as Record<string, boolean | null>) }).filter(([, v]) => typeof v === 'boolean')
    ),
    gradeScale: {
      allgemein: (stored.gradeScale?.allgemein as number[]) ?? base.gradeScale.allgemein,
      jeFach: { ...base.gradeScale.jeFach, ...(stored.gradeScale?.jeFach as Record<string, number[]>) }
    }
  }
}

export function getSettings(): AppSettings {
  return mergeSettings(DEFAULT_SETTINGS, readJson('settings.json', {}))
}

export function setSettings(patch: DeepPartial<AppSettings>): AppSettings {
  const next = mergeSettings(getSettings(), patch as DeepPartial<AppSettings> & { ai?: Record<string, unknown> })
  writeJson('settings.json', next)
  return next
}

// ---------- Geheimnisse (verschlüsselt über Windows DPAPI) ----------

type SecretStore = Partial<Record<SecretName, string>>

export function setSecret(name: SecretName, value: string): void {
  const store = readJson<SecretStore>('secrets.json', {})
  if (!value) {
    delete store[name]
  } else {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Verschlüsselung ist auf diesem System nicht verfügbar.')
    }
    store[name] = safeStorage.encryptString(value).toString('base64')
  }
  writeJson('secrets.json', store)
}

export function getSecret(name: SecretName): string | undefined {
  const store = readJson<SecretStore>('secrets.json', {})
  const enc = store[name]
  if (!enc) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return undefined
  }
}

// ---------- Vokabel-Bibliothek ----------

export function listVocabLists(): SavedVocabList[] {
  return readJson<SavedVocabList[]>('vocab-library.json', [])
}

export function saveVocabList(list: SavedVocabList): SavedVocabList[] {
  const lists = listVocabLists().filter((l) => l.id !== list.id)
  lists.unshift({ ...list, updatedAt: new Date().toISOString() })
  writeJson('vocab-library.json', lists)
  return lists
}

export function deleteVocabList(id: string): SavedVocabList[] {
  const lists = listVocabLists().filter((l) => l.id !== id)
  writeJson('vocab-library.json', lists)
  return lists
}
