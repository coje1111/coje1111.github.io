---
layout: post
title: "[모두의 플리] 콘텐츠 삭제 정책을 Soft Delete로 전환하기"
date: 2026-07-22 09:00:00 +0900
---

# [모두의 플리] 콘텐츠 삭제 정책을 Soft Delete로 전환하기

## 삭제 버튼 뒤에서 결정해야 하는 것

초기 콘텐츠 삭제는 Repository의 `delete`를 호출하는 물리 삭제 방식이었다.

하지만 콘텐츠는 리뷰, 플레이리스트, 시청 세션처럼 다른 도메인 데이터의 기준이 된다. 콘텐츠 한 건을 바로 지우면 외래 키 충돌이 발생하거나, 서비스 운영에 필요한 기록까지 함께 잃을 수 있다.

반대로 아무 데이터도 지우지 않으면 일반 사용자가 삭제된 콘텐츠를 계속 조회할 수 있다.

이번 작업에서는 콘텐츠의 공개 상태와 DB 기록 보존을 분리하기 위해 Soft Delete를 적용했다.

## Hard Delete와 Soft Delete 비교

```text
Hard Delete
  DELETE FROM contents WHERE id = ...
  장점: 구조가 단순하고 저장 공간이 바로 줄어든다.
  단점: 복구와 이력 확인이 어렵고 연관 데이터에 즉시 영향을 준다.

Soft Delete
  UPDATE contents SET deleted_at = ... WHERE id = ...
  장점: 기록과 연관 관계를 유지하면서 화면에서 숨길 수 있다.
  단점: 모든 조회에서 활성 데이터 조건을 빠뜨리지 않아야 한다.
```

모두의 플리는 삭제된 콘텐츠를 사용자에게 노출하지 않되, 리뷰 등 연관 기록의 보존 가능성을 남겨야 했다. 그래서 Soft Delete가 현재 요구에 더 잘 맞았다.

## deletedAt으로 삭제 상태 표현하기

Content 엔티티에 `deletedAt`을 추가했다.

```java
@Column(name = "deleted_at")
private Instant deletedAt;

public void softDelete(Instant deletedAt) {
  if (this.deletedAt == null) {
    this.deletedAt = Objects.requireNonNull(deletedAt, "삭제 시각은 필수입니다.");
  }
}

public boolean isDeleted() {
  return deletedAt != null;
}
```

Boolean 값 대신 삭제 시각을 저장하면 삭제 여부뿐 아니라 언제 삭제되었는지도 알 수 있다.

같은 요청이 다시 들어와도 최초 삭제 시각을 유지하도록 이미 삭제된 콘텐츠에는 값을 다시 쓰지 않는다.

## 삭제된 콘텐츠의 변경 차단

Soft Delete는 행이 DB에 남아 있기 때문에 잘못된 경로로 엔티티가 조회될 가능성까지 고려해야 한다.

삭제된 콘텐츠의 제목, 리뷰 통계, 외부 동기화 시각 등이 다시 변경되지 않도록 엔티티의 변경 메서드에서 활성 상태를 검사했다.

```java
private void ensureActive() {
  if (isDeleted()) {
    throw new IllegalStateException("삭제된 콘텐츠는 변경할 수 없습니다.");
  }
}
```

이 검사는 조회 조건이 실수로 누락되더라도 엔티티가 마지막 방어선 역할을 하게 한다.

## 모든 공개 조회에서 삭제 데이터 제외하기

Soft Delete에서 가장 위험한 실수는 조회 조건 누락이다.

단건 조회는 활성 콘텐츠 전용 Repository 메서드를 사용하고, 목록 QueryDSL 조건에는 다음 조건을 공통으로 적용했다.

```java
private BooleanExpression isActive() {
  return content.deletedAt.isNull();
}
```

이 조건은 목록 데이터뿐 아니라 `totalCount`에도 동일하게 들어가야 한다. 목록에서는 보이지 않는데 전체 개수에는 포함되면 페이지네이션 결과가 어긋나기 때문이다.

