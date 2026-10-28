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
// A lobby for random matches: '' is the open one, anything else a group's code. Group rooms
// are named the same way, without the empty one.
const ROOM = /^[^\s\p{Cc}]{0,32}$/u
const GROUP_MAX = 8
// The colors a name can be drawn in; the client picks the shades.
const COLORS = ['red', 'orange', 'yellow', 'green', 'sky', 'blue', 'purple', 'pink']

export type KnockEvent =
  | { type: 'connected'; peer: string; isRandom: boolean }
  | { type: 'knocked'; from: string }
  // `group` is set when it was said in a group room, with the sender's `color` if they picked one;
  // `isClaude` when it is Claude's answer to `from`, who asked with @claude.
  | { type: 'message'; from: string; text: string; at: number; group?: string; color?: string; isClaude?: true }
  | { type: 'left'; peer: string; reason: 'left' | 'timeout' }
  // Someone came into or went out of this window's group room; count is how many are in it now.
  | { type: 'joined'; name: string; count: number }
  | { type: 'departed'; name: string; count: number; reason: 'left' | 'timeout' }
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
  // The group room this user is in, instead of a peer.
  group: string | null
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
  // Who is in each group room. A room exists while someone is in it.
  private groups = new Map<string, Set<string>>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)',
    )
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS blocks (blocker TEXT NOT NULL, blocked TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (blocker, blocked))',
    )
    const columns = ctx.storage.sql.exec('PRAGMA table_info(users)').toArray().map(column => column.name)
    if (!columns.includes('color')) ctx.storage.sql.exec('ALTER TABLE users ADD COLUMN color TEXT')
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
    this.depart(me, 'left')

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
    this.depart(me, 'left')
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

  // Joins the group room `group`, leaving any chat this window is in, unless the room is full.
  async join(token: string, window: string, group: string): Promise<Result<{ group: string; members: string[] }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    if (!group || !ROOM.test(group)) return fail(400, 'room name must be 1-32 characters, with no spaces')
    this.sweep()

    const live = this.claim(me, window)
    const room = this.groups.get(group) ?? new Set<string>()
    if (live.group === group) return ok({ group, members: [...room] })
    if (room.size >= GROUP_MAX) return fail(409, `room is full (${GROUP_MAX})`)
    if (live.peer) this.part(me, 'left')
    this.depart(me, 'left')
    live.target = null
    live.seeking = null

    for (const name of room) this.push(name, { type: 'joined', name: me, count: room.size + 1 })
    room.add(me)
    this.groups.set(group, room)
    live.group = group
    return ok({ group, members: [...room] })
  }

  async me(token: string): Promise<Result<{ name: string; color: string | null }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    return ok({ name: me, color: this.colorOf(me) })
  }

  // Sets the color this user's name is drawn in; '' goes back to none picked.
  async setColor(token: string, color: string): Promise<Result<{ name: string; color: string | null }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    if (color && !COLORS.includes(color)) return fail(400, `color must be one of ${COLORS.join(', ')}`)
    this.ctx.storage.sql.exec('UPDATE users SET color = ? WHERE name = ?', color || null, me)
    return ok({ name: me, color: color || null })
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

  // Hands `text` to the peer, or to everyone else in the group room but those blocked either way.
  // `isClaude`: the text is Claude's answer to this user's @claude.
  async send(token: string, window: string, text: string, isClaude = false): Promise<Result<{ to: string[] }>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    const live = this.live.get(me)
    if (!live || live.window !== window || !(live.peer || live.group)) return fail(409, 'not connected')
    if (!text.trim()) return fail(400, 'empty message')
    if (text.length > MAX_TEXT) return fail(400, `message is over ${MAX_TEXT} chars`)
    const at = Date.now()
    const claude = isClaude ? { isClaude: true as const } : {}
    if (live.peer) {
      this.push(live.peer, { type: 'message', from: me, text, at, ...claude })
      return ok({ to: [live.peer] })
    }
    const group = live.group!
    const blocked = this.blocked(me)
    const to = [...(this.groups.get(group) ?? [])].filter(name => name !== me && !blocked.has(name))
    const color = this.colorOf(me) ?? undefined
    for (const name of to) this.push(name, { type: 'message', from: me, text, at, group, color, ...claude })
    return ok({ to })
  }

  async leave(token: string, window: string): Promise<Result<{}>> {
    const me = await this.auth(token)
    if (!me) return fail(401, 'unknown token')
    const live = this.live.get(me)
    if (live?.window === window) {
      this.part(me, 'left')
      this.depart(me, 'left')
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

  private colorOf(name: string): string | null {
    const row = this.ctx.storage.sql.exec('SELECT color FROM users WHERE name = ?', name).toArray()[0]
    return (row?.color as string | null | undefined) ?? null
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
      group: null,
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

  // Takes `name` out of its group room, telling whoever stays. The last one out closes the room.
  private depart(name: string, reason: 'left' | 'timeout') {
    const live = this.live.get(name)
    const group = live?.group
    if (!live || !group) return
    live.group = null
    const room = this.groups.get(group)
    if (!room) return
    room.delete(name)
    if (!room.size) this.groups.delete(group)
    for (const other of room) this.push(other, { type: 'departed', name, count: room.size, reason })
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
      this.depart(name, 'timeout')
      this.live.delete(name)
    }
  }
}
