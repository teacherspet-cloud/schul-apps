import { unneededWordCount } from '../model/blocks'
import type { Block } from '../model/types'
import { RU_SLOVO, russischPlural } from '../../../shared/russischPlural'
import { polnischPlural, tschechischPlural } from '../../../shared/kopfSprache'

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
    ru: 'Используй каждое слово из рамки только один раз.',
    de: 'Jedes Wort aus dem Kasten wird nur einmal verwendet.',
    pl: 'Każdego wyrazu z ramki użyj tylko raz.',
    cs: 'Každé slovo z rámečku použij jen jednou.',
    pt: 'Usa cada palavra do quadro só uma vez.',
    tr: 'Kutudaki her kelimeyi yalnızca bir kez kullan.',
    zh: '框中的每个词语只能用一次。',
    ja: '枠の中のことばは、一回ずつしか使えません。',
    ar: 'استخدم كل كلمة من الإطار مرة واحدة فقط.',
    da: 'Brug hvert ord fra boksen kun én gang.',
    el: 'Χρησιμοποίησε κάθε λέξη από το πλαίσιο μόνο μία φορά.'
  },
  extraWords: {
    en: 'There are more words in the box than you need.',
    fr: "Il y a plus de mots dans l'encadré que nécessaire.",
    es: 'Hay más palabras en el recuadro de las que necesitas.',
    it: 'Nel riquadro ci sono più parole del necessario.',
    nl: 'Er staan meer woorden in het kader dan je nodig hebt.',
    ru: 'В рамке больше слов, чем нужно.',
    de: 'Im Kasten stehen mehr Wörter als nötig.',
    pl: 'W ramce jest więcej wyrazów, niż potrzeba.',
    cs: 'V rámečku je víc slov, než potřebuješ.',
    pt: 'Há mais palavras no quadro do que as necessárias.',
    tr: 'Kutuda gerekenden fazla kelime var.',
    zh: '框中的词语比需要的多。',
    ja: '枠の中には、必要な数より多くのことばがあります。',
    ar: 'في الإطار كلمات أكثر مما تحتاج.',
    da: 'Der er flere ord i boksen, end du skal bruge.',
    el: 'Στο πλαίσιο υπάρχουν περισσότερες λέξεις απ’ όσες χρειάζεσαι.'
  },
  changeForm: {
    en: 'You may have to change the form of the word (e.g. plural, past tense).',
    fr: 'Il faut parfois changer la forme du mot (p. ex. pluriel, temps du verbe).',
    es: 'A veces tienes que cambiar la forma de la palabra (p. ej. plural, tiempo verbal).',
    it: 'A volte devi cambiare la forma della parola (per esempio il plurale o il tempo verbale).',
    nl: 'Soms moet je de vorm van het woord veranderen (bijv. meervoud, verleden tijd).',
    ru: 'Иногда слово нужно поставить в другую форму (например, во множественное число или в прошедшее время).',
    de: 'Manchmal muss die Form des Wortes angepasst werden.',
    pl: 'Czasem trzeba zmienić formę wyrazu (np. przypadek, liczbę, czas).',
    cs: 'Někdy musíš změnit tvar slova (např. pád, číslo, čas).',
    pt: 'Às vezes tens de mudar a forma da palavra (p. ex. plural, tempo verbal).',
    tr: 'Bazen kelimenin biçimini değiştirmen gerekir (ör. çoğul, zaman eki).',
    zh: '有的词语需要根据句子稍作改变。',
    ja: 'ことばの形を変える必要がある場合があります（例：動詞の活用）。',
    ar: 'قد تحتاج أحيانًا إلى تغيير صيغة الكلمة (مثل الجمع أو زمن الفعل).',
    da: 'Nogle gange skal du ændre ordets form (f.eks. flertal, datid).',
    el: 'Μερικές φορές πρέπει να αλλάξεις τη μορφή της λέξης (π.χ. πτώση, αριθμό, χρόνο).'
  },
  firstLetter: {
    en: 'The first letter is given.',
    fr: 'La première lettre est donnée.',
    es: 'La primera letra ya está escrita.',
    it: 'La prima lettera è già data.',
    nl: 'De eerste letter is gegeven.',
    ru: 'Первая буква уже дана.',
    de: 'Der erste Buchstabe ist vorgegeben.',
    pl: 'Pierwsza litera jest podana.',
    cs: 'První písmeno je uvedeno.',
    pt: 'A primeira letra já está escrita.',
    tr: 'İlk harf verilmiştir.',
    zh: '已给出第一个字。',
    ja: '最初の文字は書いてあります。',
    ar: 'الحرف الأول مكتوب.',
    da: 'Det første bogstav er givet.',
    el: 'Το πρώτο γράμμα δίνεται.'
  },
  matchLetters: {
    en: 'Write the correct letter in the box next to each number.',
    fr: 'Écris la bonne lettre dans la case à côté de chaque numéro.',
    es: 'Escribe la letra correcta en la casilla junto a cada número.',
    it: 'Scrivi la lettera giusta nella casella accanto a ogni numero.',
    nl: 'Schrijf de juiste letter in het vakje naast elk nummer.',
    ru: 'Напиши правильную букву в клетке рядом с каждым номером.',
    de: 'In das Kästchen neben jeder Zahl gehört der passende Buchstabe.',
    pl: 'Wpisz właściwą literę w kratkę obok każdej liczby.',
    cs: 'Napiš správné písmeno do políčka vedle každého čísla.',
    pt: 'Escreve a letra correta no quadrado ao lado de cada número.',
    tr: 'Her numaranın yanındaki kutuya doğru harfi yaz.',
    zh: '在每个数字旁边的方框里写上正确的字母。',
    ja: 'それぞれの番号の横の四角に、正しいアルファベットを書いてください。',
    ar: 'اكتب الحرف الصحيح في المربع بجانب كل رقم.',
    da: 'Skriv det rigtige bogstav i feltet ved siden af hvert tal.',
    el: 'Γράψε το σωστό γράμμα στο κουτάκι δίπλα σε κάθε αριθμό.'
  },
  matchExtra: {
    en: 'You do not need all the words on the right.',
    fr: 'Tu n’as pas besoin de tous les mots de droite.',
    es: 'No necesitas todas las palabras de la derecha.',
    it: 'Non ti servono tutte le parole a destra.',
    nl: 'Je hebt niet alle woorden rechts nodig.',
    ru: 'Не все слова справа понадобятся.',
    de: 'Nicht alle Wörter rechts werden gebraucht.',
    pl: 'Nie wszystkie wyrazy z prawej strony będą potrzebne.',
    cs: 'Nebudeš potřebovat všechna slova vpravo.',
    pt: 'Não precisas de todas as palavras da direita.',
    tr: 'Sağdaki kelimelerin hepsine ihtiyacın yok.',
    zh: '右边的词语不是都用得上。',
    ja: '右のことばを全部使うわけではありません。',
    ar: 'لن تحتاج إلى كل كلمات العمود الثاني.',
    da: 'Du skal ikke bruge alle ordene til højre.',
    el: 'Δεν θα χρειαστείς όλες τις λέξεις στα δεξιά.'
  },
  choiceOne: {
    en: 'Only one answer is correct.',
    fr: 'Une seule réponse est correcte.',
    es: 'Solo una respuesta es correcta.',
    it: "C'è una sola risposta corretta.",
    nl: 'Er is maar één antwoord goed.',
    ru: 'Правильный ответ только один.',
    de: 'Nur eine Antwort ist richtig.',
    pl: 'Tylko jedna odpowiedź jest poprawna.',
    cs: 'Správná je jen jedna odpověď.',
    pt: 'Só uma resposta está correta.',
    tr: 'Yalnızca bir cevap doğru.',
    zh: '只有一个答案是正确的。',
    ja: '正しい答えは一つだけです。',
    ar: 'إجابة واحدة فقط صحيحة.',
    da: 'Kun ét svar er rigtigt.',
    el: 'Μόνο μία απάντηση είναι σωστή.'
  },
  wrongWord: {
    en: 'The underlined word is wrong. Write the correct word on the line.',
    fr: 'Le mot souligné est faux. Écris le bon mot sur la ligne.',
    es: 'La palabra subrayada es incorrecta. Escribe la palabra correcta en la línea.',
    it: 'La parola sottolineata è sbagliata. Scrivi la parola giusta sulla riga.',
    nl: 'Het onderstreepte woord is fout. Schrijf het juiste woord op de lijn.',
    ru: 'Подчёркнутое слово употреблено неверно. Напиши правильное слово на линии.',
    de: 'Das unterstrichene Wort ist falsch; das richtige Wort gehört auf die Linie.',
    pl: 'Podkreślony wyraz jest błędny. Napisz właściwy wyraz na linii.',
    cs: 'Podtržené slovo je špatně. Napiš správné slovo na čáru.',
    pt: 'A palavra sublinhada está errada. Escreve a palavra correta na linha.',
    tr: 'Altı çizili kelime yanlış. Doğru kelimeyi çizginin üzerine yaz.',
    zh: '画线的词语用错了。请在横线上写出正确的词语。',
    ja: '下線のことばはまちがっています。正しいことばを線の上に書いてください。',
    ar: 'الكلمة التي تحتها خط خاطئة. اكتب الكلمة الصحيحة على السطر.',
    da: 'Det understregede ord er forkert. Skriv det rigtige ord på linjen.',
    el: 'Η υπογραμμισμένη λέξη είναι λάθος. Γράψε τη σωστή λέξη στη γραμμή.'
  },
  twoSentences: {
    en: 'The same word fits in both gaps (a and b). Write it on the line.',
    fr: 'Le même mot va dans les deux trous (a et b). Écris-le sur la ligne.',
    es: 'La misma palabra va en los dos huecos (a y b). Escríbela en la línea.',
    it: 'La stessa parola va in entrambi gli spazi (a e b). Scrivila sulla riga.',
    nl: 'Hetzelfde woord past in beide open plekken (a en b). Schrijf het op de lijn.',
    ru: 'Одно и то же слово подходит к обоим пропускам (a и b). Напиши его на линии.',
    de: 'Dasselbe Wort passt in beide Lücken (a und b).',
    pl: 'Ten sam wyraz pasuje do obu luk (a i b). Napisz go na linii.',
    cs: 'Stejné slovo patří do obou mezer (a i b). Napiš ho na čáru.',
    pt: 'A mesma palavra serve nos dois espaços (a e b). Escreve-a na linha.',
    tr: 'Aynı kelime iki boşluğa da (a ve b) uyuyor. Çizginin üzerine yaz.',
    zh: '同一个词语可以填入两个空格（a和b）。请写在横线上。',
    ja: '同じことばが両方の空欄（aとb）に入ります。線の上に書いてください。',
    ar: 'الكلمة نفسها تناسب الفراغين (a وb). اكتبها على السطر.',
    da: 'Det samme ord passer i begge huller (a og b). Skriv det på linjen.',
    el: 'Η ίδια λέξη ταιριάζει και στα δύο κενά (a και b). Γράψε τη λέξη στη γραμμή.'
  },
  wordFormation: {
    en: 'Use the word in brackets and change its form.',
    fr: 'Utilise le mot entre parenthèses et change sa forme.',
    es: 'Usa la palabra entre paréntesis y cambia su forma.',
    it: 'Usa la parola tra parentesi nella forma corretta.',
    nl: 'Gebruik het woord tussen haakjes en verander de vorm.',
    ru: 'Поставь слово в скобках в нужную форму.',
    de: 'Das Wort in Klammern wird in die passende Form gebracht.',
    pl: 'Użyj wyrazu z nawiasu i zmień jego formę.',
    cs: 'Použij slovo v závorce a změň jeho tvar.',
    pt: 'Usa a palavra entre parênteses e muda a sua forma.',
    tr: 'Parantez içindeki kelimeyi kullan ve biçimini değiştir.',
    zh: '用括号里的字组成新词。',
    ja: 'かっこの中のことばの形を変えて使ってください。',
    ar: 'استخدم الكلمة التي بين القوسين وغيِّر صيغتها.',
    da: 'Brug ordet i parentes, og ændr dets form.',
    el: 'Χρησιμοποίησε τη λέξη της παρένθεσης και άλλαξε τη μορφή της.'
  },
  pictureBank: {
    en: 'Each picture shows one word from the box.',
    fr: "Chaque image montre un mot de l'encadré.",
    es: 'Cada imagen muestra una palabra del recuadro.',
    it: 'Ogni immagine mostra una parola del riquadro.',
    nl: 'Elke afbeelding toont één woord uit het kader.',
    ru: 'На каждой картинке изображено одно слово из рамки.',
    de: 'Jedes Bild zeigt ein Wort aus dem Kasten.',
    pl: 'Każdy obrazek przedstawia jeden wyraz z ramki.',
    cs: 'Každý obrázek ukazuje jedno slovo z rámečku.',
    pt: 'Cada imagem mostra uma palavra do quadro.',
    tr: 'Her resim kutudaki bir kelimeyi gösteriyor.',
    zh: '每幅图表示框中的一个词语。',
    ja: 'それぞれの絵は、枠の中のことばを一つ表しています。',
    ar: 'كل صورة تُظهر كلمة من الإطار.',
    da: 'Hvert billede viser ét ord fra boksen.',
    el: 'Κάθε εικόνα δείχνει μία λέξη από το πλαίσιο.'
  },
  scramble: {
    en: 'Use all the letters.',
    fr: 'Utilise toutes les lettres.',
    es: 'Usa todas las letras.',
    it: 'Usa tutte le lettere.',
    nl: 'Gebruik alle letters.',
    ru: 'Используй все буквы.',
    de: 'Alle Buchstaben werden verwendet.',
    pl: 'Użyj wszystkich liter.',
    cs: 'Použij všechna písmena.',
    pt: 'Usa todas as letras.',
    tr: 'Bütün harfleri kullan.',
    zh: '用上所有的字。',
    ja: 'すべての文字を使ってください。',
    ar: 'استخدم كل الحروف.',
    da: 'Brug alle bogstaverne.',
    el: 'Χρησιμοποίησε όλα τα γράμματα.'
  },
  crossword: {
    en: 'Write one letter in each box.',
    fr: 'Écris une lettre par case.',
    es: 'Escribe una letra en cada casilla.',
    it: 'Scrivi una lettera in ogni casella.',
    nl: 'Schrijf één letter in elk vakje.',
    ru: 'Пиши по одной букве в каждой клетке.',
    de: 'In jedes Kästchen gehört ein Buchstabe.',
    pl: 'W każdą kratkę wpisz jedną literę.',
    cs: 'Do každého políčka napiš jedno písmeno.',
    pt: 'Escreve uma letra em cada quadrado.',
    tr: 'Her kutuya bir harf yaz.',
    zh: '每个方格里写一个字。',
    ja: '一つのマスに一文字ずつ書いてください。',
    ar: 'اكتب حرفًا واحدًا في كل مربع.',
    da: 'Skriv ét bogstav i hvert felt.',
    el: 'Γράψε ένα γράμμα σε κάθε τετράγωνο.'
  },
  categorize: {
    en: 'Write each word in exactly one group.',
    fr: 'Écris chaque mot dans un seul groupe.',
    es: 'Escribe cada palabra en un solo grupo.',
    it: 'Scrivi ogni parola in un solo gruppo.',
    nl: 'Schrijf elk woord in precies één groep.',
    ru: 'Запиши каждое слово только в одну группу.',
    de: 'Jedes Wort gehört in genau eine Gruppe.',
    pl: 'Wpisz każdy wyraz tylko do jednej grupy.',
    cs: 'Každé slovo zapiš jen do jedné skupiny.',
    pt: 'Escreve cada palavra num só grupo.',
    tr: 'Her kelimeyi yalnızca bir gruba yaz.',
    zh: '每个词语只写进一个类别。',
    ja: 'それぞれのことばを一つのグループだけに書いてください。',
    ar: 'اكتب كل كلمة في مجموعة واحدة فقط.',
    da: 'Skriv hvert ord i præcis én gruppe.',
    el: 'Γράψε κάθε λέξη σε μία μόνο ομάδα.'
  },
  mindmap: {
    en: 'Write one word on each line.',
    fr: 'Écris un mot par ligne.',
    es: 'Escribe una palabra en cada línea.',
    it: 'Scrivi una parola per riga.',
    nl: 'Schrijf één woord op elke regel.',
    ru: 'Напиши по одному слову на каждой строке.',
    de: 'Auf jede Linie gehört ein Wort.',
    pl: 'Na każdej linii napisz jeden wyraz.',
    cs: 'Na každou čáru napiš jedno slovo.',
    pt: 'Escreve uma palavra em cada linha.',
    tr: 'Her çizgiye bir kelime yaz.',
    zh: '每条横线上写一个词语。',
    ja: 'それぞれの線に一つずつことばを書いてください。',
    ar: 'اكتب كلمة واحدة على كل سطر.',
    da: 'Skriv ét ord på hver linje.',
    el: 'Γράψε μία λέξη σε κάθε γραμμή.'
  },
  wordFamily: {
    en: 'The word on the left belongs to the same word family.',
    fr: 'Le mot à gauche appartient à la même famille de mots.',
    es: 'La palabra de la izquierda pertenece a la misma familia de palabras.',
    it: 'La parola a sinistra appartiene alla stessa famiglia di parole.',
    nl: 'Het woord links hoort bij dezelfde woordfamilie.',
    ru: 'Слово слева и искомое слово – однокоренные.',
    de: 'Das Wort links gehört zur selben Wortfamilie.',
    pl: 'Wyraz po lewej należy do tej samej rodziny wyrazów.',
    cs: 'Slovo vlevo je příbuzné s hledaným slovem.',
    pt: 'A palavra da esquerda pertence à mesma família de palavras.',
    tr: 'Soldaki kelime aynı kökten gelir.',
    zh: '左边的词语和要找的词语属于同一个词族。',
    ja: '左のことばは、同じ仲間のことばです。',
    ar: 'الكلمة المعطاة من الجذر نفسه.',
    da: 'Ordet til venstre hører til samme ordfamilie.',
    el: 'Η λέξη αριστερά ανήκει στην ίδια οικογένεια λέξεων.'
  },
  oddOneOut: {
    en: 'Circle one word in each row.',
    fr: 'Entoure un mot par ligne.',
    es: 'Rodea una palabra en cada fila.',
    it: 'Cerchia una parola per riga.',
    nl: 'Omcirkel één woord per rij.',
    ru: 'Обведи одно слово в каждом ряду.',
    de: 'In jeder Reihe wird ein Wort eingekreist.',
    pl: 'Zakreśl jeden wyraz w każdym rzędzie.',
    cs: 'V každé řadě zakroužkuj jedno slovo.',
    pt: 'Rodeia uma palavra em cada linha.',
    tr: 'Her satırda bir kelimeyi yuvarlak içine al.',
    zh: '每一行圈出一个词语。',
    ja: 'それぞれの行で、ことばを一つ丸で囲んでください。',
    ar: 'ضع دائرة حول كلمة واحدة في كل صف.',
    da: 'Sæt ring om ét ord i hver række.',
    el: 'Κύκλωσε μία λέξη σε κάθε σειρά.'
  },
  gapNumbers: {
    en: 'Each gap has a number: (1), (2) …',
    fr: 'Chaque trou a un numéro : (1), (2) …',
    es: 'Cada hueco tiene un número: (1), (2) …',
    it: 'Ogni spazio ha un numero: (1), (2) …',
    nl: 'Elke open plek heeft een nummer: (1), (2) …',
    ru: 'У каждого пропуска есть номер: (1), (2) …',
    de: 'Jede Lücke hat eine Nummer: (1), (2) …',
    pl: 'Każda luka ma numer: (1), (2) …',
    cs: 'Každá mezera má číslo: (1), (2) …',
    pt: 'Cada espaço tem um número: (1), (2) …',
    tr: 'Her boşluğun bir numarası var: (1), (2) …',
    zh: '每个空格都有编号：（1）、（2）……',
    ja: 'それぞれの空欄には番号があります：(1)、(2)…',
    ar: 'لكل فراغ رقم: (1)، (2) …',
    da: 'Hvert hul har et nummer: (1), (2) …',
    el: 'Κάθε κενό έχει έναν αριθμό: (1), (2) …'
  }
}

