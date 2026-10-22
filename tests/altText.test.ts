/**
 * Wache für Bild-Alternativtexte (22.10.2026, Prüfung des Schulträgers, Punkt 12 – Barrierefreiheit, WCAG 2.1 AA 1.1.1).
 *
 * Jedes <img>/<Image> der Oberfläche braucht ein alt-Attribut. Ein leeres alt="" ist nur erlaubt,
 * wenn das Bild ausdrücklich als Schmuck markiert ist (aria-hidden oder role="presentation"/"none"),
 * damit „vergessen“ und „bewusst schmückend“ unterscheidbar bleiben. Die Wache liest die Quelltexte
 * mit dem TypeScript-Scanner wie tests/anrede.test.ts und schlägt bei neuen Verstößen an.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const RENDERER = join(__dirname, '..', 'src', 'renderer', 'src')

function tsxDateien(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const pfad = join(dir, name)
    if (statSync(pfad).isDirectory()) tsxDateien(pfad, out)
    else if (name.endsWith('.tsx')) out.push(pfad)
  }
  return out
}

export interface AltVerstoss {
  zeile: number
  tag: string
  grund: 'fehlt' | 'leer-ohne-aria-hidden'
}

/** Findet <img>/<Image> ohne alt bzw. mit leerem alt ohne Schmuck-Kennzeichnung. */
export function altVerstoesse(quelle: string, dateiname = 'x.tsx'): AltVerstoss[] {
  const sf = ts.createSourceFile(dateiname, quelle, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: AltVerstoss[] = []
  const pruefe = (tagName: ts.JsxTagNameExpression, attrs: ts.JsxAttributes, n: ts.Node): void => {
    const tag = tagName.getText(sf)
    if (tag !== 'img' && tag !== 'Image') return
    const map = new Map<string, ts.JsxAttribute>()
    let spread = false
    for (const a of attrs.properties) {
      if (ts.isJsxSpreadAttribute(a)) spread = true
      else map.set(a.name.getText(sf), a)
    }
    const zeile = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
    const alt = map.get('alt')
    if (!alt) {
      // Eine Weitergabe per {...props} kann alt mitbringen – nicht beanstanden
      if (!spread) out.push({ zeile, tag, grund: 'fehlt' })
      return
    }
    const init = alt.initializer
    const leer =
      init !== undefined &&
      ((ts.isStringLiteral(init) && init.text === '') ||
        (ts.isJsxExpression(init) && !!init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression)) && init.expression.text === ''))
    if (!leer) return
    const hidden = map.get('aria-hidden')
    const role = map.get('role')
    const roleText = role?.initializer && ts.isStringLiteral(role.initializer) ? role.initializer.text : ''
    const hiddenOk = hidden !== undefined && !(hidden.initializer && hidden.initializer.getText(sf).includes('false'))
    if (!hiddenOk && roleText !== 'presentation' && roleText !== 'none') out.push({ zeile, tag, grund: 'leer-ohne-aria-hidden' })
  }
  const besuche = (n: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(n)) pruefe(n.tagName, n.attributes, n)
    else if (ts.isJsxOpeningElement(n)) pruefe(n.tagName, n.attributes, n)
    ts.forEachChild(n, besuche)
  }
  besuche(sf)
  return out
}

describe('Alternativtexte für Bilder (WCAG 1.1.1)', () => {
  it('erkennt fehlendes und leeres alt', () => {
    const q = `const a = <><img src="x" /><img src="y" alt="" /><img src="z" alt="" aria-hidden /><Image src="w" alt="Hund" /><img {...p} /><img alt={''} role="presentation" /></>`
    const v = altVerstoesse(q)
    expect(v.map((x) => x.grund)).toEqual(['fehlt', 'leer-ohne-aria-hidden'])
  })

  it('keine Bilder ohne Alternativtext in src/renderer/src', () => {
    const befunde: string[] = []
    for (const datei of tsxDateien(RENDERER)) {
      for (const v of altVerstoesse(readFileSync(datei, 'utf8'), datei)) {
        befunde.push(`${relative(RENDERER, datei).split(sep).join('/')}:${v.zeile} <${v.tag}> ${v.grund}`)
      }
    }
    expect(befunde).toEqual([])
  })
})
