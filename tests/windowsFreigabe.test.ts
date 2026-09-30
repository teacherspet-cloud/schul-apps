import { describe, expect, it } from 'vitest'
import {
  einrichtenSkript,
  kodiere,
  PORTREGEL_PRAEFIX,
  pruefeExePfad,
  pruefePort,
  psLiteral,
  statusSkript,
  uacSkript,
  UAC_ABGEBROCHEN,
  werteStatusAus,
  windowsFreigabe,
  type PsLauf
} from '../src/main/services/netz/windowsFreigabe'

/*
 * Windows-Firewall-Freigabe (30.09.2026, ausdrückliche Zustimmung der Lehrkraft).
 *
 * Geprüft wird nur der BAU der Skripte und das Auswerten – die Ausführung läuft über einen
 * ersetzten `PsLauf`. Eine echte UAC-Abfrage darf ein Test nie auslösen.
 */
const EXE = 'C:\\Users\\Lehrkraft\\AppData\\Local\\Temp\\Schul-Apps\\Schul-Apps.exe'

/** Das innere (erhöhte) Skript aus dem UAC-Aufruf zurückgewinnen */
function inneresAus(uac: string): string {
  const b64 = /-EncodedCommand ([A-Za-z0-9+/=]+)/.exec(uac)?.[1] ?? ''
  return Buffer.from(b64, 'base64').toString('utf16le')
}

describe('Windows-Freigabe: Bausteine', () => {
  it('nimmt nur ganze Ports im gültigen Bereich', () => {
    expect(pruefePort(8420)).toBe(8420)
    for (const p of [0, -1, 65536, 8420.5, NaN, '8420', '8420; Remove-Item C:\\', null, undefined]) {
      expect(() => pruefePort(p), String(p)).toThrow(/Ungültiger Port/)
    }
  })

  it('escaped Pfade als literalen PowerShell-String', () => {
    expect(psLiteral('C:\\a b\\x.exe')).toBe("'C:\\a b\\x.exe'")
    expect(psLiteral("O'Brien")).toBe("'O''Brien'")
    // Typografische Anführungszeichen gelten in PowerShell ebenfalls als einfache
    expect(psLiteral('a\u2019b\u2018c')).toBe("'a\u2019\u2019b\u2018\u2018c'")
    // $ und Backtick bleiben in '…' wirkungslos
    expect(psLiteral('$(calc)`n')).toBe("'$(calc)`n'")
    expect(() => psLiteral('a\nb')).toThrow()
  })

  it('nimmt nur absolute Pfade zu einer .exe', () => {
    expect(pruefeExePfad(EXE)).toBe(EXE)
    expect(pruefeExePfad("C:\\Users\\O'Brien\\Schul-Apps.exe")).toContain("O'Brien")
    for (const p of ['Schul-Apps.exe', '\\\\server\\share\\x.exe', 'C:\\x\\y.bat', 'C:\\a\nb\\x.exe', 'C:\\a"b\\x.exe', 'C:\\*\\x.exe']) {
      expect(() => pruefeExePfad(p), p).toThrow(/Ungültiger Programmpfad/)
    }
  })

  it('kodiert für -EncodedCommand als UTF-16LE', () => {
    expect(Buffer.from(kodiere('exit 0'), 'base64').toString('utf16le')).toBe('exit 0')
  })
})

