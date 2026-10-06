(() => {
  const lists = document.querySelectorAll("[data-content-list]");

  lists.forEach((list) => {
    const filters = list.closest("main")?.querySelectorAll("[data-content-filter]") ?? [];
    const cards = list.querySelectorAll("[data-content-card]");
    const emptyState = list.querySelector("[data-content-empty]");
    const initialFilter = list.dataset.initialFilter || "all";

    const applyFilter = (filter) => {
      filters.forEach((button) => {
        const isActive = button.dataset.contentFilter === filter;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

      let visibleCount = 0;
      cards.forEach((card) => {
        const shouldShow = filter === "all" || card.dataset.contentType === filter;
        card.hidden = !shouldShow;
        if (shouldShow) visibleCount += 1;
      });

      if (emptyState) emptyState.hidden = visibleCount !== 0;
    };

    filters.forEach((button) => {
      button.addEventListener("click", () => {
        applyFilter(button.dataset.contentFilter || "all");
      });
    });

    applyFilter(initialFilter);
  });
})();
