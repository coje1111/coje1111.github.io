---
layout: post
title: "JWT 토큰 인증 흐름 이해하기"
---

# JWT 토큰 인증 흐름 이해하기

## 배경

이전 미션에서는 Spring Security의 세션 기반 인증을 사용했다.

세션 기반 인증에서는 로그인에 성공하면 서버가 세션을 만들고, 브라우저는 `JSESSIONID` 쿠키를 들고 다닌다. 서버는 그 쿠키를 보고 사용자가 로그인했는지 확인한다.

이번 미션 10에서는 인증 방식을 JWT 기반으로 바꾸었다. JWT는 서버 세션에 의존하지 않고, 사용자가 가진 토큰을 통해 인증 정보를 확인하는 방식이다.

큰 변화는 다음과 같다.

- 세션 생성 정책을 `STATELESS`로 변경했다.
- 로그인 성공 시 access token과 refresh token을 발급했다.
- API 요청마다 `Authorization: Bearer ...` 헤더의 access token을 검사했다.
- refresh token으로 access token을 재발급했다.
- 로그아웃, 권한 변경, 토큰 재발급 시 기존 토큰을 무효화했다.

## 먼저 알아야 할 단어

### JWT

JWT는 JSON Web Token의 줄임말이다.

쉽게 말하면 서버가 서명해서 발급한 문자열 토큰이다. 서버는 나중에 이 토큰을 다시 받았을 때 서명이 맞는지 확인하고, 토큰 안의 사용자 정보를 읽을 수 있다.

이 프로젝트에서는 access token과 refresh token을 모두 JWT로 만들었다.

### Access Token

access token은 실제 API 요청에 사용하는 토큰이다.

프론트엔드는 로그인 성공 응답으로 받은 access token을 메모리에 저장하고, 보호된 API를 호출할 때 요청 헤더에 넣는다.

```text
Authorization: Bearer access-token
```

access token은 노출되면 위험하므로 만료 시간을 짧게 둔다.

### Refresh Token

refresh token은 access token을 새로 발급받기 위한 토큰이다.

이번 프로젝트에서는 refresh token을 `REFRESH_TOKEN` 쿠키에 저장했다. 프론트엔드가 직접 토큰 값을 다루기보다 브라우저 쿠키를 통해 서버에 전달되도록 한 것이다.

access token이 만료되거나 사용할 수 없게 되면 `/api/auth/refresh` API를 호출해서 새 access token을 받는다.

### Stateless

`STATELESS`는 서버가 로그인 세션을 만들지 않는다는 뜻이다.

세션 방식에서는 서버 메모리나 저장소에 로그인 상태를 저장한다. 반면 JWT 방식에서는 요청마다 토큰을 검사해서 사용자를 판단한다.

다만 이번 프로젝트에서는 완전히 토큰만 믿지는 않았다. 로그아웃, 권한 변경, 동시 로그인 제한 같은 요구사항을 처리하기 위해 `JwtRegistry`를 만들어 서버 쪽에서도 현재 유효한 토큰 상태를 관리했다.

## 핵심 파일

이번 미션 10에서 중요한 파일은 아래와 같다.

- `JwtTokenProvider`
- `JwtAuthenticationFilter`
- `JwtLoginSuccessHandler`
- `JwtLogoutHandler`
- `JwtRegistry`
- `InMemoryJwtRegistry`
- `JwtInformation`
- `SecurityConfig`
- `AuthController`
- `BasicUserService`

각 파일의 역할을 한 줄로 정리하면 다음과 같다.

`JwtTokenProvider`는 토큰을 만들고 검증한다.

`JwtAuthenticationFilter`는 요청 헤더에서 access token을 꺼내 인증 객체를 만든다.

`JwtLoginSuccessHandler`는 로그인 성공 시 access token과 refresh token을 발급한다.

`JwtLogoutHandler`는 로그아웃 시 refresh token 쿠키와 서버에 저장된 토큰 상태를 정리한다.

`JwtRegistry`는 서버가 알고 있는 유효한 JWT 상태를 저장하고 조회하는 역할을 한다.

## 로그인 흐름

로그인은 여전히 Spring Security의 인증 흐름을 사용한다.

다만 로그인 성공 후 세션을 만드는 대신 토큰을 발급한다.

