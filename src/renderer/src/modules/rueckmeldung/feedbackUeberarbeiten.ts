/**
 * Zauberstab am Blatt der Rückmeldung (29.09.2026, Wunsch der Lehrkraft): Eine einzelne Stelle
 * des Bogens – Stärken, nächste Schritte, ein Kriterium, Schlusssatz, Überarbeitungsauftrag, eine
 * Randnotiz oder der ganze Kasten – neu erzeugen, überarbeiten oder nach einem Hinweis der
 * Lehrkraft überarbeiten („freundlicher", „konkreter mit Beispiel", „auf Englisch").
 *
 * Nur diese Stelle wird ersetzt; der Rest des Bogens bleibt. Es gelten dieselben Regeln wie beim
 * Bogen (generation.ts): keine Note im Text, Personen nur mit Kürzel, Nachteilsausgleich nur als
 * Maßnahme, Randnotiz-Zitate wörtlich aus der Arbeit, Korrekturzeichen nur aus der Liste des
 * Fachs. Die Antwort läuft durch `pruefeBogen` – was nach Note aussieht, fliegt heraus.
 *
 * Diese Datei kennt weder React noch den Store (Tests ohne Oberfläche); den Hintergrund-Auftrag
 * startet stelleAuftrag.ts.
 */
import type { StructuredRequest } from '@shared/types'
import { ersetzeNamen, type Zuordnung } from '@shared/pseudonymisierung'
import { arr, enumOf, int, obj, str, type Schema } from '../../shared/aiSchema'
import { einstufungVon, hatForm, kriterienEinstufen, vorschlag, type SkalenKontext } from './art'
import { findeZitat } from './korrekturrand'
import { kiLandesregeln } from './laenderRegeln'
import { ausgleichAnweisung, maxSchritte, ohneRechtschreibung } from './nachteilsausgleich'
import { ohneNamen, pruefeBogen, type BogenKontext } from './generation'
import type { Abgabe, Bogen, BogenKriterium, Einschaetzung, Einstufungswert, RandKommentar, Rueckmeldung } from './model/types'

/** Die Stelle des Bogens, die der Zauberstab bearbeitet */
export type Stelle =
  | { art: 'staerken' }
  | { art: 'schritte' }
  | { art: 'kriterium'; index: number }
  | { art: 'schluss' }
  | { art: 'ueberarbeitung' }
  | { art: 'rand'; id: string }
  | { art: 'kasten' }

/** neu = ganz neue Fassung · ueberarbeiten = verbessern · hinweis = nach dem Hinweis der Lehrkraft */
export type StellenModus = 'neu' | 'ueberarbeiten' | 'hinweis'

export const stelleSchluessel = (s: Stelle): string => (s.art === 'kriterium' ? `kriterium-${s.index}` : s.art === 'rand' ? `rand-${s.id}` : s.art)

/** Schlüssel des Hintergrund-Auftrags – daran erkennt das Blatt, wo gerade ein Lader steht */
export const stelleAuftragsSchluessel = (docId: string, abgabeId: string, s: Stelle): string => `rueckmeldung-stelle-${docId}-${abgabeId}-${stelleSchluessel(s)}`

export const STELLEN_NAME: Record<Stelle['art'], string> = {
  staerken: 'Stärken',
  schritte: 'Nächste Schritte',
  kriterium: 'Kriterium',
  schluss: 'Schlusssatz',
  ueberarbeitung: 'Überarbeitungsauftrag',
  rand: 'Randnotiz',
  kasten: 'Rückmeldung'
}

const EINSCHAETZUNGEN: Einschaetzung[] = ['sicher', 'teilweise', 'noch nicht']

/** Namen → Kürzel für alles, was an die KI geht (auch was die Lehrkraft selbst getippt hat) */
function anonymisierer(a: Abgabe): (s: string) => string {
  const zuordnung: Zuordnung[] = [...(a.pseudonyme ?? []), ...(a.name.trim() ? [{ kuerzel: a.kuerzel, name: a.name.trim() }] : [])]
  if (!zuordnung.length) return (s) => s
  return (s) =>
    ersetzeNamen(
      s,
      zuordnung.map((z) => z.name),
      zuordnung
    ).text
}

