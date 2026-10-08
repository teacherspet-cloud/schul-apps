/**
 * Diagnose-Protokolle (08.10.2026, Befund im Unterricht: Seiten hingen, Spiele mussten neu geladen werden – das
 * Container-Protokoll war nach dem Neustart weg). Zwei Dateien im Datenordner (überstehen Neustarts):
 *  - langsam.log: Anfragen über 1 Sekunde (Zeit, Dauer, Methode, Pfad ohne Abfrageteil),
 *  - browser.log: Fehlerberichte aus den Browsern der Lernenden (Seite, Meldung, Gerät) – ohne Namen.
 * Je Datei höchstens 2 MB, danach eine Vorgängerdatei (.1).
 *
 * Verschlüsselt (08.10.2026, Auftrag der Lehrkraft „alles verschlüsselt"): Eine Datei am Stück (SAENC1, shims/fs.ts)
 * ließe sich nur durch Neuschreiben verlängern. Darum wird JEDE ZEILE für sich verschlüsselt („v1:…", geheim.ts) und
 * angehängt; `leseDiagnose` entschlüsselt sie wieder (Verwaltung › Diagnose). Vor dem Schreiben wird bereinigt
 * (`bereinige`): keine Abfrageteile, keine Codes in Adressen (/s/t/<CODE> …), kein Zitierter Text, keine
 * SyntaxError-Meldungen (die zitieren Anfragekörper).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { entschluessle, verschluessle } from './geheim'

export type DiagnoseDatei = 'langsam' | 'browser'

const ordner = (): string | null => {
  const d = process.env.SCHULAPPS_DATEN
  if (!d) return null
  const o = join(d, 'protokolle')
  if (!existsSync(o)) mkdirSync(o, { recursive: true, mode: 0o700 })
  return o
}

/** Pfadteile, die einen Zugangscode tragen (Schülerseiten und QR-Links: /s/t/, /s/vt/, /s/gt/, /s/r/ …; nicht /s/api/) */
const CODE_PFAD = /(\/s\/(?!api\/)[a-z]{1,4}\/)[^/?#\s|]+/gi

/** Adressen kürzen: Abfrageteil und Anker weg, Codes in Pfaden ersetzen */
export function adresseOhneCodes(text: string): string {
  return (
    text
      // Volle Adressen (https://…/pfad?x=1#y) und Pfade (/s/…?code=…)
      .replace(/((?:https?:\/\/[^\s/|]+)?\/[^\s?#|]*)[?#][^\s|]*/gi, '$1')
      .replace(CODE_PFAD, '$1…')
      // Dateien des Datenordners / Ablage mit Kennungen der Nutzer
      .replace(/\/nutzer\/[a-z0-9]+/gi, '/nutzer/…')
  )
}

/** Eine Zeile vor dem Schreiben bereinigen: keine Codes, keine zitierten Inhalte, keine Anfragekörper */
export function bereinige(zeile: string): string {
  let z = zeile.replace(/\s+/g, ' ')
  // SyntaxError (z. B. JSON.parse) zitiert den Anfragekörper – nur die Art des Fehlers behalten
  z = z.replace(/SyntaxError\b.*?(?= \| |$)/g, 'SyntaxError (Inhalt entfernt)')
  // Zitierter Text („…", "…", '…', «…», `…`) kann Antworten, Namen oder Titel enthalten
  z = z
    .replace(/„[^“”"]*[“”"]|"[^"]*"|«[^»]*»|`[^`]*`/g, '…')
    .replace(/(^|[\s(:=])'[^']{0,200}'(?=[\s),.;:|]|$)/g, '$1…')
  return adresseOhneCodes(z).slice(0, 1500)
}

export function protokoll(name: DiagnoseDatei, zeile: string): void {
  try {
    const o = ordner()
    if (!o) return
    const datei = join(o, `${name}.log`)
    if (existsSync(datei) && statSync(datei).size > 2_000_000) renameSync(datei, `${datei}.1`)
    appendFileSync(datei, `${verschluessle(`${new Date().toISOString()} ${bereinige(zeile)}`)}\n`, { mode: 0o600 })
  } catch {
    // Diagnose darf nie den Betrieb stören
  }
}

/** Zeilen einer Diagnosedatei entschlüsselt lesen (neueste zuletzt); alte Klartextzeilen bleiben, wie sie sind */
export function leseDiagnose(name: DiagnoseDatei, anzahl = 500, datei?: string): string[] {
  const o = datei ? null : ordner()
  const pfad = datei ?? (o ? join(o, `${name}.log`) : null)
  if (!pfad || !existsSync(pfad)) return []
  return readFileSync(pfad, 'utf8')
    .split('\n')
    .filter(Boolean)
    .slice(-anzahl)
    .map((z) => {
      if (!z.startsWith('v1:')) return z
      try {
        return entschluessle(z)
      } catch {
        return '(unlesbar)'
      }
    })
}

/** Höchstens 20 Browser-Berichte je Adresse und Minute */
const zaehler = new Map<string, { n: number; ab: number }>()
export function berichtErlaubt(ip: string): boolean {
  const jetzt = Date.now()
  const z = zaehler.get(ip)
  if (!z || jetzt - z.ab > 60_000) {
    zaehler.set(ip, { n: 1, ab: jetzt })
    if (zaehler.size > 5000) zaehler.clear()
    return true
  }
  z.n++
  return z.n <= 20
}
