/**
 * Zeitform-Sperre für die übrigen Fremdsprachen (09.10.2026, Wunsch der Lehrkraft: „für ALLE Fremdsprachen, nicht nur
 * Englisch"). Je Sprache die sperrbaren Zeitformen und Formen mit ihren Katalogkennungen (Grammatikkatalog,
 * grammarTopics*.ts), dem Namen in deutschen Anweisungen und einer deterministischen Faustregel für Sätze und Lösungen.
 * Was immer erlaubt ist (Präsens, Imperativ, nahe Zukunft …), steht in `BASIS`.
 *
 * Die Faustregeln suchen nur eindeutige Muster (Hilfsverb + Partizip, typische Endungen nach einem Personalpronomen,
 * Listen häufiger unregelmäßiger Formen) und nehmen lieber einen Treffer zu wenig als einen zu viel: Nomen wie
 * „panadería", „padaria" oder „bravo" sind ausgenommen. Was sich so nicht fassen lässt (Aspekt im Russischen, AcI und
 * Partizipien im Lateinischen), regelt allein der Auftrag an die KI.
 *
 * Latein: zusätzlich der Stand im Lehrwerk (Pontes, Campus, prima …; lehrwerkeLatein.ts) über die Grammatik-Stichwörter
 * der Lektionen (`bekanntLatein`).
 */
import type { SperrbareZeitform } from './zeitformSperre'
import { LEHRWERK_THEMEN, kapitelFolge } from '../renderer/src/shared/lehrwerkThemen'

/** Wortgrenzen auch für Buchstaben mit Akzent (JS-\b kennt nur ASCII) */
const wort = (muster: string): RegExp => new RegExp(`(?<!\\p{L})(?:${muster})(?!\\p{L})`, 'u')
const alleWoerter = (muster: string): RegExp => new RegExp(`(?<!\\p{L})(?:${muster})(?!\\p{L})`, 'gu')
/** Treffer, deren erste Gruppe (das Wort) nicht in der Ausnahmeliste steht */
const ohne = (muster: string, ausnahmen: string[]): ((t: string) => boolean) => {
  const aus = new Set(ausnahmen)
  return (t) => [...t.matchAll(alleWoerter(muster))].some((m) => !aus.has(m[1] ?? m[0]))
}
const Z = (
  sprache: string,
  id: string,
  name: string,
  themen: string[],
  titel: RegExp,
  erkenne: (t: string) => boolean,
  lesart?: RegExp
): SperrbareZeitform => ({ sprache, id, name, themen, titel, erkenne: (t) => erkenne(t), ...(lesart ? { lesart } : {}) })

/** Immer erlaubt je Sprache */
export const BASIS: Record<string, string[]> = {
  fr: ['présent', 'impératif', 'futur proche (aller + Infinitiv)', 'je voudrais / tu pourrais als feste Wendung'],
  es: ['presente', 'imperativo afirmativo', 'ir a + infinitivo', 'estar + gerundio', 'me gustaría als feste Wendung'],
  it: ['presente', 'imperativo', 'stare + gerundio', 'vorrei als feste Wendung'],
  la: ['Präsens Aktiv (Indikativ)', 'Imperativ', 'Infinitiv Präsens'],
  ru: ['Präsens', 'Imperativ der Grundverben'],
  nl: ['presens', 'imperatief', 'gaan + infinitief'],
  pt: ['presente', 'ir + infinitivo', 'estar a + infinitivo']
}

// ---------------------------------------------------------------- Französisch

const FR_L = 'a-zàâçéèêëîïôûùüÿœ'
const FR_PP_AVOIR = `[${FR_L}]{2,}(?:é|ée|és|ées)|[${FR_L}]{2,}(?:i|is|it|u|us|ue|ues)|fait|faits|dit|pris|mis|écrit|ouvert|offert|eu|vu|lu|bu|pu|dû|su|été`
const FR_PP_ETRE =
  '(?:allé|venu|parti|arrivé|entré|sorti|monté|descendu|né|mort|resté|tombé|rentré|retourné|devenu|revenu|passé|levé|couché|réveillé|habillé|lavé|promené|amusé)(?:e|s|es)?'
const FR_ADV = '(?:(?:pas|jamais|plus|rien|déjà|bien|beaucoup|toujours|souvent|trop|encore)\\s+)?'
const FR_PRON = "(?:je|j'|tu|il|elle|on|ils|elles)"
/** Präsensformen auf -ais/-ait (keine Imparfait-Formen) */
const FR_PRAESENS_AIS = ['fais', 'fait', 'vais', 'sais', 'sait', 'connais', 'connait', 'connaît', 'plais', 'plait', 'plaît', 'tais', 'tait', 'nais', 'naît', 'parais', 'parait', 'paraît', 'mais']
const FR_KOND = `[${FR_L}]*(?:e|i|d|rr|v|au)r(?:ais|ait|ions|iez|aient)`
const FR_HOEFLICH = ['voudrais', 'voudrait', 'pourrais', 'pourrait', 'aimerais', 'aimerait']

