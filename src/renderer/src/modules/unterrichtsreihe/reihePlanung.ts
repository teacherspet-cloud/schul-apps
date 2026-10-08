/**
 * Reihenarten und Planungsreihe (08.10.2026, Plan „Unterrichtsreihe" E1/E4/E5) – reine Hilfsfunktionen, die Oberfläche
 * steht in StundenPlanung.tsx und ReiheArt.tsx.
 *
 * - Planungsreihe: je Stunde ein Stundenverlauf (`Reihe.verlauf`, Schlüssel = Index der Stunde) mit den Feldern des
 *   Stundenverlaufs der Arbeitsblatt-App (shared/stundenverlauf: Phase, Minuten, Geschehen, Sozialform, Medien), dazu
 *   Verknüpfungen zu Schritten/Materialien der Reihe und eine Hausaufgabe. Die Schritte bleiben als Material erhalten.
 * - Wechsel mit Umwandlung (abgestimmt):
 *    · digital/gemischt → Planung: Schritte werden Phasen in ihrer Stunde (Material bleibt verknüpft; „Im Unterricht"
 *      geht ganz in die Phase über); Schritte ohne Stunde bleiben unverknüpftes Material;
 *    · Planung → digital/gemischt: Phasen mit Material werden zu Schritten mit diesem Material, übrige Phasen zu
 *      Platzhaltern (digital: Zwischenaufgabe mit Marke „bitte ersetzen", gemischt: „Im Unterricht" mit dem Geschehen
 *      als Anweisung), die Hausaufgabe zu einem Platzhalter „Hausaufgabe"; die Stundenverläufe entfallen;
 *    · gemischt ↔ digital: nichts wird umgebaut – „Im Unterricht" ist in digitalen Reihen markiert („nicht am Gerät").
 */
import {
  artVon,
  leererInhalt,
  neueSchrittId,
  SCHRITT_ARTEN,
  standardErfolg,
  STUNDEN_MINUTEN,
  type Reihe,
  type ReiheArt,
  type ReihenPhase,
  type Schritt,
  type SchrittArt,
  type StundenPlanung
} from '@shared/reihe'
import { leererVerlauf, minutenAngleichen, summeMinuten, verlaufAus, type VerlaufsPhase } from '../../shared/stundenverlauf/stundenverlauf'
import { impulsKurz } from '../../shared/stundenverlauf/einstiegsimpuls'

const neuePhasenId = (): string => `p${Math.random().toString(36).slice(2, 10)}`

/** Verlauf der Stunde `i` (leer, wenn noch keiner angelegt ist) */
export const verlaufVon = (r: Pick<Reihe, 'verlauf'>, i: number): StundenPlanung => r.verlauf?.[String(i)] ?? { phasen: [] }

/** Länge der Stunde `i` in Minuten (0, wenn es sie nicht gibt) */
export const stundenLaenge = (r: Pick<Reihe, 'stunden'>, i: number): number => {
  const a = r.stunden?.[i]
  return a ? STUNDEN_MINUTEN[a] : 0
}

/** Summe der Phasen-Minuten (dieselbe Rechnung wie im Stundenverlauf der Arbeitsblatt-App) */
export const phasenSumme = (p: Pick<StundenPlanung, 'phasen'>): number => summeMinuten({ dauer: 0, ziel: '', phasen: p.phasen as VerlaufsPhase[] })

export interface MinutenLage {
  summe: number
  laenge: number
  /** Mehr verplant, als die Stunde hat */
  ueber: boolean
  /** Weniger verplant (nur, wenn überhaupt Phasen da sind) */
  unter: boolean
}

/** Minuten-Summe der Stunde gegen ihre Länge */
export function minutenLage(r: Pick<Reihe, 'stunden' | 'verlauf'>, i: number): MinutenLage {
  const p = verlaufVon(r, i)
  const summe = phasenSumme(p)
  const laenge = stundenLaenge(r, i)
  return { summe, laenge, ueber: summe > laenge, unter: p.phasen.length > 0 && summe < laenge }
}

/** Minuten verhältnisgleich auf die Länge der Stunde bringen (jede Phase mindestens 1 Minute) */
export function minutenAnpassen(p: StundenPlanung, laenge: number): StundenPlanung {
  if (!p.phasen.length || laenge <= 0) return p
  const v = minutenAngleichen({ dauer: laenge, ziel: '', phasen: p.phasen as VerlaufsPhase[] })
  return { ...p, phasen: p.phasen.map((x, k) => ({ ...x, minuten: v.phasen[k].minuten })) }
}

