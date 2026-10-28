import type { EngineInterface, Register } from 'claude-code'

import type { Chat, KnockEvent } from '../types'

type $ = EngineInterface
type Reply = { status: number; data: Record<string, unknown> | null }
type Message = Extract<KnockEvent, { type: 'message' }>

const DEFAULT_SERVER = 'https://knock.everwish.workers.dev'
const ME = { plugin: 'knock', key: 'me' } as const
const CHAT = { plugin: 'knock', key: 'chat' } as const
const RELAYED = { plugin: 'knock', key: 'relayed' } as const

// The server holds a poll up to 20 s; a mod's fetch gives up at 30 s.
const POLL_HOLD_MS = 20_000
// A chat turn keeps listening after a reply, so the peer's next messages land in it
// rather than in a turn knock has to open (which the engine labels). It ends after this much silence.
const LISTEN_MS = 30 * 60_000
// A turn.step hook gets 10 s of its own time per response, sleeps included: type out
// replies only while this much is left, and end the turn before it runs out.
const ANIMATE_MS = 3_000
const RESERVE_MS = 1_000

// Module state starts over on a hot reload; at worst a message is never drawn.
let loop = 0 // bumped to stop the background poll loop
let isStepping = false // a chat turn is answering, and polls for itself
let isInboxTurnQueued = false // a 📨 turn is already on its way to show the inbox
let inbox: Message[] = []
let stopWaiting: (() => void) | null = null
const pendingTurns: string[] = [] // prompt texts whose turns the peer answers
const chatTurns = new Set<string>() // every step of these turns is the peer's, until the turn completes
const runningTurns = new Set<string>() // a command's output waits for these to end, so say it as a notice

const serverOf = async ($: $) => (await $.env.get('KNOCK_SERVER')) ?? DEFAULT_SERVER

async function accountsOf($: $, server: string): Promise<Record<string, string>> {
  const stored = await $.store.get(`accounts:${server}`)
  return stored && typeof stored === 'object' ? (stored as Record<string, string>) : {}
}

