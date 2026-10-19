---
layout: post
title: "[Java/객체지향] 상품 구매 문제 복기: 상품명이 사라진 이유와 반복문 정리"
log_type: "기술 학습"
topic: "Java/객체지향"
---

## 처음 작성한 코드와 강의 정답 비교하기

상품 입력, 결제, 종료 메뉴를 반복하는 문제를 풀었다. 상품명·가격·수량을 받고 합계를 누적하는 코드를 작성했지만, 출력할 때 상품명만 비어 있었다. 메뉴를 보여주고 옵션을 읽는 코드도 여러 곳에 반복되어 길게 느껴졌다.

자동완성으로 작성한 부분도 있어 변수 위치와 실행 순서를 다시 확인하고 싶었다. 처음 작성한 코드와 강의 정답에 같은 입력을 넣어 비교하면서, 실제 오류와 단순한 구조·이름 차이를 구분했다.

## 두 코드 전문

먼저 처음 작성한 코드와 강의 정답을 함께 둔다. 처음 코드의 오류도 그대로 남겨, 아래 분석에서 어느 줄을 말하는지 확인할 수 있도록 했다. 들여쓰기와 긴 출력문의 줄바꿈만 정돈했다.

### 내가 처음 작성한 코드

```java
package scanner.ex;

import java.util.Scanner;

public class ScannerWhileEx4 {

    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);

        System.out.println("1: 상품 입력, 2: 결제, 3: 프로그램 종료");
        int option = input.nextInt();
        int totalPrice = 0;

        while (option != 0) {
            if (option == 1) {
                System.out.print("상품명을 입력하세요: ");
                String productName = input.nextLine();
                input.nextLine(); // 개행 문자 제거

                System.out.print("상품의 가격을 입력하세요: ");
                int price = input.nextInt();

                System.out.print("구매 수량을 입력하세요: ");
                int quantity = input.nextInt();

                System.out.println("상품명: " + productName
                        + "가격: " + price + " 수량: " + quantity);

                totalPrice += price * quantity;
                System.out.println("1: 상품 입력, 2: 결제, 3: 프로그램 종료");
                option = input.nextInt();
            } else if (option == 2) {

                System.out.println("총 비용: " + totalPrice);
                System.out.println("1: 상품 입력, 2: 결제, 3: 프로그램 종료");
                option = input.nextInt();
            } else if (option == 3) {
                System.out.println("프로그램을 종료합니다.");
                break;
            } else {
                System.out.println("올바른 옵션을 선택해주세요.");
                System.out.println("1: 상품 입력, 2: 결제, 3: 프로그램 종료");
                option = input.nextInt();
            }
        }
    }
}
```

### 강의의 정답 코드

```java
package scanner.ex;

import java.util.Scanner;

public class ScannerWhileEx4 {

    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);

        int totalCost = 0;

        while (true) {
            System.out.println("1: 상품 입력, 2: 결제, 3: 프로그램 종료");
            int option = input.nextInt();

            if (option == 1) {
                input.nextLine(); // 개행 문자 제거

                System.out.print("상품명을 입력하세요: ");
                String productName = input.nextLine();

                System.out.print("상품의 가격를 입력하세요: ");
                int price = input.nextInt();

                System.out.print("구매 수량을 입력하세요: ");
                int quantity = input.nextInt();

                totalCost += price * quantity;
                System.out.println("상품명:" + productName
                        + ", 가격: " + price + ", 수량: " + quantity
                        + ", 합계: " + (price * quantity));

            } else if (option == 2) {

                System.out.println("총 비용: " + totalCost);
                totalCost = 0;

            } else if (option == 3) {
                System.out.println("프로그램을 종료합니다.");
                break;
            } else {
                System.out.println("올바른 옵션을 선택해주세요.");
            }
        }
    }
}
```

## 무엇이 맞았고 무엇을 고쳐야 했을까?

| 항목 | 처음 작성한 코드에 대한 판단 |
|---|---|
| `totalPrice`를 반복문 밖에서 0으로 초기화 | 맞음. 여러 상품의 금액이 이어서 쌓여야 한다. |
| 상품명·가격·수량을 상품 입력 분기 안에 선언 | 맞음. 이번 상품을 처리할 때만 필요하다. |
| `totalPrice += price * quantity` | 맞음. 상품별 금액을 누적한다. |
| 옵션 3에서 안내 후 `break` | 맞음. 반복문을 빠져나가 종료한다. |
| 상품명 저장 후 `nextLine()`을 한 번 더 호출 | 오류. 빈 문자열을 저장하고 실제 상품명은 버린다. |
| 결제 후 합계를 그대로 유지 | 요구사항 누락. 다음 구매를 위해 0으로 초기화해야 한다. |
| `while (option != 0)` | 요구사항 불일치. 잘못된 옵션인 0을 종료 신호로 취급한다. |
| 분기마다 메뉴 출력과 옵션 입력 반복 | 동작은 가능하지만 중복이 있어 수정하기 번거롭다. |
| 상품별 `합계` 출력 없음 | 제시된 실행 예시와 다른 부분이다. 예시까지 맞추려면 추가한다. |

