import { unneededWordCount } from '../model/blocks'
import type { Block } from '../model/types'

type HelpKey =
  | 'useEachOnce'
  | 'extraWords'
  | 'changeForm'
  | 'firstLetter'
  | 'matchLetters'
  | 'matchExtra'
  | 'choiceOne'
  | 'wrongWord'
  | 'twoSentences'
  | 'wordFormation'
  | 'pictureBank'
  | 'scramble'
  | 'crossword'
  | 'categorize'
  | 'mindmap'
  | 'wordFamily'
  | 'oddOneOut'
  | 'gapNumbers'

/** Kurze Hinweise für Schüler in der Sprache des Tests. */
const TEXTS: Record<HelpKey, Record<string, string>> = {
  useEachOnce: {
    en: 'Use each word from the box only once.',
    fr: "Utilise chaque mot de l'encadré une seule fois.",
    es: 'Usa cada palabra del recuadro solo una vez.',
    it: 'Usa ogni parola del riquadro una sola volta.',
    nl: 'Gebruik elk woord uit het kader maar één keer.',
    ru: 'Используй каждое слово из рамки только один раз.'
  },
  extraWords: {
    en: 'There are more words in the box than you need.',
    fr: "Il y a plus de mots dans l'encadré que nécessaire.",
    es: 'Hay más palabras en el recuadro de las que necesitas.',
    it: 'Nel riquadro ci sono più parole del necessario.',
    nl: 'Er staan meer woorden in het kader dan je nodig hebt.',
    ru: 'В рамке больше слов, чем нужно.'
  },
  changeForm: {
    en: 'You may have to change the form of the word (e.g. plural, past tense).',
    fr: 'Il faut parfois changer la forme du mot (p. ex. pluriel, temps du verbe).',
    es: 'A veces tienes que cambiar la forma de la palabra (p. ej. plural, tiempo verbal).',
    it: 'A volte devi cambiare la forma della parola (p. es. plurale, tempo verbale).',
    nl: 'Soms moet je de vorm van het woord veranderen (bijv. meervoud, verleden tijd).',
    ru: 'Иногда нужно изменить форму слова (например, множественное число, прошедшее время).'
  },
  firstLetter: {
    en: 'The first letter is given.',
    fr: 'La première lettre est donnée.',
    es: 'La primera letra ya está escrita.',
    it: 'La prima lettera è data.',
    nl: 'De eerste letter is gegeven.',
    ru: 'Первая буква дана.'
  },
  matchLetters: {
    en: 'Write the correct letter in the box next to each number.',
    fr: 'Écris la bonne lettre dans la case à côté de chaque numéro.',
    es: 'Escribe la letra correcta en la casilla junto a cada número.',
    it: 'Scrivi la lettera giusta nella casella accanto a ogni numero.',
    nl: 'Schrijf de juiste letter in het vakje naast elk nummer.',
    ru: 'Напиши правильную букву в клетке рядом с каждым номером.'
  },
  matchExtra: {
    en: 'You do not need all the words on the right.',
    fr: 'Tu n’as pas besoin de tous les mots de droite.',
    es: 'No necesitas todas las palabras de la derecha.',
    it: 'Non ti servono tutte le parole a destra.',
    nl: 'Je hebt niet alle woorden rechts nodig.',
    ru: 'Не все слова справа нужны.'
  },
  choiceOne: {
    en: 'Only one answer is correct.',
    fr: 'Une seule réponse est correcte.',
    es: 'Solo una respuesta es correcta.',
    it: 'Solo una risposta è corretta.',
    nl: 'Er is maar één antwoord goed.',
    ru: 'Правильный ответ только один.'
  },
  wrongWord: {
    en: 'The underlined word is wrong. Write the correct word on the line.',
    fr: 'Le mot souligné est faux. Écris le bon mot sur la ligne.',
    es: 'La palabra subrayada es incorrecta. Escribe la palabra correcta en la línea.',
    it: 'La parola sottolineata è sbagliata. Scrivi la parola giusta sulla riga.',
    nl: 'Het onderstreepte woord is fout. Schrijf het juiste woord op de lijn.',
    ru: 'Подчёркнутое слово неверное. Напиши правильное слово на линии.'
  },
  twoSentences: {
    en: 'The same word fits in both gaps (a and b). Write it on the line.',
    fr: 'Le même mot va dans les deux trous (a et b). Écris-le sur la ligne.',
    es: 'La misma palabra va en los dos huecos (a y b). Escríbela en la línea.',
    it: 'La stessa parola va in entrambi gli spazi (a e b). Scrivila sulla riga.',
    nl: 'Hetzelfde woord past in beide open plekken (a en b). Schrijf het op de lijn.',
    ru: 'Одно и то же слово подходит к обоим пропускам (a и b). Напиши его на линии.'
  },
  wordFormation: {
    en: 'Use the word in brackets and change its form.',
    fr: 'Utilise le mot entre parenthèses et change sa forme.',
    es: 'Usa la palabra entre paréntesis y cambia su forma.',
    it: 'Usa la parola tra parentesi e cambia la sua forma.',
    nl: 'Gebruik het woord tussen haakjes en verander de vorm.',
    ru: 'Используй слово в скобках и измени его форму.'
  },
  pictureBank: {
    en: 'Each picture shows one word from the box.',
    fr: "Chaque image montre un mot de l'encadré.",
    es: 'Cada imagen muestra una palabra del recuadro.',
    it: 'Ogni immagine mostra una parola del riquadro.',
    nl: 'Elke afbeelding toont één woord uit het kader.',
    ru: 'На каждой картинке одно слово из рамки.'
  },
  scramble: {
    en: 'Use all the letters.',
    fr: 'Utilise toutes les lettres.',
    es: 'Usa todas las letras.',
    it: 'Usa tutte le lettere.',
    nl: 'Gebruik alle letters.',
    ru: 'Используй все буквы.'
  },
  crossword: {
    en: 'Write one letter in each box.',
    fr: 'Écris une lettre par case.',
    es: 'Escribe una letra en cada casilla.',
    it: 'Scrivi una lettera in ogni casella.',
    nl: 'Schrijf één letter in elk vakje.',
    ru: 'Пиши по одной букве в каждой клетке.'
  },
  categorize: {
    en: 'Write each word in exactly one group.',
    fr: 'Écris chaque mot dans un seul groupe.',
    es: 'Escribe cada palabra en un solo grupo.',
    it: 'Scrivi ogni parola in un solo gruppo.',
    nl: 'Schrijf elk woord in precies één groep.',
    ru: 'Запиши каждое слово только в одну группу.'
  },
  mindmap: {
    en: 'Write one word on each line.',
    fr: 'Écris un mot par ligne.',
    es: 'Escribe una palabra en cada línea.',
    it: 'Scrivi una parola per riga.',
    nl: 'Schrijf één woord op elke regel.',
    ru: 'Напиши по одному слову на каждой строке.'
  },
  wordFamily: {
    en: 'The word on the left belongs to the same word family.',
    fr: 'Le mot à gauche appartient à la même famille de mots.',
    es: 'La palabra de la izquierda pertenece a la misma familia de palabras.',
    it: 'La parola a sinistra appartiene alla stessa famiglia di parole.',
    nl: 'Het woord links hoort bij dezelfde woordfamilie.',
    ru: 'Слово слева относится к тому же словообразовательному гнезду.'
  },
  oddOneOut: {
    en: 'Circle one word in each row.',
    fr: 'Entoure un mot par ligne.',
    es: 'Rodea una palabra en cada fila.',
    it: 'Cerchia una parola per riga.',
    nl: 'Omcirkel één woord per rij.',
    ru: 'Обведи одно слово в каждом ряду.'
  },
  gapNumbers: {
    en: 'Each gap has a number: (1), (2) …',
    fr: 'Chaque trou a un numéro : (1), (2) …',
    es: 'Cada hueco tiene un número: (1), (2) …',
    it: 'Ogni spazio ha un numero: (1), (2) …',
    nl: 'Elke open plek heeft een nummer: (1), (2) …',
    ru: 'У каждого пропуска есть номер: (1), (2) …'
  }
}

