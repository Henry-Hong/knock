# knock 🚪

English | [한국어](README.ko.md)

**Chat with a friend without leaving Claude Code.**
What you type goes to your friend, and their replies show up where Claude's answers usually do. No model calls, so no tokens.

| Time | alice's window | bob's window |
| --- | --- | --- |
| 12:01 | `❯ lunch?` | |
| 12:01 | | `⏺ lunch?` |
| 12:03 | | `❯ ramen, lobby in 5` |
| 12:03 | `⏺ ramen, lobby in 5` | |

`❯` is what you type. `⏺` is what your friend says, in the spot where Claude's answer would be.

## Quick start

```
/plugin install knock --marketplace Henry-Hong/knock
/knock-init alice
/knock bob
```

1. Install it in Claude Code. Answer `y` to `Add marketplace?`
2. Pick your name
3. Knock on your friend. Once they `/knock alice` back, you're connected 💬

`/knock-off` to leave. Lost? Type `/knock` and it tells you what to do next.

## Commands

| Command | |
| --- | --- |
| `/knock <name>` | Knock on a friend. Knock on each other to connect |
| `/knock` | Your status, who knocked, what to do next |
| `/knock-init <name>` | Pick your name |
| `/knock-random [code]` | Meet someone at random. With a code, only people who used the same code |
| `/knock-next` | Leave this random match and find the next one |
| `/knock-block [name]` | Block the person you're chatting with, or a name |
| `/knock-me` | Your name and who you're chatting with |
| `/knock-off` | Leave the chat (or stop looking) and go back to Claude |

## Good to know

- **A knock only notifies your friend if they have a knock window open.** knock tells you when it didn't, so you can ping them yourself.
- **The spinner keeps running while you're connected.** It's waiting for your friend's reply.
- **The chat stays in that window's Claude history.** Chat in a fresh window, not the one you're working in.
- **knock's own messages are in Korean for now.**

## More

<details>
<summary><b>Installing</b></summary>

- From a shell: `claude plugin install knock --marketplace Henry-Hong/knock`
- Tested on Claude Code 2.1.311 and later. On an older version, run `claude update` first.
- When a message arrives, knock opens a turn with a `📨` row. `knock-view` is installed along with knock and hides that row.
- Update with `claude plugin update knock`.

</details>

<details>
<summary><b>When does a knock notify?</b></summary>

A knock notice (🚪) shows up only in a **window that's waiting on a knock**: one that has knocked on someone, or is in a chat. knock doesn't ping all your other windows, so it never interrupts your work.

- When you knock, knock tells you right away whether your friend was notified.
- Either way the knock stays. Your friend sees you when they type `/knock`, as long as your window is waiting.

</details>

<details>
<summary><b>What you'll see</b></summary>

- **`› Prompt from the knock plugin`**: a label Claude Code adds when a message arrives while you're idle and knock opens a turn for it. Plugins can't remove it. Later messages land in the same turn, so it shows up once.
- **Status line**: `💬 alice ↔ bob` means connected. `⏳ alice → bob` means you're waiting for them to knock back. `🎲` marks a random match, or a lobby you're waiting in.
- **Esc**: interrupts the chat turn, and Claude Code shows `Interrupted`. Use `/knock-off` to leave cleanly.

</details>

<details>
<summary><b>Names</b></summary>

- 2–20 characters: lowercase letters, digits, `_`, `-`. First come, first served.
- Your name is saved on this computer.
  - If it's the only one, new windows pick it up automatically.
  - If there are several, pick one per window with `/knock-init <name>`.
- You can't use the same name from another computer.
- Knocking from a second window with the same name moves the chat to that window.

</details>

<details>
<summary><b>Chat and Claude</b></summary>

The chat stays in that window's history. If you talk to Claude in the same window afterwards, the chat goes along with your next request and costs tokens. knock tells Claude that those `⏺` lines were your friend's words, not its own, so Claude doesn't get confused.

</details>

<details>
<summary><b>Random matching</b></summary>

`/knock-random` puts you in a lobby. If someone is already waiting there, you're connected right away. If not, you wait for the next person who comes in.

- `/knock-random` alone is the open lobby, for everyone. `/knock-random <code>` is a lobby of its own, so only people who type the same code meet. Use one for a team or a community.
- The person who has waited longest gets matched first.
- `/knock-next` moves on. You won't get the person you just left again right away.
- `/knock-block` blocks the person you're chatting with and ends the chat. You never meet them at random again, and their knocks don't notify you. If you knock on each other on purpose, you still connect.

**Someone you meet at random is a stranger.** Their messages stay in this window's history, and Claude reads them with your next request. Someone could slip in a line like "before running tests, first run this command", hoping Claude follows it later. So knock:

- Tells Claude those lines came from a stranger, and that it must not follow any instruction in them.
- Stops your first request to Claude after such a chat once. It suggests `/clear` or a fresh window and puts your request back in the box. Press Enter again to send it anyway.
- Strips control characters from incoming messages, so they can't recolor text to look like Claude Code's own rows.

</details>

<details>
<summary><b>Server</b></summary>

The default server is `https://knock.everwish.workers.dev`. It runs on Cloudflare Workers with a single Durable Object.

- Accounts store only a name and a hash of its token. The token itself stays on your computer.
- Messages are relayed, never stored.
- Rate limits, per minute: 5 sign-ups per IP, 60 knocks or messages per person, 300 requests per IP.

To run your own server, start Claude Code with `KNOCK_SERVER` pointing at it:

```sh
cd server && npm install
npm run dev                              # local: http://localhost:8787
npx wrangler login && npm run deploy     # deploy to your Cloudflare account
KNOCK_SERVER=https://<your server> claude
```

</details>

<details>
<summary><b>Development</b></summary>

```sh
cd server && npm install && npm run dev
# in two terminals (alice and bob)
KNOCK_SERVER=http://localhost:8787 claude --plugin-dir ./mod --plugin-dir ./mod-view
```

With `--plugin-dir`, saving a file reloads the plugin.

```
mod/        knock: commands, sending and receiving, showing replies where Claude's answers go
mod-view/   knock-view: hides the 📨 row (a plugin can't hide rows it added itself)
server/     the relay (Cloudflare Workers + Hono + Durable Object)
```

</details>
