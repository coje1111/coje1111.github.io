---
layout: post
title: "[Java/객체지향] 강의는 input, 나는 scanner인데 둘 다 작동하는 이유"
log_type: "기술 학습"
topic: "Java/객체지향"
---

## 이름이 달라서 잘못 작성한 줄 알았다

입력을 받는 문제에서 강의는 `input.nextInt()`를 사용했지만, 나는 `scanner.nextInt()`를 사용했다. 프로그램은 정상 작동했는데도, 강의와 다른 이름을 쓴 것이 잘못인지 궁금했다.

두 코드는 입력 도구에 붙인 변수 이름만 다르다는 것을 알게 되었다.

## Scanner와 scanner는 역할이 다르다

```java
Scanner scanner = new Scanner(System.in);
int age = scanner.nextInt();
```

- `Scanner`: Java가 제공하는 클래스 이름. 여기서는 입력 도구의 종류다.
- `scanner`: 내가 정한 변수 이름. 만든 입력 도구를 이 이름으로 사용한다.
- `nextInt()`: 그 도구가 제공하는 정수 입력 기능이다.

강의에서는 같은 역할의 변수에 `input`이라는 이름을 붙였다.

```java
Scanner input = new Scanner(System.in);
int age = input.nextInt();
```

두 예제 모두 소스 상단에 `import java.util.Scanner;`가 필요하며, 같은 방식으로 정수를 입력받는다. `input` 자체는 Java가 정해 놓은 기능 이름이 아니다.

## 왜 input이라는 이름을 쓸까?

`input`은 영어로 입력이라는 뜻이므로, 입력받는 역할을 드러낸다. `scanner`는 사용하는 도구가 Scanner라는 점을 보여준다.

특정 상황에는 반드시 `input`을 써야 하는 규칙이 있는 것은 아니다. 이 예제에서는 둘 다 자연스러운 이름이고, 다른 것은 변수에 붙인 이름뿐이다.

## 중요한 것은 선언한 이름으로 사용하는 것

```java
Scanner scanner = new Scanner(System.in);

scanner.nextInt(); // 선언한 이름으로 사용한다.
// input.nextInt(); // input을 따로 선언하지 않았다면 컴파일 오류가 난다.
```

변수 이름을 바꾸면 사용하는 곳도 함께 바꿔야 한다. Java는 대소문자를 구분하므로 `Scanner`와 `scanner`도 구별해야 한다.

앞으로 강의에 다른 이름이 나오면, 먼저 선언 부분에서 **정해진 클래스·메서드 이름인지, 개발자가 붙인 변수 이름인지** 확인하면 된다. 연습할 때는 입력 도구의 이름을 `scanner`로 통일해도 괜찮고, 음식 이름이나 가격처럼 담는 값이 분명한 변수는 `foodName`, `foodPrice`처럼 역할이 보이게 지으면 된다.
