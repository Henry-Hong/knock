// Who this window chats with; isConnected is false while it waits, for a knock back or, with no
// peer yet, in a random lobby. room is that lobby: '' for the open one, else a group's code.
// In a group room (group) there is no peer: members is who is in it now, the person included,
// and seen everyone else who was there with them. since is when it started looking in the lobby.
// returnBy: the peer's window closed or went quiet, and this one waits for them to come back until then.
export type Chat = {
  peer: string | null
  isConnected: boolean
  isRandom?: boolean
  room?: string
  since?: number
  returnBy?: number
  group?: string
  members?: string[]
  seen?: string[]
}

// What the server's /poll hands back, as server/src/hub.ts defines it.
export type KnockEvent =
  | { type: 'connected'; peer: string; isRandom?: boolean }
  | { type: 'knocked'; from: string }
  | { type: 'message'; from: string; text: string; at: number; group?: string; color?: string; isClaude?: true }
  | { type: 'left'; peer: string; reason: 'left' | 'closed' | 'timeout' }
  | { type: 'picture'; from: string; png: string; at: number; group?: string }
  | { type: 'joined'; name: string; count: number }
  | { type: 'departed'; name: string; count: number; reason: 'left' | 'timeout' }
  | { type: 'replaced' }
  | { type: 'ended' }

// The /knock menu pane: the step it shows, what it read when it opened (the name's color, who
// knocked, recent friends and rooms), and a line to say after an action in it.
export type MenuStep = 'lang' | 'name' | 'home' | 'friend' | 'room' | 'me' | 'color' | 'star'
export type Menu = {
  step: MenuStep
  color: string | null
  knocks: string[]
  friends: string[]
  rooms: string[]
  note?: string
  // Which page of the step's choices shows, when the pane is too short for them all.
  page?: number
  // The key of the element the focus ring is on, whose row says what Enter does.
  focused?: string
  // When it opened: how many others were on knock, how many of them waited in the open lobby,
  // and how many used knock in the last 24 hours.
  others?: number
  waiting?: number
  today?: number
  // Who this window chatted with last, in the past hour, and how many minutes ago it ended.
  last?: { name: string; minutes: number; isRandom: boolean }
  // The star step: gh is signed in, so a yes stars knock at once rather than opening its page.
  canStar?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    // relayed: peers whose chat ended since Claude last heard about it; strangers: those of them
    // met at random. isWarned: the person was told to /clear before asking Claude anything.
    knock: {
      me: string | null
      chat: Chat | null
      relayed: string[]
      strangers: string[]
      isWarned: boolean
      menu: Menu | null
      // The picture viewer: which picture shows (0 the newest), and a count bumped as pictures come.
      viewer: { index: number; seq: number; isSharp?: boolean } | null
      // While looking in a lobby: the clock, ticking to animate the band, and how many are on knock.
      tick: number
      online: number | null
    }
  }
}
