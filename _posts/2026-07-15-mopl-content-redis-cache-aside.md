---
layout: post
title: "[모두의 플리] Redis Cache-Aside로 콘텐츠 조회 고도화하기"
date: 2026-07-15 14:00:00 +0900
---

# [모두의 플리] Redis Cache-Aside로 콘텐츠 조회 고도화하기

## 배경

콘텐츠 조회 API는 콘텐츠 기본 정보뿐 아니라 평균 평점, 리뷰 수, 현재 시청자 수까지 조합해 응답한다.

조회 요청이 늘어날수록 같은 콘텐츠를 DB에서 반복해서 읽는 비용도 커진다.

이번 작업에서는 Redis를 조회 성능을 위한 복사본으로 사용하고 DB를 유일한 원본으로 유지하는 Cache-Aside 패턴을 적용했다.

```text
캐시 HIT  -> Redis 값 사용
캐시 MISS -> DB 조회 -> Redis 저장 -> 응답
Redis 장애 -> DB 조회로 fallback
```

Redis에 문제가 생겼다고 콘텐츠 조회 API까지 실패하게 만들지 않는 것이 기본 원칙이었다.

## API 응답 DTO를 그대로 캐싱하지 않은 이유

`ContentDto`에는 성격이 다른 값이 함께 들어 있다.

```text
기본 정보: 제목, 설명, 타입, 출처, 썸네일, 태그
통계 정보: 평균 평점, 리뷰 수
실시간 정보: 현재 시청자 수
```

전체 DTO를 하나로 캐싱하면 리뷰 하나가 바뀔 때 제목과 설명까지 다시 저장해야 한다.

그래서 캐시 전용 DTO를 두 종류로 분리했다.

```text
ContentBaseCache
  id, title, description, type, source, thumbnail, tags

ContentStatsCache
  contentId, averageRating, reviewCount
```

`watcherCount`는 변화가 매우 잦으므로 Redis 콘텐츠 캐시에서 제외하고 기존 WatchingSession 조회 결과를 사용한다.

최종 응답은 Base Cache, Stats Cache, watcherCount를 조립해 만든다.

## 캐시 Key와 TTL

키의 역할을 이름만 보고도 알 수 있도록 구분했다.

```text
mopl:content:base:{contentId}
mopl:content:stats:{contentId}
```

TTL은 데이터 변경 빈도에 따라 다르게 적용했다.

```text
Base Cache: 20분
Stats Cache: 3분
```

기본 정보는 자주 바뀌지 않으므로 비교적 길게 유지한다. 반면 평점과 리뷰 수는 리뷰 활동에 따라 변하므로 더 짧게 유지한다.

TTL은 정상적인 정합성 유지 수단이라기보다 캐시 무효화가 실패했을 때 오래된 값이 무기한 남지 않게 하는 최종 안전망이다.

## 단건 조회에서 부분 MISS 처리하기

Base와 Stats 중 하나만 없는 상황도 생길 수 있다.

```text
Base HIT + Stats HIT
  -> DB 조회 없이 응답 조립

Base HIT + Stats MISS
  -> DB 한 번 조회
  -> Stats만 Redis에 저장

Base MISS + Stats HIT
  -> DB 한 번 조회
  -> Base만 Redis에 저장
```

캐시가 일부만 없다고 DB를 두 번 조회하지 않는다. DB에서 콘텐츠를 한 번 읽고 누락된 캐시만 채운다.

캐시 HIT마다 DB와 값을 비교하면 캐시를 사용하는 의미가 줄어들기 때문에, 정합성은 COMMIT 후 무효화와 TTL로 관리한다.

## 다건 조회에서 N번 요청하지 않기

검색·필터·정렬·커서 페이지네이션은 DB가 가장 잘 처리한다.

따라서 목록 조건 자체를 Redis에 캐싱하지 않고 먼저 DB에서 정렬된 콘텐츠 ID 목록을 가져온다.

그다음 조회 흐름은 다음과 같다.

