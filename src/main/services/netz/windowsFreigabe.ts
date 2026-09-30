/**
 * Windows-Firewall: Freigabe des Netzzugangs dauerhaft einrichten (30.09.2026).
 *
 * Ausdrückliche Zustimmung der Lehrkraft (30.09.2026): „Ja, bauen – ich stimme ausdrücklich zu,
 * dass die App mit Windows-Adminabfrage Firewall-Regeln (nur privates Netz, Port der App)
 * anlegen und Blockierregeln für Schul-Apps entfernen darf."
 *
 * Anlass: Die portable .exe entpackt sich bei jedem Start neu; wurde die Frage von Windows einmal
 * mit „Abbrechen" beantwortet, legt Windows still eine Blockierregel an – und die iPad-App
 * erreicht den PC nicht mehr, obwohl in der App alles eingeschaltet ist.
 *
 * Streng begrenzt auf genau das Zugestimmte:
 * - a) eingehende TCP-Regel für den Port der App, NUR Profil „Privat", Aktion „Zulassen";
 * - b) Programmregel für den langen Pfad der laufenden exe, NUR Profil „Privat", „Zulassen";
 * - c) Blockierregeln entfernen, die für GENAU diese exe (bzw. eine schul-apps.exe) gelten.
 * Keine Regeln anderer Programme, kein öffentliches Profil, keine Defender-/Systemeinstellungen.
 *
 * Die Skripte entstehen aus festen Bausteinen; einfließen nur der als Zahl geprüfte Port und
 * der Pfad der eigenen exe als literaler PowerShell-String. Nutzereingaben gibt es keine.
 * Ausgeführt wird über `PsLauf` – in den Tests ersetzt, damit dort nie eine Adminabfrage kommt.
 */
import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'

/** Gruppe aller Regeln, die Schul-Apps selbst anlegt – daran erkennt das Skript die eigenen */
export const REGEL_GRUPPE = 'Schul-Apps'
/** Name der Portregel; der Port hängt hinten an */
export const PORTREGEL_PRAEFIX = 'Schul-Apps Netzzugang Port '
export const PROGRAMMREGEL_NAME = 'Schul-Apps Programm (privates Netz)'
/** Windows meldet eine abgelehnte UAC-Abfrage mit ERROR_CANCELLED */
export const UAC_ABGEBROCHEN = 1223

export type FreigabeZustand = 'eingerichtet' | 'fehlt' | 'blockiert' | 'unbekannt' | 'nichtWindows'

export interface WindowsFreigabeStatus {
  zustand: FreigabeZustand
  /** Der Port, für den geprüft wurde */
  port: number
  portRegel: boolean
  programmRegel: boolean
  /** Zahl der Blockierregeln für Schul-Apps (privates Netz) */
  blockierregeln: number
  /** Der aufgelöste Pfad der laufenden exe */
  exe: string
  meldung?: string
}

export interface WindowsFreigabeErgebnis {
  ergebnis: 'eingerichtet' | 'abgebrochen' | 'fehler'
  meldung: string
  status: WindowsFreigabeStatus
}

/** Führt ein PowerShell-Skript aus (ohne Erhöhung) und liefert Rückgabewert und Ausgabe */
export type PsLauf = (skript: string) => Promise<{ code: number; ausgabe: string }>

/** Port als ganze Zahl im gültigen Bereich – alles andere wird abgewiesen */
export function pruefePort(port: unknown): number {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Ungültiger Port: ${String(port)}`)
  }
  return port
}

/**
 * Ein literaler PowerShell-String in einfachen Anführungszeichen.
 *
 * PowerShell behandelt auch die typografischen Anführungszeichen ‘ ’ ‚ ‛ als einfache – sie
 * werden deshalb ebenso verdoppelt. Innerhalb von '…' wird sonst nichts ausgewertet ($, `).
 */
export function psLiteral(text: string): string {
  if (/[\u0000-\u001f]/.test(text)) throw new Error('Steuerzeichen im Text')
  return `'${text.replace(/['\u2018\u2019\u201a\u201b]/g, (z) => z + z)}'`
}

