// Claude erzeugt keine Rasterbilder. Stattdessen zeichnet es eine Vektorgrafik (SVG), die die Oberfläche als PNG rastert.
import { AiProvider } from './provider'

const SVG_SYSTEM = `Du bist Illustrator für Unterrichtsmaterial und zeichnest Bilder als SVG-Code.
Regeln:
- Genau ein <svg>-Element mit xmlns="http://www.w3.org/2000/svg" und viewBox="0 0 512 512", ohne width/height.
- Ein einziges, eindeutig erkennbares Motiv, mittig, mit etwas Rand; typische, sofort erkennbare Merkmale betonen.
- Nur Grundformen und Pfade (path, circle, ellipse, rect, line, polyline, polygon, g). Keine Bilder, keine Schriften, kein Text, keine Skripte, keine externen Verweise, keine Filter.
- Halte dich an den gewünschten Stil (z. B. schwarz-weiße Strichzeichnung mit kräftigen Konturen auf weißem Hintergrund).
- Sorgfältig und sauber gezeichnet, keine überlappenden Fehlformen.`

/** Entfernt alles, was in einem eingebetteten Bild nichts zu suchen hat (Skripte, Ereignisse, externe Verweise). */
export function sanitizeSvg(raw: string): string {
  const start = raw.indexOf('<svg')
  const end = raw.lastIndexOf('</svg>')
  if (start < 0 || end < start) throw new Error('Die KI hat keine gültige Zeichnung geliefert. Bitte erneut versuchen.')
  let svg = raw.slice(start, end + 6)
  svg = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(image|iframe|object|embed|style)\b[^>]*\/>/gi, '')
    .replace(/<(image|iframe|object|embed|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi, (m, v: string) => (/^["']#/.test(v) ? m : ''))
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none')
  if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  return svg
}

export async function generateSvgImage(provider: AiProvider, model: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const res = await provider.structured<{ svg: string }>(
    {
      system: SVG_SYSTEM,
      user: `Zeichne: ${prompt}`,
      schemaName: 'zeichnung',
      schema: { type: 'object', properties: { svg: { type: 'string' } }, required: ['svg'], additionalProperties: false }
    },
    model,
    undefined,
    signal
  )
  const svg = sanitizeSvg(res.svg ?? '')
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}
