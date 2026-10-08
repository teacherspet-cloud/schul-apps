/**
 * Export „Unterrichtsplanung" der Planungsreihe (08.10.2026, Plan „Unterrichtsreihe" E4): je Stunde die Verlaufstabelle
 * (dieselbe wie im Stundenverlauf der Arbeitsblatt-App, A4 quer) mit Stundenziel und Hausaufgabe, danach der
 * Materialanhang (M1, M2 … in der Fassung des Schritts wie im Sammeldruck, reiheDruck.ts). Word enthält die Verläufe
 * und ein Verzeichnis des Materials (Arbeitsblätter liegen in „Meine Arbeitsblätter"; Texte von Aufträgen stehen dabei).
 */
import { AlignmentType, Document, Packer, PageBreak, PageOrientation, Paragraph, TextRun } from 'docx'
import { SCHRITT_ARTEN, STUNDEN_MINUTEN, type Reihe, type ReihenPhase, type Schritt } from '@shared/reihe'
import { verlaufTabelleHtml } from '../../shared/stundenverlauf/stundenverlauf'
import { VERLAUF_BREITE, verlaufTabelle } from '../../shared/stundenverlauf/docx'
import { A4_HEIGHT, A4_WIDTH, MM } from '../../shared/export/docxKit'
import { WORD_TRENNUNG } from '../../shared/silbentrennung'
import { WORD_FILTER, speichereAusgabe } from '../../shared/export/ausgabe'
import { ausgeben, dateiname, koerper, schrittHtml, type DruckArt } from './reiheDruck'
import { verlaufVon } from './reihePlanung'

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const artLabel = (s: Schritt): string => SCHRITT_ARTEN.find((a) => a.id === s.inhalt.art)?.label ?? s.inhalt.art

/** Material der Planung in Reihenfolge der Stunden (verknüpft oder in der Stunde), dann der Rest – ohne Platzhalter */
export function planungsMaterial(r: Reihe): Schritt[] {
  const n = r.stunden?.length ?? 0
  const liste: Schritt[] = []
  const dazu = (s: Schritt | undefined): void => {
    if (s && !s.platzhalter && !liste.includes(s)) liste.push(s)
  }
  for (let i = 0; i < n; i++) {
    for (const ph of verlaufVon(r, i).phasen) for (const id of ph.schritte ?? []) dazu(r.schritte.find((s) => s.id === id))
    for (const s of r.schritte) if (s.stunde === i) dazu(s)
  }
  for (const s of r.schritte) dazu(s)
  return liste
}

/** Spalte „Medien / Material": Medien und die verknüpften Materialien als M-Nummer des Anhangs */
export function medienMitMaterial(ph: ReihenPhase, r: Reihe, material: Schritt[]): string {
  const verweise = (ph.schritte ?? [])
    .map((id) => r.schritte.find((s) => s.id === id))
    .filter((s): s is Schritt => Boolean(s))
    .map((s) => {
      const k = material.indexOf(s)
      return k >= 0 ? `M${k + 1}: ${s.titel || artLabel(s)}` : `${s.titel || artLabel(s)} (noch zu erstellen)`
    })
  return [ph.medien.trim(), ...verweise].filter(Boolean).join(' · ')
}

/** Kopfzeile: Fach, Klasse, Oberthema */
const untertitel = (r: Reihe): string => [r.fachLabel, `Klasse ${r.grade}`, r.oberthema].filter(Boolean).join(' · ')

