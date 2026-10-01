/**
 * Änderungswunsch an einen Hörtext – das SKRIPT ändert sich, die Aufgaben ziehen mit (01.10.2026).
 *
 * Wunsch der Lehrkraft: Am Hörtext wie an jedem Baustein Zauberstab und Kreis mit freiem Wunsch
 * und Vorschlägen („kürzer", „langsamer / einfachere Sprache", „mehr Sprecher", „Akzent",
 * „andere Situation"). Die KI ändert das Skript; alle Aufgaben zu diesem Hörtext (Mehrfachwahl,
 * Lücken, richtig/falsch, Notizen, Erwartungshorizont) werden an das neue Skript angepasst –
 * Aufbau und Nummerierung bleiben, wo es geht; neu geschrieben wird nur, was nicht mehr stimmt.
 * Eine kurze Zusammenfassung sagt, was sich geändert hat; Strg+Z nimmt alles in EINEM Schritt
 * zurück. Eine vorhandene Aufnahme passt danach nicht mehr – das erkennt `hoerzeit.ts` am
 * Fingerabdruck des Skripts, und „Neu vertonen" ersetzt nur die geänderten Stellen.
 *
 * Zwei Anfragen, weil es zwei Aufgaben sind: erst das Skript (mit denselben Regeln wie beim
 * Schreiben eines Hörtextes), dann die Aufgaben gegen ALTES und NEUES Skript. So sieht die KI,
 * welche Stelle sich verschoben hat, und kann unveränderte Items unverändert lassen.
 *
 * Für Arbeitsblatt, Klassenarbeit und Lernzielkontrolle gleich; die Programme reichen ihren
 * Systemauftrag mit (`system`), damit Landesformat und Operatoren gelten.
 */
import { arr, bool, int, obj, str } from '../../../shared/aiSchema'
import type { Anrede } from '../../../shared/anrede'
import { wunschAuftrag, type WunschArt } from '../../../shared/kiWunsch'
import { zusatzfragenRegeln } from '../../../shared/verstehen/regeln'
import { hoertextZu, schaetzeSekunden } from '../../../shared/verstehen/hoerzeit'
import { createRng, randomSeed } from '../../vokabeltest/model/random'
import { listeningRules } from '../didactics/listeningFormats'
import type { LearnerProfile } from '../didactics/profile'
import { trueFalseZugelassen } from '../didactics/listeningStates'
import { hoerStufe } from '../didactics/hoerablauf'
import { anredeFuerMeta } from '../didactics/anrede'
import type { AudioBlock, TaskBlock, WorksheetMeta, WsBlock } from '../model/types'
import { convertBlock } from './convert'
import { describeBlock } from './describe'
import type { AiCall } from './generate'
import { audioTagRules, type ListeningScript } from './listening'
import { listeningTextRules, systemPrompt } from './prompts'
import { FLAT_BLOCK } from './schemas'

export const SKRIPT_WUNSCH_SCHEMA = obj({
  title: str('Kurzer Titel des Hörtextes, in der Zielsprache'),
  textType: str('Textsorte'),
  speakers: arr(str('Name der sprechenden Person'), '1 bis 4 Sprechende'),
  transcript: str('Das vollständige neue Skript. Jede Sprecherzeile als „Name: Text" in einer eigenen Zeile.'),
  beforeListening: str('Hinweis vor dem Hören: Anlass, Zahl und Rolle der Sprechenden – ohne Lösungen vorwegzunehmen'),
  plays: int('Wie oft der Text gehört wird'),
  aenderungen: str('Ein knapper Satz auf Deutsch: was am Skript geändert wurde')
})

export const AUFGABEN_ANPASSEN_SCHEMA = obj({
  aufgaben: arr(
    obj({
      id: str('Kennung der Aufgabe, genau wie angegeben'),
      geaendert: bool('true = die Aufgabe musste angepasst werden; false = sie passt unverändert zum neuen Skript'),
      grund: str('Kurz auf Deutsch, was angepasst wurde (z. B. „Item 3: Antwort jetzt Dienstag"), sonst leer'),
      block: FLAT_BLOCK
    })
  ),
  zusammenfassung: str('Ein bis zwei Sätze auf Deutsch: was sich an den Aufgaben geändert hat')
})

/** Die Aufgaben zu einem Hörtext, in Blattreihenfolge */
export function hoertextAufgaben(bloecke: WsBlock[], audioId: string): TaskBlock[] {
  return bloecke.filter((b): b is TaskBlock => b.type === 'task' && hoertextZu(b, bloecke)?.id === audioId)
}

