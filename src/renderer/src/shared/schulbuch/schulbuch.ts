/**
 * Schulbuchseiten als Grundlage (05.10.2026, Wunsch der Lehrkraft): „Wenn man Material hochlädt als
 * Grundlage, das wie Schulbuchseiten aussieht (Bild, PDF etc.), sollen die Schulbuchseiten nicht als
 * Bildmaterial auf die Arbeitsblätter übertragen werden. Es soll Texterkennung genutzt werden … dem
 * Nutzer in einem Pop-up angeboten werden, die Seiten in Aufgaben einzubinden (z. B. ‚Lies den Text VT1
 * auf S. 39 in deinem Geschichtsbuch. Erkläre …') oder Teile der Schulbuchseiten mit in die Aufgabe
 * einzubinden (VT1, VT2, M1 …)."
 *
 * Abgestimmt: automatisch erkennen (Bild-KI liest die Seiten) + Pop-up; je Abschnitt wählbar:
 * verweisen (Lernende haben das Buch) oder Text übernehmen (mit Quellenangabe und Hinweis auf den
 * Gesamtvertrag) oder weglassen. Die Seiten kommen NIE als Bild aufs Blatt.
 *
 * Gilt für Arbeitsblatt, Klassenarbeit/Lernzielkontrolle, Unterrichtsreihe (Planung) und Zwischenaufgabe.
 */
import type { StructuredRequest } from '@shared/types'

type Ki = <T>(req: StructuredRequest) => Promise<T>

export type AbschnittWahl = 'verweis' | 'text' | 'weg'

export interface SchulbuchAbschnitt {
  /** Kennung wie im Buch: VT1, M2, Q3, D1 … (oder knapp beschrieben, wenn keine da ist) */
  kennung: string
  /** Verfassertext, Quelle, Material, Bild, Karte, Grafik, Aufgabe, Info … */
  art: string
  titel: string
  seite: string
  /** Erkannter Wortlaut (bei Bildern: kurze Beschreibung) */
  text: string
  wahl: AbschnittWahl
}

export interface Schulbuch {
  /** Titel des Buchs (z. B. „Geschichte und Geschehen 2"), wenn erkennbar */
  titel: string
  verlag: string
  /** Seiten, z. B. „38–39" */
  seiten: string
  abschnitte: SchulbuchAbschnitt[]
}

/** Rechtlicher Hinweis zur Textübernahme (Gesamtvertrag Vervielfältigung an Schulen, § 60a UrhG) */
export const GESAMTVERTRAG_HINWEIS =
  'Übernommene Texte stehen mit Quellenangabe auf dem Blatt. Nach dem Gesamtvertrag zur Vervielfältigung an Schulen dürfen bis zu 15 % eines Werks, höchstens 20 Seiten je Schuljahr und Klasse, für den eigenen Unterricht kopiert und digital genutzt werden – nicht veröffentlichen.'

const SCHEMA = {
  type: 'object',
  properties: {
    istSchulbuch: { type: 'boolean' },
    titel: { type: 'string' },
    verlag: { type: 'string' },
    seiten: { type: 'string' },
    abschnitte: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kennung: { type: 'string' },
          art: { type: 'string' },
          titel: { type: 'string' },
          seite: { type: 'string' },
          text: { type: 'string' }
        },
        required: ['kennung', 'art', 'titel', 'seite', 'text'],
        additionalProperties: false
      }
    }
  },
  required: ['istSchulbuch', 'titel', 'verlag', 'seiten', 'abschnitte'],
  additionalProperties: false
}

