"""Motivkatalog des Boss-Kampfs (17.11.2026, abgestimmt mit der Lehrkraft).

Vier Jahrgangsbänder (5-6, 7-8, 9-10, 11-13) mit eigenem Stil und Alter der Figuren, vier Welten (Fantasy, Weltraum,
Natur/Urzeit, Mythologie). Je Band 30 Spielerfiguren (davon 2 im Rollstuhl), 12 Monster (3 je Welt) mit Rüstungs- und
Raserei-Fassung, 10 Hintergründe; dazu Begleiter (Ausrüstung) für alle Bänder.

  python -I katalog.py <ausgabeordner>   → <name>.txt je Bildauftrag, auftraege.txt (Reihenfolge), katalog.json

Bildnamen wie in der App (renderer/src/assets/klassenspiele/boss/): held-<id>-<pose>, boss-<id>-<pose>, hg-<id>,
begleiter-<id>. Band 5-6 hat schon ritterin, magier, bogen, heilerin, tueftler, drache, krake, teufel, golem, burgarena.
"""
import json
import os
import sys

BAENDER = {
    "56": {
        "band": "5-6",
        "alter": "about 11 years old",
        "stil": "stylized 3D cartoon render in the style of a modern animated family film (soft studio lighting, rounded friendly shapes, rich saturated colours, crisp clean edges)",
        "monsterton": "grumpy and a bit silly, cute rather than scary, suitable for 10-year-olds",
    },
    "78": {
        "band": "7-8",
        "alter": "about 13 years old, early teenager",
        "stil": "stylized 3D render like a modern action-adventure animated series for teenagers (cinematic lighting, slightly more realistic proportions than a kids' film, dynamic and confident, detailed materials, crisp clean edges)",
        "monsterton": "dangerous-looking but with a touch of humour, never gory, suitable for 12- to 14-year-olds",
    },
    "910": {
        "band": "9-10",
        "alter": "about 15 years old, teenager",
        "stil": "bold cel-shaded graphic-novel game art with clean thick outlines, dramatic rim lighting, strong shapes and a cool, stylish attitude (not cute, not childish)",
        "monsterton": "impressive and threatening, epic boss energy, no blood or gore, suitable for 14- to 16-year-olds",
    },
    "1113": {
        "band": "11-13",
        "alter": "about 17 to 18 years old, young adult",
        "stil": "painterly semi-realistic fantasy concept art like a high-end video game character illustration (elegant, detailed lighting and textures, mature and stylish, cleanly separated silhouette)",
        "monsterton": "epic and imposing with a hint of dry irony, no blood or gore, suitable for 16- to 19-year-olds",
    },
}

