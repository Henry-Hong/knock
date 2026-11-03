import { Hono, type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { PHOTO_FORMATS, type PhotoFormat, type Result } from './hub'

export { Hub } from './hub'

type App = { Bindings: Env }

const app = new Hono<App>()

const hub = (c: Context<App>) => c.env.HUB.get(c.env.HUB.idFromName('hub'))
const token = (c: Context<App>) => c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
const body = async (c: Context<App>): Promise<Record<string, unknown>> => c.req.json().catch(() => ({}))
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const reply = <T>(c: Context<App>, r: Result<T>) =>
  r.ok ? c.json(r.data as object) : c.json({ error: r.error }, r.status as ContentfulStatusCode)

// Floods stop here, before they reach the Hub.
const ip = (c: Context<App>) => c.req.header('cf-connecting-ip') ?? 'local'
const tooMany = (c: Context<App>) => c.json({ error: 'too many requests, slow down' }, 429)
const limitBy = (limiter: (c: Context<App>) => RateLimit, key: (c: Context<App>) => string) =>
  createMiddleware<App>(async (c, next) => {
    if (!(await limiter(c).limit({ key: key(c) })).success) return tooMany(c)
    await next()
  })
const perIp = limitBy(c => c.env.IP_LIMIT, ip)
const perSignup = limitBy(c => c.env.REGISTER_LIMIT, ip)
const perUser = limitBy(c => c.env.USER_LIMIT, token)

app.use('*', perIp)

app.get('/', c => c.text('knock relay'))

app.get('/stats', async c => c.json(await hub(c).stats()))

app.post('/register', perSignup, async c => {
  const { name } = await body(c)
  return reply(c, await hub(c).register(str(name)))
})

app.post('/knock', perUser, async c => {
  const { window, to } = await body(c)
  return reply(c, await hub(c).knock(token(c), str(window), str(to)))
})

app.get('/knocks', perUser, async c => reply(c, await hub(c).knocks(token(c))))

app.post('/random', perUser, async c => {
  const { window, room } = await body(c)
  return reply(c, await hub(c).random(token(c), str(window), str(room)))
})

app.post('/room', perUser, async c => {
  const { window, room } = await body(c)
  return reply(c, await hub(c).join(token(c), str(window), str(room)))
})

app.get('/me', perUser, async c => reply(c, await hub(c).me(token(c))))

app.post('/me', perUser, async c => {
  const { color } = await body(c)
  return reply(c, await hub(c).setColor(token(c), str(color)))
})

app.post('/block', perUser, async c => {
  const { window, name } = await body(c)
  return reply(c, await hub(c).block(token(c), str(window), str(name)))
})

app.post('/send', perUser, async c => {
  const { window, text, claude } = await body(c)
  return reply(c, await hub(c).send(token(c), str(window), str(text), claude === true))
})

app.post('/pic', perUser, async c => {
  const { window, png } = await body(c)
  return reply(c, await hub(c).picture(token(c), str(window), str(png)))
})

// A photo is a picture file as it is, up to what a Worker takes in one request. Its bytes stream
// straight into R2 and never reach the Hub, which only tells the chat its id.
const PHOTO_MAX = 100 * 1000 * 1000
const MIME: Record<PhotoFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
}
const PHOTO_ID = /^[0-9a-f]{32}$/
const side = (v: string | undefined) => Math.max(0, Math.min(1_000_000, Math.floor(Number(v) || 0)))

app.post('/photo', perUser, async c => {
  const window = c.req.query('window') ?? ''
  const format = c.req.query('format') as PhotoFormat
  if (!PHOTO_FORMATS.includes(format)) return c.json({ error: `a photo is one of ${PHOTO_FORMATS.join(', ')}` }, 400)
  const size = Number(c.req.header('content-length'))
  if (!size || !c.req.raw.body) return c.json({ error: 'a photo needs its length' }, 411)
  if (size > PHOTO_MAX) return c.json({ error: 'a photo is up to 100 MB' }, 413)
  const start = await hub(c).photoStart(token(c), window)
  if (!start.ok) return reply(c, start)
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('')
  await c.env.PHOTOS.put(id, c.req.raw.body, {
    httpMetadata: { contentType: MIME[format] },
    customMetadata: { from: start.data.from, to: start.data.to.join(' ') },
  })
  const photo = { id, format, size, width: side(c.req.query('width')), height: side(c.req.query('height')) }
  const sent = await hub(c).photoSent(token(c), window, photo, start.data.to)
  return sent.ok ? c.json({ ...photo, to: sent.data.to }) : reply(c, sent)
})

// Only its sender and those it was sent to get a photo; to anyone else it is not there.
app.get('/photo/:id', perUser, async c => {
  const id = c.req.param('id')
  const me = PHOTO_ID.test(id) ? await hub(c).whoIs(token(c)) : null
  const photo = me ? await c.env.PHOTOS.get(id) : null
  const meta = photo?.customMetadata ?? {}
  if (!photo || (meta.from !== me && !(meta.to ?? '').split(' ').includes(me!))) {
    return c.json({ error: 'no such photo: it may be over a day old' }, 404)
  }
  return new Response(photo.body, {
    headers: { 'content-type': photo.httpMetadata?.contentType ?? 'application/octet-stream', 'content-length': String(photo.size) },
  })
})

app.post('/leave', perUser, async c => {
  const { window, closed } = await body(c)
  return reply(c, await hub(c).leave(token(c), str(window), closed === true))
})

app.get('/poll', async c => {
  const hold = Number(c.req.query('hold'))
  const canPhoto = c.req.query('photos') === '1'
  return reply(c, await hub(c).poll(token(c), c.req.query('window') ?? '', Number.isFinite(hold) ? hold : undefined, canPhoto))
})

export default app
