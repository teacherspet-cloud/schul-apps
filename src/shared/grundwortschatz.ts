/**
 * Grundwortschatz Englisch (29.10.2026, Auftrag der Lehrkraft: „spiel einen Grundwortschatz aus Wörtern auf, die Schüler
 * aus ihrem Alltag wissen könnten"). Die Green-Line-Listen der App führen viele Alltagswörter nicht (weekend, party, baby,
 * pizza, London, myself …) – die Grammatikaufgaben mussten deshalb ausweichen. Diese Wörter gelten ab Klasse 5 als bekannt:
 * Englisch aus der Grundschule, Wörter aus dem Deutschen (Anglizismen), Lebensmittel, Medien, Länder und Städte,
 * Zahlen, Wochentage, Monate, Pronomen und häufige Funktionswörter.
 */
const WOERTER = `
a an the and or but so because if when then than as at in on of to for from with without by about up down out off over under
into onto after before during until since near next behind between around through again also too very really just only still
yes no not ok okay hello hi bye goodbye please thanks thank sorry welcome
i me my mine myself you your yours yourself yourselves he him his himself she her hers herself it its itself
we us our ours ourselves they them their theirs themselves this that these those here there who what where when why how which whose
one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred thousand million first second third last
monday tuesday wednesday thursday friday saturday sunday weekend week day today tomorrow yesterday morning afternoon evening night
january february march april may june july august september october november december spring summer autumn winter year month time
mum mom dad mother father parents brother sister baby grandma grandpa granny family friend boy girl man woman men women children child kid kids
teacher student pupil class school classroom homework test lesson break holiday holidays birthday party present gift
house home flat room kitchen bathroom bedroom garden door window table chair bed sofa tv television radio computer laptop phone mobile
internet online app apps video videos game games email website camera photo photos music song songs film films movie cinema concert
football basketball tennis volleyball hockey sport sports team match goal player club fan fans hobby
pizza burger hamburger chips pasta sandwich sandwiches salad soup cake cakes chocolate ice cream biscuit biscuits cookie cookies
apple apples banana bananas orange tomato tomatoes potato potatoes bread butter cheese milk water juice tea coffee cola egg eggs
breakfast lunch dinner snack restaurant cafe café shop shops supermarket market bakery money euro euros pound pounds
dog dogs cat cats horse horses bird birds fish rabbit mouse hamster pet pets animal animals zoo farm
car cars bus buses bike bikes bicycle train trains plane taxi ticket tickets station airport street road city town village park
england britain london scotland wales ireland germany berlin france paris spain italy europe america usa
red blue green yellow black white brown pink orange grey purple colour colours
big small old new young good bad nice happy sad tired hungry ill sick hot cold warm cool great super cool funny
project poster team trainer job doctor nurse police
`
export const GRUNDWORTSCHATZ_EN: ReadonlySet<string> = new Set(WOERTER.toLowerCase().split(/\s+/).filter(Boolean))

/** Bekannte Wörter um den Grundwortschatz der Sprache erweitert (nur Englisch) */
export function mitGrundwortschatz(bekannt: ReadonlySet<string>, sprache: string): Set<string> {
  const aus = new Set(bekannt)
  if (sprache === 'en') for (const w of GRUNDWORTSCHATZ_EN) aus.add(w)
  return aus
}
