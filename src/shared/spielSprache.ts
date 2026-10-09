/**
 * Spielnamen und Spieltexte in der Zielsprache des Kurses (09.10.2026, Entscheidung der Lehrkraft): Lernende sehen
 * Spielnamen NUR in der Sprache, die sie lernen („Escape Room", „L'évasion", „Effugium" …) – ohne deutschen
 * Untertitel. Regeln, Anleitungen und Hinweise in den Mehrspieler-Spielen ebenfalls in der Zielsprache, in Klasse 5–6
 * in einfacher Sprache, ab Klasse 7 normal. Fehlt eine Übersetzung, gilt Englisch; DaZ-Kurse (Deutsch) behalten die
 * deutschen Namen.
 *
 * Eine Tabelle für Einzel- und Mehrspieler-Spiele (Schlüssel `art:id`), damit beide Wege dieselben Namen zeigen.
 */

import { EINHEITEN, EINZEL_BESCHREIBUNG, TEXTE2 } from './spielTexte'
import { PAKETE } from './spielSprachen'

import type { SprachPaket } from './spielSprachen/typ'

export type SpielArt = 'mehr' | 'vok' | 'gram'
/** Sprachen mit eigenen Texten; alle anderen fallen auf Englisch zurück */
export type TextSprache = 'de' | 'en' | 'fr' | 'es' | 'it' | 'la' | 'ru' | 'nl' | 'pt'

type Namen = Partial<Record<TextSprache, string>>

/** Kurscode (en, en-GB, fr, la, grc …) → Sprache der Tabelle */
export const textSprache = (sprache: string | undefined | null): string => (sprache ?? '').trim().toLowerCase().split(/[-_]/)[0] || 'en'

/** Klasse 5–6 (oder jünger): einfache Sprache */
export const einfacheSprache = (jahrgang: number | null | undefined): boolean => typeof jahrgang === 'number' && jahrgang <= 6

// Reihenfolge der Spalten: de, en, fr, es, it, la, ru, nl, pt
const SP: TextSprache[] = ['de', 'en', 'fr', 'es', 'it', 'la', 'ru', 'nl', 'pt']
const n = (...w: string[]): Namen => Object.fromEntries(w.map((x, i) => [SP[i], x]).filter(([, x]) => x)) as Namen

