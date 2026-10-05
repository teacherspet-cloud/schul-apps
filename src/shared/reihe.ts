/**
 * Unterrichtsreihe (Etappe 6, 02.10.2026) – Datenmodell und Regeln, gemeinsam für Lehrkraft-App,
 * Schüleransicht und Server.
 *
 * Abgestimmt mit der Lehrkraft (Vorbilder: Moodle-Abschlussbedingungen, Khan/bettermarks „Weiter,
 * wenn man es kann", ANTON-Lernpfad, H5P-Verzweigung):
 *  - Eine Reihe ist eine VORLAGE zu einem Oberthema des Fachs, mit übergeordneten Lernzielen
 *    (Kerncurriculum des Landes; auswählen oder von der KI vorschlagen lassen). Sie wird Lerngruppen
 *    oder einzelnen Lernenden ZUGEWIESEN; der Fortschritt hängt an der Zuweisung.
 *  - Jeder Schritt hat eigene Lernziele (Lernende sehen sie als „Ich kann …").
 *  - Erfolg je Schritt wählbar: KI-Rückmeldung (alle Kriterien mindestens „teilweise" bzw. „sicher"),
 *    Lehrkraft bestätigt, Mindestpunkte, abgegeben genügt. Die Lehrkraft kann immer von Hand freischalten.
 *  - Nicht geschafft: überarbeiten (Runden des Blattes/der Aufgabe), danach Förderschritt – gibt es
 *    keinen, „braucht Hilfe" bei der Lehrkraft. Ein geschaffter Förderschritt öffnet den Weg weiter.
 *  - Eigenes Tempo + Haltepunkte (nach gemeinsamer Besprechung bzw. ab Datum).
 *  - Wahlschritte („wähle 2 von 3"), Forderschritte (★, freiwillig), Abschnitte mit Abzeichen,
 *    Eingangsdiagnose (wer es schon kann, überspringt), Wissensspeicher (Hefter).
 *  - KEINE Ranglisten, kein Vergleich mit anderen.
 */

export type SchrittArt =
  | 'arbeitsblatt'
  | 'rueckmeldung'
  | 'onlinetest'
  | 'aufgabe'
  | 'lernkarten'
  | 'reflexion'
  | 'praesenz'
  | 'diagnose'
  | 'hefter'
  | 'abschluss'
  | 'sprechen'
  | 'vokabeln'

export const SCHRITT_ARTEN: { id: SchrittArt; label: string; text: string }[] = [
  { id: 'arbeitsblatt', label: 'Arbeitsblatt', text: 'Ein fertiges Arbeitsblatt ausfüllen – mit KI-Feedback je Aufgabe und nach dem Einreichen.' },
  {
    id: 'vokabeln',
    label: 'Vokabeln lernen',
    text: 'Vokabeln aus dem Lehrwerk oder einer Liste im Karteikasten der Lern-App – geschafft, wenn genug Wörter eingeübt sind.'
  },
  { id: 'onlinetest', label: 'Test (Onlinetest)', text: 'Vokabeltest als Onlinetest im eigenen Tempo, Ergebnis sofort.' },
  { id: 'rueckmeldung', label: 'Schreibaufgabe mit Feedback', text: 'Aufgabe aus der Rückmeldungs-App: schreiben, Feedback, überarbeiten.' },
  { id: 'aufgabe', label: 'Zwischenaufgabe', text: 'Kurzer Auftrag mit Antwortfeld oder Foto, auch zu einem Lese-/Hörtext oder Video mit Kontrollfragen.' },
  { id: 'lernkarten', label: 'Lernkarten', text: 'Begriffe oder Vokabeln wiederholen, bis alle sitzen.' },
  { id: 'reflexion', label: 'Selbsteinschätzung', text: 'Ich-kann-Ampel zu den Lernzielen, dazu eine Frage fürs Lerntagebuch.' },
  { id: 'diagnose', label: 'Eingangsdiagnose', text: 'Kurzer Vortest – wer es schon kann, überspringt die gewählten Schritte.' },
  { id: 'praesenz', label: 'Im Unterricht', text: 'Etwas im Unterricht (Experiment, Vortrag …) – die Lehrkraft hakt ab.' },
  { id: 'hefter', label: 'Wissensspeicher', text: 'Merkkasten, Tafelbild oder Lösung – erscheint im Hefter, sobald freigeschaltet.' },
  { id: 'abschluss', label: 'Abschlussprodukt', text: 'Lernprodukt (Plakat, Text, Video …) als Datei oder Foto, mit Bewertungsraster.' },
  { id: 'sprechen', label: 'Sprechaufgabe', text: 'Sprachaufnahme zu einem Auftrag – die Lehrkraft hört und bewertet.' }
]

