/**
 * Grammatik-Bereiche und Ampel (08.10.2026, abgestimmt mit der Lehrkraft): Über die Jahre kommen viele Grammatikregeln
 * zusammen. Lehrkraft (Details je Lernende/r) und Lernende (Seite nach Regeln) gliedern sie deshalb nach Bereichen
 * („Zeiten & Verben", „Satzbau" …). Der Bereich folgt aus der Katalog-Kennung der Freigabe („en.verb.past_simple" →
 * zweites Glied „verb"); dasselbe Schema gilt für fr/es/it/la/de/daz. Regeln ohne Kennung landen unter „Weiteres".
 *
 * Ampel mit denselben Schwellen wie der Server (server/grammatik.ts): Schwäche unter 60 % ab 5 Versuchen, sicher ab
 * 85 % mit Fach ≥ 3, sonst im Aufbau; unter 5 Versuchen „zu wenig geübt".
 *
 * Rein (ohne Abhängigkeiten) – die Lehrwerk-Daten werden übergeben (tests/grammatikBereiche.test.ts).
 */

export type BereichId =
  | 'zeiten'
  | 'satzbau'
  | 'nomen'
  | 'pronomen'
  | 'adjektive'
  | 'nebensaetze'
  | 'bedingung'
  | 'rede'
  | 'praep'
  | 'wortbildung'
  | 'weiteres'

/** Bereiche in fester Reihenfolge */
export const BEREICHE: readonly { id: BereichId; name: string }[] = [
  { id: 'zeiten', name: 'Zeiten & Verben' },
  { id: 'satzbau', name: 'Satzbau' },
  { id: 'nomen', name: 'Nomen & Begleiter' },
  { id: 'pronomen', name: 'Pronomen' },
  { id: 'adjektive', name: 'Adjektive & Adverbien' },
  { id: 'nebensaetze', name: 'Nebensätze' },
  { id: 'bedingung', name: 'Bedingungssätze' },
  { id: 'rede', name: 'Indirekte Rede' },
  { id: 'praep', name: 'Präpositionen' },
  { id: 'wortbildung', name: 'Wortbildung' },
  { id: 'weiteres', name: 'Weiteres' }
]
export const bereichName = (id: BereichId): string => BEREICHE.find((b) => b.id === id)?.name ?? 'Weiteres'

/** Satzbau-Kennungen, die eigentlich Nebensätze, Bedingungssätze oder indirekte Rede sind (fr/es/it/la/de/daz) */
const REDE = /indirect|indiretto|indirekte_rede|oratio_obliqua|direkt_indirekt/
const BEDINGUNG = /bedingung|konditional|periodo/
const NEBENSATZ = /nebensatz|subordinat|sub_adverbiaux|relativsatz|consecutio|gliedsaetze|adverbialsatz/

/** Bereich einer Katalog-Kennung („en.verb.past_simple" oder Teilform „en.verb.past_simple/fragen") */
export function bereichVonKennung(kennung: string): BereichId {
  const [, glied = '', rest = ''] = kennung.split('/')[0].toLowerCase().split('.')
  switch (glied) {
    case 'verb':
      return 'zeiten'
    case 'form':
      // Latein: Formenlehre nach Wortart
      if (rest.startsWith('subst')) return 'nomen'
      if (rest.startsWith('adj') || rest.startsWith('komparation')) return 'adjektive'
      if (rest.startsWith('pron')) return 'pronomen'
      return 'zeiten'
    case 'syn':
    case 'satz':
      // en.syn.indirect_questions bleibt Satzbau (Fragestellung, keine indirekte Rede)
      if (REDE.test(rest) && rest !== 'indirect_questions') return 'rede'
      if (BEDINGUNG.test(rest)) return 'bedingung'
      if (NEBENSATZ.test(rest)) return 'nebensaetze'
      return 'satzbau'
    case 'focus':
      return 'satzbau'
    case 'clause':
      return 'nebensaetze'
    case 'cond':
      return 'bedingung'
    case 'reported':
    case 'rede':
      return 'rede'
    case 'noun':
    case 'nom':
    case 'num':
    case 'kasus':
      return 'nomen'
    case 'pron':
      return 'pronomen'
    case 'adj':
    case 'adv':
      return 'adjektive'
    case 'prep':
    case 'praep':
      return 'praep'
    case 'wf':
      return 'wortbildung'
    case 'wort':
      return rest === 'wortbildung' ? 'wortbildung' : 'weiteres'
    default:
      return 'weiteres'
  }
}

const woerter = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)

/**
 * Bereich einer Regel aus den Kennungen ihrer Freigabe. Gehören die Kennungen zu verschiedenen Bereichen, entscheidet
 * die Überschneidung der Wörter von Regeltitel und Kennung („Simple past: Fragen" ↔ „past_simple"), auf Wunsch auch
 * mit weiteren Namen je Kennung (Katalog-Bezeichnung). Ohne Kennung: „Weiteres".
 */
export function bereichVonRegel(titel: string, kennungen: readonly string[], namen?: (kennung: string) => string[]): BereichId {
  const ks = [...new Set(kennungen.filter(Boolean))]
  if (!ks.length) return 'weiteres'
  const bereiche = [...new Set(ks.map(bereichVonKennung))]
  if (bereiche.length === 1) return bereiche[0]
  const t = new Set(woerter(titel))
  let best: { b: BereichId; punkte: number } = { b: bereichVonKennung(ks[0]), punkte: 0 }
  for (const k of ks) {
    const kw = new Set([...woerter(k.split('.').slice(2).join(' ')), ...(namen?.(k) ?? []).flatMap(woerter)])
    const punkte = [...kw].filter((w) => t.has(w)).length
    if (punkte > best.punkte) best = { b: bereichVonKennung(k), punkte }
  }
  return best.b
}

