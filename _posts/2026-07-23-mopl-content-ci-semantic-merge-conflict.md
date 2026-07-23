---
layout: post
title: "[모두의 플리] 자동 병합 뒤 테스트가 깨진 의미상 충돌 찾기"
date: 2026-07-23 09:10:00 +0900
---

# [모두의 플리] 자동 병합 뒤 테스트가 깨진 의미상 충돌 찾기

## Git 충돌이 없으면 안전한 병합일까

콘텐츠 통합 테스트 브랜치와 OpenSearch 브랜치를 최신 `dev`에 맞춘 뒤 Git 병합은 정상적으로 끝났다.

충돌 표시도 없었다.

```text
<<<<<<<
=======
>>>>>>>
```

하지만 CI에서는 테스트 컴파일 오류가 발생했고, 다른 브랜치에서는 단위 테스트 세 개가 `NullPointerException`으로 실패했다.

Git이 확인하는 것은 같은 줄을 서로 다르게 수정했는지 여부다. 코드의 역할과 의존성이 올바르게 유지되는지까지 판단하지는 못한다.

## 첫 번째 문제: 생성자 의존성 누락

OpenSearch 작업으로 `ContentExternalSyncService`에 `ContentSearchIndexService` 의존성이 추가됐다.

```text
기존 생성자
  ExternalContentClient 목록
  ContentRepository
  Clock
  TransactionManager

변경 생성자
  ExternalContentClient 목록
  ContentRepository
  ContentSearchIndexService
  Clock
  TransactionManager
```

하지만 최신 `dev`에서 추가된 통합 테스트 한 곳은 기존 생성자 인자를 그대로 사용했다.

CI의 `compileTestJava` 단계에서 다음 오류가 발생했다.

```text
required:
  List<ExternalContentClient>,
  ContentRepository,
  ContentSearchIndexService,
  Clock,
  PlatformTransactionManager

found:
  List<ExternalContentClient>,
  ContentRepository,
  Clock,
  PlatformTransactionManager
```

테스트에서 실제 색인 동작을 검증하는 범위가 아니므로 `ContentSearchIndexService` Mock을 생성자에 전달해 해결했다.

```java
new ContentExternalSyncService(
    List.of(client),
    contentRepository,
    mock(ContentSearchIndexService.class),
    fixedClock,
    transactionManager
);
```

서비스 코드를 잘못 구현한 문제가 아니라, 서로 다른 브랜치에서 서비스 생성자와 테스트 생성 코드가 각각 변경된 뒤 합쳐지며 발생한 호환성 문제였다.

## 두 번째 문제: @Mock이 다른 필드에 붙은 병합

삭제 정책 브랜치에는 `DomainEventPublisher` Mock이 추가됐고, OpenSearch 브랜치에는 `ContentSearchQueryService` Mock이 추가됐다.

자동 병합 결과는 문법상 정상처럼 보였다.

```java
@Mock
private DomainEventPublisher eventPublisher;

private ContentSearchQueryService contentSearchQueryService;
```

하지만 `ContentSearchQueryService`의 `@Mock`이 사라져 필드가 `null`로 남았다.

`ContentService.findContents()`가 다음 호출을 실행하는 순간 세 개의 조회 테스트가 동일한 원인으로 실패했다.

```java
contentSearchQueryService.search(...);
```

올바른 형태는 두 의존성에 각각 `@Mock`이 있는 구조다.

```java
@Mock
private DomainEventPublisher eventPublisher;

@Mock
private ContentSearchQueryService contentSearchQueryService;
```

이 문제는 컴파일 단계에서는 찾을 수 없다. 필드 타입과 생성자 인자가 모두 유효하기 때문이다. 실제 테스트를 실행해야만 발견할 수 있었다.

## 텍스트 충돌과 의미상 충돌

```text
텍스트 충돌
  -> Git이 같은 줄의 서로 다른 변경을 감지
  -> 사람이 충돌 표시를 해결해야 병합 가능

의미상 충돌
  -> Git은 자동 병합
  -> 컴파일 또는 테스트에서 기능 오류 발견
```

이번 사례는 두 가지 의미상 충돌을 모두 보여줬다.

- 생성자 계약은 바뀌었지만 테스트 호출부가 따라오지 못함
- 애노테이션 위치가 어긋났지만 Java 문법은 여전히 유효함

## 검증 순서

브랜치를 최신화한 뒤 다음 순서로 검증했다.

```text
1. git status로 작업 트리 확인
2. dev와 작업 브랜치 최신화
3. compileTestJava로 생성자·타입 오류 확인
4. 실패한 테스트 클래스만 단독 실행
5. 해당 상위 태스크 관련 테스트 묶음 실행
6. 전체 CI 명령으로 최종 확인
```

사용한 핵심 명령은 다음과 같다.

```bash
./gradlew compileTestJava

./gradlew test \
  --tests "io.mopl.domain.content.service.ContentServiceTest"

./gradlew clean test \
  jacocoTestReport \
  jacocoTestCoverageVerification
```

생성자 의존성을 보완한 뒤 `ContentExternalSyncServiceIntegrationTest`가 통과했다.

누락된 `@Mock`을 복구한 뒤 실패했던 `ContentServiceTest`와 삭제 정책 관련 테스트 52개가 모두 통과했다.

전체 테스트에서는 Docker가 꺼진 로컬 환경이나 순서 의존 테스트처럼 이번 변경과 무관한 실패가 있을 수 있었다. 따라서 “전체 명령이 실패했다”만 보지 않고 어떤 테스트가 어떤 원인으로 실패했는지 분리해서 확인했다.

## 배운 점

브랜치 최신화는 Git 명령이 성공했다고 끝나는 작업이 아니었다.

같은 서비스의 생성자, 테스트 설정, 애노테이션, 이벤트 의존성이 여러 브랜치에서 동시에 바뀌었다면 자동 병합 뒤 최소한 테스트 컴파일과 관련 테스트를 실행해야 한다.

특히 Git 충돌이 없다는 말은 “같은 줄을 병합할 수 있었다”는 뜻이지, “코드가 정상 동작한다”는 뜻이 아니라는 점을 배웠다.