async function api($: $, method: 'GET' | 'POST', path: string, body?: object): Promise<Reply> {
  const server = await serverOf($)
  const { value: me } = await $.state.get(ME)
  const token = me ? (await accountsOf($, server))[me] : undefined
  const res = await $.http.fetch(server + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data: Reply['data'] = null
  try {
    data = JSON.parse(res.text)
  } catch {}
  return { status: res.status, data }
}

const poll = async ($: $, holdMs: number) =>
  api($, 'GET', `/poll?window=${encodeURIComponent(await $.session.id())}&hold=${holdMs}`)

const errorOf = (r: Reply) =>
  r.status === 429 ? '요청이 너무 많아요. 잠깐 뒤에 다시 해 주세요' : String(r.data?.error ?? `HTTP ${r.status}`)
// Worth trying again: the server is down for a moment, or we went over its rate limit.
const isPassing = (r: Reply) => r.status >= 500 || r.status === 429
const eventsOf = (r: Reply) => (r.data?.events ?? []) as KnockEvent[]

// A line for `claude --debug-file` alone, led by the plugin's name.
const dbg = ($: $, text: string) => $.ui.log(text, { to: 'debug' })

// A row in the transcript the person sees and the model never reads.
const notice = ($: $, text: string) => $.ui.log(text)

async function showStatus($: $, chat: Chat | null) {
  const { value: me } = await $.state.get(ME)
  $.ui.status(chat ? (chat.isConnected ? `💬 ${me} ↔ ${chat.peer}` : `⏳ ${me} → ${chat.peer} 기다리는 중`) : undefined)
}

const connectedText = (peer: string) =>
  `💬 ${peer} 님과 연결됐어요. 이제 입력하는 건 ${peer} 님한테 가고, 답장은 Claude 답변 자리에 떠요. 끝내려면 /knock-off`

const relayNote = (peers: string[]) =>
  `Note from the knock plugin: earlier in this session the user chatted with their friend ${peers.join(', ')} through knock. ` +
  'In that stretch the user\'s messages went to the friend, and every assistant message was written by the friend and relayed, not by you. ' +
  'Treat that stretch as their private chat, not as things you said.'

function startLoop($: $) {
  const id = ++loop
  $.clock.after(0, () => void pollOnce($, id))
}

async function endChat($: $) {
  loop++
  const { value: chat } = await $.state.get(CHAT)
  if (chat?.isConnected) {
    const { value: relayed = [] } = await $.state.get(RELAYED)
    if (!relayed.includes(chat.peer)) await $.state.set(RELAYED, [...relayed, chat.peer])
  }
  await $.state.set(CHAT, null)
  await showStatus($, null)
  pendingTurns.length = 0
  for (const m of inbox.splice(0)) notice($, `${m.from}: ${m.text}`)
  stopWaiting?.()
}

// Messages wait in the inbox for a chat turn to show them; the rest is said at once.
async function take($: $, events: KnockEvent[]) {
  for (const event of events) {
    if (event.type === 'message') inbox.push(event)
    else await onEvent($, event)
  }
}

async function onEvent($: $, event: Exclude<KnockEvent, Message>) {
  // A poll that lands after /knock-off reports the end it already announced.
  const isOver = event.type === 'left' || event.type === 'replaced' || event.type === 'ended'
  if (isOver && !(await $.state.get(CHAT)).value) return
  switch (event.type) {
    case 'connected': {
      const chat = { peer: event.peer, isConnected: true }
      await $.state.set(CHAT, chat)
      await showStatus($, chat)
      notice($, connectedText(event.peer))
      return
    }
    case 'knocked':
      notice($, `🚪 ${event.from} 님이 노크했어요. /knock ${event.from} 하면 연결돼요.`)
      return
    case 'left':
      await endChat($)
      notice(
        $,
        event.reason === 'timeout'
          ? `${event.peer} 님 연결이 끊겼어요. 다시 Claude랑 대화해요.`
          : `${event.peer} 님이 나갔어요. 다시 Claude랑 대화해요.`,
      )
      return
    case 'replaced':
      await endChat($)
      notice($, '다른 창에서 knock을 열어서, 이 창은 연결을 넘겨줬어요.')
      return
    case 'ended':
      await endChat($)
      notice($, '연결이 끝났어요. 다시 하려면 /knock <이름>')
  }
}

// Between chat turns the background loop polls; messages it gets start a 📨 turn.
async function pollOnce($: $, id: number) {
  if (id !== loop) return
  let r: Reply | null = null
  try {
    r = await poll($, POLL_HOLD_MS)
  } catch {}
  if (r?.status === 200) await take($, eventsOf(r))
  if (id !== loop) return
  if (!r || isPassing(r)) {
    $.clock.after(3000, () => void pollOnce($, id))
    return
  }
  if (r.status !== 200) {
    await endChat($)
    notice($, `knock: 연결이 끊겼어요 (${errorOf(r)})`)
    return
  }
  showInbox($)
  if (id === loop) $.clock.after(0, () => void pollOnce($, id))
}

function showInbox($: $) {
  const first = inbox[0]
  if (!first || isStepping || isInboxTurnQueued) return
  isInboxTurnQueued = true
  const text = `📨 ${first.from}`
  pendingTurns.push(text)
  // asUser drops the "The knock plugin sent a message" frame meant for the model.
  void $.prompt.submit({ text, asUser: true }).catch(() => {
    isInboxTurnQueued = false
    pendingTurns.splice(pendingTurns.indexOf(text), 1)
    for (const m of inbox.splice(0)) notice($, `${m.from}: ${m.text}`)
  })
}

// Polls until the peer says something, the person types again, the turn is interrupted,
// or `listenMs` passes in silence.
async function waitForReply($: $, signal: AbortSignal, listenMs: number): Promise<Message[]> {
  const STOP = Symbol('stop')
  const stopped = new Promise<typeof STOP>(resolve => {
    stopWaiting = () => resolve(STOP)
    signal.addEventListener('abort', () => resolve(STOP), { once: true })
  })
  const until = (await $.clock.now()) + listenMs
  try {
    while (!signal.aborted && (await $.clock.now()) < until && (await $.state.get(CHAT)).value?.isConnected) {
      const polled = poll($, POLL_HOLD_MS).catch(() => null)
      const r = await Promise.race([polled, stopped])
      if (r === STOP) {
        // The poll still lands later; keep what it brings for the next turn.
        void polled.then(late => (late?.status === 200 ? take($, eventsOf(late)) : undefined))
        break
      }
      // The background loop rides out a hiccup with a pause this turn's budget can't afford.
      if (!r || isPassing(r)) break
      if (r.status !== 200) {
        await endChat($)
        notice($, `knock: 연결이 끊겼어요 (${errorOf(r)})`)
        break
      }
      await take($, eventsOf(r))
      if (inbox.length) break
    }
    return inbox.splice(0)
  } finally {
    stopWaiting = null
  }
}

// Every message goes in block 0: while a turn streams, the live view draws only its newest
// block, so a block per message would hide each one behind the next until the turn ends.
async function* typeOut($: $, text: string, isAnimated: boolean) {
  if (!isAnimated) {
    yield { kind: 'text' as const, index: 0, text }
    return
  }
  const chars = Array.from(text)
  const size = Math.max(2, Math.ceil(chars.length / 25))
  for (let i = 0; i < chars.length; i += size) {
    yield { kind: 'text' as const, index: 0, text: chars.slice(i, i + size).join('') }
    await $.clock.sleep(15)
  }
}

// Names this machine holds a token for. Several means several people (or tests) share it,
// so a window never guesses which one it is.
const namesHint = (accounts: Record<string, string>) => {
  const names = Object.keys(accounts)
  return names.length ? `\n이 컴퓨터에 있는 이름: ${names.join(', ')}` : ''
}

async function whoami($: $): Promise<string> {
  const server = await serverOf($)
  const { value: me } = await $.state.get(ME)
  if (!me) return `아직 이름이 없어요. /knock-init <이름> 해 주세요.${namesHint(await accountsOf($, server))}`
  const { value: chat } = await $.state.get(CHAT)
  const lines = [`나: ${me}`]
  if (chat) lines.push(chat.isConnected ? `💬 ${chat.peer} 님과 대화 중` : `⏳ ${chat.peer} 님 기다리는 중`)
  if (server !== DEFAULT_SERVER) lines.push(`서버: ${server}`)
  return lines.join('\n')
}

async function init($: $, args: string): Promise<string> {
  const name = args.trim().toLowerCase()
  if (!name) return whoami($)
  if ((await $.state.get(CHAT)).value) return '대화 중엔 이름을 못 바꿔요. /knock-off 먼저 해 주세요.'

  const server = await serverOf($)
  const accounts = await accountsOf($, server)
  if (!accounts[name]) {
    const r = await api($, 'POST', '/register', { name })
    if (r.status !== 200) return `등록 실패: ${errorOf(r)}`
    accounts[name] = String(r.data?.token)
    await $.store.set(`accounts:${server}`, accounts)
  }
  await $.state.set(ME, name)
  return `이름 설정 완료: ${name}\n/knock <친구 이름> 하면 노크해요.`
}

async function knock($: $, args: string): Promise<string> {
  const { value: me } = await $.state.get(ME)
  if (!me) return `먼저 /knock-init <이름> 해서 이름을 정해 주세요.${namesHint(await accountsOf($, await serverOf($)))}`
  const to = args.trim().toLowerCase()

  if (!to) {
    const r = await api($, 'GET', '/knocks')
    if (r.status !== 200) return `목록을 못 가져왔어요: ${errorOf(r)}`
    const from = (r.data?.from ?? []) as string[]
    return from.length
      ? `🚪 노크한 사람: ${from.join(', ')}\n/knock <이름> 하면 연결돼요.`
      : '아직 노크한 사람이 없어요.'
  }

  const r = await api($, 'POST', '/knock', { window: await $.session.id(), to })
  if (r.status !== 200) return `노크 실패: ${errorOf(r)}`
  const chat = { peer: to, isConnected: r.data?.state === 'connected' }
  await $.state.set(CHAT, chat)
  await showStatus($, chat)
  startLoop($)
  return chat.isConnected
    ? connectedText(to)
    : `⏳ ${to} 님한테 노크했어요. ${to} 님이 /knock ${me} 하면 연결돼요. 그동안은 Claude랑 계속 작업하면 돼요.`
}

async function leave($: $): Promise<string> {
  const { value: chat } = await $.state.get(CHAT)
  if (!chat) return '연결된 사람이 없어요.'
  await endChat($)
  await api($, 'POST', '/leave', { window: await $.session.id() }).catch(() => undefined)
  return `${chat.peer} 님과의 연결을 끊었어요. 이제 다시 Claude랑 대화해요.`
}

const withServer = async ($: $, run: () => Promise<string>) => {
  try {
    return { text: await run() }
  } catch {
    return { text: `knock 서버에 연결하지 못했어요 (${await serverOf($)})` }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await Promise.all([
      $.command.register({
        name: 'knock-init',
        description: 'knock: set your username (registers it the first time)',
        argumentHint: '<name>',
      }),
      $.command.register({
        name: 'knock',
        description: 'knock: knock on a friend, or list who knocked on you',
        argumentHint: '[name]',
      }),
      // Immediate, so these also run during a chat turn that is waiting for a reply.
      $.command.register({ name: 'knock-me', description: 'knock: show your username and who you are chatting with', immediate: true }),
      $.command.register({ name: 'knock-off', description: 'knock: leave the chat and go back to Claude', immediate: true }),
    ])

    // A new window is the one name this machine holds; with several it waits for /knock-init,
    // since windows share the store and the last name set elsewhere may be someone else's.
    if ((await $.state.get(ME)).value === undefined) {
      const [only, ...rest] = Object.keys(await accountsOf($, await serverOf($)))
      if (only && !rest.length) await $.state.set(ME, only)
    }
    // After a hot reload the chat is still on: pick its poll loop back up.
    const { value: chat } = await $.state.get(CHAT)
    if (chat) {
      await showStatus($, chat)
      startLoop($)
    }
    return started
  })

  on('command.run', { command: 'knock-init' }, ($, e) => withServer($, () => init($, e.args)))
  on('command.run', { command: 'knock' }, ($, e) => withServer($, () => knock($, e.args)))
  on('command.run', { command: 'knock-me' }, async $ => {
    const shown = await withServer($, () => whoami($))
    if (!runningTurns.size) return shown
    // Mid-turn a command's output only draws once the turn ends, and a chat turn listens on.
    // A notice is one line.
    notice($, shown.text.replaceAll('\n', ' · '))
    return {}
  })
  on('command.run', { command: 'knock-off' }, $ => withServer($, () => leave($)))

  // While connected, what the person types goes to the peer as well as into the transcript;
  // the turn it starts is answered by the peer, not the model.
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || e.origin.kind !== 'composer') return next(e)
    const { value: chat } = await $.state.get(CHAT)
    if (!chat?.isConnected) {
      const { value: relayed = [] } = await $.state.get(RELAYED)
      if (!relayed.length) return next(e)
      await $.state.set(RELAYED, [])
      return next({ ...e, context: [...(e.context ?? []), relayNote(relayed)] })
    }

    const r = await api($, 'POST', '/send', { window: await $.session.id(), text: e.text })
    if (r.status !== 200) {
      if (r.status === 409) await endChat($)
      return { drop: `knock: 못 보냈어요 (${errorOf(r)})` }
    }
    pendingTurns.push(e.text)
    const submitted = await next(e)
    // Typed over a chat turn: end that turn, or the engine slips this message into it as a
    // step the model never takes, and it sits queued. Ended, it starts a turn of its own.
    if (e.turnId && chatTurns.has(e.turnId)) {
      void $.turn.abort({ turnId: e.turnId }).catch(err => dbg($, `abort failed: ${err}`))
    }
    return submitted
  }).catch(($, e, next) => (next.called ? next(e) : { drop: 'knock: 메시지를 못 보냈어요. 다시 보내 주세요.' }))

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      runningTurns.add(e.turnId)
      const i = pendingTurns.findIndex(text => e.text.includes(text))
      if (i >= 0) {
        pendingTurns.splice(i, 1)
        chatTurns.add(e.turnId)
      }
    }
    return next(e)
  })

  // A chat turn never reaches the model: the peer's messages stream in as its answer, and it
  // keeps listening until the person types again (their prompt aborts it) or the chat ends.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId || !chatTurns.has(e.turnId)) return yield* next(e)
    const result = (answer: string) =>
      ({ turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn' as const, usage: null })

    // A later step means a message slipped into this turn as it was ending; end the turn
    // so that message starts one of its own instead of sitting queued under it.
    if (e.index > 0) {
      void $.turn.abort({ turnId: e.turnId }).catch(err => dbg($, `abort failed: ${err}`))
      return result('')
    }

    isStepping = true
    isInboxTurnQueued = false
    loop++
    const said: string[] = []
    try {
      while (!next.signal.aborted && next.budget.remainingMs > RESERVE_MS) {
        const messages = inbox.length ? inbox.splice(0) : await waitForReply($, next.signal, LISTEN_MS)
        if (!messages.length) break
        for (const m of messages) {
          // The live view draws a streamed line once it ends.
          yield* typeOut($, `${m.text}\n`, next.budget.remainingMs > ANIMATE_MS)
          said.push(m.text)
        }
      }
    } finally {
      isStepping = false
      if ((await $.state.get(CHAT)).value) startLoop($)
    }
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return result(said.join('\n'))
  })

  on('turn.complete', async ($, e, next) => {
    chatTurns.delete(e.turnId)
    runningTurns.delete(e.turnId)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const { value: chat } = await $.state.get(CHAT)
    if (chat) await api($, 'POST', '/leave', { window: await $.session.id() }).catch(() => undefined)
    return next(e)
  })
}