```text
1. DB에서 정렬된 contentId 목록 조회
2. Base·Stats Key를 Redis MGET으로 한 번에 조회
3. 캐시가 누락된 ID만 DB에서 벌크 조회
4. 누락된 값을 Redis Pipeline으로 일괄 저장
5. 처음 DB가 반환한 ID 순서대로 응답 조립
```

반복문 안에서 Redis GET이나 DB 조회를 호출하면 콘텐츠 수만큼 네트워크 요청이 발생한다.

MGET과 Pipeline을 사용하면 데이터 수가 늘어도 Redis 왕복 횟수를 줄일 수 있다.

태그 Lazy Loading으로 추가 쿼리가 발생하지 않도록 캐시 MISS 콘텐츠를 벌크 조회할 때 태그도 함께 읽는다.

## DB COMMIT 이후 캐시 무효화

DB 변경 전에 캐시를 먼저 삭제하면 다음과 같은 문제가 생길 수 있다.

```text
캐시 삭제
-> 다른 요청이 아직 변경 전 DB 값을 조회
-> Redis에 오래된 값을 다시 저장
-> DB 변경 COMMIT
```

그래서 콘텐츠 수정과 삭제는 DB 트랜잭션이 성공한 뒤 Base와 Stats 캐시를 함께 삭제한다.

콘텐츠 등록은 아직 캐시가 없으므로 미리 저장하거나 삭제하지 않는다. 다음 조회에서 필요한 캐시를 만든다.

## 리뷰 변경은 Stats 캐시만 삭제하기

리뷰 생성·수정·삭제는 평균 평점과 리뷰 수를 변경하지만 제목과 썸네일은 바꾸지 않는다.

ReviewService가 Redis나 ContentCacheService를 직접 호출하면 Review 도메인이 콘텐츠 캐시 구현에 의존하게 된다.

그래서 Spring Event로 변경 사실만 전달했다.

```text
리뷰 생성·수정·삭제
-> Content의 평균 평점·리뷰 수 갱신
-> ReviewStatsChangedEvent(contentId) 발행
-> DB 트랜잭션 COMMIT
-> ContentCacheEventHandler 실행
-> Stats 캐시만 삭제
```

리스너는 `@TransactionalEventListener(phase = AFTER_COMMIT)`을 사용한다.

리뷰 처리 중 예외가 발생해 트랜잭션이 롤백되면 이벤트 핸들러도 실행되지 않는다.

## Redis 장애를 API 장애로 만들지 않기

Redis는 원본이 아니므로 읽기·쓰기·삭제 중 예외가 발생해도 Content API는 DB를 기준으로 계속 처리한다.

```text
MGET 실패       -> 전부 MISS로 간주하고 DB 조회
역직렬화 실패   -> 해당 값만 MISS 처리
Pipeline 실패   -> 응답은 유지하고 캐시 저장 생략
캐시 삭제 실패  -> WARN 기록, TTL을 안전망으로 사용
```

Redis 오류와 DB fallback은 로그로 남기고 HIT·MISS는 건별 INFO 로그 대신 Micrometer 메트릭으로 집계한다.

메트릭 태그에는 `cacheName`, `operation`, `result`처럼 값의 종류가 제한된 정보만 사용한다. contentId나 검색어를 태그로 사용하면 시계열이 지나치게 많아질 수 있기 때문이다.

## 단위 테스트와 코드 검증

다음 동작을 테스트했다.

- Base·Stats Key 생성과 MGET 결과 조립
- Base 20분, Stats 3분 TTL 적용
- Pipeline 기반 일괄 저장
- Base 또는 Stats 일부 MISS 처리
- Redis 읽기·쓰기·삭제 예외 시 fallback
- 캐시 데이터 ID와 Key의 ID가 다를 때 MISS 처리
- 단건 캐시 HIT 시 Content DB 조회 생략
- 다건 조회에서 누락된 콘텐츠만 벌크 조회
- 최초 DB ID 순서 유지
- 콘텐츠 수정·삭제 후 캐시 무효화
- 리뷰 생성·수정·삭제 이벤트 발행
- 리뷰 처리 실패 시 이벤트 미발행
- AFTER_COMMIT 리스너의 Stats 캐시 삭제

