// Who this window chats with; isConnected is false while the knock waits for a knock back.
export type Chat = { peer: string; isConnected: boolean }

// What the server's /poll hands back, as server/src/hub.ts defines it.
export type KnockEvent =
  | { type: 'connected'; peer: string }
  | { type: 'knocked'; from: string }
  | { type: 'message'; from: string; text: string; at: number }
  | { type: 'left'; peer: string; reason: 'left' | 'timeout' }
  | { type: 'replaced' }
  | { type: 'ended' }

declare module 'claude-code' {
  interface PluginState {
    // relayed: peers whose chat ended since Claude last heard about it.
    knock: { me: string | null; chat: Chat | null; relayed: string[] }
  }
}
