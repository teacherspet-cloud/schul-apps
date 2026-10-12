/**
 * Förder- und Fordermaterial: Gruppen nach Bedarf VORSCHLAGEN (12.10.2026, Entscheidung der Lehrkraft) – reine
 * Funktionen, ohne Server und ohne KI (Namen gehen hier nirgends hin).
 *
 * Die App schlägt aus den vorhandenen Lerndaten 2–4 Gruppen mit ähnlichem Bedarf vor; die Lehrkraft verschiebt Kinder
 * und MUSS jede Gruppe einzeln bestätigen. Rechtlich ist das Profiling (Art. 4 Nr. 4 DSGVO); eine ausschließlich
 * automatisierte Entscheidung wäre nach Art. 22 DSGVO unzulässig (EuGH C-634/21: auch maßgeblich vorbereitende Scores),
 * deshalb bleibt es ein Vorschlag mit sichtbarer Begründung und Daten je Kind (ergebnis-rahmen-aesthetik.md, B3).
 *
 * Grundsätze (Recherche 12.10.2026):
 *  - Gruppen nach gleichem Förderziel bzw. gleicher Fehlvorstellung, NICHT nach Gesamtpunktzahl (Faustregel, vereinbar
 *    mit dem diagnosegeleiteten Ansatz, „Mathe sicher können").
 *  - Leistungsgruppen nur befristet und je Ziel (belegt: EEF – weniger Nutzen für Leistungsschwächere, Fehlzuordnungen
 *    treffen Benachteiligte) – die Gruppen gelten nur für dieses Material.
 *  - Von der Lehrkraft eingetragener Bedarf wiegt am schwersten (Fächer ohne Lerndaten: Pflicht).
 *  - Nachteilsausgleich/Notenschutz bei Rechtschreibung: Rechtschreibung ist kein Förderziel.
 * Schwellen (Faustregeln der App): Forder ab 80 % Gesamtstand ohne Schwäche; Vokabeln ab 3 wackelnden Wörtern;
 * Arbeitsblätter ab 2 roten Aufgaben bzw. 40 % rot; Onlinetests unter 50 %.
 */

export type FoerderArt = 'foerder' | 'forder'

/** Lerndaten eines Kindes (vom Server, GET /server/foerdern/daten) und Angaben der Lehrkraft */
export interface KindDaten {
  id: string
  name: string
  benutzer: string
  /** Vokabeln: sicher / gesamt in den laufenden Kursen der Lerngruppe */
  vokabeln?: { sicher: number; gesamt: number } | null
  /** Wörter, die beim Kind gerade wackeln (shared/problemWoerter.ts `wackeltAktuell`) */
  wackelig?: { term: string; translation: string }[]
  /** Grammatik je Regel mit Ampel (server/grammatik.ts grammatikProfil, „erster Versuch") */
  grammatik?: { titel: string; ampel: 'sicher' | 'aufbau' | 'schwaeche'; quote: number; erklaerung?: string; beispiele?: string[] }[]
  /** Arbeitsblätter: Ampeln je Aufgabe (KI-Feedback je Aufgabe), schwierige Aufgaben, nächste Schritte aus dem Bogen */
  blaetter?: { gruen: number; gelb: number; rot: number; schwierig: string[]; schritte: string[] } | null
  /** Onlinetests: Notenschnitt, Prozent, Anzahl */
  tests?: { schnitt: number; prozent: number; anzahl: number } | null
  /** Handlungsbedarf der Kurse: 'inaktiv' | 'schwach' | 'foerdern' */
  handlungsbedarf?: string[]
  /** Bedarf von Hand (Kennungen der Förderbedarfe des Fachs oder Freitext); „forder:…" = Forderbedarf */
  vonHand?: string[]
  /** Für das Kind ist ein Nachteilsausgleich hinterlegt (nur Darstellung) */
  nachteilsausgleich?: boolean
  /** Rechtschreibung nicht als Förderziel (Notenschutz/Ausgleich bei Rechtschreibung) */
  ohneRechtschreibung?: boolean
}

