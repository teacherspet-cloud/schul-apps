/**
 * Erinnerungen zum Üben (10.10.2026, Entscheidungen der Lehrkraft) – die Regeln ohne Server und Oberfläche.
 *
 *  - Höchstens eine Erinnerung am Tag zur gewählten Uhrzeit (Vorgabe 16:00). Sonntags um 17:00 kommt stattdessen der
 *    Wochenrückblick (er ersetzt die tägliche, sofern eingeschaltet).
 *  - Nie während der Schulzeit (Mo–Fr 7:30–14:00), nie vor 7:00 und nie ab 20:00 – eine Uhrzeit dort rückt auf 14:00
 *    bzw. wird für den Tag ausgelassen.
 *  - Auslöser: Tagesrunde offen, Serie in Gefahr (ab 3 Tagen, heute noch nicht geübt), Neues von der Lehrkraft (neue
 *    Abschnitte/Grammatik, Testtermin oder Lernzeitraum-Ende naht), Wochenrückblick.
 *  - Wochenende an (Tage wählbar), Ferien-Pause als Schalter der Lernenden (die App kennt keinen Ferienkalender).
 *  - Texte: kurz, freundlich, abwechselnd, nie Druck oder schlechtes Gewissen; Deutsch und Englisch. Keine Namen.
 */

export type Ausloeser = 'tagesziel' | 'serie' | 'neu' | 'woche'
export const AUSLOESER: Ausloeser[] = ['tagesziel', 'serie', 'neu', 'woche']
export type ErinnerungsSprache = 'de' | 'en'

export interface ErinnerungsWahl {
  /** Erinnerungen eingeschaltet (Vorgabe aus – Einwilligung durch Antippen) */
  an: boolean
  /** Uhrzeit „HH:MM" */
  zeit: string
  /** Wochentage 1 = Montag … 7 = Sonntag */
  tage: number[]
  ausloeser: Record<Ausloeser, boolean>
  /** Ferien-Pause; `ferienBis` (JJJJ-MM-TT, leer = bis zum Ausschalten) */
  ferien: boolean
  ferienBis: string
  /** Eigener Text für die tägliche Erinnerung (leer = abwechselnde Texte) */
  text: string
  sprache: ErinnerungsSprache
}

export const STANDARD_WAHL: ErinnerungsWahl = {
  an: false,
  zeit: '16:00',
  tage: [1, 2, 3, 4, 5, 6, 7],
  ausloeser: { tagesziel: true, serie: true, neu: true, woche: true },
  ferien: false,
  ferienBis: '',
  text: '',
  sprache: 'de'
}

export const TEXT_MAX = 120

/** Eigener Text: nur einfacher Text, eine Zeile, ohne Steuerzeichen und spitze Klammern, höchstens 120 Zeichen */
export function textBereinigt(roh: unknown): string {
  return (
    String(roh ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, TEXT_MAX)
      .trim()
  )
}

const ZEIT = /^([01]\d|2[0-3]):([0-5]\d)$/
const TAG = /^\d{4}-\d{2}-\d{2}$/

/** Eingabe der Oberfläche prüfen; Unbekanntes fällt auf die Vorgabe zurück */
export function wahlBereinigt(roh: unknown): ErinnerungsWahl {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Partial<Record<keyof ErinnerungsWahl, unknown>>
  const a = (r.ausloeser && typeof r.ausloeser === 'object' ? r.ausloeser : {}) as Partial<Record<Ausloeser, unknown>>
  const tage = Array.isArray(r.tage) ? [...new Set(r.tage.map(Number).filter((t) => Number.isInteger(t) && t >= 1 && t <= 7))].sort() : STANDARD_WAHL.tage
  return {
    an: r.an === true,
    zeit: typeof r.zeit === 'string' && ZEIT.test(r.zeit) ? r.zeit : STANDARD_WAHL.zeit,
    tage,
    ausloeser: Object.fromEntries(AUSLOESER.map((x) => [x, a[x] === undefined ? STANDARD_WAHL.ausloeser[x] : a[x] === true])) as Record<Ausloeser, boolean>,
    ferien: r.ferien === true,
    ferienBis: typeof r.ferienBis === 'string' && TAG.test(r.ferienBis) ? r.ferienBis : '',
    text: textBereinigt(r.text),
    sprache: r.sprache === 'en' ? 'en' : 'de'
  }
}