# ---------------------------------------------------------------- Spielerfiguren (weltneutrale Abenteuer-Ausrüstung)
# (id, Rolle und Ausrüstung, Angriff nach rechts, Kleidungsfarben – nie Grün wegen Chromakey)
ARCHETYPEN = [
    ("ritter", "a knight with a short gleaming sword and a round shield, light silver armour over a tunic", "a big sword slash to the right", "royal blue and gold"),
    ("magier", "a mage with a wooden staff topped with a glowing crystal and a robe with small star patterns", "casting a bright blue magic bolt to the right", "deep purple and gold"),
    ("bogen", "an archer with a wooden bow, a quiver and a hooded tunic with a leather vest", "releasing a glowing golden arrow to the right", "orange and brown"),
    ("heiler", "a healer with a golden staff topped with a shining sun disc and a long tunic with golden trim", "hurling a radiant golden light orb to the right", "white and magenta"),
    ("tueftler", "an inventor with brass goggles, overalls with many pockets, a small backpack with gears and a big glowing brass hammer", "swinging the hammer forward with an orange spark burst", "sunny yellow and brass"),
    ("spaeher", "a nimble scout with a hooded cloak and two short daggers", "a fast dashing double slash to the right with motion streaks", "charcoal grey and crimson"),
    ("lanze", "a spear fighter with a long spear with a glowing tip and a light breastplate", "a powerful spear thrust to the right", "teal-blue and silver"),
    ("kampfkunst", "a martial artist in a simple training outfit with a belt and wrapped hands", "a palm strike to the right releasing a wave of blue energy", "white and sky blue"),
    ("barde", "a musician with a magical lute and a feathered hat", "strumming the lute so that glowing golden music notes fly to the right", "burgundy and gold"),
    ("alchemist", "an alchemist with a belt full of colourful potion flasks and a leather coat", "throwing a bubbling glowing pink potion to the right", "brown leather and pink"),
    ("sturm", "a storm caller with metal gauntlets crackling with electricity and a flowing scarf", "shooting a jagged lightning bolt to the right", "navy blue and electric yellow"),
    ("eis", "an ice mage with a crystal staff and a fur-trimmed coat", "casting a spray of sharp ice crystals to the right", "ice blue and white"),
    ("feuer", "a fire mage with glowing fireproof gloves and a short cape", "hurling a big fireball to the right", "red and black"),
    ("schatten", "a shadow agent in dark close-fitting clothes with two blades glowing violet", "a swift violet shadow slash to the right", "black and violet"),
    ("schild", "a guardian with a huge rectangular tower shield and a short mace", "a mighty shield bash to the right with a shockwave", "steel grey and royal blue"),
    ("schmied", "a blacksmith with a leather apron, rolled-up sleeves and a heavy glowing forge hammer", "slamming the hammer down so that glowing cracks run to the right", "brown leather and orange"),
    ("forscher", "an explorer with a wide-brimmed hat, a compass, a rope and a glowing grappling hook", "swinging the glowing grappling hook to the right", "khaki and red"),
    ("sterne", "an astronomer with a long telescope-staff and a cape with constellations", "firing a beam of starlight from the telescope-staff to the right", "midnight blue and silver"),
    ("maler", "a painter with a giant magic paintbrush and a paint-splattered smock", "sweeping the brush so that a rainbow wave of paint flies to the right", "white with rainbow splashes"),
    ("trommler", "a drummer with a magical drum at the hip and drumsticks", "beating the drum so that visible golden shockwave rings travel to the right", "red and gold"),
    ("koch", "an adventure cook with a big frying pan, a ladle and an apron (funny)", "swinging the frying pan to the right with comic impact stars", "white and red check"),
    ("gaertner", "a gardener with a magic watering can and a straw hat", "pouring the watering can so that glowing golden roots burst out to the right", "sunflower yellow and blue denim"),
    ("ballkuenstler", "an athlete with sports clothes and a glowing magic ball", "kicking the glowing ball powerfully to the right", "orange and white"),
    ("brettfahrer", "a rider of a glowing hoverboard with knee pads and a helmet", "dashing to the right on the hoverboard leaving a light trail", "turquoise and purple"),
    ("klang", "a sound hero with big headphones and a sound blaster device", "firing visible pink sound waves to the right", "black and neon pink"),
    ("kletterer", "a climber with a harness, rope and an ice axe", "striking with the ice axe to the right", "red and grey"),
    ("gelehrter", "a scholar with glasses and a giant floating spellbook", "letting a storm of glowing pages fly from the book to the right", "dark blue and parchment beige"),
    ("ingenieur", "an engineer with a sturdy mechanical robot arm and a tool belt", "a rocket punch with the robot arm to the right", "grey metal and orange"),
    ("rollstuhl-tueftler", "a hero in a high-tech wheelchair with glowing wheels and a small cannon mounted on the armrest", "firing a bright energy beam from the armrest cannon to the right", "silver and electric blue"),
    ("rollstuhl-bogen", "an archer in a sporty wheelchair with a bow and a quiver on the back of the chair", "releasing a glowing arrow to the right while seated", "red and white"),
]
SCHON_56 = {"ritter": "ritterin", "magier": "magier", "bogen": "bogen", "heiler": "heilerin", "tueftler": "tueftler"}

HAUT = ["light skin", "warm brown skin", "dark brown skin", "olive skin", "East Asian features and light skin", "South Asian features and brown skin",
        "freckled fair skin", "deep dark skin", "tan skin", "light skin with rosy cheeks"]
HAAR_M = ["short curly black hair", "messy blond hair", "a short black undercut", "wavy brown hair", "a short afro", "spiky red hair", "neat dark side-parted hair", "shaggy light-brown hair"]
HAAR_W = ["a long brown braid", "a high black ponytail", "short curly black hair", "long wavy red hair", "a magenta hijab", "two dark buns", "a blonde bob", "long black hair with a headband"]
EXTRA = ["", "", "round glasses", "", "a small scar on the eyebrow", "", "a friendly gap-toothed grin", "", "freckles", ""]

