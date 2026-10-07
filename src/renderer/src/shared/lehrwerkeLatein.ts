/**
 * Lateinische Lehrwerke (07.10.2026, Recherche aus den Verlags-Synopsen zum KC Niedersachsen und den Produktseiten):
 * Lektionsfolge und Grammatik je Lektion für Pontes (Klett, Gesamtband ab 2020), Campus Ausgabe A, prima. (neue
 * Ausgabe) und prima.nova (C.C. Buchner). Länderausgaben getrennt („laender": für welche Länder die Ausgabe gilt –
 * Wunsch der Lehrkraft: auf Unterschiede zwischen den Bundesländern achten); Bayern-Ausgaben (Campus B, prima B) sind
 * nicht erfasst. Hinweise wie „(KC NI: erst Jg. 10)" stammen aus den Synopsen. Wortlisten sind nicht enthalten – die
 * liest die Lehrkraft selbst ein. Die Grammatik je Kapitel ist mit „; " getrennt.
 */
import type { KapitelThema } from './lehrwerkThemen'

export interface LehrwerkLatein {
  quelle: string
  fach: 'latein'
  ausgabe: string
  laender: string[]
  kapitel: Record<string, KapitelThema>
}

export const LEHRWERKE_LATEIN: Record<string, LehrwerkLatein> = {
  Pontes: {
    quelle: 'https://asset.klett.de/assets/1accc497/623301_Stoffverteilung_Niedersachsen.pdf; https://www.klett.de/produkt/isbn/978-3-12-623301-9',
    fach: 'latein',
    ausgabe: 'Pontes Gesamtband (Ausgabe ab 2020), Schülerbuch ISBN 978-3-12-623301-9, 1.–3. bzw. 1.–4. Lernjahr; Lektionen Salve, 1–31, Transitio T1–T6',
    laender: ['BW', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'],
    kapitel: {
      Salve: {
        titel: 'Salve! Willkommen im alten Rom!',
        grammatik: 'Satzglied, Wortart und Form; Subst.: Prädikatsnomen; Latein – eine Sprache ohne Artikel; „Verstecktes“ Subjekt',
        lernjahr: 1
      },
      'Lektion 1': {
        titel: 'Wohnen im alten Rom',
        grammatik:
          'Akkusativobjekt; Subst.: Nom. und Akk. Sg. der o-/a-/kons. Dekl.; Genus (Geschlecht); Verben: 3. Sg. Ind. Präs. Akt. der a-/e-/i-/kons. Konj.',
        lernjahr: 1
      },
      'Lektion 2': {
        titel: 'Die römische Hausgemeinschaft',
        grammatik:
          'Verben: 3. Pl. Ind. Präs. Akt. und Inf. Präs. Akt. der a-/e-/i-/kons. Konj.; Subst.: Nom. und Akk. Pl. der o-/a-/kons. Dekl.; Kongruenz: Subjekt und Prädikat; Subst.: Vok. Sg. der o-Dekl.; Subst.: Neutrum der o-Dekl.',
        lernjahr: 1
      },
      'Lektion 3': {
        titel: 'Auf dem Land',
        grammatik: 'Verben: 1. und 2. Pl. Ind. Akt. der a-/e-/i-/kons. Konj.; esse; Personalpronomen: 1. und 2. Person; AB der Richtung (Präp. + Akk.)',
        lernjahr: 1
      },
      'Lektion 4': { titel: 'In der Schule', grammatik: 'Aufforderungssätze: Befehl, Verbot; Fragesätze; posse', lernjahr: 1 },
      'Lektion 5': {
        titel: 'Das Forum Romanum',
        grammatik:
          'Adj. als Attribut, KNG-Kongruenz; Subst. als Attribut; Adj. als Prädikatsnomen; Subst. und Adj. aus verschiedenen Deklinationsklassen; Verben: gem. Konj.',
        lernjahr: 1
      },
      'Lektion 6': {
        titel: 'Im Circus Maximus',
        grammatik: 'Genitivattribut; Formen des Genitivs; Possessivpronomen: 1. und 2. Person; Possessivpronomen: 3. Person (refl. und nichtrefl.)',
        lernjahr: 1
      },
      'Lektion 7': { titel: 'Badevergnügen für alle', grammatik: 'Abl. loc., sep., soc., instr., temp.; ire', lernjahr: 1 },
      'Lektion 8': { titel: 'Amphitheater', grammatik: 'AcI als satzwertige Konstr.; Adv. zum Adj. der o-/a-Dekl.', lernjahr: 1 },
      'Lektion 9': { titel: 'Der Theaterbesuch', grammatik: 'Dativobjekt; is', lernjahr: 1 },
      'Lektion 10': { titel: 'Das Kapitol', grammatik: 'Ind. Perf. Akt. (v-, u-, s-, Dehnung, Stamm); Inf. Perf. Akt.; Zeitverhältnisse im AcI', lernjahr: 1 },
      'Lektion 11': {
        titel: 'Das Trojanische Pferd',
        grammatik: 'Ind. Perf. Akt. (Reduplikation, esse, posse, ire); hic und ille; Satzgefüge: adv. Nebensätze',
        lernjahr: 1
      },
      'Lektion 12': { titel: 'Aeneas flieht aus Troja', grammatik: 'Ind. Impf. Akt.; Impf. und Perf. in Texten; Subst.: Neutra der kons. Dekl.', lernjahr: 2 },
      'Lektion 13': { titel: 'Aeneas in Italien', grammatik: 'Substantivierung von Adj. und Pron.; Fut. I Akt.; ipse; Komposita', lernjahr: 2 },
      'Lektion 14': { titel: 'Romulus und Remus', grammatik: 'Ind. Plqu. Akt.; Sinnrichtung von Nebensätzen', lernjahr: 2 },
      'Lektion 15': { titel: 'Bauern und Adlige', grammatik: 'Passiv (Ind. Präs., Ind. Impf., Fut. I, Inf. Präs.)', lernjahr: 2 },
      'Lektion 16': {
        titel: 'Rom unter Druck',
        grammatik: 'Passiv (Ind. Perf., Ind. Plqu., Inf. Perf.); PPP; Relativsätze und Relativpronomen; NG-Kongruenz',
        lernjahr: 2
      },
      'Lektion 17': {
        titel: 'Geben und Nehmen: Politik in Rom',
        grammatik: 'Adj. der i-Dekl.; Adv. zu den Adj. der i-Dekl.; Rel. Satzanschluss; Zustandsperfekt',
        lernjahr: 2
      },
      'Lektion 18': { titel: 'Ein VIP der Antike: Caesar', grammatik: 'PPP als PC', lernjahr: 2 },
      'Lektion 19': {
        titel: 'Cicero und die Republik',
        grammatik: 'iste; Gen. poss.; Gen. subi. und obi.; Gen. part.; Personalpron.: Gen.; PC: weitere Übersetzungsmöglichkeiten',
        lernjahr: 2
      },
      'Lektion 20': { titel: 'Götter und Helden', grammatik: 'PPA als PC; dum; postquam', lernjahr: 2 },
      'Lektion 21': { titel: 'Orpheus und Eurydike', grammatik: 'e-Dekl.; Akk. der Ausdehnung', lernjahr: 2 },
      'Lektion 22': { titel: 'Der Mythos als Begleiter', grammatik: 'Abl. abs.', lernjahr: 2 },
      'Lektion 23': {
        titel: 'Diogenes: Ein besonderer Philosoph',
        grammatik: 'Reflexivität im AcI; Satzgliedfunktion von AcI und Inf.; se, sibi; velle',
        lernjahr: 2
      },
      'Lektion 24': {
        titel: 'Rom und Karthago',
        grammatik: 'Konj. als Irrealis; Irrealis der Gegenwart und der Vergangenheit; Konj. Impf.; Konj. Plqu.',
        lernjahr: 3
      },
      'Lektion 25': { titel: 'Sizilien: Die erste römische Provinz', grammatik: 'ut-Sätze (fin., konsek., abh. Wunsch)', lernjahr: 3 },
      'Lektion 26': { titel: 'Die Römer in Germanien', grammatik: 'u-Dekl.; cum-Sätze (temp., kaus., konz.); Komposita von esse', lernjahr: 3 },
      'Lektion 27': { titel: 'Der Aufstieg des jungen Octavian', grammatik: 'Prädikativum; Nominaler Abl. abs.; Ausdrücke wie summo in monte', lernjahr: 3 },
      'Lektion 28': { titel: 'Die Herrschaft des Kaisers Augustus', grammatik: 'PPA und PPP als Attribut; Konj. Präs. im GS', lernjahr: 3 },
      'Lektion 29': {
        titel: 'Nero – Künstler oder Kaiser?',
        grammatik: 'indir. Fragesätze; Fragewörter; cum-Sätze im Konj. Perf.; Consecutio temporum; Konj. Perf.',
        lernjahr: 3
      },
      'Lektion 30': {
        titel: 'Macht und Ohnmacht',
        grammatik: 'Konj. im HS: opt., iuss., adh., prohib.; präpositionslose Herkunfts-, Orts- und Richtungsangaben; ferre und Komposita',
        lernjahr: 3
      },
      'Lektion 31': { titel: 'Eine ungeahnte Katastrophe', grammatik: 'Deponentien (KC NI: erst Jg. 10); fieri (KC NI: erst Jg. 10)', lernjahr: 3 },
      T1: {
        titel: 'Die Anfänge des Christentums',
        grammatik:
          'nolle; Dativfunktionen: Dat. poss.; Dativfunktionen: Dat. comm. (KC NI: nicht verpflichtend); Dativfunktionen: Dat. fin. (KC NI: nicht verpflichtend); Dativfunktionen: dopp. Dat. (KC NI: nicht verpflichtend)',
        lernjahr: 3
      },
      T2: { titel: 'Christen und Nicht-Christen', grammatik: 'Gerundium; Gen. qual. (KC NI: erst Oberstufe)', lernjahr: 3 },
      T3: {
        titel: 'Latein im Mittelalter: Karl der Große',
        grammatik: 'Gerundivum: Attr.; Gerundivum: AB; Gerundivum: PN (nd + esse) (KC NI: erst Jg. 10); Dat. auct. (KC NI: erst Jg. 10)',
        lernjahr: 3
      },
      T4: {
        titel: 'Busbequius in der Türkei',
        grammatik: 'Subst. der i-Dekl.; Komparation (Adj. und Adv.): regelmäßig, unregelmäßig, ohne Vergleichsgröße; Abl. comp.',
        lernjahr: 3
      },
      T5: {
        titel: 'Die tierische Welt des Phaedrus',
        grammatik: 'Fut. II (KC NI: erst Jg. 10); PFA (KC NI: erst Jg. 10); Inf. Fut. Akt. (KC NI: erst Jg. 10); Konj. im HS: delib. (KC NI: erst Jg. 10)',
        lernjahr: 3
      },
      T6: {
        titel: 'Lieben will gelernt sein',
        grammatik: 'Konj. im RS (KC NI: erst Oberstufe); Gen. als N bei est (KC NI: erst Oberstufe); Abl. qual. (KC NI: erst Oberstufe)',
        lernjahr: 3
      }
    }
  },
  'Campus A': {
    quelle:
      'https://www.ccbuchner.de/_files_media/mediathek/downloads/9710.pdf; https://www.ccbuchner.de/_files_media/mediathek/downloads/593.pdf; https://www.ccbuchner.de/_files_media/mediathek/downloads/643.doc; https://www.ccbuchner.de/_files_media/mediathek/downloads/650.pdf; https://www.ccbuchner.de/_files_media/mediathek/downloads/1997.pdf; https://www.ccbuchner.de/_files_media/mediathek/downloads/2755.pdf; https://www.ccbuchner.de/_files_media/mediathek/downloads/4590.pdf',
    fach: 'latein',
    ausgabe:
      "Campus – Ausgabe A, Textband ISBN 978-3-7661-7940-1 / Begleitband 978-3-7661-7941-8 (Lektionen 1.1–30.4). Hinweis: eine eigene 'Ausgabe A – neu' ist in den Verlagsquellen nicht belegt; 'neu' tragen Campus B (Bayern) und Campus C.",
    laender: ['NI', 'NW', 'HE', 'BW'],
    kapitel: {
      'Lektion 1.1': { titel: 'Besuch beim Großvater – Auf dem Landgut', grammatik: 'a-/o-Deklination (Nominativ)', lernjahr: 1 },
      'Lektion 1.2': { titel: 'Besuch beim Großvater – Ein Pferd in Gefahr', grammatik: 'e-Konjugation / esse; Subjekt und Prädikat', lernjahr: 1 },
      'Lektion 1.3': {
        titel: 'Besuch beim Großvater – Sprachprobleme',
        grammatik: 'a-/o-Dekl. (Akkusativ); Akkusativ als Objekt; Subjekt im Prädikat',
        lernjahr: 1
      },
      'Lektion 2.1': { titel: 'Aufregende Tage – Nachhilfeunterricht', grammatik: 'e-Konjugation / esse (1. und 2. Pers.)', lernjahr: 1 },
      'Lektion 2.2': { titel: 'Aufregende Tage – Geisterstunde', grammatik: 'a-/o-Deklination (Dativ); Dativ als Objekt', lernjahr: 1 },
      'Lektion 2.3': { titel: 'Aufregende Tage – Angst vor einem Unwetter', grammatik: 'e-Konjugation / esse (Imperativ); a-/o-Dekl. (Vokativ)', lernjahr: 1 },
      'Lektion 3.1': { titel: 'Zurück nach Hause – Straßenschäden', grammatik: 'a-/o-Dekl. (Genitiv); Genitiv als Attribut', lernjahr: 1 },
      'Lektion 3.2': { titel: 'Zurück nach Hause – Zum Abendessen: Käse und Oliven', grammatik: 'a-Konjugation', lernjahr: 1 },
      'Lektion 3.3': { titel: 'Zurück nach Hause – Warum bist du ein Sklave?', grammatik: 'a-/o-Dekl. (Ablativ); Ablativ des Mittels', lernjahr: 1 },
      'Lektion 4.1': { titel: 'Unterricht in Rom – Schulstart mit Verspätung', grammatik: 'i-Konjugation', lernjahr: 1 },
      'Lektion 4.2': { titel: 'Unterricht in Rom – Ein Unterrichtsgang auf das Forum', grammatik: 'o-Deklination (Neutra auf -um)', lernjahr: 1 },
      'Lektion 4.3': { titel: 'Unterricht in Rom – In der Basilika Julia', grammatik: 'Verwendung der Präpositionen', lernjahr: 1 },
      'Lektion 5.1': { titel: 'Auf dem Sklavenmarkt – Fliegenfänger', grammatik: 'Personalpronomen; Wort- und Satzfragen', lernjahr: 1 },
      'Lektion 5.2': { titel: 'Auf dem Sklavenmarkt – Sklaven zu verkaufen!', grammatik: 'Adjektive: a-/o-Dekl.', lernjahr: 1 },
      'Lektion 5.3': {
        titel: 'Auf dem Sklavenmarkt – Ist Cornelia eine Sklavin?',
        grammatik: 'Substantive: o-Dekl. (auf -(e)r); Adjektive: a-/o-Dekl. (auf -(e)r)',
        lernjahr: 1
      },
      'Lektion 6.1': { titel: 'Reise nach Pompeji – Auf nach Pompeji!', grammatik: 'Konsonantische Konjugation', lernjahr: 1 },
      'Lektion 6.2': { titel: 'Reise nach Pompeji – Hilfe bei der Weinlese', grammatik: 'Komposita; posse; Akkusativ mit Infinitiv (AcI 1)', lernjahr: 1 },
      'Lektion 6.3': { titel: 'Reise nach Pompeji – Pause in der Gräberstadt', grammatik: 'Konsonantische Konjugation (i-Erweiterung)', lernjahr: 1 },
      'Lektion 7.1': { titel: 'Leben in Pompeji – Eine Stadt im Wahlfieber', grammatik: '3. Deklination (auf -or, oris)', lernjahr: 1 },
      'Lektion 7.2': { titel: 'Leben in Pompeji – Stress in der Stadt', grammatik: 'velle; 3. Dekl. (Erweiterung); Gliedsätze als Adverbiale', lernjahr: 1 },
      'Lektion 7.3': { titel: 'Leben in Pompeji – Götterglaube', grammatik: 'Imperfekt (a-/e-Konjugation / esse); 3. Deklination (auf -er, ris)', lernjahr: 1 },
      'Lektion 7.4': {
        titel: 'Leben in Pompeji – Bei den Gladiatoren',
        grammatik: 'Imperfekt (i-/kons. Konjugation); 3. Deklination (auf -as, atis / -us, utis / Konsonant + s)',
        lernjahr: 1
      },
      'Lektion 8.1': { titel: 'Der Untergang Pompejis – Riecht das Wasser gefährlich?', grammatik: 'Perfekt (-v-)', lernjahr: 1 },
      'Lektion 8.2': { titel: 'Der Untergang Pompejis – Pompeji in Panik', grammatik: 'Perfekt (-u- / esse); 3. Deklination (auf -o und -x)', lernjahr: 1 },
      'Lektion 8.3': { titel: 'Der Untergang Pompejis – Eine Stadt wird begraben', grammatik: 'Pronomen is; Pluralwörter', lernjahr: 1 },
      'Lektion 9.1': { titel: 'Der Helfer Herkules – Herkules und der gefährliche Löwe', grammatik: 'Perfekt (-s- / Reduplikation)', lernjahr: 1 },
      'Lektion 9.2': {
        titel: 'Der Helfer Herkules – Herkules und der Stall des Augias',
        grammatik: 'Perfekt (Dehnung / ohne Stammveränderung); Akkusativ als Adverbiale',
        lernjahr: 1
      },
      'Lektion 9.3': { titel: 'Der Helfer Herkules – Herkules im Reich der Toten', grammatik: 'Ablativ der Zeit, des Grundes, der Trennung', lernjahr: 1 },
      'Lektion 10.1': { titel: 'Von Troja nach Italien – Der Anfang vom Ende Trojas', grammatik: 'Akkusativ mit Infinitiv (AcI 2)', lernjahr: 1 },
      'Lektion 10.2': {
        titel: 'Von Troja nach Italien – Äneas und Dido – eine unglückliche Liebe',
        grammatik: 'Reflexivpronomen; 3. Deklination (gleichsilbige auf -is); Pronomina im AcI',
        lernjahr: 1
      },
      'Lektion 10.3': { titel: 'Von Troja nach Italien – Der Zweikampf zwischen Turnus und Äneas', grammatik: 'Plusquamperfekt', lernjahr: 1 },
      'Lektion 11.1': {
        titel: 'Romulus und Remus – Kindheit und Jugend von Romulus und Remus',
        grammatik: 'Adjektive: 3. Deklination (dreiendige); Substantive: 3. Deklination (auf -es, itis)',
        lernjahr: 1
      },
      'Lektion 11.2': {
        titel: 'Romulus und Remus – Die Untat des Amulius',
        grammatik: 'Adjektive: 3. Deklination (zweiendige); Tempora nach Subjunktionen',
        lernjahr: 1
      },
      'Lektion 11.3': { titel: 'Romulus und Remus – Tödlicher Streit unter Brüdern', grammatik: 'Relativpronomen; Relativsatz', lernjahr: 1 },
      'Lektion 12.1': { titel: 'Sagenhafter Anfang – Romulus sorgt sich um die Zukunft Roms', grammatik: 'Futur I (a-/e-Konjugation / esse)', lernjahr: 1 },
      'Lektion 12.2': { titel: 'Sagenhafter Anfang – Die Klagen der geraubten Sabinerinnen', grammatik: 'Futur I (i-/kons. Konjugation)', lernjahr: 1 },
      'Lektion 12.3': { titel: 'Sagenhafter Anfang – Das Schicksal einer Verräterin', grammatik: 'Futur II; Dativ des Besitzers', lernjahr: 1 },
      'Lektion 13.1': { titel: 'Der letzte König – Die Maske der Dummheit', grammatik: 'u-Deklination', lernjahr: 2 },
      'Lektion 13.2': { titel: 'Der letzte König – Die Befreiung von der Tyrannenherrschaft', grammatik: 'e-Deklination', lernjahr: 2 },
      'Lektion 14.1': { titel: 'Unterhaltung in Rom – Aufregung auf der Pferderennbahn', grammatik: 'ire und Komposita', lernjahr: 2 },
      'Lektion 14.2': { titel: 'Unterhaltung in Rom – So ein Angeber!', grammatik: 'Demonstrativpronomen hic und ille', lernjahr: 2 },
      'Lektion 14.3': { titel: 'Unterhaltung in Rom – Thermen – Erlebnisbäder der Antike', grammatik: 'Adjektive der 3. Dekl.; Substantivierung', lernjahr: 2 },
      'Lektion 15.1': { titel: 'Ein Tag im Kolosseum – Ein Kampftag in der Arena – der Vormittag', grammatik: 'Passiv (Präsens)', lernjahr: 2 },
      'Lektion 15.2': { titel: 'Ein Tag im Kolosseum – Ein Kampftag in der Arena – der Nachmittag', grammatik: 'Passiv (Imperfekt)', lernjahr: 2 },
      'Lektion 16.1': { titel: 'Ein wichtiges Buch – Ein Diebstahl mit Folgen', grammatik: 'Substantive: 3. Dekl. (Neutra)', lernjahr: 2 },
      'Lektion 16.2': { titel: 'Ein wichtiges Buch – Ein Buch und seine Geheimnisse', grammatik: 'Passiv (Futur I)', lernjahr: 2 },
      'Lektion 16.3': { titel: 'Ein wichtiges Buch – Ein Zeuge berichtet', grammatik: 'Substantive: 3. Dekl. (i-Stämme); Grundzahlen', lernjahr: 2 },
      'Lektion 17.1': { titel: 'Jagd auf die Verbrecher – Auf der Spur', grammatik: 'Passiv (Perfekt)', lernjahr: 2 },
      'Lektion 17.2': { titel: 'Jagd auf die Verbrecher – Das Ende', grammatik: 'Stammformen', lernjahr: 2 },
      'Lektion 18.1': { titel: 'Mythen erklären – Europa und der Stier', grammatik: 'Passiv (Plusquamperfekt, Futur II)', lernjahr: 3 },
      'Lektion 18.2': { titel: 'Mythen erklären – Ein Ende der Qualen', grammatik: 'Genitiv und Ablativ der Beschaffenheit', lernjahr: 3 },
      'Lektion 18.3': { titel: 'Mythen erklären – Flugpioniere', grammatik: 'Verwendung des PPP', lernjahr: 3 },
      'Lektion 19.1': { titel: 'Mythen warnen – Göttlicher Zorn', grammatik: 'Pronomen ipse; Doppelter Akkusativ', lernjahr: 3 },
      'Lektion 19.2': { titel: 'Mythen warnen – Ein verbotener Blick', grammatik: 'PPA', lernjahr: 3 },
      'Lektion 19.3': { titel: 'Mythen warnen – Die Götter kann man nicht betrügen', grammatik: 'Partizip als Adverbiale', lernjahr: 3 },
      'Lektion 20.1': {
        titel: 'Rom im Konflikt – Am Ende siegen die Frauen',
        grammatik: 'Verben mit abweichender und unterschiedlicher Kasusrektion; Dativ des Zwecks und des Vorteils',
        lernjahr: 3
      },
      'Lektion 20.2': { titel: 'Rom im Konflikt – Wer rettet das Kapitol?', grammatik: 'Pronomen idem; Korrelativa', lernjahr: 3 },
      'Lektion 21.1': { titel: 'Der Feind Hannibal – Ein kindlicher Schwur', grammatik: 'Konjunktiv Imperfekt; Irrealis der Gegenwart', lernjahr: 3 },
      'Lektion 21.2': {
        titel: 'Der Feind Hannibal – Die Karthager auf dem Gipfel',
        grammatik: 'Konjunktiv Plusquamperfekt; Irrealis der Vergangenheit',
        lernjahr: 3
      },
      'Lektion 21.3': {
        titel: 'Der Feind Hannibal – Hannibal ante portas',
        grammatik: 'Begehrsätze; Genitiv der Zugehörigkeit; Genitivus partitivus',
        lernjahr: 3
      },
      'Lektion 22.1': {
        titel: 'Unterwegs zum Glauben – Eine entscheidende Wende',
        grammatik: 'Indefinitpronomen quidam; Gliedsätze als Adverbiale',
        lernjahr: 3
      },
      'Lektion 22.2': { titel: 'Unterwegs zum Glauben – Außenseiter Christen', grammatik: 'Demonstrativpronomen iste; Prädikativum', lernjahr: 3 },
      'Lektion 22.3': {
        titel: 'Unterwegs zum Glauben – Tod im Namen des Glaubens?',
        grammatik: 'Genitivus subiectivus / obiectivus; Gliedsätze als Adverbiale',
        lernjahr: 3
      },
      'Lektion 23.1': { titel: 'Der Glaube verändert – Sieg im Zeichen des Kreuzes', grammatik: 'Ablativus absolutus', lernjahr: 3 },
      'Lektion 23.2': { titel: 'Der Glaube verändert – Bonifatius wagt ein Gottesurteil', grammatik: 'Ablativus absolutus', lernjahr: 3 },
      'Lektion 24.1': { titel: 'Leben am Limes – Imperium sine fine?', grammatik: 'Interrogativpronomen; Wort-, Wahl-, Satzfragen', lernjahr: 3 },
      'Lektion 24.2': { titel: 'Leben am Limes – Warum geht ein Barbar zur römischen Armee?', grammatik: 'Konjunktiv Präsens', lernjahr: 3 },
      'Lektion 24.3': { titel: 'Leben am Limes – Ein gigantisches Bauwerk', grammatik: 'Konjunktiv Perfekt', lernjahr: 3 },
      'Lektion 25.1': { titel: 'Geschichten aus der Provinz – „Big business“ am Limes', grammatik: 'Indirekte Fragesätze; Zeitenfolge', lernjahr: 3 },
      'Lektion 25.2': { titel: 'Geschichten aus der Provinz – Ein schwieriger Rechtsfall', grammatik: 'Adverb', lernjahr: 3 },
      'Lektion 25.3': { titel: 'Geschichten aus der Provinz – Pfirsiche in Germanien', grammatik: 'ferre', lernjahr: 3 },
      'Lektion 26.1': { titel: 'Menschen auf der Suche – Thales und der Forscherdrang', grammatik: 'Indefinitpronomen (ali)quis', lernjahr: 3 },
      'Lektion 26.2': { titel: 'Menschen auf der Suche – Solon, Krösus und das Glück', grammatik: 'Adjektive: Steigerung', lernjahr: 3 },
      'Lektion 26.3': { titel: 'Menschen auf der Suche – Sappho – die zehnte Muse', grammatik: 'Adjektive: Steigerung; Ablativ des Vergleichs', lernjahr: 3 },
      'Lektion 27.1': { titel: 'Die Tragödie der Antigone – Ein unmenschliches Verbot', grammatik: 'nolle; Prohibitiv; relativer Satzanschluss', lernjahr: 3 },
      'Lektion 27.2': { titel: 'Die Tragödie der Antigone – Antigone – eine tragische Heldin', grammatik: 'Hortativ; Jussiv', lernjahr: 3 },
      'Lektion 28.1': { titel: 'Zeit für Veränderung – Griechenland hat uns verändert', grammatik: 'fieri; Optativ', lernjahr: 3 },
      'Lektion 28.2': { titel: 'Zeit für Veränderung – Ein trauriger Sieger', grammatik: 'PFA', lernjahr: 3 },
      'Lektion 28.3': { titel: 'Zeit für Veränderung – Diese Jugend von heute!', grammatik: 'Infinitiv Futur Aktiv', lernjahr: 3 },
      'Lektion 29.1': { titel: 'Der Dichter Horaz – Nimm mich mit!', grammatik: 'Adverbien: Steigerung', lernjahr: 3 },
      'Lektion 29.2': { titel: 'Der Dichter Horaz – Statt Stadt Land', grammatik: 'Gerundium', lernjahr: 3 },
      'Lektion 30.1': {
        titel: 'Nachdenken und Weiterdenken – Sind die Menschen den Göttern gleichgültig?',
        grammatik: 'Deponentien (a-/e-Konjugation)',
        lernjahr: 3
      },
      'Lektion 30.2': { titel: 'Nachdenken und Weiterdenken – Pflücke den Tag!', grammatik: 'Deponentien (i-/kons. Konjugation)', lernjahr: 3 },
      'Lektion 30.3': { titel: 'Nachdenken und Weiterdenken – Was machst du aus deinem Leben?', grammatik: 'Attributives Gerundivum', lernjahr: 3 },
      'Lektion 30.4': { titel: 'Nachdenken und Weiterdenken – Wie frei bin ich wirklich?', grammatik: 'Prädikatives Gerundivum; Dativus auctoris', lernjahr: 3 }
    }
  },
  'prima.': {
    quelle:
      'https://www.ccbuchner.de/produkt/prima-band-2-7274/download-9712/prima-synopse-kc-niedersachsen-lektion-1-28-priorisiert.pdf; https://www.ccbuchner.de/produkt/prima-band-2-7274; https://www.ccbuchner.de/_files_media/mediathek/downloads/5901.PDF',
    fach: 'latein',
    ausgabe:
      'prima. (neue Ausgabe, 28 Lektionen), Textband ISBN 978-3-661-40500-1, Begleitband 978-3-661-40550-6, Band 1 (L1–14) 978-3-661-40501-8, Band 2 (L15–28) 978-3-661-40502-5',
    laender: ['BW', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'],
    kapitel: {
      'Lektion 1': { titel: 'Sieg im Circus Maximus', grammatik: 'Substantive: Nominativ; Verben: 3. Person; Verben: Infinitiv Präsens', lernjahr: 1 },
      'Lektion 2': {
        titel: 'Möhren weisen den Weg',
        grammatik: 'Substantive: Akkusativ; Subjekt und Prädikat; Akkusativ als Objekt; Präpositionalausdruck als Adverbiale',
        lernjahr: 1
      },
      'Lektion 3': {
        titel: 'Die Pläne der Verbrecher',
        grammatik: 'Verben: 1. und 2. Person; Verben: Imperativ; Substantive: Vokativ; Subjekt im Prädikat',
        lernjahr: 1
      },
      'Lektion 4': {
        titel: 'Incitatus ist der Größte!',
        grammatik: 'Substantive: Ablativ; Ablativ des Mittels; Ablativ des Grundes; Verwendung der Präpositionen',
        lernjahr: 1
      },
      'Lektion 5': { titel: 'Orpheus und Eurydike', grammatik: 'konsonantische Konjugation; velle, nolle; Übersicht: Konjugation', lernjahr: 1 },
      'Lektion 6': {
        titel: 'Ikarus und der Traum vom Fliegen',
        grammatik: 'Substantive: Genitiv; Subst. der o-Dekl. auf -er; Genitiv der Zugehörigkeit; Genitivus partitivus; Genitivus obiectivus',
        lernjahr: 1
      },
      'Lektion 7': {
        titel: 'Äneas flieht aus Troja',
        grammatik:
          'Substantive: Dativ; Substantive der 3. Dekl.: Wortstamm; konsonantische Konjugation (i-Erweiterung); Dativ als Objekt; Dativ als Prädikatsnomen',
        lernjahr: 1
      },
      'Lektion 8': {
        titel: 'Romulus und Remus',
        grammatik: 'Subst. der 3. Dekl.: Neutra; Perfekt; Perfektbildung: u-/v-Perfekt; posse; Verwendung des Perfekts',
        lernjahr: 1
      },
      'Lektion 9': { titel: 'Einer für alle', grammatik: 'Infinitiv Perfekt; Akkusativ mit Infinitiv (AcI)', lernjahr: 1 },
      'Lektion 10': {
        titel: 'Das Maß ist voll',
        grammatik: 'Adjektive der a- und o-Dekl.; Adjektive: KNG-Kongruenz; Adjektiv als Attribut; Adjektiv als Prädikatsnomen; Ablativ der Zeit',
        lernjahr: 1
      },
      'Lektion 11': {
        titel: 'Hannibal ante portas',
        grammatik: 'Perfektbildung: s-, Dehnung, Reduplikation, ohne Stammveränderung; Personalpronomen; Personalpronomen: Verwendung',
        lernjahr: 1
      },
      'Lektion 12': { titel: 'Die Römer bleiben Sieger', grammatik: 'Relativpronomen; Relativsatz als Attribut; Relativer Satzanschluss', lernjahr: 1 },
      'Lektion 13': {
        titel: 'Kleopatra – bezaubernd oder berechnend?',
        grammatik:
          'Adjektive der 3. Deklination; Pronomen is (Demonstrativ-, Personal-, Possessivpronomen); Pronomen is: Verwendung; Satzgefüge; Nebensätze als Adverbiale',
        lernjahr: 1
      },
      'Lektion 14': {
        titel: 'In der Hand der Piraten',
        grammatik: 'Imperfekt; ire; Verwendung des Imperfekts; Pronomina im AcI; Pronomina als Konnektoren',
        lernjahr: 1
      },
      'Lektion 15': {
        titel: 'Dem Willen der Götter folgen?',
        grammatik: 'Plusquamperfekt; Adverbbildung; Verwendung des Plusquamperfekts; Adverb als Adverbiale',
        lernjahr: 1
      },
      'Lektion 16': {
        titel: 'Den Willen der Götter erkennen',
        grammatik: 'Futur; Interrogativpronomen; Verwendung des Futurs; Wort- und Satzfragen; Übersicht: Tempora im Aktiv',
        lernjahr: 1
      },
      'Lektion 17': { titel: 'Eine folgenreiche Botschaft', grammatik: 'Passiv (Präs., Impf., Fut.); Verwendung des Passivs', lernjahr: 1 },
      'Lektion 18': {
        titel: 'Augustus – ein Friedensherrscher?',
        grammatik: 'Partizip Perfekt Passiv (PPP); Passiv (Perf., Plusqpf.); Verwendung des PPP; Verwendung des Passivs (Perf., Plusqpf.)',
        lernjahr: 1
      },
      'Lektion 19': { titel: 'Traumziel Ägypten', grammatik: 'Konjunktiv Imperfekt; Konjunktiv Plusquamperfekt; Der Konjunktiv als Irrealis', lernjahr: 3 },
      'Lektion 20': {
        titel: 'Die Römer – eine Plage der Völker',
        grammatik: 'Konjunktiv Präsens; Konjunktiv Perfekt; Konjunktiv in Nebensätzen; Prädikativum; Nebensätze als Adverbiale; Übersicht: Konjunktiv',
        lernjahr: 3
      },
      'Lektion 21': {
        titel: 'Narziss und Echo',
        grammatik:
          'Partizip Präsens Aktiv (PPA); Demonstrativpronomina hic, ille; Verwendung des PPA; Das Partizip als Adverbiale; Demonstrativpronomina hic, ille: Verwendung',
        lernjahr: 3
      },
      'Lektion 22': { titel: 'Machen Götter Angst?', grammatik: 'Die e-Deklination; Der Ablativus absolutus', lernjahr: 3 },
      'Lektion 23': {
        titel: 'Die Wahrheit kommt ans Licht',
        grammatik:
          'Adjektive: Die Steigerung; Adverbien: Die Steigerung; Verwendung der Steigerungsformen; Vergleich mit quam / Ablativ des Vergleichs; Dativ des Zwecks; Der doppelte Akkusativ',
        lernjahr: 3
      },
      'Lektion 24': {
        titel: 'Das richtige Handeln',
        grammatik: 'Die u-Deklination; Übersicht: Substantive (alle Deklinationsklassen); Der Ablativus absolutus (2)',
        lernjahr: 3
      },
      'Lektion 25': {
        titel: 'Groß ist die Artemis von Ephesos!',
        grammatik:
          'Das Gerundium; ferre; Verwendung des Gerundiums; Genitiv der Zugehörigkeit (KC NI: nicht verpflichtend); Genitiv der Beschaffenheit (KC NI: nicht verpflichtend); Ablativ der Beschaffenheit (KC NI: nicht verpflichtend)',
        lernjahr: 3
      },
      'Lektion 26': {
        titel: 'Marius und die Zauberin',
        grammatik:
          'Partizip Futur Aktiv (PFA) (KC NI: nicht verpflichtend); Infinitiv Futur Aktiv (KC NI: erst Jg. 10); Verwendung des Partizip Futur Aktiv (KC NI: nicht verpflichtend); Verwendung des Infinitiv Futur Aktiv (KC NI: erst Jg. 10); Konjunktiv im Hauptsatz: Hortativ, Jussiv, Optativ, Prohibitiv',
        lernjahr: 3
      },
      'Lektion 27': {
        titel: 'Der Glaube vor Gericht',
        grammatik:
          'Das Gerundiv(um); Verben: fieri (KC NI: erst Jg. 10); Gerundivum: attributiv; Gerundivum: prädikativ (KC NI: erst Jg. 10); Konjunktiv im Hauptsatz: Potentialis (KC NI: erst Jg. 10); Konjunktiv im Hauptsatz: Deliberativ (KC NI: nicht verpflichtend); Satzwertige Konstruktionen (Übersicht)',
        lernjahr: 3
      },
      'Lektion 28': {
        titel: '3 Religionen – 1 Glaube',
        grammatik: 'Die Deponentien (KC NI: erst Jg. 10); Das PPP der Deponentien; Die nd-Formen der Deponentien; Übersicht: Satzglieder und Füllungsarten',
        lernjahr: 3
      }
    }
  },
  'prima.nova': {
    quelle:
      'https://www.ccbuchner.de/_files_media/mediathek/downloads/9708.pdf; https://www.ccbuchner.de/_files_media/mediathek/downloads/436.pdf; https://www.ccbuchner.de/_files_media/mediathek/downloads/441.pdf; https://www.ccbuchner.de/_files_media/mediathek/downloads/376.pdf; https://www.ccbuchner.de/_files_media/mediathek/downloads/704.pdf; https://www.ccbuchner.de/_files_media/mediathek/downloads/2757.pdf',
    fach: 'latein',
    ausgabe: 'prima.nova – Latein lernen, Textband ISBN 978-3-7661-7970-8, Begleitband 978-3-7661-7971-5 (44 Stofflektionen + fakultative Lektion 45)',
    laender: ['NI', 'NW', 'BW'],
    kapitel: {
      'Lektion 1': { titel: 'Auf dem Weg zur Kurie', grammatik: 'Substantive: Nom. Sg.; Verben: 3. Pers. Präs. Sg.; Verben: Infinitiv Präsens', lernjahr: 1 },
      'Lektion 2': {
        titel: 'Sieg im Circus Maximus',
        grammatik:
          'Substantive: Nom. Pl.; Verben: 3. Pers. Präs. Pl.; Kons. Konjugation: 3. Pers. Präs.; Subjekt und Prädikat; Subjekt im Prädikat; Substantiv als Prädikatsnomen',
        lernjahr: 1
      },
      'Lektion 3': {
        titel: 'Aufregung in der Basilika',
        grammatik: 'Substantive: Akkusativ; Akkusativ als Objekt; Präpositionalausdruck als Adverbiale',
        lernjahr: 1
      },
      'Lektion 4': {
        titel: 'Besuch in den Thermen',
        grammatik: 'Substantive: Ablativ; Ablativ als Adverbiale: Ablativ des Mittels; Verwendung der Präpositionen',
        lernjahr: 1
      },
      'Lektion 5': { titel: 'Jubel auf dem Forum', grammatik: 'Verben: 1. und 2. Pers. Präs.; Ablativ als Adverbiale (causae)', lernjahr: 1 },
      'Lektion 6': {
        titel: 'Vorbereitung eines großen Festes',
        grammatik: 'Verben: Imperativ; Substantive: Vokativ; Substantive der o-Dekl. auf -er',
        lernjahr: 1
      },
      'Lektion 7': {
        titel: 'Modenschau',
        grammatik: 'Substantive: Genitiv; Verben: velle, nolle; Genitiv als Attribut: Genitiv der Zugehörigkeit',
        lernjahr: 1
      },
      'Lektion 8': {
        titel: 'Das große Fest (I)',
        grammatik: 'Verben: i-Konjugation; Substantive der 3. Deklination: Erweiterung (Neutra); Substantive der 3. Deklination: Wortstamm',
        lernjahr: 1
      },
      'Lektion 9': {
        titel: 'Das große Fest (II)',
        grammatik: 'Substantive: Dativ; Dativ als Objekt; Dativ als Prädikatsnomen: Dativ des Besitzers',
        lernjahr: 1
      },
      'Lektion 10': {
        titel: 'Bücher und Besichtigung',
        grammatik: 'Verben: kons. Konjug. (i-Erweiterung); Substantive der 3. Dekl. (Zusammenfassung)',
        lernjahr: 1
      },
      'Lektion 11': {
        titel: 'Ein Anfang mit Schrecken',
        grammatik: 'Verben: Perfekt; Perfektbildung: v-/u-Perfekt; posse; Verwendung des Perfekts',
        lernjahr: 1
      },
      'Lektion 12': { titel: 'Einer für alle', grammatik: 'Infinitiv Perfekt; Akkusativ mit Infinitiv', lernjahr: 1 },
      'Lektion 13': {
        titel: 'Das Maß ist voll',
        grammatik: 'Adjektive der a- und o-Dekl.; Adj.: KNG-Kongruenz; Adj. als Attribut; Adj. als Prädikatsnomen',
        lernjahr: 1
      },
      'Lektion 14': {
        titel: 'Hannibal ante portas',
        grammatik: 'Perfektbildung: s- und Dehnungsperfekt; Personalpronomen; Personalpronomen: Verwendung',
        lernjahr: 1
      },
      'Lektion 15': { titel: 'Wer besiegte Hannibal?', grammatik: 'Relativpronomen; Relativsatz als Attribut; Relativer Satzanschluss', lernjahr: 1 },
      'Lektion 16': {
        titel: 'Anschlag auf den Konsul Cicero',
        grammatik: 'Perfektbildung: Reduplikation und ohne Stammveränderung; Pronomen is: Verwendung; Ablativ als Adverbiale: Ablativ der Zeit',
        lernjahr: 2
      },
      'Lektion 17': {
        titel: 'Cäsar im Banne Kleopatras',
        grammatik: 'Adjektive der 3. Deklination (einendige); Satzgefüge; Gliedsätze als Adverbiale; Gliedsätze: Sinnrichtungen der Adverbialsätze',
        lernjahr: 2
      },
      'Lektion 18': { titel: 'Aufregung im Hause des Senators', grammatik: 'Akkusativ mit Infinitiv: Erweiterung', lernjahr: 2 },
      'Lektion 19': { titel: 'Den Entführern auf der Spur', grammatik: 'Reflexivpronomen; Pronomen im AcI; Konnektoren', lernjahr: 2 },
      'Lektion 20': { titel: 'Auf hoher See', grammatik: 'Verben: Imperfekt; Verwendung des Imperfekts; Tempora in erzählenden Texten', lernjahr: 2 },
      'Lektion 21': { titel: 'Ein glückliches Ende?', grammatik: 'Adjektive der 3. Deklination (zweiendige und dreiendige); Verben: ire', lernjahr: 2 },
      'Lektion 22': {
        titel: 'Äneas folgt dem Willen der Götter',
        grammatik: 'Verben: Plusquamperfekt; Adverbbildung; Verwendung des Plusquamperfekts; Adverb als Adverbiale',
        lernjahr: 2
      },
      'Lektion 23': { titel: 'Wer deutet den Willen der Götter?', grammatik: 'Verben: Futur; Verwendung des Futurs', lernjahr: 2 },
      'Lektion 24': { titel: 'Keine Angst vor Gespenstern', grammatik: 'Verben: Passiv (Präsens, Imperfekt, Futur); Verwendung des Passivs', lernjahr: 3 },
      'Lektion 25': {
        titel: 'Von Venus zu Augustus',
        grammatik:
          'Verben: Partizip Perfekt Passiv (PPP); Verben: Passiv (Perfekt, Plusquamperfekt); Verwendung des Partizip Perfekt Passiv; Verwendung des Passivs (Perfekt, Plusquamperfekt)',
        lernjahr: 3
      },
      'Lektion 26': {
        titel: 'Der Triumph des Paullus',
        grammatik: 'Demonstrativpronomina hic, ille; Demonstrativpronomina hic, ille (Verwendung)',
        lernjahr: 3
      },
      'Lektion 27': { titel: 'Der Mythos von Narziss und Echo', grammatik: 'Partizip Präsens Aktiv (PPA); Verwendung des Partizip Präsens Aktiv', lernjahr: 3 },
      'Lektion 28': {
        titel: 'Penelope vermisst Odysseus',
        grammatik: 'Pronomen ipse; Pronomen ipse: Verwendung; Partizip als Adverbiale (Überblick)',
        lernjahr: 3
      },
      'Lektion 29': {
        titel: 'Was steckt hinter den Naturgewalten?',
        grammatik: 'Substantive: u-Deklination; Pronomen idem; Gen. subiectivus / obiectivus',
        lernjahr: 3
      },
      'Lektion 30': { titel: 'Römer und Philosophie?', grammatik: 'Ablativus absolutus (1)', lernjahr: 3 },
      'Lektion 31': { titel: 'Die Tragödie der Antigone', grammatik: 'Ablativus absolutus (2); Ablativus absolutus (3)', lernjahr: 3 },
      'Lektion 32': {
        titel: 'Phädra zwischen Vernunft und Wahnsinn',
        grammatik: 'Substantive: e-Deklination; Interrogativpronomen (Fragepronomen); Wort- und Satzfragen',
        lernjahr: 3
      },
      'Lektion 33': {
        titel: 'Äneas verliert seine Frau',
        grammatik:
          'Adjektive: Steigerung (1); Adverbien: Steigerung (1); Verwendung der Steigerungsformen; Vergleich mit quam / Ablativ des Vergleichs; Doppelter Akkusativ',
        lernjahr: 3
      },
      'Lektion 34': {
        titel: 'Kaufleute feilschen in Ephesos!',
        grammatik: 'Adjektive: Steigerung (2); Adverbien: Steigerung (2); Dativ als Prädikatsnomen: Dativ des Zwecks; Dativ als Adverbiale: Dativ des Vorteils',
        lernjahr: 3
      },
      'Lektion 35': {
        titel: 'Leben wie Lukull',
        grammatik: 'Indefinitpronomen: (ali)quis; Genitiv als Prädikatsnomen: Genitiv der Zugehörigkeit; Genitiv als Attribut: Genitivus partitivus',
        lernjahr: 3
      },
      'Lektion 36': { titel: 'Groß ist die Artemis von Ephesos!', grammatik: 'Verben: ferre; Abl. der Beschaffenheit; Gen. der Beschaffenheit', lernjahr: 3 },
      'Lektion 37': { titel: 'Luxus an der Mosel', grammatik: 'Verben: Konjunktiv Imperfekt und Plusquamperfekt; Konjunktiv als Irrealis', lernjahr: 3 },
      'Lektion 38': { titel: 'Bevor Cäsar kam', grammatik: 'Verben: esse (Zusammenfassung); Verben: posse (Erweiterung); Prädikativum', lernjahr: 3 },
      'Lektion 39': {
        titel: 'Teile und herrsche!',
        grammatik: 'Verben: Konjunktiv Präsens; Konjunktiv in Gliedsätzen; Gliedsätze als Adverbiale (Übersicht)',
        lernjahr: 3
      },
      'Lektion 40': {
        titel: 'Welch ein großartiger Kaiser',
        grammatik: 'Verben: Konjunktiv Perfekt; Gliedsätze als Objekt: Indirekte Fragesätze; Tempusgebrauch in konjunktivischen Gliedsätzen',
        lernjahr: 3
      },
      'Lektion 41': {
        titel: 'Wer will schon nach Germanien?',
        grammatik: 'Demonstrativpronomen iste; Demonstrativpronomen iste (Verwendung); Konjunktiv im Hauptsatz: Hortativ, Jussiv, Optativ, Prohibitiv',
        lernjahr: 3
      },
      'Lektion 42': {
        titel: 'Die Seherin Veleda',
        grammatik: 'Partizip Futur Aktiv (PFA); Infinitiv Futur Aktiv; Verwendung des Partizips Futur Aktiv; Verwendung des Infinitiv Futur Aktiv',
        lernjahr: 3
      },
      'Lektion 43': {
        titel: 'Es geht nicht ohne Latein',
        grammatik: 'nd-Formen: Gerundium; nd-Formen: Gerundiv(um); Verwendung des Gerundiums; Verwendung des Gerundivums: attributives Gerundiv(um)',
        lernjahr: 3
      },
      'Lektion 44': {
        titel: 'Typisch germanisch?',
        grammatik: 'Verwendung des Gerundivums: prädikatives Gerundiv(um); Satzwertige Konstruktionen (Übersicht)',
        lernjahr: 3
      },
      'Lektion 45.1': { titel: 'Die Römer verstehen die Juden nicht', grammatik: 'Deliberativ (fakultativ); Potentialis (fakultativ)', lernjahr: 3 },
      'Lektion 45.2': { titel: 'Gesprächsthema Christentum', grammatik: 'fieri (fakultativ)', lernjahr: 3 },
      'Lektion 45.3': { titel: 'Erlösung durch Isis', grammatik: 'Deponentien (fakultativ)', lernjahr: 3 },
      'Lektion 45.4': { titel: '„So muss man beten!“', grammatik: 'Deponentien (fakultativ)', lernjahr: 3 }
    }
  }
}
