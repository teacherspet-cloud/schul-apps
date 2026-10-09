/**
 * Reiseplaner (09.10.2026, neu gestaltet mit der Lehrkraft): feste, geprüfte Satzvorlagen je Sprache für die
 * Reisekarten und Hinweise. Jeder Begriff (Ziel, Verkehrsmittel, Wetter, Aktivität) hat seine Kartenbeschriftung, ein
 * Symbol und fertige Sätze – so gibt es keine Grammatikfehler durch Einsetzen. Welche Begriffe vorkommen, richtet sich
 * nach dem Lehrwerk der Klasse bis zum aktuellen Stand (Wort `wort` steht in den Wortlisten) – fehlt eine Gruppe, gilt
 * der eingebaute Grundwortschatz. `basis`: auch für Klasse 5–6 geeignet.
 *
 * Satzarten: `ja` (so soll es sein), `nein` (so nicht), `nein9` (indirekt, ab Klasse 9), bei Wetter `wenn`
 * („If it rains,") und bei Aktivitäten `wollen` („we want to go swimming.") für Bedingungen ab Klasse 9.
 */

import { PAKETE } from '../spielSprachen'
import { lexikonAus } from '../spielSprachen/lexikonAus'

export type Merkmal = 'ziel' | 'verkehr' | 'wetter' | 'akt'
export interface Begriff {
  id: string
  icon: string
  karte: string
  ja: string | null
  nein: string
  nein9: string
  wenn?: string
  wollen?: string
  /** Wort für den Abgleich mit dem Lehrwerk */
  wort: string
  basis?: true
}
export interface Zahlen {
  preisKarte: string
  tageKarte: string
  /** höchstens n (Kl. 5–6) */
  preis5: string
  /** weniger als n (Kl. 7–8, Vergleich) */
  preis7: string
  /** höchstens n (ab Kl. 9) */
  preis9: string
  /** höchstens n Tage (Kl. 5–6) */
  tage5: string
  /** mindestens n Tage (ab Kl. 7) */
  tage7: string
  /** höchstens n Tage (ab Kl. 9) */
  tage9: string
}
export interface Lexikon {
  begriffe: Record<Merkmal, Begriff[]>
  zahlen: Zahlen
}

const b = (
  id: string,
  icon: string,
  karte: string,
  ja: string | null,
  nein: string,
  nein9: string,
  wort: string,
  extra: Partial<Pick<Begriff, 'wenn' | 'wollen' | 'basis'>> = {}
): Begriff => ({ id, icon, karte, ja, nein, nein9, wort, ...extra })
const B = { basis: true as const }

