---
layout: post
title: "[모두의 플리] 콘텐츠 기능을 통합 테스트로 끝까지 검증하기"
date: 2026-07-26 09:00:00 +0900
---

# [모두의 플리] 콘텐츠 기능을 통합 테스트로 끝까지 검증하기

## 단위 테스트만으로 충분하지 않았던 이유

콘텐츠 도메인은 단순한 CRUD에서 끝나지 않는다.

- 관리자 요청의 권한과 CSRF 검증
- Multipart 요청의 JSON과 썸네일 처리
- 데이터베이스 트랜잭션
- 외부 API 콘텐츠의 중복 방지
- Spring Batch의 실행 상태와 `ExecutionContext`
- Redis, OpenSearch 같은 외부 인프라 연계

각 클래스를 따로 테스트하면 내부 로직은 확인할 수 있지만, 실제 요청이 여러 계층을 통과했을 때도 같은 결과가 나오는지는 알기 어렵다.

그래서 커버리지 숫자만 채우는 것보다 실제 기능 흐름과 실패 경계를 검증하는 통합 테스트를 보강했다.

## 관리자 콘텐츠 API를 실제 요청 형태로 검증하기

관리자 콘텐츠 등록과 수정은 JSON DTO와 이미지 파일을 함께 보내는 Multipart 요청이다.

`ContentAdminControllerIntegrationTest`에서는 `MockMvc`를 사용해 실제 API와 같은 형태로 요청했다.

```text
콘텐츠 등록
  -> request JSON
  -> thumbnail JPEG
  -> CSRF 토큰
  -> 201 Created

콘텐츠 수정
  -> request JSON
  -> 새 thumbnail PNG
  -> PATCH 요청
  -> 200 OK

콘텐츠 삭제
  -> DELETE 요청
  -> Soft Delete 상태 확인
```

응답 코드만 확인하지 않고 DB에 저장된 값도 함께 검증했다.

- 명세의 `movie` 값이 `ContentType.MOVIE`로 저장되는지
- 수동 등록 콘텐츠의 출처가 `MANUAL`인지
- 태그가 누락되지 않는지
- 썸네일 URL과 저장소 key가 함께 기록되는지
- 수정 시 새 썸네일 확장자가 반영되는지
- 삭제 후 일반 조회에서는 사라지지만 `deletedAt`은 남는지

테스트용 썸네일은 운영 S3가 아니라 로컬 테스트 디렉터리에 저장하고, 테스트가 끝나면 정리했다. 이를 통해 외부 비용과 네트워크 상태에 영향을 받지 않고 파일과 DB의 연결을 검증할 수 있었다.

## API 응답 계약도 통합 테스트에 포함하기

코드가 정상 실행되더라도 Swagger와 다른 값이 반환되면 프론트엔드에서는 오류가 발생한다.

단건 조회에서는 다음 통계 필드까지 실제 응답에 포함되는지 확인했다.

```text
averageRating
reviewCount
watcherCount
```

목록 조회에서는 타입, 키워드, 태그, 정렬 조건을 함께 전달하고 다음 값을 검증했다.

- 조회된 Content ID
- `totalCount`
- `hasNext`
- `sortBy`
- `sortDirection`

잘못된 콘텐츠 타입처럼 명세에서 허용하지 않는 요청은 400 응답이 나오는지도 확인했다.

## 외부 콘텐츠 동기화의 트랜잭션 경계 검증하기

외부 콘텐츠 수집은 많은 데이터를 처리하므로 모든 후보를 하나의 긴 트랜잭션에 넣지 않고 청크 단위로 커밋한다.

`ContentExternalSyncServiceIntegrationTest`에서는 실제 JPA 저장소와 트랜잭션 관리자를 사용해 다음 상황을 검증했다.

### 같은 콘텐츠를 다시 수집해도 중복되지 않는다

동일한 `source + type + externalId`를 두 번 수집했을 때 DB에는 한 건만 남아야 한다.