/** Nur ein absoluter Windows-Pfad zu einer .exe, ohne Steuerzeichen und ohne Platzhalter */
export function pruefeExePfad(pfad: string): string {
  if (typeof pfad !== 'string' || pfad.length > 1000) throw new Error('Ungültiger Programmpfad')
  if (!/^[A-Za-z]:\\[^\u0000-\u001f"*?<>|]+\.exe$/i.test(pfad)) throw new Error(`Ungültiger Programmpfad: ${pfad}`)
  return pfad
}

/**
 * Der LANGE Pfad der laufenden exe.
 *
 * %TEMP% steht bei manchen Konten als Kurzname da (C:\Users\TORGE_~1\…); Windows trägt in seine
 * Regeln aber den langen Pfad ein. realpathSync.native löst beides auf (GetFinalPathNameByHandle).
 * Bei der portablen Fassung ist das der Entpackordner %TEMP%\Schul-Apps\Schul-Apps.exe
 * (electron-builder.yml, unpackDirName).
 */
export function langerExePfad(execPath: string = process.execPath): string {
  try {
    return realpathSync.native(execPath)
  } catch {
    return execPath
  }
}

/** Ein Skript für -EncodedCommand: Base64 aus UTF-16LE */
export function kodiere(skript: string): string {
  return Buffer.from(skript, 'utf16le').toString('base64')
}

/*
 * Gemeinsamer Baustein: alle eingehenden Regeln, deren Programm eine schul-apps.exe ist.
 * -match ist in PowerShell ohne Groß-/Kleinschreibung.
 */
const SCHULAPPS_FILTER = "@(Get-NetFirewallApplicationFilter -All | Where-Object { $_.Program -match '(^|\\\\)schul-apps\\.exe$' -or $_.Program -ieq $exe })"

/**
 * Status lesen – OHNE Adminrechte. Liefert die Regeln für schul-apps.exe bzw. diese exe und die
 * Portregeln der Gruppe „Schul-Apps" als JSON; ausgewertet wird in `werteStatusAus`.
 */
export function statusSkript(exe: string): string {
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$exe = ${psLiteral(pruefeExePfad(exe))}`,
    '$aus = @()',
    `foreach ($f in ${SCHULAPPS_FILTER}) {`,
    '  foreach ($r in @($f | Get-NetFirewallRule)) {',
    '    $aus += [pscustomobject]@{ art = \'programm\'; name = "$($r.DisplayName)"; gruppe = "$($r.Group)"; aktion = "$($r.Action)"; richtung = "$($r.Direction)"; aktiv = "$($r.Enabled)"; profil = "$($r.Profile)"; programm = "$($f.Program)"; ports = \'\'; protokoll = \'\' }',
    '  }',
    '}',
    `foreach ($r in @(Get-NetFirewallRule -Group ${psLiteral(REGEL_GRUPPE)})) {`,
    '  $pf = $r | Get-NetFirewallPortFilter',
    '  $aus += [pscustomobject]@{ art = \'port\'; name = "$($r.DisplayName)"; gruppe = "$($r.Group)"; aktion = "$($r.Action)"; richtung = "$($r.Direction)"; aktiv = "$($r.Enabled)"; profil = "$($r.Profile)"; programm = \'\'; ports = (@($pf.LocalPort) -join \',\'); protokoll = "$($pf.Protocol)" }',
    '}',
    'ConvertTo-Json -InputObject @($aus) -Compress'
  ].join('\n')
}

/**
 * Das Einrichten – läuft ERHÖHT (eine UAC-Abfrage) und ist idempotent: Jede Regel wird nur
 * angelegt, wenn sie fehlt; nur eigene Portregeln mit abweichendem Port werden ersetzt.
 */
export function einrichtenSkript(port: number, exe: string): string {
  const p = pruefePort(port)
  const pfad = psLiteral(pruefeExePfad(exe))
  return [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    `  $port = ${p}`,
    `  $exe = ${pfad}`,
    `  $gruppe = ${psLiteral(REGEL_GRUPPE)}`,
    `  $portName = ${psLiteral(PORTREGEL_PRAEFIX)} + $port`,
    // a) Portregel: eine passende behalten, eigene abweichende ersetzen
    '  $passt = $false',
    `  foreach ($r in @(Get-NetFirewallRule -Group $gruppe -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like ${psLiteral(
      PORTREGEL_PRAEFIX + '*'
    )} })) {`,
    '    $pf = $r | Get-NetFirewallPortFilter',
    '    $ok = ($r.DisplayName -eq $portName) -and ("$($pf.LocalPort)" -eq "$port") -and ("$($pf.Protocol)" -eq \'TCP\') -and ("$($r.Direction)" -eq \'Inbound\') -and ("$($r.Action)" -eq \'Allow\') -and ("$($r.Profile)" -eq \'Private\') -and ("$($r.Enabled)" -eq \'True\')',
    '    if ($ok -and -not $passt) { $passt = $true } else { $r | Remove-NetFirewallRule }',
    '  }',
    '  if (-not $passt) {',
    '    New-NetFirewallRule -DisplayName $portName -Group $gruppe -Direction Inbound -Protocol TCP -LocalPort $port -Profile Private -Action Allow | Out-Null',
    '  }',
    // b) Programmregel für genau diese exe, nur wenn keine zulassende Regel (privat) da ist
    '  $hat = $false',
    `  foreach ($f in ${SCHULAPPS_FILTER}) {`,
    '    if ($f.Program -ine $exe) { continue }',
    '    foreach ($r in @($f | Get-NetFirewallRule)) {',
    '      if (("$($r.Direction)" -eq \'Inbound\') -and ("$($r.Action)" -eq \'Allow\') -and ("$($r.Enabled)" -eq \'True\') -and ("$($r.Profile)" -match \'Private|Any\')) { $hat = $true }',
    '    }',
    '  }',
    '  if (-not $hat) {',
    `    New-NetFirewallRule -DisplayName ${psLiteral(
      PROGRAMMREGEL_NAME
    )} -Group $gruppe -Direction Inbound -Program $exe -Profile Private -Action Allow | Out-Null`,
    '  }',
    // c) Blockierregeln für Schul-Apps (privates Netz) entfernen – nichts anderes
    `  foreach ($f in ${SCHULAPPS_FILTER}) {`,
    '    foreach ($r in @($f | Get-NetFirewallRule)) {',
    '      if (("$($r.Direction)" -eq \'Inbound\') -and ("$($r.Action)" -eq \'Block\') -and ("$($r.Profile)" -match \'Private|Any\')) { $r | Remove-NetFirewallRule }',
    '    }',
    '  }',
    '  exit 0',
    '} catch {',
    '  exit 2',
    '}'
  ].join('\n')
}

/**
 * Die EINE Adminabfrage: startet das Einrichten erhöht und wartet darauf. Eine abgelehnte
 * Abfrage wirft in Start-Process – daraus wird der Rückgabewert 1223.
 */
export function uacSkript(inneresSkript: string): string {
  const argumente = `-NoProfile -NonInteractive -EncodedCommand ${kodiere(inneresSkript)}`
  return [
    'try {',
    `  $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList ${psLiteral(argumente)}`,
    '  exit $p.ExitCode',
    '} catch {',
    `  if (($_.Exception.InnerException.NativeErrorCode -eq ${UAC_ABGEBROCHEN}) -or (\"$_\" -match 'cancel|abgebrochen|1223')) { exit ${UAC_ABGEBROCHEN} }`,
    '  exit 3',
    '}'
  ].join('\n')
}

interface RegelZeile {
  art?: string
  name?: string
  gruppe?: string
  aktion?: string
  richtung?: string
  aktiv?: string
  profil?: string
  programm?: string
  ports?: string
  protokoll?: string
}

const normPfad = (p: string): string => p.trim().replace(/\//g, '\\').toLowerCase()
const trifftPrivat = (profil = ''): boolean => /Private|Any/i.test(profil)
const istSchulApps = (programm = '', exe: string): boolean => /(^|\\)schul-apps\.exe$/i.test(programm.trim()) || normPfad(programm) === normPfad(exe)

/** Die Ausgabe von `statusSkript` auswerten */
export function werteStatusAus(json: string, port: number, exe: string): WindowsFreigabeStatus {
  const basis = { port, exe, portRegel: false, programmRegel: false, blockierregeln: 0 }
  let zeilen: RegelZeile[]
  try {
    const roh = JSON.parse(json.trim() || '[]') as unknown
    zeilen = (Array.isArray(roh) ? roh : roh && typeof roh === 'object' ? [roh] : []) as RegelZeile[]
  } catch {
    return { ...basis, zustand: 'unbekannt', meldung: 'Die Firewall-Regeln ließen sich nicht lesen.' }
  }
  const eingehend = zeilen.filter((z) => z && z.richtung === 'Inbound')
  const programmZeilen = eingehend.filter((z) => z.art === 'programm' && istSchulApps(z.programm, exe))
  const blockierregeln = programmZeilen.filter((z) => z.aktion === 'Block' && z.aktiv === 'True' && trifftPrivat(z.profil)).length
  const programmRegel = programmZeilen.some(
    (z) => z.aktion === 'Allow' && z.aktiv === 'True' && trifftPrivat(z.profil) && normPfad(z.programm ?? '') === normPfad(exe)
  )
  const portRegel = eingehend.some(
    (z) =>
      z.art === 'port' &&
      z.gruppe === REGEL_GRUPPE &&
      z.name === PORTREGEL_PRAEFIX + port &&
      z.ports === String(port) &&
      z.protokoll === 'TCP' &&
      z.aktion === 'Allow' &&
      z.aktiv === 'True' &&
      z.profil === 'Private'
  )
  const zustand: FreigabeZustand = blockierregeln > 0 ? 'blockiert' : portRegel && programmRegel ? 'eingerichtet' : 'fehlt'
  return { ...basis, portRegel, programmRegel, blockierregeln, zustand }
}

/** Normale PowerShell ohne Erhöhung; das Skript geht kodiert hinein (keine Anführungszeichen-Fallen) */
export const powershellLauf: PsLauf = (skript) =>
  new Promise((fertig) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', kodiere(skript)],
      { timeout: 120_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (fehler, ausgabe) => {
        const code = fehler ? (typeof (fehler as { code?: unknown }).code === 'number' ? (fehler as { code: number }).code : -1) : 0
        fertig({ code, ausgabe: String(ausgabe ?? '') })
      }
    )
  })

export interface WindowsFreigabeOptionen {
  /** Aktueller Port des Netzzugangs */
  port(): number
  /** Pfad der laufenden exe (lang aufgelöst) */
  exe(): string
  lauf?: PsLauf
  plattform?: string
}

export interface WindowsFreigabe {
  status(): Promise<WindowsFreigabeStatus>
  einrichten(): Promise<WindowsFreigabeErgebnis>
}

export function windowsFreigabe(o: WindowsFreigabeOptionen): WindowsFreigabe {
  const lauf = o.lauf ?? powershellLauf
  const plattform = o.plattform ?? process.platform
  let beschaeftigt = false

  const status = async (): Promise<WindowsFreigabeStatus> => {
    const port = pruefePort(o.port())
    const exe = o.exe()
    if (plattform !== 'win32') {
      return { zustand: 'nichtWindows', port, exe, portRegel: false, programmRegel: false, blockierregeln: 0, meldung: 'Nur am Windows-PC.' }
    }
    const r = await lauf(statusSkript(exe))
    if (r.code !== 0)
      return {
        zustand: 'unbekannt',
        port,
        exe,
        portRegel: false,
        programmRegel: false,
        blockierregeln: 0,
        meldung: 'Die Firewall-Regeln ließen sich nicht lesen.'
      }
    return werteStatusAus(r.ausgabe, port, exe)
  }

  const einrichten = async (): Promise<WindowsFreigabeErgebnis> => {
    if (plattform !== 'win32') throw new Error('Die Windows-Freigabe gibt es nur in der App am Windows-PC.')
    if (beschaeftigt) throw new Error('Die Freigabe wird bereits eingerichtet.')
    beschaeftigt = true
    try {
      const skript = uacSkript(einrichtenSkript(pruefePort(o.port()), o.exe()))
      const r = await lauf(skript)
      const nachher = await status()
      if (r.code === UAC_ABGEBROCHEN) return { ergebnis: 'abgebrochen', meldung: 'Freigabe nicht eingerichtet – Abfrage abgebrochen.', status: nachher }
      if (r.code === 0 && nachher.zustand === 'eingerichtet') return { ergebnis: 'eingerichtet', meldung: 'Freigabe dauerhaft eingerichtet.', status: nachher }
      return { ergebnis: 'fehler', meldung: `Freigabe nicht vollständig eingerichtet (Rückgabewert ${r.code}).`, status: nachher }
    } finally {
      beschaeftigt = false
    }
  }

  return { status, einrichten }
}