export const LEXIKA: Record<string, Lexikon> = {
  en: {
    begriffe: {
      ziel: [
        b('meer', '🏖️', 'the sea', 'We want to go to the sea.', "We don't want to go to the sea.", 'Tom hates sand and salty water.', 'sea', B),
        b('berge', '⛰️', 'the mountains', 'We want to go to the mountains.', "We don't want to go to the mountains.", "Grandma can't walk up steep hills.", 'mountain', B),
        b('stadt', '🏙️', 'a big city', 'We want to visit a big city.', "We don't want to go to a big city.", 'Mia hates noisy streets and traffic.', 'city', B),
        b('see', '🏞️', 'a lake', 'We want to go to a lake.', "We don't want to go to a lake.", 'Dad says that lakes are boring.', 'lake'),
        b('insel', '🏝️', 'an island', 'We want to go to an island.', "We don't want to go to an island.", 'Nobody wants to stay on a small island all week.', 'island'),
        b('land', '🐄', 'a farm', 'We want to stay on a farm.', "We don't want to stay on a farm.", 'Tom is afraid of cows.', 'farm', B)
      ],
      verkehr: [
        b('zug', '🚆', 'train', 'We want to go by train.', "We don't want to go by train.", 'There is a train strike this week.', 'train', B),
        b('bus', '🚌', 'bus', 'We want to go by bus.', "We don't want to go by bus.", 'Mia always feels sick on a bus.', 'bus', B),
        b('auto', '🚗', 'car', 'We want to go by car.', "We don't want to go by car.", 'Our car is broken.', 'car', B),
        b('flugzeug', '✈️', 'plane', 'We want to fly.', "We don't want to fly.", 'Dad is afraid of flying.', 'plane', B),
        b('rad', '🚲', 'bike', 'We want to go by bike.', "We don't want to go by bike.", "Grandma can't ride a bike.", 'bike'),
        b('schiff', '⛴️', 'ship', 'We want to go by ship.', "We don't want to go by ship.", 'Grandma gets seasick on boats.', 'ship')
      ],
      wetter: [
        b('sonne', '☀️', 'sunny', 'We want sunny weather.', "We don't want sunny weather.", 'Tom gets sunburnt very fast.', 'sunny', { wenn: 'If it is sunny,', basis: true }),
        b('regen', '🌧️', 'rainy', null, "We don't like rain.", 'Mia forgot her umbrella and her raincoat.', 'rain', { wenn: 'If it rains,', basis: true }),
        b('schnee', '❄️', 'snowy', 'We want snow.', "We don't want snow.", "We haven't got any warm clothes with us.", 'snow', { wenn: 'If it snows,', basis: true }),
        b('wind', '🌬️', 'windy', 'We want some wind.', "We don't want windy weather.", "Mia's hat always flies away.", 'wind', { wenn: 'If it is windy,' })
      ],
      akt: [
        b('schwimmen', '🏊', 'swimming', 'We want to go swimming.', "Mia can't swim.", 'Mia is afraid of deep water.', 'swim', { wollen: 'we want to go swimming.', basis: true }),
        b('wandern', '🥾', 'hiking', 'We want to go hiking.', "Grandma can't walk far.", 'Grandma has got a bad knee.', 'walk', { wollen: 'we want to go hiking.', basis: true }),
        b('ski', '⛷️', 'skiing', 'We want to go skiing.', "Tom can't ski.", 'Tom broke his leg last winter.', 'ski', { wollen: 'we want to go skiing.' }),
        b('museum', '🏛️', 'museums', 'We want to visit a museum.', "We don't want to visit museums.", 'Tom thinks that museums are boring.', 'museum', { wollen: 'we want to visit a museum.', basis: true }),
        b('einkaufen', '🛍️', 'shopping', 'We want to go shopping.', "We don't want to go shopping.", "We haven't got any money for shopping.", 'shop', { wollen: 'we want to go shopping.', basis: true }),
        b('segeln', '⛵', 'sailing', 'We want to go sailing.', "We don't want to go sailing.", 'Dad gets seasick on small boats.', 'sail', { wollen: 'we want to go sailing.' }),
        b('zelten', '⛺', 'camping', 'We want to sleep in a tent.', "We don't want to sleep in a tent.", 'Mia is afraid of insects at night.', 'tent', { wollen: 'we want to sleep in a tent.' })
      ]
    },
    zahlen: {
      preisKarte: '{0} €',
      tageKarte: '{0} days',
      preis5: 'We have {0} euros.',
      preis7: 'It must be cheaper than {0} euros.',
      preis9: 'Our budget is {0} euros at most.',
      tage5: 'We have only {0} days.',
      tage7: 'We want to stay at least {0} days.',
      tage9: 'We must be back home after {0} days at the latest.'
    }
  },
  fr: {
    begriffe: {
      ziel: [
        b('meer', '🏖️', 'la mer', 'Nous voulons aller à la mer.', 'Nous ne voulons pas aller à la mer.', "Tom déteste le sable et l'eau salée.", 'mer', B),
        b('berge', '⛰️', 'la montagne', 'Nous voulons aller à la montagne.', 'Nous ne voulons pas aller à la montagne.', 'Mamie ne peut pas monter les collines.', 'montagne', B),
        b('stadt', '🏙️', 'une grande ville', 'Nous voulons visiter une grande ville.', 'Nous ne voulons pas aller dans une grande ville.', 'Mia déteste le bruit et la circulation.', 'ville', B),
        b('see', '🏞️', 'un lac', "Nous voulons aller au bord d'un lac.", "Nous ne voulons pas aller au bord d'un lac.", 'Papa trouve les lacs ennuyeux.', 'lac'),
        b('insel', '🏝️', 'une île', 'Nous voulons aller sur une île.', 'Nous ne voulons pas aller sur une île.', 'Personne ne veut rester une semaine sur une petite île.', 'île'),
        b('land', '🐄', 'une ferme', 'Nous voulons dormir dans une ferme.', 'Nous ne voulons pas dormir dans une ferme.', 'Tom a peur des vaches.', 'ferme', B)
      ],
      verkehr: [
        b('zug', '🚆', 'le train', 'Nous voulons partir en train.', 'Nous ne voulons pas partir en train.', 'Cette semaine, il y a une grève des trains.', 'train', B),
        b('bus', '🚌', 'le bus', 'Nous voulons partir en bus.', 'Nous ne voulons pas partir en bus.', 'Mia est toujours malade dans le bus.', 'bus', B),
        b('auto', '🚗', 'la voiture', 'Nous voulons partir en voiture.', 'Nous ne voulons pas partir en voiture.', 'Notre voiture est en panne.', 'voiture', B),
        b('flugzeug', '✈️', "l'avion", "Nous voulons prendre l'avion.", "Nous ne voulons pas prendre l'avion.", "Papa a peur de l'avion.", 'avion', B),
        b('rad', '🚲', 'le vélo', 'Nous voulons partir à vélo.', 'Nous ne voulons pas partir à vélo.', 'Mamie ne sait pas faire du vélo.', 'vélo'),
        b('schiff', '⛴️', 'le bateau', 'Nous voulons partir en bateau.', 'Nous ne voulons pas partir en bateau.', 'Mamie a le mal de mer.', 'bateau')
      ],
      wetter: [
        b('sonne', '☀️', 'du soleil', 'Nous voulons du soleil.', 'Nous ne voulons pas de soleil.', 'Tom attrape vite des coups de soleil.', 'soleil', { wenn: "S'il fait beau,", basis: true }),
        b('regen', '🌧️', 'de la pluie', null, "Nous n'aimons pas la pluie.", 'Mia a oublié son parapluie et son imperméable.', 'pluie', { wenn: "S'il pleut,", basis: true }),
        b('schnee', '❄️', 'de la neige', 'Nous voulons de la neige.', 'Nous ne voulons pas de neige.', "Nous n'avons pas de vêtements chauds.", 'neige', { wenn: "S'il neige,", basis: true }),
        b('wind', '🌬️', 'du vent', 'Nous voulons un peu de vent.', 'Nous ne voulons pas de vent.', "Le chapeau de Mia s'envole toujours.", 'vent', { wenn: "S'il y a du vent," })
      ],
      akt: [
        b('schwimmen', '🏊', 'nager', 'Nous voulons nager.', 'Mia ne sait pas nager.', "Mia a peur de l'eau profonde.", 'nager', { wollen: 'nous voulons nager.', basis: true }),
        b('wandern', '🥾', 'la randonnée', 'Nous voulons faire de la randonnée.', 'Mamie ne peut pas marcher longtemps.', 'Mamie a mal au genou.', 'randonnée', { wollen: 'nous voulons faire de la randonnée.', basis: true }),
        b('ski', '⛷️', 'le ski', 'Nous voulons faire du ski.', 'Tom ne sait pas skier.', "Tom s'est cassé la jambe l'hiver dernier.", 'ski', { wollen: 'nous voulons faire du ski.' }),
        b('museum', '🏛️', 'les musées', 'Nous voulons visiter un musée.', 'Nous ne voulons pas visiter de musée.', 'Tom trouve les musées ennuyeux.', 'musée', { wollen: 'nous voulons visiter un musée.', basis: true }),
        b('einkaufen', '🛍️', 'le shopping', 'Nous voulons faire du shopping.', 'Nous ne voulons pas faire de shopping.', "Nous n'avons pas d'argent pour le shopping.", 'magasin', { wollen: 'nous voulons faire du shopping.', basis: true }),
        b('segeln', '⛵', 'la voile', 'Nous voulons faire de la voile.', 'Nous ne voulons pas faire de voile.', 'Papa a le mal de mer sur les petits bateaux.', 'voile', { wollen: 'nous voulons faire de la voile.' }),
        b('zelten', '⛺', 'le camping', 'Nous voulons dormir sous la tente.', 'Nous ne voulons pas dormir sous la tente.', 'Mia a peur des insectes la nuit.', 'tente', { wollen: 'nous voulons dormir sous la tente.' })
      ]
    },
    zahlen: {
      preisKarte: '{0} €',
      tageKarte: '{0} jours',
      preis5: 'Nous avons {0} euros.',
      preis7: 'Ça doit coûter moins de {0} euros.',
      preis9: 'Notre budget est de {0} euros au maximum.',
      tage5: 'Nous avons seulement {0} jours.',
      tage7: 'Nous voulons rester au moins {0} jours.',
      tage9: 'Nous devons rentrer au plus tard après {0} jours.'
    }
  },
  es: {
    begriffe: {
      ziel: [
        b('meer', '🏖️', 'el mar', 'Queremos ir al mar.', 'No queremos ir al mar.', 'Tom odia la arena y el agua salada.', 'mar', B),
        b('berge', '⛰️', 'la montaña', 'Queremos ir a la montaña.', 'No queremos ir a la montaña.', 'La abuela no puede subir colinas.', 'montaña', B),
        b('stadt', '🏙️', 'una gran ciudad', 'Queremos visitar una gran ciudad.', 'No queremos ir a una gran ciudad.', 'Mia odia el ruido y el tráfico.', 'ciudad', B),
        b('see', '🏞️', 'un lago', 'Queremos ir a un lago.', 'No queremos ir a un lago.', 'Papá dice que los lagos son aburridos.', 'lago'),
        b('insel', '🏝️', 'una isla', 'Queremos ir a una isla.', 'No queremos ir a una isla.', 'Nadie quiere pasar una semana en una isla pequeña.', 'isla'),
        b('land', '🐄', 'una granja', 'Queremos dormir en una granja.', 'No queremos dormir en una granja.', 'Tom tiene miedo de las vacas.', 'granja', B)
      ],
      verkehr: [
        b('zug', '🚆', 'el tren', 'Queremos ir en tren.', 'No queremos ir en tren.', 'Esta semana hay huelga de trenes.', 'tren', B),
        b('bus', '🚌', 'el autobús', 'Queremos ir en autobús.', 'No queremos ir en autobús.', 'Mia siempre se marea en el autobús.', 'autobús', B),
        b('auto', '🚗', 'el coche', 'Queremos ir en coche.', 'No queremos ir en coche.', 'Nuestro coche está roto.', 'coche', B),
        b('flugzeug', '✈️', 'el avión', 'Queremos ir en avión.', 'No queremos ir en avión.', 'Papá tiene miedo de volar.', 'avión', B),
        b('rad', '🚲', 'la bicicleta', 'Queremos ir en bicicleta.', 'No queremos ir en bicicleta.', 'La abuela no sabe montar en bicicleta.', 'bicicleta'),
        b('schiff', '⛴️', 'el barco', 'Queremos ir en barco.', 'No queremos ir en barco.', 'La abuela se marea en los barcos.', 'barco')
      ],
      wetter: [
        b('sonne', '☀️', 'sol', 'Queremos sol.', 'No queremos sol.', 'Tom se quema muy rápido con el sol.', 'sol', { wenn: 'Si hace sol,', basis: true }),
        b('regen', '🌧️', 'lluvia', null, 'No nos gusta la lluvia.', 'Mia ha olvidado su paraguas.', 'lluvia', { wenn: 'Si llueve,', basis: true }),
        b('schnee', '❄️', 'nieve', 'Queremos nieve.', 'No queremos nieve.', 'No tenemos ropa de abrigo.', 'nieve', { wenn: 'Si nieva,', basis: true }),
        b('wind', '🌬️', 'viento', 'Queremos un poco de viento.', 'No queremos viento.', 'El sombrero de Mia siempre se vuela.', 'viento', { wenn: 'Si hace viento,' })
      ],
      akt: [
        b('schwimmen', '🏊', 'nadar', 'Queremos nadar.', 'Mia no sabe nadar.', 'Mia tiene miedo del agua profunda.', 'nadar', { wollen: 'queremos nadar.', basis: true }),
        b('wandern', '🥾', 'senderismo', 'Queremos hacer senderismo.', 'La abuela no puede caminar mucho.', 'La abuela tiene mal la rodilla.', 'caminar', { wollen: 'queremos hacer senderismo.', basis: true }),
        b('ski', '⛷️', 'esquiar', 'Queremos esquiar.', 'Tom no sabe esquiar.', 'Tom se rompió la pierna el invierno pasado.', 'esquiar', { wollen: 'queremos esquiar.' }),
        b('museum', '🏛️', 'museos', 'Queremos visitar un museo.', 'No queremos visitar museos.', 'Tom piensa que los museos son aburridos.', 'museo', { wollen: 'queremos visitar un museo.', basis: true }),
        b('einkaufen', '🛍️', 'compras', 'Queremos ir de compras.', 'No queremos ir de compras.', 'No tenemos dinero para compras.', 'compras', { wollen: 'queremos ir de compras.', basis: true }),
        b('segeln', '⛵', 'vela', 'Queremos navegar a vela.', 'No queremos navegar a vela.', 'Papá se marea en los barcos pequeños.', 'vela', { wollen: 'queremos navegar a vela.' }),
        b('zelten', '⛺', 'acampar', 'Queremos dormir en una tienda de campaña.', 'No queremos dormir en una tienda de campaña.', 'Mia tiene miedo de los insectos por la noche.', 'tienda', { wollen: 'queremos dormir en una tienda de campaña.' })
      ]
    },
    zahlen: {
      preisKarte: '{0} €',
      tageKarte: '{0} días',
      preis5: 'Tenemos {0} euros.',
      preis7: 'Tiene que costar menos de {0} euros.',
      preis9: 'Nuestro presupuesto es de {0} euros como máximo.',
      tage5: 'Solo tenemos {0} días.',
      tage7: 'Queremos quedarnos por lo menos {0} días.',
      tage9: 'Tenemos que volver a casa después de {0} días como mucho.'
    }
  },
  it: lexikonAus(
    {
      ziel: [
        ['il mare', 'Vogliamo andare al mare.', 'Non vogliamo andare al mare.', "Tom odia la sabbia e l'acqua salata.", 'mare'],
        ['la montagna', 'Vogliamo andare in montagna.', 'Non vogliamo andare in montagna.', 'La nonna non può salire sulle colline.', 'montagna'],
        ['una grande città', 'Vogliamo visitare una grande città.', 'Non vogliamo andare in una grande città.', 'Mia odia il rumore e il traffico.', 'città'],
        ['un lago', 'Vogliamo andare a un lago.', 'Non vogliamo andare a un lago.', 'Papà dice che i laghi sono noiosi.', 'lago'],
        ["un'isola", "Vogliamo andare su un'isola.", "Non vogliamo andare su un'isola.", 'Nessuno vuole stare una settimana su una piccola isola.', 'isola'],
        ['una fattoria', 'Vogliamo dormire in una fattoria.', 'Non vogliamo dormire in una fattoria.', 'Tom ha paura delle mucche.', 'fattoria']
      ],
      verkehr: [
        ['il treno', 'Vogliamo andare in treno.', 'Non vogliamo andare in treno.', "Questa settimana c'è sciopero dei treni.", 'treno'],
        ["l'autobus", 'Vogliamo andare in autobus.', 'Non vogliamo andare in autobus.', "Mia sta sempre male sull'autobus.", 'autobus'],
        ['la macchina', 'Vogliamo andare in macchina.', 'Non vogliamo andare in macchina.', 'La nostra macchina è rotta.', 'macchina'],
        ["l'aereo", 'Vogliamo andare in aereo.', 'Non vogliamo andare in aereo.', 'Papà ha paura di volare.', 'aereo'],
        ['la bici', 'Vogliamo andare in bici.', 'Non vogliamo andare in bici.', 'La nonna non sa andare in bici.', 'bici'],
        ['la nave', 'Vogliamo andare in nave.', 'Non vogliamo andare in nave.', 'La nonna soffre il mal di mare.', 'nave']
      ],
      wetter: [
        ['sole', 'Vogliamo il sole.', 'Non vogliamo il sole.', 'Tom si scotta molto in fretta.', 'sole', "Se c'è il sole,"],
        ['pioggia', null, 'Non ci piace la pioggia.', "Mia ha dimenticato l'ombrello.", 'pioggia', 'Se piove,'],
        ['neve', 'Vogliamo la neve.', 'Non vogliamo la neve.', 'Non abbiamo vestiti caldi.', 'neve', 'Se nevica,'],
        ['vento', 'Vogliamo un po’ di vento.', 'Non vogliamo vento.', 'Il cappello di Mia vola sempre via.', 'vento', "Se c'è vento,"]
      ],
      akt: [
        ['nuotare', 'Vogliamo nuotare.', 'Mia non sa nuotare.', "Mia ha paura dell'acqua profonda.", 'nuotare', 'vogliamo nuotare.'],
        ['camminare', 'Vogliamo fare escursioni.', 'La nonna non può camminare molto.', 'La nonna ha male al ginocchio.', 'camminare', 'vogliamo fare un’escursione.'],
        ['sciare', 'Vogliamo sciare.', 'Tom non sa sciare.', "Tom si è rotto la gamba l'inverno scorso.", 'sciare', 'vogliamo sciare.'],
        ['musei', 'Vogliamo visitare un museo.', 'Non vogliamo visitare musei.', 'Tom pensa che i musei siano noiosi.', 'museo', 'vogliamo visitare un museo.'],
        ['shopping', 'Vogliamo fare shopping.', 'Non vogliamo fare shopping.', 'Non abbiamo soldi per lo shopping.', 'negozio', 'vogliamo fare shopping.'],
        ['vela', 'Vogliamo andare in barca a vela.', 'Non vogliamo andare in barca a vela.', 'Papà soffre il mal di mare sulle barche piccole.', 'vela', 'vogliamo andare in barca a vela.'],
        ['campeggio', 'Vogliamo dormire in tenda.', 'Non vogliamo dormire in tenda.', 'Mia ha paura degli insetti di notte.', 'tenda', 'vogliamo dormire in tenda.']
      ]
    },
    {
      preisKarte: '{0} €',
      tageKarte: '{0} giorni',
      preis5: 'Abbiamo {0} euro.',
      preis7: 'Deve costare meno di {0} euro.',
      preis9: 'Possiamo spendere al massimo {0} euro.',
      tage5: 'Abbiamo solo {0} giorni.',
      tage7: 'Vogliamo restare almeno {0} giorni.',
      tage9: 'Dobbiamo tornare a casa al più tardi dopo {0} giorni.'
    }
  ),
  // DaZ: Deutsch als Zielsprache
  de: lexikonAus(
    {
      ziel: [
        ['das Meer', 'Wir wollen ans Meer.', 'Wir wollen nicht ans Meer.', 'Tom hasst Sand und salziges Wasser.', 'meer'],
        ['die Berge', 'Wir wollen in die Berge.', 'Wir wollen nicht in die Berge.', 'Oma kann keine steilen Hügel hinaufgehen.', 'berg'],
        ['eine große Stadt', 'Wir wollen eine große Stadt besuchen.', 'Wir wollen nicht in eine große Stadt.', 'Mia hasst Lärm und Verkehr.', 'stadt'],
        ['ein See', 'Wir wollen an einen See.', 'Wir wollen nicht an einen See.', 'Papa findet Seen langweilig.', 'see'],
        ['eine Insel', 'Wir wollen auf eine Insel.', 'Wir wollen nicht auf eine Insel.', 'Niemand will eine Woche auf einer kleinen Insel sein.', 'insel'],
        ['ein Bauernhof', 'Wir wollen auf einem Bauernhof schlafen.', 'Wir wollen nicht auf einem Bauernhof schlafen.', 'Tom hat Angst vor Kühen.', 'bauernhof']
      ],
      verkehr: [
        ['der Zug', 'Wir wollen mit dem Zug fahren.', 'Wir wollen nicht mit dem Zug fahren.', 'Diese Woche streikt die Bahn.', 'zug'],
        ['der Bus', 'Wir wollen mit dem Bus fahren.', 'Wir wollen nicht mit dem Bus fahren.', 'Mia wird im Bus immer schlecht.', 'bus'],
        ['das Auto', 'Wir wollen mit dem Auto fahren.', 'Wir wollen nicht mit dem Auto fahren.', 'Unser Auto ist kaputt.', 'auto'],
        ['das Flugzeug', 'Wir wollen fliegen.', 'Wir wollen nicht fliegen.', 'Papa hat Angst vor dem Fliegen.', 'flugzeug'],
        ['das Fahrrad', 'Wir wollen mit dem Fahrrad fahren.', 'Wir wollen nicht mit dem Fahrrad fahren.', 'Oma kann nicht Fahrrad fahren.', 'fahrrad'],
        ['das Schiff', 'Wir wollen mit dem Schiff fahren.', 'Wir wollen nicht mit dem Schiff fahren.', 'Oma wird auf Schiffen seekrank.', 'schiff']
      ],
      wetter: [
        ['Sonne', 'Wir wollen Sonne.', 'Wir wollen keine Sonne.', 'Tom bekommt sehr schnell einen Sonnenbrand.', 'sonne', 'Wenn die Sonne scheint,'],
        ['Regen', null, 'Wir mögen keinen Regen.', 'Mia hat ihren Regenschirm vergessen.', 'regen', 'Wenn es regnet,'],
        ['Schnee', 'Wir wollen Schnee.', 'Wir wollen keinen Schnee.', 'Wir haben keine warme Kleidung dabei.', 'schnee', 'Wenn es schneit,'],
        ['Wind', 'Wir wollen etwas Wind.', 'Wir wollen keinen Wind.', 'Mias Hut fliegt immer weg.', 'wind', 'Wenn es windig ist,']
      ],
      akt: [
        ['schwimmen', 'Wir wollen schwimmen.', 'Mia kann nicht schwimmen.', 'Mia hat Angst vor tiefem Wasser.', 'schwimmen', 'wollen wir schwimmen.'],
        ['wandern', 'Wir wollen wandern.', 'Oma kann nicht weit laufen.', 'Oma hat Schmerzen im Knie.', 'wandern', 'wollen wir wandern.'],
        ['Ski fahren', 'Wir wollen Ski fahren.', 'Tom kann nicht Ski fahren.', 'Tom hat sich letzten Winter das Bein gebrochen.', 'ski', 'wollen wir Ski fahren.'],
        ['Museen', 'Wir wollen ein Museum besuchen.', 'Wir wollen kein Museum besuchen.', 'Tom findet Museen langweilig.', 'museum', 'wollen wir ein Museum besuchen.'],
        ['einkaufen', 'Wir wollen einkaufen gehen.', 'Wir wollen nicht einkaufen gehen.', 'Wir haben kein Geld zum Einkaufen.', 'einkaufen', 'wollen wir einkaufen gehen.'],
        ['segeln', 'Wir wollen segeln.', 'Wir wollen nicht segeln.', 'Papa wird auf kleinen Booten seekrank.', 'segeln', 'wollen wir segeln.'],
        ['zelten', 'Wir wollen im Zelt schlafen.', 'Wir wollen nicht im Zelt schlafen.', 'Mia hat nachts Angst vor Insekten.', 'zelt', 'wollen wir im Zelt schlafen.']
      ]
    },
    {
      preisKarte: '{0} €',
      tageKarte: '{0} Tage',
      preis5: 'Wir haben {0} Euro.',
      preis7: 'Es muss billiger als {0} Euro sein.',
      preis9: 'Wir können höchstens {0} Euro ausgeben.',
      tage5: 'Wir haben nur {0} Tage.',
      tage7: 'Wir wollen mindestens {0} Tage bleiben.',
      tage9: 'Spätestens nach {0} Tagen müssen wir wieder zu Hause sein.'
    }
  ),
  la: {
    begriffe: {
      ziel: [
        b('mare', '🏖️', 'mare', 'Ad mare ire volumus.', 'Ad mare ire nolumus.', 'Marcus aquam salsam odit.', 'mare', B),
        b('montes', '⛰️', 'montes', 'In montes ire volumus.', 'In montes ire nolumus.', 'Avia colles ascendere non potest.', 'mons', B),
        b('roma', '🏛️', 'Roma', 'Romam ire volumus.', 'Romam ire nolumus.', 'Iulia strepitum urbis odit.', 'urbs', B),
        b('insula', '🏝️', 'insula', 'In insulam navigare volumus.', 'In insulam ire nolumus.', 'Nemo in parva insula manere vult.', 'insula'),
        b('villa', '🐄', 'villa rustica', 'In villa rustica habitare volumus.', 'In villa rustica habitare nolumus.', 'Marcus vaccas timet.', 'villa', B)
      ],
      verkehr: [
        b('navis', '⛵', 'navis', 'Nave ire volumus.', 'Nave ire nolumus.', 'Avia in navi semper aegrotat.', 'navis', B),
        b('equus', '🐎', 'equus', 'Equis ire volumus.', 'Equis ire nolumus.', 'Iulia equos timet.', 'equus', B),
        b('pedes', '🚶', 'pedibus', 'Pedibus ire volumus.', 'Pedibus ire nolumus.', 'Avia longe ambulare non potest.', 'pes', B),
        b('carrus', '🐂', 'carrus', 'Carro ire volumus.', 'Carro ire nolumus.', 'Carrus noster fractus est.', 'carrus')
      ],
      wetter: [
        b('sol', '☀️', 'sol', 'Solem volumus.', 'Solem nolumus.', 'Marcus sole cito uritur.', 'sol', { wenn: 'Si sol lucet,', basis: true }),
        b('pluvia', '🌧️', 'pluvia', null, 'Pluviam non amamus.', 'Iulia paenulam oblita est.', 'pluvia', { wenn: 'Si pluit,', basis: true }),
        b('nix', '❄️', 'nix', 'Nivem volumus.', 'Nivem nolumus.', 'Vestes calidas non habemus.', 'nix', { wenn: 'Si ningit,', basis: true }),
        b('ventus', '🌬️', 'ventus', 'Ventum volumus.', 'Ventum nolumus.', 'Pileus Iuliae semper avolat.', 'ventus', { wenn: 'Si ventus flat,' })
      ],
      akt: [
        b('natare', '🏊', 'natare', 'Natare volumus.', 'Iulia natare non potest.', 'Iulia aquam altam timet.', 'natare', { wollen: 'natare volumus.', basis: true }),
        b('thermae', '♨️', 'thermae', 'Thermas visitare volumus.', 'Thermas visitare nolumus.', 'Marcus thermas non amat.', 'thermae', { wollen: 'thermas visitare volumus.', basis: true }),
        b('forum', '🏛️', 'forum', 'Forum spectare volumus.', 'Forum spectare nolumus.', 'Marcus fora molesta putat.', 'forum', { wollen: 'forum spectare volumus.', basis: true }),
        b('piscari', '🎣', 'piscari', 'Piscari volumus.', 'Piscari nolumus.', 'Iulia pisces non amat.', 'piscis', { wollen: 'piscari volumus.' }),
        b('theatrum', '🎭', 'theatrum', 'In theatrum ire volumus.', 'In theatrum ire nolumus.', 'Marcus fabulas non amat.', 'theatrum', { wollen: 'in theatrum ire volumus.', basis: true })
      ]
    },
    zahlen: {
      preisKarte: '{0} denarii',
      tageKarte: '{0} dies',
      preis5: '{0} denarios habemus.',
      preis7: 'Minus quam {0} denariis constare debet.',
      preis9: 'Non plus quam {0} denarios solvere possumus.',
      tage5: 'Tantum {0} dies habemus.',
      tage7: 'Saltem {0} dies manere volumus.',
      tage9: 'Post {0} dies domi esse debemus.'
    }
  }
}

/** Lexikon der Kurssprache; fehlt eines, gilt das englische (Rückfall) */
export const lexikonFuer = (sprache: string): Lexikon => {
  const k = (sprache ?? '').toLowerCase().split(/[-_]/)[0]
  return LEXIKA[k] ?? PAKETE[k]?.reise ?? LEXIKA.en
}
