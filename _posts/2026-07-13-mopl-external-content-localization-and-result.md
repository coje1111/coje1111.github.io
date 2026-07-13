---
layout: post
title: "[모두의 플리] 한글 콘텐츠 수집 정책과 처리 결과 분류하기"
date: 2026-07-13 09:00:00 +0900
---

# [모두의 플리] 한글 콘텐츠 수집 정책과 처리 결과 분류하기

## 배경

외부 API 연동과 Spring Batch 실행 구조를 만든 뒤 실제 화면을 확인하니 영화와 TV 시리즈의 제목과 설명이 대부분 영어로 표시됐다.

외부 API에서 데이터를 정상적으로 받아오는 것과 사용자가 읽기 좋은 데이터를 제공하는 것은 다른 문제였다.

또 수집 로그에는 전체 수와 저장 수만 있어 다음 상황을 구분하기 어려웠다.

```text
API에서 몇 개를 받았는가?
한글 정책 때문에 몇 개를 제외했는가?
매핑에 실패한 데이터는 몇 개인가?
실제로 새로 저장된 데이터는 몇 개인가?
이미 존재해서 건너뛴 데이터는 몇 개인가?
```

그래서 TMDB 요청 언어를 한글로 설정하고, 수집 과정의 결과를 단계별로 분류하기로 했다.

## TMDB 요청에 한글 설정 추가

TMDB 영화와 TV 시리즈 요청에 `language=ko-KR`을 사용하도록 했다.

영화 요청에는 한국 지역 기준을 적용하기 위해 `region=KR`도 함께 전달한다.

설정값은 코드에 고정하지 않고 환경변수로 변경할 수 있게 했다.

```yaml
mopl:
  external:
    tmdb:
      language: ${TMDB_LANGUAGE:ko-KR}
      region: ${TMDB_REGION:KR}
      korean-only: ${TMDB_KOREAN_ONLY:true}
```

기본값은 한글 수집에 맞추되, 테스트나 다른 환경에서는 설정만 바꿀 수 있다.

## language 설정만으로 충분하지 않았던 이유

`language=ko-KR`을 전달한다고 모든 콘텐츠가 한글로 번역되어 오는 것은 아니다.

TMDB에 한글 번역 데이터가 없는 콘텐츠는 제목이나 설명이 영어이거나 비어 있을 수 있다.

따라서 요청 언어 설정과 별도로 실제 응답에 한글이 포함됐는지 확인해야 했다.

현재 정책은 제목이나 설명 중 하나에 한글이 포함되어 있으면 수집 후보로 인정한다.

```java
return containsHangul(candidate.title())
    || containsHangul(candidate.description());
```

한글이 하나도 없는 콘텐츠는 오류가 아니라 정책에 따른 제외이므로 `filteredCount`에 포함한다.

## 번역과 필터링은 다르다

이번 구현은 영어 콘텐츠를 직접 한글로 번역하는 기능이 아니다.

```text
TMDB에 한글 데이터가 있음
  -> 한글 제목과 설명을 받아서 저장

TMDB에 한글 데이터가 없음
  -> korean-only 정책에 따라 제외
```

TheSportsDB 스포츠 데이터도 자동으로 번역하지 않는다. 원본 API가 영어 데이터만 제공하면 현재는 영어로 저장될 수 있다.

자동 번역을 하려면 별도의 번역 API, 번역 실패 정책, 비용과 호출 제한까지 추가로 설계해야 하기 때문이다.

## 수집 결과 모델을 따로 둔 이유

처음에는 외부 API 클라이언트가 변환된 콘텐츠 후보 목록만 반환했다.

하지만 목록만 반환하면 원본 응답 수와 필터링·매핑 실패 수를 알 수 없다.

그래서 외부 API 응답을 내부 후보로 바꾸는 단계의 결과를 `ExternalContentFetchResult`로 표현했다.

```text
fetchedCount   : 외부 API에서 받은 원본 항목 수
acceptedCount  : 매핑과 수집 정책을 통과한 후보 수
filteredCount  : 한글 정책 등으로 정상 제외한 수
failedCount    : 개별 항목 매핑에 실패한 수
```

이 결과는 다음 관계를 만족해야 한다.

```text
fetchedCount = acceptedCount + filteredCount + mappingFailedCount
```

건수의 합이 맞지 않으면 결과 객체를 만들 때 예외를 발생시킨다.

이렇게 하면 수집 코드가 변경되어도 누락된 항목이 조용히 사라지는 일을 줄일 수 있다.

## DB 동기화 결과도 구분하기

수집 후보가 만들어진 뒤에는 DB 동기화 결과까지 구분해야 한다.

최종 `ExternalContentSyncResult`에는 다음 값을 담는다.

```text
fetchedCount
acceptedCount
filteredCount
createdCount
skippedCount
failedCount
syncedAt
```

`createdCount`는 새로 저장한 콘텐츠 수다.

`skippedCount`는 같은 식별키의 콘텐츠가 이미 존재하거나, 한 번의 응답 안에서 같은 후보가 중복된 경우를 포함한다.

`failedCount`는 외부 응답 매핑 실패와 DB 저장 전 후보 검증 실패를 합친 값이다.

## 로그에서 알 수 있게 된 것

클라이언트별 수집 로그에는 다음 값을 남긴다.

```text
Content external fetch completed.
client=...
fetchedCount=...
acceptedCount=...
filteredCount=...
failedCount=...
```

전체 동기화가 끝나면 DB 처리 결과까지 함께 남긴다.

```text
Content external sync completed.
fetchedCount=...
acceptedCount=...
filteredCount=...
createdCount=...
skippedCount=...
failedCount=...
syncedAt=...
```

이제 `20개를 받았는데 왜 12개만 저장됐는가?` 같은 질문을 로그의 단계별 건수로 확인할 수 있다.

## 테스트한 내용

다음 상황을 단위 테스트로 확인했다.

- TMDB 요청에 한글 언어와 지역 설정이 들어간다.
- 제목 또는 설명에 한글이 있으면 후보로 유지한다.
- 한글이 전혀 없으면 필터링 수가 증가한다.
- `korean-only=false`이면 언어와 관계없이 후보로 유지한다.
- 개별 항목 매핑 실패가 전체 응답을 실패시키지 않는다.
- 여러 페이지와 영화·TV 결과의 건수가 올바르게 합산된다.
- 결과 건수의 합이 맞지 않으면 잘못된 결과 생성을 차단한다.

## 배운 점

외부 API의 성공 응답이 곧 서비스에 적합한 데이터라는 뜻은 아니다.

요청 언어, 실제 응답 언어, 서비스 수집 정책을 따로 생각해야 한다.

또 단순히 `성공 또는 실패`만 기록하면 중간 단계에서 데이터가 왜 줄었는지 알기 어렵다.

```text
원본 수집
  -> 매핑
    -> 정책 필터링
      -> 후보 검증
        -> DB 생성 또는 스킵
```

각 단계의 결과를 구분하니 화면 문제와 수집 문제를 더 빠르게 추적할 수 있게 됐다.

## 정리

이번 작업에서는 TMDB 한글 요청 설정과 한글 콘텐츠 필터링을 추가했다.

그리고 외부 API 수집 결과를 원본·허용·필터링·생성·스킵·실패로 나눠 기록했다.

이 구조는 이후 로그뿐 아니라 Actuator 메트릭으로 처리 결과를 노출하는 기반이 됐다.
