/**
 * Sonderzeichen und Schriften der Schulsprachen (30.09.2026).
 *
 * Auftrag: „Sonderzeichen-Eingabe (Diakritika, kyrillisch, chinesisch mit Pinyin/Tonzeichen und
 * Schriftzeichen)" für Vokabeltest und Vokabellisten, griechische Schrift „in Eingabe/Druck/Word mit
 * passender Schrift". Hier stehen nur Daten und reine Umwandlungen – die Leiste zum Anklicken ist
 * `components/SonderzeichenLeiste.tsx`.
 *
 * - Zeichenleisten je Sprache: die Buchstaben, die eine deutsche Tastatur nicht hat.
 * - Altgriechisch (grc): Grundbuchstaben plus Spiritus/Akzente/Iota subscriptum, die auf den
 *   Buchstaben VOR der Schreibmarke gesetzt werden (Unicode-NFC, also vorkomponierte Zeichen wie
 *   in den Lehrwerken), und Beta-Code („lo/gos" → „λόγος") nach der Konvention des Thesaurus
 *   Linguae Graecae (TLG Beta Code Manual) – die übliche Umschrift-Eingabe der Altphilologie.
 * - Chinesisch: Pinyin mit Tonzahlen („ni3 hao3" → „nǐ hǎo"); Tonzeichen nach der amtlichen Regel
 *   (Hanyu Pinyin Fang'an 1958 / GB/T 16159): a und e tragen das Zeichen, bei „ou" das o, sonst
 *   der letzte Vokal. Schriftzeichen selbst kommen über die Windows-Eingabe (Microsoft Pinyin IME) –
 *   ein eigenes Eingabesystem für Tausende Zeichen wäre nicht verlässlich.
 * - Umschrift Altgriechisch (optional im Test): wissenschaftliche Transliteration ohne Akzente,
 *   η → ē, ω → ō, Spiritus asper → h, ου → u, υ → y, γγ → ng (wie in Gemoll/Menge üblich).
 */

export interface ZeichenGruppe {
  titel: string
  zeichen: string[]
  /** 'einfuegen' = Zeichen einsetzen; 'setzen' = Diakritikon auf den Buchstaben vor der Schreibmarke */
  art?: 'einfuegen' | 'setzen'
}

const zerlege = (s: string): string[] => [...s.replace(/\s+/g, '')]

const KYRILLISCH = zerlege('абвгдеёжзийклмнопрстуфхцчшщъыьэюя')
const GRIECHISCH_KLEIN = zerlege('αβγδεζηθικλμνξοπρσςτυφχψω')

/**
 * Diakritika des Altgriechischen als kombinierende Zeichen (Unicode): Spiritus lenis/asper, Akut,
 * Gravis, Zirkumflex, Iota subscriptum, Trema. Beschriftet mit dem sichtbaren Zeichen.
 */
export const GRIECHISCHE_DIAKRITIKA: { zeichen: string; name: string; kombi: string }[] = [
  { zeichen: '᾿', name: 'Spiritus lenis', kombi: '̓' },
  { zeichen: '῾', name: 'Spiritus asper', kombi: '̔' },
  { zeichen: '´', name: 'Akut', kombi: '́' },
  { zeichen: '`', name: 'Gravis', kombi: '̀' },
  { zeichen: '῀', name: 'Zirkumflex', kombi: '͂' },
  { zeichen: 'ͺ', name: 'Iota subscriptum', kombi: 'ͅ' },
  { zeichen: '¨', name: 'Trema', kombi: '̈' }
]

const HIRAGANA = zerlege(
  'あいうえお かきくけこ さしすせそ たちつてと なにぬねの はひふへほ まみむめも やゆよ らりるれろ わをん がぎぐげご ざじずぜぞ だぢづでど ばびぶべぼ ぱぴぷぺぽ ゃゅょっー'
)
const KATAKANA = zerlege(
  'アイウエオ カキクケコ サシスセソ タチツテト ナニヌネノ ハヒフヘホ マミムメモ ヤユヨ ラリルレロ ワヲン ガギグゲゴ ザジズゼゾ ダヂヅデド バビブベボ パピプペポ ャュョッー'
)
const ARABISCH = zerlege('ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي ة ى ء أ إ آ ؤ ئ')
// Harakat: Fatha, Damma, Kasra, Sukun, Schadda, Tanwin – kombinierend, sie folgen dem Buchstaben
const HARAKAT = ['َ', 'ُ', 'ِ', 'ْ', 'ّ', 'ً', 'ٌ', 'ٍ']

