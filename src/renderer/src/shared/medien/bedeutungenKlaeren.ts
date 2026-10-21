/**
 * „Mehrdeutige Wörter klären" (21.10.2026, Phase B der Bilder je Bedeutung – shared/medienBedeutung.ts): ein Admin-Knopf
 * in der Medienleiste, als Hintergrund-Auftrag.
 *
 *  1. Synonyme zusammenführen: Hat ein Lemma mehrere Bedeutungen derselben Wortart („pen": Füller / Kugelschreiber), sagt
 *     die KI, welche dasselbe meinen – je 20 Lemmata eine sparsame Anfrage. Gleiche gehen in einer auf (ein Bild statt zwei).
 *  2. Alte Bilder zuordnen: Bilder aus der Zeit vor den Bedeutungen, deren Wort mehrere Bedeutungen hat („bear" Bär /
 *     ertragen), sieht sich die KI an und sagt, welche Bedeutung sie zeigen – oder keine (dann kommt die Datei in die
 *     Sicherung, der Medienauftrag erzeugt ein neues).
 * Keine Namen, keine Daten der Lernenden – nur Wörter, Übersetzungen und Bilder der Medienbank.
 */
import { starteAuftrag, type AuftragsKontext } from '../auftraege'
import { WORTART_NAME, type SinnStandEintrag } from '@shared/medienBedeutung'
import { verkleinern } from './medienbank'
import { beimDienst, medienGeaendert } from './medienAuftrag'

const JE_ANFRAGE = 20

/** Lemma aus dem Schlüssel („en:bear" → „bear") */
const lemmaVon = (schluessel: string): { sprache: string; lemma: string } => {
  const i = schluessel.indexOf(':')
  return { sprache: schluessel.slice(0, i), lemma: schluessel.slice(i + 1) }
}

async function synonymeKlaeren(liste: SinnStandEintrag[], k: AuftragsKontext, zaehle: () => void): Promise<number> {
  let n = 0
  for (let i = 0; i < liste.length && !k.signal.aborted; i += JE_ANFRAGE) {
    const teil = liste.slice(i, i + JE_ANFRAGE)
    k.melde(`Synonyme prüfen (${i + 1}–${i + teil.length} von ${liste.length})`)
    const antwort = await beimDienst(k, 'ki', () =>
      k.ai<{ lemmata: { nr: number; gruppen: number[][] }[] }>({
        sparsam: true,
        system: [
          'Du prüfst Bedeutungen von Vokabeln, damit gleiche Bedeutungen EIN gemeinsames Beispielbild bekommen.',
          'Je Lemma stehen nummerierte Bedeutungen derselben Wortart. Fasse Bedeutungen zusammen, die dieselbe Sache meinen (nur anders formuliert, Synonyme, Ober- und Unterbegriff mit demselben Bild).',
          'Verschiedene Bedeutungen (z. B. „Fledermaus" und „Schläger") bleiben getrennt. gruppen: Listen von Nummern, die zusammengehören – nur Gruppen mit mindestens zwei Nummern; keine Gruppe, wenn alles verschieden ist.',
          'Antworte für JEDE Lemma-Nummer mit genau einem Eintrag.'
        ].join('\n'),
        user: teil
          .map((e, j) => {
            const { lemma } = lemmaVon(e.schluessel)
            const arten = [...new Set(e.bedeutungen.map((b) => b.wortart))]
            return arten
              .map((a) => {
                const bs = e.bedeutungen.filter((b) => b.wortart === a)
                return bs.length > 1 ? `${j + 1}. „${lemma}" (${WORTART_NAME[a]}): ${bs.map((b, m) => `${m + 1} = „${b.deutsch}"`).join('; ')}` : ''
              })
              .filter(Boolean)
              .join('\n')
          })
          .join('\n'),
        schemaName: 'vokabel_bedeutungen_gruppieren',
        schema: {
          type: 'object',
          properties: {
            lemmata: {
              type: 'array',
              items: {
                type: 'object',
                properties: { nr: { type: 'integer' }, gruppen: { type: 'array', items: { type: 'array', items: { type: 'integer' } } } },
                required: ['nr', 'gruppen'],
                additionalProperties: false
              }
            }
          },
          required: ['lemmata'],
          additionalProperties: false
        }
      })
    )
    const antworten = new Map((antwort?.lemmata ?? []).map((x) => [Number(x.nr), x.gruppen ?? []]))
    for (const [j, e] of teil.entries()) {
      // Die Nummern gelten je Wortart; in der Anfrage steht je Lemma eine Wortart mit mehreren Bedeutungen
      const art = [...new Set(e.bedeutungen.map((b) => b.wortart))].find((a) => e.bedeutungen.filter((b) => b.wortart === a).length > 1)
      const bs = e.bedeutungen.filter((b) => b.wortart === art)
      const gruppen = (antworten.get(j + 1) ?? [])
        .map((g) => g.map((m) => bs[Number(m) - 1]?.id).filter((id): id is string => Boolean(id)))
        .filter((g) => g.length > 1)
      n += await window.api.medien.sinneZusammenfuehren(e.schluessel, gruppen)
      zaehle()
    }
  }
  return n
}

