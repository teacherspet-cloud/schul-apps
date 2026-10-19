/**
 * Useful Phrases für das Sprechtraining (19.10.2026). Grundlage: „Sprechprüfungstraining Musterlösung" der Lehrkraft
 * (How to talk about yourself · Phrases for discussions), erweitert um Bildbeschreibung, Meinung, Vorschläge/Einigung,
 * Rollenspiel und Zeit gewinnen – je Stufe (A1 … B2) und für en/fr/es gleich gegliedert. `situation` beschreibt auf
 * Deutsch, wann man die Wendung braucht (Spiele: Situation ↔ Phrase). Faustregel: Zuordnung zu Stufen nach GER-Kann-
 * Beschreibungen; Französisch und Spanisch sind Entsprechungen, keine wörtlichen Übersetzungen.
 */
import type { SprechSprache, Stufe, Teil } from './niveaus'

export type GruppeId =
  | 'person'
  | 'familie'
  | 'freizeit'
  | 'ferien'
  | 'vorlieben'
  | 'verbinden'
  | 'bild'
  | 'meinung'
  | 'diskussion'
  | 'zustimmen'
  | 'widersprechen'
  | 'nachfragen'
  | 'unterbrechen'
  | 'einigen'
  | 'rollenspiel'
  | 'zeit'

export interface PhraseGruppe {
  id: GruppeId
  titel: Record<SprechSprache, string>
  teile: Teil[]
}

export const GRUPPEN: PhraseGruppe[] = [
  { id: 'person', titel: { en: 'Personal stuff', fr: 'Me présenter', es: 'Presentarme' }, teile: ['interview'] },
  { id: 'familie', titel: { en: 'Your family and pets', fr: 'Ma famille et mes animaux', es: 'Mi familia y mis mascotas' }, teile: ['interview'] },
  { id: 'freizeit', titel: { en: 'Free time and school', fr: 'Loisirs et école', es: 'Tiempo libre y colegio' }, teile: ['interview'] },
  { id: 'ferien', titel: { en: 'Your holidays', fr: 'Mes vacances', es: 'Mis vacaciones' }, teile: ['interview'] },
  { id: 'vorlieben', titel: { en: 'Likes and dislikes', fr: "Ce que j'aime", es: 'Lo que me gusta' }, teile: ['interview', 'monolog'] },
  { id: 'verbinden', titel: { en: 'Connectives', fr: 'Mots de liaison', es: 'Conectores' }, teile: ['interview', 'monolog', 'dialog'] },
  { id: 'bild', titel: { en: 'Describing pictures', fr: 'Décrire une image', es: 'Describir una imagen' }, teile: ['monolog'] },
  { id: 'meinung', titel: { en: 'Giving your opinion', fr: 'Donner son avis', es: 'Dar tu opinión' }, teile: ['monolog', 'dialog'] },
  { id: 'diskussion', titel: { en: 'Getting a discussion started', fr: 'Lancer la discussion', es: 'Empezar una discusión' }, teile: ['dialog'] },
  { id: 'zustimmen', titel: { en: 'Agreeing with someone', fr: "Être d'accord", es: 'Estar de acuerdo' }, teile: ['dialog'] },
  { id: 'widersprechen', titel: { en: 'Disagreeing with someone', fr: "Ne pas être d'accord", es: 'No estar de acuerdo' }, teile: ['dialog'] },
  { id: 'nachfragen', titel: { en: 'Asking for clarification', fr: 'Demander des précisions', es: 'Pedir aclaraciones' }, teile: ['interview', 'dialog'] },
  { id: 'unterbrechen', titel: { en: 'How to interrupt politely', fr: 'Interrompre poliment', es: 'Interrumpir con educación' }, teile: ['dialog'] },
  { id: 'einigen', titel: { en: 'Suggesting and deciding', fr: 'Proposer et décider', es: 'Proponer y decidir' }, teile: ['dialog'] },
  { id: 'rollenspiel', titel: { en: 'Asking for information', fr: 'Demander des informations', es: 'Pedir información' }, teile: ['dialog'] },
  { id: 'zeit', titel: { en: 'Gaining time', fr: 'Gagner du temps', es: 'Ganar tiempo' }, teile: ['interview', 'monolog', 'dialog'] }
]

export interface Phrase {
  id: string
  gruppe: GruppeId
  stufe: Stufe
  /** Wann man sie braucht (deutsch) */
  situation: string
  text: Record<SprechSprache, string>
}

