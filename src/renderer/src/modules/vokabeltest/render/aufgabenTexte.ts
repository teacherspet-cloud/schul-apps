import type { TaskTypeId } from '../model/types'

/**
 * Überschriften und Arbeitsanweisungen der Aufgaben sowie der Testkopf in der Sprache des Tests
 * (30.09.2026).
 *
 * Bis dahin standen die Überschriften für ALLE modernen Sprachen englisch auf dem Blatt
 * („Fill in the gaps" über einem Französischtest), die Anweisung schrieb die KI zur Laufzeit.
 * Für die neuen Schulsprachen (Polnisch, Tschechisch, Portugiesisch, Türkisch, Chinesisch,
 * Japanisch, Arabisch, Dänisch, Neugriechisch) und für Niederländisch/Russisch gilt jetzt:
 * FESTE, vorab erzeugte und geprüfte Texte statt einer Laufzeit-Formulierung – eine Anweisung
 * mit Grammatikfehler auf einem Test ist schlimmer als eine schlichte. Für Englisch, Französisch,
 * Spanisch und Italienisch bleibt die KI-Anweisung, der Text hier ist der Rückfall.
 *
 * Konventionen: informelle Anrede im Singular wie in den Lehrwerken (du/tu/ty/ты/sen), im
 * Japanischen die Lehrwerksform 〜てください, im Arabischen der maskuline Imperativ des
 * Hocharabischen (Lehrwerksstandard). Portugiesisch in europäischer Norm (tu-Form).
 * Nicht muttersprachlich geprüft – Liste und Quellenlage in recherche/sprachtexte-2026-09-30.md.
 * Altsprachen (Latein, Griechisch) arbeiten mit deutschen Anweisungen (taskTypes.ts).
 */

export interface AufgabenText {
  title: string
  instruction: string
}

type Texte = Partial<Record<TaskTypeId, [title: string, instruction: string]>>

/** Sprachen, deren feste Anweisung Vorrang vor der KI-Formulierung hat */
export const FESTE_ANWEISUNG = new Set(['nl', 'ru', 'pl', 'cs', 'pt', 'tr', 'zh', 'ja', 'ar', 'da', 'el'])

