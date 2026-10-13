/**
 * Vorwissen einer Lerngruppe (13.10.2026, abgestimmt mit der Lehrkraft) – für Unterrichtsreihe, Arbeitsblatt und Förder-/
 * Fordermaterial aus „Meine Klassen" (und mit „Für Lerngruppe" auch von anderswo). Der Server sammelt je Kurs die Daten
 * (server/vorwissen.ts), hier werden sie zusammengefasst und als Text für das Feld „Vorwissen der Lerngruppe" geschrieben.
 *
 * Entscheidungen der Lehrkraft:
 *  - Quellen: der eigene Kurs UND alle anderen Kurse der Schule mit denselben Lernenden – auch anderer Lehrkräfte, auch
 *    früherer Jahre (die Lerngruppe behält beim Schuljahreswechsel ihre Kennung), ohne Schalter.
 *  - Ein fremder Kurs zählt nur mit mindestens `MIN_GEMEINSAM` gemeinsamen Lernenden (sonst ließe sich eine Schwäche
 *    einer Person zuordnen). Aus fremden Kursen nur Themen und Fehlerschwerpunkte – keine Noten, keine Testschnitte.
 *  - Keine Herkunft: weder Fach noch Jahr noch Lehrkraft, nur grob „Aus diesem Kurs" / „Aus anderen Kursen".
 *  - Schwächen Einzelner nur als Anteile („6 von 24") samt Leistungsspanne für die Differenzierung – keine Namen, keine
 *    Kürzel. An die KI geht nur dieser Text (und auch der erst, nachdem die Lehrkraft ihn gesehen hat).
 *
 * Zeilenform (passt zu teileVorwissen in arbeitsblatt/didactics/vorwissen/vorwissen.ts): „Behandelt: …", „Sicher: …",
 * „Unsicher: … (k von n)", „Häufiger Fehler: …", „Leistungsspanne: …"; Überschriften „Aus diesem Kurs:" usw. ohne Inhalt.
 */

export const MIN_GEMEINSAM = 3
/** Ab diesem Anteil gilt etwas als sicher bzw. als Schwäche der Gruppe */
export const SICHER_AB = 0.75
export const UNSICHER_UNTER = 0.5
/** So viele Zeilen je Art und Teil höchstens – das Feld bleibt lesbar */
const MAX_ZEILEN = 8

export type Ampel = 'sicher' | 'aufbau' | 'schwaeche'

/** Was ein Kurs über ein Kind weiß (nur gemeinsame Lernende, keine Namen) */
export interface KindKurz {
  id: string
  /** Anteil sicherer Wörter, null ohne Vokabeln */
  vokSicher: number | null
  /** Gerade wackelnde Wörter („term – Übersetzung") */
  wackelig: string[]
  grammatik: { titel: string; ampel: Ampel }[]
  /** Schwierige Blattaufgaben (Kurztexte) */
  blattSchwierig: string[]
  /** Handlungsbedarf der Kurs-Hinweise („schwach", „foerdern", „inaktiv") – nur im eigenen Kurs bekannt */
  bedarf: string[]
}

/** Daten eines Kurses (eigener oder fremder) */
export interface KursDaten {
  /** Behandelte Themen: Reihen, Blätter, Tests, Grammatik, Vokabeln */
  themen: string[]
  lernziele: { text: string; erreicht: number }[]
  grammatik: { thema: string; sicher: number; fehler: string[] }[]
  /** Fehlerschwerpunkte der Tests (ohne Noten) */
  testSchwerpunkte: string[]
  /** Lehrwerk-Stand als Text („Green Line 2, bis Unit 3") */
  lehrwerk?: string
  kinder: KindKurz[]
}

export interface VorwissenTeil {
  behandelt: string[]
  sicher: string[]
  unsicher: string[]
  fehler: string[]
}

