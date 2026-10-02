import type { VocabEntry } from '../model/types'

/*
 * Wortarten für Ablenker (02.10.2026, Befund der Lehrkraft): Ablenker in Multiple Choice und im
 * Wortkasten waren oft schon an der Wortart als falsch zu erkennen (ein Nomen zwischen lauter
 * Verben, ein Verb mit „to" neben Formen ohne). Was sich ohne KI erkennen lässt, steht hier:
 * die Wortart aus der Spalte der Liste (pos) oder – wenn sie fehlt – aus der Form des Wortes
 * (Artikel, „to", typische Endungen). Unsicheres bleibt `undefined`; dann wird nichts gemeldet.
 */

export type Wortart = 'noun' | 'verb' | 'adj' | 'adv'

/** Wortart aus der Listenspalte („noun", „v.", „Adjektiv", „adj." …) */
export function wortartAusPos(pos: string | undefined): Wortart | undefined {
  const p = (pos ?? '').toLowerCase().trim()
  if (!p) return undefined
  // Wortweise vergleichen (\b kennt keine kyrillischen Buchstaben)
  const t = p.split(/[^\p{L}]+/u).filter(Boolean)
  const hat = (anfang: string[], ganz: string[] = []): boolean => t.some((w) => anfang.some((a) => w.startsWith(a)) || ganz.includes(w))
  if (hat(['adv', 'bijwoord'], ['наречие', 'przysłówek'])) return 'adv'
  if (hat(['adj', 'bijvoeglijk', 'aggettiv', 'прилагательн', 'przymiotnik'], ['adjectif'])) return 'adj'
  if (hat(['verb', 'werkwoord', 'глагол', 'czasownik']) || /^(v|vb|vt|vi|v\.\s?t|v\.\s?i)\.?$/.test(p)) return 'verb'
  if (
    hat(['noun', 'nomen', 'substantiv', 'sustantiv', 'sostantiv', 'zelfstandig', 'существительн', 'rzeczownik'], ['subst', 'nom']) ||
    /^(n|s|sb|nm|nf|m|f|nn)\.?$/.test(p)
  )
    return 'noun'
  return undefined
}

