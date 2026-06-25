---
layout: post
title: "[모두의 플리] Content 도메인 초기 설계 기록"
---

# [모두의 플리] Content 도메인 초기 설계 기록

## 배경

고급 프로젝트에서 내가 맡은 영역은 콘텐츠 데이터 관리와 콘텐츠 수집 배치 작업이다.

처음에는 바로 Entity와 API부터 만들면 될 것 같았다. 하지만 요구사항을 다시 보니 Content 도메인은 혼자 닫힌 기능이 아니었다.

콘텐츠 하나에는 여러 기능이 연결된다.

- 관리자는 콘텐츠를 등록, 수정, 삭제한다.
- 사용자는 콘텐츠에 리뷰와 평점을 남긴다.
- 사용자는 콘텐츠를 플레이리스트에 담는다.
- 사용자는 콘텐츠 같이보기 화면에 들어간다.
- 외부 API에서 영화, TV 시리즈, 스포츠 데이터를 수집한다.
- 검색 기능에서는 콘텐츠 데이터를 색인한다.

즉 Content 도메인을 잘못 설계하면 Review, Playlist, WatchingSession, Search, Batch 쪽에도 영향이 간다.

그래서 구현 전에 먼저 정책을 정리했다.

이 글은 실제 구현 완료 글이 아니라, 구현 전에 정한 초기 설계 방향을 정리한 기록이다. 구현 과정에서 바뀌는 내용이 있으면 이후 글에서 다시 정리할 예정이다.

## Swagger 명세와 구현 기준 맞추기

첫 번째로 확인한 것은 API 명세였다.

콘텐츠 생성 API는 `multipart/form-data`로 되어 있었다.

구조는 다음과 같다.

```text
request: 콘텐츠 생성 요청 JSON
thumbnail: 썸네일 이미지 파일
```

이 구조는 자연스럽다. JSON 데이터와 파일을 함께 보내야 하기 때문이다.

문제는 콘텐츠 수정 API였다.

수정 API 명세에는 `application/json` 안에 `thumbnail: binary`가 들어 있는 형태가 있었다.

하지만 JSON 요청에는 파일을 함께 담을 수 없다.

그래서 수정 API는 다음처럼 정리했다.

```text
PATCH /api/contents/{contentId}
Content-Type: multipart/form-data
```

수정 요청에서도 `request`와 `thumbnail`을 받을 수 있게 한다.

단, 수정할 때 썸네일이 없으면 기존 썸네일을 유지한다.

생성 API와 수정 API의 썸네일 정책도 구분했다.

```text
생성: thumbnail 필수
수정: thumbnail 선택
수정 시 thumbnail이 없으면 기존 썸네일 유지
```

DB의 `thumbnail_url`은 null을 허용하기로 했다. 외부 API에서 가져온 콘텐츠는 썸네일이 없을 수도 있기 때문이다. 다만 관리자가 직접 등록하는 콘텐츠는 API 단계에서 썸네일을 필수로 검증한다.

## 콘텐츠 삭제 정책

콘텐츠 삭제는 생각보다 단순하지 않았다.

콘텐츠 하나를 지우면 그 콘텐츠에 달린 리뷰, 플레이리스트 연결, 현재 시청 세션, 검색 색인까지 같이 생각해야 한다.

처음에는 soft delete도 고려할 수 있었다.

```text
is_deleted = true
deleted_at = 삭제 시각
```

하지만 현재 서비스에서는 삭제된 콘텐츠를 다시 복구하거나, 삭제된 콘텐츠의 리뷰를 따로 조회하는 요구사항이 없다.

오히려 soft delete를 쓰면 모든 조회마다 삭제 여부 조건을 신경 써야 한다.

그래서 초기 정책은 hard delete로 정했다.

```text
콘텐츠 삭제 = 실제 DB row 삭제
```

콘텐츠가 삭제되면 콘텐츠에 종속된 데이터도 같이 정리되어야 한다.

예를 들어 리뷰는 독립된 게시글이 아니라 특정 콘텐츠에 대한 의견이다. 콘텐츠가 사라지면 리뷰만 남아 있어도 서비스 안에서 의미가 없다.