```text
브라우저
  ↓
POST /api/auth/login
  ↓
Spring Security 로그인 필터
  ↓
UserDetailsService로 사용자 조회
  ↓
PasswordEncoder로 비밀번호 검증
  ↓
JwtLoginSuccessHandler
  ↓
access token 응답
refresh token 쿠키 저장
```

응답 본문에는 `JwtDto`가 내려간다.

```text
JwtDto
- userDto
- accessToken
```

프론트엔드는 `userDto`로 현재 사용자 정보를 알고, `accessToken`으로 이후 API 요청을 보낸다.

## API 요청 인증 흐름

로그인 이후 보호된 API를 호출할 때는 access token이 필요하다.

요청은 다음 흐름을 지난다.

```text
브라우저
  ↓
Authorization: Bearer access-token
  ↓
JwtAuthenticationFilter
  ↓
JwtTokenProvider로 토큰 검증
  ↓
JwtRegistry에서 활성 토큰인지 확인
  ↓
SecurityContext에 Authentication 저장
  ↓
Controller 실행
```

중요한 점은 토큰 검사가 Controller 전에 일어난다는 것이다.

유효하지 않은 토큰이거나, 서버의 `JwtRegistry`에 더 이상 활성 토큰으로 등록되어 있지 않으면 인증되지 않은 요청으로 처리된다.

## Refresh Token 재발급 흐름

access token은 짧게 사용하고, refresh token으로 새 access token을 받는다.

이번 프로젝트에서는 `/api/auth/refresh` API를 만들었다.

```text
POST /api/auth/refresh
Cookie: REFRESH_TOKEN=...
```

흐름은 다음과 같다.

```text
브라우저
  ↓
refresh token 쿠키 전달
  ↓
서버가 refresh token 검증
  ↓
JwtRegistry에서 활성 refresh token인지 확인
  ↓
새 access token 발급
  ↓
새 refresh token 발급
  ↓
기존 refresh token은 무효화
```

여기서 중요한 개념이 refresh token rotation이다.

rotation은 토큰을 재발급할 때 refresh token도 새 값으로 바꾸는 방식이다. 기존 refresh token을 계속 쓰게 두면 탈취됐을 때 위험하므로, 한 번 재발급에 사용한 refresh token은 더 이상 유효하지 않게 만든다.

## 로그아웃 흐름

JWT는 stateless라서 단순히 생각하면 로그아웃이 어렵다.

서버가 세션을 들고 있지 않으면 "이 사용자는 로그아웃했다"는 상태를 어디에 저장할지 애매하기 때문이다.

이번 프로젝트에서는 `JwtRegistry`를 사용해서 로그아웃을 처리했다.

```text
브라우저
  ↓
POST /api/auth/logout
  ↓
JwtLogoutHandler
  ↓
요청 쿠키에서 refresh token 확인
  ↓
JwtRegistry에서 해당 토큰 정보 제거
  ↓
REFRESH_TOKEN 쿠키 삭제
  ↓
204 응답
```

이렇게 하면 로그아웃 후 refresh token으로 새 access token을 받을 수 없다.

## 권한 변경 시 토큰 무효화

권한이 바뀐 사용자가 계속 기존 access token을 쓰면 문제가 생긴다.

예를 들어 사용자의 권한이 `CHANNEL_MANAGER`에서 `USER`로 내려갔는데, 이전 토큰이 계속 살아 있으면 여전히 채널 관리 기능을 사용할 수도 있다.

그래서 사용자 권한이 변경되면 해당 사용자의 `JwtInformation`을 `JwtRegistry`에서 제거했다.

```text
관리자가 사용자 권한 변경
  ↓
UserService.updateRole
  ↓
JwtRegistry.invalidateJwtInformationByUserId
  ↓
해당 사용자의 기존 토큰 무효화
```

그 결과 권한이 바뀐 사용자는 다시 로그인해서 새 권한이 반영된 토큰을 받아야 한다.

## 동시 로그인 제한

요구사항에는 같은 계정으로 동시에 로그인할 수 없도록 하는 내용도 있었다.

세션 기반 인증에서는 `SessionRegistry`로 세션을 관리했지만, JWT 기반에서는 세션이 없다.

그래서 `JwtRegistry`가 비슷한 역할을 하도록 만들었다.

이번 구현에서는 사용자별 활성 토큰 수를 1개로 제한했다.

즉, 같은 계정으로 새로 로그인하면 기존 토큰 정보는 제거되고, 새 로그인 토큰만 활성 상태로 남는다.

## 만료 토큰 정리

