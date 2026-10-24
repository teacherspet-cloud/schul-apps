/**
 * Anonyme Bildsymbole der Partnerarbeit (24.10.2026, Wunsch der Lehrkraft): Bei der Zufallszuteilung sieht jedes Kind
 * groß sein eigenes Symbol und das seiner Partner („Du bist der Fuchs – dein Partner ist die Schildkröte"), nie Namen.
 * Altersgerecht je Jahrgang (Wunsch 24.10.2026): Unterstufe (5–7) Tiere und Früchte, Mittelstufe (8–10) Sport, Musik
 * und wilde Tiere, Oberstufe (11–13) neutrale Dinge aus Wissenschaft, Natur und Kultur – je 40, damit Klassen bis 34
 * ohne Wiederholung auskommen. Gezeichnet aus dem OpenMoji-Bestand (farbig: resources/openmoji/partner.json,
 * scripts/prepare-openmoji.mjs); der Server liefert nur diese Listen aus (server/partnerarbeit.ts). Namen in der Zielsprache.
 */
export interface Symbol {
  hex: string
  de: string
  en: string
  fr: string
  es: string
}

const s = (hex: string, de: string, en: string, fr: string, es: string): Symbol => ({ hex, de, en, fr, es })

/** Jahrgang 5–7: Tiere und Früchte */
export const SYMBOLE_UNTER: Symbol[] = [
  s('1F98A', 'der Fuchs', 'the fox', 'le renard', 'el zorro'),
  s('1F422', 'die Schildkröte', 'the turtle', 'la tortue', 'la tortuga'),
  s('1F427', 'der Pinguin', 'the penguin', 'le pingouin', 'el pingüino'),
  s('1F981', 'der Löwe', 'the lion', 'le lion', 'el león'),
  s('1F43C', 'der Panda', 'the panda', 'le panda', 'el panda'),
  s('1F418', 'der Elefant', 'the elephant', "l'éléphant", 'el elefante'),
  s('1F99C', 'der Papagei', 'the parrot', 'le perroquet', 'el loro'),
  s('1F41D', 'die Biene', 'the bee', "l'abeille", 'la abeja'),
  s('1F419', 'der Krake', 'the octopus', 'la pieuvre', 'el pulpo'),
  s('1F42C', 'der Delfin', 'the dolphin', 'le dauphin', 'el delfín'),
  s('1F433', 'der Wal', 'the whale', 'la baleine', 'la ballena'),
  s('1F98B', 'der Schmetterling', 'the butterfly', 'le papillon', 'la mariposa'),
  s('1F992', 'die Giraffe', 'the giraffe', 'la girafe', 'la jirafa'),
  s('1F993', 'das Zebra', 'the zebra', 'le zèbre', 'la cebra'),
  s('1F994', 'der Igel', 'the hedgehog', 'le hérisson', 'el erizo'),
  s('1F9A9', 'der Flamingo', 'the flamingo', 'le flamant rose', 'el flamenco'),
  s('1F428', 'der Koala', 'the koala', 'le koala', 'el koala'),
  s('1F430', 'der Hase', 'the rabbit', 'le lapin', 'el conejo'),
  s('1F438', 'der Frosch', 'the frog', 'la grenouille', 'la rana'),
  s('1F41F', 'der Fisch', 'the fish', 'le poisson', 'el pez'),
  s('1F99B', 'das Nilpferd', 'the hippo', "l'hippopotame", 'el hipopótamo'),
  s('1F98C', 'der Hirsch', 'the deer', 'le cerf', 'el ciervo'),
  s('1F989', 'die Eule', 'the owl', 'le hibou', 'el búho'),
  s('1F40C', 'die Schnecke', 'the snail', "l'escargot", 'el caracol'),
  s('1F41E', 'der Marienkäfer', 'the ladybird', 'la coccinelle', 'la mariquita'),
  s('1F34E', 'der Apfel', 'the apple', 'la pomme', 'la manzana'),
  s('1F353', 'die Erdbeere', 'the strawberry', 'la fraise', 'la fresa'),
  s('1F34B', 'die Zitrone', 'the lemon', 'le citron', 'el limón'),
  s('1F955', 'die Karotte', 'the carrot', 'la carotte', 'la zanahoria'),
  s('1F680', 'die Rakete', 'the rocket', 'la fusée', 'el cohete'),
  s('2B50', 'der Stern', 'the star', "l'étoile", 'la estrella'),
  s('1F308', 'der Regenbogen', 'the rainbow', "l'arc-en-ciel", 'el arcoíris'),
  s('1F3B8', 'die Gitarre', 'the guitar', 'la guitare', 'la guitarra'),
  s('1F3B2', 'der Würfel', 'the dice', 'le dé', 'el dado'),
  s('1F4A1', 'die Glühbirne', 'the light bulb', "l'ampoule", 'la bombilla'),
  s('2602', 'der Regenschirm', 'the umbrella', 'le parapluie', 'el paraguas'),
  s('1F9E9', 'das Puzzleteil', 'the puzzle piece', 'la pièce de puzzle', 'la pieza de puzle'),
  s('26BD', 'der Fußball', 'the football', 'le ballon de foot', 'el balón'),
  s('1F3A8', 'die Palette', 'the palette', 'la palette', 'la paleta'),
  s('1F30D', 'die Weltkugel', 'the globe', 'le globe', 'el globo terráqueo')
]

