/**
 * Anonyme Bildsymbole der Partnerarbeit (24.10.2026, Wunsch der Lehrkraft): Bei der Zufallszuteilung sieht jedes Kind
 * groß sein eigenes Symbol und das seiner Partner („Du bist der Fuchs – dein Partner ist die Schildkröte"), nie Namen.
 * Gezeichnet werden die Symbole aus dem mitgelieferten OpenMoji-Bestand (resources/openmoji), der Server liefert nur
 * diese Liste aus (server/partnerarbeit.ts, /s/api/partnerarbeit/symbol/<hex>). Namen in der Zielsprache.
 */
export interface Symbol {
  hex: string
  de: string
  en: string
  fr: string
  es: string
}

export const SYMBOLE: Symbol[] = [
  { hex: '1F98A', de: 'der Fuchs', en: 'the fox', fr: 'le renard', es: 'el zorro' },
  { hex: '1F422', de: 'die Schildkröte', en: 'the turtle', fr: 'la tortue', es: 'la tortuga' },
  { hex: '1F427', de: 'der Pinguin', en: 'the penguin', fr: 'le pingouin', es: 'el pingüino' },
  { hex: '1F981', de: 'der Löwe', en: 'the lion', fr: 'le lion', es: 'el león' },
  { hex: '1F43C', de: 'der Panda', en: 'the panda', fr: 'le panda', es: 'el panda' },
  { hex: '1F418', de: 'der Elefant', en: 'the elephant', fr: "l'éléphant", es: 'el elefante' },
  { hex: '1F99C', de: 'der Papagei', en: 'the parrot', fr: 'le perroquet', es: 'el loro' },
  { hex: '1F41D', de: 'die Biene', en: 'the bee', fr: "l'abeille", es: 'la abeja' },
  { hex: '1F419', de: 'der Krake', en: 'the octopus', fr: 'la pieuvre', es: 'el pulpo' },
  { hex: '1F42C', de: 'der Delfin', en: 'the dolphin', fr: 'le dauphin', es: 'el delfín' },
  { hex: '1F433', de: 'der Wal', en: 'the whale', fr: 'la baleine', es: 'la ballena' },
  { hex: '1F98B', de: 'der Schmetterling', en: 'the butterfly', fr: 'le papillon', es: 'la mariposa' },
  { hex: '1F992', de: 'die Giraffe', en: 'the giraffe', fr: 'la girafe', es: 'la jirafa' },
  { hex: '1F993', de: 'das Zebra', en: 'the zebra', fr: 'le zèbre', es: 'la cebra' },
  { hex: '1F994', de: 'der Igel', en: 'the hedgehog', fr: 'le hérisson', es: 'el erizo' },
  { hex: '1F9A9', de: 'der Flamingo', en: 'the flamingo', fr: 'le flamant rose', es: 'el flamenco' },
  { hex: '1F428', de: 'der Koala', en: 'the koala', fr: 'le koala', es: 'el koala' },
  { hex: '1F430', de: 'der Hase', en: 'the rabbit', fr: 'le lapin', es: 'el conejo' },
  { hex: '1F438', de: 'der Frosch', en: 'the frog', fr: 'la grenouille', es: 'la rana' },
  { hex: '1F41F', de: 'der Fisch', en: 'the fish', fr: 'le poisson', es: 'el pez' },
  { hex: '1F99B', de: 'das Nilpferd', en: 'the hippo', fr: "l'hippopotame", es: 'el hipopótamo' },
  { hex: '1F98C', de: 'der Hirsch', en: 'the deer', fr: 'le cerf', es: 'el ciervo' },
  { hex: '1F989', de: 'die Eule', en: 'the owl', fr: 'le hibou', es: 'el búho' },
  { hex: '1F40C', de: 'die Schnecke', en: 'the snail', fr: "l'escargot", es: 'el caracol' },
  { hex: '1F41E', de: 'der Marienkäfer', en: 'the ladybird', fr: 'la coccinelle', es: 'la mariquita' },
  { hex: '1F34E', de: 'der Apfel', en: 'the apple', fr: 'la pomme', es: 'la manzana' },
  { hex: '1F353', de: 'die Erdbeere', en: 'the strawberry', fr: 'la fraise', es: 'la fresa' },
  { hex: '1F34B', de: 'die Zitrone', en: 'the lemon', fr: 'le citron', es: 'el limón' },
  { hex: '1F955', de: 'die Karotte', en: 'the carrot', fr: 'la carotte', es: 'la zanahoria' },
  { hex: '1F680', de: 'die Rakete', en: 'the rocket', fr: 'la fusée', es: 'el cohete' },
  { hex: '2B50', de: 'der Stern', en: 'the star', fr: "l'étoile", es: 'la estrella' },
  { hex: '1F308', de: 'der Regenbogen', en: 'the rainbow', fr: "l'arc-en-ciel", es: 'el arcoíris' },
  { hex: '1F3B8', de: 'die Gitarre', en: 'the guitar', fr: 'la guitare', es: 'la guitarra' },
  { hex: '1F3B2', de: 'der Würfel', en: 'the dice', fr: 'le dé', es: 'el dado' },
  { hex: '1F4A1', de: 'die Glühbirne', en: 'the light bulb', fr: "l'ampoule", es: 'la bombilla' },
  { hex: '2602', de: 'der Regenschirm', en: 'the umbrella', fr: 'le parapluie', es: 'el paraguas' },
  { hex: '1F9E9', de: 'das Puzzleteil', en: 'the puzzle piece', fr: 'la pièce de puzzle', es: 'la pieza de puzle' },
  { hex: '26BD', de: 'der Fußball', en: 'the football', fr: 'le ballon de foot', es: 'el balón' },
  { hex: '1F3A8', de: 'die Palette', en: 'the palette', fr: 'la palette', es: 'la paleta' },
  { hex: '1F30D', de: 'die Weltkugel', en: 'the globe', fr: 'le globe', es: 'el globo terráqueo' }
]

export const SYMBOL_HEX = new Set(SYMBOLE.map((s) => s.hex))
export const istSymbol = (hex: string): boolean => SYMBOL_HEX.has(hex)

/** Name eines Symbols in der Zielsprache (Rückfall Deutsch) */
export function symbolName(hex: string, sprache: string): string {
  const s = SYMBOLE.find((x) => x.hex === hex)
  if (!s) return ''
  return (s as unknown as Record<string, string>)[sprache] ?? s.de
}

/**
 * Symbole eindeutig vergeben: zuerst alle 40, dann (bei mehr Lernenden) wiederholt mit angehängter Zahl
 * („1F98A#2") – der Browser zeigt dann das Bild mit der Zahl.
 */
export function symboleVergeben(ids: string[], schon: Record<string, string>, mischen: (l: string[]) => string[]): Record<string, string> {
  const aus = { ...schon }
  const benutzt = new Set(Object.values(aus))
  let frei = mischen(SYMBOLE.map((s) => s.hex).filter((h) => !benutzt.has(h)))
  let runde = 2
  for (const id of ids) {
    if (aus[id]) continue
    if (!frei.length) {
      frei = mischen(SYMBOLE.map((s) => `${s.hex}#${runde}`).filter((h) => !benutzt.has(h)))
      runde++
      if (!frei.length) continue
    }
    const s = frei.shift()!
    aus[id] = s
    benutzt.add(s)
  }
  return aus
}

/** „1F98A#2" → { hex, zahl } */
export const symbolTeile = (s: string): { hex: string; zahl: number | null } => {
  const [hex, z] = s.split('#')
  return { hex, zahl: z ? Number(z) : null }
}