export interface Lernziel {
  /** Fassung für die Lehrkraft (Kompetenz, Kerncurriculum) */
  text: string
  /** Fassung für die Lernenden („Ich kann …") */
  ichKann: string
  /** Herkunft, z. B. „Kerncurriculum NI Englisch, S. 22" */
  quelle?: string
}

export type Erfolg = { art: 'ki'; schwelle: 'teilweise' | 'sicher' } | { art: 'lehrkraft' } | { art: 'punkte'; prozent: number } | { art: 'abgabe' }

export type Halt = { art: 'freigabe' } | { art: 'datum'; ab: string }

export interface DiagnoseFrage {
  frage: string
  /** Auswahl; leer = kurze Antwort */
  optionen: string[]
  /** richtige Antwort (Text der Option bzw. Wortlaut; mehrere mit „/" getrennt) – bleibt auf dem Server */
  richtig: string
}

export type SchrittInhalt =
  | {
      art: 'arbeitsblatt'
      quelle: string
      titel: string
      html: string
      aufgaben: { nr: number; anweisung: string; erwartung: string }[]
      vorlage: unknown
      runden: number
      stift: boolean
      /** Aufgaben schrittweise freischalten / Merkkästen erst am Ende (05.10.2026, shared/blattFreigabe.ts) */
      schrittweise?: boolean
      merkAmEnde?: boolean
      /** Lösungsblatt – sehen die Lernenden erst nach dem ersten Einreichen (03.10.2026) */
      loesung?: string
      /**
       * Auswahl für diesen Schritt (05.10.2026): Bausteine/Teilaufgaben (Schlüssel `blockId` bzw.
       * `blockId/teilId`) freiwillig oder ausgeblendet – das Original bleibt unverändert.
       */
      auswahl?: Record<string, 'frei' | 'aus'>
      /** Korrekturrand für das KI-Feedback (05.10.2026) – Vorgabe an; `false` = aus */
      korrekturrand?: boolean
      /** Vorschlag der KI zur Auswahl – erst nach Bestätigung durch die Lehrkraft wirksam */
      auswahlVorschlag?: { auswahl: Record<string, 'frei' | 'aus'>; gruende: Record<string, string>; minuten: number; hinweis: string }
      merk?: { titel: string; text: string }[]
      /** Niveaustufen (Basis/Standard/Plus …): die Blätter eines differenzierten Arbeitsblatts */
      varianten?: {
        label: string
        html: string
        aufgaben: { nr: number; anweisung: string; erwartung: string }[]
        vorlage: unknown
        loesung?: string
        merk?: { titel: string; text: string }[]
      }[]
    }
  | { art: 'rueckmeldung'; vorlage: unknown; runden: number }
  | { art: 'onlinetest'; test: unknown; zeitMin: number }
  | {
      art: 'aufgabe'
      anweisung: string
      material: string
      link: string
      fragen: string[]
      antwort: 'text' | 'foto' | 'beides'
      erwartung: string
      feedback: boolean
      /** Musterlösung – sehen die Lernenden nach dem Abgeben (03.10.2026) */
      musterloesung?: string
    }
  | { art: 'lernkarten'; karten: { vorne: string; hinten: string }[] }
  | { art: 'reflexion'; frage: string }
  | { art: 'praesenz'; anweisung: string }
  | {
      art: 'diagnose'
      fragen: DiagnoseFrage[]
      schwelle: number
      ueberspringen: string[]
      /** Erneut möglich nach … Minuten (0 = nur einmal) – gegen Durchprobieren */
      wiederholbarNachMin?: number
    }
  | { art: 'hefter'; text: string }
  | { art: 'abschluss'; anweisung: string; raster: string[] }
  | { art: 'sprechen'; anweisung: string; minuten: number }
  | { art: 'vokabeln'; titel: string; sprache: string; fach: string; woerter: unknown[] }

