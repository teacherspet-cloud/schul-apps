/**
 * Abkürzungen in den Vokabeln von Green Line 1–6 und Green Line Transition (09.10.2026, geprüft aus
 * resources/lehrwerke/green-line-*.json). Je Eintrag des Buchs eine Zeile – Begründungen und strittige Fälle stehen in
 * recherche/abkuerzungen-green-line.md.
 *
 * Nicht hier: Platzhalter („sb", „sth", „jmdn.", „etw." …) und Kürzel in Erklärungen („z. B.", „usw.", „ugs.") – sie
 * gelten für die ganze Sprache (shared/sprechtext.ts, shared/abkuerzung.ts `platzhalterNormal`). Gebrauchsangaben in
 * eckigen Klammern („[AE]", „[BE]", „[infml]") gehören nicht zum Wort und werden weder gesprochen noch abgefragt.
 */
import type { AbkEintrag, AbkTabelle } from './typen'

const e = (x: Omit<AbkEintrag, 'sprache'>): AbkEintrag => ({ sprache: 'en', ...x })

export const GREEN_LINE: AbkTabelle = {
  id: 'green-line',
  name: 'Green Line (Klett, Niedersachsen, Bände 1–6 und Transition)',
  eintraege: [
    // ---------------------------------------------------------------- Initialwörter mit Langform (Paar-Übungen)
    e({ term: 'TV (= television)', quellen: ['GL1'], kurz: 'TV', lang: 'television', art: 'buchstabiert', ueben: 'beide', aussprache: 'T. V., television' }),
    e({ term: 'RE (= Religious Education)', quellen: ['GL2'], kurz: 'RE', lang: 'Religious Education', art: 'buchstabiert', ueben: 'beide', aussprache: 'R. E., Religious Education' }),
    e({ term: 'PE (= Physical Education)', quellen: ['GL2'], kurz: 'PE', lang: 'Physical Education', art: 'buchstabiert', ueben: 'beide', aussprache: 'P. E., Physical Education' }),
    e({ term: 'MS (multiple sclerosis)', quellen: ['GL2'], kurz: 'MS', lang: 'multiple sclerosis', art: 'buchstabiert', ueben: 'aufloesen', aussprache: 'M. S., multiple sclerosis' }),
    e({
      term: 'USA (United States of America)',
      quellen: ['GL2'],
      kurz: 'USA',
      lang: 'United States of America',
      art: 'buchstabiert',
      ueben: 'beide',
      auchRichtig: ['the USA', 'the United States of America'],
      aussprache: 'U. S. A., United States of America'
    }),
    e({
      term: 'the US (= the United States)',
      quellen: ['GL2'],
      kurz: 'the US',
      lang: 'the United States',
      art: 'buchstabiert',
      ueben: 'beide',
      auchRichtig: ['US', 'United States', 'the USA', 'USA'],
      aussprache: 'the U. S., the United States',
      hinweis: 'Artikel gehört zur Wendung; ohne „the" zählt es auch.'
    }),
    e({ term: 'best friends forever (BFF)', quellen: ['GL3'], kurz: 'BFF', lang: 'best friends forever', art: 'buchstabiert', ueben: 'beide', auchRichtig: ['best friend forever'], aussprache: 'best friends forever, B. F. F.' }),
    e({ term: 'B&B (= bed and breakfast)', quellen: ['GL3'], kurz: 'B&B', lang: 'bed and breakfast', art: 'buchstabiert', ueben: 'beide', auchRichtig: ['B and B', 'B & B'], aussprache: 'B and B, bed and breakfast' }),
    e({
      term: 'LOL (= laughing out loud)',
      quellen: ['GL3'],
      kurz: 'LOL',
      lang: 'laughing out loud',
      art: 'buchstabiert',
      ueben: 'beide',
      auchRichtig: ['laugh out loud', 'lol'],
      aussprache: 'L. O. L., laughing out loud',
      hinweis: 'Gesprochen buchstabiert (auch „lol" als Wort ist verbreitet) – buchstabiert ist eindeutiger.'
    }),
    e({ term: 'AD (= anno Domini)', quellen: ['GL3'], kurz: 'AD', lang: 'anno Domini', art: 'buchstabiert', ueben: 'aufloesen', auchRichtig: ['A.D.'], aussprache: 'A. D., anno Domini' }),
    e({ term: 'CE (= Common Era)', quellen: ['GL5'], kurz: 'CE', lang: 'Common Era', art: 'buchstabiert', ueben: 'beide', auchRichtig: ['C.E.'], aussprache: 'C. E., Common Era' }),
    e({ term: 'ATM (automated teller machine)', quellen: ['GL4'], kurz: 'ATM', lang: 'automated teller machine', art: 'buchstabiert', ueben: 'beide', aussprache: 'A. T. M., automated teller machine' }),
    e({
      term: 'PA system (public address system)',
      quellen: ['GL4'],
      kurz: 'PA system',
      lang: 'public address system',
      art: 'buchstabiert',
      ueben: 'beide',
      auchRichtig: ['PA'],
      aussprache: 'P. A. system, public address system'
    }),
    e({
      term: 'artificial intelligence (AI)',
      quellen: ['GL4'],
      kurz: 'AI',
      lang: 'artificial intelligence',
      art: 'buchstabiert',
      ueben: 'beide',
      aussprache: 'artificial intelligence, A. I.'
    }),
    e({ term: 'AI (= artificial intelligence)', quellen: ['GLtransition'], kurz: 'AI', lang: 'artificial intelligence', art: 'buchstabiert', ueben: 'beide', aussprache: 'A. I., artificial intelligence' }),
    e({ term: 'unique selling point (USP)', quellen: ['GL5'], kurz: 'USP', lang: 'unique selling point', art: 'buchstabiert', ueben: 'beide', auchRichtig: ['unique selling proposition'], aussprache: 'unique selling point, U. S. P.' }),
    e({ term: 'UGC (user-generated content)', quellen: ['GL5'], kurz: 'UGC', lang: 'user-generated content', art: 'buchstabiert', ueben: 'beide', auchRichtig: ['user generated content'], aussprache: 'U. G. C., user-generated content' }),
    e({ term: 'CV (= Curriculum Vitae)', quellen: ['GL5'], kurz: 'CV', lang: 'curriculum vitae', art: 'buchstabiert', ueben: 'beide', aussprache: 'C. V., curriculum vitae' }),
    e({ term: 'CV (= curriculum vitae) [BE]', quellen: ['GLtransition'], kurz: 'CV', lang: 'curriculum vitae', art: 'buchstabiert', ueben: 'beide', aussprache: 'C. V., curriculum vitae' }),
    e({
      term: 'GCSE (= General Certificate of Secondary Education)',
      quellen: ['GL5'],
      kurz: 'GCSE',
      lang: 'General Certificate of Secondary Education',
      art: 'buchstabiert',
      ueben: 'aufloesen',
      aussprache: 'G. C. S. E., General Certificate of Secondary Education',
      hinweis: 'Langform ist lang und landeskundlich – nur „auflösen" (Abkürzung → Langform), nicht umgekehrt.'
    }),
    e({
      term: 'YA (= young adults)',
      quellen: ['GL5'],
      kurz: 'YA',
      lang: 'young adults',
      art: 'buchstabiert',
      ueben: 'beide',
      auchRichtig: ['young adult'],
      aussprache: 'Y. A., young adults',
      hinweis: 'Deutsch „Jugend-" (YA fiction = Jugendliteratur); buchstabiert „Y. A.", nicht als Wort „ya".'
    }),
    e({ term: 'AKA (= also known as)', quellen: ['GLtransition'], kurz: 'AKA', lang: 'also known as', art: 'buchstabiert', ueben: 'beide', auchRichtig: ['a.k.a.', 'aka'], aussprache: 'A. K. A., also known as' }),
    e({ term: 'extra large (XL)', quellen: ['GL1'], kurz: 'XL', lang: 'extra large', art: 'buchstabiert', ueben: 'beide', aussprache: 'extra large, X. L.' }),

    // ---------------------------------------------------------------- Akronyme als Wort, Kurzwörter
    e({ term: 'FOMO (= fear of missing out) [infml]', quellen: ['GLtransition'], kurz: 'FOMO', lang: 'fear of missing out', art: 'akronym', ueben: 'beide', aussprache: 'Fomo, fear of missing out' }),
    e({ term: 'JOMO (= joy of missing out) [infml]', quellen: ['GLtransition'], kurz: 'JOMO', lang: 'joy of missing out', art: 'akronym', ueben: 'beide', aussprache: 'Jomo, joy of missing out' }),
    e({
      term: 'EPIC',
      quellen: ['GL3'],
      kurz: 'EPIC',
      art: 'akronym',
      ueben: 'keine',
      aussprache: 'Epic',
      hinweis: 'Eigenname (EPIC The Irish Emigration Museum, Dublin) – als Wort gesprochen, keine Langform im Buch.'
    }),
    e({ term: 'Gen Z (= Generation Z) [infml]', quellen: ['GLtransition'], kurz: 'Gen Z', lang: 'Generation Z', art: 'kurzwort', ueben: 'beide', aussprache: 'Gen Z, Generation Z' }),
    e({ term: 'pic (= picture)', quellen: ['GL3'], kurz: 'pic', lang: 'picture', art: 'kurzwort', ueben: 'beide', aussprache: 'pic, picture' }),
    e({ term: 'pro (= professional)', quellen: ['GL4'], kurz: 'pro', lang: 'professional', art: 'kurzwort', ueben: 'beide', aussprache: 'pro, professional' }),
    e({ term: 'admin (= administrator)', quellen: ['GLtransition'], kurz: 'admin', lang: 'administrator', art: 'kurzwort', ueben: 'beide', aussprache: 'admin, administrator' }),

    // ---------------------------------------------------------------- Abkürzungen ohne Langform im Buch
    e({ term: 'TV', quellen: ['GL1'], kurz: 'TV', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['television', 'TV set'], aussprache: 'T. V.' }),
    e({ term: 'watch TV series', quellen: ['GL1'], kurz: 'TV', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['watch television series'], aussprache: 'watch T. V. series' }),
    e({ term: 'VR goggles [pl]', quellen: ['GL1'], kurz: 'VR', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['virtual reality goggles'], aussprache: 'V. R. goggles' }),
    e({ term: 'PC', quellen: ['GL2'], kurz: 'PC', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['personal computer'], aussprache: 'P. C.' }),
    e({ term: 'FAQ', quellen: ['GL2'], kurz: 'FAQ', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['FAQs', 'frequently asked questions'], aussprache: 'F. A. Q.', hinweis: 'Buchstabiert (seltener „fak" als Wort).' }),
    e({ term: 'US', quellen: ['GL4'], kurz: 'US', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['American'], aussprache: 'U. S.', hinweis: 'Adjektiv „US-amerikanisch" – nicht „us" (wir).' }),
    e({ term: 'caller ID', quellen: ['GL4'], kurz: 'ID', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['caller identification'], aussprache: 'caller I. D.' }),
    e({ term: 'generative AI', quellen: ['GL5'], kurz: 'AI', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['generative artificial intelligence'], aussprache: 'generative A. I.' }),
    e({ term: 'LGBTQ', quellen: ['GL5'], kurz: 'LGBTQ', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['LGBTQ+', 'LGBTQIA+'], aussprache: 'L. G. B. T. Q.' }),
    e({ term: 'DNA', quellen: ['GLtransition'], kurz: 'DNA', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['deoxyribonucleic acid'], aussprache: 'D. N. A.' }),
    e({ term: 'strand of DNA', quellen: ['GLtransition'], kurz: 'DNA', art: 'buchstabiert', ueben: 'keine', aussprache: 'strand of D. N. A.' }),
    e({
      term: 'p.m.',
      quellen: ['GL1'],
      kurz: 'p.m.',
      art: 'punkt',
      ueben: 'keine',
      auchRichtig: ['pm', 'PM', 'P.M.'],
      aussprache: 'P. M.',
      hinweis: 'Langform „post meridiem" steht nicht im Buch – gelernt wird nur „nachmittags, abends".'
    }),

    // ---------------------------------------------------------------- Anreden
    e({ term: 'Mr', quellen: ['GL1'], kurz: 'Mr', art: 'anrede', ueben: 'keine', auchRichtig: ['Mr.', 'Mister'], aussprache: 'Mister', hinweis: 'BE ohne Punkt, AE „Mr." – beides richtig.' }),
    e({ term: 'Mrs', quellen: ['GL1'], kurz: 'Mrs', art: 'anrede', ueben: 'keine', auchRichtig: ['Mrs.'], aussprache: 'Missus' }),
    e({ term: 'Ms', quellen: ['GL5'], kurz: 'Ms', art: 'anrede', ueben: 'keine', auchRichtig: ['Ms.'], aussprache: 'Miz', hinweis: 'Gesprochen „Miz" (neutral, ohne Familienstand).' }),

    // ---------------------------------------------------------------- Maßeinheiten und Symbole
    e({ term: 'metre (m)', quellen: ['GL2'], kurz: 'm', lang: 'metre', art: 'einheit', ueben: 'beide', auchRichtig: ['meter'], aussprache: 'metre' }),
    e({ term: 'centimetre (cm)', quellen: ['GL2'], kurz: 'cm', lang: 'centimetre', art: 'einheit', ueben: 'beide', auchRichtig: ['centimeter'], aussprache: 'centimetre' }),
    e({ term: 'millilitre (ml)', quellen: ['GL1'], kurz: 'ml', lang: 'millilitre', art: 'einheit', ueben: 'beide', auchRichtig: ['milliliter'], aussprache: 'millilitre' }),
    e({
      term: 'degree Celsius (°C)',
      quellen: ['GL3', 'GL4'],
      kurz: '°C',
      lang: 'degree Celsius',
      art: 'einheit',
      ueben: 'aufloesen',
      auchRichtig: ['degrees Celsius', 'C'],
      aussprache: 'degree Celsius',
      hinweis: 'Das Zeichen „°" ist auf Tablets schwer zu tippen – nur „auflösen" (°C → degree Celsius).'
    }),
    e({
      term: 'degree Fahrenheit (°F)',
      quellen: ['GL4'],
      kurz: '°F',
      lang: 'degree Fahrenheit',
      art: 'einheit',
      ueben: 'aufloesen',
      auchRichtig: ['degrees Fahrenheit', 'F'],
      aussprache: 'degree Fahrenheit'
    })
  ]
}