const FRANZOESISCH: SperrbareZeitform[] = [
  Z(
    'fr',
    'plus_que_parfait',
    'plus-que-parfait (avais/étais + participe)',
    ['fr.verb.plus_que_parfait'],
    /plus-que-parfait|plusquamperfekt|vorvergangenheit/i,
    (t) =>
      wort(`(?:avais|avait|avions|aviez|avaient)\\s+${FR_ADV}(?:${FR_PP_AVOIR})`).test(t) ||
      wort(`(?:étais|était|étions|étiez|étaient)\\s+${FR_ADV}${FR_PP_ETRE}`).test(t)
  ),
  Z(
    'fr',
    'passe_compose',
    'passé composé (avoir/être + participe)',
    ['fr.verb.passe_compose', 'fr.verb.imp_vs_pc', 'fr.verb.accord_pp_etre', 'fr.verb.accord_pp_avoir'],
    /passé composé|\bperfekt\b/i,
    (t) =>
      wort(`(?:ai|as|a|avons|avez|ont)\\s+${FR_ADV}(?:${FR_PP_AVOIR})`).test(t) ||
      wort(`(?:suis|es|est|sommes|êtes|sont)\\s+${FR_ADV}${FR_PP_ETRE}`).test(t) ||
      wort(`(?:s'est|se sont|me suis|t'es)\\s+${FR_ADV}(?:${FR_PP_AVOIR})`).test(t)
  ),
  Z(
    'fr',
    'passif',
    'passif (être + participe + par)',
    ['fr.verb.passif', 'fr.verb.passif_ersatz'],
    /passif|passiv/i,
    (t) => wort(`(?:est|sont|était|étaient|sera|seront|a été|ont été|fut)\\s+[${FR_L}]+(?:é|ée|és|ées|i|ie|is|u|ue|us|it|ite|ert|erte)\\s+par`).test(t)
  ),
  Z(
    'fr',
    'conditionnel',
    'conditionnel (je parlerais …; außer je voudrais / tu pourrais)',
    ['fr.verb.conditionnel', 'fr.verb.conditionnel_passe'],
    /conditionnel|konditional/i,
    (t) =>
      ohne(`(?:${FR_PRON}|nous|vous)\\s*(${FR_KOND})`, FR_HOEFLICH)(t) ||
      wort('serais|serait|serions|seriez|seraient|aurais|aurait|aurions|auriez|auraient|ferais|ferait|faudrait|devrais|devrait').test(t)
  ),
  Z(
    'fr',
    'futur_simple',
    'futur simple (je parlerai …)',
    ['fr.verb.futur_simple', 'fr.verb.futur_anterieur'],
    /futur simple|einfaches futur|\bfutur i\b/i,
    (t) =>
      wort(`${FR_PRON}\\s*[${FR_L}]{2,}(?:rai|ras|ra|ront)`).test(t) ||
      wort(`(?:nous|vous)\\s+[${FR_L}]+(?:erons|erez|irons|irez|rrons|rrez|urons|urez)`).test(t) ||
      wort(
        'serai|seras|sera|serons|serez|seront|aurai|auras|aura|aurons|aurez|auront|ferai|feras|fera|ferons|ferez|feront|irai|iras|ira|irons|iront|pourrai|pourra|viendrai|viendra|verrai|verra|devrai|devra|saurai|saura|faudra|pleuvra'
      ).test(t)
  ),
  Z(
    'fr',
    'subjonctif',
    'subjonctif (que je sois, qu’il fasse …)',
    ['fr.verb.subjonctif_form', 'fr.verb.subjonctif_chunks', 'fr.verb.subj_vs_ind', 'fr.verb.subj_passe', 'fr.syn.sub_adverbiaux'],
    /subjonctif/i,
    (t) =>
      wort(
        "qu(?:e\\s+|')(?:je\\s+|j'|tu\\s+|il\\s+|elle\\s+|on\\s+|nous\\s+|vous\\s+|ils\\s+|elles\\s+)(?:ne\\s+|n')?(?:sois|soit|soyons|soyez|soient|aie|aies|ait|ayons|ayez|aient|fasse|fasses|fassions|fassiez|fassent|aille|ailles|aillent|puisse|puisses|puissions|puissiez|puissent|sache|saches|sachent|veuille|veuillent|vienne|viennes|viennent|prenne|prennes|prennent)"
      ).test(t)
  ),
  Z(
    'fr',
    'imparfait',
    'imparfait (j’étais, il parlait …)',
    ['fr.verb.imparfait', 'fr.verb.imp_vs_pc'],
    /imparfait|imperfekt/i,
    (t) =>
      wort('étais|était|étions|étiez|étaient|avais|avait|avions|aviez|avaient|faisais|faisait|allais|allait|pouvais|pouvait|voulais|voulait').test(t) ||
      [...t.matchAll(alleWoerter(`${FR_PRON}\\s*([${FR_L}]{2,}(?:ais|ait|aient))`))].some(
        (m) => !FR_PRAESENS_AIS.includes(m[1]) && !new RegExp(`^${FR_KOND}$`, 'u').test(m[1])
      )
  ),
  Z(
    'fr',
    'passe_simple',
    'passé simple',
    ['fr.verb.passe_simple', 'fr.verb.passe_anterieur'],
    /passé simple|historisches perfekt/i,
    (t) => wort(`[${FR_L}]{2,}(?:èrent|âmes|âtes)|furent|firent|eurent|vinrent|prirent|fut`).test(t)
  )
]

