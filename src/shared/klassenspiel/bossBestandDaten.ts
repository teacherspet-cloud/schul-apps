/**
 * ERZEUGT von scripts/bossbilder/bestand.py aus den vorhandenen Bildern – nicht von Hand ändern.
 */
import type { BossBand, BossWelt } from './bossBestand'

export const FIGUREN_DATEN: { id: string; band: BossBand; rolle?: 'tank' | 'heiler'; spezial?: boolean; rollenposen?: boolean }[] = [
 {
  "id": "alchemist",
  "band": "5-6",
  "rolle": "heiler"
 },
 {
  "id": "alchemist-78",
  "band": "7-8",
  "rolle": "heiler"
 },
 {
  "id": "alchemist-910",
  "band": "9-10",
  "rolle": "heiler"
 },
 {
  "id": "ballkuenstler",
  "band": "5-6"
 },
 {
  "id": "ballkuenstler-78",
  "band": "7-8"
 },
 {
  "id": "ballkuenstler-910",
  "band": "9-10"
 },
 {
  "id": "barde",
  "band": "5-6",
  "rolle": "heiler"
 },
 {
  "id": "barde-78",
  "band": "7-8",
  "rolle": "heiler"
 },
 {
  "id": "barde-910",
  "band": "9-10",
  "rolle": "heiler"
 },
 {
  "id": "bogen",
  "band": "5-6"
 },
 {
  "id": "bogen-78",
  "band": "7-8"
 },
 {
  "id": "bogen-910",
  "band": "9-10"
 },
 {
  "id": "brettfahrer",
  "band": "5-6"
 },
 {
  "id": "brettfahrer-78",
  "band": "7-8"
 },
 {
  "id": "brettfahrer-910",
  "band": "9-10"
 },
 {
  "id": "eis",
  "band": "5-6"
 },
 {
  "id": "eis-78",
  "band": "7-8"
 },
 {
  "id": "eis-910",
  "band": "9-10"
 },
 {
  "id": "feuer",
  "band": "5-6"
 },
 {
  "id": "feuer-78",
  "band": "7-8"
 },
 {
  "id": "feuer-910",
  "band": "9-10"
 },
 {
  "id": "forscher",
  "band": "5-6"
 },
 {
  "id": "forscher-78",
  "band": "7-8"
 },
 {
  "id": "forscher-910",
  "band": "9-10"
 },
 {
  "id": "gaertner",
  "band": "5-6",
  "rolle": "heiler"
 },
 {
  "id": "gaertner-78",
  "band": "7-8",
  "rolle": "heiler"
 },
 {
  "id": "gaertner-910",
  "band": "9-10",
  "rolle": "heiler"
 },
 {
  "id": "gelehrter",
  "band": "5-6"
 },
 {
  "id": "gelehrter-78",
  "band": "7-8"
 },
 {
  "id": "gelehrter-910",
  "band": "9-10"
 },
 {
  "id": "heiler-78",
  "band": "7-8",
  "rolle": "heiler"
 },
 {
  "id": "heiler-910",
  "band": "9-10",
  "rolle": "heiler"
 },
 {
  "id": "heilerin",
  "band": "5-6",
  "rolle": "heiler"
 },
 {
  "id": "ingenieur",
  "band": "5-6",
  "rolle": "tank"
 },
 {
  "id": "ingenieur-78",
  "band": "7-8",
  "rolle": "tank"
 },
 {
  "id": "ingenieur-910",
  "band": "9-10",
  "rolle": "tank"
 },
 {
  "id": "kampfkunst",
  "band": "5-6"
 },
 {
  "id": "kampfkunst-78",
  "band": "7-8"
 },
 {
  "id": "kampfkunst-910",
  "band": "9-10"
 },
 {
  "id": "klang",
  "band": "5-6"
 },
 {
  "id": "klang-78",
  "band": "7-8"
 },
 {
  "id": "klang-910",
  "band": "9-10"
 },
 {
  "id": "kletterer",
  "band": "5-6"
 },
 {
  "id": "kletterer-78",
  "band": "7-8"
 },
 {
  "id": "kletterer-910",
  "band": "9-10"
 },
 {
  "id": "koch",
  "band": "5-6"
 },
 {
  "id": "koch-78",
  "band": "7-8"
 },
 {
  "id": "koch-910",
  "band": "9-10"
 },
 {
  "id": "lanze",
  "band": "5-6",
  "rolle": "tank"
 },
 {
  "id": "lanze-78",
  "band": "7-8",
  "rolle": "tank"
 },
 {
  "id": "lanze-910",
  "band": "9-10",
  "rolle": "tank"
 },
 {
  "id": "magier",
  "band": "5-6"
 },
 {
  "id": "magier-78",
  "band": "7-8"
 },
 {
  "id": "magier-910",
  "band": "9-10"
 },
 {
  "id": "maler",
  "band": "5-6"
 },
 {
  "id": "maler-78",
  "band": "7-8"
 },
 {
  "id": "maler-910",
  "band": "9-10"
 },
 {
  "id": "ritter-78",
  "band": "7-8",
  "rolle": "tank"
 },
 {
  "id": "ritter-910",
  "band": "9-10",
  "rolle": "tank"
 },
 {
  "id": "ritterin",
  "band": "5-6",
  "rolle": "tank"
 },
 {
  "id": "rollstuhl-bogen",
  "band": "5-6"
 },
 {
  "id": "rollstuhl-bogen-78",
  "band": "7-8"
 },
 {
  "id": "rollstuhl-bogen-910",
  "band": "9-10"
 },
 {
  "id": "rollstuhl-tueftler",
  "band": "5-6"
 },
 {
  "id": "rollstuhl-tueftler-78",
  "band": "7-8"
 },
 {
  "id": "rollstuhl-tueftler-910",
  "band": "9-10"
 },
 {
  "id": "schatten",
  "band": "5-6"
 },
 {
  "id": "schatten-78",
  "band": "7-8"
 },
 {
  "id": "schatten-910",
  "band": "9-10"
 },
 {
  "id": "schild",
  "band": "5-6",
  "rolle": "tank"
 },
 {
  "id": "schild-78",
  "band": "7-8",
  "rolle": "tank"
 },
 {
  "id": "schild-910",
  "band": "9-10",
  "rolle": "tank"
 },
 {
  "id": "schmied",
  "band": "5-6",
  "rolle": "tank"
 },
 {
  "id": "schmied-78",
  "band": "7-8",
  "rolle": "tank"
 },
 {
  "id": "schmied-910",
  "band": "9-10",
  "rolle": "tank"
 },
 {
  "id": "spaeher",
  "band": "5-6"
 },
 {
  "id": "spaeher-78",
  "band": "7-8"
 },
 {
  "id": "spaeher-910",
  "band": "9-10"
 },
 {
  "id": "sterne",
  "band": "5-6"
 },
 {
  "id": "sterne-78",
  "band": "7-8"
 },
 {
  "id": "sterne-910",
  "band": "9-10"
 },
 {
  "id": "sturm",
  "band": "5-6"
 },
 {
  "id": "sturm-78",
  "band": "7-8"
 },
 {
  "id": "sturm-910",
  "band": "9-10"
 },
 {
  "id": "trommler",
  "band": "5-6"
 },
 {
  "id": "trommler-78",
  "band": "7-8"
 },
 {
  "id": "trommler-910",
  "band": "9-10"
 },
 {
  "id": "tueftler",
  "band": "5-6"
 },
 {
  "id": "tueftler-78",
  "band": "7-8"
 },
 {
  "id": "tueftler-910",
  "band": "9-10"
 }
]

