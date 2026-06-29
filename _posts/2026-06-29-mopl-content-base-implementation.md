---
layout: post
title: "[모두의 플리] Content 기반 모델 구현과 PR 피드백 반영 기록"
---

# [모두의 플리] Content 기반 모델 구현과 PR 피드백 반영 기록

## 배경

이전 글에서는 Content 도메인을 어떻게 설계할지 정리했다.

이번에는 그 설계를 바탕으로 실제 코드를 작성했다.

이번 작업의 상위 태스크는 Content 도메인의 기반 모델을 구성하는 일이었다.

하위 작업은 크게 네 가지였다.

- 콘텐츠 태그 값 컬렉션 제약 보강
- Content Repository 기본 조회 기반 구현
- 콘텐츠 썸네일 저장 인터페이스 및 검증 구현
- Content DTO와 Mapper 구현

아직 콘텐츠 생성, 수정, 삭제 API 전체를 완성한 것은 아니다.

이번 작업은 그 API들을 만들기 전에 필요한 도메인 기반을 먼저 준비하는 단계였다.

## 태그는 별도 Entity가 아니라 값 컬렉션으로 유지했다

콘텐츠에는 여러 개의 태그가 붙을 수 있다.

처음에는 태그를 별도 Entity로 만들 수도 있다고 생각했다.

예를 들면 다음과 같은 구조다.

```text
Content
ContentTag
```

하지만 현재 요구사항에서는 태그 자체를 독립적으로 관리하지 않는다.

태그를 따로 생성하거나 수정하는 관리자 화면도 없고, 태그마다 고유 ID가 필요한 기능도 없다.

그래서 태그는 Content에 종속된 단순 문자열 값으로 보는 것이 더 자연스럽다고 판단했다.

최종적으로는 `@ElementCollection`을 사용했다.

```java
@ElementCollection
@CollectionTable(
    name = "content_tags",
    joinColumns = @JoinColumn(name = "content_id")
)
@Column(name = "tag", nullable = false, length = 50)
private Set<String> tags = new LinkedHashSet<>();
```

이 방식은 태그를 별도 Entity로 만들지 않고도 `content_tags` 테이블을 만들 수 있다.

즉 DB에는 태그 테이블이 생기지만, Java 코드에서는 태그를 단순 문자열 컬렉션으로 다룰 수 있다.

이번 작업에서는 태그 값에 대한 검증도 추가했다.

```java
String normalizedTag = requireText(tag, "콘텐츠 태그는 빈 값일 수 없습니다.");
if (normalizedTag.length() > 50) {
  throw new IllegalArgumentException("콘텐츠 태그는 50자를 초과할 수 없습니다.");
}
```

정리하면 태그 정책은 다음과 같다.

- 태그는 Content에 종속된 값이다.
- 태그마다 별도 ID를 만들지 않는다.
- 공백만 있는 태그는 허용하지 않는다.
- 앞뒤 공백은 제거한다.
- 태그 길이는 50자 이하로 제한한다.

## Repository 기본 조회 기반 구현

Content 목록 조회는 단순히 전체 목록만 가져오면 되는 기능이 아니었다.

API 명세 기준으로 다음 조건들을 고려해야 했다.

- 콘텐츠 타입 필터
- 키워드 검색
- 태그 검색
- 커서 기반 페이지네이션
- 정렬

그래서 Spring Data JPA 기본 메서드만으로 처리하기보다 QueryDSL 기반 custom repository를 만들었다.

구조는 다음처럼 나누었다.

```text
ContentRepository
ContentRepositoryCustom
ContentRepositoryImpl
```

`ContentRepository`는 기본 JPA repository 역할을 하고, 복잡한 조회는 custom repository에서 담당한다.

```java
public interface ContentRepository
    extends JpaRepository<Content, UUID>, ContentRepositoryCustom {
}
```

조회 조건은 QueryDSL의 `BooleanExpression`으로 분리했다.

예를 들어 키워드 검색은 제목과 설명을 함께 검색하도록 했다.

```java
private BooleanExpression containsKeyword(String keywordLike) {
  if (keywordLike == null || keywordLike.isBlank()) {
    return null;
  }

  String keyword = keywordLike.trim();
  return content.title.containsIgnoreCase(keyword)
      .or(content.description.containsIgnoreCase(keyword));
}
```

태그 검색은 여러 태그 중 하나라도 포함되면 조회되도록 했다.

```java
private BooleanExpression containsAnyTag(Collection<String> tagsIn) {
  if (tagsIn == null || tagsIn.isEmpty()) {
    return null;
  }
  return content.tags.any().in(tagsIn);
}
```

현재 단계에서는 `createdAt` 정렬을 우선 구현했다.

