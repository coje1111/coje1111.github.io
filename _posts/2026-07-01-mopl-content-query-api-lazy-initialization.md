---
layout: post
title: "[모두의 플리] 콘텐츠 조회 API 구현과 LazyInitializationException 디버깅 기록"
---

# [모두의 플리] 콘텐츠 조회 API 구현과 LazyInitializationException 디버깅 기록

## 배경

이번 작업에서는 모두의 플리 프로젝트의 Content 도메인에서 콘텐츠 조회 API를 구현했다.

이전 작업에서는 Content 엔티티, 타입, 출처, 태그, Repository 기반, DTO와 Mapper 같은 기반 모델을 먼저 만들었다.

이번에는 그 기반 위에서 실제 사용자가 콘텐츠를 조회할 수 있는 API를 구성했다.

구현한 범위는 크게 다음과 같다.

- 콘텐츠 단건 조회
- 콘텐츠 목록 조회
- 타입, 키워드, 태그 조건 조회
- 커서 기반 페이지네이션
- 평점순 정렬
- 인기순 정렬을 위한 임시 구조
- 조회 응답에 평점, 리뷰 수, 시청자 수 조합
- 실제 HTTP 요청 기반 API 테스트

단순히 Controller 하나를 추가하는 작업처럼 보일 수도 있지만, 실제로는 Content 도메인이 Review, WatchingSession 같은 다른 도메인과 어떻게 연결될지까지 고려해야 했다.

## 콘텐츠 조회 API에서 처리해야 했던 것

Swagger 명세 기준으로 콘텐츠 조회 API는 두 가지가 필요했다.

```text
GET /api/contents/{contentId}
GET /api/contents
```

단건 조회는 `contentId`로 콘텐츠 하나를 조회한다.

목록 조회는 조건이 더 많다.

```text
typeEqual
keywordLike
tagsIn
cursor
idAfter
limit
sortBy
sortDirection
```

여기서 `typeEqual`은 콘텐츠 타입 필터다.

모두의 플리에서는 콘텐츠 타입을 다음 세 가지로 제한했다.

```text
movie
tvSeries
sport
```

`keywordLike`는 제목과 설명을 대상으로 검색하도록 했다.

처음에는 태그까지 검색해야 하는지 헷갈릴 수 있었지만, API 명세에서 태그 검색은 `tagsIn`으로 따로 제공하고 있었다.

그래서 검색 책임을 나누면 다음과 같다.

```text
keywordLike: title, description 검색
tagsIn: tag 이름 기준 필터
```

`tagsIn`은 OR 조건으로 처리했다.

즉, 요청한 태그 중 하나 이상을 포함한 콘텐츠를 조회한다.

## averageRating과 reviewCount를 어디서 가져올 것인가

콘텐츠 응답에는 단순한 Content 필드만 들어가지 않는다.

응답에는 다음 값들도 포함된다.

```text
averageRating
reviewCount
watcherCount
```

처음에는 이 값을 조회 시점에 Review 테이블과 WatchingSession 테이블에서 계산하는 방식을 생각했다.

하지만 팀 논의 후 방향이 바뀌었다.

`averageRating`과 `reviewCount`는 Review가 변경될 때 Content에 동기화하는 방식으로 결정했다.

즉, 조회할 때마다 Review를 집계하지 않고 Content 테이블에 저장된 값을 읽는 구조다.

현재 Content 엔티티에는 다음 필드가 있다.

```java
@Column(name = "average_rating", nullable = false)
private double averageRating = 0.0;

@Column(name = "review_count", nullable = false)
private int reviewCount = 0;
```

이 방식의 장점은 조회 API가 단순해진다는 점이다.

콘텐츠 목록 조회는 자주 호출될 수 있다.

그때마다 Review 테이블을 조인하거나 집계하면 성능 부담이 커질 수 있다.

반대로 Content에 통계값을 저장하면 조회는 빠르다.

대신 리뷰 생성, 수정, 삭제 시점에 Content 통계값을 잘 동기화해야 한다.

이번 작업에서는 Review 도메인 파일을 직접 수정하지 않았다.

대신 Content 쪽에는 나중에 Review 도메인에서 사용할 수 있는 메서드를 준비했다.

```java
public void updateReviewStats(double averageRating, int reviewCount) {
  if (reviewCount < 0) {
    throw new IllegalArgumentException("리뷰 수는 음수일 수 없습니다.");
  }
  this.averageRating = averageRating;
  this.reviewCount = reviewCount;
}
```

현재 `watcherCount`는 WatchingSession 도메인 연계 전이라 임시로 `0L`을 반환한다.

