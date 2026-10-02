/**
 * Silbentrennung für alle Materialien (02.10.2026).
 *
 * Wunsch der Lehrkraft: „Achte für den Text auf korrekte Silbentrennung (und auf einen Bindestrich,
 * um die Silbentrennung kenntlich zu machen). Das gilt für alle Aufgaben / Texte in allen Apps."
 *
 * Befund: CSS `hyphens: auto` wirkt in Electron unter Windows NICHT (geprüft am 02.10.2026 – die
 * Trennwörterbücher von Chrome werden dort nicht mitgeliefert; Wörter ragen ungetrennt über den
 * Rand). Die App setzt deshalb selbst WEICHE TRENNSTRICHE (U+00AD) nach den TeX-Trennmustern der
 * jeweiligen Sprache (Paket „hyphen", ISC; Deutsch nach neuer Rechtschreibung, Englisch britisch).
 * Ein weicher Trennstrich ist unsichtbar – nur wo die Zeile tatsächlich umbricht, erscheint der
 * Bindestrich. Bildschirm, Messfläche (Seitenumbruch) und Druck/PDF trennen gleich.
 *
 * Wo es wirkt:
 *  - Druck, PDF und Vorschau ALLER Programme: Das HTML wird vor dem Umrechnen getrennt
 *    (`htmlMitTrennung`, angemeldet über window.api.vermittlung in main.tsx).
 *  - Bearbeitungsansichten der Blätter (Arbeitsblatt-Familie, Vokabeltest, Tafelbild):
 *    `beobachteTrennung` trennt die Texte der Seiten laufend. Das Feld, in dem gerade geschrieben
 *    wird, bleibt ungetrennt (sonst stünden die unsichtbaren Zeichen im gespeicherten Text);
 *    beim Lesen aus Eingabefeldern entfernt `ohneTrennung` sie zur Sicherheit.
 *  - Word: eigene automatische Silbentrennung von Word (WORD_TRENNUNG in den Word-Ausgaben).
 *
 * Nicht getrennt: Adressen (www, E-Mail, Pfade), Wörter mit Ziffern, Abkürzungen in
 * Großbuchstaben, Formeln, Eingabefelder, Lücken, SVG, alles unter [data-keine-trennung].
 * Die Sprache kommt aus dem nächsten `lang`-Attribut; fehlt es, erkennt eine kleine Liste häufiger
 * Wörter je Sprache die Sprache des Absatzes (Faustregel der App; Rückfall: Deutsch).
 */

export const WEICH = '­'

export type TrennSprache = 'de' | 'en' | 'fr' | 'es' | 'it' | 'la' | 'nl' | 'pl' | 'pt' | 'ru' | 'tr' | 'sv'

type Trenner = { hyphenateSync: (text: string, opt?: { hyphenChar?: string; minWordLength?: number }) => string }

/* Muster erst laden, wenn eine Sprache gebraucht wird (Deutsch ≈ 0,7 MB) */
const LADER: Record<TrennSprache, () => Promise<Trenner>> = {
  de: () => import('hyphen/de'),
  en: () => import('hyphen/en-gb'),
  fr: () => import('hyphen/fr'),
  es: () => import('hyphen/es'),
  it: () => import('hyphen/it'),
  la: () => import('hyphen/la'),
  nl: () => import('hyphen/nl'),
  pl: () => import('hyphen/pl'),
  pt: () => import('hyphen/pt'),
  ru: () => import('hyphen/ru'),
  tr: () => import('hyphen/tr'),
  sv: () => import('hyphen/sv')
}

const geladen = new Map<TrennSprache, Trenner>()
const laden = new Map<TrennSprache, Promise<Trenner | null>>()

export function trennerLaden(sprache: TrennSprache): Promise<Trenner | null> {
  const fertig = geladen.get(sprache)
  if (fertig) return Promise.resolve(fertig)
  let p = laden.get(sprache)
  if (!p) {
    p = LADER[sprache]()
      .then((m) => {
        const t = ((m as { default?: Trenner }).default ?? m) as Trenner
        geladen.set(sprache, t)
        return t
      })
      .catch(() => null)
    laden.set(sprache, p)
  }
  return p
}

