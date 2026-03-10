---
layout: post
title: Sprint 06 JPA Entity Migration and Lazy Loading Serialization
---

# 2026-03-10

## 1. 오늘 한 것
- `Message`, `ReadStatus`, `UserStatus`, `BinaryContent` 도메인의 JPA 엔티티 마이그레이션 및 객체 지향적 연관관계 매핑 완료.
- 단순 식별자(UUID) 참조 방식에서 실제 엔티티(Entity) 객체를 직접 참조하는 방식으로 서비스 로직 리팩토링.
- JPA 지연 로딩(LAZY) 환경에서 Jackson JSON 직렬화 수행 시 발생하는 프록시 객체(ByteBuddyInterceptor) 충돌 에러 해결.
- 비효율적인 스트림(Stream) 중복 검색을 고성능 JPA 쿼리 메서드(`existsByUserIdAndChannelId`)로 대체하여 성능 최적화.

## 2. 막힌 점
- `Message` 목록 조회 API 테스트 중 `org.hibernate.proxy.pojo.bytebuddy.ByteBuddyInterceptor` 타입 정의 에러가 발생하여 500 인터널 서버 에러로 응답이 실패함.
- `ReadStatus` 객체 생성 시 과거처럼 단순 ID(UUID) 값을 넘기려다, 실제 `User`와 `Channel` 객체를 요구하는 새로운 JPA 엔티티 규격과 충돌하여 컴파일 에러 발생.
- 에러 해결을 위해 `@JsonIgnoreProperties`를 적용하는 과정에서 `Initializer`의 철자를 `Intializer`로 잘못 입력하는 오타가 발생해, 설정이 무시되고 동일한 에러가 반복됨.

## 3. 정리
- **객체 지향적 데이터베이스 연결:** JPA 환경에서는 연관된 데이터를 저장할 때 식별자(ID) 숫자를 직접 넣는 것이 아니라, 데이터베이스에서 조회해 온 실제 '엔티티 객체' 자체를 넘겨주어야 한다.
- **지연 로딩(LAZY)과 프록시(Proxy) 객체:** 성능 최적화를 위해 `FetchType.LAZY`를 설정하면, 연관된 객체를 즉시 데이터베이스에서 끌어오지 않고 시스템 코드로 이루어진 빈 껍데기(프록시 객체)를 임시로 채워 넣는다.
- **JSON 직렬화 충돌(ByteBuddyInterceptor) 해결:** API 응답을 위해 스프링(Jackson 라이브러리)이 데이터 객체를 JSON으로 변환할 때, 이 프록시 객체 내부의 알 수 없는 시스템 코드들까지 변환하려고 시도하다가 에러가 발생한다. 연관 객체 필드 위에 `@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})`를 선언하여 JSON 변환기가 프록시 관련 시스템 필드를 무시하도록 지시해야 한다.

## 4. 코드
- 지연 로딩으로 인한 프록시 객체 직렬화 에러를 방지하는 핵심 어노테이션 적용 예시.

```java
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;

@Entity
@Table(name = "messages")
public class Message extends BaseUpdatableEntity {

    @Column(columnDefinition = "TEXT")
    private String content;

    // JSON 변환기가 가짜 프록시 객체를 변환하려 할 때, 
    // 에러를 유발하는 hibernateLazyInitializer와 handler 시스템 필드를 무시하도록 강제함.
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "channel_id", nullable = false)
    private Channel channel;

    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id")
    private User author;
    
    // ... 생략
}