API 명세에는 `rate`, `watcherCount` 정렬도 있지만, 이 값들은 Content 단독으로 계산할 수 있는 값이 아니다.

- `rate`: 리뷰/평점 데이터와 연결 필요
- `watcherCount`: 시청 세션 데이터와 연결 필요

따라서 이번 단계에서 억지로 구현하지 않고 후속 작업으로 남겼다.

## 커서 페이지네이션에서 limit보다 1개 더 조회한 이유

목록 조회에서는 다음 페이지가 있는지 알아야 한다.

이를 위해 요청받은 `limit`보다 1개 더 조회했다.

예를 들어 `limit`이 10이면 실제로는 11개를 조회한다.

```java
.limit(limit + 1)
```

조회 결과가 11개라면 다음 페이지가 있다는 뜻이다.

그 다음 응답에는 10개만 내려주고, 마지막 1개는 제거한다.

```java
boolean hasNext = contents.size() > limit;
if (hasNext) {
  contents.remove(limit);
}
```

처음에는 QueryDSL의 `limit()` 메서드가 `long`을 받는다는 점을 의식해서 `limit + 1L`로 작성했다.

하지만 현재 코드에서 `limit`은 `int`이고, 아래 로직도 `int` 기준으로 동작한다.

리뷰 피드백을 받아 타입 표현을 통일했다.

```java
// 수정 전
.limit(limit + 1L)

// 수정 후
.limit(limit + 1)
```

기능 차이는 없지만, 같은 흐름 안에서는 타입 표현을 통일하는 편이 더 읽기 좋다.

## 썸네일 저장은 인터페이스와 검증부터 만들었다

콘텐츠에는 썸네일 이미지가 필요하다.

하지만 실제 파일을 어디에 저장할지는 아직 후속 작업과 연결된다.

예를 들면 다음 선택지가 있을 수 있다.

- 로컬 디스크 저장
- S3 같은 외부 스토리지 저장
- 테스트용 in-memory 또는 mock 구현

그래서 이번 단계에서는 실제 저장 구현체를 바로 만들지 않고 인터페이스를 먼저 만들었다.

```java
public interface ContentThumbnailStorage {

  String upload(MultipartFile thumbnail);

  void delete(String thumbnailUrl);
}
```

그리고 검증 책임은 `ContentThumbnailService`에 두었다.

처음 검증은 단순히 `image/`로 시작하는 MIME 타입을 허용하는 방식이었다.

```java
contentType.startsWith("image/")
```

하지만 이 방식은 너무 포괄적이라는 리뷰를 받았다.

실제로 이 조건은 다음과 같은 타입도 모두 통과시킬 수 있다.

```text
image/gif
image/svg+xml
image/bmp
image/tiff
```

썸네일 용도로 모든 이미지 형식을 허용할 필요는 없다.

특히 SVG는 보안 이슈 가능성이 있고, GIF는 용량이나 애니메이션 처리 문제가 생길 수 있다.

그래서 허용할 이미지 형식을 명시적으로 제한했다.

```java
private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
    "image/jpeg",
    "image/png",
    "image/webp"
);
```

검증 로직은 다음처럼 바뀌었다.

```java
if (contentType == null
    || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase(Locale.ROOT))) {
  throw new IllegalArgumentException("지원하지 않는 콘텐츠 썸네일 이미지 형식입니다.");
}
```

## 파일 크기 제한도 추가했다

또 다른 리뷰 피드백은 파일 크기 제한이었다.

처음 코드에는 썸네일 파일의 크기를 제한하는 로직이 없었다.

이미지는 압축 방식에 따라 크기가 커질 수 있고, 큰 파일을 그대로 업로드하면 메모리 사용량이 커질 수 있다.

심하면 OOM 문제가 발생할 수도 있다.

그래서 썸네일 파일 크기를 5MB로 제한했다.

```java
private static final long MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024;
```

검증 로직은 다음과 같다.

```java
if (thumbnail.getSize() > MAX_THUMBNAIL_SIZE_BYTES) {
  throw new IllegalArgumentException("콘텐츠 썸네일 파일 크기는 5MB를 초과할 수 없습니다.");
}
```

5MB라는 값은 현재 썸네일 용도 기준으로 정한 초기 값이다.

나중에 서비스 정책이 바뀌면 상수 값만 조정하면 된다.

## DTO와 Mapper 분리

이번 작업에서는 Content 요청/응답 DTO도 추가했다.

요청 DTO는 크게 두 가지다.

```text
ContentCreateRequest
ContentUpdateRequest
```

생성 요청은 필수값이 많다.

콘텐츠를 새로 등록하려면 제목, 설명, 타입, 태그 등이 필요하기 때문이다.

반면 수정 요청은 모든 필드가 선택값이다.

PATCH 요청에서는 일부 필드만 수정할 수 있어야 하기 때문이다.