// ---------------------------------------------------------------- Zeit in Deutschland

export interface BerlinZeit {
  /** JJJJ-MM-TT */
  tag: string
  /** 1 = Montag … 7 = Sonntag */
  wochentag: number
  /** Minuten seit Mitternacht */
  minuten: number
}

let FORMAT: Intl.DateTimeFormat | null = null
const teileVon = (ms: number): Record<string, string> => {
  FORMAT ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  return Object.fromEntries(FORMAT.formatToParts(ms).map((p) => [p.type, p.value]))
}

/** Wochentag eines Tages (JJJJ-MM-TT), 1 = Montag … 7 = Sonntag */
export const wochentagVon = (tag: string): number => {
  const [j, m, t] = tag.split('-').map(Number)
  return ((new Date(Date.UTC(j, m - 1, t)).getUTCDay() + 6) % 7) + 1
}

export function berlin(ms: number): BerlinZeit {
  const p = teileVon(ms)
  const tag = `${p.year}-${p.month}-${p.day}`
  return { tag, wochentag: wochentagVon(tag), minuten: Number(p.hour) * 60 + Number(p.minute) }
}

/** Tag plus n Tage */
export const tagPlus = (tag: string, n: number): string => {
  const [j, m, t] = tag.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, t + n)).toISOString().slice(0, 10)
}

/** Zeitpunkt (ms) zu Tag und Uhrzeit in Deutschland */
export function berlinMs(tag: string, minuten: number): number {
  const [j, m, t] = tag.split('-').map(Number)
  const wunsch = Date.UTC(j, m - 1, t, 0, minuten)
  const versatz = (ms: number): number => {
    const b = berlin(ms)
    const [bj, bm, bt] = b.tag.split('-').map(Number)
    return Date.UTC(bj, bm - 1, bt, 0, b.minuten) - Math.floor(ms / 60000) * 60000
  }
  let ms = wunsch - versatz(wunsch)
  ms = wunsch - versatz(ms)
  return ms
}

export const zeitMinuten = (z: string): number => {
  const m = ZEIT.exec(z)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 16 * 60
}

/** Ruhezeiten: erlaubt 7:00–20:00, an Schultagen (Mo–Fr) nicht 7:30–14:00 */
export const FENSTER_AB = 7 * 60
export const FENSTER_BIS = 20 * 60
export const SCHULE_AB = 7 * 60 + 30
export const SCHULE_BIS = 14 * 60
export const WOCHE_UM = 17 * 60

/** Früheste erlaubte Minute ab `minuten` an diesem Wochentag – null, wenn an diesem Tag nichts mehr erlaubt ist */
export function erlaubteMinute(wochentag: number, minuten: number): number | null {
  let m = Math.max(minuten, FENSTER_AB)
  if (wochentag <= 5 && m >= SCHULE_AB && m < SCHULE_BIS) m = SCHULE_BIS
  return m < FENSTER_BIS ? m : null
}

export function istRuhezeit(ms: number): boolean {
  const b = berlin(ms)
  return erlaubteMinute(b.wochentag, b.minuten) !== b.minuten
}

/** Ferien-Pause an diesem Tag? */
export const pausiert = (w: Pick<ErinnerungsWahl, 'ferien' | 'ferienBis'>, tag: string): boolean => w.ferien && (!w.ferienBis || tag <= w.ferienBis)

const taeglichAn = (w: ErinnerungsWahl): boolean => w.ausloeser.tagesziel || w.ausloeser.serie || w.ausloeser.neu

/** Wie lange eine verpasste Erinnerung (Server-Neustart) am selben Tag noch nachkommen darf */
export const NACHHOLEN_MIN = 120

/**
 * Nächster Termin ab `jetzt`. `erledigt` = letzter Tag, für den schon entschieden wurde (gesendet oder nichts zu
 * sagen) – an diesem Tag kommt nichts mehr (höchstens eine Erinnerung je Tag). Sonntag mit Wochenrückblick: 17:00,
 * Art „woche". Liefert null, wenn in den nächsten zwei Wochen nichts ansteht (aus, Pause, keine Tage).
 */