export interface Schritt {
  id: string
  titel: string
  lernziele: Lernziel[]
  /** pflicht: muss geschafft werden; wahl: aus einer Wahlgruppe; foerder: öffnet sich bei Bedarf; forder: freiwillig (★) */
  rolle: 'pflicht' | 'wahl' | 'foerder' | 'forder'
  /** Wahl: Kennung der Gruppe und wie viele daraus nötig sind */
  wahlGruppe?: string
  wahlMindestens?: number
  /** Förderschritt für diesen Schritt */
  foerderFuer?: string
  /** Abschnitt (Abzeichen, wenn alle Pflichtschritte des Abschnitts geschafft sind) */
  abschnitt?: string
  /** Haltepunkt VOR diesem Schritt */
  halt?: Halt
  erfolg: Erfolg
  /** Wissensspeicher: erst nach diesem Schritt sichtbar (leer = sobald der Weg dort ist) */
  nach?: string
  inhalt: SchrittInhalt
  /** Stunde der Reihe (0-basiert, siehe `Reihe.stunden`), in der der Schritt liegt (05.10.2026) */
  stunde?: number
  /** Geplante Bearbeitungszeit in Minuten (KI-Planung) – Maßstab für die Auswahl der Aufgaben */
  minuten?: number
  /**
   * Platzhalter aus der KI-Planung (05.10.2026): Was hier entstehen soll – erzeugt per Knopf
   * „Mit KI erstellen"; danach entfällt die Marke.
   */
  platzhalter?: { beschreibung: string; begruendung?: string }
  /** Begründung der KI, warum vorhandenes Material an dieser Stelle steht */
  begruendung?: string
}

export type StundenArt = 'einzel' | 'doppel'
export const STUNDEN_MINUTEN: Record<StundenArt, number> = { einzel: 45, doppel: 90 }

export interface Reihe {
  id: string
  titel: string
  fachId: string
  fachLabel: string
  stateId: string
  schoolTypeId: string
  grade: number
  /** Oberthema (Themenbereich/Kerncurriculum) */
  oberthema: string
  lernziele: Lernziel[]
  schritte: Schritt[]
  /**
   * Teile der Reihe in ihrer Reihenfolge (03.10.2026: von Hand anlegen, umbenennen, verschieben –
   * auch leer). Ein Schritt gehört über `abschnitt` (Name des Teils) dazu; Schritte ohne Teil stehen vorn.
   */
  teile?: string[]
  geaendert?: string
  /** Stundenraster (05.10.2026): Einzel- (45 min) und Doppelstunden in ihrer Reihenfolge */
  stunden?: StundenArt[]
}

/** Teile der Reihe: die angelegten, dazu die nur an Schritten genannten */
export const teileVon = (r: Pick<Reihe, 'teile' | 'schritte'>): string[] => [
  ...new Set([...(r.teile ?? []), ...r.schritte.map((s) => s.abschnitt).filter((a): a is string => Boolean(a))])
]

/** Schritte in die Reihenfolge der Teile bringen (ohne Teil zuerst, innerhalb eines Teils wie bisher) */
export function ordneNachTeilen(schritte: Schritt[], teile: string[]): Schritt[] {
  return [...schritte.filter((s) => !s.abschnitt || !teile.includes(s.abschnitt)), ...teile.flatMap((t) => schritte.filter((s) => s.abschnitt === t))]
}

/** Stand einer Person je Schritt – was der Server speichert (verschlüsselt) */
export interface SchrittStand {
  /** Von Hand gesetzt: 'geschafft' | 'offen' (freigeschaltet) | 'zurueck' (zurückgesetzt) */
  hand?: 'geschafft' | 'offen' | 'zurueck'
  eingereicht?: number
  antworten?: Record<string, string>
  dateien?: { id: string; name: string; typ: string }[]
  ki?: { einschaetzungen: string[]; zeit: number }
  bewertung?: { text: string; geschafft: boolean; zeit: number }
  ampel?: Record<string, 'gruen' | 'gelb' | 'rot'>
  tagebuch?: string
  gewusst?: boolean
  diagnose?: { prozent: number; zeit: number }
  praesenz?: boolean
  zeit?: number
  /**
   * Zur Überarbeitung zurückgeschickt (03.10.2026, Idee aus LearningView): Der Schritt ist wieder offen,
   * bis neu eingereicht wird (`bei` = Zahl der Einreichungen zu diesem Zeitpunkt). Der Kommentar steht beim Schritt.
   */
  ueberarbeiten?: { text: string; zeit: number; bei: number }
  /** Gewählte Niveaustufe (Index der Variante), z. B. 0 = Basis */
  niveau?: number
}

