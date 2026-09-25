// Bilder für „Bilder beschriften“: eindeutig zur abgefragten Vokabel passend.
// Kandidaten aus Piktogrammen (OpenMoji) und gemeinfreien Cliparts, Auswahl durch die KI;
// passt keines eindeutig, wird ein Clipart erzeugt und ebenfalls geprüft.
import { AiCall, chooseImages, gatherCandidates, ImageCandidate, ImageNeed, ImageServices } from '../../../shared/imageChoice'
import { runLimited } from '../../../shared/async'
import { GREEN_SCREEN_PROMPT } from '../../../shared/images'
import type { PictureItem, TestSettings, VocabEntry } from '../model/types'
import { LANGUAGES } from '../model/types'

export interface PictureDeps {
  ai: AiCall
  services: ImageServices
  /** KI-Bilderzeugung, falls eingerichtet (liefert data:-URL) */
  generateImage?: (prompt: string) => Promise<string>
}

export type PictureFinder = (items: PictureItem[], vocab: VocabEntry[], settings: TestSettings) => Promise<string[]>

export function pictureRules(items: PictureItem[], settings: TestSettings): string {
  const language = LANGUAGES.find((l) => l.value === settings.targetLanguage)?.label ?? settings.targetLanguage
  return [
    `Vokabeltest ${language}, Klasse ${settings.grade} (Niveau ${settings.level}). Die Schülerinnen und Schüler sehen nur das Bild und schreiben das passende Wort darunter.`,
    `Wörter dieser Aufgabe (alle stehen im Wortkasten): ${items.map((i) => i.answer).join(', ')}.`,
    'Ein Bild ist nur „eindeutig“, wenn ein Kind dieses Alters ohne Zögern GENAU dieses Wort in GENAU dieser Bedeutung nennt:',
    '- ein einzelner, klar erkennbarer Gegenstand bzw. eine klar erkennbare Handlung; nichts Ablenkendes, keine Szene mit vielen Dingen',
    '- nicht mit einem anderen Wort dieser Aufgabe oder einem naheliegenden Oberbegriff/Synonym verwechselbar',
    '- richtige Bedeutung – maßgeblich ist die deutsche Bedeutung (z. B. „bat“ = Fledermaus, nicht Schläger)',
    '- keine Schrift, Buchstaben oder Zahlen im Bild, die die Lösung verraten',
    '- kindgerecht, keine Gewalt, keine Marken',
    '- sauberer Hintergrund: kein grau-weißes Schachbrettmuster (eingebrannte „Transparenz“), keine Wasserzeichen, keine Bildfehler',
    'Im Zweifel ist ein einfaches Piktogramm oder Clipart besser als ein Foto. Lieber 0 wählen als ein missverständliches Bild.'
  ].join('\n')
}

function needFor(item: PictureItem, entry: VocabEntry | undefined): ImageNeed {
  const keywords = item.imageKeywords.length ? item.imageKeywords : [item.answer]
  return {
    id: item.id,
    subject: `Wort „${item.answer}“${entry?.translation ? ` – Bedeutung: ${entry.translation}` : ''}${entry?.imageHint ? ` – Bildidee: ${entry.imageHint}` : ''}`,
    queries: [...new Set([...keywords, item.answer])],
    kinds: ['pictogram', 'clipart']
  }
}