type Zeile = [string, GruppeId, Stufe, string, string, string, string]
const z = (zeilen: Zeile[]): Phrase[] => zeilen.map(([id, gruppe, stufe, situation, en, fr, es]) => ({ id, gruppe, stufe, situation, text: { en, fr, es } }))

export const PHRASES: Phrase[] = z([
  // ---------- Personal stuff (Musterlösung der Lehrkraft)
  ['p1', 'person', 'A1', 'Du sagst deinen Namen und woher du kommst.', 'My name is … and I come from …', "Je m'appelle … et je viens de …", 'Me llamo … y soy de …'],
  ['p2', 'person', 'A1', 'Du sagst, wie alt du bist.', 'I am … years old.', "J'ai … ans.", 'Tengo … años.'],
  ['p3', 'person', 'A1', 'Du sagst, wann du geboren bist.', 'I was born in … on the … of …', 'Je suis né(e) le … à …', 'Nací el … de … en …'],
  ['p4', 'person', 'A1', 'Du nennst deine besten Freunde.', 'My best friends are …', 'Mes meilleurs amis sont …', 'Mis mejores amigos son …'],
  ['p5', 'person', 'A1', 'Du sagst, was du in deiner Freizeit machst.', 'In my free time I …', 'Pendant mon temps libre, je …', 'En mi tiempo libre …'],
  ['p6', 'person', 'A1', 'Du nennst dein Hobby.', 'My hobby is … / My hobbies are …', 'Mon passe-temps, c’est … / Mes loisirs sont …', 'Mi hobby es … / Mis hobbies son …'],
  ['p7', 'person', 'A2', 'Du beschreibst, wo du wohnst.', 'I live in a small town near …', "J'habite dans une petite ville près de …", 'Vivo en un pueblo cerca de …'],
  ['p8', 'person', 'B1', 'Du erzählst etwas über deine Pläne.', 'In the future I would like to …', "Plus tard, j'aimerais …", 'En el futuro me gustaría …'],
  // ---------- Family and pets
  ['f1', 'familie', 'A1', 'Du sprichst über deine Eltern.', 'My parents are …', 'Mes parents sont …', 'Mis padres son …'],
  ['f2', 'familie', 'A1', 'Du sagst, wie viele Geschwister du hast.', 'I have … brothers and sisters.', "J'ai … frères et sœurs.", 'Tengo … hermanos.'],
  ['f3', 'familie', 'A1', 'Du nennst die Namen deiner Geschwister.', 'His / Her name is … / Their names are …', 'Il / Elle s’appelle … / Ils s’appellent …', 'Se llama … / Se llaman …'],
  ['f4', 'familie', 'A1', 'Du sagst, wie alt jemand ist.', 'He / She is … years old.', 'Il / Elle a … ans.', 'Tiene … años.'],
  ['f5', 'familie', 'A1', 'Du erzählst von euren Haustieren.', 'We have … cats / dogs / rabbits at home.', 'Nous avons … chats / chiens / lapins à la maison.', 'En casa tenemos … gatos / perros / conejos.'],
  ['f6', 'familie', 'A2', 'Du beschreibst jemanden aus deiner Familie.', 'My sister is very funny and she always …', 'Ma sœur est très drôle et elle …', 'Mi hermana es muy divertida y siempre …'],
  // ---------- Free time and school
  ['s1', 'freizeit', 'A1', 'Du nennst dein Lieblingsfach.', 'My favourite subject is … because …', 'Ma matière préférée, c’est … parce que …', 'Mi asignatura favorita es … porque …'],
  ['s2', 'freizeit', 'A1', 'Du sagst, wie du zur Schule kommst.', 'I go to school by bus / by bike / on foot.', "Je vais à l'école en bus / à vélo / à pied.", 'Voy al colegio en autobús / en bici / a pie.'],
  ['s3', 'freizeit', 'A2', 'Du sagst, wie oft du etwas machst.', 'I play … twice a week / every weekend.', 'Je fais … deux fois par semaine / tous les week-ends.', 'Juego … dos veces a la semana / todos los fines de semana.'],
  ['s4', 'freizeit', 'A2', 'Du erzählst, was du am Wochenende gemacht hast.', 'Last weekend I …', 'Le week-end dernier, j’ai …', 'El fin de semana pasado …'],
  // ---------- Holidays
  ['h1', 'ferien', 'A2', 'Du erzählst von deinen letzten Ferien (Vergangenheit!).', 'In my last holidays I / we …', "Pendant mes dernières vacances, j'ai / nous avons …", 'En mis últimas vacaciones …'],
  ['h2', 'ferien', 'A2', 'Du erzählst von deinen nächsten Ferien (Zukunft).', 'In my next holidays I / we will …', 'Pendant mes prochaines vacances, je vais …', 'En mis próximas vacaciones voy a …'],
  ['h3', 'ferien', 'B1', 'Du sagst, was dir an einem Ort am besten gefallen hat.', 'What I liked most about it was …', "Ce qui m'a le plus plu, c'était …", 'Lo que más me gustó fue …'],
  // ---------- Likes and dislikes
  ['v1', 'vorlieben', 'A1', 'Du nennst etwas, das du am liebsten magst.', 'My favourite … is / are …', 'Mon / Ma … préféré(e), c’est …', 'Mi … favorito es …'],
  ['v2', 'vorlieben', 'A1', 'Du sagst, was du gern machst.', 'I really enjoy …', "J'adore …", 'Me encanta …'],
  ['v3', 'vorlieben', 'A1', 'Du sagst, was du magst oder nicht magst.', 'I like / dislike …', "J'aime / Je n'aime pas …", 'Me gusta / No me gusta …'],
  ['v4', 'vorlieben', 'A2', 'Du sagst, was du lieber machst.', 'I prefer … to …', 'Je préfère … à …', 'Prefiero … a …'],
  ['v5', 'vorlieben', 'B1', 'Du sagst, worauf du gar keine Lust hast.', "I can't stand …", 'Je déteste …', 'No soporto …'],
  // ---------- Connectives (Musterlösung)
  ['k1', 'verbinden', 'A1', 'Du verbindest zwei Gedanken.', '… and …', '… et …', '… y …'],
  ['k2', 'verbinden', 'A1', 'Du nennst einen Gegensatz.', '… but …', '… mais …', '… pero …'],
  ['k3', 'verbinden', 'A1', 'Du nennst einen Grund.', '… because …', '… parce que …', '… porque …'],
  ['k4', 'verbinden', 'A1', 'Du nennst eine Alternative.', '… or …', '… ou …', '… o …'],
  ['k5', 'verbinden', 'A2', 'Du setzt einen Gegensatz an den Satzanfang.', 'However, …', 'Pourtant, …', 'Sin embargo, …'],
  ['k6', 'verbinden', 'B1', 'Du sagst: trotzdem.', 'Nonetheless, …', 'Néanmoins, …', 'No obstante, …'],
  ['k7', 'verbinden', 'A2', 'Du ordnest deine Gedanken.', 'First … Then … Finally …', "D'abord … Ensuite … Enfin …", 'Primero … Luego … Al final …'],
  // ---------- Describing pictures
  ['b1', 'bild', 'A1', 'Du sagst, was auf dem Bild zu sehen ist.', 'In the picture I can see …', "Sur l'image, je vois …", 'En la foto veo …'],
  ['b2', 'bild', 'A1', 'Du beschreibst, wo etwas ist.', 'On the left / On the right there is …', 'À gauche / À droite, il y a …', 'A la izquierda / A la derecha hay …'],
  ['b3', 'bild', 'A2', 'Du beschreibst Vorder- und Hintergrund.', 'In the foreground / In the background …', "Au premier plan / À l'arrière-plan …", 'En primer plano / Al fondo …'],
  ['b4', 'bild', 'A2', 'Du beschreibst, was jemand gerade tut.', 'The boy is … -ing.', 'Le garçon est en train de …', 'El chico está … -ando / -iendo.'],
  ['b5', 'bild', 'A2', 'Du vermutest etwas.', 'Maybe they are … / They might be …', 'Peut-être qu’ils … / Ils sont peut-être …', 'Quizás están … / Puede que …'],
  ['b6', 'bild', 'B1', 'Du sagst, welche Stimmung das Bild hat.', 'The atmosphere seems to be … because …', "L'ambiance a l'air … parce que …", 'El ambiente parece … porque …'],
  ['b7', 'bild', 'B2', 'Du verallgemeinerst über die Bilder hinaus.', 'These pictures suggest that …', 'Ces images montrent que …', 'Estas fotos sugieren que …'],
  // ---------- Opinion
  ['m1', 'meinung', 'A1', 'Du sagst deine Meinung.', 'I think …', 'Je pense que …', 'Creo que …'],
  ['m2', 'meinung', 'A2', 'Du sagst deine Meinung etwas eleganter.', 'In my opinion, …', 'À mon avis, …', 'En mi opinión, …'],
  ['m3', 'meinung', 'A2', 'Du sagst deine Meinung (aus der Musterlösung).', 'If you ask me, …', 'Si tu veux mon avis, …', 'Si me preguntas, …'],
  ['m4', 'meinung', 'B1', 'Du sagst, wie es dir vorkommt.', 'It seems to me that …', "Il me semble que …", 'Me parece que …'],
  ['m5', 'meinung', 'B1', 'Du leitest deine Sicht ein.', 'Well, in my view …', 'Eh bien, de mon point de vue …', 'Bueno, desde mi punto de vista …'],
  ['m6', 'meinung', 'B2', 'Du wägst ab.', 'On the one hand … on the other hand …', "D'un côté … de l'autre …", 'Por un lado … por otro lado …'],
  // ---------- Getting a discussion started (Musterlösung)
  ['d1', 'diskussion', 'A1', 'Du fragst nach Ideen.', 'What are your ideas?', 'Quelles sont tes idées ?', '¿Qué ideas tienes?'],
  ['d2', 'diskussion', 'A1', 'Du fragst nach der Meinung zu etwas.', 'What do you think of / about …?', "Qu'est-ce que tu penses de …?", '¿Qué piensas de …?'],
  ['d3', 'diskussion', 'A2', 'Du beginnst das Gespräch.', "Shall we start with …?", 'On commence par …?', '¿Empezamos con …?'],
  ['d4', 'diskussion', 'A1', 'Du sagst, was du (nicht) denkst.', "I (don't) think …", 'Je (ne) pense (pas) que …', '(No) creo que …'],
  // ---------- Agreeing (Musterlösung)
  ['z1', 'zustimmen', 'A1', 'Du stimmst zu und begründest.', 'I think so too because …', 'Je pense aussi parce que …', 'Yo también lo creo porque …'],
  ['z2', 'zustimmen', 'A1', 'Du stimmst vorsichtig zu.', 'You could be right.', 'Tu as peut-être raison.', 'Puede que tengas razón.'],
  ['z3', 'zustimmen', 'A1', 'Du stimmst zu.', 'I agree because …', "Je suis d'accord parce que …", 'Estoy de acuerdo porque …'],
  ['z4', 'zustimmen', 'A2', 'Du lobst eine Idee.', "That's a good / great idea because …", "C'est une bonne idée parce que …", 'Es una buena idea porque …'],
  ['z5', 'zustimmen', 'B1', 'Du stimmst teilweise zu.', 'I partly agree because …', "Je suis en partie d'accord parce que …", 'Estoy de acuerdo en parte porque …'],
  // ---------- Disagreeing (Musterlösung)
  ['w1', 'widersprechen', 'A1', 'Du widersprichst.', 'I disagree because …', "Je ne suis pas d'accord parce que …", 'No estoy de acuerdo porque …'],
  ['w2', 'widersprechen', 'A1', 'Du widersprichst freundlich.', "I don't think so because …", 'Je ne crois pas parce que …', 'No lo creo porque …'],
  ['w3', 'widersprechen', 'A2', 'Du widersprichst mit „aber".', "That's an interesting idea, but …", "C'est une idée intéressante, mais …", 'Es una idea interesante, pero …'],
  ['w4', 'widersprechen', 'B1', 'Du schlägst vor, etwas anderes zu bedenken.', 'Maybe we should consider …', 'Peut-être qu’on devrait penser à …', 'Quizás deberíamos pensar en …'],
  ['w5', 'widersprechen', 'B1', 'Du sagst höflich, dass jemand falsch liegt.', "I'm afraid you're wrong because …", "Je crains que tu aies tort parce que …", 'Me temo que no tienes razón porque …'],
  // ---------- Clarification (Musterlösung)
  ['n1', 'nachfragen', 'A1', 'Du fragst, was jemand meint.', 'What do you mean?', 'Qu’est-ce que tu veux dire ?', '¿Qué quieres decir?'],
  ['n2', 'nachfragen', 'A1', 'Du bittest um Wiederholung.', 'Can you say that again, please?', 'Tu peux répéter, s’il te plaît ?', '¿Puedes repetir, por favor?'],
  ['n3', 'nachfragen', 'A2', 'Du fragst nach, was jemand sagen will.', 'What are you trying to say?', "Qu'est-ce que tu essaies de dire ?", '¿Qué intentas decir?'],
  ['n4', 'nachfragen', 'A2', 'Du sagst, dass du ein Wort nicht kennst.', "I don't know the word for it. It's a thing you use to …", 'Je ne connais pas le mot. C’est un objet pour …', 'No sé la palabra. Es una cosa para …'],
  // ---------- Interrupt politely (Musterlösung)
  ['u1', 'unterbrechen', 'A2', 'Du unterbrichst höflich.', 'Sorry to interrupt, but …', 'Désolé(e) de t’interrompre, mais …', 'Perdona que te interrumpa, pero …'],
  ['u2', 'unterbrechen', 'A2', 'Du unterbrichst kurz.', "I'm sorry, but …", 'Pardon, mais …', 'Lo siento, pero …'],
  ['u3', 'unterbrechen', 'A2', 'Du möchtest etwas ergänzen.', 'Can / May I add something?', 'Je peux ajouter quelque chose ?', '¿Puedo añadir algo?'],
  // ---------- Suggesting and deciding
  ['e1', 'einigen', 'A1', 'Du machst einen Vorschlag.', "Let's …", 'On pourrait …', 'Podemos …'],
  ['e2', 'einigen', 'A2', 'Du fragst nach einem Vorschlag.', 'What about …?', 'Et si on …?', '¿Qué tal si …?'],
  ['e3', 'einigen', 'A2', 'Du fragst, ob der andere einverstanden ist.', 'Is that OK for you?', "Ça te va ?", '¿Te parece bien?'],
  ['e4', 'einigen', 'B1', 'Du schlägst einen Kompromiss vor.', 'How about a compromise: …', 'On peut faire un compromis : …', 'Podemos llegar a un acuerdo: …'],
  ['e5', 'einigen', 'A2', 'Ihr kommt zu einer Entscheidung.', "So we agree on …, don't we?", 'Alors, on est d’accord pour …?', 'Entonces, estamos de acuerdo en …, ¿no?'],
  // ---------- Asking for information (role plays / info gap)
  ['r1', 'rollenspiel', 'A1', 'Du fragst nach dem Preis.', 'How much is it?', 'Ça coûte combien ?', '¿Cuánto cuesta?'],
  ['r2', 'rollenspiel', 'A1', 'Du fragst nach der Uhrzeit oder Öffnungszeit.', 'When does it open / start?', 'Ça ouvre / commence à quelle heure ?', '¿A qué hora abre / empieza?'],
  ['r3', 'rollenspiel', 'A1', 'Du bestellst oder bittest höflich um etwas.', "I'd like …, please.", 'Je voudrais …, s’il vous plaît.', 'Quería …, por favor.'],
  ['r4', 'rollenspiel', 'A2', 'Du fragst, wo etwas ist.', 'Where is it? / How do I get there?', 'C’est où ? / Comment on y va ?', '¿Dónde está? / ¿Cómo llego?'],
  ['r5', 'rollenspiel', 'A2', 'Du fragst, für wen etwas ist.', 'Who is it for?', 'C’est pour qui ?', '¿Para quién es?'],
  // ---------- Gaining time
  ['t1', 'zeit', 'A1', 'Du brauchst kurz Zeit zum Nachdenken.', 'Let me think …', 'Attends, je réfléchis …', 'Déjame pensar …'],
  ['t2', 'zeit', 'A2', 'Du überbrückst eine Pause.', "Well, that's a good question …", "Eh bien, c'est une bonne question …", 'Bueno, es una buena pregunta …'],
  ['t3', 'zeit', 'B1', 'Du sagst etwas mit anderen Worten.', 'What I mean is …', 'Ce que je veux dire, c’est que …', 'Lo que quiero decir es que …']
])

/** Phrases bis zur Stufe (A1 < A2 < B1 < B2) */
const RANG: Record<Stufe, number> = { A1: 0, A2: 1, B1: 2, B2: 3 }
export const phrasesBis = (stufe: Stufe): Phrase[] => PHRASES.filter((p) => RANG[p.stufe] <= RANG[stufe])
export const phrasesFuerTeil = (teil: Teil, stufe: Stufe): Phrase[] => {
  const gruppen = new Set(GRUPPEN.filter((g) => teil === 'simulation' || g.teile.includes(teil)).map((g) => g.id))
  return phrasesBis(stufe).filter((p) => gruppen.has(p.gruppe))
}