/** Welche Teile der Kasten „als Ganzes" umfasst – dieselben wie auf dem Blatt */
function kastenTeile(r: Rueckmeldung, b: Bogen): { staerken: boolean; schritte: boolean; kriterien: boolean; schluss: boolean; ueberarbeitung: boolean } {
  const m = r.meta
  return {
    staerken: hatForm(m, 'schriftlich'),
    schritte: hatForm(m, 'tipps'),
    kriterien: hatForm(m, 'schriftlich') || (kriterienEinstufen(m) && b.kriterien.length > 0),
    schluss: hatForm(m, 'schriftlich'),
    ueberarbeitung: hatForm(m, 'ueberarbeitung') || Boolean(b.ueberarbeitung)
  }
}

const kriteriumSchema = (mitAnteil: boolean): Schema =>
  obj({
    kriterium: str('Kriterium aus der Aufgabe bzw. dem Schwerpunkt der Lehrkraft'),
    einschaetzung: enumOf(EINSCHAETZUNGEN),
    beleg: str('Kurzes Zitat oder Stelle aus der Arbeit, die die Einschätzung belegt'),
    ...(mitAnteil ? { anteil: int('Erfüllungsgrad dieses Kriteriums in Prozent (0–100)') } : {})
  })

/** Antwortschema: nur die Stelle */
export function stelleSchema(r: Rueckmeldung, a: Abgabe, s: Stelle, ctx: BogenKontext = { zeichen: [] }): Schema {
  const b = a.bogen ?? { staerken: [], schritte: [], kriterien: [] }
  switch (s.art) {
    case 'staerken':
      return obj({ staerken: arr(str('Was schon gelingt – konkret, mit Bezug auf eine Stelle der Arbeit, ein Satz')) })
    case 'schritte':
      return obj({ schritte: arr(str('Nächster Schritt als Handlung, ein Satz, mit Beispiel aus der Arbeit')) })
    case 'kriterium':
      return obj({ kriterium: kriteriumSchema(false) })
    case 'schluss':
      return obj({ schluss: str('Ein ermutigender, ehrlicher Schlusssatz – ohne Floskel') })
    case 'ueberarbeitung':
      return obj({
        ueberarbeitung: obj({
          zitat: str('Die Stelle, die überarbeitet werden soll, wörtlich (ein Satz oder Absatzanfang)'),
          auftrag: str('Konkreter Überarbeitungsauftrag als Handlung, 1–3 Sätze')
        })
      })
    case 'rand':
      return obj({
        rand: obj({
          zitat: str('Die Stelle WÖRTLICH aus der Arbeit, 1–8 Wörter, genau so geschrieben wie dort (auch mit Fehlern)'),
          text: str('Kommentar am Rand: kurz, konkret, bei Fehlern mit Verbesserung'),
          zeichen: enumOf(['', ...ctx.zeichen.map((z) => z.zeichen).filter(Boolean)]),
          art: enumOf(['lob', 'fehler', 'hinweis'])
        })
      })
    case 'kasten': {
      const t = kastenTeile(r, b)
      const felder: Record<string, Schema> = {}
      if (t.staerken) felder.staerken = arr(str('Was schon gelingt – konkret, mit Bezug auf eine Stelle der Arbeit, ein Satz'))
      if (t.schritte) felder.schritte = arr(str('Nächster Schritt als Handlung, ein Satz, mit Beispiel aus der Arbeit'))
      if (t.kriterien) felder.kriterien = arr(kriteriumSchema(kriterienEinstufen(r.meta)))
      if (t.schluss) felder.schluss = str('Ein ermutigender, ehrlicher Schlusssatz – ohne Floskel')
      if (t.ueberarbeitung)
        felder.ueberarbeitung = obj({
          zitat: str('Die Stelle, die überarbeitet werden soll, wörtlich'),
          auftrag: str('Konkreter Überarbeitungsauftrag als Handlung, 1–3 Sätze')
        })
      return obj(felder)
    }
  }
}

const kriteriumText = (k: BogenKriterium): string => `${k.kriterium} – ${k.einschaetzung}${k.beleg ? ` – Beleg: „${k.beleg}“` : ''}`
const randText = (k: RandKommentar): string => `„${k.zitat}“ → ${k.zeichen ? `${k.zeichen}: ` : ''}${k.text} (${k.art})`

