/**
 * Texte in „Meine Bücher" und „Alphabetisch" (09.10.2026, Wunsch der Lehrkraft): in der Fremdsprache des Fachs, einfach
 * formuliert – wie die Registernamen (beschriftung.ts). Alle anderen Fächer (auch Deutsch als Zweitsprache) deutsch.
 * Zahlen bei Sprachen mit schwierigen Mehrzahlformen als „Wörter: 12".
 */
import type { WortStatus } from '@shared/wortliste'
import { beschriftung } from './beschriftung'

export interface BuecherTexte {
  /** Platzhalter im Suchfeld */
  suche: string
  nichts: (q: string) => string
  treffer: (n: number) => string
  trefferAlle: (n: number) => string
  woerter: (n: number) => string
  /** „12 sicher" am Buch im Bord */
  sicher: (n: number) => string
  /** Fach für Listen ohne Schulbuch */
  weitere: string
  /** Plakette am aktuellen Band */
  bisJetzt: string
  /** Aktueller Band: nur freigegebene Abschnitte */
  freigegeben: string
  ganzerBand: string
  ohneBuch: string
  mehr: string
  leer: string
  status: Record<WortStatus, string>
  bord: string
  springen: string
  anhoeren: (w: string) => string
  beispiel: string
  oeffnen: (name: string) => string
}

const eins = (n: number, ein: string, viele: string): string => `${n} ${n === 1 ? ein : viele}`

const DE: BuecherTexte = {
  suche: 'Wort oder Bedeutung suchen …',
  nichts: (q) => `Nichts gefunden zu „${q}“.`,
  treffer: (n) => `${n} Treffer`,
  trefferAlle: (n) => `${n} Treffer in allen Büchern`,
  woerter: (n) => eins(n, 'Wort', 'Wörter'),
  sicher: (n) => `${n} sicher`,
  weitere: 'Weitere Wörter',
  bisJetzt: 'bis jetzt',
  freigegeben: 'bisher freigegebene Abschnitte',
  ganzerBand: 'ganzer Band',
  ohneBuch: 'Listen ohne Schulbuch',
  mehr: 'Weitere Wörter zeigen',
  leer: 'Hier stehen bald alle Wörter, die du in diesem Fach lernst – sobald deine Lehrkraft welche freigibt.',
  status: { neu: 'neu', aufbau: 'im Aufbau', sicher: 'sicher' },
  bord: 'Bücherbord',
  springen: 'Zum Buchstaben springen',
  anhoeren: (w) => `${w} anhören`,
  beispiel: 'Beispielsatz anhören',
  oeffnen: (n) => `${n} öffnen`
}