def aussehen(i, bandnr):
    k = i * 7 + bandnr * 3
    weiblich = (i + bandnr) % 2 == 0
    haar = (HAAR_W if weiblich else HAAR_M)[k % 8]
    extra = EXTRA[(k + 3) % len(EXTRA)]
    return ("girl" if weiblich else "boy"), f"{HAUT[k % len(HAUT)]}, {haar}" + (f", {extra}" if extra else "")


def figurenprompt(b, arch, i, bandnr):
    st = BAENDER[b]
    aid, rolle, angriff, farben = arch
    geschlecht, look = aussehen(i, bandnr)
    person = {"56": geschlecht, "78": f"teen {geschlecht}", "910": f"teenage {geschlecht}", "1113": "young woman" if geschlecht == "girl" else "young man"}[b]
    rollstuhl = aid.startswith("rollstuhl")
    getroffen = "getting hit: the wheelchair tilting back on two wheels, the hero bracing with eyes squeezed shut, cartoon impact (no blood)" if rollstuhl else "getting hit, recoiling backward to the left, eyes squeezed shut, cartoon impact (no blood)"
    besiegt = "defeated: slumped exhausted and dizzy in the wheelchair, dizzy stars above the head (still sitting in the chair)" if rollstuhl else "defeated, sitting on the ground exhausted and dizzy"
    return f"""Character sheet for a classroom video game, {st['stil']}.
The character: a {person}, {st['alter']}, {look}; {rolle}; clothing colours {farben}. Determined, likeable expression. Full body{'' if rollstuhl else ', shoes visible'}.
Layout: exactly four poses of the SAME character arranged in a 2x2 grid, one pose centred in each quadrant, full body, every pose facing to the RIGHT (three-quarter view toward the right side), generous empty space around each pose, no part of a pose crossing into another quadrant:
top-left: idle battle stance, ready and confident;
top-right: attacking toward the right: {angriff};
bottom-left: {getroffen};
bottom-right: {besiegt}.
Background: one completely flat, uniform, solid chroma-key green (#00B140) everywhere, no gradient, no floor, no cast shadows, no ground line, no vignette. Do not use any green on the character.
Absolutely no text, letters, numbers, labels, frames, grid lines, logos or watermark. Not a copy of any existing game, film or franchise character."""


