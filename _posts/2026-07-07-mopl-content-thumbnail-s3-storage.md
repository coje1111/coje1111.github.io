---
layout: post
title: "[모두의 플리] 콘텐츠 썸네일을 S3 저장소로 분리하기"
date: 2026-07-07 11:55:00 +0900
---

# [모두의 플리] 콘텐츠 썸네일을 S3 저장소로 분리하기

## 배경

모두의 플리 프로젝트에서 관리자 콘텐츠 관리 API를 구현하면서 썸네일 파일을 함께 다루게 됐다.

초기에는 로컬 파일 시스템에 썸네일을 저장했다.

로컬 저장 방식은 개발 중에는 단순하고 빠르다.

하지만 실제 서버 환경에서는 문제가 생길 수 있다.

예를 들어 서버가 여러 대로 늘어나면, A 서버에 저장된 파일을 B 서버에서는 바로 읽을 수 없다.

또 서버가 재배포되거나 파일 시스템이 초기화되면 업로드된 썸네일이 사라질 수도 있다.

그래서 콘텐츠 썸네일 저장소를 S3로 전환할 수 있는 구조가 필요했다.

이번 작업의 목표는 기존 로컬 저장 방식을 바로 제거하는 것이 아니었다.

기본값은 로컬 저장소로 유지하되, 환경변수 설정을 통해 콘텐츠 썸네일만 S3 저장소를 사용할 수 있게 만드는 것이었다.

## 작업 범위

이번 작업의 범위는 콘텐츠 썸네일 저장소 연동이다.

구체적으로는 다음 내용을 구현했다.

```text
ContentThumbnailStorage 구현체 분리
LocalContentThumbnailStorage 조건부 활성화
S3ContentThumbnailStorage 추가
S3Service prefix 기반 업로드 지원
S3 object 삭제 지원
S3 저장소 설정값 추가
S3 저장소 단위 테스트 추가
```

반대로 이번 작업에서 하지 않은 것도 있다.

```text
User/Profile 이미지 저장 방식 변경
CloudFront 연동
S3 버킷 접근 정책 설계
실제 AWS 환경 수동 업로드 테스트
```

User/Profile 이미지는 다른 파트의 작업 범위이므로 수정하지 않았다.

이번에는 Content 도메인의 썸네일 저장소만 S3로 바꿀 수 있게 만드는 데 집중했다.

## 저장소 인터페이스를 유지한 이유

기존 콘텐츠 썸네일 저장 로직은 `ContentThumbnailStorage` 인터페이스를 사용하고 있었다.

이 구조는 로컬 저장소를 S3 저장소로 바꿀 때 유리하다.

서비스 계층은 구체적으로 파일을 어디에 저장하는지 알 필요가 없다.

서비스는 다음 정도만 알면 된다.

```text
thumbnail을 저장한다.
thumbnail URL을 받는다.
더 이상 쓰지 않는 thumbnail을 삭제한다.
```

실제 저장 위치가 로컬인지 S3인지는 구현체가 담당한다.

그래서 이번 작업에서는 기존 인터페이스를 그대로 유지하고, S3 구현체만 추가했다.

```text
ContentThumbnailStorage
  ├─ LocalContentThumbnailStorage
  └─ S3ContentThumbnailStorage
```

이렇게 두면 나중에 저장소가 바뀌어도 `ContentService`나 `ContentThumbnailService`를 크게 수정하지 않아도 된다.

## 환경변수로 저장소를 선택하게 한 이유

로컬 개발 환경에서는 S3를 항상 사용할 수 없다.

AWS key나 bucket 설정이 없을 수도 있고, 단순히 API 로직만 테스트하고 싶을 수도 있다.

그래서 기본 저장소는 로컬로 유지했다.

```yaml
mopl:
  content:
    thumbnail:
      storage-type: ${CONTENT_THUMBNAIL_STORAGE_TYPE:local}
      s3:
        key-prefix: ${CONTENT_THUMBNAIL_S3_KEY_PREFIX:uploads/contents/thumbnails}
```

기본값은 다음과 같다.

```text
CONTENT_THUMBNAIL_STORAGE_TYPE=local
```

S3를 사용하려면 다음처럼 설정하면 된다.

