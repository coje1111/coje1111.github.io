---
layout: post
title: "Remember-me로 로그인 유지 구현하기"
---

# Remember-me로 로그인 유지 구현하기

## 배경

일반 세션은 브라우저를 닫거나 세션이 만료되면 사라질 수 있다. 이번 요구사항에서는 로그인 화면의 "로그인 유지"를 체크한 경우, 세션이 무효화되어도 자동으로 다시 로그인되도록 해야 했다.

이를 위해 Spring Security의 remember-me 기능을 사용했다.

## remember-me란 무엇인가

remember-me는 세션이 없어도 사용자를 다시 인증할 수 있게 해주는 기능이다.

로그인 유지 체크 후 로그인하면 서버는 remember-me 쿠키를 브라우저에 내려준다. 나중에 `JSESSIONID` 세션 쿠키가 사라져도 remember-me 쿠키가 남아 있으면 Spring Security가 사용자를 다시 인증하고 새 세션을 만들 수 있다.

## JSESSIONID와 remember-me의 차이

```text
JSESSIONID: 지금 로그인 세션을 찾는 쿠키
remember-me: 세션이 없어졌을 때 다시 인증하기 위한 쿠키
```

그래서 `JSESSIONID`를 지운 뒤 새로고침했을 때 다시 `JSESSIONID`가 생길 수 있다. remember-me 인증이 성공하면 서버가 새 세션을 만들기 때문이다.

## 핵심 파일

- `SecurityConfig`
- `JsonUsernamePasswordAuthenticationFilter`
- `DiscodeitUserDetailsService`
- 프론트 정적 번들

`SecurityConfig`에서는 `TokenBasedRememberMeServices`를 설정했고, 커스텀 로그인 필터에도 remember-me 서비스를 연결했다.

## 요청 흐름

```text
브라우저
  ↓
POST /api/auth/login, remember-me=true
  ↓
로그인 인증 성공
  ↓
JSESSIONID 쿠키 발급
  ↓
remember-me 쿠키 발급
```

이후 세션 쿠키가 사라진 상태에서 요청을 보내면 remember-me 쿠키를 통해 자동 인증되고 새 세션이 만들어질 수 있다.

## 브라우저 확인

로그인 유지 체크 후 로그인하면 개발자 도구의 쿠키에서 다음 값을 볼 수 있다.

- `JSESSIONID`
- `remember-me`
- `XSRF-TOKEN`

`JSESSIONID`만 삭제하고 새로고침했을 때 로그인이 유지되면 remember-me가 동작하는 것이다.

## PR에서 설명할 말

Spring Security remember-me 기능을 활성화하고, 커스텀 로그인 필터와 연동해 `remember-me` 요청 값이 true일 때 remember-me 쿠키가 발급되도록 구성했다. 세션 쿠키가 없어져도 remember-me 쿠키가 유효하면 사용자를 다시 인증하고 새 세션을 만들 수 있도록 했다.

## 배운 점

세션 유지와 자동 로그인은 다르다. 세션은 현재 로그인 상태를 유지하는 방식이고, remember-me는 세션이 사라졌을 때 다시 인증하는 방식이다.