const ARTIKEL: Record<string, RegExp> = {
  en: /^(a|an|the)\s+\S/i,
  fr: /^((le|la|les|un|une|des|du|de\s+la)\s+|(de\s+)?l['’])\S/i,
  es: /^(el|la|los|las|un|una|unos|unas)\s+\S/i,
  it: /^((il|lo|la|i|gli|le|un|uno|una|del|dello|della|dei|degli|delle)\s+|l['’]|un['’]|dell['’])\S/i,
  pt: /^(o|a|os|as|um|uma|uns|umas)\s+\S/i,
  nl: /^(de|het|een)\s+\S/i,
  da: /^(en|et)\s+\S/i,
  el: /^(ο|η|το|οι|τα)\s+\S/i
}

/** Steht ein Artikel vor dem Wort (le pain, the bridge)? */
export const hatArtikel = (wort: string, sprache: string): boolean => Boolean(ARTIKEL[sprache]?.test(wort.trim()))

/** Wortart allein aus der Form des Wortes – nur, wo sie ziemlich sicher ist */
export function wortartAusForm(wort: string, sprache: string): Wortart | undefined {
  const w = wort.trim().toLowerCase()
  if (!w) return undefined
  if (hatArtikel(w, sprache)) return 'noun'
  if (sprache === 'en') {
    if (/^to\s+\S/.test(w)) return 'verb'
    if (w.includes(' ')) return undefined
    if (/(ful|less|ous|ive|able|ible)$/.test(w) && w.length > 5) return 'adj'
    return undefined
  }
  if (w.includes(' ')) return sprache === 'fr' && /^(se|s['’])\s?\S/.test(w) ? 'verb' : undefined
  // Infinitive ohne Artikel (die Nomen stehen in diesen Listen mit Artikel)
  if (sprache === 'fr' && /(er|ir|re)$/.test(w) && w.length > 3) return 'verb'
  if ((sprache === 'es' || sprache === 'pt') && /(ar|er|ir)$/.test(w) && w.length > 3) return 'verb'
  if (sprache === 'it' && /(are|ere|ire)$/.test(w) && w.length > 4) return 'verb'
  return undefined
}

const LATEIN_WORTART: Record<string, Wortart | undefined> = { substantiv: 'noun', verb: 'verb', adjektiv: 'adj', adverb: 'adv' }

/** Wortart einer Vokabel: Listenspalte vor Form; bei Latein/Griechisch die Wortart der Nennform */
export function wortartVon(v: VocabEntry, sprache: string): Wortart | undefined {
  if (sprache === 'la' || sprache === 'grc') return v.wordClass ? LATEIN_WORTART[v.wordClass] : undefined
  return wortartAusPos(v.pos) ?? wortartAusForm(v.term, sprache)
}

/** Bekannte Wortarten einer Wortgruppe, die häufigste zuerst */
export function wortartenVon(vocab: VocabEntry[], sprache: string): Wortart[] {
  const zahl = new Map<Wortart, number>()
  for (const v of vocab) {
    const w = wortartVon(v, sprache)
    if (w) zahl.set(w, (zahl.get(w) ?? 0) + 1)
  }
  return [...zahl.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w)
}

/*
 * Notreserve für den Wortkasten, nach Wortart getrennt (02.10.2026). Vorher eine einzige Liste
 * Alltagsnomen für jede Aufgabe – zwischen lauter Verben ist „window" sofort als überzählig zu
 * erkennen. Nomen mit Artikel in den Sprachen, deren Listen Nomen mit Artikel führen; fehlt der
 * Artikel bei den abgefragten Wörtern, wird er abgeschnitten.
 */
const ERSATZ: Record<string, Partial<Record<Wortart, string[]>>> = {
  en: {
    noun: ['window', 'bottle', 'garden', 'pencil', 'kitchen', 'bicycle', 'blanket', 'ladder', 'mirror', 'orange'],
    verb: ['to borrow', 'to explain', 'to forget', 'to carry', 'to arrive', 'to choose', 'to describe', 'to repair'],
    adj: ['careful', 'noisy', 'empty', 'famous', 'strange', 'friendly', 'dangerous', 'tidy']
  },
  fr: {
    noun: ['la fenêtre', 'la bouteille', 'le jardin', 'le crayon', 'la cuisine', 'le vélo', 'le miroir', 'l’orange'],
    verb: ['emprunter', 'expliquer', 'oublier', 'porter', 'arriver', 'choisir', 'décrire', 'réparer'],
    adj: ['prudent', 'bruyant', 'vide', 'célèbre', 'bizarre', 'gentil', 'dangereux', 'propre']
  },
  es: {
    noun: ['la ventana', 'la botella', 'el jardín', 'el lápiz', 'la cocina', 'la bicicleta', 'el espejo', 'la naranja'],
    verb: ['prestar', 'explicar', 'olvidar', 'llevar', 'llegar', 'elegir', 'describir', 'arreglar'],
    adj: ['cuidadoso', 'ruidoso', 'vacío', 'famoso', 'raro', 'amable', 'peligroso', 'ordenado']
  },
  it: {
    noun: ['la finestra', 'la bottiglia', 'il giardino', 'la matita', 'la cucina', 'la bicicletta', 'lo specchio', 'l’arancia'],
    verb: ['prestare', 'spiegare', 'dimenticare', 'portare', 'arrivare', 'scegliere', 'descrivere', 'riparare'],
    adj: ['attento', 'rumoroso', 'vuoto', 'famoso', 'strano', 'gentile', 'pericoloso', 'ordinato']
  },
  nl: {
    noun: ['het raam', 'de fles', 'de tuin', 'het potlood', 'de keuken', 'de fiets', 'de spiegel', 'de sinaasappel'],
    verb: ['lenen', 'uitleggen', 'vergeten', 'dragen', 'aankomen', 'kiezen', 'beschrijven', 'repareren'],
    adj: ['voorzichtig', 'luidruchtig', 'leeg', 'beroemd', 'vreemd', 'vriendelijk', 'gevaarlijk', 'netjes']
  },
  ru: { noun: ['окно', 'бутылка', 'сад', 'карандаш', 'кухня', 'велосипед', 'зеркало', 'апельсин'] },
  pl: { noun: ['okno', 'butelka', 'ogród', 'ołówek', 'kuchnia', 'rower', 'lustro', 'pomarańcza'] },
  cs: { noun: ['okno', 'láhev', 'zahrada', 'tužka', 'kuchyně', 'kolo', 'zrcadlo', 'pomeranč'] },
  pt: { noun: ['a janela', 'a garrafa', 'o jardim', 'o lápis', 'a cozinha', 'a bicicleta', 'o espelho', 'a laranja'] },
  tr: { noun: ['pencere', 'şişe', 'bahçe', 'kalem', 'mutfak', 'bisiklet', 'ayna', 'portakal'] },
  zh: { noun: ['窗户', '瓶子', '花园', '铅笔', '厨房', '自行车', '镜子', '橙子'] },
  ja: { noun: ['まど', 'びん', 'にわ', 'えんぴつ', 'だいどころ', 'じてんしゃ', 'かがみ', 'オレンジ'] },
  ar: { noun: ['نافذة', 'زجاجة', 'حديقة', 'قلم', 'مطبخ', 'دراجة', 'مرآة', 'برتقالة'] },
  da: { noun: ['et vindue', 'en flaske', 'en have', 'en blyant', 'et køkken', 'en cykel', 'et spejl', 'en appelsin'] },
  el: { noun: ['παράθυρο', 'μπουκάλι', 'κήπος', 'μολύβι', 'κουζίνα', 'ποδήλατο', 'καθρέφτης', 'πορτοκάλι'] }
}

const ohneArtikel = (wort: string, sprache: string): string => (hatArtikel(wort, sprache) ? wort.replace(/^(\S+\s+|l['’]|un['’])/i, '') : wort)

/**
 * Ersatzwörter für den Wortkasten in der Wortart der abgefragten Wörter. Ist keine Wortart
 * bekannt, gelten wie bisher die Nomen (die meisten Listen ohne Wortartspalte sind Nomenlisten);
 * gibt es für die bekannten Wortarten keine Liste, kommen gar keine Ersatzwörter – lieber ein
 * Ablenker weniger als einer, der sich selbst verrät.
 */
export function ersatzWoerter(vocab: VocabEntry[], sprache: string): string[] {
  const listen = ERSATZ[sprache] ?? ERSATZ.en
  const arten = wortartenVon(vocab, sprache)
  const gewaehlt = arten.length ? arten.filter((a) => listen[a]) : (['noun'] as Wortart[])
  return gewaehlt.flatMap((art) => {
    const liste = listen[art] ?? []
    if (art === 'noun') {
      // Artikel wie in der Liste: mit, wenn die abgefragten Nomen ihn tragen
      const mit = vocab.some((v) => hatArtikel(v.term, sprache))
      return mit ? liste : liste.map((w) => ohneArtikel(w, sprache))
    }
    if (art === 'verb' && sprache === 'en') {
      // „to swim" oder „swim" – wie die abgefragten Verben
      const verben = vocab.filter((v) => wortartVon(v, sprache) === 'verb')
      const mitTo = verben.filter((v) => /^to\s/i.test(v.term)).length >= verben.length / 2
      return mitTo ? liste : liste.map((w) => w.replace(/^to\s+/, ''))
    }
    return liste
  })
}