// ---------------------------------------------------------------- Spanisch

const ES_L = 'a-záéíóúñü'
const ES_PART = `[${ES_L}]{2,}(?:ado|ada|ados|adas|ido|ida|idos|idas)|hecho|dicho|visto|escrito|puesto|vuelto|abierto|roto|muerto|descubierto`
const ES_PRON = '(?:yo|tú|él|ella|usted|nosotros|nosotras|vosotros|vosotras|ellos|ellas|ustedes|me|te|se|le|nos|os|les)'
const ES_FUT_STAEMME = '(?:tendr|har|dir|podr|saldr|vendr|pondr|sabr|querr|habr|ser|ir|valdr|cabr)'

const SPANISCH: SperrbareZeitform[] = [
  Z(
    'es',
    'pluscuamperfecto',
    'pluscuamperfecto (había + participio)',
    ['es.verb.pluscuamperfecto'],
    /pluscuamperfecto|plusquamperfekt/i,
    (t) => wort(`(?:había|habías|habíamos|habíais|habían)\\s+(?:(?:ya|nunca|todavía|no)\\s+)?(?:${ES_PART})`).test(t)
  ),
  Z(
    'es',
    'perfecto',
    'pretérito perfecto (he/has … + participio)',
    ['es.verb.perfecto', 'es.verb.perf_vs_indef'],
    /pretérito perfecto|\bperfecto\b|\bperfekt\b/i,
    (t) => wort(`(?:he|has|ha|hemos|habéis|han)\\s+(?:(?:ya|nunca|todavía|no)\\s+)?(?:${ES_PART})`).test(t)
  ),
  Z(
    'es',
    'pasiva',
    'pasiva (ser + participio + por)',
    ['es.verb.pasiva'],
    /pasiva|passiv/i,
    (t) => wort(`(?:es|son|fue|fueron|será|serán|ha sido|han sido|era|eran)\\s+[${ES_L}]+(?:ado|ada|ados|adas|ido|ida|idos|idas)\\s+por`).test(t)
  ),
  Z(
    'es',
    'condicional',
    'condicional (hablaría …; außer me gustaría)',
    ['es.verb.condicional', 'es.verb.condicional_comp', 'es.verb.futuro_probabilidad'],
    /condicional|konditional/i,
    (t) =>
      ohne(`([${ES_L}]{2,}(?:aría|arías|aríamos|aríais|arían|iría|irías|iríamos|iríais|irían)|${ES_FUT_STAEMME}(?:ía|ías|íamos|íais|ían))`, [
        'gustaría',
        'encantaría',
        'maría',
        'sería'
      ])(t) ||
      wort(`${ES_PRON}\\s+(?:no\\s+)?[${ES_L}]{2,}(?:ería|erías|eríamos|eríais|erían)`).test(t) ||
      wort(`${ES_PRON}\\s+(?:no\\s+)?sería`).test(t)
  ),
  Z(
    'es',
    'futuro_simple',
    'futuro simple (hablaré …)',
    ['es.verb.futuro_simple', 'es.verb.futuro_compuesto', 'es.verb.futuro_probabilidad'],
    /futuro simple|\bfutur i\b|einfaches futur/i,
    (t) =>
      wort(
        `[${ES_L}]{2,}(?:aré|arás|ará|aremos|aréis|arán|eré|erás|erá|eremos|eréis|erán|iré|irás|irá|iremos|iréis|irán)|${ES_FUT_STAEMME}(?:é|ás|á|emos|éis|án)`
      ).test(t)
  ),
  Z(
    'es',
    'subjuntivo',
    'subjuntivo (que sea, ojalá tenga …)',
    [
      'es.verb.subj_pres',
      'es.verb.subj_ausloeser',
      'es.verb.subj_vs_ind',
      'es.verb.subj_perf',
      'es.verb.subj_imperf',
      'es.verb.subj_plusc',
      'es.verb.subj_temporal',
      'es.verb.subj_relativo',
      'es.verb.subj_konjunktionen'
    ],
    /subjuntivo/i,
    (t) =>
      wort(
        '(?:que|ojalá|cuando|aunque)\\s+(?:no\\s+)?(?:yo\\s+|tú\\s+|él\\s+|ella\\s+)?(?:sea|seas|seamos|sean|esté|estés|estemos|estén|tenga|tengas|tengamos|tengan|haga|hagas|hagamos|hagan|vaya|vayas|vayamos|vayan|pueda|puedas|podamos|puedan|venga|vengas|vengan|diga|digas|digan|haya|hayas|hayamos|hayan|quiera|quieras|quieran|sepa|sepas|sepan|salga|salgas|salgan|ponga|pongan)'
      ).test(t) ||
      ohne(`(?:si|que|ojalá)\\s+(?:no\\s+)?([${ES_L}]{2,}(?:ara|aras|áramos|aran|iera|ieras|iéramos|ieran))`, ['para', 'cara', 'clara', 'vara'])(t)
  ),
  Z(
    'es',
    'imperfecto',
    'pretérito imperfecto (hablaba, tenía, era …)',
    ['es.verb.imperfecto', 'es.verb.imp_vs_indef'],
    /imperfecto|imperfekt/i,
    (t) =>
      wort(
        `[${ES_L}]{2,}(?:aba|abas|ábamos|abais|aban)|[${ES_L}]{2,}(?:íamos|íais|ían)|era|eras|éramos|erais|eran|iba|ibas|íbamos|iban|había|habías|tenía|tenías|tenían|hacía|quería|podía|sabía|vivía|comía|decía|salía|veía|ponía|venía|estaba`
      ).test(t)
  ),
  Z(
    'es',
    'indefinido',
    'pretérito indefinido (hablé, comió, fue …)',
    ['es.verb.indefinido_reg', 'es.verb.indefinido_irr', 'es.verb.imp_vs_indef', 'es.verb.perf_vs_indef'],
    /indefinido|einfache vergangenheit/i,
    (t) =>
      ohne(`([${ES_L}]{2,}(?:aste|asteis|aron|iste|isteis|ieron|ió))`, ['contraste', 'desgaste', 'baste'])(t) ||
      ohne(`([${ES_L}]{3,}[éó])`, ['café', 'bebé', 'porqué', 'puré', 'chalé', 'josé', 'comité', 'carné', 'canapé', 'cliché', 'dominó'])(t) ||
      wort(
        'fui|fuiste|fue|fuimos|fuisteis|fueron|tuve|tuviste|tuvo|tuvimos|tuvieron|hice|hiciste|hizo|hicimos|hicieron|estuve|estuvo|estuvimos|estuvieron|dije|dijo|dijeron|pude|pudo|pudieron|puse|puso|pusieron|quise|quiso|quisieron|vine|vinieron|supe|supo'
      ).test(t)
  )
]

