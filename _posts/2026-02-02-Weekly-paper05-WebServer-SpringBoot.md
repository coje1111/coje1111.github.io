---
layout: post
title: "Weekly Paper #5 Web Server & Spring Boot"
---

# 2026-02-02

## Q1. 웹 서버(Web Server)와 WAS(Web Application Server)의 차이, Spring Boot 내장 톰캣의 역할

웹 서버(Web Server)는 HTML, CSS, 이미지와 같은 **정적인 자원**을 클라이언트에게 전달하는 역할을 한다.  
요청에 따라 파일을 그대로 응답하며, 비즈니스 로직을 직접 처리하지는 않는다.

WAS(Web Application Server)는 **동적인 요청을 처리하는 서버**로,  
비즈니스 로직을 실행하고 데이터베이스와 연동하여 동적인 결과를 생성한다.  
Java 환경에서는 Servlet을 실행할 수 있는 서버가 WAS에 해당한다.

Spring Boot의 내장 톰캣(Tomcat)은 **WAS에 해당한다**.  
톰캣은 Servlet 컨테이너로서 HTTP 요청을 받아 Spring 애플리케이션을 실행하고,  
컨트롤러와 서비스 로직을 통해 동적인 응답을 생성한다.  
Spring Boot는 톰캣을 내장함으로써 별도의 WAS 설치 없이도 웹 애플리케이션 실행이 가능하도록 한다.

---

## Q2. Spring Boot에서의 Bean 등록 방법과 장단점

Spring Boot에서는 다양한 방식으로 Bean을 등록할 수 있으며,  
자동 등록 방식과 수동 등록 방식으로 나눌 수 있다.

### 1. `@Component` 계열 어노테이션
`@Component`, `@Service`, `@Repository`, `@Controller` 등을 클래스에 선언하면  
컴포넌트 스캔을 통해 자동으로 Bean으로 등록된다.

- 장점: 설정이 간단하고 코드가 직관적이다.
- 단점: Bean 생성 과정을 세밀하게 제어하기 어렵다.

### 2. `@Configuration` + `@Bean`
설정 클래스에서 메서드를 통해 Bean을 직접 생성하여 등록하는 방식이다.

- 장점: 객체 생성과 의존 관계를 명확하게 제어할 수 있다.
- 단점: 설정 코드가 늘어나 관리 부담이 생길 수 있다.

### 3. `@ComponentScan`
지정한 패키지 범위 내의 컴포넌트를 스캔하여 Bean으로 등록하는 방식이다.

- 장점: Bean 관리 범위를 명확히 할 수 있다.
- 단점: 스캔 범위 설정이 잘못되면 Bean 누락 문제가 발생할 수 있다.

---

## 정리
- 웹 서버는 정적 자원 제공, WAS는 동적 요청 처리를 담당한다.
- Spring Boot의 내장 톰캣은 WAS 역할을 수행한다.
- Bean 등록은 자동 등록이 간편하고, 수동 등록은 제어가 필요한 경우에 적합하다.