/** Die bisherige Fassung einer Stelle als Text */
export function stelleText(b: Bogen, s: Stelle): string {
  switch (s.art) {
    case 'staerken':
      return b.staerken.map((x) => `- ${x}`).join('\n') || '(leer)'
    case 'schritte':
      return b.schritte.map((x, i) => `${i + 1}. ${x}`).join('\n') || '(leer)'
    case 'kriterium':
      return b.kriterien[s.index] ? kriteriumText(b.kriterien[s.index]) : '(leer)'
    case 'schluss':
      return b.schluss?.trim() || '(leer)'
    case 'ueberarbeitung':
      return b.ueberarbeitung ? `Stelle: „${b.ueberarbeitung.zitat}“\nAuftrag: ${b.ueberarbeitung.auftrag}` : '(leer)'
    case 'rand': {
      const k = b.rand?.find((x) => x.id === s.id)
      return k ? randText(k) : '(leer)'
    }
    case 'kasten':
      return [
        b.staerken.length ? `STÄRKEN:\n${stelleText(b, { art: 'staerken' })}` : '',
        b.schritte.length ? `NÄCHSTE SCHRITTE:\n${stelleText(b, { art: 'schritte' })}` : '',
        b.kriterien.length ? `KRITERIEN:\n${b.kriterien.map((k) => `- ${kriteriumText(k)}`).join('\n')}` : '',
        b.ueberarbeitung ? `ÜBERARBEITUNGSAUFTRAG:\n${stelleText(b, { art: 'ueberarbeitung' })}` : '',
        b.schluss ? `SCHLUSSSATZ: ${b.schluss}` : ''
      ]
        .filter(Boolean)
        .join('\n\n')
  }
}

/** Der übrige Bogen (zur Abstimmung, damit sich nichts wiederholt) */
function uebrigerBogen(b: Bogen, s: Stelle): string {
  if (s.art === 'kasten') return (b.rand ?? []).length ? `RANDNOTIZEN:\n${(b.rand ?? []).map((k) => `- ${randText(k)}`).join('\n')}` : ''
  const teile: string[] = []
  if (s.art !== 'staerken' && b.staerken.length) teile.push(`STÄRKEN:\n${stelleText(b, { art: 'staerken' })}`)
  if (s.art !== 'schritte' && b.schritte.length) teile.push(`NÄCHSTE SCHRITTE:\n${stelleText(b, { art: 'schritte' })}`)
  const kriterien = b.kriterien.filter((_, i) => !(s.art === 'kriterium' && s.index === i))
  if (kriterien.length) teile.push(`KRITERIEN:\n${kriterien.map((k) => `- ${kriteriumText(k)}`).join('\n')}`)
  if (s.art !== 'ueberarbeitung' && b.ueberarbeitung) teile.push(`ÜBERARBEITUNGSAUFTRAG:\n${stelleText(b, { art: 'ueberarbeitung' })}`)
  if (s.art !== 'schluss' && b.schluss) teile.push(`SCHLUSSSATZ: ${b.schluss}`)
  const rand = (b.rand ?? []).filter((k) => !(s.art === 'rand' && s.id === k.id))
  if (rand.length) teile.push(`RANDNOTIZEN:\n${rand.map((k) => `- ${randText(k)}`).join('\n')}`)
  return teile.join('\n\n')
}

const BESCHREIBUNG: Record<Stelle['art'], string> = {
  staerken: 'die Liste „Das gelingt schon" (2–4 Stärken)',
  schritte: 'die Liste der nächsten Schritte',
  kriterium: 'EIN Kriterium mit Einschätzung und Beleg',
  schluss: 'den persönlichen Schlusssatz',
  ueberarbeitung: 'den Überarbeitungsauftrag zu EINER Stelle',
  rand: 'EINE Randnotiz zu einer Stelle der Arbeit',
  kasten: 'den ganzen Kasten der Rückmeldung (Stärken, nächste Schritte, Kriterien, Überarbeitungsauftrag, Schlusssatz)'
}