# ---------------------------------------------------------------- Monster: (id, band, welt, beschreibung, angriff, namen de/en/fr/es/it/la)
MONSTER = [
    # Band 5-6 (Fantasy schon: drache, krake, teufel, golem)
    ("glibber", "56", "weltraum", "a wobbly translucent violet slime alien with three curious eyes on stalks and little tentacle arms", "spitting a big gooey violet slime ball to the left", ["Glibberix", "Wobblox", "Gloubix", "Gelatinox", "Gelatinox", "Gelatinus"]),
    ("schraubomat", "56", "weltraum", "a big clunky old robot with dented orange and grey plates, one flickering antenna and spring arms", "punching with a spring-loaded fist that shoots out to the left", ["Schraubomat", "Bolt-o-Tron", "Boulonator", "Tornillotrón", "Bullonator", "Cochleator"]),
    ("ufolino", "56", "weltraum", "a chubby blue alien octopus sitting inside a small flying saucer with blinking lights", "firing a wobbly tractor beam of light to the left", ["Ufolino", "Saucerpus", "Soucoupus", "Platillín", "Dischetto", "Patellus"]),
    ("donnerzahn", "56", "natur", "a chubby red-orange T-rex with tiny arms, big teeth and a grumpy face", "roaring a visible blast of wind to the left", ["Donnerzahn", "Thunderjaw", "Croc-Tonnerre", "Colmillo Trueno", "Zanna Tuono", "Dens Tonans"]),
    ("zottelmammut", "56", "natur", "a huge shaggy brown mammoth with long curved tusks and a tiny snow cap on its head", "charging to the left with tusks lowered, snow flying", ["Zottelmammut", "Shaggy Mammoth", "Mammouth Touffu", "Mamut Greñudo", "Mammut Arruffato", "Mammut Villosus"]),
    ("zwickzange", "56", "natur", "a giant bright red crab with oversized pincers and googly eyes", "snapping a huge pincer to the left with water splashes", ["Zwickzange", "Pinchclaw", "Pince-Pince", "Pinzamás", "Pinzafurba", "Forfex"]),
    ("stierkopf", "56", "mythos", "a big friendly-grumpy minotaur with a bull head, nose ring, small horns and a stone club", "swinging the stone club to the left", ["Stierkopf", "Bullhorn", "Tête-de-Taureau", "Cabeza de Toro", "Testa di Toro", "Taurocephalus"]),
    ("einauge", "56", "mythos", "a round clumsy cyclops with one huge blinking eye, a fur tunic and a tree-trunk club", "throwing a boulder to the left", ["Einauge", "One-Eye", "Œil-Unique", "Ojo Único", "Occhio Solo", "Monoculus"]),
    ("dreikopf", "56", "mythos", "a small cute three-headed hydra serpent in teal-blue with each head pulling a different silly face", "all three heads spitting water jets to the left", ["Dreikopf", "Triple-Head", "Trois-Têtes", "Tricéfalo", "Tritesta", "Triceps"]),
    # Band 7-8
    ("brueckentroll", "78", "fantasy", "a massive moss-free grey-blue troll with a big nose, warty skin, a leather loincloth and a bridge beam as club", "smashing the bridge-beam club to the left", ["Brückentroll", "Bridge Troll", "Troll du Pont", "Trol del Puente", "Troll del Ponte", "Trollus Pontis"]),
    ("steinfratze", "78", "fantasy", "a winged stone gargoyle with glowing yellow eyes, sharp stone claws and cracked grey skin", "diving to the left with claws out", ["Steinfratze", "Stoneface", "Gueule-de-Pierre", "Cara de Piedra", "Faccia di Pietra", "Facies Saxea"]),
    ("frostfaust", "78", "fantasy", "a hulking ice giant made of blue glacier ice with a frosty beard and enormous fists", "hurling a giant ice boulder to the left", ["Frostfaust", "Frostfist", "Poing-de-Givre", "Puño de Hielo", "Pugno di Gelo", "Pugnus Gelidus"]),
    ("stahlspinne", "78", "weltraum", "a giant mechanical spider robot with chrome legs, a red visor eye and cables", "shooting a glowing energy net to the left", ["Stahlspinne", "Steel Spider", "Araignée d'Acier", "Araña de Acero", "Ragno d'Acciaio", "Aranea Ferrea"]),
    ("zorg", "78", "weltraum", "a tall arrogant alien conqueror with purple skin, a crested helmet, a cape and a ray gun", "firing the ray gun to the left with a swirling beam", ["Zorg der Eroberer", "Zorg the Conqueror", "Zorg le Conquérant", "Zorg el Conquistador", "Zorg il Conquistatore", "Zorg Victor"]),
    ("kraterwurm", "78", "weltraum", "a huge armoured space worm bursting out of a moon rock, with a round mouth of stone teeth", "lunging out to the left, spraying moon dust", ["Kraterwurm", "Crater Worm", "Ver des Cratères", "Gusano Cráter", "Verme dei Crateri", "Vermis Craterum"]),
    ("saebelzahn", "78", "natur", "a powerful sabre-toothed cat with striped tawny fur and two long sabre fangs", "pouncing to the left with claws out", ["Säbelzahn", "Sabretooth", "Dents-de-Sabre", "Dientes de Sable", "Denti a Sciabola", "Dens Gladii"]),
    ("stachelfuerst", "78", "natur", "a giant desert scorpion with a black armoured shell, a glowing orange stinger and big pincers", "striking with its stinger to the left", ["Stachelfürst", "Sting Lord", "Seigneur Dard", "Señor Aguijón", "Signore del Pungiglione", "Dominus Aculei"]),
    ("donnergorilla", "78", "natur", "a giant silverback gorilla king with a small golden crown and huge fists", "drumming its chest and slamming the ground to the left with a shockwave", ["Donnergorilla", "Thunder Gorilla", "Gorille Tonnerre", "Gorila Trueno", "Gorilla Tuono", "Gorilla Tonans"]),
    ("sturmgreif", "78", "mythos", "a fierce griffin with an eagle head, golden-brown feathers, lion body and storm clouds around its wings", "beating its wings to send a gust of wind and feathers to the left", ["Sturmgreif", "Storm Griffin", "Griffon des Tempêtes", "Grifo de la Tormenta", "Grifone della Tempesta", "Gryps Procellae"]),
    ("dreihund", "78", "mythos", "a three-headed giant guard dog with dark fur, glowing amber eyes and a spiked collar", "all three heads barking a visible shockwave to the left", ["Dreihund", "Three-Hound", "Chien à Trois Têtes", "Perro Tricéfalo", "Cane a Tre Teste", "Canis Triceps"]),
    ("gorgo", "78", "mythos", "a gorgon with snakes as hair, green-free bronze scales, golden armour and glowing eyes (not scary-gory)", "shooting a stone-turning beam from her eyes to the left", ["Gorgo", "Gorgo", "Gorgo", "Gorgo", "Gorgo", "Gorgo"]),
    # Band 9-10
    ("schattenritter", "910", "fantasy", "a towering dark knight in jagged black armour with violet glowing visor slits and a huge two-handed sword", "a sweeping violet sword slash to the left", ["Schattenritter", "Shadow Knight", "Chevalier des Ombres", "Caballero Sombrío", "Cavaliere Ombra", "Eques Umbrarum"]),
    ("basilisk", "910", "fantasy", "a gigantic serpent king with a bony crown frill, golden eyes and dark scales", "lunging to the left with jaws open and a petrifying gaze", ["Basilisk", "Basilisk", "Basilic", "Basilisco", "Basilisco", "Basiliscus"]),
    ("aschenphoenix", "910", "fantasy", "a giant firebird made of flames and ash with burning wings spread wide", "sending a wave of fire feathers to the left", ["Aschenphönix", "Ash Phoenix", "Phénix de Cendres", "Fénix de Ceniza", "Fenice di Cenere", "Phoenix Cinerea"]),
    ("omega", "910", "weltraum", "a massive cyborg tyrant with a half-metal face, glowing red eye, heavy power armour and a plasma cannon arm", "firing the plasma cannon to the left", ["Omega-Tyrann", "Omega Tyrant", "Tyran Oméga", "Tirano Omega", "Tiranno Omega", "Tyrannus Omega"]),
    ("nebelqualle", "910", "weltraum", "an enormous glowing space jellyfish with a nebula-coloured bell and long electric tentacles", "lashing electric tentacles to the left", ["Nebelqualle", "Nebula Jellyfish", "Méduse Nébuleuse", "Medusa Nebulosa", "Medusa Nebulosa", "Medusa Nebulae"]),
    ("schwarmkoenigin", "910", "weltraum", "a giant insectoid alien queen with an armoured exoskeleton, four arms and translucent wings", "unleashing a swarm of glowing insect drones to the left", ["Schwarmkönigin", "Swarm Queen", "Reine de l'Essaim", "Reina del Enjambre", "Regina dello Sciame", "Regina Examinis"]),
    ("lavaechse", "910", "natur", "a huge volcano lizard with black rock scales and glowing orange lava cracks", "breathing a stream of lava to the left", ["Lavaechse", "Lava Lizard", "Lézard de Lave", "Lagarto de Lava", "Lucertola di Lava", "Lacerta Lavae"]),
    ("abyssangler", "910", "natur", "a giant deep-sea anglerfish with a glowing lure, needle teeth and dark blue skin", "lunging to the left out of dark water with the lure flashing", ["Abgrundangler", "Abyss Angler", "Pêcheur des Abysses", "Pescador Abisal", "Pescatore degli Abissi", "Piscator Abyssi"]),
    ("flussraeuber", "910", "natur", "a massive spinosaurus with a tall sail on its back, a crocodile-like snout and dark red markings", "snapping its long jaws to the left with water spray", ["Flussräuber", "River Raider", "Pillard du Fleuve", "Saqueador del Río", "Predone del Fiume", "Praedo Fluminis"]),
    ("fenris", "910", "mythos", "a colossal grey wolf from northern legend with broken chains on its legs and icy blue eyes", "leaping to the left with jaws open and chains flying", ["Fenriswolf", "Fenris Wolf", "Loup Fenrir", "Lobo Fenrir", "Lupo Fenrir", "Lupus Fenrir"]),
    ("raetselsphinx", "910", "mythos", "a giant sphinx with a lion body, golden headdress, wings and calm piercing eyes", "sending glowing golden riddle-like symbols (no letters) to the left", ["Rätselsphinx", "Riddle Sphinx", "Sphinx des Énigmes", "Esfinge de los Enigmas", "Sfinge degli Enigmi", "Sphinx Aenigmatum"]),
    ("chimaera", "910", "mythos", "a chimera with a lion head, a goat head on its back and a serpent tail", "the lion head breathing fire to the left", ["Chimära", "Chimera", "Chimère", "Quimera", "Chimera", "Chimaera"]),
    # Band 11-13
    ("knochenkoenig", "1113", "fantasy", "a skeletal lich king in a tattered royal robe with a jagged crown, glowing teal-blue eye lights and a staff (no gore)", "casting a swirling spell of cold blue light to the left", ["Knochenkönig", "Bone King", "Roi des Os", "Rey de los Huesos", "Re delle Ossa", "Rex Ossium"]),
    ("uraltdrache", "1113", "fantasy", "an ancient colossal dragon with weathered bronze scales, broken horns and wise burning eyes", "breathing a torrent of golden fire to the left", ["Uralter Drache", "Elder Dragon", "Dragon Ancestral", "Dragón Ancestral", "Drago Ancestrale", "Draco Antiquus"]),
    ("gierigetruhe", "1113", "fantasy", "a giant treasure chest mimic monster with a toothy lid, a long tongue and gold coins spilling out (ironic, menacing)", "snapping its lid to the left with coins flying", ["Die Gierige Truhe", "The Greedy Chest", "Le Coffre Avide", "El Cofre Codicioso", "Lo Scrigno Avido", "Arca Avida"]),
    ("algorithmus", "1113", "weltraum", "a towering black AI monolith with a single glowing red eye and floating geometric drones around it (cool and ironic)", "firing a grid of red laser lines to the left", ["Der Algorithmus", "The Algorithm", "L'Algorithme", "El Algoritmo", "L'Algoritmo", "Algorithmus"]),
    ("ereignishorizont", "1113", "weltraum", "a cosmic beast whose body is a swirling black hole with an accretion disc of light and long void claws", "pulling a spiral of light and debris to the left", ["Ereignishorizont", "Event Horizon", "Horizon des Événements", "Horizonte de Sucesos", "Orizzonte degli Eventi", "Horizon Eventuum"]),
    ("kolossx", "1113", "weltraum", "a giant battle mech with heavy angular armour, glowing vents and shoulder-mounted rocket pods", "launching a salvo of rockets to the left", ["Koloss X", "Colossus X", "Colosse X", "Coloso X", "Colosso X", "Colossus X"]),
    ("leviathan", "1113", "natur", "a gigantic sea serpent leviathan rising from a storm sea, with dark blue scales and glowing fins", "crashing a huge wave to the left", ["Leviathan", "Leviathan", "Léviathan", "Leviatán", "Leviatano", "Leviathan"]),
    ("megalodon", "1113", "natur", "a colossal prehistoric shark with scarred grey skin and rows of huge teeth", "bursting to the left with jaws wide open", ["Megalodon", "Megalodon", "Mégalodon", "Megalodón", "Megalodonte", "Megalodon"]),
    ("sandschlund", "1113", "natur", "a giant desert sandworm with a circular mouth lined with crystal teeth and sand pouring off its segments", "erupting from the sand to the left in a sand storm", ["Sandschlund", "Sand Maw", "Gueule des Sables", "Fauce de Arena", "Fauci di Sabbia", "Fauces Harenae"]),
    ("midgardschlange", "1113", "mythos", "the world serpent from northern legend: an endless green-free deep-blue sea serpent coiled around rocks, with ancient runeless scales", "striking to the left with a roaring wave", ["Midgardschlange", "World Serpent", "Serpent du Monde", "Serpiente del Mundo", "Serpente del Mondo", "Serpens Mundi"]),
    ("totenwaechter", "1113", "mythos", "a giant jackal-headed guardian statue of black stone and gold with a tall staff, eyes glowing blue", "striking the staff to send a wave of blue sand to the left", ["Totenwächter", "Tomb Guardian", "Gardien du Tombeau", "Guardián de la Tumba", "Guardiano della Tomba", "Custos Sepulcri"]),
    ("chronos", "1113", "mythos", "a titan of time with a stone body, a huge cracked hourglass in his chest and floating clock-hand blades (ironic: 'devourer of exam time')", "swinging giant clock-hand blades to the left", ["Chronos der Zeitfresser", "Chronos the Time Eater", "Chronos le Dévoreur de Temps", "Cronos el Devorador del Tiempo", "Crono il Divoratore del Tempo", "Chronos Edax Temporis"]),
]