const text = (key: HelpKey, lang: string): string => TEXTS[key][lang] ?? TEXTS[key].en

/** „You do not need 2 words." – mit der genauen Zahl überzähliger Wörter */
export function notNeededText(n: number, lang: string): string {
  const one = n === 1
  switch (lang) {
    case 'fr':
      return one ? 'Tu n’as pas besoin d’un mot.' : `Tu n’as pas besoin de ${n} mots.`
    case 'es':
      return one ? 'No necesitas una palabra.' : `No necesitas ${n} palabras.`
    case 'it':
      return one ? 'Non ti serve una parola.' : `Non ti servono ${n} parole.`
    case 'nl':
      return one ? 'Eén woord heb je niet nodig.' : `${n} woorden heb je niet nodig.`
    case 'ru': {
      const mod10 = n % 10
      const mod100 = n % 100
      const form = mod10 === 1 && mod100 !== 11 ? 'слово' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'слова' : 'слов'
      return `${n} ${form} тебе не нужны.`
    }
    default:
      return one ? 'You do not need one word.' : `You do not need ${n} words.`
  }
}

/** Grundform ohne „to", Artikel und Klammerzusätze – zum Vergleich von Wortkasten und Lösung. */
export function baseForm(word: string): string {
  return word
    .toLocaleLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/^(to|a|an|the|le|la|les|l'|un|une|el|los|las|il|lo|gli|de|het|een)\s+/, '')
    .trim()
}

/**
 * Hinweise, die eindeutig machen, was in welcher Lücke/Zeile verlangt ist.
 * Sie werden unter der Arbeitsanweisung gedruckt und lassen sich pro Aufgabe abschalten.
 */
export function blockHelp(block: Block, lang: string): string[] {
  if (block.showHelp === false) return []
  const out: (HelpKey | { notNeeded: number })[] = []
  const unneeded = unneededWordCount(block)
  switch (block.kind) {
    case 'gap': {
      if (block.taskType === 'wrongWord') out.push('wrongWord')
      else if (block.taskType === 'twoSentences') out.push('twoSentences')
      else if (block.taskType === 'wordFormation') out.push('wordFormation')
      else if (block.taskType === 'wordFamily') out.push('wordFamily')
      if (block.wordBank) {
        out.push('useEachOnce')
        if (unneeded > 0) out.push({ notNeeded: unneeded })
        if (block.items.some((i) => i.bankWord && baseForm(i.bankWord) !== baseForm(i.answer))) out.push('changeForm')
      }
      if (block.firstLetterHint || block.items.some((i) => i.firstLetter)) out.push('firstLetter')
      break
    }
    case 'gapText': {
      const gaps = block.parts.filter((p) => p.type === 'gap')
      out.push('gapNumbers')
      if (block.wordBank) {
        out.push('useEachOnce')
        if (unneeded > 0) out.push({ notNeeded: unneeded })
        if (gaps.some((g) => g.type === 'gap' && g.bankWord && baseForm(g.bankWord) !== baseForm(g.answer))) out.push('changeForm')
      }
      if (block.firstLetterHint || gaps.some((g) => g.type === 'gap' && g.firstLetter)) out.push('firstLetter')
      break
    }
    case 'match':
      out.push('matchLetters')
      if (unneeded > 0) out.push({ notNeeded: unneeded })
      break
    case 'choice':
      out.push('choiceOne')
      break
    case 'picture':
      if (block.wordBank) out.push('pictureBank', 'useEachOnce')
      if (unneeded > 0) out.push({ notNeeded: unneeded })
      break
    case 'scramble':
      out.push('scramble')
      break
    case 'crossword':
      out.push('crossword')
      break
    case 'categorize':
      out.push('categorize')
      break
    case 'mindmap':
      out.push('mindmap')
      break
    case 'oddOneOut':
      out.push('oddOneOut')
      break
  }
  return out.map((k) => (typeof k === 'string' ? text(k, lang) : notNeededText(k.notNeeded, lang)))
}
