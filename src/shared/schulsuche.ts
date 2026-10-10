/**
 * Schulsuche beim Feld „Schulname" (Paket 13, Wunsch der Lehrkraft vom 26.09.2026).
 *
 * Offline-Schulverzeichnis aller Länder (resources/schulen/schulen.json, ~30 000 Schulen, 3 MB,
 * Quellen und Lizenzen in resources/schulen/README.md). Die Datei liest NUR der Hauptprozess
 * (main/services/storage/schulen.ts) und sucht darin; die Oberfläche bekommt höchstens 30
 * Treffer je Tastendruck. 3 MB in den Renderer – und beim Tablet über das Netz – zu schicken,
 * nur um einen Namen einzutragen, wäre Verschwendung.
 *
 * Ohne Electron und ohne React: geprüft in tests/schulsuche.test.ts.
 */

/** Schulform-Kürzel der Datei (Feld `schulformen`) */
export type SchulformKuerzel = 'gs' | 'hs' | 'rs' | 'igs' | 'gym' | 'fs' | 'bbs' | 'sonst'

/** Eine Zeile der Datei: [name, ort, plz, land, schulformen, id, strasse?, telefon?, email?] – Anschrift seit 29.09.2026, E-Mail seit 10.10.2026 */
export type SchulZeile = [string, string, string, string, string[], string, string?, string?, string?]

export interface SchulTreffer {
  id: string
  name: string
  ort: string
  plz: string
  /** Länderkürzel wie in den Einstellungen (NI, HB …) */
  land: string
  schulformen: string[]
  /** Für diese Schule liegt ein Vorgabe-Logo bei (resources/schulen/logos/<id>.png) */
  logo: boolean
  /** Straße mit Hausnummer – leer, wenn die Quelle keine führt */
  strasse: string
  /** Telefon der Schule – leer, wenn die Quelle keins führt (z. B. BY, RP, SH) */
  telefon: string
  /** E-Mail der Schule (10.10.2026) – leer, wenn die Quelle keine führt (z. B. NI, BY) */
  email: string
}

export interface SchulQuelle {
  name: string
  url?: string
  lizenz?: string
  abgerufen?: string
  laender?: string[]
}

/**
 * Schulformen der App (resources/cefr/levels.json) ↔ Kürzel des Verzeichnisses.
 *
 * Schulen mit mehreren Zweigen stehen dort mit mehreren Kürzeln (Oberschule NI = hs, rs). Die
 * Schulformen mit mehreren Bildungsgängen der Länder (Oberschule, Regionale Schule, Realschule
 * plus, Regelschule, Sekundarschule) passen deshalb zu hs UND rs; Gesamt- und
 * Gemeinschaftsschulen heißen im Verzeichnis einheitlich `igs`.
 */
export const SCHULFORM_KUERZEL: Record<string, SchulformKuerzel[]> = {
  grundschule: ['gs'],
  hauptschule: ['hs'],
  mittelschule: ['hs'],
  werkrealschule: ['hs'],
  realschule: ['rs'],
  oberschule: ['hs', 'rs'],
  'regionale-schule': ['hs', 'rs'],
  'realschule-plus': ['hs', 'rs'],
  regelschule: ['hs', 'rs'],
  sekundarschule: ['hs', 'rs'],
  gemeinschaftsschule: ['igs'],
  gesamtschule: ['igs'],
  'integrierte-gesamtschule': ['igs'],
  'integrierte-sekundarschule': ['igs'],
  stadtteilschule: ['igs'],
  gymnasium: ['gym'],
  // 30.09.2026: alle Schulformen des gemeinsamen Katalogs (@shared/schulformen)
  'kooperative-gesamtschule': ['igs'],
  mittelstufenschule: ['hs', 'rs'],
  // Wirtschaftsschule, FOS und BOS: im Verzeichnis nicht von Berufsschulen zu unterscheiden – keine Zuordnung
  'berufliches-gymnasium': ['bbs'],
  'berufliches-oberstufengymnasium': ['bbs'],
  fachgymnasium: ['bbs'],
  berufskolleg: ['bbs'],
  'foerderschule-lernen': ['fs']
}

/**
 * Die Schulform der App, die zu einem Treffer passt – aus den Schulformen, die es im Land des
 * Treffers gibt. Die beste Deckung gewinnt („hs, rs" in NI → Oberschule, nicht Hauptschule);
 * null, wenn keine passt. Berufsbildende Schulen („bbs“) gelten als berufliches Gymnasium, Förderschulen („fs“) als Förderschule Lernen.
 */
export function appSchulform(kuerzel: string[], schulformenDesLandes: string[]): string | null {
  let beste: string | null = null
  let wert = 0
  for (const id of schulformenDesLandes) {
    const k = SCHULFORM_KUERZEL[id] ?? []
    const treffer = k.filter((x) => kuerzel.includes(x)).length
    if (!treffer) continue
    // Anteil in beide Richtungen: „gym" passt voll zu Gymnasium, „hs, rs" voll zu Oberschule
    const s = treffer / Math.max(k.length, kuerzel.filter((x) => x !== 'sonst').length)
    if (s > wert) {
      beste = id
      wert = s
    }
  }
  return beste
}

/**
 * Suchform eines Textes: klein, Umlaute als ae/oe/ue, ß als ss, Akzente weg, Bindestriche,
 * Anführungszeichen und Satzzeichen als Leerzeichen. „Heinrich-Heine-Schule" und „Grundschule
 * „Heinrich Heine"" werden so gleich gefunden, und „Wesermuende" findet „Wesermünde".
 */