/** Vorlage Einstieg – Erarbeitung – Sicherung für eine Stunde dieser Länge */
export function phasenVorlage(laenge: number): ReihenPhase[] {
  return leererVerlauf(laenge || 45).phasen.map((p) => ({ id: neuePhasenId(), phase: p.phase, minuten: p.minuten, geschehen: '', sozialform: p.sozialform, medien: '' }))
}

export const neuePhase = (o: Partial<ReihenPhase> = {}): ReihenPhase => ({
  id: neuePhasenId(),
  phase: '',
  minuten: 5,
  geschehen: '',
  sozialform: 'UG',
  medien: '',
  ...o
})

/** Verlauf der Stunde `i` ersetzen – Teil-Änderung der Reihe */
export const mitVerlauf = (r: Pick<Reihe, 'verlauf'>, i: number, p: StundenPlanung): Pick<Reihe, 'verlauf'> => ({ verlauf: { ...(r.verlauf ?? {}), [String(i)]: p } })

/** Phase `k` um `d` verschieben */
export function phaseVerschieben(p: StundenPlanung, k: number, d: number): StundenPlanung {
  const j = k + d
  if (k < 0 || j < 0 || k >= p.phasen.length || j >= p.phasen.length) return p
  const phasen = [...p.phasen]
  ;[phasen[k], phasen[j]] = [phasen[j], phasen[k]]
  return { ...p, phasen }
}

// ---------------------------------------------------------------- Schritte → Phasen

const artLabel = (a: SchrittArt): string => SCHRITT_ARTEN.find((x) => x.id === a)?.label ?? a
const kurz = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t)

/** Phase, in die ein Schritt seiner Art nach gehört */
export function phasenNameFuer(art: SchrittArt): string {
  switch (art) {
    case 'diagnose':
      return 'Einstieg'
    case 'reflexion':
    case 'hefter':
    case 'abschluss':
      return 'Sicherung'
    case 'lernkarten':
    case 'vokabeln':
    case 'onlinetest':
      return 'Übung'
    default:
      return 'Erarbeitung'
  }
}

/** Trägt der Schritt Material, das in der Planung verknüpft bleibt? („Im Unterricht" geht ganz in die Phase über) */
export const istMaterial = (s: Schritt): boolean => s.inhalt.art !== 'praesenz'

/** Ein Schritt als Phase seiner Stunde */
export function phaseAusSchritt(s: Schritt): ReihenPhase {
  const i = s.inhalt
  const titel = s.titel.trim() || artLabel(i.art)
  const beschreibung = s.platzhalter?.beschreibung?.trim() ?? ''
  const geschehen =
    i.art === 'praesenz'
      ? [titel, i.anweisung.trim() || beschreibung].filter(Boolean).join(' · ')
      : [`${titel} (${artLabel(i.art)})`, beschreibung ? kurz(beschreibung, 200) : ''].filter(Boolean).join(' · ')
  return {
    id: neuePhasenId(),
    phase: phasenNameFuer(i.art),
    minuten: Math.max(1, Math.round(s.minuten ?? 10)),
    geschehen,
    sozialform: i.art === 'praesenz' ? 'UG' : 'EA',
    medien: istMaterial(s) ? `${artLabel(i.art)}: ${titel}${s.platzhalter ? ' (noch zu erstellen)' : ''}` : '',
    ...(istMaterial(s) ? { schritte: [s.id] } : {})
  }
}

/**
 * Schritte als Phasen in ihre Stunden eintragen (an vorhandene Verläufe angehängt). Nicht-Pflichtschritte (Förder-,
 * Forder-, Wahl-, optionale Schritte) laufen neben dem gemeinsamen Weg: Sie werden der vorigen Phase ihrer Stunde als
 * Material beigegeben statt die Stunde rechnerisch zu überfüllen. Rückgabe: neue Verläufe und die Schritte, die ganz
 * in Phasen aufgegangen sind („Im Unterricht").
 */
