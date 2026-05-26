---
layout: post
title: "Weekly Paper 13 - 세션 인증, 토큰 인증, OAuth 2.0"
---

# Weekly Paper 13 - 세션 인증, 토큰 인증, OAuth 2.0

이번 글은 위클리페이퍼 13 주제인 세션 기반 인증과 토큰 기반 인증의 차이, 그리고 OAuth 2.0의 주요 컴포넌트와 Authorization Code Grant 흐름을 정리한 글이다.

핵심 질문은 두 가지다.

1. 세션 기반 인증과 토큰 기반 인증은 어떻게 다르고, 각각 어떤 보안 고려사항이 있을까?
2. OAuth 2.0의 주요 컴포넌트는 무엇이고, Authorization Code Grant는 어떤 흐름으로 동작할까?

## Q1. 세션 기반 인증과 토큰 기반 인증의 차이점

웹 서비스에서 인증은 "이 요청을 보낸 사용자가 누구인지 확인하는 과정"이다.

대표적인 방식으로 세션 기반 인증과 토큰 기반 인증이 있다.

둘 다 로그인한 사용자를 식별하기 위한 방식이지만, 로그인 상태를 어디에 저장하느냐가 다르다.

## 세션 기반 인증

세션 기반 인증은 서버가 로그인 상태를 저장하는 방식이다.

흐름은 다음과 같다.

```text
1. 사용자가 아이디와 비밀번호로 로그인한다.
2. 서버가 사용자 정보를 확인한다.
3. 서버가 세션 저장소에 로그인 상태를 저장한다.
4. 서버가 브라우저에 세션 ID를 쿠키로 내려준다.
5. 브라우저는 이후 요청마다 세션 ID 쿠키를 함께 보낸다.
6. 서버는 세션 ID로 저장된 로그인 정보를 찾는다.
```

브라우저에는 보통 `JSESSIONID` 같은 쿠키가 저장된다.

중요한 점은 실제 로그인 정보가 브라우저에 있는 것이 아니라 서버의 세션 저장소에 있다는 것이다. 브라우저는 그 정보를 찾기 위한 세션 ID만 가지고 있다.

## 세션 기반 인증의 장점

세션 기반 인증의 장점은 서버가 로그인 상태를 직접 제어하기 쉽다는 점이다.

예를 들어 사용자가 로그아웃하면 서버에서 세션을 삭제하면 된다.

```text
로그아웃
  ↓
서버 세션 삭제
  ↓
같은 JSESSIONID로 다시 요청해도 인증 실패
```

관리자가 특정 사용자를 강제로 로그아웃시키는 것도 상대적으로 쉽다. 서버가 세션 저장소에서 해당 사용자의 세션을 제거하면 되기 때문이다.

## 세션 기반 인증의 단점

단점은 서버가 세션 상태를 계속 보관해야 한다는 점이다.

사용자가 많아질수록 세션 저장소도 커진다. 서버가 여러 대라면 모든 서버가 같은 세션 정보를 볼 수 있어야 한다.

그래서 Redis 같은 외부 세션 저장소를 사용하거나, 로드밸런서에서 같은 사용자의 요청을 같은 서버로 보내는 sticky session 전략을 사용하기도 한다.

## 세션 기반 인증의 보안 고려사항

세션 기반 인증에서 중요한 보안 요소는 다음과 같다.

- 세션 ID 탈취 방지
- CSRF 방어
- 세션 고정 공격 방어
- 쿠키 보안 옵션 설정
- 세션 만료 시간 관리

세션 ID가 탈취되면 공격자가 해당 사용자인 것처럼 요청할 수 있다.

그래서 세션 쿠키에는 다음 옵션을 고려해야 한다.

```text
HttpOnly: JavaScript에서 쿠키를 읽지 못하게 함
Secure: HTTPS에서만 쿠키 전송
SameSite: 다른 사이트에서 시작된 요청에 쿠키 전송을 제한
```

또한 세션 기반 인증은 브라우저가 쿠키를 자동으로 보내기 때문에 CSRF 공격에 취약할 수 있다. 그래서 Spring Security의 CSRF 토큰 방어가 중요하다.

세션 고정 공격을 막기 위해 로그인 성공 시 세션 ID를 새로 발급하는 것도 중요하다.

## 토큰 기반 인증

토큰 기반 인증은 서버가 로그인 상태를 세션으로 저장하지 않고, 클라이언트가 토큰을 가지고 다니는 방식이다.

대표적으로 JWT를 사용한다.

흐름은 다음과 같다.

```text
1. 사용자가 아이디와 비밀번호로 로그인한다.
2. 서버가 사용자 정보를 확인한다.
3. 서버가 access token을 발급한다.
4. 클라이언트는 토큰을 저장한다.
5. 이후 요청마다 Authorization 헤더에 토큰을 넣어 보낸다.
6. 서버는 토큰의 서명과 만료 시간을 검증한다.
```