async function altbilderZuordnen(liste: SinnStandEintrag[], k: AuftragsKontext, zaehle: () => void): Promise<{ zugeordnet: number; verworfen: number }> {
  const aus = { zugeordnet: 0, verworfen: 0 }
  for (const e of liste) {
    const { lemma } = lemmaVon(e.schluessel)
    for (const o of e.offen) {
      if (k.signal.aborted) return aus
      k.melde(`Altes Bild zu „${lemma}" zuordnen`)
      const kandidaten = e.bedeutungen.filter((b) => o.wortarten.includes(b.wortart))
      let id: string | null = null
      try {
        const roh = await window.api.medien.datei(o.datei)
        if (roh && kandidaten.length) {
          const bild = await verkleinern(roh, 256).catch(() => roh)
          const antwort = await beimDienst(k, 'ki', () =>
            k.ai<{ wahl: number }>({
              sparsam: true,
              system:
                'Du ordnest ein vorhandenes Beispielbild einer Vokabel der Bedeutung zu, die es zeigt. Antworte mit der Nummer der Bedeutung; 0, wenn das Bild keine davon eindeutig zeigt.',
              user: `Vokabel „${lemma}". Bedeutungen: ${kandidaten.map((b, m) => `${m + 1} = „${b.deutsch}" (${WORTART_NAME[b.wortart]})`).join('; ')}`,
              images: [bild],
              schemaName: 'vokabel_altbild_zuordnung',
              schema: { type: 'object', properties: { wahl: { type: 'integer' } }, required: ['wahl'], additionalProperties: false }
            })
          )
          const n = Math.round(Number(antwort?.wahl) || 0)
          id = n >= 1 && n <= kandidaten.length ? kandidaten[n - 1].id : null
        }
      } catch (fehler) {
        if (k.signal.aborted) throw fehler
        // Bild oder KI nicht erreichbar: dieses alte Bild bleibt offen – der nächste Lauf versucht es erneut
        zaehle()
        continue
      }
      if (await window.api.medien.altbildZuordnen(e.schluessel, o.datei, id)) {
        if (id) aus.zugeordnet++
        else aus.verworfen++
      }
      zaehle()
    }
  }
  return aus
}

/** Den Auftrag starten (Zahlen vorher aus `window.api.medien.sinnStand`) */
export function bedeutungenKlaerenStarten(): Promise<string | null> {
  return starteAuftrag<null, string>({
    moduleId: 'vokabelliste',
    docId: 'medien-bedeutungen',
    titel: 'Mehrdeutige Wörter klären',
    art: 'Medienbank',
    eingabe: null,
    sperrt: false,
    schluessel: 'medien:bedeutungen',
    fehlerTitel: 'Mehrdeutige Wörter klären: fehlgeschlagen',
    arbeit: async (_e, k) => {
      const stand = await window.api.medien.sinnStand()
      const klaeren = stand.liste.filter((e) => e.klaeren)
      const offen = stand.liste.filter((e) => e.offen.length)
      const gesamt = Math.max(1, klaeren.length + offen.reduce((n, e) => n + e.offen.length, 0))
      let fertig = 0
      const zaehle = (): void => k.melde(`${fertig++ + 1} von ${gesamt}`, fertig, gesamt)
      const zusammen = await synonymeKlaeren(klaeren, k, zaehle)
      const alt = await altbilderZuordnen(offen, k, zaehle)
      medienGeaendert(stand.liste[0]?.schluessel.split(':')[0] ?? 'en')
      return `${zusammen} gleiche Bedeutungen zusammengeführt, ${alt.zugeordnet} alte Bilder zugeordnet, ${alt.verworfen} passten zu keiner Bedeutung (in der Sicherung).`
    },
    abschluss: (r) => r,
    ablegen: async () => undefined
  })
}
