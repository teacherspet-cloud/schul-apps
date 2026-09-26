/**
 * Maskottchen des Deckblatts (Paket 11): Fuchs, andere Tiere, Fachsymbole.
 *
 * Wunsch der Lehrkraft (26.09.2026): „Maskottchen wählbar: Fuchs (bisher), anderes Tier,
 * Fachsymbol, eigenes Bild, keins." Die mitgelieferten Zeichnungen sind bewusst schlicht –
 * wenige Flächen in den Deckblattfarben auf einem hellen Kreis, wie der bisherige Fuchs. Sie
 * drucken sauber, auch schwarz-weiß, und kosten kein Kontingent. Wer mag, lässt Fuchs oder
 * Tier von der KI neu zeichnen (Hintergrund-Auftrag, siehe arbeitsblatt/auftraege.ts).
 *
 * Alles als SVG-data:-URL: Dieselbe Zeichnung steht in der Vorschau, im Druck und – gerastert –
 * im Word-Export.
 */
import type { WorksheetMeta } from '../model/types'
import { DECKBLATT_TIERE, type DeckblattTier } from './deckblatt'
import { foxPlaceholder } from './coverDesigns'

const alsUrl = (svg: string): string => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`

const rahmen = (mid: string, inhalt: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="58" fill="${mid}" opacity="0.5"/>${inhalt}</svg>`

const AUGE = '#1d2b3a'

/** Mitgelieferte Zeichnung eines Tiers */
export function tierPlaceholder(tier: DeckblattTier, dark: string, mid: string): string {
  const w = '#ffffff'
  const formen: Record<DeckblattTier, string> = {
    eule: `<path d="M34 34 L42 22 L50 32 Z M86 34 L78 22 L70 32 Z" fill="${dark}"/>
      <ellipse cx="60" cy="66" rx="30" ry="36" fill="${dark}"/>
      <ellipse cx="60" cy="80" rx="18" ry="18" fill="${w}" opacity="0.9"/>
      <circle cx="48" cy="54" r="11" fill="${w}"/><circle cx="72" cy="54" r="11" fill="${w}"/>
      <circle cx="48" cy="54" r="5" fill="${AUGE}"/><circle cx="72" cy="54" r="5" fill="${AUGE}"/>
      <path d="M56 62 L64 62 L60 70 Z" fill="#e0a030"/>`,
    igel: `<path d="M22 78 L28 50 L36 64 L42 40 L50 58 L58 34 L64 56 L74 38 L78 60 L90 48 L90 78 Z" fill="${dark}"/>
      <ellipse cx="62" cy="80" rx="34" ry="18" fill="${dark}"/>
      <path d="M78 70 C92 70 102 76 104 82 C102 88 92 92 78 90 Z" fill="${w}" opacity="0.92"/>
      <circle cx="88" cy="78" r="3.5" fill="${AUGE}"/><circle cx="104" cy="82" r="3" fill="${AUGE}"/>`,
    baer: `<circle cx="36" cy="36" r="11" fill="${dark}"/><circle cx="84" cy="36" r="11" fill="${dark}"/>
      <circle cx="60" cy="64" r="34" fill="${dark}"/>
      <ellipse cx="60" cy="78" rx="16" ry="12" fill="${w}" opacity="0.92"/>
      <circle cx="47" cy="58" r="4.5" fill="${AUGE}"/><circle cx="73" cy="58" r="4.5" fill="${AUGE}"/>
      <ellipse cx="60" cy="73" rx="6" ry="4" fill="${AUGE}"/>`,
    katze: `<path d="M28 50 L32 20 L52 38 Z M92 50 L88 20 L68 38 Z" fill="${dark}"/>
      <ellipse cx="60" cy="64" rx="34" ry="30" fill="${dark}"/>
      <ellipse cx="60" cy="76" rx="14" ry="10" fill="${w}" opacity="0.92"/>
      <ellipse cx="47" cy="58" rx="5" ry="6" fill="${w}"/><ellipse cx="73" cy="58" rx="5" ry="6" fill="${w}"/>
      <ellipse cx="47" cy="59" rx="2.2" ry="4.5" fill="${AUGE}"/><ellipse cx="73" cy="59" rx="2.2" ry="4.5" fill="${AUGE}"/>
      <path d="M56 71 L64 71 L60 76 Z" fill="${AUGE}"/>
      <path d="M40 74 L22 70 M40 78 L22 80 M80 74 L98 70 M80 78 L98 80" stroke="${AUGE}" stroke-width="1.5"/>`,
    pinguin: `<ellipse cx="60" cy="64" rx="30" ry="40" fill="${dark}"/>
      <ellipse cx="60" cy="74" rx="20" ry="28" fill="${w}" opacity="0.95"/>
      <circle cx="51" cy="46" r="4" fill="${AUGE}"/><circle cx="69" cy="46" r="4" fill="${AUGE}"/>
      <path d="M53 54 L67 54 L60 62 Z" fill="#e0a030"/>`
  }
  return alsUrl(rahmen(mid, formen[tier]))
}

