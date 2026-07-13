---
layout: post
title: "[모두의 플리] Spring Batch 처리 결과를 Actuator와 Prometheus로 모니터링하기"
date: 2026-07-13 09:20:00 +0900
---

# [모두의 플리] Spring Batch 처리 결과를 Actuator와 Prometheus로 모니터링하기

## 배경

콘텐츠 외부 동기화 Batch에는 실행 결과 로그와 Spring Batch `ExecutionContext`가 있었다.

하지만 운영 중인 애플리케이션에서 최근 성공·실패 추세나 누적 처리량을 확인하려면 로그를 매번 직접 검색해야 한다.

그래서 배치 결과를 Micrometer 메트릭으로 기록하고 Spring Boot Actuator와 Prometheus 형식으로 조회할 수 있게 했다.

이번 작업의 핵심은 메트릭을 많이 만드는 것이 아니라, 이미 존재하는 공통 지표와 콘텐츠 전용 지표의 책임을 나누는 것이었다.

## 기존 공통 배치 메트릭 확인

프로젝트의 공통 `BatchScheduler`에는 이미 다음 메트릭이 있었다.

```text
mopl.batch.execution.status
mopl.batch.execution.time
```

`mopl.batch.execution.status`는 Job 성공과 실패 횟수를 기록한다.

```text
jobName=contentExternalSyncJob
status=SUCCESS 또는 FAIL
```

`mopl.batch.execution.time`은 Job 실행 소요 시간을 Timer로 기록한다.

Content 도메인에서 같은 성공·실패와 실행시간 메트릭을 다시 만들면 같은 의미의 지표가 중복된다.

그래서 기존 공통 메트릭은 그대로 재사용하고, 빠져 있던 성공·예외 경로의 Timer 테스트만 보강했다.

## Tasklet 처리 건수에는 별도 메트릭이 필요했다

Spring Batch는 ItemReader, ItemProcessor, ItemWriter를 사용하는 Chunk 방식에서 읽기·처리·쓰기 관련 정보를 제공할 수 있다.

하지만 콘텐츠 외부 동기화 Step은 `Tasklet` 방식이다.

Tasklet 내부에서 외부 API를 호출하고 서비스가 여러 종류의 처리 결과를 한 번에 반환한다.

따라서 이번 작업에서 필요한 수집·필터링·생성 건수는 별도의 커스텀 메트릭으로 기록해야 했다.

## 하나의 Counter와 result 태그 사용

콘텐츠 동기화 메트릭명은 다음 하나로 통일했다.

```text
mopl.content.external.sync.items
```

처리 결과는 `result` 태그로 구분한다.

```text
jobName=contentExternalSyncJob
result=fetched
result=accepted
result=filtered
result=created
result=skipped
result=failed
```

결과마다 서로 다른 메트릭 이름을 만드는 대신 하나의 이름과 고정된 태그 값을 사용하면 조회와 대시보드 구성이 단순해진다.

## 고카디널리티 태그를 피한 이유

메트릭 태그에는 값의 종류가 제한된 정보만 넣어야 한다.

예를 들어 다음 값은 실행할 때마다 계속 달라진다.

```text
externalId
contentId
jobExecutionId
syncedAt
```

이런 값을 태그로 사용하면 시계열 종류가 계속 늘어나 메모리 사용량과 Prometheus 저장 비용이 커질 수 있다.

그래서 이번 메트릭은 값이 고정된 `jobName`과 `result`만 태그로 사용했다.

개별 콘텐츠 ID나 실행 시각은 로그와 Batch 실행 이력에서 확인한다.

## Counter는 실행별 값이 아니라 누적값이다

Micrometer Counter는 애플리케이션 프로세스가 실행되는 동안 누적된다.

예를 들어 첫 번째 실행에서 10개를 생성하고 두 번째 실행에서 4개를 생성했다면 Counter는 14가 된다.

```text
첫 실행 created=10
두 번째 실행 created=4
Counter created=14
```

따라서 Counter만 보고 특정 실행에서 몇 개를 처리했는지 판단하면 안 된다.

실행 1회 단위의 정확한 결과는 기존 로그와 `ExecutionContext`를 사용한다.

```text
메트릭: 장기적인 누적량과 추세
로그: 실행 과정과 오류 원인
ExecutionContext: 특정 Job 실행의 정확한 결과
```

세 가지는 서로 대체하는 기능이 아니라 목적이 다르다.

## 결과가 있을 때만 기록하기

메트릭은 `ContentExternalSyncService`가 정상적으로 `ExternalContentSyncResult`를 반환한 뒤 기록한다.

