---
layout: post
title: "Sprint mission 02 User"
---

# 2026-01-15

## 오늘 한 것
- **Java Service Layer (Interface) 도입**
    - `UserService` 인터페이스와 `JCFUserService` 구현체 분리 설계
    - **다형성(Polymorphism)** 활용: 유지보수를 위해 인터페이스 타입으로 객체 관리
- **CRUD 로직 완성 (Update & Delete)**
    - 리스트 내 객체 `ID` 대조를 통한 탐색 로직 구현
    - `Setter`를 활용한 데이터 갱신 및 `remove()`를 통한 데이터 삭제
- **Main 통합 테스트 시나리오 작성**
    - `가입` -> `조회` -> `수정` -> `삭제` 순서의 논리적 검증 흐름 완성
    - `toString()` 오버라이딩을 통해 `System.out` 출력 결과 가시성 확보

## 막힌 점
- `System.out.println(user)` 실행 시 알 수 없는 주소값(`entity.User@...`) 출력으로 멘붕
- 수정(`Update`) 로직 짤 때, `set`을 먼저 하는지 `update`를 먼저 호출하는지 순서 혼동
- 삭제 후 데이터가 없다는 걸 어떻게 코드(`if`)로 증명해야 할지 논리 막힘

##  해결
- **toString 정의:** `User` 클래스에 출력 양식을 지정하여 콘솔창에 데이터가 예쁘게 뜨도록 해결
- **순서 정립:** **[변수 수정 -> 서비스 전달 -> 조회 검증]**의 3단계 프로세스 확실히 익힘
- **Null 체크:** 삭제된 ID로 조회(`findById`)하면 `null`이 나온다는 점을 이용해 검증 로직 완성

## 코드
- Java Interface & CRUD Test (UserService, JCFUserService, Main)
- (사용자가 직접 작성한 테스트 시나리오 포함)