토큰은 만료 시간이 있다.

하지만 `JwtRegistry`에 저장된 토큰 정보를 계속 놔두면 메모리에 오래된 데이터가 쌓인다.

그래서 스케줄러를 사용해 주기적으로 만료된 토큰 정보를 제거했다.

```text
5분마다 실행
  ↓
JwtRegistry.clearExpiredJwtInformation
  ↓
만료된 JwtInformation 삭제
```

이를 위해 설정 클래스에 `@EnableScheduling`을 추가했다.

## 실제 검증하면서 발견한 문제

전체 테스트는 통과했지만, 실제 브라우저 방식에 가까운 HTTP 요청을 보내면서 multipart JSON 처리 문제가 발견됐다.

회원가입과 메시지 생성 요청은 `multipart/form-data` 안에 JSON 파트를 넣어 보낸다.

프론트엔드에서는 대략 이런 방식으로 요청을 만든다.

```javascript
formData.append(
  "userCreateRequest",
  new Blob([JSON.stringify(request)], { type: "application/json" })
);
```

MockMvc 테스트에서는 잘 통과했지만, 실제 HTTP 요청에서는 JSON 파트가 컨트롤러에서 바로 DTO로 변환되지 않는 문제가 있었다.

그래서 `MultipartJsonPartReader`를 추가해 multipart 안의 JSON 파일 파트를 직접 읽고, `ObjectMapper`로 DTO로 변환했다.

그리고 `Validator`로 기존 `@Valid`와 같은 검증도 유지했다.

이 경험에서 배운 점은 테스트가 통과해도 실제 브라우저 요청과 완전히 같지 않을 수 있다는 것이다.

## 테스트와 확인 방법

최종 검증은 세 단계로 진행했다.

첫째, 전체 테스트를 실행했다.

```bash
./gradlew test
```

둘째, 테스트 프로필로 서버를 띄우고 health check를 확인했다.

```text
GET /actuator/health
```

셋째, 실제 HTTP 요청 흐름을 확인했다.

확인한 흐름은 다음과 같다.

- 로그인하지 않은 사용자가 보호된 API를 호출하면 `401`
- 회원가입 성공
- 로그인 성공
- access token으로 보호된 API 호출 성공
- refresh token으로 access token 재발급 성공
- 재발급 전 access token은 더 이상 사용 불가
- 관리자 권한으로 사용자 권한 변경 성공
- 권한 변경된 사용자의 기존 토큰 무효화
- `CHANNEL_MANAGER`는 공개 채널 생성 가능
- 일반 사용자는 공개 채널 생성 시 `403`
- 로그아웃 시 refresh token 쿠키 삭제
- 로그아웃 후 refresh 요청은 `401`

마지막으로 브라우저에서 로그인 화면이 정상 렌더링되는지도 확인했다.

## PR에서 설명할 말

미션 10에서는 기존 세션 기반 인증 흐름을 JWT 기반 인증 흐름으로 리팩토링했다.

로그인 성공 시 `JwtDto`로 사용자 정보와 access token을 응답하고, refresh token은 쿠키에 저장하도록 구성했다. 이후 보호된 API 요청은 `JwtAuthenticationFilter`에서 `Authorization` 헤더의 bearer token을 검증해 인증 정보를 만든다.

또한 JWT 방식에서 로그아웃, 동시 로그인 제한, 권한 변경 시 기존 토큰 무효화가 가능하도록 `JwtRegistry`를 구현했다. refresh token은 rotation 방식으로 재발급해 기존 refresh token 재사용을 막았다.

## 배운 점

JWT를 사용한다고 해서 서버가 아무 상태도 관리하지 않아도 되는 것은 아니다.

단순 인증만 생각하면 access token 검증만으로 충분해 보일 수 있다. 하지만 로그아웃, 동시 로그인 제한, 권한 변경 즉시 반영 같은 요구사항이 들어오면 서버도 현재 유효한 토큰 상태를 어느 정도 알고 있어야 한다.

이번 미션의 핵심은 JWT 발급 코드 자체보다, Spring Security 필터 흐름 안에 JWT 인증을 자연스럽게 연결하고 토큰의 생명주기를 관리하는 것이었다.

또 하나 중요한 점은 MockMvc 테스트와 실제 브라우저 요청이 다를 수 있다는 것이다. 특히 multipart 요청은 실제 프론트엔드가 보내는 형식으로 한 번 더 확인해야 한다.
