import type { Register } from 'claude-code'

// knock opens a turn with a "📨 <friend>" prompt when a message arrives while the
// person is idle. The engine never lets a plugin hook rows its own prompts raise,
// so this separate plugin hides that row and leaves the friend's answer under it.
export const register: Register = on => {
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const { origin, text } = e.props
    if (origin.kind !== 'plugin' || origin.name !== 'knock' || !text.startsWith('📨')) return next(e)
    const { Box } = $.ui.resolve(e)
    return Box({})
  })
}