/** Jahrgang 8–10: Sport, Musik, Technik, wilde Tiere */
export const SYMBOLE_MITTEL: Symbol[] = [
  s('1F43A', 'der Wolf', 'the wolf', 'le loup', 'el lobo'),
  s('1F985', 'der Adler', 'the eagle', "l'aigle", 'el águila'),
  s('1F988', 'der Hai', 'the shark', 'le requin', 'el tiburón'),
  s('1F405', 'der Tiger', 'the tiger', 'le tigre', 'el tigre'),
  s('1F406', 'der Leopard', 'the leopard', 'le léopard', 'el leopardo'),
  s('1F40E', 'das Pferd', 'the horse', 'le cheval', 'el caballo'),
  s('1F98D', 'der Gorilla', 'the gorilla', 'le gorille', 'el gorila'),
  s('1F9A6', 'der Otter', 'the otter', 'la loutre', 'la nutria'),
  s('1F40A', 'das Krokodil', 'the crocodile', 'le crocodile', 'el cocodrilo'),
  s('1F982', 'der Skorpion', 'the scorpion', 'le scorpion', 'el escorpión'),
  s('1F99A', 'der Pfau', 'the peacock', 'le paon', 'el pavo real'),
  s('1F9AC', 'der Bison', 'the bison', 'le bison', 'el bisonte'),
  s('1F3C0', 'der Basketball', 'the basketball', 'le ballon de basket', 'el balón de baloncesto'),
  s('1F3BE', 'der Tennisball', 'the tennis ball', 'la balle de tennis', 'la pelota de tenis'),
  s('1F3D0', 'der Volleyball', 'the volleyball', 'le ballon de volley', 'el balón de voleibol'),
  s('1F3D2', 'der Hockeyschläger', 'the hockey stick', 'la crosse de hockey', 'el palo de hockey'),
  s('1F6F9', 'das Skateboard', 'the skateboard', 'le skateboard', 'el monopatín'),
  s('1F3A7', 'die Kopfhörer', 'the headphones', 'le casque audio', 'los auriculares'),
  s('1F3B8', 'die E-Gitarre', 'the guitar', 'la guitare', 'la guitarra'),
  s('1F3A4', 'das Mikrofon', 'the microphone', 'le micro', 'el micrófono'),
  s('1F4F7', 'die Kamera', 'the camera', "l'appareil photo", 'la cámara'),
  s('1F3AE', 'der Controller', 'the game controller', 'la manette', 'el mando'),
  s('1F6B2', 'das Fahrrad', 'the bike', 'le vélo', 'la bicicleta'),
  s('1F6F6', 'das Kanu', 'the canoe', 'le canoë', 'la canoa'),
  s('1F3BF', 'die Skier', 'the skis', 'les skis', 'los esquís'),
  s('1F525', 'das Feuer', 'the fire', 'le feu', 'el fuego'),
  s('26A1', 'der Blitz', 'the lightning', "l'éclair", 'el rayo'),
  s('1F30A', 'die Welle', 'the wave', 'la vague', 'la ola'),
  s('1F680', 'die Rakete', 'the rocket', 'la fusée', 'el cohete'),
  s('1F6F8', 'das Ufo', 'the UFO', "l'ovni", 'el ovni'),
  s('1F3AF', 'die Zielscheibe', 'the target', 'la cible', 'la diana'),
  s('1F579', 'der Joystick', 'the joystick', 'le joystick', 'el joystick'),
  s('1F3AC', 'die Filmklappe', 'the clapperboard', 'le clap', 'la claqueta'),
  s('1F941', 'die Trommel', 'the drum', 'le tambour', 'el tambor'),
  s('1F3B7', 'das Saxofon', 'the saxophone', 'le saxophone', 'el saxofón'),
  s('1F3BA', 'die Trompete', 'the trumpet', 'la trompette', 'la trompeta'),
  s('1F3C6', 'der Pokal', 'the trophy', 'le trophée', 'el trofeo'),
  s('1F9E2', 'die Kappe', 'the cap', 'la casquette', 'la gorra'),
  s('1F45F', 'der Sneaker', 'the sneaker', 'la basket', 'la zapatilla'),
  s('1F3B3', 'die Bowlingkugel', 'the bowling ball', 'la boule de bowling', 'la bola de bolos')
]