# Bänder 7-8 bis 11-13 bekommen je Welt 3 Monster; 5-6: Fantasy schon fertig (drache, krake, teufel, golem)
def monsterprompt(m):
    mid, b, welt, beschr, angriff, namen = m
    st = BAENDER[b]
    return f"""Character sheet for a classroom video game boss, {st['stil']}. The boss is {st['monsterton']}.
The boss: {beschr}. Large, heavy, full body visible.
Layout: exactly four poses of the SAME boss arranged in a 2x2 grid, one pose centred in each quadrant, full body, every pose facing to the LEFT (three-quarter view toward the left side), generous empty space around each pose, no part of a pose crossing into another quadrant:
top-left: idle, looming and menacing, breathing heavily;
top-right: attacking toward the left: {angriff};
bottom-left: getting hit, recoiling backward to the right, wincing, impact stars (no blood);
bottom-right: defeated, collapsed on the ground, dizzy, comically or dramatically knocked out (no blood).
Background: one completely flat, uniform, solid chroma-key green (#00B140) everywhere, no gradient, no floor, no cast shadows, no ground line, no vignette. Do not use any green on the boss.
Absolutely no text, letters, numbers, labels, frames, grid lines, logos or watermark. Not a copy of any existing game, film or franchise character."""


def phasenprompt(m):
    return f"""The attached image shows a boss character sheet. Draw the EXACT same boss (same design, colours, proportions and art style) as a new image with two poses side by side, left half and right half, both full body, idle stance facing to the LEFT, generous empty space around each, nothing crossing the middle:
left: the same boss now wearing heavy riveted steel armour plates on chest, shoulders and head, looking smug and protected;
right: the same boss enraged in its final phase, eyes glowing bright red, a fiery red-orange aura flickering around its body, cracks in its armour, roaring.
Background: one completely flat, uniform, solid chroma-key green (#00B140) everywhere, no gradient, no floor, no cast shadows. Do not use any green on the boss (the aura must be red-orange, never green).
Absolutely no text, letters, numbers, labels, frames, grid lines, logos or watermark."""


