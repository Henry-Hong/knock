# knock 🚪

Claude Code 세션 안에서 친구랑 채팅하는 플러그인이에요.

평소처럼 Claude Code를 쓰다가 `/knock bob` 하고, bob도 `/knock alice` 하면 연결돼요. 그다음부터 입력하는 건 Claude 대신 bob한테 가고, bob의 답장은 Claude 답변 자리에 떠요. 모델을 부르지 않아서 토큰은 들지 않아요.

```
❯ ㅋㅋ ㅎㅇ
⏺ 멀보노
  니가먼데
  반갑다고
❯ ㅇㅋ
```

## 30초 시작

1. **설치**: Claude Code 프롬프트에 한 줄 치고, `Add marketplace?`에 `y`, 범위는 user를 고르면 돼요.
   ```
   /plugin install knock --marketplace Henry-Hong/knock
   ```
2. **이름 정하기**: `/knock-init alice`
   - 친구한테 보낼 문구가 같이 나와요. 그대로 복사해서 보내면 돼요.
3. **연결하기**: 서로 상대 이름으로 노크하면 연결돼요. 나는 `/knock bob`, 친구는 `/knock alice`.
   - 하단 상태줄에 `💬 alice ↔ bob`이 뜨면 연결된 거예요.
4. **끝내기**: `/knock-off`

막히면 `/knock`만 쳐 보세요. 내 이름, 노크 온 사람, 다음에 할 일이 나와요.

## 설치

```
/plugin install knock --marketplace Henry-Hong/knock
```

- 셸에서 설치할 때는 `claude plugin install knock --marketplace Henry-Hong/knock`이에요.
- 설치하면 `knock-view`도 같이 깔려요. 메시지가 왔을 때 knock이 턴을 열려고 넣는 `📨` 줄을 가려 주는 플러그인이에요.
- 설치하고 처음 연 창에 `🚪 knock이 설치됐어요`가 한 번 떠요.
- Claude Code 2.1.311 이상에서 확인했어요. 오래된 버전이면 `claude update` 먼저 해 주세요.

## 명령어

| 명령 | 하는 일 |
| --- | --- |
| `/knock` | 지금 상태와 다음에 할 일: 내 이름, 노크 온 사람, 누구 기다리는 중인지 |
| `/knock <이름>` | 친구한테 노크해요. 친구도 나한테 노크하면 연결돼요. |
| `/knock-init <이름>` | 내 이름을 정해요. 처음 쓰는 이름이면 등록돼요. 영문 소문자·숫자·`_`·`-`로 2~20자예요. |
| `/knock-me` | 내 이름과 지금 대화 상대를 봐요. |
| `/knock-off` | 연결을 끊고 다시 Claude랑 대화해요. |

명령은 채팅 중에도 바로 실행돼요.

### 노크 알림은 언제 가나

노크 알림(`🚪 alice 님이 노크했어요`)은 상대가 **노크를 기다리는 창을 열어 두었을 때만** 떠요. 이미 누군가에게 노크해 뒀거나 채팅 중인 창이 그런 창이에요. 모든 창에 알림이 뜨면 일하는 데 방해가 되니까요.

- 알림이 갔는지는 노크할 때 바로 알려 줘요.
- 알림이 안 갔으면 "`/knock alice` 해 줘"라고 친구한테 직접 말해 주면 돼요.
- 친구가 `/knock`만 쳐도 노크 온 사람 목록에서 나를 볼 수 있어요. 내 창이 기다리고 있는 동안에만요.

### 알아둘 것

- **첫 메시지의 라벨**: 아무것도 안 하고 있을 때 친구 메시지가 오면 knock이 대신 턴을 열어요.
  - 그때 Claude Code가 `› Prompt from the knock plugin` 라벨을 붙여요. 누가 턴을 시작했는지 보여 주는 표시라 플러그인이 지울 수 없어요.
  - 그 뒤에 오는 메시지는 같은 턴에 쌓여서 라벨이 다시 안 떠요.
- **스피너**: 연결된 동안에는 답장을 기다리느라 스피너가 계속 돌아요. "상대가 입력 중"이라고 보면 돼요.
- **끝낼 땐 `/knock-off`**: Esc를 누르면 Claude Code가 `Interrupted`를 띄워요.
- **이름은 컴퓨터에 저장돼요**:
  - 이름이 하나뿐이면 새 창에서도 자동으로 그 이름을 써요.
  - 이름이 여러 개면 창마다 `/knock-init <이름>`으로 골라 주세요.
  - 다른 컴퓨터에서는 같은 이름을 쓸 수 없어요.
- **한 이름은 한 창에서만**: 같은 이름으로 다른 창에서 `/knock` 하면 연결이 그 창으로 넘어가요.
- **채팅은 그 세션 기록에 남아요**:
  - 채팅이 끝나고 같은 창에서 Claude한테 다시 말을 걸면, 채팅 내용도 대화 기록에 포함돼서 Claude한테 같이 가요. 그만큼 토큰도 들어요.
  - knock이 "아까 `⏺`로 뜬 건 친구가 쓴 거야"라고 Claude한테 알려 줘서 헷갈리지는 않아요.
  - 그래도 중요한 작업을 하던 창보다는 새 창에서 채팅하는 걸 추천해요.

## 서버

기본 서버는 `https://knock.everwish.workers.dev`예요. 다른 서버를 쓰려면 Claude Code를 띄울 때 `KNOCK_SERVER`로 주소를 넘기면 돼요.

```sh
KNOCK_SERVER=https://my-knock.example.workers.dev claude
```

서버 코드는 `server/`에 있어요. Cloudflare Workers와 Durable Object 하나로 돌아가요.

- 계정은 이름과 토큰 해시만 SQLite에 저장해요. 진짜 토큰은 내 컴퓨터에만 있어요.
- 누가 노크했고 누가 연결됐는지는 메모리에만 있어요.
- 메시지는 롱 폴링으로 전달하고, 저장하지 않아요.
- 남용을 막으려고 1분 단위로 횟수를 제한해요. 넘으면 잠깐 뒤에 다시 하라고 안내해요.
  - 가입: IP당 5번
  - 노크·전송 등: 사람당 60번
  - 전체 요청: IP당 300번

### 직접 띄우기

```sh
cd server
npm install
npm run dev        # http://localhost:8787
```

```sh
npx wrangler login
npm run deploy     # https://knock.<내 workers.dev 서브도메인>.workers.dev
```

## 개발

레포를 받아서 플러그인 폴더를 직접 지정해 띄우면 돼요. 파일을 저장하면 다시 로드돼요.

```sh
cd server && npm install && npm run dev
# 다른 터미널 두 개에서 (alice, bob)
KNOCK_SERVER=http://localhost:8787 claude --plugin-dir ./mod --plugin-dir ./mod-view
```

```
mod/        knock 플러그인: 명령, 메시지 주고받기, 친구 답장을 Claude 답변 자리에 띄우기
mod-view/   knock-view 플러그인: 📨 줄 가리기
server/     릴레이 서버 (Cloudflare Workers + Hono + Durable Object)
```

`📨` 줄 가리기를 `knock-view`가 따로 맡는 이유가 있어요. 플러그인은 자기가 넣은 프롬프트 줄의 화면 그리기를 건드릴 수 없거든요.
