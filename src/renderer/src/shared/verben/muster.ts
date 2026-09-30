/**
 * Bildungsmuster und typische Fehlformen unregelmäßiger Verben (30.09.2026).
 *
 * Grundlage für drei Aufgabenformen, die OHNE KI auskommen:
 * - „Zuordnen nach Muster" (sing – sang – sung zu „A–B–C"),
 * - „Welches Verb passt nicht?" (drei Verben eines Musters, eines aus einem anderen),
 * - Ablenker für „Richtige Form ankreuzen" und „Fehler finden": die Fehler, die Lernende wirklich
 *   machen – Übergeneralisierung der regelmäßigen Bildung (*goed, *bringed, *hacido, *prendu),
 *   Analogie zu anderen Mustern (*brang nach sing – sang), Verwechslung der Formen (*have went),
 *   falsches Hilfsverb (*j'ai venu, *ho andato) und Schreibfehler (*writen, *choosen).
 * Recherche: recherche/unregelmaessige-verben-2026-09-30.md.
 */
import { varianten, type VerbEintrag, type VerbSprache } from '@shared/verben'

export interface Muster {
  id: string
  label: string
}

const erste = (zelle: string | undefined): string => (zelle ? (varianten(zelle)[0] ?? '') : '')
/** Englisch: nur das Verb – „wake up" → „wake" */
const kopfEn = (s: string): string => s.toLowerCase().trim().split(/\s+/)[0] ?? ''
const letztesWort = (s: string): string =>
  s
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(/\s+/)
    .pop()
    ?.toLowerCase() ?? ''

