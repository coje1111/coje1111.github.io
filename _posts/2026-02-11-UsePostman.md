---
layout: post
title: "[Sprint4] Controller 레이어 시작 + Postman 세팅 + 파일 저장(.ser) 구조 파악"
---
# 2026-02-11

## 오늘 한 것
- Sprint4 베이스코드 기반으로 Controller 레이어 작업 시작
- Postman 컬렉션/환경(local) 구성 및 baseUrl 변수 적용
- User API 테스트 진행:
    - GET /users 전체조회 성공
    - POST /users 생성 시도 및 실패 원인 추적
- 에러 흐름을 로그로 추적하며 원인별로 분리해서 해결:
    - 405(Method Not Allowed): 요청 메서드/매핑 불일치
    - UUID 변환 에러: PathVariable UUID에 잘못된 값(또는 빈 변수) 전달
    - 500(Internal Server Error): 실제 원인은 서비스 로직 예외(중복 사용자)
- FileUserRepository 저장 경로/방식 확인:
    - user.dir 기준 + (설정값 fileDirectory) + "User" 폴더로 저장
    - 확장자 ".ser" (Serializable 바이너리) 파일로 사용자 데이터 저장됨
- users.txt / user.txt 같은 텍스트 파일만 보고 판단하면 꼬일 수 있다는 걸 확인

## 막힌 점
- Postman에서 변수(user_id)가 비어 있거나 UUID 형식이 아니면:
    - URL이 /users/ 로 나가거나
    - UUID 변환 실패로 404/에러처럼 보이는 상황 발생
- 동일 username/email로 POST 반복 시 중복 예외 발생
- 저장 데이터가 txt가 아니라 .ser 기반이라 “파일에 안 보인다” 착시가 발생

## 정리
- Postman은 환경변수 기반으로 테스트 루틴을 고정해야 함:
    - baseUrl = http://localhost:8080
    - user_id는 POST 응답의 id를 복사해서 사용(또는 스크립트로 자동 저장)
- 500은 “서버가 터졌다”가 아니라 “예외를 HTTP로 변환 안 했다”는 신호:
    - 과제 요구사항대로 전역 예외처리(@RestControllerAdvice)로 4xx/5xx를 정리해야 함
- 파일 저장 방식일 때 데이터 위치는 코드가 정의:
    - FileUserRepository에서 user.dir + fileDirectory + "User" 경로 아래에 .ser로 저장됨
    - 중복/초기화가 필요하면 해당 폴더의 .ser 데이터를 기준으로 관리해야 함

## 코드 구조
- controller/
    - UserController 등 웹 API 엔드포인트 담당
- service/
    - UserService 인터페이스 + Basic 구현체가 비즈니스 로직 담당
- repository/file/
    - FileUserRepository가 파일 기반 저장/조회 담당
- 저장 형태
    - discodeit/User/*.ser (User 엔티티 직렬화 저장)
    - discodeit/UserStatus/*.ser (상태 데이터)
