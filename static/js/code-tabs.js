(() => {
  const codeExamples = document.querySelectorAll("[data-code-example]");
  const groups = new Map();

  codeExamples.forEach((panel) => {
    const group = panel.dataset.codeExample;
    const panels = groups.get(group) ?? [];
    panels.push(panel);
    groups.set(group, panels);
  });

  const languageOrder = ["python", "java"];
  const languageLabels = { java: "Java", python: "Python" };
  const languageLabel = document.documentElement.lang.toLowerCase().startsWith("zh")
    ? "代码语言"
    : "Code language";

  Array.from(groups.values()).forEach((panels, groupIndex) => {
    const availableLanguages = languageOrder.filter((language) =>
      panels.some((panel) => panel.dataset.language === language),
    );

    if (availableLanguages.length < 2) {
      return;
    }

    const switcher = document.createElement("div");
    switcher.className = "code-language-switcher";
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", languageLabel);

    let selectedLanguage = availableLanguages[0];
    const buttons = new Map();

    panels.forEach((panel) => {
      const language = panel.dataset.language;
      panel.id = "code-example-" + groupIndex + "-" + language;
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-label", languageLabels[language] + " code");
    });

    availableLanguages.forEach((language) => {
      const button = document.createElement("button");
      button.className = "code-language-button";
      button.type = "button";
      button.textContent = languageLabels[language];
      button.setAttribute("aria-pressed", "false");
      button.setAttribute(
        "aria-controls",
        panels.find((panel) => panel.dataset.language === language).id,
      );
      button.addEventListener("click", () => {
        selectedLanguage = language;
        updateSelection();
      });
      switcher.append(button);
      buttons.set(language, button);
    });

    const updateSelection = () => {
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.language !== selectedLanguage;
      });
      buttons.forEach((button, language) => {
        button.setAttribute("aria-pressed", String(language === selectedLanguage));
      });
    };

    panels[0].before(switcher);
    updateSelection();
  });
})();