/** Jahrgang 11–13: Wissenschaft, Natur, Kultur – neutral */
export const SYMBOLE_OBER: Symbol[] = [
  s('1F9ED', 'der Kompass', 'the compass', 'la boussole', 'la brújula'),
  s('1F30D', 'die Weltkugel', 'the globe', 'le globe', 'el globo terráqueo'),
  s('1F52D', 'das Teleskop', 'the telescope', 'le télescope', 'el telescopio'),
  s('1F52C', 'das Mikroskop', 'the microscope', 'le microscope', 'el microscopio'),
  s('1F4A1', 'die Glühbirne', 'the light bulb', "l'ampoule", 'la bombilla'),
  s('1F4D6', 'das Buch', 'the book', 'le livre', 'el libro'),
  s('1F511', 'der Schlüssel', 'the key', 'la clé', 'la llave'),
  s('2693', 'der Anker', 'the anchor', "l'ancre", 'el ancla'),
  s('1F3D4', 'der Berg', 'the mountain', 'la montagne', 'la montaña'),
  s('1F319', 'der Mond', 'the moon', 'la lune', 'la luna'),
  s('2B50', 'der Stern', 'the star', "l'étoile", 'la estrella'),
  s('231B', 'die Sanduhr', 'the hourglass', 'le sablier', 'el reloj de arena'),
  s('265F', 'der Bauer (Schach)', 'the pawn', 'le pion', 'el peón'),
  s('1F6F0', 'der Satellit', 'the satellite', 'le satellite', 'el satélite'),
  s('1F3BB', 'die Geige', 'the violin', 'le violon', 'el violín'),
  s('1F3B9', 'das Klavier', 'the piano', 'le piano', 'el piano'),
  s('1F3AD', 'die Theatermasken', 'the theatre masks', 'les masques de théâtre', 'las máscaras de teatro'),
  s('1F3A8', 'die Palette', 'the palette', 'la palette', 'la paleta'),
  s('1F58B', 'der Füller', 'the fountain pen', 'le stylo-plume', 'la pluma estilográfica'),
  s('1F4F7', 'die Kamera', 'the camera', "l'appareil photo", 'la cámara'),
  s('1F3AC', 'die Filmklappe', 'the clapperboard', 'le clap', 'la claqueta'),
  s('1F9EA', 'das Reagenzglas', 'the test tube', 'le tube à essai', 'el tubo de ensayo'),
  s('1F9EC', 'die DNA', 'the DNA', "l'ADN", 'el ADN'),
  s('2696', 'die Waage', 'the scales', 'la balance', 'la balanza'),
  s('1F5FA', 'die Landkarte', 'the map', 'la carte', 'el mapa'),
  s('1F9F2', 'der Magnet', 'the magnet', "l'aimant", 'el imán'),
  s('2699', 'das Zahnrad', 'the gear', "l'engrenage", 'el engranaje'),
  s('1F343', 'das Blatt', 'the leaf', 'la feuille', 'la hoja'),
  s('1F332', 'die Tanne', 'the fir tree', 'le sapin', 'el abeto'),
  s('1F334', 'die Palme', 'the palm tree', 'le palmier', 'la palmera'),
  s('1F33B', 'die Sonnenblume', 'the sunflower', 'le tournesol', 'el girasol'),
  s('1F337', 'die Tulpe', 'the tulip', 'la tulipe', 'el tulipán'),
  s('1F30B', 'der Vulkan', 'the volcano', 'le volcan', 'el volcán'),
  s('1F3DD', 'die Insel', 'the island', "l'île", 'la isla'),
  s('1F30C', 'die Milchstraße', 'the Milky Way', 'la Voie lactée', 'la Vía Láctea'),
  s('2615', 'die Kaffeetasse', 'the coffee cup', 'la tasse de café', 'la taza de café'),
  s('1F3B5', 'die Note', 'the musical note', 'la note de musique', 'la nota musical'),
  s('1F3C1', 'die Zielflagge', 'the chequered flag', 'le drapeau à damier', 'la bandera de cuadros'),
  s('1F56F', 'die Kerze', 'the candle', 'la bougie', 'la vela'),
  s('1F3A1', 'das Riesenrad', 'the Ferris wheel', 'la grande roue', 'la noria')
]

