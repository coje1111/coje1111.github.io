(function () {
  "use strict";

  const root = document.querySelector(".learning-home");
  const input = document.querySelector("#blog-search");
  const clearButton = document.querySelector("#clear-search");
  const status = document.querySelector("#search-status");
  const noResults = document.querySelector("#no-search-results");
  const expandButton = document.querySelector("#expand-all");
  const collapseButton = document.querySelector("#collapse-all");

  if (!root || !input || !status) {
    return;
  }

  const entries = Array.from(document.querySelectorAll("[data-post-entry]"));
  const groups = Array.from(document.querySelectorAll("[data-topic-group]"));
  const sections = Array.from(document.querySelectorAll("[data-topic-section]"));
  let searchDocuments = new Map();

  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR");

  const fallbackDocument = (entry) => ({
    title: entry.querySelector("a")?.textContent || "",
    topic: entry.closest("[data-topic-group]")?.querySelector(".topic-group__name")?.textContent || "",
    date: entry.querySelector("time")?.textContent || "",
    tags: [],
    content: ""
  });

  const documentText = (document) =>
    normalize([
      document.title,
      document.topic,
      document.date,
      Array.isArray(document.tags) ? document.tags.join(" ") : document.tags,
      document.content
    ].join(" "));

  const updateGroupVisibility = () => {
    groups.forEach((group) => {
      const hasVisibleEntry = Array.from(group.querySelectorAll("[data-post-entry]"))
        .some((entry) => !entry.hidden);
      group.hidden = !hasVisibleEntry;
    });

    sections.forEach((section) => {
      const hasVisibleGroup = Array.from(section.querySelectorAll("[data-topic-group]"))
        .some((group) => !group.hidden);
      section.hidden = !hasVisibleGroup;
    });
  };

  const filterPosts = () => {
    const query = normalize(input.value).trim();
    const terms = query.split(/\s+/).filter(Boolean);
    let visibleCount = 0;

    entries.forEach((entry) => {
      const document = searchDocuments.get(entry.dataset.url) || fallbackDocument(entry);
      const searchableText = documentText(document);
      const matches = terms.length === 0 || terms.every((term) => searchableText.includes(term));
      entry.hidden = !matches;
      if (matches) {
        visibleCount += 1;
      }
    });

    updateGroupVisibility();

    if (terms.length > 0) {
      groups.filter((group) => !group.hidden).forEach((group) => {
        group.open = true;
      });
      status.textContent = `“${input.value.trim()}” 검색 결과 ${visibleCount}개`;
    } else {
      status.textContent = `총 ${entries.length}개의 학습 기록`;
    }

    clearButton.hidden = terms.length === 0;
    noResults.hidden = visibleCount !== 0;
  };

  const loadSearchIndex = async () => {
    try {
      const response = await fetch(root.dataset.searchIndex, { credentials: "same-origin" });
      if (!response.ok) {
        throw new Error(`검색 인덱스 응답 오류: ${response.status}`);
      }
      const documents = await response.json();
      searchDocuments = new Map(documents.map((document) => [document.url, document]));
    } catch (error) {
      console.warn("본문 검색 인덱스를 불러오지 못해 제목과 주제로만 검색합니다.", error);
    } finally {
      filterPosts();
    }
  };

  input.addEventListener("input", filterPosts);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && input.value) {
      input.value = "";
      filterPosts();
    }
  });

  clearButton.addEventListener("click", () => {
    input.value = "";
    filterPosts();
    input.focus();
  });

  expandButton.addEventListener("click", () => {
    groups.forEach((group) => {
      group.open = true;
    });
  });

  collapseButton.addEventListener("click", () => {
    groups.forEach((group) => {
      group.open = false;
    });
  });

  loadSearchIndex();
})();
