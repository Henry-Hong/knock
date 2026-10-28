# knock 🚪

**Claude Code 안에서 친구랑 채팅해요.**
내가 친 말은 친구한테 가고, 친구 답장은 Claude 답변 자리에 떠요. 모델을 안 써서 토큰도 안 들어요.

```
❯ 점심 뭐 먹지
⏺ 국밥 ㄱ
  10분 뒤 1층
❯ ㅇㅋ
```

## Quick start

```
/plugin install knock --marketplace Henry-Hong/knock
/knock-init alice
/knock bob
```

1. Claude Code에 설치해요. `Add marketplace?`가 뜨면 `y`
2. 내 이름을 정해요
3. 친구 이름으로 노크해요. 친구도 `/knock alice` 하면 연결 💬

끝낼 땐 `/knock-off`, 헷갈리면 `/knock`만 치면 다음에 할 일을 알려 줘요.

## 명령어

| 명령 | |
| --- | --- |
| `/knock <이름>` | 노크해요. 서로 하면 연결돼요 |
| `/knock` | 내 상태, 노크 온 사람, 다음에 할 일 |
| `/knock-init <이름>` | 내 이름을 정해요 |
| `/knock-me` | 내 이름과 대화 상대를 봐요 |
| `/knock-off` | 연결을 끊고 Claude로 돌아가요 |

## 알아두면 좋은 것

- **노크 알림은 상대가 knock 창을 열어 뒀을 때만 가요.** 알림이 안 갔으면 노크할 때 알려 줘요. 그땐 친구한테 직접 말해 주세요.
- **연결된 동안엔 스피너가 계속 돌아요.** 상대 답장을 기다리는 중이에요.
- **채팅 내용은 그 창의 Claude 대화 기록에 남아요.** 작업하던 창 말고 새 창에서 채팅하는 걸 추천해요.

## 더 알아보기

<details>
<summary><b>설치 자세히</b></summary>

- 셸에서 설치할 때는 `claude plugin install knock --marketplace Henry-Hong/knock`이에요.
- Claude Code 2.1.311 이상에서 확인했어요. 버전이 낮으면 `claude update`를 먼저 해 주세요.
- 메시지가 오면 knock이 턴을 열려고 `📨` 줄을 넣어요. 같이 설치되는 `knock-view`가 그 줄을 가려 줘요.
- 업데이트는 `claude plugin update knock`이에요.

</details>

<details>
<summary><b>노크 알림은 언제 가나</b></summary>

`🚪 alice 님이 노크했어요` 알림은 상대가 **노크를 기다리는 창**을 열어 뒀을 때만 떠요. 누군가에게 노크해 둔 창이나 채팅 중인 창이 그런 창이에요. 모든 창에 알림이 뜨면 일하는 데 방해되니까 이렇게 했어요.

- 노크하면 알림이 갔는지 바로 알려 줘요.
- 알림이 안 갔어도 노크는 남아 있어요. 친구가 `/knock`을 치면 노크 온 사람 목록에서 나를 볼 수 있어요. 내 창이 기다리는 동안에만요.

</details>

<details>
<summary><b>화면에 뜨는 것들</b></summary>

- **`› Prompt from the knock plugin`**: 아무것도 안 하고 있을 때 친구 메시지가 오면, knock이 대신 턴을 열면서 Claude Code가 붙이는 라벨이에요. 플러그인이 지울 수 없어요. 그다음 메시지부터는 같은 턴에 쌓여서 다시 안 떠요.
- **하단 상태줄**: `💬 alice ↔ bob`이면 연결된 거고, `⏳ alice → bob 기다리는 중`이면 상대 노크를 기다리는 거예요.
- **Esc**: 채팅 중에 누르면 Claude Code가 `Interrupted`를 띄워요. 끝낼 땐 `/knock-off`를 쓰는 게 깔끔해요.

</details>

<details>
<summary><b>이름</b></summary>

- 이름은 영문 소문자, 숫자, `_`, `-`로 2~20자예요. 먼저 정한 사람이 가져가요.
- 이름은 이 컴퓨터에 저장돼요.
  - 하나뿐이면 새 창에서도 자동으로 써요.
  - 여러 개면 창마다 `/knock-init <이름>`으로 골라 주세요.
- 다른 컴퓨터에서는 같은 이름을 쓸 수 없어요.
- 같은 이름으로 다른 창에서 `/knock` 하면 연결이 그 창으로 넘어가요.

</details>

<details>
<summary><b>채팅과 Claude</b></summary>

채팅은 그 창의 대화 기록에 남아요. 채팅을 끝내고 같은 창에서 Claude한테 말을 걸면, 채팅 내용도 Claude한테 같이 가고 그만큼 토큰도 들어요. 그때 knock이 "아까 `⏺`로 뜬 건 친구가 쓴 말이야"라고 Claude한테 알려 줘서 Claude가 헷갈리지는 않아요.

</details>

<details>
<summary><b>서버</b></summary>

기본 서버는 `https://knock.everwish.workers.dev`예요. Cloudflare Workers에서 Durable Object 하나로 돌아가요.

- 계정은 이름과 토큰 해시만 저장해요. 진짜 토큰은 내 컴퓨터에만 있어요.
- 메시지는 전달만 하고 저장하지 않아요.
- 1분 단위로 횟수를 제한해요.
  - 가입: IP당 5번
  - 노크·전송: 사람당 60번
  - 전체 요청: IP당 300번

직접 띄운 서버를 쓰려면 `KNOCK_SERVER`에 주소를 넣고 Claude Code를 띄우면 돼요.

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

`--plugin-dir`로 띄우면 파일을 저장할 때마다 플러그인이 다시 로드돼요.

```
mod/        knock: 명령, 메시지 주고받기, 친구 답장을 Claude 답변 자리에 띄우기
mod-view/   knock-view: 📨 줄 가리기 (플러그인은 자기가 넣은 줄을 못 가려서 따로 둬요)
server/     릴레이 서버 (Cloudflare Workers + Hono + Durable Object)
```

</details>