/** Anfrage an die KI für eine Stelle – Kontext wie beim Bogen, Namen durch Kürzel ersetzt */
export function stelleAnfrage(
  r: Rueckmeldung,
  a: Abgabe,
  s: Stelle,
  modus: StellenModus,
  hinweis: string,
  system: string,
  ctx: BogenKontext = { zeichen: [] }
): StructuredRequest {
  const b = a.bogen ?? { staerken: [], schritte: [], kriterien: [] }
  const m = r.meta
  const art = einstufungVon(m)
  const anon = anonymisierer(a)
  const zeichenListe = ctx.zeichen.filter((z) => z.zeichen).map((z) => `${z.zeichen} = ${z.bedeutung}`)
  const auftrag =
    modus === 'neu'
      ? 'Schreibe diese Stelle GANZ NEU – eine eigenständige andere Fassung, nicht bloß umformuliert.'
      : modus === 'ueberarbeiten'
        ? 'Verbessere die bisherige Fassung dieser Stelle: konkreter, klarer, näher an der Arbeit und lernförderlicher. Was stimmt, bleibt inhaltlich erhalten.'
        : `Überarbeite die bisherige Fassung dieser Stelle nach dem HINWEIS DER LEHRKRAFT: ${anon(hinweis.trim())}`
  const regeln = [
    '- Liefere NUR diese Stelle; der Rest der Rückmeldung bleibt, wie er ist, und soll sich nicht wiederholen.',
    '- Freundlich und ehrlich; keine Übertreibung, keine allgemeinen Floskeln.',
    '- Personen nur mit ihrem Kürzel nennen (S1, S2 …).',
    art === 'keine'
      ? '- KEINE Note, KEINE Punkte, KEINE Prozentwerte, keine Einstufung wie „gut" oder „ausreichend".'
      : '- In den Texten steht KEINE Note und keine Notenbezeichnung – die Einstufung vergibt die Lehrkraft in ihrem eigenen Feld.',
    s.art === 'schritte' || s.art === 'kasten' ? `- Höchstens ${maxSchritte(a.ausgleich)} nächste Schritte, machbar und nach Wichtigkeit geordnet.` : '',
    s.art === 'rand' || s.art === 'ueberarbeitung' ? '- Das Zitat steht WÖRTLICH so in der Arbeit (auch mit Fehlern); die bisherige Textstelle bleibt, wenn sie passt.' : '',
    s.art === 'rand' && zeichenListe.length ? `- Korrekturzeichen NUR aus dieser Liste (bei Lob und Hinweisen leer): ${zeichenListe.join('; ')}.` : ''
  ]
  return {
    system,
    user: [
      `Überarbeite einen Teil der Rückmeldung zur Arbeit von ${a.kuerzel} (${m.subjectLabel}, Klasse ${m.grade}). Sprich die Person mit „${m.anrede === 'du' ? 'du' : 'Sie'}" an.`,
      `STELLE: ${BESCHREIBUNG[s.art]}.`,
      `AUFTRAG: ${auftrag}`,
      'REGELN:',
      ...regeln,
      kiLandesregeln(m, art),
      ausgleichAnweisung(a.ausgleich),
      m.schwerpunkt.trim() ? `SCHWERPUNKT DER LEHRKRAFT: ${anon(m.schwerpunkt.trim())}` : '',
      `BISHERIGE FASSUNG DIESER STELLE:\n${anon(stelleText(b, s))}`,
      s.art === 'kasten' && !uebrigerBogen(b, s) ? '' : `ÜBRIGE RÜCKMELDUNG (nur zur Abstimmung):\n${anon(uebrigerBogen(b, s)) || '(nichts)'}`,
      `AUFGABE${r.grundlage.titel ? ` (${r.grundlage.titel})` : ''}:`,
      r.grundlage.aufgaben,
      r.grundlage.erwartung ? `ERWARTUNGSHORIZONT:\n${r.grundlage.erwartung}` : '',
      `ARBEIT VON ${a.kuerzel}:`,
      ohneNamen(a).text
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'rueckmeldung_stelle',
    schema: stelleSchema(r, a, s, ctx)
  }
}

/** Die neue Fassung einer Stelle – schon geprüft (keine Note im Text) */
export interface StellenErgebnis {
  staerken?: string[]
  schritte?: string[]
  kriterien?: BogenKriterium[]
  kriterienStufen?: (Einstufungswert | null)[]
  schluss?: string
  ueberarbeitung?: { zitat: string; auftrag: string }
  rand?: Pick<RandKommentar, 'zitat' | 'text' | 'art' | 'zeichen'>
  /** Aussagen, die wegen Note/Punkten entfernt wurden */
  entfernt: number
}

const text = (x: unknown): string => String(x ?? '').trim()
const liste = (x: unknown): string[] => (Array.isArray(x) ? x.map(text).filter(Boolean) : [])
const kriteriumAus = (x: unknown): BogenKriterium | null => {
  const k = (x ?? {}) as Record<string, unknown>
  if (!text(k.kriterium)) return null
  return {
    kriterium: text(k.kriterium),
    einschaetzung: (EINSCHAETZUNGEN.includes(k.einschaetzung as Einschaetzung) ? k.einschaetzung : 'teilweise') as Einschaetzung,
    ...(text(k.beleg) ? { beleg: text(k.beleg) } : {})
  }
}

/**
 * Antwort der KI → neue Fassung der Stelle. Wirft, wenn nichts Brauchbares übrig bleibt (dann
 * bleibt die alte Fassung stehen).
 */
export function stelleAus(daten: unknown, r: Rueckmeldung, a: Abgabe, s: Stelle, skala: SkalenKontext, ctx: BogenKontext = { zeichen: [] }): StellenErgebnis {
  const d = (daten ?? {}) as Record<string, unknown>
  const art = einstufungVon(r.meta)
  const b = a.bogen ?? { staerken: [], schritte: [], kriterien: [] }
  const roh: Bogen = { staerken: [], schritte: [], kriterien: [] }
  let stufen: (Einstufungswert | null)[] | undefined
  const mit = (feld: keyof StellenErgebnis): boolean =>
    s.art === 'kasten' ? feld in ((stelleSchema(r, a, s, ctx) as { properties: Record<string, unknown> }).properties ?? {}) : false
  if (s.art === 'staerken' || mit('staerken')) roh.staerken = liste(d.staerken)
  if (s.art === 'schritte' || mit('schritte')) roh.schritte = liste(d.schritte).slice(0, maxSchritte(a.ausgleich))
  if (s.art === 'kriterium') {
    const k = kriteriumAus(d.kriterium)
    roh.kriterien = k ? [k] : []
  }
  if (mit('kriterien')) {
    const rohK = Array.isArray(d.kriterien) ? (d.kriterien as unknown[]) : []
    roh.kriterien = rohK.map(kriteriumAus).filter((k): k is BogenKriterium => k !== null)
    if (kriterienEinstufen(r.meta)) {
      // Gleich viele Kriterien: bisherige (evtl. bestätigte) Einstufungen bleiben, sonst neue Vorschläge
      stufen =
        roh.kriterien.length === b.kriterien.length && b.kriterienStufen
          ? b.kriterienStufen
          : rohK.map((x) => {
              const an = Number((x as Record<string, unknown>)?.anteil)
              return Number.isFinite(an) ? vorschlag(art, an, skala) : null
            })
      roh.kriterienStufen = stufen
    }
  }
  if (s.art === 'schluss' || mit('schluss')) roh.schluss = text(d.schluss) || undefined
  if (s.art === 'ueberarbeitung' || mit('ueberarbeitung')) {
    const u = (d.ueberarbeitung ?? {}) as Record<string, unknown>
    if (text(u.auftrag)) roh.ueberarbeitung = { zitat: text(u.zitat), auftrag: text(u.auftrag) }
  }
  if (s.art === 'rand') {
    const k = (d.rand ?? {}) as Record<string, unknown>
    const alt = b.rand?.find((x) => x.id === s.id)
    const erlaubt = new Set(ctx.zeichen.map((z) => z.zeichen))
    const zeichen = erlaubt.has(text(k.zeichen)) ? text(k.zeichen) : ''
    // Das neue Zitat gilt nur, wenn es wirklich im Text steht – sonst bleibt die bisherige Stelle
    const zitatNeu = text(k.zitat)
    const zitat = zitatNeu && findeZitat(ohneNamen(a).text, zitatNeu) ? zitatNeu : (alt?.zitat ?? zitatNeu)
    if (text(k.text))
      roh.rand = [
        {
          id: s.id,
          zitat,
          text: text(k.text),
          art: (['lob', 'fehler', 'hinweis'].includes(text(k.art)) ? text(k.art) : (alt?.art ?? 'hinweis')) as RandKommentar['art'],
          ...(zeichen ? { zeichen } : {})
        }
      ]
  }
  const punkteErlaubt = art !== 'keine' && hatForm(r.meta, 'tabelle') && Boolean(r.tabelle?.kriterien.length)
  const g = pruefeBogen(roh, { punkteErlaubt })
  const erg: StellenErgebnis = { entfernt: g.entfernt ?? 0 }
  if (s.art === 'staerken' || mit('staerken')) erg.staerken = g.staerken
  if (s.art === 'schritte' || mit('schritte')) erg.schritte = g.schritte
  if (s.art === 'kriterium' || mit('kriterien')) {
    erg.kriterien = g.kriterien
    if (g.kriterienStufen) erg.kriterienStufen = g.kriterienStufen
  }
  if (s.art === 'schluss' || mit('schluss')) erg.schluss = g.schluss
  if (s.art === 'ueberarbeitung' || mit('ueberarbeitung')) erg.ueberarbeitung = g.ueberarbeitung
  if (s.art === 'rand' && g.rand?.[0]) {
    const { zitat, text: t, art: ka, zeichen } = g.rand[0]
    erg.rand = { zitat, text: t, art: ka, ...(zeichen ? { zeichen } : {}) }
  }
  const leer =
    (s.art === 'staerken' && !erg.staerken?.length) ||
    (s.art === 'schritte' && !erg.schritte?.length) ||
    (s.art === 'kriterium' && !erg.kriterien?.length) ||
    (s.art === 'schluss' && !erg.schluss) ||
    (s.art === 'ueberarbeitung' && !erg.ueberarbeitung) ||
    (s.art === 'rand' && !erg.rand) ||
    (s.art === 'kasten' && !erg.staerken?.length && !erg.schritte?.length && !erg.kriterien?.length && !erg.schluss && !erg.ueberarbeitung)
  if (leer)
    throw new Error(erg.entfernt ? 'Die neue Fassung enthielt eine Note oder Punkte und wurde verworfen – die bisherige bleibt.' : 'Die KI hat für diese Stelle nichts geliefert.')
  return erg
}

/** Neue Fassung in den Bogen einsetzen – nur die Stelle, alles andere bleibt */
export function stelleEinsetzen(b: Bogen, s: Stelle, erg: StellenErgebnis, a?: Pick<Abgabe, 'ausgleich'>): Bogen {
  const neu: Bogen = structuredClone(b)
  if (erg.staerken) neu.staerken = erg.staerken
  if (erg.schritte) neu.schritte = erg.schritte
  if (s.art === 'kriterium' && erg.kriterien?.[0] && neu.kriterien[s.index]) neu.kriterien[s.index] = erg.kriterien[0]
  if (s.art === 'kasten' && erg.kriterien) {
    neu.kriterien = erg.kriterien
    if (erg.kriterienStufen) neu.kriterienStufen = erg.kriterienStufen
    else if (neu.kriterienStufen && neu.kriterienStufen.length !== erg.kriterien.length) delete neu.kriterienStufen
  }
  if (s.art === 'schluss' || (s.art === 'kasten' && 'schluss' in erg)) neu.schluss = erg.schluss
  if (erg.ueberarbeitung) neu.ueberarbeitung = erg.ueberarbeitung
  if (s.art === 'rand' && erg.rand) {
    const i = neu.rand?.findIndex((k) => k.id === s.id) ?? -1
    if (i >= 0 && neu.rand) {
      const alt = neu.rand[i]
      const zeichen = erg.rand.zeichen
      neu.rand[i] = {
        ...alt,
        zitat: erg.rand.zitat,
        text: erg.rand.text,
        art: erg.rand.art,
        ...(zeichen ? { zeichen } : {}),
        ...(zeichen === 'R' && ohneRechtschreibung(a?.ausgleich) ? { ohneWertung: true } : {})
      }
      if (!zeichen) delete neu.rand[i].zeichen
      if (!(zeichen === 'R' && ohneRechtschreibung(a?.ausgleich))) delete neu.rand[i].ohneWertung
    }
  }
  if (erg.entfernt) neu.entfernt = (b.entfernt ?? 0) + erg.entfernt
  if (neu.schluss === undefined) delete neu.schluss
  return neu
}
