/**
 * Rückmeldungen erzeugen (Großprogramm 0.4, F3): ein Hintergrund-Auftrag für alle Abgaben ohne
 * Bogen. Fotos und Scans werden zuerst übertragen (erkannte Namen durch das Kürzel ersetzt),
 * dann entsteht je Abgabe ein Bogen – nacheinander, damit der Fortschritt stimmt und ein
 * Fehler nur eine Abgabe betrifft.
 */
import { starteAuftrag } from '../../shared/auftraege'
import { subjectById } from '../arbeitsblatt/model/subjects'
import {
  aufgabeAnfrage,
  aufgabeAus,
  ENTWURF_VERMERK,
  erwartungAus,
  erwartungAusDateiAnfrage,
  erwartungsEntwurfAnfrage,
  teileAnfrage,
  type GeleseneDatei
} from './aufgabeAusMaterial'
import { fremdsprachlich, teileAusKi } from './teilbewertung'
import { bogenAnfrage, bogenAus, ohneNamen, transkriptAnfrage, transkriptUebernehmen, type BogenKontext } from './generation'
import type { Abgabe, Bewertungstabelle, Rueckmeldung } from './model/types'
import { bibliothek } from './store'
import { useAppSettings } from '../../shared/settingsStore'
import { thresholdsForSubject } from '../../shared/gradeScale'
import { zeichenFuer } from '../../shared/korrekturzeichen'
import { spracheNach } from '../../shared/familiensprachen'
import { obj, str } from '../../shared/aiSchema'
import type { StructuredRequest } from '@shared/types'
import { einstufungVon } from './art'
import { tabelleAus, tabelleAusDateiAnfrage, tabelleEntwurfAnfrage } from './tabelle'

/** Lerngruppe und Haltung für jede Anfrage */
export function rueckmeldungSystem(r: Rueckmeldung): string {
  return [
    `Du bist eine erfahrene Lehrkraft für ${r.meta.subjectLabel} (Klasse ${r.meta.grade}, ${r.meta.schoolTypeName}) und schreibst lernförderliche Rückmeldungen zu Schülerarbeiten.`,
    'Grundlage ist das Modell von Hattie und Timperley: Wo steht die Arbeit (Feed Back), was ist das Ziel (Feed Up), was ist der nächste Schritt (Feed Forward).',
    einstufungVon(r.meta) === 'keine'
      ? 'Du schreibst auf Deutsch, in der Sprache der Lerngruppe, konkret und ermutigend – ohne Noten, ohne Punkte.'
      : 'Du schreibst auf Deutsch, in der Sprache der Lerngruppe, konkret und ermutigend. Die Note vergibt die Lehrkraft; du lieferst nur einen begründeten Vorschlag in den dafür vorgesehenen Feldern.'
  ].join('\n')
}

/** Korrekturzeichen und Notenschlüssel aus den Einstellungen der Lehrkraft */
export function bogenKontext(r: Rueckmeldung): BogenKontext {
  const settings = useAppSettings.getState().settings
  return { zeichen: zeichenFuer(r.meta.subjectId, settings), schwellen: thresholdsForSubject(settings.gradeScale, r.meta.subjectId) }
}