/** Sehen die Seiten wie ein Schulbuch aus? Dann Abschnitte mit Wortlaut – sonst null */
export async function erkenneSchulbuch(bilder: string[], ki: Ki): Promise<Schulbuch | null> {
  const seiten = bilder.filter((b) => b.startsWith('data:image/')).slice(0, 6)
  if (!seiten.length) return null
  const d = await ki<{ istSchulbuch: boolean; titel: string; verlag: string; seiten: string; abschnitte: Omit<SchulbuchAbschnitt, 'wahl'>[] }>({
    system:
      'Du prüfst Seitenbilder, die eine Lehrkraft hochgeladen hat, und erkennst Schulbuchseiten (gedrucktes Lehrwerk mit Seitenzahlen, Verfassertexten, nummerierten Materialien/Quellen wie VT1, M2, Q3, D1, Aufgabenblöcken). Arbeitsblätter, Handschrift, Fotos von Tafeln oder einzelne Bilder sind KEINE Schulbuchseiten.',
    user: [
      'Wenn es Schulbuchseiten sind: "istSchulbuch": true und gliedere die Seiten in ihre Abschnitte, in der Reihenfolge der Seiten.',
      '- "kennung": genau wie im Buch (VT1, M2, Q3, D1, B4 …); fehlt eine, eine knappe Bezeichnung (z. B. „Einleitung", „Aufgaben S. 39").',
      '- "art": Verfassertext, Quelle, Material, Bild, Karte, Grafik, Tabelle, Info, Aufgaben oder Sonstiges.',
      '- "seite": Seitenzahl wie gedruckt.',
      '- "text": bei Texten der vollständige Wortlaut (Absätze mit Leerzeile, keine Silbentrennung am Zeilenende); bei Bildern, Karten, Grafiken eine sachliche Beschreibung in zwei bis drei Sätzen samt Bildunterschrift.',
      '- "titel": Überschrift des Abschnitts; "titel"/"verlag"/"seiten" oben: Buch, Verlag und Seitenbereich, soweit erkennbar (sonst leer).',
      'Sonst: "istSchulbuch": false, alles andere leer.'
    ].join('\n'),
    images: seiten,
    schemaName: 'schulbuch_erkennung',
    schema: SCHEMA
  })
  if (!d?.istSchulbuch || !d.abschnitte?.length) return null
  return {
    titel: String(d.titel ?? '').trim(),
    verlag: String(d.verlag ?? '').trim(),
    seiten: String(d.seiten ?? '').trim(),
    abschnitte: d.abschnitte
      .map((a) => ({
        kennung: String(a.kennung ?? '').trim() || 'Abschnitt',
        art: String(a.art ?? '').trim(),
        titel: String(a.titel ?? '').trim(),
        seite: String(a.seite ?? '').trim(),
        text: String(a.text ?? '').trim(),
        // Vorgabe: verweisen (die Lernenden haben das Buch); Aufgabenblöcke des Buchs weglassen
        wahl: (/aufgabe/i.test(String(a.art)) ? 'weg' : 'verweis') as AbschnittWahl
      }))
      .slice(0, 40)
  }
}

/** Quellenangabe eines Abschnitts */
export const quelleVon = (sb: Schulbuch, a: SchulbuchAbschnitt): string =>
  [sb.titel || 'Schulbuch', sb.verlag, a.seite ? `S. ${a.seite}` : sb.seiten ? `S. ${sb.seiten}` : '', a.kennung].filter(Boolean).join(', ')

/** Wie Lernende auf den Abschnitt verwiesen werden: „VT1 auf S. 39 in deinem Schulbuch" */
export const verweisVon = (a: SchulbuchAbschnitt, fach = ''): string =>
  `${a.kennung}${a.seite ? ` auf S. ${a.seite}` : ''} in deinem ${fach ? `${fach}buch` : 'Schulbuch'}`

/**
 * Text für die KI-Erzeugung: was nur verwiesen, was wörtlich übernommen wird. Ersetzt den rohen
 * Material-Text der Seiten; die Seitenbilder gehen NICHT mehr mit (und nie aufs Blatt).
 */
export function schulbuchText(sb: Schulbuch, fach = ''): string {
  const verweis = sb.abschnitte.filter((a) => a.wahl === 'verweis')
  const text = sb.abschnitte.filter((a) => a.wahl === 'text')
  const teile = [
    `SCHULBUCH DER LERNENDEN: ${[sb.titel ? `„${sb.titel}"` : 'Schulbuch', sb.verlag, sb.seiten ? `S. ${sb.seiten}` : ''].filter(Boolean).join(', ')}. Die Seiten selbst kommen NICHT aufs Blatt.`
  ]
  if (verweis.length)
    teile.push(
      [
        'NUR VERWEISEN – die Lernenden lesen im eigenen Buch; NICHT abdrucken. In den Aufgaben genau so darauf verweisen, z. B. „Lies ' +
          verweisVon(verweis[0], fach) +
          '. Erkläre …":',
        ...verweis.map((a) => `- ${a.kennung} (S. ${a.seite || '?'}, ${a.art}${a.titel ? `: ${a.titel}` : ''}) – Inhalt: ${a.text.slice(0, 1200)}`)
      ].join('\n')
    )
  if (text.length)
    teile.push(
      [
        'WÖRTLICH ALS MATERIAL ÜBERNEHMEN – unverändert als Text-Material aufs Blatt, mit Quellenangabe im Feld „source" (genau wie angegeben):',
        ...text.map((a) => `--- ${a.kennung}${a.titel ? `: ${a.titel}` : ''} (Quelle: ${quelleVon(sb, a)}) ---\n${a.text}`)
      ].join('\n')
    )
  return teile.join('\n\n')
}
