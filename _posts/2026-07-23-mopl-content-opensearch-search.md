---
layout: post
title: "[모두의 플리] OpenSearch로 콘텐츠 검색과 색인 동기화 설계하기"
date: 2026-07-23 09:00:00 +0900
---

# [모두의 플리] OpenSearch로 콘텐츠 검색과 색인 동기화 설계하기

## 왜 DB 검색만으로 끝내지 않았을까

콘텐츠 검색은 제목과 설명의 일부 문자열을 대상으로 한다.

PostgreSQL의 trigram 인덱스로 10만 건 조회 성능을 개선했지만, 검색 기능이 커질수록 전문 검색과 정렬, 커서 페이지네이션을 DB가 모두 담당하게 된다.

이번 작업에서는 DB를 유일한 원본으로 유지하면서 검색 책임만 OpenSearch로 분리했다.

```text
검색·필터·정렬
  -> OpenSearch에서 Content ID 목록 조회

실제 응답 데이터
  -> Redis Cache-Aside 또는 DB에서 조회

OpenSearch 장애
  -> 기존 DB 검색으로 fallback
```

OpenSearch 문서를 API 응답으로 바로 반환하지 않은 이유는 데이터 정합성 때문이다. 검색 색인은 DB의 복사본이므로, 최종 콘텐츠 정보는 기존 조회 경로에서 조립해야 한다.

## 콘텐츠 전용 검색 문서

검색에 필요한 값만 `ContentDocument`에 저장했다.

```text
id
title
description
type
tags
createdAt
averageRating
```

제목과 설명에는 2~20글자 ngram 분석기를 적용했다. 예를 들어 `인터스텔라`를 색인하면 일부 문자열로도 검색할 수 있는 토큰이 만들어진다.

`type`과 `tags`는 정확히 일치하는 필터에 사용하므로 `keyword` 타입으로 저장했다.

## 검색 결과는 ID 순서만 사용하기

OpenSearch는 다음 작업을 담당한다.

- 제목 또는 설명 키워드 검색
- 콘텐츠 타입 필터
- 여러 태그의 OR 조건 필터
- 최신순·평점순 정렬
- `search_after` 기반 커서 페이지네이션

검색 결과에서는 정렬된 Content ID 목록만 가져온다.

```text
OpenSearch
  -> [contentId3, contentId1, contentId7]

Redis/DB 벌크 조회
  -> 각 Content의 최신 데이터 확보

최초 ID 순서로 재조립
  -> ContentDto 목록 반환
```

DB 벌크 조회 결과의 순서는 보장되지 않기 때문에, 마지막에는 OpenSearch가 반환한 ID 순서대로 DTO를 다시 정렬해야 한다.

`watcherCount`는 실시간으로 계속 바뀌며 OpenSearch 문서에 동기화하지 않는다. 따라서 시청자 수 정렬은 기존 DB 조회를 사용한다.

## 모든 검색 요청을 OpenSearch로 보내지 않기

다음 조건에서는 기존 DB 검색을 사용한다.

- 검색어가 없거나 공백인 경우
- 검색어가 1글자인 경우
- 검색어가 20글자를 초과하는 경우
- `watcherCount` 정렬
- OpenSearch에서 처리할 수 없는 커서 조합
- OpenSearch 요청 중 예외가 발생한 경우

OpenSearch는 조회 성능을 높이는 보조 시스템이다. 검색 서버 장애가 전체 콘텐츠 API 장애로 번지지 않도록 fallback 경로를 유지했다.

## 콘텐츠 변경과 색인 동기화

조회 시점마다 DB와 OpenSearch를 비교하면 검색 서버를 사용하는 의미가 줄어든다. 대신 데이터가 변경되는 시점에 색인을 갱신한다.

```text
관리자 콘텐츠 생성·수정
  -> DB COMMIT
  -> Content 색인 생성·갱신

콘텐츠 삭제
  -> DB COMMIT
  -> Content 색인 삭제

외부 콘텐츠 수집
  -> 청크 DB COMMIT
  -> 신규 Content ID 일괄 색인

리뷰 통계 변경
  -> averageRating·reviewCount 갱신 COMMIT
  -> 평점 색인 갱신
```

외부 수집에서는 매 건 OpenSearch를 호출하지 않고, 청크에서 생성된 ID를 모아 `saveAll`로 처리한다.

