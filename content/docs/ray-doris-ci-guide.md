---
title: "ray-doris 持续集成实践"
date: 2026-11-15
draft: false
summary: "介绍 ray-doris 的 CI 配置、集成测试、本地运行与兼容性实验。"
description: "以 ray-doris 为例，介绍持续集成流水线、测试执行方式和兼容性问题实验。"
toc: true
tocTitle: "本页目录"
tocEndLevel: 4
type: "技术文档"
topics:
  - CI
  - GitHub Actions
  - Ray
  - Doris
level: "进阶"
tags:
  - ci
  - github-actions
  - ray-doris
---

## 项目简介

> **ray-doris** 是由社区独立维护的 Ray Data 与 Apache Doris 连接器，让 Ray 应用可以并行读写 Doris 数据。

<dl class="rd-feature-grid">
  <div class="rd-feature">
    <dt>分布式读取</dt>
    <dd>通过 <code>read_doris()</code> 或 <code>DorisDatasource</code> 读取 Doris 表；内表按 tablet 规划 Ray 任务，并以有界批次读取。外部 Catalog 表读取为实验性功能。</dd>
  </div>
  <div class="rd-feature">
    <dt>读取方式与选路</dt>
    <dd>MySQL 是主要读取路径；Arrow Flight SQL 和自动选择 transport 为实验性功能。可选的 Hive Parquet 共享存储原生读取默认为关闭，仅适用于符合条件的 HDFS / S3 表；该能力在本文基线中尚未作为包发布。</dd>
  </div>
  <div class="rd-feature">
    <dt>投影与过滤</dt>
    <dd>支持显式选列和受信任的 SQL 过滤表达式；部分 Ray 版本还支持自动列裁剪及受限的 Dataset 表达式下推。具体支持范围取决于 Ray 版本和表达式。</dd>
  </div>
  <div class="rd-feature">
    <dt>分布式写入</dt>
    <dd>通过 <code>write_doris()</code> 或 <code>DorisDatasink</code> 使用 Doris Stream Load 写入，支持 <code>load</code>、Unique Key 表的 <code>upsert</code>，以及 Merge-on-Write Unique Key 表的 <code>partial_update</code>。</dd>
  </div>
  <div class="rd-feature">
    <dt>安全与错误处理</dt>
    <dd>支持通过环境变量引用凭据和配置 TLS；写入结果不确定时报告异常，不自动重放可能已到达 Doris 的请求。</dd>
  </div>
  <div class="rd-feature">
    <dt>一致性边界</dt>
    <dd>每个 Stream Load 请求具有独立事务语义；项目不保证整个 Dataset 写入的原子性或 exactly-once，也不保证跨读取任务的数据库快照。</dd>
  </div>
</dl>

<section class="rd-development" aria-label="开发中的能力">
  <div class="rd-development-heading">
    <strong>开发中</strong>
    <span>状态核对于 2026-11-16</span>
  </div>
  <div class="rd-development-item">
    <div>
      <h3>Iceberg REST 原生读取</h3>
      <p>面向符合条件、使用 S3 或 HDFS 的 Doris Iceberg Catalog，尝试由 Ray 读取 Iceberg 表。</p>
    </div>
    <a href="https://github.com/jiangxt2/ray-doris/pull/25">PR #25 · 尚未合入</a>
  </div>
  <div class="rd-development-item">
    <div>
      <h3>Hive HDFS Kerberos 认证</h3>
      <p>为 Hive 原生读取探索从 Catalog 发现 HDFS Kerberos 配置，并使用已授权挂载的 keytab；暂不包括 Kerberos HMS。</p>
    </div>
    <a href="https://github.com/jiangxt2/ray-doris/pull/26">PR #26 · 尚未合入</a>
  </div>
  <p class="rd-development-note">具体适用条件和限制见 <a href="https://github.com/jiangxt2/ray-doris/tree/60d033bef92f7a98c0f62e0884dd8bed6d42262f/doc/source">ray-doris 项目文档</a>及对应 PR。</p>
</section>

## 持续集成概述

### CI 的作用

持续集成（Continuous Integration，CI）是在代码变更时自动运行构建和检查，帮助团队及早发现问题。

ray-doris 的 CI 除了检查 Python 代码，还验证不同 Python / Ray 组合及与真实 Doris 的交互。