두 번째 수집에서는 화면 필드를 덮어쓰지 않고 `lastSyncedAt`만 갱신하는 정책도 확인했다.

### 다음 청크가 실패해도 이전 청크는 유지된다

첫 번째 청크가 커밋된 뒤 두 번째 청크에서 예외가 발생하도록 만들었다.

```text
1번 청크 저장 성공 및 COMMIT
2번 청크 조회 중 예외
전체 작업 FAILED
DB에는 1번 청크 결과 유지
```

부분 성공 정책을 테스트로 고정해, 이후 리팩토링에서 실수로 전체 롤백 구조로 돌아가지 않도록 했다.

### 청크마다 한 번만 벌크 조회한다

205개의 후보를 수집했을 때 청크 크기 기준으로 조회와 트랜잭션이 세 번 발생하는지 Hibernate 통계로 확인했다.

반복문 안에서 콘텐츠마다 DB를 조회하는 N+1 형태가 다시 생기지 않는지 성능 관점에서도 검증한 것이다.

### 삭제된 외부 콘텐츠는 부활하지 않는다

Soft Delete된 외부 콘텐츠가 다시 API에서 수집되더라도 새 행으로 생성하거나 복구하지 않고 tombstone으로 유지하는 정책을 확인했다.

## Spring Batch 자체의 실행 결과 검증하기

서비스 테스트만 통과해도 실제 Job 설정이나 Tasklet의 `ExecutionContext` 기록이 잘못될 수 있다.

`ContentExternalSyncJobIntegrationTest`에서는 `JobLauncher`로 Job을 직접 실행했다.

```text
첫 실행
  -> CREATED_COUNT 기록
  -> COMPLETED

재실행
  -> SKIPPED_COUNT 기록
  -> 새로운 syncedAt 기록
  -> COMPLETED

외부 수집 예외
  -> FAILED
  -> failureExceptions 기록
```

서로 다른 Job Parameter로 재실행해 첫 번째 실행 결과가 두 번째 실행에 섞이지 않는지도 확인했다.

## 테스트가 알려준 것

통합 테스트를 추가하면서 “메서드가 호출되었다”보다 다음 질문이 더 중요하다는 것을 배웠다.

- HTTP 요청부터 DB까지 실제 값이 이어지는가
- 실패했을 때 어느 범위까지 롤백되는가
- 재실행해도 중복 데이터가 생기지 않는가
- 명세와 실제 응답의 문자열이 같은가
- 테스트가 운영 인프라나 실행 순서에 불필요하게 의존하지 않는가

전체 테스트를 한 번에 실행했을 때 다른 도메인의 순서 의존 테스트가 실패하고 단독 실행에서는 통과하는 상황도 있었다. 이 경우 콘텐츠 실패로 단정하지 않고 실패 테스트를 격리 실행해 원인을 구분했다.

## 확인 방법

콘텐츠 통합 테스트는 다음처럼 범위를 나눠 실행할 수 있다.

```bash
./gradlew test --tests "*ContentAdminControllerIntegrationTest"
./gradlew test --tests "*ContentExternalSyncServiceIntegrationTest"
./gradlew test --tests "*ContentExternalSyncJobIntegrationTest"
```

그다음 콘텐츠 도메인 전체와 프로젝트 전체 테스트를 차례로 실행한다.

```bash
./gradlew test --tests "io.mopl.domain.content.*"
./gradlew test
```

## 배운 점

테스트 커버리지는 실행된 코드의 비율을 알려주지만 기능이 올바르게 연결되었다는 사실까지 보장하지는 않는다.

컨트롤러, 파일 저장소, DB, 트랜잭션, Batch Job처럼 경계가 만나는 지점을 통합 테스트로 검증해야 실제 운영에서 발생할 수 있는 문제를 더 일찍 발견할 수 있다.

특히 성공 경로뿐 아니라 재실행, 부분 실패, 삭제 데이터 재수집처럼 서비스 정책이 드러나는 상황을 테스트로 남겨야 구현이 바뀌어도 정책을 지킬 수 있다는 점을 배웠다.
