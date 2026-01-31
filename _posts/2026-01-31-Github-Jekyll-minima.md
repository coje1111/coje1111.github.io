---
layout: post
title: "About basic title of minima"
---

# 2026-01-31

## 오늘 한 것
- GitHub Pages 블로그에서 Learning Log 제목이 두 번 표시되는 문제를 확인함
- Jekyll 테마(minima)와 `index.md`, `_config.yml` 설정 간의 관계를 살펴봄
- `index.md`에서 `title`을 제거하면 중복 제목이 사라진다는 것을 직접 확인함
- 테마가 페이지 제목을 자동으로 출력하는 구조라는 점을 이해함

## 막힌 점
- 처음에는 코드에 없는 제목이 화면에 출력되는 이유를 이해하기 어려웠음
- `_layouts` 폴더가 레포에 없어서 어디서 제목이 출력되는지 감이 안 왔음

## 정리
- GitHub Pages에서 사용하는 테마는 레포에 코드가 없어도 내부적으로 레이아웃을 가지고 있음
- `layout: home`을 사용하는 경우, minima 테마가 기본 페이지 제목을 자동으로 출력함
- `index.md`에 `title`이 있으면 테마의 기본 제목 + page title이 함께 출력되어 중복이 발생함
- 제목 중복 문제는 `index.md`에서 `title`을 제거하는 방식으로 해결 가능함

## 코드
- `index.md`에서 `title: "Learning Log"` 제거
