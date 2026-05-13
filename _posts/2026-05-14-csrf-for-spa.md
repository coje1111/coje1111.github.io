---
layout: post
title: "CSR 환경에서 CSRF 토큰 처리하기"
---

# CSR 환경에서 CSRF 토큰 처리하기

## 배경

이번 프로젝트의 프론트엔드는 서버가 HTML을 만들어 내려주는 SSR 방식이 아니라, 브라우저의 JavaScript가 화면을 만드는 CSR 방식이다. Spring Security는 기본적으로 SSR 환경을 많이 가정하므로, CSR 프론트가 CSRF 토큰을 읽고 API 요청에 실어 보낼 수 있도록 설정을 바꿔야 했다.

## 먼저 알아야 할 단어

CSRF는 사용자가 의도하지 않은 요청을 다른 사이트가 몰래 보내게 만드는 공격이다. 사용자가 로그인한 상태라면 브라우저는 쿠키를 자동으로 함께 보내기 때문에, 서버는 "이 요청이 진짜 우리 프론트에서 보낸 요청인지"를 확인해야 한다.

CSRF 토큰은 이 확인에 쓰이는 값이다. 서버가 토큰을 발급하고, 클라이언트는 이후 변경 요청에 그 토큰을 함께 보낸다.

## 문제 상황

Spring Security의 기본 CSRF 저장소는 `HttpSessionCsrfTokenRepository`이다. 하지만 CSR 프론트에서는 JavaScript가 토큰 값을 읽어 요청 헤더에 넣어야 한다.

그래서 이번 프로젝트에서는 `CookieCsrfTokenRepository.withHttpOnlyFalse()`를 사용했다. `HttpOnly`가 `true`이면 JavaScript가 쿠키를 읽을 수 없으므로, 프론트가 토큰을 헤더에 실어 보내야 하는 이번 요구사항에는 맞지 않는다.

## 핵심 파일

- `SecurityConfig`
- `SpaCsrfTokenRequestHandler`
- `AuthController`

`SecurityConfig`에서는 CSRF 토큰 저장소를 쿠키 방식으로 바꾸고, SPA 환경에 맞는 `SpaCsrfTokenRequestHandler`를 적용했다.

`AuthController`에는 `GET /api/auth/csrf-token` API를 만들었다. 이 API는 프론트가 최초 요청 전에 CSRF 토큰을 받을 수 있게 한다.

## 요청 흐름

```text
브라우저
  ↓
GET /api/auth/csrf-token
  ↓
서버가 CSRF 토큰 생성
  ↓
Set-Cookie: XSRF-TOKEN=...
  ↓
브라우저가 쿠키에 저장
```

이후 실제 변경 요청에서는 다음처럼 보낸다.

```text
POST /api/users
Cookie: XSRF-TOKEN=...
Header: X-XSRF-TOKEN=...
```

서버는 요청에 포함된 토큰이 유효한지 확인한 뒤 요청을 처리한다.

## PR에서 설명할 말

CSR 환경에서 프론트가 CSRF 토큰을 읽어 요청 헤더에 포함할 수 있도록 `CookieCsrfTokenRepository.withHttpOnlyFalse()`를 적용했다. 또한 Spring 공식 문서에서 권장하는 SPA용 `CsrfTokenRequestHandler`를 적용해 쿠키 기반 토큰 전달과 기본 CSRF 보호 흐름을 함께 유지했다.

## 배운 점

CSRF는 로그인 여부와 별개의 보안 장치다. 로그인한 사용자의 쿠키가 자동으로 전송된다는 브라우저 특성 때문에, 서버는 요청에 CSRF 토큰이 포함되어 있는지도 확인해야 한다.
