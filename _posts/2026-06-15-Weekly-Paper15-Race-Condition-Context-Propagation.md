---
layout: post
title: "Weekly Paper 15 - Race Condition과 비동기 컨텍스트 전달"
---

# Weekly Paper 15 - Race Condition과 비동기 컨텍스트 전달

이번 Weekly Paper의 주제는 멀티스레드 환경에서 자주 발생하는 `Race Condition`과, 비동기 환경에서 `MDC`, `SecurityContext` 같은 컨텍스트 정보를 다른 스레드로 전달하는 방법이다.

Spring 애플리케이션을 만들다 보면 처음에는 요청 하나를 한 스레드가 끝까지 처리하는 것처럼 느껴진다. 하지만 비동기 처리, 이벤트 리스너, 스케줄러, 스레드 풀, Kafka 같은 기술이 들어오면 하나의 작업이 여러 스레드로 나뉘어 실행될 수 있다. 이때 공유 데이터와 컨텍스트를 제대로 다루지 않으면 예상하지 못한 버그가 생길 수 있다.

## 1. Race Condition이란?

`Race Condition`은 여러 스레드가 같은 데이터에 동시에 접근할 때, 실행 순서나 타이밍에 따라 결과가 달라지는 문제를 말한다.

쉽게 말하면, 여러 사람이 동시에 같은 값을 읽고 수정하는데 서로의 작업을 제대로 확인하지 않아서 결과가 꼬이는 상황이다.

예를 들어 다음과 같은 카운터 코드가 있다고 가정해보자.

```java
class Counter {
    private int count = 0;

    public void increase() {
        count++;
    }
}
```

겉으로 보면 `count++`는 단순히 숫자를 1 증가시키는 코드처럼 보인다. 하지만 실제로는 하나의 동작이 아니라 여러 단계로 나뉜다.

1. 현재 `count` 값을 읽는다.
2. 읽은 값에 1을 더한다.
3. 더한 값을 다시 `count`에 저장한다.

만약 `count`가 0인 상태에서 두 스레드가 동시에 `increase()`를 실행하면 다음과 같은 일이 생길 수 있다.

```text
Thread A: count 값을 읽음 -> 0
Thread B: count 값을 읽음 -> 0
Thread A: 0 + 1 저장 -> count = 1
Thread B: 0 + 1 저장 -> count = 1
```

두 번 증가시켰으니 결과가 2가 되어야 하지만 실제 결과는 1이 된다. Thread B가 Thread A의 변경 결과를 모른 채 예전 값 기준으로 다시 저장했기 때문이다. 이런 문제를 `Lost Update`라고 부른다.

## Race Condition이 발생하는 조건

Race Condition은 보통 다음 조건이 함께 있을 때 발생한다.

- 여러 스레드가 같은 데이터에 접근한다.
- 그 데이터가 변경 가능한 상태이다.
- 하나 이상의 스레드가 데이터를 수정한다.
- 접근 순서를 제어하는 동기화 장치가 없다.

중요한 점은, 멀티스레드 자체가 문제는 아니라는 것이다. 문제가 되는 것은 여러 스레드가 `공유된 변경 가능 상태`를 아무 보호 없이 다룰 때이다.

## Race Condition의 대표적인 형태

가장 대표적인 문제는 앞에서 본 `Lost Update`이다. 여러 스레드가 같은 값을 읽고 수정하다가 일부 변경이 사라지는 상황이다.

또 다른 형태로는 `Check-Then-Act` 문제가 있다.

```java
if (!map.containsKey(key)) {
    map.put(key, value);
}
```

이 코드는 “값이 없으면 넣는다”는 의미이다. 하지만 두 스레드가 동시에 `containsKey`를 확인하면 둘 다 값이 없다고 판단할 수 있다. 그 후 둘 다 `put`을 실행하면 중복 생성, 덮어쓰기, 잘못된 상태가 생길 수 있다.

또한 여러 필드가 함께 변경되어야 하는 객체에서 일부 필드만 먼저 변경되고 다른 스레드가 중간 상태를 읽으면 데이터 정합성이 깨질 수 있다.

## Race Condition 해결 전략

Race Condition을 해결하는 방법은 하나만 있는 것이 아니다. 어떤 데이터를 보호해야 하는지, 성능이 얼마나 중요한지, 데이터가 JVM 안에 있는지 DB에 있는지에 따라 전략이 달라진다.

### 1. 공유 상태를 줄이기

가장 좋은 해결책은 애초에 여러 스레드가 같은 변경 가능한 데이터를 공유하지 않도록 설계하는 것이다.

불변 객체를 사용하거나, 메서드 안의 지역 변수처럼 한 스레드 안에서만 사용하는 데이터를 활용하면 동기화 문제가 크게 줄어든다.