export interface VorwissenLerngruppe {
  lernende: number
  hier: VorwissenTeil
  andere: VorwissenTeil
  /** „etwa 6 von 24 brauchen mehr Unterstützung …" – leer ohne Daten */
  spanne: string
  /** Wie viele fremde Kurse eingeflossen sind (nur zur Anzeige der Zahl, ohne Herkunft) */
  andereKurse: number
  /** Schulinternes Curriculum (13.10.2026): Themen früherer Jahrgänge (behandelt) und späterer (noch nicht) */
  curriculum?: { frueher: string[]; spaeter: string[] }
}

const leer = (): VorwissenTeil => ({ behandelt: [], sicher: [], unsicher: [], fehler: [] })
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()
const prozent = (x: number): string => `${Math.round(x * 100)} %`

/** Ohne Doppelte (auch über Groß-/Kleinschreibung), gekürzt */
function eindeutig(l: string[], max = MAX_ZEILEN, schonDa: Set<string> = new Set()): string[] {
  const aus: string[] = []
  for (const roh of l) {
    const t = roh.replace(/\s+/g, ' ').trim().slice(0, 220)
    const k = norm(t)
    if (!t || schonDa.has(k)) continue
    schonDa.add(k)
    aus.push(t)
    if (aus.length >= max) break
  }
  return aus
}

/** Ab wie vielen Kindern ist etwas eine Schwäche der Gruppe? (mindestens 2 bzw. 15 %) */
export const schwelleKinder = (n: number): number => Math.max(2, Math.ceil(n * 0.15))

/** Einen oder mehrere Kurse (alle mit denselben Rollen) zu einem Teil zusammenfassen */
export function teilAus(kurse: KursDaten[], fremd: boolean): VorwissenTeil {
  const t = leer()
  if (!kurse.length) return t
  t.behandelt = eindeutig([...kurse.flatMap((k) => (k.lehrwerk ? [`Lehrwerk ${k.lehrwerk}`] : [])), ...kurse.flatMap((k) => k.themen)], 12)

  // Kinder über alle Kurse zusammen (eine Person zählt je Aussage einmal)
  const kinder = new Map<string, KindKurz[]>()
  for (const k of kurse) for (const c of k.kinder) kinder.set(c.id, [...(kinder.get(c.id) ?? []), c])
  const n = kinder.size

  // Grammatik je Regel: wie viele Kinder sicher bzw. schwach (das schlechtere Urteil zählt, wenn zwei Kurse sie führen)
  const rang: Record<Ampel, number> = { schwaeche: 0, aufbau: 1, sicher: 2 }
  const jeRegel = new Map<string, { titel: string; ampel: Map<string, Ampel> }>()
  for (const [id, l] of kinder)
    for (const c of l)
      for (const g of c.grammatik) {
        const e = jeRegel.get(norm(g.titel)) ?? { titel: g.titel, ampel: new Map<string, Ampel>() }
        const alt = e.ampel.get(id)
        if (!alt || rang[g.ampel] < rang[alt]) e.ampel.set(id, g.ampel)
        jeRegel.set(norm(g.titel), e)
      }
  const sicher: string[] = []
  const unsicher: { text: string; k: number }[] = []
  for (const e of jeRegel.values()) {
    const werte = [...e.ampel.values()]
    const schwach = werte.filter((a) => a !== 'sicher').length
    if (werte.length >= 2 && werte.filter((a) => a === 'sicher').length / werte.length >= SICHER_AB) sicher.push(e.titel)
    else if (schwach >= schwelleKinder(n)) unsicher.push({ text: `${e.titel} (${schwach} von ${n})`, k: schwach })
  }
  // Kursebene: Grammatik-Trainings und Lernziele der Reihen
  for (const k of kurse) {
    for (const g of k.grammatik) if (g.sicher >= SICHER_AB) sicher.push(g.thema)
    for (const z of k.lernziele)
      if (z.erreicht >= SICHER_AB) sicher.push(z.text)
      else if (z.erreicht < UNSICHER_UNTER) unsicher.push({ text: `${z.text} (erst ${prozent(z.erreicht)} erreicht)`, k: 0 })
  }
  // Wörter, die bei mehreren Kindern wackeln
  const wort = new Map<string, number>()
  for (const l of kinder.values()) for (const w of new Set(l.flatMap((c) => c.wackelig))) wort.set(w, (wort.get(w) ?? 0) + 1)
  const woerter = [...wort.entries()].filter(([, k]) => k >= schwelleKinder(n)).sort((a, b) => b[1] - a[1])
  if (woerter.length)
    unsicher.push({
      text: `Wörter ${woerter
        .slice(0, 10)
        .map(([w, k]) => `${w} (${k} von ${n})`)
        .join('; ')}`,
      k: woerter[0][1]
    })
  // Schwierige Blattaufgaben, die mehrere hatten
  const blatt = new Map<string, number>()
  for (const l of kinder.values()) for (const b of new Set(l.flatMap((c) => c.blattSchwierig))) blatt.set(b, (blatt.get(b) ?? 0) + 1)
  for (const [b, k] of [...blatt.entries()].sort((a, b) => b[1] - a[1])) if (k >= schwelleKinder(n)) unsicher.push({ text: `${b} (${k} von ${n})`, k })

  const da = new Set<string>()
  t.sicher = eindeutig(sicher, MAX_ZEILEN, da)
  t.unsicher = eindeutig(
    unsicher.sort((a, b) => b.k - a.k).map((u) => u.text),
    MAX_ZEILEN,
    da
  )
  t.fehler = eindeutig([...kurse.flatMap((k) => k.grammatik.flatMap((g) => g.fehler)), ...kurse.flatMap((k) => k.testSchwerpunkte)], MAX_ZEILEN)
  // Fremde Kurse: ohne Kinderdaten (unter der Mindestzahl) nur die Themen – das prüft schon der Server; hier zur Sicherheit
  if (fremd && n < MIN_GEMEINSAM) return { ...leer(), behandelt: t.behandelt }
  return t
}