Content 도메인 전체 테스트도 실행해 정상 통과를 확인했다.

## 실제 Redis 수동 통합 테스트

Mock 기반 테스트만으로는 실제 Redis 명령과 트랜잭션 이후 키 상태를 완전히 확인하기 어렵다.

Docker Redis를 실행하고 실제 HTTP API를 통해 다음 순서로 검증했다.

```text
테스트 콘텐츠 생성
-> 콘텐츠 조회로 Base·Stats 캐시 생성
-> 리뷰 생성
-> Stats 캐시 삭제 확인
-> 콘텐츠 재조회로 최신 통계 캐시 생성
-> 리뷰 수정과 삭제도 같은 방식으로 반복
-> 콘텐츠와 모든 테스트 캐시 삭제
```

확인 결과는 다음과 같았다.

| 단계 | Base 캐시 | Stats 캐시 | 콘텐츠 조회 결과 |
|---|---:|---:|---|
| 최초 조회 | 유지 | 생성 | TTL 약 20분·3분 |
| 리뷰 생성 | 유지 | 삭제 | 재조회 시 평점 4.5, 리뷰 1개 |
| 리뷰 수정 | 유지 | 삭제 | 재조회 시 평점 3.0, 리뷰 1개 |
| 리뷰 삭제 | 유지 | 삭제 | 재조회 시 평점 0.0, 리뷰 0개 |
| 콘텐츠 삭제 | 삭제 | 삭제 | 모든 캐시 정리 |

## 수동 테스트 중 만난 문제

처음에는 공용 PostgreSQL로 애플리케이션을 실행하려 했지만 Flyway V1 체크섬 불일치와 누락된 테이블 때문에 시작할 수 없었다.

이 문제를 해결하려고 공용 DB 이력을 임의로 수정하면 팀원 환경에 영향을 줄 수 있다.

그래서 실제 Redis는 그대로 사용하고 DB만 프로젝트의 H2 프로필로 격리했다. 실행 프로세스에서만 Flyway를 비활성화해 저장소 설정과 공용 DB는 변경하지 않았다.

또 한 번은 로그인 성공 후 콘텐츠 등록이 403으로 실패했다.

원인은 로그인이 실패한 것이 아니라 로그인 응답의 Access Token을 일반 API 요청의 Bearer Header에 넣지 않았기 때문이었다.

```text
로그인 성공
-> 응답에서 Access Token 확인
-> Authorization: Bearer {token}
-> 변경 요청에는 CSRF Header도 함께 전달
```

인증과 CSRF를 모두 적용한 뒤 실제 API 테스트가 정상적으로 진행됐다.

## 이번 범위에서 제외한 것

초기 구현에서는 다음 고도화를 제외했다.

- 검색 조건별 목록 캐시
- Redis Write-Through
- 분산 락
- Transactional Outbox 기반 캐시 무효화
- Stale-While-Revalidate
- DB와 캐시의 버전 비교

현재 트래픽과 장애 양상을 확인하지 않은 상태에서 복잡한 동시성 제어를 먼저 추가하면 운영 복잡도만 높아질 수 있다.

실제 캐시 스탬피드나 정합성 유실이 확인되면 별도 고도화로 진행할 예정이다.

## 이번 작업에서 배운 점

캐시는 단순히 Redis에 값을 넣는 기능이 아니었다.

무엇을 함께 저장할지, 언제 삭제할지, Redis가 실패하면 어떻게 동작할지, 목록 조회에서 네트워크 왕복을 어떻게 줄일지까지 함께 설계해야 했다.

특히 DB를 원본으로 유지하고 COMMIT 이후 캐시를 무효화하는 원칙이 있어야 성능 개선이 데이터 정합성 문제로 이어지지 않는다.