강의의 `totalCost`와 내 코드의 `totalPrice`는 변수 이름만 다르다. 어느 이름을 쓰든 같은 의미로 일관되게 사용하면 된다.

## 상품명은 출력 문제가 아니라 입력 순서 문제였다

처음 코드는 다음 순서였다.

```java
System.out.print("상품명을 입력하세요: ");
String productName = input.nextLine();
input.nextLine(); // 개행 문자 제거라고 생각했던 줄
```

옵션으로 `1`을 입력하고 엔터를 누른 상황을 따라가면 다음과 같다.

1. `nextInt()`가 옵션 숫자 1을 읽고 엔터는 남긴다.
2. 첫 번째 `nextLine()`이 남은 엔터를 만나 빈 문자열 `""`을 `productName`에 저장한다.
3. 두 번째 `nextLine()`이 실제 상품명을 읽지만, 반환값을 변수에 저장하지 않아 버린다.
4. 가격과 수량은 정상 입력되므로, 최종 출력에서는 상품명만 비어 보인다.

수정의 핵심은 **남은 줄을 먼저 처리한 뒤 실제 상품명을 저장하는 것**이다.

```java
if (option == 1) {
    input.nextLine(); // 옵션 입력 뒤의 남은 줄을 먼저 넘긴다.

    System.out.print("상품명을 입력하세요: ");
    String productName = input.nextLine(); // 새로 입력한 상품명을 저장한다.
}
```

이전의 [Scanner 줄바꿈 학습 글]({% post_url 2026-10-15-java-scanner-nextline %})과 같은 원리였다. `nextLine()`을 넣는다는 사실만 기억하고, 어느 입력을 읽는 줄인지까지 구분하지 못했던 것이다.

### nextLine()은 반드시 옵션 입력 바로 아래에 있어야 할까?

강의처럼 `option == 1` 분기 안에서 호출해도 맞다. 다음에 상품명을 `nextLine()`으로 읽기 직전에 남은 줄을 처리하기 때문이다.

옵션 2는 문자열을 읽지 않고, 다음 반복의 옵션 입력도 `nextInt()`라 앞의 공백과 엔터를 건너뛴다. 따라서 이 코드에서는 숫자를 읽을 때마다 무조건 `nextLine()`을 붙일 필요가 없다.

앞서 설명받은 수정안처럼 옵션 입력 직후에 공통으로 호출하는 방식도, 각 값을 한 줄씩 입력하는 이 예제에서는 정상 동작한다. 중요한 것은 위치를 외우는 것이 아니라 **실제 문자열을 읽기 전에 남은 줄을 처리하는 순서**다.

## 결제와 종료 조건에서 놓친 요구사항

결제는 총금액을 보여주는 것만으로 끝나지 않았다. 문제에서는 결제가 끝났다고 가정하고, 다음 구매를 위해 합계를 0으로 초기화하라고 했다.

```java
System.out.println("총 비용: " + totalPrice);
totalPrice = 0; // 이전 결제 금액을 다음 구매에 포함하지 않는다.
```

초기화하지 않으면 110,000원을 결제한 뒤 다시 결제를 선택해도 110,000원이 나온다. 새 상품을 추가하면 이전 결제 금액에 이어서 더해진다.

또한 처음의 `while (option != 0)`은 옵션 3에서 종료한다는 문제와 맞지 않았다. 0은 잘못된 옵션이므로 안내하고 다시 메뉴를 보여줘야 하지만, 실제로는 반복문 조건이 거짓이 되어 조용히 끝났다.

강의에서는 `while (true)`로 메뉴를 반복하고, 옵션 3의 `break`에서만 정상 종료하도록 했다. 반복 조건과 종료 분기가 서로 다른 종료 규칙을 갖지 않도록 정리한 것이다.

## 코드가 짧아진 이유는 공통 동작을 모았기 때문이다

처음에는 상품 입력, 결제, 잘못된 옵션 처리 뒤에 다음 두 줄을 각각 작성했다.

```java
System.out.println("1: 상품 입력, 2: 결제, 3: 프로그램 종료");
option = input.nextInt();
```

각 분기에서 다음 옵션을 읽도록 했으므로, 이 구조 자체가 무한 반복이나 오류를 만드는 것은 아니다. 다만 메뉴 문구를 바꾸거나 새 옵션을 추가하면 같은 코드를 여러 곳에서 관리해야 한다.

강의는 이 공통 동작을 반복문 맨 위로 옮겼다.

```java
while (true) {
    System.out.println("1: 상품 입력, 2: 결제, 3: 프로그램 종료");
    int option = input.nextInt();

    // 선택한 옵션에 해당하는 작업을 수행한다.
    // 종료하지 않았다면 다음 반복에서 다시 메뉴를 보여준다.
}
```

새로운 축약 문법을 사용한 것이 아니라, **메뉴 → 입력 → 선택한 작업 → 다시 메뉴**라는 반복 구조에 맞춰 중복을 모은 것이다.

## 변수 위치는 값을 기억해야 하는 기간으로 정한다

