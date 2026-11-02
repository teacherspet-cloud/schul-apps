/**
 * Texte der Klassenspiele in der Zielsprache des Kurses (02.11.2026, Wunsch der Lehrkraft: Beamer und Gerät in der
 * Zielsprache – wie „Nur Fremdsprache" bei den übrigen Spielen, spielSprache.ts). Fassungen: de (DaZ-Kurse), en, fr, es,
 * it, la; fehlt eine Sprache, gilt Englisch (wie in spielSprache.ts). Platzhalter {0}, {1} …
 * Nur für das, was Lernende und Beamer zeigen – Steuerung und Auswertung der Lehrkraft bleiben Deutsch.
 */
import { textSprache } from '../spielSprache'

type T = { de: string; en: string; fr: string; es: string; it: string; la: string }
const t = (de: string, en: string, fr: string, es: string, it: string, la: string): T => ({ de, en, fr, es, it, la })

export const KT = {
  // ---------------------------------------------------------------- Namen und Regeln
  n_expedition: t('Klassen-Expedition', 'Class Expedition', 'Expédition de classe', 'Expedición de la clase', 'Spedizione di classe', 'Expeditio classis'),
  n_boss: t('Boss-Kampf', 'Boss Battle', 'Combat contre le boss', 'Batalla contra el jefe', 'Battaglia contro il boss', 'Pugna cum monstro'),
  n_rennen: t('Tauziehen & Rennen', 'Tug of War & Race', 'Tir à la corde & course', 'Tira y afloja & carrera', 'Tiro alla fune & corsa', 'Certamen funis & cursus'),
  n_puzzle: t('Team-Puzzle', 'Team Puzzle', "Puzzle d'équipe", 'Puzle en equipo', 'Puzzle di squadra', 'Aenigma turmae'),
  n_rekord: t('Klasse gegen den Rekord', 'Class vs. Record', 'La classe contre son record', 'La clase contra su récord', 'La classe contro il record', 'Classis contra summum'),
  n_gebiet: t('Gebietseroberung', 'Territory Conquest', 'Conquête de territoire', 'Conquista de territorio', 'Conquista del territorio', 'Expugnatio agrorum'),
  n_turnier: t('Turnier-Tische', 'Tournament Tables', 'Tables de tournoi', 'Mesas de torneo', 'Tavoli del torneo', 'Mensae certaminis'),
  n_wette: t('Wett-Quiz', 'Betting Quiz', 'Quiz des paris', 'Quiz de apuestas', 'Quiz delle scommesse', 'Quaestiones cum pignore'),
  r_expedition: t(
    'Jede richtige Antwort bringt die Klasse höher. Ein Lager ist erst geschafft, wenn genug richtig ist UND die Klasse sorgfältig bleibt.',
    'Every right answer takes the class higher. A camp only counts when there are enough right answers AND the class stays careful.',
    'Chaque bonne réponse fait monter la classe. Un camp est atteint seulement avec assez de bonnes réponses ET si la classe reste soigneuse.',
    'Cada respuesta correcta sube a la clase. Un campamento solo cuenta con suficientes aciertos Y si la clase sigue con cuidado.',
    'Ogni risposta giusta porta la classe più in alto. Un campo vale solo con abbastanza risposte giuste E se la classe resta attenta.',
    'Quodque responsum rectum classem altius ducit. Castra tantum valent, si satis recta sunt ET classis diligens manet.'
  ),
  r_boss: t(
    'Richtige Antworten schaden dem Boss, schwerere mehr. Was falsch war, kommt als Angriff zurück – bis es sitzt.',
    'Right answers hurt the boss, harder ones more. Mistakes come back as attacks – until you get them right.',
    'Les bonnes réponses blessent le boss, les plus difficiles davantage. Les erreurs reviennent comme attaques – jusqu’à ce que ce soit juste.',
    'Las respuestas correctas dañan al jefe, las difíciles más. Los errores vuelven como ataques, hasta que salgan bien.',
    'Le risposte giuste colpiscono il boss, quelle difficili di più. Gli errori tornano come attacchi – finché non li sai.',
    'Responsa recta monstrum laedunt, difficiliora magis. Errata ut impetus redeunt – donec recte dicis.'
  ),
  r_rennen: t(
    'Jede richtige Antwort bringt dein Team voran. Gezählt wird je Teammitglied – kleine Teams sind nicht im Nachteil.',
    'Every right answer moves your team forward. It counts per team member – small teams are not at a disadvantage.',
    'Chaque bonne réponse fait avancer ton équipe. On compte par membre – les petites équipes ne sont pas désavantagées.',
    'Cada respuesta correcta hace avanzar a tu equipo. Se cuenta por miembro: los equipos pequeños no están en desventaja.',
    'Ogni risposta giusta fa avanzare la tua squadra. Si conta per membro – le squadre piccole non sono svantaggiate.',
    'Quodque responsum rectum turmam tuam promovet. Pro singulis sodalibus numeratur – parvae turmae non laeduntur.'
  ),
  r_puzzle: t(
    'Setzt euch zusammen! Ihr seht dieselbe Frage, aber verschiedene Karten. Nur ein Gerät hat die richtige – redet miteinander!',
    'Sit together! You all see the same question but different cards. Only one device has the right one – talk to each other!',
    'Asseyez-vous ensemble ! Vous voyez la même question mais des cartes différentes. Un seul appareil a la bonne – parlez-vous !',
    '¡Sentaos juntos! Veis la misma pregunta pero cartas distintas. Solo un aparato tiene la correcta: ¡hablad entre vosotros!',
    'Sedetevi insieme! Vedete la stessa domanda ma carte diverse. Solo un dispositivo ha quella giusta – parlate tra voi!',
    'Una considite! Eandem quaestionem videtis, sed chartas diversas. Unum tantum instrumentum rectam habet – colloquimini!'
  ),
  r_rekord: t(
    'Die Klasse spielt gegen ihren letzten Bestwert: Treffer mal Sorgfalt. Genau sein zählt so viel wie schnell sein.',
    'The class plays against its best score: hits times care. Being accurate counts as much as being fast.',
    'La classe joue contre son meilleur score : réussites fois soin. La précision compte autant que la vitesse.',
    'La clase juega contra su mejor marca: aciertos por cuidado. La precisión cuenta tanto como la rapidez.',
    'La classe gioca contro il suo record: risposte giuste per attenzione. La precisione conta quanto la velocità.',
    'Classis contra summum suum ludit: recta per diligentiam. Diligentia tantum valet quantum celeritas.'
  ),
  r_gebiet: t(
    'Wähle ★, ★★ oder ★★★. Richtig → dein Team holt ein Feld mit so vielen Sternen. ★★★ darf Felder der anderen nehmen.',
    'Choose ★, ★★ or ★★★. Right → your team takes a field with that many stars. ★★★ may take other teams’ fields.',
    'Choisis ★, ★★ ou ★★★. Juste → ton équipe prend une case avec autant d’étoiles. ★★★ peut prendre les cases des autres.',
    'Elige ★, ★★ o ★★★. Correcto → tu equipo gana una casilla con esas estrellas. ★★★ puede quitar casillas a otros.',
    'Scegli ★, ★★ o ★★★. Giusto → la tua squadra prende una casella con tante stelle. ★★★ può prendere caselle degli altri.',
    'Elige ★, ★★ aut ★★★. Recte → turma tua agrum cum tot stellis capit. ★★★ agros aliorum capere licet.'
  ),
  r_turnier: t(
    'An jedem Tisch spielen 2–3 gegeneinander. Die Plätze am Tisch bringen Punkte für dein Team. Nach jeder Runde wird neu gesetzt.',
    'At each table 2–3 players compete. Your place at the table earns points for your team. After each round, seats change.',
    'À chaque table, 2–3 joueurs s’affrontent. Ta place rapporte des points à ton équipe. Après chaque manche, on change de place.',
    'En cada mesa compiten 2–3. Tu puesto en la mesa da puntos a tu equipo. Tras cada ronda se cambia de sitio.',
    'A ogni tavolo giocano 2–3. Il tuo posto al tavolo dà punti alla tua squadra. Dopo ogni turno si cambia posto.',
    'Ad quamque mensam bini aut terni certant. Locus tuus turmae puncta dat. Post quemque circuitum sedes mutantur.'
  ),
  r_wette: t(
    'Vor jeder Frage setzt du 1, 2 oder 3 Punkte. Richtig: Einsatz dazu. Falsch: Einsatz weg. Am Ende siehst du, wie gut du dich einschätzt.',
    'Before each question, bet 1, 2 or 3 points. Right: you win the bet. Wrong: you lose it. At the end you see how well you judge yourself.',
    'Avant chaque question, mise 1, 2 ou 3 points. Juste : tu gagnes la mise. Faux : tu la perds. À la fin, tu vois si tu te connais bien.',
    'Antes de cada pregunta apuesta 1, 2 o 3 puntos. Bien: ganas la apuesta. Mal: la pierdes. Al final ves si te conoces bien.',
    'Prima di ogni domanda punta 1, 2 o 3 punti. Giusto: vinci la puntata. Sbagliato: la perdi. Alla fine vedi se ti valuti bene.',
    'Ante quamque quaestionem pignus 1, 2 aut 3 punctorum pone. Recte: lucraris. Male: amittis. Denique vides, quam bene te aestimes.'
  ),

  // ---------------------------------------------------------------- allgemein
  team: t('Team {0}', 'Team {0}', 'Équipe {0}', 'Equipo {0}', 'Squadra {0}', 'Turma {0}'),
  farben: t('Rot|Blau|Grün|Gelb|Lila|Orange', 'Red|Blue|Green|Yellow|Purple|Orange', 'Rouge|Bleue|Verte|Jaune|Violette|Orange', 'Rojo|Azul|Verde|Amarillo|Morado|Naranja', 'Rossa|Blu|Verde|Gialla|Viola|Arancione', 'Rubra|Caerulea|Viridis|Flava|Purpurea|Aurantia'),
  zRichtig: t('Richtig', 'Right', 'Justes', 'Aciertos', 'Giuste', 'Recta'),
  zDabei: t('Dabei', 'Playing', 'Joueurs', 'Jugando', 'In gioco', 'Ludentes'),
  fuehrt: t('{0} führt!', '{0} is in the lead!', '{0} est en tête !', '¡{0} va en cabeza!', '{0} è in testa!', '{0} ducit!'),
  imZiel: t('{0} ist im Ziel!', '{0} has reached the goal!', '{0} est arrivée !', '¡{0} ha llegado a la meta!', '{0} è arrivata al traguardo!', '{0} metam attigit!'),
  gewinnt: t('{0} gewinnt!', '{0} wins!', '{0} gagne !', '¡{0} gana!', '{0} vince!', '{0} vincit!'),
  unentschieden: t('Unentschieden: {0}!', "It's a draw: {0}!", 'Égalité : {0} !', '¡Empate: {0}!', 'Pareggio: {0}!', 'Aequo Marte: {0}!'),

  // ---------------------------------------------------------------- Expedition
  lager: t('Basislager|Waldgrenze|Felsband|Gletscher|Grat|Gipfel', 'Base camp|Tree line|Rock band|Glacier|Ridge|Summit', 'Camp de base|Lisière|Barre rocheuse|Glacier|Arête|Sommet', 'Campo base|Límite del bosque|Franja rocosa|Glaciar|Cresta|Cumbre', 'Campo base|Limite del bosco|Fascia rocciosa|Ghiacciaio|Cresta|Vetta', 'Castra prima|Finis silvae|Rupes|Glacies|Iugum|Cacumen'),
  exZuVieleFehler: t('Zu viele Fehler – erst sorgfältiger werden, dann geht es weiter!', 'Too many mistakes – be more careful, then you can go on!', 'Trop d’erreurs – soyez plus soigneux, puis on continue !', 'Demasiados errores: más cuidado y luego seguimos.', 'Troppi errori – più attenzione, poi si continua!', 'Nimis errorum – diligentius agite, deinde pergimus!'),
  exGeschafft: t('{0} geschafft – weiter: {1}!', '{0} reached – next: {1}!', '{0} atteint – ensuite : {1} !', '¡{0} conseguido! Siguiente: {1}', '{0} raggiunto – prossimo: {1}!', '{0} attigimus – deinde: {1}!'),
  exGipfel: t('Gipfel erreicht! 🏔️', 'Summit reached! 🏔️', 'Sommet atteint ! 🏔️', '¡Cumbre alcanzada! 🏔️', 'Vetta raggiunta! 🏔️', 'Cacumen attigimus! 🏔️'),
  exHinweis: t('Sorgfalt! Mehr als 70 % müssen richtig sein.', 'Be careful! More than 70 % must be right.', 'Attention ! Plus de 70 % doivent être justes.', '¡Cuidado! Más del 70 % debe ser correcto.', 'Attenzione! Più del 70 % deve essere giusto.', 'Diligenter! Plus quam LXX centesimae rectae esse debent.'),
  exSorgfaltGeraet: t('Sorgfalt zählt – lieber genau als schnell!', 'Care counts – better accurate than fast!', 'Le soin compte – mieux vaut juste que rapide !', 'Cuenta el cuidado: mejor exacto que rápido.', 'Conta l’attenzione – meglio preciso che veloce!', 'Diligentia valet – potius recte quam celeriter!'),
  exSorgfalt: t('Sorgfalt (letzte 30)', 'Care (last 30)', 'Soin (30 dernières)', 'Cuidado (últimas 30)', 'Attenzione (ultime 30)', 'Diligentia (XXX ultima)'),
  exErgebnisGipfel: t('Die Klasse hat den Gipfel erreicht!', 'The class reached the summit!', 'La classe a atteint le sommet !', '¡La clase ha llegado a la cumbre!', 'La classe ha raggiunto la vetta!', 'Classis cacumen attigit!'),
  exErgebnis: t('Die Klasse hat {0} von {1} Lagern geschafft.', 'The class reached {0} of {1} camps.', 'La classe a atteint {0} camps sur {1}.', 'La clase ha conseguido {0} de {1} campamentos.', 'La classe ha raggiunto {0} campi su {1}.', 'Classis {0} castra ex {1} attigit.'),
  exLager: t('Lager {0}/{1}', 'Camp {0}/{1}', 'Camp {0}/{1}', 'Campamento {0}/{1}', 'Campo {0}/{1}', 'Castra {0}/{1}'),

  // ---------------------------------------------------------------- Boss
  bossNamen: t('Grammatik-Drache|Vokabel-Krake|Fehlerteufel|Wort-Golem', 'Grammar Dragon|Vocab Kraken|Mistake Devil|Word Golem', 'Dragon de grammaire|Kraken du vocabulaire|Diable des fautes|Golem des mots', 'Dragón gramatical|Kraken del vocabulario|Diablo de errores|Gólem de palabras', 'Drago della grammatica|Kraken del lessico|Diavolo degli errori|Golem delle parole', 'Draco grammaticus|Polypus verborum|Daemon errorum|Golem verborum'),
  boAbgewehrt: t('{0} Angriffe abgewehrt!', '{0} attacks fought off!', '{0} attaques repoussées !', '¡{0} ataques rechazados!', '{0} attacchi respinti!', '{0} impetus repulsi!'),
  boRuestung: t('{0} legt Rüstung an – Schreiben trifft jetzt stärker!', '{0} puts on armour – writing hits harder now!', '{0} met son armure – écrire frappe plus fort maintenant !', '{0} se pone la armadura: ¡escribir golpea más fuerte!', '{0} indossa l’armatura – scrivere colpisce più forte!', '{0} arma induit – nunc scribere fortius ferit!'),
  boBesiegt: t('{0} ist besiegt! 🎉', '{0} is defeated! 🎉', '{0} est vaincu ! 🎉', '¡{0} ha sido derrotado! 🎉', '{0} è sconfitto! 🎉', '{0} victus est! 🎉'),
  boEntkommen: t('{0} ist entkommen – {1} % Schaden.', '{0} escaped – {1} % damage.', '{0} s’est échappé – {1} % de dégâts.', '{0} ha escapado: {1} % de daño.', '{0} è scappato – {1} % di danni.', '{0} effugit – {1} centesimae damni.'),
  boTreffer: t('Treffer', 'Hits', 'Coups', 'Golpes', 'Colpi', 'Ictus'),
  boAngriffe: t('Offene Angriffe', 'Open attacks', 'Attaques en cours', 'Ataques abiertos', 'Attacchi aperti', 'Impetus aperti'),
  boAbgewehrtT: t('Abgewehrt', 'Fought off', 'Repoussées', 'Rechazados', 'Respinti', 'Repulsi'),
  boLeben: t('{0} / {1} Lebenspunkte · Phase {2}', '{0} / {1} health · Phase {2}', '{0} / {1} points de vie · Phase {2}', '{0} / {1} de vida · Fase {2}', '{0} / {1} punti vita · Fase {2}', '{0} / {1} vitae · Gradus {2}'),
  boRuestungHinweis: t('Rüstung: Schreiben trifft doppelt!', 'Armour: writing hits double!', 'Armure : écrire frappe double !', 'Armadura: ¡escribir golpea el doble!', 'Armatura: scrivere colpisce il doppio!', 'Arma: scribere bis ferit!'),
  boRekordSieg: t('Boss besiegt', 'Boss defeated', 'Boss vaincu', 'Jefe derrotado', 'Boss sconfitto', 'Monstrum victum'),
  boRekordSchaden: t('{0} % Schaden', '{0} % damage', '{0} % de dégâts', '{0} % de daño', '{0} % di danni', '{0} centesimae damni'),

  // ---------------------------------------------------------------- Rennen
  reZiel: t('Ziel: {0} Schritte je Teammitglied', 'Goal: {0} steps per team member', 'Objectif : {0} pas par membre', 'Meta: {0} pasos por miembro', 'Traguardo: {0} passi per membro', 'Meta: {0} gradus pro sodali'),
  reSchritte: t('{0} Schritte gesamt', '{0} steps in total', '{0} pas au total', '{0} pasos en total', '{0} passi in totale', '{0} gradus omnino'),

  // ---------------------------------------------------------------- Team-Puzzle
  puRichtig: t('{0}: richtig!', '{0}: right!', '{0} : juste !', '{0}: ¡correcto!', '{0}: giusto!', '{0}: recte!'),
  puFalsch: t('{0}: falsch – richtig war „{1}“. Zwei Schritte zurück.', '{0}: wrong – the answer was “{1}”. Two steps back.', '{0} : faux – la réponse était « {1} ». Deux pas en arrière.', '{0}: mal, la respuesta era «{1}». Dos pasos atrás.', '{0}: sbagliato – la risposta era «{1}». Due passi indietro.', '{0}: male – responsum erat “{1}”. Duo gradus retro.'),
  puImZiel: t('🏁 Euer Team ist im Ziel! Drückt den anderen die Daumen.', '🏁 Your team has finished! Keep your fingers crossed for the others.', '🏁 Votre équipe est arrivée ! Croisez les doigts pour les autres.', '🏁 ¡Vuestro equipo ha llegado! Animad a los demás.', '🏁 La vostra squadra è arrivata! Fate il tifo per gli altri.', '🏁 Turma vestra metam attigit! Ceteris favete.'),
  puMoment: t('Einen Moment …', 'One moment …', 'Un instant …', 'Un momento…', 'Un momento …', 'Momentum …'),
  puReden: t('Nur ein Gerät in eurem Team hat die richtige Karte – redet miteinander!', 'Only one device in your team has the right card – talk to each other!', 'Un seul appareil de votre équipe a la bonne carte – parlez-vous !', 'Solo un aparato de vuestro equipo tiene la carta correcta: ¡hablad!', 'Solo un dispositivo della squadra ha la carta giusta – parlate tra voi!', 'Unum tantum instrumentum turmae chartam rectam habet – colloquimini!'),
  puKeinTeam: t('Gleich bekommst du ein Team.', 'You will get a team in a moment.', 'Tu vas recevoir une équipe.', 'Enseguida tendrás un equipo.', 'Tra poco avrai una squadra.', 'Mox turmam accipies.'),
  puTeamsImZiel: t('Teams im Ziel', 'Teams finished', 'Équipes arrivées', 'Equipos en la meta', 'Squadre arrivate', 'Turmae in meta'),
  puAlle: t('Alle Teams im Ziel! 🎉', 'All teams have finished! 🎉', 'Toutes les équipes sont arrivées ! 🎉', '¡Todos los equipos en la meta! 🎉', 'Tutte le squadre sono arrivate! 🎉', 'Omnes turmae metam attigerunt! 🎉'),
  puAlleErgebnis: t('Alle Teams im Ziel! Zuerst: {0}.', 'All teams finished! First: {0}.', 'Toutes les équipes sont arrivées ! Première : {0}.', '¡Todos en la meta! Primero: {0}.', 'Tutte le squadre arrivate! Prima: {0}.', 'Omnes turmae in meta! Prima: {0}.'),
  puErgebnis: t('{0} von {1} Teams im Ziel.', '{0} of {1} teams finished.', '{0} équipes sur {1} arrivées.', '{0} de {1} equipos en la meta.', '{0} squadre su {1} arrivate.', '{0} ex {1} turmis in meta.'),
  puRekord: t('{0} Schritte aller Teams', '{0} steps of all teams', '{0} pas de toutes les équipes', '{0} pasos de todos los equipos', '{0} passi di tutte le squadre', '{0} gradus omnium turmarum'),

  // ---------------------------------------------------------------- Rekord
  rkUeber: t('Ihr liegt über eurem Rekord – haltet durch!', 'You are above your record – keep going!', 'Vous dépassez votre record – tenez bon !', 'Estáis por encima de vuestro récord: ¡seguid así!', 'Siete sopra il vostro record – tenete duro!', 'Summum vestrum superatis – perseverate!'),
  rkKlasse: t('Klasse: {0}', 'Class: {0}', 'Classe : {0}', 'Clase: {0}', 'Classe: {0}', 'Classis: {0}'),
  rkRekord: t('Rekord: {0}', 'Record: {0}', 'Record : {0}', 'Récord: {0}', 'Record: {0}', 'Summum: {0}'),
  rkEinheit: t('{0} Punkte je Kind und Minute', '{0} points per pupil and minute', '{0} points par élève et par minute', '{0} puntos por alumno y minuto', '{0} punti per alunno al minuto', '{0} puncta pro discipulo et minuto'),
  rkErster: t('Erster Rekord: {0}.', 'First record: {0}.', 'Premier record : {0}.', 'Primer récord: {0}.', 'Primo record: {0}.', 'Primum summum: {0}.'),
  rkNeu: t('Neuer Rekord! {0} (vorher {1}).', 'New record! {0} (before: {1}).', 'Nouveau record ! {0} (avant : {1}).', '¡Nuevo récord! {0} (antes: {1}).', 'Nuovo record! {0} (prima: {1}).', 'Novum summum! {0} (antea {1}).'),
  rkHaelt: t('{0} – der Rekord ({1}) hält noch.', '{0} – the record ({1}) still stands.', '{0} – le record ({1}) tient toujours.', '{0}: el récord ({1}) sigue en pie.', '{0} – il record ({1}) resiste ancora.', '{0} – summum ({1}) adhuc stat.'),
  rkJetzt: t('Jetzt', 'Now', 'Maintenant', 'Ahora', 'Ora', 'Nunc'),
  rkBisher: t('Rekord der Klasse', 'Class record', 'Record de la classe', 'Récord de la clase', 'Record della classe', 'Summum classis'),
  rkKeiner: t('noch keiner', 'none yet', 'pas encore', 'todavía ninguno', 'ancora nessuno', 'nondum'),
  rkFormel: t('Punkte je Kind und Minute = Treffer × Sorgfalt', 'Points per pupil and minute = hits × care', 'Points par élève et minute = réussites × soin', 'Puntos por alumno y minuto = aciertos × cuidado', 'Punti per alunno al minuto = risposte giuste × attenzione', 'Puncta pro discipulo et minuto = recta × diligentia'),
  rkSorgfalt: t('{0} % Sorgfalt', '{0} % care', '{0} % de soin', '{0} % de cuidado', '{0} % di attenzione', '{0} centesimae diligentiae'),

  // ---------------------------------------------------------------- Wett-Quiz
  weKonto: t('💰 Dein Konto: {0}', '💰 Your account: {0}', '💰 Ton compte : {0}', '💰 Tu cuenta: {0}', '💰 Il tuo conto: {0}', '💰 Ratio tua: {0}'),
  weEinsatz: t('Einsatz: {0}', 'Bet: {0}', 'Mise : {0}', 'Apuesta: {0}', 'Puntata: {0}', 'Pignus: {0}'),
  weFrage: t('Wie sicher bist du bei der nächsten Frage?', 'How sure are you about the next question?', 'Es-tu sûr(e) pour la prochaine question ?', '¿Qué seguridad tienes en la próxima pregunta?', 'Quanto sei sicuro per la prossima domanda?', 'Quam certus es de proxima quaestione?'),
  we1: t('1 – unsicher', '1 – not sure', '1 – pas sûr(e)', '1 – inseguro', '1 – insicuro', '1 – incertus'),
  we2: t('2 – ziemlich sicher', '2 – quite sure', '2 – assez sûr(e)', '2 – bastante seguro', '2 – abbastanza sicuro', '2 – satis certus'),
  we3: t('3 – ganz sicher', '3 – very sure', '3 – tout à fait sûr(e)', '3 – totalmente seguro', '3 – sicurissimo', '3 – certissimus'),
  weStufe: t('Einsatz {0}: {1} von {2} richtig ({3} %)', 'Bet {0}: {1} of {2} right ({3} %)', 'Mise {0} : {1} sur {2} justes ({3} %)', 'Apuesta {0}: {1} de {2} correctas ({3} %)', 'Puntata {0}: {1} su {2} giuste ({3} %)', 'Pignus {0}: {1} ex {2} recta ({3} %)'),
  weZuSicher: t('Tipp: Bei „ganz sicher“ lagst du oft daneben – prüf dich vorher kurz.', 'Tip: When you were “very sure”, you were often wrong – check yourself first.', 'Conseil : quand tu étais « tout à fait sûr(e) », tu te trompais souvent – vérifie d’abord.', 'Consejo: con «totalmente seguro» fallaste a menudo; compruébalo antes.', 'Consiglio: con «sicurissimo» hai sbagliato spesso – controlla prima.', 'Consilium: cum “certissimus” esses, saepe errabas – prius te examina.'),
  weMehrZutrauen: t('Tipp: Du wusstest mehr, als du dachtest – trau dir mehr zu!', 'Tip: You knew more than you thought – trust yourself more!', 'Conseil : tu savais plus que tu ne pensais – aie plus confiance !', 'Consejo: sabías más de lo que creías. ¡Confía más en ti!', 'Consiglio: sapevi più di quanto pensassi – fidati di più!', 'Consilium: plus sciebas quam putabas – tibi magis confide!'),
  wePasst: t('Deine Einschätzung passt gut zu dem, was du weißt.', 'You judge yourself well.', 'Tu te connais bien.', 'Te valoras bien.', 'Ti valuti bene.', 'Te bene aestimas.'),
  weKontoKurz: t('Konto: {0}', 'Account: {0}', 'Compte : {0}', 'Cuenta: {0}', 'Conto: {0}', 'Ratio: {0}'),
  weErgebnis: t('Bei „ganz sicher“ lag die Klasse zu {0} % richtig.', 'When “very sure”, the class was right {0} % of the time.', 'Quand elle était « tout à fait sûre », la classe avait juste à {0} %.', 'Con «totalmente seguro», la clase acertó un {0} %.', 'Con «sicurissimo» la classe ha risposto giusto al {0} %.', 'Cum “certissima” esset, classis {0} centesimas recte respondit.'),
  weKeiner: t('Niemand hat 3 Punkte gesetzt – mehr Mut beim nächsten Mal!', 'Nobody bet 3 points – be braver next time!', 'Personne n’a misé 3 points – plus de courage la prochaine fois !', 'Nadie apostó 3 puntos: ¡más valor la próxima vez!', 'Nessuno ha puntato 3 punti – più coraggio la prossima volta!', 'Nemo III puncta posuit – proxime fortius!'),
  weAntworten: t('Antworten', 'Answers', 'Réponses', 'Respuestas', 'Risposte', 'Responsa'),
  weSchnitt: t('Ø Einsatz', 'Ø bet', 'Mise moyenne', 'Apuesta media', 'Puntata media', 'Pignus medium'),
  weTitel: t('Wie gut schätzt sich die Klasse ein?', 'How well does the class judge itself?', 'La classe se connaît-elle bien ?', '¿Se valora bien la clase?', 'La classe si valuta bene?', 'Quam bene classis se aestimat?'),
  weRichtigProzent: t('{0} % richtig ({1}×)', '{0} % right ({1}×)', '{0} % justes ({1}×)', '{0} % correctas ({1}×)', '{0} % giuste ({1}×)', '{0} % recta ({1}×)'),
  weErklaerung: t('Gut eingeschätzt heißt: Je höher der Einsatz, desto öfter richtig.', 'Judging well means: the higher the bet, the more often right.', 'Bien s’évaluer : plus la mise est haute, plus c’est souvent juste.', 'Valorarse bien: cuanto más alta la apuesta, más aciertos.', 'Valutarsi bene: più alta la puntata, più spesso giusto.', 'Bene aestimare: quo maius pignus, eo saepius recte.'),
  wePunkte: t('{0} Punkte (Treffer × Quote)', '{0} points (hits × rate)', '{0} points (réussites × taux)', '{0} puntos (aciertos × cuota)', '{0} punti (giuste × quota)', '{0} puncta (recta × ratio)'),

  // ---------------------------------------------------------------- Gebiet
  geErobert: t('{0} erobert ein Feld von {1}!', '{0} takes a field from {1}!', '{0} prend une case à {1} !', '¡{0} le quita una casilla a {1}!', '{0} conquista una casella di {1}!', '{0} agrum ab {1} capit!'),
  geStand: t('{0}: {1} ★ je Kopf · {2} Felder', '{0}: {1} ★ per head · {2} fields', '{0} : {1} ★ par tête · {2} cases', '{0}: {1} ★ por persona · {2} casillas', '{0}: {1} ★ a testa · {2} caselle', '{0}: {1} ★ in capita · {2} agri'),
  geDuSpielst: t('Du spielst um {0}', 'You are playing for {0}', 'Tu joues pour {0}', 'Juegas por {0}', 'Giochi per {0}', 'Pro {0} ludis'),
  geFrage: t('Um wie viele Sterne spielst du?', 'How many stars are you playing for?', 'Pour combien d’étoiles joues-tu ?', '¿Por cuántas estrellas juegas?', 'Per quante stelle giochi?', 'Pro quot stellis ludis?'),
  ge1: t('★ sicher', '★ safe', '★ sûr', '★ seguro', '★ sicuro', '★ tutum'),
  ge2: t('★★ mittel', '★★ medium', '★★ moyen', '★★ medio', '★★ medio', '★★ medium'),
  ge3: t('★★★ schwer – darf erobern', '★★★ hard – may conquer', '★★★ difficile – peut conquérir', '★★★ difícil – puede conquistar', '★★★ difficile – può conquistare', '★★★ difficile – licet capere'),
  geGewinnt: t('{0} gewinnt mit {1} ★ je Kopf!', '{0} wins with {1} ★ per head!', '{0} gagne avec {1} ★ par tête !', '¡{0} gana con {1} ★ por persona!', '{0} vince con {1} ★ a testa!', '{0} vincit cum {1} ★ in capita!'),
  geJeKopf: t('{0} ★ je Kopf', '{0} ★ per head', '{0} ★ par tête', '{0} ★ por persona', '{0} ★ a testa', '{0} ★ in capita'),
  geRekord: t('{0} Sterne erobert', '{0} stars taken', '{0} étoiles conquises', '{0} estrellas conquistadas', '{0} stelle conquistate', '{0} stellae captae'),

  // ---------------------------------------------------------------- Turnier
  tuRundeVorbei: t('Runde {0} vorbei – es wird neu gesetzt.', 'Round {0} is over – new seats.', 'Manche {0} terminée – on change de place.', 'Ronda {0} terminada: cambio de sitios.', 'Turno {0} finito – si cambia posto.', 'Circuitus {0} finitus – sedes mutantur.'),
  tuKopf: t('Runde {0}/{1} · {2}', 'Round {0}/{1} · {2}', 'Manche {0}/{1} · {2}', 'Ronda {0}/{1} · {2}', 'Turno {0}/{1} · {2}', 'Circuitus {0}/{1} · {2}'),
  tuMit: t('mit {0}', 'with {0}', 'avec {0}', 'con {0}', 'con {0}', 'cum {0}'),
  tuFuer: t('für {0}', 'for {0}', 'pour {0}', 'para {0}', 'per {0}', 'pro {0}'),
  tuFertig: t('Fertig: {0} von {1} richtig. Warte auf die anderen am Tisch …', 'Done: {0} of {1} right. Wait for the others at your table …', 'Fini : {0} sur {1} justes. Attends les autres à ta table …', 'Terminado: {0} de {1} correctas. Espera a los demás de tu mesa…', 'Finito: {0} su {1} giuste. Aspetta gli altri al tavolo …', 'Perfectum: {0} ex {1} recta. Ceteros ad mensam exspecta …'),
  tuFrage: t('Frage {0} von {1}', 'Question {0} of {1}', 'Question {0} sur {1}', 'Pregunta {0} de {1}', 'Domanda {0} di {1}', 'Quaestio {0} ex {1}'),
  tuTisch: t('Tisch {0}', 'Table {0}', 'Table {0}', 'Mesa {0}', 'Tavolo {0}', 'Mensa {0}'),
  tuGewinnt: t('{0} gewinnt das Turnier!', '{0} wins the tournament!', '{0} gagne le tournoi !', '¡{0} gana el torneo!', '{0} vince il torneo!', '{0} certamen vincit!'),
  tuRichtige: t('{0} richtige Antworten', '{0} right answers', '{0} bonnes réponses', '{0} respuestas correctas', '{0} risposte giuste', '{0} responsa recta'),
  tuRunde: t('Runde {0} von {1}', 'Round {0} of {1}', 'Manche {0} sur {1}', 'Ronda {0} de {1}', 'Turno {0} di {1}', 'Circuitus {0} ex {1}'),
  tuTischFertig: t('{0} · {1}/{2} fertig', '{0} · {1}/{2} done', '{0} · {1}/{2} fini', '{0} · {1}/{2} listos', '{0} · {1}/{2} finito', '{0} · {1}/{2} perfecti'),

  // ---------------------------------------------------------------- Oberfläche (Beamer und Gerät)
  uiCode: t('Code eingeben oder scannen', 'Enter or scan the code', 'Saisis ou scanne le code', 'Escribe o escanea el código', 'Inserisci o scansiona il codice', 'Codicem inscribe aut lege'),
  uiDabei: t('Dabei: {0} von {1}', 'Playing: {0} of {1}', 'Présents : {0} sur {1}', 'Jugando: {0} de {1}', 'In gioco: {0} di {1}', 'Ludentes: {0} ex {1}'),
  uiVerbunden: t('({0} verbunden)', '({0} connected)', '({0} connectés)', '({0} conectados)', '({0} connessi)', '({0} coniuncti)'),
  uiPause: t('Pause', 'Pause', 'Pause', 'Pausa', 'Pausa', 'Intermissio'),
  uiNeuerRekord: t('🏆 Neuer Klassenrekord: {0}', '🏆 New class record: {0}', '🏆 Nouveau record de classe : {0}', '🏆 Nuevo récord de la clase: {0}', '🏆 Nuovo record di classe: {0}', '🏆 Novum summum classis: {0}'),
  uiRekord: t('Klassenrekord: {0}', 'Class record: {0}', 'Record de classe : {0}', 'Récord de la clase: {0}', 'Record di classe: {0}', 'Summum classis: {0}'),
  uiVerbundenVon: t('{0} von {1} verbunden · Wer später kommt: Code {2}', '{0} of {1} connected · Late? Code {2}', '{0} sur {1} connectés · En retard ? Code {2}', '{0} de {1} conectados · ¿Llegas tarde? Código {2}', '{0} di {1} connessi · In ritardo? Codice {2}', '{0} ex {1} coniuncti · Sero? Codex {2}'),
  uiVokabeln: t('{0} Vokabeln', '{0} words', '{0} mots', '{0} palabras', '{0} parole', '{0} vocabula'),
  uiGrammatik: t('{0} Grammatikaufgaben', '{0} grammar tasks', '{0} exercices de grammaire', '{0} ejercicios de gramática', '{0} esercizi di grammatica', '{0} pensa grammatica'),
  uiMinuten: t('{0} Minuten', '{0} minutes', '{0} minutes', '{0} minutos', '{0} minuti', '{0} minuta'),
  uiAdaptiv: t('Jede:r auf eigenem Niveau', 'Everyone at their own level', 'Chacun à son niveau', 'Cada uno a su nivel', 'Ognuno al suo livello', 'Quisque suo gradu'),
  uiLevel: t('Level steigen', 'Levels go up', 'Les niveaux montent', 'Los niveles suben', 'I livelli salgono', 'Gradus ascendunt'),
  uiFest: t('Feste Stufe', 'Fixed level', 'Niveau fixe', 'Nivel fijo', 'Livello fisso', 'Gradus certus'),
  uiLevelNr: t('Level {0}', 'Level {0}', 'Niveau {0}', 'Nivel {0}', 'Livello {0}', 'Gradus {0}'),
  uiVerbessert: t('Am meisten verbessert', 'Most improved', 'Les plus grands progrès', 'Los que más han mejorado', 'I più migliorati', 'Maxime profecerunt'),
  uiPunkte: t('{0} Punkte', '{0} points', '{0} points', '{0} puntos', '{0} punti', '{0} puncta'),
  uiDuDabei: t('Du bist dabei! 👋', "You're in! 👋", 'Tu es dans la partie ! 👋', '¡Estás dentro! 👋', 'Sei in gioco! 👋', 'Ludis! 👋'),
  uiGleich: t('Gleich geht es los – schau nach vorn.', 'It starts soon – look to the front.', 'Ça commence bientôt – regarde devant.', 'Empieza enseguida: mira hacia delante.', 'Si comincia tra poco – guarda avanti.', 'Mox incipit – ante te specta.'),
  uiGleichKurz: t('Gleich geht es los.', 'It starts soon.', 'Ça commence bientôt.', 'Empieza enseguida.', 'Si comincia tra poco.', 'Mox incipit.'),
  uiDeineRunde: t('Deine Runde (siehst nur du)', 'Your round (only you can see this)', 'Ta partie (toi seul(e) la vois)', 'Tu ronda (solo la ves tú)', 'Il tuo turno (lo vedi solo tu)', 'Ludus tuus (tu solus vides)'),
  uiEigen: t('{0} richtig · {1} falsch · {2} Verbesserungspunkte', '{0} right · {1} wrong · {2} improvement points', '{0} justes · {1} fausses · {2} points de progrès', '{0} correctas · {1} incorrectas · {2} puntos de mejora', '{0} giuste · {1} sbagliate · {2} punti di miglioramento', '{0} recta · {1} errata · {2} puncta profectus'),
  uiTeamGewonnen: t('Dein Team hat gewonnen!', 'Your team won!', 'Ton équipe a gagné !', '¡Tu equipo ha ganado!', 'La tua squadra ha vinto!', 'Turma tua vicit!'),
  uiWiederUeben: t('Was falsch war, kommt beim Üben bald wieder dran.', 'Your mistakes will come up again soon when you practise.', 'Tes erreurs reviendront bientôt quand tu t’entraînes.', 'Tus errores volverán pronto cuando practiques.', 'I tuoi errori torneranno presto quando ti eserciti.', 'Errata tua mox in exercitatione redibunt.'),
  uiDasBistDu: t(' – das bist du!', ' – that’s you!', ' – c’est toi !', ' – ¡eres tú!', ' – sei tu!', ' – tu es!'),
  uiStart: t('Zur Startseite', 'Home', 'Accueil', 'Inicio', 'Home', 'Ad initium')
} satisfies Record<string, T>

