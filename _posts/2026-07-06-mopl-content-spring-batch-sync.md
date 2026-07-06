---
layout: post
title: "[모두의 플리] Spring Batch로 외부 콘텐츠 수집 작업 연결하기"
date: 2026-07-06 09:10:00 +0900
---

# [모두의 플리] Spring Batch로 외부 콘텐츠 수집 작업 연결하기

## 배경

모두의 플리 프로젝트에서는 외부 API를 통해 영화, 드라마, 스포츠 콘텐츠를 수집해야 한다.

외부 API 연동 기반을 만든 뒤에는 이 수집 작업을 사람이 직접 실행하는 것이 아니라, 정해진 구조 안에서 안정적으로 실행할 수 있어야 했다.

팀에는 이미 BatchTask와 Scheduler를 중심으로 한 공통 배치 실행 구조가 있었다.

그래서 이번 작업의 목표는 Content 도메인에 필요한 외부 콘텐츠 수집 작업을 그 구조에 맞게 연결하는 것이었다.

중요한 점은 내가 공통 Scheduler 전체를 새로 만드는 것이 아니었다는 점이다.

공통 배치 구조는 다른 팀원이 주 담당이고, 나는 그 위에 Content 수집 Job을 연결하는 범위만 맡았다.

## 작업 범위

이번 작업의 범위는 다음과 같았다.

```text
ContentExternalSyncBatchTask
ContentExternalSyncJobConfig
ContentExternalSyncTasklet
ContentExternalSyncService 연동
cron 설정 환경변수화
배치 실행 결과 테스트
```

반대로 이번 작업에서 깊게 들어가지 않은 부분도 있다.

```text
Actuator 커스텀 메트릭 노출
외부 API 세부 재시도 정책
Batch JobRepository 운영 DB 설정
공통 Scheduler 구조 자체 변경
```

이 부분들은 공통 구조나 운영 정책과 맞물려 있어서, Content 도메인에서 임의로 크게 바꾸지 않는 쪽으로 정리했다.

## 전체 구조

이번에 만든 구조는 다음 흐름이다.

```text
Scheduler
  -> BatchTask
      -> contentExternalSyncJob
          -> contentExternalSyncStep
              -> ContentExternalSyncTasklet
                  -> ContentExternalSyncService.syncExternalContents()
```

Content 도메인 입장에서 핵심은 `ContentExternalSyncService`다.

이 서비스는 외부 API에서 콘텐츠 후보를 가져오고, Content 저장 정책에 따라 새 콘텐츠를 만들거나 기존 콘텐츠의 동기화 시점을 갱신한다.

Batch 쪽 코드는 이 서비스를 언제, 어떤 Job으로 실행할지 담당한다.

## BatchTask를 구현한 이유

팀 공통 구조에는 BatchTask 인터페이스가 있었다.

Content 수집 작업도 이 인터페이스를 구현하도록 맞췄다.

이렇게 하면 Scheduler는 각 도메인의 세부 Job 구현을 몰라도 된다.

대략 다음 정도의 정보만 보면 된다.

```text
task name
cron expression
실행할 Job
```

Content 쪽에서는 `ContentExternalSyncBatchTask`가 이 역할을 맡는다.

이 클래스는 Content 수집 Job과 cron 설정을 공통 Scheduler에 알려주는 어댑터에 가깝다.

## Job과 Step 구성

Spring Batch에서는 보통 Job 안에 Step이 있고, Step 안에서 실제 작업을 수행한다.

이번 작업은 복잡한 chunk 처리보다는 외부 API 호출 후 서비스 로직을 실행하는 흐름이기 때문에 Tasklet 방식이 더 단순했다.

그래서 구조는 다음처럼 잡았다.

```text
Job: contentExternalSyncJob
Step: contentExternalSyncStep
Tasklet: ContentExternalSyncTasklet
```

Tasklet 안에서는 직접 외부 API 세부 로직을 작성하지 않고, 기존에 만든 `ContentExternalSyncService.syncExternalContents()`를 호출한다.

이렇게 한 이유는 Batch 코드가 외부 API 매핑이나 Content 저장 정책을 너무 많이 알지 않게 하기 위해서다.

## 외부 API 호출을 DB 트랜잭션 안에 묶지 않은 이유

이번 Step에는 `ResourcelessTransactionManager`를 사용했다.

이 선택의 이유는 외부 API 호출을 DB 트랜잭션 안에 길게 묶지 않기 위해서다.

외부 API 호출은 다음 이유로 오래 걸리거나 실패할 수 있다.

- 네트워크 지연
- 외부 API 응답 지연
- API key 문제
- 일시적인 서버 오류

이런 작업을 DB 트랜잭션 안에 오래 묶으면 DB 커넥션을 불필요하게 오래 점유할 수 있다.

Content 저장 자체에 필요한 트랜잭션은 서비스 계층에서 처리하고, Batch Step은 실행 흐름을 담당하는 쪽으로 역할을 분리했다.

## 실행 결과를 JobExecutionContext에 남긴 이유

수집 작업은 성공했는지 실패했는지만으로는 부족하다.

어떤 결과가 나왔는지도 확인할 수 있어야 한다.

