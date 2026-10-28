# knock 🚪

[English](README.md) | 한국어

**Claude Code를 떠나지 않고 친구와 채팅합니다.**
내가 입력한 말은 친구에게 전달되고, 친구의 답장은 Claude 답변 자리에 표시됩니다. 모델을 호출하지 않으므로 토큰이 들지 않습니다.

| 시간 | alice 화면 | bob 화면 |
| --- | --- | --- |
| 12:01 | `❯ 점심 ㄱ?` | |
| 12:01 | | `⏺ 점심 ㄱ?` |
| 12:03 | | `❯ 국밥 ㄱㄱ 5분 뒤 1층` |
| 12:03 | `⏺ 국밥 ㄱㄱ 5분 뒤 1층` | |

`❯`는 내가 입력한 말이고, `⏺`는 친구가 보낸 말입니다. 친구의 말은 Claude 답변 자리에 표시됩니다.

## 빠른 시작

```
/plugin install knock --marketplace Henry-Hong/knock
/knock-init alice
/knock bob
```

1. Claude Code에 설치합니다. `Add marketplace?`가 뜨면 `y`를 누릅니다.
2. 내 이름을 정합니다.
3. 친구 이름으로 노크합니다. 친구도 `/knock alice`를 입력하면 연결됩니다 💬

끝낼 때는 `/knock-off`를 입력합니다. 어떻게 해야 할지 모르겠다면 `/knock`만 입력해 보세요. 다음에 할 일을 알려 줍니다.

## 명령어

| 명령 | |
| --- | --- |
| `/knock <이름>` | 친구에게 노크. 서로 노크하면 연결됩니다 |
| `/knock` | 내 상태, 노크한 사람, 다음에 할 일 |
| `/knock-init <이름>` | 내 이름 정하기 |
| `/knock-me` | 내 이름과 대화 상대 확인 |
| `/knock-off` | 연결을 끊고 Claude로 돌아가기 |

## 알아두면 좋은 점

- **노크 알림은 상대가 knock 창을 열어 둔 경우에만 전달됩니다.** 알림이 전달되지 않았다면 노크할 때 알려 드립니다. 이때는 친구에게 직접 알려 주세요.
- **연결되어 있는 동안에는 스피너가 계속 돌아갑니다.** 상대의 답장을 기다리고 있다는 뜻입니다.
- **채팅 내용은 그 창의 Claude 대화 기록에 남습니다.** 작업 중인 창보다는 새 창에서 채팅하는 것을 권장합니다.

## 더 알아보기

<details>
<summary><b>설치</b></summary>

- 셸에서 설치: `claude plugin install knock --marketplace Henry-Hong/knock`
- Claude Code 2.1.311 이상에서 확인했습니다. 버전이 낮다면 먼저 `claude update`를 실행해 주세요.
- 메시지가 도착하면 knock이 턴을 열면서 `📨` 줄을 추가합니다. 함께 설치되는 `knock-view`가 이 줄을 가려 줍니다.
- 업데이트: `claude plugin update knock`

</details>

<details>
<summary><b>노크 알림은 언제 전달되나요</b></summary>

`🚪 alice 님이 노크했어요` 알림은 상대가 **노크를 기다리는 창**을 열어 둔 경우에만 표시됩니다. 누군가에게 노크해 둔 창이나 채팅 중인 창이 여기에 해당합니다. 작업 중인 다른 창마다 알림이 뜨면 방해가 되므로 이렇게 설계했습니다.

- 노크하면 알림이 전달되었는지 바로 알려 드립니다.
- 알림이 전달되지 않아도 노크는 유지됩니다. 내 창이 기다리는 동안 친구가 `/knock`을 입력하면 노크한 사람 목록에서 나를 확인할 수 있습니다.

</details>

<details>
<summary><b>화면에 표시되는 것</b></summary>

- **`› Prompt from the knock plugin`**: 아무 작업도 하지 않을 때 친구의 메시지가 도착하면 knock이 대신 턴을 엽니다. 이때 Claude Code가 붙이는 라벨이며, 플러그인이 지울 수 없습니다. 이어지는 메시지는 같은 턴에 쌓이므로 라벨은 한 번만 표시됩니다.
- **하단 상태줄**: `💬 alice ↔ bob`은 연결된 상태이고, `⏳ alice → bob`은 상대가 노크해 주기를 기다리는 상태입니다.
- **Esc**: 채팅 턴이 중단되고 Claude Code가 `Interrupted`를 표시합니다. 채팅을 끝낼 때는 `/knock-off`를 사용하는 것이 깔끔합니다.

</details>

<details>
<summary><b>이름</b></summary>

- 영문 소문자, 숫자, `_`, `-`로 2~20자입니다. 먼저 등록한 사람이 사용합니다.
- 이름은 이 컴퓨터에 저장됩니다.
  - 하나뿐이면 새 창에서도 자동으로 사용됩니다.
  - 여러 개라면 창마다 `/knock-init <이름>`으로 선택해 주세요.
- 다른 컴퓨터에서는 같은 이름을 사용할 수 없습니다.
- 같은 이름으로 다른 창에서 `/knock`을 실행하면 연결이 그 창으로 옮겨집니다.

</details>

<details>
<summary><b>채팅과 Claude</b></summary>

채팅은 그 창의 대화 기록에 남습니다. 채팅을 마친 뒤 같은 창에서 Claude에게 말을 걸면, 채팅 내용도 다음 요청에 함께 전달되고 그만큼 토큰이 사용됩니다. 대신 knock이 Claude에게 "앞서 `⏺`로 표시된 내용은 친구가 쓴 말"이라고 알려 주므로, Claude가 그 내용을 자신이 한 말로 착각하지 않습니다.

</details>

<details>
<summary><b>서버</b></summary>

기본 서버는 `https://knock.everwish.workers.dev`입니다. Cloudflare Workers에서 Durable Object 하나로 동작합니다.

- 계정 정보로는 이름과 토큰 해시만 저장합니다. 실제 토큰은 내 컴퓨터에만 있습니다.
- 메시지는 전달만 하며 저장하지 않습니다.
- 1분당 요청 횟수를 제한합니다. 가입은 IP당 5회, 노크·전송은 사용자당 60회, 전체 요청은 IP당 300회입니다.

직접 운영하는 서버를 사용하려면 `KNOCK_SERVER`에 서버 주소를 지정해 Claude Code를 실행합니다.

```sh
cd server && npm install
npm run dev                              # 로컬: http://localhost:8787
npx wrangler login && npm run deploy     # 내 Cloudflare 계정에 배포
KNOCK_SERVER=https://<내 서버 주소> claude
```

</details>

<details>
<summary><b>개발</b></summary>

```sh
cd server && npm install && npm run dev
# 터미널 두 개에서 실행 (alice, bob)
KNOCK_SERVER=http://localhost:8787 claude --plugin-dir ./mod --plugin-dir ./mod-view
```

`--plugin-dir`로 실행하면 파일을 저장할 때마다 플러그인이 다시 로드됩니다.

```
mod/        knock: 명령어, 메시지 송수신, 친구의 답장을 Claude 답변 자리에 표시
mod-view/   knock-view: 📨 줄 가리기 (플러그인은 자신이 추가한 줄을 가릴 수 없어서 따로 둡니다)
server/     릴레이 서버 (Cloudflare Workers + Hono + Durable Object)
```

</details>
