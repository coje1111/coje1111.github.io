---
layout: default
title: 학습 로그
---

{% assign asset_version = site.github.build_revision %}
{% unless asset_version %}
  {% assign asset_version = site.time | date: "%s" %}
{% endunless %}

<div class="learning-home" data-search-index="{{ '/search-index.json' | relative_url }}?v={{ asset_version }}">
  <section class="learning-hero" aria-labelledby="learning-log-title">
    <p class="learning-hero__eyebrow">BACKEND LEARNING ARCHIVE</p>
    <h1 id="learning-log-title">학습 로그</h1>
    <p class="learning-hero__description">
      프로젝트에서 해결한 문제와 백엔드 학습 내용을 주제별로 모았습니다.
      각 그룹 안의 글은 최근 기록부터 정렬됩니다.
    </p>
  </section>

  <section class="search-panel" aria-label="학습 로그 검색">
    <label class="search-panel__label" for="blog-search">기록 검색</label>
    <div class="search-panel__field">
      <svg aria-hidden="true" class="search-panel__icon" viewBox="0 0 24 24">
        <path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"></path>
      </svg>
      <input
        id="blog-search"
        type="search"
        autocomplete="off"
        placeholder="제목, 주제, 기술 키워드로 검색"
        aria-describedby="search-status"
      >
      <button id="clear-search" class="search-panel__clear" type="button" hidden>지우기</button>
    </div>
    <div class="search-panel__meta">
      <p id="search-status" role="status" aria-live="polite">검색 데이터를 준비하고 있습니다.</p>
      <div class="group-controls" aria-label="주제 그룹 펼침 설정">
        <button id="expand-all" type="button">모두 펼치기</button>
        <button id="collapse-all" type="button">모두 접기</button>
      </div>
    </div>
  </section>

  {% assign sorted_posts = site.posts | sort: "date" | reverse %}
  {% assign group_order = "프로젝트,기술 학습" | split: "," %}

  <div class="topic-directory">
    {% for group_name in group_order %}
      <section class="topic-section" data-topic-section>
        <div class="topic-section__heading">
          <p class="topic-section__eyebrow">{{ group_name }}</p>
          {% if group_name == "프로젝트" %}
            <h2>프로젝트별 기록</h2>
            <p>하나의 제품을 설계하고 구현하며 해결한 문제를 프로젝트 단위로 모았습니다.</p>
          {% else %}
            <h2>기술별 학습 기록</h2>
            <p>프로젝트에 종속되지 않는 개념 학습과 실습을 기술 영역별로 정리했습니다.</p>
          {% endif %}
        </div>

        <div class="topic-groups">
          {% for topic in site.data.topics %}
            {% if topic.group == group_name %}
              {% assign topic_posts = sorted_posts | where: "topic", topic.name %}
              {% if topic_posts.size > 0 %}
                <details class="topic-group" data-topic-group open>
                  <summary>
                    <span class="topic-group__summary-text">
                      <span class="topic-group__name">{{ topic.name }}</span>
                      <span class="topic-group__description">{{ topic.description }}</span>
                    </span>
                    <span class="topic-group__count">{{ topic_posts.size }}개</span>
                    <span class="topic-group__chevron" aria-hidden="true"></span>
                  </summary>

                  <ol class="post-list-custom">
                    {% for post in topic_posts %}
                      <li class="post-entry" data-post-entry data-url="{{ post.url | relative_url }}">
                        <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%Y-%m-%d" }}</time>
                        <span class="post-entry__separator" aria-hidden="true">—</span>
                        <a class="post-entry__link" href="{{ post.url | relative_url }}">{{ post.title }}</a>
                      </li>
                    {% endfor %}
                  </ol>
                </details>
              {% endif %}
            {% endif %}
          {% endfor %}
        </div>
      </section>
    {% endfor %}
  </div>

  <p id="no-search-results" class="no-search-results" hidden>
    일치하는 기록이 없습니다. 검색어를 줄이거나 다른 기술 이름으로 찾아보세요.
  </p>

  <noscript>
    <p class="noscript-message">검색 기능을 사용하려면 브라우저에서 JavaScript를 활성화해 주세요.</p>
  </noscript>
</div>

<script src="{{ '/assets/js/blog-search.js' | relative_url }}?v={{ asset_version }}" defer></script>
