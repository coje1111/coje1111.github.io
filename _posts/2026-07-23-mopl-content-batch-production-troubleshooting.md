---
layout: post
title: "[모두의 플리] 운영 배포에서 콘텐츠 배치가 실행되지 않은 원인 추적하기"
date: 2026-07-23 09:20:00 +0900
---

# [모두의 플리] 운영 배포에서 콘텐츠 배치가 실행되지 않은 원인 추적하기

## 문제 상황

운영 DB를 초기화한 뒤 외부 콘텐츠 수집 시간이 지났는데도 콘텐츠가 한 건도 저장되지 않았다.

외부 API 키와 배치 cron 설정만 보면 작업이 실행되어야 했다. 따라서 다음 세 구간을 나누어 확인했다.

```text
Scheduler가 Job을 시작했는가
-> Spring Batch 메타데이터가 생성됐는가
-> Tasklet이 외부 API를 호출했는가
```

결론부터 말하면 Scheduler는 Job 실행을 시도했지만 Spring Batch 메타데이터 단계에서 실패했다. 외부 API를 호출하는 Tasklet까지 도달하지 못했다.

## 로그에서 확인한 두 가지 실패

운영 환경은 여러 ECS Task가 동시에 실행된다.

같은 시각에 두 Task가 동일한 콘텐츠 수집 Job을 시작하면서 서로 다른 오류가 발생했다.

```text
Task A
  -> 동일 Job 동시 실행
  -> Batch 메타데이터 선점 과정에서 락/트랜잭션 충돌

Task B
  -> BATCH_STEP_EXECUTION 메타데이터 기록 시도
  -> CREATE_TIME 컬럼이 없어 실패
```

Job 시작 로그만 확인하면 “배치가 실행됐다”고 오해할 수 있다. 실제로는 Step이 시작되지 않아 외부 API 호출 로그와 콘텐츠 저장 결과가 없었다.

## 첫 번째 원인: 다중 인스턴스 스케줄러

Spring의 일반 Scheduler는 각 애플리케이션 인스턴스에서 독립적으로 실행된다.

ECS Task가 두 개라면 같은 cron 시각에 다음 일이 발생할 수 있다.

```text
ECS Task 1 -> contentExternalSyncJob 실행
ECS Task 2 -> contentExternalSyncJob 실행
```

Spring Batch의 Job 메타데이터가 중복 실행을 일부 막아주더라도, 두 인스턴스가 동시에 Job 생성과 실행을 시도하면 DB 락과 트랜잭션 충돌이 발생할 수 있다.

이를 방지하기 위해 공통 `BatchScheduler`에서 Redis 분산락을 사용하도록 보완했다.

```text
lock:batch:{jobName} 획득 성공
  -> Job 실행

락 획득 실패
  -> 다른 인스턴스가 실행 중이므로 건너뜀
```

락은 한 ECS Task만 Job을 시작하도록 만드는 실행 입구 역할을 한다.

## 두 번째 원인: Spring Batch 스키마 버전 불일치

현재 애플리케이션이 사용하는 Spring Batch 버전은 `BATCH_STEP_EXECUTION`에 `CREATE_TIME` 컬럼이 있는 스키마를 기대한다.

하지만 운영 DB에 적용된 초기 마이그레이션의 테이블은 다음 형태였다.

```sql
CREATE TABLE BATCH_STEP_EXECUTION (
    STEP_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
    VERSION BIGINT NOT NULL,
    STEP_NAME VARCHAR(100) NOT NULL,
    JOB_EXECUTION_ID BIGINT NOT NULL,
    START_TIME TIMESTAMP NOT NULL,
    ...
);
```

`CREATE_TIME`이 없고 `START_TIME`은 `NOT NULL`이다.

현재 Spring Batch가 기대하는 구조와 맞지 않아 Step 메타데이터를 저장하는 시점에 실패했다.

이 문제는 애플리케이션 코드나 외부 API 장애가 아니다. 의존성 버전과 DB 메타 테이블 정의가 서로 다른 스키마 호환성 문제다.

## 왜 단위 테스트에서는 발견하지 못했을까

테스트 환경에서는 H2가 Hibernate 설정에 따라 테이블을 만들거나, Spring Batch 테스트용 구성이 별도로 적용될 수 있다.

반면 운영 환경은 Flyway가 작성한 PostgreSQL 테이블을 그대로 사용한다.

```text
테스트
  -> 테스트용 DB 스키마

운영
  -> Flyway V1의 Batch 메타 테이블
```

테스트에서 Job과 Tasklet이 통과해도 운영 Flyway 스키마가 실제 Spring Batch 버전과 맞는지는 별도 검증이 필요하다.

## 필요한 마이그레이션

이미 공유 DB에 적용된 V1 파일을 직접 수정하면 Flyway 체크섬이 달라진다.

따라서 새 버전의 마이그레이션에서 다음 변경을 적용해야 한다.

```sql
ALTER TABLE BATCH_STEP_EXECUTION
    ADD COLUMN CREATE_TIME TIMESTAMP;

ALTER TABLE BATCH_STEP_EXECUTION
    ALTER COLUMN START_TIME DROP NOT NULL;
```

실제 적용 전에는 현재 Spring Batch 공식 PostgreSQL 스키마와 운영 테이블을 다시 비교해야 한다. 컬럼 기본값과 기존 행 보정이 필요하다면 함께 결정해야 한다.

현재 코드에는 Redis 분산락이 반영되어 있지만, Batch 메타 테이블 호환 마이그레이션은 별도 적용이 필요한 상태다.

## 다음 배포에서 확인할 순서

```text
1. Flyway 새 마이그레이션 적용 확인
2. BATCH_STEP_EXECUTION 컬럼 구조 확인
3. 같은 cron 시각에 한 ECS Task만 락을 획득하는지 확인
4. JobExecution과 StepExecution 생성 확인
5. 외부 API 클라이언트별 수집 로그 확인
6. created·updated·skipped·failed 건수 확인
7. contents 테이블 저장 건수 확인
```

배치 성공 여부는 Scheduler 시작 로그 하나로 판단하면 안 된다.

Job 상태, Step 상태, 외부 API 호출, 콘텐츠 저장 건수를 순서대로 확인해야 어느 단계에서 멈췄는지 알 수 있다.

## 배운 점

배치 장애는 외부 API나 Tasklet 코드에서만 발생하지 않는다.

운영 환경에서는 스케줄러 중복 실행, 분산락, Spring Batch 메타 테이블, Flyway 버전이 함께 맞아야 실제 비즈니스 Step이 실행된다.

특히 라이브러리 버전을 올리거나 초기 스키마를 직접 작성했다면, 공식 Batch 스키마와 운영 DB를 비교하는 통합 검증이 필요하다는 점을 배웠다.
