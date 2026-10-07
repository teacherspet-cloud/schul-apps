/**
 * Medienbank der Vokabeln – Abläufe in der Oberfläche (05.10.2026; Ablage: main/services/storage/medienbank.ts).
 *
 * Bilder: Die Bildsuche (Openverse, Wikimedia, Pixabay mit Schlüssel) liefert Kandidaten; die eingestellte
 * KI sieht die Vorschauen und wählt das geeignetste (oder keines). Das Bild wird verkleinert (höchstens
 * 512 px) gespeichert, die übrigen Kandidaten bleiben zum Umwählen. Alternativ erzeugt die Bild-KI eines.
 * Aussprache: die Sprach-KI (ElevenLabs bzw. OpenAI-Stimme) mit der Standardstimme der Sprache.
 * Alle Wege laufen über die vorhandenen Kanäle – mit Schlüsseln, Namensschutz und Verbrauch wie sonst.
 *
 * Seit 06.10.2026 laufen sie als Hintergrund-Aufträge (medienAuftrag.ts): Die KI-Aufrufe kommen dann über den
 * Auftrag (`Ki`), damit Fortschritt, Warteplatz und Abbruch in der Auftragsleiste stimmen. Für jüngere Lernende
 * (bis Klasse 6) sucht die Bildsuche zuerst Cliparts und Illustrationen, Fotos nur als Rückfall.
 *
 * Bildstufen (07.10.2026, abgestimmt nach Recherche – Begründung in shared/medienbank.ts): je Altersstufe ein eigenes
 * Bild. Mit dem Alter wird der Stil realistischer, nicht detailreicher; Jüngere bekommen nur für konkrete Wörter ein
 * Bild, ab Klasse 7 auch Abstrakta als typische Szene. Sieht die KI kein eindeutiges Bild, bleibt das Wort für diese
 * Stufe ohne Bild (gemerkt in `ohneBild`). Personen im Alter der Lernenden, vielfältig ohne Klischees, Gegenstände
 * in der Fassung der Zielkultur, wo sie dort typisch anders aussehen.
 */
import type { OnlineImageHit, OnlineImageSource, StructuredRequest } from '@shared/types'
import { stufeVon, type Bildstufe, type MedienKandidat, type Stimmlage, type TonArt } from '@shared/medienbank'
import { istBegrenzung } from './medienWarten'

export interface Vokabel {
  term: string
  translation: string
  example?: string
  /** Unregelmäßige Verben (07.10.2026): die gesprochenen Formen (infinitive, simple past, past participle) */
  formen?: string[]
  /** … und der Hinweis bzw. das Beispiel der Zeile */
  hinweis?: string
}

/** Wie die Abläufe die KI erreichen – im Auftrag über dessen Kontext, sonst direkt */
export interface Ki {
  ai: <T>(req: StructuredRequest) => Promise<T>
  bild: (prompt: string) => Promise<string>
}
const direkt = (): Ki => ({ ai: (req) => window.api.ai.structured(req), bild: (prompt) => window.api.ai.image(prompt) })

/** Wer die Vokabeln lernt – steuert Bildart und Bildsprache */
export interface Lernende {
  /** Klassenstufe aus Liste oder Lehrwerk (fehlt = unbekannt) */
  klasse?: number
  /** Bildstufe, falls von Hand gewählt – sonst aus der Klasse */
  stufe?: Bildstufe
}

export const stufeDer = (l?: Lernende): Bildstufe => l?.stufe ?? stufeVon(l?.klasse)

/** Bis zu dieser Klasse bevorzugt die Bildsuche Cliparts (Wunsch der Lehrkraft, 06.10.2026) */
export const CLIPART_BIS_KLASSE = 6
export const clipartZuerst = (l?: Lernende): boolean => stufeDer(l) === 's1' || stufeDer(l) === 's2'

/** Alter je Stufe – für die Personen auf den Bildern und die Hinweise an die KI */
const ALTER: Record<Bildstufe, { klassen: string; jahre: string; personen: string }> = {
  s1: { klassen: '1–4', jahre: '6–10', personen: 'children of primary-school age (about 6 to 10)' },
  s2: { klassen: '5–6', jahre: '10–12', personen: 'children aged about 10 to 12' },
  s3: { klassen: '7–10', jahre: '12–16', personen: 'teenagers aged about 13 to 16' },
  s4: { klassen: '11–13', jahre: '16–19', personen: 'young people aged about 16 to 19' }
}

