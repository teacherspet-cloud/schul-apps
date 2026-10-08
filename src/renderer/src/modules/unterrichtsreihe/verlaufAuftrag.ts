/**
 * Stundenverlauf einer Planungsreihe mit KI vorschlagen (08.10.2026, Plan „Unterrichtsreihe" E4) – als Hintergrund-
 * Auftrag wie die Planung (planungAuftrag.ts): Die Lehrkraft arbeitet weiter, der Stand steht in der Auftragsleiste.
 *
 * - Eingabe: die Stunde (Länge), ihre Schritte/Materialien als [S1], [S2] … mit Kurzbeschreibung, der Zusammenhang der
 *   Reihe (Oberthema, Lernziele, Material der Nachbarstunden) und Wünsche. Die Anfrage ist `verlaufsAnfrage` der
 *   Arbeitsblatt-App mit eigenem Rahmen (Stunde einer Reihe statt eines Blatts).
 * - Ergebnis (`planungAusKi`): Phasen mit genau passender Minutensumme, [S1] als Verknüpfung zum Schritt, Hausaufgabe
 *   im eigenen Feld. Es ERSETZT den Verlauf dieser Stunde: im offenen Editor (und gleich gespeichert), sonst in der
 *   gespeicherten Reihe am Server.
 */
import type { Reihe, Schritt, StundenPlanung } from '@shared/reihe'
import { SCHRITT_ARTEN, STUNDEN_MINUTEN } from '@shared/reihe'
import { laeuft, starteAuftrag, useAuftraege } from '../../shared/auftraege'
import { verlaufsAnfrage } from '../../shared/stundenverlauf/stundenverlauf'
import { holen, senden } from '../onlinetest/serverApi'
import { planungAusKi, schrittKennung, verlaufVon } from './reihePlanung'

type Ablage = (stunde: number, p: StundenPlanung) => void
type Speichern = () => Promise<unknown>
const horcher = new Map<string, { fn: Ablage; speichern?: Speichern }>()

/** Der offene Editor meldet sich für seine Reihe an (Rückgabe: abmelden) */
export function horcheVerlauf(reiheId: string, fn: Ablage, speichern?: Speichern): () => void {
  const eintrag = { fn, speichern }
  horcher.set(reiheId, eintrag)
  return () => {
    if (horcher.get(reiheId) === eintrag) horcher.delete(reiheId)
  }
}

export const verlaufSchluessel = (reiheId: string, stunde: number): string => `reihe-verlauf:${reiheId}:${stunde}`

/** Läuft (oder wartet) für diese Stunde gerade ein Vorschlag? */
export const useVerlaufEntsteht = (reiheId: string | undefined, stunde: number): boolean =>
  useAuftraege((st) => Boolean(reiheId) && st.auftraege.some((a) => a.schluessel === verlaufSchluessel(reiheId!, stunde) && laeuft(a)))

const artLabel = (s: Schritt): string => SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)?.label ?? s.inhalt.art

/** Kurzbeschreibung eines Schritts für die Anfrage */
export function schrittKurz(s: Schritt): string {
  const i = s.inhalt
  const teile = [`${s.titel.trim() || artLabel(s)} (${artLabel(s)}${s.minuten ? `, ${s.minuten} min` : ''}${s.rolle !== 'pflicht' ? `, ${s.rolle}` : ''})`]
  if (s.platzhalter?.beschreibung) teile.push(`noch zu erstellen: ${s.platzhalter.beschreibung.slice(0, 300)}`)
  else if (i.art === 'arbeitsblatt' && i.aufgaben.length) teile.push(`Aufgaben: ${i.aufgaben.map((a) => `${a.nr}. ${a.anweisung}`.slice(0, 120)).join(' | ')}`)
  else if ((i.art === 'aufgabe' || i.art === 'abschluss' || i.art === 'sprechen' || i.art === 'praesenz') && i.anweisung) teile.push(i.anweisung.slice(0, 300))
  else if (i.art === 'hefter' && i.text) teile.push(i.text.slice(0, 200))
  else if (i.art === 'reflexion') teile.push(i.frage)
  return teile.join(': ')
}

