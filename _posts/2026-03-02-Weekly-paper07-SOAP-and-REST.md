---
layout: post
title: "Weekly Paper #07 - SOAP vs REST & Spring Boot Request Flow"
---

# 2026-03-02

## 🇶 웹 API의 발전 과정에서 SOAP에서 REST로의 전환이 일어난 이유와 그 장단점에 대해 설명하세요.

### 1. SOAP의 특징과 한계
SOAP(Simple Object Access Protocol)는 XML 기반의 메시지 프로토콜로, 웹 서비스 간의 표준화된 통신을 위해 사용되었다.

**특징**
- XML 기반 메시지 사용
- WSDL을 통한 인터페이스(계약) 정의
- 보안/트랜잭션 등 기업 환경에서 사용할 수 있는 표준(WS-*) 지원

**한계(REST로 넘어가게 된 배경)**
- XML 기반이라 메시지가 무겁고 길어짐(전송/파싱 비용 증가)
- 학습 난이도 및 구현 난이도가 높음(WSDL, 스키마, 규격 등)
- 개발/디버깅이 번거롭고 생산성이 떨어질 수 있음
- 웹(HTTP)의 장점을 “웹답게” 활용하기보다 별도 규격 중심으로 동작

---

### 2. REST로 전환된 이유
REST(Representational State Transfer)는 웹의 원래 설계 철학(자원, HTTP, 무상태)에 맞춘 아키텍처 스타일이다.  
모바일/프론트엔드/다양한 클라이언트가 늘어나면서 “가볍고, 단순하고, 빠르게 개발 가능한 API” 수요가 커졌고, REST가 그 요구에 맞았다.

**전환 이유 핵심**
1. HTTP를 그대로 활용 (GET/POST/PUT/PATCH/DELETE)
2. 자원(Resource)을 URI로 표현하여 구조가 직관적임
3. 주로 JSON을 사용하여 가볍고 파싱이 쉬움
4. 클라이언트-서버 분리가 명확하고 확장에 유리함
5. 표준 웹 인프라(캐시, 프록시, 로드밸런서 등)와 궁합이 좋음

---

### 3. SOAP vs REST 장단점 비교

#### SOAP 장점
- WSDL 기반의 “계약(스펙)”이 명확해 시스템 간 연동 규격을 엄격히 맞추기 좋음
- 보안/트랜잭션/신뢰성 메시징 등 기업 환경에서 필요한 표준(WS-*) 생태계가 강함
- 다양한 전송 방식/복잡한 메시지 시나리오에 대해 표준화된 접근이 가능

#### SOAP 단점
- 메시지 구조가 복잡하고 무거움(XML 기반)
- 구현/운영 난이도가 높고 생산성이 떨어질 수 있음
- 웹 개발에서 흔히 기대하는 “단순한 HTTP API” 형태와는 거리가 생김

#### REST 장점
- 구조가 단순하고 가벼움(주로 JSON)
- HTTP 메서드/상태코드 등을 활용해 의미 전달이 명확함
- 자원 중심 URI 설계로 API가 예측 가능하고 가독성이 좋음
- 다양한 클라이언트(웹/모바일)와 연결이 쉽고 확장에 유리

#### REST 단점
- SOAP처럼 강제되는 계약(WSDL) 문화가 기본은 아니라서, 팀/조직에 따라 문서화가 약하면 규격이 흔들릴 수 있음
- 보안/트랜잭션/신뢰성 등 “기업형 요구”는 별도 설계/구성이 필요할 수 있음
- REST 원칙을 느슨하게 적용하면 “그냥 JSON API”가 되어 일관성이 무너질 수 있음

---

### 정리
SOAP는 강력한 표준과 계약 기반으로 기업 환경에 유리했지만, 복잡하고 무거웠다.  
REST는 웹 친화적이고 단순하며, 현대 웹/모바일 환경에서 빠르게 개발/확장하기 유리해 널리 사용되면서 SOAP에서 REST로 전환이 가속화되었다.

---

