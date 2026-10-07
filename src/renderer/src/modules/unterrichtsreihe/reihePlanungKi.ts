/**
 * Unterrichtsreihe mit KI planen (05.10.2026, Wunsch der Lehrkraft): „von der KI und den vorhandenen
 * Materialien in Verbindung mit den Landesvorgaben für das Fach und die Schulform sowie den gewählten
 * Lernzielen eine realistische Unterrichtsreihe mit sinnvollen Teilen und Schritten erstellen … auch
 * Platzhalter für Arbeitsmaterialien und Schritte, die dann jeweils gesondert über einen Button
 * automatisiert von der KI zielführend erstellt werden."
 *
 * Abgestimmt (05.10.2026):
 *  - Umfang: Die Lehrkraft legt Einzel- und Doppelstunden an (`Reihe.stunden`), auch für dreistündige
 *    Fächer; die KI verteilt die Schritte realistisch auf genau diese Stunden.
 *  - Vorhandenes Material: Die KI sieht Titel, Thema, Jahrgang, Lernziele und Aufgaben der eigenen
 *    Arbeitsblätter des Fachs, wägt die didaktische Eignung ab und WO es in der Reihe hingehört –
 *    ungeeignetes bleibt draußen. Die Begründung steht am Schritt.
 *  - Platzhalter: Arbeitsblätter entstehen per Knopf im Hintergrund (volle Arbeitsblatt-Erzeugung),
 *    werden gespeichert und verknüpft; andere Schrittarten erzeugt die KI direkt (`erzeugeSchrittInhalt`).
 */
import type { StructuredRequest } from '@shared/types'
import {
  leererInhalt,
  neueSchrittId,
  standardErfolg,
  STUNDEN_MINUTEN,
  type Lernziel,
  type Reihe,
  type Schritt,
  type SchrittArt,
  type SchrittInhalt
} from '@shared/reihe'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { describeBlock } from '../arbeitsblatt/generation/describe'
import { blattAlsSchritt, blattAlsSchrittGemessen } from './schrittAusBlatt'

type Ki = <T>(req: StructuredRequest) => Promise<T>

/** Schrittarten, die die KI planen und als Platzhalter selbst füllen kann */
export const KI_ARTEN: SchrittArt[] = ['arbeitsblatt', 'aufgabe', 'lernkarten', 'diagnose', 'reflexion', 'hefter', 'abschluss', 'sprechen', 'praesenz']

export interface MaterialKandidat {
  id: string
  titel: string
  thema: string
  jahrgang: number
  /** Lernziele und Aufgaben in Kurzform – Grundlage der Abwägung */
  details: string
  ws: Worksheet
  name: string
}

/** Eigene Arbeitsblätter des Fachs, nah am Jahrgang (höchstens `max`, die neuesten zuerst) */
export async function materialKandidaten(r: Pick<Reihe, 'fachId' | 'grade'>, max = 20): Promise<MaterialKandidat[]> {
  const liste = (await window.api.sheets.list())
    .filter((m) => m.subjectId === r.fachId && Math.abs((m.grade || r.grade) - r.grade) <= 1)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, max)
  const aus: MaterialKandidat[] = []
  for (const m of liste) {
    try {
      const w = await window.api.sheets.get(m.id)
      const ws = w.payload as Worksheet
      const bloecke = ws.sheets[0]?.blocks ?? []
      const ziele = [ws.meta.learningGoals, ...bloecke.filter((b) => b.type === 'learningGoals').flatMap((b) => (b as { goals?: string[] }).goals ?? [])]
        .map((z) => String(z ?? '').trim())
        .filter(Boolean)
      const aufgaben = bloecke
        .filter((b) => b.type === 'task' || b.type === 'text')
        .slice(0, 10)
        .map((b) => describeBlock(b).replace(/\s+/g, ' ').slice(0, 180))
      aus.push({
        id: m.id,
        name: m.name,
        titel: ws.meta.title || m.name,
        thema: ws.meta.topic || m.topic,
        jahrgang: ws.meta.grade || m.grade,
        details: [ziele.length ? `Lernziele: ${ziele.join('; ').slice(0, 500)}` : '', aufgaben.length ? `Bausteine: ${aufgaben.join(' | ')}` : '']
          .filter(Boolean)
          .join('\n'),
        ws
      })
    } catch {
      /* nicht lesbar – dann eben ohne */
    }
  }
  return aus
}