/** Auftrag für das neue Skript – ohne KI prüfbar. */
export function skriptWunschAuftrag(audio: AudioBlock, art: WunschArt, wunsch: string, meta: WorksheetMeta): string {
  return [
    wunschAuftrag(art, wunsch).replace(/den Baustein/g, 'den Hörtext'),
    `Fach ${meta.subjectLabel}, Klasse ${meta.grade}, Niveau ${meta.cefrLevel}. Thema: ${meta.topic}`,
    'Der Wunsch der Lehrkraft geht den allgemeinen Regeln vor (etwa der Länge, wenn „kürzer" gewünscht ist).',
    art === 'neu'
      ? 'Schreibe ein ganz neues Skript zum selben Thema und Zweck. Die Aufgaben werden danach an das neue Skript angepasst.'
      : 'Ändere nur, was der Wunsch verlangt. Alles andere – Sprechende, Reihenfolge, Schlüsselinformationen – bleibt möglichst wörtlich gleich: Unveränderte Zeilen müssen nicht neu vertont werden, und die Aufgaben bleiben gültig.',
    '',
    'Regeln für Hörtexte:',
    listeningTextRules(meta),
    '',
    'Das Skript wird von einer Computerstimme vorgelesen. Deshalb:',
    '- Jede Sprecherzeile beginnt mit dem Namen und einem Doppelpunkt: „Anna: …".',
    '- Keine Regieanweisungen in Klammern, keine Geräuschbeschreibungen, keine Zeitangaben.',
    '- Ein gewünschter Akzent oder Dialekt zeigt sich in Wortwahl und Wendungen, nicht in Lautschrift.',
    audioTagRules,
    '',
    `Bisheriger Hörtext „${audio.title}" (${audio.textType}, ${audio.plays}× hören):`,
    audio.beforeListening ? `Vor dem Hören: ${audio.beforeListening}` : '',
    '--- Skript ---',
    audio.transcript,
    '--- Ende des Skripts ---'
  ]
    .filter((z) => z !== undefined)
    .join('\n')
}

/** Das neue Skript nach dem Wunsch der Lehrkraft. */
export async function skriptNachWunsch(
  audio: AudioBlock,
  art: WunschArt,
  wunsch: string,
  meta: WorksheetMeta,
  profile: LearnerProfile,
  ai: AiCall,
  system?: string
): Promise<{ skript: ListeningScript; aenderungen: string }> {
  const d = await ai<Partial<ListeningScript> & { aenderungen?: string }>({
    system: system ?? systemPrompt(meta, profile),
    user: skriptWunschAuftrag(audio, art, wunsch, meta),
    schemaName: 'hoertext_wunsch',
    schema: SKRIPT_WUNSCH_SCHEMA
  })
  const transcript = String(d?.transcript ?? '').trim()
  if (!transcript) throw new Error('Die KI hat kein neues Skript geliefert.')
  return {
    skript: {
      title: String(d.title ?? '').trim() || audio.title,
      textType: String(d.textType ?? '').trim() || audio.textType,
      transcript,
      speakers: (Array.isArray(d.speakers) ? d.speakers : []).map((s) => String(s).trim()).filter(Boolean),
      beforeListening: String(d.beforeListening ?? '').trim() || audio.beforeListening,
      plays: Math.max(1, Math.min(3, Number(d.plays) || audio.plays || listeningRules(meta.cefrLevel).plays))
    },
    aenderungen: String(d.aenderungen ?? '').trim()
  }
}