그래서 Tasklet 실행 결과를 JobExecutionContext에 남겼다.

저장한 값은 다음과 같다.

```text
contentExternalSync.createdCount
contentExternalSync.skippedCount
contentExternalSync.failedCount
contentExternalSync.syncedAt
```

이 값들은 나중에 모니터링이나 로그 확인, Actuator 메트릭 보강 시 활용할 수 있다.

초기 구현에서는 커스텀 메트릭까지 바로 노출하지 않고, 우선 배치 실행 결과를 구조적으로 남기는 데 집중했다.

## cron을 환경변수로 분리한 이유

배치 실행 주기는 환경마다 달라질 수 있다.

개발 환경에서는 자주 실행하고 싶을 수 있고, 운영 환경에서는 새벽 시간대에 실행하고 싶을 수 있다.

그래서 cron 값을 코드에 고정하지 않고 환경변수로 분리했다.

```yaml
mopl:
  content:
    batch:
      external-sync:
        cron: ${CONTENT_EXTERNAL_SYNC_CRON:0 0 3 * * *}
```

기본값은 매일 새벽 3시로 두었다.

로컬이나 서버에서는 `.env` 또는 배포 환경변수에 다음 값을 넣어 변경할 수 있다.

```text
CONTENT_EXTERNAL_SYNC_CRON=0 0 3 * * *
```

이렇게 하면 코드를 수정하지 않고도 실행 주기를 바꿀 수 있다.

## 로그 전략

Content 도메인에서 정한 로그 패턴은 다음에 가깝다.

```text
{Domain} {action} {status}. key=value
```

배치 작업에서도 이 패턴에 맞춰 실행 시작, 성공, 실패를 구분해 남겼다.

예시는 다음과 같다.

```text
Content externalSync started.
Content externalSync completed. createdCount=..., skippedCount=..., failedCount=..., syncedAt=...
Content externalSync failed. errorType=..., message=...
```

배치 작업은 백그라운드에서 실행되기 때문에, 문제가 생겼을 때 로그만 보고도 어느 단계에서 실패했는지 알 수 있어야 한다.

## 테스트한 내용

이번 작업에서는 Batch 전체 구조와 Tasklet 동작을 중심으로 테스트했다.

검증한 내용은 다음과 같다.

- ContentExternalSyncBatchTask가 올바른 Job과 cron 값을 제공한다.
- ContentExternalSyncTasklet이 ContentExternalSyncService를 호출한다.
- 수집 결과가 JobExecutionContext에 저장된다.
- 서비스 호출 중 예외가 발생하면 Step이 실패하도록 예외를 다시 던진다.
- 기존 ContentExternalSyncService 테스트와 함께 실행해 외부 수집 정책이 깨지지 않는지 확인한다.
- 공통 BatchScheduler 테스트와 함께 실행해 Scheduler 연동 구조가 깨지지 않는지 확인한다.

실행한 테스트 범위는 다음과 같다.

```text
ContentExternalSyncTaskletTest
ContentExternalSyncBatchTaskTest
ContentExternalSyncServiceTest
BatchSchedulerTest
```

## 작업하면서 조심한 점

이번 작업에서 가장 조심한 부분은 공통 배치 구조를 내 마음대로 바꾸지 않는 것이었다.

Content 도메인 입장에서는 필요한 수집 작업만 연결하면 된다.

공통 Scheduler, BatchTask 인터페이스, Actuator 메트릭 전체 설계는 다른 도메인과도 연결되기 때문에 임의로 크게 수정하면 충돌이 날 수 있다.

그래서 이번 작업은 다음 원칙으로 진행했다.

- 공통 Scheduler 구조는 건드리지 않는다.
- Content 도메인 Job과 Tasklet만 추가한다.
- 외부 API 호출 세부 로직은 기존 ContentExternalSyncService에 위임한다.
- 실행 주기는 환경변수로 조정 가능하게 한다.
- 실행 결과는 추후 모니터링 보강이 가능하도록 JobExecutionContext에 남긴다.

## 후속 보완할 부분

이번 작업으로 Content 외부 수집 Batch의 기본 실행 구조는 연결됐다.

다만 운영 수준으로 더 다듬으려면 다음 내용은 후속 보완이 필요하다.

```text
Actuator 커스텀 메트릭 노출
외부 API별 재시도 정책 세분화
실패한 콘텐츠 후보에 대한 스킵/기록 정책
배치 실행 이력 조회 방식
운영 환경에서 cron 값 관리 방식
```

현재는 중간 발표 전 기능 구현 흐름을 맞추는 단계이므로, 우선 안정적으로 실행 가능한 기본 구조를 만드는 데 집중했다.

## 정리

이번 작업은 외부 콘텐츠 수집 로직을 Spring Batch 실행 구조에 연결하는 작업이었다.

중요했던 점은 Batch 코드 안에 모든 수집 로직을 넣지 않는 것이었다.

외부 API 호출과 저장 정책은 ContentExternalSyncService가 맡고, Batch는 그 서비스를 정해진 시점에 실행하는 역할만 맡도록 분리했다.

이렇게 역할을 나누면 나중에 수집 정책이 바뀌더라도 Batch 실행 구조 전체를 크게 흔들지 않아도 된다.