| 변수 | 위치와 이유 |
|---|---|
| `input` | 반복문 밖. 하나의 Scanner로 계속 입력받는다. |
| `totalPrice` 또는 `totalCost` | 반복문 밖. 상품을 추가할 때마다 누적 금액을 유지하고, 결제할 때만 0으로 바꾼다. |
| `option` | 강의에서는 반복문 안. 이번 메뉴에서 선택한 값만 필요하다. |
| `productName`, `price`, `quantity` | 상품 입력 분기 안. 해당 상품을 처리하는 동안만 사용한다. |

처음 코드에서 `option`을 반복문 밖에 둔 것 자체가 잘못은 아니다. 처음에는 조건식에서 `option`을 사용했으므로 밖에 선언할 이유가 있었다. 메뉴 입력을 반복문 맨 위로 옮긴 뒤에는 매번 새로 선언해도 된다.

반대로 `totalPrice = 0`을 매번 반복문 시작에 실행하면 새 상품을 받을 때마다 이전 합계가 사라진다. **여러 반복에 걸쳐 유지할 값과 이번 반복에서만 필요한 값을 나누는 것**이 기준이다.

## 강의 풀이를 기준으로 정리한 코드

강의의 구조를 유지하되, 상품별 금액을 `productTotal`로 계산해 누적과 출력에 사용했다. 이것은 필수 수정이 아니라 같은 계산의 의미를 이름으로 드러내는 선택이다. 강의처럼 `price * quantity`를 두 곳에 써도 문제의 결과는 같다.

```java
import java.util.Scanner;

public class ScannerWhileEx4 {
    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        int totalPrice = 0;

        while (true) {
            System.out.println("1: 상품 입력, 2: 결제, 3: 프로그램 종료");
            int option = input.nextInt();

            if (option == 1) {
                input.nextLine(); // 남은 줄을 넘긴 뒤 상품명을 읽는다.
                System.out.print("상품명을 입력하세요: ");
                String productName = input.nextLine();

                System.out.print("상품의 가격을 입력하세요: ");
                int price = input.nextInt();
                System.out.print("구매 수량을 입력하세요: ");
                int quantity = input.nextInt();

                int productTotal = price * quantity;
                totalPrice += productTotal;
                System.out.println("상품명: " + productName
                        + ", 가격: " + price + ", 수량: " + quantity
                        + ", 합계: " + productTotal);
            } else if (option == 2) {
                System.out.println("총 비용: " + totalPrice);
                totalPrice = 0;
            } else if (option == 3) {
                System.out.println("프로그램을 종료합니다.");
                break;
            } else {
                System.out.println("올바른 옵션을 선택해주세요.");
            }
        }
    }
}
```

위 코드는 정수가 올바르게 입력되는 강의의 연습 범위를 따른다. 문자 입력, 음수 가격, 0 이하 수량, 금액의 정수 범위 초과까지 막는 입력 검증은 강의 코드에도 없는 별도 보완 사항이다.

## 같은 입력으로 실제 동작 비교하기

처음 코드와 사용자가 제시한 강의 정답의 입력·계산 로직을 Java 17에서 실행해 다음 경우를 확인했다.

| 확인한 입력 | 처음 코드 | 강의 코드 |
|---|---|---|
| 스프링 30,000원 1개 + JPA 40,000원 2개 후 결제 | 상품명이 비지만 총금액 110,000원은 맞음 | 상품명과 총금액이 정상 표시됨 |
| 위 결제 직후 다시 결제 | 110,000원이 다시 표시됨 | 0원 표시 |
| 100원 상품 2개 결제 후, 50원 상품 1개 추가·결제 | 이전 금액이 남아 250원 | 새 구매 금액 50원 |
| 옵션 0 입력 후 3 입력 | 0에서 안내 없이 종료 | 잘못된 옵션 안내 후 3으로 종료 |
| 옵션 9 입력 후 3 입력 | 잘못된 옵션 안내 후 종료 | 동일하게 처리 |

강의 코드에서는 공백이 들어간 상품명 `첫 상품`도 정상적으로 읽혔다. 상품명을 단어가 아니라 한 줄로 읽는 `nextLine()`을 사용하는 이유와도 연결된다.

## 다음 문제에서 먼저 확인할 것

- 문제가 요구하는 종료·초기화 조건을 코드에 모두 반영했는지 확인한다.
- `nextLine()`이 지금 남은 엔터를 읽는지, 실제 입력 문자열을 읽는지 순서대로 따라간다.
- 각 분기가 끝난 뒤 공통으로 하는 일이 있다면 반복문의 공통 위치로 모을 수 있는지 본다.
- 변수는 몇 줄 위에 두는지가 아니라, 언제까지 값을 기억해야 하는지로 위치를 정한다.

이번 풀이에는 이미 맞게 작성한 누적 계산과 변수 위치가 있었다. 고칠 부분은 코드가 길다는 인상만으로 판단하기보다, 입력이 사라진 지점과 요구사항에서 빠진 동작을 구체적으로 찾아야 했다.