응답 DTO는 다음처럼 나누었다.

```text
ContentDto
ContentSummary
ContentStats
```

`ContentStats`는 리뷰 수, 평균 평점, 시청자 수처럼 다른 도메인과 연계될 수 있는 값을 담기 위한 객체다.

Entity를 DTO로 바꾸는 코드는 `ContentMapper`로 분리했다.

서비스 코드 안에서 직접 DTO를 조립할 수도 있지만, 단순 변환은 mapper로 분리하는 편이 낫다고 판단했다.

이렇게 하면 서비스는 비즈니스 흐름에 집중하고, 변환 로직은 mapper에서 관리할 수 있다.

다만 모든 경우에 mapper만 쓰는 것이 정답은 아니다.

여러 Entity를 조합하거나 계산값이 많아지는 응답이라면 builder 방식이 더 명확할 수도 있다.

이번 기준은 다음처럼 정리했다.

```text
단순 Entity -> DTO 변환: Mapper
여러 값 조합 또는 계산 중심 응답: Builder 고려
```

## dev 병합 중 충돌 해결

이번 작업 중 Git 충돌도 있었다.

원인은 BE-136이 `dev` 브랜치에 병합된 뒤, 내가 작업하던 브랜치에서도 같은 파일을 수정하고 있었기 때문이다.

충돌이 난 파일은 다음과 같았다.

```text
Content.java
ContentRepository.java
ContentRepositoryTest.java
```

이 충돌은 설계가 완전히 어긋나서 생긴 문제라기보다, 같은 기반 파일을 후속 태스크에서 이어서 수정했기 때문에 발생한 정상적인 충돌이었다.

해결 기준은 명확하게 잡았다.

```text
dev의 BE-136 내용을 기준으로 둔다.
그 위에 BE-137~BE-140 변경점만 다시 반영한다.
기능과 무관한 테스트 문구 차이는 dev 기준을 유지한다.
```

이 기준을 세워두니 충돌 해결 방향이 훨씬 명확해졌다.

무조건 내 브랜치 파일을 선택하거나, 무조건 dev 파일을 선택하면 안 된다.

각 변경이 어느 태스크에서 온 것인지 확인하고 필요한 변경만 남겨야 한다.

## 검증 상태

Repository 테스트 코드는 추가했지만, 전체 컴파일 검증은 완료하지 못했다.

`compileJava`를 실행했을 때 Content 작업과 직접 관련 없는 다른 파일에서 컴파일 오류가 발생했다.

오류 위치는 전역 예외 코드 쪽이었다.

```text
global/exception/ErrorCode.java
```

따라서 이번 작업 기록에서는 전체 빌드가 통과했다고 쓰면 안 된다.

현재 상태는 다음처럼 정리하는 것이 정확하다.

```text
Content 작업 범위의 코드와 테스트는 작성했다.
전체 컴파일은 외부 컴파일 이슈로 보류되었다.
해당 이슈가 해결되면 전체 테스트를 다시 실행해야 한다.
```

## 이번 작업에서 배운 점

이번 작업에서 가장 크게 느낀 점은 도메인 기반 작업일수록 범위를 명확히 해야 한다는 것이다.

Content 도메인은 Review, WatchingSession, Playlist, Batch와 연결된다.

그래서 당장 구현할 수 있다고 해서 모든 것을 Content 안에서 처리하면 안 된다.

예를 들어 `rate`, `watcherCount` 정렬은 API 명세에는 있지만, Content 단독 책임으로 구현하기 어렵다.

이런 기능은 후속 도메인 연계가 준비된 뒤 구현하는 것이 더 안전하다.

또한 리뷰 피드백을 통해 검증 로직의 기준도 더 명확해졌다.

처음에는 “이미지 파일이면 된다”라고 생각했지만, 실제 서비스에서는 허용할 이미지 형식과 파일 크기를 정해야 한다.

작은 검증 로직처럼 보여도 보안, 성능, 운영 안정성과 연결될 수 있다.

## 후속 작업

이번 작업은 Content 도메인의 기반 모델을 만드는 단계였다.

이후에는 이 기반 위에서 실제 API와 외부 연계를 구현해야 한다.

후속 작업은 다음과 같다.

- 콘텐츠 생성 API 구현
- 콘텐츠 수정 API 구현
- 콘텐츠 삭제 정책 적용
- 썸네일 실제 저장 adapter 구현
- 리뷰/시청 세션 집계값 연계
- `rate`, `watcherCount` 정렬 확장
- 외부 API 수집 배치와 Content 저장 정책 연결

이번 작업을 통해 Content 도메인의 뼈대는 어느 정도 준비되었다.

다음 단계부터는 이 기반을 실제 API 흐름과 연결하는 작업이 중요해질 것 같다.