/** Die Anfrage für Stunde `i` (ohne Netz – auch für Tests) */
export function verlaufAnfrageFuer(r: Reihe, i: number, wunsch = ''): ReturnType<typeof verlaufsAnfrage> {
  const art = r.stunden?.[i] ?? 'einzel'
  const dauer = STUNDEN_MINUTEN[art]
  const schritte = r.schritte.filter((s) => s.stunde === i)
  const nachbar = (k: number): string => {
    const x = r.schritte.filter((s) => s.stunde === k).map((s) => s.titel.trim()).filter(Boolean)
    const p = verlaufVon(r, k).phasen.map((ph) => ph.phase).filter(Boolean)
    return x.length ? x.join(', ') : p.length ? `Phasen: ${p.join(', ')}` : '(noch nicht geplant)'
  }
  const zusammenhang = [
    `REIHE: ${r.titel || r.oberthema} (${r.fachLabel}, Klasse ${r.grade})`,
    r.oberthema ? `OBERTHEMA: ${r.oberthema}` : '',
    r.lernziele.length ? `LERNZIELE DER REIHE:\n${r.lernziele.map((l) => `- ${l.text}`).join('\n')}` : '',
    `STUNDE ${i + 1} von ${r.stunden?.length ?? 1} (${art === 'doppel' ? 'Doppelstunde' : 'Einzelstunde'}, ${dauer} min)`,
    i > 0 ? `VORIGE STUNDE: ${nachbar(i - 1)}` : 'Dies ist die erste Stunde der Reihe.',
    i < (r.stunden?.length ?? 0) - 1 ? `NÄCHSTE STUNDE: ${nachbar(i + 1)}` : 'Dies ist die letzte Stunde der Reihe.'
  ]
    .filter(Boolean)
    .join('\n')
  const material = schritte.length
    ? `${zusammenhang}\nMATERIAL UND SCHRITTE DIESER STUNDE:\n${schritte.map((s, k) => `${schrittKennung(k)} ${schrittKurz(s)}`).join('\n')}`
    : `${zusammenhang}\nFür diese Stunde gibt es noch kein Material – plane sie aus dem Zusammenhang der Reihe (Medien: Tafel, Buch, Folie …).`
  return verlaufsAnfrage(
    `Du planst als erfahrene Lehrkraft Unterricht im Fach ${r.fachLabel}, Klasse ${r.grade}, Schulform ${r.schoolTypeId}, Bundesland ${r.stateId}. Antworte auf Deutsch.`,
    material,
    dauer,
    wunsch,
    {
      subjectId: r.fachId,
      subjectLabel: r.fachLabel,
      grade: r.grade,
      topic: r.oberthema || r.titel,
      ...(r.lernziele.length ? { learningGoals: r.lernziele.map((l) => l.text).join('; ') } : {})
    },
    {
      einleitung: `Plane den Verlauf der ${i + 1}. Stunde (${dauer} Minuten) einer Unterrichtsreihe. Sie knüpft an die vorige Stunde an und bereitet die nächste vor.`,
      materialRegel: schritte.length
        ? '- Jedes genannte Material bzw. jeder Schritt kommt in einer Phase vor; nenne ihn in "medien" mit seiner Kennung in eckigen Klammern (z. B. [S1]). Eine Hausaufgabe steht als eigene Phase „Hausaufgabe“ (0 bis 5 Minuten zum Erteilen).'
        : '- Nenne in "medien" konkrete Medien (Tafel, Buch, Folie, Arbeitsauftrag). Eine Hausaufgabe steht als eigene Phase „Hausaufgabe“ (0 bis 5 Minuten zum Erteilen).'
    }
  )
}

/*
 * Nacheinander je Reihe: Werden mehrere Stunden kurz hintereinander fertig, lädt sonst jede die gespeicherte Reihe,
 * ergänzt ihren Verlauf und speichert – und die letzte überschreibt die anderen.
 */
const kette = new Map<string, Promise<unknown>>()
function nacheinander(reiheId: string, arbeit: () => Promise<void>): Promise<void> {
  const lauf = (kette.get(reiheId) ?? Promise.resolve()).catch(() => undefined).then(arbeit)
  const ende = lauf.catch(() => undefined)
  kette.set(reiheId, ende)
  return lauf
}

/** Verlauf ablegen: im offenen Editor (gleich gespeichert), sonst in der gespeicherten Reihe */
function legeVerlaufAb(reiheId: string, stunde: number, p: StundenPlanung): Promise<void> {
  return nacheinander(reiheId, async () => {
    const offen = horcher.get(reiheId)
    if (offen) {
      offen.fn(stunde, p)
      await offen.speichern?.()
      return
    }
    const { reihe } = await holen<{ reihe: Reihe }>(`/server/reihen/${reiheId}`)
    await senden('/server/reihen/speichern', { reihe: { ...reihe, verlauf: { ...(reihe.verlauf ?? {}), [String(stunde)]: p } } })
  })
}

/** Vorschlag für Stunde `i` anstoßen – die Reihe muss gespeichert sein */
export function starteVerlaufVorschlag(r: Reihe, i: number, wunsch = ''): void {
  if (!r.id) throw new Error('Bitte die Reihe zuerst speichern.')
  const reiheId = r.id
  const schritte = r.schritte.filter((s) => s.stunde === i).map((s) => ({ id: s.id, titel: s.titel }))
  const laenge = STUNDEN_MINUTEN[r.stunden?.[i] ?? 'einzel']
  void starteAuftrag({
    moduleId: 'unterrichtsreihe',
    docId: reiheId,
    titel: `${r.titel || 'Unterrichtsreihe'} – Stunde ${i + 1}`,
    art: 'Stundenverlauf für die Reihe',
    eingabe: { anfrage: verlaufAnfrageFuer(r, i, wunsch), schritte, laenge },
    sperrt: false,
    schluessel: verlaufSchluessel(reiheId, i),
    istOffen: () => horcher.has(reiheId),
    fehlerTitel: 'Kein Stundenverlauf',
    arbeit: async (e, k) => {
      k.melde(`Die KI plant Stunde ${i + 1} …`)
      return planungAusKi(await k.ai<unknown>(e.anfrage), e.laenge, e.schritte)
    },
    ablegen: async (p) => legeVerlaufAb(reiheId, i, p),
    abschluss: (p) => `${p.phasen.length} Phasen für Stunde ${i + 1}`
  })
}