// ---------------------------------------------------------------- Italienisch

const IT_L = 'a-zàèéìíòóù'
const IT_PART = `[${IT_L}]{2,}(?:ato|ata|ati|ate|uto|uta|uti|ute|ito|ita|iti|ite)|fatto|fatta|detto|preso|presa|messo|scritto|visto|vista|letto|stato|stata|stati|state|morto|nato|nata|aperto|chiuso|corso|vinto|perso|rimasto|rimasta`

const ITALIENISCH: SperrbareZeitform[] = [
  Z(
    'it',
    'trapassato',
    'trapassato prossimo (avevo/ero + participio)',
    ['it.verb.trapassato_prossimo'],
    /trapassato|plusquamperfekt/i,
    (t) => wort(`(?:avevo|avevi|aveva|avevamo|avevate|avevano|ero|eri|era|eravamo|eravate|erano)\\s+(?:(?:già|mai|non)\\s+)?(?:${IT_PART})`).test(t)
  ),
  Z(
    'it',
    'passato_prossimo',
    'passato prossimo (ho/sono + participio)',
    ['it.verb.passato_prossimo', 'it.verb.imperfetto_vs_pp', 'it.verb.accordo_participio'],
    /passato prossimo|\bperfekt\b/i,
    (t) => wort(`(?:ho|hai|ha|abbiamo|avete|hanno|sono|sei|è|siamo|siete)\\s+(?:(?:già|mai|non|appena|sempre)\\s+)?(?:${IT_PART})`).test(t)
  ),
  Z(
    'it',
    'passivo',
    'passivo (venire/essere + participio + da)',
    ['it.verb.passivo'],
    /passivo|passiv/i,
    (t) => wort(`(?:viene|vengono|veniva|è stato|è stata|sono stati|sono state|fu|sarà)\\s+(?:${IT_PART})\\s+da`).test(t)
  ),
  Z(
    'it',
    'condizionale',
    'condizionale (parlerei …; außer vorrei)',
    ['it.verb.condizionale', 'it.verb.condizionale_composto'],
    /condizionale|konditional/i,
    (t) =>
      ohne(
        `([${IT_L}]{2,}(?:erei|eresti|erebbe|eremmo|ereste|erebbero|irei|iresti|irebbe|iremmo|ireste|irebbero)|(?:sar|avr|far|andr|potr|dovr|verr|vedr|sapr|vorr)(?:ei|esti|ebbe|emmo|este|ebbero))`,
        ['vorrei', 'vorresti']
      )(t)
  ),
  Z(
    'it',
    'futuro',
    'futuro semplice (parlerò, sarà …)',
    ['it.verb.futuro', 'it.verb.futuro_anteriore'],
    /futuro|\bfutur\b/i,
    (t) =>
      wort(
        `[${IT_L}]{2,}(?:erò|erai|erà|eremo|erete|eranno|irò|irai|irà|iremo|irete|iranno|arò|arai|arà|aremo|arete|aranno)|(?:sar|avr|far|andr|potr|vorr|verr|dovr|vedr|sapr)(?:ò|ai|à|emo|ete|anno)`
      ).test(t)
  ),
  Z(
    'it',
    'congiuntivo',
    'congiuntivo (che sia, se fosse …)',
    ['it.verb.congiuntivo_presente', 'it.verb.congiuntivo_imperfetto', 'it.verb.congiuntivo_congiunzioni', 'it.verb.congiuntivo_relative'],
    /congiuntivo|konjunktiv/i,
    (t) =>
      wort(
        '(?:che|perché|affinché|benché|sebbene|se)\\s+(?:io\\s+|tu\\s+|lui\\s+|lei\\s+)?(?:non\\s+)?(?:sia|siano|siamo|siate|abbia|abbiano|faccia|facciano|vada|vadano|possa|possano|venga|vengano|dica|dicano|stia|stiano|sappia|voglia|fossi|fosse|fossero|avessi|avesse|avessero|facessi|facesse|andasse)'
      ).test(t)
  ),
  Z(
    'it',
    'imperfetto',
    'imperfetto (ero, avevo, parlava …)',
    ['it.verb.imperfetto', 'it.verb.imperfetto_vs_pp'],
    /imperfetto|imperfekt/i,
    (t) =>
      wort(`ero|eri|era|eravamo|eravate|erano|[${IT_L}]{2,}(?:avamo|avate|avano|evamo|evate|evano|ivamo|ivate|ivano)`).test(t) ||
      ohne(`([${IT_L}]{2,}(?:avo|avi|ava|evo|evi|eva))`, ['bravo', 'brava', 'bravi', 'ottava', 'schiavo', 'schiava', 'cava', 'lava', 'neva', 'diva'])(t)
  ),
  Z(
    'it',
    'passato_remoto',
    'passato remoto',
    ['it.verb.passato_remoto'],
    /passato remoto/i,
    (t) => wort(`[${IT_L}]{2,}(?:arono|irono|ettero)|furono|ebbero|fece|fecero|disse|dissero|nacque|visse`).test(t)
  )
]