export function rueckmeldungenErzeugen(r: Rueckmeldung, docId: string): void {
  const offen = r.abgaben.filter((a) => !a.bogen && (a.text.trim() || a.bilder.length))
  const ctx = bogenKontext(r)
  if (!offen.length) return
  void starteAuftrag({
    moduleId: 'rueckmeldung',
    docId,
    titel: r.meta.title || r.grundlage.titel || 'Rückmeldung',
    art: offen.length === 1 ? 'Rückmeldung schreiben' : `${offen.length} Rückmeldungen schreiben`,
    eingabe: r,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `rueckmeldung-${docId}`,
    fehlerTitel: 'Die Rückmeldungen konnten nicht erstellt werden',
    arbeit: async (rm, k) => {
      const fertig = new Map<string, Abgabe>()
      const fehler: string[] = []
      for (const [i, roh] of offen.entries()) {
        k.melde(`${roh.kuerzel}: ${roh.text.trim() ? 'Rückmeldung wird geschrieben' : 'Text wird übertragen'} (${i + 1} von ${offen.length}) …`)
        try {
          let a = roh
          if (!a.text.trim() && a.bilder.length) a = transkriptUebernehmen(a, await k.ai<unknown>(transkriptAnfrage(a)))
          // Namen verlassen den Rechner nicht: an die KI geht der bereinigte Text
          const { text, pseudonyme } = ohneNamen(a)
          const anonym = { ...a, text }
          const bogen = bogenAus(await k.ai<unknown>(bogenAnfrage(rm, anonym, rueckmeldungSystem(rm), ctx)), rm, anonym, ctx)
          fertig.set(a.id, { ...a, pseudonyme, bogen })
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') throw e
          fehler.push(`${roh.kuerzel}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      if (!fertig.size) throw new Error(fehler.join(' · ') || 'Keine Rückmeldung entstanden.')
      return { fertig, fehler }
    },
    abschluss: ({ fertig, fehler }) =>
      `${fertig.size} Rückmeldung${fertig.size === 1 ? '' : 'en'} fertig${fehler.length ? ` – nicht gelungen: ${fehler.join(' · ')}` : ''}`,
    ablegen: ({ fertig }, rm) => bibliothek.legeAb(docId, rm, (aktuell) => ({ ...aktuell, abgaben: aktuell.abgaben.map((a) => fertig.get(a.id) ?? a) }), 1)
  })
}

/**
 * „Eigene Aufgabe" aus hineingezogenen Dateien (29.09.2026): Aufgabe wörtlich samt nötigem
 * Material, Erwartungshorizont aus dem Material oder als gekennzeichneter KI-Entwurf, Fach und
 * Jahrgang erkannt (änderbar, mit Hinweis).
 */
export function aufgabeAusDateien(r: Rueckmeldung, docId: string, dateien: GeleseneDatei[]): void {
  void starteAuftrag({
    moduleId: 'rueckmeldung',
    docId,
    titel: r.meta.title || r.grundlage.titel || 'Rückmeldung',
    art: 'Aufgabe aus dem Material übernehmen',
    eingabe: r,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `rueckmeldung-aufgabe-${docId}`,
    fehlerTitel: 'Die Aufgabe konnte nicht übernommen werden',
    arbeit: async (rm, k) => {
      k.melde('Die KI liest die Aufgabe aus dem Material …')
      const erkannt = aufgabeAus(await k.ai<unknown>(aufgabeAnfrage(dateien)))
      let erwartung = erkannt.erwartung
      let entwurf = false
      // Kein Erwartungshorizont im Material und keiner eingetragen: Entwurf der KI
      if (!erwartung && !rm.grundlage.erwartung?.trim()) {
        k.melde('Kein Erwartungshorizont im Material – die KI entwirft einen …')
        const fach = erkannt.fach ? subjectById(erkannt.fach).label : rm.meta.subjectLabel
        erwartung = erwartungAus(await k.ai<unknown>(erwartungsEntwurfAnfrage(erkannt.aufgaben, fach, erkannt.jahrgang || rm.meta.grade)))
        entwurf = true
      }
      return { erkannt, erwartung, entwurf }
    },
    abschluss: ({ erkannt, entwurf }) =>
      `Aufgabe übernommen${entwurf ? ' – Erwartungshorizont als Entwurf der KI' : ''}${erkannt.fach || erkannt.jahrgang ? ' – Lerngruppe erkannt' : ''}.`,
    ablegen: ({ erkannt, erwartung, entwurf }, rm) =>
      bibliothek.legeAb(docId, rm, (aktuell) => {
        const meta = { ...aktuell.meta }
        const teile: string[] = []
        if (erkannt.fach) {
          meta.subjectId = erkannt.fach
          meta.subjectLabel = subjectById(erkannt.fach).label
          teile.push('Fach')
        }
        if (erkannt.jahrgang) {
          meta.grade = erkannt.jahrgang
          teile.push('Jahrgang')
        }
        if (teile.length)
          meta.erkannt = `${teile.join(' und ')} aus dem Material erkannt${erkannt.erkennbar.length ? ` (${erkannt.erkennbar.join('; ')})` : ''} – bitte prüfen.`
        // Teile mit Gewichtung (29.09.2026): Schreiben/Sprachmittlung in den Fremdsprachen, mehrere Teilkompetenzen
        const erkannteTeile = teileAusKi(erkannt.teile, meta)
        const mitTeilen = erkannteTeile && (erkannteTeile.teile.length > 1 || (fremdsprachlich(meta.subjectId) && erkannteTeile.teile.some((t) => t.art !== 'sonstig')))
        return {
          ...aktuell,
          meta,
          grundlage: {
            art: 'frei',
            titel: aktuell.grundlage.titel.trim() || erkannt.titel,
            aufgaben: erkannt.aufgaben,
            erwartung: erwartung ? (entwurf ? `${ENTWURF_VERMERK}\n${erwartung}` : erwartung) : aktuell.grundlage.erwartung,
            ...(mitTeilen ? erkannteTeile : {})
          }
        }
      })
  })
}

/**
 * „Teile erkennen" (29.09.2026): Schreib- und Sprachmittlungsteile und Gewichtungen aus der schon
 * eingetragenen Aufgabe (Material aus der Bibliothek, getippte Aufgabe).
 */
export function teileErkennen(r: Rueckmeldung, docId: string): void {
  void starteAuftrag({
    moduleId: 'rueckmeldung',
    docId,
    titel: r.meta.title || r.grundlage.titel || 'Rückmeldung',
    art: 'Teile der Arbeit erkennen',
    eingabe: r,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `rueckmeldung-teile-${docId}`,
    fehlerTitel: 'Die Teile der Arbeit konnten nicht erkannt werden',
    arbeit: async (rm, k) => {
      k.melde('Die KI sucht Schreib- und Sprachmittlungsteile und Gewichtungen …')
      const d = await k.ai<{ teile?: unknown }>(teileAnfrage(rm.grundlage.aufgaben, rm.grundlage.erwartung ?? ''))
      const erkannt = teileAusKi(d?.teile, rm.meta)
      if (!erkannt) throw new Error('In der Aufgabe waren keine Teile zu erkennen.')
      return erkannt
    },
    abschluss: (e) =>
      `${e.teile.length} ${e.teile.length === 1 ? 'Teil' : 'Teile'} erkannt${e.teile.some((t) => t.quelle === 'material') ? ' – Gewichtung aus dem Material' : ''}.`,
    ablegen: (e, rm) => bibliothek.legeAb(docId, rm, (aktuell) => ({ ...aktuell, grundlage: { ...aktuell.grundlage, ...e } }))
  })
}

/** Erwartungshorizont aus einer eigenen Datei (Lösungsblatt) übertragen */
export function erwartungAusDateien(r: Rueckmeldung, docId: string, dateien: GeleseneDatei[]): void {
  void starteAuftrag({
    moduleId: 'rueckmeldung',
    docId,
    titel: r.meta.title || r.grundlage.titel || 'Rückmeldung',
    art: 'Erwartungshorizont übernehmen',
    eingabe: r,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `rueckmeldung-erwartung-${docId}`,
    fehlerTitel: 'Der Erwartungshorizont konnte nicht übernommen werden',
    arbeit: async (rm, k) => {
      k.melde('Die KI überträgt den Erwartungshorizont …')
      return erwartungAus(await k.ai<unknown>(erwartungAusDateiAnfrage(dateien, rm.grundlage.aufgaben)))
    },
    abschluss: () => 'Erwartungshorizont übernommen.',
    ablegen: (erwartung, rm) => bibliothek.legeAb(docId, rm, (aktuell) => ({ ...aktuell, grundlage: { ...aktuell.grundlage, erwartung } }))
  })
}

/**
 * Bewertungstabelle (29.09.2026): aus hineingezogenen Dateien übertragen oder aus Aufgaben und
 * Erwartungshorizont entwerfen – gilt danach für alle Abgaben dieser Rückmeldung.
 */
export function tabelleErzeugen(r: Rueckmeldung, docId: string, dateien: GeleseneDatei[] | null): void {
  void starteAuftrag({
    moduleId: 'rueckmeldung',
    docId,
    titel: r.meta.title || r.grundlage.titel || 'Rückmeldung',
    art: dateien ? 'Bewertungstabelle übernehmen' : 'Bewertungstabelle entwerfen',
    eingabe: r,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `rueckmeldung-tabelle-${docId}`,
    fehlerTitel: 'Die Bewertungstabelle konnte nicht erstellt werden',
    arbeit: async (rm, k): Promise<Bewertungstabelle> => {
      k.melde(dateien ? 'Die KI überträgt die Bewertungstabelle …' : 'Die KI entwirft eine Bewertungstabelle …')
      return tabelleAus(await k.ai<unknown>(dateien ? tabelleAusDateiAnfrage(dateien) : tabelleEntwurfAnfrage(rm)), dateien ? 'datei' : 'ki')
    },
    abschluss: (t) => `Bewertungstabelle mit ${t.kriterien.length} Kriterien${t.entwurf ? ' – Entwurf der KI, bitte prüfen' : ''}.`,
    ablegen: (tabelle, rm) => bibliothek.legeAb(docId, rm, (aktuell) => ({ ...aktuell, tabelle }))
  })
}

const UEBERSETZT = obj({ text: str('Die Übersetzung') })

export function elternUebersetzungsAnfrage(text: string, code: string): StructuredRequest {
  const sprache = spracheNach(code)
  return {
    system: `Du übersetzt Rückmeldungen deutscher Schulen an Eltern in die Familiensprache: ${sprache?.name ?? code} (${sprache?.eigen ?? ''}). Genau, vollständig, einfache und höfliche Alltagssprache; Begriffe des deutschen Schulsystems übersetzt und beim ersten Vorkommen kurz erklärt.`,
    user: `Übersetze ins ${sprache?.name ?? code}. Namen und Kürzel bleiben unverändert.\n\n${text}`,
    schemaName: 'rueckmeldung_eltern_uebersetzung',
    schema: UEBERSETZT
  }
}

/** Elternfassungen in die gewählten Familiensprachen übersetzen (nur Abgaben mit Sprache und ohne Übersetzung) */
export function elternUebersetzen(r: Rueckmeldung, docId: string): void {
  const offen = r.abgaben.filter((a) => a.familiensprache && a.bogen?.eltern && !a.bogen.elternUebersetzt?.[a.familiensprache])
  if (!offen.length) return
  void starteAuftrag({
    moduleId: 'rueckmeldung',
    docId,
    titel: r.meta.title || r.grundlage.titel || 'Rückmeldung',
    art: offen.length === 1 ? 'Elternfassung übersetzen' : `${offen.length} Elternfassungen übersetzen`,
    eingabe: r,
    istOffen: () => bibliothek.istOffen(docId),
    sperrt: false,
    schluessel: `rueckmeldung-eltern-${docId}`,
    fehlerTitel: 'Die Elternfassung konnte nicht übersetzt werden',
    arbeit: async (_rm, k) => {
      const fertig = new Map<string, { code: string; text: string }>()
      for (const [i, a] of offen.entries()) {
        k.melde(`${a.kuerzel}: Übersetzung (${i + 1} von ${offen.length}) …`)
        // Die Elternfassung kennt nur Kürzel – Namen setzt erst der Ausdruck ein
        const d = (await k.ai<unknown>(elternUebersetzungsAnfrage(a.bogen!.eltern!, a.familiensprache!))) as { text?: unknown }
        const text = String(d?.text ?? '').trim()
        if (text) fertig.set(a.id, { code: a.familiensprache!, text })
      }
      return fertig
    },
    abschluss: (f) => `${f.size} Elternfassung${f.size === 1 ? '' : 'en'} übersetzt.`,
    ablegen: (fertig, rm) =>
      bibliothek.legeAb(docId, rm, (aktuell) => ({
        ...aktuell,
        abgaben: aktuell.abgaben.map((a) => {
          const u = fertig.get(a.id)
          if (!u || !a.bogen) return a
          return { ...a, bogen: { ...a.bogen, elternUebersetzt: { ...(a.bogen.elternUebersetzt ?? {}), [u.code]: u.text } } }
        })
      }))
  })
}