const ARTEN_TEXT: Record<string, string> = {
  arbeitsblatt: 'Arbeitsblatt (Erarbeitung/Übung mit Aufgaben, KI-Feedback je Aufgabe)',
  aufgabe: 'Zwischenaufgabe (kurzer Auftrag mit Antwortfeld/Foto, auch zu einem Text/Video mit Kontrollfragen)',
  lernkarten: 'Lernkarten (Begriffe wiederholen)',
  diagnose: 'Eingangsdiagnose (kurzer Vortest am Anfang eines Teils)',
  reflexion: 'Selbsteinschätzung (Ich-kann-Ampel + Lerntagebuchfrage, am Ende eines Teils)',
  hefter: 'Wissensspeicher (Merkkasten/Sicherung)',
  abschluss: 'Abschlussprodukt (Plakat, Text, Video … mit Bewertungsraster, am Ende der Reihe)',
  sprechen: 'Sprechaufgabe (Sprachaufnahme)',
  praesenz: 'Im Unterricht (Experiment, Gruppenarbeit, Vortrag – Lehrkraft hakt ab)'
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    teile: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          schritte: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titel: { type: 'string' },
                art: { type: 'string', enum: KI_ARTEN },
                rolle: { type: 'string', enum: ['pflicht', 'optional', 'foerder', 'forder'] },
                stunde: { type: 'integer' },
                minuten: { type: 'integer' },
                beschreibung: { type: 'string' },
                lernziele: { type: 'array', items: { type: 'integer' } },
                material: { type: 'string' },
                begruendung: { type: 'string' }
              },
              required: ['titel', 'art', 'rolle', 'stunde', 'minuten', 'beschreibung', 'lernziele', 'material', 'begruendung'],
              additionalProperties: false
            }
          }
        },
        required: ['name', 'schritte'],
        additionalProperties: false
      }
    },
    hinweis: { type: 'string' }
  },
  required: ['teile', 'hinweis'],
  additionalProperties: false
}

interface PlanRoh {
  teile: {
    name: string
    schritte: {
      titel: string
      art: string
      rolle: string
      stunde: number
      minuten: number
      beschreibung: string
      lernziele: number[]
      material: string
      begruendung: string
    }[]
  }[]
  hinweis: string
}

export interface ReihenPlan {
  teile: string[]
  schritte: Schritt[]
  hinweis: string
  /** Wie viele vorhandene Materialien eingeplant wurden */
  materialEingesetzt: number
}

/** Stundenraster als Text: „1. Einzelstunde (45 min), 2. Doppelstunde (90 min) …" */
export const stundenText = (stunden: Reihe['stunden'] = []): string =>
  stunden.map((a, i) => `${i + 1}. ${a === 'doppel' ? 'Doppelstunde' : 'Einzelstunde'} (${STUNDEN_MINUTEN[a]} min)`).join(', ')