## 🇶 Spring Boot에서 @RestController로 들어온 HTTP 요청이 처리되어 응답으로 변환되는 전체 과정을 설명하세요. 특히 HTTP 메시지 컨버터가 동작하는 시점과 역할을 포함해서 설명하세요.

### 1. 클라이언트 요청
클라이언트(브라우저/앱/포스트맨 등)가 HTTP 요청을 서버로 전송한다.
- GET /users/1
- POST /users (JSON Body 포함 등)

---

### 2. DispatcherServlet이 요청을 수신
Spring MVC의 핵심은 **DispatcherServlet(프론트 컨트롤러)**이다.  
모든 요청은 먼저 DispatcherServlet으로 들어온다.

역할:
- 요청을 받아 전체 흐름을 통제
- 어떤 컨트롤러가 처리할지 결정하는 중심

---

### 3. HandlerMapping: 컨트롤러(핸들러) 찾기
DispatcherServlet은 HandlerMapping을 통해
요청 URL + HTTP 메서드에 매핑되는 컨트롤러 메서드를 찾는다.

예:
- @GetMapping("/users/{id}")
- @PostMapping("/users")

---

### 4. HandlerAdapter: 컨트롤러 메서드 실행
선택된 컨트롤러를 실제로 호출/실행하는 역할을 HandlerAdapter가 수행한다.

이 과정에서 컨트롤러 메서드 파라미터들이 준비된다:
- @PathVariable
- @RequestParam
- @RequestHeader
- @RequestBody 등

---

### 5. HTTP 메시지 컨버터 동작 시점 (요청 단계)
요청에 Body(JSON)가 있고, 컨트롤러 파라미터가 @RequestBody로 선언된 경우:

1) HTTP 요청 Body(JSON 등)
2) **HttpMessageConverter**가 이를 읽고
3) 자바 객체(DTO 등)로 변환하여
4) 컨트롤러 메서드 파라미터로 전달한다.

즉,
- **요청 단계 메시지 컨버터 역할 = "본문(JSON) → 자바 객체" 변환**

---

### 6. 컨트롤러 → 서비스(비즈니스 로직) 호출
@RestController의 메서드는 보통 Service 계층을 호출한다.
- 검증/비즈니스 규칙 처리
- 필요 시 Repository를 통해 DB 접근

---

### 7. @RestController의 반환값 처리
@RestController는 기본적으로 **@ResponseBody**가 포함된 것과 동일하다.  
즉, 반환값을 “뷰 이름”으로 해석하지 않고 “응답 본문 데이터”로 취급한다.

---

### 8. HTTP 메시지 컨버터 동작 시점 (응답 단계)
컨트롤러가 객체(DTO 등)를 반환하면:

1) 반환 객체
2) **HttpMessageConverter**가 이를 변환해
3) JSON(또는 XML 등)으로 직렬화
4) HTTP 응답 Body에 담아 전송한다.

즉,
- **응답 단계 메시지 컨버터 역할 = "자바 객체 → JSON" 변환**

---

### 9. 클라이언트가 응답 수신
클라이언트는 최종적으로 JSON 형태의 응답을 받는다.
(상태코드 + 헤더 + 바디)

---

## 전체 흐름 요약
1) Client → HTTP Request
2) DispatcherServlet 수신
3) HandlerMapping으로 Controller 메서드 탐색
4) HandlerAdapter가 메서드 실행 준비
5) (요청) HttpMessageConverter: JSON → 객체(@RequestBody)
6) Controller → Service → (Repository)
7) Controller 반환값 생성
8) (응답) HttpMessageConverter: 객체 → JSON(@RestController/@ResponseBody)
9) Client 응답 수신

---

## 정리
- @RestController는 View 렌더링이 아니라 “데이터(JSON)”를 반환하는 컨트롤러이다.
- HttpMessageConverter는 **요청 바디를 객체로 만들 때 1번**, **응답 객체를 JSON으로 만들 때 1번** 동작한다.
- DispatcherServlet이 전체 요청 처리 흐름을 조율하고, HandlerMapping/HandlerAdapter가 컨트롤러 실행을 지원한다.