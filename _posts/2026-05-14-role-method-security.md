---
layout: post
title: "Role과 Method Security로 권한 적용하기"
---

# Role과 Method Security로 권한 적용하기

## 배경

로그인만으로는 충분하지 않다. 로그인한 사용자라도 할 수 있는 일이 다르다.

이번 미션에서는 `USER`, `CHANNEL_MANAGER`, `ADMIN` 권한을 정의하고, 기능별로 접근 권한을 적용했다.

## Role 정의

이번 프로젝트의 권한은 세 가지다.

```text
ADMIN
CHANNEL_MANAGER
USER
```

`USER`는 일반 사용자, `CHANNEL_MANAGER`는 채널 관리자, `ADMIN`은 관리자다. 회원가입한 사용자는 기본적으로 `USER` 권한을 가진다.

## RoleHierarchy

권한에는 계층이 있다.

```text
ADMIN > CHANNEL_MANAGER > USER
```

관리자는 채널 관리자와 일반 사용자 권한을 포함하고, 채널 관리자는 일반 사용자 권한을 포함한다.

이 구조를 `RoleHierarchy`로 등록했다. 덕분에 `CHANNEL_MANAGER` 권한이 필요한 기능은 `ADMIN`도 사용할 수 있다.

## Method Security

권한 검사는 Service 메서드에 `@PreAuthorize`로 적용했다.

`@PreAuthorize`는 메서드가 실행되기 전에 조건을 검사한다. 조건을 만족하지 못하면 메서드 본문이 실행되지 않고 `AccessDeniedException`이 발생한다.

## 핵심 파일

- `SecurityConfig`
- `Role`
- `User`
- `UserDto`
- `BasicChannelService`
- `BasicUserService`
- `MethodSecurityAuthorizationTest`

`SecurityConfig`에서는 `@EnableMethodSecurity`를 활성화하고 `RoleHierarchy`를 등록했다.

`BasicChannelService`에는 채널 생성, 수정, 삭제에 `CHANNEL_MANAGER` 권한을 요구하도록 설정했다.

`BasicUserService.updateRole`에는 `ADMIN` 권한을 요구하도록 설정했다.

## 요청 흐름

```text
브라우저 요청
  ↓
SecurityFilterChain에서 인증 확인
  ↓
Controller 실행
  ↓
Service 메서드 호출 직전 @PreAuthorize 검사
  ↓
권한이 있으면 메서드 실행
  ↓
권한이 없으면 403 응답
```

인증되지 않은 사용자는 `401`, 인증은 되었지만 권한이 부족한 사용자는 `403`이다.

## PR에서 설명할 말

사용자 권한을 `Role`로 정의하고, `RoleHierarchy`를 통해 `ADMIN > CHANNEL_MANAGER > USER` 구조를 설정했다. Method Security를 활성화한 뒤 Service 메서드에 `@PreAuthorize`를 적용해 채널 관리 기능과 사용자 권한 수정 기능을 보호했다.

## 배운 점

인증은 "누구인지" 확인하는 것이고, 인가는 "이 기능을 써도 되는지" 확인하는 것이다. Spring Security에서는 `@PreAuthorize`와 `RoleHierarchy`를 사용해 기능 단위 권한을 선언적으로 적용할 수 있다.