/** Was in der Stufe ein Bild bekommt (Hinweis an die KI) */
const WAS_ZEIGEN: Record<Bildstufe, string> = {
  s1: 'Nur konkrete Wörter bekommen ein Bild: Gegenstände, Tiere, Personen(-gruppen), Orte, Farben, Körperteile und sehr einfache sichtbare Tätigkeiten (laufen, essen). Gezeigt wird EIN Gegenstand bzw. eine Figur ohne Hintergrund.',
  s2: 'Konkrete Wörter bekommen ein Bild; Verben als einfache, eindeutige Handlungsszene. Abstrakte Wörter (Gefühle ohne eindeutige Mimik, Begriffe, Eigenschaften ohne sichtbares Merkmal) bekommen keins.',
  s3: 'Konkrete Wörter, Verben als Handlungsszene, Gefühle und Situationen; abstrakte Wörter als typische, eindeutige Alltagsszene (z. B. „hope": jemand wartet am Fenster gespannt auf einen Brief).',
  s4: 'Wie für Jugendliche, dazu abstrakte Begriffe als Situation oder allgemein bekanntes Symbol und Fachwörter als sachliches Bild. Im Zweifel lieber kein Bild.'
}

/** Bildstil der Bild-KI je Stufe – realistischer mit dem Alter, nie detailreicher */
export const BILDSTIL: Record<Bildstufe, string> = {
  s1: "Friendly children's-book illustration with clean bold outlines and flat colours, true-to-life proportions and colours, no faces on objects, no animals with human features",
  s2: 'Semi-realistic illustration with soft shading and natural proportions, matter-of-fact and not babyish',
  s3: 'Realistic illustration in the look of a modern textbook photo, natural light and colours',
  s4: 'Realistic editorial-style photograph, natural muted colours, calm and matter-of-fact'
}

const SPRACHE_NAME: Record<string, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch',
  la: 'Latein',
  nl: 'Niederländisch',
  pl: 'Polnisch',
  ru: 'Russisch',
  tr: 'Türkisch'
}

/** Bild verkleinern (JPEG, höchstens `max` px) – die Medienbank bleibt klein, Laden geht schnell */
export async function verkleinern(dataUrl: string, max = 512): Promise<string> {
  const bild = await new Promise<HTMLImageElement>((ok, fehler) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => fehler(new Error('Das Bild ließ sich nicht laden.'))
    i.src = dataUrl
  })
  const f = Math.min(1, max / Math.max(bild.naturalWidth, bild.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bild.naturalWidth * f))
  c.height = Math.max(1, Math.round(bild.naturalHeight * f))
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bild, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

const nachweisVon = (k: MedienKandidat): string => [k.titel, k.urheber, k.lizenz, k.quelle].filter(Boolean).join(' · ')

/** Eine Suchanfrage: Quelle und – bei Pixabay – die Bildart */
type Suche = { quelle: OnlineImageSource; bildart?: 'photo' | 'illustration' | 'vector' }

/**
 * Reihenfolge der Suchen. Jüngere Lernende: zuerst Cliparts (Openverse-Illustrationen, Pixabay Illustration und
 * Vektor), Fotos nur, wenn das zu wenig liefert. Ältere: wie bisher Fotos und Grafiken gemischt.
 */
export function suchReihe(l?: Lernende): { zuerst: Suche[]; rueckfall: Suche[] } {
  const fotos: Suche[] = [{ quelle: 'openverse' }, { quelle: 'wikimedia' }, { quelle: 'pixabay' }]
  if (!clipartZuerst(l)) return { zuerst: fotos, rueckfall: [] }
  // Kl. 5–6: zuerst Illustrationen (halbrealistisch), Cliparts danach (Bildstufen, 07.10.2026)
  if (stufeDer(l) === 's2')
    return {
      zuerst: [{ quelle: 'pixabay', bildart: 'illustration' }, { quelle: 'clipart' }, { quelle: 'pixabay', bildart: 'vector' }],
      rueckfall: [{ quelle: 'openverse' }, { quelle: 'pixabay', bildart: 'photo' }]
    }
  return {
    zuerst: [{ quelle: 'clipart' }, { quelle: 'pixabay', bildart: 'vector' }, { quelle: 'pixabay', bildart: 'illustration' }],
    rueckfall: [{ quelle: 'openverse' }, { quelle: 'pixabay', bildart: 'photo' }]
  }
}