/** Auftrag für die Anpassung der Aufgaben – ohne KI prüfbar. */
export function aufgabenAnpassenAuftrag(altSkript: string, neuSkript: string, aufgaben: TaskBlock[], meta: WorksheetMeta, nummern?: Map<string, number>): string {
  const stufe = hoerStufe(meta.grade)
  // Dieselben Qualitätsregeln wie für Zusatzfragen (Format, Unabhängigkeit, Distraktoren, Stufen)
  const regeln = zusatzfragenRegeln([0, 0, 0, 0, 0], trueFalseZugelassen(meta.stateId, stufe))
    .split('\n')
    .filter((z) => !/^ERGÄNZE GENAU/.test(z))
    .join('\n')
  return [
    'Das Skript eines Hörtextes wurde geändert. Passe die Aufgaben zu diesem Hörtext an das NEUE Skript an.',
    '- Prüfe JEDE Aufgabe und jedes Item gegen das neue Skript: Stimmt die Lösung noch, steht die Information noch im Text, an welcher Stelle?',
    '- Passt eine Aufgabe unverändert: geaendert = false und den Baustein unverändert zurückgeben.',
    '- Sonst nur das Nötige ändern: Aufgabentyp, Antwortform, Zahl und Reihenfolge der Items, Punkte und Nummerierung bleiben, wo es geht. Neu geschrieben werden nur Items, deren Antwort sich geändert hat oder die keine Grundlage mehr im Text haben.',
    '- Lösung und Erwartungshorizont (solution, auch der Teilaufgaben) passen zum neuen Skript.',
    '- Arbeitsanweisungen und Items bleiben in derselben Sprache wie bisher.',
    '- Nenne in grund knapp, was geändert wurde.',
    '',
    'Qualitätsregeln für die Items:',
    regeln,
    '',
    '--- BISHERIGES Skript ---',
    altSkript,
    '--- NEUES Skript ---',
    neuSkript,
    '--- Ende ---',
    '',
    'Aufgaben zu diesem Hörtext (jede mit Kennung):',
    ...aufgaben.map((a) => `[${a.id}]${nummern?.get(a.id) ? ` Aufgabe ${nummern.get(a.id)}` : ''}\n${describeBlock(a)}`),
    '',
    `Liefere für JEDE der ${aufgaben.length} Aufgaben einen Eintrag mit ihrer Kennung und dem vollständigen Baustein (type "task").`,
    meta.subjectLabel ? `Fach: ${meta.subjectLabel}, Klasse ${meta.grade}, Niveau ${meta.cefrLevel}.` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export interface AufgabenAnpassung {
  /** Angepasste Aufgaben (gleiche Kennung) */
  bloecke: Map<string, WsBlock>
  /** Je angepasster Aufgabe der Grund */
  gruende: Map<string, string>
  zusammenfassung: string
}

/**
 * Die Aufgaben an das neue Skript anpassen. Kennung, Sterne, Punkte (wenn die Zahl der Items
 * bleibt), Hörtext-Zuordnung und Kompetenzbereich bleiben erhalten.
 */
export async function aufgabenAnSkriptAnpassen(
  altSkript: string,
  neuSkript: string,
  aufgaben: TaskBlock[],
  meta: WorksheetMeta,
  profile: LearnerProfile,
  ai: AiCall,
  optionen: { system?: string; anrede?: Anrede; nummern?: Map<string, number> } = {}
): Promise<AufgabenAnpassung> {
  const leer: AufgabenAnpassung = { bloecke: new Map(), gruende: new Map(), zusammenfassung: '' }
  if (!aufgaben.length) return leer
  const d = await ai<{ aufgaben?: { id?: string; geaendert?: boolean; grund?: string; block?: Record<string, unknown> }[]; zusammenfassung?: string }>({
    system: optionen.system ?? systemPrompt(meta, profile),
    user: aufgabenAnpassenAuftrag(altSkript, neuSkript, aufgaben, meta, optionen.nummern),
    schemaName: 'hoertext_aufgaben',
    schema: AUFGABEN_ANPASSEN_SCHEMA
  })
  const anrede = optionen.anrede ?? anredeFuerMeta(meta)
  const out: AufgabenAnpassung = { ...leer, zusammenfassung: String(d?.zusammenfassung ?? '').trim() }
  for (const e of d?.aufgaben ?? []) {
    const alt = aufgaben.find((a) => a.id === String(e?.id ?? '').trim())
    if (!alt || !e.geaendert || !e.block) continue
    const roh = convertBlock({ ...e.block, type: 'task' }, createRng(randomSeed()), [], anrede)
    if (!roh || roh.type !== 'task') continue
    const gleicheZahl = roh.parts.length === alt.parts.length
    const neu: TaskBlock = {
      ...roh,
      id: alt.id,
      ...(alt.stars ? { stars: alt.stars } : {}),
      points: gleicheZahl || !roh.points ? alt.points : roh.points,
      ...(alt.audioId ? { audioId: alt.audioId } : {}),
      ...(alt.skill ? { skill: alt.skill } : {})
    }
    out.bloecke.set(alt.id, neu)
    if (e.grund?.trim()) out.gruende.set(alt.id, e.grund.trim())
  }
  return out
}

/**
 * Neues Skript und angepasste Aufgaben in die Bausteine übernehmen – rein, ohne KI. Stimmen
 * bleiben bei den Namen, die weiter sprechen; die Aufnahme bleibt stehen (sie gilt über den
 * Fingerabdruck als veraltet und wird beim Neuvertonen nur an den geänderten Stellen ersetzt).
 */
export function wendeHoertextWunschAn(bloecke: WsBlock[], audioId: string, skript: ListeningScript, aufgaben: Map<string, WsBlock>): WsBlock[] {
  return bloecke.map((b) => {
    if (b.id === audioId && b.type === 'audio') {
      const namen = skript.speakers.length ? skript.speakers : b.speakers.map((s) => s.name)
      return {
        ...b,
        title: skript.title || b.title,
        textType: skript.textType || b.textType,
        transcript: skript.transcript,
        beforeListening: skript.beforeListening,
        plays: skript.plays,
        speakers: namen.map((name, i) => b.speakers.find((s) => s.name === name) ?? { id: `${b.id}-${i}-${name.replace(/\W+/g, '')}`, name, voiceId: '', voiceName: '' }),
        seconds: schaetzeSekunden(skript.transcript)
      }
    }
    return aufgaben.get(b.id) ?? b
  })
}

/** Meldung für die Lehrkraft: was am Skript und an den Aufgaben geändert wurde */
export function wunschZusammenfassung(
  aenderungen: string,
  anpassung: AufgabenAnpassung,
  aufgaben: TaskBlock[],
  nummern: Map<string, number>,
  aufnahmeDa: boolean
): string {
  const name = (id: string): string => (nummern.get(id) ? `Aufgabe ${nummern.get(id)}` : 'eine Aufgabe')
  const geaendert = aufgaben.filter((a) => anpassung.bloecke.has(a.id))
  const gleich = aufgaben.filter((a) => !anpassung.bloecke.has(a.id))
  return [
    `Hörtext überarbeitet${aenderungen ? `: ${aenderungen}` : '.'}`,
    geaendert.length ? `Angepasst: ${geaendert.map((a) => `${name(a.id)}${anpassung.gruende.get(a.id) ? ` (${anpassung.gruende.get(a.id)})` : ''}`).join('; ')}.` : '',
    gleich.length ? `Unverändert: ${gleich.map((a) => name(a.id)).join(', ')}.` : '',
    aufnahmeDa ? 'Die Aufnahme passt nicht mehr zum Skript – „Geänderte Stellen neu vertonen" im Reiter Hörtexte ersetzt nur die geänderten Zeilen.' : '',
    'Strg+Z nimmt alles in einem Schritt zurück.'
  ]
    .filter(Boolean)
    .join(' ')
}

/** Nummern der Aufgaben in einer Bausteinliste (1, 2, 3 … in Blattreihenfolge) */
export function aufgabenNummern(bloecke: WsBlock[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const b of bloecke) if (b.type === 'task') m.set(b.id, m.size + 1)
  return m
}

export interface HoertextWunschErgebnis {
  skript: ListeningScript
  /** Je Bausteinliste (Blatt, Fassung) die angepassten Aufgaben */
  anpassungen: AufgabenAnpassung[]
  zusammenfassung: string
}

/**
 * Der ganze Ablauf für ein Programm: neues Skript, dann je Bausteinliste (Blatt bzw. Fassung,
 * in der der Hörtext steht) die Aufgaben anpassen. Übernommen wird danach mit
 * `wendeHoertextWunschAn` – in EINEM Schritt, damit Strg+Z alles zurücknimmt.
 */
export async function hoertextWunschAusfuehren(a: {
  listen: WsBlock[][]
  audioId: string
  art: WunschArt
  wunsch: string
  meta: WorksheetMeta
  profile: LearnerProfile
  ai: AiCall
  system?: string
  melde?: (text: string) => void
}): Promise<HoertextWunschErgebnis> {
  const audio = a.listen.flat().find((b): b is AudioBlock => b.id === a.audioId && b.type === 'audio')
  if (!audio) throw new Error('Der Hörtext ist nicht mehr vorhanden.')
  a.melde?.(a.art === 'neu' ? 'Die KI schreibt den Hörtext neu …' : 'Die KI überarbeitet das Skript …')
  const { skript, aenderungen } = await skriptNachWunsch(audio, a.art, a.wunsch, a.meta, a.profile, a.ai, a.system)
  const anpassungen: AufgabenAnpassung[] = []
  let zusammenfassung = ''
  for (const liste of a.listen) {
    const aufgaben = hoertextAufgaben(liste, a.audioId)
    if (!aufgaben.length) {
      anpassungen.push({ bloecke: new Map(), gruende: new Map(), zusammenfassung: '' })
      continue
    }
    a.melde?.(`Die KI passt ${aufgaben.length === 1 ? 'die Aufgabe' : `${aufgaben.length} Aufgaben`} an das neue Skript an …`)
    const nummern = aufgabenNummern(liste)
    const anp = await aufgabenAnSkriptAnpassen(audio.transcript, skript.transcript, aufgaben, a.meta, a.profile, a.ai, { system: a.system, nummern })
    anpassungen.push(anp)
    // Die Meldung beschreibt die erste Liste (Blatt bzw. Fassung A); weitere Fassungen laufen gleich
    if (!zusammenfassung) zusammenfassung = wunschZusammenfassung(aenderungen, anp, aufgaben, nummern, Boolean(audio.audio?.fileName || audio.audio?.dataUrl))
  }
  if (!zusammenfassung)
    zusammenfassung = wunschZusammenfassung(aenderungen, { bloecke: new Map(), gruende: new Map(), zusammenfassung: '' }, [], new Map(), Boolean(audio.audio?.fileName))
  return { skript, anpassungen, zusammenfassung }
}