/** Leistungsspanne aus den Kindern des eigenen Kurses (+ fremde Kurse für dieselben Kinder) */
export function spanneAus(eigen: KursDaten, andere: KursDaten[]): string {
  const n = eigen.kinder.length
  if (n < 2) return ''
  let schwach = 0
  let stark = 0
  let mitDaten = 0
  for (const c of eigen.kinder) {
    const fremd = andere.flatMap((k) => k.kinder.filter((x) => x.id === c.id))
    const grammatik = [...c.grammatik, ...fremd.flatMap((x) => x.grammatik)]
    const vok = c.vokSicher
    if (vok === null && !grammatik.length && !c.bedarf.length && !c.blattSchwierig.length) continue
    mitDaten++
    const schwaechen = grammatik.filter((g) => g.ampel === 'schwaeche').length
    // Wenig sichere Vokabeln allein sind keine Schwäche (neue Wörter sind noch nicht gelernt) – dafür gibt es die
    // Kurs-Hinweise „schwach"/„foerdern", die Übungsstand und Fehler einrechnen
    if (c.bedarf.includes('schwach') || c.bedarf.includes('foerdern') || schwaechen >= 2) schwach++
    else if (
      (vok === null || vok >= 0.85) &&
      grammatik.length > 0 &&
      schwaechen === 0 &&
      grammatik.filter((g) => g.ampel === 'sicher').length / grammatik.length >= 0.8
    )
      stark++
    else if (vok !== null && vok >= 0.9 && !grammatik.length && !c.bedarf.length) stark++
  }
  if (mitDaten < 2 || (!schwach && !stark)) return ''
  return [
    schwach ? `etwa ${schwach} von ${n} brauchen mehr Unterstützung (gestufte Hilfen, Förderaufgaben)` : '',
    stark ? `${stark} von ${n} sind schon sehr sicher (Zusatz- und Forderaufgaben)` : ''
  ]
    .filter(Boolean)
    .join('; ')
}

