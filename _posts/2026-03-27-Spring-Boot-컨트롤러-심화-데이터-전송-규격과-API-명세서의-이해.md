---
layout: post
title: "Spring Boot 컨트롤러 심화: 데이터 전송 규격과 API 명세서의 이해"
---

# 2026-03-27

## 오늘 한 것
- JSON 텍스트와 이진 데이터(이미지 파일)의 근본적인 차이와 전송 방식 학습
- `multipart/form-data`의 동작 원리 및 `@RequestPart`, `@RequestBody` 어노테이션의 차이 이해
- 서버의 입력 지시어(`consumes`)와 출력 지시어(`@RestController`)의 방향성 차이 파악
- 클라이언트와 서버 간의 데이터 통신 규약인 'API 명세서'의 필요성과 현대 실무의 작성 방식(API-First Design) 학습

## 막힌 점
- `@RestController`는 순수 데이터(JSON)만 반환한다고 배웠는데, 컨트롤러가 사진 파일도 같이 취급할 수 있다는 점에서 혼란이 발생함.
- JSON 형태에 사진 파일도 포함될 수 있는지 헷갈렸음 (Base64 인코딩 방식과 Multipart 방식의 혼재).
- 서버가 코드를 짤 때, 클라이언트가 어떤 이름으로 사진을 보낼지 미리 어떻게 알고 대비하는 것인지 의문이 생김.

## 정리
- JSON은 100% 텍스트 규격이며, 사진의 원본 이진 데이터는 들어갈 수 없음.
- `multipart/form-data`는 HTTP 요청 본문을 여러 구역(Part)으로 쪼개어, 텍스트 영역과 파일 영역을 섞이지 않게 각각 독립적으로 전송하는 통신 규격임.
- `@RequestBody`는 요청 본문 전체를 단일 JSON 텍스트로 해석하려다 파일의 이진 데이터 때문에 에러를 뱉지만, `@RequestPart`는 나누어진 특정 구역만 핀셋처럼 정확히 도려내어 가져오므로 안전함.
- 해당 컨트롤러 메서드는 입력을 Multipart 규격으로 받고(`consumes`), 내부 처리를 마친 뒤 출력을 순수 JSON 데이터로 반환(`@RestController`)하는 구조임.
- 서버가 클라이언트의 입력을 눈치껏 알아채는 것이 아니라, 코드를 짜기 전에 'API 명세서'라는 철저한 계약서를 통해 어떤 주소로 어떤 데이터를 주고받을지 합의함.
- API 명세서는 백엔드만 주도하는 것이 아니며, 프로젝트에 따라 프론트엔드와 백엔드가 사전에 공동으로 합의하고 설계하는 방식(API 우선 설계)이 효율적임.

## 코드
// 클라이언트와 서버가 합의한 API 명세서 규격에 맞춰 작성된 컨트롤러 메서드의 입출력 구조

@PostMapping(consumes = {MediaType.MULTIPART_FORM_DATA_VALUE}) // 입력: 파일이 포함된 분할 구역(Multipart) 방식만 허용
@Override
public ResponseEntity<UserDto> create( // 출력: JSON 데이터(UserDto)와 상태 코드 반환
// API 명세서에 "userCreateRequest"라는 이름으로 텍스트를 보내기로 약속함
@RequestPart("userCreateRequest") UserCreateRequest userCreateRequest,

    // API 명세서에 "profile"이라는 이름으로 사진을 보내기로 약속함 (필수는 아님)
    @RequestPart(value = "profile", required = false) MultipartFile profile
) {
// 내부 비즈니스 로직 수행...
return ResponseEntity.status(HttpStatus.CREATED).body(createdUser);
}