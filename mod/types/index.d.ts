// Who this window chats with; isConnected is false while it waits, for a knock back or, with no
// peer yet, in a random lobby. room is that lobby: '' for the open one, else a group's code.
// In a group room (group) there is no peer: members is who is in it now, the person included,
// and seen everyone else who was there with them.
export type Chat = {
  peer: string | null
  isConnected: boolean
  isRandom?: boolean
  room?: string
  group?: string
  members?: string[]
  seen?: string[]
}

// What the server's /poll hands back, as server/src/hub.ts defines it.
export type KnockEvent =
  | { type: 'connected'; peer: string; isRandom?: boolean }
  | { type: 'knocked'; from: string }
  | { type: 'message'; from: string; text: string; at: number; group?: string; color?: string; isClaude?: true }
  | { type: 'left'; peer: string; reason: 'left' | 'timeout' }
  | { type: 'picture'; from: string; png: string; at: number; group?: string }
  | { type: 'joined'; name: string; count: number }
  | { type: 'departed'; name: string; count: number; reason: 'left' | 'timeout' }
  | { type: 'replaced' }
  | { type: 'ended' }

// The /knock menu pane: the step it shows, what it read when it opened (the name's color, who
// knocked, recent friends and rooms), and a line to say after an action in it.
export type MenuStep = 'lang' | 'name' | 'home' | 'friend' | 'room' | 'me' | 'color'
export type Menu = {
  step: MenuStep
  color: string | null
  knocks: string[]
  friends: string[]
  rooms: string[]
  note?: string
  // Which page of the step's choices shows, when the pane is too short for them all.
  page?: number
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
    }
  }
}