그래서 정책은 다음처럼 정했다.

```text
콘텐츠 삭제 시 함께 정리할 것
- CONTENTS
- CONTENT_TAGS
- REVIEWS
- PLAYLIST_CONTENTS
- WATCHING_SESSIONS
- 검색 색인
```

다만 모든 도메인의 내부 구현을 Content 도메인에서 직접 수정하면 결합도가 너무 높아진다.

그래서 방향은 이벤트 기반으로 잡았다.

```text
ContentDeletedEvent 발행
-> Review 도메인에서 리뷰 삭제
-> Playlist 도메인에서 연결 제거
-> WatchingSession 도메인에서 시청 세션 종료
-> Search 도메인에서 색인 삭제
```

DB에 저장된 연관 데이터 정리에 실패하면 콘텐츠 삭제 전체를 실패 처리하고 롤백한다.

반면 WebSocket 연결 종료는 DB 데이터가 아니라 런타임 상태다. 그래서 WebSocket room 종료 실패는 로그로 남기되 DB 삭제 롤백 사유로 보지 않기로 했다.

검색 색인은 즉시 삭제해야 한다.

삭제된 콘텐츠가 검색 결과에 남아 있으면 사용자 입장에서는 이상하기 때문이다. 따라서 검색 색인 삭제를 배치로 지연 처리하는 방식은 이 정책에서는 제외했다.

## 리뷰와 시청 세션 집계값

Content 응답에는 단순한 콘텐츠 정보만 있는 것이 아니다.

API 응답에는 다음 값도 포함된다.

- `averageRating`
- `reviewCount`
- `watcherCount`

하지만 이 값들은 Content 자체 데이터가 아니다.

```text
averageRating -> Review 도메인
reviewCount   -> Review 도메인
watcherCount  -> WatchingSession 도메인
```

그래서 이 값들을 `CONTENTS` 테이블에 저장하지 않기로 했다.

초기 구현에서는 조회 시점에 Review, WatchingSession 데이터를 기반으로 계산한다.

Content 도메인의 책임은 응답 DTO를 조립하는 것이다.

```text
Content 기본 정보 조회
Review 집계값 조회
WatchingSession 집계값 조회
응답 DTO 조립
```

여기서 주의할 점은 목록 조회다.

콘텐츠 목록을 20개 조회했는데 각 콘텐츠마다 리뷰 수와 평균 평점을 따로 조회하면 N+1 문제가 생긴다.

그래서 목록 조회에서는 콘텐츠 ID 목록을 기준으로 집계값을 bulk 조회하는 방향으로 정했다.

또 하나 중요한 점은 정렬이다.

API에는 `sortBy=rate`, `sortBy=watcherCount`가 있다.

이 값으로 정렬하려면 페이지네이션 이후에 애플리케이션에서 정렬하면 안 된다.

예를 들어 전체 콘텐츠 100개 중 먼저 20개를 가져온 뒤 그 20개만 평점순으로 정렬하면 전체 기준 평점순이 아니다.

그래서 `rate`, `watcherCount` 정렬은 조회 단계에서 join, subquery, projection 같은 방식으로 처리해야 한다.

## 외부 콘텐츠 수집 정책

외부 콘텐츠는 두 API에서 가져온다.

```text
TMDB
- movie
- tvSeries

TheSportsDB
- sport
```

여기서 콘텐츠 타입은 Swagger 명세에 맞췄다.

```text
movie
tvSeries
sport
```

`sports`가 아니라 `sport`다.

외부 API 콘텐츠는 중복 생성되면 안 된다. 그래서 식별 기준은 다음 조합으로 정했다.

```text
source + external_id
```

예를 들어 TMDB에서 가져온 영화라면:

```text
source = TMDB
external_id = TMDB 콘텐츠 ID
```

TheSportsDB라면:

```text
source = THE_SPORTS_DB
external_id = TheSportsDB 이벤트 ID
```

관리자가 직접 등록한 콘텐츠는 다음처럼 구분한다.

```text
source = MANUAL
external_id = null
```

외부 API에서 같은 콘텐츠가 다시 수집되면 새로 만들지 않는다.

