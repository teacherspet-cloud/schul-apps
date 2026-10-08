import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { schreibFehler, SENSIBEL } from '../src/server/feldschutz'

/*
 * Alles Personenbezogene nur verschlüsselt (08.10.2026, Auftrag der Lehrkraft). Zwei Wächter über den Quelltext:
 *  1. Jede Spalte, deren Name nach Personenbezug oder Freitext klingt, steht in SENSIBEL – oder hier in der Ausnahmeliste
 *     mit Begründung. Eine neue Tabelle/Spalte ohne Entscheidung lässt diesen Test scheitern.
 *  2. Jede feste Schreib-Anweisung in src/server besteht die Prüfung des Feldschutzes („fail closed", schreibFehler) –
 *     sonst würfe sie erst im Betrieb.
 */

const SERVER = join(__dirname, '..', 'src', 'server')
const dateien = (): string[] => {
  const aus: string[] = []
  const gehe = (o: string): void => {
    for (const e of readdirSync(o, { withFileTypes: true })) {
      const p = join(o, e.name)
      if (e.isDirectory()) gehe(p)
      else if (p.endsWith('.ts')) aus.push(p)
    }
  }
  gehe(SERVER)
  return aus
}

/** Spaltennamen, die nach Person oder Freitext klingen */
const VERDAECHTIG =
  /^(name|vorname|nachname|text|daten|antworten|titel|html|vorlage|thema|einstellungen|mitglieder|schueler|bewertung|fassungen|tinte|png|bild|bilder|info|paket|woerter|verben|teile|ueberschrift|loesung|merk|aufgaben|auswertung|hilfen|aufgaben_feedback|vorfaelle|grund|verlassen|anzeige|iserv_gruppe|iserv_sub|gruppen|code_v|benutzer|benutzer_v|wieder|anmelde|quelle|problem_aus|art|freigeschaltet|veroeffentlicht|klasse|faecher|datei|notiz|kommentar|wert|kennung|buch|unit)$/

/** Bewusst nicht verschlüsselt – mit Grund */
const AUSNAHMEN: Record<string, string> = {
  'nutzer.benutzer': 'Suchschlüssel: HMAC (kennung), der Name selbst steht verschlüsselt in benutzer_v',
  'nutzer.quelle': 'Kontoart (iserv, gast, test …), keine Angabe zur Person',
  'sitzungen.kennung': 'zufällige Sitzungskennung; das Cookie selbst nur als SHA-256',
  'server_einstellungen.wert': 'Servereinstellungen; Geheimnisse darin verschlüsselt (geheim:…, datenbank.ts)',
  'protokoll.art': 'Art des Eintrags (anmeldung, reihe …)',
  'feedback_freigaben.art': "Art der Freigabe ('', 'reihe', 'blatt') – Material, keine Person",
  'fach_freigaben.art': 'Materialart (Arbeitsblatt, Test …)',
  'fach_kopien.art': 'Materialart',
  'fach_iserv.faecher': 'Fächerliste aus IServ (Deutsch, Mathe …), keine Person',
  'vok_gaeste.wieder': 'nur Prüfwert (HMAC, codePruefwert), Suchschlüssel',
  'vok_gaeste.anmelde': 'nur Prüfwert (HMAC, codePruefwert), Suchschlüssel',
  'gram_gaeste.wieder': 'nur Prüfwert (HMAC, codePruefwert)',
  'hoertext_freigaben.kennung': 'zufällige Freigabekennung (Link)',
  'hoertext_freigaben.datei': 'technischer Dateiname der Aufnahme ([A-Za-z0-9_-].mp3), Suchschlüssel',
  'onlinetest_figuren.png': 'Maskottchen-Bild des Tests (KI-Figur), keine Person',
  'reihen_dateien.typ': 'MIME-Typ',
  'lehrwerk_stand.buch': 'Lehrwerk (z. B. Green Line 1)',
  'lehrwerk_stand.unit': 'Stelle im Lehrwerk',
  'vorschau_konten.klasse': 'Klassenstufe des erfundenen Musterschülers',
  'vorschau_konten.anzeige': 'Anzeigename des erfundenen Musterschülers (keine echte Person)',
  'wartung.name': 'Name einer Wartungsaufgabe'
}

interface Spalte {
  tabelle: string
  spalte: string
  datei: string
}