# ---------------------------------------------------------------- Hintergründe: (id, welt, Szene)
HG_IDEEN = {
    "fantasy": [("zauberwald", "a magical forest clearing with giant old trees, glowing mushrooms in blue and purple and floating light motes"),
                ("vulkankrater", "a rocky arena inside a volcano crater with lava rivers glowing at the edges and an ash-red sky"),
                ("eisschloss", "the courtyard of an ice castle with frozen towers, snow and a pale aurora in a dark sky"),
                ("ruine", "a ruined ancient temple hall with broken pillars, ivy-free stone and shafts of golden light"),
                ("drachenhort", "a huge cave hall full of gold coins and treasure piles at the edges, lit by warm torchlight")],
    "weltraum": [("raumstation", "the hangar deck of a space station with a big window showing a planet and stars, metal floor with glowing lines"),
                 ("kristallwueste", "an alien planet with a violet crystal desert, two moons and a ringed planet in the sky"),
                 ("mondkrater", "a grey moon crater with the Earth rising over the horizon and a black starry sky"),
                 ("asteroiden", "a flat asteroid surface with other asteroids floating around and a colourful nebula behind"),
                 ("cyberdach", "the rooftop of a futuristic neon city at night with flying cars in the distance")],
    "natur": [("dschungel", "a jungle clearing with giant ferns, waterfalls and warm misty light, the vegetation in teal and blue tones rather than green"),
              ("gletscher", "an ice-age glacier plain with snow, blue ice walls and a pale sun"),
              ("canyon", "a red rock desert canyon floor with tall cliffs and a blazing sunset"),
              ("riff", "an underwater coral reef floor with colourful corals, sunbeams from above and bubbles"),
              ("urzeit", "a prehistoric volcanic plain with smoking volcanoes far away and giant palm-like trees in teal-blue tones")],
    "mythos": [("tempel", "a white marble Greek-style temple courtyard with columns and blue sea in the background"),
               ("labyrinth", "the centre of a huge stone labyrinth with high walls, torches and a moody sky"),
               ("fjord", "a northern fjord shore with a longship, dramatic mountains and a stormy sky"),
               ("grabkammer", "a golden desert tomb chamber with large statues and hieroglyph-like patterns that contain no readable letters"),
               ("olymp", "a palace platform high above the clouds on a mountain top with golden light")],
}
HG_JE_BAND = {"fantasy": 3, "weltraum": 3, "natur": 2, "mythos": 2}


