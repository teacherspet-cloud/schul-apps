/**
 * Beschriftungen der Prüfungskarten in der Zielsprache (01.10.2026).
 *
 * Die Karten liegen den Prüflingen vor; sie tragen wie der Kopf der Klassenarbeit die Sprache
 * des Faches. Für Sprachen ohne eigenen Eintrag steht die deutsche Fassung – unpersönlich
 * formuliert, weil die Anrede in Prüfungsmaterial landesweit uneinheitlich ist.
 */
export interface KartenTexte {
  satz: string
  pruefling: string
  monolog: string
  dialog: string
  aufwaermen: string
  vorbereitung: (min: number) => string
  sprechzeit: (min: number) => string
  material: string
  rolle: string
  aufgabe: string
  punkte: string
  gemeinsam: string
}

const TEXTE: Record<string, KartenTexte> = {
  en: {
    satz: 'Set',
    pruefling: 'Candidate',
    monolog: 'Part 2 – Talking on your own',
    dialog: 'Part 3 – Talking together',
    aufwaermen: 'Part 1 – Warm-up',
    vorbereitung: (m) => `Preparation time: ${m} minutes`,
    sprechzeit: (m) => `Talk for about ${m} ${m === 1 ? 'minute' : 'minutes'}.`,
    material: 'Material',
    rolle: 'Your role',
    aufgabe: 'Task',
    punkte: 'Talk about these points:',
    gemeinsam: 'Situation'
  },
  fr: {
    satz: 'Série',
    pruefling: 'Candidat',
    monolog: 'Partie 2 – Prise de parole en continu',
    dialog: 'Partie 3 – Prise de parole en interaction',
    aufwaermen: 'Partie 1 – Entretien',
    vorbereitung: (m) => `Temps de préparation : ${m} minutes`,
    sprechzeit: (m) => `Parle pendant environ ${m} minute${m === 1 ? '' : 's'}.`,
    material: 'Document',
    rolle: 'Ton rôle',
    aufgabe: 'Consigne',
    punkte: 'Parle de ces points :',
    gemeinsam: 'Situation'
  },
  es: {
    satz: 'Serie',
    pruefling: 'Candidato',
    monolog: 'Parte 2 – Monólogo',
    dialog: 'Parte 3 – Conversación',
    aufwaermen: 'Parte 1 – Presentación',
    vorbereitung: (m) => `Tiempo de preparación: ${m} minutos`,
    sprechzeit: (m) => `Habla durante unos ${m} minuto${m === 1 ? '' : 's'}.`,
    material: 'Material',
    rolle: 'Tu papel',
    aufgabe: 'Tarea',
    punkte: 'Habla de estos puntos:',
    gemeinsam: 'Situación'
  },
  it: {
    satz: 'Serie',
    pruefling: 'Candidato',
    monolog: 'Parte 2 – Monologo',
    dialog: 'Parte 3 – Conversazione',
    aufwaermen: 'Parte 1 – Presentazione',
    vorbereitung: (m) => `Tempo di preparazione: ${m} minuti`,
    sprechzeit: (m) => `Parla per circa ${m} minut${m === 1 ? 'o' : 'i'}.`,
    material: 'Materiale',
    rolle: 'Il tuo ruolo',
    aufgabe: 'Compito',
    punkte: 'Parla di questi punti:',
    gemeinsam: 'Situazione'
  },
  ru: {
    satz: 'Комплект',
    pruefling: 'Участник',
    monolog: 'Часть 2 – Монолог',
    dialog: 'Часть 3 – Диалог',
    aufwaermen: 'Часть 1 – Беседа',
    vorbereitung: (m) => `Время на подготовку: ${m} мин.`,
    sprechzeit: (m) => `Говори примерно ${m} мин.`,
    material: 'Материал',
    rolle: 'Твоя роль',
    aufgabe: 'Задание',
    punkte: 'Расскажи об этом:',
    gemeinsam: 'Ситуация'
  }
}

const DEUTSCH: KartenTexte = {
  satz: 'Kartensatz',
  pruefling: 'Prüfling',
  monolog: 'Teil 2 – Zusammenhängendes Sprechen',
  dialog: 'Teil 3 – An Gesprächen teilnehmen',
  aufwaermen: 'Teil 1 – Einstieg',
  vorbereitung: (m) => `Vorbereitungszeit: ${m} Minuten`,
  sprechzeit: (m) => `Sprechzeit: etwa ${m} ${m === 1 ? 'Minute' : 'Minuten'}.`,
  material: 'Material',
  rolle: 'Rolle',
  aufgabe: 'Aufgabe',
  punkte: 'Punkte für den Vortrag:',
  gemeinsam: 'Situation'
}

export const kartenTexte = (sprache: string): KartenTexte => TEXTE[sprache] ?? DEUTSCH

/** Buchstabe des Prüflings (A, B, C) */
export const prueflingsBuchstabe = (i: number): string => String.fromCharCode(65 + i)