## 외부 콘텐츠가 다시 수집되면 복구되는 문제

외부 콘텐츠는 `(source, type, externalId)` 조합으로 같은 콘텐츠인지 판단한다.

삭제된 콘텐츠를 일반 조회에서 제외한 상태로 동기화하면, 배치가 같은 외부 콘텐츠를 신규 데이터로 오해할 수 있다. 그러면 다른 UUID를 가진 콘텐츠가 다시 생성되어 관리자의 삭제가 사실상 취소된다.

그래서 외부 동기화에서 중복을 확인할 때는 삭제된 행도 포함한다.

```text
같은 외부 식별키의 활성 콘텐츠 존재
  -> lastSyncedAt 갱신

같은 외부 식별키의 삭제 콘텐츠 존재
  -> 신규 생성하지 않고 건너뜀

식별키가 존재하지 않음
  -> 신규 콘텐츠 생성
```

Soft Delete를 화면 조회에만 적용하지 않고 수집 경로까지 함께 확인해야 했던 이유다.

## 삭제와 캐시 무효화 순서

Redis는 조회 성능을 위한 복사본이고 DB가 원본이다.

따라서 먼저 DB 트랜잭션에서 `deletedAt`을 기록하고, COMMIT이 끝난 뒤 해당 콘텐츠의 Base·Stats 캐시를 삭제했다.

```text
DB에서 활성 콘텐츠 조회
-> deletedAt 기록
-> 트랜잭션 COMMIT
-> Content 캐시 삭제
```

DB 변경 전에 캐시를 삭제하면 다른 요청이 변경 전 DB 값을 다시 캐싱할 수 있다. 반대로 DB 처리가 실패했는데 캐시만 사라지는 불필요한 상태도 생긴다.

## 기존 마이그레이션을 수정하지 않기

이미 공유 DB에 적용된 Flyway 파일을 수정하면 체크섬 불일치가 발생한다.

기존 파일을 고치지 않고 새 마이그레이션에서 nullable 컬럼을 추가했다.

```sql
ALTER TABLE contents
    ADD COLUMN deleted_at TIMESTAMPTZ;
```

기존 콘텐츠는 `deleted_at = NULL`이므로 모두 활성 상태로 유지된다. 별도의 데이터 보정 없이 점진적으로 적용할 수 있다.

## 테스트한 범위

다음 동작을 단위·통합 테스트로 확인했다.

- 삭제 요청 시 행이 제거되지 않고 `deletedAt`이 기록되는지
- 삭제된 콘텐츠가 단건·목록·전체 개수에서 제외되는지
- 삭제 후 Content 캐시가 무효화되는지
- 삭제된 외부 콘텐츠가 다시 수집되어도 신규 생성되지 않는지
- 활성 외부 콘텐츠는 기존 정책대로 동기화 시각이 갱신되는지
- 빈 DB에서 새 Flyway 마이그레이션이 적용되는지

## 초기 구현 이후 연관 도메인 정책 보완

초기 작업에서는 Content의 삭제 상태, 공개 조회 제외, 캐시 무효화, 외부 재수집 방지만 구현했다.

이후 팀 논의를 거쳐 리뷰와 플레이리스트의 최종 처리 정책을 다음과 같이 정했다.

```text
Content
  -> Soft Delete로 DB 기록 유지

Review
  -> DB 기록 유지
  -> 삭제 콘텐츠의 리뷰는 일반 조회·수정·삭제에서 제외

Playlist
  -> 플레이리스트 자체는 유지
  -> 삭제 콘텐츠와 연결된 playlist_contents 행만 즉시 물리 삭제

WatchingSession
  -> 기존 실시간 세션 만료 정책 사용
```