export function naechsterTermin(w: ErinnerungsWahl, erledigt: string, jetzt: number): { ms: number; tag: string; art: 'tag' | 'woche' } | null {
  if (!w.an) return null
  const heute = berlin(jetzt)
  for (let i = 0; i < 15; i++) {
    const tag = tagPlus(heute.tag, i)
    const wt = wochentagVon(tag)
    if (erledigt && tag <= erledigt) continue
    if (pausiert(w, tag) || !w.tage.includes(wt)) continue
    const woche = wt === 7 && w.ausloeser.woche
    if (!woche && !taeglichAn(w)) continue
    // Eine Uhrzeit ab 20:00 rückt auf 19:30 (nie danach), vor 7:00 auf 7:00, in der Schulzeit auf 14:00
    const soll = erlaubteMinute(wt, woche ? WOCHE_UM : Math.min(zeitMinuten(w.zeit), FENSTER_BIS - 30))
    if (soll === null) continue
    let min: number | null = soll
    if (i === 0 && heute.minuten > soll) {
      // Verpasst (z. B. Neustart): nur kurz danach noch nachholen – und nie in eine Ruhezeit hinein
      min = heute.minuten - soll <= NACHHOLEN_MIN ? erlaubteMinute(wt, heute.minuten) : null
      if (min !== null && min - soll > NACHHOLEN_MIN) min = null
    }
    if (min === null) continue
    return { ms: berlinMs(tag, min), tag, art: woche ? 'woche' : 'tag' }
  }
  return null
}

// ---------------------------------------------------------------- Lage und Auswahl

/** Was der Server über die Person weiß – nur Zahlen und Ziele im Schülerbereich, keine Namen */
export interface ErinnerungsLage {
  /** Kurse mit angebotenen Erinnerungen (0 = keine – dann kommt nichts) */
  kurse: number
  heuteGeuebt: boolean
  /** Heute offene Wörter/Aufgaben (Tagesrunde) und wohin der Knopf führt */
  offen: number
  offenZiel: string
  /** Übungstage in Folge bis gestern (bzw. heute) */
  serie: number
  /** Neues seit der letzten Meldung */
  neu: { art: 'vokabeln' | 'grammatik'; ziel: string } | null
  /** Testtermin oder Ende des Lernzeitraums in Kürze (noch nicht gemeldet) */
  termin: { ziel: string; schluessel: string; art: 'test' | 'ende' } | null
  woche: { tage: number; abzeichen: number; offen: number }
}

/** Auslöser für diesen Termin – null: nichts zu sagen (z. B. heute schon alles geschafft) */
export function ausloeserWaehlen(w: ErinnerungsWahl, lage: ErinnerungsLage, art: 'tag' | 'woche'): Ausloeser | null {
  if (!w.an || lage.kurse <= 0) return null
  if (art === 'woche') return w.ausloeser.woche ? 'woche' : null
  if (w.ausloeser.serie && lage.serie >= 3 && !lage.heuteGeuebt) return 'serie'
  if (w.ausloeser.neu && (lage.neu || lage.termin)) return 'neu'
  if (w.ausloeser.tagesziel && lage.offen > 0) return 'tagesziel'
  return null
}

/** Übungstage in Folge: endet heute (wenn heute geübt) bzw. gestern */
export function serieVon(tage: Iterable<string>, heute: string): number {
  const menge = new Set(tage)
  let tag = menge.has(heute) ? heute : tagPlus(heute, -1)
  let n = 0
  while (menge.has(tag) && n < 1000) {
    n++
    tag = tagPlus(tag, -1)
  }
  return n
}

/** Montag der Woche eines Tages */
export const wochenAnfang = (tag: string): string => tagPlus(tag, 1 - wochentagVon(tag))

// ---------------------------------------------------------------- Texte

interface TextSatz {
  titel: string[]
  text: string[]
}

/**
 * Kurze, abwechselnde Texte je Auslöser. Platzhalter: {n} (Zahl). Ton: einladend, nie vorwurfsvoll – kein „Du hast
 * vergessen", kein „schon wieder", keine Drohung mit verlorener Serie.
 */