/** Die KI plant Teile und Schritte der Reihe – vorhandenes Material eingesetzt, Rest als Platzhalter */
export async function planeReihe(
  r: Reihe,
  kc: { auszug: string[]; quelle: string },
  materialien: MaterialKandidat[],
  ki: Ki,
  wunsch = '',
  /** Schulbuchseiten als Grundlage (Phase 6b): Text aus `schulbuchText` – verweisen/übernehmen */
  schulbuch = ''
): Promise<ReihenPlan> {
  const stunden = r.stunden ?? []
  const d = await ki<PlanRoh>({
    system: `Du planst als erfahrene Lehrkraft eine realistische Unterrichtsreihe (${r.fachLabel}, Klasse ${r.grade}, Schulform ${r.schoolTypeId}, Bundesland ${r.stateId}), die die Lernenden Schritt für Schritt in einem digitalen Lernpfad bearbeiten.`,
    user: [
      `OBERTHEMA: ${r.oberthema || r.titel}`,
      r.titel ? `TITEL DER REIHE: ${r.titel}` : '',
      kc.auszug.length
        ? `VORGABEN DES KERNCURRICULUMS (${kc.quelle}):\n${kc.auszug.map((a) => `- ${a}`).join('\n')}`
        : 'Kein Auszug vorhanden – richte dich nach dem üblichen Kerncurriculum dieses Landes, Fachs und Jahrgangs.',
      r.lernziele.length
        ? `LERNZIELE DER REIHE (Nummern für "lernziele"):\n${r.lernziele.map((l, i) => `${i}: ${l.text}`).join('\n')}`
        : 'Noch keine Lernziele – leite sie aus dem Kerncurriculum ab; "lernziele" bleibt dann leer.',
      `STUNDEN (nummeriert ab 1): ${stundenText(stunden)}`,
      materialien.length
        ? `VORHANDENE MATERIALIEN DER LEHRKRAFT (Kennung in "material" eintragen, wenn eingesetzt):\n${materialien
            .map((m) => `[${m.id}] „${m.titel}" – Thema: ${m.thema}, Jahrgang ${m.jahrgang}\n${m.details}`)
            .join('\n\n')}`
        : 'Keine vorhandenen Materialien.',
      wunsch.trim() ? `WÜNSCHE DER LEHRKRAFT: ${wunsch.trim()}` : '',
      schulbuch.trim()
        ? `${schulbuch.trim()}\nIn der Planung: Schritte zu diesen Buchabschnitten verweisen in ihrer "beschreibung" ausdrücklich auf sie (z. B. „Lies VT1 auf S. 39 …"); übernommene Texte werden dort Material.`
        : '',
      'SCHRITTARTEN:',
      ...KI_ARTEN.map((a) => `- ${a}: ${ARTEN_TEXT[a]}`),
      'REGELN:',
      '- Gliedere in 2 bis 5 sinnvolle Teile (z. B. Einstieg/Grundlagen, Erarbeitung, Vertiefung/Anwendung, Sicherung/Abschluss) mit kurzen Namen.',
      '- Verteile die Schritte auf GENAU die angegebenen Stunden ("stunde" = Nummer ab 1). "minuten" ist die realistische Bearbeitungszeit; die Summe je Stunde passt in deren Länge (Einstieg, Besprechung und Sicherung im Plenum mitbedenken – etwa ein Viertel der Zeit).',
      '- Fortschreitend vom Einfachen zum Komplexen; jeder Schritt baut auf den vorigen auf; Anforderungsbereiche I bis III kommen vor.',
      '- Wechsel der Sozial- und Arbeitsformen (Stillarbeit im Lernpfad UND "praesenz" für Gespräch, Gruppenarbeit, Experiment).',
      '- Höchstens eine Eingangsdiagnose am Anfang; Selbsteinschätzung am Ende eines Teils; ein Abschlussprodukt oder eine Sicherung am Ende der Reihe.',
      '- Je Teil höchstens ein Förderschritt ("foerder") und höchstens ein freiwilliger Forderschritt ("forder"); Vertiefungen und Differenzierung, die nicht alle brauchen, als "optional" (blockiert den Weg nie); alles andere "pflicht".',
      '- VORHANDENES MATERIAL: nur einsetzen, wenn es didaktisch und pädagogisch passt (Jahrgang, Niveau, Lernziele, Anforderung) – an der Stelle der Reihe, an die es inhaltlich gehört. Dann art "arbeitsblatt", "material" = Kennung, "begruendung" = warum es passt und warum an dieser Stelle (ein Satz). Ungeeignetes weglassen. Jedes Material höchstens einmal.',
      '- Alle anderen Schritte sind PLATZHALTER: "material" leer; "beschreibung" sagt so genau, dass daraus später allein Material entstehen kann: Gegenstand, Ziel, Aufgabenformate/Operatoren, Anforderung, ggf. Materialart (Quelle, Grafik, Text …). "begruendung": didaktische Funktion an dieser Stelle (ein Satz).',
      '- Titel kurz und für Lernende verständlich (keine Nummern).',
      '- "hinweis": zwei bis drei Sätze für die Lehrkraft zur Planung (z. B. was im Plenum geschehen sollte, welche Materialien fehlen).'
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'reihe_planung',
    schema: PLAN_SCHEMA
  })
  const plan = planUebernehmen(d, r, materialien)
  // Eingesetzte Materialien mit gemessenen Seiten (wie im Editor) – nicht der ungeprüfte Druckweg
  for (const s of plan.schritte) {
    const i = s.inhalt
    if (i.art !== 'arbeitsblatt' || !i.quelle) continue
    const m = materialien.find((k) => k.id === i.quelle)
    if (!m) continue
    const b = await blattAlsSchrittGemessen(m.id, m.ws, m.name).catch(() => null)
    if (b) s.inhalt = { ...i, ...b.inhalt }
  }
  return plan
}

/** KI-Plan in Schritte der Reihe übersetzen (geprüft: Stunden, Lernziele, Material, Arten) */
export function planUebernehmen(d: PlanRoh, r: Pick<Reihe, 'lernziele' | 'stunden'>, materialien: Pick<MaterialKandidat, 'id' | 'ws' | 'name'>[]): ReihenPlan {
  const n = Math.max(1, r.stunden?.length ?? 1)
  const benutzt = new Set<string>()
  const teile: string[] = []
  const schritte: Schritt[] = []
  for (const t of d?.teile ?? []) {
    let name = String(t.name ?? '').trim() || `Teil ${teile.length + 1}`
    while (teile.includes(name)) name = `${name} (2)`
    teile.push(name)
    for (const x of t.schritte ?? []) {
      const art = (KI_ARTEN as string[]).includes(x.art) ? (x.art as SchrittArt) : 'aufgabe'
      const lernziele: Lernziel[] = [...new Set(x.lernziele ?? [])].map((i) => r.lernziele[i]).filter((l): l is Lernziel => Boolean(l))
      const stunde = Math.min(n - 1, Math.max(0, Math.round(Number(x.stunde) || 1) - 1))
      const rolle: Schritt['rolle'] = x.rolle === 'foerder' || x.rolle === 'forder' || x.rolle === 'optional' ? x.rolle : 'pflicht'
      const titel = String(x.titel ?? '').trim() || 'Schritt'
      const m = art === 'arbeitsblatt' && x.material && !benutzt.has(x.material) ? materialien.find((k) => k.id === x.material.trim()) : undefined
      const basis: Schritt = {
        id: neueSchrittId(),
        titel,
        lernziele,
        rolle,
        erfolg: standardErfolg(art),
        inhalt: leererInhalt(art),
        abschnitt: name,
        stunde,
        ...(Number(x.minuten) > 0 ? { minuten: Math.round(Number(x.minuten)) } : {})
      }
      if (m) {
        try {
          const b = blattAlsSchritt(m.id, m.ws, m.name)
          benutzt.add(m.id)
          schritte.push({
            ...basis,
            lernziele: lernziele.length ? lernziele : b.lernziele,
            inhalt: { ...(basis.inhalt as Extract<SchrittInhalt, { art: 'arbeitsblatt' }>), ...b.inhalt },
            begruendung: String(x.begruendung ?? '').trim() || undefined
          })
          continue
        } catch {
          /* leeres Blatt – dann Platzhalter */
        }
      }
      schritte.push({
        ...basis,
        platzhalter: { beschreibung: String(x.beschreibung ?? '').trim() || titel, begruendung: String(x.begruendung ?? '').trim() || undefined }
      })
    }
  }
  return { teile, schritte, hinweis: String(d?.hinweis ?? '').trim(), materialEingesetzt: benutzt.size }
}

// ---------------------------------------------------------------- Platzhalter füllen (außer Arbeitsblatt)

const s = (t: unknown): string => String(t ?? '').trim()

const SCHEMATA: Partial<Record<SchrittArt, { schema: Record<string, unknown>; regel: string }>> = {
  aufgabe: {
    regel:
      'Ein kurzer Auftrag (Operator) mit Material (Text bis 250 Wörter ODER leer) und 0 bis 4 Kontrollfragen; "erwartung": was eine gute Antwort enthält; "musterloesung": knappe Lösung; "antwort": text, foto oder beides.',
    schema: {
      type: 'object',
      properties: {
        anweisung: { type: 'string' },
        material: { type: 'string' },
        fragen: { type: 'array', items: { type: 'string' } },
        antwort: { type: 'string', enum: ['text', 'foto', 'beides'] },
        erwartung: { type: 'string' },
        musterloesung: { type: 'string' }
      },
      required: ['anweisung', 'material', 'fragen', 'antwort', 'erwartung', 'musterloesung'],
      additionalProperties: false
    }
  },
  lernkarten: {
    regel: '8 bis 15 Lernkarten: "vorne" Begriff oder Frage, "hinten" knappe, fachlich richtige Erklärung (höchstens 25 Wörter).',
    schema: {
      type: 'object',
      properties: {
        karten: {
          type: 'array',
          items: {
            type: 'object',
            properties: { vorne: { type: 'string' }, hinten: { type: 'string' } },
            required: ['vorne', 'hinten'],
            additionalProperties: false
          }
        }
      },
      required: ['karten'],
      additionalProperties: false
    }
  },
  diagnose: {
    regel:
      '5 bis 8 kurze Diagnosefragen zum Vorwissen; meist Auswahl mit 3 bis 4 Optionen ("richtig" = Wortlaut der richtigen Option), höchstens zwei offene Kurzantworten ("optionen" leer, "richtig" = erwartetes Wort, Varianten mit „/" getrennt).',
    schema: {
      type: 'object',
      properties: {
        fragen: {
          type: 'array',
          items: {
            type: 'object',
            properties: { frage: { type: 'string' }, optionen: { type: 'array', items: { type: 'string' } }, richtig: { type: 'string' } },
            required: ['frage', 'optionen', 'richtig'],
            additionalProperties: false
          }
        }
      },
      required: ['fragen'],
      additionalProperties: false
    }
  },
  reflexion: {
    regel: 'Eine offene Frage fürs Lerntagebuch, die zum Nachdenken über das eigene Lernen in diesem Teil anregt (ein Satz).',
    schema: { type: 'object', properties: { frage: { type: 'string' } }, required: ['frage'], additionalProperties: false }
  },
  hefter: {
    regel: 'Merkkasten/Sicherung: das Wichtigste dieses Abschnitts, fachlich richtig, 40 bis 120 Wörter, gern als kurze Stichpunkte (Zeilen mit „- ").',
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }
  },
  abschluss: {
    regel: 'Auftrag für ein Lernprodukt (Plakat, Erklärvideo, Text …) mit Umfang und Abgabeform; "raster": 4 bis 6 Bewertungskriterien, je ein kurzer Satz.',
    schema: {
      type: 'object',
      properties: { anweisung: { type: 'string' }, raster: { type: 'array', items: { type: 'string' } } },
      required: ['anweisung', 'raster'],
      additionalProperties: false
    }
  },
  sprechen: {
    regel: 'Sprechauftrag mit Situation und Inhaltspunkten; "minuten": Sprechzeit 1 bis 4.',
    schema: {
      type: 'object',
      properties: { anweisung: { type: 'string' }, minuten: { type: 'integer' } },
      required: ['anweisung', 'minuten'],
      additionalProperties: false
    }
  },
  praesenz: {
    regel: 'Auftrag für die Arbeit im Unterricht (Gespräch, Gruppenarbeit, Experiment, Vortrag) mit Ablauf in 2 bis 4 Schritten.',
    schema: { type: 'object', properties: { anweisung: { type: 'string' } }, required: ['anweisung'], additionalProperties: false }
  }
}

