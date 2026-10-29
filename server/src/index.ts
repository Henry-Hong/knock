import { Hono, type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { Result } from './hub'

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

app.post('/leave', perUser, async c => {
  const { window } = await body(c)
  return reply(c, await hub(c).leave(token(c), str(window)))
})

app.get('/poll', async c => {
  const hold = Number(c.req.query('hold'))
  return reply(c, await hub(c).poll(token(c), c.req.query('window') ?? '', Number.isFinite(hold) ? hold : undefined))
})

export default app