// ---------------------------------------------------------------- Latein (ohne Längenzeichen geprüft)

const LATEIN: SperrbareZeitform[] = [
  Z(
    'la',
    'plusquamperfekt',
    'Plusquamperfekt',
    ['la.form.plusquamperfekt'],
    /plusquamperfekt|plusqpf|plqpf|plqu\./i,
    (t) => wort('[a-z]+[vuxs]era(?:m|s|t|mus|tis|nt)|fueram|fueras|fuerat|fueramus|fueratis|fuerant').test(t),
    /^(?:plusqpf|plqpf|plusq|plqu)\.?$/i
  ),
  Z(
    'la',
    'perfekt',
    'Perfekt',
    ['la.form.perfekt'],
    /(?<!plusquam)\bperfekt\b|\bperf\./i,
    (t) =>
      ohne('([a-z]{2,}(?:isti|istis|erunt)|[a-z]+(?:avi|avit|avimus|avistis|evi|evit|evimus|ivi|ivit|ivimus|uit|uimus|uerunt))', [
        'tristi',
        'christi',
        'poterunt',
        'navi',
        'clavi',
        'brevi',
        'suavi',
        'gravi',
        'levi',
        'civi'
      ])(t) || wort('fui|fuisti|fuit|fuimus|fuistis|fuerunt').test(t),
    /^perf\.?$/i
  ),
  Z(
    'la',
    'futur',
    'Futur I und II',
    ['la.form.futur'],
    /\bfutur\b|\bfut\./i,
    (t) =>
      ohne('([a-z]+(?:abo|abis|abit|abimus|abitis|abunt|ebo|ebis|ebit|ebimus|ebitis|ebunt))', ['plebis'])(t) ||
      wort('ero|eris|erit|erimus|eritis|erunt|potero|poteris|poterit|poterimus|poterunt|ibo|ibis|ibit|ibimus|ibunt').test(t),
    /^fut\.?(?:\s*i{1,2})?$/i
  ),
  Z(
    'la',
    'imperfekt',
    'Imperfekt',
    ['la.form.imperfekt'],
    /imperfekt|\bimpf\./i,
    (t) =>
      wort('[a-z]+(?:abam|abas|abat|abamus|abatis|abant|ebam|ebas|ebat|ebamus|ebatis|ebant)|eram|eras|erat|eramus|eratis|erant|poteram|poterat|poterant|ibam|ibat|ibant').test(
        t
      ),
    /^impf\.?$/i
  ),
  Z(
    'la',
    'konjunktiv',
    'Konjunktiv',
    ['la.form.konjunktiv', 'la.syn.konj_hs', 'la.syn.nebensatz_konj', 'la.syn.konditional', 'la.syn.begehrsaetze', 'la.syn.consecutio', 'la.syn.indirekter_fragesatz'],
    /konjunktiv|\bkonj\.\s*(?:präs|impf|perf|plqu|plusq)|konj\. (?:als|im)/i,
    (t) =>
      ohne(
        '([a-z]{2,}(?:arem|aret|aremus|aretis|arent|erem|eret|eremus|eretis|erent|irem|iret|iremus|iretis|irent|issem|isses|isset|issemus|issetis|issent))',
        ['inferent']
      )(t) || wort('essem|esses|esset|essemus|essetis|essent|sim|sis|sit|simus|sitis|sint|possim|possit|possint').test(t),
    /^konj\.?$/i
  ),
  Z(
    'la',
    'passiv',
    'Passiv',
    ['la.form.passiv'],
    /passiv|\bpass\./i,
    (t) =>
      wort('[a-z]{2,}(?:atur|etur|itur|antur|entur|untur|amur|emur|imur|amini|emini|imini|abatur|ebatur|abantur|ebantur|abitur|ebitur|abuntur)').test(t) ||
      ohne('([a-z]{2,}(?:atus|ata|atum|ati|atae|atos|atas|itus|itum|iti|itae|ctus|cta|ctum|cti|ctae|ssus|ssa|ssum|ssi|ssae))\\s+(?:sum|es|est|sumus|estis|sunt|eram|erat|erant|esse)', [
        'grata',
        'beata',
        'tecta'
      ])(t),
    /^pass\.?$/i
  ),
  Z(
    'la',
    'partizipien',
    'Partizipien (PPP, PPA, PFA) mit PC und Ablativus absolutus',
    ['la.form.ppp', 'la.form.ppa', 'la.form.pfa', 'la.syn.pc', 'la.syn.abl_abs'],
    /partizip|\bppp\b|\bppa\b|\bpfa\b|participium|ablativus absolutus|abl\. abs/i,
    () => false
  ),
  Z('la', 'aci', 'AcI (Akkusativ mit Infinitiv)', ['la.syn.aci', 'la.form.infinitive'], /\baci\b|akkusativ mit infinitiv/i, () => false)
]