/** Sprachcode aus einem lang-Attribut („en-GB", „fr", „Englisch" …) */
export function spracheAusCode(code: string | null | undefined): TrennSprache | null {
  const c = String(code ?? '')
    .trim()
    .toLowerCase()
  if (!c) return null
  const kurz = c.split(/[-_]/)[0]
  const NAMEN: Record<string, TrennSprache> = {
    deutsch: 'de',
    englisch: 'en',
    english: 'en',
    französisch: 'fr',
    franzoesisch: 'fr',
    spanisch: 'es',
    italienisch: 'it',
    latein: 'la',
    niederländisch: 'nl',
    polnisch: 'pl',
    portugiesisch: 'pt',
    russisch: 'ru',
    türkisch: 'tr',
    schwedisch: 'sv'
  }
  if (NAMEN[c]) return NAMEN[c]
  return kurz in LADER ? (kurz as TrennSprache) : null
}

// ---------------------------------------------------------------- Sprache erkennen (Faustregel)

const HAEUFIG: Partial<Record<TrennSprache, string[]>> = {
  de: 'der die das und ist nicht ein eine einen mit sich auf für von dem den des zu im ich du wir sie es wie was auch noch nach bei aus oder aber wenn dass werden wird sind haben hat schreibe lies ergänze ordne beantworte'.split(' '),
  en: 'the and is are not a an of to in that it with for on as was were be have has this you your they their what which who how do does write read complete answer use find'.split(' '),
  fr: 'le la les et est une un des du de pas que qui dans pour sur avec il elle ils nous vous ce cette sont au aux écris lis complète'.split(' '),
  es: 'el la los las y es una un del de no que en por con para se lo su sus como más pero está son escribe lee completa'.split(' '),
  it: 'il lo la gli le e è una un di che non per con del della sono come anche ma'.split(' '),
  la: 'et est in non ad cum sed qui quae quod esse sunt ut ex de ab erat atque enim'.split(' ')
}

/** Sprache eines Textes nach häufigen Wörtern – null, wenn nichts eindeutig ist */
export function erkenneSprache(text: string): TrennSprache | null {
  const woerter = text.toLowerCase().match(/\p{L}+/gu) ?? []
  if (woerter.length < 3) return null
  let beste: TrennSprache | null = null
  let besteZahl = 0
  let zweite = 0
  for (const [sprache, liste] of Object.entries(HAEUFIG) as [TrennSprache, string[]][]) {
    const set = new Set(liste)
    const n = woerter.filter((w) => set.has(w)).length
    if (n > besteZahl) {
      zweite = besteZahl
      besteZahl = n
      beste = sprache
    } else if (n > zweite) zweite = n
  }
  return besteZahl >= 2 && besteZahl > zweite ? beste : null
}

// ---------------------------------------------------------------- Text trennen

/** Ein „Wort" im Sinn der Trennung: alles zwischen Leerzeichen */
const ADRESSE = /(www\.|https?:|@|\/|\\|\.[a-z]{2,4}$|\d)/i

/** Einen Text trennen (synchron – die Sprache muss geladen sein, sonst bleibt er unverändert) */
export function trenneText(text: string, sprache: TrennSprache): string {
  const t = geladen.get(sprache)
  if (!t || !text) return text
  return text.replace(/\S{6,}/g, (wort) => {
    if (wort.includes(WEICH) || ADRESSE.test(wort)) return wort
    // Abkürzungen und Wörter ganz in Großbuchstaben (KMK, UNESCO) nicht trennen
    if (/^\P{Ll}+$/u.test(wort.replace(/[^\p{L}]/gu, ''))) return wort
    return t.hyphenateSync(wort, { hyphenChar: WEICH, minWordLength: 6 })
  })
}

/** Weiche Trennstriche entfernen (Text aus Eingabefeldern, Zwischenablage, Vergleiche) */
export const ohneTrennung = (text: string): string => (text.includes(WEICH) ? text.split(WEICH).join('') : text)