```java
public int calculate(int value) {
    int result = value + 1;
    return result;
}
```

위 코드의 `result`는 메서드를 실행하는 스레드 내부에서만 사용된다. 다른 스레드와 공유되지 않기 때문에 Race Condition이 발생하지 않는다.

### 2. synchronized 사용하기

Java의 `synchronized`를 사용하면 한 번에 하나의 스레드만 특정 코드 영역에 들어오도록 제한할 수 있다.

```java
class Counter {
    private int count = 0;

    public synchronized void increase() {
        count++;
    }
}
```

이렇게 하면 한 스레드가 `increase()`를 실행하는 동안 다른 스레드는 기다린다. 그래서 `count++`가 중간에 끼어들어 실행되는 것을 막을 수 있다.

단점은 동시에 실행할 수 있는 작업이 줄어들기 때문에 성능이 떨어질 수 있다는 점이다. 그래서 필요한 범위에만 최소한으로 적용하는 것이 중요하다.

### 3. Lock 사용하기

`ReentrantLock` 같은 명시적인 Lock을 사용할 수도 있다.

```java
class Counter {
    private final Lock lock = new ReentrantLock();
    private int count = 0;

    public void increase() {
        lock.lock();
        try {
            count++;
        } finally {
            lock.unlock();
        }
    }
}
```

`Lock`은 `synchronized`보다 세밀한 제어가 가능하다. 예를 들어 락 획득을 기다리는 시간 제한을 두거나, 락을 얻지 못했을 때 다른 처리를 할 수도 있다.

하지만 직접 `lock()`과 `unlock()`을 관리해야 하므로 코드가 더 복잡해진다. 특히 `finally`에서 반드시 `unlock()`을 호출해야 한다.

### 4. Atomic 클래스 사용하기

단순한 숫자 증가처럼 작은 단위의 원자적 연산이 필요하다면 `AtomicInteger` 같은 클래스를 사용할 수 있다.

```java
class Counter {
    private final AtomicInteger count = new AtomicInteger(0);

    public void increase() {
        count.incrementAndGet();
    }
}
```

`AtomicInteger`는 내부적으로 CAS(Compare-And-Swap) 같은 방식을 사용해 락 없이도 안전하게 값을 변경할 수 있게 해준다.

단, 여러 값을 함께 변경해야 하는 복잡한 상태에서는 Atomic 클래스만으로 충분하지 않을 수 있다.

### 5. Concurrent Collection 사용하기

여러 스레드가 컬렉션을 함께 사용해야 한다면 `HashMap` 대신 `ConcurrentHashMap` 같은 동시성 컬렉션을 사용할 수 있다.

```java
ConcurrentHashMap<String, Integer> map = new ConcurrentHashMap<>();
map.putIfAbsent("key", 1);
```

특히 `putIfAbsent`, `computeIfAbsent`처럼 확인과 변경을 하나의 원자적 동작으로 제공하는 메서드를 사용하면 `Check-Then-Act` 문제를 줄일 수 있다.

### 6. DB 트랜잭션과 락 활용하기

공유 데이터가 JVM 메모리가 아니라 DB에 있다면 Java의 `synchronized`만으로는 부족하다. 서버 인스턴스가 여러 개라면 각 JVM의 락은 서로를 알지 못하기 때문이다.

이 경우에는 DB 트랜잭션, 유니크 제약조건, 낙관적 락, 비관적 락 등을 활용해야 한다.

예를 들어 같은 유저가 같은 채널에 중복으로 참여하면 안 되는 요구사항이 있다면 애플리케이션 코드에서만 검사하는 것보다 DB에 `UNIQUE` 제약조건을 두는 것이 더 안전하다.

### 7. 큐나 단일 작업자로 순서 보장하기

여러 요청을 동시에 처리하면 꼬일 수 있는 작업은 메시지 큐를 통해 순서대로 처리하는 방식도 사용할 수 있다.

예를 들어 Kafka, RabbitMQ 같은 메시지 큐를 사용하면 특정 키 기준으로 이벤트 순서를 어느 정도 보장하면서 처리할 수 있다. 이 방식은 분산 환경에서 특히 유용하다.

## 2. 비동기 환경에서 컨텍스트 전달이 필요한 이유

Spring에서 `@Async`, 이벤트 리스너, 스케줄러 등을 사용하면 기존 요청을 처리하던 스레드가 아니라 스레드 풀의 다른 스레드에서 작업이 실행될 수 있다.

문제는 `MDC`나 `SecurityContext` 같은 정보가 보통 `ThreadLocal` 기반으로 관리된다는 점이다.

