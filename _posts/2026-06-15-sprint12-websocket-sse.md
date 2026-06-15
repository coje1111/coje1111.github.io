---
layout: post
title: "웹소켓과 SSE로 실시간 기능 만들기"
---

# 웹소켓과 SSE로 실시간 기능 만들기

## 배경

sprint mission 12의 첫 번째 큰 주제는 실시간 통신이었다.

채팅 서비스에서는 사용자가 직접 새로고침하지 않아도 화면이 바뀌어야 한다.

예를 들면 다음과 같은 상황이다.

- 누군가 메시지를 보냈을 때 바로 메시지 목록에 나타난다.
- 새 알림이 생기면 알림 목록에 바로 추가된다.
- 채널이나 사용자 정보가 바뀌면 화면도 다시 그려진다.
- 파일 업로드 상태가 `PROCESSING`에서 `SUCCESS` 또는 `FAIL`로 바뀐다.

HTTP API만 사용하면 클라이언트가 계속 서버에 물어봐야 한다.

```text
새 메시지 있어요?
새 알림 있어요?
채널 바뀌었어요?
```

이런 방식은 비효율적이다.

그래서 이번 미션에서는 `WebSocket`과 `SSE`를 함께 사용했다.

## WebSocket과 SSE의 차이

둘 다 실시간 통신에 쓰이지만 역할이 조금 다르다.

`WebSocket`은 양방향 통신이다.

```text
클라이언트 -> 서버
서버 -> 클라이언트
```

그래서 채팅 메시지처럼 클라이언트가 서버로 보내고, 서버가 다시 여러 클라이언트에게 뿌리는 기능에 잘 맞는다.

`SSE`는 서버에서 클라이언트로 보내는 단방향 통신이다.

```text
서버 -> 클라이언트
```

알림, 상태 변경, 목록 다시 렌더링 같은 이벤트는 클라이언트가 굳이 서버로 메시지를 보낼 필요가 없다. 서버가 변경 사실만 알려주면 된다.

이번 프로젝트에서는 대략 이렇게 나눴다.

- 채팅 메시지 송수신: WebSocket
- 알림, 파일 상태, 채널 변경, 사용자 갱신: SSE

## WebSocket 설정

웹소켓 설정은 `WebSocketConfig`에서 했다.

핵심 설정은 다음과 같다.

```text
STOMP endpoint: /ws
subscribe prefix: /sub
publish prefix: /pub
```

클라이언트는 `/ws`로 연결한다.

메시지를 보낼 때는 `/pub/messages`로 보낸다.

메시지를 받을 때는 채널별 구독 주소를 사용한다.

```text
/sub/channels.{channelId}.messages
```

예를 들어 어떤 사용자가 특정 채널에 들어가 있으면, 그 채널의 메시지 구독 주소를 보고 있다가 새 메시지를 받는다.

## 메시지 보내기

첨부파일이 없는 단순 텍스트 메시지는 WebSocket으로 보낼 수 있게 했다.

이 역할은 `MessageWebSocketController`가 맡는다.

```text
클라이언트
  -> /pub/messages 로 MessageCreateRequest 전송
  -> 서버에서 메시지 생성
  -> MessageCreatedEvent 발행
```

단, 첨부파일이 있는 메시지는 그대로 기존 HTTP API를 사용한다.

이유는 파일 업로드는 multipart 요청이 필요하고, WebSocket으로 처리하기보다 기존 API를 유지하는 편이 단순하기 때문이다.

## 메시지 받기

메시지가 생성되면 `MessageCreatedEvent`가 발생한다.

처음에는 이 이벤트를 `WebSocketRequiredEventListener`가 받아서 바로 구독 주소로 메시지를 보냈다.

```text
MessageCreatedEvent
  -> MessageService.find(messageId)
  -> SimpMessagingTemplate.convertAndSend(...)
  -> /sub/channels.{channelId}.messages
```