def hgprompt(b, szene):
    st = BAENDER[b]
    return f"""A wide cinematic background for a classroom video game battle arena, {st['stil']}. Landscape 16:9.
Scene: {szene}.
In the foreground a large mostly flat and open ground area fills the lower half of the image. The middle and lower area must be EMPTY: no characters, no creatures, no animals, no objects standing on the ground, so that game characters can stand on the left and on the right.
Slightly darker and less saturated than foreground characters would be, so characters stand out. Full-bleed, no frame.
Absolutely no text, letters, numbers, logos or watermark."""


# ---------------------------------------------------------------- Begleiter (Ausrüstung Stufe 3, für alle Bänder)
BEGLEITER = [
    ("begleiter-a", ["a small fluffy owl with big golden eyes", "a tiny baby dragon with violet scales and little wings", "a small round helper robot with a glowing blue face screen", "a little fox spirit with a glowing white tail"]),
    ("begleiter-b", ["a tiny glowing star sprite with a smiling face", "a small baby griffin", "a little floating jellyfish drone with soft light", "a small turtle with a crystal shell"]),
]


def begleiterprompt(tiere):
    return f"""Sprite sheet of four small companion creatures for a classroom video game, stylized 3D cartoon render (soft lighting, rounded friendly shapes, rich colours). Each companion floats or sits, cute and loyal, facing to the RIGHT, centred in its own quadrant of a 2x2 grid with generous empty space around it, nothing crossing quadrant boundaries:
top-left: {tiere[0]};
top-right: {tiere[1]};
bottom-left: {tiere[2]};
bottom-right: {tiere[3]}.
Background: one completely flat, uniform, solid chroma-key green (#00B140) everywhere, no gradient, no floor, no shadows. Do not use any green on the creatures.
Absolutely no text, letters, numbers, labels, frames, grid lines or watermark."""


