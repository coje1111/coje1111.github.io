---
layout: post
title: Sprint6 User Test
---

# 2026-03-05 (2차 기록)

## 오늘 한 것
- Postman을 활용한 유저 CRUD(생성, 전체/단건 조회, 수정, 삭제) API 전체 사이클 검증
- UserController 내 누락되었던 단건 조회(GET) 메서드 및 UserApi 인터페이스 명세 추가 구현
- DataGrip과 스프링 부트 서버 연동을 통해 API 요청에 따른 물리 데이터 변화 실시간 관측
- 유저 삭제 시 연관된 상태 정보(UserStatus)까지 함께 지워지는 영속성 전이(Cascade) 작동 확인

## 막힌 점
- **경로 및 메서드 불일치**: URL 오타(`/user` vs `/api/users`)와 잘못된 메서드 선택(PUT vs PATCH)으로 인해 404 및 405 에러 발생
- **인터페이스 구현 충돌**: 컨트롤러에 메서드 추가 시 부모 인터페이스(UserApi)에 명세가 없어 @Override 컴파일 에러 발생
- **데이터 증발 현상**: 서버 재시작 시 JPA ddl-auto 설정으로 인해 기존 테스트 데이터가 삭제되어 단건 조회 시 404 에러 발생
- **Content-Type 미지정**: Postman에서 JSON 데이터 전송 시 타입을 지정하지 않아 'application/octet-stream' 미지원 에러 발생
- **DTO 필드명 불일치**: JSON 키값(username)과 자바 DTO 필드명(newUsername)이 서로 달라 200 OK 응답에도 불구하고 데이터 수정이 반영되지 않는 '침묵의 실패' 발생
- **DB 동기화 인지 부족**: DataGrip에서 테이블이 자동으로 보이지 않아 새로고침(Refresh) 및 인트로스펙션(Introspection) 과정이 필요함을 뒤늦게 인지

## 정리
- **백엔드 통신의 정교함**: 클라이언트(Postman), 데이터 전달 객체(DTO), 서비스 로직 간의 필드명은 단 한 글자만 틀려도 데이터가 증발하므로 엄격한 명명 규칙 준수가 필수적임
- **HTTP 상태 코드의 의미**: 404(경로 없음), 405(방식 틀림), 415(타입 틀림) 등 서버가 보내는 숫자를 통해 에러의 원인이 주소인지, 방식인지, 데이터 형식인지 빠르게 진단할 수 있음
- **영속성 컨텍스트와 DB**: API 응답 성공과 실제 DB 반영은 별개일 수 있으므로, 반드시 DataGrip 같은 도구로 물리 데이터를 교차 검증하는 습관이 중요함
- **성공의 경험**: 연쇄적으로 폭발하는 복잡한 에러들을 추론과 로그 분석으로 하나씩 해결해 나가는 과정에서 백엔드 아키텍처에 대한 깊은 이해와 자신감을 얻음

## 코드
// 1. 단건 조회를 위한 컨트롤러 매핑 추가
@GetMapping(path = "{userId}")
public ResponseEntity<UserDto> find(@PathVariable("userId") UUID userId) {
UserDto user = userService.find(userId);
return ResponseEntity.status(HttpStatus.OK).body(user);
}

// 2. 데이터 수정 시 필드명 매칭 확인 (Java DTO 측 필드명이 username일 경우)
String newUsername = userUpdateRequest.username(); // newUsername()에서 수정

// 3. Postman JSON 요청 예시 (필드명 일치 필수)
{
"username": "박춘봉",
"email": "asdasd2@naver.com",
"password": "password123"
}