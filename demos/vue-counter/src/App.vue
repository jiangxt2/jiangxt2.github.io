<script setup>
import { computed, ref } from 'vue';

const count = ref(0);
const doubled = computed(() => count.value * 2);

const reset = () => {
  count.value = 0;
};
</script>

<template>
  <main class="demo-shell">
    <a class="back-link" href="../../../">← 返回博客</a>
    <section class="demo-panel">
      <p class="eyebrow">VUE 3 + VITE</p>
      <h1>一个可运行的 Vue 页面</h1>
      <p class="intro">
        这个页面由 Vue 单文件组件编写，经 Vite 构建后作为静态资源发布到 GitHub Pages。
      </p>
      <div class="counter-card">
        <div class="metric-row">
          <div>
            <span class="metric-label">当前值</span>
            <strong>{{ count }}</strong>
          </div>
          <div>
            <span class="metric-label">计算值</span>
            <strong>{{ doubled }}</strong>
          </div>
        </div>
        <div class="actions">
          <button type="button" @click="count -= 1">减少</button>
          <button type="button" @click="count += 1">增加</button>
          <button class="button-quiet" type="button" @click="reset">重置</button>
        </div>
      </div>
    </section>
  </main>
</template>