describe('Windows-Freigabe: das erhöhte Skript', () => {
  const skript = einrichtenSkript(8420, "C:\\Users\\O'Brien\\AppData\\Local\\Temp\\Schul-Apps\\Schul-Apps.exe")

  it('setzt Port als Zahl und Pfad als escapten Literal ein', () => {
    expect(skript).toContain('$port = 8420')
    expect(skript).toContain("$exe = 'C:\\Users\\O''Brien\\AppData\\Local\\Temp\\Schul-Apps\\Schul-Apps.exe'")
    expect(() => einrichtenSkript(Number('8420x'), EXE)).toThrow()
    expect(() => einrichtenSkript(8420, 'C:\\x.exe; Remove-Item')).toThrow()
  })

  it('legt nur Regeln für das PRIVATE Profil an und nur mit „Zulassen"', () => {
    const neu = skript.split('\n').filter((z) => z.includes('New-NetFirewallRule'))
    expect(neu).toHaveLength(2)
    for (const z of neu) {
      expect(z).toContain('-Profile Private')
      expect(z).toContain('-Action Allow')
      expect(z).toContain('-Direction Inbound')
      expect(z).not.toMatch(/Public|Domain|Any/)
    }
    expect(neu[0]).toContain('-Protocol TCP -LocalPort $port')
    expect(neu[1]).toContain('-Program $exe')
    expect(skript).not.toMatch(/Public/)
  })

  it('prüft vor dem Anlegen (idempotent)', () => {
    expect(skript).toMatch(/if \(-not \$passt\) \{\s*New-NetFirewallRule -DisplayName \$portName/)
    expect(skript).toMatch(/if \(-not \$hat\) \{\s*New-NetFirewallRule/)
    // Eine passende Portregel bleibt, eine abweichende eigene wird ersetzt
    expect(skript).toContain("-like 'Schul-Apps Netzzugang Port *'")
    expect(skript).toContain('if ($ok -and -not $passt) { $passt = $true } else { $r | Remove-NetFirewallRule }')
  })

  it('entfernt nur eigene Portregeln und nur Blockierregeln von Schul-Apps', () => {
    const entfernen = skript.split('\n').filter((z) => z.includes('Remove-NetFirewallRule'))
    expect(entfernen).toHaveLength(2)
    // 1) nur innerhalb der Schleife über die Gruppe „Schul-Apps" mit dem Portregel-Namen
    expect(skript).toMatch(/Get-NetFirewallRule -Group \$gruppe[^\n]*'Schul-Apps Netzzugang Port \*'/)
    // 2) nur Aktion Block, nur eingehend, nur Filter auf schul-apps.exe bzw. genau diese exe
    expect(entfernen[1]).toContain('"$($r.Action)" -eq \'Block\'')
    expect(entfernen[1]).toContain("-eq 'Inbound'")
    expect(skript).toContain("$_.Program -match '(^|\\\\)schul-apps\\.exe$' -or $_.Program -ieq $exe")
    // Nichts anderes an Windows
    expect(skript).not.toMatch(/Set-NetFirewallProfile|Set-MpPreference|Disable-|Set-NetFirewallRule|netsh|reg /i)
  })

  it('startet GENAU EINE Adminabfrage und meldet den Abbruch als 1223', () => {
    const uac = uacSkript(skript)
    expect(uac.match(/Start-Process/g)).toHaveLength(1)
    expect(uac).toContain('-Verb RunAs -Wait -PassThru')
    expect(uac).toContain(`exit ${UAC_ABGEBROCHEN}`)
    expect(inneresAus(uac)).toBe(skript)
    // Die Befehlszeile von Windows fasst höchstens 32 767 Zeichen – auch doppelt kodiert
    expect(kodiere(uac).length).toBeLessThan(30000)
  })
})

describe('Windows-Freigabe: Status', () => {
  const zeile = (z: Record<string, string>): Record<string, string> => ({
    art: 'programm',
    name: 'Schul-Apps',
    gruppe: '',
    aktion: 'Allow',
    richtung: 'Inbound',
    aktiv: 'True',
    profil: 'Private',
    programm: EXE,
    ports: '',
    protokoll: '',
    ...z
  })
  const portZeile = (port = '8420', z: Record<string, string> = {}): Record<string, string> =>
    zeile({ art: 'port', name: PORTREGEL_PRAEFIX + port, gruppe: 'Schul-Apps', programm: '', ports: port, protokoll: 'TCP', ...z })

  it('liest das Status-Skript ohne Adminrechte und nur lesend', () => {
    const s = statusSkript(EXE)
    expect(s).not.toMatch(/New-NetFirewallRule|Remove-NetFirewallRule|Set-Net|RunAs|Start-Process/)
    expect(s).toContain('ConvertTo-Json')
  })

  it('erkennt „eingerichtet"', () => {
    const s = werteStatusAus(JSON.stringify([zeile({}), portZeile()]), 8420, EXE)
    expect(s).toMatchObject({ zustand: 'eingerichtet', portRegel: true, programmRegel: true, blockierregeln: 0 })
  })

  it('vergleicht den Programmpfad ohne Groß-/Kleinschreibung', () => {
    const s = werteStatusAus(JSON.stringify([zeile({ programm: EXE.toLowerCase() }), portZeile()]), 8420, EXE)
    expect(s.zustand).toBe('eingerichtet')
  })

  it('erkennt „nicht eingerichtet" – auch bei falschem Port oder falschem Profil', () => {
    expect(werteStatusAus('[]', 8420, EXE).zustand).toBe('fehlt')
    expect(werteStatusAus('', 8420, EXE).zustand).toBe('fehlt')
    expect(werteStatusAus(JSON.stringify([zeile({}), portZeile('8421')]), 8420, EXE)).toMatchObject({ zustand: 'fehlt', portRegel: false })
    expect(werteStatusAus(JSON.stringify([zeile({ profil: 'Public' }), portZeile()]), 8420, EXE)).toMatchObject({ zustand: 'fehlt', programmRegel: false })
    expect(werteStatusAus(JSON.stringify([zeile({}), portZeile('8420', { profil: 'Private, Public' })]), 8420, EXE).portRegel).toBe(false)
    expect(werteStatusAus(JSON.stringify([zeile({ aktiv: 'False' }), portZeile()]), 8420, EXE).programmRegel).toBe(false)
    // Eine Regel für eine andere exe gleichen Namens zählt nicht als Programmregel
    expect(werteStatusAus(JSON.stringify([zeile({ programm: 'D:\\alt\\Schul-Apps.exe' }), portZeile()]), 8420, EXE).programmRegel).toBe(false)
  })

  it('nimmt auch ein einzelnes Objekt (ConvertTo-Json ohne Feld)', () => {
    expect(werteStatusAus(JSON.stringify(portZeile()), 8420, EXE)).toMatchObject({ portRegel: true, programmRegel: false })
  })

  it('erkennt Blockierregeln nur für Schul-Apps im privaten Netz', () => {
    const block = zeile({ aktion: 'Block', profil: 'Private, Public', programm: 'C:\\Users\\X\\AppData\\Local\\Temp\\Schul-Apps\\schul-apps.exe' })
    const s = werteStatusAus(JSON.stringify([zeile({}), portZeile(), block]), 8420, EXE)
    expect(s).toMatchObject({ zustand: 'blockiert', blockierregeln: 1 })
    // Nur öffentlich: stört im privaten Netz nicht
    expect(werteStatusAus(JSON.stringify([zeile({}), portZeile(), zeile({ aktion: 'Block', profil: 'Public' })]), 8420, EXE).zustand).toBe('eingerichtet')
    // Anderes Programm: geht Schul-Apps nichts an
    expect(werteStatusAus(JSON.stringify([zeile({}), portZeile(), zeile({ aktion: 'Block', programm: 'C:\\x\\anderes.exe' })]), 8420, EXE).zustand).toBe(
      'eingerichtet'
    )
    expect(
      werteStatusAus(JSON.stringify([zeile({}), portZeile(), zeile({ aktion: 'Block', programm: 'C:\\x\\nicht-schul-apps.exe' })]), 8420, EXE).zustand
    ).toBe('eingerichtet')
  })

  it('meldet kaputte Ausgabe als „unbekannt"', () => {
    expect(werteStatusAus('Fehler: Zugriff verweigert', 8420, EXE).zustand).toBe('unbekannt')
  })
})

describe('Windows-Freigabe: Ablauf (ohne echte Ausführung)', () => {
  const eingerichtet = JSON.stringify([
    { art: 'programm', name: 'x', gruppe: 'Schul-Apps', aktion: 'Allow', richtung: 'Inbound', aktiv: 'True', profil: 'Private', programm: EXE },
    {
      art: 'port',
      name: PORTREGEL_PRAEFIX + '8420',
      gruppe: 'Schul-Apps',
      aktion: 'Allow',
      richtung: 'Inbound',
      aktiv: 'True',
      profil: 'Private',
      ports: '8420',
      protokoll: 'TCP'
    }
  ])

  const mitLauf = (antworten: (skript: string) => { code: number; ausgabe: string }) => {
    const skripte: string[] = []
    const lauf: PsLauf = async (s) => {
      skripte.push(s)
      return antworten(s)
    }
    return { skripte, f: windowsFreigabe({ port: () => 8420, exe: () => EXE, lauf, plattform: 'win32' }) }
  }

  it('richtet ein und liest den Status danach neu', async () => {
    let fertig = false
    const { skripte, f } = mitLauf((s) => {
      if (s.includes('RunAs')) {
        fertig = true
        return { code: 0, ausgabe: '' }
      }
      return { code: 0, ausgabe: fertig ? eingerichtet : '[]' }
    })
    expect((await f.status()).zustand).toBe('fehlt')
    const r = await f.einrichten()
    expect(r).toMatchObject({ ergebnis: 'eingerichtet', meldung: 'Freigabe dauerhaft eingerichtet.' })
    expect(r.status.zustand).toBe('eingerichtet')
    expect(skripte.filter((s) => s.includes('RunAs'))).toHaveLength(1)
  })

  it('behandelt den Abbruch der Abfrage sauber', async () => {
    const { f } = mitLauf((s) => (s.includes('RunAs') ? { code: UAC_ABGEBROCHEN, ausgabe: '' } : { code: 0, ausgabe: '[]' }))
    const r = await f.einrichten()
    expect(r).toMatchObject({ ergebnis: 'abgebrochen', meldung: 'Freigabe nicht eingerichtet – Abfrage abgebrochen.' })
    expect(r.status.zustand).toBe('fehlt')
  })

  it('meldet einen Fehler, wenn der Status danach nicht stimmt', async () => {
    const { f } = mitLauf(() => ({ code: 0, ausgabe: '[]' }))
    expect((await f.einrichten()).ergebnis).toBe('fehler')
  })

  it('tut außerhalb von Windows nichts', async () => {
    const skripte: string[] = []
    const f = windowsFreigabe({ port: () => 8420, exe: () => EXE, plattform: 'darwin', lauf: async (s) => (skripte.push(s), { code: 0, ausgabe: '' }) })
    expect((await f.status()).zustand).toBe('nichtWindows')
    await expect(f.einrichten()).rejects.toThrow(/nur in der App am Windows-PC/)
    expect(skripte).toEqual([])
  })
})