```text
동기화 성공
  -> ExecutionContext 저장
  -> 커스텀 메트릭 기록
  -> 완료 로그

외부 API 호출 중 전체 실패
  -> 결과 객체 없음
  -> 처리 건수 메트릭 기록 안 함
  -> 공통 Job 실패 메트릭 기록
```

결과를 얻기 전에 Job이 실패했는데 `failed=1` 같은 임의 값을 기록하면 실제 처리 수와 맞지 않게 된다.

그래서 전체 Job 실패 여부는 공통 상태 메트릭에 맡기고, 콘텐츠 처리 건수는 정상적으로 계산된 결과가 있을 때만 기록한다.

0건인 결과도 메트릭 시계열 자체는 등록해 조회할 수 있게 했다.

## Actuator와 Prometheus 노출

프로젝트에는 이미 Actuator와 Prometheus Registry 의존성이 있었고 다음 엔드포인트가 노출되어 있었다.

```text
/actuator/health
/actuator/metrics
/actuator/prometheus
```

Metrics Endpoint에서는 특정 메트릭을 JSON으로 확인할 수 있다.

```text
/actuator/metrics/mopl.content.external.sync.items
```

Prometheus Endpoint에서는 이름이 다음처럼 변환되어 노출된다.

```text
mopl_content_external_sync_items_total
```

Prometheus 서버가 이 엔드포인트를 주기적으로 수집하면 시간에 따른 처리량 변화나 실패 증가를 대시보드로 만들 수 있다.

이번 작업은 애플리케이션이 메트릭을 제공하는 단계까지이며, Prometheus 서버와 Grafana 대시보드 구축은 포함하지 않았다.

## 관리용 엔드포인트 권한 제한

Health Endpoint는 서비스 상태 확인에 사용하기 위해 공개 상태를 유지했다.

반면 Metrics와 Prometheus Endpoint에는 애플리케이션 내부 지표가 포함될 수 있으므로 ADMIN 권한으로 제한했다.

```text
/actuator/health              -> 공개
/actuator/metrics             -> ADMIN
/actuator/metrics/**          -> ADMIN
/actuator/prometheus          -> ADMIN
```

일반 로그인 사용자가 관리용 지표를 조회할 필요는 없기 때문이다.

## 테스트한 내용

메트릭 값뿐 아니라 실제 Actuator 엔드포인트와 권한까지 검증했다.

- 동기화 결과의 여섯 건수가 각각 올바른 Counter에 더해진다.
- 여러 실행의 결과가 누적된다.
- 0건 결과도 시계열이 등록된다.
- null 결과는 기록하지 않는다.
- Tasklet 성공 시에만 콘텐츠 처리 메트릭을 기록한다.
- 동기화 실패와 중복 Job 차단 시 처리 건수를 기록하지 않는다.
- 공통 Job 성공·예외 경로에서 실행시간 Timer가 기록된다.
- 일반 사용자는 Metrics와 Prometheus Endpoint에 접근할 수 없다.
- ADMIN은 Metrics JSON에서 콘텐츠 메트릭을 조회할 수 있다.
- ADMIN은 Prometheus 형식에서도 같은 메트릭을 조회할 수 있다.
- Health Endpoint는 인증 없이 실제 Health 응답까지 도달한다.

전체 프로젝트 테스트도 함께 실행했다.

이번 작업과 관련된 Content Batch, Scheduler, Actuator 테스트는 통과했다.

다만 다른 도메인의 테스트 환경 설정과 스키마 검증 문제로 전체 343개 중 35개가 별도로 실패했다. 프로젝트 설정의 `ignoreFailures` 때문에 출력의 `BUILD SUCCESSFUL`만 보지 않고 실제 실패 목록을 따로 확인했다.

## 배운 점

모니터링은 로그를 많이 남기는 것과 같지 않다.

먼저 무엇을 누적해서 볼지, 무엇을 실행별로 볼지, 어떤 정보가 태그에 적합한지를 정해야 한다.

```text
Job 성공·실패와 실행시간 -> 공통 배치 메트릭
콘텐츠 처리 결과 -> Content 커스텀 메트릭
실행별 정확한 건수 -> ExecutionContext
상세 실패 원인 -> 로그
```

또 메트릭을 노출하는 것만큼 누가 조회할 수 있는지 제한하는 것도 중요했다.

## 정리

이번 작업으로 콘텐츠 외부 동기화 Batch의 수집·필터링·생성·스킵·실패 건수를 누적 메트릭으로 확인할 수 있게 됐다.

기존 공통 Job 메트릭은 재사용하고, Tasklet에서만 알 수 있는 처리 결과를 별도 Counter로 보완했다.

그리고 Actuator Metrics와 Prometheus Endpoint를 ADMIN 권한으로 제한해 운영 지표를 안전하게 조회할 수 있는 기반을 마련했다.
