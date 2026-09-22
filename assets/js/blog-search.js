(function () {
  "use strict";

  const STORAGE_KEY = "coje1111.learning-log.group-state.v1";
  const root = document.querySelector(".learning-home");
  const input = document.querySelector("#blog-search");
  const clearButton = document.querySelector("#clear-search");
  const status = document.querySelector("#search-status");
  const noResults = document.querySelector("#no-search-results");
  const expandButton = document.querySelector("#expand-all");
  const collapseButton = document.querySelector("#collapse-all");

  if (!root || !input || !status || !clearButton || !noResults || !expandButton || !collapseButton) {
    return;
  }

  const entries = Array.from(document.querySelectorAll("[data-post-entry]"));
  const groups = Array.from(document.querySelectorAll("[data-topic-group]"));
  const sections = Array.from(document.querySelectorAll("[data-topic-section]"));
  const statefulGroups = Array.from(document.querySelectorAll("[data-stateful-group]"));
  let searchDocuments = new Map();
  let searchActive = false;
  let storedGroupState = readStoredGroupState();

  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR");

  function readStoredGroupState() {
    try {
      const savedState = window.localStorage.getItem(STORAGE_KEY);
      if (!savedState) {
        return {};
      }

      const parsedState = JSON.parse(savedState);
      return parsedState && typeof parsedState === "object" && !Array.isArray(parsedState)
        ? parsedState
        : {};
    } catch (error) {
      console.warn("저장된 펼침 상태를 읽지 못했습니다.", error);
      return {};
    }
  }

  function writeStoredGroupState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedGroupState));
    } catch (error) {
      console.warn("펼침 상태를 저장하지 못했습니다.", error);
    }
  }

  function restoreStoredGroupState() {
    statefulGroups.forEach((group) => {
      group.open = storedGroupState[group.dataset.groupId] === true;
    });
  }

  function saveCurrentGroupState() {
    storedGroupState = Object.fromEntries(
      statefulGroups.map((group) => [group.dataset.groupId, group.open])
    );
    writeStoredGroupState();
  }

  function setAllGroups(open) {
    statefulGroups.forEach((group) => {
      group.open = open;
    });
    saveCurrentGroupState();
  }

  const fallbackDocument = (entry) => {
    const group = entry.closest("[data-topic-group]");
    const section = entry.closest("[data-topic-section]");
    const groupName = group?.querySelector(".topic-group__name")?.textContent || "";
    const isProject = group?.dataset.groupKind === "project";

    return {
      title: entry.querySelector("a")?.textContent || "",
      logType: section?.dataset.category || "",
      project: isProject ? groupName : "",
      topic: isProject ? "" : groupName,
      date: entry.querySelector("time")?.textContent || "",
      tags: [],
      content: ""
    };
  };

  const documentText = (document) =>
    normalize([
      document.title,
      document.logType,
      document.project,
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

  const openSearchResults = () => {
    groups.filter((group) => !group.hidden).forEach((group) => {
      group.open = true;
      const section = group.closest("[data-topic-section]");
      if (section) {
        section.open = true;
      }
    });
  };

  const filterPosts = () => {
    const query = normalize(input.value).trim();
    const terms = query.split(/\s+/).filter(Boolean);
    searchActive = terms.length > 0;
    let visibleCount = 0;

    entries.forEach((entry) => {
      const document = searchDocuments.get(entry.dataset.url) || fallbackDocument(entry);
      const searchableText = documentText(document);
      const matches = !searchActive || terms.every((term) => searchableText.includes(term));
      entry.hidden = !matches;
      if (matches) {
        visibleCount += 1;
      }
    });

    updateGroupVisibility();

    if (searchActive) {
      openSearchResults();
      status.textContent = `“${input.value.trim()}” 검색 결과 ${visibleCount}개`;
    } else {
      restoreStoredGroupState();
      status.textContent = `총 ${entries.length}개의 학습 기록`;
    }

    clearButton.hidden = !searchActive;
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
      console.warn("본문 검색 인덱스를 불러오지 못해 제목과 분류로만 검색합니다.", error);
    } finally {
      filterPosts();
    }
  };

  restoreStoredGroupState();

  statefulGroups.forEach((group) => {
    group.addEventListener("toggle", () => {
      if (!searchActive) {
        storedGroupState[group.dataset.groupId] = group.open;
        writeStoredGroupState();
      }
    });
  });

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
    setAllGroups(true);
  });

  collapseButton.addEventListener("click", () => {
    setAllGroups(false);
  });

  loadSearchIndex();
})();