/** Auftrag für ein erzeugtes Clipart: genau ein Motiv, eindeutig, ohne Schrift. */
export function vocabClipartPrompt(item: PictureItem, entry: VocabEntry | undefined): string {
  const motif = entry?.imageHint || item.imageKeywords[0] || item.answer
  return [
    `A simple, friendly clipart illustration for a children's vocabulary test showing exactly: ${motif}.`,
    entry?.translation ? `The meaning is the German word "${entry.translation}" – show exactly this meaning.` : '',
    'One single object or action, centered, instantly recognisable, flat colours with bold dark outlines.',
    GREEN_SCREEN_PROMPT,
    'No text, no letters, no numbers, no other objects, no background scenery.'
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Sucht für alle Bilder einer Aufgabe gemeinsam passende Bilder (eine KI-Prüfung für alle Kandidaten).
 * Liefert Hinweise für die Lehrkraft.
 */
export async function findVocabPictures(items: PictureItem[], vocab: VocabEntry[], settings: TestSettings, deps: PictureDeps): Promise<string[]> {
  const notes: string[] = []
  const entries = new Map(vocab.map((v) => [v.id, v]))
  const todo = items.filter((i) => !i.image)
  const gathered = await Promise.all(
    todo.map(async (item) => {
      const need = needFor(item, item.vocabId ? entries.get(item.vocabId) : undefined)
      return { item, need, candidates: await gatherCandidates(need, deps.services, 3) }
    })
  )
  const rules = pictureRules(items, settings)
  const choices = await chooseImages(
    gathered.map(({ need, candidates }) => ({ need, candidates })),
    rules,
    deps.ai
  )

  const missing: typeof gathered = []
  for (const g of gathered) {
    const choice = choices.get(g.need.id)
    if (choice?.candidate && choice.fit === 'eindeutig') {
      g.item.image = await loadRef(choice.candidate)
    } else {
      missing.push(g)
    }
  }

  // Kein eindeutiges Bild gefunden: Clipart erzeugen und ebenfalls prüfen
  if (missing.length && deps.generateImage) {
    const generate = deps.generateImage
    const results = await runLimited(
      missing.map((g) => async () => {
        try {
          const dataUrl = await generate(vocabClipartPrompt(g.item, g.item.vocabId ? entries.get(g.item.vocabId) : undefined))
          const preview = await deps.services.normalize(dataUrl, 256, 'jpeg')
          const candidate: ImageCandidate = { kind: 'clipart', source: 'ai', title: 'KI-Clipart', credit: 'KI-generiert', preview, load: async () => dataUrl }
          return { g, candidate }
        } catch {
          return null // bleibt ohne Bild
        }
      }),
      2
    )
    const generated = results.filter((r): r is { g: (typeof missing)[number]; candidate: ImageCandidate } => r !== null)
    if (generated.length) {
      const check = await chooseImages(
        generated.map(({ g, candidate }) => ({ need: g.need, candidates: [candidate] })),
        rules,
        deps.ai
      )
      for (const { g, candidate } of generated) {
        const c = check.get(g.need.id)
        if (c?.candidate && c.fit !== 'ungeeignet') {
          g.item.image = { dataUrl: await candidate.load(), source: 'ai', credit: 'KI-generiert' }
          if (c.fit === 'brauchbar') notes.push(`Bild zu „${g.item.answer}“ ist nicht ganz eindeutig (${c.reason}) – bitte prüfen.`)
        }
      }
    }
  }

  // Bleibt eine Vokabel ohne Bild, tritt eine andere an ihre Stelle – eine Lücke im Test
  // hilft niemandem. Höchstens drei Versuche je Lücke, damit die Erzeugung kurz bleibt.
  const open = missing.filter((g) => !g.item.image)
  if (open.length) {
    const used = new Set(items.map((i) => i.vocabId).filter((id): id is string => Boolean(id)))
    const pool = vocab.filter((v) => v.term.trim() && !used.has(v.id) && v.depictable !== false)
    for (const g of open) {
      const before = g.item.answer
      for (let tries = 0; tries < 3 && pool.length; tries++) {
        const next = pool.shift()
        if (!next) break
        used.add(next.id)
        const image = await imageFor(next, rules, deps)
        if (!image) continue
        g.item.vocabId = next.id
        g.item.answer = next.term
        g.item.imageKeywords = next.imageKeywords ?? [next.term]
        g.item.image = image
        notes.push(`Statt „${before}“ steht jetzt „${next.term}“ im Bild-Teil – zu „${before}“ gab es kein eindeutiges Bild.`)
        break
      }
      if (!g.item.image) {
        notes.push(`Kein eindeutiges Bild für „${g.item.answer}“ gefunden (${choices.get(g.need.id)?.reason ?? 'keine Treffer'}) – bitte im Editor auswählen.`)
      }
    }
  }
  return notes
}

/** Sucht (und erzeugt notfalls) ein Bild für eine einzelne Ersatz-Vokabel. */
async function imageFor(entry: VocabEntry, rules: string, deps: PictureDeps): Promise<PictureItem['image'] | undefined> {
  const item: PictureItem = { id: entry.id, vocabId: entry.id, answer: entry.term, imageKeywords: entry.imageKeywords ?? [entry.term] }
  const need = needFor(item, entry)
  const candidates = await gatherCandidates(need, deps.services, 3)
  const choice = (await chooseImages([{ need, candidates }], rules, deps.ai)).get(need.id)
  if (choice?.candidate && choice.fit === 'eindeutig') return loadRef(choice.candidate)
  if (!deps.generateImage) return undefined
  try {
    const dataUrl = await deps.generateImage(vocabClipartPrompt(item, entry))
    const preview = await deps.services.normalize(dataUrl, 256, 'jpeg')
    const candidate: ImageCandidate = { kind: 'clipart', source: 'ai', title: 'KI-Clipart', credit: 'KI-generiert', preview, load: async () => dataUrl }
    const check = (await chooseImages([{ need, candidates: [candidate] }], rules, deps.ai)).get(need.id)
    if (check?.candidate && check.fit !== 'ungeeignet') return { dataUrl, source: 'ai', credit: 'KI-generiert' }
  } catch {
    // kein Ersatzbild – die nächste Vokabel ist dran
  }
  return undefined
}

async function loadRef(c: ImageCandidate): Promise<PictureItem['image']> {
  return { dataUrl: await c.load(), source: c.source === 'openverse' ? 'openverse' : c.source, credit: c.credit }
}
