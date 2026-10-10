/**
 * Schuljahreswechsel – reine Regeln (10.10.2026, abgestimmt mit der Lehrkraft; Ablauf am Server in
 * src/server/schuljahrWechsel.ts).
 *
 * Am ersten Schultag des neuen Schuljahres rücken die Klassen auf: „5b" → „6b", „Klasse 10a" → „Klasse 11a",
 * Oberstufe „E"/„EF"/„E-Phase" → „Q1", „Q1" → „Q2". Wichtigstes Ziel ist, dass der LERNSTAND mitgeht: Bei Klassen ohne
 * IServ bleibt die Lerngruppe dieselbe (nur Name und Jahrgang ändern sich), Kurse und Lernstände hängen an ihr.
 *
 * Abschlussjahrgang (höchster Jahrgang der Schulformen der Schule, shared/schulformen.ts – Gymnasium und IGS in
 * Niedersachsen 13, Real-/Ober-/Hauptschule 10; „Q2" immer): kein Umbenennen, die Kurse werden beendet (Daten bleiben
 * zum Ansehen).
 *
 * IServ-Gruppen: Den Namen verwaltet IServ. Zum neuen Schuljahr benennt IServ Gruppen um (gleiche Kennung) oder legt
 * neue an (neue Kennung). `nachfolgerFinden` sucht die Nachfolgegruppe über die Mitglieder: dieselbe Gruppe mit neuem
 * Namen, sonst die Gruppe des nächsten Jahrgangs, in der mindestens 60 % der bisherigen Lernenden stecken (bei gleichem
 * Buchstaben bevorzugt). Entschieden wird erst, wenn genug Lernende schon die neuen IServ-Gruppen mitbringen (sie kommen
 * bei der Anmeldung über IServ) – bis dahin wartet die Gruppe. Wer die Klasse gewechselt hat oder wiederholt, behält
 * den eigenen Lernstand; er zieht in den Kurs der neuen Klasse um, sobald es dort einen passenden Kurs gibt.
 */

/** Anteil der bisherigen Lernenden, der in der Nachfolgegruppe stecken muss */
export const NACHFOLGE_ANTEIL = 0.6
/** So viele der bisherigen Lernenden müssen schon neue IServ-Gruppen haben, bevor entschieden wird */
export const AKTUELL_ANTEIL = 0.4
/** Rückgängig machen geht so lange */
export const RUECKGAENGIG_TAGE = 14
/** So lange wird nach Nachfolgegruppen und neuen Kursen für Wechsler gesucht */
export const NACHSUCHE_TAGE = 60

export type Hochstufung = { art: 'hoch'; neu: string; jahrgang: number } | { art: 'abschluss'; jahrgang: number }

const OBERSTUFE_E = /^(einführungsphase|e-phase|ef|ep|e)(?![\p{L}\p{N}])/iu
const OBERSTUFE_Q = /^(q)\s?([12])(?![\p{N}])/iu
const ZAHL = /^(klasse\s+|jahrgang\s+|jg\.?\s*)?(\d{1,2})(?![\d])/iu

/**
 * Jahrgang am Anfang eines Gruppennamens: „5b" → 5, „Klasse 10a" → 10, „Q1" → 12, „Q2 Englisch" → 13, „EF" → 11;
 * sonst null (Namen, die nicht mit dem Jahrgang beginnen, rücken nicht auf).
 */
export function jahrgangAmAnfang(name: string): number | null {
  const t = name.trim()
  const q = OBERSTUFE_Q.exec(t)
  if (q) return q[2] === '1' ? 12 : 13
  if (OBERSTUFE_E.test(t)) return 11
  const m = ZAHL.exec(t)
  const n = m ? Number(m[2]) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 13 ? n : null
}

/** Buchstabe/Zusatz nach dem Jahrgang („5b" → „b", „10 a" → „a", „Q1" → „") – zum Vergleich der Nachfolgegruppe */
export function klassenZusatz(name: string): string {
  const t = name.trim()
  const q = OBERSTUFE_Q.exec(t) ?? OBERSTUFE_E.exec(t) ?? ZAHL.exec(t)
  return q ? t.slice(q[0].length).trim().toLowerCase() : ''
}

/**
 * Name im nächsten Schuljahr. `abschluss` = höchster Jahrgang der Schule (siehe oben). null = Name beginnt nicht mit
 * einem Jahrgang (bleibt unverändert).
 */
export function klasseHochstufen(name: string, abschluss: number): Hochstufung | null {
  const t = name.trim()
  const q = OBERSTUFE_Q.exec(t)
  if (q) {
    if (q[2] === '2') return { art: 'abschluss', jahrgang: 13 }
    const anfang = name.slice(0, name.indexOf(q[0]))
    return { art: 'hoch', neu: `${anfang}${q[1]}${q[0].includes(' ') ? ' ' : ''}2${t.slice(q[0].length)}`, jahrgang: 13 }
  }
  const e = OBERSTUFE_E.exec(t)
  if (e) {
    const gross = e[1] === e[1].toUpperCase() || e[1].length > 2
    return { art: 'hoch', neu: `${gross ? 'Q' : 'q'}1${t.slice(e[0].length)}`, jahrgang: 12 }
  }
  const m = ZAHL.exec(t)
  if (!m) return null
  const j = Number(m[2])
  if (!Number.isInteger(j) || j < 1 || j > 13) return null
  if (j >= abschluss) return { art: 'abschluss', jahrgang: j }
  return { art: 'hoch', neu: `${m[1] ?? ''}${j + 1}${t.slice(m[0].length)}`, jahrgang: j + 1 }
}

