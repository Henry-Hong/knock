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
// A lobby for random matches: '' is the open one, anything else a group's code.
const ROOM = /^[^\s\p{Cc}]{0,32}$/u

export type KnockEvent =
  | { type: 'connected'; peer: string; isRandom: boolean }
  | { type: 'knocked'; from: string }
  | { type: 'message'; from: string; text: string; at: number }
  | { type: 'left'; peer: string; reason: 'left' | 'timeout' }
  | { type: 'replaced' }
  | { type: 'ended' }

export type Result<T> = { ok: true; data: T } | { ok: false; status: 400 | 401 | 404 | 409; error: string }

type Live = {
  window: string
  target: string | null
  // The lobby this window waits in for a random match, and since when.
  seeking: string | null
  seekingAt: number
  peer: string | null
  isRandom: boolean
  // Who the last random match was with; the next one skips them, so /knock-next moves on.
  lastPeer: string | null
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
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS blocks (blocker TEXT NOT NULL, blocked TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (blocker, blocked))',
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
    live.seeking = null
    const other = this.live.get(to)
    if (other?.target === me && !other.peer) {
      this.pair(me, to, false)
      return ok({ state: 'connected', peer: to })
    }
    // Someone `to` blocked still connects if `to` knocks back, but never gets to ring.
    if (this.hasBlocked(to, me)) return ok({ state: 'waiting', peer: to, isNotified: false })
    // Only a window that polls hears it; otherwise the knock waits for `to` to look with /knocks.
    this.push(to, { type: 'knocked', from: me })
    return ok({ state: 'waiting', peer: to, isNotified: this.isListening(to) })
  }

  // Matches this window with whoever has waited longest in `room`, or leaves it waiting there.
  async random(
    token: string,
    window: string,
    room: string,
  ): Promise<Result<{ state: 'connected'; peer: string } | { state: 'waiting' }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    if (!ROOM.test(room)) return fail(400, 'room must be up to 32 characters, with no spaces')
    this.sweep()

    const live = this.claim(me, window)
    if (live.peer) this.part(me, 'left')
    live.target = null
    const blocked = this.blocked(me)
    const [match] = [...this.live]
      .filter(
        ([name, l]) =>
          name !== me && l.seeking === room && !l.peer && !blocked.has(name) && name !== live.lastPeer && l.lastPeer !== me,
      )
      .sort(([, a], [, b]) => a.seekingAt - b.seekingAt)
    if (match) {
      this.pair(me, match[0], true)
      return ok({ state: 'connected', peer: match[0] })
    }
    live.seeking = room
    live.seekingAt = Date.now()
    return ok({ state: 'waiting' })
  }

  // Keeps `name` out of this user's random matches and knock notices. A chat with them ends.
  async block(token: string, window: string, name: string): Promise<Result<{ blocked: string }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    if (name === me) return fail(400, 'you cannot block yourself')
    if (!this.exists(name)) return fail(404, `no user named ${name}`)
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)',
      me,
      name,
      Date.now(),
    )
    const live = this.live.get(me)
    if (live?.window === window && live.peer === name) this.part(me, 'left')
    return ok({ blocked: name })
  }

  async knocks(token: string): Promise<Result<{ from: string[] }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    this.sweep()
    const from = [...this.live]
      .filter(([name, l]) => l.target === me && !l.peer && !this.hasBlocked(me, name))
      .map(([name]) => name)
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

  // Everyone `name` blocked or was blocked by: random matches keep them apart both ways.
  private blocked(name: string): Set<string> {
    const rows = this.ctx.storage.sql
      .exec('SELECT blocked AS other FROM blocks WHERE blocker = ? UNION SELECT blocker FROM blocks WHERE blocked = ?', name, name)
      .toArray()
    return new Set(rows.map(row => row.other as string))
  }

  private hasBlocked(blocker: string, blocked: string): boolean {
    return (
      this.ctx.storage.sql.exec('SELECT 1 FROM blocks WHERE blocker = ? AND blocked = ?', blocker, blocked).toArray()
        .length > 0
    )
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
    const fresh: Live = {
      window,
      target: null,
      seeking: null,
      seekingAt: 0,
      peer: null,
      isRandom: false,
      lastPeer: null,
      queue: [],
      waiter: null,
      seenAt: Date.now(),
    }
    this.live.set(name, fresh)
    return fresh
  }

  // Connects `a` and `b`; `b` hears it, `a` learns it from its own request's reply.
  private pair(a: string, b: string, isRandom: boolean) {
    const one = this.live.get(a)!
    const other = this.live.get(b)!
    one.peer = b
    other.peer = a
    for (const live of [one, other]) {
      live.isRandom = isRandom
      live.seeking = null
    }
    this.push(b, { type: 'connected', peer: a, isRandom })
  }

  // Ends `name`'s connection, telling the peer, who drops back out of chat.
  private part(name: string, reason: 'left' | 'timeout') {
    const live = this.live.get(name)
    if (!live?.peer) return
    const peer = this.live.get(live.peer)
    if (peer) {
      if (peer.isRandom) peer.lastPeer = name
      peer.peer = null
      peer.target = null
      peer.isRandom = false
      this.push(live.peer, { type: 'left', peer: name, reason })
    }
    if (live.isRandom) live.lastPeer = live.peer
    live.peer = null
    live.target = null
    live.isRandom = false
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