이 부분은 나중에 실제 시청 세션 집계 방식이 정해지면 교체해야 한다.

## ContentStatsService를 둔 이유

조회 응답에 들어가는 통계값은 `ContentStatsService`에서 조합하도록 했다.

현재 구현은 단순하다.

```java
public ContentStats getStats(Content content) {
  if (content == null) {
    return ContentStats.empty();
  }
  return new ContentStats(content.getAverageRating(), content.getReviewCount(), 0L);
}
```

지금은 Content에 저장된 필드만 읽기 때문에 별도 DB 조회가 발생하지 않는다.

그런데도 Service를 따로 둔 이유는 `watcherCount` 때문이다.

현재는 `watcherCount = 0L`이지만, 나중에 WatchingSession과 연계되면 이 부분은 실제 집계값으로 바뀌어야 한다.

그때 Controller나 ContentService, Mapper를 크게 흔들지 않기 위해 통계값 조합 책임을 분리했다.

목록 조회에서는 여러 콘텐츠의 통계값을 Map으로 만든다.

```java
public Map<UUID, ContentStats> getStatsByContents(Collection<Content> contents) {
  if (contents == null || contents.isEmpty()) {
    return Map.of();
  }

  Map<UUID, ContentStats> statsByContentId = new LinkedHashMap<>();
  for (Content content : contents) {
    statsByContentId.put(content.getId(), getStats(content));
  }
  return statsByContentId;
}
```

여기서 `getStats()`가 콘텐츠 수만큼 호출되지만, 현재는 DB 조회가 아니라 이미 조회된 Content 객체의 필드를 읽는 단순 변환이다.

따라서 지금 구조에서는 N+1 쿼리 문제가 발생하지 않는다.

다만 나중에 `watcherCount`를 실제 구현할 때는 주의해야 한다.

다음처럼 콘텐츠마다 개별 count 쿼리를 날리면 안 된다.

```java
for (Content content : contents) {
  watchingSessionRepository.countByContentId(content.getId());
}
```

이렇게 하면 진짜 N+1 문제가 된다.

나중에는 contentId 목록을 기준으로 한 번에 집계하는 bulk 조회가 필요하다.

```text
contentIds -> WatchingSession bulk count -> Map<contentId, watcherCount>
```

## 정렬 구현

목록 조회의 정렬 기준은 다음 세 가지다.

```text
createdAt
rate
watcherCount
```

`createdAt`은 기본적인 생성일 정렬이다.

`rate`는 `Content.averageRating` 기준으로 정렬했다.

이때 커서 페이지네이션이 깨지지 않도록 `averageRating`과 `idAfter`를 함께 사용했다.

평점이 같은 콘텐츠가 여러 개 있을 수 있기 때문이다.

예를 들어 평점 내림차순 정렬에서는 다음 기준이 필요하다.

```text
averageRating DESC
id DESC
```

그리고 다음 페이지를 가져올 때도 같은 기준을 유지해야 한다.

`watcherCount`는 아직 실제 집계가 없기 때문에 임시 구현으로 처리했다.

현재는 모든 콘텐츠의 `watcherCount`가 `0L`이다.

그래서 실제 인기순 정렬은 아니고, id 기준 보조 정렬로 페이지네이션이 깨지지 않게만 했다.

이 부분은 후속 작업에서 WatchingSession과 연계해야 한다.

## 실제 HTTP API 테스트

처음에는 단위 테스트와 컴파일 테스트만으로 충분할 것 같았다.

하지만 실제 API는 인증, JSON 직렬화, Spring MVC, JPA 트랜잭션이 함께 동작한다.

그래서 로컬 서버를 띄우고 HTTP 요청을 보내는 방식으로 테스트했다.

테스트 방식은 다음과 같았다.

```text
1. dev 프로필 + H2 DB로 서버 실행
2. 임시 seed SQL로 콘텐츠 데이터 삽입
3. 테스트용 JWT 생성
4. Authorization 헤더를 붙여 실제 API 호출
5. 응답 상태와 응답 본문 확인
6. 테스트 후 임시 파일 삭제
```

확인한 항목은 다음과 같다.

```text
list-createdAt          PASS
single-content          PASS
filter-typeEqual        PASS
filter-keywordLike      PASS
filter-tagsIn           PASS
sort-rate-desc          PASS
sort-watcherCount-temp  PASS
invalid-type-400        PASS
```

이 과정에서 단위 테스트에서는 놓쳤던 문제가 하나 발견됐다.

## LazyInitializationException 발생

처음 실제 API 테스트를 돌렸을 때 정상 조회 API가 모두 500 에러를 반환했다.

