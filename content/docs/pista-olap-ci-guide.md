---
title: "Pista ClickHouse 与 Doris 集成测试 CI"
date: 2026-11-19
draft: false
summary: "通过 CI 配置、测试脚本和写入用例，了解 Pista 的 ClickHouse 与 Doris 集成测试。"
description: "介绍 Pista ClickHouse 与 Doris 测试的自动触发、手动运行、容器环境和报告检查。"
toc: true
tocTitle: "本页目录"
tocEndLevel: 4
type: "技术文档"
topics:
  - CI
  - GitHub Actions
  - Java
  - ClickHouse
  - Doris
level: "进阶"
tags:
  - ci
  - maven
  - clickhouse
  - doris
  - pista
---

## 自动与手动启动

本文以 [Pista 提交 `e25a450`](https://github.com/jiangxt2/Pista/tree/e25a4503f6bceac733cb69ca83dec693d51210b5) 为基线，介绍 ClickHouse 和 Doris 写入集成测试。

[ci.yml](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/.github/workflows/ci.yml) 在 PR、`master` 推送和合并队列事件中触发，由 [classify_changes.py](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/scripts/classify_changes.py) 按变更范围选择任务；也支持手动选择。

<ol class="ci-flow" aria-label="ClickHouse 和 Doris CI 执行流程">
  <li><strong>触发与分类</strong><span>代码变更或手动选择 → 确定测试范围</span></li>
  <li><strong>ClickHouse</strong><span><code>clickhouse-it</code> → <code>scripts/run_domain_it.sh clickhouse</code></span></li>
  <li><strong>Doris</strong><span><code>doris-it</code> → <code>scripts/run_domain_it.sh doris</code></span></li>
</ol>

CI 任务的实际入口如下；省略了检出代码、JDK 和 runner 准备步骤：

<div class="ci-code-panel">
  <div class="ci-code-label"><span>.github/workflows/ci.yml · 测试任务（节选）</span><span>YAML</span></div>
{{< highlight yaml >}}
clickhouse-it:
  if: needs.changes-and-policy.outputs.clickhouse == 'true'
  steps:
    - run: scripts/run_domain_it.sh clickhouse

doris-it:
  if: needs.changes-and-policy.outputs.doris == 'true'
  steps:
    - run: scripts/run_domain_it.sh doris
{{< /highlight >}}
</div>

**GitHub 手动运行**：进入仓库 **Actions → ci → Run workflow**，选择分支，再将 `selection` 设为 `clickhouse`、`doris` 或 `all`。实际可见性和权限取决于仓库设置。[nightly.yml](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/.github/workflows/nightly.yml) 也支持定时和手动运行；其无参数脚本入口还包含 Iceberg 和 support 测试。

**本地运行**：在 Pista 仓库根目录准备 JDK 17、Docker、Python 3 和测试镜像，然后选择一条命令：

```bash
scripts/run_domain_it.sh clickhouse  # ClickHouse 测试范围
scripts/run_domain_it.sh doris       # Doris 测试范围
```

脚本使用仓库自带的 `mvnw`（Maven Wrapper）启动项目指定的 Maven 3.9.5；首次缺少缓存时会下载，无须预先安装 Maven，但需要 JDK。本地镜像按本机镜像源和代理规则准备。CI 专用的 `prepare_hosted_runner.sh` 会删除托管 runner 的指定工具目录，**不要在本机运行**。

## 脚本如何找到 ClickHouseKeyBatchWriteIT

[run_domain_it.sh](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/scripts/run_domain_it.sh) 不直接指定测试文件，而是先发现测试，再按**包名和标签**执行：

<ol class="pista-it-flow" aria-label="run_domain_it.sh 启动集成测试的流程">
  <li>
    <span class="pista-it-flow__number" aria-hidden="true">01</span>
    <div class="pista-it-flow__body">
      <strong>选择测试范围</strong>
      <p>脚本根据参数选择测试包和预期数量。</p>
      <div class="pista-it-flow__branches">
        <div><code>clickhouse</code><span>ClickHouse 测试包 · 预期 11 项</span></div>
        <div><code>doris</code><span>Doris 测试包 · 预期 31 项</span></div>
      </div>
    </div>
  </li>
  <li>
    <span class="pista-it-flow__number" aria-hidden="true">02</span>
    <div class="pista-it-flow__body">
      <strong>发现测试，不执行测试方法</strong>
      <p><code>./mvnw -B -Pci-discovery process-test-classes -DskipTests</code></p>
      <p>编译测试类 → <code>DiscoverIntegrationTests.java</code> 生成 <code>discovered.tsv</code> → 校验发现清单。</p>
    </div>
  </li>
  <li>
    <span class="pista-it-flow__number" aria-hidden="true">03</span>
    <div class="pista-it-flow__body">
      <strong>再次调用 Maven，执行 IT</strong>
      <p><code>./mvnw -B test -Pit -DmembersOnlySuites=...</code></p>
      <p><code>test</code> 阶段运行 ScalaTest 插件；<code>-Pit</code> 包含 <code>DockerIT</code> 标签，<code>membersOnlySuites</code> 选择对应测试包。上方省略报告参数和包名。</p>
    </div>
  </li>
  <li>
    <span class="pista-it-flow__number" aria-hidden="true">04</span>
    <div class="pista-it-flow__body">
      <strong>准备环境并执行用例</strong>
      <p>下方写入示例通过 <code>beforeAll()</code> 按需准备 Spark、PostgreSQL 和目标数据库容器，然后执行测试方法。</p>
      <div class="pista-it-flow__branches">
        <div><code>clickhouse</code><span>例如 ClickHouseKeyBatchWriteIT</span></div>
        <div><code>doris</code><span>例如 DorisStreamLoadIT</span></div>
      </div>
    </div>
  </li>
  <li>
    <span class="pista-it-flow__number" aria-hidden="true">05</span>
    <div class="pista-it-flow__body">
      <strong>清理资源并校验报告</strong>
      <p>测试结束后清理测试对象；测试 JVM 退出时关闭共享资源。Maven 返回后，脚本对照发现清单、XML 报告和预期数量。</p>
    </div>
  </li>
</ol>

<div class="ci-code-panel">
  <div class="ci-code-label"><span>scripts/run_domain_it.sh · 核心步骤（节选）</span><span>Shell</span></div>
{{< highlight bash >}}
# clickhouse 参数选择两个包；第二个包包含 ClickHouseKeyBatchWriteIT
clickhouse_packages="com.pista.spark.sql.clickhouse.meta,com.pista.spark.sql.connector.clickhouse"

# 第一次调用：编译并发现测试，不执行测试方法
./mvnw -B -Pci-discovery process-test-classes -DskipTests ...
python3 -B scripts/verify_it_reports.py "$name" "$report_dir" --before

# 第二次调用：profile=it，packages 为所选 ClickHouse 包
args=(-B test "$report_option")
args+=("-P${profile}")
args+=("-DmembersOnlySuites=${packages}")
./mvnw "${args[@]}" 2>&1 | tee -a "$log_file"
python3 -B scripts/verify_it_reports.py "$name" "$report_dir"
{{< /highlight >}}
</div>

测试类位于所选包中，且通过 `BaseIT` 获得 `DockerIT` 标签，因而匹配 [pom.xml](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/pom.xml) 的 `it` profile：

<div class="ci-code-panel">
  <div class="ci-code-label"><span>测试基类与 pom.xml · 筛选条件（跨文件节选）</span><span>Scala / XML</span></div>
{{< highlight scala >}}
class ClickHouseKeyBatchWriteIT extends ClickHouseITSupport
// ClickHouseITSupport → ClickHouseBaseIT → SparkBaseIT → BaseIT

// BaseIT 注册测试时追加 DockerIT 标签
super.test(testName, (testTags :+ DockerIT): _*)(testFun)(pos)
{{< /highlight >}}
{{< highlight xml >}}
<!-- pom.xml 的 it profile -->
<tagsToInclude>com.pista.DockerIT</tagsToInclude>
{{< /highlight >}}
</div>

进入测试类后，继承的 `beforeAll()` 检查 Docker、准备 Spark，并按需启动 ClickHouse 和 PostgreSQL；初始化元数据后才执行下方的写入用例。具体初始化顺序还受惰性对象和 Spark 配置访问影响。源码见 [BaseIT.scala](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/pista-test-common/src/test/scala/com/pista/spark/sql/test/base/BaseIT.scala) 和 [ClickHouseBaseIT.scala](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/pista-test-common/src/test/scala/com/pista/spark/sql/test/base/ClickHouseBaseIT.scala)。

## 镜像与容器启动

测试通过 Testcontainers 按需创建服务，两个写入示例都使用 Spark 和 PostgreSQL 元数据服务：

| 服务 | 默认镜像标签 | 测试拓扑 |
| --- | --- | --- |
| ClickHouse | `clickhouse/clickhouse-server:25.3.2.39` | 三节点、三分片、Keeper quorum |
| Doris FE / BE | `apache/doris:fe-3.0.6.2` / `apache/doris:be-3.0.6.2` | 一个 FE、两个 BE |
| PostgreSQL | `postgres:16.14` | 测试元数据服务 |

Doris 版本由 `doris.version` 测试属性决定。`run_domain_it.sh` 的位置参数是测试范围，不能直接追加 `-Ddoris.version=...` 作为脚本参数。

### ClickHouse 容器

[PistaClickHouseContainer.scala](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/pista-test-common/src/test/scala/com/pista/spark/sql/test/container/PistaClickHouseContainer.scala) 为每个节点设置 **1 GiB** 内存，暴露容器端口 `8123`、`9000`、`9181`，并通过 `8123/ping` 检查就绪。宿主机端口由 Testcontainers 映射。

<div class="ci-code-panel">
  <div class="ci-code-label"><span>PistaClickHouseContainer.scala · 配置与启动（跨位置节选）</span><span>Scala</span></div>
{{< highlight scala >}}
private val image = DockerImageName.parse("clickhouse/clickhouse-server:25.3.2.39")
private val nodeNames = (1 to 3).map(shard => s"ck-s${shard}r1")

// buildNode 中的容器资源和端口配置；省略其他设置
cmd.withMemory(1L << 30).withMemorySwap(1L << 30)
node.withNetwork(network).withExposedPorts(8123, 9000, 9181)

// start 中启动三个节点，并等待 Keeper 就绪
nodes = nodeNames.map(buildNode)
startNodesConcurrently() // 并发启动，节点间错开 5 秒
awaitKeeperQuorum()      // 等待一个 leader 和两个 follower
executeOnEntry(s"CREATE DATABASE IF NOT EXISTS pista_test ON CLUSTER $clusterName")
{{< /highlight >}}
</div>

### Doris 容器

[PistaDorisContainer.scala](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/pista-test-common/src/test/scala/com/pista/spark/sql/test/container/PistaDorisContainer.scala) 为 FE 和每个 BE 分别设置 **2 GiB** 内存。FE 暴露 `8030`、`9030`，BE 暴露 `8040`、`9050`；宿主机端口由 Testcontainers 映射。

<div class="ci-code-panel">
  <div class="ci-code-label"><span>PistaDorisContainer.scala · 配置与启动（跨位置节选）</span><span>Scala</span></div>
{{< highlight scala >}}
private val version = sys.props.getOrElse("doris.version", "3.0.6.2")
private val feImage = DockerImageName.parse(s"apache/doris:fe-$version")
private val beImage = DockerImageName.parse(s"apache/doris:be-$version")

// FE 和 BE 的容器内存限制；省略其他节点设置
cmd.withMemory(2L << 30).withMemorySwap(2L << 30)

fe.start()                                  // 等待 FE /api/bootstrap
val feIp = containerNetworkIp(fe)
bes = beAliases.map(alias => buildBe(alias, feIp))
bes.foreach(_.start())                      // 依次启动两个 BE，检查 /api/health
waitBackendsAlive()                         // SHOW BACKENDS：检查注册和容量
{{< /highlight >}}
</div>

PostgreSQL 的 `5432` 端口也由 Testcontainers 映射，就绪时执行 `SELECT 1`；见 [PistaPostgresContainer.scala](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/pista-test-common/src/test/scala/com/pista/spark/sql/test/container/PistaPostgresContainer.scala)。

## 写入与结果

### ClickHouse：写入并验证分片

[ClickHouseKeyBatchWriteIT.scala](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/pista-connector/src/test/scala/com/pista/spark/sql/connector/clickhouse/ClickHouseKeyBatchWriteIT.scala) 写入 30 个固定主键，检查三条分片元数据及每个分片的数据：

<div class="ci-code-panel">
  <div class="ci-code-label"><span>ClickHouseKeyBatchWriteIT.scala · 写入与断言（节选）</span><span>Scala</span></div>
{{< highlight scala >}}
val ids = 1 to 30 // 省略测试表创建
write(sourceRows(ids.map(index => index -> s"value-$index")),
  writerConfig(database, table))

val records = shardMetaRecords(database, table)
assert(records.size == 3)
assert(records.forall(_.status == RecordStatus.SUCCESS_VALUE))
assert(records.map(_.insertDataVolume).sum == ids.size)
assertExactShardRows(database, table, ids)
{{< /highlight >}}
</div>

### Doris：Stream Load 与回读

[DorisStreamLoadIT.scala](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/pista-connector/src/test/scala/com/pista/spark/sql/connector/doris/DorisStreamLoadIT.scala) 写入 100,001 行，回读行数，并检查 tablet 副本位于两个存活的 BE：

<div class="ci-code-panel">
  <div class="ci-code-label"><span>DorisStreamLoadIT.scala · 写入与断言（节选）</span><span>Scala</span></div>
{{< highlight scala >}}
// 省略测试表创建；表配置为两个副本
val source = spark.range(100001).selectExpr("id", "concat('value-', id) AS value")
val config = batchConfig(database, table, writeMode = WriteMode.STREAM_LOAD)
val result = new SparkDorisConnectorWriter(config, source, System.currentTimeMillis()).write()
assert(result.success)
assert(queryLong(s"SELECT COUNT(*) FROM `$database`.`$table`") == 100001L)
// 完整用例随后检查 tablet 副本和存活的 BE
{{< /highlight >}}
</div>

### 报告与清理

脚本保存 `target/pista-it-*/run.log`，并通过 [verify_it_reports.py](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/scripts/verify_it_reports.py) 核对发现清单与各模块的 XML 报告；CI 分别上传 `clickhouse-it-reports` 和 `doris-it-reports`。

测试基类清理测试表和 Spark session；[ContainerSuite.scala](https://github.com/jiangxt2/Pista/blob/e25a4503f6bceac733cb69ca83dec693d51210b5/pista-test-common/src/test/scala/com/pista/spark/sql/test/container/ContainerSuite.scala) 在测试 JVM 关闭时收集已注册日志并释放共享资源。异常中断后应检查本次测试资源是否遗留。
