/**
 * Listen unregelmäßiger Verben je Lehrwerk-Band (30.09.2026, Wunsch der Lehrkraft).
 *
 * „Eine Liste für Englisch füge ich nachher in die App als Scan ein. […] Sie werden für Green Line
 * jedem Lehrwerk (Green Line 2, Green Line 3 usw.) einzeln zugeordnet, da sich die Listen etwas
 * unterscheiden. Die tabellarische Form im Schulbuch: infinitive | simple past | past participle |
 * German."
 *
 * Allgemein gebaut: jede Sprache hat ihre eigenen Spalten (Englisch wie im Schulbuch, Französisch
 * mit Präsensformen und passé composé, Latein mit Stammformen …). Eine Zelle steht WÖRTLICH wie im
 * Buch – Varianten mit Schrägstrich („burnt/burned"), Hinweise in Klammern.
 *
 * Gespeichert wird im Ordner der Lehrwerke (userData/lehrwerke/verben), je Band eine Datei. So
 * bleibt die Liste beim Zurücksetzen erhalten und steckt in jeder Sicherung – wie die Lehrwerke
 * selbst. Eingebaute Lehrwerke werden dabei nie überschrieben: Die Liste ist eine eigene Ergänzung.
 *
 * Ohne Electron und ohne React: Hauptprozess (storage/verbListen.ts) und Oberfläche nutzen dieselben
 * Regeln; geprüft in tests/verben.test.ts.
 */

/** Sprachen mit Verblisten – dieselben Kürzel wie `Textbook.language` */
export type VerbSprache = 'en' | 'fr' | 'es' | 'it' | 'ru' | 'la'

export const VERB_SPRACHEN: readonly VerbSprache[] = ['en', 'fr', 'es', 'it', 'ru', 'la']

export interface VerbSpalte {
  /** Schlüssel der Zelle in `VerbEintrag.formen` */
  id: string
  /** Spaltenkopf, wie er auf dem Blatt steht (Zielsprache, bei Latein Deutsch) */
  label: string
  /** Die deutsche Bedeutung – wird nie als „Form" bewertet und nie verfälscht */
  deutsch?: boolean
  /** Die Grundform, unter der das Verb geführt wird (Infinitiv bzw. Lernform) */
  grundform?: boolean
}

/**
 * Spalten je Sprache.
 *
 * Englisch genau wie in Green Line. Die übrigen Sprachen nach den Verblisten der gängigen Lehrwerke
 * (Découvertes/À plus!: Infinitiv, Präsens je/nous/ils, passé composé, futur; ¡Apúntate!/Encuentros:
 * presente yo/nosotros, indefinido, participio; Latein: die Stammformen). Die Recherche steht in
 * recherche/unregelmaessige-verben-2026-09-30.md.
 */
export const VERB_SPALTEN: Record<VerbSprache, VerbSpalte[]> = {
  en: [
    { id: 'inf', label: 'infinitive', grundform: true },
    { id: 'past', label: 'simple past' },
    { id: 'pp', label: 'past participle' },
    { id: 'de', label: 'German', deutsch: true }
  ],
  fr: [
    { id: 'inf', label: 'infinitif', grundform: true },
    { id: 'je', label: 'présent (je)' },
    { id: 'nous', label: 'présent (nous)' },
    { id: 'ils', label: 'présent (ils)' },
    { id: 'pc', label: 'passé composé (je)' },
    { id: 'fut', label: 'futur simple (je)' },
    { id: 'de', label: 'allemand', deutsch: true }
  ],
  es: [
    { id: 'inf', label: 'infinitivo', grundform: true },
    { id: 'yo', label: 'presente (yo)' },
    { id: 'nos', label: 'presente (nosotros)' },
    { id: 'indef', label: 'indefinido (yo)' },
    { id: 'part', label: 'participio' },
    { id: 'de', label: 'alemán', deutsch: true }
  ],
  it: [
    { id: 'inf', label: 'infinito', grundform: true },
    { id: 'io', label: 'presente (io)' },
    { id: 'loro', label: 'presente (loro)' },
    { id: 'pp', label: 'passato prossimo (io)' },
    { id: 'de', label: 'tedesco', deutsch: true }
  ],
  ru: [
    { id: 'inf', label: 'инфинитив', grundform: true },
    { id: 'ya', label: 'я' },
    { id: 'ty', label: 'ты' },
    { id: 'oni', label: 'они' },
    { id: 'past', label: 'прошедшее (он)' },
    { id: 'de', label: 'по-немецки', deutsch: true }
  ],
  la: [
    { id: 'praes', label: 'Präsens (1. Sg.)', grundform: true },
    { id: 'inf', label: 'Infinitiv' },
    { id: 'perf', label: 'Perfekt' },
    { id: 'ppp', label: 'PPP / Supin' },
    { id: 'de', label: 'Deutsch', deutsch: true }
  ]
}

export const SPRACH_NAMEN: Record<VerbSprache, string> = {
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch',
  ru: 'Russisch',
  la: 'Latein'
}

/** Fach-Kennung (Arbeitsblatt, Grammatiktest) → Sprache der Verbliste */
export const SPRACHE_DES_FACHS: Record<string, VerbSprache> = {
  englisch: 'en',
  franzoesisch: 'fr',
  spanisch: 'es',
  italienisch: 'it',
  russisch: 'ru',
  latein: 'la'
}

export const istVerbSprache = (x: unknown): x is VerbSprache => typeof x === 'string' && (VERB_SPRACHEN as readonly string[]).includes(x)

