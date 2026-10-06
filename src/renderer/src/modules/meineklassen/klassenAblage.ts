/**
 * „Ablegen ▾" in „Meine Klassen" (06.10.2026, abgestimmt mit der Lehrkraft): je Material als PDF oder Word speichern,
 * drucken oder direkt in IServ ablegen – in der Ordnerstruktur, die die Verwaltung hinterlegt (Standard
 * „Gruppen/Klasse {Klasse}/{Fach}", server/klassen.ts `ABLAGE_STANDARD`).
 *
 * IServ geht nur dort, wo das IServ-Passwort liegt: Exe „Schul-Apps Online" (und die Exe am PC). Im Browser bleibt das
 * Speichern als Datei (iPad: Teilen › „In Dateien sichern").
 *
 * Quellen: freigegebenes Blatt (gedrucktes HTML vom Server; Word nur, wenn das Original noch in der eigenen Bibliothek
 * liegt), Onlinetest (Vokabeltest-Original → Druck/Word wie im Editor; sonst eine schlichte Fassung aus den Aufgaben),
 * Vokabeltraining (Wortliste), Grammatiktraining (Regelkarten, Aufgaben, Lösungen).
 */
import { pfadTeile } from '@shared/iserv'
import type { AblageZiel } from '@shared/types'
import type { GrammatikPaket } from '@shared/grammatiktrainer'
import { buildWorksheetDocx } from '../arbeitsblatt/export/docx'
import { browserDocxDeps } from '../arbeitsblatt/export/browserDeps'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { buildDocx } from '../vokabeltest/export/docx'
import { buildPrintHtml, imageCredits } from '../vokabeltest/render/printHtml'
import type { TestDocument } from '../vokabeltest/model/types'
import { imageSize } from '../../shared/images'
import { WORD_FILTER } from '../../shared/export/ausgabe'
import { holen } from '../onlinetest/serverApi'
import type { OnlineFassung } from '../onlinetest/kern'

export type AblageArt = 'pdf' | 'word' | 'drucken' | 'iserv'

export interface AblageQuelle {
  /** Dateiname ohne Endung */
  name: string
  html: () => Promise<string>
  /** Fehlt = kein Word (z. B. Blatt ohne Original in der Bibliothek) */
  word?: () => Promise<Uint8Array>
}

/** Schuljahr „2026-27" (ab August das neue) */
export function schuljahr(jetzt = new Date()): string {
  const j = jetzt.getMonth() >= 7 ? jetzt.getFullYear() : jetzt.getFullYear() - 1
  return `${j}-${String((j + 1) % 100).padStart(2, '0')}`
}