리뷰는 감사와 운영 기록을 위해 남겨야 하지만, 일반 사용자에게는 삭제된 콘텐츠와 함께 보이면 안 된다. 그래서 Review 행을 삭제하지 않고 Repository 조회 조건에 `content.deletedAt IS NULL`을 추가했다.

플레이리스트는 콘텐츠 삭제로 함께 사라지면 안 된다. 대신 더 이상 접근할 수 없는 콘텐츠 연결만 제거해야 한다. Content가 소프트 삭제 이벤트를 발행하면 `BEFORE_COMMIT` Playlist 이벤트 핸들러가 같은 트랜잭션 안에서 해당 `playlist_contents` 연결 행을 일괄 삭제하도록 구성했다.

```text
Content Soft Delete 처리
-> ContentSoftDeletedEvent의 BEFORE_COMMIT 처리
-> playlist_contents 연결 행 일괄 삭제
-> 전체 트랜잭션 COMMIT
```

이벤트를 사용하면 ContentService가 Playlist Repository를 직접 호출하지 않아도 된다. 각 도메인이 자기 데이터 정리 책임을 유지하면서 삭제 흐름만 연결할 수 있다. 연결 정리에 실패하면 Content의 소프트 삭제도 함께 롤백되어 두 데이터의 상태가 어긋나지 않는다.

## 90일이 지난 소유 썸네일 정리

Content 행과 Review 기록은 계속 보존하지만, 삭제된 콘텐츠가 사용하던 애플리케이션 소유 썸네일까지 영구 보관할 필요는 없었다.

그래서 소프트 삭제 후 90일이 지난 콘텐츠의 로컬 또는 S3 썸네일을 정리하는 Spring Batch 작업을 추가했다.

```text
Job: contentThumbnailCleanupJob
Step: contentThumbnailCleanupStep
기본 실행 시각: 매일 KST 04:30
기본 보존 기간: 90일
기본 처리 단위: 100건
```

외부 API 이미지 URL은 애플리케이션이 소유한 파일이 아니므로 삭제하지 않는다. `thumbnailKey`가 있는 파일만 정리 대상으로 삼는다.

파일 저장소 작업과 DB 트랜잭션은 하나로 묶을 수 없다. 따라서 파일 삭제가 성공한 뒤 별도 트랜잭션으로 `thumbnailUrl`과 `thumbnailKey`를 비운다.

개별 파일 삭제가 실패해도 나머지 후보는 계속 처리한다. 대신 발견·정리·건너뜀·실패 건수를 `ExecutionContext`에 남기고, 하나라도 실패하면 Job을 실패 처리해 운영자가 놓치지 않게 했다.

## 최종 테스트 범위

초기 테스트에 더해 다음 동작을 확인했다.

- 삭제 콘텐츠 리뷰가 일반 조회와 수정·삭제 대상에서 제외되는지
- 리뷰 행 자체는 DB에 유지되는지
- 플레이리스트는 유지되고 대상 콘텐츠 연결만 제거되는지
- 90일이 지난 소유 썸네일만 정리되는지
- 외부 이미지 URL은 정리 대상에서 제외되는지
- 일부 파일 삭제가 실패해도 나머지 후보를 계속 처리하는지
- 배치 처리 결과와 실패 상태가 정확히 기록되는지

## 배운 점

삭제는 Repository 메서드 하나를 바꾸는 작업이 아니었다.

조회, 집계, 캐시, 외부 동기화와 연관 도메인이 모두 같은 삭제 상태를 이해해야 한다. 특히 외부 식별키로 다시 들어오는 데이터까지 고려하지 않으면 Soft Delete를 적용하고도 삭제된 콘텐츠가 되살아날 수 있다.

또한 “기록을 남긴다”와 “사용자에게 보여준다”는 별개의 문제였다. Content와 Review는 기록으로 보존하고, Playlist 연결과 오래된 소유 썸네일처럼 서비스에 필요 없는 데이터만 선택적으로 정리하는 방식이 이번 서비스에 더 잘 맞았다.
