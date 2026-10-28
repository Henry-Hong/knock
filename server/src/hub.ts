import { DurableObject } from 'cloudflare:workers'

// One Hub holds every user. Accounts live in SQLite; who is knocking or
// connected lives in memory, since it only matters while windows poll.

// A mod's $.http.fetch gives up at 30 s, so a poll is held well under that.
const POLL_HOLD_MS = 20_000
// A window that has not polled for this long is treated as closed.
const STALE_MS = 45_000
// A window between two polls is still listening for this long.
const LISTENING_GAP_MS = 5_000
const MAX_TEXT = 4_000
const NAME = /^[a-z0-9][a-z0-9_-]{1,19}$/

export type KnockEvent =
  | { type: 'connected'; peer: string }
  | { type: 'knocked'; from: string }
  | { type: 'message'; from: string; text: string; at: number }
  | { type: 'left'; peer: string; reason: 'left' | 'timeout' }
  | { type: 'replaced' }
  | { type: 'ended' }

export type Result<T> = { ok: true; data: T } | { ok: false; status: 400 | 401 | 404 | 409; error: string }

type Live = {
  window: string
  target: string | null
  peer: string | null
  queue: KnockEvent[]
  waiter: ((events: KnockEvent[]) => void) | null
  seenAt: number
}

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const fail = (status: 400 | 401 | 404 | 409, error: string): Result<never> => ({ ok: false, status, error })

async function hash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export class Hub extends DurableObject<Env> {
  private live = new Map<string, Live>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)',
    )
  }

  async register(name: string): Promise<Result<{ name: string; token: string }>> {
    if (!NAME.test(name)) return fail(400, 'name must be 2-20 chars of a-z, 0-9, _ or -, starting with a letter or digit')
    if (this.exists(name)) return fail(409, `${name} is taken`)
    const token = crypto.randomUUID()
    this.ctx.storage.sql.exec(
      'INSERT INTO users (name, token_hash, created_at) VALUES (?, ?, ?)',
      name,
      await hash(token),
      Date.now(),
    )
    return ok({ name, token })
  }

  async knock(
    token: string,
    window: string,
    to: string,
  ): Promise<Result<{ state: 'connected'; peer: string } | { state: 'waiting'; peer: string; isNotified: boolean }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    if (to === me) return fail(400, 'you cannot knock on yourself')
    if (!this.exists(to)) return fail(404, `no user named ${to}`)
    this.sweep()

    const live = this.claim(me, window)
    if (live.peer === to) return ok({ state: 'connected', peer: to })
    if (live.peer) this.part(me, 'left')

    live.target = to
    const other = this.live.get(to)
    if (other?.target === me && !other.peer) {
      live.peer = to
      other.peer = me
      this.push(to, { type: 'connected', peer: me })
      return ok({ state: 'connected', peer: to })
    }
    // Only a window that polls hears it; otherwise the knock waits for `to` to look with /knocks.
    this.push(to, { type: 'knocked', from: me })
    return ok({ state: 'waiting', peer: to, isNotified: this.isListening(to) })
  }

  async knocks(token: string): Promise<Result<{ from: string[] }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    this.sweep()
    const from = [...this.live].filter(([, l]) => l.target === me && !l.peer).map(([name]) => name)
    return ok({ from })
  }

  async send(token: string, window: string, text: string): Promise<Result<{ to: string }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    const live = this.live.get(me)
    if (!live || live.window !== window || !live.peer) return fail(409, 'not connected')
    if (!text.trim()) return fail(400, 'empty message')
    if (text.length > MAX_TEXT) return fail(400, `message is over ${MAX_TEXT} chars`)
    this.push(live.peer, { type: 'message', from: me, text, at: Date.now() })
    return ok({ to: live.peer })
  }

  async leave(token: string, window: string): Promise<Result<{}>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    const live = this.live.get(me)
    if (live?.window === window) {
      this.part(me, 'left')
      live.waiter?.([])
      this.live.delete(me)
    }
    return ok({})
  }

  async poll(token: string, window: string, holdMs = POLL_HOLD_MS): Promise<Result<{ events: KnockEvent[] }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    this.sweep()
    const live = this.live.get(me)
    if (!live) return ok({ events: [{ type: 'ended' }] })
    if (live.window !== window) return ok({ events: [{ type: 'replaced' }] })

    live.seenAt = Date.now()
    if (live.queue.length) return ok({ events: live.queue.splice(0) })

    live.waiter?.([])
    const events = await new Promise<KnockEvent[]>(resolve => {
      const timer = setTimeout(() => settle([]), Math.min(Math.max(holdMs, 0), POLL_HOLD_MS))
      const settle = (events: KnockEvent[]) => {
        clearTimeout(timer)
        if (live.waiter === settle) live.waiter = null
        resolve(events)
      }
      live.waiter = settle
    })
    live.seenAt = Date.now()
    return ok({ events })
  }

  private exists(name: string): boolean {
    return this.ctx.storage.sql.exec('SELECT 1 FROM users WHERE name = ?', name).toArray().length > 0
  }

  private async auth(token: string): Promise<string | null> {
    if (!token) return null
    const row = this.ctx.storage.sql.exec('SELECT name FROM users WHERE token_hash = ?', await hash(token)).toArray()[0]
    return (row?.name as string | undefined) ?? null
  }

  // A window takes over its user: an older window of the same user is told to stop.
  private claim(name: string, window: string): Live {
    const current = this.live.get(name)
    if (current?.window === window) return current
    if (current) {
      current.waiter?.([{ type: 'replaced' }])
      current.waiter = null
      current.window = window
      current.queue = []
      current.seenAt = Date.now()
      return current
    }
    const fresh: Live = { window, target: null, peer: null, queue: [], waiter: null, seenAt: Date.now() }
    this.live.set(name, fresh)
    return fresh
  }

  // Ends `name`'s connection, telling the peer, who drops back out of chat.
  private part(name: string, reason: 'left' | 'timeout') {
    const live = this.live.get(name)
    if (!live?.peer) return
    const peer = this.live.get(live.peer)
    if (peer) {
      peer.peer = null
      peer.target = null
      this.push(live.peer, { type: 'left', peer: name, reason })
    }
    live.peer = null
    live.target = null
  }

  // A poll is held, or one just ended and the next is on its way.
  private isListening(name: string): boolean {
    const live = this.live.get(name)
    return !!live && (!!live.waiter || Date.now() - live.seenAt < LISTENING_GAP_MS)
  }

  private push(name: string, event: KnockEvent) {
    const live = this.live.get(name)
    if (!live) return
    if (live.waiter) live.waiter([...live.queue.splice(0), event])
    else live.queue.push(event)
  }

  private sweep() {
    const now = Date.now()
    for (const [name, live] of this.live) {
      if (live.waiter || now - live.seenAt < STALE_MS) continue
      this.part(name, 'timeout')
      this.live.delete(name)
    }
  }
}