/** Bildungsmuster eines Verbs – null, wenn die nötigen Formen fehlen */
export function musterVon(e: VerbEintrag, sprache: VerbSprache): Muster | null {
  const f = e.formen
  switch (sprache) {
    case 'en': {
      const [a, b, c] = [kopfEn(erste(f.inf)), kopfEn(erste(f.past)), kopfEn(erste(f.pp))]
      if (!a || !b || !c) return null
      if (a === b && b === c) return { id: 'AAA', label: 'A – A – A (cut – cut – cut)' }
      if (b === c) return { id: 'ABB', label: 'A – B – B (buy – bought – bought)' }
      if (a === c) return { id: 'ABA', label: 'A – B – A (come – came – come)' }
      if (/i/.test(a) && /a/.test(b) && /u/.test(c)) return { id: 'IAU', label: 'i – a – u (sing – sang – sung)' }
      return { id: 'ABC', label: 'A – B – C (go – went – gone)' }
    }
    case 'fr': {
      const p = letztesWort(erste(f.pc))
      if (!p) return null
      if (/ert$/.test(p)) return { id: 'ert', label: 'participe en -ert (ouvert)' }
      if (/int$/.test(p)) return { id: 'int', label: 'participe en -int (peint)' }
      if (/it$/.test(p)) return { id: 'it', label: 'participe en -it (dit, écrit)' }
      if (/is$/.test(p)) return { id: 'is', label: 'participe en -is (pris, mis)' }
      if (/[uû]$/.test(p)) return { id: 'u', label: 'participe en -u (venu, lu)' }
      if (/é$/.test(p)) return { id: 'e', label: 'participe en -é (été, allé)' }
      if (/i$/.test(p)) return { id: 'i', label: 'participe en -i (parti, dormi)' }
      return { id: 'autre', label: 'autre participe (mort, né)' }
    }
    case 'es': {
      const [inf, yo] = [erste(f.inf).toLowerCase(), erste(f.yo).toLowerCase()]
      if (inf && yo) {
        if (/zco$/.test(yo)) return { id: 'zco', label: 'yo en -zco (conozco)' }
        if (/go$/.test(yo) && !/go$/.test(inf.slice(0, -2) + 'o')) return { id: 'go', label: 'yo en -go (tengo, hago)' }
        const stamm = inf.slice(0, -2)
        if (yo.includes('ie') && !stamm.includes('ie')) return { id: 'e-ie', label: 'e > ie (quiero)' }
        if (yo.includes('ue') && !stamm.includes('ue')) return { id: 'o-ue', label: 'o/u > ue (puedo, juego)' }
        if (/e[^aeiou]*$/.test(stamm) && yo.startsWith(stamm.replace(/e([^aeiou]*)$/, 'i$1'))) return { id: 'e-i', label: 'e > i (pido)' }
      }
      const p = erste(f.part).toLowerCase()
      if (/cho$/.test(p)) return { id: 'cho', label: 'participio en -cho (hecho, dicho)' }
      if (/[^aeií]to$/.test(p)) return { id: 'to', label: 'participio en -to (escrito, visto)' }
      return inf ? { id: 'otro', label: 'otro verbo irregular (ser, ir, dar)' } : null
    }
    case 'it': {
      const p = letztesWort(erste(f.pp)).replace(/\/.*$/, '')
      if (!p) return null
      const q = p.replace(/[oa]$/, 'o')
      if (/tto$/.test(q)) return { id: 'tto', label: 'participio in -tto (fatto, scritto)' }
      if (/sto$/.test(q)) return { id: 'sto', label: 'participio in -sto (visto, chiesto)' }
      if (/so$/.test(q)) return { id: 'so', label: 'participio in -so (preso, messo)' }
      if (/uto$/.test(q)) return { id: 'uto', label: 'participio in -uto (venuto, voluto)' }
      if (/ato$/.test(q)) return { id: 'ato', label: 'participio in -ato (stato, andato)' }
      return { id: 'to', label: 'participio in -to (aperto, scelto)' }
    }
    case 'ru': {
      const ty = erste(f.ty).toLowerCase()
      if (!ty) return null
      if (/ишь$/.test(ty)) return { id: 'ish', label: 'ты-Form auf -ишь' }
      if (/[её]шь$/.test(ty)) return { id: 'esh', label: 'ты-Form auf -ешь/-ёшь' }
      return { id: 'sonder', label: 'Sonderform (дашь, ешь)' }
    }
    case 'la': {
      const perf = erste(f.perf).toLowerCase()
      const praes = erste(f.praes).toLowerCase()
      if (!perf) return null
      if (/\s/.test(perf) || perf === 'fui') return { id: 'sonder', label: 'Sonderform (fui, factus sum)' }
      if (/(.)[aeiou]\1/.test(perf.slice(0, 3)) || /didi$/.test(perf)) return { id: 'redupl', label: 'Reduplikationsperfekt (dedi, cucurri)' }
      if (/[sx]i$/.test(perf)) return { id: 's', label: 's-Perfekt (dixi, mansi)' }
      if (/ui$/.test(perf) && !/qui$/.test(perf)) return { id: 'u', label: 'u-Perfekt (tenui, potui)' }
      if (/(v|i)i$/.test(perf)) return { id: 'v', label: 'v-Perfekt (petivi, movi)' }
      return praes ? { id: 'dehn', label: 'Dehnungs- oder Stammperfekt (vidi, veni, respondi)' } : null
    }
  }
}

// ---------- Typische Fehlformen ----------

/** Englische regelmäßige Bildung, wie Lernende sie übertragen: go → *goed, stop → *stopped */
export function edForm(inf: string): string {
  const [verb, ...rest] = inf.trim().split(/\s+/)
  const v = verb.toLowerCase()
  let out: string
  if (v.endsWith('e')) out = `${v}d`
  else if (/[^aeiou]y$/.test(v)) out = `${v.slice(0, -1)}ied`
  else if (/^[^aeiou]*[aeiou][bdgmnprt]$/.test(v)) out = `${v}${v.at(-1)}ed`
  else out = `${v}ed`
  return [out, ...rest].join(' ')
}

