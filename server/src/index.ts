import { Hono, type Context } from 'hono'
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

app.get('/', c => c.text('knock relay'))

app.post('/register', async c => {
  const { name } = await body(c)
  return reply(c, await hub(c).register(str(name)))
})

app.post('/knock', async c => {
  const { window, to } = await body(c)
  return reply(c, await hub(c).knock(token(c), str(window), str(to)))
})

app.get('/knocks', async c => reply(c, await hub(c).knocks(token(c))))

app.post('/send', async c => {
  const { window, text } = await body(c)
  return reply(c, await hub(c).send(token(c), str(window), str(text)))
})

app.post('/leave', async c => {
  const { window } = await body(c)
  return reply(c, await hub(c).leave(token(c), str(window)))
})

app.get('/poll', async c => {
  const hold = Number(c.req.query('hold'))
  return reply(c, await hub(c).poll(token(c), c.req.query('window') ?? '', Number.isFinite(hold) ? hold : undefined))
})

export default app