이렇게 하면 같은 서버에 연결된 클라이언트는 새 메시지를 바로 받을 수 있다.

## SSE 연결

SSE는 `GET /api/sse` 엔드포인트로 연결했다.

로그인한 사용자가 SSE 연결을 열면 서버는 `SseEmitter`를 생성한다.

`SseEmitter`는 서버가 클라이언트에게 이벤트를 밀어넣을 때 사용하는 객체다.

이번 구현에서는 다음 컴포넌트가 있다.

- `SseController`: SSE 연결 요청을 받는다.
- `SseService`: 연결 생성, 이벤트 전송, ping, cleanup을 담당한다.
- `SseEmitterRepository`: 사용자별 `SseEmitter`를 메모리에 저장한다.
- `SseMessageRepository`: 이벤트 유실 복원을 위해 최근 메시지를 저장한다.

## 사용자 한 명이 여러 연결을 가질 수 있는 이유

`SseEmitterRepository`는 사용자 한 명당 `List<SseEmitter>`를 가진다.

처음에는 사용자 한 명이면 연결도 하나라고 생각할 수 있다.

하지만 실제 브라우저에서는 같은 사용자가 여러 탭을 열 수 있다.

```text
사용자 A
  -> 탭 1 SSE 연결
  -> 탭 2 SSE 연결
  -> 탭 3 SSE 연결
```

그래서 사용자 한 명에게 여러 개의 SSE 연결을 허용해야 한다.

## LastEventId와 이벤트 유실 복원

SSE는 연결이 끊겼다가 다시 연결될 수 있다.

그 사이에 이벤트가 발생하면 클라이언트가 못 받을 수 있다.

이를 보완하기 위해 각 SSE 메시지에 고유한 이벤트 ID를 붙였다.

클라이언트가 다시 연결할 때 마지막으로 받은 이벤트 ID를 보내면, 서버는 그 이후 이벤트를 다시 보내줄 수 있다.

```text
클라이언트가 마지막으로 받은 이벤트 ID: 10
서버가 저장한 이벤트: 11, 12, 13
다시 연결 시 11, 12, 13 전송
```

이 역할은 `SseMessageRepository`가 맡는다.

## SSE로 보낸 이벤트들

이번 작업에서는 여러 변경 사항을 SSE 이벤트로 보냈다.

알림 생성:

```text
name: notifications.created
data: NotificationDto
```

파일 업로드 상태 변경:

```text
name: binaryContents.updated
data: BinaryContentDto
```

채널 변경:

```text
name: channels.created
name: channels.updated
name: channels.deleted
data: ChannelDto
```

사용자 갱신:

```text
name: users.created
name: users.updated
name: users.deleted
data: UserDto
```

이벤트 이름을 이렇게 정해두면 프론트엔드는 어떤 화면을 다시 그려야 하는지 판단할 수 있다.

## 테스트와 확인

이번 기능은 단순히 컴파일만 보는 것으로는 부족했다.

그래서 다음을 확인했다.

- `./gradlew.bat test` 전체 테스트 통과
- Docker Compose 환경에서 서비스 기동
- 브라우저에서 `http://127.0.0.1:3000` 접속
- 로그인 후 채팅 화면 접근
- WebSocket 연결이 JWT 인증을 통과하는지 확인
- 메시지 생성 요청 후 관련 이벤트 흐름 확인

## 배운 점

실시간 기능이라고 해서 모두 WebSocket으로 처리할 필요는 없다.

클라이언트가 서버로 보내야 하는 채팅 메시지는 WebSocket이 잘 맞는다.

반대로 서버가 변경 사실을 알려주기만 하면 되는 알림, 상태 변경, 목록 갱신은 SSE가 단순하고 잘 맞는다.

이번 미션에서 중요한 점은 기술 이름보다 역할을 나누는 기준이었다.

```text
양방향이 필요하면 WebSocket
서버 -> 클라이언트 알림이면 SSE
```
