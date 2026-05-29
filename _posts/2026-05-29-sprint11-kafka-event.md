---
layout: post
title: "Kafka로 Spring Event를 외부 메시지로 바꾸기"
---

# Kafka로 Spring Event를 외부 메시지로 바꾸기

## 배경

처음에는 Spring Event만으로도 알림 기능을 만들 수 있었다.

예를 들어 메시지가 생성되면 `MessageCreatedEvent`를 발행하고, 같은 애플리케이션 안의 리스너가 그 이벤트를 받아 알림을 생성한다.

```text
MessageService
  -> MessageCreatedEvent 발행
  -> NotificationRequiredEventListener 실행
  -> 알림 저장
```

이 구조는 서버가 하나일 때는 충분히 단순하고 좋다.

## 문제 상황

미션에서는 알림 기능만 별도의 마이크로서비스로 분리한다고 가정했다.

이렇게 되면 기존 Spring Event만으로는 부족하다.

Spring Event는 같은 애플리케이션 내부에서만 전달된다.

즉, 서버가 두 개로 나뉘면 메인 서버에서 발행한 Spring Event를 알림 서버가 바로 받을 수 없다.

```text
메인 서버 안의 Spring Event
  -> 같은 서버 안에서는 전달 가능
  -> 다른 서버로는 자동 전달 불가
```

그래서 서버 외부에 이벤트를 저장하고 전달해주는 시스템이 필요하다.

이번에는 그 역할을 Kafka가 맡는다.

## Kafka가 하는 일

Kafka는 메시지를 토픽에 저장하고, 필요한 서비스가 그 토픽을 구독해서 메시지를 가져가게 해준다.

간단히 말하면 서버 밖에 있는 이벤트 우체통이다.

```text
메인 서비스
  -> Kafka 토픽에 이벤트 발행

알림 서비스
  -> Kafka 토픽을 구독
  -> 이벤트를 읽고 알림 생성
```

이렇게 하면 메인 서비스와 알림 서비스가 같은 서버 안에 있지 않아도 된다.

## 이번 프로젝트의 구조

이번 작업에서는 기존 Spring Event를 완전히 버린 것이 아니라, Spring Event를 Kafka 메시지로 바꾸는 중계 리스너를 만들었다.

핵심 파일은 다음과 같다.

- `KafkaProduceRequiredEventListener`
- `NotificationRequiredTopicListener`
- `S3UploadFailedEvent`
- `docker-compose-kafka.yaml`

전체 흐름은 다음과 같다.

```text
ApplicationEventPublisher
  -> Spring Event 발행
  -> KafkaProduceRequiredEventListener
  -> KafkaTemplate.send(topic, payload)
  -> Kafka Broker
  -> NotificationRequiredTopicListener
  -> 알림 저장
```

## KafkaProduceRequiredEventListener

`KafkaProduceRequiredEventListener`는 Spring Event를 Kafka 메시지로 변환한다.

예를 들어 `MessageCreatedEvent`가 발생하면 객체를 JSON 문자열로 바꾼 뒤 Kafka 토픽으로 보낸다.

```text
MessageCreatedEvent 객체
  -> ObjectMapper로 JSON 변환
  -> discodeit.MessageCreatedEvent 토픽으로 전송
```

이번에 사용한 토픽은 다음과 같다.

- `discodeit.MessageCreatedEvent`
- `discodeit.RoleUpdatedEvent`
- `discodeit.S3UploadFailedEvent`

## NotificationRequiredTopicListener

`NotificationRequiredTopicListener`는 Kafka 토픽을 구독한다.

Kafka에서 JSON 문자열을 받으면 다시 이벤트 객체로 바꾸고, 기존 알림 생성 로직을 실행한다.

```text
Kafka JSON 메시지
  -> ObjectMapper로 이벤트 객체 변환
  -> 알림 대상 조회
  -> Notification 저장
```

이 리스너는 실제로는 같은 프로젝트 안에 있지만, 미션에서는 별도의 알림 서비스라고 가정한다.

중요한 점은 이제 알림 생성 로직이 Spring Event 직접 수신이 아니라 Kafka 메시지 수신으로 동작한다는 것이다.

## 기존 리스너 비활성화

기존 `NotificationRequiredEventListener`는 비활성화했다.

만약 기존 리스너와 Kafka 리스너가 동시에 동작하면 같은 이벤트로 알림이 두 번 생성될 수 있다.

그래서 기본 흐름은 Kafka 기반 리스너로 바꿨다.

## Docker로 Kafka 실행

Kafka는 Docker Compose로 실행했다.

```text
docker compose -f docker-compose-kafka.yaml up -d
```

실행 후 브로커 컨테이너 이름은 `broker`이다.

토픽 확인은 다음 명령으로 했다.

```text
docker exec broker /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server broker:29092
```

확인된 토픽은 다음과 같다.

```text
__consumer_offsets
discodeit.MessageCreatedEvent
discodeit.RoleUpdatedEvent
discodeit.S3UploadFailedEvent
```

## 실제 메시지 발행 확인

메시지 생성 API를 호출한 뒤 Kafka Console Consumer로 실제 메시지를 확인했다.

```text
docker exec broker /opt/kafka/bin/kafka-console-consumer.sh \
  --topic discodeit.MessageCreatedEvent \
  --from-beginning \
  --bootstrap-server broker:29092 \
  --timeout-ms 5000
```

확인된 메시지는 다음과 같다.

```json
{"messageId":"14f388c1-8112-4911-9aef-aeeeabd7bcd7","channelId":"f6ba2229-f3e9-4180-a0c0-91a8b904437c","channelName":"이춘배","authorId":"35e9bd77-1bda-4ce3-92b1-ffb66ace32dd","authorUsername":"cachecheck_7bccc612","content":"Kafka verification new code 152156"}
```

이 메시지가 PR에서 가장 중요한 검증 증거다.

토픽이 생긴 것만으로는 부족할 수 있다. 실제 이벤트 JSON이 토픽에서 읽혔다는 것이 Spring Event가 Kafka로 발행됐다는 직접 증거다.

## 테스트와 확인 방법

코드 검증은 전체 테스트로 확인했다.

```text
./gradlew.bat test
```

Kafka 동작 검증은 다음 순서로 했다.

```text
1. Kafka Docker 컨테이너 실행
2. 애플리케이션 실행
3. 메시지 생성 API 호출
4. Kafka 토픽 목록 확인
5. Kafka Console Consumer로 메시지 확인
```

## 배운 점

Spring Event는 같은 서버 안에서 코드를 분리할 때 좋다.

하지만 서버가 여러 개로 나뉘면 Spring Event만으로는 부족하다.

Kafka는 서버 밖에서 이벤트를 보관하고 전달해주는 역할을 한다.

그래서 Kafka를 사용하면 메인 서비스와 알림 서비스를 더 느슨하게 연결할 수 있다.

이번 작업에서 핵심은 Kafka 설정 자체보다 구조의 변화였다.

```text
기존: 같은 서버 안에서 이벤트 처리
변경: Kafka를 통해 외부 메시지로 이벤트 전달
```

이 차이가 분산 환경에서 중요하다.