/** Frage einer/eines Lernenden an einen Schritt („Haftnotiz") und die Antwort der Lehrkraft */
export interface Frage {
  schritt: string
  text: string
  zeit: number
  antwort?: string
  antwortZeit?: number
}

export interface Stand {
  schritte: Record<string, SchrittStand>
  hilfe?: { zeit: number; schritt?: string; text?: string } | null
  fragen?: Frage[]
  /** Einschätzung der Lehrkraft je Lernziel (Zählung wie `alleLernziele`) – neben der Ich-kann-Ampel */
  lehrkraftAmpel?: Record<string, 'gruen' | 'gelb' | 'rot'>
}

/** Stand verknüpfter Aufgaben (Arbeitsblatt, Rückmeldung, Onlinetest) – vom Server ermittelt */
export interface Extern {
  eingereicht: number
  /** höchstens so oft einreichbar */
  runden: number
  /** Einschätzungen der Kriterien im letzten KI-Bogen */
  kriterien?: string[]
  /** Onlinetest: erreichte Prozent (nach Freigabe) */
  prozent?: number
}

export type Status = 'gesperrt' | 'offen' | 'eingereicht' | 'geschafft' | 'nicht_geschafft' | 'uebersprungen'

export interface SchrittLage {
  id: string
  status: Status
  /** Warum gesperrt bzw. was fehlt – für die Lernenden */
  hinweis?: string
  /** Wartet auf die Lehrkraft (Bestätigung, Bewertung, Abhaken) */
  wartet?: boolean
}

export interface Weg {
  schritte: SchrittLage[]
  /** Fortschritt der Pflicht- und Wahlschritte (0–1) */
  fortschritt: number
  abzeichen: string[]
  fertig: boolean
}

const RANG: Record<string, number> = { 'noch nicht': 0, teilweise: 1, sicher: 2 }

/** Ist der Schritt (ohne Reihenfolge) geschafft, eingereicht, nicht geschafft? */
export function einzelStatus(
  s: Schritt,
  st: SchrittStand | undefined,
  ex: Extern | undefined
): { status: Exclude<Status, 'gesperrt' | 'uebersprungen'>; wartet?: boolean } {
  if (st?.hand === 'geschafft') return { status: 'geschafft' }
  // Zur Überarbeitung zurückgeschickt: offen, bis neu eingereicht ist
  if (st?.ueberarbeiten) {
    const jetztEingereicht = ['arbeitsblatt', 'rueckmeldung', 'onlinetest', 'vokabeln'].includes(s.inhalt.art) ? (ex?.eingereicht ?? 0) : (st.eingereicht ?? 0)
    if (jetztEingereicht <= st.ueberarbeiten.bei) return { status: 'offen' }
  }
  const verknuepft = s.inhalt.art === 'arbeitsblatt' || s.inhalt.art === 'rueckmeldung' || s.inhalt.art === 'onlinetest' || s.inhalt.art === 'vokabeln'
  const eingereicht = verknuepft ? (ex?.eingereicht ?? 0) : (st?.eingereicht ?? 0)
  switch (s.inhalt.art) {
    case 'lernkarten':
      return st?.gewusst ? { status: 'geschafft' } : { status: 'offen' }
    case 'reflexion':
      return eingereicht ? { status: 'geschafft' } : { status: 'offen' }
    case 'praesenz':
      return st?.praesenz ? { status: 'geschafft' } : { status: 'offen', wartet: true }
    case 'hefter':
      return { status: 'geschafft' }
    case 'diagnose':
      return st?.diagnose ? { status: 'geschafft' } : { status: 'offen' }
  }
  if (!eingereicht) return { status: 'offen' }
  const e = s.erfolg
  if (e.art === 'abgabe') return { status: 'geschafft' }
  if (e.art === 'lehrkraft' || s.inhalt.art === 'abschluss' || s.inhalt.art === 'sprechen') {
    if (st?.bewertung) return { status: st.bewertung.geschafft ? 'geschafft' : 'nicht_geschafft' }
    return { status: 'eingereicht', wartet: true }
  }
  const runden = verknuepft ? (ex?.runden ?? 1) : 2
  if (e.art === 'punkte') {
    const p = ex?.prozent
    if (p === undefined) return { status: 'eingereicht' }
    return p >= e.prozent ? { status: 'geschafft' } : { status: eingereicht >= runden ? 'nicht_geschafft' : 'offen' }
  }
  // KI: alle Kriterien des letzten Bogens mindestens auf der Schwelle
  const krit = verknuepft ? ex?.kriterien : st?.ki?.einschaetzungen
  if (!krit) return { status: 'eingereicht' }
  const ok = krit.length > 0 && krit.every((k) => (RANG[k] ?? 0) >= RANG[e.schwelle])
  if (ok) return { status: 'geschafft' }
  return { status: eingereicht >= runden ? 'nicht_geschafft' : 'offen' }
}

