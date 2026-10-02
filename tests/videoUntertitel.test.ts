import { describe, expect, it } from 'vitest'
import { alsTranskript, buendele, leseWebVtt, sekundenAus } from '../src/main/services/sources/untertitel'
import { ardKennung, arteKennung, arteUntertitelSpur, mediathekVon, zdfSchluessel, zdfVideos, zdfWahl } from '../src/main/services/sources/mediathek'

describe('arte', () => {
  it('Kennung und Sprache aus der Adresse, Untertitel aus dem Manifest: Seitensprache, nicht erzwungen', () => {
    expect(mediathekVon('https://www.arte.tv/de/videos/111670-000-A/gedaechtnisverlust/')).toBe('arte')
    expect(arteKennung('https://www.arte.tv/de/videos/111670-000-A/gedaechtnisverlust/')).toEqual({ sprache: 'de', id: '111670-000-A' })
    const manifest = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio_0",LANGUAGE="de",NAME="Deutsch",URI="medias/aud_de.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subtitle_0",LANGUAGE="fr",NAME="Französisch",FORCED=YES,URI="medias/st_fr_forced.m3u8"',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subtitle_0",LANGUAGE="de",NAME="Deutsch (Für Gehörlose)",FORCED=NO,URI="https://cdn.example/medias/st_de.m3u8"'
    ].join('\n')
    expect(arteUntertitelSpur(manifest, 'de', 'https://manifest.example/x/111670-000-A.m3u8')).toBe('https://cdn.example/medias/st_de.m3u8')
    expect(arteUntertitelSpur(manifest, 'fr', 'https://manifest.example/x/a.m3u8')).toBe('https://manifest.example/x/medias/st_fr_forced.m3u8')
  })
})

/*
 * Hör-/Sehverstehen mit Videos aus dem Netz (02.10.2026): Untertitel mit Zeitmarken aus YouTube,
 * ARD- und ZDF-Mediathek. Die Formen hier sind echten Antworten vom 02.10.2026 nachgebildet.
 */

const VTT = `WEBVTT

1
00:00:00.000 --> 00:00:01.000 align:middle
<c.S3>UNTERTITEL: Hessischer Rundfunk</c>

2
00:00:01.120 --> 00:00:02.400 align:middle
<c.S4>Der erste Schultag.</c>

3
00:00:02.520 --> 00:00:05.880 align:middle
<c.S4>Aufregung, Neugierde</c>
<c.S4>und auch ein bisschen Angst.</c>

4
00:00:31.000 --> 00:00:33.000
Das bin ich heute.
`

describe('Untertitel mit Zeitmarken', () => {
  it('liest WebVTT ohne Senderkennung und Formatierung', () => {
    const z = leseWebVtt(VTT)
    expect(z.map((x) => x.text)).toEqual(['Der erste Schultag.', 'Aufregung, Neugierde und auch ein bisschen Angst.', 'Das bin ich heute.'])
    expect(z[0].start).toBeCloseTo(1.12)
  })

  it('bündelt zu Abschnitten von etwa 20 Sekunden und schreibt [m:ss] davor', () => {
    expect(buendele(leseWebVtt(VTT))).toHaveLength(2)
    expect(alsTranskript(leseWebVtt(VTT))).toBe('[0:01] Der erste Schultag. Aufregung, Neugierde und auch ein bisschen Angst.\n[0:31] Das bin ich heute.')
    expect(sekundenAus('01:02:03.500')).toBeCloseTo(3723.5)
    expect(sekundenAus('62.5s')).toBeCloseTo(62.5)
  })
})

describe('Mediatheken erkennen', () => {
  it('ordnet Adressen ARD und ZDF zu, alles andere nicht', () => {
    expect(mediathekVon('https://www.ardmediathek.de/video/y-history/aussortiert/hr/Y3JpZDovL2hyLmRlL3NlbmR1bmcvMTIzNDU2')).toBe('ard')
    expect(mediathekVon('https://www.zdf.de/reportagen/alpenueberquerung-bis-an-die-grenzen-100')).toBe('zdf')
    expect(mediathekVon('https://www.youtube.com/watch?v=abc')).toBeNull()
    expect(ardKennung('https://www.ardmediathek.de/video/y-history/aussortiert/hr/Y3JpZDovL2hyLmRlL3NlbmR1bmcvMTIzNDU2')).toBe('Y3JpZDovL2hyLmRlL3NlbmR1bmcvMTIzNDU2')
  })

  it('ZDF: Schlüssel und Videos aus der Seite, gewählt wird das längste oder das im Fokus', () => {
    const html =
      'x\\"appToken\\":{\\"apiToken\\":\\"ahBaeMeekaiy5ohsai4bee4ki6Oopoi5quailieb\\"} ' +
      '{\\"canonical\\":\\"trailer-100\\",\\"currentMedia\\":{\\"nodes\\":[{\\"ptmdTemplate\\":\\"/tmd/2/{playerId}/vod/ptmd/mediathek/trailer/1\\",\\"vodMediaType\\":\\"DEFAULT\\",\\"duration\\":73}]}} ' +
      '{\\"canonical\\":\\"folge-1-100\\",\\"currentMedia\\":{\\"nodes\\":[{\\"ptmdTemplate\\":\\"/tmd/2/{playerId}/vod/ptmd/mediathek/folge1/2\\",\\"vodMediaType\\":\\"DEFAULT\\",\\"duration\\":898}]}}'
    expect(zdfSchluessel(html)).toBe('ahBaeMeekaiy5ohsai4bee4ki6Oopoi5quailieb')
    const videos = zdfVideos(html)
    expect(videos.map((v) => v.dauer)).toEqual([73, 898])
    expect(zdfWahl(videos, html, 'https://www.zdf.de/reportagen/x-100')).toBe('/tmd/2/{playerId}/vod/ptmd/mediathek/folge1/2')
    expect(zdfWahl(videos, html, 'https://www.zdf.de/reportagen/x-100#focus=trailer-100')).toBe('/tmd/2/{playerId}/vod/ptmd/mediathek/trailer/1')
  })
})
