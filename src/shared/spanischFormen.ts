/**
 * Spanische Wortformen für die Wortschatzprüfung der Grammatik-Aufgabenbank (20.11.2026, ¡Apúntate! 2 Ausgabe 2016):
 * Die Vokabellisten führen Infinitive und Grundformen – „hablamos", „tengo", „se levantó", „bonitas" sollen als bekannt
 * gelten, wenn „hablar", „tener", „levantarse", „bonito/-a" bekannt sind. Deterministisch, ohne Wörterbuch: regelmäßige
 * Endungen aller Zeiten, Stammwechsel (e→ie, o→ue, e→i, u→ue), Schreibänderungen (c→qu, g→gu, z→c, g→j, c→zc, i→y),
 * angehängte Pronomen, die häufigen unregelmäßigen Verben, Plural und Angleichung bei Nomen und Adjektiven.
 */

/** ohne Akzente (á → a, ñ bleibt), klein */
export const ohneAkzent = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ')

const P = ['', 's', '', 'mos', 'is', 'n']
const reihe = (stamm: string, endungen: string[]): string[] => endungen.map((e) => stamm + e)

/** Regelmäßige Endungen (ohne Akzente) je Konjugation */
function endungen(k: 'ar' | 'er' | 'ir'): string[] {
  const a = k === 'ar'
  const praes = a ? ['o', 'as', 'a', 'amos', 'ais', 'an'] : ['o', 'es', 'e', k === 'er' ? 'emos' : 'imos', k === 'er' ? 'eis' : 'is', 'en']
  const indef = a ? ['e', 'aste', 'o', 'amos', 'asteis', 'aron'] : ['i', 'iste', 'io', 'imos', 'isteis', 'ieron']
  const impf = a ? ['aba', 'abas', 'aba', 'abamos', 'abais', 'aban'] : ['ia', 'ias', 'ia', 'iamos', 'iais', 'ian']
  const subj = a ? ['e', 'es', 'e', 'emos', 'eis', 'en'] : ['a', 'as', 'a', 'amos', 'ais', 'an']
  const subjI = a ? reihe('ara', P).concat(reihe('ase', P)) : reihe('iera', P).concat(reihe('iese', P))
  const fut = ['e', 'as', 'a', 'emos', 'eis', 'an'].map((e) => k + e)
  const cond = ['ia', 'ias', 'ia', 'iamos', 'iais', 'ian'].map((e) => k + e)
  const rest = a ? ['ar', 'ad', 'ando', 'ado', 'ada', 'ados', 'adas'] : [k, k === 'er' ? 'ed' : 'id', 'iendo', 'yendo', 'ido', 'ida', 'idos', 'idas', 'yo', 'yeron', 'yera']
  return [...praes, ...indef, ...impf, ...subj, ...subjI, ...fut, ...cond, ...rest]
}
const ENDUNGEN = { ar: new Set(endungen('ar')), er: new Set(endungen('er')), ir: new Set(endungen('ir')) }

/** Häufige unregelmäßige Formen (ohne Akzente) – gelten, sobald der Infinitiv bekannt ist */
const UNREGELMAESSIG: Record<string, string> = {
  ser: 'soy eres es somos sois son fui fuiste fue fuimos fuisteis fueron era eras eramos erais eran sea seas seamos seais sean se sido siendo fuera fueran',
  estar: 'estoy estas esta estamos estais estan estuve estuviste estuvo estuvimos estuvisteis estuvieron este estes esten estuviera',
  ir: 'voy vas va vamos vais van fui fuiste fue fuimos fuisteis fueron iba ibas ibamos ibais iban vaya vayas vayamos vayan ve id yendo ido fuera',
  tener: 'tengo tienes tiene tenemos teneis tienen tuve tuviste tuvo tuvimos tuvisteis tuvieron tenga tengas tengamos tengan ten tendre tendras tendra tendremos tendran tendria tuviera',
  hacer: 'hago haces hace hacemos haceis hacen hice hiciste hizo hicimos hicisteis hicieron haga hagas hagamos hagan haz hecho hare haras hara haremos haran haria hiciera',
  poner: 'pongo pones pone ponemos poneis ponen puse pusiste puso pusimos pusisteis pusieron ponga pongas pongamos pongan pon puesto pondre pondra pondria pusiera',
  salir: 'salgo sales sale salimos salis salen salga salgas salgan sal saldre saldra saldria',
  decir: 'digo dices dice decimos decis dicen dije dijiste dijo dijimos dijisteis dijeron diga digas digamos digan di dicho diciendo dire dira diria dijera',
  venir: 'vengo vienes viene venimos venis vienen vine viniste vino vinimos vinisteis vinieron venga vengas vengan ven viniendo vendre vendra vendria viniera',
  dar: 'doy das da damos dais dan di diste dio dimos disteis dieron de des demos den dado',
  saber: 'se sabes sabe sabemos sabeis saben supe supiste supo supimos supisteis supieron sepa sepas sepamos sepan sabre sabra sabria supiera',
  poder: 'puedo puedes puede podemos podeis pueden pude pudiste pudo pudimos pudisteis pudieron pueda puedas puedan pudiendo podre podra podria pudiera',
  querer: 'quiero quieres quiere queremos quereis quieren quise quisiste quiso quisimos quisisteis quisieron quiera quieras quieran querre querra querria quisiera',
  ver: 'veo ves ve vemos veis ven vi viste vio vimos visteis vieron veia veias veiamos veian vea veas veamos vean visto',
  traer: 'traigo traes trae traemos traen traje trajiste trajo trajimos trajeron traiga traigan trayendo traido',
  oir: 'oigo oyes oye oimos oyen oi oiste oyo oimos oyeron oiga oigan oyendo oido',
  haber: 'hay he has ha hemos habeis han habia hubo haya habra habria',
  conducir: 'conduzco conduje condujiste condujo condujimos condujeron conduzca',
  caer: 'caigo cae caen cayo cayeron caiga cayendo',
  leer: 'leo lee leen leyo leyeron leyendo leido',
  morir: 'muero muere murio murieron muerto',
  dormir: 'duermo duerme duermen durmio durmieron durmiendo',
  pedir: 'pido pides pide piden pidio pidieron pidiendo pida',
  escribir: 'escrito',
  abrir: 'abierto',
  volver: 'vuelto',
  romper: 'roto',
  descubrir: 'descubierto',
  ponerse: 'puesto'
}

