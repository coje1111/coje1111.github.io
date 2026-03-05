---
layout: post
title: Spring missions 6th - User Setting
---

# 2026-03-05

## 오늘 한 것
* 구형 저장소(메모리, 파일) 방식에서 JPA 기반 데이터베이스 저장 방식으로 User 도메인 마이그레이션.
* DTO와 엔티티 간의 타입 불일치 해결 및 Java record 문법에 맞춘 DTO 속성 최적화.
* 불필요한 구형 레포지토리 폴더 삭제 및 미사용 도메인(Channel, Message) 빈 등록 해제(주석 처리)를 통한 스프링 부트 의존성 충돌 해결.
* Postman을 이용한 multipart/form-data 형식의 POST API 테스트 환경 구성 및 파일 업로드.
* application.yaml 수정을 통한 스프링 부트 기본 파일 업로드 용량 제한(1MB) 초과 에러 해결.

## 막힌 점
* 스프링 부트의 연쇄적인 빈(Bean) 생성 과정을 간과하여, 삭제된 파일 저장소 로직과 구형 레포지토리가 서버 구동을 막는 치명적인 장애물로 작용함.
* Lombok의 @AllArgsConstructor와 자동 생성 기능을 가진 Java record 문법을 혼용하여 Mapper가 DTO를 생성하지 못하고 충돌함.
* JPA 환경에서 데이터베이스 테이블 상으로는 문제가 없으나, 자바 객체(메모리) 상에서 양방향 연관관계가 명시적으로 설정되지 않아 Mapper 변환 시 NullPointerException이 폭발함.
* 에러 원인을 파악했음에도 객체 간 연결 코드를 직접 구현하는 단계에서 시도 없이 포기함.

## 정리
* 자바 스프링 부트는 애플리케이션 실행 시 모든 컴포넌트의 의존성을 한 번에 조립하므로, 마이그레이션 과정에서 사용하지 않는 잔여 파일이나 폴더를 확실하게 정리해야 컴파일 에러를 막을 수 있다.
* Java record는 그 자체로 불변 데이터 객체에 최적화되어 있으므로, 억지로 Lombok 어노테이션을 붙이면 문법적 충돌을 일으킨다.
* JPA에서 엔티티 간 연관관계를 맺을 때는 물리적 DB의 외래키에만 의존해서는 안 된다. 로직 수행 중 메모리 상의 객체 상태 불일치를 막기 위해 양쪽 객체 참조를 명시적으로 세팅해야 한다.

## 코드
// 양방향 연관관계 처리를 위한 User.java 내부 편의 메서드
public void setStatus(UserStatus status) {
this.status = status;
}

// BasicUserService.java: 객체 연결 및 DTO 변환 로직
User user = new User(username, email, password, nullableProfile);
Instant now = Instant.now();
UserStatus userStatus = new UserStatus(user, now);

userRepository.save(user);

// Mapper에게 넘기기 전, 메모리 상의 두 객체를 명시적으로 연결
user.setStatus(userStatus);

return userMapper.toDto(user);

// application.yaml: 파일 업로드 용량 제한 해제 설정
spring:
servlet:
multipart:
max-file-size: 10MB
max-request-size: 10MB