/** Zeichenleisten je Sprachcode; leer = die deutsche Tastatur reicht (Englisch, Latein) */
export const ZEICHEN: Record<string, ZeichenGruppe[]> = {
  fr: [{ titel: 'Akzente', zeichen: zerlege('éèêëàâçîïôûùüÿœæ«»') }],
  es: [{ titel: 'Akzente', zeichen: zerlege('áéíóúñü¿¡') }],
  it: [{ titel: 'Akzente', zeichen: zerlege('àèéìíòóùú') }],
  nl: [{ titel: 'Akzente', zeichen: zerlege('éèëïóöüáĳ') }],
  pl: [
    { titel: 'klein', zeichen: zerlege('ąćęłńóśźż') },
    { titel: 'groß', zeichen: zerlege('ĄĆĘŁŃÓŚŹŻ') }
  ],
  cs: [
    { titel: 'klein', zeichen: zerlege('áčďéěíňóřšťúůýž') },
    { titel: 'groß', zeichen: zerlege('ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ') }
  ],
  pt: [{ titel: 'Akzente', zeichen: zerlege('áàâãçéêíóôõúÁÀÂÃÇÉÊÍÓÔÕÚ') }],
  tr: [{ titel: 'Buchstaben', zeichen: zerlege('çğıİöşüâÇĞÖŞÜ') }],
  da: [{ titel: 'Buchstaben', zeichen: zerlege('æøåÆØÅé') }],
  ru: [
    { titel: 'Kyrillisch', zeichen: KYRILLISCH },
    // Betonungszeichen (kombinierender Akut) – in Lehrwerken über dem betonten Vokal
    { titel: 'Betonung', zeichen: ['́'], art: 'setzen' }
  ],
  el: [
    { titel: 'Buchstaben', zeichen: GRIECHISCH_KLEIN },
    { titel: 'Tonos', zeichen: zerlege('άέήίόύώϊϋΐΰ') }
  ],
  grc: [
    { titel: 'Buchstaben', zeichen: GRIECHISCH_KLEIN },
    { titel: 'Zeichen setzen', zeichen: GRIECHISCHE_DIAKRITIKA.map((d) => d.kombi), art: 'setzen' }
  ],
  zh: [
    { titel: 'Pinyin', zeichen: zerlege('āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü') },
    { titel: 'Satzzeichen', zeichen: zerlege('，。？！、：；「」') }
  ],
  ja: [
    { titel: 'Hiragana', zeichen: HIRAGANA },
    { titel: 'Katakana', zeichen: KATAKANA },
    { titel: 'Satzzeichen', zeichen: zerlege('。、「」？！') }
  ],
  ar: [
    { titel: 'Buchstaben', zeichen: ARABISCH },
    { titel: 'Vokalzeichen', zeichen: HARAKAT, art: 'setzen' },
    { titel: 'Satzzeichen', zeichen: zerlege('،؟؛') }
  ]
}

/** Hinweis zur Eingabe, wo eine Zeichenleiste nicht reicht */
export const EINGABE_HINWEIS: Record<string, string> = {
  zh: 'Schriftzeichen über die Windows-Eingabe „Chinesisch (vereinfacht) – Microsoft Pinyin" (Windows-Taste + Leertaste wechselt). Pinyin mit Tonzahlen („ni3 hao3") wandelt „Tonzahlen → Tonzeichen" um.',
  ja: 'Kanji über die Windows-Eingabe „Japanisch – Microsoft IME" (Windows-Taste + Leertaste wechselt); Kana auch über die Leiste.',
  ar: 'Arabisch wird von rechts nach links geschrieben; die Felder stellen die Schreibrichtung selbst um. Tastatur „Arabisch" über Windows-Taste + Leertaste.',
  grc: 'Ein Klick auf Spiritus oder Akzent setzt das Zeichen auf den Buchstaben vor der Schreibmarke. Text in Beta-Code („o( lo/gos") wandelt „Beta-Code → Griechisch" um.',
  ru: 'Kyrillisch auch über die Windows-Tastatur „Russisch" (Windows-Taste + Leertaste).',
  el: 'Griechisch auch über die Windows-Tastatur „Griechisch" (Windows-Taste + Leertaste).'
}