const NAMEN: Record<string, Namen> = {
  // ---------------------------------------------------------------- Mehrspieler (Kooperativ/Versus)
  'mehr:teammatch': n('Team-Match', 'Team Match', "Match d'équipe", 'Partida en equipo', 'Partita di squadra', 'Certamen turmae', 'Командный матч', 'Teamwedstrijd', 'Partida em equipa'),
  'mehr:satzbaustelle': n('Satzbaustelle', 'Sentence Builder', 'Chantier de phrases', 'Obra de frases', 'Cantiere delle frasi', 'Fabrica sententiarum', 'Конструктор предложений', 'Zinnenbouwer', 'Construtor de frases'),
  'mehr:fluchtraum': n('Fluchtraum', 'Escape Room', "L'évasion", 'Sala de escape', 'La fuga', 'Effugium', 'Побег', 'Ontsnappingskamer', 'Sala de fuga'),
  'mehr:beschreiben': n('Beschreib-Raten', 'Describe It', 'Décris et devine', 'Describe y adivina', 'Descrivi e indovina', 'Describe et divina', 'Опиши слово', 'Omschrijf het', 'Descreve e adivinha'),
  'mehr:tauziehen': n('Tauziehen', 'Tug of War', 'Tir à la corde', 'Tira y afloja', 'Tiro alla fune', 'Certamen funis', 'Перетягивание каната', 'Touwtrekken', 'Cabo de guerra'),
  'mehr:staffel': n('Formen-Staffel', 'Form Relay', 'Relais des formes', 'Relevo de formas', 'Staffetta delle forme', 'Cursus formarum', 'Эстафета форм', 'Vormenestafette', 'Estafeta de formas'),
  'mehr:bingo': n('Wort-Bingo', 'Word Bingo', 'Bingo des mots', 'Bingo de palabras', 'Bingo delle parole', 'Bingo verborum', 'Словесное бинго', 'Woordbingo', 'Bingo de palavras'),
  'mehr:schiffe': n('Schiffe versenken', 'Battleships', 'Bataille navale', 'Hundir la flota', 'Battaglia navale', 'Proelium navale', 'Морской бой', 'Zeeslag', 'Batalha naval'),
  'mehr:wortkette': n('Wortkette', 'Word Chain', 'Chaîne de mots', 'Cadena de palabras', 'Catena di parole', 'Catena verborum', 'Цепочка слов', 'Woordketting', 'Cadeia de palavras'),
  'mehr:bildergeschichte': n('Bildergeschichte', 'Picture Story', 'Histoire en images', 'Historia en imágenes', 'Storia per immagini', 'Fabula picta', 'История в картинках', 'Plaatjesverhaal', 'História em imagens'),
  'mehr:teammemory': n('Team-Memory', 'Team Memory', "Memory d'équipe", 'Memoria en equipo', 'Memory di squadra', 'Memoria communis', 'Командное мемори', 'Teammemory', 'Memória em equipa'),
  'mehr:kreuzwort': n('Geteiltes Kreuzwort', 'Shared Crossword', 'Mots croisés partagés', 'Crucigrama compartido', 'Cruciverba condiviso', 'Verba decussata communia', 'Общий кроссворд', 'Gedeelde kruiswoordpuzzel', 'Palavras cruzadas partilhadas'),
  'mehr:fehlerdetektive': n('Fehlerdetektive', 'Mistake Detectives', 'Détectives des fautes', 'Detectives de errores', 'Detective degli errori', 'Indagatores errorum', 'Детективы ошибок', 'Foutendetectives', 'Detetives de erros'),
  'mehr:uebersetzung': n('Übersetzungs-Puzzle', 'Translation Puzzle', 'Puzzle de traduction', 'Puzle de traducción', 'Puzzle di traduzione', 'Aenigma translationis', 'Пазл перевода', 'Vertaalpuzzel', 'Puzzle de tradução'),
  'mehr:dialog': n('Dialog-Theater', 'Dialogue Theatre', 'Théâtre de dialogues', 'Teatro de diálogos', 'Teatro dei dialoghi', 'Theatrum dialogorum', 'Театр диалогов', 'Dialoogtheater', 'Teatro de diálogos'),
  'mehr:woerterturm': n('Wörterturm', 'Word Tower', 'Tour de mots', 'Torre de palabras', 'Torre di parole', 'Turris verborum', 'Башня слов', 'Woordentoren', 'Torre de palavras'),
  'mehr:hoerkette': n('Hör-Kette', 'Listening Chain', "Chaîne d'écoute", 'Cadena de escucha', "Catena d'ascolto", 'Catena audiendi', 'Цепочка на слух', 'Luisterketting', 'Cadeia de escuta'),
  'mehr:zeitstrahl': n('Zeitstrahl', 'Timeline', 'Frise chronologique', 'Línea del tiempo', 'Linea del tempo', 'Linea temporum', 'Линия времени', 'Tijdlijn', 'Linha do tempo'),
  'mehr:reiseplaner': n('Reiseplaner', 'Trip Planner', 'Planificateur de voyage', 'Planificador de viajes', 'Pianificatore di viaggi', 'Consilium itineris', 'Планировщик путешествий', 'Reisplanner', 'Planeador de viagens'),
  'mehr:schnapp': n('Schnapp!', 'Snap!', 'Attrape !', '¡Atrapa!', 'Prendi!', 'Cape!', 'Хватай!', 'Snap!', 'Apanha!'),
  'mehr:galgen': n('Galgen-Duell', 'Hangman Duel', 'Duel du pendu', 'Duelo del ahorcado', "Duello dell'impiccato", 'Certamen litterarum', 'Дуэль «Виселица»', 'Galgje-duel', 'Duelo da forca'),
  'mehr:buzzer': n('Team-Buzzer', 'Team Buzzer', "Buzzer d'équipe", 'Pulsador en equipo', 'Buzzer di squadra', 'Tintinnabulum turmae', 'Командная кнопка', 'Teambuzzer', 'Buzzer de equipa'),
  'mehr:konjugation': n('Konjugations-Duell', 'Conjugation Duel', 'Duel de conjugaison', 'Duelo de conjugación', 'Duello di coniugazione', 'Certamen coniugationum', 'Дуэль спряжений', 'Vervoegingsduel', 'Duelo de conjugação'),
  'mehr:umbau': n('Umbau-Rennen', 'Rewrite Race', 'Course de transformation', 'Carrera de transformación', 'Gara di trasformazione', 'Cursus mutandi', 'Гонка перестройки', 'Ombouwrace', 'Corrida de transformação'),
  'mehr:kollokation': n('Kollokations-Duell', 'Collocation Duel', 'Duel des collocations', 'Duelo de colocaciones', 'Duello delle collocazioni', 'Certamen iuncturarum', 'Дуэль словосочетаний', 'Collocatieduel', 'Duelo de colocações'),
  'mehr:auktion': n('Wort-Auktion', 'Word Auction', 'Enchères de mots', 'Subasta de palabras', 'Asta delle parole', 'Auctio verborum', 'Аукцион слов', 'Woordveiling', 'Leilão de palavras'),
  'mehr:domino': n('Wort-Domino', 'Word Dominoes', 'Dominos de mots', 'Dominó de palabras', 'Domino di parole', 'Tesserae verborum', 'Словесное домино', 'Woorddomino', 'Dominó de palavras'),
  'mehr:stadtland': n('Stadt-Land-Fluss', 'Categories', 'Petit bac', 'Basta', 'Nomi, cose, città', 'Urbs, terra, flumen', 'Город, страна, река', 'Stad, land, rivier', 'Stop'),
  'mehr:sniper': n('Fehler-Sniper', 'Mistake Sniper', 'Sniper des fautes', 'Francotirador de errores', 'Cecchino degli errori', 'Sagittarius errorum', 'Снайпер ошибок', 'Foutensniper', 'Atirador de erros'),
  'mehr:synonyme': n('Synonym-Leiter', 'Synonym Ladder', 'Échelle des synonymes', 'Escalera de sinónimos', 'Scala dei sinonimi', 'Scala synonymorum', 'Лестница синонимов', 'Synoniemenladder', 'Escada de sinónimos'),
  // ---------------------------------------------------------------- Vokabelspiele (allein)
  'vok:memory': n('Memory', 'Memory', 'Memory', 'Memoria', 'Memory', 'Memoria', 'Мемори', 'Memory', 'Jogo da memória'),
  'vok:zuordnen': n('Zuordnen gegen die Uhr', 'Match Against the Clock', 'Associe contre la montre', 'Empareja contra reloj', 'Abbina contro il tempo', 'Coniunge contra horam', 'Пары на время', 'Koppelen tegen de klok', 'Associa contra o relógio'),
  'vok:blitz': n('Blitzrunde', 'Lightning Round', 'Manche éclair', 'Ronda relámpago', 'Round lampo', 'Fulmen', 'Блиц', 'Bliksemronde', 'Ronda relâmpago'),
  'vok:satz': n('Satzpuzzle', 'Sentence Puzzle', 'Puzzle de phrases', 'Puzle de frases', 'Puzzle di frasi', 'Aenigma sententiarum', 'Пазл предложений', 'Zinnenpuzzel', 'Puzzle de frases'),
  'vok:wortraten': n('Wortraten', 'Guess the Word', 'Le mot mystère', 'Adivina la palabra', 'Indovina la parola', 'Verbum divina', 'Угадай слово', 'Raad het woord', 'Adivinha a palavra'),
  'vok:kreuzwort': n('Kreuzworträtsel', 'Crossword', 'Mots croisés', 'Crucigrama', 'Cruciverba', 'Verba decussata', 'Кроссворд', 'Kruiswoordpuzzel', 'Palavras cruzadas'),
  'vok:fallend': n('Fallende Wörter', 'Falling Words', 'Mots qui tombent', 'Palabras que caen', 'Parole che cadono', 'Verba cadentia', 'Падающие слова', 'Vallende woorden', 'Palavras a cair'),
  'vok:suchsel': n('Buchstabensalat', 'Word Search', 'Mots mêlés', 'Sopa de letras', 'Cerca parole', 'Quaere verba', 'Поиск слов', 'Woordzoeker', 'Sopa de letras'),
  'vok:bildwort': n('Bilderrätsel', 'Picture Puzzle', 'Devinette en images', 'Adivinanza con imágenes', 'Indovinello per immagini', 'Aenigma pictum', 'Загадка в картинках', 'Plaatjesraadsel', 'Adivinha com imagens'),
  'vok:hoeren': n('Hörquiz', 'Listening Quiz', "Quiz d'écoute", 'Quiz de escucha', "Quiz d'ascolto", 'Probatio audiendi', 'Аудиовикторина', 'Luisterquiz', 'Quiz de escuta'),
  'vok:satzhoeren': n('Satz-Diktat', 'Sentence Dictation', 'Dictée de phrases', 'Dictado de frases', 'Dettato di frasi', 'Dictatio sententiarum', 'Диктант предложений', 'Zinnendictee', 'Ditado de frases'),
  'vok:diktat': n('Hören & Schreiben', 'Listen & Write', 'Écoute et écris', 'Escucha y escribe', 'Ascolta e scrivi', 'Audi et scribe', 'Слушай и пиши', 'Luister en schrijf', 'Ouve e escreve'),
  'vok:satzluecke': n('Satz-Lücke', 'Fill the Gap', 'Phrase à trous', 'Rellena el hueco', 'Frase con lacuna', 'Lacuna sententiae', 'Пропуск в предложении', 'Vul het gat in', 'Frase com lacuna'),
  'vok:duell': n('Wortduell', 'Word Duel', 'Duel de mots', 'Duelo de palabras', 'Duello di parole', 'Certamen verborum', 'Дуэль слов', 'Woordduel', 'Duelo de palavras'),
  'vok:hoermemory': n('Hör-Memory', 'Listening Memory', 'Memory sonore', 'Memoria auditiva', "Memory d'ascolto", 'Memoria audiendi', 'Мемори на слух', 'Luistermemory', 'Memória auditiva'),
  'vok:richtiggehoert': n('Richtig gehört?', 'Heard It Right?', 'Bien entendu ?', '¿Lo has oído bien?', 'Hai sentito bene?', 'Recte audivisti?', 'Правильно услышал?', 'Goed gehoord?', 'Ouviste bem?'),
  'vok:buchstaben': n('Buchstaben-Puzzle', 'Letter Puzzle', 'Puzzle de lettres', 'Puzle de letras', 'Puzzle di lettere', 'Aenigma litterarum', 'Пазл из букв', 'Letterpuzzel', 'Puzzle de letras'),
  'vok:hoerbingo': n('Hör-Bingo', 'Listening Bingo', 'Bingo sonore', 'Bingo auditivo', "Bingo d'ascolto", 'Bingo audiendi', 'Бинго на слух', 'Luisterbingo', 'Bingo auditivo'),
  'vok:bildmemory': n('Bild-Memory', 'Picture Memory', 'Memory en images', 'Memoria con imágenes', 'Memory per immagini', 'Memoria picta', 'Мемори с картинками', 'Plaatjesmemory', 'Memória com imagens'),
  'vok:wasfehlt': n('Was fehlt?', "What's Missing?", "Qu'est-ce qui manque ?", '¿Qué falta?', 'Che cosa manca?', 'Quid deest?', 'Чего не хватает?', 'Wat ontbreekt er?', 'O que falta?'),
  'vok:aufdecken': n('Bild aufdecken', 'Reveal the Picture', "Découvre l'image", 'Descubre la imagen', "Scopri l'immagine", 'Detege picturam', 'Открой картинку', 'Onthul het plaatje', 'Descobre a imagem'),
  'vok:wortbild': n('Wort → Bild', 'Word → Picture', 'Mot → image', 'Palabra → imagen', 'Parola → immagine', 'Verbum → pictura', 'Слово → картинка', 'Woord → plaatje', 'Palavra → imagem'),
  'vok:verbtrio': n('Stammformen-Trio', 'Verb Forms Trio', 'Trio des formes', 'Trío de formas', 'Trio dei paradigmi', 'Trias formarum', 'Трио форм', 'Stamtijdentrio', 'Trio de formas'),
  'vok:formenblitz': n('Formen-Blitz', 'Form Flash', 'Éclair des formes', 'Relámpago de formas', 'Lampo delle forme', 'Fulmen formarum', 'Блиц форм', 'Vormenflits', 'Relâmpago de formas'),
  'vok:bildverb': n('Bild-Verb', 'Picture Verb', 'Verbe en image', 'Verbo con imagen', 'Verbo per immagini', 'Verbum pictum', 'Глагол по картинке', 'Plaatjeswerkwoord', 'Verbo com imagem'),
  'vok:muster': n('Muster sortieren', 'Sort the Patterns', 'Trie les modèles', 'Ordena los patrones', 'Ordina i modelli', 'Exempla ordina', 'Сортировка по образцу', 'Patronen sorteren', 'Ordena os padrões'),
  // ---------------------------------------------------------------- Grammatikspiele (allein)
  'gram:fehlerjagd': n('Fehler finden', 'Find the Mistake', 'Trouve la faute', 'Encuentra el error', "Trova l'errore", 'Errorem inveni', 'Найди ошибку', 'Vind de fout', 'Encontra o erro'),
  'gram:satzbaupuzzle': n('Satzbau-Puzzle', 'Build the Sentence', 'Construis la phrase', 'Construye la frase', 'Costruisci la frase', 'Sententiam construe', 'Собери предложение', 'Bouw de zin', 'Constrói a frase'),
  'gram:formenblitz': n('Formen-Blitz', 'Form Flash', 'Éclair des formes', 'Relámpago de formas', 'Lampo delle forme', 'Fulmen formarum', 'Блиц форм', 'Vormenflits', 'Relâmpago de formas'),
  'gram:regelzuordnen': n('Regel zuordnen', 'Match the Rule', 'Associe la règle', 'Relaciona la regla', 'Abbina la regola', 'Regulam adiunge', 'Подбери правило', 'Koppel de regel', 'Associa a regra'),
  'gram:verbtrio': n('Stammformen-Trio', 'Verb Forms Trio', 'Trio des formes', 'Trío de formas', 'Trio dei paradigmi', 'Trias formarum', 'Трио форм', 'Stamtijdentrio', 'Trio de formas'),
  'gram:verbblitz': n('Formen-Blitz', 'Form Flash', 'Éclair des formes', 'Relámpago de formas', 'Lampo delle forme', 'Fulmen formarum', 'Блиц форм', 'Vormenflits', 'Relâmpago de formas'),
  'gram:bildverb': n('Bild-Verb', 'Picture Verb', 'Verbe en image', 'Verbo con imagen', 'Verbo per immagini', 'Verbum pictum', 'Глагол по картинке', 'Plaatjeswerkwoord', 'Verbo com imagem'),
  'gram:muster': n('Muster sortieren', 'Sort the Patterns', 'Trie les modèles', 'Ordena los patrones', 'Ordina i modelli', 'Exempla ordina', 'Сортировка по образцу', 'Patronen sorteren', 'Ordena os padrões'),
  'gram:richtigfalsch': n('Richtig oder falsch?', 'Right or Wrong?', 'Juste ou faux ?', '¿Correcto o incorrecto?', 'Giusto o sbagliato?', 'Rectum an falsum?', 'Правильно или нет?', 'Goed of fout?', 'Certo ou errado?'),
  'gram:formenmemory': n('Formen-Memory', 'Form Memory', 'Memory des formes', 'Memoria de formas', 'Memory delle forme', 'Memoria formarum', 'Мемори форм', 'Vormenmemory', 'Memória de formas'),
  'gram:tabellenpuzzle': n('Tabellen-Puzzle', 'Table Puzzle', 'Puzzle du tableau', 'Puzle de la tabla', 'Puzzle della tabella', 'Aenigma tabulae', 'Пазл-таблица', 'Tabelpuzzel', 'Puzzle da tabela'),
  'gram:signalwort': n('Signalwort-Sortierer', 'Signal Word Sorter', 'Les mots indicateurs', 'Palabras señal', 'Parole segnale', 'Signa temporis', 'Сигнальные слова', 'Signaalwoorden', 'Palavras-sinal')
}