const TEXTE: Record<string, Texte> = {
  fr: {
    gapSentences: ['Complète les phrases', 'Complète les phrases avec les mots qui conviennent.'],
    gapText: ['Complète le texte', 'Lis le texte et complète-le avec les mots qui manquent.'],
    dialogue: ['Complète le dialogue', "Complète le dialogue avec les mots de l'encadré."],
    matchDefinitions: ['Associe les mots et les définitions', 'Associe les définitions (1–…) aux mots (a–…). Il y a plus de mots que nécessaire.'],
    writeDefinitions: ['Explique les mots', 'Explique les mots en français. Ne les traduis pas.'],
    pictureLabel: ['Légende les images', 'Écris le bon mot sous chaque image.'],
    multipleChoice: ['Choisis le bon mot', 'Coche le mot qui convient le mieux.'],
    synonymsAntonyms: ['Synonymes et contraires', 'Associe chaque mot à un mot de même sens (=) ou de sens contraire (≠).'],
    collocations: ['Les mots qui vont ensemble', 'Associe les mots pour former des expressions courantes.'],
    wordFormation: ['Formation des mots', 'Forme, à partir du mot entre parenthèses, un mot qui convient.'],
    wordFamily: ['Familles de mots', 'Quel mot de la liste appartient à la même famille ? Écris-le sur la ligne.'],
    mindmap: ['Carte mentale', 'Écris sur les branches vides les mots que tu as appris sur ce thème.'],
    oddOneOut: ["L'intrus", "Entoure le mot qui n'appartient pas au groupe et explique pourquoi."],
    categorize: ['Classe les mots', 'Classe les mots dans les bons groupes.'],
    writeSentences: ['Écris des phrases', 'Écris une phrase avec chaque mot. Montre que tu sais ce qu’il veut dire.'],
    mediation: ['Médiation', 'Dis-le en français. Utilise le mot entre parenthèses.'],
    crossword: ['Mots croisés', 'Lis les définitions et complète la grille.'],
    scrambled: ['Remets les lettres dans l’ordre', 'Remets les lettres dans le bon ordre. Les phrases t’aident.'],
    wrongWord: ['Corrige les erreurs', 'Dans chaque phrase, un mot est faux. Barre-le et écris le bon mot.'],
    twoSentences: ['Un mot – deux phrases', 'Trouve un mot qui convient dans les deux phrases.'],
    trueFalse: ['Vrai ou faux ?', 'Les phrases sont-elles vraies ou fausses ? Corrige les phrases fausses.']
  },
  es: {
    gapSentences: ['Completa las frases', 'Completa las frases con las palabras correctas.'],
    gapText: ['Completa el texto', 'Lee el texto y completa las palabras que faltan.'],
    dialogue: ['Completa el diálogo', 'Completa el diálogo con palabras del recuadro.'],
    matchDefinitions: ['Relaciona las palabras con las definiciones', 'Relaciona las definiciones (1–…) con las palabras (a–…). Hay más palabras de las que necesitas.'],
    writeDefinitions: ['Explica las palabras', 'Explica las palabras en español. No las traduzcas.'],
    pictureLabel: ['Escribe el nombre de cada imagen', 'Escribe la palabra correcta debajo de cada imagen.'],
    multipleChoice: ['Elige la palabra correcta', 'Marca la palabra que mejor encaja.'],
    synonymsAntonyms: ['Sinónimos y antónimos', 'Relaciona cada palabra con otra de significado igual (=) u opuesto (≠).'],
    collocations: ['Combinaciones de palabras', 'Relaciona las palabras para formar combinaciones frecuentes.'],
    wordFormation: ['Formación de palabras', 'Forma con la palabra entre paréntesis una palabra que encaje en el hueco.'],
    wordFamily: ['Familias de palabras', '¿Qué palabra de la lista pertenece a la misma familia? Escríbela en la línea.'],
    mindmap: ['Mapa mental', 'Escribe en las ramas vacías las palabras que has aprendido sobre este tema.'],
    oddOneOut: ['¿Qué palabra sobra?', 'Rodea la palabra que no pertenece al grupo y explica por qué.'],
    categorize: ['Clasifica las palabras', 'Clasifica las palabras en los grupos correctos.'],
    writeSentences: ['Escribe frases', 'Escribe una frase con cada palabra. Demuestra que sabes lo que significa.'],
    mediation: ['Mediación', 'Dilo en español. Usa la palabra entre paréntesis.'],
    crossword: ['Crucigrama', 'Lee las pistas y completa el crucigrama.'],
    scrambled: ['Ordena las letras', 'Ordena las letras. Las frases te ayudan.'],
    wrongWord: ['Corrige los errores', 'En cada frase hay una palabra incorrecta. Táchala y escribe la palabra correcta.'],
    twoSentences: ['Una palabra – dos frases', 'Busca una palabra que encaje en las dos frases.'],
    trueFalse: ['¿Verdadero o falso?', '¿Las frases son verdaderas o falsas? Corrige las falsas.']
  },
  it: {
    gapSentences: ['Completa le frasi', 'Completa le frasi con le parole giuste.'],
    gapText: ['Completa il testo', 'Leggi il testo e inserisci le parole mancanti.'],
    dialogue: ['Completa il dialogo', 'Completa il dialogo con le parole del riquadro.'],
    matchDefinitions: ['Abbina le parole alle definizioni', 'Abbina le definizioni (1–…) alle parole (a–…). Ci sono più parole del necessario.'],
    writeDefinitions: ['Spiega le parole', 'Spiega le parole in italiano. Non tradurle.'],
    pictureLabel: ['Scrivi il nome delle immagini', 'Scrivi la parola giusta sotto ogni immagine.'],
    multipleChoice: ['Scegli la parola giusta', 'Segna la parola più adatta.'],
    synonymsAntonyms: ['Sinonimi e contrari', 'Abbina ogni parola a una parola con lo stesso significato (=) o con il significato opposto (≠).'],
    collocations: ['Combinazioni di parole', 'Abbina le parole per formare combinazioni frequenti.'],
    wordFormation: ['Formazione delle parole', 'Usa la parola tra parentesi per formare una parola adatta allo spazio.'],
    wordFamily: ['Famiglie di parole', 'Quale parola della lista appartiene alla stessa famiglia? Scrivila sulla riga.'],
    mindmap: ['Mappa mentale', 'Scrivi sui rami vuoti le parole che hai imparato su questo tema.'],
    oddOneOut: ["Trova l'intruso", 'Cerchia la parola che non appartiene al gruppo e spiega perché.'],
    categorize: ['Classifica le parole', 'Metti le parole nei gruppi giusti.'],
    writeSentences: ['Scrivi delle frasi', 'Scrivi una frase con ogni parola. Mostra che ne conosci il significato.'],
    mediation: ['Mediazione', 'Dillo in italiano. Usa la parola tra parentesi.'],
    crossword: ['Cruciverba', 'Leggi le definizioni e completa il cruciverba.'],
    scrambled: ['Riordina le lettere', "Metti le lettere nell'ordine giusto. Le frasi ti aiutano."],
    wrongWord: ['Correggi gli errori', 'In ogni frase c’è una parola sbagliata. Cancellala e scrivi la parola giusta.'],
    twoSentences: ['Una parola – due frasi', 'Trova una parola che vada bene in entrambe le frasi.'],
    trueFalse: ['Vero o falso?', 'Le frasi sono vere o false? Correggi quelle false.']
  },
  nl: {
    gapSentences: ['Vul de ontbrekende woorden in', 'Vul de zinnen aan met de juiste woorden.'],
    gapText: ['Maak de tekst compleet', 'Lees de tekst en vul de ontbrekende woorden in.'],
    dialogue: ['Maak de dialoog compleet', 'Vul de dialoog aan met woorden uit het kader.'],
    matchDefinitions: ['Koppel de woorden aan de uitleg', 'Koppel de uitleg (1–…) aan de woorden (a–…). Er zijn meer woorden dan je nodig hebt.'],
    writeDefinitions: ['Leg de woorden uit', 'Leg de woorden uit in het Nederlands. Vertaal ze niet.'],
    pictureLabel: ['Benoem de afbeeldingen', 'Schrijf het juiste woord onder elke afbeelding.'],
    multipleChoice: ['Kies het juiste woord', 'Kruis het woord aan dat het best past.'],
    synonymsAntonyms: ['Synoniemen en tegenstellingen', 'Koppel elk woord aan een woord met dezelfde (=) of de tegenovergestelde (≠) betekenis.'],
    collocations: ['Woordcombinaties', 'Koppel de woorden tot gangbare woordcombinaties.'],
    wordFormation: ['Woordvorming', 'Vorm met het woord tussen haakjes een woord dat in de open plek past.'],
    wordFamily: ['Woordfamilies', 'Welk woord uit de lijst hoort bij dezelfde woordfamilie? Schrijf het op de lijn.'],
    mindmap: ['Woordweb', 'Schrijf de woorden die je over dit onderwerp hebt geleerd in de lege takken.'],
    oddOneOut: ['Welk woord hoort er niet bij?', 'Omcirkel het woord dat niet bij de groep hoort en leg uit waarom.'],
    categorize: ['Sorteer de woorden', 'Zet de woorden in de juiste groep.'],
    writeSentences: ['Schrijf zinnen', 'Schrijf met elk woord een zin. Laat zien dat je weet wat het betekent.'],
    mediation: ['Taalbemiddeling', 'Zeg het in het Nederlands. Gebruik het woord tussen haakjes.'],
    crossword: ['Kruiswoordpuzzel', 'Lees de omschrijvingen en vul de kruiswoordpuzzel in.'],
    scrambled: ['Zet de letters in de juiste volgorde', 'Zet de letters in de juiste volgorde. De zinnen helpen je.'],
    wrongWord: ['Verbeter de fouten', 'In elke zin staat één verkeerd woord. Streep het door en schrijf het juiste woord op.'],
    twoSentences: ['Eén woord – twee zinnen', 'Zoek één woord dat in beide zinnen past.'],
    trueFalse: ['Waar of niet waar?', 'Zijn de zinnen waar of niet waar? Verbeter de zinnen die niet waar zijn.']
  },
  ru: {
    gapSentences: ['Заполни пропуски', 'Дополни предложения подходящими словами.'],
    gapText: ['Дополни текст', 'Прочитай текст и вставь пропущенные слова.'],
    dialogue: ['Дополни диалог', 'Дополни диалог словами из рамки.'],
    matchDefinitions: ['Соотнеси слова и толкования', 'Соотнеси толкования (1–…) со словами (a–…). Слов больше, чем нужно.'],
    writeDefinitions: ['Объясни слова', 'Объясни значение слов по-русски. Не переводи их.'],
    pictureLabel: ['Подпиши картинки', 'Напиши правильное слово под каждой картинкой.'],
    multipleChoice: ['Выбери правильное слово', 'Отметь слово, которое подходит лучше всего.'],
    synonymsAntonyms: ['Синонимы и антонимы', 'Подбери к каждому слову слово с тем же (=) или противоположным (≠) значением.'],
    collocations: ['Словосочетания', 'Соедини слова так, чтобы получились устойчивые словосочетания.'],
    wordFormation: ['Словообразование', 'Образуй от слова в скобках слово, которое подходит к пропуску.'],
    wordFamily: ['Однокоренные слова', 'Какое слово из списка однокоренное? Напиши его на линии.'],
    mindmap: ['Ассоциограмма', 'Впиши в пустые ветки слова по этой теме, которые ты знаешь.'],
    oddOneOut: ['Найди лишнее слово', 'Обведи слово, которое не подходит к группе, и объясни почему.'],
    categorize: ['Распредели слова', 'Распредели слова по группам.'],
    writeSentences: ['Составь предложения', 'Составь предложение с каждым словом. Покажи, что ты знаешь его значение.'],
    mediation: ['Медиация', 'Скажи это по-русски. Используй слово в скобках.'],
    crossword: ['Кроссворд', 'Прочитай подсказки и разгадай кроссворд.'],
    scrambled: ['Составь слова из букв', 'Расставь буквы в правильном порядке. Предложения тебе помогут.'],
    wrongWord: ['Исправь ошибки', 'В каждом предложении одно слово неправильное. Зачеркни его и напиши правильное слово.'],
    twoSentences: ['Одно слово – два предложения', 'Найди слово, которое подходит к обоим предложениям.'],
    trueFalse: ['Верно или неверно?', 'Верны ли утверждения? Исправь неверные.'],
    aspectPairs: ['Видовые пары', 'Напиши к каждому глаголу его видовую пару.'],
    caseForms: ['Падежи', 'Поставь слова в скобках в нужный падеж.']
  },
  pl: {
    gapSentences: ['Uzupełnij luki', 'Uzupełnij zdania odpowiednimi wyrazami.'],
    gapText: ['Uzupełnij tekst', 'Przeczytaj tekst i wpisz brakujące wyrazy.'],
    dialogue: ['Uzupełnij dialog', 'Uzupełnij dialog wyrazami z ramki.'],
    matchDefinitions: ['Połącz wyrazy z objaśnieniami', 'Połącz objaśnienia (1–…) z wyrazami (a–…). Wyrazów jest więcej, niż potrzeba.'],
    writeDefinitions: ['Objaśnij wyrazy', 'Objaśnij wyrazy po polsku. Nie tłumacz ich.'],
    pictureLabel: ['Podpisz obrazki', 'Napisz właściwy wyraz pod każdym obrazkiem.'],
    multipleChoice: ['Wybierz właściwy wyraz', 'Zaznacz wyraz, który pasuje najlepiej.'],
    synonymsAntonyms: ['Synonimy i antonimy', 'Połącz każdy wyraz z wyrazem o tym samym (=) lub przeciwnym (≠) znaczeniu.'],
    collocations: ['Związki wyrazowe', 'Połącz wyrazy w typowe związki wyrazowe.'],
    wordFormation: ['Słowotwórstwo', 'Utwórz od wyrazu w nawiasie wyraz, który pasuje do luki.'],
    wordFamily: ['Rodziny wyrazów', 'Który wyraz z listy należy do tej samej rodziny wyrazów? Napisz go na linii.'],
    mindmap: ['Mapa myśli', 'Wpisz w puste gałęzie poznane wyrazy na ten temat.'],
    oddOneOut: ['Który wyraz nie pasuje?', 'Zakreśl wyraz, który nie pasuje do grupy, i wyjaśnij dlaczego.'],
    categorize: ['Pogrupuj wyrazy', 'Przyporządkuj wyrazy do właściwych grup.'],
    writeSentences: ['Ułóż zdania', 'Ułóż zdanie z każdym wyrazem. Pokaż, że znasz jego znaczenie.'],
    mediation: ['Mediacja', 'Powiedz to po polsku. Użyj wyrazu z nawiasu.'],
    crossword: ['Krzyżówka', 'Przeczytaj opisy i rozwiąż krzyżówkę.'],
    scrambled: ['Ułóż wyrazy z liter', 'Ułóż litery we właściwej kolejności. Zdania ci pomogą.'],
    wrongWord: ['Popraw błędy', 'W każdym zdaniu jeden wyraz jest błędny. Skreśl go i napisz właściwy wyraz.'],
    twoSentences: ['Jeden wyraz – dwa zdania', 'Znajdź wyraz, który pasuje do obu zdań.'],
    trueFalse: ['Prawda czy fałsz?', 'Czy zdania są prawdziwe, czy fałszywe? Popraw zdania fałszywe.'],
    aspectPairs: ['Pary aspektowe', 'Napisz do każdego czasownika jego parę aspektową.'],
    caseForms: ['Przypadki', 'Wstaw wyrazy z nawiasów w odpowiednim przypadku.']
  },
  cs: {
    gapSentences: ['Doplň chybějící slova', 'Doplň do vět správná slova.'],
    gapText: ['Doplň text', 'Přečti si text a doplň chybějící slova.'],
    dialogue: ['Doplň rozhovor', 'Doplň rozhovor slovy z rámečku.'],
    matchDefinitions: ['Přiřaď slova k vysvětlením', 'Přiřaď vysvětlení (1–…) ke slovům (a–…). Slov je víc, než potřebuješ.'],
    writeDefinitions: ['Vysvětli slova', 'Vysvětli slova česky. Nepřekládej je.'],
    pictureLabel: ['Popiš obrázky', 'Napiš pod každý obrázek správné slovo.'],
    multipleChoice: ['Vyber správné slovo', 'Zaškrtni slovo, které se hodí nejlépe.'],
    synonymsAntonyms: ['Synonyma a antonyma', 'Přiřaď ke každému slovu slovo se stejným (=) nebo opačným (≠) významem.'],
    collocations: ['Slovní spojení', 'Spoj slova do obvyklých slovních spojení.'],
    wordFormation: ['Tvoření slov', 'Utvoř ze slova v závorce slovo, které se hodí do mezery.'],
    wordFamily: ['Příbuzná slova', 'Které slovo ze seznamu je příbuzné? Napiš ho na čáru.'],
    mindmap: ['Myšlenková mapa', 'Napiš do prázdných větví slova k tomuto tématu, která už znáš.'],
    oddOneOut: ['Které slovo nepatří do skupiny?', 'Zakroužkuj slovo, které do skupiny nepatří, a vysvětli proč.'],
    categorize: ['Roztřiď slova', 'Roztřiď slova do správných skupin.'],
    writeSentences: ['Napiš věty', 'Napiš s každým slovem větu. Ukaž, že víš, co znamená.'],
    mediation: ['Mediace', 'Řekni to česky. Použij slovo v závorce.'],
    crossword: ['Křížovka', 'Přečti si nápovědy a vyplň křížovku.'],
    scrambled: ['Seřaď písmena', 'Seřaď písmena ve správném pořadí. Věty ti pomohou.'],
    wrongWord: ['Oprav chyby', 'V každé větě je jedno slovo špatně. Škrtni ho a napiš správné slovo.'],
    twoSentences: ['Jedno slovo – dvě věty', 'Najdi slovo, které se hodí do obou vět.'],
    trueFalse: ['Pravda, nebo nepravda?', 'Jsou věty pravdivé, nebo nepravdivé? Oprav nepravdivé věty.'],
    aspectPairs: ['Vidové dvojice', 'Napiš ke každému slovesu jeho vidový protějšek.'],
    caseForms: ['Pády', 'Doplň slova v závorkách ve správném pádě.']
  },
  pt: {
    gapSentences: ['Preenche os espaços', 'Completa as frases com as palavras corretas.'],
    gapText: ['Completa o texto', 'Lê o texto e preenche os espaços com as palavras que faltam.'],
    dialogue: ['Completa o diálogo', 'Completa o diálogo com palavras do quadro.'],
    matchDefinitions: ['Faz corresponder as palavras às definições', 'Faz corresponder as definições (1–…) às palavras (a–…). Há mais palavras do que as necessárias.'],
    writeDefinitions: ['Explica as palavras', 'Explica as palavras em português. Não as traduzas.'],
    pictureLabel: ['Legenda as imagens', 'Escreve a palavra correta debaixo de cada imagem.'],
    multipleChoice: ['Escolhe a palavra correta', 'Assinala a palavra que melhor se adequa.'],
    synonymsAntonyms: ['Sinónimos e antónimos', 'Faz corresponder cada palavra a uma palavra com o mesmo significado (=) ou com o significado contrário (≠).'],
    collocations: ['Combinações de palavras', 'Junta as palavras para formar combinações frequentes.'],
    wordFormation: ['Formação de palavras', 'Usa a palavra entre parênteses para formar uma palavra que complete o espaço.'],
    wordFamily: ['Famílias de palavras', 'Que palavra da lista pertence à mesma família de palavras? Escreve-a na linha.'],
    mindmap: ['Mapa mental', 'Escreve nos ramos vazios as palavras que aprendeste sobre este tema.'],
    oddOneOut: ['Qual é a palavra intrusa?', 'Rodeia a palavra que não pertence ao grupo e explica porquê.'],
    categorize: ['Organiza as palavras', 'Coloca as palavras nos grupos corretos.'],
    writeSentences: ['Escreve frases', 'Escreve uma frase com cada palavra. Mostra que sabes o que significa.'],
    mediation: ['Mediação', 'Diz em português. Usa a palavra entre parênteses.'],
    crossword: ['Palavras cruzadas', 'Lê as pistas e completa as palavras cruzadas.'],
    scrambled: ['Ordena as letras', 'Põe as letras pela ordem certa. As frases ajudam-te.'],
    wrongWord: ['Corrige os erros', 'Em cada frase há uma palavra errada. Risca-a e escreve a palavra correta.'],
    twoSentences: ['Uma palavra – duas frases', 'Encontra uma palavra que sirva nas duas frases.'],
    trueFalse: ['Verdadeiro ou falso?', 'As frases são verdadeiras ou falsas? Corrige as falsas.']
  },
  tr: {
    gapSentences: ['Boşlukları doldur', 'Cümleleri doğru kelimelerle tamamla.'],
    gapText: ['Metni tamamla', 'Metni oku ve eksik kelimeleri yaz.'],
    dialogue: ['Diyaloğu tamamla', 'Diyaloğu kutudaki kelimelerle tamamla.'],
    matchDefinitions: ['Kelimeleri açıklamalarla eşleştir', 'Açıklamaları (1–…) kelimelerle (a–…) eşleştir. Gerekenden fazla kelime var.'],
    writeDefinitions: ['Kelimeleri açıkla', 'Kelimeleri Türkçe açıkla. Çevirme.'],
    pictureLabel: ['Resimleri adlandır', 'Her resmin altına doğru kelimeyi yaz.'],
    multipleChoice: ['Doğru kelimeyi seç', 'En uygun kelimeyi işaretle.'],
    synonymsAntonyms: ['Eş ve zıt anlamlılar', 'Her kelimeyi eş anlamlısıyla (=) ya da zıt anlamlısıyla (≠) eşleştir.'],
    collocations: ['Kelime grupları', 'Kelimeleri sık kullanılan kelime grupları oluşturacak şekilde eşleştir.'],
    wordFormation: ['Kelime türetme', 'Parantez içindeki kelimeden boşluğa uyan yeni bir kelime türet.'],
    wordFamily: ['Aynı kökten kelimeler', 'Listedeki hangi kelime aynı köktendir? Çizginin üzerine yaz.'],
    mindmap: ['Zihin haritası', 'Bu konuda öğrendiğin kelimeleri boş dallara yaz.'],
    oddOneOut: ['Hangi kelime gruba uymuyor?', 'Gruba uymayan kelimeyi yuvarlak içine al ve nedenini açıkla.'],
    categorize: ['Kelimeleri grupla', 'Kelimeleri doğru gruplara yerleştir.'],
    writeSentences: ['Cümle kur', 'Her kelimeyle bir cümle kur. Anlamını bildiğini göster.'],
    mediation: ['Aracılık', 'Bunu Türkçe söyle. Parantez içindeki kelimeyi kullan.'],
    crossword: ['Bulmaca', 'İpuçlarını oku ve bulmacayı çöz.'],
    scrambled: ['Harfleri sırala', 'Harfleri doğru sıraya koy. Cümleler sana yardımcı olur.'],
    wrongWord: ['Hataları düzelt', 'Her cümlede bir kelime yanlış. Üstünü çiz ve doğru kelimeyi yaz.'],
    twoSentences: ['Bir kelime – iki cümle', 'İki cümleye de uyan bir kelime bul.'],
    trueFalse: ['Doğru mu, yanlış mı?', 'Cümleler doğru mu, yanlış mı? Yanlış olanları düzelt.'],
    caseForms: ['Hâl ekleri', 'Parantez içindeki kelimeleri uygun hâl ekiyle yaz.']
  },
  zh: {
    gapSentences: ['填空', '用正确的词语完成句子。'],
    gapText: ['补全短文', '阅读短文，填写缺少的词语。'],
    dialogue: ['补全对话', '用框中的词语补全对话。'],
    matchDefinitions: ['词语与解释配对', '把解释（1–…）和词语（a–…）配对。词语比需要的多。'],
    writeDefinitions: ['解释词语', '用中文解释这些词语，不要翻译。'],
    pictureLabel: ['看图写词', '在每幅图下面写出正确的词语。'],
    multipleChoice: ['选择正确的词语', '选出最合适的词语。'],
    synonymsAntonyms: ['近义词和反义词', '给每个词语找出意思相同（=）或相反（≠）的词语。'],
    collocations: ['词语搭配', '把词语连成常用的搭配。'],
    wordFormation: ['构词', '用括号里的字组成一个适合填空的词语。'],
    wordFamily: ['词族', '列表中哪个词语和左边的词语属于同一个词族？写在横线上。'],
    mindmap: ['思维导图', '把学过的有关这个话题的词语写在空白的分支上。'],
    oddOneOut: ['找出不同类的词语', '圈出不属于这一组的词语，并说明原因。'],
    categorize: ['词语分类', '把词语放到正确的类别里。'],
    writeSentences: ['造句', '用每个词语造一个句子，表明你懂得它的意思。'],
    mediation: ['语言中介', '用中文说一说。请用括号里的词语。'],
    wrongWord: ['改错', '每个句子里有一个词语用错了。划掉它，并写出正确的词语。'],
    twoSentences: ['一词两句', '找出一个两个句子都适用的词语。'],
    trueFalse: ['判断正误', '判断句子是否正确，并改正错误的句子。'],
    readingForms: ['写出拼音和意思', '写出每个词语的拼音和德语意思。'],
    readingMatch: ['汉字、拼音和意思配对', '把汉字（1–…）和拼音及意思（a–…）配对。']
  },
  ja: {
    gapSentences: ['空欄を埋める', '正しいことばを入れて、文を完成させてください。'],
    gapText: ['文章を完成させる', '文章を読んで、足りないことばを書いてください。'],
    dialogue: ['会話を完成させる', '枠の中のことばを使って、会話を完成させてください。'],
    matchDefinitions: ['ことばと説明を結ぶ', '説明（1–…）とことば（a–…）を結んでください。ことばは必要な数より多くあります。'],
    writeDefinitions: ['ことばを説明する', 'ことばの意味を日本語で説明してください。翻訳はしないでください。'],
    pictureLabel: ['絵を見て書く', 'それぞれの絵の下に正しいことばを書いてください。'],
    multipleChoice: ['正しいことばを選ぶ', 'いちばん合うことばに印をつけてください。'],
    synonymsAntonyms: ['似た意味のことばと反対の意味のことば', 'それぞれのことばを、同じ意味（=）か反対の意味（≠）のことばと結んでください。'],
    collocations: ['ことばの組み合わせ', 'よく使う組み合わせになるように、ことばを結んでください。'],
    wordFormation: ['ことばの形', 'かっこの中のことばを使って、空欄に合うことばを作ってください。'],
    wordFamily: ['仲間のことば', 'リストのどのことばが同じ仲間ですか。線の上に書いてください。'],
    mindmap: ['マインドマップ', 'このテーマについて習ったことばを、空いている枝に書いてください。'],
    oddOneOut: ['仲間はずれ', 'グループに合わないことばを丸で囲んで、理由を言ってください。'],
    categorize: ['ことばを分ける', 'ことばを正しいグループに分けてください。'],
    writeSentences: ['文を作る', 'それぞれのことばを使って文を作ってください。意味がわかることを示してください。'],
    mediation: ['言語仲介', '日本語で言ってください。かっこの中のことばを使ってください。'],
    wrongWord: ['まちがいを直す', 'それぞれの文に、まちがったことばが一つあります。線で消して、正しいことばを書いてください。'],
    twoSentences: ['一つのことば、二つの文', '両方の文に入ることばを一つ見つけてください。'],
    trueFalse: ['正しいか、正しくないか', '文は正しいですか、正しくないですか。正しくない文を直してください。'],
    readingForms: ['読み方と意味を書く', 'それぞれのことばの読み方（ひらがな）とドイツ語の意味を書いてください。'],
    readingMatch: ['漢字と読み方・意味を結ぶ', '漢字（1–…）と読み方・意味（a–…）を結んでください。']
  },
  ar: {
    gapSentences: ['املأ الفراغات', 'أكمل الجمل بالكلمات المناسبة.'],
    gapText: ['أكمل النص', 'اقرأ النص واكتب الكلمات الناقصة.'],
    dialogue: ['أكمل الحوار', 'أكمل الحوار بكلمات من الإطار.'],
    matchDefinitions: ['صِل الكلمات بمعانيها', 'صِل الشروح (1–…) بالكلمات (a–…). عدد الكلمات أكثر مما تحتاج.'],
    writeDefinitions: ['اشرح الكلمات', 'اشرح الكلمات باللغة العربية. لا تترجمها.'],
    pictureLabel: ['سمِّ الصور', 'اكتب الكلمة الصحيحة تحت كل صورة.'],
    multipleChoice: ['اختر الكلمة الصحيحة', 'ضع علامة على الكلمة الأنسب.'],
    synonymsAntonyms: ['المترادفات والأضداد', 'صِل كل كلمة بكلمة لها المعنى نفسه (=) أو المعنى المعاكس (≠).'],
    collocations: ['المتلازمات اللفظية', 'صِل الكلمات لتكوين تعابير شائعة.'],
    wordFormation: ['الاشتقاق', 'استخدم الكلمة التي بين القوسين لتكوين كلمة تناسب الفراغ.'],
    wordFamily: ['كلمات من الجذر نفسه', 'أي كلمة من القائمة من الجذر نفسه؟ اكتبها على السطر.'],
    mindmap: ['خريطة ذهنية', 'اكتب في الفروع الفارغة الكلمات التي تعلمتها عن هذا الموضوع.'],
    oddOneOut: ['الكلمة الغريبة', 'ضع دائرة حول الكلمة التي لا تنتمي إلى المجموعة واشرح السبب.'],
    categorize: ['صنِّف الكلمات', 'ضع الكلمات في المجموعات الصحيحة.'],
    writeSentences: ['كوِّن جملًا', 'كوِّن جملة بكل كلمة. بيِّن أنك تعرف معناها.'],
    mediation: ['الوساطة اللغوية', 'قلها باللغة العربية. استخدم الكلمة التي بين القوسين.'],
    wrongWord: ['صحِّح الأخطاء', 'في كل جملة كلمة خاطئة. اشطبها واكتب الكلمة الصحيحة.'],
    twoSentences: ['كلمة واحدة – جملتان', 'ابحث عن كلمة واحدة تناسب الجملتين.'],
    trueFalse: ['صواب أم خطأ؟', 'هل الجمل صحيحة أم خاطئة؟ صحِّح الجمل الخاطئة.'],
    arabicRoots: ['الجذر والمعنى', 'اكتب جذر كل كلمة ومعناها بالألمانية.']
  },
  da: {
    gapSentences: ['Udfyld hullerne', 'Udfyld sætningerne med de rigtige ord.'],
    gapText: ['Udfyld teksten', 'Læs teksten, og skriv de manglende ord.'],
    dialogue: ['Udfyld dialogen', 'Udfyld dialogen med ord fra boksen.'],
    matchDefinitions: ['Forbind ordene med forklaringerne', 'Forbind forklaringerne (1–…) med ordene (a–…). Der er flere ord, end du skal bruge.'],
    writeDefinitions: ['Forklar ordene', 'Forklar ordene på dansk. Du må ikke oversætte dem.'],
    pictureLabel: ['Skriv ord til billederne', 'Skriv det rigtige ord under hvert billede.'],
    multipleChoice: ['Vælg det rigtige ord', 'Sæt kryds ved det ord, der passer bedst.'],
    synonymsAntonyms: ['Synonymer og modsætninger', 'Forbind hvert ord med et ord, der betyder det samme (=) eller det modsatte (≠).'],
    collocations: ['Faste ordforbindelser', 'Forbind ordene, så de danner almindelige ordforbindelser.'],
    wordFormation: ['Orddannelse', 'Brug ordet i parentes til at danne et ord, der passer i hullet.'],
    wordFamily: ['Ordfamilier', 'Hvilket ord fra listen hører til samme ordfamilie? Skriv det på linjen.'],
    mindmap: ['Mindmap', 'Skriv de ord, du har lært om emnet, på de tomme grene.'],
    oddOneOut: ['Hvilket ord passer ikke?', 'Sæt ring om det ord, der ikke hører til gruppen, og forklar hvorfor.'],
    categorize: ['Sortér ordene', 'Placér ordene i de rigtige grupper.'],
    writeSentences: ['Skriv sætninger', 'Skriv en sætning med hvert ord. Vis, at du ved, hvad det betyder.'],
    mediation: ['Sprogmægling', 'Sig det på dansk. Brug ordet i parentes.'],
    crossword: ['Krydsord', 'Læs ledetrådene, og udfyld krydsordet.'],
    scrambled: ['Sæt bogstaverne i rækkefølge', 'Sæt bogstaverne i den rigtige rækkefølge. Sætningerne hjælper dig.'],
    wrongWord: ['Ret fejlene', 'Der er ét forkert ord i hver sætning. Streg det ud, og skriv det rigtige ord.'],
    twoSentences: ['Ét ord – to sætninger', 'Find ét ord, der passer i begge sætninger.'],
    trueFalse: ['Rigtigt eller forkert?', 'Er sætningerne rigtige eller forkerte? Ret de forkerte.']
  },
  el: {
    gapSentences: ['Συμπλήρωσε τα κενά', 'Συμπλήρωσε τις προτάσεις με τις σωστές λέξεις.'],
    gapText: ['Συμπλήρωσε το κείμενο', 'Διάβασε το κείμενο και γράψε τις λέξεις που λείπουν.'],
    dialogue: ['Συμπλήρωσε τον διάλογο', 'Συμπλήρωσε τον διάλογο με λέξεις από το πλαίσιο.'],
    matchDefinitions: ['Αντιστοίχισε τις λέξεις με τις εξηγήσεις', 'Αντιστοίχισε τις εξηγήσεις (1–…) με τις λέξεις (a–…). Υπάρχουν περισσότερες λέξεις απ’ όσες χρειάζεσαι.'],
    writeDefinitions: ['Εξήγησε τις λέξεις', 'Εξήγησε τις λέξεις στα ελληνικά. Μην τις μεταφράσεις.'],
    pictureLabel: ['Γράψε τις λέξεις κάτω από τις εικόνες', 'Γράψε τη σωστή λέξη κάτω από κάθε εικόνα.'],
    multipleChoice: ['Διάλεξε τη σωστή λέξη', 'Σημείωσε τη λέξη που ταιριάζει καλύτερα.'],
    synonymsAntonyms: ['Συνώνυμα και αντώνυμα', 'Αντιστοίχισε κάθε λέξη με μια λέξη που έχει την ίδια (=) ή την αντίθετη (≠) σημασία.'],
    collocations: ['Συνηθισμένοι συνδυασμοί λέξεων', 'Αντιστοίχισε τις λέξεις ώστε να σχηματίσεις συνηθισμένες φράσεις.'],
    wordFormation: ['Παραγωγή λέξεων', 'Με τη λέξη της παρένθεσης σχημάτισε μια λέξη που ταιριάζει στο κενό.'],
    wordFamily: ['Οικογένειες λέξεων', 'Ποια λέξη από τη λίστα ανήκει στην ίδια οικογένεια λέξεων; Γράψε τη λέξη στη γραμμή.'],
    mindmap: ['Νοητικός χάρτης', 'Γράψε στα κενά κλαδιά τις λέξεις που έμαθες γι’ αυτό το θέμα.'],
    oddOneOut: ['Ποια λέξη δεν ταιριάζει;', 'Κύκλωσε τη λέξη που δεν ανήκει στην ομάδα και εξήγησε γιατί.'],
    categorize: ['Ταξινόμησε τις λέξεις', 'Βάλε τις λέξεις στις σωστές ομάδες.'],
    writeSentences: ['Γράψε προτάσεις', 'Γράψε μια πρόταση με κάθε λέξη. Δείξε ότι ξέρεις τι σημαίνει.'],
    mediation: ['Διαμεσολάβηση', 'Πες το στα ελληνικά. Χρησιμοποίησε τη λέξη της παρένθεσης.'],
    crossword: ['Σταυρόλεξο', 'Διάβασε τους ορισμούς και συμπλήρωσε το σταυρόλεξο.'],
    scrambled: ['Βάλε τα γράμματα στη σειρά', 'Βάλε τα γράμματα στη σωστή σειρά. Οι προτάσεις σε βοηθούν.'],
    wrongWord: ['Διόρθωσε τα λάθη', 'Σε κάθε πρόταση μία λέξη είναι λάθος. Διάγραψέ τη και γράψε τη σωστή λέξη.'],
    twoSentences: ['Μία λέξη – δύο προτάσεις', 'Βρες μία λέξη που ταιριάζει και στις δύο προτάσεις.'],
    trueFalse: ['Σωστό ή λάθος;', 'Είναι οι προτάσεις σωστές ή λάθος; Διόρθωσε τις λανθασμένες.'],
    caseForms: ['Πτώσεις', 'Γράψε τις λέξεις της παρένθεσης στη σωστή πτώση.']
  }
}

