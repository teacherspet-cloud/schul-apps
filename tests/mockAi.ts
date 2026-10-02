import type { StructuredRequest } from '../src/shared/types'

/**
 * Simulierte KI: liefert zu jedem Aufgabentyp formal gültige Antworten,
 * damit Generierung, Editor und Export ohne Internet getestet werden können.
 */
export function mockAi(calls: StructuredRequest[] = []) {
  return async <T>(req: StructuredRequest): Promise<T> => {
    calls.push(req)
    const entries = [...req.user.matchAll(/id="([^"]+)" \| ([^|\n]+?) \| German: ([^|\n]+)/g)].map((m) => ({
      id: m[1],
      term: m[2].trim(),
      base: m[2].trim().replace(/^(to|a|an|the) /, ''),
      german: m[3].trim()
    }))
    const items = <R>(fn: (e: (typeof entries)[number], i: number) => R): R[] => entries.map(fn)

    const responses: Record<string, unknown> = {
      gapSentences: {
        instruction: 'Complete the sentences with the correct words.',
        items: items((e, i) => ({ vocabId: e.id, before: `Sentence ${i + 1}: we talked about the`, answer: e.base, after: 'yesterday.' }))
      },
      gapText: {
        instruction: 'Read the text and fill in the gaps.',
        text: `Last summer our class went on a trip. ${entries.map((e) => `We needed a [[${e.id}]] there.`).join(' ')}\nIt was a great day.`,
        gaps: items((e) => ({ vocabId: e.id, answer: e.base }))
      },
      dialogue: {
        instruction: 'Complete the dialogue.',
        text: entries.map((e, i) => `${i % 2 ? 'Anna' : 'Tom'}: Look at the [[${e.id}]]!`).join('\n'),
        gaps: items((e) => ({ vocabId: e.id, answer: e.base }))
      },
      matchDefinitions: {
        instruction: 'Match the explanations with the words.',
        pairs: items((e, i) => ({ vocabId: e.id, definition: `explanation number ${i} (German hint: ${e.german.length} letters)` })),
        extraWords: ['table', 'garden']
      },
      writeDefinitions: {
        instruction: 'Explain the words.',
        items: items((e) => ({ vocabId: e.id, prompt: e.term, modelAnswer: `A model explanation of ${e.base}.` }))
      },
      multipleChoice: {
        instruction: 'Tick the correct word.',
        items: items((e, i) => ({
          vocabId: e.id,
          before: `Question ${i + 1}: please give me the`,
          after: 'now.',
          options: [e.base, 'apple', 'chair', 'window'],
          correctIndex: 0
        }))
      },
      synonymsAntonyms: {
        instruction: 'Match the synonyms and opposites.',
        pairs: items((e, i) => ({ vocabId: e.id, partner: `partner${i}`, relation: i % 2 ? '≠' : '=' })),
        extraWords: ['green', 'fast']
      },
      collocations: {
        instruction: 'Match the word partners.',
        pairs: items((e, i) => ({ vocabId: e.id, first: `take the ${i}`, second: e.base })),
        extraWords: ['a bus', 'homework']
      },
      wordFormation: {
        instruction: 'Form words.',
        items: items((e) => ({ vocabId: e.id, before: 'This is a', stem: `${e.base}ing`, answer: e.base, after: 'thing.' }))
      },
      oddOneOut: {
        instruction: 'Find the odd one out.',
        items: items((e) => ({ vocabId: e.id, words: [e.base, 'dog', 'cat', 'horse'], answer: e.base, reason: 'The others are animals.' }))
      },
      categorize: {
        instruction: 'Sort the words.',
        categories: ['Group one', 'Group two'],
        words: items((e, i) => ({ vocabId: e.id, category: i % 2 ? 'Group two' : 'Group one' }))
      },
      wordFamily: {
        instruction: 'Which word belongs to the family?',
        items: items((e) => ({ vocabId: e.id, related: `${e.base}ness`, relatedPos: 'noun', answer: e.base }))
      },
      // Mindmap mit Oberbegriffen (02.10.2026): je Ast die Wörter
      mindmap: {
        instruction: 'Fill in the mind map.',
        topic: 'School things',
        categories: [
          { name: 'Group one', vocabIds: entries.filter((_, i) => i % 2 === 0).map((e) => e.id) },
          { name: 'Group two', vocabIds: entries.filter((_, i) => i % 2 === 1).map((e) => e.id) }
        ]
      },
      writeSentences: {
        instruction: 'Write sentences.',
        items: items((e) => ({ vocabId: e.id, prompt: `${e.term} – your holidays`, modelAnswer: `I used ${e.base} in my holidays.` }))
      },
      mediation: {
        instruction: 'Say it in English.',
        items: items((e) => ({ vocabId: e.id, prompt: `Ich brauche ${e.german}. (${e.term})`, modelAnswer: `I need ${e.base}.` }))
      },
      crossword: { instruction: 'Solve the crossword.', items: items((e, i) => ({ vocabId: e.id, clue: `clue number ${i + 1}` })) },
      scrambled: { instruction: 'Unscramble the words.', items: items((e, i) => ({ vocabId: e.id, hint: `Hint sentence ${i + 1} with ___ .` })) },
      wrongWord: {
        instruction: 'Correct the mistakes.',
        items: items((e) => ({ vocabId: e.id, before: 'I saw a', wrongWord: 'banana', after: 'there.', answer: e.base }))
      },
      twoSentences: {
        instruction: 'One word fits both sentences.',
        items: items((e) => ({ vocabId: e.id, before1: 'First:', after1: 'here.', before2: 'Second:', after2: 'there.', answer: e.base }))
      },
      trueFalse: {
        instruction: 'True or false?',
        items: items((e, i) => ({
          vocabId: e.id,
          statement: `Statement ${i + 1} about the meaning.`,
          isTrue: i % 2 === 0,
          correction: i % 2 ? 'Corrected statement.' : ''
        }))
      },
      // Latein – siehe `didactics/latein.ts`
      latinLoanWords: {
        instruction: 'Nenne ein deutsches Fremdwort.',
        items: items((e) => ({ vocabId: e.id, prompt: e.term, modelAnswer: `Fremdwort zu ${e.base}: ein Beispiel und der Zusammenhang.` }))
      },
      latinWordFormation: {
        instruction: 'Zerlege die Wörter.',
        items: items((e) => ({ vocabId: e.id, prompt: e.term, modelAnswer: `Präfix + ${e.base} + Endung` }))
      },
      latinContext: {
        instruction: 'Welche Bedeutung passt?',
        items: items((e, i) => ({
          vocabId: e.id,
          sentence: `Satz ${i + 1} mit ${e.term}.`,
          options: [e.german, 'zweite Bedeutung', 'dritte Bedeutung'],
          correct: 0
        }))
      },
      review: { problems: [] },
      vocab_analysis: { entries: items((e) => ({ id: e.id, depictable: true, imageKeywords: [e.base], pos: 'noun' })) }
    }
    if (!(req.schemaName in responses)) throw new Error(`Keine Mock-Antwort für ${req.schemaName}`)
    return responses[req.schemaName] as T
  }
}