/** HTML der Unterrichtsplanung (Verläufe quer, Material hochkant) – `anhang` = Körper der Materialseiten */
export function planungHtml(r: Reihe, material: Schritt[], anhang: string[] = [], kopfteil = ''): string {
  const n = r.stunden?.length ?? 0
  const stunden = Array.from({ length: n }, (_, i) => {
    const p = verlaufVon(r, i)
    const art = r.stunden![i]
    const phasen = p.phasen.map((ph) => ({ ...ph, medien: medienMitMaterial(ph, r, material) }))
    return `<section class="planung-seite"><h2>Stunde ${i + 1} · ${art === 'doppel' ? 'Doppelstunde' : 'Einzelstunde'} · ${STUNDEN_MINUTEN[art]} Minuten</h2>
${p.ziel ? `<p><b>Stundenziel:</b> ${esc(p.ziel)}</p>` : ''}
${phasen.length ? verlaufTabelleHtml(phasen) : '<p><i>Noch kein Verlauf geplant.</i></p>'}
${p.hausaufgabe ? `<p class="h"><b>Hausaufgabe:</b> ${esc(p.hausaufgabe)}</p>` : ''}${p.hinweise ? `<p class="h"><b>Hinweise:</b> ${esc(p.hinweise)}</p>` : ''}</section>`
  }).join('\n')
  const ziele = r.lernziele.length ? `<p><b>Lernziele der Reihe:</b></p><ul>${r.lernziele.map((l) => `<li>${esc(l.text)}</li>`).join('')}</ul>` : ''
  const verzeichnis = material.length
    ? `<section class="planung-seite"><h2>Materialanhang</h2><ol class="m">${material.map((s, k) => `<li><b>M${k + 1}</b> ${esc(s.titel || artLabel(s))} <span class="u">(${esc(artLabel(s))})</span></li>`).join('')}</ol></section>`
    : ''
  const stil = `<style>
@page planung { size: A4 landscape; margin: 14mm; }
.planung-seite { page: planung; break-after: page; font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; color: #000; }
.planung-seite:last-of-type { break-after: auto; }
.planung-seite h1 { font-size: 16pt; margin: 0 0 1mm; } .planung-seite h2 { font-size: 13pt; margin: 0 0 2mm; } .planung-seite .u { color: #555; }
.planung-seite table { width: 100%; border-collapse: collapse; } .planung-seite th, .planung-seite td { border: 0.3mm solid #888; padding: 1.5mm 2mm; vertical-align: top; text-align: left; }
.planung-seite th { background: #eee; } .planung-seite td.z { white-space: nowrap; } .planung-seite .h { margin-top: 3mm; } .planung-seite ol.m { list-style: none; padding-left: 0; }
.planung-anhang { break-before: page; }
</style>`
  const kopf = kopfteil ? kopfteil.replace('</head>', `${stil}</head>`) : `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Unterrichtsplanung – ${esc(r.titel)}</title>${stil}</head>`
  return `${kopf}<body><section class="planung-seite"><h1>Unterrichtsplanung – ${esc(r.titel || r.oberthema)}</h1><p class="u">${esc(untertitel(r))} · ${n} ${n === 1 ? 'Stunde' : 'Stunden'}</p>${ziele}</section>
${stunden}
${verzeichnis}${anhang.length ? `<div class="planung-anhang">${anhang.join('\n')}</div>` : ''}</body></html>`
}

