(() => {
  const messages = {
    zh: {
      back: '返回博客',
      eyebrow: '原生 JavaScript',
      title: '原生 HTML + JavaScript',
      intro: '这是一个不依赖框架的静态网页，HTML、CSS 和 JavaScript 都由 GitHub Pages 直接提供。',
      countLabel: '次点击',
      decrease: '减少',
      increase: '增加',
    },
    en: {
      back: 'Back to blog',
      eyebrow: 'VANILLA JAVASCRIPT',
      title: 'Vanilla HTML + JavaScript',
      intro: 'A framework-free static page served directly as HTML, CSS, and JavaScript by GitHub Pages.',
      countLabel: 'clicks',
      decrease: 'Decrease',
      increase: 'Increase',
    },
  };
  const requestedLocale = new URLSearchParams(window.location.search).get('lang');
  const locale = requestedLocale === 'en' ? 'en' : 'zh';
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = messages[locale][element.dataset.i18n];
  });
  document.querySelectorAll('[data-locale]').forEach((element) => {
    element.classList.toggle('is-active', element.dataset.locale === locale);
  });
  document.querySelector('.back-link').href = locale === 'en' ? '../../../en/' : '../../../';

  const countElement = document.querySelector('#count');
  const decreaseButton = document.querySelector('#decrease');
  const increaseButton = document.querySelector('#increase');
  let count = 0;

  const render = () => {
    countElement.textContent = String(count);
  };

  decreaseButton.addEventListener('click', () => {
    count -= 1;
    render();
  });

  increaseButton.addEventListener('click', () => {
    count += 1;
    render();
  });
})();