/** Kann die KI diese Art direkt (ohne Hintergrund-Auftrag) füllen? */
export const direktErzeugbar = (art: SchrittArt): boolean => Boolean(SCHEMATA[art])

/** Was vor diesem Schritt in der Reihe liegt – damit der Inhalt anschließt */
const davor = (r: Reihe, schritt: Schritt): string =>
  r.schritte
    .slice(
      0,
      r.schritte.findIndex((x) => x.id === schritt.id)
    )
    .map((x) => x.titel)
    .filter(Boolean)
    .slice(-8)
    .join('; ')

/** Inhalt eines Platzhalters (außer Arbeitsblatt) von der KI */
export async function erzeugeSchrittInhalt(r: Reihe, schritt: Schritt, ki: Ki): Promise<SchrittInhalt> {
  const art = schritt.inhalt.art
  const vorgabe = SCHEMATA[art]
  if (!vorgabe) throw new Error('Diese Schrittart erzeugt die KI nicht direkt.')
  const d = await ki<Record<string, unknown>>({
    system: `Du erstellst einen Schritt eines digitalen Lernpfads (${r.fachLabel}, Klasse ${r.grade}, Schulform ${r.schoolTypeId}, Bundesland ${r.stateId}). Die Lernenden bearbeiten ihn selbstständig; sprich sie mit „du" an. Fachlich korrekt, altersgerecht, ohne Personennamen realer Personen aus dem Umfeld der Schule.`,
    user: [
      `REIHE: ${r.titel} (Oberthema: ${r.oberthema})`,
      `SCHRITT: ${schritt.titel} – ${ARTEN_TEXT[art] ?? art}`,
      schritt.platzhalter?.beschreibung ? `WAS ENTSTEHEN SOLL: ${schritt.platzhalter.beschreibung}` : '',
      schritt.lernziele.length ? `LERNZIELE: ${schritt.lernziele.map((l) => l.text).join('; ')}` : '',
      davor(r, schritt) ? `DAVOR IN DER REIHE: ${davor(r, schritt)}` : '',
      // Reihe aus Schulbuchseiten (06.10.2026): verweisen; Übernommenes steht schon im Material
      schritt.platzhalter?.buch
        ? `${schritt.platzhalter.buch}\nWörtlich übernommene Abschnitte und Bildausschnitte setzt die App selbst mit Quelle ins Material – NICHT noch einmal abschreiben; Verweise genau so in die Anweisung.`
        : '',
      `REGEL: ${vorgabe.regel}`
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: `reihe_schritt_${art}`,
    schema: vorgabe.schema
  })
  const leer = leererInhalt(art)
  switch (leer.art) {
    case 'aufgabe': {
      // Übernommene Buchabschnitte (nur auf ausdrücklichen Wunsch) mit Quellenangabe ins Material
      const ueb = schritt.platzhalter?.uebernahme ?? []
      const texte = ueb.filter((u) => u.text).map((u) => `${u.kennung}\n${u.text}\n(Quelle: ${u.quelle})`)
      const bilder = ueb.filter((u) => u.bild).map((u) => ({ src: u.bild!, quelle: u.quelle }))
      return {
        ...leer,
        anweisung: s(d.anweisung),
        material: [s(d.material), ...texte].filter(Boolean).join('\n\n'),
        ...(bilder.length ? { bilder } : {}),
        fragen: ((d.fragen as unknown[]) ?? []).map(s).filter(Boolean).slice(0, 6),
        antwort: d.antwort === 'foto' || d.antwort === 'beides' ? d.antwort : 'text',
        erwartung: s(d.erwartung),
        musterloesung: s(d.musterloesung) || undefined
      }
    }
    case 'lernkarten':
      return {
        ...leer,
        karten: ((d.karten as { vorne?: unknown; hinten?: unknown }[]) ?? [])
          .map((k) => ({ vorne: s(k.vorne), hinten: s(k.hinten) }))
          .filter((k) => k.vorne && k.hinten)
          .slice(0, 30)
      }
    case 'diagnose':
      return {
        ...leer,
        fragen: ((d.fragen as { frage?: unknown; optionen?: unknown[]; richtig?: unknown }[]) ?? [])
          .map((f) => ({ frage: s(f.frage), optionen: (f.optionen ?? []).map(s).filter(Boolean).slice(0, 6), richtig: s(f.richtig) }))
          .filter((f) => f.frage && f.richtig)
          .slice(0, 12)
      }
    case 'reflexion':
      return { ...leer, frage: s(d.frage) || leer.frage }
    case 'hefter':
      return { ...leer, text: s(d.text) }
    case 'abschluss':
      return { ...leer, anweisung: s(d.anweisung), raster: ((d.raster as unknown[]) ?? []).map(s).filter(Boolean).slice(0, 8) }
    case 'sprechen':
      return { ...leer, anweisung: s(d.anweisung), minuten: Math.min(6, Math.max(1, Math.round(Number(d.minuten) || 2))) }
    case 'praesenz':
      return { ...leer, anweisung: s(d.anweisung) }
    default:
      return leer
  }
}
