---
layout: post
title: "분산 환경에서 Redis와 Kafka로 상태 공유하기"
---

# 분산 환경에서 Redis와 Kafka로 상태 공유하기

## 배경

sprint mission 12의 마지막 주제는 분산 환경이었다.

처음에는 서버가 하나라고 생각하고 기능을 만들었다.

서버가 하나라면 메모리에 저장해도 문제가 잘 드러나지 않는다.

하지만 백엔드 인스턴스가 3개로 늘어나면 상황이 달라진다.

```text
backend-1
backend-2
backend-3
```

각 서버는 자기만의 메모리를 가진다.

즉, `backend-1` 메모리에 저장된 값은 `backend-2`가 볼 수 없다.

이번 요구사항은 이런 한계를 찾고, Redis와 Kafka를 이용해 해결하는 것이었다.

## InMemoryJwtRegistry의 한계

기존에는 JWT 로그인 상태를 `InMemoryJwtRegistry`로 관리했다.

이름 그대로 애플리케이션 메모리에 저장한다.

서버가 하나라면 흐름은 단순하다.

```text
로그인
  -> 서버 메모리에 JWT 상태 저장

다음 요청
  -> 같은 서버 메모리에서 JWT 상태 확인
```

하지만 서버가 여러 개면 문제가 생긴다.

예를 들어 로그인을 `backend-1`이 처리했다고 하자.

```text
backend-1 메모리: 이 사용자 로그인됨
backend-2 메모리: 모름
backend-3 메모리: 모름
```

이후 요청이 Nginx 로드밸런싱 때문에 `backend-2`로 가면 `backend-2`는 이 토큰을 모른다.

그러면 사용자는 방금 로그인했는데도 인증 실패를 겪을 수 있다.

## RedisJwtRegistry로 바꾼 이유

이 문제는 `InMemoryJwtRegistry` 코드를 조금 고친다고 해결되지 않는다.

저장 위치가 각 서버의 메모리인 것 자체가 문제다.

그래서 JWT 상태를 Redis에 저장하도록 바꿨다.

```text
backend-1
backend-2  -> Redis
backend-3
```

이제 어떤 백엔드가 요청을 처리해도 같은 Redis를 조회한다.

로그인을 어느 서버에서 했는지 중요하지 않다.

## Redis에 저장한 구조

마지막 요구사항에서는 사용자별 JWT 목록과 토큰 인덱스를 Redis에 저장했다.

사용자별 JWT 목록:

```text
jwt:users:{userId}
```

Access Token 인덱스:

```text
jwt:access_tokens
```

Refresh Token 인덱스:

```text
jwt:refresh_tokens
```

사용자별 목록은 Redis List로 관리했다.

토큰 인덱스는 Redis Set으로 관리했다.

이렇게 하면 사용자 기준으로도 찾을 수 있고, 토큰 기준으로도 확인할 수 있다.

## 분산락이 필요한 이유

동시에 같은 계정으로 로그인하거나 토큰 재발급이 일어날 수 있다.

서버가 하나라면 `synchronized` 같은 방식으로 어느 정도 막을 수 있다.

하지만 서버가 여러 개면 Java 메모리 락은 소용이 없다.

```text
backend-1의 synchronized
backend-2의 synchronized
backend-3의 synchronized
```

각 서버 안에서만 잠기기 때문이다.

그래서 Redis 기반 분산락을 사용했다.

`RedisLockProvider`는 Redis의 `SETNX` 방식으로 락을 잡는다.

```text
락 키가 없으면 생성 -> 락 획득 성공
락 키가 이미 있으면 -> 다른 서버가 작업 중
```

락에는 TTL도 둔다.

만약 서버가 중간에 죽어도 락이 영원히 남지 않게 하기 위해서다.

## 동시 로그인 수 제한

이번 구조에서는 한 사용자당 활성 JWT 개수를 제한한다.

현재는 최대 1개만 유지한다.

새 로그인이 들어오면 기존 토큰을 제거하고 새 토큰을 등록한다.

```text
기존 토큰 있음
  -> 오래된 토큰 제거
  -> 새 토큰 저장
```

이렇게 하면 같은 계정으로 여러 곳에서 동시에 로그인하는 상황을 제어할 수 있다.

## WebSocket과 SSE의 분산 환경 한계

WebSocket과 SSE도 비슷한 문제가 있다.

클라이언트 연결은 각 서버의 메모리에 붙어 있다.

예를 들어 사용자 A의 브라우저가 `backend-2`에 SSE로 연결되어 있다고 하자.

그런데 새 메시지 이벤트를 `backend-1`만 받으면 `backend-2`에 연결된 사용자 A에게 이벤트를 보낼 수 없다.

```text
backend-1: 이벤트 받음, 하지만 사용자 연결 없음
backend-2: 사용자 연결 있음, 하지만 이벤트 못 받음
```

이게 분산 환경에서 WebSocket/SSE가 어려운 이유다.

## Kafka consumer group의 함정

Kafka는 consumer group을 사용한다.

