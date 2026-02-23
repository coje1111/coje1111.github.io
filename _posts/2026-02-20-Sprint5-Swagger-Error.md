---
layout: post
title: "Sprint5 - Swagger 오류 해결 및 적용"
---
# 2026-02-20

## 오늘 한 것

1. Sprint5에서 Swagger(OpenAPI) 적용 진행
2. build.gradle에 springdoc 의존성 추가
3. 서버 실행 후 Swagger UI 접속 시 오류 발생
4. `/v3/api-docs` 500 에러 및 애플리케이션 시작 실패 확인
5. 오류 원인 분석 및 해결 시도
    - application.yml 설정 추가
    - PathMatch 전략 변경 시도
    - YAML 루트 위치 및 들여쓰기 점검
6. 최종적으로 springdoc 버전 다운그레이드 후 정상 동작 확인

---

## 막힌 점

### 1️⃣ 초기 증상

Swagger UI 접속 시:

- Failed to load API definition
- `/v3/api-docs` 500 오류

이후 서버 재실행 시 애플리케이션 자체가 시작되지 않음.

에러 메시지:

Invalid mapping pattern detected:
/swagger-ui/**/swagger-initializer.js
No more pattern data allowed after {...} or ** pattern element

---

### 2️⃣ 1차 원인 추정

Spring Boot 3.4.x는 기본적으로 PathPatternParser를 사용한다.  
springdoc이 등록하는 Swagger UI 경로 패턴과 충돌 발생.

해결 시도로 application.yml에 아래 설정 추가:

spring:
mvc:
pathmatch:
matching-strategy: ant_path_matcher

그러나 오류 지속.

---

### 3️⃣ 2차 점검

- YAML 들여쓰기 구조 확인
- springdoc 설정 루트 위치 확인
- 하이픈/언더스코어 값 변경 시도

그러나 동일 오류 발생.

---

### 4️⃣ 최종 원인

Spring Boot 3.4.x +  
springdoc-openapi-starter-webmvc-ui 2.8.15

조합에서 경로 매핑 충돌 이슈 발생.

Swagger 내부 경로:

/swagger-ui/**/swagger-initializer.js

이 패턴이 Spring의 PathPatternParser와 충돌하여
ApplicationContext 초기화 실패.

---

## 해결 방법

### springdoc 버전 다운그레이드

build.gradle 수정:

implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.14'
* 최종적으론 강사님이 알려주신 버전 2.8.4로 적용함

의존성 새로 받고 재실행:

./gradlew --refresh-dependencies clean bootRun

---

## 결과

- 애플리케이션 정상 실행
- `/v3/api-docs` 정상 JSON 출력
- `http://localhost:8080/swagger-ui/index.html` 정상 동작
- OpenAPI 3.1 문서 자동 생성 확인
- 모든 Controller 엔드포인트 정상 표시

---

## 정리

이번 오류는 단순 설정 문제가 아니라  
Spring Boot 3.4.x와 특정 springdoc 버전 간의 호환성 문제였다.

핵심 교훈:

1. 에러 메시지의 패턴 매핑 충돌 내용을 정확히 읽을 것
2. YAML 설정 적용 여부를 구조와 들여쓰기로 확인할 것
3. 프레임워크 충돌 의심 시 버전 호환성을 점검할 것
4. 최신 버전이 항상 안정적인 것은 아니다

---

## 코드 구조

### build.gradle (최종)

implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.4'

### application.yml (최종)

spring:
application:
name: discodeit
mvc:
pathmatch:
matching-strategy: ant_path_matcher

discodeit:
repository:
type: file
file-directory: discodeit

springdoc:
override-with-generic-response: false

---

✔ Sprint5 Swagger 적용 완료  
✔ 파일 동시 접근 Lock 적용 완료  
✔ 서버 실행 및 문서 자동화 성공