export const MONSTER_DATEN: { id: string; band: BossBand; welt: BossWelt; symbol: string; namen: Record<'de' | 'en' | 'fr' | 'es' | 'it' | 'la', string>; phasen: boolean }[] = [
 {
  "id": "abyssangler",
  "band": "9-10",
  "welt": "natur",
  "symbol": "🦖",
  "namen": {
   "de": "Abgrundangler",
   "en": "Abyss Angler",
   "fr": "Pêcheur des Abysses",
   "es": "Pescador Abisal",
   "it": "Pescatore degli Abissi",
   "la": "Piscator Abyssi"
  },
  "phasen": true
 },
 {
  "id": "aschenphoenix",
  "band": "9-10",
  "welt": "fantasy",
  "symbol": "🐉",
  "namen": {
   "de": "Aschenphönix",
   "en": "Ash Phoenix",
   "fr": "Phénix de Cendres",
   "es": "Fénix de Ceniza",
   "it": "Fenice di Cenere",
   "la": "Phoenix Cinerea"
  },
  "phasen": true
 },
 {
  "id": "basilisk",
  "band": "9-10",
  "welt": "fantasy",
  "symbol": "🐉",
  "namen": {
   "de": "Basilisk",
   "en": "Basilisk",
   "fr": "Basilic",
   "es": "Basilisco",
   "it": "Basilisco",
   "la": "Basiliscus"
  },
  "phasen": true
 },
 {
  "id": "brueckentroll",
  "band": "7-8",
  "welt": "fantasy",
  "symbol": "🐉",
  "namen": {
   "de": "Brückentroll",
   "en": "Bridge Troll",
   "fr": "Troll du Pont",
   "es": "Trol del Puente",
   "it": "Troll del Ponte",
   "la": "Trollus Pontis"
  },
  "phasen": true
 },
 {
  "id": "chimaera",
  "band": "9-10",
  "welt": "mythos",
  "symbol": "🏛️",
  "namen": {
   "de": "Chimära",
   "en": "Chimera",
   "fr": "Chimère",
   "es": "Quimera",
   "it": "Chimera",
   "la": "Chimaera"
  },
  "phasen": true
 },
 {
  "id": "donnergorilla",
  "band": "7-8",
  "welt": "natur",
  "symbol": "🦖",
  "namen": {
   "de": "Donnergorilla",
   "en": "Thunder Gorilla",
   "fr": "Gorille Tonnerre",
   "es": "Gorila Trueno",
   "it": "Gorilla Tuono",
   "la": "Gorilla Tonans"
  },
  "phasen": true
 },
 {
  "id": "donnerzahn",
  "band": "5-6",
  "welt": "natur",
  "symbol": "🦖",
  "namen": {
   "de": "Donnerzahn",
   "en": "Thunderjaw",
   "fr": "Croc-Tonnerre",
   "es": "Colmillo Trueno",
   "it": "Zanna Tuono",
   "la": "Dens Tonans"
  },
  "phasen": true
 },
 {
  "id": "drache",
  "band": "5-6",
  "welt": "fantasy",
  "symbol": "🐉",
  "namen": {
   "de": "Grammatik-Drache",
   "en": "Grammar Dragon",
   "fr": "Dragon de grammaire",
   "es": "Dragón gramatical",
   "it": "Drago della grammatica",
   "la": "Draco grammaticus"
  },
  "phasen": true
 },
 {
  "id": "dreihund",
  "band": "7-8",
  "welt": "mythos",
  "symbol": "🏛️",
  "namen": {
   "de": "Dreihund",
   "en": "Three-Hound",
   "fr": "Chien à Trois Têtes",
   "es": "Perro Tricéfalo",
   "it": "Cane a Tre Teste",
   "la": "Canis Triceps"
  },
  "phasen": true
 },
 {
  "id": "dreikopf",
  "band": "5-6",
  "welt": "mythos",
  "symbol": "🏛️",
  "namen": {
   "de": "Dreikopf",
   "en": "Triple-Head",
   "fr": "Trois-Têtes",
   "es": "Tricéfalo",
   "it": "Tritesta",
   "la": "Triceps"
  },
  "phasen": true
 },
 {
  "id": "einauge",
  "band": "5-6",
  "welt": "mythos",
  "symbol": "🏛️",
  "namen": {
   "de": "Einauge",
   "en": "One-Eye",
   "fr": "Œil-Unique",
   "es": "Ojo Único",
   "it": "Occhio Solo",
   "la": "Monoculus"
  },
  "phasen": true
 },
 {
  "id": "fenris",
  "band": "9-10",
  "welt": "mythos",
  "symbol": "🏛️",
  "namen": {
   "de": "Fenriswolf",
   "en": "Fenris Wolf",
   "fr": "Loup Fenrir",
   "es": "Lobo Fenrir",
   "it": "Lupo Fenrir",
   "la": "Lupus Fenrir"
  },
  "phasen": true
 },
 {
  "id": "flussraeuber",
  "band": "9-10",
  "welt": "natur",
  "symbol": "🦖",
  "namen": {
   "de": "Flussräuber",
   "en": "River Raider",
   "fr": "Pillard du Fleuve",
   "es": "Saqueador del Río",
   "it": "Predone del Fiume",
   "la": "Praedo Fluminis"
  },
  "phasen": true
 },
 {
  "id": "frostfaust",
  "band": "7-8",
  "welt": "fantasy",
  "symbol": "🐉",
  "namen": {
   "de": "Frostfaust",
   "en": "Frostfist",
   "fr": "Poing-de-Givre",
   "es": "Puño de Hielo",
   "it": "Pugno di Gelo",
   "la": "Pugnus Gelidus"
  },
  "phasen": true
 },
 {
  "id": "glibber",
  "band": "5-6",
  "welt": "weltraum",
  "symbol": "👾",
  "namen": {
   "de": "Glibberix",
   "en": "Wobblox",
   "fr": "Gloubix",
   "es": "Gelatinox",
   "it": "Gelatinox",
   "la": "Gelatinus"
  },
  "phasen": true
 },
 {
  "id": "golem",
  "band": "5-6",
  "welt": "fantasy",
  "symbol": "🗿",
  "namen": {
   "de": "Wort-Golem",
   "en": "Word Golem",
   "fr": "Golem des mots",
   "es": "Gólem de palabras",
   "it": "Golem delle parole",
   "la": "Golem verborum"
  },
  "phasen": true
 },
 {
  "id": "gorgo",
  "band": "7-8",
  "welt": "mythos",
  "symbol": "🏛️",
  "namen": {
   "de": "Gorgo",
   "en": "Gorgo",
   "fr": "Gorgo",
   "es": "Gorgo",
   "it": "Gorgo",
   "la": "Gorgo"
  },
  "phasen": true
 },
 {
  "id": "krake",
  "band": "5-6",
  "welt": "fantasy",
  "symbol": "🐙",
  "namen": {
   "de": "Vokabel-Krake",
   "en": "Vocab Kraken",
   "fr": "Kraken du vocabulaire",
   "es": "Kraken del vocabulario",
   "it": "Kraken del lessico",
   "la": "Polypus verborum"
  },
  "phasen": true
 },
 {
  "id": "kraterwurm",
  "band": "7-8",
  "welt": "weltraum",
  "symbol": "👾",
  "namen": {
   "de": "Kraterwurm",
   "en": "Crater Worm",
   "fr": "Ver des Cratères",
   "es": "Gusano Cráter",
   "it": "Verme dei Crateri",
   "la": "Vermis Craterum"
  },
  "phasen": true
 },
 {
  "id": "lavaechse",
  "band": "9-10",
  "welt": "natur",
  "symbol": "🦖",
  "namen": {
   "de": "Lavaechse",
   "en": "Lava Lizard",
   "fr": "Lézard de Lave",
   "es": "Lagarto de Lava",
   "it": "Lucertola di Lava",
   "la": "Lacerta Lavae"
  },
  "phasen": true
 },
 {
  "id": "nebelqualle",
  "band": "9-10",
  "welt": "weltraum",
  "symbol": "👾",
  "namen": {
   "de": "Nebelqualle",
   "en": "Nebula Jellyfish",
   "fr": "Méduse Nébuleuse",
   "es": "Medusa Nebulosa",
   "it": "Medusa Nebulosa",
   "la": "Medusa Nebulae"
  },
  "phasen": true
 },
 {
  "id": "omega",
  "band": "9-10",
  "welt": "weltraum",
  "symbol": "👾",
  "namen": {
   "de": "Omega-Tyrann",
   "en": "Omega Tyrant",
   "fr": "Tyran Oméga",
   "es": "Tirano Omega",
   "it": "Tiranno Omega",
   "la": "Tyrannus Omega"
  },
  "phasen": true
 },
 {
  "id": "raetselsphinx",
  "band": "9-10",
  "welt": "mythos",
  "symbol": "🏛️",
  "namen": {
   "de": "Rätselsphinx",
   "en": "Riddle Sphinx",
   "fr": "Sphinx des Énigmes",
   "es": "Esfinge de los Enigmas",
   "it": "Sfinge degli Enigmi",
   "la": "Sphinx Aenigmatum"
  },
  "phasen": true
 },
 {
  "id": "saebelzahn",
  "band": "7-8",
  "welt": "natur",
  "symbol": "🦖",
  "namen": {
   "de": "Säbelzahn",
   "en": "Sabretooth",
   "fr": "Dents-de-Sabre",
   "es": "Dientes de Sable",
   "it": "Denti a Sciabola",
   "la": "Dens Gladii"
  },
  "phasen": true
 },
 {
  "id": "schattenritter",
  "band": "9-10",
  "welt": "fantasy",
  "symbol": "🐉",
  "namen": {
   "de": "Schattenritter",
   "en": "Shadow Knight",
   "fr": "Chevalier des Ombres",
   "es": "Caballero Sombrío",
   "it": "Cavaliere Ombra",
   "la": "Eques Umbrarum"
  },
  "phasen": true
 },
 {
  "id": "schraubomat",
  "band": "5-6",
  "welt": "weltraum",
  "symbol": "👾",
  "namen": {
   "de": "Schraubomat",
   "en": "Bolt-o-Tron",
   "fr": "Boulonator",
   "es": "Tornillotrón",
   "it": "Bullonator",
   "la": "Cochleator"
  },
  "phasen": true
 },
 {
  "id": "schwarmkoenigin",
  "band": "9-10",
  "welt": "weltraum",
  "symbol": "👾",
  "namen": {
   "de": "Schwarmkönigin",
   "en": "Swarm Queen",
   "fr": "Reine de l'Essaim",
   "es": "Reina del Enjambre",
   "it": "Regina dello Sciame",
   "la": "Regina Examinis"
  },
  "phasen": true
 },
 {
  "id": "stachelfuerst",
  "band": "7-8",
  "welt": "natur",
  "symbol": "🦖",
  "namen": {
   "de": "Stachelfürst",
   "en": "Sting Lord",
   "fr": "Seigneur Dard",
   "es": "Señor Aguijón",
   "it": "Signore del Pungiglione",
   "la": "Dominus Aculei"
  },
  "phasen": true
 },
 {
  "id": "stahlspinne",
  "band": "7-8",
  "welt": "weltraum",
  "symbol": "👾",
  "namen": {
   "de": "Stahlspinne",
   "en": "Steel Spider",
   "fr": "Araignée d'Acier",
   "es": "Araña de Acero",
   "it": "Ragno d'Acciaio",
   "la": "Aranea Ferrea"
  },
  "phasen": true
 },
 {
  "id": "steinfratze",
  "band": "7-8",
  "welt": "fantasy",
  "symbol": "🐉",
  "namen": {
   "de": "Steinfratze",
   "en": "Stoneface",
   "fr": "Gueule-de-Pierre",
   "es": "Cara de Piedra",
   "it": "Faccia di Pietra",
   "la": "Facies Saxea"
  },
  "phasen": true
 },
 {
  "id": "stierkopf",
  "band": "5-6",
  "welt": "mythos",
  "symbol": "🏛️",
  "namen": {
   "de": "Stierkopf",
   "en": "Bullhorn",
   "fr": "Tête-de-Taureau",
   "es": "Cabeza de Toro",
   "it": "Testa di Toro",
   "la": "Taurocephalus"
  },
  "phasen": true
 },
 {
  "id": "sturmgreif",
  "band": "7-8",
  "welt": "mythos",
  "symbol": "🏛️",
  "namen": {
   "de": "Sturmgreif",
   "en": "Storm Griffin",
   "fr": "Griffon des Tempêtes",
   "es": "Grifo de la Tormenta",
   "it": "Grifone della Tempesta",
   "la": "Gryps Procellae"
  },
  "phasen": true
 },
 {
  "id": "teufel",
  "band": "5-6",
  "welt": "fantasy",
  "symbol": "👹",
  "namen": {
   "de": "Fehlerteufel",
   "en": "Mistake Devil",
   "fr": "Diable des fautes",
   "es": "Diablo de errores",
   "it": "Diavolo degli errori",
   "la": "Daemon errorum"
  },
  "phasen": true
 },
 {
  "id": "ufolino",
  "band": "5-6",
  "welt": "weltraum",
  "symbol": "👾",
  "namen": {
   "de": "Ufolino",
   "en": "Saucerpus",
   "fr": "Soucoupus",
   "es": "Platillín",
   "it": "Dischetto",
   "la": "Patellus"
  },
  "phasen": true
 },
 {
  "id": "zorg",
  "band": "7-8",
  "welt": "weltraum",
  "symbol": "👾",
  "namen": {
   "de": "Zorg der Eroberer",
   "en": "Zorg the Conqueror",
   "fr": "Zorg le Conquérant",
   "es": "Zorg el Conquistador",
   "it": "Zorg il Conquistatore",
   "la": "Zorg Victor"
  },
  "phasen": true
 },
 {
  "id": "zottelmammut",
  "band": "5-6",
  "welt": "natur",
  "symbol": "🦖",
  "namen": {
   "de": "Zottelmammut",
   "en": "Shaggy Mammoth",
   "fr": "Mammouth Touffu",
   "es": "Mamut Greñudo",
   "it": "Mammut Arruffato",
   "la": "Mammut Villosus"
  },
  "phasen": true
 },
 {
  "id": "zwickzange",
  "band": "5-6",
  "welt": "natur",
  "symbol": "🦖",
  "namen": {
   "de": "Zwickzange",
   "en": "Pinchclaw",
   "fr": "Pince-Pince",
   "es": "Pinzamás",
   "it": "Pinzafurba",
   "la": "Forfex"
  },
  "phasen": true
 }
]