/** Welche Umwandlung die Leiste anbietet */
export const UMWANDLUNG: Record<string, { titel: string; umwandeln: (s: string) => string }> = {
  grc: { titel: 'Beta-Code → Griechisch', umwandeln: (s) => betaCodeZuGriechisch(s) },
  zh: { titel: 'Tonzahlen → Tonzeichen', umwandeln: (s) => pinyinAusZahlen(s) }
}

/** Setzt ein kombinierendes Zeichen auf den Buchstaben davor und fasst beides zusammen (NFC). */
export function diakritikonSetzen(vorher: string, kombi: string): string {
  if (!vorher) return kombi
  // Letzter Buchstabe samt schon vorhandener kombinierender Zeichen
  const m = vorher.normalize('NFD').match(/(\P{M}\p{M}*)$/u)
  if (!m) return (vorher + kombi).normalize('NFC')
  const rest = vorher.normalize('NFD').slice(0, -m[1].length)
  // Gleiches Zeichen noch einmal = wieder entfernen (Umschalten wie bei einer Taste)
  const buchstabe = m[1].includes(kombi) ? m[1].replace(kombi, '') : m[1] + kombi
  return (rest + buchstabe).normalize('NFC')
}

// ---------------------------------------------------------------- Beta-Code (TLG)

const BETA_BUCHSTABEN: Record<string, string> = {
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ', h: 'η', q: 'θ', i: 'ι', k: 'κ', l: 'λ', m: 'μ',
  n: 'ν', c: 'ξ', o: 'ο', p: 'π', r: 'ρ', s: 'σ', t: 'τ', u: 'υ', f: 'φ', x: 'χ', y: 'ψ', w: 'ω'
}
const BETA_ZEICHEN: Record<string, string> = { ')': '̓', '(': '̔', '/': '́', '\\': '̀', '=': '͂', '|': 'ͅ', '+': '̈' }

/**
 * TLG-Beta-Code → polytones Griechisch (NFC). Kleinbuchstaben: Buchstabe, dann Zeichen („a)/" → ἄ);
 * Großbuchstaben: „*", dann Zeichen, dann Buchstabe („*)/a" → Ἄ). Schluss-Sigma von selbst. Groß- und
 * Kleinschreibung der lateinischen Buchstaben ist egal – wie im TLG. Text, der schon griechisch ist,
 * bleibt unverändert.
 */
export function betaCodeZuGriechisch(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '*') {
      // Großbuchstabe: Zeichen stehen vor dem Buchstaben
      let j = i + 1
      let zeichen = ''
      while (j < text.length && BETA_ZEICHEN[text[j]]) zeichen += BETA_ZEICHEN[text[j++]]
      const b = BETA_BUCHSTABEN[text[j]?.toLowerCase() ?? '']
      if (b) {
        out += b.toUpperCase() + zeichen
        i = j + 1
        continue
      }
      out += ch
      i++
      continue
    }
    const b = BETA_BUCHSTABEN[ch.toLowerCase()]
    if (b) {
      out += b
      i++
      while (i < text.length && BETA_ZEICHEN[text[i]]) out += BETA_ZEICHEN[text[i++]]
      continue
    }
    out += ch
    i++
  }
  // Schluss-Sigma: σ am Wortende (vor Nicht-Buchstabe oder Textende)
  return out.normalize('NFC').replace(/σ(?![\p{L}\p{M}])/gu, 'ς')
}

// ---------------------------------------------------------------- Pinyin

