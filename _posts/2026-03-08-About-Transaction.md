---
layout: post
title: About Transaction
---

# 2026-03-07

## 1. 오늘 한 것
- 백엔드 데이터베이스 핵심 개념 학습: 트랜잭션(Transaction), 커밋/롤백(Commit/Rollback), 영속성 컨텍스트(Persistence Context).
- 실무 현장에서 '트랜잭션 처리'라는 용어가 사용되는 문맥과 데이터 무결성을 보장하는 실제 의미 파악.

## 2. 막힌 점
- '트랜잭션', '영속성 컨텍스트' 등 직역된 기술 용어의 추상적인 뉘앙스 때문에, 해당 개념을 실제 서버 동작 및 실무 작업과 매칭하여 이해하는 데 초기 혼선이 있었음.

## 3. 정리
- **트랜잭션 (Transaction):** 데이터베이스의 상태를 변화시키는 여러 작업들을 묶은 '운명 공동체 캡슐'.
    - 실무적 의미: 데이터가 변형되는 작업(Create, Update, Delete) 도중 에러가 발생해도 데이터가 오염되지 않도록 하나로 묶어 보호하는 강력한 보증 수표. 무조건 100% 성공하거나, 아예 없던 일로 되돌림.
- **커밋(Commit)과 롤백(Rollback):** 트랜잭션 캡슐 내의 모든 작업이 성공하면 그 결과를 DB에 영구 반영(Commit)하고, 단 하나라도 실패하면 시작 전 상태로 완벽히 되돌려버림(Rollback).
- **영속성 컨텍스트 (Persistence Context):** 잦은 DB 접근으로 인한 시스템 부하를 막기 위해, 변경 사항들을 모아두는 1차 임시 저장소(장바구니). 트랜잭션이 성공적으로 끝나는 순간 모아둔 변경 사항을 한 번의 쿼리로 모아 DB에 전송함.

## 4. 코드
- 트랜잭션 개념을 실무 Java Spring 코드에 적용하기 위해 사용되는 핵심 어노테이션 예시.

```java
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    // @Transactional을 붙이면 이 메서드 내부의 DB 작업들은 하나의 묶음으로 처리됨.
    // 도중에 예외(Error)가 발생하면 자동으로 모든 작업이 Rollback(취소) 됨.
    @Transactional
    public void deleteUserAndPosts(Long userId) {
        // 1. 유저가 작성한 게시글 모두 삭제
        postRepository.deleteAllByUserId(userId);
        
        // 2. 유저 정보 본체 삭제
        userRepository.deleteById(userId);
        
        // 1번은 성공했는데 2번에서 에러가 발생하면, 
        // 트랜잭션이 개입하여 1번 작업도 없던 일로 되돌려(Rollback) 데이터 무결성을 유지함.
    }
}