export const TEXTE: Record<ErinnerungsSprache, Record<Ausloeser | 'test' | 'termin' | 'ende', TextSatz>> = {
  de: {
    tagesziel: {
      titel: ['Zeit zum Üben', 'Deine Tagesrunde', 'Kurz mal üben?', 'Bereit für heute?'],
      text: [
        'Deine Tagesrunde ist startklar – ein paar Minuten genügen.',
        'Heute warten {n} Wörter auf dich. Los geht’s, wann es dir passt.',
        'Eine kurze Runde, und dein Kopf hat wieder etwas gelernt.',
        'Kleine Schritte, großer Wortschatz: Deine Runde für heute ist bereit.',
        'Fünf Minuten Üben – mehr braucht es heute nicht.',
        'Lust auf eine schnelle Runde? Deine Wörter sind bereit.'
      ]
    },
    serie: {
      titel: ['Starke Serie!', 'Du bist dran geblieben', 'Weiter so!'],
      text: [
        'Schon {n} Tage in Folge geübt – Lust auf Tag {m}?',
        '{n} Tage am Stück, richtig gut! Eine kurze Runde heute reicht.',
        'Deine Serie: {n} Tage. Eine Mini-Runde, und sie wächst weiter.'
      ]
    },
    neu: {
      titel: ['Neu für dich', 'Frisch freigegeben', 'Etwas Neues zum Üben'],
      text: ['Es gibt neue Vokabeln zum Üben.', 'Neue Wörter sind da – schau mal rein.', 'Deine Lehrkraft hat neue Vokabeln freigegeben.']
    },
    termin: {
      titel: ['Bald ist Test', 'Gut vorbereitet'],
      text: ['Bald ist Testtermin – ein bisschen Üben jetzt macht es dir dann leichter.', 'Der Test kommt bald. Eine kurze Runde heute hilft dir.']
    },
    ende: {
      titel: ['Bald geschafft', 'Endspurt'],
      text: ['Der Lernzeitraum endet bald – eine kurze Runde lohnt sich.', 'Nur noch wenige Tage zum Üben in diesem Kurs.']
    },
    woche: {
      titel: ['Dein Wochenrückblick', 'Deine Woche'],
      text: ['Neue Woche, neue Chance – schon eine kurze Runde zählt.', 'Eine ruhige Woche? Kein Problem – starte, wann es dir passt.']
    },
    test: {
      titel: ['Erinnerungen sind an'],
      text: ['So sieht deine Erinnerung aus. Viel Spaß beim Üben!']
    }
  },
  en: {
    tagesziel: {
      titel: ['Time to practise', 'Your daily round', 'Quick practice?', 'Ready for today?'],
      text: [
        'Your daily round is ready – a few minutes is all it takes.',
        '{n} words are waiting for you today. Start whenever it suits you.',
        'One quick round and your brain learns something new.',
        'Small steps, big vocabulary: today’s round is ready.',
        'Five minutes of practice – that’s all for today.',
        'Fancy a quick round? Your words are ready.'
      ]
    },
    serie: {
      titel: ['Great streak!', 'You kept going', 'Keep it up!'],
      text: ['{n} days in a row – up for day {m}?', '{n} days in a row, well done! A short round today is enough.', 'Your streak: {n} days. One mini round and it keeps growing.']
    },
    neu: {
      titel: ['New for you', 'Just released', 'Something new to practise'],
      text: ['There are new words to practise.', 'New words are here – take a look.', 'Your teacher has released new vocabulary.']
    },
    termin: {
      titel: ['Test coming up', 'Well prepared'],
      text: ['Your test is coming up – a little practice now makes it easier.', 'The test is soon. A short round today helps.']
    },
    ende: {
      titel: ['Almost there', 'Final stretch'],
      text: ['This course ends soon – a short round is worth it.', 'Only a few days left to practise in this course.']
    },
    woche: {
      titel: ['Your week in review', 'Your week'],
      text: ['New week, new chance – even a short round counts.', 'A quiet week? No problem – start whenever it suits you.']
    },
    test: {
      titel: ['Reminders are on'],
      text: ['This is what your reminder looks like. Enjoy practising!']
    }
  }
}

