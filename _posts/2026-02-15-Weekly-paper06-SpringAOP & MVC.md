---
layout: post
title: "Weekly Paper #06 - Spring AOP & MVC"
---

# 2026-02-15

## 🇶 Spring에서 AOP(Aspect Oriented Programming)가 필요한 이유와 이를 활용한 실제 애플리케이션 개발 사례에 대해 설명하세요.

### 1. AOP가 필요한 이유

Spring에서 AOP는 **공통 기능을 핵심 로직과 분리하기 위해** 필요하다.

애플리케이션을 개발하다 보면 다음과 같은 기능들이 반복된다.

- 로그 기록
- 트랜잭션 처리
- 보안 검사
- 예외 처리
- 성능 측정

이러한 기능들은 비즈니스 로직과 직접적인 관련은 없지만, 여러 클래스와 메서드에서 공통적으로 사용된다.  
이것을 **공통 관심사(Cross-Cutting Concern)** 라고 한다.

만약 AOP를 사용하지 않으면:

- 여러 서비스 클래스에 동일한 코드가 반복되고
- 코드가 복잡해지며
- 유지보수가 어려워진다.

AOP는 이러한 공통 관심사를 별도의 모듈(Aspect)로 분리하여 관리할 수 있게 해준다.

즉,

> AOP는 핵심 비즈니스 로직과 공통 기능을 분리하여 코드의 중복을 제거하고 유지보수성을 향상시키기 위해 필요하다.

---

### 2. AOP를 활용한 실제 개발 사례

#### (1) 로깅 처리

모든 Service 메서드 실행 전후에 로그를 남기고 싶을 경우:

- 기존 방식: 각 메서드마다 로그 코드 작성
- AOP 사용: 특정 패키지의 메서드 실행 시 자동으로 로그 출력

→ 코드 중복 제거 및 유지보수 용이

---

#### (2) 트랜잭션 처리

Spring에서는 `@Transactional`을 통해 트랜잭션을 관리한다.  
이 역시 내부적으로 AOP를 사용한다.

- 메서드 실행 전 트랜잭션 시작
- 예외 발생 시 롤백
- 정상 종료 시 커밋

비즈니스 로직에는 트랜잭션 코드가 보이지 않지만,  
AOP를 통해 자동으로 적용된다.

---

#### (3) 보안 처리

특정 메서드 접근 전에 권한을 검사하는 경우:

- 인증/인가 로직을 AOP로 분리
- 핵심 로직은 순수 비즈니스 코드만 유지

---

### ✔ 정리

AOP는 공통 관심사를 분리하여
- 코드 중복 감소
- 결합도 감소
- 유지보수성 향상
- 가독성 개선

을 가능하게 한다.

---

## 🇶 Spring MVC에서 클라이언트의 요청 처리 흐름을 @Controller와 @RestController의 차이점을 중심으로 각각의 처리 과정과 특징을 포함하여 설명하세요.

### 1. Spring MVC의 기본 요청 처리 흐름

Spring MVC에서 클라이언트 요청은 다음과 같은 흐름으로 처리된다.

1. 클라이언트가 HTTP 요청 전송
2. DispatcherServlet이 요청 수신
3. 적절한 Controller 탐색
4. Controller가 비즈니스 로직(Service) 호출
5. 결과 반환
6. View 또는 데이터(JSON) 응답

---

### 2. @Controller의 처리 흐름

`@Controller`는 **화면(View)을 반환하는 용도**로 사용된다.

#### 처리 과정

1. 클라이언트 요청 수신
2. DispatcherServlet이 Controller 호출
3. Controller가 Service 호출 후 결과 반환
4. 반환값은 **View 이름**
5. ViewResolver가 해당 View를 찾아 렌더링
6. HTML 생성 후 클라이언트에 응답

#### 특징

- 주로 서버 사이드 렌더링(SSR)에 사용
- HTML 화면을 반환
- ViewResolver가 동작

---

### 3. @RestController의 처리 흐름

`@RestController`는 **데이터(JSON)를 반환하는 용도**로 사용된다.

#### 처리 과정

1. 클라이언트 요청 수신
2. DispatcherServlet이 Controller 호출
3. Controller가 Service 호출
4. 반환 객체를 HTTP 메시지 컨버터가 JSON으로 변환
5. JSON 응답 반환

#### 특징

- View를 거치지 않음
- 반환값이 곧 응답 데이터
- RESTful API 구현에 사용
- `@Controller + @ResponseBody`와 동일 기능

---

### 4. @Controller vs @RestController 차이점

| 구분 | @Controller | @RestController |
|------|--------------|----------------|
| 목적 | 화면(View) 반환 | 데이터(JSON) 반환 |
| ViewResolver | 사용함 | 사용하지 않음 |
| 응답 형태 | HTML | JSON / XML |
| 사용 목적 | 웹 페이지 | REST API |

---

### ✔ 최종 정리

- Spring MVC는 DispatcherServlet을 중심으로 요청을 처리한다.
- `@Controller`는 View를 반환하여 화면을 렌더링한다.
- `@RestController`는 데이터를 직접 반환하여 REST API를 구현한다.
- 두 방식 모두 MVC 구조를 따르지만, 응답 방식에서 차이가 있다.
