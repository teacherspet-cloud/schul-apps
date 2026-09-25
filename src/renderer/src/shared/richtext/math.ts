// Formelsatz mit MathJax (TeX → SVG). Läuft ohne DOM und ohne Schriftdateien, daher auch im Druck und in Tests.
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js'
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js'
import 'mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { SVG } from 'mathjax-full/js/output/svg.js'

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)

const doc = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams', 'mhchem'] }),
  OutputJax: new SVG({ fontCache: 'none' })
})

const cache = new Map<string, MathSvg>()

export interface MathSvg {
  /** vollständiges <svg>-Element */
  svg: string
  /** Größe in ex (bezogen auf die Schriftgröße) */
  widthEx: number
  heightEx: number
  /** vertikale Verschiebung zur Grundlinie in ex */
  valignEx: number
}

/** Wandelt TeX in SVG um; Fehler erscheinen rot in der Formel statt einer Ausnahme. */
export function texToSvg(tex: string, display = false): MathSvg {
  const key = `${display ? 'D' : 'I'}:${tex}`
  const hit = cache.get(key)
  if (hit) return hit
  let svg: string
  try {
    // Steuerzeichen (z. B. aus KI-Antworten) bringen MathJax zum Absturz
    const clean = tex.replace(/[\x00-\x08\x0b-\x1f]/g, '')
    svg = adaptor.innerHTML(doc.convert(clean, { display }))
  } catch {
    svg = errorSvg(tex)
  }
  const num = (attr: string): number => Number((new RegExp(`${attr}="(-?[\\d.]+)ex"`).exec(svg) ?? [])[1] ?? 0)
  const valign = /vertical-align:\s*(-?[\d.]+)ex/.exec(svg)
  const result: MathSvg = { svg, widthEx: num('width'), heightEx: num('height'), valignEx: valign ? Number(valign[1]) : 0 }
  cache.set(key, result)
  return result
}

function errorSvg(tex: string): string {
  const text = tex.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const width = Math.max(2, tex.length * 0.55)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}ex" height="2.2ex" style="vertical-align: -0.5ex;" viewBox="0 0 ${width * 10} 22"><text x="0" y="16" font-size="16" fill="#c62828">${text}</text></svg>`
}
