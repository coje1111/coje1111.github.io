---
layout: post
title: "회원가입과 비밀번호 암호화 이해하기"
---

# 회원가입과 비밀번호 암호화 이해하기

## 배경

회원가입 API 스펙은 그대로 유지했다. 요청은 `POST /api/users`이고, 응답은 `UserDto`이다. 바뀐 점은 사용자가 입력한 비밀번호를 그대로 저장하지 않고 `PasswordEncoder`를 통해 해시해서 저장한 것이다.

## 왜 비밀번호를 그대로 저장하면 안 될까

DB가 유출되면 사용자의 실제 비밀번호가 그대로 노출된다. 사용자가 다른 사이트에서도 같은 비밀번호를 쓰고 있다면 피해가 더 커질 수 있다.

그래서 서버는 비밀번호 원문을 저장하지 않는다. 대신 되돌리기 어려운 해시 값을 저장한다.

## BCryptPasswordEncoder

이번 프로젝트에서는 `BCryptPasswordEncoder`를 사용했다. BCrypt는 비밀번호 저장에 많이 쓰이는 방식이고, 같은 비밀번호라도 매번 다른 해시 문자열이 나올 수 있다.

그래서 로그인할 때 문자열을 직접 비교하면 안 된다. 반드시 `PasswordEncoder`가 제공하는 방식으로 검증해야 한다.

## 핵심 파일

- `SecurityConfig`
- `BasicUserService`
- `DiscodeitUserDetailsService`

`SecurityConfig`에서는 `PasswordEncoder` Bean을 등록했다. `BasicUserService.create`에서는 회원가입 요청의 비밀번호를 `passwordEncoder.encode(...)`로 해시한 뒤 저장했다.

## 요청 흐름

```text
브라우저
  ↓
POST /api/users
  ↓
UserController
  ↓
BasicUserService.create
  ↓
비밀번호 BCrypt 해시
  ↓
User 저장
  ↓
UserDto 반환
```

응답으로는 비밀번호를 내려주지 않는다. 비밀번호는 서버 내부 인증 과정에서만 필요하다.

## 로그인과의 연결

회원가입에서 저장한 해시는 로그인 때 사용된다. 로그인 요청이 들어오면 Spring Security는 DB에서 사용자를 찾고, 사용자가 입력한 비밀번호가 저장된 해시와 맞는지 `PasswordEncoder`로 확인한다.

## PR에서 설명할 말

회원가입 시 비밀번호 원문을 저장하지 않도록 `BCryptPasswordEncoder` 기반 `PasswordEncoder`를 Bean으로 등록했다. 사용자 생성 시 비밀번호를 해시한 뒤 저장하고, 로그인 인증 과정에서는 같은 `PasswordEncoder`를 통해 입력 비밀번호와 저장된 해시를 검증하도록 구성했다.

## 배운 점

비밀번호 암호화는 선택 기능이 아니라 기본 보안 요구사항이다. BCrypt 해시는 직접 문자열 비교를 하면 안 되고, 반드시 `PasswordEncoder`를 통해 비교해야 한다.
