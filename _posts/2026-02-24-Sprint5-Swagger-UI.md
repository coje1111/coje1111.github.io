---
layout: post
title: "Sprint 5 - Swagger UI"
---

# 2026-02-24

## 오늘 한 것
- UserController 완전 이해 시도 (CRUD 패턴 구조 파악 중심)
- UserApi, ChannelApi, MessageApi, ReadStatusApi, BinaryContentApi, AuthApi 인터페이스 구조 통일
- 각 Controller에 implements API 인터페이스 적용
- Swagger Tag 정리 (User / Channel / Message / ReadStatus / BinaryContent / Auth)
- multipart/form-data 오류 해결
- Content-Type 'application/octet-stream' not supported 오류 원인 분석 및 해결
- PATCH /api/users/{userId} 수정 API 정상 동작 확인
- Postman Environment 변수 정리 (baseUrl, user_id, channel_id, read_status_id 등)
- AuthController 오타(implements UserApi) 수정 → implements AuthApi로 교체
- Swagger 구조 최종 점검 및 중복 엔드포인트 확인

## 막힌 점
- Swagger에서 multipart/form-data 요청 시 profile을 빈 값으로 보내면 application/octet-stream 오류 발생
- API 인터페이스를 implements 했는데 @Override 에러 발생 (잘못된 인터페이스 구현)
- UserApi와 Controller 매핑이 중복되며 이상한 경로 생성됨
- Postman Environment export 시 current value가 포함되지 않아 변수 값이 비어있게 전달됨
- API 파일을 추가하면 Swagger가 자동으로 정리되는 원리를 처음에는 이해하지 못함

## 정리
- Swagger Tag는 API 인터페이스(@Tag, @Operation) 기준으로 그룹이 형성된다.
- Controller는 API 인터페이스를 implements 하여 문서와 실제 구현을 연결한다.
- multipart/form-data 요청에서 File 파라미터는 빈 값으로 보내면 안 된다.
- profile 파일이 없다면 form-data에서 해당 key를 제거해야 한다.
- @Override 에러는 인터페이스 메서드 시그니처가 정확히 일치하지 않을 때 발생한다.
- Swagger에 이상한 경로가 생성되면 RequestMapping 중복을 의심해야 한다.
- Postman Environment는 Export 시 반드시 Current Value 포함 옵션을 체크해야 한다.
- CRUD는 공통 패턴을 가진다:
    - Controller → Service 호출
    - Service → Repository 처리
    - Entity → DTO 변환 후 반환

## 코드 구조 이해 (핵심 흐름)

User 생성 흐름:

POST /api/users
→ UserController.create()
→ UserService.create()
→ Optional<BinaryContent> profile 처리
→ User 엔티티 생성
→ userRepository.save()
→ UserDto 반환

User 수정 흐름:

PATCH /api/users/{userId}
→ UserController.update()
→ UserService.update()
→ 기존 User 조회
→ 값 변경
→ 저장
→ UserDto 반환

Auth 로그인 흐름:

POST /auth/login
→ AuthController.login()
→ authService.login()
→ User 반환
→ userService.find(userId)
→ UserDto 반환

## 오늘 가장 중요했던 오류 해결

Content-Type 'application/octet-stream' is not supported

원인:
- multipart/form-data에서 profile 파일을 빈 값으로 전송
- Swagger UI에서 Send empty value 체크되어 있었음

해결:
- profile key 제거
- 또는 실제 파일 업로드
  → 201 Created 정상 응답 확인

## 현재 프로젝트 상태

✔ Swagger 전 카테고리 정상 표시
✔ User / Channel / Message / ReadStatus / BinaryContent / Auth API 구조 통일
✔ Postman 환경 변수 세팅 완료
✔ CRUD 기본 흐름 검증 완료
✔ 로그인 API 연결 완료

## 다음 단계

- Postman Collection 구조 최종 정리
- 전체 API 순서대로 통합 테스트
- 불필요한 중복 경로 제거
- 코드 정리 및 가독성 개선
- 최종 제출용 점검