/** Der ganze Weg einer Person: Freischaltungen, Haltepunkte, Wahl-, Förder- und Diagnoseregeln */
export function berechneWeg(r: Reihe, stand: Stand, extern: Record<string, Extern>, halteFrei: string[], jetzt = Date.now()): Weg {
  const lage = new Map<string, SchrittLage>()
  const uebersprungen = new Set<string>()
  // Eingangsdiagnosen: bestanden → gewählte Schritte überspringen
  for (const s of r.schritte)
    if (s.inhalt.art === 'diagnose') {
      const d = stand.schritte[s.id]?.diagnose
      if (d && d.prozent >= s.inhalt.schwelle) for (const id of s.inhalt.ueberspringen) uebersprungen.add(id)
    }
  let blockiert: string | null = null
  const wahlStand = new Map<string, number>()
  const einzeln = new Map(r.schritte.map((s) => [s.id, einzelStatus(s, stand.schritte[s.id], extern[s.id])]))

  r.schritte.forEach((s, i) => {
    const st = stand.schritte[s.id]
    const ein = einzeln.get(s.id)!
    // Förderschritt: nur sichtbar offen, wenn sein Schritt nicht geschafft ist
    if (s.rolle === 'foerder') {
      const ziel = s.foerderFuer ? einzeln.get(s.foerderFuer) : undefined
      const noetig = ziel?.status === 'nicht_geschafft' && stand.schritte[s.foerderFuer!]?.hand !== 'geschafft'
      if (!noetig && ein.status !== 'geschafft' && st?.hand !== 'offen') {
        lage.set(s.id, { id: s.id, status: 'gesperrt', hinweis: 'Öffnet sich nur, wenn du Unterstützung brauchst.' })
        return
      }
      lage.set(s.id, { id: s.id, status: ein.status, ...(ein.wartet ? { wartet: true } : {}) })
      return
    }
    if (uebersprungen.has(s.id) && ein.status !== 'geschafft') {
      lage.set(s.id, { id: s.id, status: 'uebersprungen', hinweis: 'Das kannst du schon (Eingangsdiagnose).' })
      return
    }
    // Haltepunkt vor diesem Schritt
    let halt: string | null = null
    if (s.halt?.art === 'freigabe' && !halteFrei.includes(s.id)) halt = 'Wartet auf die gemeinsame Besprechung im Unterricht.'
    if (s.halt?.art === 'datum' && Date.parse(s.halt.ab) > jetzt) halt = `Geht ab ${new Date(s.halt.ab).toLocaleDateString('de-DE')} weiter.`
    const vonHand = st?.hand === 'offen'
    // Wissensspeicher gilt als „erledigt", aber erst, wenn der Weg dort ankommt
    if ((blockiert || halt) && !vonHand && (ein.status !== 'geschafft' || s.inhalt.art === 'hefter') && st?.hand !== 'geschafft') {
      lage.set(s.id, { id: s.id, status: 'gesperrt', hinweis: halt ?? blockiert! })
    } else {
      lage.set(s.id, {
        id: s.id,
        status: ein.status,
        ...(ein.wartet ? { wartet: true } : {}),
        ...(st?.ueberarbeiten && ein.status === 'offen' ? { hinweis: `Zur Überarbeitung: ${st.ueberarbeiten.text || 'bitte noch einmal ansehen'}` } : {})
      })
    }
    const l = lage.get(s.id)!
    const fertig = l.status === 'geschafft' || l.status === 'uebersprungen'
    // Was blockiert die folgenden Schritte?
    if (s.rolle === 'pflicht' && !fertig && s.inhalt.art !== 'hefter') {
      const foerder = r.schritte.find((f) => f.rolle === 'foerder' && f.foerderFuer === s.id)
      const foerderGeschafft = foerder && einzeln.get(foerder.id)?.status === 'geschafft'
      if (!foerderGeschafft) blockiert ??= `Zuerst: ${s.titel || `Schritt ${i + 1}`}`
    }
    if (s.rolle === 'wahl' && s.wahlGruppe) {
      if (fertig) wahlStand.set(s.wahlGruppe, (wahlStand.get(s.wahlGruppe) ?? 0) + 1)
      // Letzter Schritt der Gruppe: genug gewählt?
      const gruppe = r.schritte.filter((x) => x.rolle === 'wahl' && x.wahlGruppe === s.wahlGruppe)
      if (gruppe[gruppe.length - 1]?.id === s.id && (wahlStand.get(s.wahlGruppe) ?? 0) < (s.wahlMindestens ?? 1))
        blockiert ??= `Zuerst ${s.wahlMindestens ?? 1} der Wahlaufgaben schaffen`
    }
  })
  // Wissensspeicher zählt nicht als Aufgabe
  const zaehlend = r.schritte.filter((s) => (s.rolle === 'pflicht' || s.rolle === 'wahl') && s.inhalt.art !== 'hefter')
  // Wahlgruppen zählen nur bis zur nötigen Zahl
  const wahlGruppen = [...new Set(zaehlend.filter((s) => s.rolle === 'wahl').map((s) => s.wahlGruppe ?? s.id))]
  const noetig =
    zaehlend.filter((s) => s.rolle === 'pflicht').length +
    wahlGruppen.reduce((n, g) => n + (r.schritte.find((s) => s.wahlGruppe === g && s.rolle === 'wahl')?.wahlMindestens ?? 1), 0)
  const geschafftZaehlend =
    zaehlend.filter((s) => s.rolle === 'pflicht' && ['geschafft', 'uebersprungen'].includes(lage.get(s.id)!.status)).length +
    wahlGruppen.reduce((n, g) => n + Math.min(r.schritte.find((s) => s.wahlGruppe === g && s.rolle === 'wahl')?.wahlMindestens ?? 1, wahlStand.get(g) ?? 0), 0)
  const abschnitte = [...new Set(r.schritte.map((s) => s.abschnitt).filter((a): a is string => Boolean(a)))]
  const abzeichen = abschnitte.filter((a) => {
    const teil = r.schritte.filter((s) => s.abschnitt === a && s.rolle === 'pflicht')
    return teil.length > 0 && teil.every((s) => ['geschafft', 'uebersprungen'].includes(lage.get(s.id)!.status))
  })
  return {
    schritte: r.schritte.map((s) => lage.get(s.id)!),
    fortschritt: noetig ? Math.min(1, geschafftZaehlend / noetig) : 0,
    abzeichen,
    fertig: noetig > 0 && geschafftZaehlend >= noetig
  }
}

