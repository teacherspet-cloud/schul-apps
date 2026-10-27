import { describe, expect, it, vi } from 'vitest'

/*
 * Google 429 der Gratisstufe (27.10.2026, Befund der Lehrkraft: „Kontingent erschöpft" nach zwei Aufgaben beim
 * Vokabeltest). Googles Meldung nennt je Verstoß Grenze und Modell: limit: 0 = Modell gibt es in der Gratisstufe nicht
 * (Pro-Klasse, Bildmodelle); sonst Tageskontingent oder Minuten-Tempo – nur Letzteres ist vorübergehend.
 */
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' }, safeStorage: { isEncryptionAvailable: () => false } }))

import { googleKontingent } from '../src/main/services/ai/google'

const ohne =
  'You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-4-argon, description: Generate content requests per day limit exceeded on Free Tier. See https://ai.google.dev/gemini-api/docs/rate-limits.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-4-argon, description: Generate content requests per minute limit exceeded on Free Tier. See https://ai.google.dev/gemini-api/docs/rate-limits.\nPlease retry in 13h40m35.566181119s.'
const minute =
  'You exceeded your current quota.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10, model: gemini-3.8-flash, description: Generate content requests per minute limit exceeded on Free Tier. See https://ai.google.dev/gemini-api/docs/rate-limits.\nPlease retry in 41.3s.'
const tag =
  'You exceeded your current quota.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 250, model: gemini-3.8-flash, description: Generate content requests per day limit exceeded on Free Tier.\nPlease retry in 5h2m1.5s.'

describe('Google 429 der Gratisstufe', () => {
  it('Modell ohne Kontingent (limit: 0), Tageskontingent, Minuten-Tempo mit Wartezeit', () => {
    expect(googleKontingent(ohne)).toMatchObject({ art: 'ohne', model: 'gemini-4-argon' })
    expect(googleKontingent(minute)).toMatchObject({ art: 'minute', model: 'gemini-3.8-flash', wartenMs: 41300 })
    expect(googleKontingent(tag)).toMatchObject({ art: 'tag', model: 'gemini-3.8-flash', wartenMs: (5 * 3600 + 2 * 60 + 1.5) * 1000 })
  })
  it('ohne Einzelheiten: „quota/billing" unbekannt, sonst Tempo', () => {
    expect(googleKontingent('Rate limit exceeded').art).toBe('minute')
    expect(googleKontingent('You exceeded your current quota, please check your plan and billing details.').art).toBe('unbekannt')
  })
})