/** Eigener Kurs und fremde Kurse (schon auf gemeinsame Lernende beschränkt) zusammenfassen */
export function vorwissenAus(eigen: KursDaten, andere: KursDaten[]): VorwissenLerngruppe {
  const fremd = andere.filter((k) => k.kinder.length >= MIN_GEMEINSAM)
  const hier = teilAus([eigen], false)
  const anders = teilAus(fremd, true)
  // Was der eigene Kurs schon sagt, nicht noch einmal unter „andere"
  const da = new Set([...hier.behandelt, ...hier.sicher, ...hier.unsicher, ...hier.fehler].map(norm))
  const ohne = (l: string[]): string[] => l.filter((x) => !da.has(norm(x)))
  return {
    lernende: eigen.kinder.length,
    hier,
    andere: { behandelt: ohne(anders.behandelt), sicher: ohne(anders.sicher), unsicher: ohne(anders.unsicher), fehler: ohne(anders.fehler) },
    spanne: spanneAus(eigen, fremd),
    andereKurse: fremd.length
  }
}

const teilZeilen = (t: VorwissenTeil): string[] => [
  ...t.behandelt.map((x) => `Behandelt: ${x}`),
  ...t.sicher.map((x) => `Sicher: ${x}`),
  ...t.unsicher.map((x) => `Unsicher: ${x}`),
  ...t.fehler.map((x) => `Häufiger Fehler: ${x}`)
]

export const UEBERSCHRIFT_HIER = 'Aus diesem Kurs:'
export const UEBERSCHRIFT_CURRICULUM = 'Laut schulinternem Curriculum:'
export const UEBERSCHRIFT_ANDERE = 'Aus anderen Kursen:'

/** Text für das Feld „Vorwissen der Lerngruppe" (die Lehrkraft kann alles ändern oder löschen) */
export function vorwissenText(v: VorwissenLerngruppe): string {
  const hier = teilZeilen(v.hier)
  const andere = teilZeilen(v.andere)
  return [
    ...(hier.length ? [UEBERSCHRIFT_HIER, ...hier] : []),
    ...(andere.length ? [...(hier.length ? [''] : []), UEBERSCHRIFT_ANDERE, ...andere] : []),
    ...((c) => (c.length ? [...(hier.length || andere.length ? [''] : []), UEBERSCHRIFT_CURRICULUM, ...c] : []))([
      ...(v.curriculum?.frueher ?? []).map((x) => `Behandelt: ${x}`),
      ...(v.curriculum?.spaeter ?? []).map((x) => `Noch nicht behandelt: ${x}`)
    ]),
    ...(v.spanne ? ['', `Leistungsspanne: ${v.spanne}`] : [])
  ].join('\n')
}

/** Die gewählte Lerngruppe an Blatt bzw. Reihe: Kennung, Name und der zuletzt übernommene Text (zum Ersetzen) */
export interface LerngruppeBezug {
  id: string
  name: string
  text?: string
}

/** Antwort von GET /server/vorwissen?gruppe=<ID> (server/vorwissen.ts) */
export interface VorwissenAntwort {
  gruppe: { id: string; name: string; fach: string }
  jahrgang: number | null
  lernende: number
  /** Lehrwerk-Stand der Lerngruppe (von Hand oder aus den Vokabeln) */
  lehrwerk: { buch: string; unit: string } | null
  /** Freigegebene Wörter der laufenden Kurse, die zuletzt freigegebenen zuerst (gekürzt) */
  woerter: string[]
  wortZahl: number
  vorwissen: VorwissenLerngruppe
  text: string
}

