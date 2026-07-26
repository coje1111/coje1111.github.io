---
layout: post
title: "[모두의 플리] 이벤트와 배치로 콘텐츠 인기순 정렬 동기화하기"
date: 2026-07-26 11:00:00 +0900
---

# [모두의 플리] 이벤트와 배치로 콘텐츠 인기순 정렬 동기화하기

## 인기순의 의미부터 다시 정하기

처음 콘텐츠 인기순은 실시간 시청자 수인 `watcherCount`를 기준으로 조회했다.

OpenSearch 초성 검색을 추가하면서 문제가 생겼다. 검색은 OpenSearch가 담당하지만 `watcherCount`는 WatchingSession 테이블에서 실시간으로 계산하고 있었기 때문에, 초성 검색 결과를 시청자 수로 정렬할 수 없었다.

중간에는 리뷰가 많은 콘텐츠를 인기 콘텐츠로 정의해 `reviewCount`를 우선하는 방안도 검토했다. 리뷰 수는 Content와 OpenSearch 문서에 이미 저장되어 있어 구현이 단순하고 안정적이라는 장점이 있었다.

최종 정책은 서비스에서 원하는 의미에 맞춰 다음처럼 확정했다.

```text
1순위: watcherCount 내림차순
2순위: reviewCount 내림차순
3순위: averageRating 내림차순
4순위: Content ID 내림차순
```

실시간 관심도를 가장 먼저 반영하되 시청자 수가 같으면 누적 참여와 만족도를 차례로 사용하는 방식이다. 마지막 ID 정렬은 모든 값이 같을 때도 페이지 순서를 고정하기 위한 기준이다.

## 왜 시청자 수 동기화가 필요했을까

DB에서는 WatchingSession을 집계해 현재 시청자 수를 계산할 수 있다.

OpenSearch는 DB 조인을 할 수 없으므로 문서에 `watcherCount`가 없으면 인기순 정렬을 수행할 수 없다.

```text
PostgreSQL
  Content + WatchingSession 집계
  -> watcherCount 계산 가능

OpenSearch
  ContentDocument 단독 조회
  -> watcherCount 필드가 필요
```

따라서 `ContentDocument`에 다음 통계값을 함께 저장했다.

```text
averageRating
reviewCount
watcherCount
```

DB는 계속 유일한 원본이고 OpenSearch 값은 조회 성능을 위한 복사본으로 취급한다.

## 선택지를 비교하기

### 조회할 때마다 DB에서 시청자 수 가져오기

항상 최신값을 사용할 수 있지만, OpenSearch가 정렬하기 전에 DB 값을 알 수 없으므로 전체 후보를 가져와 애플리케이션에서 다시 정렬해야 한다. 데이터가 많아지면 검색 엔진의 정렬과 페이지네이션 장점을 잃게 된다.

### 배치마다 문서를 삭제하고 재삽입하기

구현은 단순하지만 변경되지 않은 제목, 설명, 태그까지 매번 다시 색인한다. 문서 수가 커질수록 불필요한 쓰기와 색인 비용이 증가한다.

### 이벤트가 발생할 때마다 문서 전체 재생성하기

실시간 반영은 가능하지만 시청자가 입장하거나 나갈 때마다 DB에서 Content 전체를 조회하고 문서를 다시 저장해야 한다.

### 이벤트 부분 갱신과 배치 보정 함께 사용하기

최종적으로 선택한 방식이다.

```text
실시간 이벤트
  -> watcherCount 필드만 부분 갱신

정기 배치
  -> 누락되거나 실패한 값을 주기적으로 보정
```

빠른 반영과 운영 안정성을 함께 확보하면서 불필요한 전체 재색인을 줄일 수 있다.

## 트랜잭션 커밋 후 이벤트 처리하기

WatchingSession 입장과 퇴장 이벤트는 Content 쪽 리스너에서 구독한다.

타 도메인의 서비스 코드를 직접 수정하지 않고 기존 이벤트 계약을 사용했다.

```java
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
```

`AFTER_COMMIT`을 사용한 이유는 DB 트랜잭션이 실제로 성공한 뒤 OpenSearch를 갱신하기 위해서다.

트랜잭션이 롤백됐는데 검색 문서만 먼저 변경되면 DB와 OpenSearch가 서로 다른 값을 가지게 된다.

리뷰 생성·수정·삭제로 통계가 변할 때도 같은 방식으로 Content의 `reviewCount`와 `averageRating`이 커밋된 후 문서를 갱신한다.

## watcherCount만 부분 갱신하기

시청 세션이 바뀔 때 제목과 설명까지 다시 저장할 필요는 없다.

현재 WatchingSession 수를 Content ID별로 벌크 집계한 뒤 기존 OpenSearch 문서와 비교한다.

```text
값이 같음
  -> 아무 작업도 하지 않음

값이 다름
  -> watcherCount만 bulkUpdate

문서가 없음
  -> DB에서 Content를 읽어 새 문서 색인
```