// ---------------------------------------------------------------- DOM

/** Nicht anfassen: Eingaben, Formeln, Grafiken, Lücken, ausdrücklich ausgenommene Bereiche */
const AUSGENOMMEN =
  'input, textarea, select, script, style, code, pre, svg, math, mjx-container, .katex, .MathJax, [data-keine-trennung], [contenteditable]:not([contenteditable="false"]):focus, [contenteditable]:not([contenteditable="false"]):focus-within'

const BLOCK = 'p, li, td, th, h1, h2, h3, h4, h5, h6, dd, dt, figcaption, blockquote, section, article, div'

/** Sprache für einen Textknoten: lang-Attribut, sonst Erkennung am Absatz (bzw. darüber), sonst Rückfall */
function spracheFuer(knoten: Node, rueckfall: TrennSprache, cache: WeakMap<Element, TrennSprache>): TrennSprache {
  const el = knoten.parentElement
  if (!el) return rueckfall
  const mitLang = el.closest('[lang]')
  // Ein lang direkt am Text oder an seinem Absatz gilt immer
  let absatz: Element | null = el.closest(BLOCK)
  const langAbsatz = mitLang && (!absatz || absatz === mitLang || absatz.contains(mitLang) || mitLang.contains(absatz) === false) ? mitLang : null
  if (langAbsatz && langAbsatz !== document.documentElement && langAbsatz.tagName !== 'HTML') {
    const s = spracheAusCode(langAbsatz.getAttribute('lang'))
    if (s) return s
  }
  // Erkennung: vom Absatz aufwärts, bis genug Text da ist
  for (let tiefe = 0; absatz && tiefe < 4; tiefe++) {
    const vorher = cache.get(absatz)
    if (vorher) return vorher
    const s = erkenneSprache((absatz.textContent ?? '').slice(0, 1500))
    if (s) {
      cache.set(absatz, s)
      return s
    }
    absatz = absatz.parentElement?.closest(BLOCK) ?? null
  }
  const doc = spracheAusCode(mitLang?.getAttribute('lang'))
  return doc ?? rueckfall
}

/** Alle Textknoten unter `wurzel` trennen; lädt fehlende Sprachen nach. Liefert die Zahl geänderter Knoten. */
export async function trenneDom(wurzel: Element, rueckfall: TrennSprache = 'de'): Promise<number> {
  const doc = wurzel.ownerDocument
  const cache = new WeakMap<Element, TrennSprache>()
  const knoten: { n: Text; s: TrennSprache }[] = []
  const walker = doc.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const v = n.nodeValue ?? ''
      if (v.length < 6 || !/\p{L}{6}/u.test(v)) return NodeFilter.FILTER_REJECT
      const el = n.parentElement
      if (!el || el.closest(AUSGENOMMEN)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  for (let n = walker.nextNode(); n; n = walker.nextNode()) knoten.push({ n: n as Text, s: spracheFuer(n, rueckfall, cache) })
  if (!knoten.length) return 0
  await Promise.all([...new Set(knoten.map((k) => k.s))].map((s) => trennerLaden(s)))
  let geaendert = 0
  for (const { n, s } of knoten) {
    const alt = n.nodeValue ?? ''
    const neu = trenneText(alt, s)
    if (neu !== alt) {
      n.nodeValue = neu
      geaendert++
    }
  }
  return geaendert
}

/** HTML eines Drucks/PDF trennen – für exporter.pdf/print/preview (main.tsx) */
export async function htmlMitTrennung(html: string): Promise<string> {
  if (typeof DOMParser === 'undefined' || !html) return html
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const rueckfall = spracheAusCode(doc.documentElement.getAttribute('lang')) ?? 'de'
    const n = await trenneDom(doc.body, rueckfall)
    if (!n) return html
    const doctype = /^\s*<!doctype[^>]*>/i.exec(html)?.[0] ?? '<!DOCTYPE html>'
    return `${doctype}\n${doc.documentElement.outerHTML}`
  } catch {
    return html
  }
}