/**
 * Fachsymbol als schlichte Vektorzeichnung – ohne Buchstaben und Ziffern, damit es in jeder
 * Sprache gilt (wie die Programmsymbole aus Paket 9).
 */
export function fachSymbol(fachId: string | undefined, dark: string, mid: string): string {
  const w = '#ffffff'
  const buch = `<path d="M24 38 C38 32 50 34 60 42 C70 34 82 32 96 38 L96 88 C82 82 70 84 60 92 C50 84 38 82 24 88 Z" fill="${dark}"/>
    <path d="M60 42 L60 92" stroke="${w}" stroke-width="3"/>
    <path d="M32 50 L52 52 M32 60 L52 62 M32 70 L52 72 M68 52 L88 50 M68 62 L88 60 M68 72 L88 70" stroke="${w}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>`
  const sprechblasen = `<path d="M18 30 H70 A8 8 0 0 1 78 38 V62 A8 8 0 0 1 70 70 H40 L28 82 V70 H26 A8 8 0 0 1 18 62 V38 A8 8 0 0 1 26 30 Z" fill="${dark}"/>
    <path d="M50 52 H94 A8 8 0 0 1 102 60 V80 A8 8 0 0 1 94 88 H90 V98 L80 88 H58 A8 8 0 0 1 50 80 Z" fill="${w}" stroke="${dark}" stroke-width="3"/>
    <circle cx="66" cy="70" r="3.5" fill="${dark}"/><circle cx="76" cy="70" r="3.5" fill="${dark}"/><circle cx="86" cy="70" r="3.5" fill="${dark}"/>`
  const formen: Record<string, string> = {
    mathematik: `<path d="M26 30 H94 V94 H26 Z" fill="${w}" stroke="${dark}" stroke-width="4"/>
      <path d="M26 62 H94 M60 30 V94" stroke="${dark}" stroke-width="3"/>
      <path d="M36 46 H50 M43 39 V53 M70 46 H84 M36 78 H50 M72 72 L82 84 M82 72 L72 84" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>`,
    biologie: `<path d="M60 96 C24 84 22 44 60 22 C98 44 96 84 60 96 Z" fill="${dark}"/>
      <path d="M60 96 V34 M60 58 L44 46 M60 72 L78 58 M60 84 L46 74" stroke="${w}" stroke-width="3" stroke-linecap="round"/>`,
    chemie: `<path d="M50 24 H70 M52 24 V50 L30 92 H90 L68 50 V24" fill="${w}" stroke="${dark}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M40 72 H80 L88 90 H32 Z" fill="${dark}"/>
      <circle cx="54" cy="80" r="3" fill="${w}"/><circle cx="66" cy="84" r="2.5" fill="${w}"/>`,
    physik: `<ellipse cx="60" cy="60" rx="38" ry="14" fill="none" stroke="${dark}" stroke-width="4"/>
      <ellipse cx="60" cy="60" rx="38" ry="14" fill="none" stroke="${dark}" stroke-width="4" transform="rotate(60 60 60)"/>
      <ellipse cx="60" cy="60" rx="38" ry="14" fill="none" stroke="${dark}" stroke-width="4" transform="rotate(120 60 60)"/>
      <circle cx="60" cy="60" r="8" fill="${dark}"/>`,
    informatik: `<rect x="22" y="28" width="76" height="50" rx="5" fill="${dark}"/>
      <rect x="28" y="34" width="64" height="38" rx="2" fill="${w}"/>
      <path d="M42 46 L34 53 L42 60 M78 46 L86 53 L78 60 M64 42 L56 64" stroke="${dark}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M48 78 H72 L76 90 H44 Z" fill="${dark}"/>`,
    geschichte: `<path d="M24 38 L60 22 L96 38 Z" fill="${dark}"/>
      <path d="M30 42 H90 V46 H30 Z M28 88 H92 V96 H28 Z" fill="${dark}"/>
      <path d="M36 48 V86 M50 48 V86 M70 48 V86 M84 48 V86" stroke="${dark}" stroke-width="7"/>`,
    erdkunde: `<circle cx="60" cy="60" r="36" fill="${w}" stroke="${dark}" stroke-width="4"/>
      <path d="M36 44 C44 38 54 42 56 50 C58 58 48 62 46 70 C44 78 36 72 32 64 C30 56 30 50 36 44 Z M66 34 C76 36 88 46 90 56 C84 60 76 56 72 62 C70 70 78 78 72 86 C64 84 62 74 64 66 C66 58 60 50 62 42 Z" fill="${dark}"/>`,
    politik: `<path d="M22 44 L60 24 L98 44 Z" fill="${dark}"/>
      <path d="M26 88 H94 V96 H26 Z" fill="${dark}"/>
      <path d="M36 50 V84 M52 50 V84 M68 50 V84 M84 50 V84" stroke="${dark}" stroke-width="6"/>
      <circle cx="60" cy="38" r="4" fill="${w}"/>`,
    religion: `<path d="M60 94 C30 72 22 58 22 46 C22 34 32 26 42 26 C50 26 56 30 60 38 C64 30 70 26 78 26 C88 26 98 34 98 46 C98 58 90 72 60 94 Z" fill="${dark}"/>
      <path d="M44 48 C50 40 58 42 60 50" stroke="${w}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8"/>`,
    kunst: `<path d="M60 24 C84 24 100 40 100 58 C100 70 92 74 84 72 C76 70 72 74 74 82 C76 90 70 96 60 96 C38 96 20 80 20 60 C20 40 36 24 60 24 Z" fill="${dark}"/>
      <circle cx="44" cy="46" r="6" fill="${w}"/><circle cx="62" cy="38" r="6" fill="${w}"/><circle cx="80" cy="48" r="6" fill="${w}"/><circle cx="38" cy="66" r="6" fill="${w}"/>`,
    musik: `<path d="M48 84 V36 L90 26 V74" stroke="${dark}" stroke-width="6" fill="none" stroke-linejoin="round"/>
      <ellipse cx="38" cy="84" rx="12" ry="9" fill="${dark}"/><ellipse cx="80" cy="74" rx="12" ry="9" fill="${dark}"/>
      <path d="M48 46 L90 36" stroke="${dark}" stroke-width="6"/>`,
    sport: `<circle cx="60" cy="60" r="34" fill="${w}" stroke="${dark}" stroke-width="4"/>
      <path d="M60 44 L74 54 L69 70 H51 L46 54 Z" fill="${dark}"/>
      <path d="M60 44 V27 M74 54 L90 48 M69 70 L80 86 M51 70 L40 86 M46 54 L30 48" stroke="${dark}" stroke-width="3.5"/>`,
    sachunterricht: `<circle cx="60" cy="42" r="18" fill="${dark}"/>
      <path d="M60 60 V94 M60 74 L44 62 M60 82 L78 68" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>
      <path d="M36 94 H84" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>`
  }
  const sprachen = ['deutsch', 'englisch', 'franzoesisch', 'spanisch', 'italienisch', 'latein', 'daz', 'niederlaendisch', 'russisch']
  const gleich: Record<string, string> = { 'werte-und-normen': 'religion' }
  const id = gleich[fachId ?? ''] ?? fachId ?? ''
  const inhalt = formen[id] ?? (sprachen.includes(id) ? sprechblasen : buch)
  return alsUrl(rahmen(mid, inhalt))
}