/** Angehängte Pronomen (Imperativ, Gerundium, Infinitiv): dímelo → di + me + lo */
const KLITIKA = /(?:me|te|se|lo|la|le|nos|os|los|las|les)$/

interface Index {
  normal: Set<string>
  staemme: { ar: Set<string>; er: Set<string>; ir: Set<string> }
  formen: Set<string>
}
const indexMerk = new WeakMap<ReadonlySet<string>, Index>()

function index(bekannt: ReadonlySet<string>): Index {
  const da = indexMerk.get(bekannt)
  if (da) return da
  const ix: Index = { normal: new Set(), staemme: { ar: new Set(), er: new Set(), ir: new Set() }, formen: new Set() }
  for (const roh of bekannt) {
    const w = ohneAkzent(roh)
    ix.normal.add(w)
    // Reflexive Infinitive („levantarse") wie der Infinitiv
    const inf = /..(ar|er|ir)se$/.test(w) ? w.slice(0, -2) : w
    const m = /^(.+)(ar|er|ir)$/.exec(inf)
    if (m && inf.length >= 3) {
      const k = m[2] as 'ar' | 'er' | 'ir'
      const s = m[1]
      const varianten = new Set([s])
      // Stammwechsel am letzten Stammvokal
      const letzt = (v: string, n: string): string => {
        const i = s.lastIndexOf(v)
        return i >= 0 ? s.slice(0, i) + n + s.slice(i + v.length) : s
      }
      varianten.add(letzt('e', 'ie'))
      varianten.add(letzt('o', 'ue'))
      varianten.add(letzt('e', 'i'))
      varianten.add(letzt('u', 'ue'))
      // Schreibänderungen am Stammende
      for (const v of [...varianten]) {
        if (v.endsWith('c')) varianten.add(`${v.slice(0, -1)}qu`).add(`${v.slice(0, -1)}zc`)
        if (v.endsWith('g')) varianten.add(`${v}u`).add(`${v.slice(0, -1)}j`)
        if (v.endsWith('gu')) varianten.add(`${v.slice(0, -1)}`)
        if (v.endsWith('z')) varianten.add(`${v.slice(0, -1)}c`)
        if (v.endsWith('u')) varianten.add(`${v}y`)
      }
      for (const v of varianten) if (v) ix.staemme[k].add(v)
    }
    for (const f of (UNREGELMAESSIG[inf] ?? '').split(' ')) if (f) ix.formen.add(f)
  }
  indexMerk.set(bekannt, ix)
  return ix
}

function verbBekannt(w: string, ix: Index): boolean {
  if (ix.formen.has(w)) return true
  for (const k of ['ar', 'er', 'ir'] as const)
    for (let i = w.length - 1; i >= 1; i--) if (ENDUNGEN[k].has(w.slice(i)) && ix.staemme[k].has(w.slice(0, i))) return true
  return false
}

/** Nomen/Adjektiv: Plural (-s, -es, -ces → -z), Angleichung (-o/-a/-os/-as), Akzentwechsel (jóvenes ← joven) */
function nomenBekannt(w: string, ix: Index): boolean {
  const kandidaten = [w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ces$/, 'z')]
  const basis = w.replace(/(as|os|a|o)$/, '')
  if (basis !== w && basis.length >= 2) kandidaten.push(`${basis}o`, `${basis}a`, basis, `${basis}e`)
  // -ísimo/-ísima (absoluter Superlativ): rapidísimo ← rápido
  const iss = /^(.+)isim(o|a|os|as)$/.exec(w)
  if (iss) kandidaten.push(`${iss[1]}o`, `${iss[1]}a`, `${iss[1]}e`, iss[1], `${iss[1].replace(/qu$/, 'c').replace(/gu$/, 'g')}o`)
  // -mente: rápidamente ← rápido/-a
  const mente = /^(.+)mente$/.exec(w)
  if (mente) kandidaten.push(mente[1], `${mente[1].replace(/a$/, 'o')}`)
  return kandidaten.some((k) => k && ix.normal.has(k))
}

/** Ist ein spanisches Wort (beliebig gebeugt) aus dem bekannten Wortschatz ableitbar? */
export function spanischBekannt(wort: string, bekannt: ReadonlySet<string>): boolean {
  const w = ohneAkzent(wort)
  if (!w) return true
  const ix = index(bekannt)
  if (nomenBekannt(w, ix) || verbBekannt(w, ix)) return true
  // Angehängte Pronomen abtrennen (bis zu zwei: dámelo, levantarse, comiéndolo)
  let rest = w
  for (let n = 0; n < 2; n++) {
    const m = KLITIKA.exec(rest)
    if (!m || rest.length - m[0].length < 2) break
    rest = rest.slice(0, -m[0].length)
    if (verbBekannt(rest, ix) || ix.normal.has(rest)) return true
  }
  return false
}
