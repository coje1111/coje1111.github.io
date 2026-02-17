---
layout: post
title: "Sprint4 Discord API 미션 전체 완료 보고"
---

# 2026-02-17

## 오늘 한 것

- User API 전체 구현 및 테스트 완료
    - 등록 / 수정 / 삭제 / 전체조회
    - 온라인 상태 업데이트
    - 로그인(Auth)

- Channel API 구현 및 테스트 완료
    - 공개/비공개 채널 생성
    - 채널 수정 / 삭제
    - 사용자 기준 채널 목록 조회

- Message API 구현 및 테스트 완료
    - 특정 채널 메시지 생성
    - 메시지 수정 / 삭제
    - 채널별 메시지 목록 조회

- ReadStatus API 구현 및 테스트 완료
    - 메시지 수신 정보 생성
    - 수신 정보 수정
    - 사용자 기준 수신 정보 조회

- BinaryContent 구현 완료
    - 파일 생성 (Base64)
    - 단건 조회
    - 여러 개 조회
    - UUID 파라미터 처리 수정

- static 리소스 연동
    - user-list.html 렌더링
    - JS에서 API 호출
    - 사용자 목록 화면 출력

- Postman 전체 테스트 완료
    - 모든 API 정상 동작 확인
    - Collection Export 완료

---

## 막힌 점

1. UUID 변환 오류 (400 Bad Request)
    - PathVariable에 {} 포함되어 전송됨
    - UUID 형식이 정확하지 않으면 즉시 예외 발생

2. NoSuchElementException
    - 존재하지 않는 ID로 조회/수정 시 발생
    - Optional.orElseThrow() 처리 필요

3. BinaryContent NullPointerException
    - bytes null 문제
    - Base64 디코딩 로직 확인 필요

4. 404 Not Found
    - URL 매핑 불일치
    - 잘못된 엔드포인트 사용

5. static 화면에 데이터 미출력
    - JS fetch 경로 문제
    - 서버 실행 경로 확인 필요

---

## 정리

이번 미션에서 핵심은 다음이었다.

- UUID 기반 식별자는 매우 엄격하다
- PathVariable과 RequestBody를 정확히 구분해야 한다
- Controller → Service → Repository 계층 책임 분리가 중요하다
- Optional 처리 없이 단정하면 런타임 에러 발생
- REST URL 설계가 명확해야 한다
- 프론트엔드 연동 시 JSON 구조 이해가 필요하다
- Postman 테스트를 통해 실제 동작 검증이 필수다

User → Channel → Message → ReadStatus → BinaryContent까지
전체 흐름을 직접 연결하면서 구조 이해도가 올라갔다.