/**
 * Name eines Spiels in der Zielsprache. `art`: 'mehr' (Kooperativ/Versus), 'vok' (Vokabelspiel), 'gram'
 * (Grammatikspiel). Fehlende Sprache → Englisch; unbekanntes Spiel → `ersatz` bzw. die Kennung.
 */
export function spielName(art: SpielArt, id: string, sprache: string | null | undefined, ersatz?: string): string {
  const e = NAMEN[`${art}:${id}`]
  if (!e) return ersatz ?? id
  const sp = textSprache(sprache)
  return e[sp as TextSprache] ?? PAKETE[sp]?.namen?.[`${art}:${id}`] ?? e.en ?? e.de ?? ersatz ?? id
}

/** Für Lehrkraft-Listen: deutscher Name mit dem Namen in der Zielsprache, wenn er anders lautet */
export function spielNameMitZiel(art: SpielArt, id: string, sprache: string | null | undefined): string {
  const de = NAMEN[`${art}:${id}`]?.de ?? id
  const ziel = spielName(art, id, sprache, de)
  return ziel === de ? de : `${ziel} (${de})`
}

/** Alle Schlüssel der Tabelle (für Tests: jede Kennung hat einen Eintrag) */
/** Beschreibung eines Einzelspiels (Spielkarte) in der Zielsprache; `de` = deutscher Text aus SPIELE/GRAMMATIK_SPIELE */
export function einzelBeschreibung(art: 'vok' | 'gram', id: string, de: string, sprache: string | null | undefined): string {
  const e = EINZEL_BESCHREIBUNG[`${art}:${id}`]
  return e ? waehle({ de, ...e }, sprache, null, (p) => p.einzel[`${art}:${id}`]) : de
}

/** Einheit (Rekord, Ergebnis) in der Zielsprache – Schlüssel ist die deutsche Einheit */
export function spielEinheit(einheit: string, sprache: string | null | undefined): string {
  const e = EINHEITEN[einheit]
  return e ? waehle({ de: einheit, ...e }, sprache, null, (p) => p.einheiten[einheit]) : einheit
}

export const SPIELNAMEN_SCHLUESSEL: readonly string[] = Object.keys(NAMEN)

// ---------------------------------------------------------------- Texte

/** Ein Text je Sprache: eine Fassung oder [einfach (Klasse 5–6), normal (ab Klasse 7)] */
type Fassung = string | [string, string]
type Texte = Partial<Record<TextSprache, Fassung>> & { de: Fassung; en: Fassung }

function waehle(t: Texte, sprache: string | null | undefined, jahrgang: number | null | undefined, paket?: (p: SprachPaket) => string | undefined): string {
  const sp = textSprache(sprache)
  const ausPaket = paket && PAKETE[sp] ? paket(PAKETE[sp]) : undefined
  if (ausPaket !== undefined && !(sp in t)) return ausPaket
  const f = t[sp as TextSprache] ?? t.en
  return Array.isArray(f) ? f[einfacheSprache(jahrgang) ? 0 : 1] : f
}

const fuellen = (s: string, werte: (string | number)[]): string => s.replace(/\{(\d)\}/g, (_, i) => String(werte[Number(i)] ?? ''))