export function schritteAlsPhasen(r: Pick<Reihe, 'stunden' | 'verlauf'>, schritte: Schritt[]): { verlauf: NonNullable<Reihe['verlauf']>; aufgegangen: string[] } {
  const n = r.stunden?.length ?? 0
  const verlauf: NonNullable<Reihe['verlauf']> = Object.fromEntries(Object.entries(r.verlauf ?? {}).map(([k, v]) => [k, { ...v, phasen: [...v.phasen] }]))
  const aufgegangen: string[] = []
  for (const s of schritte) {
    if (s.stunde === undefined || s.stunde < 0 || s.stunde >= n) continue
    const p = (verlauf[String(s.stunde)] ??= { phasen: [] })
    // Beigeben: der letzten Phase mit Material (Förderung gehört zur Erarbeitung, nicht zum Unterrichtsgespräch danach)
    let k = p.phasen.map((x) => Boolean(x.schritte?.length)).lastIndexOf(true)
    if (k < 0) k = p.phasen.length - 1
    const vorige = p.phasen[k]
    if (s.rolle !== 'pflicht' && vorige && istMaterial(s)) {
      const was = s.rolle === 'foerder' ? 'Förderung' : s.rolle === 'forder' ? 'Forder' : s.rolle === 'wahl' ? 'Wahl' : 'optional'
      p.phasen[k] = {
        ...vorige,
        medien: [vorige.medien, `${was}: ${s.titel.trim() || artLabel(s.inhalt.art)}`].filter(Boolean).join(', '),
        schritte: [...(vorige.schritte ?? []), s.id]
      }
      continue
    }
    p.phasen.push(phaseAusSchritt(s))
    if (!istMaterial(s)) aufgegangen.push(s.id)
  }
  return { verlauf, aufgegangen }
}

/** digital/gemischt → Planung: Schritte werden Phasen in ihrer Stunde, Material bleibt verknüpft */
export function zuPlanung(r: Reihe): Reihe {
  const { verlauf, aufgegangen } = schritteAlsPhasen({ stunden: r.stunden, verlauf: {} }, r.schritte)
  return { ...r, art: 'planung', verlauf, schritte: r.schritte.filter((s) => !aufgegangen.includes(s.id)) }
}

/** Erster Stichpunkt des Geschehens als Teil eines Titels */
const titelAus = (p: ReihenPhase): string => {
  const erster = p.geschehen.split(' · ')[0]?.trim() ?? ''
  return [p.phase.trim() || 'Phase', erster ? kurz(erster, 50) : ''].filter(Boolean).join(' – ')
}

/** Platzhalter aus einer Phase ohne Material */
function platzhalterAusPhase(p: ReihenPhase, stunde: number, ziel: Exclude<ReiheArt, 'planung'>): Schritt {
  const art: SchrittArt = ziel === 'digital' ? 'aufgabe' : 'praesenz'
  const inhalt = leererInhalt(art)
  const text = [p.geschehen.trim(), p.sozialform ? `Sozialform: ${p.sozialform}` : '', p.medien.trim() ? `Medien: ${p.medien.trim()}` : '']
    .filter(Boolean)
    .join(' · ')
  return {
    id: neueSchrittId(),
    titel: titelAus(p),
    lernziele: [],
    rolle: 'pflicht',
    erfolg: standardErfolg(art, ziel),
    inhalt: inhalt.art === 'praesenz' ? { ...inhalt, anweisung: p.geschehen.trim() } : inhalt,
    stunde,
    minuten: p.minuten,
    platzhalter: { beschreibung: `${p.phase.trim() || 'Phase'}: ${text || 'aus der Unterrichtsplanung'}` },
    ...(ziel === 'digital' ? { ersetzen: true } : {})
  }
}

/** Planung → digital/gemischt: Phasen mit Material werden Schritte, die übrigen Platzhalter; Verläufe entfallen */
export function ausPlanung(r: Reihe, ziel: Exclude<ReiheArt, 'planung'>): Reihe {
  const nachId = new Map(r.schritte.map((s) => [s.id, s]))
  const benutzt = new Set<string>()
  const neu: Schritt[] = []
  const n = r.stunden?.length ?? 0
  for (let i = 0; i < n; i++) {
    const p = verlaufVon(r, i)
    for (const ph of p.phasen) {
      const verknuepft = (ph.schritte ?? []).map((id) => nachId.get(id)).filter((s): s is Schritt => Boolean(s) && !benutzt.has(s!.id))
      if (!verknuepft.length) {
        neu.push(platzhalterAusPhase(ph, i, ziel))
        continue
      }
      for (const s of verknuepft) {
        benutzt.add(s.id)
        neu.push({ ...s, stunde: i, ...(s.minuten === undefined && verknuepft.length === 1 ? { minuten: ph.minuten } : {}) })
      }
    }
    // Material der Stunde, das in keiner Phase steht
    for (const s of r.schritte)
      if (s.stunde === i && !benutzt.has(s.id)) {
        benutzt.add(s.id)
        neu.push(s)
      }
    if (p.hausaufgabe?.trim()) {
      const inhalt = leererInhalt('aufgabe')
      neu.push({
        id: neueSchrittId(),
        titel: 'Hausaufgabe',
        lernziele: [],
        rolle: 'pflicht',
        erfolg: standardErfolg('aufgabe'),
        inhalt: inhalt.art === 'aufgabe' ? { ...inhalt, anweisung: p.hausaufgabe.trim() } : inhalt,
        stunde: i,
        platzhalter: { beschreibung: `Hausaufgabe: ${p.hausaufgabe.trim()}` }
      })
    }
  }
  for (const s of r.schritte) if (!benutzt.has(s.id)) neu.push(s)
  // Teile: Neue Schritte gehören zum Teil ihres Vorgängers (bzw. Nachfolgers) – sonst rutschten sie beim Ordnen nach vorn
  if ((r.teile?.length ?? 0) > 0 || r.schritte.some((s) => s.abschnitt)) {
    const neueIds = new Set(neu.filter((s) => !nachId.has(s.id)).map((s) => s.id))
    for (let k = 0; k < neu.length; k++) {
      if (!neueIds.has(neu[k].id) || neu[k].abschnitt) continue
      const nachbar = [...neu.slice(0, k)].reverse().find((s) => s.abschnitt) ?? neu.slice(k + 1).find((s) => s.abschnitt)
      if (nachbar?.abschnitt) neu[k] = { ...neu[k], abschnitt: nachbar.abschnitt }
    }
  }
  return { ...r, art: ziel, schritte: neu, verlauf: undefined }
}

