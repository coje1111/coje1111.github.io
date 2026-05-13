---
layout: post
title: "Spring Security 전체 구조 이해하기"
---

# Spring Security 전체 구조 이해하기

## 배경

이번 sprint mission에서는 기존 채팅 서비스 프로젝트에 `Spring Security`를 적용했다.

처음에는 단순히 로그인 API를 직접 만들면 된다고 생각하기 쉽다. 하지만 Spring Security를 사용하면 로그인, 로그아웃, 세션, 권한 확인 같은 흐름이 대부분 `SecurityFilterChain` 안에서 처리된다.

그래서 이 챕터의 목표는 코드를 전부 외우는 것이 아니라, 요청이 들어왔을 때 Spring Security가 어디에서 막고, 어디에서 통과시키고, 어디에서 로그인 사용자를 꺼내는지 큰 흐름을 이해하는 것이다.

## 먼저 알아야 할 단어

### 인증

인증은 "너 누구야?"를 확인하는 과정이다.

예를 들어 사용자가 아이디와 비밀번호를 입력해서 로그인하면, 서버는 DB에 있는 사용자 정보와 비교한다. 맞으면 이 사용자는 로그인한 사용자라고 인정한다.

이 프로젝트에서는 로그인 성공 후 브라우저에 `JSESSIONID` 쿠키가 생기고, 서버는 그 세션을 통해 사용자를 기억한다.

### 인가

인가는 "너 이거 해도 돼?"를 확인하는 과정이다.

로그인한 사용자라고 해서 모든 기능을 쓸 수 있는 것은 아니다. 예를 들어 일반 사용자는 채널을 삭제하면 안 되고, 관리자만 사용자 권한을 바꿀 수 있어야 한다.

이 프로젝트에서는 `USER`, `CHANNEL_MANAGER`, `ADMIN` 권한을 만들고, 필요한 기능에 권한 검사를 걸었다.

### 필터

필터는 Controller에 요청이 도착하기 전에 먼저 지나가는 관문이다.

브라우저가 `/api/users` 같은 요청을 보내면 바로 `UserController`로 가는 것이 아니다. Spring Security 필터들이 먼저 요청을 확인한다.

예를 들면 다음과 같은 일을 한다.

- 로그인한 사용자인지 확인한다.
- CSRF 토큰이 맞는지 확인한다.
- 로그인 요청이면 아이디와 비밀번호를 검사한다.
- 권한이 없으면 Controller까지 보내지 않고 401 또는 403 응답을 반환한다.

## 핵심 파일

이번 보안 설정의 중심은 아래 파일이다.

- `SecurityConfig`
- `JsonUsernamePasswordAuthenticationFilter`
- `DiscodeitUserDetailsService`
- `DiscodeitUserDetails`
- `LoginSuccessHandler`
- `LoginFailureHandler`
- `AuthController`

이 중 가장 중요한 파일은 `SecurityConfig`이다.

`SecurityConfig`는 Spring Security에게 이런 규칙을 알려주는 설정 파일이다.

- 어떤 요청은 로그인 없이 허용할지
- 어떤 요청은 로그인해야만 허용할지
- 로그인 URL은 무엇인지
- 로그아웃 URL은 무엇인지
- CSRF는 어떻게 처리할지
- 세션은 어떻게 관리할지
- 권한 계층은 어떻게 둘지

## 요청 흐름

브라우저에서 API 요청을 보냈을 때 큰 흐름은 다음과 같다.

```text
브라우저
  ↓
Spring Security FilterChain
  ↓
인증 확인
  ↓
권한 확인
  ↓
Controller
  ↓
Service
  ↓
Repository / DB
```

중요한 점은 `Controller`보다 `SecurityFilterChain`이 먼저라는 것이다.

그래서 인증되지 않은 사용자가 보호된 API를 호출하면 Controller 메서드가 실행되지 않는다. Security 필터가 먼저 막고 `401 Unauthorized`를 반환한다.

권한이 부족한 사용자가 관리자 기능을 호출하면 Service 메서드가 실행되기 전에 `@PreAuthorize`가 막고 `403 Forbidden`을 반환한다.

## 이 프로젝트에서 적용한 큰 구조

### 로그인 없이 허용한 요청

`SecurityConfig`에서 일부 요청은 로그인 없이 허용했다.

대표적으로 다음과 같다.

- 정적 프론트 리소스
- CSRF 토큰 발급 API
- 회원가입 API
- 로그인 API
- 로그아웃 API
- Swagger, Actuator 같은 API 문서 또는 관리용 요청

이 요청들은 아직 로그인하지 않은 사용자도 접근해야 한다.

예를 들어 로그인 페이지를 보려면 프론트 파일을 받을 수 있어야 하고, 로그인 요청을 보내려면 로그인 API가 막히면 안 된다.

### 나머지 요청은 인증 필요

그 외 요청은 기본적으로 로그인한 사용자만 접근하도록 설정했다.

