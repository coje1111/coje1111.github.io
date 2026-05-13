---
layout: post
title: "Spring Security 로그인 흐름 이해하기"
---

# Spring Security 로그인 흐름 이해하기

## 배경

이번 미션에서는 기존에 직접 구현했던 로그인 코드를 제거하고 Spring Security의 로그인 흐름을 사용했다. 단, CSR 프론트는 HTML redirect가 아니라 JSON 응답을 기대하므로 기본 `formLogin`을 그대로 쓰지는 않았다.

로그인 URL은 `/api/auth/login`이고, 성공하면 `200 UserDto`, 실패하면 `401 ErrorResponse`를 반환하도록 구성했다.

## 핵심 파일

- `SecurityConfig`
- `JsonUsernamePasswordAuthenticationFilter`
- `DiscodeitUserDetailsService`
- `DiscodeitUserDetails`
- `LoginSuccessHandler`
- `LoginFailureHandler`

`SecurityConfig`는 로그인 필터를 등록한다. `JsonUsernamePasswordAuthenticationFilter`는 로그인 요청에서 username, password, remember-me 값을 읽는다. `DiscodeitUserDetailsService`는 DB에서 사용자 정보를 찾는다.

## 요청 흐름

```text
브라우저
  ↓
POST /api/auth/login
  ↓
JsonUsernamePasswordAuthenticationFilter
  ↓
AuthenticationManager
  ↓
DiscodeitUserDetailsService
  ↓
PasswordEncoder로 비밀번호 검증
  ↓
성공 또는 실패 Handler 실행
```

로그인이 성공하면 인증 정보가 `SecurityContext`에 저장되고 세션과 연결된다. 브라우저에는 `JSESSIONID` 쿠키가 내려간다.

## UserDetailsService가 필요한 이유

Spring Security는 로그인할 때 username으로 사용자를 찾는 방법을 알아야 한다. 기본 구현체는 메모리에 사용자를 저장하는 방식이지만, 이 프로젝트는 DB에 사용자가 있다.

그래서 `DiscodeitUserDetailsService`를 만들고, DB 사용자 정보를 `DiscodeitUserDetails`로 바꿔 Spring Security에 전달했다.

## 성공/실패 Handler

기본 로그인 성공 Handler는 페이지 이동을 전제로 할 수 있다. 하지만 CSR 프론트는 JSON 응답이 필요하다.

그래서 `LoginSuccessHandler`는 인증된 사용자의 `UserDto`를 JSON으로 반환하고, `LoginFailureHandler`는 실패 시 `401 ErrorResponse`를 반환하도록 했다.

## 기존 로그인 코드 제거

로그인 처리가 SecurityFilterChain으로 이동했으므로 기존 `AuthController.login`, `AuthService.login`, `LoginRequest`는 제거했다. 인증 흐름이 여러 곳에 나뉘면 세션 저장 방식이 꼬일 수 있기 때문이다.

## PR에서 설명할 말

기존 직접 로그인 코드를 제거하고 Spring Security 인증 흐름으로 로그인 처리를 통합했다. CSR 프론트에 맞추기 위해 커스텀 로그인 필터와 성공/실패 Handler를 구성해 JSON 응답을 반환하도록 했다.

## 배운 점

Spring Security에서 로그인은 Controller보다 필터에 가까운 기능이다. 요청을 필터가 먼저 가로채고, 인증 매니저가 사용자 조회와 비밀번호 검증을 진행한 뒤 세션에 인증 정보를 저장한다.
