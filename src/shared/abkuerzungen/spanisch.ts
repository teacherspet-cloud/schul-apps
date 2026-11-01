/**
 * Abkürzungen in den Spanisch-Vokabeln von ¡Apúntate! 1–3 (Cornelsen, Ausgabe 2024) und A tope (Cornelsen, Ausgabe
 * 2026) – geprüft am 01.11.2026 aus resources/lehrwerke/apuntate-2024-*.json und a-tope-2026.json. Begründungen und
 * strittige Fälle: recherche/aussprache-spanisch.md.
 *
 * Gesprochen wird wie im Spanischen üblich: Initialwörter mit spanischen Buchstabennamen („GPS" → „ge pe ese",
 * „QR" → „cu erre"), Akronyme als Wort („ESO"), verdoppelte Buchstaben als Langform („EE. UU." → „Estados Unidos"),
 * Einheiten und Zeichen ausgeschrieben („km" → „kilómetro", „%" → „por ciento").
 */
import type { AbkEintrag, AbkTabelle } from './typen'

const e = (x: Omit<AbkEintrag, 'sprache'>): AbkEintrag => ({ sprache: 'es', ...x })

const EEUU = [
  'EE. UU.',
  'EE.UU.',
  'EEUU',
  'los EE. UU.',
  'los EE.UU.',
  'Estados Unidos',
  'los Estados Unidos',
  'los Estados Unidos de América',
  'Estados Unidos de América'
]

export const SPANISCH: AbkTabelle = {
  id: 'spanisch-cornelsen',
  name: '¡Apúntate! 1–3 und A tope (Cornelsen, Spanisch)',
  eintraege: [
    e({
      term: 'los Estados Unidos (de América), los EE.UU.',
      quellen: ['¡Apúntate! 3'],
      kurz: 'los EE.UU.',
      lang: 'los Estados Unidos',
      art: 'punkt',
      ueben: 'aufloesen',
      auchRichtig: EEUU,
      aussprache: 'los Estados Unidos de América, los Estados Unidos',
      hinweis: 'Verdoppelte Buchstaben stehen für die Mehrzahl und werden nie buchstabiert, sondern als „Estados Unidos" gesprochen.'
    }),
    e({
      term: '(los) Estados Unidos (EE. UU.)',
      quellen: ['A tope'],
      kurz: 'EE. UU.',
      lang: 'Estados Unidos',
      art: 'punkt',
      ueben: 'aufloesen',
      auchRichtig: EEUU,
      aussprache: 'los Estados Unidos'
    }),
    e({
      term: 'la inteligencia artificial (IA)',
      quellen: ['A tope'],
      kurz: 'IA',
      lang: 'la inteligencia artificial',
      art: 'buchstabiert',
      ueben: 'beide',
      auchRichtig: ['la IA', 'inteligencia artificial'],
      aussprache: 'la inteligencia artificial, la i a'
    }),
    e({ term: 'el GPS', quellen: ['¡Apúntate! 2'], kurz: 'GPS', art: 'buchstabiert', ueben: 'keine', auchRichtig: ['GPS'], aussprache: 'el ge pe ese' }),
    e({
      term: 'el (código) QR',
      quellen: ['A tope'],
      kurz: 'QR',
      art: 'buchstabiert',
      ueben: 'keine',
      auchRichtig: ['el código QR', 'el QR', 'código QR', 'QR'],
      aussprache: 'el código cu erre',
      hinweis: '„código" steht in Klammern – gesprochen wird die volle Form.'
    }),
    e({
      term: '2° de ESO',
      quellen: ['¡Apúntate! 1'],
      kurz: 'ESO',
      art: 'akronym',
      ueben: 'keine',
      auchRichtig: ['2.º de ESO', '2º de ESO', 'segundo de ESO'],
      aussprache: 'segundo de Eso',
      hinweis: 'ESO (Educación Secundaria Obligatoria) wird als Wort gesprochen; die Langform steht nicht im Buch.'
    }),
    e({
      term: '2.º de ESO',
      quellen: ['¡Apúntate! 1'],
      kurz: 'ESO',
      art: 'akronym',
      ueben: 'keine',
      auchRichtig: ['2° de ESO', '2º de ESO', 'segundo de ESO'],
      aussprache: 'segundo de Eso'
    }),
    e({
      term: 'el kilómetro (km)',
      quellen: ['¡Apúntate! 2', 'A tope'],
      kurz: 'km',
      lang: 'el kilómetro',
      art: 'einheit',
      ueben: 'beide',
      auchRichtig: ['kilómetro'],
      aussprache: 'el kilómetro'
    }),
    e({
      term: 'el kilómetro cuadrado (km²)',
      quellen: ['¡Apúntate! 2'],
      kurz: 'km²',
      lang: 'el kilómetro cuadrado',
      art: 'einheit',
      ueben: 'aufloesen',
      auchRichtig: ['kilómetro cuadrado', 'km2'],
      aussprache: 'el kilómetro cuadrado',
      hinweis: '„²" ist auf Tablets schwer zu tippen – nur auflösen.'
    }),
    e({
      term: 'el por ciento (%)',
      quellen: ['¡Apúntate! 3'],
      kurz: '%',
      lang: 'el por ciento',
      art: 'einheit',
      ueben: 'aufloesen',
      auchRichtig: ['por ciento'],
      aussprache: 'el por ciento'
    }),
    e({
      term: 'antes de Cristo [a. C.]',
      quellen: ['A tope'],
      kurz: 'a. C.',
      lang: 'antes de Cristo',
      art: 'punkt',
      ueben: 'beide',
      auchRichtig: ['a.C.', 'a. de C.'],
      aussprache: 'antes de Cristo'
    }),
    e({
      term: 'después de Cristo [d. C.]',
      quellen: ['A tope'],
      kurz: 'd. C.',
      lang: 'después de Cristo',
      art: 'punkt',
      ueben: 'beide',
      auchRichtig: ['d.C.', 'd. de C.'],
      aussprache: 'después de Cristo'
    })
  ]
}
