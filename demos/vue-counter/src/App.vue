<script setup>
import { computed, ref } from 'vue';

const count = ref(0);
const doubled = computed(() => count.value * 2);
const locale = ref(new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'zh');

const messages = {
  zh: {
    back: '返回博客',
    eyebrow: 'VUE 3 + VITE',
    title: '一个可运行的 Vue 页面',
    intro: '这个页面由 Vue 单文件组件编写，经 Vite 构建后作为静态资源发布到 GitHub Pages。',
    current: '当前值',
    computed: '计算值',
    decrease: '减少',
    increase: '增加',
    reset: '重置',
  },
  en: {
    back: 'Back to blog',
    eyebrow: 'VUE 3 + VITE',
    title: 'A runnable Vue page',
    intro: 'This page is written as a Vue single-file component, built by Vite, and published as static assets on GitHub Pages.',
    current: 'Current',
    computed: 'Computed',
    decrease: 'Decrease',
    increase: 'Increase',
    reset: 'Reset',
  },
};

const copy = computed(() => messages[locale.value]);

const switchLocale = (nextLocale) => {
  const url = new URL(window.location.href);
  url.searchParams.set('lang', nextLocale);
  window.history.replaceState({}, '', url);
  locale.value = nextLocale;
};

const reset = () => {
  count.value = 0;
};
</script>

<template>
  <main class="demo-shell">
    <div class="demo-topbar">
      <a class="back-link" :href="locale === 'en' ? '../../../en/' : '../../../'">← {{ copy.back }}</a>
      <div class="demo-language" aria-label="Language switcher">
        <button type="button" :class="{ 'is-active': locale === 'zh' }" @click="switchLocale('zh')">中文</button>
        <span aria-hidden="true">/</span>
        <button type="button" :class="{ 'is-active': locale === 'en' }" @click="switchLocale('en')">English</button>
      </div>
    </div>
    <section class="demo-panel">
      <p class="eyebrow">{{ copy.eyebrow }}</p>
      <h1>{{ copy.title }}</h1>
      <p class="intro">{{ copy.intro }}</p>
      <div class="counter-card">
        <div class="metric-row">
          <div>
            <span class="metric-label">{{ copy.current }}</span>
            <strong>{{ count }}</strong>
          </div>
          <div>
            <span class="metric-label">{{ copy.computed }}</span>
            <strong>{{ doubled }}</strong>
          </div>
        </div>
        <div class="actions">
          <button type="button" @click="count -= 1">{{ copy.decrease }}</button>
          <button type="button" @click="count += 1">{{ copy.increase }}</button>
          <button class="button-quiet" type="button" @click="reset">{{ copy.reset }}</button>
        </div>
      </div>
    </section>
  </main>
</template>