本文的项目配置基于 [ray-doris 提交 `60d033b`](https://github.com/jiangxt2/ray-doris/tree/60d033bef92f7a98c0f62e0884dd8bed6d42262f)。

### ray-doris 流水线

常规 CI 在 PR、`master` 推送和定时任务中执行，包含以下独立任务：

- **单元与契约测试**：验证六组 Python / Ray 版本组合。
- **静态质量检查**：检查代码格式、lint、类型和 workflow 配置。
- **文档检查**：构建文档并检查拼写和链接。
- **Doris 集成测试**：启动真实 Doris，验证读写及协议交互。
- **包检查**：构建并验证安装包。

另有按需运行的 **slow 分布式测试**，使用多节点 Ray / Doris 验证分布式读写及其他场景；它不属于常规 PR CI。

| | 常规 Doris 集成测试 | 按需多节点分布式测试 |
| --- | --- | --- |
| 触发方式 | 常规 CI 自动运行 | 手动触发或由其他 workflow 调用 |
| 测试环境 | 单 FE、单 BE 和本地 Ray | 多个 Ray worker 和 Doris BE |
| 侧重点 | 真实 Doris 的读写、类型和协议行为 | 任务在多个 worker 上的执行及分布式读写 |

## CI 配置与执行

### 关键文件

<div class="rd-file-groups">
  <section class="rd-file-group" aria-label="CI 配置">
    <h3>CI 配置</h3>
    <ul class="rd-file-list">
      <li><span class="rd-file-path"><a href="https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/.github/workflows/ci.yml"><code>.github/workflows/ci.yml</code></a></span><span>日常 CI 的触发条件、测试矩阵和 job。</span></li>
      <li><span class="rd-file-path"><a href="https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/.github/workflows/slow-integration.yml"><code>.github/workflows/slow-integration.yml</code></a></span><span>按需运行多节点 Ray / Doris 测试。</span></li>
      <li><span class="rd-file-path"><a href="https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/tests/integration/docker-compose.yml"><code>tests/integration/docker-compose.yml</code></a></span><span>定义集成测试使用的 Doris FE 和 BE。</span></li>
    </ul>
  </section>
</div>

### 常规 CI

#### 触发条件

```yaml
# .github/workflows/ci.yml 节选；以下注释用于解释配置
on:
  workflow_call:  # 供其他 workflow 调用，可传入候选提交 SHA
    inputs:
      candidate_sha:
        description: Immutable release candidate commit to test
        required: false
        type: string
  pull_request:  # PR 打开、更新或重新打开
  push:          # 仅 master 分支的推送
    branches: [master]
  schedule:      # 每周定时运行
    - cron: "17 3 * * 1"  # 周一 03:17 UTC

# CI 包含测试、静态质量、文档、真实 Doris 集成和包检查。
# 是否阻止 PR 合并取决于仓库的分支保护设置。
```

#### 版本矩阵

```yaml
# ci.yml 的 unit job 节选：只运行下列六组组合，不做笛卡尔积
strategy:
  fail-fast: false  # 一个组合失败时，其他组合继续运行
  matrix:
    include:
      - python: "3.9"
        ray: "2.49.2"
      - python: "3.10"
        ray: "2.57.0"
      - python: "3.11"
        ray: "2.59.0"
      - python: "3.12"
        ray: "2.58.0"
      - python: "3.12"
        ray: "2.59.0"
      - python: "3.13"
        ray: "2.59.0"
```

每组运行相同的单元与契约测试；Doris 集成测试由独立任务执行。

#### 常规检查的本地运行与结果

在 ray-doris 仓库根目录，按 CI 的版本矩阵逐组执行命令并检查结果，完整日志保存在临时目录：

```bash
# 使用 Bash 或 Zsh；各组使用独立环境和日志
set -o pipefail
matrix_dir=$(mktemp -d "${TMPDIR:-/tmp}/ray-doris-matrix.XXXXXX")
printf '矩阵日志：%s\n' "${matrix_dir}"

# Python 3.9 / Ray 2.49.2
uv venv --python 3.9 "${matrix_dir}/py39-ray2492" 2>&1 | tee "${matrix_dir}/py39-ray2492.log" &&
uv pip install --python "${matrix_dir}/py39-ray2492/bin/python" \
  -e '.[test]' 'ray[data]==2.49.2' 2>&1 | tee -a "${matrix_dir}/py39-ray2492.log" &&
"${matrix_dir}/py39-ray2492/bin/python" -m pytest tests/unit tests/contract \
  --cov=ray_doris --cov-report=term-missing 2>&1 | tee -a "${matrix_dir}/py39-ray2492.log"

# Python 3.10 / Ray 2.57.0
uv venv --python 3.10 "${matrix_dir}/py310-ray2570" 2>&1 | tee "${matrix_dir}/py310-ray2570.log" &&
uv pip install --python "${matrix_dir}/py310-ray2570/bin/python" \
  -e '.[test]' 'ray[data]==2.57.0' 2>&1 | tee -a "${matrix_dir}/py310-ray2570.log" &&
"${matrix_dir}/py310-ray2570/bin/python" -m pytest tests/unit tests/contract \
  --cov=ray_doris --cov-report=term-missing 2>&1 | tee -a "${matrix_dir}/py310-ray2570.log"

# Python 3.11 / Ray 2.59.0
uv venv --python 3.11 "${matrix_dir}/py311-ray2590" 2>&1 | tee "${matrix_dir}/py311-ray2590.log" &&
uv pip install --python "${matrix_dir}/py311-ray2590/bin/python" \
  -e '.[test]' 'ray[data]==2.59.0' 2>&1 | tee -a "${matrix_dir}/py311-ray2590.log" &&
"${matrix_dir}/py311-ray2590/bin/python" -m pytest tests/unit tests/contract \
  --cov=ray_doris --cov-report=term-missing 2>&1 | tee -a "${matrix_dir}/py311-ray2590.log"

# Python 3.12 / Ray 2.58.0
uv venv --python 3.12 "${matrix_dir}/py312-ray2580" 2>&1 | tee "${matrix_dir}/py312-ray2580.log" &&
uv pip install --python "${matrix_dir}/py312-ray2580/bin/python" \
  -e '.[test]' 'ray[data]==2.58.0' 2>&1 | tee -a "${matrix_dir}/py312-ray2580.log" &&
"${matrix_dir}/py312-ray2580/bin/python" -m pytest tests/unit tests/contract \
  --cov=ray_doris --cov-report=term-missing 2>&1 | tee -a "${matrix_dir}/py312-ray2580.log"

# Python 3.12 / Ray 2.59.0
uv venv --python 3.12 "${matrix_dir}/py312-ray2590" 2>&1 | tee "${matrix_dir}/py312-ray2590.log" &&
uv pip install --python "${matrix_dir}/py312-ray2590/bin/python" \
  -e '.[test]' 'ray[data]==2.59.0' 2>&1 | tee -a "${matrix_dir}/py312-ray2590.log" &&
"${matrix_dir}/py312-ray2590/bin/python" -m pytest tests/unit tests/contract \
  --cov=ray_doris --cov-report=term-missing 2>&1 | tee -a "${matrix_dir}/py312-ray2590.log"

# Python 3.13 / Ray 2.59.0
uv venv --python 3.13 "${matrix_dir}/py313-ray2590" 2>&1 | tee "${matrix_dir}/py313-ray2590.log" &&
uv pip install --python "${matrix_dir}/py313-ray2590/bin/python" \
  -e '.[test]' 'ray[data]==2.59.0' 2>&1 | tee -a "${matrix_dir}/py313-ray2590.log" &&
"${matrix_dir}/py313-ray2590/bin/python" -m pytest tests/unit tests/contract \
  --cov=ray_doris --cov-report=term-missing 2>&1 | tee -a "${matrix_dir}/py313-ray2590.log"
```

以下是一次独立运行的 Python 3.13 / Ray 2.59 单元与契约测试日志节选，`...` 表示省略的内容：

```text
collected 687 items
tests/unit/test_api.py ..........                                        [  1%]
...
tests/unit/test_sql.py .....................                             [ 77%]
...
tests/contract/test_read_projection.py .........                         [ 99%]
...
Name                                   Stmts   Miss  Cover   Missing
...
TOTAL                                   2745    364    87%
====================== 687 passed, 42 warnings in 55.27s =======================
```

静态质量检查是独立任务，可在单独的 Python 3.12 环境运行：

```bash
quality_dir=$(mktemp -d "${TMPDIR:-/tmp}/ray-doris-quality.XXXXXX")
uv venv --python 3.12 "${quality_dir}/venv" &&
uv pip install --python "${quality_dir}/venv/bin/python" \
  -e '.[dev,flight]' 'ray[data]==2.59.0' &&
"${quality_dir}/venv/bin/ruff" format --check . &&
"${quality_dir}/venv/bin/ruff" check . &&
"${quality_dir}/venv/bin/mypy" &&
"${quality_dir}/venv/bin/pre-commit" run --all-files
```

一次本地运行的 pre-commit 输出节选：

```text
ruff check...............................................................Passed
ruff format..............................................................Passed
check toml...............................................................Passed
check yaml...............................................................Passed
```

文档和包检查也已通过。

Ray 项目同样建议先运行与改动相关的本地测试。例如，在已准备好的 Ray 开发环境中：

```bash
python -m pytest -v -s python/ray/tests/test_basic.py
```

参见 [Ray 本地测试指南](https://docs.ray.io/en/latest/ray-contribute/getting-involved.html#testing)。

#### Doris 集成测试

常规集成测试使用一个 Doris FE、一个 BE 和本地 Ray，按以下流程执行：

<ol class="ci-flow" aria-label="Doris 集成测试执行流程">
  <li><strong>准备环境</strong><span>检出代码，安装 Python、Ray 和测试依赖</span></li>
  <li><strong>启动 Doris</strong><span>构建镜像并启动 FE、BE 容器</span></li>
  <li><strong>初始化测试</strong><span>pytest 等待 Doris 就绪，准备数据并启动 Ray</span></li>
  <li><strong>执行测试</strong><span>运行真实 Doris 读写与协议测试</span></li>
  <li><strong>收集与清理</strong><span>关闭 Ray、清理测试数据，收集日志并移除容器等资源</span></li>
</ol>

CI 的 [`integration` 任务](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/.github/workflows/ci.yml)使用 [Compose 配置](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/tests/integration/docker-compose.yml)启动 Doris，并执行 `tests/integration`。测试 fixture 负责准备数据和 Ray：

**准备**：等待 Doris 就绪 → 创建测试数据 → 启动 Ray<br>
**清理**：关闭 Ray → 清理测试数据

<div class="ci-code-panel">
  <div class="ci-code-label"><span>tests/integration/conftest.py · Doris 准备与清理</span><span>Python</span></div>
{{< highlight python >}}
@pytest.fixture(scope="session")
def doris_config() -> Iterator[DorisITConfig]:
    config = _config_from_environment()
    _wait_for_doris(config)  # 等待 FE 和 BE 就绪
    _configure_stream_load_endpoint(config)
    try:
        _create_fixture_data(config)
        yield config  # 测试使用配置和数据
    finally:
        _cleanup_fixture_data(config)
{{< /highlight >}}
</div>

<div class="ci-code-panel">
  <div class="ci-code-label"><span>tests/integration/conftest.py · Ray 启动与清理（节选）</span><span>Python</span></div>
{{< highlight python >}}
@pytest.fixture(scope="session", autouse=True)
def ray_runtime(doris_config: DorisITConfig) -> Iterator[None]:
    # 省略凭据环境变量的设置
    ray.init(num_cpus=4, include_dashboard=False)
    try:
        yield  # 执行测试用例
    finally:
        ray.shutdown()
        # 省略凭据环境变量的恢复
{{< /highlight >}}
</div>

##### 端到端测试用例 {.ci-subheading}

`tests/integration` 中的以下用例通过 `write_doris()` 将 Ray Dataset 写入 Doris，检查加载统计，再通过 SQL 查询验证数据：

<div class="ci-code-panel">
  <div class="ci-code-label"><span>tests/integration/test_write.py</span><span>Python</span></div>
{{< highlight python >}}
def test_duplicate_stream_load_round_trips_rows_and_reports_doris_statistics(
    doris_config, caplog
) -> None:
    caplog.set_level("INFO", logger="ray_doris")
    # 构造 Ray Dataset，并以每批一行的方式写入 Doris
    result = write_doris(
        _from_pydict(
            {
                "id": [101, 102],
                "category": ["write-a", "write-b"],
                "score": [10, 20],
                "payload": ['{"source":"a"}', '{"source":"b"}'],
            }
        ),
        connection=doris_config.write_connection(),
        table=doris_config.write_table("write_events"),
        batch_rows=1,
    )
    # 验证写入状态、批次数、行数统计和完成日志
    assert result.status == "success"
    assert result.batches == 2
    assert result.attempted_rows == 2
    assert result.loaded_rows == 2
    assert result.filtered_rows == 0
    assert result.ray_num_rows == 2
    assert "Doris write completed status=success" in caplog.text
    assert "loaded_rows=2" in caplog.text
    # 从 Doris 查询写入的数据，验证端到端结果
    assert _query(
        doris_config,
        "SELECT id, category, score FROM write_events WHERE id IN (101, 102) ORDER BY id",
    ) == [(101, "write-a", 10), (102, "write-b", 20)]
{{< /highlight >}}
</div>

完整写入测试和辅助函数见 [写入测试](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/tests/integration/test_write.py)；读取用例在下方 Doris 语法场景中展示。

##### 本地运行 {.ci-subheading}

在隔离的工作副本中，从仓库根目录执行与 CI 对应的命令：

```bash
# 准备 Python 3.12、Ray 2.59.0 和独立日志目录
it_dir=$(mktemp -d "${TMPDIR:-/tmp}/ray-doris-it.XXXXXX")
uv venv --python 3.12 "${it_dir}/venv"
uv pip install --python "${it_dir}/venv/bin/python" \
  -e '.[test,flight]' 'ray[data]==2.59.0'

# 构建并启动仓库定义的 FE 和 BE
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  -u http_proxy -u https_proxy -u all_proxy \
  docker compose -f tests/integration/docker-compose.yml build fe
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  -u http_proxy -u https_proxy -u all_proxy \
  docker compose -f tests/integration/docker-compose.yml build be
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  -u http_proxy -u https_proxy -u all_proxy \
  docker compose -f tests/integration/docker-compose.yml up -d --no-build

# 运行集成测试并保留完整输出
set -o pipefail
"${it_dir}/venv/bin/python" -m pytest tests/integration -v \
  2>&1 | tee "${it_dir}/pytest.log"
it_status=$?

# 测试成功或失败后，都收集 Doris 日志并清理测试资源
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  -u http_proxy -u https_proxy -u all_proxy \
  docker compose -f tests/integration/docker-compose.yml logs --no-color \
  > "${it_dir}/doris-it.log"
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  -u http_proxy -u https_proxy -u all_proxy \
  docker compose -f tests/integration/docker-compose.yml down -v --rmi local
printf '测试日志：%s\n' "${it_dir}"
test "${it_status}" -eq 0
```

##### 本地运行结果 {.ci-subheading}

以下为本地日志节选，`...` 表示省略的内容。

本地增加 Doris BE 内存后，FE 和 BE 启动成功：

```text
Container rd-ci-doc-pr-retry-20261116-fe-1 Started
...
Container rd-ci-doc-pr-retry-20261116-be-1 Started
```

随后运行真实 Doris 的 Flight / MySQL 读取和 Stream Load 写入测试：

```text
collecting ... collected 65 items
tests/integration/test_flight_read.py::test_flight_reads_multiple_record_batches_with_canonical_schema PASSED [  3%]
...
tests/integration/test_mysql_read.py::test_mysql_reads_projected_filtered_rows_in_bounded_batches PASSED [ 32%]
...
tests/integration/test_write.py::test_duplicate_stream_load_round_trips_rows_and_reports_doris_statistics PASSED [ 89%]
...
tests/integration/test_write.py::test_merge_on_write_partial_update_preserves_omitted_columns PASSED [ 92%]
...
================= 65 passed, 8 warnings in 1041.72s (0:17:21) ==================
```

Doris BE 日志中的一次实际 Stream Load：

```text
be-1  | 2026-11-16T08:40:37.137272502Z I20261116 08:40:37.137199 329 stream_load.cpp:142] finished to execute stream load. ... number_total_rows=1, number_loaded_rows=1, ...
```

### 按需多节点分布式测试

```bash
# 本地运行需满足 CONTRIBUTING.md 中的 Docker 和资源要求。
# 远端慢速 workflow 使用专用 self-hosted Linux runner，支持手动触发或被调用；
# 常规 PR CI 不会自动运行它。

# 默认运行完整分布式测试（未设置 RAY_DORIS_SLOW_PROFILE 时）
tests/slow_integration/run.sh

# core：定向检查 tablet 任务和 worker 分布（含投影读取）
RAY_DORIS_SLOW_PROFILE=core tests/slow_integration/run.sh
```

full 模式使用一个 Ray head、三个 Ray worker、一个 Doris FE 和三个 BE，按以下流程执行：

<ol class="ci-flow" aria-label="slow full 分布式测试流程">
  <li><strong>启动集群</strong><span>构建镜像，启动 Ray、Doris 和代理服务并等待就绪</span></li>
  <li><strong>准备数据</strong><span>创建测试表和数据，连接 Ray 集群并等待三个 worker</span></li>
  <li><strong>分布式测试</strong><span>验证多节点读取、写入与回读，以及 TLS 和故障场景</span></li>
  <li><strong>收集与清理</strong><span>保存日志和结果，清理容器、网络、卷及测试镜像</span></li>
</ol>

脚本先注册退出清理，再启动集群和完整 pytest 测试，最后保存结果：

<div class="ci-code-panel">
  <div class="ci-code-label"><span>tests/slow_integration/run.sh · full 流程节选</span><span>Shell</span></div>
{{< highlight bash >}}
trap cleanup EXIT

# 构建测试镜像，启动服务并等待健康检查
"${compose[@]}" build ray-head fe be-1 2>&1 | tee -a "${compose_log}"
"${compose[@]}" up -d --no-build --wait --wait-timeout 300 2>&1 | tee -a "${compose_log}"
# 省略 FE 和 BE 的 Flight 服务就绪检查

# 在 Ray head 内运行完整分布式测试
(
  "${compose[@]}" exec -T ray-head \
    python -m pytest \
    -m slow_integration \
    tests/slow_integration/test_distributed_cluster.py \
    -vv -s 2>&1 | tee -a "${pytest_log}"
) &
pytest_pid=$!

# 此处省略 full 模式中的故障演练步骤

# 测试成功后生成并复制结果；退出时执行 cleanup
wait "${pytest_pid}"
pytest_pid=
"${compose[@]}" exec -T ray-head python tests/slow_integration/write_result.py
"${compose[@]}" cp ray-head:/state/slow-result.json "${result_file}"
{{< /highlight >}}
</div>

pytest fixture 准备 Doris 表和数据，确认 Flight 代理与 Ray worker 就绪：

<div class="ci-code-panel">
  <div class="ci-code-label"><span>tests/slow_integration/conftest.py · 集群 fixture</span><span>Python</span></div>
{{< highlight python >}}
@pytest.fixture(scope="session", autouse=True)
def distributed_cluster(slow_config: SlowITConfig) -> Iterator[None]:
    setup_tables(slow_config)
    wait_for_flight_proxy_backend_count(slow_config, 3)
    ray.init(address="auto")
    try:
        ray.data.DataContext.get_current()
        _wait_for_ray_workers(slow_config)
        yield  # 执行分布式测试
    finally:
        ray.shutdown()
{{< /highlight >}}
</div>

读取：验证 MySQL 和 Flight 覆盖所有 worker，并检查行数和 ID 总和：

<div class="ci-code-panel">
  <div class="ci-code-label"><span>tests/slow_integration/test_distributed_cluster.py · 分布式读取节选</span><span>Python</span></div>
{{< highlight python >}}
# 已构造 InstrumentedDorisDatasource；读取任务分散到多个 worker
dataset = ray.data.read_datasource(
    datasource,
    concurrency=3,
    override_num_blocks=BUCKET_COUNT,
    ray_remote_args={
        "num_cpus": 1,
        "scheduling_strategy": "SPREAD",
        "max_retries": 3,
    },
)
# 省略批次迭代：统计行数、ID 总和和实际执行任务的 worker
expected_node_ids = {node["NodeID"] for node in _ray_worker_nodes(slow_config)}
assert observed_node_ids == expected_node_ids
assert row_count == slow_config.row_count
assert id_sum == slow_config.expected_id_sum
{{< /highlight >}}
</div>

写入：验证各 worker 的 Stream Load 和 Doris 回读，省略部分数据准备：

<div class="ci-code-panel">
  <div class="ci-code-label"><span>tests/slow_integration/test_distributed_cluster.py · 分布式写入节选</span><span>Python</span></div>
{{< highlight python >}}
for index, node in enumerate(worker_nodes):
    # 省略每个 worker 的数据与 sink 准备
    dataset.write_datasink(
        sink,
        concurrency=1,
        ray_remote_args={
            "num_cpus": 1,
            "scheduling_strategy": NodeAffinitySchedulingStrategy(
                node_id=node["NodeID"],
                soft=False,
            ),
            "max_retries": 0,
        },
    )
    assert sink.result is not None
    assert sink.result.status == "success"
    assert sink.result.attempted_rows == worker_rows
    assert sink.result.loaded_rows == worker_rows
    assert sink.result.ray_num_rows == worker_rows
    # 省略结果汇总与偏移量更新

# 所有 worker 写入结束后，从 Doris 查询结果
rows = query_rows(
    slow_config,
    f"SELECT COUNT(*) AS row_count, SUM(id) AS id_sum "
    f"FROM `{slow_config.database}`.`{slow_config.write_table}` "
    f"WHERE id >= {id_base}",
)
assert rows == [
    {
        "row_count": write_rows,
        "id_sum": id_base * write_rows + write_rows * (write_rows - 1) // 2,
    }
]
expected_node_ids = {node["NodeID"] for node in _ray_worker_nodes(slow_config)}
observed_node_ids = {
    marker.read_text(encoding="utf-8") for marker in Path("/state").glob("ray-write-*")
}
assert observed_node_ids == expected_node_ids
{{< /highlight >}}
</div>

退出时，`cleanup` 收集 Compose 日志并移除测试容器、网络、卷和镜像；成功运行还会保留 `slow-result.json`。

[查看 slow 测试脚本](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/tests/slow_integration/run.sh) · [查看运行前提与贡献指南](https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/CONTRIBUTING.md)

#### slow full 本地运行结果

以下是本地日志节选；`...` 表示省略的内容，已去除终端颜色和首尾空格。

Ray 和 Doris 节点就绪：

```text
Container ray-doris-it-ray-worker-2-1 Healthy
Container ray-doris-it-ray-worker-3-1 Healthy
Container ray-doris-it-fe-1 Healthy
Container ray-doris-it-be-2-1 Healthy
Container ray-doris-it-be-3-1 Healthy
Container ray-doris-it-ray-worker-1-1 Healthy
Container ray-doris-it-be-1-1 Healthy
Container ray-doris-it-ray-head-1 Healthy
```

MySQL 和 Flight 读取测试均通过；各 worker 的覆盖情况由上方测试断言验证：

```text
...test_mysql_read_executes_on_all_ray_workers ...
...
PASSED
...test_flight_read_executes_on_all_ray_workers ...
...
PASSED
```

Stream Load 写入用例完成三次写入，并通过回读断言：

```text
...test_stream_load_write_executes_on_all_ray_workers ...
...
2026-11-16 00:42:12,563 ... Apache Doris Stream Load finished. 1000 rows and 34.2KiB data written.
...
2026-11-16 00:42:12,686 ... Apache Doris Stream Load finished. 1000 rows and 34.2KiB data written.
...
2026-11-16 00:42:12,787 ... Apache Doris Stream Load finished. 1000 rows and 34.2KiB data written.
PASSED
```

完整测试结果及结果文件保存记录：

```text
================= 16 passed, 21 warnings in 100.40s (0:01:40) ==================
...Copied ray-doris-it-ray-head-1:/state/slow-result.json to ...
```

本地清理检查未发现本轮测试资源残留：

```text
remaining project containers:
remaining project networks:
remaining project volumes:
remaining test tags:
```

## 兼容性问题实验

下面在隔离副本中模拟两个开发回归。日志来自本地定向测试，`...` 表示省略的内容；PR CI 的对应任务也会执行这些测试。

### Ray 版本接口兼容性

<section class="ci-scenario" aria-label="Ray 接口兼容性实验">
  <div class="ci-scenario-intro">
    <span class="ci-scenario-kicker">RAY DATA · 版本矩阵</span>
    <p>项目同时支持旧版和新版 Ray。开发者为读取任务增加行数限制时，如果直接使用新版参数，低版本可能无法创建读取任务。</p>
    <aside class="ci-api-note" aria-label="ReadTask 参数版本差异">
      <div class="ci-api-note-heading"><span>ReadTask 参数</span><code>per_task_row_limit</code></div>
      <p>限制单个读取任务的行数。</p>
      <div class="ci-api-versions">
        <span><strong>Ray 2.49.2</strong> 构造函数不支持</span>
        <span><strong>Ray 2.59.0</strong> 构造函数支持</span>
      </div>
    </aside>
  </div>

  <div class="ci-scenario-step">
    <div class="ci-step-content">
      <h4>引入回归</h4>
      <p>在 <code>DorisDatasource.get_read_tasks()</code> 的非空读取分支中，将 <code>tasks.append(make_read_task(...))</code> 替换为直接调用：</p>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>src/ray_doris/datasource.py</span><span>Python</span></div>
{{< highlight python >}}
# get_read_tasks() 的非空读取分支（节选）
for split in plan.splits:
    split = replace(split, row_limit=per_task_row_limit)
    reader = _read_zero_columns if zero_columns else read_split
    read_fn = partial(reader, self._config, split, plan.schema)
    metadata = BlockMetadata(
        num_rows=None,
        size_bytes=None,
        exec_stats=None,
        input_files=None,
    )
    # 错误改动：直接使用新版 ReadTask 参数
    tasks.append(
        ReadTask(read_fn, metadata, schema, per_task_row_limit=per_task_row_limit)
    )
{{< /highlight >}}
      </div>
    </div>
  </div>

  <div class="ci-scenario-step">
    <div class="ci-step-content">
      <h4>运行版本兼容性测试</h4>
      <p>调用关系：测试函数 → <code>datasource.get_read_tasks()</code> → <code>ReadTask(...)</code>。测试使用模拟规划结果走入上方的非空读取分支：</p>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>tests/unit/test_datasource.py</span><span>Python</span></div>
{{< highlight python >}}
def test_get_read_tasks_has_current_compatible_signature_and_schema(monkeypatch) -> None:
    # 使用模拟的规划结果，不连接 Doris
    schema = pa.schema([("id", pa.int64())])
    discover = Mock(return_value=DorisPlanningSnapshot(schema=schema, tablet_ids=(7,)))
    monkeypatch.setattr("ray_doris.datasource.DorisPlanner.discover", discover)
    datasource = DorisDatasource(table="db.table", host="fe")
    # 调用上方的 get_read_tasks()，触发 ReadTask 构造
    tasks = datasource.get_read_tasks(4, per_task_row_limit=None, data_context=object())
    # 验证任务的 schema、元数据与序列化
    assert len(tasks) == 1
    assert tasks[0].schema == schema
    assert tasks[0].metadata.num_rows is None
    assert tasks[0].metadata.size_bytes is None
    restored = cloudpickle.loads(cloudpickle.dumps(tasks[0]))
    assert restored.schema == schema
    assert restored.metadata == tasks[0].metadata
    datasource.get_read_tasks(2)
    discover.assert_called_once()
{{< /highlight >}}
      </div>
      <p>准备独立环境，并运行 CI 单元测试任务包含的定向用例：</p>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>项目根目录</span><span>Shell</span></div>
{{< highlight bash >}}
# 两个环境运行同一个定向测试
compat_test=tests/unit/test_datasource.py::test_get_read_tasks_has_current_compatible_signature_and_schema

# Ray 2.49.2
uv venv --python 3.9 .venv-ray249
uv pip install --python .venv-ray249/bin/python \
  -e '.[test]' 'ray[data]==2.49.2'
.venv-ray249/bin/python -m pytest "$compat_test" -vv

# Ray 2.59.0
uv venv --python 3.12 .venv-ray259
uv pip install --python .venv-ray259/bin/python \
  -e '.[test]' 'ray[data]==2.59.0'
.venv-ray259/bin/python -m pytest "$compat_test" -vv
{{< /highlight >}}
      </div>
      <div class="ci-result-grid ci-result-grid-logs">
        <div class="ci-code-panel">
          <div class="ci-code-label"><span>Ray 2.49.2 · 本地实测</span><span class="ci-result-fail">FAILED</span></div>
{{< highlight text >}}
E               TypeError: __init__() got an unexpected keyword argument 'per_task_row_limit'
...
1 failed in 2.19s
{{< /highlight >}}
        </div>
        <div class="ci-code-panel">
          <div class="ci-code-label"><span>Ray 2.59.0 · 本地实测</span><span class="ci-result-pass">PASSED</span></div>
{{< highlight text >}}
tests/unit/test_datasource.py::test_get_read_tasks_has_current_compatible_signature_and_schema PASSED [100%]
1 passed in 2.88s
{{< /highlight >}}
        </div>
      </div>
      <p class="ci-scenario-takeaway">同一改动在新版通过，在旧版因构造参数不兼容而失败；CI 版本矩阵能够暴露这一回归。</p>
    </div>
  </div>

  <div class="ci-scenario-step">
    <div class="ci-step-content">
      <h4>恢复兼容层并验证</h4>
      <p>恢复 <code>make_read_task()</code> 调用。兼容层会检查已安装版本的构造参数，两个版本的定向测试均通过。</p>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>src/ray_doris/datasource.py</span><span>Python</span></div>
{{< highlight python >}}
tasks.append(make_read_task(read_fn, metadata, schema, per_task_row_limit))
{{< /highlight >}}
      </div>
      <div class="ci-result-grid ci-result-grid-compact">
        <div class="ci-result-summary">
          <div class="ci-result-summary-head"><span class="ci-result-mark" aria-hidden="true">✓</span><strong>Ray 2.49.2</strong><span class="ci-result-state">通过</span></div>
          <code>1 passed in 1.29s</code>
        </div>
        <div class="ci-result-summary">
          <div class="ci-result-summary-head"><span class="ci-result-mark" aria-hidden="true">✓</span><strong>Ray 2.59.0</strong><span class="ci-result-state">通过</span></div>
          <code>1 passed in 2.03s</code>
        </div>
      </div>
    </div>
  </div>
</section>

### Doris 查询语法兼容性

<section class="ci-scenario" aria-label="Doris SQL 兼容性实验">
  <div class="ci-scenario-intro">
    <span class="ci-scenario-kicker">DORIS · SQL 与集成测试</span>
    <p>读取时，连接器会生成包含 <code>TABLET</code> 和 <code>WHERE</code> 的查询。如果拼接顺序改变，生成的语句可能不符合 Doris 语法。</p>
    <div class="ci-scenario-facts">
      <span><strong>单元测试</strong> 检查生成的 SQL</span>
      <span><strong>集成测试</strong> 连接真实 Doris</span>
    </div>
  </div>

  <div class="ci-scenario-step">
    <div class="ci-step-content">
      <h4>引入回归</h4>
      <p>在 <code>src/ray_doris/_sql.py</code> 的 <code>build_select_sql()</code> 中，误将下面的分支移到 <code>if tablet_ids is not None</code> 之前：</p>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>src/ray_doris/_sql.py</span><span>Python</span></div>
{{< highlight python >}}
# 错误改动：提前拼接 WHERE
if predicate is not None:
    sql += f" WHERE {normalize_filter(predicate)}"
{{< /highlight >}}
      </div>
      <div class="ci-result-grid">
        <div class="ci-code-panel">
          <div class="ci-code-label"><span>正确顺序</span><span>SQL</span></div>
{{< highlight sql >}}
SELECT `id`, `score` FROM `analytics`.`events`
TABLET(11, 12) WHERE score > 80
{{< /highlight >}}
        </div>
        <div class="ci-code-panel">
          <div class="ci-code-label"><span>错误顺序</span><span>SQL</span></div>
{{< highlight sql >}}
SELECT `id`, `score` FROM `analytics`.`events`
WHERE score > 80 TABLET(11, 12)
{{< /highlight >}}
        </div>
      </div>
      <p>示例 SQL 来自单元测试，语法顺序可对照 <a href="https://doris.apache.org/docs/4.x/sql-manual/sql-statements/data-query/SELECT/">Doris SELECT 文档</a>。</p>
    </div>
  </div>

  <div class="ci-scenario-step">
    <div class="ci-step-content">
      <h4>单元测试：检查 SQL 顺序</h4>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>定向单元测试</span><span>Shell</span></div>
{{< highlight bash >}}
.venv/bin/python -m pytest \
  tests/unit/test_sql.py::test_build_select_places_tablet_hint_before_where -vv
{{< /highlight >}}
      </div>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>本地实测 · SQL 顺序不一致</span><span class="ci-result-fail">FAILED</span></div>
{{< highlight text >}}
tests/unit/test_sql.py::test_build_select_places_tablet_hint_before_where FAILED [100%]
...
E         - SELECT `id`, `score` FROM `analytics`.`events` TABLET(11, 12) WHERE score > 80
...
E         + SELECT `id`, `score` FROM `analytics`.`events` WHERE score > 80 TABLET(11, 12)
1 failed in 2.03s
{{< /highlight >}}
      </div>
    </div>
  </div>

  <div class="ci-scenario-step">
    <div class="ci-step-content">
      <h4>集成测试：连接 Doris</h4>
      <p>按<a href="https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/CONTRIBUTING.md">贡献指南</a>准备隔离的 Doris 4.0.6 FE/BE；本机实验为 BE 分配了 4 GiB 内存。对应的<a href="https://github.com/jiangxt2/ray-doris/blob/60d033bef92f7a98c0f62e0884dd8bed6d42262f/tests/integration/test_mysql_read.py">读取用例</a>会执行过滤查询，并检查返回的数据：</p>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>tests/integration/test_mysql_read.py</span><span>Python</span></div>
{{< highlight python >}}
def test_mysql_reads_projected_filtered_rows_in_bounded_batches(doris_config) -> None:
    # 从 Doris 读取指定列并过滤，控制每批行数和每个分片的 tablet 数
    dataset = read_doris(
        **doris_config.reader_kwargs(
            columns=["id", "category", "amount", "created_at", "large_value"],
            filter="id >= 2",
            batch_size=1,
            tablet_size=1,
        )
    )
    # 执行读取并按 ID 排序，便于比较结果
    rows = sorted(dataset.take_all(), key=lambda row: row["id"])
    # 验证过滤结果，以及 NULL、时间和数值类型的转换
    assert [row["id"] for row in rows] == [2, 3, 4]
    assert rows[0]["category"] is None
    assert rows[0]["amount"] is None
    assert rows[0]["created_at"] == datetime(2025, 1, 2, 1, 2, 3, 1)
    assert rows[0]["large_value"] == Decimal("-170141183460469231731687303715884105728")
    assert rows[1]["amount"] == Decimal("0.000001")
{{< /highlight >}}
      </div>
      <p>CI 的集成测试任务会执行这个用例；本地可单独运行：</p>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>定向集成测试</span><span>Shell</span></div>
{{< highlight bash >}}
.venv/bin/python -m pytest \
  tests/integration/test_mysql_read.py::test_mysql_reads_projected_filtered_rows_in_bounded_batches -v
{{< /highlight >}}
      </div>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>本地实测 · 读取失败</span><span class="ci-result-fail">FAILED</span></div>
{{< highlight text >}}
tests/integration/test_mysql_read.py::test_mysql_reads_projected_filtered_rows_in_bounded_batches FAILED [100%]
...
E               ray_doris._errors.DorisReadError: failed to read Doris ray_doris_it.records tablets=1794883482557 through the MySQL protocol (MySQL error 1105)
1 failed, 3 warnings in 18.88s
{{< /highlight >}}
      </div>
      <p>集成日志显示 MySQL 错误码 1105，连接器封装了数据库原始错误。CI 的单元和集成任务分别覆盖 SQL 构造与真实读取。</p>
    </div>
  </div>

  <div class="ci-scenario-step">
    <div class="ci-step-content">
      <h4>恢复 SQL 顺序并验证</h4>
      <p>将 <code>WHERE</code> 的拼接移回 <code>TABLET</code> 之后，再运行 SQL 单元测试：</p>
      <div class="ci-code-panel">
        <div class="ci-code-label"><span>本地实测 · 恢复后</span><span class="ci-result-pass">PASSED</span></div>
{{< highlight text >}}
tests/unit/test_sql.py::test_build_select_places_tablet_hint_before_where PASSED [100%]
1 passed in 2.27s
{{< /highlight >}}
      </div>
    </div>
  </div>
</section>