/**
 * Ablaut nach einem fremden Muster: bring → *brang, *brung (Analogie zu sing – sang – sung). Nur bei
 * kurzem i vor Nasal – dort übertragen Lernende das Muster wirklich; „cut → *cat" wäre kein
 * Fehler, den jemand macht, sondern ein anderes Wort.
 */
function ablaute(inf: string): string[] {
  const [verb, ...rest] = inf.trim().split(/\s+/)
  const m = /i(?=(ng|nk|m|n)\b)/.exec(verb)
  if (!m) return []
  return ['a', 'u'].map((v) => [verb.slice(0, m.index) + v + verb.slice(m.index + 1), ...rest].join(' '))
}

/** Schreibfehler: Doppelkonsonant vereinfacht (written → *writen) oder Vokal verdoppelt (chosen → *choosen) */
function schreibfehler(form: string): string[] {
  const out: string[] = []
  const doppelt = /([bcdfgklmnprstz])\1/.exec(form)
  if (doppelt) out.push(form.slice(0, doppelt.index) + doppelt[1] + form.slice(doppelt.index + 2))
  const o = /([^o])o([^o])/.exec(form)
  if (o && /en$/.test(form)) out.push(form.slice(0, o.index + 1) + 'oo' + form.slice(o.index + 2))
  if (/aid$/.test(form)) out.push(form.replace(/aid$/, 'ayed'))
  return out
}

const ohneEndung = (inf: string, endungen: RegExp): string => inf.replace(endungen, '')

/** Hilfsverb vertauschen: „je suis allé" ↔ „j'ai allé", „ho fatto" ↔ „sono fatto" */
function hilfsverbTausch(form: string, sprache: VerbSprache): string[] {
  if (sprache === 'fr') {
    if (/^je suis /.test(form)) return [form.replace(/^je suis /, "j'ai ").replace(/\(e\)$/, '')]
    if (/^j'ai /.test(form)) return [form.replace(/^j'ai /, 'je suis ')]
    if (/^je me suis /.test(form)) return [form.replace(/^je me suis /, "je m'ai ")]
  }
  if (sprache === 'it') {
    if (/^sono /.test(form)) return [form.replace(/^sono /, 'ho ').replace(/\/a$/, '')]
    if (/^ho /.test(form)) return [form.replace(/^ho /, 'sono ')]
  }
  return []
}

