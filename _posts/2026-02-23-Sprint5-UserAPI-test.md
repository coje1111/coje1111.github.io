---
layout: post
title: "Sprint5 User API test"
---

# 2026-02-23

## 오늘 한 것
- Swagger UI를 통해 User API 전체 테스트 진행
- POST /api/users 사용자 생성 성공 (201 Created 확인)
- GET /api/users 전체 조회 성공 (배열 응답 확인)
- PATCH /api/users/{userId} 사용자 정보 수정 성공
- multipart/form-data 기반 요청 구조 디버깅
- 500 오류(Content-Type 'application/octet-stream' is not supported) 해결
- @RequestPart DTO 직접 바인딩 방식에서 String → ObjectMapper 변환 방식으로 수정

## 막힌 점
- Swagger에서 multipart 요청 시 JSON part가 application/json이 아닌 octet-stream으로 처리됨
- @RequestPart UserCreateRequest로 직접 받는 구조에서 HttpMessageConverter 변환 실패 발생
- UserApi와 UserController 메서드 시그니처 불일치로 컴파일 오류 발생
- UUID(PathVariable)에 임의 문자열 입력 시 "Value must be a Guid" 검증 오류 발생

## 정리
- multipart/form-data에서 JSON part는 항상 안전하게 DTO로 변환되지 않는다.
- Swagger는 JSON part를 내부적으로 octet-stream으로 처리할 수 있다.
- 이 경우 @RequestPart로 DTO를 직접 받으면 500 오류가 발생할 수 있다.
- 해결 방법은 JSON을 String으로 받고 ObjectMapper로 직접 파싱하는 것이다.
- 인터페이스(UserApi)와 구현체(UserController)의 메서드 시그니처는 반드시 정확히 일치해야 한다.
- PATCH 테스트 시 userId에는 GET 응답에서 반환된 실제 UUID 값을 넣어야 한다.
- User API는 현재 생성, 조회, 수정이 모두 정상 동작 상태이다.

## 코드
- @RequestPart("userCreateRequest") String userCreateRequestJson 방식으로 수정
- ObjectMapper.readValue(...)를 통해 JSON → DTO 변환
- update 메서드도 동일 구조 적용
- UUID는 GET 응답의 id 값을 그대로 PathVariable로 사용