export function suchform(text: string): string {
  return text
    .toLocaleLowerCase('de')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Vorbereitete Zeile – einmal beim Laden, nicht bei jedem Tastendruck */
export interface SchulEintrag {
  zeile: SchulZeile
  /** Name in Suchform, mit Leerzeichen davor: „ gymnasium wesermuende" – so ist „ weserm" ein Wortanfang */
  name: string
  ort: string
}

export function bereiteVor(zeilen: SchulZeile[]): SchulEintrag[] {
  return zeilen.map((z) => ({ zeile: z, name: ` ${suchform(z[0])}`, ort: ` ${suchform(z[1])}` }))
}

export interface SuchOptionen {
  /** Bundesland der Einstellungen – Treffer dort zuerst */
  land?: string
  /** Schulform der Einstellungen (App-Kennung) – passende zuerst */
  schulform?: string
  /** Höchstzahl der Treffer (Standard und Obergrenze 30) */
  max?: number
}

export const MAX_TREFFER = 30

/**
 * Sucht Schulen. Jedes eingegebene Wort muss im Namen, im Ort oder in der PLZ stehen – als
 * Wortanfang („Heine" → Heinrich-Heine-Schule, „Weserm" → Gymnasium Wesermünde) oder ab drei
 * Buchstaben auch mitten im Wort („wesermünde" steckt in „Wesermünde-Süd"). Wortanfänge
 * zählen mehr als Teilwörter: Nach dem Hinweis der Datenaufbereitung (README) fände reine
 * Teilwortsuche bei „Heine" sonst zuerst Rhein-Schulen.
 *
 * RANGFOLGE (Faustregel, an den Stichproben „Heine" und „Weserm" geprüft): ganzes Wort im Namen >
 * Wortanfang im Namen > Wortanfang im Ort/PLZ > Teilwort; beginnt der Name mit der Eingabe, ein
 * wenig mehr. Dazu Bundesland und Schulform der Einstellungen: Sie FILTERN nicht – eine
 * Lehrkraft an einer Schule jenseits der Landesgrenze (das Gymnasium Wesermünde liegt in
 * Bremerhaven, ist aber niedersächsisch) muss ihre Schule trotzdem finden –, sie stellen
 * passende Treffer nach vorn.
 */
export function sucheSchulen(index: SchulEintrag[], eingabe: string, opt: SuchOptionen = {}, hatLogo: (id: string) => boolean = () => false): SchulTreffer[] {
  const q = suchform(eingabe)
  const woerter = q.split(' ').filter(Boolean)
  if (!woerter.length || q.replace(/ /g, '').length < 2) return []
  const max = Math.min(opt.max ?? MAX_TREFFER, MAX_TREFFER)
  const formen = opt.schulform ? (SCHULFORM_KUERZEL[opt.schulform] ?? []) : []
  const bewertet: { e: SchulEintrag; wert: number }[] = []
  for (const e of index) {
    let wert = 0
    let alle = true
    for (const w of woerter) {
      const anfang = ` ${w}`
      // Ganzes Wort vor Wortanfang: „Heine" meint eher Heinrich-HEINE als HEINEmann
      if (` ${e.name} `.includes(` ${w} `)) wert += 60
      else if (e.name.includes(anfang)) wert += 50
      else if (e.ort.includes(anfang) || e.zeile[2].startsWith(w)) wert += 30
      else if (w.length >= 3 && (e.name.includes(w) || e.ort.includes(w))) wert += 10
      // Zusammengesetztes Wort (10.10.2026): „Kreisgymnasium Wesermünde" findet „Gymnasium Wesermünde" (Wort endet auf ein Namenswort)
      else if (w.length >= 8 && e.name.split(' ').some((n) => n.length >= 6 && w.endsWith(n))) wert += 8
      else {
        alle = false
        break
      }
    }
    if (!alle) continue
    if (e.name.startsWith(` ${q}`)) wert += 5
    if (opt.land && e.zeile[3] === opt.land) wert += 35
    if (formen.length && e.zeile[4].some((f) => (formen as string[]).includes(f))) wert += 20
    bewertet.push({ e, wert })
  }
  bewertet.sort((a, b) => b.wert - a.wert || a.e.zeile[0].localeCompare(b.e.zeile[0], 'de') || a.e.zeile[1].localeCompare(b.e.zeile[1], 'de'))
  return bewertet.slice(0, max).map(({ e }) => {
    const [name, ort, plz, land, schulformen, id, strasse, telefon, email] = e.zeile
    return { id, name, ort, plz, land, schulformen, logo: hatLogo(id), strasse: strasse ?? '', telefon: telefon ?? '', email: email ?? '' }
  })
}

/** Prüft die eingelesene Datei grob – eine beschädigte Datei darf die Einstellungen nicht lahmlegen */
export function pruefeSchulen(roh: unknown): { zeilen: SchulZeile[]; quellen: SchulQuelle[]; stand: string } {
  const r = (roh ?? {}) as Record<string, unknown>
  const zeilen = Array.isArray(r.schulen)
    ? (r.schulen as unknown[]).filter(
        (z): z is SchulZeile =>
          Array.isArray(z) && z.length >= 6 && typeof z[0] === 'string' && typeof z[1] === 'string' && typeof z[3] === 'string' && Array.isArray(z[4])
      )
    : []
  const quellen = Array.isArray(r.quellen)
    ? (r.quellen as SchulQuelle[])
        .filter((q) => q && typeof q.name === 'string')
        .map((q) => ({ name: q.name, url: q.url, lizenz: q.lizenz, abgerufen: q.abgerufen, laender: q.laender }))
    : []
  return { zeilen, quellen, stand: typeof r.stand === 'string' ? r.stand : '' }
}