`ThreadLocal`은 말 그대로 현재 스레드에만 연결된 저장소이다. 그래서 요청 스레드에 들어 있던 값이 비동기 스레드로 자동 전달되지 않는다.

```text
HTTP 요청 스레드
- MDC.requestId = abc-123
- SecurityContext = 로그인 사용자 정보

@Async 실행

비동기 작업 스레드
- MDC.requestId 없음
- SecurityContext 없음
```

이렇게 되면 비동기 작업 안에서 로그를 찍어도 Request ID가 사라지고, 현재 로그인한 사용자 정보도 확인할 수 없게 된다.

## MDC란?

`MDC`는 Logback의 `Mapped Diagnostic Context`이다. 로그에 함께 남기고 싶은 부가 정보를 저장하는 용도로 사용한다.

대표적으로 다음과 같은 값을 넣는다.

- Request ID
- 사용자 ID
- 요청 URI
- 추적용 Trace ID

예를 들어 모든 로그에 같은 Request ID가 찍히면 하나의 요청이 어떤 흐름으로 처리되었는지 추적하기 쉬워진다.

하지만 비동기 작업에서 MDC가 전달되지 않으면 중간 로그부터 Request ID가 사라진다. 그러면 장애가 발생했을 때 어떤 요청에서 시작된 작업인지 추적하기 어려워진다.

## SecurityContext란?

`SecurityContext`는 Spring Security에서 현재 인증 정보를 담고 있는 컨텍스트이다.

내부에는 보통 `Authentication` 객체가 들어 있고, 이 객체를 통해 현재 로그인한 사용자, 권한, 인증 여부 등을 확인할 수 있다.

Controller나 Service에서 `@AuthenticationPrincipal` 또는 `SecurityContextHolder`를 통해 현재 사용자를 확인할 수 있는 이유도 이 컨텍스트가 있기 때문이다.

하지만 비동기 스레드로 넘어가면 SecurityContext가 비어 있을 수 있다. 그러면 비동기 로직에서 현재 사용자를 기준으로 감사 로그를 남기거나 권한 정보를 활용해야 할 때 문제가 생긴다.

## 컨텍스트 전달 방법

### 1. TaskDecorator 사용하기

Spring의 `ThreadPoolTaskExecutor`에는 `TaskDecorator`를 설정할 수 있다. `TaskDecorator`는 비동기 작업이 실행되기 전후로 작업을 감싸는 역할을 한다.

이때 요청 스레드의 MDC와 SecurityContext를 복사해두고, 비동기 스레드에서 다시 설정한 뒤 작업을 실행할 수 있다.

```java
@Bean
public TaskDecorator contextCopyingTaskDecorator() {
    return task -> {
        Map<String, String> mdcContext = MDC.getCopyOfContextMap();
        SecurityContext securityContext = SecurityContextHolder.getContext();

        return () -> {
            Map<String, String> previousMdc = MDC.getCopyOfContextMap();
            SecurityContext previousSecurityContext = SecurityContextHolder.getContext();

            try {
                if (mdcContext == null) {
                    MDC.clear();
                } else {
                    MDC.setContextMap(mdcContext);
                }

                SecurityContextHolder.setContext(securityContext);
                task.run();
            } finally {
                if (previousMdc == null) {
                    MDC.clear();
                } else {
                    MDC.setContextMap(previousMdc);
                }

                SecurityContextHolder.setContext(previousSecurityContext);
            }
        };
    };
}
```

핵심은 두 가지이다.

첫째, 비동기 작업을 실행하기 전에 원래 스레드의 컨텍스트를 복사한다.

둘째, 작업이 끝난 뒤에는 반드시 기존 컨텍스트를 복구하거나 비운다.

스레드 풀은 스레드를 재사용한다. 만약 작업이 끝났는데 MDC나 SecurityContext를 지우지 않으면 다음 요청이 이전 요청의 컨텍스트를 잘못 사용할 수 있다. 이것을 컨텍스트 누수라고 볼 수 있다.

### 2. ThreadPoolTaskExecutor에 TaskDecorator 등록하기

`TaskDecorator`만 만들고 끝나는 것이 아니라, 실제 비동기 실행에 사용하는 Executor에 등록해야 한다.

```java
@Bean(name = "eventTaskExecutor")
public Executor eventTaskExecutor(TaskDecorator taskDecorator) {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(4);
    executor.setMaxPoolSize(8);
    executor.setQueueCapacity(100);
    executor.setThreadNamePrefix("event-");
    executor.setTaskDecorator(taskDecorator);
    executor.initialize();
    return executor;
}
```

이후 비동기 메서드에서 해당 Executor를 사용한다.

```java
@Async("eventTaskExecutor")
public void handleEvent() {
    // MDC와 SecurityContext가 전달된 상태로 실행된다.
}
```