즉, `anyRequest().authenticated()`는 "위에서 따로 허용하지 않은 모든 요청은 인증이 필요하다"는 뜻이다.

이 설정을 넣으면 실수로 보호해야 할 API가 열려 있는 상황을 줄일 수 있다.

## 왜 Controller가 아니라 Security에서 처리할까

로그인을 Controller에서 직접 처리할 수도 있다.

하지만 Spring Security를 쓰는 이유는 인증과 인가를 애플리케이션 전체의 공통 흐름으로 관리하기 위해서다.

만약 모든 Controller에서 직접 로그인 여부를 확인하면 코드가 반복된다.

```java
if (로그인 안 됨) {
    return 401;
}
```

이런 코드가 여러 곳에 퍼지면 실수하기 쉽다. 어떤 API에는 검사를 넣고, 어떤 API에는 빼먹을 수 있다.

Spring Security를 사용하면 요청이 Controller에 도착하기 전에 공통 필터에서 먼저 확인한다. 그래서 인증과 권한 검사를 한 곳에서 관리할 수 있다.

## 인증 정보는 어디에 저장될까

로그인에 성공하면 Spring Security는 인증 정보를 `SecurityContext`에 저장한다.

웹 환경에서는 이 인증 정보가 세션과 연결된다.

브라우저는 `JSESSIONID` 쿠키를 가지고 있고, 서버는 그 세션을 보고 "이 사용자는 전에 로그인한 사용자다"라고 판단한다.

그래서 새로고침을 해도 세션이 살아 있으면 로그인 상태가 유지된다.

## `UserDetails`가 필요한 이유

Spring Security는 프로젝트의 `User` 엔티티를 그대로 알지 못한다.

Spring Security는 인증에 사용할 사용자 정보를 `UserDetails`라는 정해진 형태로 다룬다.

그래서 이 프로젝트에서는 `DiscodeitUserDetails`를 만들었다.

이 객체에는 다음 정보가 들어간다.

- 화면과 API 응답에 사용할 `UserDto`
- 비밀번호 해시 값
- 사용자의 권한 정보

그리고 `DiscodeitUserDetailsService`는 DB에서 사용자를 찾아 `DiscodeitUserDetails`로 바꿔서 Spring Security에 넘겨준다.

## 초보자 관점에서 중요한 흐름

처음에는 파일 이름이 많아서 복잡해 보인다. 하지만 큰 흐름은 아래처럼 생각하면 된다.

```text
1. 브라우저가 요청을 보낸다.
2. SecurityFilterChain이 먼저 요청을 본다.
3. 로그인 없이 허용된 요청인지 확인한다.
4. 보호된 요청이면 로그인 상태인지 확인한다.
5. 권한이 필요한 요청이면 권한도 확인한다.
6. 통과하면 Controller가 실행된다.
7. Controller는 Service를 호출한다.
```

즉, Spring Security는 Controller 앞에 서 있는 문지기 역할을 한다.

## 테스트와 확인 방법

브라우저 기준으로는 다음 흐름을 확인할 수 있다.

1. 로그인하지 않은 상태로 보호된 API를 호출하면 `401`이 발생한다.
2. 회원가입 또는 로그인을 하면 `JSESSIONID` 쿠키가 생긴다.
3. 새로고침 후에도 세션이 살아 있으면 로그인 상태가 유지된다.
4. 권한이 부족한 기능을 호출하면 `403`이 발생한다.

프로젝트에서는 요구사항을 적용할 때마다 관련 테스트를 실행했다.

예를 들면 인증/로그인 관련 변경 후에는 `AuthControllerTest`를 실행했고, 권한 관련 변경 후에는 `MethodSecurityAuthorizationTest`를 실행했다.

## PR에서 설명할 말

이번 프로젝트에서는 Spring Security를 사용해 인증과 인가 흐름을 애플리케이션 공통 필터로 관리하도록 변경했다.

정적 리소스, 회원가입, 로그인, CSRF 토큰 발급처럼 인증 전에 필요한 요청은 `permitAll`로 열어두고, 나머지 요청은 기본적으로 인증이 필요하도록 설정했다.

로그인 사용자는 세션 기반으로 관리하며, 프로젝트의 사용자 정보를 Spring Security가 이해할 수 있도록 `DiscodeitUserDetails`와 `DiscodeitUserDetailsService`를 구현했다.

## 배운 점

Spring Security를 이해할 때 가장 먼저 봐야 할 것은 개별 Controller가 아니라 `SecurityConfig`이다.

`SecurityConfig`에는 이 애플리케이션의 보안 규칙이 모여 있다.

처음에는 필터, 세션, 인증 객체 같은 단어가 어렵지만, 핵심은 간단하다.

브라우저 요청은 Controller에 바로 가지 않고 Security 필터를 먼저 통과한다. 이 필터가 로그인 여부와 권한을 확인하고, 통과한 요청만 실제 기능 코드로 들어간다.
