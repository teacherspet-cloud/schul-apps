/**
 * Regelkarten „x" ersetzen (29.10.2026, Befund der Lehrkraft: „Die Regel bei Relativsätzen zeigt aktuell ‚x x' an"):
 * Beim Probelauf vom 28.10.2026 wurden vier Bank-Einträge mit einer Platzhalter-Regelkarte („x") geleert; beim Ergänzen
 * übernahm die KI die vorhandene Karte vereinbarungsgemäß unverändert. Einmalig: diese Karten durch fachlich geschriebene
 * ersetzen – nur, wo die Karte noch „x" lautet (eine inzwischen von Hand geschriebene bleibt).
 */
import { istRegelPlatzhalter, type BankRegel } from '../shared/grammatikBank'

export const REGEL_PLATZHALTER_WARTUNG = 'grammatik-regel-platzhalter-2026-10-29'

export { istRegelPlatzhalter }

export const NEUE_REGELN: Record<string, BankRegel> = {
  'en.verb.present_perfect/dauer': {
    titel: 'Present perfect mit since und for',
    erklaerung:
      'Mit dem present perfect (have/has + 3. Form) beschreibst du etwas, das in der Vergangenheit begonnen hat und bis jetzt andauert. Mit since nennst du den Zeitpunkt, an dem es begonnen hat (since 2020, since Monday), mit for die Zeitspanne (for three years, for two weeks). Achtung: Im Deutschen steht hier „seit“ mit dem Präsens – im Englischen nicht.',
    beispiele: ['I have lived here since 2020.', 'She has known Tom for five years.', 'How long have you had your bike?']
  },
  'en.verb.will_vs_goingto/vorhersage-signal': {
    titel: 'Vorhersagen: will oder going to',
    erklaerung:
      'Mit will äußerst du eine Meinung oder Vermutung über die Zukunft – oft mit I think, I’m sure oder probably. Mit going to sagst du etwas voraus, wofür es jetzt schon ein sichtbares Anzeichen gibt (Look at the clouds!). Auch feste Pläne stehen mit going to.',
    beispiele: ['I think it will be sunny tomorrow.', 'Look at those clouds! It’s going to rain.', 'We have bought the tickets – we’re going to see the film.']
  },
  'en.clause.relative_nondef/kommas': {
    titel: 'Nicht-bestimmende Relativsätze: Kommas',
    erklaerung:
      'Ein nicht-bestimmender Relativsatz gibt eine Zusatzinformation zu einer Person oder Sache, die schon eindeutig ist (ein Name, my only sister). Er steht zwischen zwei Kommas – bzw. zwischen Komma und Satzende. Er beginnt mit who (Personen), which (Dinge) oder whose (Besitz); that ist hier nicht möglich.',
    beispiele: ['My aunt, who lives in York, is a chef.', 'Edinburgh, which has a famous castle, is in Scotland.', 'Mr Lee, whose garden has roses, is our neighbour.']
  },
  'en.verb.past_progressive/gleichzeitig': {
    titel: 'Past progressive: gleichzeitige Handlungen',
    erklaerung:
      'Mit dem past progressive (was/were + -ing) beschreibst du Handlungen, die in der Vergangenheit gerade im Gange waren. Laufen zwei Handlungen gleichzeitig ab, stehen oft beide im past progressive und werden mit while verbunden.',
    beispiele: ['While I was reading, my sister was cooking.', 'At eight o’clock we were watching a film.', 'The children were playing while their parents were talking.']
  }
}