const maskiert = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Klassennamen in einem Titel ersetzen („Englisch 5b" → „Englisch 6b"); nur als ganzes Wort, Groß/klein egal */
export function titelUmbenennen(titel: string, alt: string, neu: string): string {
  const a = alt.trim()
  if (!a || !titel) return titel
  return titel.replace(new RegExp(`(?<![\\p{L}\\p{N}])${maskiert(a)}(?![\\p{L}\\p{N}])`, 'giu'), neu.trim())
}

/** Höchster Jahrgang der Schule aus den Spannen ihrer Schulformen (ohne Angabe: 13) */
export function abschlussJahrgang(spannen: { bis: number }[]): number {
  const b = spannen.map((s) => s.bis).filter((x) => Number.isInteger(x) && x >= 4 && x <= 13)
  return b.length ? Math.max(...b) : 13
}

// ---------------------------------------------------------------- IServ: Nachfolgegruppe über die Mitglieder

export interface PersonGruppen {
  id: string
  gruppen: { id: string; name: string }[]
}

export interface Nachfolge {
  art: 'gleich' | 'neu' | 'warten' | 'unklar'
  /** Nachfolgegruppe (bei „gleich" dieselbe Kennung mit neuem Namen) */
  gruppe?: { id: string; name: string }
  /** Anteil der bisherigen Lernenden in der Nachfolgegruppe (0–1) */
  anteil: number
  /** In eine andere Klasse des neuen Jahrgangs gewechselt */
  wechsler: { id: string; gruppe: { id: string; name: string } }[]
  /** Im bisherigen Jahrgang geblieben (Wiederholung) */
  wiederholer: { id: string; gruppe: { id: string; name: string } }[]
}

/**
 * Andere Gruppenart für die Nachfolge (10.10.2026, Kurse aus IServ, shared/iservKurse.ts `kursNachfolgeRegeln`): Jahrgang
 * und Zusatz einer Gruppe nach ihren Regeln; nur Gruppen mit Jahrgang zählen.
 */
export interface NachfolgeRegeln {
  alt: number
  ziel: number
  jahrgang: (name: string) => number | null
  zusatz: (name: string) => string
}

/**
 * Nachfolgegruppe einer IServ-Gruppe. `alt`: Kennung, Name und Mitglieder (Kennungen) beim Wechsel; `personen`: die
 * heutigen Gruppen derselben Personen (aus ihrer letzten IServ-Anmeldung). Ohne `regeln` zählen nur Klassengruppen:
 * Namen, die mit einem Jahrgang beginnen; mit `regeln` (Kurse) die Gruppen, denen die Regeln einen Jahrgang geben.
 */