export const HINTERGRUND_DATEN: { id: string; band: BossBand; welt: BossWelt }[] = [
 {
  "id": "asteroiden-78",
  "band": "7-8",
  "welt": "weltraum"
 },
 {
  "id": "asteroiden-910",
  "band": "9-10",
  "welt": "weltraum"
 },
 {
  "id": "burgarena",
  "band": "5-6",
  "welt": "fantasy"
 },
 {
  "id": "canyon-78",
  "band": "7-8",
  "welt": "natur"
 },
 {
  "id": "canyon-910",
  "band": "9-10",
  "welt": "natur"
 },
 {
  "id": "cyberdach-910",
  "band": "9-10",
  "welt": "weltraum"
 },
 {
  "id": "drachenhort-910",
  "band": "9-10",
  "welt": "fantasy"
 },
 {
  "id": "dschungel-56",
  "band": "5-6",
  "welt": "natur"
 },
 {
  "id": "eisschloss-78",
  "band": "7-8",
  "welt": "fantasy"
 },
 {
  "id": "eisschloss-910",
  "band": "9-10",
  "welt": "fantasy"
 },
 {
  "id": "fjord-78",
  "band": "7-8",
  "welt": "mythos"
 },
 {
  "id": "fjord-910",
  "band": "9-10",
  "welt": "mythos"
 },
 {
  "id": "gletscher-56",
  "band": "5-6",
  "welt": "natur"
 },
 {
  "id": "gletscher-78",
  "band": "7-8",
  "welt": "natur"
 },
 {
  "id": "grabkammer-910",
  "band": "9-10",
  "welt": "mythos"
 },
 {
  "id": "kristallwueste-56",
  "band": "5-6",
  "welt": "weltraum"
 },
 {
  "id": "kristallwueste-78",
  "band": "7-8",
  "welt": "weltraum"
 },
 {
  "id": "labyrinth-56",
  "band": "5-6",
  "welt": "mythos"
 },
 {
  "id": "labyrinth-78",
  "band": "7-8",
  "welt": "mythos"
 },
 {
  "id": "mondkrater-56",
  "band": "5-6",
  "welt": "weltraum"
 },
 {
  "id": "mondkrater-78",
  "band": "7-8",
  "welt": "weltraum"
 },
 {
  "id": "mondkrater-910",
  "band": "9-10",
  "welt": "weltraum"
 },
 {
  "id": "raumstation-56",
  "band": "5-6",
  "welt": "weltraum"
 },
 {
  "id": "riff-910",
  "band": "9-10",
  "welt": "natur"
 },
 {
  "id": "ruine-78",
  "band": "7-8",
  "welt": "fantasy"
 },
 {
  "id": "ruine-910",
  "band": "9-10",
  "welt": "fantasy"
 },
 {
  "id": "tempel-56",
  "band": "5-6",
  "welt": "mythos"
 },
 {
  "id": "vulkankrater-56",
  "band": "5-6",
  "welt": "fantasy"
 },
 {
  "id": "vulkankrater-78",
  "band": "7-8",
  "welt": "fantasy"
 },
 {
  "id": "zauberwald-56",
  "band": "5-6",
  "welt": "fantasy"
 }
]

export const BEGLEITER_DATEN: string[] = ["eule", "fuchs", "greif", "minidrache", "qualle", "roboter", "schildkroete", "stern"]