/** Diagnose auswerten (Prozent richtiger Antworten; Groß-/Kleinschreibung und Leerzeichen egal) */
export function diagnoseProzent(fragen: DiagnoseFrage[], antworten: Record<string, string>): number {
  if (!fragen.length) return 0
  const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const richtig = fragen.filter((f, i) => {
    const a = norm(antworten[String(i)] ?? '')
    return a && f.richtig.split('/').some((r) => norm(r) === a)
  }).length
  return Math.round((richtig / fragen.length) * 100)
}

/** Für die Lernenden: Inhalt ohne Lösungen/Erwartungen */
export function inhaltFuerLernende(i: SchrittInhalt): Record<string, unknown> {
  switch (i.art) {
    case 'arbeitsblatt':
      return { art: i.art, titel: i.titel, varianten: (i.varianten ?? []).map((v) => v.label) }
    case 'rueckmeldung':
    case 'onlinetest':
      return { art: i.art }
    case 'vokabeln':
      return { art: i.art, titel: i.titel, woerter: i.woerter.length }
    case 'aufgabe':
      return {
        art: i.art,
        anweisung: i.anweisung,
        material: i.material,
        link: i.link,
        fragen: i.fragen,
        antwort: i.antwort,
        feedback: i.feedback,
        hatMusterloesung: Boolean(i.musterloesung?.trim())
      }
    case 'diagnose':
      return { art: i.art, fragen: i.fragen.map((f) => ({ frage: f.frage, optionen: f.optionen })), wiederholbarNachMin: i.wiederholbarNachMin ?? 0 }
    default:
      return { ...i }
  }
}

