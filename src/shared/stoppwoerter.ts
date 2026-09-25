/**
 * Stoppwörter je Sprache – gemeinsam für Hauptprozess und Oberfläche.
 *
 * Fließtext enthält viele davon, Navigationsleisten und Verzeichnisse kaum. Das ist das
 * tragende Merkmal des jusText-Verfahrens (corpus.tools): Ein Block mit niedriger
 * Stoppwortdichte ist fast immer Beiwerk.
 *
 * Die Liste steht hier und nicht zweimal, weil sie an ZWEI Stellen gebraucht wird: beim
 * Herausschneiden des Fließtextes im Hauptprozess und bei der Qualitätsmessung in der
 * Oberfläche. Zwei Listen, die auseinanderlaufen, wären genau die Art Fehler, die still
 * bleibt – ein Text bestünde die eine Prüfung und fiele durch die andere.
 */
export const STOPPWOERTER: Record<string, string[]> = {
  de: 'der die das den dem des ein eine einen einem einer eines und oder aber wenn weil dass ich du er sie es wir ihr nicht auch nur noch schon wie so als an auf aus bei für in mit nach von vor zu zum zur über um ist sind war waren hat haben hatte wird werden wurde man sich dann doch am im ins beim vom sehr mehr viele diese dieser dieses seine ihre ihren seinen'.split(
    ' '
  ),
  en: 'the a an and or but if because that i you he she it we they not also only still as so how at on out by for in with after from to of is are was were has have had will would can could there then this these those their its about more most some'.split(
    ' '
  ),
  fr: 'le la les un une des et ou mais si parce que je tu il elle nous vous ils ne pas aussi encore comme donc à au aux de du dans avec pour sur par est sont était étaient a ont sera ce cette ces son sa ses leur plus'.split(
    ' '
  ),
  es: 'el la los las un una unos unas y o pero si porque que yo tú él ella nosotros no también sólo aún como así a de del en con para por sobre es son era eran ha han será este esta estos su sus más'.split(
    ' '
  ),
  it: 'il lo la i gli le un uno una e o ma se perché che io tu lui lei noi voi non anche solo ancora come così a di da in con per su è sono era erano ha hanno sarà questo questa questi suo sua più'.split(
    ' '
  ),
  la: 'et in ad ut non nec sed cum qui quae quod est sunt erat erant esse ab de ex per pro se sibi eius eorum atque aut enim etiam iam tamen quoque autem igitur hoc haec ille illa esset'.split(
    ' '
  )
}

export function stoppwortSatz(sprache: string): Set<string> {
  return new Set(STOPPWOERTER[sprache] ?? STOPPWOERTER.de)
}

/** Anteil der Stoppwörter an allen Wörtern (0–1). */
export function stoppwortdichte(text: string, sprache = 'de'): number {
  const woerter = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  if (!woerter.length) return 0
  const stopp = stoppwortSatz(sprache)
  return woerter.filter((w) => stopp.has(w)).length / woerter.length
}
