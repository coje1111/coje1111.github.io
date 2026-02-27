---
layout: post
title: "[이론정리] REST API 및 스프링 요청 처리 방식 정리"
---

# 2026-02-27

## 📌 오늘 한 것

- API의 핵심 특성(추상화, 캡슐화, 재사용성, 정보 은닉) 정리
- REST 아키텍처 제약조건 학습
- RESTful API 설계 원칙 및 상태코드 정리
- 리소스 중심 설계 개념 이해
- 스프링에서 REST 요청을 처리하는 주요 어노테이션 정리

---

## ❗ 막힌 점

- REST가 단순한 URL 규칙이 아니라 아키텍처 스타일이라는 점이 처음엔 헷갈렸음
- 리소스 중심 설계에서 종속 리소스와 독립 리소스의 차이 이해가 필요했음
- HTTP 상태코드의 정확한 사용 시점 구분이 헷갈림

---

## 🧠 정리

### 1️⃣ API의 핵심 특성

API는 서로 다른 시스템이 통신할 수 있도록 정의된 인터페이스이다.

- **추상화**: 내부 구현을 숨기고 필요한 기능만 외부에 제공한다.
- **캡슐화**: 데이터와 기능을 하나로 묶고 외부 접근을 제한한다.
- **재사용성**: 동일한 API를 여러 클라이언트에서 재사용할 수 있다.
- **정보 은닉**: 내부 구조(DB, 알고리즘 등)를 숨겨 유지보수성과 보안을 높인다.

---

### 2️⃣ REST 제약조건

REST는 단순한 URL 스타일이 아니라 아키텍처 원칙을 따르는 설계 방식이다.

- Client-Server 구조
- Stateless (무상태성)
- Cacheable
- Uniform Interface
- Layered System

특히 **Stateless**는 서버가 클라이언트의 상태를 저장하지 않는다는 점에서 확장성과 성능에 큰 장점을 가진다.

---

### 3️⃣ RESTful API 상태코드

#### ✅ 200번대 (성공)
- 200 OK
- 201 Created
- 204 No Content

#### ⚠ 400번대 (클라이언트 오류)
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found

#### ❌ 500번대 (서버 오류)
- 500 Internal Server Error

---

### 4️⃣ 리소스 중심 설계

REST는 동사 중심이 아닌 **명사(리소스) 중심**으로 설계한다.

❌ /createUser  
✅ /users

행위는 HTTP 메서드로 표현한다.

- GET /users
- POST /users
- PUT /users/{id}
- DELETE /users/{id}

#### 종속 리소스 vs 독립 리소스

- 종속: /users/{id}/orders
- 독립: /orders/{id}

관계 표현이 중요하면 종속 구조,
독립 접근이 중요하면 독립 구조가 적절하다.

---

### 5️⃣ 스프링 기반 REST 요청 처리 방식

Spring에서는 다양한 방식으로 요청을 처리한다.

- **@PathVariable**: URL 경로 값 추출
- **@RequestParam**: 쿼리 파라미터 처리
- **@RequestBody**: JSON 데이터를 객체로 매핑

예시:

```java
@GetMapping("/users/{id}")
public User find(@PathVariable Long id) {
    return userService.find(id);
}
```

---

##  코드 구조

(이론 정리 위주 학습이므로 실제 구현 코드는 없음)

Controller
Service
Repository
Domain(Entity)
DTO
Exception

→ REST 구조 기반으로 계층 분리 설계 이해 중