/** Überschrift und Anweisung einer Aufgabe in der Testsprache; undefined = keine (dann Englisch bzw. Deutsch) */
export function aufgabenText(id: TaskTypeId, sprache: string): AufgabenText | undefined {
  const t = TEXTE[sprache]?.[id]
  return t ? { title: t[0], instruction: t[1] } : undefined
}

/** Alle Sprachen mit eigenen Aufgabentexten – für die Tests */
export const AUFGABEN_SPRACHEN = Object.keys(TEXTE)

/** Spaltenköpfe der Zuordnung „Erklärungen – Wörter" */
const ZUORDNUNG: Record<string, [string, string]> = {
  en: ['Explanations', 'Words'],
  fr: ['Définitions', 'Mots'],
  es: ['Definiciones', 'Palabras'],
  it: ['Definizioni', 'Parole'],
  nl: ['Uitleg', 'Woorden'],
  ru: ['Толкования', 'Слова'],
  pl: ['Objaśnienia', 'Wyrazy'],
  cs: ['Vysvětlení', 'Slova'],
  pt: ['Definições', 'Palavras'],
  tr: ['Açıklamalar', 'Kelimeler'],
  zh: ['解释', '词语'],
  ja: ['説明', 'ことば'],
  ar: ['الشروح', 'الكلمات'],
  da: ['Forklaringer', 'Ord'],
  el: ['Εξηγήσεις', 'Λέξεις']
}