function spaltenImQuelltext(): Spalte[] {
  const aus: Spalte[] = []
  for (const datei of dateien()) {
    const s = readFileSync(datei, 'utf8')
    for (const m of s.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g)) {
      let tiefe = 1
      let i = m.index! + m[0].length
      const ab = i
      for (; i < s.length && tiefe > 0; i++) {
        if (s[i] === '(') tiefe++
        else if (s[i] === ')') tiefe--
      }
      const koerper = s.slice(ab, i - 1)
      let t = 0
      let teil = ''
      const teile: string[] = []
      for (const ch of koerper) {
        if (ch === '(') t++
        if (ch === ')') t--
        if (ch === ',' && t === 0) {
          teile.push(teil)
          teil = ''
        } else teil += ch
      }
      teile.push(teil)
      for (const p of teile) {
        const w = /^\s*(\w+)/.exec(p)?.[1]
        if (!w || /^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)$/i.test(w)) continue
        aus.push({ tabelle: m[1], spalte: w, datei })
      }
    }
    for (const m of s.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)) aus.push({ tabelle: m[1], spalte: m[2], datei })
  }
  return aus
}

describe('Datenschutz: Spalten mit Personenbezug', () => {
  it('jede verdächtige Spalte ist verschlüsselt oder begründet ausgenommen', () => {
    const spalten = spaltenImQuelltext()
    expect(spalten.length).toBeGreaterThan(80)
    const offen = spalten
      .filter((x) => VERDAECHTIG.test(x.spalte))
      .filter((x) => !SENSIBEL[x.tabelle]?.includes(x.spalte) && !AUSNAHMEN[`${x.tabelle}.${x.spalte}`])
      .map((x) => `${x.tabelle}.${x.spalte} (${x.datei.slice(SERVER.length + 1)})`)
    expect([...new Set(offen)]).toEqual([])
  })

  it('SENSIBEL nennt nur Spalten, die es gibt', () => {
    const da = new Set(spaltenImQuelltext().map((x) => `${x.tabelle}.${x.spalte}`))
    // reihen.veroeffentlicht kommt über eine Schleife hinzu (ADD COLUMN ${spalte})
    da.add('reihen.veroeffentlicht')
    const fehlt = Object.entries(SENSIBEL)
      .flatMap(([t, s]) => s.map((x) => `${t}.${x}`))
      .filter((x) => !da.has(x))
    expect(fehlt).toEqual([])
  })
})

describe('Datenschutz: Schreib-Anweisungen (fail closed)', () => {
  it('jede feste INSERT/UPDATE-Anweisung in src/server verschlüsselt ihre sensiblen Spalten', () => {
    const fehler: string[] = []
    let geprueft = 0
    for (const datei of dateien()) {
      const s = readFileSync(datei, 'utf8')
      for (const m of s.matchAll(/(['"`])((?:INSERT|UPDATE|REPLACE)\b[\s\S]*?)\1/g)) {
        const sql = m[2]
        if (m[1] === '`' && sql.includes('${')) continue
        geprueft++
        const f = schreibFehler(sql.replace(/\\"/g, '"'))
        if (f) fehler.push(`${datei.slice(SERVER.length + 1)}: ${f}`)
      }
    }
    expect(geprueft).toBeGreaterThan(100)
    expect(fehler).toEqual([])
  })

  it('beanstandet Klartext-Muster', () => {
    expect(schreibFehler('INSERT INTO teilnahmen SELECT * FROM x')).toMatch(/ohne Spaltenliste/)
    expect(schreibFehler("UPDATE teilnahmen SET antworten = antworten || 'x' WHERE id = ?")).toMatch(/antworten/)
    expect(schreibFehler('UPDATE reihen SET daten = lower(?) WHERE id = ?')).toMatch(/daten/)
    expect(schreibFehler("INSERT INTO protokoll (zeit, text) VALUES (?, 'fest')")).toBeNull()
    expect(schreibFehler('UPDATE reihen SET veroeffentlicht = COALESCE(veroeffentlicht, daten) WHERE id = ?')).toBeNull()
    expect(schreibFehler('INSERT INTO nutzer_darstellung (nutzer_id, daten) VALUES (?, ?) ON CONFLICT(nutzer_id) DO UPDATE SET daten = excluded.daten')).toBeNull()
    expect(schreibFehler('INSERT INTO nutzer_darstellung (nutzer_id, daten) VALUES (?, ?) ON CONFLICT(nutzer_id) DO UPDATE SET daten = daten || ?')).toMatch(/daten/)
    expect(schreibFehler('UPDATE sitzungen SET zuletzt = ? WHERE hash = ?')).toBeNull()
  })
})