export type KtSchluessel = keyof typeof KT

/** Text in der Zielsprache (Rückfall Englisch), Platzhalter {0} … gefüllt */
export function kt(sprache: string | null | undefined, k: KtSchluessel, ...werte: (string | number)[]): string {
  const sp = textSprache(sprache)
  const f = (KT[k] as Record<string, string>)[sp] ?? KT[k].en
  return f.replace(/\{(\d)\}/g, (_, i) => String(werte[Number(i)] ?? ''))
}

/** Eintrag einer Liste („A|B|C") */
export const ktListe = (sprache: string | null | undefined, k: KtSchluessel, i: number): string => {
  const l = kt(sprache, k).split('|')
  return l[((i % l.length) + l.length) % l.length]
}

/** Teamname in der Zielsprache aus der Farbe (Reihenfolge wie TEAM_FARBEN) */
const FARB_INDEX: Record<string, number> = { red: 0, blue: 1, teal: 2, yellow: 3, grape: 4, orange: 5 }
export const farbName = (sprache: string | null | undefined, farbe: string): string => ktListe(sprache, 'farben', FARB_INDEX[farbe] ?? 0)

/** Zahl mit zwei Nachkommastellen nach Sprache (Komma im Deutschen usw.) */
export const zahl2 = (sprache: string | null | undefined, w: number): string => {
  const sp = textSprache(sprache)
  const loc = sp === 'la' ? 'it' : sp
  try {
    return w.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } catch {
    return w.toFixed(2)
  }
}