로그를 확인해보니 원인은 다음과 같았다.

```text
failed to lazily initialize a collection of role:
io.mopl.domain.content.entity.Content.tags
could not initialize proxy - no Session
```

문제는 `Content.tags`였다.

Content 엔티티의 tags는 `@ElementCollection(fetch = FetchType.LAZY)`로 설정되어 있다.

```java
@ElementCollection(fetch = FetchType.LAZY)
private Set<String> tags = new LinkedHashSet<>();
```

그런데 Mapper에서 DTO를 만들 때 다음처럼 tags를 그대로 넘기고 있었다.

```java
.tags(content.getTags())
```

이 코드는 얼핏 보면 문제가 없어 보인다.

하지만 실제 흐름은 다음과 같았다.

```text
1. Service 트랜잭션 안에서 ContentDto 생성
2. ContentDto 안에 lazy collection인 tags 참조가 그대로 들어감
3. Service 트랜잭션 종료
4. Controller가 ResponseEntity 반환
5. Jackson이 DTO를 JSON으로 직렬화
6. 이 시점에 tags를 읽으려 함
7. 이미 영속성 컨텍스트가 닫혀 있어서 LazyInitializationException 발생
```

즉, DTO를 만들었다고 생각했지만 실제로는 엔티티의 lazy collection 참조를 DTO 안에 그대로 들고 있었던 것이다.

## 해결 방법

해결은 DTO 생성 시점에 tags를 복사하는 것이다.

```java
.tags(new LinkedHashSet<>(content.getTags()))
```

수정 후 Mapper는 다음처럼 바뀌었다.

```java
default ContentDto toDto(Content content, ContentStats stats) {
  ContentStats resolvedStats = stats == null ? ContentStats.empty() : stats;
  return ContentDto.builder()
      .id(content.getId())
      .type(content.getType())
      .title(content.getTitle())
      .description(content.getDescription())
      .thumbnailUrl(content.getThumbnailUrl())
      .tags(new LinkedHashSet<>(content.getTags()))
      .averageRating(resolvedStats.averageRating())
      .reviewCount(resolvedStats.reviewCount())
      .watcherCount(resolvedStats.watcherCount())
      .build();
}
```

이렇게 하면 트랜잭션 안에서 `content.getTags()`가 실제 컬렉션으로 초기화되고, DTO에는 엔티티 컬렉션 프록시가 아니라 복사된 값이 들어간다.

수정 후 실제 HTTP API 테스트는 모두 통과했다.

## 이번 작업에서 배운 점

이번 작업에서 가장 크게 느낀 점은 단위 테스트만으로는 부족할 수 있다는 것이다.

단위 테스트에서는 Service와 Mapper를 직접 호출하기 때문에 JSON 직렬화 시점의 문제가 잘 드러나지 않을 수 있다.

하지만 실제 API 요청은 다르다.

```text
HTTP 요청
→ Security Filter
→ Controller
→ Service
→ Repository
→ Mapper
→ Jackson JSON 직렬화
```

이 전체 흐름에서만 드러나는 문제가 있다.

이번 `LazyInitializationException`이 그 예시였다.

또 하나 배운 점은 DTO를 만들 때 엔티티의 lazy collection을 그대로 넘기면 안 된다는 것이다.

DTO는 엔티티와 분리된 응답 객체여야 한다.

특히 JPA lazy collection은 단순한 `Set`처럼 보여도 실제로는 프록시일 수 있다.

그래서 응답 DTO에 넣을 때는 필요한 시점에 값으로 복사하는 습관이 필요하다.

## 정리

이번 BE-82 작업에서는 콘텐츠 조회 API의 기본 흐름을 구현했다.

그리고 실제 HTTP 테스트를 통해 단위 테스트에서는 발견하지 못한 직렬화 문제까지 잡을 수 있었다.

현재 구현 기준은 다음과 같다.

- `averageRating`, `reviewCount`는 Content 저장 필드 사용
- `watcherCount`는 임시로 `0L` 반환
- `sortBy=rate`는 `Content.averageRating` 기준
- `sortBy=watcherCount`는 임시 정렬
- `tagsIn`은 태그명 OR 조건
- `keywordLike`는 title, description 검색
- DTO 생성 시 lazy collection은 방어 복사

후속 작업에서는 관리자 콘텐츠 등록, 수정, 삭제 API를 구현할 예정이다.

그 작업이 끝나면 직접 등록한 콘텐츠를 조회 API로 확인할 수 있기 때문에, 조회 API와 관리자 API를 함께 수동 테스트하기 더 쉬워질 것 같다.