/**
 * Bild des Maskottchens, wie es auf dem Deckblatt steht; null = keins.
 * Fehlt das eigene Bild, steht die Wahl „eigenes Bild" noch ohne Bild da – dann lieber keins
 * als ein leerer Kreis.
 */
export function maskottchenBild(meta: WorksheetMeta, dark: string, mid: string): string | null {
  switch (meta.coverMascot ?? 'fuchs') {
    case 'keins':
      return null
    case 'bild':
      return meta.coverOwnImage || null
    case 'fach':
      return fachSymbol(meta.subjectId, dark, mid)
    case 'tier':
      return meta.coverAnimalImage || tierPlaceholder(meta.coverAnimal ?? 'eule', dark, mid)
    default:
      return meta.coverImage || foxPlaceholder(dark, mid)
  }
}

/** Auftrag an die Bild-KI für ein anderes Tier – wie beim Fuchs Schmuck, kein Material */
export function tierPrompt(tier: DeckblattTier, subject: string, topic: string): string {
  const wer = DECKBLATT_TIERE.find((t) => t.value === tier)?.prompt ?? 'ein freundliches Tier'
  return [
    `Maskottchen für ein Unterrichtsmaterial im Fach ${subject}: ${wer}, leicht vermenschlicht.`,
    topic ? `Thema des Materials: ${topic}. Ein Gegenstand in der Hand darf dazu passen.` : '',
    'Ganzfigur oder Brustbild, freundlich und ruhig, kindgerecht, ohne Text und ohne Schrift im Bild.',
    'Klare Vektorgrafik-Anmutung mit wenigen Flächen, kräftigen Konturen und hellem, einfarbigem Hintergrund.',
    'Keine realistische Fotografie, keine Gewalt, keine Marken, keine realen Personen.'
  ]
    .filter(Boolean)
    .join(' ')
}