const TON: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
  A: ['Ā', 'Á', 'Ǎ', 'À'],
  E: ['Ē', 'É', 'Ě', 'È'],
  I: ['Ī', 'Í', 'Ǐ', 'Ì'],
  O: ['Ō', 'Ó', 'Ǒ', 'Ò'],
  U: ['Ū', 'Ú', 'Ǔ', 'Ù'],
  Ü: ['Ǖ', 'Ǘ', 'Ǚ', 'Ǜ']
}

/** Eine Silbe mit Tonzahl → Silbe mit Tonzeichen („hao3" → „hǎo", „lv4" → „lǜ", „ma5" → „ma") */
function pinyinSilbe(silbe: string, ton: number): string {
  const s = silbe.replace(/u:|v/g, 'ü').replace(/U:|V/g, 'Ü')
  if (ton < 1 || ton > 4) return s
  const vokale = [...s].map((c, i) => ({ c, i })).filter((x) => TON[x.c])
  if (!vokale.length) return s
  const klein = s.toLowerCase()
  let ziel: number
  if (/[ae]/.test(klein)) ziel = klein.search(/[ae]/)
  else if (klein.includes('ou')) ziel = klein.indexOf('o')
  else ziel = vokale[vokale.length - 1].i
  const c = s[ziel]
  return s.slice(0, ziel) + TON[c][ton - 1] + s.slice(ziel + 1)
}

/** Pinyin mit Tonzahlen in Pinyin mit Tonzeichen umwandeln; alles andere bleibt, wie es ist. */
export function pinyinAusZahlen(text: string): string {
  return text.replace(/([a-zA-ZüÜ:]+)([0-5])/g, (_m, silbe: string, ton: string) => pinyinSilbe(silbe, Number(ton)))
}

// ---------------------------------------------------------------- Umschrift Altgriechisch

const UMSCHRIFT: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'ē', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n',
  ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'ō'
}

/**
 * Altgriechisch → lateinische Umschrift ohne Akzente („ὁ λόγος" → „ho logos", „ψυχή" → „psychē",
 * „οὐρανός" → „uranos", „ἄγγελος" → „angelos", „ῥήτωρ" → „rhētōr", „τῷ" → „tōi").
 */
export function griechischUmschrift(text: string): string {
  const zerlegt = text.normalize('NFD')
  // Wortweise arbeiten: Der Spiritus asper steht am ersten Vokal bzw. Diphthong, das h davor
  return zerlegt.replace(/[\p{Script=Greek}̀-ͯ͂̓ͅ]+/gu, (wort) => umschriftWort(wort))
}

function umschriftWort(wort: string): string {
  const zeichen = [...wort]
  // Buchstaben mit ihren kombinierenden Zeichen
  const teile: { b: string; m: string }[] = []
  for (const z of zeichen) {
    if (/\p{M}/u.test(z) && teile.length) teile[teile.length - 1].m += z
    else teile.push({ b: z, m: '' })
  }
  let out = ''
  let asper = teile.some((t) => t.m.includes('̔'))
  for (let i = 0; i < teile.length; i++) {
    const { b, m } = teile[i]
    const klein = b.toLowerCase()
    const gross = b !== klein
    const naechstes = teile[i + 1]?.b.toLowerCase()
    let lat: string
    if (klein === 'γ' && naechstes && 'γκξχ'.includes(naechstes)) lat = 'n'
    else if ('αεηο'.includes(klein) && naechstes === 'υ' && !teile[i + 1].m.includes('̈')) {
      lat = klein === 'ο' ? 'u' : `${UMSCHRIFT[klein]}u`
      i++
    } else if (klein === 'ρ' && m.includes('̔')) {
      lat = 'rh'
      asper = false
    } else lat = UMSCHRIFT[klein] ?? b
    // Iota subscriptum → i
    if (m.includes('ͅ')) lat += 'i'
    if (asper && i <= 1 && /[aeiouyēō]/.test(lat[0])) {
      lat = `h${lat}`
      asper = false
    }
    out += gross ? lat[0].toUpperCase() + lat.slice(1) : lat
  }
  return out
}