/** Suchbegriff: der englische Begriff bei Englisch (und das Wort selbst bei Deutsch), sonst die deutsche Bedeutung */
const suchbegriff = (sprache: string, v: Vokabel): string => (sprache === 'en' || sprache === 'de' ? v.term : v.translation || v.term)

/**
 * Kandidaten aus der Bildsuche. Scheitern ALLE Quellen an einer Begrenzung (z. B. Pixabay 429) und es gibt
 * keinen Treffer, kommt der Fehler durch – dann wartet der Auftrag, statt das Wort als „ohne Bild" abzuhaken.
 */
export async function bildKandidaten(sprache: string, v: Vokabel, lernende?: Lernende): Promise<MedienKandidat[]> {
  const suche = suchbegriff(sprache, v)
  const { zuerst, rueckfall } = suchReihe(lernende)
  const treffer: OnlineImageHit[] = []
  const begrenzt: unknown[] = []
  const hole = async (reihe: Suche[]): Promise<void> => {
    for (const s of reihe) {
      const t = await window.api.images.searchOnline(suche, s.quelle, s.bildart ? { bildart: s.bildart } : undefined).catch((e: unknown) => {
        if (istBegrenzung(e instanceof Error ? e.message : String(e))) begrenzt.push(e)
        return [] as OnlineImageHit[]
      })
      treffer.push(...t.slice(0, 4))
    }
  }
  await hole(zuerst)
  // Zu wenig Cliparts: Fotos als Rückfall
  if (treffer.length < 4 && rueckfall.length) await hole(rueckfall)
  if (!treffer.length && begrenzt.length) throw begrenzt[0]
  const gesehen = new Set<string>()
  return (
    treffer
      // https – oder kleine data-Bilder (KI-Attrappe der Tests)
      .filter((h) => (/^https:\/\//.test(h.url) || (h.url.startsWith('data:image/') && h.url.length < 4000)) && !gesehen.has(h.url) && gesehen.add(h.url))
      .slice(0, 10)
      .map((h) => ({ url: h.url, vorschau: h.thumbnail || h.url, titel: h.title, urheber: h.creator, lizenz: h.license, quelle: h.source }))
  )
}

/** Hinweis an die KI zur Bildart, je nach Alter der Lernenden */
export function bildartHinweis(l?: Lernende): string {
  const s = stufeDer(l)
  const a = ALTER[s]
  const art: Record<Bildstufe, string> = {
    s1: 'Bevorzuge klare, freundliche Illustrationen oder Cliparts mit echten Proportionen und Farben, ohne vermenschlichte Gegenstände oder Tiere; ein Foto nur, wenn kein solches Bild die Bedeutung eindeutig zeigt.',
    s2: 'Bevorzuge halbrealistische Illustrationen oder klare Fotos; nichts Babyhaftes (Kindchenschema).',
    s3: 'Bevorzuge Fotos oder realistische Illustrationen; kindliche Cartoons wirken in diesem Alter herablassend.',
    s4: 'Bevorzuge sachliche Fotos; keine Cartoons.'
  }
  return `Die Lernenden sind in Klasse ${a.klassen} (etwa ${a.jahre} Jahre). ${art[s]} ${WAS_ZEIGEN[s]} Personen möglichst im Alter der Lernenden.`
}

/**
 * Die KI wählt aus den Vorschauen das Bild, das die Bedeutung am eindeutigsten zeigt; -1 = keines.
 * `nichtZeigbar`: Das Wort lässt sich für diese Altersstufe gar nicht eindeutig bebildern (abstrakt) – dann merkt
 * sich die Medienbank das, statt es bei jedem Auftrag erneut zu versuchen.
 */
export async function kiWaehltMehr(
  sprache: string,
  v: Vokabel,
  kandidaten: MedienKandidat[],
  lernende?: Lernende,
  ki: Ki = direkt()
): Promise<{ i: number; nichtZeigbar: boolean }> {
  const vorschauen: { i: number; dataUrl: string }[] = []
  for (const [i, k] of kandidaten.slice(0, 6).entries()) {
    const d = await window.api.images.fetch(k.vorschau).catch(() => '')
    if (d) vorschauen.push({ i, dataUrl: await verkleinern(d, 256).catch(() => d) })
  }
  if (!vorschauen.length) return { i: -1, nichtZeigbar: false }
  const antwort = await ki.ai<{ wahl: number; nichtZeigbar: boolean; begruendung: string }>({
    system: `Du wählst Beispielbilder für Vokabelkarten. Ein gutes Bild zeigt die Bedeutung eindeutig, ohne Text, altersgerecht, ohne Klischees und ohne bekannte Marken oder erkennbare Personen im Mittelpunkt; ein mehrdeutiges Bild schadet mehr als keines. ${bildartHinweis(
      lernende
    )}`,
    user: [
      `Vokabel (${SPRACHE_NAME[sprache] ?? sprache}): „${v.term}" – Deutsch: „${v.translation}"${v.example ? ` – Beispiel: „${v.example}"` : ''}`,
      `Die ${vorschauen.length} Bilder sind von 1 bis ${vorschauen.length} nummeriert (in dieser Reihenfolge).`,
      'Antworte mit der Nummer des Bildes, das die Bedeutung am eindeutigsten zeigt; 0, wenn keines passt.',
      'nichtZeigbar = true, wenn sich das Wort für diese Altersstufe grundsätzlich nicht eindeutig bebildern lässt (nach den Regeln oben, z. B. abstrakte Wörter oder Funktionswörter) – dann ist wahl 0.'
    ].join('\n'),
    images: vorschauen.map((x) => x.dataUrl),
    schemaName: 'vokabel_bildwahl',
    schema: {
      type: 'object',
      properties: { wahl: { type: 'integer' }, nichtZeigbar: { type: 'boolean' }, begruendung: { type: 'string' } },
      required: ['wahl', 'nichtZeigbar', 'begruendung'],
      additionalProperties: false
    }
  })
  const n = Math.round(Number(antwort?.wahl) || 0)
  const i = n >= 1 && n <= vorschauen.length ? vorschauen[n - 1].i : -1
  return { i, nichtZeigbar: i < 0 && antwort?.nichtZeigbar === true }
}

/** Wie `kiWaehltMehr`, nur die Nummer */
export async function kiWaehlt(sprache: string, v: Vokabel, kandidaten: MedienKandidat[], lernende?: Lernende, ki: Ki = direkt()): Promise<number> {
  return (await kiWaehltMehr(sprache, v, kandidaten, lernende, ki)).i
}

/** Ein Kandidat als Bild der Medienbank (in voller Größe geladen, dann verkleinert) */
export async function kandidatUebernehmen(sprache: string, wort: string, k: MedienKandidat, alle?: MedienKandidat[], stufe: Bildstufe = 's2'): Promise<void> {
  const d = await window.api.images.fetch(k.url).catch(() => window.api.images.fetch(k.vorschau))
  await window.api.medien.bildSetzen(
    sprache,
    wort,
    {
      dataUrl: await verkleinern(d),
      herkunft: 'suche',
      nachweis: nachweisVon(k),
      ...(alle ? { kandidaten: alle } : {})
    },
    stufe
  )
}

/**
 * Motiv für die Bild-KI (Bildstufen, 07.10.2026): Die Sprach-KI prüft, ob sich das Wort für diese Altersstufe
 * eindeutig zeigen lässt, und beschreibt das Motiv – Personen im Alter der Lernenden, vielfältig ohne Klischees,
 * Gegenstände in der Fassung der Zielkultur, wo sie dort typisch anders aussehen.
 */
export async function motivWaehlen(sprache: string, v: Vokabel, lernende?: Lernende, ki: Ki = direkt()): Promise<{ eindeutig: boolean; motiv: string }> {
  const s = stufeDer(lernende)
  const a = ALTER[s]
  const antwort = await ki.ai<{ eindeutig: boolean; motiv: string }>({
    system: [
      `Du planst Beispielbilder für Vokabelkarten von Lernenden der Klassen ${a.klassen} (etwa ${a.jahre} Jahre).`,
      WAS_ZEIGEN[s],
      'Ein mehrdeutiges Bild schadet mehr als keines. Funktionswörter (although, of, the …) und Wendungen ohne eindeutiges Bild: eindeutig = false.',
      `Kommen Menschen vor, dann ${a.personen} (Erwachsene nur, wo das Wort sie verlangt, z. B. teacher, doctor); Aussehen, Hautfarbe und Rollen natürlich abwechselnd und ohne Klischees – nicht in jedem Bild alles.`,
      `Sieht der Gegenstand im Land der Zielsprache (${SPRACHE_NAME[sprache] ?? sprache}) typisch anders aus (z. B. Doppeldeckerbus, Baguette, britische Schuluniform), zeige diese Fassung; sonst neutral.`,
      'motiv: ein bis zwei englische Sätze, die genau beschreiben, was zu sehen ist – ein klarer Hauptgegenstand bzw. eine einfache Szene, keine Nebensachen, kein Text. Auch wenn eindeutig = false, beschreibe den besten Versuch.'
    ].join('\n'),
    user: `Vokabel (${SPRACHE_NAME[sprache] ?? sprache}): „${v.term}" – Deutsch: „${v.translation}"${v.example ? ` – Beispiel: „${v.example}"` : ''}`,
    schemaName: 'vokabel_bildmotiv',
    schema: {
      type: 'object',
      properties: { eindeutig: { type: 'boolean' }, motiv: { type: 'string' } },
      required: ['eindeutig', 'motiv'],
      additionalProperties: false
    }
  })
  return { eindeutig: antwort?.eindeutig !== false, motiv: String(antwort?.motiv ?? '').trim() }
}

/** Auftrag an die Bild-KI je Stufe */
export function bildPrompt(sprache: string, v: Vokabel, lernende: Lernende | undefined, motiv: string): string {
  const s = stufeDer(lernende)
  const was = motiv || `${v.translation || v.term} (${SPRACHE_NAME[sprache] ?? sprache} word: "${v.term}")`
  return `${BILDSTIL[s]}. Vocabulary flashcard image: ${was} One clear main subject filling most of the frame, recognisable at small size, plain light background, strong contrast, true-to-life proportions and colours, no text, no letters, no numbers, no logos.`
}

/** Bild von der Bild-KI erzeugen lassen – im Stil der Bildstufe (`motiv` aus `motivWaehlen`) */
export async function bildErzeugen(sprache: string, v: Vokabel, lernende?: Lernende, ki: Ki = direkt(), motiv = ''): Promise<void> {
  const d = await ki.bild(bildPrompt(sprache, v, lernende, motiv))
  await window.api.medien.bildSetzen(sprache, v.term, { dataUrl: await verkleinern(d), herkunft: 'ki', nachweis: 'KI-generiert' }, stufeDer(lernende))
}

/** Aussprache erzeugen – `lage`: weibliche oder männliche Fassung (07.10.2026) */
export async function tonErzeugen(sprache: string, wort: string, art: TonArt, text: string, stimme: string, lage: Stimmlage = 'w'): Promise<void> {
  const id = `vok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const r = await window.api.audio.speak({ id, turns: [{ voiceId: stimme, text }], languageCode: sprache })
  if (!r?.dataUrl) throw new Error('Die Sprach-KI hat keine Aufnahme geliefert.')
  await window.api.medien.tonSetzen(sprache, wort, art, { dataUrl: r.dataUrl, stimme, text }, lage)
}

let laeuft: HTMLAudioElement | null = null
/** Ton der Medienbank abspielen (Datei oder Adresse) */
export async function abspielen(quelle: { datei?: string; url?: string }): Promise<void> {
  laeuft?.pause()
  const src = quelle.url ?? (quelle.datei ? await window.api.medien.datei(quelle.datei) : null)
  if (!src) throw new Error('Die Aufnahme fehlt.')
  laeuft = new Audio(src)
  await laeuft.play()
}