def katalog():
    auftraege = []  # (name, text, referenz)
    eintraege = {"figuren": [], "monster": [], "hintergruende": [], "begleiter": []}
    reihenfolge = ["78", "910", "56", "1113"]  # 17.11.2026: Jg. 5–6 vor 11–13 (Wunsch der Lehrkraft)
    for nr, b in enumerate(reihenfolge):
        bandnr = ["56", "78", "910", "1113"].index(b)
        for i, arch in enumerate(ARCHETYPEN):
            if b == "56" and arch[0] in SCHON_56:
                continue
            fid = arch[0] if b == "56" else f"{arch[0]}-{b}"
            auftraege.append((f"held-{fid}", figurenprompt(b, arch, i, bandnr), None))
            eintraege["figuren"].append({"id": fid, "band": BAENDER[b]["band"]})
        for m in [m for m in MONSTER if m[1] == b]:
            auftraege.append((f"boss-{m[0]}", monsterprompt(m), None))
            auftraege.append((f"phase-{m[0]}", phasenprompt(m), f"boss-{m[0]}"))
            eintraege["monster"].append({"id": m[0], "band": BAENDER[b]["band"], "welt": m[2], "namen": dict(zip(["de", "en", "fr", "es", "it", "la"], m[5]))})
        for welt, n in HG_JE_BAND.items():
            ideen = HG_IDEEN[welt]
            start = bandnr  # je Band andere Szenen
            for k in range(n if not (b == "56" and welt == "fantasy") else 2):
                hid, szene = ideen[(start + k) % len(ideen)]
                hid = f"{hid}-{b}"
                auftraege.append((f"hg-{hid}", hgprompt(b, szene), None))
                eintraege["hintergruende"].append({"id": hid, "band": BAENDER[b]["band"], "welt": welt})
        if nr == 0:
            for bid, tiere in BEGLEITER:
                auftraege.append((bid, begleiterprompt(tiere), None))
                eintraege["begleiter"].append({"id": bid})
    return auftraege, eintraege


if __name__ == "__main__":
    ziel = sys.argv[1]
    os.makedirs(ziel, exist_ok=True)
    auftraege, eintraege = katalog()
    with open(os.path.join(ziel, "auftraege.txt"), "w", newline="\n", encoding="utf-8") as f:
        for name, text, ref in auftraege:
            f.write(f"{name}|{ref or ''}\n")
            with open(os.path.join(ziel, f"{name}.txt"), "w", newline="\n", encoding="utf-8") as g:
                g.write(text)
    with open(os.path.join(ziel, "katalog.json"), "w", newline="\n", encoding="utf-8") as f:
        json.dump(eintraege, f, ensure_ascii=False, indent=1)
    print(len(auftraege), "Aufträge;", {k: len(v) for k, v in eintraege.items()})