export const zuordnungsKoepfe = (sprache: string): [string, string] => ZUORDNUNG[sprache] ?? ZUORDNUNG.en

/** Der Testkopf: Titel, Felder, Punkte, Lösungsvermerk und die Gruppenbezeichnung */
export interface KopfTexte {
  title: string
  name: string
  klasse: string
  datum: string
  punkte: string
  note: string
  loesung: string
  gruppe: (label: string) => string
}

const KOPF: Record<string, KopfTexte> = {
  en: { title: 'Vocabulary test', name: 'Name:', klasse: 'Class:', datum: 'Date:', punkte: 'Points:', note: 'Mark:', loesung: 'answer key', gruppe: (l) => `Test ${l}` },
  // Latein und Griechisch: deutsches Schülermaterial
  de: { title: 'Vokabeltest', name: 'Name:', klasse: 'Klasse:', datum: 'Datum:', punkte: 'Punkte:', note: 'Note:', loesung: 'Lösungen', gruppe: (l) => `Gruppe ${l}` },
  fr: {
    title: 'Interrogation de vocabulaire',
    name: 'Nom :',
    klasse: 'Classe :',
    datum: 'Date :',
    punkte: 'Points :',
    note: 'Note :',
    loesung: 'corrigé',
    gruppe: (l) => `Version ${l}`
  },
  es: { title: 'Prueba de vocabulario', name: 'Nombre:', klasse: 'Clase:', datum: 'Fecha:', punkte: 'Puntos:', note: 'Nota:', loesung: 'soluciones', gruppe: (l) => `Versión ${l}` },
  it: { title: 'Verifica di lessico', name: 'Nome:', klasse: 'Classe:', datum: 'Data:', punkte: 'Punti:', note: 'Voto:', loesung: 'soluzioni', gruppe: (l) => `Versione ${l}` },
  nl: { title: 'Woordjestoets', name: 'Naam:', klasse: 'Klas:', datum: 'Datum:', punkte: 'Punten:', note: 'Cijfer:', loesung: 'antwoorden', gruppe: (l) => `Versie ${l}` },
  ru: { title: 'Лексический тест', name: 'Фамилия, имя:', klasse: 'Класс:', datum: 'Дата:', punkte: 'Баллы:', note: 'Оценка:', loesung: 'ответы', gruppe: (l) => `Вариант ${l}` },
  pl: { title: 'Sprawdzian ze słówek', name: 'Imię i nazwisko:', klasse: 'Klasa:', datum: 'Data:', punkte: 'Punkty:', note: 'Ocena:', loesung: 'odpowiedzi', gruppe: (l) => `Grupa ${l}` },
  cs: { title: 'Test ze slovíček', name: 'Jméno a příjmení:', klasse: 'Třída:', datum: 'Datum:', punkte: 'Body:', note: 'Známka:', loesung: 'řešení', gruppe: (l) => `Skupina ${l}` },
  pt: { title: 'Teste de vocabulário', name: 'Nome:', klasse: 'Turma:', datum: 'Data:', punkte: 'Pontos:', note: 'Nota:', loesung: 'soluções', gruppe: (l) => `Versão ${l}` },
  tr: { title: 'Kelime sınavı', name: 'Adı Soyadı:', klasse: 'Sınıfı:', datum: 'Tarih:', punkte: 'Puan:', note: 'Not:', loesung: 'cevap anahtarı', gruppe: (l) => `${l} Grubu` },
  zh: { title: '词汇测验', name: '姓名：', klasse: '班级：', datum: '日期：', punkte: '得分：', note: '成绩：', loesung: '答案', gruppe: (l) => `${l}卷` },
  ja: { title: '語彙テスト', name: '氏名：', klasse: 'クラス：', datum: '日付：', punkte: '得点：', note: '評価：', loesung: '解答', gruppe: (l) => `テスト${l}` },
  ar: { title: 'اختبار المفردات', name: 'الاسم:', klasse: 'الصف:', datum: 'التاريخ:', punkte: 'الدرجة:', note: 'التقدير:', loesung: 'الإجابات', gruppe: (l) => `النموذج ${l}` },
  da: { title: 'Gloseprøve', name: 'Navn:', klasse: 'Klasse:', datum: 'Dato:', punkte: 'Point:', note: 'Karakter:', loesung: 'facitliste', gruppe: (l) => `Version ${l}` },
  el: { title: 'Τεστ λεξιλογίου', name: 'Ονοματεπώνυμο:', klasse: 'Τάξη:', datum: 'Ημερομηνία:', punkte: 'Μονάδες:', note: 'Βαθμός:', loesung: 'λύσεις', gruppe: (l) => `Ομάδα ${l}` }
}

/** Kopftexte des Tests; Latein und Griechisch deutsch, Unbekanntes englisch */
export const kopfTexte = (sprache: string | undefined): KopfTexte => (sprache === 'la' || sprache === 'grc' ? KOPF.de : (KOPF[sprache ?? 'en'] ?? KOPF.en))

/** Ist das einer der Standardtitel (in irgendeiner Sprache)? Dann darf er der Testsprache folgen. */
export const istStandardTitel = (titel: string): boolean => Object.values(KOPF).some((k) => k.title === titel.trim())