요청 헤더는 보통 다음과 같은 형태다.

```text
Authorization: Bearer access-token
```

## 토큰 기반 인증의 장점

토큰 기반 인증의 장점은 서버가 세션 저장소에 덜 의존한다는 점이다.

JWT는 토큰 자체에 사용자 ID, 권한, 만료 시간 같은 정보를 담을 수 있다.

서버는 매 요청마다 토큰을 검증해서 사용자를 확인한다.

이 방식은 여러 서버로 확장하기 쉽다. 서버들이 같은 서명 키만 알고 있으면 토큰을 검증할 수 있기 때문이다.

## 토큰 기반 인증의 단점

단점은 이미 발급한 토큰을 즉시 무효화하기 어렵다는 점이다.

세션 방식은 서버 세션을 삭제하면 바로 로그아웃시킬 수 있다.

하지만 JWT는 토큰 자체가 유효하면 만료 시간 전까지 계속 사용할 수 있다.

그래서 로그아웃, 권한 변경, 강제 로그아웃을 구현하려면 서버 쪽에 token registry 또는 blacklist 같은 별도 관리 구조가 필요할 수 있다.

## 토큰 기반 인증의 보안 고려사항

토큰 기반 인증에서 중요한 보안 요소는 다음과 같다.

- access token 만료 시간을 짧게 설정한다.
- refresh token은 더 안전한 저장소에 보관한다.
- refresh token rotation을 사용한다.
- HTTPS를 사용한다.
- XSS로 토큰이 탈취되지 않도록 주의한다.
- 로그아웃이나 권한 변경 시 토큰 무효화 전략을 마련한다.

특히 브라우저 환경에서는 토큰 저장 위치가 중요하다.

`localStorage`는 JavaScript로 접근할 수 있기 때문에 XSS 공격에 취약하다.

반면 `HttpOnly` 쿠키는 JavaScript로 읽을 수 없지만, 쿠키가 자동 전송되기 때문에 CSRF 방어를 함께 고려해야 한다.

## 세션 기반 인증과 토큰 기반 인증 비교

| 구분 | 세션 기반 인증 | 토큰 기반 인증 |
| --- | --- | --- |
| 로그인 상태 저장 위치 | 서버 | 클라이언트 토큰 |
| 대표 저장 수단 | 서버 세션 + 쿠키 | JWT, Bearer Token |
| 서버 확장성 | 세션 공유 필요 | 상대적으로 유리 |
| 로그아웃 처리 | 세션 삭제로 쉬움 | 별도 무효화 전략 필요 |
| 주요 위험 | 세션 탈취, CSRF, 세션 고정 | 토큰 탈취, 긴 만료 시간 |
| 브라우저 저장 | 쿠키 | 메모리, 쿠키, localStorage 등 |

정리하면 세션 기반 인증은 서버가 상태를 관리하기 때문에 제어가 쉽고, 토큰 기반 인증은 서버 확장성이 좋지만 토큰 탈취와 무효화 전략을 더 신경 써야 한다.

## Q2. OAuth 2.0의 주요 컴포넌트

OAuth 2.0은 인증 자체보다 "인가"를 위한 표준 프로토콜이다.

쉽게 말하면, 사용자의 비밀번호를 직접 받지 않고도 외부 서비스의 자원에 접근 권한을 위임받는 방식이다.

예를 들어 어떤 서비스가 Google 계정으로 로그인을 제공한다고 하자.

이때 사용자는 우리 서비스에 Google 비밀번호를 알려주지 않는다. 대신 Google 로그인 화면에서 동의하고, 우리 서비스는 Google로부터 access token을 받아 필요한 사용자 정보를 조회한다.

OAuth 2.0의 주요 컴포넌트는 다음 네 가지다.

## 1. Resource Owner

Resource Owner는 자원의 소유자다.

대부분의 경우 최종 사용자를 의미한다.

예를 들어 Google 계정의 프로필 정보를 가진 사용자가 Resource Owner다.

## 2. Client

Client는 Resource Owner의 자원에 접근하려는 애플리케이션이다.

예를 들어 우리가 만든 웹 서비스가 Google 프로필 정보를 가져오려 한다면, 우리 서비스가 Client다.

중요한 점은 OAuth에서 Client는 사용자의 비밀번호를 직접 받지 않는다는 것이다.

## 3. Authorization Server

Authorization Server는 사용자를 인증하고, Client에게 권한을 부여하는 서버다.

예를 들어 Google 로그인 화면과 토큰 발급 서버가 Authorization Server 역할을 한다.

Authorization Server는 다음 일을 한다.

- 사용자를 로그인시킨다.
- 사용자의 동의를 받는다.
- authorization code를 발급한다.
- access token을 발급한다.

## 4. Resource Server

Resource Server는 실제 보호된 자원을 제공하는 서버다.

예를 들어 Google 사용자 프로필 API 서버가 Resource Server다.

Client는 access token을 가지고 Resource Server에 요청한다.