/** Reihenart wechseln – mit Umwandlung (siehe Kopf) */
export function wechsleArt(r: Reihe, nach: ReiheArt): Reihe {
  const von = artVon(r)
  if (von === nach) return r
  if (nach === 'planung') return zuPlanung(r)
  if (von === 'planung') return ausPlanung(r, nach)
  return { ...r, art: nach }
}

const zahl = (n: number, eins: string, viele: string): string => `${n} ${n === 1 ? eins : viele}`

/** Was beim Wechsel geschieht – für die Rückfrage */
export function wechselHinweis(r: Reihe, nach: ReiheArt): string[] {
  const von = artVon(r)
  if (von === nach) return []
  const n = r.stunden?.length ?? 0
  const imRaster = (s: Schritt): boolean => s.stunde !== undefined && s.stunde >= 0 && s.stunde < n
  if (nach === 'planung') {
    const inStunden = r.schritte.filter(imRaster)
    const praesenz = inStunden.filter((s) => !istMaterial(s)).length
    const ohne = r.schritte.length - inStunden.length
    return [
      inStunden.length
        ? `${zahl(inStunden.length, 'Schritt wird zur Phase', 'Schritte werden zu Phasen')} in ${inStunden.length === 1 ? 'seiner' : 'ihrer'} Stunde; Materialien bleiben verknüpft.`
        : 'Es liegen noch keine Schritte in Stunden – die Verläufe beginnen leer.',
      praesenz ? `${zahl(praesenz, 'Schritt „Im Unterricht“ geht', 'Schritte „Im Unterricht“ gehen')} ganz in den Phasen auf.` : '',
      ohne ? `${zahl(ohne, 'Schritt ohne Stunde bleibt', 'Schritte ohne Stunde bleiben')} als Material erhalten.` : '',
      'Eine Planungsreihe wird nicht zugewiesen und hat keine Schüleransicht.'
    ].filter(Boolean)
  }
  if (von === 'planung') {
    const phasen = Array.from({ length: n }, (_, i) => verlaufVon(r, i).phasen).flat()
    const mit = phasen.filter((p) => p.schritte?.some((id) => r.schritte.some((s) => s.id === id))).length
    const ohne = phasen.length - mit
    const ha = Array.from({ length: n }, (_, i) => verlaufVon(r, i).hausaufgabe?.trim()).filter(Boolean).length
    return [
      mit ? `${zahl(mit, 'Phase mit Material wird', 'Phasen mit Material werden')} zu Schritten mit diesem Material.` : '',
      ohne
        ? `${zahl(ohne, 'Phase ohne Material wird ein Platzhalter', 'Phasen ohne Material werden Platzhalter')}${
            nach === 'digital' ? ' (Zwischenaufgabe, markiert „bitte ersetzen“ – daraus muss noch eine Aufgabe am Gerät werden).' : ' („Im Unterricht“ mit dem geplanten Geschehen).'
          }`
        : '',
      ha ? `${zahl(ha, 'Hausaufgabe wird ein Platzhalter', 'Hausaufgaben werden Platzhalter')}.` : '',
      'Die Stundenverläufe (Sozialform, Medien) entfallen danach.'
    ].filter(Boolean)
  }
  const praesenz = r.schritte.filter((s) => s.inhalt.art === 'praesenz').length
  if (nach === 'digital')
    return [
      praesenz
        ? `${zahl(praesenz, 'Schritt „Im Unterricht“ geht', 'Schritte „Im Unterricht“ gehen')} nicht am Gerät – ${praesenz === 1 ? 'er wird' : 'sie werden'} markiert und ${praesenz === 1 ? 'sollte' : 'sollten'} ersetzt werden.`
        : 'Nichts wird umgebaut.',
      'Neue Schritte „Im Unterricht“ und Präsenzphasen in der KI-Planung entfallen.'
    ]
  return ['Nichts wird umgebaut – du kannst danach auch Phasen „Im Unterricht“ einplanen.']
}