### 3. Spring Security의 DelegatingSecurityContext 사용하기

SecurityContext만 전달하면 되는 경우에는 Spring Security가 제공하는 `DelegatingSecurityContextRunnable`, `DelegatingSecurityContextExecutor`, `DelegatingSecurityContextAsyncTaskExecutor` 같은 도구를 사용할 수 있다.

이 방식은 SecurityContext 전달에는 편리하지만, MDC까지 함께 전달해야 한다면 별도의 TaskDecorator를 함께 고려해야 한다.

### 4. CompletableFuture나 ExecutorService에서는 직접 감싸기

Spring의 `@Async`를 사용하지 않고 `CompletableFuture`나 Java의 `ExecutorService`를 직접 사용한다면 컨텍스트도 직접 감싸야 한다.

```java
SecurityContext context = SecurityContextHolder.getContext();
Map<String, String> mdc = MDC.getCopyOfContextMap();

CompletableFuture.runAsync(() -> {
    try {
        SecurityContextHolder.setContext(context);
        if (mdc != null) {
            MDC.setContextMap(mdc);
        }

        // 비동기 작업
    } finally {
        SecurityContextHolder.clearContext();
        MDC.clear();
    }
}, executor);
```

직접 처리할 때도 중요한 원칙은 같다. 실행 전에 전달하고, 실행 후에는 정리해야 한다.

## 주의할 점

컨텍스트를 무조건 모든 비동기 작업에 전달하는 것이 항상 좋은 것은 아니다.

예를 들어 요청과 무관한 배치 작업이나 스케줄러 작업이라면 특정 사용자의 SecurityContext가 없어야 정상일 수 있다. 이런 작업에 이전 요청의 인증 정보가 남아 있으면 오히려 위험하다.

또한 SecurityContext를 전달했다고 해서 그 정보가 영원히 최신이라는 뜻은 아니다. 사용자의 권한이 중간에 변경될 수 있기 때문에 중요한 권한 검사는 DB나 최신 저장소 기준으로 다시 확인하는 것이 더 안전할 수 있다.

그리고 스레드 풀을 사용하는 환경에서는 반드시 컨텍스트를 정리해야 한다. ThreadLocal 값이 남아 있으면 다음 작업에서 다른 요청의 정보가 섞일 수 있다.

## 이번 Sprint Mission과 연결해서 이해하기

이번 미션에서는 파일 업로드, 알림 생성 같은 작업을 Spring Event와 `@Async`로 분리했다. 이때 비동기 리스너는 원래 HTTP 요청을 처리하던 스레드가 아니라 별도의 이벤트 처리 스레드에서 실행된다.

그래서 Request ID가 MDC에 들어 있어도 비동기 스레드에서는 보이지 않을 수 있다. 또한 SecurityContext도 전달하지 않으면 비동기 작업에서 현재 인증 정보를 사용할 수 없다.

이를 해결하기 위해 `AsyncConfig`에서 `TaskExecutor`와 `TaskDecorator`를 구성한다. 이 설정 덕분에 비동기 작업에서도 같은 Request ID로 로그를 남길 수 있고, 필요한 경우 인증 정보도 이어서 사용할 수 있다.

즉, 비동기 처리를 적용할 때는 “작업을 다른 스레드로 넘긴다”에서 끝나면 안 된다. 그 작업이 실행될 때 필요한 문맥 정보도 함께 넘겨야 한다.

## 정리

Race Condition은 여러 스레드가 공유된 변경 가능 데이터를 동시에 다룰 때 실행 타이밍에 따라 결과가 달라지는 문제이다. 단순한 `count++` 같은 코드도 실제로는 읽기, 계산, 저장 단계로 나뉘기 때문에 멀티스레드 환경에서는 안전하지 않을 수 있다.

이를 해결하려면 공유 상태를 줄이고, 필요한 경우 `synchronized`, `Lock`, `Atomic` 클래스, 동시성 컬렉션, DB 트랜잭션과 락, 메시지 큐 같은 전략을 상황에 맞게 사용해야 한다.

MDC와 SecurityContext는 보통 ThreadLocal 기반으로 동작한다. 따라서 비동기 작업처럼 다른 스레드에서 실행되는 코드에는 자동으로 전달되지 않는다. Spring에서는 `TaskDecorator`, `ThreadPoolTaskExecutor`, Spring Security의 `DelegatingSecurityContext` 계열 도구를 활용해 컨텍스트를 전달할 수 있다.

가장 중요한 점은 컨텍스트를 전달한 뒤 반드시 정리해야 한다는 것이다. 스레드 풀은 스레드를 재사용하기 때문에 정리하지 않으면 다른 요청의 로그 정보나 인증 정보가 섞이는 심각한 문제가 생길 수 있다.