```text
CONTENT_THUMBNAIL_STORAGE_TYPE=s3
```

이 방식의 장점은 코드 수정 없이 환경마다 저장소를 바꿀 수 있다는 점이다.

개발 환경에서는 로컬 저장소를 쓰고, 배포 환경에서는 S3 저장소를 쓰는 식으로 분리할 수 있다.

## ConditionalOnProperty로 구현체를 분리하기

Spring에서는 설정값에 따라 특정 Bean을 등록하거나 등록하지 않을 수 있다.

이번 작업에서는 `@ConditionalOnProperty`를 사용했다.

로컬 저장소는 다음 조건에서 활성화된다.

```text
mopl.content.thumbnail.storage-type=local
```

그리고 설정값이 아예 없어도 로컬 저장소가 기본으로 활성화되도록 했다.

S3 저장소는 다음 조건에서만 활성화된다.

```text
mopl.content.thumbnail.storage-type=s3
```

이렇게 하지 않으면 로컬 저장소와 S3 저장소가 동시에 Bean으로 등록되어 `ContentThumbnailStorage` 주입 시 충돌이 날 수 있다.

저장소 구현체뿐 아니라 로컬 정적 리소스 매핑도 같은 기준으로 분리했다.

S3 저장소를 쓰는 상황에서는 로컬 디렉터리를 정적 리소스로 노출할 필요가 없기 때문이다.

## S3 key prefix를 둔 이유

S3에 파일을 저장할 때는 실제 폴더가 있는 것은 아니지만, key에 `/`를 넣어서 폴더처럼 관리할 수 있다.

예를 들면 다음과 같다.

```text
uploads/contents/thumbnails/{uuid}.png
```

이렇게 prefix를 두면 S3 콘솔에서 파일을 확인할 때도 용도를 구분하기 쉽다.

이번 작업에서는 기본 prefix를 다음처럼 정했다.

```text
uploads/contents/thumbnails
```

나중에 다른 도메인에서도 S3를 사용한다면 다음처럼 분리할 수 있다.

```text
uploads/users/profile-images
uploads/contents/thumbnails
```

즉, prefix는 단순히 보기 좋게 만드는 것뿐 아니라 파일 관리 기준을 명확히 하기 위한 값이다.

## S3Service를 확장한 이유

기존 프로젝트에는 이미 `S3Service`가 있었다.

그래서 콘텐츠 전용으로 완전히 별도 S3 클라이언트를 새로 만들기보다는, 기존 `S3Service`를 확장하는 쪽으로 작업했다.

이번에 보완한 내용은 다음과 같다.

```text
prefix를 받아 object key 생성
원본 확장자를 유지하되 UUID 기반 파일명 생성
contentType, contentLength metadata 설정
업로드 후 public URL 반환
URL에서 object key를 추출해 삭제
region 설정값 기반 public URL 생성
```

처음 기존 코드에는 S3 URL을 만들 때 리전이 하드코딩되어 있었다.

하지만 이미 설정 파일에는 `spring.cloud.aws.region.static` 값이 있었다.

그래서 S3 public URL을 만들 때도 이 설정값을 사용하도록 보완했다.

이렇게 해야 나중에 리전이 바뀌어도 코드 수정 없이 설정만 바꾸면 된다.

## 삭제 기능이 필요한 이유

콘텐츠 썸네일은 등록만 하는 것이 아니라 수정과 삭제에서도 정리되어야 한다.

예를 들어 관리자가 콘텐츠 썸네일을 교체하면, 더 이상 사용하지 않는 기존 썸네일은 삭제되어야 한다.

콘텐츠 자체를 삭제할 때도 연결된 썸네일을 정리해야 한다.

기존 로컬 저장소에는 삭제 기능이 있었기 때문에, S3 저장소도 같은 인터페이스에 맞춰 삭제 기능을 구현했다.

S3에서는 파일 경로 대신 object key를 기준으로 삭제한다.

그래서 저장된 URL에서 bucket과 region을 확인한 뒤, 해당 URL이 현재 bucket의 object라면 key를 추출해 삭제하도록 했다.

다른 bucket의 URL이 들어오면 삭제하지 않고 무시한다.