// ---------------------------------------------------------------- Ampel (Schwellen wie server/grammatik.ts)

export const SCHWAECHE_UNTER = 0.6
export const STAERKE_AB = 0.85
export const MIN_VERSUCHE = 5
export const STAERKE_FACH = 3

export type Ampel = 'sicher' | 'aufbau' | 'schwaeche' | 'wenig'
export const AMPEL_NAME: Record<Ampel, string> = { sicher: 'sicher', aufbau: 'im Aufbau', schwaeche: 'Schwäche', wenig: 'zu wenig geübt' }

/** Ampel einer Regel; `fach` = mittleres Fach der geübten Aufgaben (ältere Server ohne Angabe: nur nach Anteil) */
export function ampelVon(p: { versuche: number; quote: number; fach?: number }): Ampel {
  if (p.versuche < MIN_VERSUCHE) return 'wenig'
  if (p.quote < SCHWAECHE_UNTER) return 'schwaeche'
  if (p.quote >= STAERKE_AB && (p.fach ?? STAERKE_FACH) >= STAERKE_FACH) return 'sicher'
  return 'aufbau'
}

/** Länger nicht geübt (Vorgabe 3 Wochen) – `zuletzt` in ms; ohne Angabe nie */
export const langeNichtGeuebt = (zuletzt: number | undefined, jetzt = Date.now(), wochen = 3): boolean =>
  Boolean(zuletzt) && jetzt - (zuletzt ?? 0) > wochen * 7 * 864e5

/**
 * Empfehlung für Fördern/Fordern (abgestimmt): mindestens eine Schwäche → Fördern (Vorrang, auch bei Stärken);
 * sonst mindestens eine Stärke → Fordern; sonst kein Befund („erst mehr üben" bzw. „im Aufbau").
 */
export function empfehlung(regeln: readonly { versuche: number; quote: number; fach?: number }[]): {
  art: 'foerder' | 'forder' | null
  text: string
  schwaechen: number
  staerken: number
} {
  const a = regeln.map(ampelVon)
  const schwaechen = a.filter((x) => x === 'schwaeche').length
  const staerken = a.filter((x) => x === 'sicher').length
  const mehr = (n: number, eins: string, viele: string): string => `${n} ${n === 1 ? eins : viele}`
  if (schwaechen)
    return {
      art: 'foerder',
      text: staerken ? `${mehr(schwaechen, 'Schwäche', 'Schwächen')}, ${mehr(staerken, 'Stärke', 'Stärken')}` : mehr(schwaechen, 'Schwäche', 'Schwächen'),
      schwaechen,
      staerken
    }
  if (staerken) return { art: 'forder', text: `${mehr(staerken, 'Stärke', 'Stärken')}, keine Schwäche`, schwaechen, staerken }
  return { art: null, text: a.some((x) => x === 'aufbau') ? 'im Aufbau – noch kein klarer Befund' : 'erst mehr üben', schwaechen, staerken }
}

// ---------------------------------------------------------------- Lehrwerk-Stelle (Units-Ansicht)

/** Lehrwerk-Daten wie LEHRWERK_GRAMMATIK: Band → Kapitel → Station → Punkte mit Kennungen */
export type LehrwerkDaten = Record<string, Record<string, Record<string, readonly { t: readonly string[] }[]>>>

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Band der Liste zu einer Lehrwerk-Kennung oder einem Namen („green-line-2-nds" → „Green Line 2") */
export function bandVon(lehrwerk: string, daten: LehrwerkDaten): string | undefined {
  const n = norm(lehrwerk)
  if (!n) return undefined
  return Object.keys(daten)
    .filter((b) => n.startsWith(norm(b)))
    .sort((a, b) => b.length - a.length)[0]
}

/** Bände derselben Reihe in Buchreihenfolge („Green Line 1" … „Green Line 6") */
export function reiheVon(band: string, daten: LehrwerkDaten): string[] {
  const stamm = band.replace(/\s*\d+\s*$/, '')
  return Object.keys(daten).filter((b) => b.replace(/\s*\d+\s*$/, '') === stamm)
}

/**
 * Wo im Lehrwerk die Regel eingeführt wurde: erste Unit der Reihe (frühere Bände zuerst), die eine der Kennungen nennt
 * (Thema oder Teilform). Wiederholungen zählen nicht, solange es eine Einführung gibt. `rang` ordnet chronologisch.
 */
export function lehrwerkStelle(
  kennungen: readonly string[],
  band: string | undefined,
  daten: LehrwerkDaten
): { buch: string; unit: string; rang: number } | null {
  if (!band || !daten[band] || !kennungen.length) return null
  const themen = new Set(kennungen.map((k) => k.split('/')[0]))
  const trifft = (t: readonly string[]): boolean => t.some((x) => themen.has(x.split('/')[0]))
  const baende = reiheVon(band, daten)
  for (const nurNeu of [true, false])
    for (const [bi, b] of baende.entries()) {
      for (const [ki, k] of Object.keys(daten[b]).entries()) {
        const punkte = Object.values(daten[b][k]).flat() as { t: readonly string[]; w?: true }[]
        if (punkte.some((p) => (!nurNeu || !p.w) && trifft(p.t))) return { buch: b, unit: k, rang: bi * 1000 + ki }
      }
    }
  return null
}

/** Rang einer bekannten Stelle (Freigabe mit Band und Unit) in der Reihe des Kurses; unbekannt: null */
export function stellenRang(buch: string, unit: string, daten: LehrwerkDaten): number | null {
  if (!daten[buch]) return null
  const bi = reiheVon(buch, daten).indexOf(buch)
  const ki = Object.keys(daten[buch]).indexOf(unit)
  return bi < 0 || ki < 0 ? null : bi * 1000 + ki
}