// ---------------------------------------------------------------- Russisch

const RUSSISCH: SperrbareZeitform[] = [
  Z(
    'ru',
    'praeteritum',
    'Präteritum (был, читал …)',
    ['ru.verb.praeteritum'],
    /präteritum|vergangenheit/i,
    (t) => wort('был|была|было|были').test(t) || wort('(?:я|ты|он|она|оно|мы|вы|они)\\s+(?:не\\s+)?[а-яё]{2,}(?:л|ла|ло|ли|лся|лась|лись)').test(t)
  ),
  Z('ru', 'futur', 'Futur (буду + Infinitiv, vollendetes Futur)', ['ru.verb.futur'], /\bfutur\b|zukunft/i, (t) => wort('буду|будешь|будет|будем|будете|будут').test(t)),
  Z('ru', 'konjunktiv', 'Konjunktiv mit бы', ['ru.verb.konjunktiv'], /konjunktiv/i, (t) => wort('бы').test(t)),
  Z('ru', 'aspekt', 'Verbalaspekt (vollendet/unvollendet im Kontrast)', ['ru.verb.aspekt', 'ru.verb.aspektpaare'], /aspekt|vollendet/i, () => false),
  Z('ru', 'partizipien', 'Partizipien und Adverbialpartizipien', ['ru.verb.partizipien', 'ru.verb.adverbialpartizip'], /partizip/i, () => false),
  Z('ru', 'passiv', 'Passiv', ['ru.verb.passiv'], /passiv/i, () => false)
]

// ---------------------------------------------------------------- Niederländisch

