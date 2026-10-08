/**
 * Ablagen der KI-Programme auf dem Server aufräumen (08.10.2026, Auftrag der Lehrkraft: „alles verschlüsselt").
 *
 * Codex und Claude Code lesen ihre Ordner (<DATEN>/nutzer/<id>/ki/codex|claude|home) selbst – verschlüsseln lässt sich
 * dort nichts, was die Programme brauchen (shims/fs.ts nimmt ki/ deshalb aus). Was sie brauchen, ist nur die Anmeldung
 * (codex: auth.json, config.toml, installation_id; claude: .credentials.json, .claude.json, settings.json). Alles andere
 * sind Protokolle, Verläufe und Zwischenstände, die Teile der Anfragen enthalten können (pseudonymisierte Antworten,
 * Bilder von Arbeiten). Das wird hier entfernt – beim Start und alle 10 Minuten (start.ts). Dazu enge Rechte (0700/0600).
 *
 * Die Aufrufe selbst legen seit 08.10.2026 nichts mehr dauerhaft ab (cli.ts: --ephemeral, kein Verlauf, keine
 * Erinnerungen, SQLite und Protokolle im Arbeitsordner, der nach dem Aufruf gelöscht wird); das Aufräumen fängt Reste
 * aus älteren Fassungen, aus Anmeldungen und abgebrochenen Läufen.
 */
import { chmodSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Was in den Ordnern der KI-Programme weg darf (Name → Muster) */
const WEG: Record<string, RegExp[]> = {
  codex: [
    /^sessions$/,
    /^archived_sessions$/,
    /^log$/,
    /^logs$/,
    /^generated_images$/,
    /^memories$/,
    /^shell_snapshots$/,
    /^\.?tmp$/,
    /^history.*\.jsonl$/,
    /^(?:logs|memories|state|goals|queue)_\d+\.sqlite(?:-shm|-wal|-journal)?$/
  ],
  claude: [/^projects$/, /^todos$/, /^shell-snapshots$/, /^debug$/, /^file-history$/, /^session-env$/, /^statsig$/, /^history\.jsonl$/, /^logs$/],
  home: [/^\.cache$/],
  // Arbeitsordner der Aufrufe (cli.ts withWorkDir) – laufende Aufrufe sind jünger als die Schonfrist
  tmp: [/.*/]
}

/** Zuletzt geänderte Einträge bleiben (ein Aufruf könnte sie gerade benutzen) */
const SCHONFRIST_MS = 15 * 60 * 1000

const rechte = (p: string, mode: number): void => {
  try {
    chmodSync(p, mode)
  } catch {
    // nicht überall möglich (Windows) – kein Fehler
  }
}

/** Eine Ablage `ki` aufräumen; Ergebnis: Anzahl entfernter Einträge */
export function kiOrdnerAufraeumen(ki: string, jetzt = Date.now(), schonfrist = SCHONFRIST_MS): number {
  if (!existsSync(ki)) return 0
  let n = 0
  rechte(ki, 0o700)
  for (const teil of readdirSync(ki)) {
    const ordner = join(ki, teil)
    let st
    try {
      st = statSync(ordner)
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    rechte(ordner, 0o700)
    const muster = WEG[teil] ?? []
    for (const name of readdirSync(ordner)) {
      const p = join(ordner, name)
      let s
      try {
        s = statSync(p)
      } catch {
        continue
      }
      if (muster.some((m) => m.test(name))) {
        // Arbeitsordner: Aufrufe dauern bis zu 12 Minuten (cli.ts TIMEOUT_MS) – dort mindestens 30 Minuten Frist
        const frist = teil === 'tmp' && schonfrist > 0 ? Math.max(schonfrist, 30 * 60 * 1000) : schonfrist
        if (frist > 0 && jetzt - s.mtimeMs < frist) continue
        try {
          rmSync(p, { recursive: true, force: true, maxRetries: 2 })
          n++
        } catch {
          // beim nächsten Durchgang
        }
      } else if (s.isFile()) rechte(p, 0o600)
      else if (s.isDirectory()) rechte(p, 0o700)
    }
  }
  return n
}

/** Alle Ablagen `ki` unter <daten>/nutzer/<id>/ki und <daten>/system/ki */
export function kiAblagenAufraeumen(daten: string, jetzt = Date.now(), schonfrist = SCHONFRIST_MS): number {
  let n = 0
  const nutzer = join(daten, 'nutzer')
  if (existsSync(nutzer)) for (const id of readdirSync(nutzer)) n += kiOrdnerAufraeumen(join(nutzer, id, 'ki'), jetzt, schonfrist)
  n += kiOrdnerAufraeumen(join(daten, 'system', 'ki'), jetzt, schonfrist)
  return n
}