/** Beschreibungen (Regeln in einem Satz) der Mehrspieler-Spiele – Deutsch steht in typen.ts (MEHRSPIELE) */
const BESCHREIBUNG: Record<string, Omit<Texte, 'de'>> = {
  teammatch: {
    en: ['Everyone sees the question. Only one phone has the right answer. Talk to your team!', 'Everyone sees the question, but the right answer is on only one device. Talk to each other!'],
    fr: 'Tout le monde voit la question. La bonne réponse est sur un seul appareil. Parlez ensemble !',
    es: 'Todos veis la pregunta. La respuesta correcta está solo en un aparato. ¡Hablad entre vosotros!',
    it: 'Tutti vedono la domanda. La risposta giusta è solo su un dispositivo. Parlate tra voi!',
    la: 'Omnes quaestionem vident. Responsum rectum in uno tantum instrumento est. Colloquimini!'
  },
  satzbaustelle: {
    en: ['Everyone has some words of the sentence. Put them in the right order together.', 'Each of you holds some words of the sentence – put them in the right order together. Careful: from year 7 not every word belongs.'],
    fr: 'Chacun a quelques mots de la phrase. Mettez-les ensemble dans le bon ordre.',
    es: 'Cada uno tiene algunas palabras de la frase. Ponedlas juntos en el orden correcto.',
    it: "Ognuno ha alcune parole della frase. Mettetele insieme nell'ordine giusto.",
    la: 'Quisque verba quaedam sententiae habet. Ea una recto ordine ponite.'
  },
  fluchtraum: {
    en: [
      'Answer questions as a team. Every few right answers you get a letter of the secret word. Find the word and escape!',
      'Solve tasks as a team: every few correct answers reveal a letter of the code word. Use the clues, guess the word and escape!'
    ],
    fr: "Répondez en équipe. Après quelques bonnes réponses, vous recevez une lettre du mot secret. Trouvez le mot et sortez !",
    es: 'Responded en equipo. Con varias respuestas correctas recibís una letra de la palabra secreta. ¡Encontrad la palabra y escapad!',
    it: 'Rispondete in squadra. Dopo alcune risposte giuste ricevete una lettera della parola segreta. Trovate la parola e fuggite!',
    la: 'Una respondete. Post aliquot responsa recta litteram verbi arcani accipitis. Verbum invenite et effugite!'
  },
  beschreiben: {
    en: ['One person sees the word and picks clues. The others guess. Then you swap.', 'One player sees the word and chooses clues, the others guess. The roles change every round.'],
    fr: "Une personne voit le mot et choisit des indices. Les autres devinent. Puis on change.",
    es: 'Una persona ve la palabra y elige pistas. Los demás adivinan. Luego cambiáis.',
    it: "Una persona vede la parola e sceglie gli indizi. Gli altri indovinano. Poi si cambia.",
    la: 'Unus verbum videt et indicia eligit. Ceteri divinant. Deinde partes mutate.'
  },
  tauziehen: {
    en: ['Every right answer pulls the rope to your side. Hard questions pull harder.', 'Every correct answer pulls the rope to your side; harder questions pull harder. On “hard” a task has several parts.'],
    fr: 'Chaque bonne réponse tire la corde de ton côté. Les questions difficiles tirent plus fort.',
    es: 'Cada respuesta correcta tira de la cuerda hacia tu lado. Las preguntas difíciles tiran más fuerte.',
    it: 'Ogni risposta giusta tira la fune dalla tua parte. Le domande difficili tirano più forte.',
    la: 'Quodque responsum rectum funem ad tuam partem trahit. Quaestiones difficiles fortius trahunt.'
  },
  staffel: {
    en: ['The teams answer in turns. The first team with ten boxes wins.', 'The teams take turns answering. The first team to fill ten boxes wins.'],
    fr: "Les équipes répondent à tour de rôle. La première équipe avec dix cases gagne.",
    es: 'Los equipos responden por turnos. Gana el primer equipo con diez casillas.',
    it: 'Le squadre rispondono a turno. Vince la prima squadra con dieci caselle.',
    la: 'Turmae per vices respondent. Prima turma cum decem campis vincit.'
  },
  bingo: {
    en: ['The app calls out words. Tap the meaning on your card. A full line is Bingo!', 'The app calls out words – from year 7 it describes them instead. Tap the matching box on your card. A full line is Bingo!'],
    fr: "L'appli appelle des mots. Touche la bonne case sur ta grille. Une ligne pleine, c'est Bingo !",
    es: 'La app dice palabras. Toca la casilla correcta en tu cartón. ¡Una línea completa es Bingo!',
    it: "L'app chiama delle parole. Tocca la casella giusta nella tua cartella. Una riga piena è Bingo!",
    la: 'Instrumentum verba vocat. Campum rectum in tabula tua tange. Linea plena est Bingo!'
  },
  schiffe: {
    en: ['Give some right answers, then you may shoot. Find all the ships first to win!', 'A few correct answers in a row load a shot. The first team to find all the other team’s ships wins.'],
    fr: 'Quelques bonnes réponses, puis tu peux tirer. Trouve tous les bateaux le premier !',
    es: 'Unas respuestas correctas y puedes disparar. ¡Encuentra primero todos los barcos!',
    it: 'Qualche risposta giusta e puoi sparare. Trova per primo tutte le navi!',
    la: 'Post aliquot responsa recta iacere licet. Primus omnes naves inveni!'
  },
  wortkette: {
    en: 'Say a word in turns. Each word starts with the last letter of the word before.',
    fr: 'À tour de rôle, un mot. Chaque mot commence par la dernière lettre du mot d’avant.',
    es: 'Por turnos, una palabra. Cada palabra empieza con la última letra de la anterior.',
    it: 'A turno una parola. Ogni parola comincia con l’ultima lettera della precedente.',
    la: 'Per vices verbum dicite. Quodque verbum a littera ultima prioris incipit.'
  },
  bildergeschichte: {
    en: 'The story is written in words. Put your pictures in the right order.',
    fr: "L'histoire est écrite en mots. Mettez vos images dans le bon ordre.",
    es: 'La historia está escrita en palabras. Poned vuestras imágenes en el orden correcto.',
    it: "La storia è scritta in parole. Mettete le vostre immagini nell'ordine giusto.",
    la: 'Fabula verbis scripta est. Picturas vestras recto ordine ponite.'
  },
  teammemory: {
    en: 'Turn over two cards in turns. Can you do it with only a few moves?',
    fr: 'À tour de rôle, retournez deux cartes. Réussirez-vous en peu de coups ?',
    es: 'Por turnos, dad la vuelta a dos cartas. ¿Lo conseguís con pocos movimientos?',
    it: 'A turno girate due carte. Ce la fate con poche mosse?',
    la: 'Per vices duas chartas vertite. Paucisne motibus id potestis?'
  },
  kreuzwort: {
    en: ['Everyone has different clues. Together you fill in all the words.', 'Each of you has different clues – together you complete every word.'],
    fr: 'Chacun a des indices différents. Ensemble, vous trouvez tous les mots.',
    es: 'Cada uno tiene pistas diferentes. Juntos completáis todas las palabras.',
    it: 'Ognuno ha indizi diversi. Insieme completate tutte le parole.',
    la: 'Quisque alia indicia habet. Una omnia verba expletis.'
  },
  fehlerdetektive: {
    en: 'One person finds the mistake, the next one corrects it.',
    fr: 'Une personne trouve la faute, la suivante la corrige.',
    es: 'Una persona encuentra el error, la siguiente lo corrige.',
    it: "Una persona trova l'errore, la successiva lo corregge.",
    la: 'Unus errorem invenit, alter eum corrigit.'
  },
  uebersetzung: {
    en: 'Build the translation together – careful, not every piece belongs.',
    fr: "Construisez ensemble la traduction – attention, toutes les pièces ne servent pas.",
    es: 'Construid juntos la traducción – cuidado, no todas las piezas sirven.',
    it: 'Costruite insieme la traduzione – attenzione, non tutti i pezzi servono.',
    la: 'Translationem una construite – cavete, non omnes partes pertinent.'
  },
  dialog: {
    en: 'Two roles, one conversation: put the missing word into your line.',
    fr: 'Deux rôles, une conversation : mets le mot qui manque dans ta réplique.',
    es: 'Dos papeles, una conversación: pon la palabra que falta en tu frase.',
    it: 'Due ruoli, una conversazione: metti la parola che manca nella tua battuta.',
    la: 'Duae partes, unus sermo: verbum quod deest in versum tuum pone.'
  },
  woerterturm: {
    en: 'Every right answer is a brick. Build the tower before it wobbles!',
    fr: 'Chaque bonne réponse est une pierre. Construisez la tour avant qu’elle tremble !',
    es: 'Cada respuesta correcta es un bloque. ¡Construid la torre antes de que tiemble!',
    it: 'Ogni risposta giusta è un mattone. Costruite la torre prima che traballi!',
    la: 'Quodque responsum rectum lapis est. Turrim aedificate, antequam vacillat!'
  },
  hoerkette: {
    en: 'One person hears the word and says it. The others tap it.',
    fr: "Une personne entend le mot et le répète. Les autres le touchent.",
    es: 'Una persona oye la palabra y la dice. Los demás la tocan.',
    it: 'Una persona sente la parola e la ripete. Gli altri la toccano.',
    la: 'Unus verbum audit et dicit. Ceteri id tangunt.'
  },
  zeitstrahl: {
    en: 'Put the sentences on the timeline and name the tense.',
    fr: 'Placez les phrases sur la frise et nommez le temps.',
    es: 'Colocad las frases en la línea del tiempo y nombrad el tiempo verbal.',
    it: 'Mettete le frasi sulla linea del tempo e dite il tempo verbale.',
    la: 'Sententias in linea temporum ponite et tempus nominate.'
  },
  reiseplaner: {
    en: ['Everyone sees the same trips and has secret clues. Only all clues together fit one trip!', 'You all see the same trips, but everyone has their own clues. Only all clues together fit exactly one trip.'],
    fr: 'Tout le monde voit les mêmes voyages et a ses propres indices. Seuls tous les indices ensemble vont avec un voyage.',
    es: 'Todos veis los mismos viajes y cada uno tiene sus pistas. Solo todas las pistas juntas encajan con un viaje.',
    it: 'Tutti vedono gli stessi viaggi e ognuno ha i suoi indizi. Solo tutti gli indizi insieme vanno con un viaggio.',
    la: 'Omnes eadem itinera vident, quisque sua indicia habet. Omnia indicia una uni itineri conveniunt.'
  },
  schnapp: {
    en: 'Do the word and the meaning match? Snap first and right to score.',
    fr: 'Le mot et le sens vont-ils ensemble ? Le premier qui attrape juste marque.',
    es: '¿La palabra y el significado van juntos? Quien atrapa primero y bien, gana el punto.',
    it: 'Parola e significato vanno insieme? Chi prende per primo e giusto fa punto.',
    la: 'Congruuntne verbum et significatio? Qui primus recte capit, punctum fert.'
  },
  galgen: {
    en: 'Guess your words letter by letter. Who gets three first?',
    fr: 'Devine tes mots lettre par lettre. Qui en trouve trois le premier ?',
    es: 'Adivina tus palabras letra por letra. ¿Quién acierta tres primero?',
    it: 'Indovina le tue parole lettera per lettera. Chi ne trova tre per primo?',
    la: 'Verba tua littera per litteram divina. Quis primus tria invenit?'
  },
  buzzer: {
    en: 'Press first to answer. Wrong? Then the other team may try.',
    fr: "Appuie le premier pour répondre. Faux ? Alors c'est à l'autre équipe.",
    es: 'Pulsa primero para responder. ¿Fallo? Entonces le toca al otro equipo.',
    it: "Premi per primo per rispondere. Sbagliato? Allora tocca all'altra squadra.",
    la: 'Primus preme ut respondeas. Erras? Tum altera turma respondet.'
  },
  konjugation: {
    en: 'The right verb form – who has eight first?',
    fr: 'La bonne forme du verbe – qui en a huit le premier ?',
    es: 'La forma verbal correcta – ¿quién tiene ocho primero?',
    it: 'La forma verbale giusta – chi ne ha otto per primo?',
    la: 'Forma verbi recta – quis primus octo habet?'
  },
  umbau: {
    en: 'Rewrite the sentence – as fast and as accurately as you can.',
    fr: 'Transforme la phrase – aussi vite et aussi juste que possible.',
    es: 'Transforma la frase – lo más rápido y correcto posible.',
    it: 'Trasforma la frase – il più velocemente e correttamente possibile.',
    la: 'Sententiam muta – quam celerrime et rectissime.'
  },
  kollokation: {
    en: 'Which word goes with the words around it?',
    fr: 'Quel mot va avec les mots voisins ?',
    es: '¿Qué palabra va con las palabras vecinas?',
    it: 'Quale parola va con le parole vicine?',
    la: 'Quod verbum cum verbis vicinis congruit?'
  },
  auktion: {
    en: 'Bet coins on “true” or “false”.',
    fr: 'Mise des pièces sur « vrai » ou « faux ».',
    es: 'Apuesta monedas a «verdadero» o «falso».',
    it: 'Punta monete su «vero» o «falso».',
    la: 'Nummos in “verum” aut “falsum” pone.'
  },
  domino: {
    en: 'Put down the tile whose word matches the open meaning.',
    fr: 'Pose le domino dont le mot va avec le sens ouvert.',
    es: 'Coloca la ficha cuya palabra va con el significado abierto.',
    it: 'Metti la tessera la cui parola va con il significato aperto.',
    la: 'Tesseram pone cuius verbum significationi apertae convenit.'
  },
  stadtland: {
    en: 'Words from your course for the starting letter – the server checks.',
    fr: 'Des mots de ton cours avec la lettre donnée – le serveur vérifie.',
    es: 'Palabras de tu curso con la letra inicial – el servidor comprueba.',
    it: 'Parole del tuo corso con la lettera iniziale – il server controlla.',
    la: 'Verba cursus tui a littera data – minister probat.'
  },
  sniper: {
    en: 'Tap the mistake first and correct it. Wrong? Wait three seconds.',
    fr: 'Touche la faute le premier et corrige-la. Raté ? Trois secondes de pause.',
    es: 'Toca primero el error y corrígelo. ¿Fallo? Tres segundos de pausa.',
    it: "Tocca per primo l'errore e correggilo. Sbagliato? Tre secondi di pausa.",
    la: 'Primus errorem tange et corrige. Erras? Tria secunda exspecta.'
  },
  synonyme: {
    en: 'Words with the same meaning take you up the ladder.',
    fr: 'Les mots de même sens te font monter l’échelle.',
    es: 'Las palabras con el mismo significado te suben por la escalera.',
    it: 'Le parole con lo stesso significato ti fanno salire la scala.',
    la: 'Verba eiusdem significationis te per scalam sursum ducunt.'
  }
}