const NL_PART = 'ge[a-zë]{2,}(?:d|t|en)'
const NL_KEIN_PART = ['gezond', 'gezicht', 'gedicht', 'gerecht', 'gewicht', 'geluid', 'gebied', 'gemeen', 'gedrag', 'gevaar', 'gesprek', 'geheel', 'gelijk', 'geleden']

const NIEDERLAENDISCH: SperrbareZeitform[] = [
  Z(
    'nl',
    'plusquam_conditionalis',
    'plusquamperfectum und conditionalis (had gemaakt, zou …)',
    ['nl.verb.plusquam_conditionalis'],
    /plusquamperfect|plusquamperfekt|conditionalis|konditional/i,
    (t) => ohne(`(?:had|hadden|was|waren)\\s+(?:(?:al|niet)\\s+)?(${NL_PART})`, NL_KEIN_PART)(t) || wort('zou|zouden').test(t)
  ),
  Z(
    'nl',
    'passief',
    'passief (worden + voltooid deelwoord)',
    ['nl.verb.passief'],
    /passief|passiv/i,
    (t) => ohne(`(?:wordt|worden|werd|werden)\\s+(?:(?:niet|vaak)\\s+)?(${NL_PART})`, NL_KEIN_PART)(t)
  ),
  Z(
    'nl',
    'perfectum',
    'perfectum (hebben/zijn + voltooid deelwoord)',
    ['nl.verb.perfectum'],
    /perfectum|\bperfekt\b/i,
    (t) => ohne(`(?:heb|hebt|heeft|hebben|ben|bent|is|zijn)\\s+(?:(?:al|niet|nooit|ook|gisteren)\\s+)?(${NL_PART})`, NL_KEIN_PART)(t)
  ),
  Z(
    'nl',
    'imperfectum',
    'imperfectum (was, had, werkte …)',
    ['nl.verb.imperfectum'],
    /imperfectum|imperfekt|präteritum/i,
    (t) =>
      wort(
        'was|waren|had|hadden|ging|gingen|kwam|kwamen|zag|zagen|deed|deden|zei|zeiden|kon|konden|wilde|wilden|moest|moesten|mocht|mochten|dronk|liep|liepen|schreef|vond|nam|gaf|bleef|stond|zat|lag'
      ).test(t) || wort('(?:ik|jij|je|hij|zij|ze|u)\\s+[a-z]{2,}(?:de|te)').test(t)
  ),
  Z('nl', 'toekomst', 'toekomende tijd mit zullen', ['nl.verb.toekomst'], /toekomende tijd|zullen/i, (t) => wort('zal|zult|zullen').test(t))
]

// ---------------------------------------------------------------- Portugiesisch

const PT_L = 'a-zçãõáéíóúâêô'

const PORTUGIESISCH: SperrbareZeitform[] = [
  Z(
    'pt',
    'passiva',
    'voz passiva (ser + particípio + por)',
    ['pt.verb.passiva'],
    /passiva|passiv/i,
    (t) => wort(`(?:é|são|foi|foram|será|serão)\\s+[${PT_L}]{2,}(?:ado|ada|ados|adas|ido|ida|idos|idas)\\s+(?:por|pelo|pela|pelos|pelas)`).test(t)
  ),
  Z(
    'pt',
    'perfeito_composto',
    'pretérito perfeito composto (tenho + particípio)',
    ['pt.verb.perfeito_composto'],
    /perfeito composto/i,
    (t) => wort(`(?:tenho|tens|tem|temos|têm)\\s+(?:não\\s+)?[${PT_L}]{2,}(?:ado|ido)`).test(t)
  ),
  Z(
    'pt',
    'mais_que_perfeito',
    'mais-que-perfeito (tinha + particípio)',
    ['pt.verb.mais_que_perfeito'],
    /mais-que-perfeito|plusquamperfekt/i,
    (t) => wort(`(?:tinha|tinhas|tínhamos|tinham|havia)\\s+(?:já\\s+)?[${PT_L}]{2,}(?:ado|ido)`).test(t)
  ),
  Z(
    'pt',
    'conjuntivo',
    'conjuntivo (que seja, se fosse …)',
    ['pt.verb.conjuntivo_presente', 'pt.verb.conjuntivo_imperfeito_futuro'],
    /conjuntivo|konjunktiv/i,
    (t) =>
      wort(
        '(?:que|talvez|embora|quando|se)\\s+(?:eu\\s+|tu\\s+|ele\\s+|ela\\s+|você\\s+)?(?:não\\s+)?(?:seja|sejas|sejamos|sejam|esteja|estejam|tenha|tenhas|tenham|faça|façam|possa|possam|queira|saiba|fosse|fossem|tivesse|tivessem|fizer|for|forem|estiver|tiver)'
      ).test(t)
  ),
  Z(
    'pt',
    'futuro_condicional',
    'futuro e condicional (falarei, falaria …)',
    ['pt.verb.futuro_condicional'],
    /futuro|condicional|konditional|\bfutur\b/i,
    (t) =>
      wort(
        `[${PT_L}]{2,}(?:arei|arás|ará|aremos|arão|erei|erás|erá|eremos|erão|irei|irás|irá|iremos|irão|ariam|eriam|iriam|aríamos|eríamos|iríamos)|serei|será|serão|farei|fará|direi|dirá|terei|terá|teria|faria|seria|poderia`
      ).test(t) || wort(`(?:eu|tu|ele|ela|você|nós|eles|elas)\\s+(?:não\\s+)?[${PT_L}]{2,}(?:aria|eria|iria)`).test(t)
  ),
  Z(
    'pt',
    'imperfeito',
    'pretérito imperfeito (falava, era, tinha …)',
    ['pt.verb.imperfeito'],
    /imperfeito|imperfekt/i,
    (t) => wort(`[${PT_L}]{2,}(?:ava|avas|ávamos|avam|íamos|íeis|iam)|era|eras|éramos|eram|tinha|tinhas|tínhamos|tinham|fazia|podia|queria|vivia`).test(t)
  ),
  Z(
    'pt',
    'preterito_perfeito',
    'pretérito perfeito simples (falei, comeu, foi …)',
    ['pt.verb.preterito_perfeito', 'pt.verb.imperfeito'],
    /perfeito simples|\bperfekt\b|einfache vergangenheit/i,
    (t) =>
      wort(
        `fui|foste|foi|fomos|foram|tive|teve|tivemos|tiveram|fiz|fez|fizemos|fizeram|disse|disseram|pude|pôde|puderam|veio|vieram|estive|esteve|estiveram|[${PT_L}]{2,}(?:aste|ámos|aram|iram|iu|ei)`
      ).test(t) ||
      ohne(`([${PT_L}]{2,}(?:ou|eu))`, ['estou', 'sou', 'vou', 'dou', 'meu', 'teu', 'seu', 'museu', 'europeu', 'ateu', 'judeu', 'pneu', 'adeus'])(t)
  )
]