export interface VerbEintrag {
  id: string
  /** Zellen je Spalten-Kennung, wörtlich wie im Buch („burnt/burned", „(to) be") */
  formen: Record<string, string>
  /** Hinweis zur Zeile („nur im BE", „auch: learned") */
  hinweis?: string
  /** Spalten, bei denen die Übertragung unsicher war (Scan) – bis die Lehrkraft sie bestätigt */
  unsicher?: string[]
}

export interface VerbListe {
  /** Gleich der Lehrwerk-Kennung, bei freien Listen eine eigene Kennung */
  id: string
  /** Kennung des Lehrwerks (Band), falls es in der App angelegt ist */
  lehrwerkId?: string
  /** Name des Bandes, z. B. „Green Line 3" */
  name: string
  reihe?: string
  band?: string
  sprache: VerbSprache
  eintraege: VerbEintrag[]
  /** Fundstelle im Buch, z. B. „S. 212–214" */
  seite?: string
  aktualisiert: string
}

/** Übersicht ohne Einträge – für Auswahllisten */
export interface VerbListeMeta {
  id: string
  lehrwerkId?: string
  name: string
  reihe?: string
  band?: string
  sprache: VerbSprache
  anzahl: number
  seite?: string
  aktualisiert: string
}

export const alsMeta = (l: VerbListe): VerbListeMeta => ({
  id: l.id,
  ...(l.lehrwerkId ? { lehrwerkId: l.lehrwerkId } : {}),
  name: l.name,
  ...(l.reihe ? { reihe: l.reihe } : {}),
  ...(l.band ? { band: l.band } : {}),
  sprache: l.sprache,
  anzahl: l.eintraege.length,
  ...(l.seite ? { seite: l.seite } : {}),
  aktualisiert: l.aktualisiert
})

export const pruefeListenId = (id: string): string => {
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(id)) throw new Error('Ungültige Kennung der Verbliste.')
  return id
}

/** Kennung aus einem freien Namen („Découvertes 2" → „decouvertes-2") */
export function listenIdAusName(name: string): string {
  const id = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return id.length >= 2 ? `verben-${id}` : `verben-${Date.now().toString(36)}`
}

const text = (x: unknown, max = 200): string => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/**
 * Bereinigt eine Liste vor dem Speichern: bekannte Spalten, getrimmte Zellen, keine leeren Zeilen.
 * Wirft bei unbrauchbaren Angaben – der Hauptprozess speichert nie halbe Daten.
 */
export function bereinigeVerbListe(x: unknown): VerbListe {
  const l = (x ?? {}) as Partial<VerbListe>
  if (!istVerbSprache(l.sprache)) throw new Error('Unbekannte Sprache der Verbliste.')
  const id = pruefeListenId(String(l.id ?? ''))
  const name = text(l.name, 120)
  if (!name) throw new Error('Die Verbliste braucht einen Namen (z. B. „Green Line 3").')
  const spalten = VERB_SPALTEN[l.sprache].map((s) => s.id)
  const eintraege: VerbEintrag[] = []
  for (const e of Array.isArray(l.eintraege) ? l.eintraege.slice(0, 1000) : []) {
    const formen: Record<string, string> = {}
    for (const s of spalten) {
      const v = text((e as VerbEintrag)?.formen?.[s])
      if (v) formen[s] = v
    }
    if (!Object.keys(formen).some((k) => k !== 'de')) continue
    const hinweis = text((e as VerbEintrag).hinweis)
    const unsicher = Array.isArray((e as VerbEintrag).unsicher) ? (e as VerbEintrag).unsicher!.filter((s) => spalten.includes(s)) : []
    const eid = /^[A-Za-z0-9_-]{1,40}$/.test(String((e as VerbEintrag).id ?? '')) ? String((e as VerbEintrag).id) : `v${eintraege.length + 1}`
    eintraege.push({ id: eid, formen, ...(hinweis ? { hinweis } : {}), ...(unsicher.length ? { unsicher } : {}) })
  }
  const lehrwerkId = text(l.lehrwerkId, 80)
  const reihe = text(l.reihe, 80)
  const band = text(l.band, 40)
  const seite = text(l.seite, 60)
  return {
    id,
    ...(lehrwerkId ? { lehrwerkId } : {}),
    name,
    ...(reihe ? { reihe } : {}),
    ...(band ? { band } : {}),
    sprache: l.sprache,
    eintraege,
    ...(seite ? { seite } : {}),
    aktualisiert: typeof l.aktualisiert === 'string' && l.aktualisiert ? l.aktualisiert : new Date().toISOString()
  }
}

/** „—" in einer Zelle: Diese Form gibt es nicht (lat. „sum, esse, fui, —") – nie eine Lücke */
export const istLeerform = (zelle: string | undefined): boolean => !zelle || /^[-–—]+$/.test(zelle.trim())

/** Die Grundform eines Eintrags (Infinitiv bzw. Lernform) */
export function grundformVon(e: VerbEintrag, sprache: VerbSprache): string {
  const s = VERB_SPALTEN[sprache].find((x) => x.grundform)
  return (s && e.formen[s.id]) || Object.values(e.formen)[0] || ''
}

/**
 * Vergleichsschlüssel eines Verbs: Grundform ohne „to", ohne Klammerzusätze und Akzente.
 * Damit erkennt die App Dubletten und findet Verben einer Vokabelliste in der Verbliste.
 */
export function verbSchluessel(form: string): string {
  return form
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/^\s*to\s+/, '')
    .split('/')[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zа-яё' -]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Zulässige Formen einer Zelle: „burnt/burned" → beide, „was/were" → beide (je nach Person).
 * Klammerzusätze fallen weg: „(to) be" → „be".
 */
export function varianten(zelle: string): string[] {
  return zelle
    .split(/\s*\/\s*|\s+or\s+|\s+ou\s+|\s+o\s+|\s+или\s+/)
    .map((v) => v.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}
