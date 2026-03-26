---
layout: post
title: "Spring Boot 컨트롤러 코드 해체 및 동작 원리 이해"
---

# 2026-03-26

## 오늘 한 것
- `@RestController` 등 클래스 레벨의 어노테이션이 실제로 컴퓨터에 내리는 구체적인 지시 사항 파악
- `create` 메서드의 입력값(요청 데이터 및 파일)과 반환값(상태 코드 및 응답 데이터)의 구조 매핑
- 복잡한 비유나 추상적인 전문 용어를 배제하고, 코드 각 줄의 '실제 행동'을 직관적인 문장으로 번역 및 스피치 대본화

## 막힌 점
- 스프링 프레임워크의 동작 원리를 설명할 때 흔히 쓰이는 비유(리모컨, 공장, 택배 상자 등)가 오히려 본질적인 이해를 방해함
- `DTO`, `REST API`, `의존성 주입` 등 추상적인 기술 용어들이 구체적으로 어떤 형태의 코드로 구현되는지 상상하기 어려웠음
- 코드를 덩어리로 볼 때는 흐름이 보이지 않았고, 파라미터가 여러 개로 나뉘어 들어오는 이유(`@RequestPart`)를 파악하는 데 시간이 걸림

## 정리
- 모르는 개념을 마주했을 때 억지 비유를 찾기보다, '원래는 어떤 코드를 써야 하는데, 이 기능을 쓰면 컴퓨터가 어떻게 대신 처리해주는가'로 접근해야 직관적으로 이해할 수 있음
- **입력값:** 메서드 괄호 `()` 안에 선언된 변수들로, 외부 사용자가 서버로 던져주는 정보(`userCreateRequest` 텍스트, `profile` 사진 파일)를 뜻함
- **반환값:** `return` 키워드를 통해 메서드가 뱉어내는 최종 결과물로, 작업 성공 여부(201 CREATED)와 완성된 정보(`UserDto`)를 묶어 반환함
- 코드 한 줄 한 줄은 컴퓨터와 프레임워크에게 내리는 매우 구체적이고 물리적인 행동 지침(방어, 변환, 위임, 응답)임을 명확히 인지함

## 코드
// 개발자가 시스템의 기록(로그)을 남길 때 필요한 준비 코드를 자동으로 만들어줍니다.
@Slf4j

// 필수적인 변수(final)들에 대해, 이 클래스가 실행될 때 외부에서 값을 받아와서 자동으로 채워주는 코드를 만들어줍니다.
@RequiredArgsConstructor

// 이 클래스는 사용자에게 보여줄 웹 화면이 아니라, 순수하게 데이터(JSON 형태)만 주고받는 역할을 한다고 선언합니다.
@RestController

// 외부에서 이 클래스에 접근하려면, 요청 주소창에 "/api/users"라는 주소를 거쳐야 한다고 지정합니다.
@RequestMapping("/api/users")
public class UserController implements UserApi {

// 이 컨트롤러가 작업을 처리하려면 UserService의 기능이 필수적이므로 변수를 선언하고,
// final을 붙여서 중간에 다른 것으로 바뀌지 않도록 고정합니다.
private final UserService userService;
private final UserStatusService userStatusService;

// 새로운 데이터를 '만들 때' 사용하는 POST 방식을 사용하며,
// 글자뿐만 아니라 '파일'이 포함된 형태의 요청만 받아들이겠다는 규칙을 정합니다.
@PostMapping(consumes = {MediaType.MULTIPART_FORM_DATA_VALUE})
@Override

// 작업 결과물인 사용자 정보(UserDto)와 상태 정보(201 성공 등)를 함께 묶어서 반환하겠다는 의미입니다.
public ResponseEntity<UserDto> create(

      // 외부에서 보낸 데이터 중 "userCreateRequest"라는 이름의 데이터만 가져와 변수에 담습니다. (입력값 1)
      @RequestPart("userCreateRequest") UserCreateRequest userCreateRequest,
      
      // 외부에서 보낸 "profile" 사진 파일을 가져오며, 사진이 없어도(required=false) 오류 없이 통과시킵니다. (입력값 2)
      @RequestPart(value = "profile", required = false) MultipartFile profile
) {

    // 누가 가입 요청을 보냈는지 사용자 이름을 시스템 기록으로 남깁니다.
    log.info("Request to create user with username: {}", userCreateRequest.username());
    
    // 사진 파일이 비어있을 때 발생하는 에러를 막고, 사진이 존재할 때만 내부 로직을 실행해 데이터를 쓰기 좋게 가공합니다.
    Optional<BinaryContentCreateRequest> profileRequest = Optional.ofNullable(profile)
        .flatMap(this::resolveProfileRequest);
        
    // 텍스트 데이터와 가공된 사진 데이터를 실제 저장 작업을 수행하는 UserService에게 넘겨 사용자를 만들고, 결과를 돌려받습니다.
    UserDto createdUser = userService.create(userCreateRequest, profileRequest);
    
    // 최종적으로 201(CREATED) 상태 코드와 함께, 완성된 사용자 정보를 응답 데이터에 담아 보내줍니다. (반환값)
    return ResponseEntity
        .status(HttpStatus.CREATED)
        .body(createdUser);
}
}