부분 갱신에는 충돌 재시도 횟수를 두었다. 여러 입장·퇴장 이벤트가 비슷한 시점에 발생할 수 있기 때문이다.

OpenSearch 갱신에 실패하면 DB 작업을 되돌리지 않고 WARN 로그를 남긴다. 검색 장애가 시청 세션 기능까지 실패하게 만들지 않고, 다음 배치가 값을 보정한다.

## 한 시간마다 전체 상태 보정하기

이벤트만으로 실시간 동기화를 구성해도 다음 상황은 남는다.

- OpenSearch가 잠시 중단되어 이벤트 갱신이 실패함
- 애플리케이션 재시작 구간에 이벤트가 누락됨
- 기존 문서에 `watcherCount` 필드가 없음
- OpenSearch에 특정 Content 문서 자체가 없음

이를 보완하기 위해 `ContentPopularitySyncTasklet`을 추가했다.

기본 실행 주기는 매시간 정각이다.

```yaml
CONTENT_POPULARITY_SYNC_CRON: 0 0 * * * *
CONTENT_POPULARITY_SYNC_CHUNK_SIZE: 500
```

활성 Content ID를 UUID 키셋 방식으로 500개씩 읽고, 각 청크의 시청자 수를 일괄 비교해 필요한 문서만 갱신한다.

```text
활성 Content ID 500개 조회
-> watcherCount 일괄 집계
-> OpenSearch 문서 일괄 조회
-> 변경 필드 bulkUpdate
-> 누락 문서 saveAll
-> 다음 ID 구간 처리
```

Job의 `ExecutionContext`에는 다음 수치를 기록한다.

- 처리한 콘텐츠 수
- 갱신한 문서 수
- 새로 색인한 문서 수
- 변경이 없어 건너뛴 문서 수

운영 로그만 확인해도 배치가 실제로 어떤 작업을 했는지 알 수 있다.

## 복합 정렬에 맞는 커서 만들기

인기순 기준이 네 개라면 커서도 첫 번째 값만 저장해서는 안 된다.

예를 들어 시청자 수가 0인 콘텐츠가 많으면 `watcherCount=0`만으로 다음 페이지의 시작점을 구분할 수 없다.

그래서 커서에는 다음 세 값을 함께 저장하고 ID는 기존 `idAfter`를 사용했다.

```text
cursor = watcherCount|reviewCount|averageRating
idAfter = contentId
```

OpenSearch의 `search_after`에는 네 값을 같은 순서로 전달한다.

```text
watcherCount
reviewCount
averageRating
id
```

DB fallback의 QueryDSL 조건도 같은 사전식 비교 순서를 사용한다. OpenSearch가 실패해 DB로 전환되더라도 정렬 기준과 커서 의미가 달라지지 않도록 했다.

## API 계약은 그대로 유지하기

인기순 정책은 여러 차례 바뀌었지만 프론트엔드가 보내는 요청은 기존 명세를 유지한다.

```text
sortBy=watcherCount
```

이 문자열은 “시청자 수 하나만 정렬한다”는 내부 구현명이 아니라 “인기순”을 요청하는 외부 계약으로 사용한다.

내부 구현을 `reviewCount`로 잠시 변경하면서 API 키까지 바꿨을 때 운영 화면에서 400 오류가 발생했다. 이후 외부 계약과 내부 정책을 분리해 API 키를 복구했다.

## 테스트한 범위

- 시청 세션 입장·퇴장 커밋 후 동기화 호출
- 같은 watcherCount는 갱신하지 않음
- 변경된 watcherCount만 부분 갱신
- 누락된 OpenSearch 문서는 새로 색인
- 배치 청크 크기 검증
- 배치 처리·갱신·신규 색인·미변경 수치 기록
- 시청자 수, 리뷰 수, 평점 순의 우선순위
- 모든 통계가 같을 때 ID 보조 정렬
- 복합 커서 다음 페이지의 중복·누락 방지
- OpenSearch와 DB fallback의 정렬 결과 일치
- 검색어가 없는 인기순 요청도 OpenSearch에서 처리
- 기존 API 키 `watcherCount` 유지

## 배운 점

“인기순”은 단순한 정렬 필드가 아니라 서비스 정책이었다.

정렬 기준이 여러 개라면 검색 문서, 이벤트 동기화, 장애 fallback, 커서 페이지네이션이 모두 같은 순서를 이해해야 한다.

실시간 이벤트만 사용하면 빠르지만 누락을 복구하기 어렵고, 배치만 사용하면 최신성이 떨어진다. 이벤트로 빠르게 반영하고 배치로 최종 정합성을 보정하는 구조가 두 방식의 단점을 줄여주었다.

또한 정책이 바뀌더라도 이미 공개된 API 키까지 함께 바꾸지 않도록 외부 계약과 내부 구현을 분리해야 한다는 점을 다시 확인했다.
