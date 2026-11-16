---
title: "Apache Doris 3.0.8 至 5.x：关键特性与能力演进"
date: 2026-11-16
draft: false
summary: "从向量检索、半结构化数据、湖仓和增量计算等场景出发，梳理 Doris 3.0.8 之后的关键变化。"
description: "对照 Apache Doris 3.0.8，了解 3.1、4.x 已发布的能力增强与 5.0 规划。"
toc: true
tocTitle: "本页目录"
type: "项目对比"
topics:
  - Apache Doris
  - 数据库
level: "进阶"
tags:
  - apache-doris
  - 版本升级
  - 数据湖仓
---

<aside class="upgrade-notice" aria-label="升级提示">
  <div class="upgrade-notice__header"><strong>升级提示</strong><span>3.0.8 → 5.x</span></div>
  <p>本文以 Doris 3.0.8 为对照基线。4.2 和 5.0 的预告能力请以正式发布说明为准。</p>
  <div class="upgrade-notice__meta">资料核对：2026-11-16 <span aria-hidden="true">·</span> <a href="https://doris.apache.org/releases/core/">官方发布列表</a></div>
</aside>

## 关键特性演进

### 向量检索与混合查询

<ol class="feature-timeline" aria-label="向量与混合检索版本演进">
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.0.8 <span>基线</span></div><div class="feature-timeline__card"><strong>已有 SQL 分析和全文检索</strong><p>结构化分析与文本检索已有基础；原生 ANN 向量索引尚未引入。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.0 <span>已发布</span></div><div class="feature-timeline__card"><strong>新增 ANN 向量索引</strong><p>在 Doris 表中结合相似度检索、SQL 条件与文本搜索。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.1 <span>已发布</span></div><div class="feature-timeline__card"><strong>更多索引与执行选择</strong><p>增加 IVF、IVF on-disk 等索引选择，结合量化和索引读取优化，在召回率、内存和查询速度之间权衡。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.1.4 <span>已发布</span></div><div class="feature-timeline__card"><strong>扩展可用表模型</strong><p>ANN 索引支持使用 Merge-on-Write 的 Unique Key 表。</p></div></li>
</ol>

<aside class="feature-overview" aria-label="功能概述">
  <div class="feature-overview__header"><strong class="feature-overview__title">功能概述</strong><span class="feature-overview__version">4.1.5</span></div>
  <ul class="feature-overview__list">
    <li><strong>索引选择：</strong>使用 HNSW、IVF 或 IVF on-disk 执行近似向量检索。</li>
    <li><strong>组合查询：</strong>向量距离排序可以结合结构化条件过滤和 SQL 分析。</li>
    <li><strong>使用取舍：</strong>索引类型、量化方式和表模型会影响召回率与资源消耗。</li>
  </ul>
</aside>

**HNSW 向量检索示例 · Doris 4.1.5**

在已选中的测试数据库中执行：

```sql
-- 创建带 HNSW 向量索引的示例表。
CREATE TABLE docs_vector (
  id INT NOT NULL,
  title STRING,
  category STRING,
  embedding ARRAY<FLOAT> NOT NULL,
  INDEX ann_idx (embedding) USING ANN PROPERTIES (
    "index_type" = "hnsw", "metric_type" = "l2_distance", "dim" = "2"
  )
)
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES ("replication_num" = "1");

-- 写入两个数据库文档和一个其他类别的文档。
INSERT INTO docs_vector VALUES
  (1, 'Doris search', 'database', [0.1, 0.2]),
  (2, 'Doris analytics', 'database', [0.4, 0.4]),
  (3, 'Travel guide', 'travel', [0.1, 0.1]);

-- 先按类别过滤，再按向量距离取前两条。
SELECT id, title, l2_distance_approximate(embedding, [0.0, 0.0]) AS distance
FROM docs_vector
WHERE category = 'database'
ORDER BY distance ASC
LIMIT 2;
```