/**
 * Vorwissen für ein Förder- bzw. Forderblatt (13.10.2026): Das Blatt ist für EIN Niveau – die Leistungsspanne fällt weg;
 * beim Förderblatt gilt „sicher" der Klasse nicht für diese Gruppe, beim Forderblatt nicht deren „unsicher".
 */
export function vorwissenFuerGruppe(text: string, art: 'foerder' | 'forder'): string {
  const weg = art === 'foerder' ? /^(?:leistungsspanne|sicher)\s*:/i : /^(?:leistungsspanne|unsicher)\s*:/i
  const zeilen = (text ?? '').split('\n').filter((z) => !weg.test(z.trim().replace(/^[-•*]\s*/, '')))
  // Überschriften ohne Inhalt darunter entfernen
  const aus: string[] = []
  for (const [i, z] of zeilen.entries()) {
    const istKopf = (x: string): boolean => /^(?:aus (?:diesem kurs|anderen kursen)|laut schulinternem curriculum)\s*:?$/i.test(x.trim())
    const naechste = zeilen.slice(i + 1).find((x) => x.trim())
    if (istKopf(z) && (!naechste || istKopf(naechste))) continue
    aus.push(z)
  }
  return aus
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Ist der Text leer (keine Daten)? */
export const vorwissenLeer = (v: VorwissenLerngruppe): boolean => !vorwissenText(v).trim()

/**
 * Hinweis zur Datenverarbeitung (13.10.2026, Wunsch der Lehrkraft: „Hinweis in der App ergänzen") – Entwurf zum Abstimmen
 * mit der Schule (Datenschutzbeauftragte, Verzeichnis der Verarbeitungstätigkeiten). Steht im Reiter „Server" der
 * Verwaltung zum Kopieren.
 */
export const VORWISSEN_HINWEIS = [
  'Vorwissen der Lerngruppe (Schul-Apps, seit Oktober 2026)',
  '',
  'Wenn eine Lehrkraft für eine ihrer Lerngruppen eine Unterrichtsreihe, ein Arbeitsblatt oder Förder- und Fordermaterial erstellt, fassen die Schul-Apps zusammen, was zu den Lernenden dieser Lerngruppe vorliegt – aus dem eigenen Kurs und aus anderen Kursen der Schule, auch anderer Lehrkräfte und früherer Schuljahre.',
  '',
  'Zweck: Unterrichtsplanung und Differenzierung (an Vorwissen anknüpfen, Unsicheres wiederholen, häufigen Fehlern vorbeugen, Hilfen und Zusatzaufgaben passend planen).',
  'Rechtsgrundlage: von der Schule festzulegen (Schulgesetz des Landes i. V. m. Art. 6 Abs. 1 lit. e DSGVO) – bitte mit der bzw. dem Datenschutzbeauftragten abstimmen.',
  '',
  'Was zusammengefasst wird: behandelte Themen, Reihen und Grammatik, Lehrwerk-Stand, sicher Beherrschtes, Unsicherheiten und häufige Fehler. Schwächen Einzelner erscheinen nur als Anzahl („6 von 24“), ohne Namen und ohne Kürzel.',
  'Aus Kursen anderer Lehrkräfte: nur Themen und Fehlerschwerpunkte, keine Noten und keine Testschnitte. Ein anderer Kurs fließt nur ein, wenn mindestens drei Lernende in beiden Kursen sind. Die Herkunft (Fach, Schuljahr, Lehrkraft) wird nicht angezeigt.',
  '',
  'Wer es sieht: nur die Lehrkraft der Lerngruppe beim Erstellen. Sie kann alles ändern oder löschen, bevor etwas erzeugt wird. Lernende sehen es nicht.',
  'KI: An die KI geht nur dieser zusammengefasste Text (ohne Namen) als Teil des Auftrags.',
  'Speicherung: Die Zusammenfassung wird beim Erstellen jeweils neu berechnet; gespeichert wird nur, was im Vorwissensfeld des erstellten Materials steht – zusammen mit diesem Material.'
].join('\n')