export const neueSchrittId = (): string => `s${Math.random().toString(36).slice(2, 10)}`

export function leererInhalt(art: SchrittArt): SchrittInhalt {
  switch (art) {
    case 'arbeitsblatt':
      return { art, quelle: '', titel: '', html: '', aufgaben: [], vorlage: null, runden: 2, stift: true }
    case 'rueckmeldung':
      return { art, vorlage: null, runden: 2 }
    case 'onlinetest':
      return { art, test: null, zeitMin: 20 }
    case 'vokabeln':
      return { art, titel: '', sprache: '', fach: '', woerter: [] }
    case 'aufgabe':
      return { art, anweisung: '', material: '', link: '', fragen: [], antwort: 'text', erwartung: '', feedback: true }
    case 'lernkarten':
      return { art, karten: [] }
    case 'reflexion':
      return { art, frage: 'Was hast du in diesem Abschnitt gelernt, was fällt dir noch schwer?' }
    case 'praesenz':
      return { art, anweisung: '' }
    case 'diagnose':
      return { art, fragen: [], schwelle: 80, ueberspringen: [] }
    case 'hefter':
      return { art, text: '' }
    case 'abschluss':
      return { art, anweisung: '', raster: [] }
    case 'sprechen':
      return { art, anweisung: '', minuten: 2 }
  }
}

/** Sinnvoller Erfolg je Art */
export function standardErfolg(art: SchrittArt): Erfolg {
  switch (art) {
    case 'arbeitsblatt':
    case 'rueckmeldung':
      return { art: 'ki', schwelle: 'teilweise' }
    case 'onlinetest':
      return { art: 'punkte', prozent: 60 }
    case 'vokabeln':
      return { art: 'punkte', prozent: 80 }
    case 'abschluss':
    case 'sprechen':
    case 'praesenz':
      return { art: 'lehrkraft' }
    default:
      return { art: 'abgabe' }
  }
}

/** Niveau-Empfehlung aus der Eingangsdiagnose: unter 50 % Basis, unter 80 % Standard, sonst die oberste Stufe */
export function niveauEmpfehlung(r: Reihe, stand: Stand, anzahl: number): number | null {
  const d = r.schritte.find((s) => s.inhalt.art === 'diagnose' && stand.schritte[s.id]?.diagnose)
  const p = d ? stand.schritte[d.id]!.diagnose!.prozent : null
  if (p === null || anzahl < 2) return null
  return p < 50 ? 0 : p < 80 ? Math.min(1, anzahl - 1) : anzahl - 1
}

/** Lernziele in fester Zählung (Reihe, dann Schritte) – für Ampeln von Lernenden und Lehrkraft */
export const alleLernziele = (r: Pick<Reihe, 'lernziele' | 'schritte'>): Lernziel[] => [...r.lernziele, ...r.schritte.flatMap((s) => s.lernziele)]

/** Weicht die Selbsteinschätzung deutlich von der Lehrkraft ab (grün ↔ rot)? */
export function ampelAbweichungen(stand: Stand): number[] {
  const selbst: Record<string, string> = {}
  for (const st of Object.values(stand.schritte)) Object.assign(selbst, st.ampel ?? {})
  const lk: Record<string, string> = { ...(stand.lehrkraftAmpel ?? {}) }
  return Object.keys(lk)
    .filter((k) => selbst[k] && ((selbst[k] === 'gruen' && lk[k] === 'rot') || (selbst[k] === 'rot' && lk[k] === 'gruen')))
    .map(Number)
}
