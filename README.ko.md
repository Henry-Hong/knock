# knock 🚪

[English](README.md) | 한국어

**Claude Code를 떠나지 않고 친구랑 채팅한다.**
내가 친 말은 친구한테 가고, 친구 답장은 Claude 답변 자리에 뜬다. 모델을 안 쓰니 토큰도 안 든다.

| 시간 | alice 화면 | bob 화면 |
| --- | --- | --- |
| 12:01 | `❯ 점심 ㄱ?` | |
| 12:01 | | `⏺ 점심 ㄱ?` |
| 12:03 | | `❯ 국밥 ㄱㄱ 5분 뒤 1층` |
| 12:03 | `⏺ 국밥 ㄱㄱ 5분 뒤 1층` | |

`❯`는 내가 친 말, `⏺`는 친구가 한 말. 친구 말은 Claude 답변 자리에 뜬다.

## 빠른 시작

```
/plugin install knock --marketplace Henry-Hong/knock
/knock-init alice
/knock bob
```

1. Claude Code에 설치. `Add marketplace?`가 뜨면 `y`
2. 내 이름 정하기
3. 친구 이름으로 노크. 친구도 `/knock alice` 하면 연결 💬

끝낼 땐 `/knock-off`. 헷갈리면 `/knock`만 쳐 보자. 다음에 할 일을 알려 준다.

## 명령어

| 명령 | |
| --- | --- |
| `/knock <이름>` | 노크. 서로 하면 연결된다 |
| `/knock` | 내 상태, 노크 온 사람, 다음에 할 일 |
| `/knock-init <이름>` | 내 이름 정하기 |
| `/knock-me` | 내 이름과 대화 상대 보기 |
| `/knock-off` | 연결 끊고 Claude로 돌아가기 |

## 알아두면 좋은 것

- **노크 알림은 상대가 knock 창을 열어 뒀을 때만 간다.** 알림이 안 갔으면 노크할 때 알려 주니, 그땐 친구한테 직접 말하면 된다.
- **연결된 동안엔 스피너가 계속 돈다.** 상대 답장을 기다리는 중이다.
- **채팅 내용은 그 창의 Claude 대화 기록에 남는다.** 작업하던 창 말고 새 창에서 채팅하는 게 좋다.

## 더 알아보기

<details>
<summary><b>설치</b></summary>

- 셸에서 설치: `claude plugin install knock --marketplace Henry-Hong/knock`
- Claude Code 2.1.311 이상에서 확인했다. 버전이 낮으면 `claude update`를 먼저 하자.
- 메시지가 오면 knock이 턴을 열면서 `📨` 줄을 넣는다. 그 줄은 같이 설치되는 `knock-view`가 가려 준다.
- 업데이트: `claude plugin update knock`

</details>

<details>
<summary><b>노크 알림은 언제 가나</b></summary>

`🚪 alice 님이 노크했어요` 알림은 상대가 **노크를 기다리는 창**을 열어 뒀을 때만 뜬다. 누군가에게 노크해 둔 창이나 채팅 중인 창이 그런 창이다. 작업 중인 다른 창들까지 알림이 뜨면 방해가 되니 일부러 이렇게 했다.

- 노크하면 알림이 갔는지 바로 알려 준다.
- 알림이 안 가도 노크는 남아 있다. 내 창이 기다리는 동안 친구가 `/knock`을 치면 노크 온 목록에 내가 보인다.

</details>

<details>
<summary><b>화면에 뜨는 것들</b></summary>

- **`› Prompt from the knock plugin`**: 아무것도 안 하고 있을 때 친구 메시지가 오면, knock이 대신 턴을 연다. 그때 Claude Code가 붙이는 라벨이라 플러그인이 지울 수 없다. 이어지는 메시지는 같은 턴에 쌓여서 한 번만 뜬다.
- **하단 상태줄**: `💬 alice ↔ bob`이면 연결된 상태, `⏳ alice → bob`이면 상대가 노크해 주길 기다리는 상태.
- **Esc**: 채팅 턴이 끊기고 Claude Code가 `Interrupted`를 띄운다. 끝낼 땐 `/knock-off`가 깔끔하다.

</details>

<details>
<summary><b>이름</b></summary>

- 영문 소문자, 숫자, `_`, `-`로 2~20자. 먼저 정한 사람이 가져간다.
- 이름은 이 컴퓨터에 저장된다.
  - 하나뿐이면 새 창에서도 자동으로 쓴다.
  - 여러 개면 창마다 `/knock-init <이름>`으로 고른다.
- 다른 컴퓨터에서는 같은 이름을 쓸 수 없다.
- 같은 이름으로 다른 창에서 `/knock` 하면 연결이 그 창으로 넘어간다.

</details>

<details>
<summary><b>채팅과 Claude</b></summary>

채팅은 그 창의 대화 기록에 남는다. 채팅을 끝내고 같은 창에서 Claude한테 말을 걸면, 채팅 내용도 다음 요청에 같이 실려 가고 그만큼 토큰이 든다. 대신 knock이 Claude한테 "아까 `⏺`로 뜬 건 친구가 쓴 말"이라고 알려 주니, Claude가 그걸 자기가 한 말로 착각하진 않는다.

</details>

<details>
<summary><b>서버</b></summary>

기본 서버는 `https://knock.everwish.workers.dev`. Cloudflare Workers 위에서 Durable Object 하나로 돌아간다.

- 계정은 이름과 토큰 해시만 저장한다. 진짜 토큰은 내 컴퓨터에만 있다.
- 메시지는 전달만 하고 저장하지 않는다.
- 1분당 횟수 제한: 가입은 IP당 5번, 노크·전송은 사람당 60번, 전체 요청은 IP당 300번.

직접 띄운 서버를 쓰려면 `KNOCK_SERVER`에 그 주소를 넣고 Claude Code를 띄운다.

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
# 터미널 두 개에서 (alice, bob)
KNOCK_SERVER=http://localhost:8787 claude --plugin-dir ./mod --plugin-dir ./mod-view
```

`--plugin-dir`로 띄우면 파일을 저장할 때마다 플러그인이 다시 로드된다.

```
mod/        knock: 명령, 메시지 주고받기, 친구 답장을 Claude 답변 자리에 띄우기
mod-view/   knock-view: 📨 줄 가리기 (플러그인은 자기가 넣은 줄을 못 가려서 따로 둠)
server/     릴레이 서버 (Cloudflare Workers + Hono + Durable Object)
```

</details>
