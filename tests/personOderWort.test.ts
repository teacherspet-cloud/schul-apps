import { describe, expect, it } from 'vitest'
import { personOderWort, schaetzeSprache, spracheAus, type WortKontext } from '../src/server/personOderWort'

/*
 * Person oder Wort? (08.10.2026) – lokale Entscheidung ohne KI, ob ein Name der Klassenliste, der zugleich ein Wort ist,
 * die Person meint. Gleichstand → Person (Datenschutz geht vor).
 */
const ist = (text: string, name: string, k: WortKontext = {}, nr = 0): boolean => {
  let i = -1
  // Flektierte Formen (Роза → Розой): notfalls über den Stamm suchen
  const suche = text.toLocaleLowerCase().includes(name.toLocaleLowerCase()) ? name : name.slice(0, -1)
  for (let n = 0; n <= nr; n++) i = text.toLocaleLowerCase().indexOf(suche.toLocaleLowerCase(), i + 1)
  if (i < 0) throw new Error(`${name} nicht in ${text}`)
  return personOderWort(text, i, name, k).person
}
const person = (text: string, name: string, k: WortKontext = {}, nr = 0): void => expect(ist(text, name, k, nr), `${text} → Person`).toBe(true)
const wort = (text: string, name: string, k: WortKontext = {}, nr = 0): void => expect(ist(text, name, k, nr), `${text} → Wort`).toBe(false)

describe('Sprache erkennen', () => {
  it('aus Fach/Zielsprache und aus dem Text', () => {
    expect(spracheAus('Englisch')).toBe('en')
    expect(spracheAus('fr')).toBe('fr')
    expect(spracheAus('en-GB')).toBe('en')
    expect(spracheAus('Latein')).toBe('la')
    expect(spracheAus('')).toBeNull()
    expect(schaetzeSprache('Я гуляю с Мартином')).toBe('ru')
    expect(schaetzeSprache('The cat is on the table and it is happy')).toBe('en')
    expect(schaetzeSprache('Le chat est sur la table et il dort')).toBe('fr')
    expect(schaetzeSprache('Der Hund ist nicht im Haus und die Katze auch nicht')).toBe('de')
  })
})

describe('Deutsch', () => {
  const k: WortKontext = { sprache: 'de' }
  it('Blume oder Mädchen: Rose', () => {
    wort('Die Rose blüht im Garten.', 'Rose', k)
    wort('Ich habe ihr eine rote Rose geschenkt.', 'Rose', k)
    wort('Im Beet stehen viele Rosen.', 'Rose', k)
    wort('Der Rosenstrauch ist groß.', 'Rose', k)
    person('Ich war gestern mit Rose im Kino.', 'Rose', k)
    person('Rose sagt, dass die Aufgabe schwer ist.', 'Rose', k)
    person('Rose, kannst du mir helfen?', 'Rose', k)
    person('Roses Heft liegt noch auf dem Tisch.', 'Rose', k)
    person('Heute hat Rose Geburtstag.', 'Rose', k)
    // Possessiv allein ist mehrdeutig → Person
    person('Das ist meine Rose.', 'Rose', k)
    // … mit Adjektiv eher das Wort
    wort('Das ist meine schöne Rose.', 'Rose', k)
  })
  it('Otto: Motor oder Mitschüler', () => {
    wort('Der Ottomotor wurde 1876 erfunden.', 'Otto', k)
    person('Otto kommt heute nicht, er ist krank.', 'Otto', k)
    person('Ich und Otto haben das Plakat gemacht.', 'Otto', k)
  })
  it('Sankt Martin oder Martin aus der Klasse', () => {
    wort('Am 11. November feiern wir Sankt Martin.', 'Martin', k)
    wort('Zu St. Martin gehen wir mit Laternen.', 'Martin', k)
    wort('Es gab eine Martinsgans.', 'Martin', k)
    person('Martins Idee war am besten.', 'Martin', k)
    person('Ich habe mit Martin gelernt.', 'Martin', k)
    person('Martin meint, das stimmt nicht.', 'Martin', k)
  })
  it('Mark: Währung oder Name', () => {
    wort('Das Brot kostete damals 5 Mark.', 'Mark', k)
    wort('Früher bezahlte man mit der Mark.', 'Mark', k)
    person('Mark fragt, ob er mitkommen darf.', 'Mark', k)
  })
  it('Monate und Städte', () => {
    wort('Im Mai fahren wir weg.', 'Mai', k)
    wort('Paris ist die Hauptstadt von Frankreich.', 'Paris', { sprache: 'de', material: 'Hauptstädte Europas: Paris, Rom, Berlin' })
  })
  it('Namen in Aufzählungen der Klassenliste und Unterschrift', () => {
    const namen = ['Anna Schulz', 'Rose Klein', 'Ben Wolf']
    person('Anna, Rose und Ben haben gewonnen.', 'Rose', { ...k, namen })
    person('Das Projekt haben Ben und Rose vorgestellt.', 'Rose', { ...k, namen })
    person('Das war mein Bericht.\nViele Grüße\nRose', 'Rose', k)
    person('Ich heiße Rose.', 'Rose', { ...k, eigenerName: 'Rose Klein' })
  })
  it('Material derselben Anfrage: das Wort ist Unterrichtsinhalt', () => {
    wort('Rose', 'Rose', { ...k, material: 'Übersetze: rose – die Rose, tulip – die Tulpe' })
    wort('Die Antwort ist Rose.', 'Rose', { ...k, material: 'Vokabeln: die Rose, die Tulpe' })
  })
})