색인 저장이나 삭제가 실패하면 WARN 로그를 남긴다. DB 작업은 이미 성공한 상태이므로 API와 배치 결과를 되돌리지 않고, 검색은 DB fallback으로 유지한다.

## 애플리케이션 초기화와 동기화 스크립트 분리

처음에는 애플리케이션 시작 시 DB의 모든 콘텐츠를 OpenSearch로 옮기는 초기화 코드를 두었다.

하지만 ECS Task가 여러 개라면 새 Task가 시작될 때마다 동일한 전체 동기화가 실행될 수 있다. 애플리케이션 시작과 대량 색인 작업이 강하게 결합되는 문제도 있다.

그래서 애플리케이션에서는 초기 전체 동기화 코드를 제거하고, 별도 AWS Lambda 스크립트가 DB 데이터를 OpenSearch로 옮기도록 책임을 분리했다.

```text
애플리케이션
  -> 신규·수정·삭제 데이터의 증분 색인

Lambda 동기화 스크립트
  -> 배포 또는 운영 시점의 기존 DB 데이터 전체 색인
```

콘텐츠 동기화 Lambda가 실제로 실행되어 10건을 처리한 로그도 확인했다.

다만 저장소에는 스크립트 실행 명령, 의존성 패키징, 배포 방법이 아직 문서화되어 있지 않았다. 스크립트도 Bulk API 응답의 개별 실패를 검사하고, 삭제 콘텐츠를 제외하며, ngram 인덱스 설정이 존재하는지 확인하도록 보완할 필요가 있다.

## 운영에서 발견한 403 오류

운영 ECS 로그에서는 Spring 애플리케이션이 OpenSearch의 `users` 인덱스를 확인하는 과정에서 `403 Forbidden`을 받고 시작에 실패했다.

확인한 인증 방식은 서로 달랐다.

```text
Lambda
  -> IAM Role + SigV4 인증

Spring 애플리케이션
  -> Secret의 username/password를 사용한 Basic 인증
```

Lambda는 OpenSearch에 접근했지만 Spring 애플리케이션 사용자는 인덱스 접근 권한이 없었다. 동기화 스크립트가 없는 문제가 아니라 OpenSearch 도메인 정책과 Fine-Grained Access Control 역할 매핑 문제였다.

또한 조회 코드에 DB fallback이 있어도 Repository Bean 생성 단계에서 예외가 발생하면 애플리케이션 자체가 시작되지 않는다. 런타임 fallback과 시작 단계의 장애 격리는 별도로 설계해야 한다는 점도 확인했다.

현재 남은 운영 조치는 다음과 같다.

- ECS 애플리케이션 인증 사용자의 `users`, `contents` 권한 확인
- Basic 인증을 유지할지 ECS Task Role 기반 SigV4로 통일할지 결정
- `contents` 인덱스의 ngram 설정과 매핑 확인
- Lambda Bulk 응답의 개별 실패 검증
- 동기화 스크립트 실행·배포 방법 문서화
- OpenSearch가 비정상이어도 애플리케이션 시작을 유지하는 방법 검토

## 테스트한 범위

- 한글 제목·설명 부분 검색
- 타입과 태그 필터
- 최신순·평점순 정렬
- `search_after` 커서 페이지네이션
- OpenSearch 결과 ID 순서를 유지한 DTO 조립
- 등록·수정·삭제 후 색인 동기화
- 외부 콘텐츠 청크 저장 후 일괄 색인
- 리뷰 통계 변경 후 평점 색인 갱신
- OpenSearch 예외 시 DB fallback

## 배운 점

OpenSearch를 추가하는 작업은 Repository 하나를 만드는 것으로 끝나지 않았다.

DB와 검색 색인의 역할을 분리하고, 변경 데이터의 동기화 시점과 장애 시 fallback을 함께 설계해야 한다. 운영에서는 네트워크 연결뿐 아니라 IAM, Basic 인증, 역할 매핑처럼 “누가 어떤 인덱스에 접근하는가”까지 맞아야 한다.

특히 개발 환경에서 검색이 성공하더라도 운영 인증 방식이 다르면 애플리케이션 시작 단계부터 실패할 수 있다. 기능 테스트와 함께 실제 배포 환경의 권한과 초기 색인 절차를 검증해야 한다는 점을 배웠다.