export function nachfolgerFinden(
  alt: { id: string; name: string; mitglieder: string[] },
  personen: PersonGruppen[],
  abschluss: number,
  regeln?: NachfolgeRegeln
): Nachfolge {
  const leer: Nachfolge = { art: 'unklar', anteil: 0, wechsler: [], wiederholer: [] }
  const jahrgangVon = regeln ? regeln.jahrgang : jahrgangAmAnfang
  const zusatzVon = regeln ? regeln.zusatz : klassenZusatz
  const ziel: Hochstufung | null = regeln
    ? regeln.alt >= abschluss
      ? { art: 'abschluss', jahrgang: regeln.alt }
      : { art: 'hoch', neu: '', jahrgang: regeln.ziel }
    : klasseHochstufen(alt.name, abschluss)
  const altJahrgang = regeln ? regeln.alt : jahrgangAmAnfang(alt.name)
  if (!ziel || ziel.art !== 'hoch' || !altJahrgang) return leer
  const mitglieder = new Set(alt.mitglieder)
  const heute = personen.filter((p) => mitglieder.has(p.id))
  if (!heute.length) return { ...leer, art: 'warten' }
  const klassen = (p: PersonGruppen): { id: string; name: string; j: number }[] =>
    p.gruppen.flatMap((g) => {
      const j = jahrgangVon(g.name)
      return j ? [{ ...g, j }] : []
    })
  // Schon umgestellt: hat eine Klassengruppe des neuen Jahrgangs oder steckt nicht mehr in der alten Gruppe
  const aktuell = heute.filter((p) => klassen(p).some((g) => g.j === ziel.jahrgang) || !p.gruppen.some((g) => g.id === alt.id))
  // Gleiche Kennung, neuer Name (IServ hat umbenannt)
  const umbenannt = aktuell.flatMap((p) => p.gruppen.filter((g) => g.id === alt.id && jahrgangVon(g.name) === ziel.jahrgang))[0]
  const noetig = Math.max(Math.min(2, mitglieder.size), Math.ceil(mitglieder.size * AKTUELL_ANTEIL))
  if (!umbenannt && aktuell.length < noetig) return { ...leer, art: 'warten' }
  const zaehler = new Map<string, { id: string; name: string; n: number }>()
  for (const p of aktuell)
    for (const g of klassen(p))
      if (g.j === ziel.jahrgang) {
        const z = zaehler.get(g.id) ?? { id: g.id, name: g.name, n: 0 }
        z.n++
        zaehler.set(g.id, z)
      }
  const zusatz = zusatzVon(alt.name)
  const kandidaten = [...zaehler.values()].sort((a, b) => b.n - a.n || Number(zusatzVon(b.name) === zusatz) - Number(zusatzVon(a.name) === zusatz))
  const basis = Math.max(1, aktuell.length)
  let wahl: { id: string; name: string; n: number } | undefined
  if (umbenannt) wahl = zaehler.get(alt.id) ?? { ...umbenannt, n: 0 }
  else {
    const gleicherBuchstabe = kandidaten.find((k) => zusatzVon(k.name) === zusatz && k.n / basis >= NACHFOLGE_ANTEIL)
    wahl = gleicherBuchstabe ?? kandidaten.find((k) => k.n / basis >= NACHFOLGE_ANTEIL)
  }
  if (!wahl) return { ...leer, art: 'unklar', anteil: (kandidaten[0]?.n ?? 0) / basis }
  const gruppe = { id: wahl.id, name: umbenannt && wahl.id === alt.id ? umbenannt.name : wahl.name }
  const wechsler: Nachfolge['wechsler'] = []
  const wiederholer: Nachfolge['wiederholer'] = []
  for (const p of aktuell) {
    if (p.gruppen.some((g) => g.id === gruppe.id && (g.id !== alt.id || jahrgangVon(g.name) === ziel.jahrgang))) continue
    const k = klassen(p)
    const neu = k.find((g) => g.j === ziel.jahrgang)
    if (neu) {
      wechsler.push({ id: p.id, gruppe: { id: neu.id, name: neu.name } })
      continue
    }
    const gleich = k.find((g) => g.j === altJahrgang)
    if (gleich) wiederholer.push({ id: p.id, gruppe: { id: gleich.id, name: gleich.name } })
  }
  return { art: wahl.id === alt.id ? 'gleich' : 'neu', gruppe, anteil: wahl.n / basis, wechsler, wiederholer }
}

// ---------------------------------------------------------------- Lernstand zusammenführen (Wechsler, Wiederholer)

export interface EintragStand {
  fach: number
  versuche: number
  zuletzt: number
}

/**
 * Lernstand einer Person aus einem alten Kurs in einen neuen übernehmen. Einträge (Wörter bzw. Grammatikaufgaben) werden
 * über einen Schlüssel einander zugeordnet (Wort + Übersetzung, Aufgabe + Satz); übernommen wird der alte Eintrag, wo der
 * neue fehlt oder weniger weit ist. Übungstage (`tage`) werden vereinigt, damit die Serie bleibt.
 */
export function standZusammenfuehren<T extends Partial<EintragStand>>(
  alt: { eintraege: Record<string, T>; tage: string[] },
  neu: { eintraege: Record<string, T>; tage: string[] },
  zuordnung: Map<string, string>
): { eintraege: Record<string, T>; tage: string[]; uebernommen: number } {
  const eintraege = { ...neu.eintraege }
  let uebernommen = 0
  for (const [altId, s] of Object.entries(alt.eintraege)) {
    const neuId = zuordnung.get(altId)
    if (!neuId) continue
    const da = eintraege[neuId]
    const weiter = (x: Partial<EintragStand> | undefined): number => (x?.fach ?? 0) * 1000 + (x?.versuche ?? 0)
    if (!da || weiter(s) > weiter(da)) {
      eintraege[neuId] = s
      uebernommen++
    }
  }
  const tage = [...new Set([...alt.tage, ...neu.tage])].sort().slice(-400)
  return { eintraege, tage, uebernommen }
}

/** Schlüssel zum Zuordnen: Kleinbuchstaben, ohne Satzzeichen und doppelte Leerzeichen */
export const vergleichsSchluessel = (...teile: (string | undefined)[]): string =>
  teile
    .map((t) =>
      String(t ?? '')
        .toLowerCase()
        .normalize('NFC')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
    )
    .join('|')

/** Zuordnung alter → neuer Kennungen über den Schlüssel */
export function zuordnungUeber<T>(alt: T[], neu: T[], id: (x: T) => string, schluessel: (x: T) => string): Map<string, string> {
  const nachSchluessel = new Map<string, string>()
  for (const x of neu) {
    const k = schluessel(x)
    if (k && !nachSchluessel.has(k)) nachSchluessel.set(k, id(x))
  }
  const aus = new Map<string, string>()
  for (const x of alt) {
    const ziel = nachSchluessel.get(schluessel(x))
    if (ziel) aus.set(id(x), ziel)
  }
  return aus
}