/** Word-Fassung: Verläufe quer, dazu das Materialverzeichnis */
export async function planungDocx(r: Reihe): Promise<Uint8Array> {
  const material = planungsMaterial(r)
  const n = r.stunden?.length ?? 0
  const rand = Math.round(14 * MM)
  const absatz = (text: string, o: { fett?: boolean; groesse?: number; farbe?: string; nach?: number; vor?: number } = {}): Paragraph =>
    new Paragraph({
      spacing: { after: o.nach ?? 120, ...(o.vor ? { before: o.vor } : {}) },
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text, bold: o.fett, size: o.groesse, color: o.farbe })]
    })
  const feld = (label: string, text: string): Paragraph =>
    new Paragraph({ spacing: { before: 160, after: 80 }, children: [new TextRun({ text: `${label} `, bold: true }), new TextRun(text)] })
  const kinder: (Paragraph | ReturnType<typeof verlaufTabelle>)[] = [
    absatz(`Unterrichtsplanung – ${r.titel || r.oberthema}`, { fett: true, groesse: 32, nach: 60 }),
    absatz(`${untertitel(r)} · ${n} ${n === 1 ? 'Stunde' : 'Stunden'}`, { farbe: '555555', groesse: 20 }),
    ...(r.lernziele.length ? [absatz('Lernziele der Reihe:', { fett: true, nach: 40 }), ...r.lernziele.map((l) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(l.text)] }))] : [])
  ]
  for (let i = 0; i < n; i++) {
    const p = verlaufVon(r, i)
    const art = r.stunden![i]
    kinder.push(
      new Paragraph({ children: [new PageBreak()] }),
      absatz(`Stunde ${i + 1} · ${art === 'doppel' ? 'Doppelstunde' : 'Einzelstunde'} · ${STUNDEN_MINUTEN[art]} Minuten`, { fett: true, groesse: 26 })
    )
    if (p.ziel) kinder.push(feld('Stundenziel:', p.ziel))
    kinder.push(
      p.phasen.length
        ? verlaufTabelle(
            p.phasen.map((ph) => ({ ...ph, medien: medienMitMaterial(ph, r, material) })),
            VERLAUF_BREITE
          )
        : absatz('Noch kein Verlauf geplant.', { farbe: '777777' })
    )
    if (p.hausaufgabe) kinder.push(feld('Hausaufgabe:', p.hausaufgabe))
    if (p.hinweise) kinder.push(feld('Hinweise:', p.hinweise))
  }
  if (material.length) {
    kinder.push(new Paragraph({ children: [new PageBreak()] }), absatz('Materialanhang', { fett: true, groesse: 26 }))
    material.forEach((s, k) => {
      kinder.push(absatz(`M${k + 1}: ${s.titel || artLabel(s)} (${artLabel(s)})`, { fett: true, vor: 160, nach: 40 }))
      const i = s.inhalt
      const text =
        i.art === 'arbeitsblatt'
          ? `Arbeitsblatt „${i.titel || s.titel}“ – in „Meine Arbeitsblätter“; vollständig im PDF-Export der Unterrichtsplanung.`
          : i.art === 'aufgabe' || i.art === 'abschluss' || i.art === 'sprechen' || i.art === 'praesenz'
            ? i.anweisung
            : i.art === 'hefter'
              ? i.text
              : i.art === 'reflexion'
                ? i.frage
                : i.art === 'lernkarten'
                  ? i.karten.map((x) => `${x.vorne} – ${x.hinten}`).join(' · ')
                  : i.art === 'diagnose'
                    ? i.fragen.map((f, j) => `${j + 1}. ${f.frage}`).join(' · ')
                    : ''
      for (const zeile of text.split(/\n+/).filter((z) => z.trim())) kinder.push(absatz(zeile, { nach: 60 }))
    })
  }
  const doc = new Document({
    creator: 'Schul-Apps',
    hyphenation: WORD_TRENNUNG,
    title: `Unterrichtsplanung – ${r.titel}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [
      {
        properties: {
          page: { size: { width: A4_WIDTH, height: A4_HEIGHT, orientation: PageOrientation.LANDSCAPE }, margin: { top: rand, bottom: rand, left: rand, right: rand } }
        },
        children: kinder
      }
    ]
  })
  return new Uint8Array(await Packer.toArrayBuffer(doc))
}

/** Unterrichtsplanung drucken bzw. als PDF oder Word speichern */
export async function planungAusgeben(r: Reihe, art: DruckArt): Promise<void> {
  const name = `${dateiname(r.titel || 'Unterrichtsreihe')} - Unterrichtsplanung`
  if (art === 'word') {
    await speichereAusgabe([{ name: `${name}.docx`, daten: () => planungDocx(r), filter: WORD_FILTER }], 'Word-Datei gespeichert')
    return
  }
  const material = planungsMaterial(r)
  let kopfteil = ''
  const anhang: string[] = []
  for (const [k, s] of material.entries()) {
    const html = await schrittHtml(s, k + 1, false).catch(() => '')
    if (!html) continue
    if (!kopfteil && html.includes('ws-page') && html.includes('<style>')) kopfteil = html.slice(0, html.indexOf('<body>'))
    anhang.push(koerper(html))
  }
  await ausgeben(planungHtml(r, material, anhang, kopfteil), name, art)
}