export interface Schwerpunkt {
  schluessel: string
  text: string
  gewicht: number
}

export interface Befund {
  /** Gesamtstand 0…1 aus allen vorhandenen Lerndaten; null = keine Daten */
  stand: number | null
  schwerpunkte: Schwerpunkt[]
  /** Daten in Worten (für die Lehrkraft – „Daten je Kind sichtbar") */
  zeilen: string[]
  /** Stärken in Worten (Ausgangslage positiv formuliert, Förderplan-Baustein) */
  staerken: string[]
  /** Forderbedarf von Hand */
  forderVonHand: boolean
}

export interface GruppenVorschlag {
  schluessel: string
  art: FoerderArt
  /** Neutraler Gruppenname ohne Rangfolge („Gruppe A") – nur für die Lehrkraft */
  titel: string
  /** Wofür (Schwerpunkt in Worten) */
  schwerpunkt: string
  begruendung: string
  /** „Dein Ziel" – ein Satz, positiv, Schülersprache */
  ziel: string
  /** Bedarfe der Gruppe (Kennungen/Freitext) */
  bedarfe: string[]
  kinder: string[]
}

export const FORDER_AB = 0.8
const prozent = (x: number): string => `${Math.round(x * 100)} %`
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '')
export const istRechtschreibung = (s: string): boolean => /rechtschreib|orthogra|schreibung|akzente/i.test(s)