/** Grammatik statt Vokabeln bei „neu" */
const NEU_GRAMMATIK: Record<ErinnerungsSprache, string[]> = {
  de: ['Es gibt neue Grammatik zum Üben.', 'Neue Grammatik-Übungen sind da – schau mal rein.'],
  en: ['There is new grammar to practise.', 'New grammar exercises are here – take a look.']
}

/** Wochenrückblick aus Zahlen */
function wochenText(s: ErinnerungsSprache, w: ErinnerungsLage['woche'], zufall: () => number): string {
  if (!w.tage) return waehle(TEXTE[s].woche.text, zufall)
  const teile =
    s === 'de'
      ? [`Diese Woche: ${w.tage} ${w.tage === 1 ? 'Übungstag' : 'Übungstage'}`, w.abzeichen ? `${w.abzeichen} ${w.abzeichen === 1 ? 'neues Abzeichen' : 'neue Abzeichen'}` : '']
      : [`This week: ${w.tage} ${w.tage === 1 ? 'day' : 'days'} of practice`, w.abzeichen ? `${w.abzeichen} new ${w.abzeichen === 1 ? 'badge' : 'badges'}` : '']
  const schluss =
    s === 'de'
      ? w.offen
        ? `Für nächste Woche warten ${w.offen} Wörter.`
        : 'Gut gemacht!'
      : w.offen
      ? `${w.offen} words are waiting for next week.`
      : 'Well done!'
  return `${teile.filter(Boolean).join(' · ')}. ${schluss}`
}

const waehle = (liste: string[], zufall: () => number, vorher = -1): string => {
  if (liste.length <= 1) return liste[0] ?? ''
  let i = Math.floor(zufall() * liste.length) % liste.length
  if (i === vorher) i = (i + 1) % liste.length
  return liste[i]
}

export interface Nachricht {
  titel: string
  text: string
  /** Ziel im Schülerbereich (/s/…) */
  ziel: string
  sprache: ErinnerungsSprache
  /** gewählter Text (für Abwechslung beim nächsten Mal) */
  nr: number
}

/** Nur Ziele im Schülerbereich */
export const zielSicher = (z: string): string => (/^\/s\/[\w/-]*$/.test(z) ? z : '/s/')

/** Die Nachricht zu einem Auslöser – ohne Namen, nur Text und Ziel */
export function nachrichtFuer(a: Ausloeser | 'test', w: ErinnerungsWahl, lage: ErinnerungsLage | null, zufall: () => number = Math.random, vorher = -1): Nachricht {
  const s = w.sprache
  const satz = a === 'neu' && !lage?.neu && lage?.termin ? TEXTE[s][lage.termin.art === 'test' ? 'termin' : 'ende'] : TEXTE[s][a]
  const liste = a === 'neu' && lage?.neu?.art === 'grammatik' ? NEU_GRAMMATIK[s] : satz.text
  let i = Math.floor(zufall() * liste.length) % liste.length
  if (i === vorher && liste.length > 1) i = (i + 1) % liste.length
  // Ohne Zahl kein „{n} Wörter": dann einen Text ohne Platzhalter
  if (a === 'tagesziel' && !(lage?.offen ?? 0) && liste[i].includes('{n}')) i = (i + 1) % liste.length
  let text = liste[i].replace('{n}', String(a === 'serie' ? lage?.serie ?? 0 : lage?.offen ?? 0)).replace('{m}', String((lage?.serie ?? 0) + 1))
  if (a === 'woche' && lage) text = wochenText(s, lage.woche, zufall)
  if (a === 'tagesziel' && w.text) text = w.text
  const ziel =
    a === 'woche' || a === 'test' || !lage
      ? '/s/'
      : a === 'neu'
      ? lage.neu?.ziel ?? lage.termin?.ziel ?? '/s/'
      : lage.offenZiel || '/s/'
  return { titel: waehle(satz.titel, zufall), text, ziel: zielSicher(ziel), sprache: s, nr: i }
}

/** Inhalt der Push-Nachricht (verschlüsselt verschickt): Titel, Text, Ziel, Sprache – nie Namen oder Kennungen der Person */
export function nutzlast(n: Nachricht): string {
  return JSON.stringify({ t: n.titel.slice(0, 60), b: n.text.slice(0, 200), u: zielSicher(n.ziel), l: n.sprache, tag: 'sa-erinnerung' })
}
