// Who this window chats with; isConnected is false while it waits, for a knock back or, with no
// peer yet, in a random lobby. room is that lobby: '' for the open one, else a group's code.
export type Chat = { peer: string | null; isConnected: boolean; isRandom?: boolean; room?: string }

// What the server's /poll hands back, as server/src/hub.ts defines it.
export type KnockEvent =
  | { type: 'connected'; peer: string; isRandom?: boolean }
  | { type: 'knocked'; from: string }
  | { type: 'message'; from: string; text: string; at: number }
  | { type: 'left'; peer: string; reason: 'left' | 'timeout' }
  | { type: 'replaced' }
  | { type: 'ended' }

declare module 'claude-code' {
  interface PluginState {
    // relayed: peers whose chat ended since Claude last heard about it; strangers: those of them
    // met at random. isWarned: the person was told to /clear before asking Claude anything.
    knock: { me: string | null; chat: Chat | null; relayed: string[]; strangers: string[]; isWarned: boolean }
  }
}