/** Befund eines Kindes: Gesamtstand, Schwerpunkte (gewichtet), Daten und Stärken in Worten */
export function befundVon(k: KindDaten, bedarfName: (id: string) => string = (x) => x): Befund {
  const anteile: number[] = []
  const zeilen: string[] = []
  const staerken: string[] = []
  const sp: Schwerpunkt[] = []
  if (k.vokabeln && k.vokabeln.gesamt > 0) {
    const a = k.vokabeln.sicher / k.vokabeln.gesamt
    anteile.push(a)
    zeilen.push(`Vokabeln: ${prozent(a)} sicher (${k.vokabeln.sicher} von ${k.vokabeln.gesamt})`)
    if (a >= 0.7) staerken.push(`sichert ${prozent(a)} der Vokabeln`)
  }
  const wack = k.wackelig ?? []
  if (wack.length) {
    zeilen.push(
      `wackelig: ${wack
        .slice(0, 6)
        .map((w) => w.term)
        .join(', ')}${wack.length > 6 ? ` (+${wack.length - 6})` : ''}`
    )
    if (wack.length >= 3) sp.push({ schluessel: 'vokabeln', text: 'Vokabeln, die gerade wackeln', gewicht: wack.length >= 8 ? 3 : 2 })
  }
  const gram = (k.grammatik ?? []).filter((g) => g.ampel)
  if (gram.length) {
    anteile.push(gram.reduce((s, g) => s + g.quote, 0) / gram.length)
    const schwach = gram.filter((g) => g.ampel === 'schwaeche').sort((a, b) => a.quote - b.quote)
    const sicher = gram.filter((g) => g.ampel === 'sicher')
    if (schwach.length) zeilen.push(`Grammatik rot: ${schwach.map((g) => `${g.titel} (${prozent(g.quote)})`).join(', ')}`)
    if (sicher.length) {
      zeilen.push(`Grammatik sicher: ${sicher.map((g) => g.titel).join(', ')}`)
      staerken.push(
        `sicher in ${sicher
          .slice(0, 3)
          .map((g) => `„${g.titel}"`)
          .join(', ')}`
      )
    }
    for (const [i, g] of schwach.entries()) sp.push({ schluessel: `gram:${norm(g.titel)}`, text: `Grammatik: ${g.titel}`, gewicht: 3 - Math.min(1, i) * 0.5 })
  }
  const b = k.blaetter
  if (b && b.gruen + b.gelb + b.rot > 0) {
    const n = b.gruen + b.gelb + b.rot
    anteile.push((b.gruen + 0.5 * b.gelb) / n)
    zeilen.push(`Arbeitsblätter: ${b.gruen} grün, ${b.gelb} gelb, ${b.rot} rot`)
    if (b.gruen / n >= 0.6) staerken.push(`löst ${b.gruen} von ${n} Aufgaben auf Arbeitsblättern sicher`)
    if (b.rot >= 2 || b.rot / n >= 0.4) sp.push({ schluessel: 'blatt', text: 'Aufgaben auf den Arbeitsblättern', gewicht: 2 })
    if (b.schritte.length) zeilen.push(`Nächste Schritte (Feedback): ${b.schritte.slice(0, 2).join(' · ')}`)
  }
  const t = k.tests
  if (t && t.anzahl > 0) {
    anteile.push(Math.max(0, Math.min(1, t.prozent / 100)))
    zeilen.push(`Onlinetests: Schnitt ${t.schnitt.toLocaleString('de-DE')} (${t.prozent} %, ${t.anzahl} Test${t.anzahl === 1 ? '' : 's'})`)
    if (t.prozent >= 80) staerken.push(`erreicht in Onlinetests ${t.prozent} %`)
    if (t.prozent < 50) sp.push({ schluessel: 'test', text: 'Grundlagen aus dem letzten Test', gewicht: 2 })
  }
  for (const h of k.handlungsbedarf ?? []) {
    if (h === 'inaktiv') {
      zeilen.push('übt zurzeit kaum')
      sp.push({ schluessel: 'uebung', text: 'regelmäßig üben', gewicht: 1 })
    }
  }
  let forderVonHand = false
  for (const h of k.vonHand ?? []) {
    if (h.startsWith('forder:')) {
      forderVonHand = true
      zeilen.push(`Lehrkraft: Forderbedarf${h.length > 7 ? ` (${h.slice(7)})` : ''}`)
      continue
    }
    zeilen.push(`Lehrkraft: ${bedarfName(h)}`)
    sp.push({ schluessel: `hand:${norm(h)}`, text: bedarfName(h), gewicht: 4 })
  }
  if (k.nachteilsausgleich) zeilen.push('Nachteilsausgleich hinterlegt (nur Darstellung)')
  // Nachteilsausgleich bei Rechtschreibung: kein Förderziel (Entscheidung der Lehrkraft)
  const schwerpunkte = (k.ohneRechtschreibung ? sp.filter((s) => !istRechtschreibung(`${s.schluessel} ${s.text}`)) : sp).sort((a, b2) => b2.gewicht - a.gewicht)
  return {
    stand: anteile.length ? anteile.reduce((a, b2) => a + b2, 0) / anteile.length : null,
    schwerpunkte,
    zeilen: zeilen.length ? zeilen : ['keine Lerndaten – Bedarf bitte von Hand eintragen'],
    staerken,
    forderVonHand
  }
}

/** Gehört das Kind in eine Forder-Gruppe? (Forder von Hand, oder hoher Stand ohne schwere Schwäche) */
export function istForder(b: Befund): boolean {
  if (b.forderVonHand) return true
  return b.stand !== null && b.stand >= FORDER_AB && !b.schwerpunkte.some((s) => s.gewicht >= 3)
}

/** „Dein Ziel" aus dem Schwerpunkt – ein Satz, positiv (HE-Handreichung: positiv und konkret) */
export function zielSatz(art: FoerderArt, s: Pick<Schwerpunkt, 'schluessel' | 'text'> | null): string {
  if (art === 'forder') return 'Du wendest dein Wissen in neuen, kniffligen Aufgaben an und begründest deine Lösungswege.'
  if (!s || s.schluessel === 'festigen') return 'Du sicherst die Grundlagen des Themas und löst die Aufgaben Schritt für Schritt selbstständig.'
  if (s.schluessel.startsWith('gram:')) return `Du kannst „${s.text.replace(/^Grammatik:\s*/, '')}" sicher erkennen und richtig anwenden.`
  if (s.schluessel === 'vokabeln') return 'Du kannst die Wörter, die gerade noch wackeln, sicher verstehen und richtig verwenden.'
  if (s.schluessel === 'blatt') return 'Du löst Aufgaben wie auf deinem letzten Arbeitsblatt Schritt für Schritt richtig.'
  if (s.schluessel === 'test') return 'Du festigst die Grundlagen aus dem letzten Test und löst solche Aufgaben sicher.'
  if (s.schluessel === 'uebung') return 'Du übst in kleinen Schritten und merkst, wie du vorankommst.'
  return `Du wirst sicherer bei: ${s.text}.`
}

const BUCHSTABEN = 'ABCDEFGH'

/**
 * Gruppen vorschlagen: Forder-Kinder in eine Gruppe, Förder-Kinder nach ihrem wichtigsten Schwerpunkt; höchstens `max`
 * Gruppen (Vorgabe 4) – kleinere Schwerpunkte gehen in die Gruppe, zu der das Kind sonst noch passt, sonst zu
 * „Grundlagen sichern". Mit nur einer Gruppe und mindestens 4 Kindern wird nach dem Stand geteilt (2 Gruppen).
 * Reihenfolge der Kinder bleibt die der Eingabe. Die Titel sind neutral („Gruppe A") und ohne Rangfolge.
 */
export function gruppenVorschlagen(kinder: KindDaten[], o: { max?: number; bedarfName?: (id: string) => string } = {}): GruppenVorschlag[] {
  const max = Math.max(2, Math.min(4, o.max ?? 4))
  if (!kinder.length) return []
  const befunde = new Map(kinder.map((k) => [k.id, befundVon(k, o.bedarfName)]))
  const forder = kinder.filter((k) => istForder(befunde.get(k.id)!))
  const foerder = kinder.filter((k) => !forder.includes(k))
  // Schwerpunkt → Kinder (nach dem wichtigsten Schwerpunkt)
  const cluster = new Map<string, { s: Schwerpunkt; kinder: string[] }>()
  const FESTIGEN: Schwerpunkt = { schluessel: 'festigen', text: 'Grundlagen sichern', gewicht: 0 }
  for (const k of foerder) {
    const s = befunde.get(k.id)!.schwerpunkte[0] ?? FESTIGEN
    const c = cluster.get(s.schluessel) ?? { s, kinder: [] }
    c.kinder.push(k.id)
    cluster.set(s.schluessel, c)
  }
  const platz = max - (forder.length ? 1 : 0)
  let liste = [...cluster.values()].sort((a, b) => b.kinder.length - a.kinder.length || b.s.gewicht - a.s.gewicht)
  if (liste.length > platz) {
    const behalten = liste.slice(0, platz)
    // „Grundlagen sichern" als Sammelgruppe, wenn sie nicht schon dabei ist und Platz frei wird
    for (const rest of liste.slice(platz))
      for (const id of rest.kinder) {
        const eigene = befunde.get(id)!.schwerpunkte.map((s) => s.schluessel)
        const ziel =
          behalten.find((c) => eigene.includes(c.s.schluessel)) ?? behalten.find((c) => c.s.schluessel === 'festigen') ?? behalten[behalten.length - 1]
        ziel.kinder.push(id)
      }
    liste = behalten
  }
  const aus: GruppenVorschlag[] = []
  const bedarfeVon = (ids: string[]): string[] => [
    ...new Set(ids.flatMap((id) => (kinder.find((k) => k.id === id)?.vonHand ?? []).filter((h) => !h.startsWith('forder:'))))
  ]
  for (const c of liste) {
    const n = c.kinder.length
    const wer = `${n} ${n === 1 ? 'Kind' : 'Kinder'}`
    aus.push({
      schluessel: c.s.schluessel,
      art: 'foerder',
      titel: '',
      schwerpunkt: c.s.text,
      begruendung:
        c.s.schluessel === 'festigen'
          ? `${wer} ohne klaren Einzelschwerpunkt bzw. mit wenigen Daten – Grundlagen des Themas sichern.`
          : c.s.schluessel.startsWith('hand:')
          ? `${wer}: von der Lehrkraft eingetragener Bedarf „${c.s.text}".`
          : `${wer} mit demselben Schwerpunkt: ${c.s.text}.`,
      ziel: zielSatz('foerder', c.s),
      bedarfe: bedarfeVon(c.kinder),
      kinder: [...c.kinder]
    })
  }
  if (forder.length)
    aus.push({
      schluessel: 'forder',
      art: 'forder',
      titel: '',
      schwerpunkt: 'Vertiefung und Transfer',
      begruendung: `${forder.length} ${forder.length === 1 ? 'Kind' : 'Kinder'} mit sicherem Stand (ab ${Math.round(
        FORDER_AB * 100
      )} % ohne deutliche Schwäche) bzw. von der Lehrkraft als Forderbedarf eingetragen.`,
      ziel: zielSatz('forder', null),
      bedarfe: [],
      kinder: forder.map((k) => k.id)
    })
  // Nur eine Gruppe, mindestens 4 Kinder: nach dem Stand teilen – die obere Hälfte festigt mit weniger Hilfen
  if (aus.length === 1 && aus[0].kinder.length >= 4) {
    const g = aus[0]
    const sortiert = [...g.kinder].sort((a, b) => (befunde.get(a)!.stand ?? 0) - (befunde.get(b)!.stand ?? 0))
    const unten = new Set(sortiert.slice(0, Math.ceil(sortiert.length / 2)))
    const oben = g.kinder.filter((id) => !unten.has(id))
    const obenForder = g.art === 'foerder' && oben.every((id) => (befunde.get(id)!.stand ?? 0) >= 0.65)
    aus.splice(
      0,
      1,
      { ...g, kinder: g.kinder.filter((id) => unten.has(id)) },
      {
        ...g,
        schluessel: `${g.schluessel}:2`,
        art: obenForder ? 'forder' : g.art,
        schwerpunkt: obenForder ? 'Vertiefung und Transfer' : `${g.schwerpunkt} (mit weniger Hilfen)`,
        begruendung: `${oben.length} Kinder mit demselben Bedarf, aber höherem Gesamtstand – ${
          obenForder ? 'Vertiefung statt Wiederholung' : 'festigen mit weniger Hilfen'
        }.`,
        ziel: obenForder ? zielSatz('forder', null) : g.ziel,
        kinder: oben
      }
    )
  }
  return aus.map((g, i) => ({ ...g, titel: `Gruppe ${BUCHSTABEN[i] ?? i + 1}` }))
}

/** Kind in eine andere Gruppe verschieben (Ziehen bzw. Tippen); leere Gruppen bleiben stehen, bis die Lehrkraft sie entfernt */
export function kindVerschieben<T extends { schluessel: string; kinder: string[] }>(gruppen: T[], kindId: string, nach: string): T[] {
  if (!gruppen.some((g) => g.schluessel === nach)) return gruppen
  return gruppen.map((g) => {
    const ohne = g.kinder.filter((k) => k !== kindId)
    return g.schluessel === nach ? { ...g, kinder: [...ohne, kindId] } : ohne.length === g.kinder.length ? g : { ...g, kinder: ohne }
  })
}

/** Erst erzeugen, wenn JEDE (nicht leere) Gruppe einzeln bestätigt ist – kein „alle übernehmen" (Art. 22 DSGVO) */
export function alleBestaetigt(gruppen: { kinder: string[]; bestaetigt?: boolean }[]): boolean {
  const echte = gruppen.filter((g) => g.kinder.length)
  return echte.length > 0 && echte.every((g) => g.bestaetigt === true)
}