이렇게 해야 잘못된 URL로 엉뚱한 S3 object를 삭제하는 일을 줄일 수 있다.

## 테스트한 내용

이번 작업에서는 S3 실제 호출을 하지 않고, `S3Template`을 mock으로 두고 단위 테스트를 작성했다.

검증한 내용은 다음과 같다.

```text
S3Service가 prefix 하위에 object key를 생성하는지
확장자를 소문자로 유지하는지
업로드 후 public URL을 반환하는지
삭제 URL에서 object key를 추출하는지
다른 bucket URL은 삭제하지 않는지
S3ContentThumbnailStorage가 S3Service에 prefix를 전달하는지
업로드 실패 시 IllegalStateException으로 감싸는지
빈 URL 삭제 요청은 무시하는지
```

추가로 기존 관리자 콘텐츠 통합 테스트도 다시 실행했다.

그 이유는 기본 저장소가 로컬로 유지되어야 하기 때문이다.

S3 저장소를 추가하면서 기존 관리자 콘텐츠 등록, 수정, 삭제 흐름이 깨지면 안 된다.

실행한 검증은 다음과 같다.

```text
./gradlew.bat compileJava
./gradlew.bat test --tests io.mopl.infra.s3.S3ServiceTest --tests io.mopl.domain.content.storage.S3ContentThumbnailStorageTest
./gradlew.bat test --tests io.mopl.domain.content.controller.ContentAdminControllerIntegrationTest
```

모두 통과했다.

관리자 콘텐츠 통합 테스트는 기존과 동일하게 JWT와 S3 bucket 관련 테스트 환경변수를 주입한 상태에서 실행했다.

## 실제 환경에서 확인해야 할 부분

이번 작업은 코드 레벨의 S3 저장소 연동이다.

하지만 실제 AWS 환경에서 이미지가 정상적으로 보이려면 추가로 확인할 것이 있다.

```text
AWS_ACCESS_KEY
AWS_SECRET_KEY
CLOUD_AWS_REGION_STATIC
CLOUD_AWS_S3_BUCKET
CONTENT_THUMBNAIL_STORAGE_TYPE=s3
CONTENT_THUMBNAIL_S3_KEY_PREFIX
```

그리고 S3 URL로 이미지를 바로 보여주려면 bucket 또는 object 접근 정책도 맞아야 한다.

만약 public bucket을 쓰지 않는다면 CloudFront나 presigned URL 같은 다른 방식이 필요할 수 있다.

이번 작업에서는 기존 `S3Service`가 public URL을 반환하던 정책을 유지했다.

따라서 실제 배포 환경에서는 이 URL이 브라우저에서 접근 가능한지 별도로 확인해야 한다.

## 이번 작업에서 배운 점

이번 작업은 단순히 “S3에 파일을 올린다”로 끝나는 작업이 아니었다.

실제로는 저장소를 바꿔도 서비스 로직이 흔들리지 않게 구조를 나누는 작업에 가까웠다.

특히 다음 부분을 배웠다.

- 파일 저장소는 인터페이스로 분리해두면 교체가 쉽다.
- 로컬 개발 환경과 배포 환경은 같은 저장소를 쓰지 않을 수 있다.
- 설정값으로 구현체를 선택하면 환경별 전환이 쉬워진다.
- S3 key prefix는 파일을 관리하기 위한 중요한 기준이다.
- 실제 업로드 테스트와 단위 테스트는 역할이 다르다.
- S3 URL이 생성된다고 해서 브라우저 접근까지 보장되는 것은 아니다.

## 정리

이번 작업으로 콘텐츠 썸네일은 기존 로컬 저장소를 유지하면서도 S3 저장소로 전환할 수 있게 됐다.

서비스 계층은 여전히 `ContentThumbnailStorage`만 바라본다.

저장 위치는 설정값과 구현체가 결정한다.

이 구조 덕분에 로컬 개발 환경은 그대로 유지하면서, 배포 환경에서는 S3를 사용할 수 있는 기반이 생겼다.

다음에 실제 서버 환경에서 테스트할 때는 S3 credentials, bucket, 접근 정책, 이미지 URL 접근 가능 여부까지 함께 확인해야 한다.
