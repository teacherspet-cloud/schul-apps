/**
 * Eindeutige Bilder (10.10.2026, Befund der Lehrkraft): In „Bilder beschriften" standen „to give" und „to bring" mit
 * fast gleichen Bildern (ein Junge reicht einem Mädchen etwas) nebeneinander. Ein Wort taugt nur dann als Bild-Item,
 * wenn es konkret zeigbar ist und sich allein am Bild eindeutig erkennen lässt – auch gegenüber den ANDEREN Wörtern
 * derselben Aufgabe.
 *
 * Deterministische Vorprüfung vor (und nach) der KI-Prüfung:
 *  - `bildVorpruefung`: Wortart (Funktionswörter, Adjektive außer Farben, Verben ohne eindeutige Handlung),
 *    abstrakte Wörter, Verwandtschaftswörter (ein Bild von einer Frau zeigt nicht „mum") und Verben aus den
 *    Verwechslungsgruppen (give/bring/take …) – solche Wörter sind nie Bild-Items.
 *  - `bildVerwechselbar`: zwei Wörter derselben Verwechslungsgruppe (cup/mug, pen/pencil, sea/ocean …) oder mit
 *    demselben Bild dürfen nicht in derselben Aufgabe bzw. Spielrunde stehen.
 * Gruppen auf Englisch (Wort) und Deutsch (Bedeutung) – so greifen sie für alle Sprachen über die Übersetzung.
 */

