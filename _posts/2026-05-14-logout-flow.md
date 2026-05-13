---
layout: post
title: "Spring Security 로그아웃 흐름 이해하기"
---

# Spring Security 로그아웃 흐름 이해하기

## 배경

로그아웃도 Controller에서 직접 세션을 지우는 방식으로 만들 수 있다. 하지만 이번 미션에서는 Spring Security의 기본 logout 흐름을 유지하면서 필요한 설정만 바꾸는 것이 요구사항이었다.

로그아웃 처리 URL은 `/api/auth/logout`이고, 성공 응답은 `204 No Content`이다.

## 로그아웃이 하는 일

로그아웃은 단순히 화면을 로그인 페이지로 바꾸는 일이 아니다. 서버 관점에서는 현재 인증 상태를 제거하는 작업이다.

보통 세션 무효화, SecurityContext 제거, 관련 쿠키 정리, 성공 응답 반환이 함께 일어난다.

## 핵심 파일

로그아웃 설정은 `SecurityConfig`에 있다.

바꾼 요소는 두 가지다.

- 로그아웃 URL을 `/api/auth/logout`으로 설정
- 성공 Handler를 `HttpStatusReturningLogoutSuccessHandler`로 변경

## 요청 흐름

```text
브라우저
  ↓
POST /api/auth/logout
  ↓
Spring Security LogoutFilter
  ↓
세션 무효화
  ↓
SecurityContext 정리
  ↓
204 No Content 응답
```

로그아웃 요청은 Controller가 아니라 Spring Security의 logout 필터가 처리한다.

## 왜 204를 반환할까

`204 No Content`는 요청이 성공했지만 응답 본문은 없다는 뜻이다. 로그아웃은 성공 여부만 알면 되고 별도 데이터가 필요하지 않다.

CSR 프론트에서는 204 응답을 받으면 화면 상태를 로그인 전으로 바꾸면 된다.

## PR에서 설명할 말

Spring Security의 logout 흐름을 유지하면서 로그아웃 URL을 `/api/auth/logout`으로 설정했다. CSR 프론트에 맞게 redirect 대신 `HttpStatusReturningLogoutSuccessHandler`를 사용해 `204 No Content`를 반환하도록 구성했다.

## 배운 점

로그아웃은 단순 API 메서드가 아니라 인증 상태를 정리하는 보안 흐름이다. Spring Security logout 필터를 사용하면 세션과 SecurityContext 정리를 프레임워크 흐름 안에서 처리할 수 있다.
