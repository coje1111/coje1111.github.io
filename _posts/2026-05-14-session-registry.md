---
layout: post
title: "SessionRegistry로 세션 관리 고도화하기"
---

# SessionRegistry로 세션 관리 고도화하기

## 배경

심화 요구사항에서는 기본 세션보다 더 정교한 관리가 필요했다.

요구사항은 세 가지였다.

- 동일 계정 동시 로그인 제한
- 권한이 변경된 사용자의 기존 세션 무효화
- 기존 `UserStatus` 대신 세션 정보로 온라인 여부 판단

이를 위해 `SessionRegistry`를 사용했다.

## SessionRegistry란 무엇인가

`SessionRegistry`는 Spring Security가 관리하는 세션 정보를 조회할 수 있게 해주는 객체다.

어떤 사용자가 어떤 세션을 가지고 있는지 확인할 수 있고, 특정 세션을 만료 처리할 수도 있다.

## 동시 로그인 제한

`SecurityConfig`에서 session concurrency 설정을 사용했다.

```text
maximumSessions(1)
```

이 설정은 같은 principal에 대해 허용할 세션 수를 1개로 제한한다.

## equals와 hashCode가 필요한 이유

커스텀 `UserDetails`를 사용할 때는 `equals()`와 `hashCode()`를 잘 정의해야 한다.

`SessionRegistry`는 principal 객체를 기준으로 사용자를 구분한다. 같은 사용자라도 매번 다른 객체로 판단되면 동시 로그인 제한이 제대로 동작하지 않을 수 있다.

그래서 `DiscodeitUserDetails`는 사용자 ID 기준으로 `equals()`와 `hashCode()`를 오버라이딩했다.

## UserStatus 제거

기존에는 사용자 온라인 여부를 `UserStatus` 엔티티로 관리했다. 하지만 세션 기반 인증에서는 실제 로그인 상태와 DB 상태 값이 어긋날 수 있다.

그래서 `UserStatus` 관련 코드를 제거하고, `SessionRegistry`의 활성 세션 기준으로 온라인 여부를 판단하도록 바꿨다.

## HttpSessionEventPublisher

세션은 로그아웃하지 않아도 만료될 수 있다. 이때 `SessionRegistry` 안의 세션 정보도 함께 정리되어야 한다.

`HttpSessionEventPublisher`는 HttpSession 생성과 만료 이벤트를 Spring Security에 알려주는 역할을 한다.

## PR에서 설명할 말

사용자 로그인 상태를 별도 `UserStatus` 엔티티가 아니라 Spring Security의 `SessionRegistry` 기준으로 판단하도록 리팩토링했다. 동일 계정 동시 로그인 제한을 적용하고, 권한 변경 시 기존 활성 세션을 만료 처리하도록 구성했다.

## 배운 점

온라인 상태는 단순한 DB 값보다 실제 세션 상태에 가까워야 한다. 세션 기반 서비스에서는 `SessionRegistry`를 사용하면 현재 인증 상태에 더 가까운 정보를 기준으로 판단할 수 있다.