export const ZEITFORMEN_SPRACHEN: Record<string, SperrbareZeitform[]> = {
  fr: FRANZOESISCH,
  es: SPANISCH,
  it: ITALIENISCH,
  la: LATEIN,
  ru: RUSSISCH,
  nl: NIEDERLAENDISCH,
  pt: PORTUGIESISCH
}

// ---------------------------------------------------------------- Latein: Stand im Lehrwerk

/** Grammatik-Stichwörter der lateinischen Lehrwerke → Katalogkennungen */
const LATEIN_STICHWORTE: [RegExp, string][] = [
  [/\bimpf\.|imperfekt/i, 'la.form.imperfekt'],
  [/(?<!plusquam)perfekt(?!opr)|\bperf\./i, 'la.form.perfekt'],
  [/plusquamperfekt|\bplqu\.|plusqpf/i, 'la.form.plusquamperfekt'],
  [/\bfut\.|\bfutur\b/i, 'la.form.futur'],
  [/passiv|\bpass\./i, 'la.form.passiv'],
  [/konjunktiv|\bkonj\.\s*(?:präs|impf|perf|plqu|plusq)|\bkonj\. (?:als|im)|im konj\./i, 'la.form.konjunktiv'],
  [/\bppp\b/i, 'la.form.ppp'],
  [/\bppa\b/i, 'la.form.ppa'],
  [/\bpfa\b/i, 'la.form.pfa'],
  [/\bpc\b|participium coniunctum/i, 'la.syn.pc'],
  [/abl\. abs|ablativus absolutus/i, 'la.syn.abl_abs'],
  [/\baci\b|akkusativ mit infinitiv/i, 'la.syn.aci']
]

const normName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Lateinisches Lehrwerk zu einem Namen („Pontes", „prima.nova") – nur Lehrwerke mit Fach Latein */
export function lateinLehrwerk(name: string): string | undefined {
  const n = normName(name)
  return Object.keys(LEHRWERK_THEMEN).find((b) => LEHRWERK_THEMEN[b].fach === 'latein' && normName(b) === n)
}

/** Bekannte lateinische Grammatik bis einschließlich dieser Lektion (Stichwörter der Lektionen) */
export function bekanntLatein(buch: string, unit?: string): string[] {
  const b = lateinLehrwerk(buch)
  if (!b) return []
  const folge = kapitelFolge(b)
  const bis = unit ? folge.indexOf(unit) : -1
  if (bis < 0) return []
  const text = folge
    .slice(0, bis + 1)
    .map((k) => LEHRWERK_THEMEN[b].kapitel[k]?.grammatik ?? '')
    .join('; ')
  return LATEIN_STICHWORTE.filter(([re]) => re.test(text)).map(([, id]) => id)
}