/** Beschreibung (Regel in einem Satz) eines Mehrspieler-Spiels in der Zielsprache; `de` = deutscher Text aus typen.ts */
export function mehrBeschreibung(id: string, de: string, sprache: string | null | undefined, jahrgang: number | null | undefined): string {
  const t = BESCHREIBUNG[id]
  return t ? waehle({ de, ...t }, sprache, jahrgang, (p) => p.beschreibung[id]) : de
}

/** Texte in den Spielen (Anleitungen, Rückmeldungen, Hinweise) – Schlüssel → Fassungen; Platzhalter {0}, {1} … */
const TEXTE1 = {
  // Fragen (kern.ts)
  wasBedeutet: { de: 'Was bedeutet das?', en: 'What does it mean?', fr: 'Ça veut dire quoi ?', es: '¿Qué significa?', it: 'Che cosa significa?', la: 'Quid significat?' },
  wieHeisst: { de: 'Wie heißt das Wort?', en: "What's the word?", fr: 'Quel est le mot ?', es: '¿Cuál es la palabra?', it: 'Qual è la parola?', la: 'Quod est verbum?' },
  welchesFehlt: { de: 'Welches Wort fehlt?', en: 'Which word is missing?', fr: 'Quel mot manque ?', es: '¿Qué palabra falta?', it: 'Quale parola manca?', la: 'Quod verbum deest?' },
  richtigIst: { de: 'Richtig ist: {0}', en: 'Right answer: {0}', fr: 'Bonne réponse : {0}', es: 'Respuesta correcta: {0}', it: 'Risposta giusta: {0}', la: 'Recte: {0}' },
  jemand: { de: 'Jemand', en: 'Someone', fr: "Quelqu'un", es: 'Alguien', it: 'Qualcuno', la: 'Aliquis' },
  duBistDran: { de: 'Du bist dran!', en: "It's your turn!", fr: "C'est ton tour !", es: '¡Te toca!', it: 'Tocca a te!', la: 'Tuae partes sunt!' },
  istDran: { de: '{0} ist dran.', en: "It's {0}'s turn.", fr: "C'est le tour de {0}.", es: 'Le toca a {0}.', it: 'Tocca a {0}.', la: 'Partes sunt {0}.' },
  daneben: { de: 'daneben.', en: 'missed.', fr: 'raté.', es: 'fallo.', it: 'sbagliato.', la: 'erravit.' },
  richtig: { de: 'Richtig!', en: 'Right!', fr: 'Juste !', es: '¡Correcto!', it: 'Giusto!', la: 'Recte!' },
  unentschieden: { de: 'Unentschieden!', en: "It's a draw!", fr: 'Égalité !', es: '¡Empate!', it: 'Pareggio!', la: 'Aequo Marte!' },
  gewonnenHat: { de: 'Gewonnen hat: {0}', en: 'The winner is: {0}', fr: 'Gagnant : {0}', es: 'Ha ganado: {0}', it: 'Ha vinto: {0}', la: 'Vicit: {0}' },
  teilVon: { de: 'Teil {0} von {1}', en: 'Part {0} of {1}', fr: 'Partie {0} sur {1}', es: 'Parte {0} de {1}', it: 'Parte {0} di {1}', la: 'Pars {0} ex {1}' },
  // Team-Match
  frageVon: { de: 'Frage {0} von {1}', en: 'Question {0} of {1}', fr: 'Question {0} sur {1}', es: 'Pregunta {0} de {1}', it: 'Domanda {0} di {1}', la: 'Quaestio {0} ex {1}' },
  herzen: { de: 'gemeinsame Herzen', en: 'shared hearts', fr: 'cœurs communs', es: 'corazones comunes', it: 'cuori comuni', la: 'corda communia' },
  nurEinGeraet: {
    de: 'Die richtige Antwort steht nur auf einem Gerät. Wer hat sie?',
    en: ['Only one phone has the right answer. Who has it?', 'The right answer is on only one device. Who has it?'],
    fr: 'La bonne réponse est sur un seul appareil. Qui l’a ?',
    es: 'La respuesta correcta está en un solo aparato. ¿Quién la tiene?',
    it: 'La risposta giusta è su un solo dispositivo. Chi ce l’ha?',
    la: 'Responsum rectum in uno instrumento est. Quis id habet?'
  },
  passtNicht: { de: '„{0}“ passt nicht.', en: '“{0}” is not right.', fr: '« {0} » ne va pas.', es: '«{0}» no es correcto.', it: '«{0}» non va.', la: '“{0}” non convenit.' },
  keineHerzen: { de: 'Keine Herzen mehr – weiter geht’s.', en: 'No hearts left – on we go.', fr: 'Plus de cœurs – on continue.', es: 'No quedan corazones – seguimos.', it: 'Niente più cuori – andiamo avanti.', la: 'Corda nulla supersunt – pergimus.' },
  tmGeschafft: { de: 'Team-Ziel geschafft: {0} von {1} gelöst!', en: 'Team goal reached: {0} of {1} solved!', fr: 'Objectif atteint : {0} sur {1} résolues !', es: '¡Objetivo logrado: {0} de {1} resueltas!', it: 'Obiettivo raggiunto: {0} su {1} risolte!', la: 'Propositum effectum: {0} ex {1} soluta!' },
  tmLeer: {
    de: '{0} von {1} gelöst – die Herzen waren einmal aufgebraucht.',
    en: '{0} of {1} solved – you ran out of hearts once.',
    fr: '{0} sur {1} résolues – une fois, il n’y avait plus de cœurs.',
    es: '{0} de {1} resueltas – una vez se acabaron los corazones.',
    it: '{0} su {1} risolte – una volta i cuori sono finiti.',
    la: '{0} ex {1} soluta – semel corda defecerunt.'
  },
  // Gemeinsam ordnen
  satz: { de: 'Satz', en: 'Sentence', fr: 'Phrase', es: 'Frase', it: 'Frase', la: 'Sententia' },
  geschichte: { de: 'Geschichte', en: 'Story', fr: 'Histoire', es: 'Historia', it: 'Storia', la: 'Fabula' },
  zeitstrahl: { de: 'Zeitstrahl', en: 'Timeline', fr: 'Frise', es: 'Línea del tiempo', it: 'Linea del tempo', la: 'Linea temporum' },
  vonN: { de: '{0} {1} von {2}', en: '{0} {1} of {2}', fr: '{0} {1} sur {2}', es: '{0} {1} de {2}', it: '{0} {1} di {2}', la: '{0} {1} ex {2}' },
  gemeinsameReihe: { de: 'Gemeinsame Reihe', en: 'Your shared row', fr: 'Votre ligne commune', es: 'Vuestra fila común', it: 'La vostra fila comune', la: 'Ordo communis' },
  deineTeile: { de: 'Deine Teile – tippe das nächste an', en: 'Your pieces – tap the next one', fr: 'Tes pièces – touche la suivante', es: 'Tus piezas – toca la siguiente', it: 'I tuoi pezzi – tocca il prossimo', la: 'Partes tuae – proximam tange' },
  keineTeile: { de: 'Du hast keine Teile mehr – hilf den anderen.', en: 'You have no pieces left – help the others.', fr: "Tu n'as plus de pièces – aide les autres.", es: 'Ya no tienes piezas – ayuda a los demás.', it: 'Non hai più pezzi – aiuta gli altri.', la: 'Partes nullas iam habes – ceteros adiuva.' },
  nichtJedesTeil: { de: 'Vorsicht: Nicht jedes Teil gehört dazu.', en: 'Careful: not every piece belongs.', fr: 'Attention : toutes les pièces ne servent pas.', es: 'Cuidado: no todas las piezas sirven.', it: 'Attenzione: non tutti i pezzi servono.', la: 'Cavete: non omnes partes pertinent.' },
  passtNochNicht: { de: 'Das passt hier noch nicht.', en: "That doesn't fit here yet.", fr: 'Ça ne va pas encore ici.', es: 'Eso todavía no va aquí.', it: 'Questo non va ancora qui.', la: 'Hoc hic nondum convenit.' },
  passt: { de: 'Passt!', en: 'Fits!', fr: 'Ça va !', es: '¡Encaja!', it: 'Va bene!', la: 'Convenit!' },
  fertig: { de: 'Fertig!', en: 'Done!', fr: 'Terminé !', es: '¡Hecho!', it: 'Fatto!', la: 'Perfectum!' },
  baut: { de: 'Baut den Satz.', en: 'Build the sentence.', fr: 'Construisez la phrase.', es: 'Construid la frase.', it: 'Costruite la frase.', la: 'Sententiam construite.' },
  frueherSpaeter: { de: 'Legt die Sätze von früher nach später.', en: 'Put the sentences in order from earlier to later.', fr: 'Placez les phrases de plus tôt à plus tard.', es: 'Ordenad las frases de antes a después.', it: 'Ordinate le frasi da prima a dopo.', la: 'Sententias a prius ad posterius ordinate.' },
  welcheZeitform: { de: 'Welche Zeitform ist das?', en: 'Which tense is it?', fr: 'Quel temps est-ce ?', es: '¿Qué tiempo verbal es?', it: 'Che tempo verbale è?', la: 'Quod tempus est?' },
  nenntZeitform: { de: 'Jetzt nennt {0} die Zeitform von: „{1}“', en: 'Now {0} names the tense of: “{1}”', fr: 'Maintenant, {0} nomme le temps de : « {1} »', es: 'Ahora {0} nombra el tiempo de: «{1}»', it: 'Ora {0} dice il tempo di: «{1}»', la: 'Nunc {0} tempus nominat: “{1}”' },
  richtigDoppel: { de: 'Richtig: {0}.', en: 'Right: {0}.', fr: 'Juste : {0}.', es: 'Correcto: {0}.', it: 'Giusto: {0}.', la: 'Recte: {0}.' },
  nichtGanz: { de: 'Nicht ganz.', en: 'Not quite.', fr: 'Pas tout à fait.', es: 'No del todo.', it: 'Non proprio.', la: 'Non omnino.' },
  dieGeschichte: { de: 'Die Geschichte: {0}', en: 'The story: {0}', fr: "L'histoire : {0}", es: 'La historia: {0}', it: 'La storia: {0}', la: 'Fabula: {0}' },
  uebersetzt: { de: 'Übersetzt: „{0}“', en: 'In German: “{0}”', fr: 'En allemand : « {0} »', es: 'En alemán: «{0}»', it: 'In tedesco: «{0}»', la: 'Germanice: “{0}”' },
  fehlerfreiGebaut: { de: 'Fehlerfrei gebaut!', en: 'Built without a mistake!', fr: 'Construit sans faute !', es: '¡Construido sin errores!', it: 'Costruito senza errori!', la: 'Sine errore aedificatum!' },
  mitFehlern: { de: 'Geschafft mit {0} Fehlern.', en: 'Done with {0} mistakes.', fr: 'Réussi avec {0} fautes.', es: 'Logrado con {0} errores.', it: 'Fatto con {0} errori.', la: 'Perfectum cum {0} erroribus.' },
  mitEinemFehler: { de: 'Geschafft mit 1 Fehler.', en: 'Done with 1 mistake.', fr: 'Réussi avec 1 faute.', es: 'Logrado con 1 error.', it: 'Fatto con 1 errore.', la: 'Perfectum cum uno errore.' },
  // Fluchtraum
  codewort: { de: 'Codewort', en: 'Code word', fr: 'Mot de passe', es: 'Palabra clave', it: 'Parola chiave', la: 'Verbum arcanum' },
  codewortN: { de: 'Codewort – {0} Buchstaben', en: 'Code word – {0} letters', fr: 'Mot de passe – {0} lettres', es: 'Palabra clave – {0} letras', it: 'Parola chiave – {0} lettere', la: 'Verbum arcanum – {0} litterae' },
  buchstabenGefunden: { de: 'Gefundene Buchstaben (Reihenfolge unbekannt)', en: 'Letters found (order unknown)', fr: 'Lettres trouvées (ordre inconnu)', es: 'Letras encontradas (orden desconocido)', it: 'Lettere trovate (ordine sconosciuto)', la: 'Litterae inventae (ordo ignotus)' },
  bisBuchstabe: {
    de: 'Noch {0} richtige Antworten bis zum nächsten Buchstaben.',
    en: ['{0} more right answers for the next letter.', '{0} more correct answers until the next letter.'],
    fr: 'Encore {0} bonnes réponses pour la prochaine lettre.',
    es: 'Faltan {0} respuestas correctas para la próxima letra.',
    it: 'Ancora {0} risposte giuste per la prossima lettera.',
    la: 'Adhuc {0} responsa recta ad proximam litteram.'
  },
  alleBuchstaben: { de: 'Alle Buchstaben sind da – gebt das Codewort ein!', en: 'You have all the letters – enter the code word!', fr: 'Vous avez toutes les lettres – entrez le mot de passe !', es: 'Tenéis todas las letras – ¡escribid la palabra clave!', it: 'Avete tutte le lettere – scrivete la parola chiave!', la: 'Omnes litteras habetis – verbum arcanum inscribite!' },
  buchstabeFrei: { de: 'hat einen Buchstaben freigeschaltet!', en: 'unlocked a letter!', fr: 'a débloqué une lettre !', es: '¡ha desbloqueado una letra!', it: 'ha sbloccato una lettera!', la: 'litteram aperuit!' },
  richtigWeiter: { de: 'richtig! ({0} von {1} für den nächsten Buchstaben)', en: 'right! ({0} of {1} for the next letter)', fr: 'juste ! ({0} sur {1} pour la prochaine lettre)', es: '¡correcto! ({0} de {1} para la próxima letra)', it: 'giusto! ({0} di {1} per la prossima lettera)', la: 'recte! ({0} ex {1} ad proximam litteram)' },
  neueAufgabe: { de: 'Nicht ganz – hier ist eine neue Aufgabe.', en: 'Not quite – here is a new task.', fr: 'Pas tout à fait – voici une nouvelle tâche.', es: 'No del todo – aquí tienes otra tarea.', it: 'Non proprio – ecco un nuovo compito.', la: 'Non omnino – ecce novum pensum.' },
  falschesWort: { de: 'Das ist nicht das Codewort. Lest die Hinweise noch einmal!', en: "That's not the code word. Read the clues again!", fr: "Ce n'est pas le mot de passe. Relisez les indices !", es: 'Esa no es la palabra clave. ¡Leed otra vez las pistas!', it: 'Non è la parola chiave. Rileggete gli indizi!', la: 'Non est verbum arcanum. Indicia iterum legite!' },
  entkommen: { de: 'Die Tür ist offen! Das Codewort war „{0}“ ({1}).', en: 'The door is open! The code word was “{0}” ({1}).', fr: 'La porte est ouverte ! Le mot de passe était « {0} » ({1}).', es: '¡La puerta está abierta! La palabra clave era «{0}» ({1}).', it: 'La porta è aperta! La parola chiave era «{0}» ({1}).', la: 'Porta aperta est! Verbum arcanum erat “{0}” ({1}).' },
  zeitAus: { de: 'Die Zeit ist abgelaufen.', en: 'Time is up.', fr: 'Le temps est écoulé.', es: 'Se acabó el tiempo.', it: 'Il tempo è scaduto.', la: 'Tempus exiit.' },
  zeitAusWort: { de: 'Die Zeit ist abgelaufen. Das Codewort war „{0}“ ({1}).', en: 'Time is up. The code word was “{0}” ({1}).', fr: 'Le temps est écoulé. Le mot de passe était « {0} » ({1}).', es: 'Se acabó el tiempo. La palabra clave era «{0}» ({1}).', it: 'Il tempo è scaduto. La parola chiave era «{0}» ({1}).', la: 'Tempus exiit. Verbum arcanum erat “{0}” ({1}).' },
  gemeinsameZeit: { de: 'Gemeinsame Zeit', en: 'Team time', fr: 'Temps commun', es: 'Tiempo común', it: 'Tempo comune', la: 'Tempus commune' },
  hinweise: { de: 'Hinweise zum Codewort', en: 'Clues for the code word', fr: 'Indices pour le mot de passe', es: 'Pistas para la palabra clave', it: 'Indizi per la parola chiave', la: 'Indicia verbi arcani' },
  tuerOeffnen: { de: 'Tür öffnen', en: 'Open the door', fr: 'Ouvrir la porte', es: 'Abrir la puerta', it: 'Apri la porta', la: 'Portam aperi' },
  wortEingeben: { de: 'Codewort eingeben', en: 'Type the code word', fr: 'Écris le mot de passe', es: 'Escribe la palabra clave', it: 'Scrivi la parola chiave', la: 'Verbum arcanum inscribe' },
  fehlversuche: { de: 'Falsche Versuche: {0}', en: 'Wrong guesses: {0}', fr: 'Essais ratés : {0}', es: 'Intentos fallidos: {0}', it: 'Tentativi sbagliati: {0}', la: 'Conatus irriti: {0}' },
  entkommenIn: { de: 'Entkommen in {0} Minuten!', en: 'Escaped in {0} minutes!', fr: 'Évadés en {0} minutes !', es: '¡Escapasteis en {0} minutos!', it: 'Fuggiti in {0} minuti!', la: '{0} minutis effugistis!' },
  nichtGereicht: { de: 'Diesmal hat die Zeit nicht gereicht.', en: "This time you ran out of time.", fr: "Cette fois, le temps n'a pas suffi.", es: 'Esta vez no os alcanzó el tiempo.', it: 'Questa volta il tempo non è bastato.', la: 'Hoc tempore tempus non suffecit.' },
  // Hinweise (Fluchtraum): Klasse 5–6 kurz/bildhaft, 7–8 umschreibend, ab 9 einsprachige Definition
  hLaenge: { de: 'Das Wort hat {0} Buchstaben.', en: 'The word has {0} letters.', fr: 'Le mot a {0} lettres.', es: 'La palabra tiene {0} letras.', it: 'La parola ha {0} lettere.', la: 'Verbum {0} litteras habet.' },
  hBild: { de: 'Schaut euch das Bild an.', en: 'Look at the picture.', fr: "Regardez l'image.", es: 'Mirad la imagen.', it: "Guardate l'immagine.", la: 'Picturam spectate.' },
  hNomen: { de: 'Es ist ein Nomen.', en: 'It is a noun.', fr: "C'est un nom.", es: 'Es un sustantivo.', it: 'È un nome.', la: 'Nomen est.' },
  hVerb: { de: 'Es ist ein Verb.', en: 'It is a verb.', fr: "C'est un verbe.", es: 'Es un verbo.', it: 'È un verbo.', la: 'Verbum est.' },
  hAdj: { de: 'Es ist ein Adjektiv.', en: 'It is an adjective.', fr: "C'est un adjectif.", es: 'Es un adjetivo.', it: 'È un aggettivo.', la: 'Adiectivum est.' },
  hAdv: { de: 'Es ist ein Adverb.', en: 'It is an adverb.', fr: "C'est un adverbe.", es: 'Es un adverbio.', it: 'È un avverbio.', la: 'Adverbium est.' },
  hLuecke: { de: 'Es passt in diese Lücke: {0}', en: 'It fits in this gap: {0}', fr: 'Il va dans ce trou : {0}', es: 'Va en este hueco: {0}', it: 'Va in questa lacuna: {0}', la: 'In hanc lacunam convenit: {0}' },
  hSynonym: { de: 'Es bedeutet fast dasselbe wie „{0}“.', en: 'It means almost the same as “{0}”.', fr: 'Il veut dire presque la même chose que « {0} ».', es: 'Significa casi lo mismo que «{0}».', it: 'Significa quasi lo stesso di «{0}».', la: 'Fere idem significat ac “{0}”.' },
  hDefinition: {
    de: 'Definition: {0} mit {1} Buchstaben, ähnlich wie „{2}“.',
    en: 'Definition: {0} with {1} letters, similar in meaning to “{2}”.',
    fr: 'Définition : {0} de {1} lettres, proche de « {2} ».',
    es: 'Definición: {0} de {1} letras, parecido a «{2}».',
    it: 'Definizione: {0} di {1} lettere, simile a «{2}».',
    la: 'Definitio: {0} {1} litterarum, simile ac “{2}”.'
  },
  hGebrauch: { de: 'So gebraucht man es: {0}', en: 'This is how it is used: {0}', fr: "Voici comment on l'utilise : {0}", es: 'Así se usa: {0}', it: 'Ecco come si usa: {0}', la: 'Sic adhibetur: {0}' },
  hAufgabe: { de: 'Es ist die Lösung dieser Aufgabe: {0}', en: 'It is the answer to this task: {0}', fr: "C'est la réponse à cette tâche : {0}", es: 'Es la respuesta de esta tarea: {0}', it: 'È la risposta a questo compito: {0}', la: 'Responsum huius pensi est: {0}' },
  wortartNomen: { de: 'ein Nomen', en: 'a noun', fr: 'un nom', es: 'un sustantivo', it: 'un nome', la: 'nomen' },
  wortartVerb: { de: 'ein Verb', en: 'a verb', fr: 'un verbe', es: 'un verbo', it: 'un verbo', la: 'verbum' },
  wortartAdj: { de: 'ein Adjektiv', en: 'an adjective', fr: 'un adjectif', es: 'un adjetivo', it: 'un aggettivo', la: 'adiectivum' },
  wortartAdv: { de: 'ein Adverb', en: 'an adverb', fr: 'un adverbe', es: 'un adverbio', it: 'un avverbio', la: 'adverbium' },
  wortartWort: { de: 'ein Wort', en: 'a word', fr: 'un mot', es: 'una palabra', it: 'una parola', la: 'verbum' },
  // Staffel/Schiffe
  feldGefuellt: { de: 'Feld gefüllt!', en: 'Box filled!', fr: 'Case remplie !', es: '¡Casilla llena!', it: 'Casella riempita!', la: 'Campus expletus!' },
  erstDieFrage: { de: 'Du bist dran – erst die Frage!', en: "It's your turn – answer the question first!", fr: "C'est ton tour – d'abord la question !", es: 'Te toca – ¡primero la pregunta!', it: 'Tocca a te – prima la domanda!', la: 'Tuae partes – primum quaestio!' },
  schussLaden: {
    de: 'Noch {0} richtige Antworten bis zum Schuss.',
    en: ['{0} more right answers, then you can shoot.', '{0} more correct answers to load a shot.'],
    fr: 'Encore {0} bonnes réponses avant de tirer.',
    es: 'Faltan {0} respuestas correctas para disparar.',
    it: 'Ancora {0} risposte giuste per sparare.',
    la: 'Adhuc {0} responsa recta, tum iacere licet.'
  },
  geladen: { de: 'richtig – noch {0} bis zum Schuss.', en: 'right – {0} more to shoot.', fr: 'juste – encore {0} avant de tirer.', es: 'correcto – faltan {0} para disparar.', it: 'giusto – ancora {0} per sparare.', la: 'recte – adhuc {0} ad iaciendum.' },
  darfSchiessen: { de: 'darf schießen!', en: 'may shoot!', fr: 'peut tirer !', es: '¡puede disparar!', it: 'può sparare!', la: 'iacere potest!' },
  danebenAnderes: { de: 'daneben – das andere Team ist dran.', en: "missed – it's the other team's turn.", fr: "raté – c'est à l'autre équipe.", es: 'fallo – le toca al otro equipo.', it: "sbagliato – tocca all'altra squadra.", la: 'erravit – altera turma sequitur.' },
  tippeFeld: { de: 'Tippe ein Feld beim anderen Team an.', en: "Tap a square on the other team's board.", fr: "Touche une case chez l'autre équipe.", es: 'Toca una casilla del otro equipo.', it: "Tocca una casella dell'altra squadra.", la: 'Campum alterius turmae tange.' },
  treffer: { de: 'Treffer!', en: 'Hit!', fr: 'Touché !', es: '¡Tocado!', it: 'Colpito!', la: 'Ictus!' },
  wasser: { de: 'Wasser.', en: 'Miss – water.', fr: "À l'eau.", es: 'Agua.', it: 'Acqua.', la: 'Aqua.' },
  feldVon: { de: 'Feld von {0} ({1} von {2} getroffen)', en: "{0}'s board ({1} of {2} hit)", fr: 'Grille de {0} ({1} sur {2} touchées)', es: 'Tablero de {0} ({1} de {2} tocadas)', it: 'Campo di {0} ({1} di {2} colpite)', la: 'Campus {0} ({1} ex {2} icti)' },
  eureFlotte: { de: 'Eure Flotte', en: 'Your fleet', fr: 'Votre flotte', es: 'Vuestra flota', it: 'La vostra flotta', la: 'Classis vestra' },
  // Tauziehen
  ziehtMit: { de: 'zieht mit {0}!', en: 'pulls with {0}!', fr: 'tire avec {0} !', es: '¡tira con {0}!', it: 'tira con {0}!', la: 'trahit cum {0}!' },
  teilRichtig: { de: 'Teil {0} von {1} richtig – weiter!', en: 'Part {0} of {1} right – keep going!', fr: 'Partie {0} sur {1} juste – continue !', es: 'Parte {0} de {1} correcta – ¡sigue!', it: 'Parte {0} di {1} giusta – avanti!', la: 'Pars {0} ex {1} recta – perge!' },
  duZiehstLinks: { de: 'Du ziehst nach links.', en: 'You pull to the left.', fr: 'Tu tires vers la gauche.', es: 'Tiras hacia la izquierda.', it: 'Tiri verso sinistra.', la: 'Sinistrorsum trahis.' },
  duZiehstRechts: { de: 'Du ziehst nach rechts.', en: 'You pull to the right.', fr: 'Tu tires vers la droite.', es: 'Tiras hacia la derecha.', it: 'Tiri verso destra.', la: 'Dextrorsum trahis.' },
  // Bingo
  aufrufVon: { de: 'Aufruf {0} von {1}', en: 'Call {0} of {1}', fr: 'Appel {0} sur {1}', es: 'Llamada {0} de {1}', it: 'Chiamata {0} di {1}', la: 'Vocatio {0} ex {1}' },
  nichtGerufen: { de: 'Das war nicht gerufen.', en: "That wasn't called.", fr: "Ça n'a pas été appelé.", es: 'Eso no se ha dicho.', it: 'Questo non è stato chiamato.', la: 'Hoc non vocatum est.' },
  bingo: { de: 'BINGO!', en: 'BINGO!', fr: 'BINGO !', es: '¡BINGO!', it: 'BINGO!', la: 'BINGO!' },
  auchBingo: { de: 'hat auch Bingo (Platz {0})!', en: 'has Bingo too (place {0})!', fr: 'a aussi Bingo ({0}e place) !', es: '¡también tiene Bingo (puesto {0})!', it: 'ha anche Bingo ({0}° posto)!', la: 'quoque Bingo habet (locus {0})!' },
  bingoPlatz: { de: 'Bingo – Platz {0}!', en: 'Bingo – place {0}!', fr: 'Bingo – {0}e place !', es: 'Bingo – ¡puesto {0}!', it: 'Bingo – {0}° posto!', la: 'Bingo – locus {0}!' },
  deinFeld: { de: 'Dein Feld', en: 'Your card', fr: 'Ta grille', es: 'Tu cartón', it: 'La tua cartella', la: 'Tabula tua' },
  warteAndere: { de: 'Warte auf die anderen …', en: 'Waiting for the others …', fr: 'On attend les autres …', es: 'Esperando a los demás …', it: 'Aspetta gli altri …', la: 'Ceteros exspecta …' },
  nichtImFeld: { de: 'Nicht in meinem Feld – weiter', en: 'Not on my card – next', fr: 'Pas sur ma grille – suivant', es: 'No está en mi cartón – siguiente', it: 'Non è nella mia cartella – avanti', la: 'Non in tabula mea – porro' },
  bingoListe: { de: 'Bingo: {0}', en: 'Bingo: {0}', fr: 'Bingo : {0}', es: 'Bingo: {0}', it: 'Bingo: {0}', la: 'Bingo: {0}' },
  bingoErste: { de: 'Bingo als Erste/r: {0}', en: 'First to Bingo: {0}', fr: 'Premier Bingo : {0}', es: 'Primer Bingo: {0}', it: 'Primo Bingo: {0}', la: 'Primus Bingo: {0}' },
  keinBingo: { de: 'Diesmal kein Bingo.', en: 'No Bingo this time.', fr: 'Pas de Bingo cette fois.', es: 'Esta vez no hay Bingo.', it: 'Questa volta niente Bingo.', la: 'Hoc tempore nullum Bingo.' },
  welchesWortSatz: { de: 'Welches Wort passt?', en: 'Which word fits?', fr: 'Quel mot va ?', es: '¿Qué palabra encaja?', it: 'Quale parola va bene?', la: 'Quod verbum convenit?' }
} satisfies Record<string, Texte>