/** Altsprachen (Latein, Griechisch): deutsches Schülermaterial (30.09.2026) – vorher englisch */
const hilfeSprache = (lang: string): string => (lang === 'la' || lang === 'grc' ? 'de' : lang)

const text = (key: HelpKey, lang: string): string => TEXTS[key][hilfeSprache(lang)] ?? TEXTS[key].en

/** Sprachen mit eigenen Hinweistexten – für die Tests */
export const HILFE_SPRACHEN = Object.keys(TEXTS.useEachOnce)

/** Ein Hinweis in einer Sprache (Tests, Vorschau) */
export const hilfeText = (key: HelpKey, lang: string): string => text(key, lang)
export type { HelpKey }

/** „You do not need 2 words." – mit der genauen Zahl überzähliger Wörter */
export function notNeededText(n: number, lang: string): string {
  const one = n === 1
  switch (hilfeSprache(lang)) {
    case 'de':
      return one ? 'Ein Wort wird nicht gebraucht.' : `${n} Wörter werden nicht gebraucht.`
    case 'pl': {
      // 1 wyraz … potrzebny, 2–4 wyrazy … potrzebne, ab 5 wyrazów nie będzie potrzebnych
      const form = polnischPlural(n, ['wyraz', 'wyrazy', 'wyrazów'])
      if (form === 'wyraz') return `${n} wyraz nie będzie potrzebny.`
      return form === 'wyrazy' ? `${n} wyrazy nie będą potrzebne.` : `${n} wyrazów nie będzie potrzebnych.`
    }
    case 'cs':
      return `${n} ${tschechischPlural(n, ['slovo', 'slova', 'slov'])} nebudeš potřebovat.`
    case 'pt':
      return one ? 'Não precisas de uma das palavras.' : `Não precisas de ${n} palavras.`
    case 'tr':
      // Nach Zahlwörtern steht im Türkischen der Singular
      return `${n} kelimeye ihtiyacın yok.`
    case 'zh':
      return `有${n}个词语用不上。`
    case 'ja':
      return `使わないことばが${n}個あります。`
    case 'ar':
      // Arabische Zählregeln (Dual, 3–10, ab 11) umgangen: „Anzahl der Wörter, die du nicht brauchst: n"
      return `عدد الكلمات التي لن تحتاج إليها: ${n}.`
    case 'da':
      return one ? 'Du skal ikke bruge ét af ordene.' : `Du skal ikke bruge ${n} af ordene.`
    case 'el':
      return one ? 'Μία λέξη δεν θα τη χρειαστείς.' : `${n} λέξεις δεν θα τις χρειαστείς.`
    case 'fr':
      return one ? 'Tu n’as pas besoin d’un mot.' : `Tu n’as pas besoin de ${n} mots.`
    case 'es':
      return one ? 'No necesitas una palabra.' : `No necesitas ${n} palabras.`
    case 'it':
      return one ? "C'è una parola in più." : `Ci sono ${n} parole in più.`
    case 'nl':
      return one ? 'Eén woord heb je niet nodig.' : `${n} woorden heb je niet nodig.`
    case 'ru': {
      // Verb im Singular nach 1, 21 … („1 слово тебе не понадобится"), sonst im Plural
      const form = russischPlural(n, RU_SLOVO)
      return `${n} ${form} тебе не ${form === 'слово' ? 'понадобится' : 'понадобятся'}.`
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
    .replace(/^(to|a|an|the|le|la|les|l'|un|une|el|los|las|il|lo|gli|de|het|een|o|os|as|um|uma|en|et|ο|η|το|οι|τα|ὁ|ἡ|τό)\s+/u, '')
    .trim()
}

/**
 * Hinweise, die eindeutig machen, was in welcher Lücke/Zeile verlangt ist.
 * Sie werden unter der Arbeitsanweisung gedruckt und lassen sich pro Aufgabe abschalten.
 */
export function blockHelp(block: Block, lang: string): string[] {
  if (block.showHelp === false) return []
  // Von Hand geänderte Zeile hat Vorrang (30.09.2026); leer = keine Hinweiszeile
  if (block.helpText !== undefined) return block.helpText.trim() ? [block.helpText.trim()] : []
  return errechneteHilfe(block, lang)
}

/** Der errechnete Hinweis ohne Änderung von Hand – Ausgangstext beim Bearbeiten. */
export function errechneteHilfe(block: Block, lang: string): string[] {
  const out: (HelpKey | { notNeeded: number })[] = []
  const unneeded = unneededWordCount(block)
  switch (block.kind) {
    case 'gap': {
      if (block.taskType === 'wrongWord') out.push('wrongWord')
      else if (block.taskType === 'twoSentences') out.push('twoSentences')
      else if (block.taskType === 'wordFormation' || block.taskType === 'caseForms') out.push('wordFormation')
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
