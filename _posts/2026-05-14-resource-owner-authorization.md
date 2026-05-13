---
layout: post
title: "본인과 작성자만 수정 삭제하도록 보호하기"
---

# 본인과 작성자만 수정 삭제하도록 보호하기

## 배경

역할 기반 권한만으로는 부족한 경우가 있다.

예를 들어 일반 사용자라도 자기 정보는 수정할 수 있어야 한다. 하지만 다른 사람의 정보는 수정하면 안 된다. 메시지도 자신이 작성한 메시지만 수정하거나 삭제할 수 있어야 한다.

## 역할 권한과 소유자 권한

역할 권한은 사용자의 등급을 보는 방식이다.

```text
ADMIN만 사용자 권한 수정 가능
CHANNEL_MANAGER 이상만 채널 삭제 가능
```

소유자 권한은 그 데이터가 누구의 것인지 보는 방식이다.

```text
사용자 정보 수정은 본인만 가능
메시지 수정은 작성자만 가능
```

이번 요구사항은 소유자 권한에 해당한다.

## SpEL

SpEL은 Spring Expression Language의 줄임말이다. `@PreAuthorize` 안에서 조건식을 쓸 때 사용한다.

```java
@PreAuthorize("@resourceOwnerAuthorization.isSelf(#userId, authentication)")
```

이 뜻은 메서드 실행 전에 `resourceOwnerAuthorization` Bean의 `isSelf` 메서드를 호출해서 true인지 확인하라는 의미다.

## 핵심 파일

- `BasicUserService`
- `BasicMessageService`
- `ResourceOwnerAuthorization`
- `MessageRepository`
- `MethodSecurityAuthorizationTest`

사용자 수정과 삭제에는 본인 확인 조건을 걸었다. 메시지 수정과 삭제에는 메시지 작성자 확인 조건을 걸었다.

## 사용자 본인 확인 흐름

```text
PATCH /api/users/{userId}
  ↓
@PreAuthorize 실행
  ↓
요청 userId와 현재 로그인 사용자 id 비교
  ↓
같으면 허용
  ↓
다르면 403
```

현재 로그인 사용자는 `authentication` 객체에서 꺼낸다. principal은 `DiscodeitUserDetails`이고, 여기서 `UserDto.id`를 확인한다.

## 메시지 작성자 확인 흐름

메시지는 요청에 `messageId`만 들어온다. 그래서 DB에서 메시지 작성자 ID를 조회해야 한다.

```text
PATCH /api/messages/{messageId}
  ↓
MessageRepository에서 authorId 조회
  ↓
authorId와 현재 로그인 사용자 id 비교
  ↓
같으면 허용
  ↓
다르면 403
```

이를 위해 `MessageRepository.findAuthorIdById`를 추가했다.

## PR에서 설명할 말

SpEL 기반 Method Security 조건을 추가해 사용자 수정/삭제는 본인만, 메시지 수정/삭제는 작성자만 가능하도록 보호했다. 복잡한 소유자 검증 로직은 `ResourceOwnerAuthorization` 컴포넌트로 분리했다.

## 배운 점

실제 서비스의 권한 검사는 ADMIN인지 USER인지 보는 것만으로 끝나지 않는다. "이 데이터가 누구의 것인가"를 확인하는 리소스 소유자 기반 권한도 필요하다.