Resource Server는 access token이 유효한지 확인한 뒤 자원을 응답한다.

## Authorization Code Grant 흐름

Authorization Code Grant는 OAuth 2.0에서 가장 많이 사용되는 흐름 중 하나다.

특히 서버가 있는 웹 애플리케이션에서 많이 사용한다.

핵심 아이디어는 access token을 브라우저 URL에 바로 노출하지 않고, 먼저 authorization code를 받은 뒤 서버가 그 code를 access token으로 교환하는 것이다.

흐름은 다음과 같다.

```text
1. 사용자가 Client 서비스에서 Google 로그인 버튼을 누른다.
2. Client는 사용자를 Authorization Server의 로그인/동의 화면으로 보낸다.
3. 사용자가 로그인하고 권한 제공에 동의한다.
4. Authorization Server는 redirect_uri로 authorization code를 전달한다.
5. Client 서버는 authorization code를 Authorization Server에 보낸다.
6. Authorization Server는 access token을 발급한다.
7. Client는 access token으로 Resource Server의 API를 호출한다.
8. Resource Server는 보호된 사용자 정보를 응답한다.
```

## Authorization Code Grant를 단계별로 보기

### 1. 로그인 요청

사용자가 서비스에서 소셜 로그인 버튼을 누르면 Client는 Authorization Server로 리다이렉트한다.

요청에는 보통 이런 정보가 포함된다.

```text
client_id
redirect_uri
response_type=code
scope
state
```

`client_id`는 Authorization Server에 등록된 Client의 식별자다.

`redirect_uri`는 인증이 끝난 뒤 다시 돌아올 주소다.

`response_type=code`는 authorization code를 받겠다는 뜻이다.

`scope`는 어떤 권한을 요청하는지 나타낸다.

`state`는 CSRF 방어를 위한 값으로 사용된다.

### 2. 사용자 로그인과 동의

Authorization Server는 사용자를 로그인시키고, Client가 요청한 권한을 사용자에게 보여준다.

사용자가 동의하면 다음 단계로 넘어간다.

### 3. Authorization Code 발급

Authorization Server는 사용자를 Client의 `redirect_uri`로 돌려보낸다.

이때 URL에 authorization code가 포함된다.

```text
https://client.example/callback?code=abc123&state=xyz
```

이 code는 access token이 아니다.

짧은 시간만 사용할 수 있는 임시 교환권에 가깝다.

### 4. Code를 Token으로 교환

Client 서버는 받은 code를 Authorization Server의 token endpoint로 보낸다.

이 요청은 보통 서버 대 서버로 이루어진다.

```text
POST /oauth/token

code=abc123
client_id=...
client_secret=...
redirect_uri=...
grant_type=authorization_code
```

Authorization Server는 code, client 정보, redirect_uri를 검증한 뒤 access token을 발급한다.

### 5. Resource Server 호출

Client는 발급받은 access token으로 Resource Server의 API를 호출한다.

```text
GET /userinfo
Authorization: Bearer access-token
```

Resource Server는 access token을 검증하고, 유효하면 사용자 정보를 응답한다.

## 왜 바로 access token을 주지 않을까?

Authorization Code Grant는 브라우저를 거쳐 access token을 직접 전달하지 않는다.

브라우저 URL은 기록에 남거나 노출될 수 있다.

그래서 먼저 짧게 쓸 수 있는 code만 브라우저를 통해 전달하고, 실제 access token은 Client 서버가 Authorization Server와 직접 통신해서 받는다.

이 구조가 더 안전하다.

## PKCE

최근에는 Authorization Code Grant에 PKCE를 함께 사용하는 경우가 많다.

PKCE는 Proof Key for Code Exchange의 줄임말이다.

특히 모바일 앱이나 SPA처럼 `client_secret`을 안전하게 숨기기 어려운 환경에서 authorization code 탈취 위험을 줄이기 위해 사용한다.

간단히 말하면 처음 요청할 때 `code_challenge`를 보내고, 나중에 code를 token으로 바꿀 때 `code_verifier`를 보내서 같은 요청 흐름인지 검증하는 방식이다.

## 정리

세션 기반 인증은 서버가 로그인 상태를 저장하는 방식이고, 토큰 기반 인증은 클라이언트가 토큰을 가지고 요청하는 방식이다.

세션 방식은 로그아웃과 강제 만료가 쉽지만 서버 확장 시 세션 공유를 고민해야 한다.

토큰 방식은 확장성이 좋지만 토큰 탈취와 토큰 무효화 전략을 신경 써야 한다.

OAuth 2.0은 사용자의 비밀번호를 직접 공유하지 않고 권한을 위임하기 위한 프로토콜이다.

주요 컴포넌트는 Resource Owner, Client, Authorization Server, Resource Server다.

Authorization Code Grant는 먼저 authorization code를 받고, 서버가 그 code를 access token으로 교환한 뒤 Resource Server의 자원에 접근하는 흐름이다.