const TEXTE = { ...TEXTE1, ...TEXTE2 }

/** Alle Textschlüssel (Tests: jede Sprache hat jeden Text) */
export const ALLE_TEXT_SCHLUESSEL = Object.keys(TEXTE) as TextSchluessel[]

export type TextSchluessel = keyof typeof TEXTE

/** Text in der Zielsprache (Klasse 5–6 einfache Fassung), Platzhalter {0} … gefüllt */
export function spielText(sprache: string | null | undefined, jahrgang: number | null | undefined, schluessel: TextSchluessel, ...werte: (string | number)[]): string {
  return fuellen(waehle(TEXTE[schluessel] as Texte, sprache, jahrgang, (p) => p.texte[schluessel]), werte)
}

/** Wortart aus der freien Angabe der Vokabelliste („(n)", „adj", „verb" …) */
export function wortartVon(pos: string | undefined): 'nomen' | 'verb' | 'adj' | 'adv' | null {
  const p = (pos ?? '').replace(/[()[\].]/g, '').trim().toLowerCase()
  if (!p) return null
  if (/^(n|noun|nomen|subst|substantiv|s|nm|nf|f|m|nom)$/.test(p) || p.startsWith('noun') || p.startsWith('subst')) return 'nomen'
  if (/^(v|vt|vi|verb|vb)$/.test(p) || p.startsWith('verb')) return 'verb'
  if (p.startsWith('adj')) return 'adj'
  if (p.startsWith('adv')) return 'adv'
  return null
}
