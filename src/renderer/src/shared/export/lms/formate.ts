/**
 * Moodle-XML, GIFT und H5P aus den neutralen Fragen (Großprogramm 0.4, F5).
 *
 * - Moodle-XML: das vollständige Austauschformat von Moodle (Fragensammlung › Import).
 *   Lückentexte als „Lückentext (Cloze)" mit {1:SHORTANSWER:=…}.
 * - GIFT: Textformat für Moodle und ILIAS. Kein Cloze: Ein Lückentext mit einer Lücke wird
 *   zur „fehlendes Wort"-Frage, mehrere Lücken zu mehreren Fragen.
 * - H5P „Question Set": Inhaltsdatei (content.json + h5p.json) für H5P-fähige Plattformen.
 *   Die Bibliotheken bringt die Plattform mit; manche Plattformen verlangen sie im Paket –
 *   dort bitte Moodle-XML nehmen (steht so im Dialog).
 */
import type { LmsFrage } from './fragen'

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cdata = (s: string): string => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`

// ---------- Moodle-XML ----------

function moodleFrage(f: LmsFrage): string {
  const kopf = (typ: string): string => `<question type="${typ}"><name><text>${xml(f.titel)}</text></name>`
  switch (f.art) {
    case 'mc': {
      const richtig = f.optionen.filter((o) => o.richtig).length
      const anteil = (o: { richtig: boolean }): string => (o.richtig ? String(Math.round((100 / richtig) * 1e5) / 1e5) : richtig > 1 ? '-100' : '0')
      return `${kopf('multichoice')}<questiontext format="html"><text>${cdata(`<p>${xml(f.frage)}</p>`)}</text></questiontext><single>${richtig === 1 ? 'true' : 'false'}</single><shuffleanswers>true</shuffleanswers><answernumbering>abc</answernumbering>${f.optionen.map((o) => `<answer fraction="${anteil(o)}" format="html"><text>${cdata(xml(o.text))}</text></answer>`).join('')}</question>`
    }
    case 'wf':
      return `${kopf('truefalse')}<questiontext format="html"><text>${cdata(`<p>${xml(f.frage)}</p>`)}</text></questiontext><answer fraction="${f.richtig ? 100 : 0}"><text>true</text></answer><answer fraction="${f.richtig ? 0 : 100}"><text>false</text></answer></question>`
    case 'zuordnung':
      return `${kopf('matching')}<questiontext format="html"><text>${cdata(`<p>${xml(f.frage)}</p>`)}</text></questiontext><shuffleanswers>true</shuffleanswers>${f.paare.map((p) => `<subquestion format="html"><text>${cdata(xml(p.links))}</text><answer><text>${xml(p.rechts)}</text></answer></subquestion>`).join('')}</question>`
    case 'lueckentext': {
      const text = f.teile
        .map((t) => ('text' in t ? xml(t.text) : `{1:SHORTANSWER:${t.luecke.map((l) => `=${l.replace(/[}{#~=/\\]/g, '\\$&')}`).join('~')}}`))
        .join('')
      return `${kopf('cloze')}<questiontext format="html"><text>${cdata(`<p>${xml(f.frage)}</p><p>${text}</p>`)}</text></questiontext></question>`
    }
    case 'kurz':
      return `${kopf('shortanswer')}<questiontext format="html"><text>${cdata(`<p>${xml(f.frage)}</p>`)}</text></questiontext><usecase>0</usecase>${f.antworten.map((a) => `<answer fraction="100"><text>${xml(a)}</text></answer>`).join('')}</question>`
    case 'freitext':
      return `${kopf('essay')}<questiontext format="html"><text>${cdata(`<p>${xml(f.frage)}</p>`)}</text></questiontext><responseformat>editor</responseformat><responsefieldlines>15</responsefieldlines>${f.hinweis ? `<graderinfo format="html"><text>${cdata(`<p>${xml(f.hinweis)}</p>`)}</text></graderinfo>` : ''}</question>`
  }
}

export function moodleXml(fragen: LmsFrage[], kategorie: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n<question type="category"><category><text>$course$/top/${xml(kategorie)}</text></category></question>\n${fragen.map(moodleFrage).join('\n')}\n</quiz>\n`
}

// ---------- GIFT ----------

