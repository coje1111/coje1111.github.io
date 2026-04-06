## 1. JPA N+1 문제 원인 및 해결 방안

### 발생 원인
- JPA에서 1:N 연관 관계를 가진 엔티티를 조회할 때 발생하는 성능 저하 현상.
- 부서(Department) 전체 목록을 조회하는 쿼리 1번 실행 후, 각 부서에 속한 사원(Employee)을 로딩하기 위해 부서 개수(N)만큼 추가 쿼리가 발생하는 문제. (총 1+N번의 쿼리 실행)

### 해결 방안
1. **Fetch Join:** `@Query("SELECT d FROM Department d JOIN FETCH d.employees")`
    - 연관된 엔티티를 하나의 SQL JOIN 문으로 즉시 로딩(Eager)하여 메모리에 올림. 가장 권장되는 실무적 해결책.
2. **@EntityGraph:** 메서드에 `@EntityGraph(attributePaths = {"employees"})` 지정.
    - Fetch Join과 유사하게 쿼리 실행 시 연관 엔티티를 함께 로딩하도록 지시.
3. **Batch Size 조절:** `default_batch_fetch_size` 설정.
    - 지정된 사이즈만큼 IN 절을 사용하여 쿼리를 묶어서 전송. 쿼리 횟수를 획기적으로 줄이는 최적화 옵션.

---

## 2. 트랜잭션 격리성(Isolation) 보장 실패 시 문제점 및 격리 수준

### 격리성 미보장 시 발생하는 문제점
1. **Dirty Read:** 다른 트랜잭션이 커밋하지 않은(수정 중인) 데이터를 읽는 현상. (예: 롤백될 부서 예산 인상안을 미리 읽고 로직 처리)
2. **Non-Repeatable Read:** 한 트랜잭션 내에서 같은 쿼리를 두 번 실행했을 때, 그 사이 다른 트랜잭션의 UPDATE/DELETE로 인해 결과 값이 달라지는 현상.
3. **Phantom Read:** 한 트랜잭션 내에서 조건 검색을 두 번 실행했을 때, 다른 트랜잭션의 INSERT로 인해 이전에 없던 레코드(유령 데이터)가 추가로 조회되는 현상.

### 트랜잭션 격리 수준 4단계
1. **READ UNCOMMITTED:** 커밋되지 않은 데이터 읽기 허용. (Dirty Read 발생, 실무 사용 안 함)
2. **READ COMMITTED:** 커밋된 데이터만 읽기 허용. (Non-Repeatable Read 발생, Oracle 등 다수 DB 기본값)
3. **REPEATABLE READ:** 트랜잭션 시작 시점의 스냅샷을 읽어 일관성 유지. (Phantom Read 발생 가능, MySQL 기본값)
4. **SERIALIZABLE:** 트랜잭션을 순차적으로 실행하여 완벽한 일관성 보장. 데드락 위험이 크고 동시성 처리 성능이 가장 낮음.