같은 group에 여러 consumer가 있으면 Kafka는 이벤트를 나눠서 전달한다.

```text
하나의 이벤트
  -> group 안의 consumer 중 한 명만 처리
```

이 방식은 DB에 알림을 저장할 때는 좋다.

알림을 여러 서버가 동시에 저장하면 중복 알림이 생길 수 있기 때문이다.

하지만 WebSocket/SSE 전송은 다르다.

각 서버가 자기 서버에 연결된 클라이언트에게 이벤트를 보내야 하므로, 모든 서버가 이벤트를 받아야 한다.

## 그래서 group을 분리했다

이번에는 Kafka 소비 목적을 두 가지로 나눴다.

첫 번째는 알림 DB 저장이다.

```text
discodeit-group
```

이 group은 이벤트를 한 번만 처리한다.

두 번째는 실시간 전송이다.

```text
discodeit-realtime-{hostname}
```

이 group은 백엔드 인스턴스마다 다르게 만든다.

Kafka에서 group이 다르면 같은 이벤트를 각각 받을 수 있다.

```text
MessageCreatedEvent
  -> discodeit-realtime-backend-1
  -> discodeit-realtime-backend-2
  -> discodeit-realtime-backend-3
```

결과적으로 각 백엔드는 같은 이벤트를 받고, 자기에게 연결된 WebSocket/SSE 클라이언트에게만 전송한다.

## 최종 이벤트 흐름

메시지 생성 흐름은 다음과 같다.

```text
MessageService
  -> MessageCreatedEvent 발행
  -> KafkaProduceRequiredEventListener
  -> Kafka topic 전송
  -> RealtimeTopicListener
  -> 각 백엔드에서 WebSocket 전송
```

알림 생성 흐름은 다음과 같다.

```text
MessageCreatedEvent
  -> Kafka
  -> NotificationRequiredTopicListener
  -> 알림 DB 저장
  -> SseSendRequiredEvent 발행
  -> Kafka
  -> RealtimeTopicListener
  -> 각 백엔드에서 SSE 전송
```

여기서 중요한 점은 DB 저장과 실시간 전송의 책임을 분리했다는 것이다.

- 알림 DB 저장: 한 번만 처리
- WebSocket/SSE 전송: 모든 백엔드 인스턴스가 처리

## 실제 확인한 내용

Docker Compose로 백엔드 3개를 띄웠다.

로그인 후 같은 JWT로 `/api/users`를 여러 번 호출했다.

응답 헤더 `X-Upstream-Server`를 확인하니 서로 다른 백엔드가 번갈아 응답했다.

```text
login status=200 upstream=172.21.0.6:80
/api/users -> 172.21.0.7:80
/api/users -> 172.21.0.5:80
/api/users -> 172.21.0.6:80
```

전부 `200`이 나왔기 때문에 Redis 기반 JWT 상태 공유가 동작한다고 볼 수 있다.

Kafka consumer group도 확인했다.

```text
discodeit-group

discodeit-realtime-...
discodeit-realtime-...
discodeit-realtime-...
```

`discodeit-group`은 알림 저장용이고, `discodeit-realtime-*`은 각 백엔드 인스턴스의 실시간 전송용이다.

Redis에도 새 JWT 키가 생성된 것을 확인했다.

```text
jwt:users:{userId}
jwt:access_tokens
jwt:refresh_tokens
```

## 이번에 겪은 문제

중간에 Redis 키 타입 충돌이 있었다.

이전 구현에서는 `jwt:user:{userId}` 키를 단일 값으로 저장했다.

마지막 요구사항에서는 사용자별 JWT 목록을 List로 바꾸었다.

같은 키 이름을 그대로 쓰면 Redis 입장에서는 이런 문제가 생긴다.

```text
기존 키: String 또는 JSON Value
새 코드: List로 사용하려고 함
```

그래서 Redis에서 `WRONGTYPE` 오류가 발생했다.

해결 방법은 새 구조에 맞게 prefix를 분리하는 것이었다.

```text
기존: jwt:user:{userId}
변경: jwt:users:{userId}
```

이 경험으로 Redis는 키 이름 설계도 중요하다는 것을 배웠다.

## 배운 점

서버가 하나일 때 잘 되던 코드가 서버를 여러 개로 늘리면 바로 문제가 될 수 있다.

특히 메모리에 저장하는 정보는 조심해야 한다.

```text
서버 메모리
  -> 빠르고 단순함
  -> 서버 여러 대에서는 공유되지 않음
```

분산 환경에서는 상태를 어디에 저장할지 먼저 생각해야 한다.

이번 미션에서는 다음처럼 정리할 수 있다.

```text
JWT 로그인 상태
  -> Redis에 저장

중복되면 안 되는 DB 알림 생성
  -> Kafka 같은 consumer group 사용

모든 서버가 받아야 하는 실시간 전송 이벤트
  -> 인스턴스별 Kafka consumer group 사용
```

이번 미션의 핵심은 Redis와 Kafka를 쓰는 문법보다, 왜 서버 메모리만으로는 부족한지 이해하는 것이었다.