초기 정책에서는 기존 콘텐츠의 제목, 설명, 썸네일, 태그를 자동으로 덮어쓰지 않기로 했다.

관리자가 수정한 데이터가 배치 재수집 때문에 덮어써질 수 있기 때문이다.

대신 같은 콘텐츠가 다시 확인되면 `last_synced_at` 정도는 갱신할 수 있다.

외부 API 응답에서 특정 콘텐츠가 사라졌다고 해서 우리 서비스의 콘텐츠를 자동 삭제하지도 않는다.

삭제는 관리자 삭제 API를 통해서만 수행한다.

## ERD와 인덱스 정책

Content ERD는 기존 팀 ERD를 기준으로 유지하기로 했다.

`CONTENTS`의 주요 필드는 다음과 같다.

```text
id
type
title
description
thumbnail_url
source
external_id
last_synced_at
created_at
updated_at
```

태그는 별도 테이블로 분리한다.

```text
CONTENT_TAGS
- content_id
- tag
```

동일 콘텐츠 안에서 같은 태그가 중복되면 안 된다.

그래서 `(content_id, tag)` 기준으로 중복을 막는다.

검색 조건도 정했다.

`keywordLike`는 `title`과 `description`을 대상으로 한다.

프로토타입에서도 설명까지 검색되는 흐름이 있었고, 사용자 입장에서도 제목만 검색되는 것보다 자연스럽다.

`tagsIn`은 OR 조건으로 처리한다.

예를 들어 태그가 `액션`, `스포츠`로 들어오면 둘 중 하나 이상을 포함한 콘텐츠를 찾는다.

초기 인덱스는 다음 기준으로 잡았다.

```text
CONTENTS(id) primary key
CONTENTS(source, external_id) unique
CONTENTS(type)
CONTENTS(created_at, id)
CONTENT_TAGS(content_id, tag)
CONTENT_TAGS(tag, content_id)
```

`rate`, `watcherCount` 정렬은 `CONTENTS` 단일 테이블 인덱스로 해결하지 않는다.

초기에는 조회 전용 join, subquery, projection으로 처리하고, 성능 문제가 확인되면 read model이나 캐시를 검토하기로 했다.

## 아직 남겨둔 것

모든 것을 미리 확정하지는 않았다.

외부 API 수집에서는 구현 시점에 다시 확인해야 할 것들이 있다.

- TMDB에서 `popular`를 쓸지 `trending`을 쓸지
- TheSportsDB에서 `upcoming`을 쓸지 `recent`를 쓸지
- API별 수집 개수
- 정확한 cron
- 관리자 수정 필드를 보존하기 위한 override 컬럼 필요 여부

이런 것은 지금 억지로 정하면 오히려 위험하다.

실제 API 응답 구조, quota, 기존 Batch 코드, 팀 일정에 따라 달라질 수 있기 때문이다.

그래서 구현 태스크에 들어갈 때 다시 확인하기로 했다.

## 배운 점

이번 설계 정리에서 가장 크게 느낀 점은 도메인 하나를 만든다고 해서 그 도메인만 보면 안 된다는 것이다.

Content는 단순히 `title`, `description`, `thumbnail`을 저장하는 테이블이 아니다.

리뷰, 플레이리스트, 시청 세션, 검색, 배치 수집과 계속 연결된다.

그래서 구현 전에 다음을 먼저 정리하는 것이 중요했다.

- 어떤 데이터가 Content 소유인지
- 어떤 데이터가 다른 도메인 소유인지
- 삭제 시 어디까지 정리해야 하는지
- 외부 API 데이터와 수동 등록 데이터를 어떻게 구분할지
- 조회 응답에 필요한 집계값을 어디서 가져올지

예전 같으면 바로 Entity부터 만들었을 것 같다.

하지만 이번에는 정책을 먼저 정리해두니 구현할 때 추측으로 넘어갈 부분이 줄었다.

앞으로 실제 구현을 하면서 이 설계가 바뀔 수도 있다. 그때는 왜 바뀌었는지까지 같이 기록해두면 더 좋은 학습 기록이 될 것 같다.
