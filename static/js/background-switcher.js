(() => {
  const button = document.querySelector("[data-background-toggle]");
  const label = document.querySelector("[data-background-label]");

  if (!button || !label) {
    return;
  }

  const storageKey = "portraits-background";
  const labels = {
    atlas: button.dataset.atlasLabel,
    mountains: button.dataset.mountainsLabel,
  };

  const readStoredBackground = () => {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };

  const writeStoredBackground = (background) => {
    try {
      window.localStorage.setItem(storageKey, background);
    } catch {
      // The visual switch still works when storage is unavailable.
    }
  };

  const applyBackground = (background) => {
    const nextBackground = background === "atlas" ? "atlas" : "mountains";
    document.body.dataset.background = nextBackground;
    label.textContent = labels[nextBackground];
    button.setAttribute("aria-pressed", String(nextBackground === "atlas"));
    button.dataset.background = nextBackground;
  };

  applyBackground(readStoredBackground());

  button.addEventListener("click", () => {
    const nextBackground = document.body.dataset.background === "atlas" ? "mountains" : "atlas";
    applyBackground(nextBackground);
    writeStoredBackground(nextBackground);
  });
})();