/** Alle Listen zusammen (Namen, Auslieferung); nur zur Rückwärtsverträglichkeit auch als SYMBOLE */
export const ALLE_SYMBOLE: Symbol[] = [...SYMBOLE_UNTER, ...SYMBOLE_MITTEL, ...SYMBOLE_OBER]
export const SYMBOLE = SYMBOLE_UNTER

/** Liste je Jahrgang (ohne Angabe: Mittelstufe) */
export function symboleFuer(jahrgang: number | null | undefined): Symbol[] {
  if (jahrgang != null && jahrgang <= 7) return SYMBOLE_UNTER
  if (jahrgang != null && jahrgang >= 11) return SYMBOLE_OBER
  return SYMBOLE_MITTEL
}

export const SYMBOL_HEX = new Set(ALLE_SYMBOLE.map((x) => x.hex))
export const istSymbol = (hex: string): boolean => SYMBOL_HEX.has(hex)

/** Name eines Symbols in der Zielsprache (Rückfall Deutsch) */
export function symbolName(hex: string, sprache: string): string {
  const x = ALLE_SYMBOLE.find((y) => y.hex === hex)
  if (!x) return ''
  return (x as unknown as Record<string, string>)[sprache] ?? x.de
}

/**
 * Symbole eindeutig vergeben: zuerst alle 40 der Liste, dann (bei mehr Lernenden) wiederholt mit angehängter Zahl
 * („1F98A#2") – der Browser zeigt dann das Bild mit der Zahl.
 */
export function symboleVergeben(
  ids: string[],
  schon: Record<string, string>,
  mischen: (l: string[]) => string[],
  liste: Symbol[] = SYMBOLE_UNTER
): Record<string, string> {
  const aus = { ...schon }
  const benutzt = new Set(Object.values(aus))
  let frei = mischen(liste.map((x) => x.hex).filter((h) => !benutzt.has(h)))
  let runde = 2
  for (const id of ids) {
    if (aus[id]) continue
    if (!frei.length) {
      frei = mischen(liste.map((x) => `${x.hex}#${runde}`).filter((h) => !benutzt.has(h)))
      runde++
      if (!frei.length) continue
    }
    const h = frei.shift()!
    aus[id] = h
    benutzt.add(h)
  }
  return aus
}

/** „1F98A#2" → { hex, zahl } */
export const symbolTeile = (x: string): { hex: string; zahl: number | null } => {
  const [hex, z] = x.split('#')
  return { hex, zahl: z ? Number(z) : null }
}
