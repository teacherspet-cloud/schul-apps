/**
 * Wache für die Anrede in der Oberfläche (Paket 8, Entscheidung der Lehrkraft 25.09.2026).
 *
 * Die Oberfläche sprach die Lehrkraft gemischt an: „Wo unterrichtest du?“ in der Einrichtung,
 * „Sie kennen Ihre Schule besser …“ im LZK-Editor. Entschieden ist: weder du noch Sie, sondern
 * unpersönlich („Bundesland wählen“, „Zuerst ein Thema eingeben“, „Wo wird unterrichtet?“).
 *
 * Die Wache liest die Quelltexte der Oberfläche mit dem TypeScript-Scanner und prüft NUR, was
 * dort als Text steht: Zeichenketten, Vorlagen-Zeichenketten und JSX-Text. Kommentare und
 * Bezeichner bleiben außen vor. Nicht geprüft werden generation/, didactics/, render/ und
 * export/: Dort stehen KI-Aufträge und Material für die Lernenden, deren Anrede fachlich
 * festgelegt ist („Kreuze an …“, „Erläutern Sie …“).
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const RENDERER = join(__dirname, '..', 'src', 'renderer', 'src')

/** Oberflächen-Dateien: Shell, gemeinsame Komponenten, Schritte der Module, Modul-Hüllen. */
function oberflaechenDateien(): string[] {
  const out: string[] = []
  const lauf = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const pfad = join(dir, name)
      if (statSync(pfad).isDirectory()) lauf(pfad)
      else if (/\.tsx?$/.test(name)) out.push(pfad)
    }
  }
  lauf(join(RENDERER, 'shell'))
  lauf(join(RENDERER, 'shared', 'components'))
  const module = join(RENDERER, 'modules')
  for (const m of readdirSync(module)) {
    const dir = join(module, m)
    if (!statSync(dir).isDirectory()) continue
    if (readdirSync(dir).includes('steps')) lauf(join(dir, 'steps'))
    for (const name of readdirSync(dir)) if (/Module\.tsx$/.test(name)) out.push(join(dir, name))
  }
  out.push(join(RENDERER, 'App.tsx'))
  return out
}

/** Alle Texte einer Datei: Zeichenketten, Teile von Vorlagen-Zeichenketten, JSX-Text. */
function texteAus(quelle: string, dateiname = 'x.tsx'): { zeile: number; text: string }[] {
  const sf = ts.createSourceFile(dateiname, quelle, ts.ScriptTarget.Latest, true, dateiname.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: { zeile: number; text: string }[] = []
  const add = (n: ts.Node, text: string): void => {
    if (text.trim()) out.push({ zeile: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text })
  }
  const besuche = (n: ts.Node): void => {
    // Modulpfade sind keine Texte für die Lehrkraft
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) add(n, n.text)
    else if (ts.isTemplateExpression(n)) {
      // Platzhalter durch ein neutrales Wort ersetzen, damit Satzanfänge erkennbar bleiben
      add(n, n.head.text + n.templateSpans.map((s) => 'X' + s.literal.text).join(''))
    } else if (ts.isJsxText(n)) add(n, n.text.replace(/\s+/g, ' ').trim())
    ts.forEachChild(n, besuche)
  }
  besuche(sf)
  return out
}

/*
 * Die Muster. Bewusst eng gefasst: Eine Wache, die bei „Sie stehen anschließend …“ (Plural)
 * anschlägt, wird abgeschaltet statt beachtet.
 */