function regelmaessig(e: VerbEintrag, spalte: string, sprache: VerbSprache): string[] {
  const f = e.formen
  const inf = erste(f.inf ?? f.praes).toLowerCase()
  switch (sprache) {
    case 'en': {
      if (spalte !== 'past' && spalte !== 'pp') return []
      // Doppelte Markierung (*broughted) und -ed ohne Verdopplung (*cuted) kommen dazu
      const past = erste(f.past)
      const [verb, ...rest] = inf.split(' ')
      const ohneVerdopplung = /e$/.test(verb) ? '' : [`${verb}ed`, ...rest].join(' ')
      const doppelt = /ed$/.test(past) ? '' : `${past}${/e$/.test(past) ? 'd' : 'ed'}`
      return [edForm(inf), ...ablaute(inf), ohneVerdopplung, doppelt].filter(Boolean)
    }
    case 'fr': {
      const nousStamm = erste(f.nous).replace(/^nous (nous )?/, '').replace(/ons$/, '')
      const stamm = ohneEndung(inf.replace(/^s'/, ''), /(er|ir|re|oir)$/)
      if (spalte === 'pc') {
        const hilf = erste(f.pc).split(' ').slice(0, -1).join(' ') || "j'ai"
        return [`${hilf} ${stamm}u`, `${hilf} ${nousStamm}u`, `${hilf} ${stamm}é`].map((x) => x.replace(/\(e\)/, ''))
      }
      if (spalte === 'ils') return [`ils ${nousStamm}ent`, `ils ${stamm}ent`]
      if (spalte === 'nous') return [`nous ${stamm}ons`]
      if (spalte === 'je') return [`je ${stamm}e`, `je ${nousStamm}s`]
      if (spalte === 'fut') return [`je ${stamm}rai`, `je ${inf.replace(/e$/, '')}ai`]
      return []
    }
    case 'es': {
      const stamm = inf.slice(0, -2)
      const ar = inf.endsWith('ar')
      if (spalte === 'part') return [`${stamm}${ar ? 'ado' : 'ido'}`]
      if (spalte === 'indef') return [`${stamm}${ar ? 'é' : 'í'}`]
      if (spalte === 'yo') return [`${stamm}o`]
      if (spalte === 'nos') {
        const yo = erste(f.yo)
        return [`${yo.replace(/o$/, '')}${ar ? 'amos' : inf.endsWith('er') ? 'emos' : 'imos'}`]
      }
      return []
    }
    case 'it': {
      const stamm = inf.slice(0, -3)
      const endung = inf.slice(-3)
      if (spalte === 'pp') {
        const hilf = erste(f.pp).split(' ')[0] || 'ho'
        const part = endung === 'are' ? 'ato' : endung === 'ere' ? 'uto' : 'ito'
        return [`${hilf} ${stamm}${part}`]
      }
      if (spalte === 'io') return [`${stamm}o`]
      if (spalte === 'loro') return [`${stamm}${endung === 'are' ? 'ano' : 'ono'}`]
      return []
    }
    case 'ru': {
      const stamm = inf.replace(/(ть|ти|чь)$/, '')
      if (spalte === 'past') return [`${stamm}л`, `${inf.replace(/ть$/, '')}ил`]
      if (spalte === 'ya') return [`${stamm}ю`]
      if (spalte === 'ty') return [`${stamm}ешь`, `${stamm}ишь`]
      if (spalte === 'oni') return [`${stamm}ют`, `${stamm}ят`]
      return []
    }
    case 'la': {
      const praes = erste(f.praes).toLowerCase()
      const stamm = praes.replace(/(e|i)?o$/, '')
      if (spalte === 'perf') return [`${stamm}avi`, `${stamm}ivi`, `${stamm}si`]
      if (spalte === 'ppp') return [`${stamm}atum`, `${stamm}itum`]
      if (spalte === 'inf') return [`${stamm}are`, `${stamm}ire`]
      return []
    }
  }
}

/**
 * Plausible falsche Formen für diese Zelle – ohne die richtige(n) Form(en), ohne Dubletten.
 * Reihenfolge: zuerst die häufigsten Fehler (regelmäßige Bildung, Formverwechslung).
 */
export function fehlformen(e: VerbEintrag, spalte: string, sprache: VerbSprache): string[] {
  const richtig = new Set(varianten(e.formen[spalte] ?? '').map((x) => x.toLowerCase()))
  const zelle = erste(e.formen[spalte])
  const kandidaten = [...regelmaessig(e, spalte, sprache)]
  // Verwechslung der Formen: simple past statt past participle und umgekehrt (*have went)
  if (sprache === 'en') {
    if (spalte === 'pp') kandidaten.push(erste(e.formen.past), `${erste(e.formen.past)}en`)
    if (spalte === 'past') kandidaten.push(erste(e.formen.pp))
  }
  if (sprache === 'la' && spalte === 'ppp') kandidaten.push(erste(e.formen.perf).replace(/i$/, 'um'))
  kandidaten.push(...hilfsverbTausch(zelle, sprache), ...schreibfehler(zelle))
  const gesehen = new Set<string>()
  const out: string[] = []
  for (const k of kandidaten) {
    const x = k.trim()
    const schluessel = x.toLowerCase()
    if (!x || richtig.has(schluessel) || gesehen.has(schluessel) || x === '—') continue
    gesehen.add(schluessel)
    out.push(x)
  }
  return out
}