/** Kleinschreibung, ohne „to"/Artikel, Klammern und Satzzeichen */
export function bildNorm(s: string | undefined | null): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[’']/g, "'")
    .replace(/^\s*(to|a|an|the|der|die|das|ein|eine|etw\.?|jdn\.?|jdm\.?|sich)\s+/g, '')
    .replace(/\s+(sth|sb|etw\.?|jdn\.?|jdm\.?|(to|at|for|with|on|up)\s*$)/g, '')
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Verben mit sich überschneidenden Bildern (Geben/Bringen, Gehen/Kommen, Sehen/Schauen, Sagen/Sprechen …) */
export const VERB_GRUPPEN: { en: string[]; de: string[] }[] = [
  {
    en: ['give', 'bring', 'take', 'get', 'hand', 'pass', 'carry', 'fetch', 'put', 'receive', 'lend', 'borrow', 'send'],
    de: ['geben', 'bringen', 'nehmen', 'bekommen', 'kriegen', 'reichen', 'überreichen', 'tragen', 'holen', 'abholen', 'legen', 'stellen', 'erhalten', 'leihen', 'ausleihen', 'schicken', 'senden', 'mitbringen']
  },
  { en: ['go', 'come', 'walk', 'leave', 'arrive', 'get to', 'go to', 'come back', 'return'], de: ['gehen', 'kommen', 'laufen', 'verlassen', 'ankommen', 'zurückkommen', 'weggehen', 'zurückkehren'] },
  { en: ['look', 'see', 'watch', 'look at', 'notice', 'find'], de: ['sehen', 'schauen', 'ansehen', 'anschauen', 'zuschauen', 'gucken', 'bemerken', 'finden'] },
  { en: ['say', 'tell', 'speak', 'talk', 'ask', 'answer', 'call', 'explain', 'chat'], de: ['sagen', 'erzählen', 'sprechen', 'reden', 'fragen', 'antworten', 'anrufen', 'rufen', 'erklären', 'plaudern'] },
  { en: ['make', 'do', 'build', 'create'], de: ['machen', 'tun', 'bauen', 'herstellen', 'erschaffen'] },
  { en: ['listen', 'hear', 'listen to'], de: ['hören', 'zuhören', 'anhören'] },
  { en: ['learn', 'study', 'practise', 'practice', 'revise'], de: ['lernen', 'üben', 'studieren', 'wiederholen'] },
  { en: ['think', 'know', 'remember', 'forget', 'understand', 'believe', 'mean', 'guess'], de: ['denken', 'wissen', 'kennen', 'sich erinnern', 'erinnern', 'vergessen', 'verstehen', 'glauben', 'meinen', 'raten'] },
  { en: ['buy', 'pay', 'sell', 'spend'], de: ['kaufen', 'bezahlen', 'zahlen', 'verkaufen', 'ausgeben'] },
  { en: ['start', 'begin', 'stop', 'finish', 'end'], de: ['anfangen', 'beginnen', 'aufhören', 'beenden', 'enden'] },
  { en: ['open', 'close', 'shut'], de: ['öffnen', 'aufmachen', 'schließen', 'zumachen'] },
  { en: ['like', 'love', 'hate', 'want', 'need', 'prefer', 'hope', 'wish'], de: ['mögen', 'lieben', 'hassen', 'wollen', 'brauchen', 'bevorzugen', 'hoffen', 'wünschen'] },
  { en: ['meet', 'visit', 'welcome'], de: ['treffen', 'besuchen', 'begrüßen'] },
  { en: ['help', 'show', 'share', 'try', 'use', 'wait', 'stay', 'live'], de: ['helfen', 'zeigen', 'teilen', 'versuchen', 'benutzen', 'warten', 'bleiben', 'wohnen', 'leben'] }
]

/** Nomen, deren Bilder sich gegenseitig nicht unterscheiden lassen – nie zusammen in einer Aufgabe */
export const NOMEN_GRUPPEN: { en: string[]; de: string[] }[] = [
  { en: ['cup', 'mug', 'glass'], de: ['tasse', 'becher', 'glas'] },
  { en: ['house', 'home', 'flat', 'building'], de: ['haus', 'zuhause', 'wohnung', 'gebäude'] },
  { en: ['sea', 'ocean', 'lake'], de: ['meer', 'ozean', 'see'] },
  { en: ['pen', 'pencil', 'biro', 'felt tip', 'felt-tip', 'crayon'], de: ['stift', 'bleistift', 'kugelschreiber', 'kuli', 'füller', 'filzstift', 'buntstift', 'wachsmalstift'] },
  { en: ['woman', 'mum', 'mother', 'lady', 'aunt', 'grandma'], de: ['frau', 'mutter', 'mama', 'dame', 'tante', 'oma'] },
  { en: ['man', 'dad', 'father', 'gentleman', 'uncle', 'grandpa'], de: ['mann', 'vater', 'papa', 'herr', 'onkel', 'opa'] },
  { en: ['girl', 'daughter', 'sister'], de: ['mädchen', 'tochter', 'schwester'] },
  { en: ['boy', 'son', 'brother'], de: ['junge', 'sohn', 'bruder'] },
  { en: ['shop', 'store', 'supermarket', 'corner shop'], de: ['laden', 'geschäft', 'supermarkt'] },
  { en: ['road', 'street', 'lane'], de: ['straße', 'gasse'] },
  { en: ['jumper', 'pullover', 'sweater', 'sweatshirt', 'hoodie'], de: ['pullover', 'pulli', 'sweatshirt', 'kapuzenpulli'] },
  { en: ['trainers', 'shoes', 'sneakers', 'boots'], de: ['turnschuhe', 'schuhe', 'sportschuhe', 'stiefel'] },
  { en: ['trousers', 'jeans', 'pants'], de: ['hose', 'jeans'] },
  { en: ['sofa', 'couch', 'armchair'], de: ['sofa', 'couch', 'sessel'] },
  { en: ['rabbit', 'hare', 'bunny'], de: ['kaninchen', 'hase'] },
  { en: ['bag', 'schoolbag', 'rucksack', 'backpack', 'handbag'], de: ['tasche', 'schultasche', 'rucksack', 'handtasche', 'ranzen'] },
  { en: ['desk', 'table'], de: ['schreibtisch', 'tisch', 'pult'] },
  { en: ['present', 'gift', 'parcel', 'package'], de: ['geschenk', 'paket', 'päckchen'] },
  { en: ['picture', 'photo', 'painting', 'poster', 'drawing'], de: ['bild', 'foto', 'gemälde', 'poster', 'zeichnung'] },
  { en: ['plate', 'dish', 'bowl'], de: ['teller', 'schüssel', 'schale', 'gericht'] },
  { en: ['stone', 'rock'], de: ['stein', 'fels', 'felsen'] },
  { en: ['hill', 'mountain'], de: ['hügel', 'berg'] },
  { en: ['wood', 'woods', 'forest', 'tree'], de: ['wald', 'holz', 'baum'] },
  { en: ['notebook', 'exercise book', 'book', 'textbook'], de: ['heft', 'notizbuch', 'buch', 'schulbuch'] },
  { en: ['mobile', 'mobile phone', 'phone', 'smartphone', 'telephone'], de: ['handy', 'telefon', 'smartphone'] },
  { en: ['film', 'movie', 'cinema'], de: ['film', 'kino'] },
  { en: ['town', 'city', 'village'], de: ['stadt', 'großstadt', 'dorf'] },
  { en: ['bin', 'rubbish', 'litter', 'dustbin'], de: ['mülleimer', 'müll', 'abfall', 'mülltonne'] },
  { en: ['coat', 'jacket', 'anorak'], de: ['mantel', 'jacke', 'anorak'] },
  { en: ['bike', 'bicycle'], de: ['fahrrad', 'rad'] },
  { en: ['car', 'taxi'], de: ['auto', 'wagen', 'taxi'] },
  { en: ['ill', 'sick'], de: ['krank'] },
  { en: ['lorry', 'truck', 'van'], de: ['lastwagen', 'lkw', 'lieferwagen'] },
  { en: ['teacher', 'headteacher', 'head teacher'], de: ['lehrer', 'lehrerin', 'schulleiter', 'schulleiterin'] },
  { en: ['pupil', 'student', 'classmate', 'friend', 'kid', 'child'], de: ['schüler', 'schülerin', 'mitschüler', 'mitschülerin', 'freund', 'freundin', 'kind'] }
]

/** Nie eindeutig zeigbar: Verwandtschaft und Beziehungen (der Bezug fehlt im Bild) */
const BEZIEHUNG = new Set([
  'brother', 'sister', 'mum', 'mom', 'mother', 'dad', 'father', 'aunt', 'uncle', 'cousin', 'grandma', 'granny', 'grandmother', 'grandpa', 'grandad',
  'grandfather', 'grandparents', 'parents', 'son', 'daughter', 'husband', 'wife', 'friend', 'best friend', 'neighbour', 'neighbor', 'family', 'stepmother',
  'stepfather', 'stepbrother', 'stepsister', 'twin', 'twins', 'classmate', 'partner', 'boyfriend', 'girlfriend', 'guest', 'host', 'stranger',
  'bruder', 'schwester', 'mutter', 'mama', 'vater', 'papa', 'tante', 'onkel', 'cousin', 'cousine', 'oma', 'großmutter', 'opa', 'großvater', 'großeltern',
  'eltern', 'sohn', 'tochter', 'ehemann', 'ehefrau', 'freund', 'freundin', 'bester freund', 'beste freundin', 'nachbar', 'nachbarin', 'familie', 'zwilling',
  'zwillinge', 'mitschüler', 'mitschülerin', 'gast', 'fremder'
])

/** Abstrakte Wörter und Zeitangaben – kein eindeutiges Bild */
const ABSTRAKT = new Set([
  'idea', 'time', 'life', 'love', 'problem', 'reason', 'thing', 'way', 'fun', 'help', 'luck', 'peace', 'friendship', 'home', 'holiday', 'holidays',
  'weekend', 'week', 'day', 'month', 'year', 'today', 'tomorrow', 'yesterday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'sunday', 'question', 'answer', 'information', 'news', 'hobby', 'job', 'lesson', 'homework', 'favourite', 'mistake', 'story', 'word', 'name',
  'language', 'thanks', 'sorry', 'hello', 'goodbye', 'please', 'free time', 'chance', 'fact', 'opinion', 'dream', 'plan', 'rule', 'trouble',
  'future', 'past', 'moment', 'minute', 'hour', 'second', 'activity', 'event', 'place', 'part', 'kind', 'sort', 'type', 'example',
  'idee', 'zeit', 'leben', 'liebe', 'problem', 'grund', 'ding', 'sache', 'spaß', 'hilfe', 'glück', 'frieden', 'freundschaft', 'zuhause', 'ferien',
  'urlaub', 'wochenende', 'woche', 'tag', 'monat', 'jahr', 'heute', 'morgen', 'gestern', 'frage', 'antwort', 'information', 'nachricht', 'hobby',
  'beruf', 'unterrichtsstunde', 'hausaufgabe', 'hausaufgaben', 'lieblings', 'fehler', 'geschichte', 'wort', 'name', 'sprache', 'danke',
  'entschuldigung', 'hallo', 'freizeit', 'gelegenheit', 'tatsache', 'meinung', 'traum', 'plan', 'regel', 'ärger', 'zukunft', 'vergangenheit',
  'gegenwart', 'augenblick', 'minute', 'stunde', 'sekunde', 'aktivität', 'ereignis', 'ort', 'platz', 'teil', 'art', 'beispiel'
])

/** Farben: die einzigen Adjektive, die ein Bild eindeutig zeigt */
const FARBEN = new Set([
  'red', 'blue', 'green', 'yellow', 'black', 'white', 'orange', 'pink', 'purple', 'brown', 'grey', 'gray',
  'rot', 'blau', 'grün', 'gelb', 'schwarz', 'weiß', 'orange', 'rosa', 'pink', 'lila', 'violett', 'braun', 'grau'
])

/** Verben mit unverwechselbarer Handlung (allein gezeigt) */
const KLARE_HANDLUNG = new Set([
  'swim', 'jump', 'sleep', 'eat', 'drink', 'read', 'write', 'sing', 'dance', 'cook', 'climb', 'ride', 'fly', 'cry', 'laugh', 'paint', 'draw',
  'skate', 'ski', 'surf', 'fish', 'run', 'cycle', 'wash', 'brush', 'clap', 'kick', 'throw', 'catch', 'wave', 'smile', 'knit', 'dive', 'row', 'sail',
  'schwimmen', 'springen', 'schlafen', 'essen', 'trinken', 'lesen', 'schreiben', 'singen', 'tanzen', 'kochen', 'klettern', 'reiten', 'fliegen',
  'weinen', 'lachen', 'malen', 'zeichnen', 'skaten', 'skifahren', 'surfen', 'angeln', 'rennen', 'radfahren', 'waschen', 'putzen', 'klatschen',
  'treten', 'werfen', 'fangen', 'winken', 'lächeln', 'stricken', 'tauchen', 'rudern', 'segeln'
])

export interface BildWort {
  term: string
  translation?: string
  pos?: string
}

export type BildWortart = 'nomen' | 'verb' | 'adjektiv' | 'funktion' | 'wendung' | 'unbekannt'

/** Wortart grob aus Spalte, „to …" oder deutscher Bedeutung */
export function bildWortart(w: BildWort): BildWortart {
  const pos = (w.pos ?? '').toLowerCase()
  if (/prep|pron|conj|det|art|interj|präp|konj|adv|num|zahl/.test(pos)) return 'funktion'
  if (/adj/.test(pos)) return 'adjektiv'
  if (/verb|\bv\b/.test(pos)) return 'verb'
  if (/noun|nomen|subst|\bn\b/.test(pos)) return 'nomen'
  const t = String(w.term ?? '').trim()
  if (/^to\s+\S/i.test(t)) return 'verb'
  if (bildNorm(t).split(' ').length > 3) return 'wendung'
  const de = String(w.translation ?? '').trim()
  if (/^(der|die|das)\s+\S/i.test(de) || /^[A-ZÄÖÜ]/.test(de)) return 'nomen'
  if (/^[a-zäöüß]+(en|ern|eln)$/.test(de)) return 'verb'
  return 'unbekannt'
}

const NORM_GRUPPE = (liste: string[]): Set<string> => new Set(liste.map(bildNorm))
const VERB_SETS = VERB_GRUPPEN.map((g) => ({ en: NORM_GRUPPE(g.en), de: NORM_GRUPPE(g.de) }))
const NOMEN_SETS = NOMEN_GRUPPEN.map((g) => ({ en: NORM_GRUPPE(g.en), de: NORM_GRUPPE(g.de) }))

/** Bedeutungen der deutschen Übersetzung („geben, reichen" → beide) */
const bedeutungen = (de: string | undefined): string[] =>
  String(de ?? '')
    .split(/[,;/]| oder /)
    .map(bildNorm)
    .filter(Boolean)

/** Gruppen (Kennungen), in denen das Wort steht – über das Wort (Englisch) oder seine deutsche Bedeutung */
export function bildGruppen(w: BildWort, sprache = 'en'): string[] {
  const term = bildNorm(w.term)
  const de = bedeutungen(w.translation)
  const out: string[] = []
  const pruefe = (sets: { en: Set<string>; de: Set<string> }[], art: string): void =>
    sets.forEach((g, i) => {
      if ((sprache === 'en' && g.en.has(term)) || de.some((d) => g.de.has(d))) out.push(`${art}${i}`)
    })
  pruefe(VERB_SETS, 'v')
  pruefe(NOMEN_SETS, 'n')
  return out
}

/**
 * Deterministische Vorprüfung: Darf das Wort überhaupt ein Bild-Item sein? `grund` erklärt die Ablehnung.
 * `unsicher` = keine Regel greift; dann entscheidet die KI (mit höherer Schwelle bei Verben).
 */
export function bildVorpruefung(w: BildWort, sprache = 'en'): { ok: boolean; grund?: string; unsicher?: boolean } {
  const term = bildNorm(w.term)
  const de = bedeutungen(w.translation)
  const art = bildWortart(w)
  if (!term) return { ok: false, grund: 'leer' }
  if (art === 'funktion') return { ok: false, grund: 'Funktionswort' }
  if (art === 'wendung') return { ok: false, grund: 'Wendung' }
  const enTreffer = (s: Set<string>): boolean => sprache === 'en' && s.has(term)
  if (enTreffer(BEZIEHUNG) || de.some((d) => BEZIEHUNG.has(d))) return { ok: false, grund: 'Verwandtschaft/Beziehung – im Bild nicht eindeutig' }
  if (enTreffer(ABSTRAKT) || (de.length && de.every((d) => ABSTRAKT.has(d)))) return { ok: false, grund: 'abstrakt' }
  if (art === 'adjektiv') return enTreffer(FARBEN) || de.some((d) => FARBEN.has(d)) ? { ok: true } : { ok: false, grund: 'Adjektiv' }
  if (art === 'verb' || bildGruppen(w, sprache).some((g) => g.startsWith('v'))) {
    if (bildGruppen(w, sprache).some((g) => g.startsWith('v'))) return { ok: false, grund: 'Verb mit verwechselbarem Bild (z. B. give/bring)' }
    if (enTreffer(KLARE_HANDLUNG) || de.some((d) => KLARE_HANDLUNG.has(d))) return { ok: true }
    return { ok: true, unsicher: true }
  }
  return { ok: true }
}

/** Zwei Wörter derselben Verwechslungsgruppe – oder mit demselben Bild? */
export function bildVerwechselbar(a: BildWort & { bild?: string }, b: BildWort & { bild?: string }, sprache = 'en'): boolean {
  if (a.bild && b.bild && a.bild === b.bild) return true
  const ga = bildGruppen(a, sprache)
  if (!ga.length) return false
  const gb = new Set(bildGruppen(b, sprache))
  return ga.some((g) => gb.has(g))
}

/**
 * Wörter für eine Bildaufgabe bzw. Bilderrunde: nur zeigbare, und keine zwei, die man verwechseln kann
 * (das erste bleibt). `konflikte`: zusätzliche, von der KI gemeldete Paare (Kennungen).
 */
export function bildAuswahl<T extends BildWort & { id: string; bild?: string; bildKonflikte?: string[] }>(
  woerter: T[],
  sprache = 'en',
  o: { vorpruefung?: boolean } = {}
): T[] {
  const out: T[] = []
  for (const w of woerter) {
    if (o.vorpruefung !== false && !bildVorpruefung(w, sprache).ok) continue
    if (out.some((x) => bildVerwechselbar(w, x, sprache) || w.bildKonflikte?.includes(x.id) || x.bildKonflikte?.includes(w.id))) continue
    out.push(w)
  }
  return out
}

/**
 * Wörter mit Bild für die Bilderspiele der Lernenden (Bilderrätsel, Wort → Bild, Bild-Memory …): ohne Verben aus den
 * Verwechslungsgruppen (give/bring …), und von zwei verwechselbaren Wörtern bzw. zwei Wörtern mit demselben Bild der
 * Medienbank bleibt nur eines – sonst wäre im Spiel eine von zwei gleichen Karten „falsch".
 */
export function spielBildWoerter<T extends BildWort & { id: string; bild?: string }>(woerter: T[], sprache = 'en'): T[] {
  const out: T[] = []
  for (const w of woerter) {
    if (!w.bild) continue
    if (bildGruppen(w, sprache).some((g) => g.startsWith('v'))) continue
    if (out.some((x) => bildVerwechselbar(w, x, sprache))) continue
    out.push(w)
  }
  return out
}