/** Die weichen Trennstriche eines Bereichs wieder entfernen (Feld bekommt den Fokus) */
export function entferneTrennung(wurzel: Element): void {
  const walker = wurzel.ownerDocument.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const v = n.nodeValue ?? ''
    if (v.includes(WEICH)) n.nodeValue = ohneTrennung(v)
  }
}

/**
 * Die Seiten der Programme, deren Texte am Bildschirm getrennt werden. NICHT die Schülerarbeit in
 * der Rückmeldung (.blatt/.rm-seite): Dort werden Stellen markiert und zitiert – der Text bleibt,
 * wie die Schülerin oder der Schüler ihn geschrieben hat (im Druck wird trotzdem getrennt).
 */
export const TRENN_BEREICHE = '.ws-page, .vt-page, .tb-seite, [data-silbentrennung]'

/** Ist eine Änderung nur das Setzen oder Entfernen weicher Trennstriche (also unsere eigene)? */
export const nurTrennung = (alt: string | null, neu: string | null): boolean => alt !== neu && ohneTrennung(alt ?? '') === ohneTrennung(neu ?? '')

/**
 * Laufend trennen, was auf den Seiten erscheint (einmal beim Start, main.tsx). Gesammelt je
 * Bildaufbau; ein Feld, das den Fokus bekommt, verliert seine weichen Trennstriche, damit beim
 * Schreiben nichts Unsichtbares in den Text gerät – beim Verlassen wird es wieder getrennt.
 */
export function beobachteTrennung(): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => undefined
  const offen = new Set<Element>()
  let geplant = false
  const planen = (el: Element): void => {
    const bereich = el.closest(TRENN_BEREICHE)
    if (!bereich) return
    offen.add(el.closest(BLOCK) ?? bereich)
    if (geplant) return
    geplant = true
    requestAnimationFrame(() => {
      geplant = false
      const liste = [...offen].filter((e) => e.isConnected && ![...offen].some((o) => o !== e && o.contains(e)))
      offen.clear()
      for (const e of liste) void trenneDom(e)
    })
  }
  const beobachter = new MutationObserver((liste) => {
    for (const m of liste) {
      // Unsere eigenen Änderungen (nur weiche Trennstriche) lösen nichts aus
      if (m.type === 'characterData' && nurTrennung(m.oldValue, m.target.nodeValue)) continue
      const ziel = m.target.nodeType === Node.TEXT_NODE ? m.target.parentElement : (m.target as Element)
      if (ziel) planen(ziel)
      // Eine ganze Seite (oder ein Behälter mit Seiten) kam hinzu: deren Bereiche selbst planen
      for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue
        if (n.matches(TRENN_BEREICHE)) planen(n)
        else for (const b of n.querySelectorAll(TRENN_BEREICHE)) planen(b)
      }
    }
  })
  beobachter.observe(document.body, { subtree: true, childList: true, characterData: true, characterDataOldValue: true })
  for (const b of document.querySelectorAll(TRENN_BEREICHE)) planen(b)
  const fokusRein = (e: FocusEvent): void => {
    const el = e.target as Element | null
    if (el?.closest?.(TRENN_BEREICHE) && (el as HTMLElement).isContentEditable) entferneTrennung(el)
  }
  const fokusRaus = (e: FocusEvent): void => {
    const el = e.target as Element | null
    if (el?.closest?.(TRENN_BEREICHE)) planen(el)
  }
  document.addEventListener('focusin', fokusRein, true)
  document.addEventListener('focusout', fokusRaus, true)
  return () => {
    beobachter.disconnect()
    document.removeEventListener('focusin', fokusRein, true)
    document.removeEventListener('focusout', fokusRaus, true)
  }
}

/** Word: die eigene Silbentrennung von Word einschalten (new Document({ hyphenation: WORD_TRENNUNG })) */
export const WORD_TRENNUNG = { autoHyphenation: true, doNotHyphenateCaps: true, consecutiveHyphenLimit: 3 } as const
