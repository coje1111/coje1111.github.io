---
layout: post
title: "AWS ECS 기반 Spring Boot 무중단 배포 트러블슈팅 및 Docker 멀티플랫폼 빌드 완벽 해체"
---

# 2026-04-08

## 오늘 한 것
- AWS ECS 에러 로그를 분석하여 Tomcat 컨테이너 포트(80) 매핑 상태를 검증하고, EC2 보안 그룹 대상을 재조정하여 '연결 거부(Connection Refused)' 문제를 해결함.
- ECS 태스크 프로비저닝 지연(Pending) 원인이 프리티어 환경의 메모리 부족(OOM)임을 파악하고, 기존 태스크를 수동 중지하여 롤링 업데이트 병목을 해소함.
- 로컬 빌드 시 발생하는 DB 연결 테스트 에러를 우회(`-x test`)하여 빌드를 성공시킴.
- Docker `buildx`를 활용하여 단일 명령어로 멀티 플랫폼(`linux/amd64`, `linux/arm64`) 이미지를 빌드하고, 2개의 태그(`latest`, `1.2-M8`)를 AWS ECR에 동시 푸시함.

## 막힌 점
- EC2 배포 중 OOM 이슈 발생하여 메모리 값 수정 후 배포 진행과정 중 수정한 파일을 S3 버킷에 업데이트 해야 하는걸 늦게 알아차려 2시간 고생함.
- AWS ECS UI에서는 '배포 완료'라고 표시되었으나 실제로는 500 에러/접속 불가가 떠서 혼란스러웠음. 인프라 배포 성공과 애플리케이션(컨테이너 내부) 구동 성공은 별개라는 점을 간과함.
- 기존의 단일 플랫폼용 `docker build` 명령어로는 요구사항인 '멀티 플랫폼 지원'과 '다중 태그 동시 적용'을 한 번에 해결할 수 없어 배포 스크립트 작성에 난항을 겪음.

## 정리
- **보안 그룹의 본질:** 클라우드 네트워크에서 방화벽(보안 그룹)은 적용 대상(Target ID)이 정확히 일치하지 않으면 아무리 룰을 열어도 소용이 없다. 반드시 EC2에 연결된 ENI의 실제 보안 그룹을 교차 검증해야 함.
- **UI를 믿지 말고 로그를 믿어라:** AWS 배포 상태가 '완료'라는 것은 '도커 이미지 실행'까지만 보장할 뿐, 내부 자바 코드가 에러 없이 돌아가는지(Health Check) 확인하려면 무조건 컨테이너 로그를 봐야 함.
- **
- **최적화된 컨테이너 배포:** `docker buildx` 모듈을 사용하면 내 컴퓨터 아키텍처에 종속되지 않고 크로스 플랫폼 이미지를 한 번에 구워내어 AWS 창고(ECR)로 직배송(`--push`)할 수 있음을 체득함.

## 코드


// 1. 로컬 DB 의존성 없는 클린 빌드 (테스트 스킵)
./gradlew clean build -x test

// 2. docker 로그인

aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws/개인

// 3. linux/amd64 멀티플랫폼 동시 태그 push

docker buildx build --platform linux/amd64,linux/arm64 -t public.ecr.aws/개인/db명:latest -t public.ecr.aws/개인/db명:1.2-M8 --push .