// ---------------------------------------------------------------- KI-Verlauf je Stunde

/** Kennung eines Schritts der Stunde in der Anfrage: [S1], [S2] … (Reihenfolge der Stunde) */
export const schrittKennung = (k: number): string => `[S${k + 1}]`

/** Verweise [S1] im Text auflösen: verknüpfte Schritte und lesbarer Text („Titel") */
export function kennungenAufloesen(text: string, schritte: Pick<Schritt, 'id' | 'titel'>[]): { text: string; ids: string[] } {
  const ids: string[] = []
  const neu = text.replace(/\[?\bS(\d{1,2})\b\]?/g, (ganz, nr: string) => {
    const s = schritte[Number(nr) - 1]
    if (!s) return ganz
    if (!ids.includes(s.id)) ids.push(s.id)
    return `„${s.titel.trim() || `Schritt ${nr}`}“`
  })
  return { text: neu, ids }
}

/**
 * Antwort der KI → Verlauf der Stunde: Minuten passend zur Länge (verlaufAus), Hausaufgaben-Phase ins Feld
 * „Hausaufgabe", Impuls knapp ins Geschehen, Verweise [S1] als Verknüpfung zum Schritt.
 */
export function planungAusKi(daten: unknown, laenge: number, schritte: Pick<Schritt, 'id' | 'titel'>[]): StundenPlanung {
  const v = verlaufAus(daten, laenge)
  const ha = v.phasen.filter((p) => /hausaufgabe/i.test(p.phase))
  let phasen = v.phasen.filter((p) => !ha.includes(p))
  if (!phasen.length) phasen = v.phasen
  else if (ha.length) phasen = minutenAngleichen({ ...v, phasen }).phasen
  const aus = phasen.map((p): ReihenPhase => {
    const g = kennungenAufloesen(p.impuls && !p.geschehen.includes(p.impuls.titel) ? `${impulsKurz(p.impuls)} · ${p.geschehen}` : p.geschehen, schritte)
    const m = kennungenAufloesen(p.medien, schritte)
    const ids = [...new Set([...m.ids, ...g.ids])]
    return { id: neuePhasenId(), phase: p.phase, minuten: p.minuten, geschehen: g.text, sozialform: p.sozialform, medien: m.text, ...(ids.length ? { schritte: ids } : {}) }
  })
  const hausaufgabe = ha
    .map((p) => kennungenAufloesen([p.geschehen, p.medien].filter(Boolean).join(' · '), schritte).text)
    .filter(Boolean)
    .join(' · ')
  return {
    phasen: aus,
    ...(v.ziel ? { ziel: v.ziel } : {}),
    ...(hausaufgabe && ha.length && phasen !== v.phasen ? { hausaufgabe } : {}),
    ...(v.hinweise ? { hinweise: v.hinweise } : {})
  }
}

// ---------------------------------------------------------------- Digitale Reihe

/** Geht der Schritt in einer digitalen Reihe nicht am Gerät? („Im Unterricht") */
export const nichtAmGeraet = (r: Pick<Reihe, 'art'>, s: Pick<Schritt, 'inhalt'>): boolean => artVon(r) === 'digital' && s.inhalt.art === 'praesenz'

/**
 * Neue Schritte für eine digitale Reihe (KI-Plan, Schulbuch): „Im Unterricht" wird ein Platzhalter „Zwischenaufgabe" mit
 * derselben Beschreibung – die KI-Planung schlägt ihn dort ohnehin nicht vor, die Schulbuch-Planung kennt die Art aber.
 */
export function fuerDigital(schritte: Schritt[]): Schritt[] {
  return schritte.map((s) => {
    if (s.inhalt.art !== 'praesenz') return s
    const beschreibung = s.platzhalter?.beschreibung || s.inhalt.anweisung || s.titel
    return {
      ...s,
      inhalt: leererInhalt('aufgabe'),
      erfolg: standardErfolg('aufgabe'),
      platzhalter: { ...(s.platzhalter ?? {}), beschreibung },
      ersetzen: true
    }
  })
}
