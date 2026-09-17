(() => {
  const lists = document.querySelectorAll("[data-content-list]");

  lists.forEach((list) => {
    const filters = list.closest("main")?.querySelectorAll("[data-content-filter]") ?? [];
    const cards = list.querySelectorAll("[data-content-card]");
    const initialFilter = list.dataset.initialFilter || "all";

    const applyFilter = (filter) => {
      filters.forEach((button) => {
        const isActive = button.dataset.contentFilter === filter;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

      cards.forEach((card) => {
        const shouldShow = filter === "all" || card.dataset.contentType === filter;
        card.hidden = !shouldShow;
      });
    };

    filters.forEach((button) => {
      button.addEventListener("click", () => {
        applyFilter(button.dataset.contentFilter || "all");
      });
    });

    applyFilter(initialFilter);
  });
})();