describe('Englisch', () => {
  const k: WortKontext = { sprache: 'en' }
  it('rose: flower, past tense, girl', () => {
    wort('She gave me a red rose.', 'Rose', k)
    wort('The sun rose at six.', 'Rose', k)
    wort('Prices rose quickly.', 'Rose', k)
    person('I went to the cinema with Rose.', 'Rose', k)
    person("Rose's bag is blue.", 'Rose', k)
    person('Yesterday Rose said that she was ill.', 'Rose', k)
    person('Dear Rose, thank you for the letter.', 'Rose', k)
  })
  it('will, may, mark, bill, grace', () => {
    wort('Will you help me?', 'Will', k)
    wort('I will help you.', 'Will', k)
    person('Will is my best friend.', 'Will', k)
    wort('May I open the window?', 'May', k)
    person('Yesterday I played with May.', 'May', k)
    wort('Put a mark next to the right answer.', 'Mark', k)
    person('Mark says hello.', 'Mark', k)
    wort('We paid the bill.', 'Bill', k)
    wort('She danced with grace.', 'Grace', k)
    person('Tom and Grace are in my class.', 'Grace', { ...k, namen: ['Tom Baker', 'Grace Hill'] })
  })
  it('Material: vocabulary item', () => {
    wort('Rose', 'Rose', { ...k, material: 'Vocabulary: rose, tulip, daisy' })
  })
})

describe('Französisch', () => {
  const k: WortKontext = { sprache: 'fr' }
  it('rose (Blume/Farbe) oder Rose', () => {
    wort('Elle a une robe rose.', 'Rose', k)
    wort('La rose est belle.', 'Rose', k)
    person('Je vais au cinéma avec Rose.', 'Rose', k)
    person('Rose dit que le film est bien.', 'Rose', k)
    person('Voici le cahier de Rose.', 'Rose', k)
    person('Salut Rose, ça va ?', 'Rose', k)
  })
})

describe('Spanisch', () => {
  const k: WortKontext = { sprache: 'es' }
  it('rosa oder Rosa', () => {
    wort('Tengo una camiseta rosa.', 'Rosa', k)
    wort('La rosa es roja.', 'Rosa', k)
    person('Voy al cine con Rosa.', 'Rosa', k)
    person('Rosa dice que no tiene tiempo.', 'Rosa', k)
    person('Hola Rosa, ¿qué tal?', 'Rosa', k)
  })
})

describe('Italienisch', () => {
  const k: WortKontext = { sprache: 'it' }
  it('rosa, mia, ben', () => {
    wort('Ho una maglietta rosa.', 'Rosa', k)
    wort('La rosa è bella.', 'Rosa', k)
    person('Vado al cinema con Rosa.', 'Rosa', k)
    person('Ciao Rosa, come stai?', 'Rosa', k)
    wort('La mia casa è grande.', 'Mia', k)
    person('Oggi Mia dice che ha fame.', 'Mia', k)
  })
})

describe('Latein', () => {
  const k: WortKontext = { sprache: 'la' }
  it('rosa oder Rosa', () => {
    wort('Puella rosam amat, rosa pulchra est.', 'Rosa', k, 1)
    person('Rosa inquit: "Salve!"', 'Rosa', k)
    person('Marcus cum Rosa ambulat.', 'Rosa', k)
    wort('Rosa', 'Rosa', { ...k, material: 'Vokabeln: rosa, rosae f. – die Rose' })
  })
})

describe('Niederländisch', () => {
  const k: WortKontext = { sprache: 'nl' }
  it('roos oder Roos', () => {
    wort('Ik heb een roos gekocht.', 'Roos', k)
    wort('De roos is rood.', 'Roos', k)
    person('Ik ga met Roos naar school.', 'Roos', k)
    person('Roos zegt dat ze ziek is.', 'Roos', k)
  })
})

describe('Russisch (kyrillisch, Fallformen)', () => {
  const k: WortKontext = { sprache: 'ru' }
  it('Мартин in Fallformen, роза klein', () => {
    person('Я гуляю с Мартином.', 'Мартин', k)
    person('Вчера я видел Мартина в школе.', 'Мартин', k)
    person('Мартин говорит, что он болен.', 'Мартин', k)
    wort('Красная роза очень красивая.', 'Роза', k)
    person('Я иду в кино с Розой.', 'Роза', k)
  })
  it('ohne Sprachangabe wird Russisch an der Schrift erkannt', () => {
    person('Я гуляю с Мартином.', 'Мартин')
  })
})

describe('Weitere Sprachen', () => {
  it('Portugiesisch, Polnisch, Tschechisch, Türkisch', () => {
    wort('Comprei uma rosa vermelha.', 'Rosa', { sprache: 'pt' })
    person('Vou ao cinema com Rosa.', 'Rosa', { sprache: 'pt' })
    person('Idę do kina z Martinem.', 'Martin', { sprache: 'pl' })
    person('Jdu do kina s Martinem.', 'Martin', { sprache: 'cs' })
    person("Bugün Deniz ve ben sinemaya gittik.", 'Deniz', { sprache: 'tr' })
    wort('Bugün deniz çok güzel.', 'Deniz', { sprache: 'tr' })
  })
  it('ohne Signale: Person (Datenschutz geht vor)', () => {
    person('Rose', 'Rose')
    person('Heute Rose.', 'Rose', { sprache: 'de' })
  })
})