/** Ablagestruktur der Verwaltung mit Klasse und Fach → Ordnerteile („Gruppen", „Klasse 10b", „Englisch") */
export function iservPfadAus(muster: string, klasse: string, fach: string, jetzt = new Date()): string[] {
  const sauber = (t: string): string => t.replace(/[\\/<>:"|?*]/g, '-').trim()
  return pfadTeile(
    muster
      .replace(/\\/g, '/')
      .replace(/\{Klasse\}/gi, sauber(klasse))
      .replace(/\{Fach\}/gi, sauber(fach || 'Ohne Fach'))
      .replace(/\{Schuljahr\}/gi, schuljahr(jetzt))
  )
}

export const dateiName = (t: string): string =>
  t
    .replace(/[\\/<>:"|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Material'

export async function ablegen(
  art: AblageArt,
  q: AblageQuelle,
  ort: { klasse: string; fach: string; muster: string; programm: string }
): Promise<string | null> {
  const ziel: AblageZiel = { programm: ort.programm, fach: ort.fach }
  if (art === 'drucken') {
    await window.api.exporter.print(await q.html())
    return null
  }
  if (art === 'word') {
    if (!q.word) throw new Error('Für dieses Material gibt es keine Word-Fassung.')
    return window.api.files.save(`${q.name}.docx`, WORD_FILTER, await q.word(), ziel)
  }
  const html = await q.html()
  if (art === 'iserv')
    return window.api.exporter.pdf(html, `${q.name}.pdf`, undefined, { ...ziel, ort: 'iserv', iservPfad: iservPfadAus(ort.muster, ort.klasse, ort.fach) })
  return window.api.exporter.pdf(html, `${q.name}.pdf`, undefined, ziel)
}

// ---------------------------------------------------------------- Quellen

const esc = (s: string): string => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Schlichtes A4-Dokument für Listen (Wortliste, Grammatik, Test ohne Original) */
function schlicht(titel: string, unter: string, koerper: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(titel)}</title><style>
@page { size: A4; margin: 18mm 16mm; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11pt; color: #111; }
h1 { font-size: 17pt; margin: 0 0 2mm; } .unter { color: #555; margin-bottom: 6mm; }
h2 { font-size: 12.5pt; margin: 6mm 0 2mm; border-bottom: 1px solid #bbb; padding-bottom: 1mm; }
table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #bbb; padding: 1.6mm 2mm; text-align: left; vertical-align: top; }
th { background: #f1f3f5; } .karte { border: 1px solid #ccc; border-radius: 2mm; padding: 3mm; margin-bottom: 3mm; break-inside: avoid; }
.loesung { color: #1b7f4a; } .klein { font-size: 9.5pt; color: #555; } li { margin-bottom: 1.5mm; break-inside: avoid; }
.neu { break-before: page; }
</style></head><body><h1>${esc(titel)}</h1><div class="unter">${esc(unter)}</div>${koerper}</body></html>`
}

/** Freigegebenes Arbeitsblatt (mit Lösung, falls hinterlegt) */
export function blattQuelle(id: string, titel: string, mitOriginal: boolean): AblageQuelle {
  let daten: Promise<{ html: string; loesung: string; quelle: { docId: string; sheetId?: string } | null }> | null = null
  const lade = (): Promise<{ html: string; loesung: string; quelle: { docId: string; sheetId?: string } | null }> =>
    (daten ??= holen(`/server/blaetter/${id}/druck`))
  return {
    name: dateiName(titel),
    html: async () => {
      const d = await lade()
      if (!d.loesung) return d.html
      // Lösung als eigene Seiten hinten an (ihr Körper ohne zweites Dokumentgerüst)
      const koerper = /<body[^>]*>([\s\S]*)<\/body>/i.exec(d.loesung)?.[1] ?? d.loesung
      return d.html.replace(/<\/body>/i, `<div style="break-before: page"></div>${koerper}</body>`)
    },
    word: !mitOriginal
      ? undefined
      : async () => {
          const d = await lade()
          if (!d.quelle)
            throw new Error('Das Original dieses Blatts ist nicht bekannt – Word gibt es nur für Blätter, die seit dem 06.10.2026 freigegeben wurden.')
          const gespeichert = await window.api.sheets.get(d.quelle.docId).catch(() => null)
          if (!gespeichert) throw new Error('Das Original-Arbeitsblatt liegt nicht mehr in der eigenen Bibliothek.')
          const ws = gespeichert.payload as Worksheet
          const sheetIds = d.quelle.sheetId && ws.sheets.some((s) => s.id === d.quelle!.sheetId) ? [d.quelle.sheetId] : ws.sheets.map((s) => s.id).slice(0, 1)
          const s = await window.api.settings.get()
          return buildWorksheetDocx(ws, { sheetIds, includeKey: true }, browserDocxDeps(null, s.schoolName ?? ''))
        }
  }
}

interface TestDaten {
  titel: string
  einstellungen: { thema?: string; art?: string; blatt?: Pick<TestDocument, 'header' | 'settings' | 'fontSize'> }
  fassungen: {
    label: string
    punkte: number
    aufgaben: OnlineFassung['aufgaben']
    loesungen: OnlineFassung['loesungen']
    original: TestDocument['variants'][number] | null
  }[]
}

/** Vokabeltest aus den Originalen der Varianten – wie im Editor (Druck und Word) */
function alsTestDokument(d: TestDaten): TestDocument | null {
  const b = d.einstellungen.blatt
  const varianten = d.fassungen.map((f) => f.original).filter((v): v is TestDocument['variants'][number] => Boolean(v))
  if (!b || !varianten.length || varianten.length !== d.fassungen.length) return null
  return { version: 1, header: b.header, settings: b.settings, fontSize: b.fontSize, vocab: [], variants: varianten, createdAt: new Date().toISOString() }
}

function loesungText(l: OnlineFassung['loesungen'][string] | undefined): string {
  if (!l) return ''
  if (l.art === 'genau' || l.art === 'menge') return l.werte.join(' / ')
  if (l.art === 'auswahl') return l.wert
  return l.erwartung ?? ''
}

/** Onlinetest (Blatt + Lösung): Vokabeltest wie im Editor, sonst schlicht aus den Aufgaben */
export function testQuelle(id: string, titel: string, mitOriginal: boolean): AblageQuelle {
  let daten: Promise<TestDaten> | null = null
  const lade = (): Promise<TestDaten> => (daten ??= holen<TestDaten>(`/server/onlinetest/${id}`))
  return {
    name: dateiName(titel),
    html: async () => {
      const d = await lade()
      const doc = alsTestDokument(d)
      if (doc) return buildPrintHtml(doc, { variantIds: doc.variants.map((v) => v.id), includeKey: true })
      const teile = d.fassungen.map((f, i) => {
        const aufgaben = f.aufgaben
          .map(
            (a) =>
              `<div class="karte"><b>${esc(a.titel)}</b> <span class="klein">(${a.punkte} P.)</span><div>${esc(a.anweisung)}</div>${a.html ?? ''}<ol>${a.eintraege
                .map((e) => `<li>${esc([e.vor, e.text, e.nach].filter(Boolean).join(' ___ ') || (e.woerter ?? []).join(' · '))}</li>`)
                .join('')}</ol></div>`
          )
          .join('')
        const loesungen = Object.values(f.loesungen).map(loesungText).filter(Boolean)
        return `${i ? '<div class="neu"></div>' : ''}<h2>Version ${esc(f.label)} · ${f.punkte} Punkte</h2>${aufgaben}<h2>Lösungen ${esc(f.label)}</h2><ol class="loesung">${loesungen.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>`
      })
      return schlicht(titel, [d.einstellungen.art, d.einstellungen.thema].filter(Boolean).join(' · '), teile.join(''))
    },
    word: !mitOriginal
      ? undefined
      : async () => {
          const d = await lade()
          const doc = alsTestDokument(d)
          if (!doc) throw new Error('Word gibt es nur für Vokabeltests (mit Original der Varianten).')
          return buildDocx(doc, { variantIds: doc.variants.map((v) => v.id), includeKey: true, credits: imageCredits(doc) }, imageSize)
        }
  }
}

/** Vokabeltraining als Wortliste */
export function vokabelQuelle(id: string, titel: string): AblageQuelle {
  return {
    name: dateiName(`Wortliste ${titel}`),
    html: async () => {
      const d = await holen<{ titel: string; woerter: { term: string; translation: string; example?: string }[]; quelle?: string }>(`/server/vokabeln/${id}`)
      const zeilen = (d.woerter ?? [])
        .map((w) => `<tr><td><b>${esc(w.term)}</b></td><td>${esc(w.translation)}</td><td class="klein">${esc(w.example ?? '')}</td></tr>`)
        .join('')
      return schlicht(
        d.titel || titel,
        `${d.woerter?.length ?? 0} Wörter`,
        `<table><thead><tr><th>Wort</th><th>Bedeutung</th><th>Beispiel</th></tr></thead><tbody>${zeilen}</tbody></table>`
      )
    }
  }
}

/** Grammatiktraining: Regelkarten, Aufgaben, Lösungen */
export function grammatikQuelle(id: string, titel: string): AblageQuelle {
  return {
    name: dateiName(`Grammatik ${titel}`),
    html: async () => {
      const d = await holen<{ titel: string; paket: GrammatikPaket }>(`/server/grammatik/${id}`)
      const p = d.paket
      const regeln = p.regeln
        .map(
          (r) =>
            `<div class="karte"><b>${esc(r.titel)}</b><div>${esc(r.erklaerung)}</div>${r.beispiele.map((b) => `<div class="klein">→ ${esc(b)}</div>`).join('')}</div>`
        )
        .join('')
      const aufgaben = p.aufgaben
        .map(
          (a) =>
            `<li>${esc(a.anweisung)}<br>${esc(a.art === 'satzbau' ? (a.teile ?? []).join(' / ') : a.satz)}${a.vorgabe ? ` <span class="klein">${esc(a.vorgabe)}</span>` : ''}</li>`
        )
        .join('')
      const loesungen = p.aufgaben.map((a) => `<li>${esc(a.loesungen.join(' / '))}</li>`).join('')
      return schlicht(
        d.titel || titel,
        `${p.regeln.length} Regelkarten · ${p.aufgaben.length} Aufgaben`,
        `<h2>Regelkarten</h2>${regeln}<h2>Aufgaben</h2><ol>${aufgaben}</ol><div class="neu"></div><h2>Lösungen</h2><ol class="loesung">${loesungen}</ol>`
      )
    }
  }
}
