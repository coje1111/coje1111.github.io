---
layout: post
title: "Caffeine과 Redis Cache 비교하며 적용하기"
---

# Caffeine과 Redis Cache 비교하며 적용하기

## 배경

sprint mission 11에서는 캐시를 두 단계로 적용했다.

처음에는 Caffeine 캐시를 적용했고, 마지막에는 Redis 캐시로 전환했다.

두 기술은 모두 캐시지만 저장 위치가 다르다.

- Caffeine: 애플리케이션 메모리 안에 저장하는 로컬 캐시
- Redis: 별도 Redis 서버에 저장하는 전역 캐시

## 캐시가 필요한 이유

채팅 서비스에서는 자주 조회되는 데이터가 있다.

예를 들면 다음과 같다.

- 사용자 목록
- 사용자별 채널 목록
- 사용자별 알림 목록

이 데이터는 매번 DB에서 조회할 수도 있다. 하지만 트래픽이 많아지면 같은 조회가 반복되어 DB 부담이 커진다.

캐시는 자주 조회되는 결과를 잠시 저장해두고, 같은 요청이 다시 오면 DB 대신 캐시에서 꺼내 쓰는 방식이다.

```text
첫 번째 조회
  -> DB 조회
  -> 결과를 캐시에 저장

두 번째 조회
  -> 캐시에서 바로 반환
```

## Caffeine 캐시 적용

처음에는 Caffeine을 사용했다.

Caffeine은 애플리케이션 안에서 동작하는 빠른 메모리 캐시다.

이번에 캐시를 적용한 대상은 다음과 같다.

- `users`
- `channels`
- `notifications`

Service 메서드에 `@Cacheable`을 붙여 조회 결과를 캐시에 저장했다.

데이터가 바뀌는 메서드에는 `@CacheEvict`를 붙여 캐시를 비웠다.

예를 들어 채널이 추가, 수정, 삭제되면 사용자별 채널 목록 캐시가 오래된 데이터가 될 수 있다.

그래서 채널 변경 시 `channels` 캐시를 무효화했다.

## 캐시 무효화가 중요한 이유

캐시는 빠르지만 위험한 점이 있다.

데이터가 바뀌었는데 캐시를 비우지 않으면 사용자는 예전 데이터를 볼 수 있다.

예를 들어 새 채널을 만들었는데 채널 목록 캐시가 그대로 남아 있으면 새 채널이 화면에 안 보일 수 있다.

그래서 캐시를 적용할 때는 항상 두 가지를 같이 생각해야 한다.

```text
1. 어떤 조회 결과를 캐시에 저장할 것인가
2. 어떤 변경이 일어나면 캐시를 비울 것인가
```

이번 프로젝트에서는 다음처럼 처리했다.

- 채널 생성, 수정, 삭제 -> `channels` 캐시 무효화
- 알림 생성, 삭제 -> `notifications` 캐시 무효화
- 사용자 생성, 로그인, 로그아웃, 권한 변경 -> `users` 캐시 무효화

## Caffeine의 한계

Caffeine은 빠르고 간단하지만 로컬 캐시다.

즉, 애플리케이션 인스턴스 하나의 메모리에만 저장된다.

서버가 한 대라면 문제가 적다. 하지만 트래픽이 많아져 서버를 여러 대로 늘리면 문제가 생긴다.

```text
서버 A의 캐시
서버 B의 캐시
서버 C의 캐시
```

각 서버가 서로 다른 캐시를 가진다.

서버 A에서 데이터가 바뀌어 캐시를 비워도 서버 B의 캐시는 그대로 남아 있을 수 있다.

이런 상황에서는 사용자마다 어떤 서버로 요청이 가느냐에 따라 다른 데이터를 볼 수 있다.

## Redis 캐시로 전환

이 문제를 해결하기 위해 Redis를 도입했다.

Redis는 애플리케이션 밖에 있는 별도 저장소다.

여러 서버가 같은 Redis를 바라보면 캐시를 공유할 수 있다.

```text
서버 A
서버 B  -> Redis Cache
서버 C
```

이렇게 하면 여러 인스턴스가 같은 캐시 저장소를 사용한다.

## Redis 설정

Docker Compose로 Redis를 실행했다.

```text
docker compose -f docker-compose-redis.yml up -d
```

Redis 설정은 `application.yaml`에 추가했다.

```yaml
spring:
  cache:
    type: redis
    redis:
      enable-statistics: true
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
```

캐시 이름은 다음과 같이 사용했다.

```text
users
channels
notifications
```

## Redis 직렬화 설정

Redis는 데이터를 바이트나 문자열 형태로 저장한다.

Java 객체를 그대로 저장할 수는 없다. 그래서 객체를 JSON 형태로 바꿔 저장해야 한다.

이번 프로젝트에서는 `RedisCacheConfiguration` Bean을 만들고 `GenericJackson2JsonRedisSerializer`를 사용했다.

또 `ObjectMapper`에 default typing을 활성화했다.

이유는 Redis에 저장했다가 다시 꺼낼 때 원래 타입 정보를 알아야 하기 때문이다.

예를 들어 `UserDto` 목록을 Redis에 저장했다면, 다시 꺼낼 때 단순한 Map이 아니라 `UserDto`로 복원되어야 한다.

## 실제 Redis 저장 확인

API를 호출한 뒤 Redis에 실제 캐시 키가 생겼는지 확인했다.

확인된 키는 다음과 같다.

```text
discodeit:channels::35e9bd77-1bda-4ce3-92b1-ffb66ace32dd
discodeit:notifications::35e9bd77-1bda-4ce3-92b1-ffb66ace32dd
discodeit:users::SimpleKey []
```

DB 키 개수도 확인했다.

```text
redis-cli DBSIZE
3
```

TTL도 확인했다.

```text
TTL discodeit:users::SimpleKey []
507
```

TTL은 캐시가 영원히 남지 않고 일정 시간이 지나면 만료된다는 뜻이다.

이번 설정에서는 600초로 설정했기 때문에 조회 시점에 따라 507초처럼 줄어든 값이 보일 수 있다.

## DataGrip에서 확인할 정보

DataGrip에서 Redis를 연결한다면 아래 정보로 보면 된다.

```text
Host: localhost
Port: 6379
Database: 0
Auth: 없음
```

확인할 키 패턴은 다음과 같다.

```text
discodeit:*
```

PR 캡처에는 Redis 키 목록과 TTL 화면을 넣으면 좋다.

## 테스트와 확인 방법

코드 검증은 전체 테스트로 확인했다.

```text
./gradlew.bat test
```

Redis 동작 검증은 다음 순서로 했다.

```text
1. Redis 컨테이너 실행
2. 애플리케이션 실행
3. 로그인 후 사용자 목록, 채널 목록, 알림 목록 API 호출
4. redis-cli로 discodeit:* 키 조회
5. TTL과 값 타입 확인
```

## 배운 점

Caffeine과 Redis는 둘 다 캐시지만 사용 목적이 조금 다르다.

Caffeine은 단일 서버에서 빠르고 간단하게 캐시를 적용할 때 좋다.

Redis는 여러 서버가 같은 캐시를 공유해야 할 때 좋다.

이번 미션의 핵심은 단순히 Redis 설정을 추가하는 것이 아니라, 서버가 여러 대가 되는 상황을 상상하는 것이다.

서버가 한 대일 때는 로컬 메모리 캐시도 괜찮다. 하지만 서버가 여러 대가 되면 로컬 캐시는 서로 공유되지 않는다.

그래서 분산 환경에서는 Redis 같은 전역 캐시 저장소가 필요하다.
