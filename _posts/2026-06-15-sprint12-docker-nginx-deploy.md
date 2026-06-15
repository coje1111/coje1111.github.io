---
layout: post
title: "Nginx와 Docker Compose로 배포 구조 만들기"
---

# Nginx와 Docker Compose로 배포 구조 만들기

## 배경

sprint mission 12에서는 단순히 Spring Boot 서버 하나만 실행하는 것이 아니라, 실제 배포에 가까운 구조를 Docker Compose로 구성했다.

목표는 다음과 같았다.

- 브라우저는 `localhost:3000`으로만 접근한다.
- Nginx가 프론트 정적 파일을 서빙한다.
- `/api/*`, `/ws/*` 요청은 Spring Boot 백엔드로 프록시한다.
- PostgreSQL, Redis, Kafka는 백엔드만 접근한다.
- 외부에서는 DB, Redis, Kafka에 직접 접근하지 못하게 한다.

즉, Nginx가 외부로 열려 있는 입구 역할을 한다.

## 전체 구조

최종 구조는 대략 다음과 같다.

```text
Browser
  -> localhost:3000
  -> Nginx Reverse Proxy
      -> 정적 파일은 Nginx가 응답
      -> /api/* 는 Backend로 전달
      -> /ws/* 는 Backend로 전달

Backend
  -> PostgreSQL
  -> Redis
  -> Kafka
```

여기서 중요한 점은 브라우저가 백엔드, DB, Redis, Kafka 주소를 직접 알 필요가 없다는 것이다.

브라우저 입장에서는 항상 `localhost:3000` 하나만 사용한다.

## Nginx가 하는 일

Nginx는 두 가지 일을 한다.

첫 번째는 정적 프론트엔드 파일을 제공하는 것이다.

프론트 빌드 결과물은 Nginx 컨테이너 내부의 정적 파일 경로에 복사했다.

```text
/usr/share/nginx/html
```

두 번째는 API와 WebSocket 요청을 백엔드로 넘기는 것이다.

```text
/api/* -> backend:8080
/ws/*  -> backend:8080
```

이런 역할을 Reverse Proxy라고 부른다.

## 왜 Reverse Proxy가 필요할까

처음 개발할 때는 프론트와 백엔드를 따로 생각하기 쉽다.

하지만 실제 배포에서는 사용자가 여러 주소를 직접 오가게 만들면 불편하다.

```text
프론트: localhost:3000
백엔드: localhost:8080
```

이렇게 나누면 CORS, 쿠키, WebSocket 주소 같은 문제도 같이 생긴다.

Nginx를 앞에 두면 사용자는 하나의 주소만 사용한다.

```text
사용자 요청은 전부 localhost:3000
Nginx가 내부에서 적절한 서버로 전달
```

## Docker Compose 구성

이번 Compose에는 여러 컨테이너가 있다.

- `reverse-proxy`: Nginx
- `backend`: Spring Boot
- `db`: PostgreSQL
- `redis`: Redis
- `broker`: Kafka

Docker Compose 네트워크 안에서는 컨테이너 이름으로 서로 접근할 수 있다.

예를 들어 백엔드는 DB에 이렇게 접근한다.

```text
jdbc:postgresql://db:5432/discodeit
```

Redis는 이렇게 접근한다.

```text
redis:6379
```

Kafka는 이렇게 접근한다.

```text
broker:29092
```

이 주소들은 Docker Compose 내부 네트워크에서만 의미가 있다.

## 외부에 열어둔 포트

외부에 열어둔 포트는 Nginx의 `3000`번이다.

DB, Redis, Kafka는 외부 포트로 열지 않았다.

이유는 간단하다.

브라우저나 외부 사용자가 DB, Redis, Kafka에 직접 접근할 필요가 없기 때문이다.

```text
외부 접근 허용
  -> Nginx 3000

내부에서만 접근
  -> PostgreSQL
  -> Redis
  -> Kafka
```

이렇게 해야 구조가 더 안전하고 명확하다.

## 다중 백엔드 인스턴스

후반 요구사항에서는 백엔드를 3개 인스턴스로 늘렸다.

Docker Compose의 `deploy.replicas`를 사용해 백엔드 컨테이너를 여러 개 띄웠다.

```text
backend-1
backend-2
backend-3
```

Nginx는 이 백엔드들 중 하나로 요청을 전달한다.

이때 로드밸런싱 전략도 비교했다.

- Round Robin: 순서대로 분배
- Least Connections: 연결이 적은 서버 우선
- IP Hash: 같은 IP는 같은 서버로 보내기
- Weight: 서버별 가중치 부여

이번 검증에서는 `X-Upstream-Server` 헤더를 추가해 실제 어떤 백엔드가 요청을 처리했는지 확인했다.

## 실제 확인한 내용

로그인 후 같은 JWT로 `/api/users` 요청을 여러 번 보냈다.

응답 헤더의 `X-Upstream-Server`를 확인하니 서로 다른 백엔드가 번갈아 응답했다.

```text
login -> 172.21.0.6:80
/api/users -> 172.21.0.7:80
/api/users -> 172.21.0.5:80
/api/users -> 172.21.0.6:80
```

이 결과는 두 가지를 의미한다.

첫째, Nginx 로드밸런싱이 실제로 동작한다.

둘째, 인증 상태가 특정 백엔드 한 대에만 묶여 있으면 안 된다.

그래서 Redis 기반 JWT Registry가 필요해졌다.

## 배운 점

배포 구조를 만들 때 중요한 것은 단순히 컨테이너를 많이 띄우는 것이 아니다.

각 컴포넌트의 역할과 접근 방향을 분리해야 한다.

```text
Nginx: 외부 요청의 입구
Backend: 비즈니스 로직 처리
PostgreSQL: 영구 데이터 저장
Redis: 캐시와 인증 상태 공유
Kafka: 이벤트 전달
```

이번 미션을 통해 `localhost:3000` 하나로 프론트, API, WebSocket을 모두 처리하는 구조를 경험했다.

그리고 백엔드가 여러 개가 되면 기존 코드의 숨어 있던 한계가 드러난다는 것도 알게 됐다.