const SPRACHEN: Record<string, BuecherTexte> = {
  en: {
    suche: 'Search for a word – English or German …',
    nichts: (q) => `Nothing found for “${q}”.`,
    treffer: (n) => eins(n, 'result', 'results'),
    trefferAlle: (n) => `${eins(n, 'result', 'results')} in all books`,
    woerter: (n) => eins(n, 'word', 'words'),
    sicher: (n) => `${n} known`,
    weitere: 'More words',
    bisJetzt: 'so far',
    freigegeben: 'sections so far',
    ganzerBand: 'whole book',
    ohneBuch: 'lists without a textbook',
    mehr: 'Show more words',
    leer: 'Soon you will find all your words here – as soon as your teacher shares some.',
    status: { neu: 'new', aufbau: 'learning', sicher: 'known' },
    bord: 'Bookshelf',
    springen: 'Jump to a letter',
    anhoeren: (w) => `Listen to “${w}”`,
    beispiel: 'Listen to the example',
    oeffnen: (n) => `Open ${n}`
  },
  fr: {
    suche: 'Chercher un mot – en français ou en allemand …',
    nichts: (q) => `Aucun résultat pour « ${q} ».`,
    treffer: (n) => eins(n, 'résultat', 'résultats'),
    trefferAlle: (n) => `${eins(n, 'résultat', 'résultats')} dans tous les livres`,
    woerter: (n) => eins(n, 'mot', 'mots'),
    sicher: (n) => `${n} acquis`,
    weitere: 'Autres mots',
    bisJetzt: "jusqu'ici",
    freigegeben: "parties vues jusqu'ici",
    ganzerBand: 'livre entier',
    ohneBuch: 'listes sans manuel',
    mehr: 'Afficher plus de mots',
    leer: 'Bientôt, tu trouveras ici tous tes mots – dès que ton professeur en partage.',
    status: { neu: 'nouveau', aufbau: 'en cours', sicher: 'acquis' },
    bord: 'Étagère',
    springen: 'Aller à la lettre',
    anhoeren: (w) => `Écouter « ${w} »`,
    beispiel: "Écouter l'exemple",
    oeffnen: (n) => `Ouvrir ${n}`
  },
  es: {
    suche: 'Buscar una palabra – en español o en alemán …',
    nichts: (q) => `No hay resultados para «${q}».`,
    treffer: (n) => eins(n, 'resultado', 'resultados'),
    trefferAlle: (n) => `${eins(n, 'resultado', 'resultados')} en todos los libros`,
    woerter: (n) => eins(n, 'palabra', 'palabras'),
    sicher: (n) => `${n} dominadas`,
    weitere: 'Más palabras',
    bisJetzt: 'hasta ahora',
    freigegeben: 'secciones hasta ahora',
    ganzerBand: 'libro completo',
    ohneBuch: 'listas sin libro de texto',
    mehr: 'Mostrar más palabras',
    leer: 'Pronto encontrarás aquí todas tus palabras, en cuanto tu profesor las comparta.',
    status: { neu: 'nueva', aufbau: 'en proceso', sicher: 'dominada' },
    bord: 'Estantería',
    springen: 'Ir a la letra',
    anhoeren: (w) => `Escuchar «${w}»`,
    beispiel: 'Escuchar el ejemplo',
    oeffnen: (n) => `Abrir ${n}`
  },
  it: {
    suche: 'Cerca una parola – in italiano o in tedesco …',
    nichts: (q) => `Nessun risultato per «${q}».`,
    treffer: (n) => eins(n, 'risultato', 'risultati'),
    trefferAlle: (n) => `${eins(n, 'risultato', 'risultati')} in tutti i libri`,
    woerter: (n) => eins(n, 'parola', 'parole'),
    sicher: (n) => `${n} sicure`,
    weitere: 'Altre parole',
    bisJetzt: 'finora',
    freigegeben: 'sezioni finora',
    ganzerBand: 'libro intero',
    ohneBuch: 'liste senza libro di testo',
    mehr: 'Mostra altre parole',
    leer: 'Presto troverai qui tutte le tue parole, appena il tuo insegnante le condivide.',
    status: { neu: 'nuova', aufbau: 'in corso', sicher: 'sicura' },
    bord: 'Scaffale',
    springen: 'Vai alla lettera',
    anhoeren: (w) => `Ascolta «${w}»`,
    beispiel: "Ascolta l'esempio",
    oeffnen: (n) => `Apri ${n}`
  },
  la: {
    suche: 'Verbum quaere – Latine aut Theodisce …',
    nichts: (q) => `Nihil inventum: „${q}“.`,
    treffer: (n) => `Inventa: ${n}`,
    trefferAlle: (n) => `Inventa in omnibus libris: ${n}`,
    woerter: (n) => eins(n, 'verbum', 'verba'),
    sicher: (n) => `${n} certa`,
    weitere: 'Alia verba',
    bisJetzt: 'adhuc',
    freigegeben: 'partes adhuc datae',
    ganzerBand: 'liber totus',
    ohneBuch: 'indices sine libro',
    mehr: 'Plura verba monstra',
    leer: 'Mox hic omnia verba tua invenies, simul ac magister ea dederit.',
    status: { neu: 'novum', aufbau: 'discitur', sicher: 'certum' },
    bord: 'Pluteus',
    springen: 'Ad litteram',
    anhoeren: (w) => `Audi: ${w}`,
    beispiel: 'Exemplum audi',
    oeffnen: (n) => `Aperi: ${n}`
  },
  ru: {
    suche: 'Найти слово – по-русски или по-немецки …',
    nichts: (q) => `Ничего не найдено: «${q}».`,
    treffer: (n) => `Найдено: ${n}`,
    trefferAlle: (n) => `Найдено во всех книгах: ${n}`,
    woerter: (n) => `Слов: ${n}`,
    sicher: (n) => `Выучено: ${n}`,
    weitere: 'Другие слова',
    bisJetzt: 'пока',
    freigegeben: 'пройденные разделы',
    ganzerBand: 'вся книга',
    ohneBuch: 'списки без учебника',
    mehr: 'Показать ещё',
    leer: 'Скоро здесь появятся все твои слова – как только учитель их откроет.',
    status: { neu: 'новое', aufbau: 'учу', sicher: 'знаю' },
    bord: 'Книжная полка',
    springen: 'К букве',
    anhoeren: (w) => `Слушать: ${w}`,
    beispiel: 'Слушать пример',
    oeffnen: (n) => `Открыть: ${n}`
  },
  nl: {
    suche: 'Woord zoeken – Nederlands of Duits …',
    nichts: (q) => `Niets gevonden voor „${q}”.`,
    treffer: (n) => eins(n, 'resultaat', 'resultaten'),
    trefferAlle: (n) => `${eins(n, 'resultaat', 'resultaten')} in alle boeken`,
    woerter: (n) => eins(n, 'woord', 'woorden'),
    sicher: (n) => `${n} gekend`,
    weitere: 'Meer woorden',
    bisJetzt: 'tot nu toe',
    freigegeben: 'delen tot nu toe',
    ganzerBand: 'heel boek',
    ohneBuch: 'lijsten zonder lesboek',
    mehr: 'Meer woorden tonen',
    leer: 'Hier staan straks al je woorden – zodra je docent ze deelt.',
    status: { neu: 'nieuw', aufbau: 'bezig', sicher: 'gekend' },
    bord: 'Boekenplank',
    springen: 'Naar letter',
    anhoeren: (w) => `Luister: ${w}`,
    beispiel: 'Luister naar het voorbeeld',
    oeffnen: (n) => `Open ${n}`
  },
  pl: {
    suche: 'Szukaj słowa – po polsku lub po niemiecku …',
    nichts: (q) => `Brak wyników dla „${q}”.`,
    treffer: (n) => `Wyniki: ${n}`,
    trefferAlle: (n) => `Wyniki we wszystkich książkach: ${n}`,
    woerter: (n) => `Słowa: ${n}`,
    sicher: (n) => `Opanowane: ${n}`,
    weitere: 'Inne słowa',
    bisJetzt: 'do teraz',
    freigegeben: 'dotychczasowe części',
    ganzerBand: 'cała książka',
    ohneBuch: 'listy bez podręcznika',
    mehr: 'Pokaż więcej słów',
    leer: 'Wkrótce znajdziesz tu wszystkie swoje słowa – gdy nauczyciel je udostępni.',
    status: { neu: 'nowe', aufbau: 'w nauce', sicher: 'opanowane' },
    bord: 'Półka z książkami',
    springen: 'Przejdź do litery',
    anhoeren: (w) => `Posłuchaj: ${w}`,
    beispiel: 'Posłuchaj przykładu',
    oeffnen: (n) => `Otwórz: ${n}`
  },
  cs: {
    suche: 'Hledat slovo – česky nebo německy …',
    nichts: (q) => `Nic nenalezeno pro „${q}“.`,
    treffer: (n) => `Výsledky: ${n}`,
    trefferAlle: (n) => `Výsledky ve všech knihách: ${n}`,
    woerter: (n) => `Slova: ${n}`,
    sicher: (n) => `Umím: ${n}`,
    weitere: 'Další slova',
    bisJetzt: 'zatím',
    freigegeben: 'dosavadní části',
    ganzerBand: 'celá kniha',
    ohneBuch: 'seznamy bez učebnice',
    mehr: 'Zobrazit další slova',
    leer: 'Brzy tu najdeš všechna svá slova – jakmile je učitel zpřístupní.',
    status: { neu: 'nové', aufbau: 'učím se', sicher: 'umím' },
    bord: 'Polička s knihami',
    springen: 'Přejít na písmeno',
    anhoeren: (w) => `Poslechnout: ${w}`,
    beispiel: 'Poslechnout příklad',
    oeffnen: (n) => `Otevřít: ${n}`
  },
  pt: {
    suche: 'Procurar uma palavra – em português ou alemão …',
    nichts: (q) => `Nada encontrado para «${q}».`,
    treffer: (n) => eins(n, 'resultado', 'resultados'),
    trefferAlle: (n) => `${eins(n, 'resultado', 'resultados')} em todos os livros`,
    woerter: (n) => eins(n, 'palavra', 'palavras'),
    sicher: (n) => `${n} dominadas`,
    weitere: 'Mais palavras',
    bisJetzt: 'até agora',
    freigegeben: 'partes até agora',
    ganzerBand: 'livro completo',
    ohneBuch: 'listas sem manual',
    mehr: 'Mostrar mais palavras',
    leer: 'Em breve vais encontrar aqui todas as tuas palavras – assim que o teu professor as partilhar.',
    status: { neu: 'nova', aufbau: 'a aprender', sicher: 'dominada' },
    bord: 'Estante',
    springen: 'Ir para a letra',
    anhoeren: (w) => `Ouvir «${w}»`,
    beispiel: 'Ouvir o exemplo',
    oeffnen: (n) => `Abrir ${n}`
  },
  tr: {
    suche: 'Kelime ara – Türkçe veya Almanca …',
    nichts: (q) => `„${q}“ için sonuç yok.`,
    treffer: (n) => `${n} sonuç`,
    trefferAlle: (n) => `Tüm kitaplarda ${n} sonuç`,
    woerter: (n) => `${n} kelime`,
    sicher: (n) => `${n} biliniyor`,
    weitere: 'Diğer kelimeler',
    bisJetzt: 'şimdiye kadar',
    freigegeben: 'şimdiye kadarki bölümler',
    ganzerBand: 'tüm kitap',
    ohneBuch: 'ders kitabı olmayan listeler',
    mehr: 'Daha fazla kelime göster',
    leer: 'Öğretmenin paylaşınca tüm kelimelerin burada olacak.',
    status: { neu: 'yeni', aufbau: 'öğreniliyor', sicher: 'biliniyor' },
    bord: 'Kitaplık',
    springen: 'Harfe git',
    anhoeren: (w) => `Dinle: ${w}`,
    beispiel: 'Örneği dinle',
    oeffnen: (n) => `Aç: ${n}`
  },
  da: {
    suche: 'Søg efter et ord – dansk eller tysk …',
    nichts: (q) => `Intet fundet for „${q}“.`,
    treffer: (n) => eins(n, 'resultat', 'resultater'),
    trefferAlle: (n) => `${eins(n, 'resultat', 'resultater')} i alle bøger`,
    woerter: (n) => `${n} ord`,
    sicher: (n) => `${n} kan`,
    weitere: 'Flere ord',
    bisJetzt: 'indtil nu',
    freigegeben: 'afsnit indtil nu',
    ganzerBand: 'hele bogen',
    ohneBuch: 'lister uden lærebog',
    mehr: 'Vis flere ord',
    leer: 'Snart finder du alle dine ord her – så snart din lærer deler dem.',
    status: { neu: 'nyt', aufbau: 'øver', sicher: 'kan' },
    bord: 'Bogreol',
    springen: 'Gå til bogstav',
    anhoeren: (w) => `Lyt: ${w}`,
    beispiel: 'Lyt til eksemplet',
    oeffnen: (n) => `Åbn ${n}`
  },
  grc: {
    suche: 'Λέξιν ζήτει – Ἑλληνιστὶ ἢ Γερμανιστί …',
    nichts: (q) => `Οὐδὲν εὑρέθη: «${q}».`,
    treffer: (n) => `Εὑρήματα: ${n}`,
    trefferAlle: (n) => `Ἐν πᾶσι τοῖς βιβλίοις: ${n}`,
    woerter: (n) => `Λέξεις: ${n}`,
    sicher: (n) => `Βέβαιαι: ${n}`,
    weitere: 'Ἄλλαι λέξεις',
    bisJetzt: 'μέχρι νῦν',
    freigegeben: 'μέρη μέχρι νῦν',
    ganzerBand: 'ὅλον τὸ βιβλίον',
    ohneBuch: 'κατάλογοι ἄνευ βιβλίου',
    mehr: 'Πλείους λέξεις δεῖξον',
    leer: 'Ἐνθάδε ἔσονται πᾶσαι αἱ λέξεις σου, ὅταν ὁ διδάσκαλος δῷ.',
    status: { neu: 'νέα', aufbau: 'μανθάνεται', sicher: 'βεβαία' },
    bord: 'Βιβλιοθήκη',
    springen: 'Πρὸς τὸ γράμμα',
    anhoeren: (w) => `Ἄκουε: ${w}`,
    beispiel: 'Ἄκουε τὸ παράδειγμα',
    oeffnen: (n) => `Ἄνοιξον: ${n}`
  },
  el: {
    suche: 'Αναζήτηση λέξης – στα ελληνικά ή στα γερμανικά …',
    nichts: (q) => `Δεν βρέθηκε τίποτα για «${q}».`,
    treffer: (n) => `Αποτελέσματα: ${n}`,
    trefferAlle: (n) => `Σε όλα τα βιβλία: ${n}`,
    woerter: (n) => `Λέξεις: ${n}`,
    sicher: (n) => `Τις ξέρεις: ${n}`,
    weitere: 'Άλλες λέξεις',
    bisJetzt: 'μέχρι τώρα',
    freigegeben: 'ενότητες μέχρι τώρα',
    ganzerBand: 'όλο το βιβλίο',
    ohneBuch: 'λίστες χωρίς βιβλίο',
    mehr: 'Περισσότερες λέξεις',
    leer: 'Σύντομα θα βρεις εδώ όλες τις λέξεις σου – μόλις τις μοιραστεί ο καθηγητής σου.',
    status: { neu: 'νέα', aufbau: 'μαθαίνω', sicher: 'την ξέρω' },
    bord: 'Βιβλιοθήκη',
    springen: 'Μετάβαση σε γράμμα',
    anhoeren: (w) => `Άκου: ${w}`,
    beispiel: 'Άκου το παράδειγμα',
    oeffnen: (n) => `Άνοιγμα: ${n}`
  },
  zh: {
    suche: '搜索词语 – 中文或德语 …',
    nichts: (q) => `没有找到“${q}”。`,
    treffer: (n) => `${n} 个结果`,
    trefferAlle: (n) => `所有书中共 ${n} 个结果`,
    woerter: (n) => `${n} 个词`,
    sicher: (n) => `已掌握 ${n} 个`,
    weitere: '其他词语',
    bisJetzt: '目前为止',
    freigegeben: '目前已学的部分',
    ganzerBand: '整本书',
    ohneBuch: '没有课本的词表',
    mehr: '显示更多词语',
    leer: '老师分享词语后，你的所有词语都会出现在这里。',
    status: { neu: '新词', aufbau: '学习中', sicher: '已掌握' },
    bord: '书架',
    springen: '跳到字母',
    anhoeren: (w) => `听：${w}`,
    beispiel: '听例句',
    oeffnen: (n) => `打开：${n}`
  },
  ja: {
    suche: '単語を検索 – 日本語またはドイツ語 …',
    nichts: (q) => `「${q}」は見つかりませんでした。`,
    treffer: (n) => `${n} 件`,
    trefferAlle: (n) => `すべての本で ${n} 件`,
    woerter: (n) => `${n} 語`,
    sicher: (n) => `習得 ${n} 語`,
    weitere: 'その他の単語',
    bisJetzt: 'これまで',
    freigegeben: 'これまでの課',
    ganzerBand: '本全体',
    ohneBuch: '教科書なしのリスト',
    mehr: 'もっと見る',
    leer: '先生が単語を共有すると、ここにすべての単語が表示されます。',
    status: { neu: '新しい', aufbau: '学習中', sicher: '習得' },
    bord: '本棚',
    springen: '文字へ移動',
    anhoeren: (w) => `聞く：${w}`,
    beispiel: '例文を聞く',
    oeffnen: (n) => `開く：${n}`
  },
  ar: {
    suche: 'ابحث عن كلمة – بالعربية أو بالألمانية …',
    nichts: (q) => `لا نتائج لـ «${q}».`,
    treffer: (n) => `النتائج: ${n}`,
    trefferAlle: (n) => `النتائج في كل الكتب: ${n}`,
    woerter: (n) => `الكلمات: ${n}`,
    sicher: (n) => `محفوظة: ${n}`,
    weitere: 'كلمات أخرى',
    bisJetzt: 'حتى الآن',
    freigegeben: 'الأجزاء حتى الآن',
    ganzerBand: 'الكتاب كاملًا',
    ohneBuch: 'قوائم بدون كتاب مدرسي',
    mehr: 'عرض المزيد من الكلمات',
    leer: 'ستجد هنا قريبًا كل كلماتك عندما يشاركها معلمك.',
    status: { neu: 'جديدة', aufbau: 'قيد التعلم', sicher: 'محفوظة' },
    bord: 'رف الكتب',
    springen: 'انتقل إلى الحرف',
    anhoeren: (w) => `استمع: ${w}`,
    beispiel: 'استمع إلى المثال',
    oeffnen: (n) => `افتح: ${n}`
  }
}

/** Texte für das Fach: Fremdsprachen in der Fremdsprache, sonst deutsch */
export function buecherTexte(fach: string): BuecherTexte {
  const s = beschriftung(fach).sprache
  return (s && SPRACHEN[s]) || DE
}

/** Für Tests: Texte je Sprache und die deutschen */
export const BUECHER_TEXTE: Readonly<Record<string, BuecherTexte>> = SPRACHEN
export const BUECHER_DEUTSCH: Readonly<BuecherTexte> = DE