<figure class="query-result">
  <figcaption class="query-result__header"><strong>运行结果</strong><span>2 行</span></figcaption>
  <div class="query-result__scroll" role="region" aria-label="运行结果表格" tabindex="0">
    <table><thead><tr><th scope="col">id</th><th scope="col">title</th><th scope="col">distance</th></tr></thead><tbody><tr><td>1</td><td>Doris search</td><td>0.2236068</td></tr><tr><td>2</td><td>Doris analytics</td><td>0.56568545</td></tr></tbody></table>
  </div>
</figure>

小样本不用于性能比较。[索引与表模型限制](https://doris.apache.org/docs/4.x/table-design/index/index-overview/)

### AI 函数与 Python 扩展

<ol class="feature-timeline" aria-label="AI 函数与 Python 扩展版本演进">
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.0.8 <span>基线</span></div><div class="feature-timeline__card"><strong>已有 SQL 分析和扩展能力</strong><p>支持 SQL 分析与函数扩展。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.0 <span>已发布</span></div><div class="feature-timeline__card"><strong>SQL 调用 AI 函数</strong><p>使用 AI 函数连接模型完成文本分类、信息提取和摘要等任务。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.1.3 <span>实验性</span></div><div class="feature-timeline__card"><strong>Python 函数扩展</strong><p>支持 Python UDF、UDAF 和 UDTF，供自定义标量、聚合和表函数使用。</p></div></li>
</ol>

<aside class="feature-overview" aria-label="功能概述">
  <div class="feature-overview__header"><strong class="feature-overview__title">功能概述</strong><span class="feature-overview__version">4.1.5</span><span class="feature-overview__status">Python UDF 实验性</span></div>
  <ul class="feature-overview__list">
    <li><strong>AI 函数：</strong>从 SQL 调用外部模型，完成文本分类、信息提取或摘要。</li>
    <li><strong>Python 扩展：</strong>使用 UDF、UDAF 或 UDTF 编写自定义计算逻辑。</li>
    <li><strong>运行条件：</strong>Python UDF 仍为实验性功能，需要在 BE 配置 Python 运行环境。</li>
  </ul>
</aside>

**Python UDF 示例 · Doris 4.1.5（实验性）**

在 BE 启用 Python UDF 并准备包含 pandas 和 pyarrow 的 Python 环境后执行：

```sql
-- 注册 Python 函数；runtime_version 需匹配 BE 环境。
CREATE FUNCTION py_normalize(STRING)
RETURNS STRING
PROPERTIES (
  "type" = "PYTHON_UDF",
  "symbol" = "normalize",
  "runtime_version" = "3.12.14"
)
AS $$
def normalize(text):
    return text.strip().upper()
$$;
-- 调用函数，去除首尾空格并转换为大写。
SELECT py_normalize('  doris  ') AS normalized;
```

<figure class="query-result">
  <figcaption class="query-result__header"><strong>运行结果</strong><span>1 行</span></figcaption>
  <div class="query-result__scroll" role="region" aria-label="运行结果表格" tabindex="0">
    <table><thead><tr><th scope="col">normalized</th></tr></thead><tbody><tr><td>DORIS</td></tr></tbody></table>
  </div>
</figure>

AI 函数需要模型服务。[4.0 AI 函数](https://doris.apache.org/releases/v4.0/release-4.0.0/) · [4.1.3 发布说明](https://doris.apache.org/releases/v4.1/release-4.1.3/)

### 全文检索与相关性排序

<ol class="feature-timeline" aria-label="全文检索版本演进">
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.0.8 <span>基线</span></div><div class="feature-timeline__card"><strong>已有倒排索引和全文检索</strong><p>支持倒排索引和文本匹配。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.1 <span>已发布</span></div><div class="feature-timeline__card"><strong>自定义文本分析</strong><p>组合字符过滤、分词和词项过滤，按业务文本调整检索方式。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.0 <span>已发布</span></div><div class="feature-timeline__card"><strong>搜索、评分与分析融合</strong><p><code>SEARCH</code> 与 BM25 相关性评分结合 SQL 分析和向量检索。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.1 <span>已发布</span></div><div class="feature-timeline__card"><strong>复杂搜索增强</strong><p>增强嵌套和多字段搜索，并优化搜索执行。</p></div></li>
</ol>

<aside class="feature-overview" aria-label="功能概述">
  <div class="feature-overview__header"><strong class="feature-overview__title">功能概述</strong><span class="feature-overview__version">4.1.5</span></div>
  <ul class="feature-overview__list">
    <li><strong>文本搜索：</strong><code>SEARCH</code> 可表达字段、词语和布尔组合条件。</li>
    <li><strong>相关性排序：</strong>使用 BM25 和 <code>score()</code> 对匹配结果评分。</li>
    <li><strong>联合分析：</strong>搜索可以结合结构化过滤、聚合和自定义分词。</li>
  </ul>
</aside>

**全文检索示例 · Doris 4.1.5**

```sql
-- 创建文本列的英文分词倒排索引。
CREATE TABLE docs_search (
  id INT NOT NULL,
  title STRING,
  content STRING,
  INDEX content_idx (content) USING INVERTED PROPERTIES ("parser" = "english")
)
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES ("replication_num" = "1");

-- 写入三篇示例文档。
INSERT INTO docs_search VALUES
  (1, 'Search guide', 'Doris search combines text search and analytics'),
  (2, 'Analytics guide', 'Doris supports analytics'),
  (3, 'Travel guide', 'Travel search finds destinations');

-- 同时匹配两个词，并按相关性评分排序。
SELECT id, title, score() AS relevance
FROM docs_search
WHERE SEARCH('content:doris AND content:search')
ORDER BY relevance DESC
LIMIT 10;
```

<figure class="query-result">
  <figcaption class="query-result__header"><strong>运行结果</strong><span>1 行</span></figcaption>
  <div class="query-result__scroll" role="region" aria-label="运行结果表格" tabindex="0">
    <table><thead><tr><th scope="col">id</th><th scope="col">title</th><th scope="col">relevance</th></tr></thead><tbody><tr><td>1</td><td>Search guide</td><td>0.9567714</td></tr></tbody></table>
  </div>
</figure>

分词、索引配置、查询表达式和语料分布会影响搜索结果及相关性分数。[3.1 发布说明](https://doris.apache.org/releases/v3.1/release-3.1.0/) · [4.1 发布说明](https://doris.apache.org/releases/v4.1/release-4.1.0/) · [全文检索文档](https://doris.apache.org/docs/4.x/table-design/index/inverted-index/overview/)

### 半结构化数据与超宽表

<ol class="feature-timeline" aria-label="动态 JSON 与超宽数据版本演进">
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.0.8 <span>基线</span></div><div class="feature-timeline__card"><strong>已有 Variant 类型</strong><p>支持使用 Variant 处理半结构化数据。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.1 <span>已发布</span></div><div class="feature-timeline__card"><strong>稀疏列与 Schema Template</strong><p>改善大量动态子字段的组织和访问，适合字段持续变化的日志与事件。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.1 <span>已发布</span></div><div class="feature-timeline__card"><strong>优化超宽数据访问</strong><p>增强稀疏字段读取，并提供面向超宽列场景的 Segment V3 存储格式选项。</p></div></li>
</ol>

<aside class="feature-overview" aria-label="功能概述">
  <div class="feature-overview__header"><strong class="feature-overview__title">功能概述</strong><span class="feature-overview__version">4.1.5</span></div>
  <ul class="feature-overview__list">
    <li><strong>动态字段：</strong>Variant 保存结构变化的 JSON，未预先声明的字段仍可查询。</li>
    <li><strong>关键路径：</strong>Schema Template 为需要稳定类型的字段预先声明类型。</li>
    <li><strong>超宽数据：</strong>稀疏字段和 Segment V3 提供不同的存储与访问选项。</li>
  </ul>
</aside>

日志、用户画像、设备事件和 AI 应用轨迹等场景，可以减少为每种动态字段预先设计固定表结构的压力。

**Variant 数据类型示例 · Doris 4.1.5**

```sql
-- 为两个常用 JSON 路径声明类型，其余字段保持动态。
CREATE TABLE event_variants (
  id INT NOT NULL,
  payload VARIANT<'event' : STRING, 'latency_ms' : BIGINT>
)
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES ("replication_num" = "1");

-- 写入包含不同可选字段的事件。
INSERT INTO event_variants VALUES
  (1, '{"event":"search","latency_ms":120,"region":"east"}'),
  (2, '{"event":"search","latency_ms":45,"device":"mobile"}'),
  (3, '{"event":"load","latency_ms":80,"region":"west"}');

-- 筛选搜索事件，并读取可能缺失的 region 字段。
SELECT id, CAST(payload['event'] AS STRING) AS event,
       CAST(payload['latency_ms'] AS BIGINT) AS latency_ms,
       CAST(payload['region'] AS STRING) AS region
FROM event_variants
WHERE CAST(payload['event'] AS STRING) = 'search'
ORDER BY id;
```

<figure class="query-result">
  <figcaption class="query-result__header"><strong>运行结果</strong><span>2 行</span></figcaption>
  <div class="query-result__scroll" role="region" aria-label="运行结果表格" tabindex="0">
    <table><thead><tr><th scope="col">id</th><th scope="col">event</th><th scope="col">latency_ms</th><th scope="col">region</th></tr></thead><tbody><tr><td>1</td><td>search</td><td>120</td><td>east</td></tr><tr><td>2</td><td>search</td><td>45</td><td>NULL</td></tr></tbody></table>
  </div>
</figure>

该写入示例针对 4.1.5；[5.0 开发文档](https://doris.apache.org/docs/dev/sql-manual/basic-element/sql-data-types/semi-structured/VARIANT/)说明了 Variant 写入语义变化，升级时应重新核对。

参考：[3.1 发布说明](https://doris.apache.org/releases/v3.1/release-3.1.0/) · [4.1 发布说明](https://doris.apache.org/releases/v4.1/release-4.1.0/)

### 实时数据导入与灵活列更新

<ol class="feature-timeline" aria-label="实时写入与灵活更新版本演进">
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.0.8 <span>基线</span></div><div class="feature-timeline__card"><strong>已有实时导入和部分列更新</strong><p>可以持续写入并更新数据；原有部分列更新要求同批记录更新相同的列集合。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.1 <span>已发布</span></div><div class="feature-timeline__card"><strong>同一批次灵活更新不同列</strong><p>灵活列更新允许同一批导入中的不同行更新不同字段，适合状态变化和标签回填。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.1.5 <span>实验性</span></div><div class="feature-timeline__card"><strong>Continuous Load 持续导入</strong><p>可配置持续任务接入 MySQL、PostgreSQL 等数据源的变化，具体支持范围以目标版本文档为准。</p></div></li>
</ol>

<aside class="feature-overview" aria-label="功能概述">
  <div class="feature-overview__header"><strong class="feature-overview__title">功能概述</strong><span class="feature-overview__version">4.1.5</span><span class="feature-overview__status">Continuous Load 实验性</span></div>
  <ul class="feature-overview__list">
    <li><strong>灵活列更新：</strong>同一批记录可分别更新不同字段；对于已有记录，未提供的列保留原值。</li>
    <li><strong>持续导入：</strong>Continuous Load 可持续接入 MySQL、PostgreSQL 等数据源的变化。</li>
    <li><strong>功能状态：</strong>Continuous Load 属于实验性功能；灵活列更新需要符合表模型和导入方式要求。</li>
  </ul>
</aside>

**灵活列更新示例 · Doris 4.1.5**

在已选中的测试数据库 `extra_demo` 中建立表和初始数据：

```sql
-- 创建支持灵活列更新的 Merge-on-Write 表。
CREATE TABLE user_profiles (
  id INT NOT NULL,
  name STRING,
  city STRING
) UNIQUE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 1
PROPERTIES (
  "replication_num" = "1",
  "enable_unique_key_merge_on_write" = "true",
  "enable_unique_key_skip_bitmap_column" = "true"
);
-- 写入待更新的两条完整记录。
INSERT INTO user_profiles VALUES (1, 'Alice', 'Shanghai'), (2, 'Bob', 'Beijing');
```

将下面的数据保存为 `flexible.json`：

```json
[{"id":1,"city":"Shenzhen"},{"id":2,"name":"Bobby"}]
```

设置 `DORIS_USER` 和 `DORIS_URL` 后执行 Stream Load；`curl` 会提示输入密码。

```bash
curl --location-trusted --user "$DORIS_USER" \
  -H 'format:json' -H 'strip_outer_array:true' \
  -H 'unique_key_update_mode:UPDATE_FLEXIBLE_COLUMNS' \
  -T flexible.json "$DORIS_URL/api/extra_demo/user_profiles/_stream_load"
```

```sql
-- 检查更新后的记录及未提供的列。
SELECT id, name, city FROM user_profiles ORDER BY id;
```

<figure class="query-result">
  <figcaption class="query-result__header"><strong>运行结果</strong><span>2 行</span></figcaption>
  <div class="query-result__scroll" role="region" aria-label="运行结果表格" tabindex="0">
    <table><thead><tr><th scope="col">id</th><th scope="col">name</th><th scope="col">city</th></tr></thead><tbody><tr><td>1</td><td>Alice</td><td>Shenzhen</td></tr><tr><td>2</td><td>Bobby</td><td>Beijing</td></tr></tbody></table>
  </div>
</figure>

灵活列更新需要满足 Merge-on-Write Unique Key 表及导入配置等条件。[3.1 发布说明](https://doris.apache.org/releases/v3.1/release-3.1.0/) · [Continuous Load 文档](https://doris.apache.org/docs/4.x/data-operate/import/import-way/streaming-job/continuous-load-overview/)

### 开放湖仓与多模态检索

<ol class="feature-timeline" aria-label="开放湖仓版本演进">
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.0.8 <span>基线</span></div><div class="feature-timeline__card"><strong>已有外部湖表访问</strong><p>支持查询外部湖表。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.1 <span>已发布</span></div><div class="feature-timeline__card"><strong>湖表查询与物化视图增强</strong><p>增强 Iceberg、Paimon 和湖上异步物化视图，例如支持 Paimon 快照间增量查询。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.1 <span>部分实验性</span></div><div class="feature-timeline__card"><strong>Iceberg 读写与管理增强</strong><p>增强 Iceberg V2/V3 的 SQL 读写及表管理；行级 UPDATE、DELETE、MERGE INTO 标为实验性。</p></div></li>
  <li class="feature-timeline__item feature-timeline__item--planned"><div class="feature-timeline__version">4.2 / 5.0 <span>预告</span></div><div class="feature-timeline__card"><strong>面向开放格式的多模态检索</strong><p>预告包括 Iceberg Variant、Paimon 读写与检索、Lance 检索，以及 Fluss 与 Paimon 联合查询。</p></div></li>
</ol>

<aside class="feature-overview" aria-label="功能概述">
  <div class="feature-overview__header"><strong class="feature-overview__title">功能概述</strong><span class="feature-overview__version">4.1.5</span><span class="feature-overview__status">部分实验性 · 4.2 / 5.0 预告</span></div>
  <ul class="feature-overview__list">
    <li><strong>湖表访问：</strong>通过 Catalog 查询开放湖表，并使用部分 Iceberg 读写与管理能力。</li>
    <li><strong>行级操作：</strong>Iceberg 的 UPDATE、DELETE 和 MERGE INTO 标为实验性，需要 V2 或更高表格式。</li>
    <li><strong>后续预告：</strong>4.2、5.0 计划扩展开放格式的读写和检索，具体范围以正式发布为准。</li>
  </ul>
</aside>

参考：[4.1 发布说明](https://doris.apache.org/releases/v4.1/release-4.1.0/) · [5.0 多模态湖仓预告](https://doris.apache.org/blog/apache-doris-5-multimodal-lakehouse-preview/)

### 实时增量计算与物化视图维护

<ol class="feature-timeline" aria-label="实时增量计算版本演进">
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.0.8 <span>基线</span></div><div class="feature-timeline__card"><strong>已有实时导入与查询</strong><p>数据可以持续写入并被查询，但写入实时不等于下游结果都按行级变化增量维护。</p></div></li>
  <li class="feature-timeline__item feature-timeline__item--planned"><div class="feature-timeline__version">5.0 <span>预告 · 实验性</span></div><div class="feature-timeline__card"><strong>行级变化与增量视图维护</strong><p>规划通过行级变化维护增量分析结果。</p></div></li>
</ol>

<aside class="feature-overview" aria-label="功能概述">
  <div class="feature-overview__header"><strong class="feature-overview__title">功能概述</strong><span class="feature-overview__version">5.0</span><span class="feature-overview__status">预告 · 实验性</span></div>
  <ul class="feature-overview__list">
    <li><strong>变化记录：</strong>计划使用 Changelog 记录内部表的行级变化。</li>
    <li><strong>增量消费：</strong>Table Stream 用于消费变化，IVM 用于基于变化维护物化视图。</li>
    <li><strong>功能状态：</strong>5.0 仍为预告；官方开发文档将该能力标为实验性且默认关闭。</li>
  </ul>
</aside>

### 查询性能与执行引擎优化

<ol class="feature-timeline" aria-label="查询性能与数据处理版本演进">
  <li class="feature-timeline__item"><div class="feature-timeline__version">3.0.8 <span>基线</span></div><div class="feature-timeline__card"><strong>已有 SQL 查询与数据处理</strong><p>分析性能仍取决于数据布局、查询计划和工作负载。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.0 <span>已发布</span></div><div class="feature-timeline__card"><strong>TopN 延迟物化与 Spill</strong><p>减少部分宽表排序的不必要读取；内存压力较大的处理可将中间数据写入磁盘。</p></div></li>
  <li class="feature-timeline__item"><div class="feature-timeline__version">4.1 <span>已发布</span></div><div class="feature-timeline__card"><strong>复杂分析路径优化</strong><p>增强 Spill、嵌套列裁剪、条件缓存，以及部分 Join 和聚合执行路径。</p></div></li>
</ol>

<aside class="feature-overview" aria-label="功能概述">
  <div class="feature-overview__header"><strong class="feature-overview__title">功能概述</strong><span class="feature-overview__version">4.1.5</span></div>
  <ul class="feature-overview__list">
    <li><strong>减少读取：</strong>TopN 延迟物化和嵌套列裁剪可减少部分查询的不必要数据读取。</li>
    <li><strong>应对内存压力：</strong>Spill 可将中间数据写入磁盘，供后续执行阶段读取。</li>
    <li><strong>复用计算：</strong>条件缓存可复用重复过滤的结果；收益仍取决于实际负载。</li>
  </ul>
</aside>

参考：[4.0 发布说明](https://doris.apache.org/releases/v4.0/release-4.0.0/) · [4.1 发布说明](https://doris.apache.org/releases/v4.1/release-4.1.0/)
