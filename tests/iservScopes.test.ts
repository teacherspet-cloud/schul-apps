import { describe, expect, it } from 'vitest'
import { scopeStufen } from '../src/server/anmeldung'

describe('IServ: Rückfall bei invalid_scope (09.10.2026)', () => {
  it('fragt der Reihe nach weniger an, ohne Doppelte', () => {
    const s = scopeStufen('openid profile email roles groups iserv:roles iserv:groups')
    expect(s[0]).toBe('openid profile email roles groups iserv:roles iserv:groups')
    expect(s).toContain('openid profile email')
    expect(s.at(-1)).toBe('openid profile')
    expect(new Set(s).size).toBe(s.length)
  })
  it('eine schon schlanke Einstellung wird nicht wiederholt', () => {
    expect(scopeStufen('openid  profile email')).toEqual(['openid profile email', 'openid profile'])
  })
})

describe('IServ: Client-Geheimnis im Formular (client_secret_post, 09.10.2026)', () => {
  it('schickt das Geheimnis im Formular statt im Basic-Kopf und nennt IServs Fehlercode', async () => {
    const { randomBytes } = await import('node:crypto')
    const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
    const { datenbankFuerTests, setzeServerWert, setzeServerGeheimnis } = await import('../src/server/datenbank')
    const { iservAnmeldeAdresse, iservRueckruf } = await import('../src/server/anmeldung')
    setzeSchluesselFuerTests(randomBytes(32))
    datenbankFuerTests()
    setzeServerWert('iserv', { aussteller: 'https://iserv.test', clientId: 'cid', scopes: 'openid profile email' })
    setzeServerGeheimnis('iserv-client', 'g+eh/eim')
    const anfragen: { url: string; init?: RequestInit }[] = []
    const abruf = (async (url: string, init?: RequestInit) => {
      anfragen.push({ url, init })
      if (url.endsWith('/.well-known/openid-configuration'))
        return new Response(
          JSON.stringify({
            issuer: 'https://iserv.test',
            authorization_endpoint: 'https://iserv.test/auth',
            token_endpoint: 'https://iserv.test/token',
            userinfo_endpoint: 'https://iserv.test/userinfo',
            token_endpoint_auth_methods_supported: ['client_secret_post']
          })
        )
      return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Code abgelaufen' }), { status: 400 })
    }) as typeof fetch
    const { state } = await iservAnmeldeAdresse('https://app.test/auth/rueckruf', '/', abruf)
    await expect(iservRueckruf('https://app.test/auth/rueckruf', state, 'code1', abruf)).rejects.toThrow(/400 – invalid_grant: Code abgelaufen/)
    const t = anfragen.find((a) => a.url === 'https://iserv.test/token')!
    const kopf = t.init?.headers as Record<string, string>
    expect(kopf.authorization).toBeUndefined()
    const form = new URLSearchParams(String(t.init?.body))
    expect(form.get('client_secret')).toBe('g+eh/eim')
    expect(form.get('client_id')).toBe('cid')
  })
})

describe('Namensschutz: buchstabierte Abkürzungen sind keine Initialen (09.10.2026)', () => {
  it('„T. T. S." im Hörtext sperrt nicht wegen Gästen „Tom T." / „Tara S.", der volle Name schon', async () => {
    const { musterFuer, gefundeneNamen } = await import('../src/server/namensfilter')
    const m = musterFuer([
      { vorname: 'Tom', nachname: 'T.', streng: true },
      { vorname: 'Tara', nachname: 'S.', streng: true },
      { vorname: 'Max', nachname: 'Mustermann' }
    ], { sprache: 'en' })
    expect(gefundeneNamen('T. T. S. students wear school uniform.', m)).toEqual([])
    expect(gefundeneNamen('How long are lessons at T. T. S.?', m)).toEqual([])
    expect(gefundeneNamen('Tom T. is late.', m)).toContain('Tom T.')
    expect(gefundeneNamen('M. Mustermann was here.', m)).toContain('M. Mustermann')
  })
})