const DU = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|Du|Dein|Deine|Deinen|Deinem|Deiner|Deines)\b/
/** „Sie“/„Ihr…“ als Anrede: mitten im Satz groß geschrieben. Am Satzanfang ist „Sie“ meist Plural. */
const SIE = /(?:[a-zäöüß,]\s+)(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/
const IHNEN = /\bIhnen\b/
/** Verbformen der 2. Person Singular, die ohne „du“ davor auffielen („Weiter kannst …“). */
const VERB_DU =
  /\b(kannst|musst|willst|möchtest|solltest|brauchst|siehst|findest|bekommst|wirst|darfst|weißt|änderst|wählst|entscheidest|klickst|unterrichtest|hast|bist)\b/
/** Imperative der 2. Person Singular am Satzanfang („Wähle …“, „Trage … ein“). */
const IMPERATIV =
  /(?:^|[.!?:;–]\s+|[„"(]\s*)(Wähle|Gib|Trage|Klicke|Ziehe|Lege|Öffne|Prüfe|Nutze|Füge|Speichere|Starte|Stelle|Ändere|Entferne|Markiere|Schau|Achte|Beachte|Erstelle|Hinterlege|Kopiere|Schalte|Aktiviere|Setze|Tippe|Warte|Versuche|Probiere|Lies|Nimm|Sieh|Gehe|Mach|Wechsle|Richte|Installiere|Verbinde|Bestätige|Drücke|Behalte|Sichere|Ergänze|Passe|Verwende|Benutze|Bearbeite|Lösche|Hole|Kontrolliere|Formuliere|Verschiebe|Fülle|Lass|Überprüfe|Entscheide|Schließe|Fasse|Mische|Erzähle|Melde|Weise|Plane|Erledige|Lade)\b/
/** Dieselben Imperative mitten im Satz („… und trage den Link ein“, „… – prüfe, ob …“). */
const IMPERATIV_KLEIN =
  /(?:\bund|\boder|\bdann|[–;])\s+(wähle|gib|trage|klicke|ziehe|lege|öffne|prüfe|füge|speichere|starte|ändere|entferne|markiere|erstelle|hinterlege|kopiere|schalte|aktiviere|setze|tippe|warte|versuche|lies|nimm|sieh|wechsle|bestätige|drücke|sichere|ergänze|passe|verwende|lösche|hole|verschiebe|fülle|lass|schließe)\b/

function anredeBefund(text: string): string | null {
  for (const [name, muster] of [
    ['du', DU],
    ['Sie', SIE],
    ['Ihnen', IHNEN],
    ['Verbform 2. Person', VERB_DU],
    ['Imperativ', IMPERATIV],
    ['Imperativ', IMPERATIV_KLEIN]
  ] as const) {
    const m = muster.exec(text)
    if (m) return `${name}: „${m[0].trim()}“`
  }
  return null
}

/**
 * Begründete Ausnahmen: Datei (relativ zu src/renderer/src, mit /) und ein Stück des Textes.
 * Nur, was bewusst NICHT die Lehrkraft anspricht.
 */
const AUSNAHMEN: { datei: string; text: string; grund: string }[] = []

describe('Anrede in der Oberfläche', () => {
  it('erkennt du, Sie und Imperative – und lässt unpersönliche Texte in Ruhe', () => {
    expect(anredeBefund('Wo unterrichtest du?')).not.toBeNull()
    expect(anredeBefund('Nichts davon hindert am Ausdrucken, und Sie kennen Ihre Schule.')).not.toBeNull()
    expect(anredeBefund('Wähle oben eine andere Stimme.')).not.toBeNull()
    expect(anredeBefund('Lege die MP3 in einen Cloud-Ordner und trage den Link ein.')).not.toBeNull()
    expect(anredeBefund('Danach kannst loslegen.')).not.toBeNull()
    expect(anredeBefund('Das Thema steht zwischen 5 und 7 – prüfe, ob es passt.')).not.toBeNull()
    expect(anredeBefund('Lade …')).not.toBeNull()
    expect(anredeBefund('Sie stehen anschließend im Vokabeltest zur Auswahl.')).toBeNull()
    expect(anredeBefund('Bundesland wählen')).toBeNull()
    expect(anredeBefund('Bitte zuerst ein Thema eingeben.')).toBeNull()
    expect(anredeBefund('Das lässt sich nicht rückgängig machen')).toBeNull()
  })

  it('liest Zeichenketten und JSX-Text, aber keine Kommentare', () => {
    const t = texteAus("// Wähle hier\nconst a = 'Wähle aus'\nconst b = <p>Trage ein {x} und gib</p>\n").map((x) => x.text)
    expect(t).toContain('Wähle aus')
    expect(t.some((x) => x.includes('Wähle hier'))).toBe(false)
    expect(t.some((x) => x.includes('Trage ein'))).toBe(true)
  })

  it('die Oberfläche spricht die Lehrkraft weder mit du noch mit Sie an', () => {
    const funde: string[] = []
    for (const datei of oberflaechenDateien()) {
      const rel = relative(RENDERER, datei).split(sep).join('/')
      for (const { zeile, text } of texteAus(readFileSync(datei, 'utf8'), datei)) {
        const befund = anredeBefund(text)
        if (!befund) continue
        if (AUSNAHMEN.some((a) => a.datei === rel && text.includes(a.text))) continue
        funde.push(`${rel}:${zeile} ${befund} – ${text.trim().slice(0, 90)}`)
      }
    }
    expect(funde).toEqual([])
  })
})
