---
layout: post
title: Sprint 06 Pagination, Validation, and Global Exception Handling
---

# 2026-03-10

## 1. 오늘 한 것
- Spring Data JPA를 활용한 페이지네이션(Pagination) 적용 및 `PageResponse` 공통 응답 객체 설계.
- `spring-boot-starter-validation` 라이브러리를 이용한 DTO 유효성 검사(Validation) 및 컨트롤러 계층 `@Valid` 적용.
- `@RestControllerAdvice`와 `@ExceptionHandler`를 활용한 전역 예외 처리(Global Exception Handling) 로직 구현.

## 2. 막힌 점
- `MessageRepository`의 페이징 메서드 파라미터 규격이 `Pageable`로 변경된 후, 기존 서비스 로직인 `BasicChannelService`에서 구형 파라미터 방식으로 호출하여 컴파일 에러가 발생함.
- 서버 재실행 시 데이터가 초기화되는 문제에 직면하였으며, `application.yaml`의 `sql.init.mode` 및 `schema.sql` 동작 방식에 대한 환경 설정 이해 부족으로 원인 파악에 지연이 발생함.
- 단순 식별자(UUID)가 아닌 객체 자체를 매핑해야 하는 JPA의 객체 지향적 접근에 대한 적응 과정에서 혼선이 있었음.

## 3. 정리
- **페이지네이션 (Pagination):** 대량의 데이터를 한 번에 가져와 성능 저하가 발생하는 것을 막기 위해, `Pageable`과 `PageRequest`를 이용해 데이터를 지정된 크기(`size`)만큼 분할하여 데이터베이스에서 조회하는 기법.
- **유효성 검사 (Validation):** 클라이언트의 불량 데이터 유입을 차단하기 위한 검증 과정. `@NotBlank`, `@Email`, `@Size` 등의 제약 조건 어노테이션과 `@Valid`를 활용하여 데이터 무결성을 보장.
- **전역 예외 처리 (Global Exception Handling):** 애플리케이션 전역에서 발생하는 에러를 중앙 집중화하여 처리. 예외 발생 시 원인을 추출하여 클라이언트에게 규격화된 `ErrorResponse` 포맷으로 명확히 전달함.

## 4. 코드
- 전역 예외 처리와 유효성 검사 에러 추출을 위한 핵심 로직 예시.

```java
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.validation.FieldError;
import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    // @Valid 검증 실패 시 발생하는 MethodArgumentNotValidException 예외를 낚아챔.
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationExceptions(MethodArgumentNotValidException ex) {
        Map<String, String> validationErrors = new HashMap<>();
        
        // 발생한 모든 필드 에러를 순회하며 필드명과 에러 메시지를 Map에 추출.
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            validationErrors.put(error.getField(), error.getDefaultMessage());
        }

        // 규격화된 공통 응답 객체에 에러 내용을 담아 400 Bad Request와 함께 반환.
        ErrorResponse errorResponse = new ErrorResponse(
                java.time.Instant.now(),
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "Validation failed",
                validationErrors
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorResponse);
    }
}
```