const gift = (s: string): string => s.replace(/[~=#{}:\\]/g, '\\$&')

function giftFrage(f: LmsFrage): string[] {
  const titel = `::${gift(f.titel)}::`
  switch (f.art) {
    case 'mc': {
      const richtig = f.optionen.filter((o) => o.richtig).length
      if (richtig > 1) {
        const anteil = Math.round((100 / richtig) * 1e5) / 1e5
        return [`${titel}${gift(f.frage)} {\n${f.optionen.map((o) => `  ~%${o.richtig ? anteil : -100}%${gift(o.text)}`).join('\n')}\n}`]
      }
      return [`${titel}${gift(f.frage)} {\n${f.optionen.map((o) => `  ${o.richtig ? '=' : '~'}${gift(o.text)}`).join('\n')}\n}`]
    }
    case 'wf':
      return [`${titel}${gift(f.frage)} {${f.richtig ? 'TRUE' : 'FALSE'}}`]
    case 'zuordnung':
      return [`${titel}${gift(f.frage)} {\n${f.paare.map((p) => `  =${gift(p.links)} -> ${gift(p.rechts)}`).join('\n')}\n}`]
    case 'lueckentext': {
      // Eine Frage je Lücke: der Satz mit genau dieser Lücke, die übrigen ausgefüllt
      const luecken = f.teile.filter((t) => 'luecke' in t).length
      return f.teile
        .map((t, i) => ('luecke' in t ? i : -1))
        .filter((i) => i >= 0)
        .map((i, n) => {
          const text = f.teile
            .map((t, k) => ('text' in t ? gift(t.text) : k === i ? `{${t.luecke.map((l) => `=${gift(l)}`).join(' ')}}` : gift(t.luecke[0] ?? '')))
            .join('')
          return `::${gift(f.titel)}${luecken > 1 ? ` (${n + 1})` : ''}::${gift(f.frage)} ${text}`
        })
    }
    case 'kurz':
      return [`${titel}${gift(f.frage)} {${f.antworten.map((a) => `=${gift(a)}`).join(' ')}}`]
    case 'freitext':
      return [`${titel}${gift(f.frage)} {}`]
  }
}

export function giftText(fragen: LmsFrage[], kategorie: string): string {
  return `$CATEGORY: ${kategorie}\n\n${fragen.flatMap(giftFrage).join('\n\n')}\n`
}

// ---------- H5P (Question Set) ----------

/** Die Inhaltsdateien eines H5P-Pakets „Question Set" (content/content.json und h5p.json) */
export function h5pInhalt(fragen: LmsFrage[], titel: string): { h5p: object; content: object; nichtMoeglich: string[] } {
  const nichtMoeglich: string[] = []
  const questions: object[] = []
  for (const f of fragen) {
    if (f.art === 'mc')
      questions.push({
        library: 'H5P.MultiChoice 1.16',
        params: {
          question: `<p>${xml(f.frage)}</p>`,
          answers: f.optionen.map((o) => ({ text: `<div>${xml(o.text)}</div>`, correct: o.richtig })),
          behaviour: { singlePoint: false, enableRetry: true }
        }
      })
    else if (f.art === 'wf')
      questions.push({ library: 'H5P.TrueFalse 1.8', params: { question: `<p>${xml(f.frage)}</p>`, correct: f.richtig ? 'true' : 'false' } })
    else if (f.art === 'lueckentext')
      questions.push({
        library: 'H5P.Blanks 1.14',
        params: {
          text: `<p>${xml(f.frage)}</p>`,
          questions: [`<p>${f.teile.map((t) => ('text' in t ? xml(t.text) : `*${t.luecke.map(xml).join('/')}*`)).join('')}</p>`]
        }
      })
    else if (f.art === 'kurz')
      questions.push({ library: 'H5P.Blanks 1.14', params: { text: '', questions: [`<p>${xml(f.frage)}: *${f.antworten.map(xml).join('/')}*</p>`] } })
    else nichtMoeglich.push(`${f.titel}: ${f.art === 'zuordnung' ? 'Zuordnung' : 'freie Antwort'} gibt es im H5P-Fragensatz nicht`)
  }
  return {
    h5p: {
      title: titel,
      language: 'de',
      mainLibrary: 'H5P.QuestionSet',
      embedTypes: ['iframe'],
      license: 'U',
      preloadedDependencies: [
        { machineName: 'H5P.QuestionSet', majorVersion: 1, minorVersion: 20 },
        { machineName: 'H5P.MultiChoice', majorVersion: 1, minorVersion: 16 },
        { machineName: 'H5P.TrueFalse', majorVersion: 1, minorVersion: 8 },
        { machineName: 'H5P.Blanks', majorVersion: 1, minorVersion: 14 }
      ]
    },
    content: { introPage: { showIntroPage: true, title: titel }, progressType: 'dots', passPercentage: 50, questions },
    nichtMoeglich
  }
}
