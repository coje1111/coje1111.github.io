---
layout: post
title: "세션으로 현재 사용자 조회하기"
---

# 세션으로 현재 사용자 조회하기

## 배경

기존 프론트는 현재 사용자 정보를 브라우저 저장소에 저장해서 사용했다. 하지만 브라우저 저장소는 JavaScript로 접근할 수 있기 때문에 XSS 공격에 취약하다.

이번 미션에서는 사용자 정보를 브라우저 저장소가 아니라 서버 세션 기준으로 관리하도록 바꾸었다.

## 세션과 JSESSIONID

HTTP 요청은 기본적으로 상태를 기억하지 않는다. 그래서 서버는 사용자가 이전 요청에서 로그인했는지 알 수 없다.

로그인에 성공하면 서버는 세션을 만들고 브라우저에 `JSESSIONID` 쿠키를 내려준다. 브라우저는 이후 요청마다 이 쿠키를 보내고, 서버는 그 값으로 세션을 찾는다.

## 현재 사용자 조회 API

현재 사용자 조회 API는 다음과 같다.

```text
GET /api/auth/me
```

이 API는 세션에 저장된 인증 정보를 기준으로 현재 로그인한 사용자의 `UserDto`를 반환한다.

## 핵심 파일

- `AuthController`
- `DiscodeitUserDetails`
- `SecurityConfig`
- `BasicUserService`

`AuthController`에서는 `@AuthenticationPrincipal`을 사용해 현재 로그인한 사용자 정보를 받는다.

## 요청 흐름

```text
브라우저
  ↓
GET /api/auth/me
  ↓
JSESSIONID 쿠키 전송
  ↓
Spring Security가 세션에서 인증 정보 조회
  ↓
@AuthenticationPrincipal에 DiscodeitUserDetails 주입
  ↓
UserDto 응답
```

로그인하지 않은 상태라면 인증 정보가 없기 때문에 `401`이 발생한다.

## 왜 다시 조회했을까

principal 안의 `UserDto`는 로그인 당시 정보일 수 있다. 권한이나 온라인 상태가 바뀌었을 수도 있다.

그래서 `/api/auth/me`에서는 principal의 사용자 ID를 기준으로 `UserService.find`를 다시 호출해 최신 상태에 가까운 `UserDto`를 반환하도록 했다.

## PR에서 설명할 말

현재 사용자 조회를 브라우저 저장소가 아니라 Spring Security 세션 기반으로 변경했다. `GET /api/auth/me`에서 `@AuthenticationPrincipal`로 인증 사용자를 받고, 사용자 ID 기준으로 최신 `UserDto`를 조회해 반환하도록 구성했다.

## 배운 점

`JSESSIONID`는 로그인 정보를 직접 담고 있는 쿠키가 아니라, 서버의 세션을 찾기 위한 열쇠다. 실제 인증 정보는 서버 쪽 세션과 `SecurityContext`에 연결되어 있다.
