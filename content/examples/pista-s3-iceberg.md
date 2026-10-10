---
title: "Pista 将 Hive 表转存至 S3 Iceberg：使用 Gravitino REST Catalog"
date: 2026-10-09
draft: false
summary: "使用 Pista 将 Hive 源表转存到 S3 上由 Gravitino REST Catalog 管理的 Iceberg 表，并读回核对。"
description: "基于 Spark Hive support、已有 S3／兼容存储和 Gravitino Iceberg REST Catalog 的 Pista 批处理示例，包含完整 SQL、依赖配置与转存校验。"
toc: true
tocTitle: "本页目录"
translationKey: "example-pista-s3-iceberg"
type: "示例文档"
topics:
  - Spark
  - Pista
  - Hive
  - S3
  - Iceberg
  - Gravitino
level: "进阶"
tags:
  - spark-sql
  - pista
  - hive
  - s3
  - iceberg
  - gravitino
---

## 前情提要

Pista 2.5.0 已发布，可从 [GitHub Release](https://github.com/jiangxt2/Pista/releases/tag/v2.5.0) 获取完整运行时 JAR。本例读取现有 Hive 表，将选定字段写入由 Gravitino REST Catalog 管理的 S3 Iceberg 表，再从新的 Spark Application 读回核对。

Spark Hive catalog 读取源表，Pista 按序执行 SQL；目标表由 Gravitino Iceberg REST Catalog 管理，Iceberg 通过 S3FileIO 写入数据和元数据。

## 准备运行环境

使用 **Bash** 和 Spark `local[2]` client 模式。所有命令从同一工作目录运行，示例文件保存在 `pista-examples/`。

| 组件 | 本页基线 |
| --- | --- |
| Java | JDK 17 |
| Spark / Scala | Spark 3.5.8 / Scala 2.12.18 |
| Hadoop | 3.3.4，须核对 Spark 发行包实际版本 |
| Hive catalog | Spark 3.5.8 Hive support；需要现有 Hive Metastore 的 Thrift URI |
| Iceberg 客户端 | 1.10.1 |
| Gravitino REST 服务 | 1.3.0 |
| Pista | 2.5.0；GitHub Release tag `v2.5.0` |

> **测试环境**：JDK 17.0.16；Gravitino REST 1.3.0 的 JDBC Catalog 使用服务端 Iceberg 1.11.0 和 PostgreSQL 16.14；MinIO 为 `RELEASE.2025-06-13T11-33-47Z`。运行时镜像与依赖 JAR 来自缓存。四行 Hive 夹具的读取、导入和新 Application 读回均通过；双向 `EXCEPT ALL` 断言、目标 schema、`days(event_date)` 分区和一个 snapshot 均核对通过。测试使用内嵌 Derby Metastore，未覆盖外部 Hive Thrift Metastore。

运行前提供现有 Hive Metastore 的 Thrift URI、database 和 table。SQL 示例使用 `id`、`event_date`、`amount`、`customer` 四列；按实际表结构调整投影和目标 schema。Spark driver 与 executors 必须能访问源文件，转存期间应保持源数据稳定。

`PISTA_HIVE_METASTORE_URI` 只指定 Thrift endpoint；Kerberos 等认证沿用现有 Hive/Hadoop 配置。

若 Hive 源表位于 `s3a://`，需单独配置匹配 Hadoop 版本的 S3A connector、`spark.hadoop.fs.s3a.*` 和源端凭据；目标 Iceberg 表使用 S3FileIO。

Gravitino REST Catalog 的 warehouse 应指向现有 S3／兼容存储，并允许创建 namespace、表和提交；Gravitino 服务端须能访问该 warehouse。Spark Hive catalog 读取源表，Iceberg Catalog 管理目标表；不要将 Iceberg 表目录当作普通 Parquet 读取。

连接现有 Gravitino REST 服务，并按部署设置 URI 和认证。[Gravitino Iceberg REST 配置](https://gravitino.apache.org/docs/1.3.0/iceberg-rest-service/)。服务端 warehouse 指向表数据所在的 S3 路径；多 Catalog 部署调用 `submit.sh` 时，在 SQL 文件名后追加 `--conf spark.sql.catalog.lake.warehouse=<catalog-name>` 选择 Catalog，单一默认 Catalog 可省略。这里的客户端 `warehouse` 是 Catalog 名称，不是 S3 路径。Snapshot 查询需要可读的 metadata JSON；本例使用 JDBC 后端。

Gravitino 服务端需配置独立的 S3 凭据；S3FileIO 所需 AWS bundle 和 JDBC 驱动 JAR 必须位于 REST 服务 classpath。客户端的 `AWS_*` 环境变量不会配置服务端。

### 准备 Pista assembly

使用 [Pista 2.5.0 GitHub Release](https://github.com/jiangxt2/Pista/releases/tag/v2.5.0) 中的 `pista-2.5.0.jar`。替换为本机 JDK 17 和 Spark 3.5.8 路径后下载：

~~~bash
mkdir -p pista-examples
export JAVA_HOME="/path/to/jdk-17"
export SPARK_HOME="/path/to/spark-3.5.8-bin-hadoop3"
java -version
"${SPARK_HOME}/bin/spark-submit" --version
ls "${SPARK_HOME}"/jars/hadoop-client-api-*.jar

curl -fL --retry 3 \
  -o pista-examples/pista-2.5.0.jar \
  https://github.com/jiangxt2/Pista/releases/download/v2.5.0/pista-2.5.0.jar

export PISTA_JAR="$PWD/pista-examples/pista-2.5.0.jar"
~~~

该附件是完整 Spark-submit 运行时，不能用单个模块 JAR 替代。

从源码构建时使用同一发布 tag、Maven 3.8.8 或更高版本和 JDK 17。首次构建再 clone；已有目录应确认对应 `v2.5.0`：

~~~bash
mvn -version
git clone --branch v2.5.0 --depth 1 https://github.com/jiangxt2/Pista.git pista-examples/Pista-source
mvn -B -f pista-examples/Pista-source/pom.xml package -DskipTests
export PISTA_JAR="$PWD/pista-examples/Pista-source/pista-assembly/target/pista-2.5.0.jar"
~~~

tag 的 POM 已声明 2.5.0，无需覆盖 `revision`。`-DskipTests` 只生成 JAR，不代表测试通过。

### 补齐 Spark 侧依赖

Pista JAR 不含 Iceberg runtime 和 S3FileIO 所需的 AWS SDK。脚本通过 `--packages` 引入：

- `org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.10.1`：Spark 3.5／Scala 2.12 的 Iceberg runtime。
- `org.apache.iceberg:iceberg-aws-bundle:1.10.1`：S3FileIO 所需的 AWS SDK v2。

Hive 源表若位于 `s3a://`，还需添加匹配 Hadoop 版本的 `hadoop-aws` 和兼容的 SDK v1，并配置源端 S3A。[Hadoop S3A 依赖说明](https://hadoop.apache.org/docs/r3.3.4/hadoop-aws/tools/hadoop-aws/index.html)。

离线运行时，将完整 Iceberg runtime 和 AWS SDK v2 JAR 路径以逗号分隔设置到 `PISTA_EXTRA_JARS`；脚本改用 `--jars`。SDK 集合需包含 S3、STS、HTTP 客户端及其传递依赖。测试环境使用的 AWS SDK v2 版本为 2.33.0。

使用已验证的离线模式时，先把完整依赖集合放入 `pista-examples/deps/`，再从共同工作目录执行：

~~~bash
export PISTA_EXTRA_JARS="$(find -L "$PWD/pista-examples/deps" -type f -name '*.jar' | sort | paste -sd, -)"
test -n "$PISTA_EXTRA_JARS"
~~~

不要只放 `s3-2.33.0.jar`。在线 `--packages` 方式需要可访问的制品仓库；本例未验证在线依赖下载。

## 设置存储与 Catalog

填写 S3 endpoint、region、path-style、Gravitino REST URI，以及现有 Hive Metastore URI、database 和 table。目标 warehouse 由 Gravitino REST Catalog 配置；使用部署实际的 REST 服务路径（示例为 `/iceberg`）。

~~~bash
export PISTA_S3_ENDPOINT="https://s3.us-east-1.amazonaws.com"
export PISTA_S3_REGION="us-east-1"
export PISTA_S3_PATH_STYLE="false"
export PISTA_REST_URI="https://gravitino.example.com/iceberg"
export PISTA_HIVE_METASTORE_URI="thrift://hive-metastore.example.com:9083"
export PISTA_HIVE_DATABASE="your_source_database"
export PISTA_HIVE_TABLE="your_source_table"

export PISTA_RUN_ID="$(date -u +%Y%m%d_%H%M%S)_$$"
export PISTA_NAMESPACE="pista_example_${PISTA_RUN_ID}"

read -r -p "AWS access key ID: " AWS_ACCESS_KEY_ID
read -r -s -p "AWS secret access key: " AWS_SECRET_ACCESS_KEY
printf '\n'
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
read -r -s -p "AWS session token (press Enter if unused): " AWS_SESSION_TOKEN
printf '\n'
if [[ -n "$AWS_SESSION_TOKEN" ]]; then
  export AWS_SESSION_TOKEN
else
  unset AWS_SESSION_TOKEN
fi
~~~

### 使用 Pista 环境配置

如果使用 Pista 配置文件管理环境变量，可用下面的方式加载，替代上方手动导出的 S3 endpoint 和 REST URI；Hive 表参数、namespace 和 AWS 凭据仍按上文设置。首次使用时，将 [`pista-env.sh.template`](https://github.com/jiangxt2/Pista/blob/v2.5.0/shell/pista-env.sh.template) 复制为 `pista-env.sh`，放在 `${PISTA_CONF_DIR:-${PISTA_HOME}/shell}`。下面只列出与本例相关的脱敏配置；`PISTA_S3_ENDPOINT` 仅在目标 S3FileIO 与 S3A 使用同一 endpoint 时才映射：

~~~bash
# pista-env.sh 中与本例相关的配置
export PISTA_ICEBERG_REST_URI="https://gravitino.example.com/iceberg"
export PISTA_S3A_ENDPOINT="https://minio.example.com"

# 本页 submit.sh 使用的变量名
export PISTA_REST_URI="${PISTA_ICEBERG_REST_URI}"
export PISTA_S3_ENDPOINT="${PISTA_S3A_ENDPOINT}"
export PISTA_S3_REGION="us-east-1"
export PISTA_S3_PATH_STYLE="true"
~~~

每个 shell 中先设置 `PISTA_HOME`，再 source [`load-pista-env.sh`](https://github.com/jiangxt2/Pista/blob/v2.5.0/shell/load-pista-env.sh)：

~~~bash
export PISTA_HOME="/path/to/pista"
export PISTA_CONF_DIR="$HOME/.config/pista"
source "${PISTA_HOME}/shell/load-pista-env.sh"
~~~

loader 优先加载 `pista-env.local.sh`，否则加载 `pista-env.sh`，不会合并两个文件；选中的文件应包含本次提交需要的全部变量。模板中的 `PISTA_S3A_ACCESS_KEY`／`PISTA_S3A_SECRET_KEY` 不会配置目标 S3FileIO 凭据，后者仍按上文通过 `AWS_*` 环境变量提供。loader 只加载和导出变量；Iceberg Catalog 的 Spark 参数由本页 `submit.sh` 设置，Pista 的 `run_select.sh` 不包含这些选项。

凭据通过交互读取，不写入脚本或命令历史；secret key 与 session token 使用隐藏输入，留空 token 会清除继承值。集群部署需分别配置 driver、executor 和 Catalog 服务端的凭据与网络。

### Iceberg 的 S3 访问路径

| 用途 | 配置位置 | URI |
| --- | --- | --- |
| Iceberg 的元数据和数据文件 | `spark.sql.catalog.lake.*` 与 S3FileIO | Catalog 返回的表 location，通常为 `s3://...` |

Iceberg 使用 S3FileIO 写入 Catalog 返回的表路径。[Iceberg S3FileIO 说明](https://iceberg.apache.org/docs/1.10.1/aws/)。

脚本从环境读取 AWS 凭据。若 Gravitino 启用了 credential vending，按服务配置调整 Spark 侧的凭据方式。

### REST 认证与受控配置

本页假定 REST 访问已配置。需要 token 或 OAuth 时，将部署所需配置放在版本控制目录外、权限为 `0600` 的 Spark properties 文件中，并设置 `PISTA_SPARK_PROPERTIES`。不要把凭据写入 `--conf`、SQL 或日志；单独设置 token 环境变量不会自动启用 Iceberg REST 认证。

## 保存通用提交脚本

将以下内容保存为 `pista-examples/submit.sh`，用 `bash` 执行。脚本遇错即停，查询结果输出到控制台。

~~~bash
#!/usr/bin/env bash
set -euo pipefail

sql_name="${1:?Usage: bash pista-examples/submit.sh <name.sql> [spark options]}"
shift
[[ "$sql_name" =~ ^[a-z][a-z0-9-]*\.sql$ ]] || {
  echo "Use a plain SQL filename." >&2
  exit 1
}
sql_file="$PWD/pista-examples/$sql_name"
[[ -r "$sql_file" ]] || { echo "SQL file is not readable." >&2; exit 1; }

for key in JAVA_HOME SPARK_HOME PISTA_JAR PISTA_S3_ENDPOINT PISTA_S3_REGION PISTA_S3_PATH_STYLE PISTA_REST_URI PISTA_HIVE_METASTORE_URI PISTA_NAMESPACE PISTA_HIVE_DATABASE PISTA_HIVE_TABLE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [[ -n "${!key:-}" ]] || { echo "Set $key." >&2; exit 1; }
done
[[ -r "$PISTA_JAR" ]] || { echo "PISTA_JAR is not readable." >&2; exit 1; }
[[ "$PISTA_NAMESPACE" =~ ^[a-z][a-z0-9_]*$ ]] || {
  echo "Use a lowercase namespace containing letters, digits and underscores." >&2
  exit 1
}
[[ "$PISTA_HIVE_DATABASE" =~ ^[a-z][a-z0-9_]*$ ]] || {
  echo "Use a lowercase Hive database name containing letters, digits and underscores." >&2
  exit 1
}
[[ "$PISTA_HIVE_TABLE" =~ ^[a-z][a-z0-9_]*$ ]] || {
  echo "Use a lowercase Hive table name containing letters, digits and underscores." >&2
  exit 1
}
[[ "$PISTA_HIVE_METASTORE_URI" == thrift://* ]] || {
  echo "PISTA_HIVE_METASTORE_URI must use a thrift:// URI." >&2
  exit 1
}
[[ "$PISTA_S3_PATH_STYLE" == true || "$PISTA_S3_PATH_STYLE" == false ]] || {
  echo "PISTA_S3_PATH_STYLE must be true or false." >&2
  exit 1
}
[[ "$PISTA_S3_ENDPOINT" =~ ^https?:// && "$PISTA_REST_URI" =~ ^https?:// ]] || {
  echo "Use complete HTTP or HTTPS endpoint URLs." >&2
  exit 1
}
packages="org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.10.1,org.apache.iceberg:iceberg-aws-bundle:1.10.1"
spark_options=(
  --master "local[2]"
  --deploy-mode client
  --class com.pista.spark.sql.batch.SparkSQLSubmitter
  --files "$sql_file"
  --conf "spark.pista.sqlFile_=$sql_name"
  --conf spark.pista.errorPolicy=fail-fast
  --conf spark.pista.output.format=console
  --conf spark.pista.output.options.numRows=20
  --conf spark.sql.session.timeZone=UTC
  --conf spark.sql.catalogImplementation=hive
  --conf "spark.hadoop.hive.metastore.uris=$PISTA_HIVE_METASTORE_URI"
  --conf spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions
  --conf 'spark.redaction.regex=(?i)secret|password|token|credential|access[._-]?key'
  --conf spark.sql.catalog.lake=org.apache.iceberg.spark.SparkCatalog
  --conf spark.sql.catalog.lake.type=rest
  --conf "spark.sql.catalog.lake.uri=$PISTA_REST_URI"
  --conf spark.sql.catalog.lake.io-impl=org.apache.iceberg.aws.s3.S3FileIO
  --conf "spark.sql.catalog.lake.s3.endpoint=$PISTA_S3_ENDPOINT"
  --conf "spark.sql.catalog.lake.s3.path-style-access=$PISTA_S3_PATH_STYLE"
  --conf "spark.sql.catalog.lake.client.region=$PISTA_S3_REGION"
  --conf "spark.pista.params.namespace=$PISTA_NAMESPACE"
  --conf "spark.pista.params.hive_database=$PISTA_HIVE_DATABASE"
  --conf "spark.pista.params.hive_table=$PISTA_HIVE_TABLE"
)
if [[ -n "${PISTA_EXTRA_JARS:-}" ]]; then
  spark_options+=(--jars "$PISTA_EXTRA_JARS")
else
  spark_options+=(--packages "$packages")
fi
if [[ -n "${PISTA_SPARK_PROPERTIES:-}" ]]; then
  [[ -r "$PISTA_SPARK_PROPERTIES" ]] || {
    echo "PISTA_SPARK_PROPERTIES is not readable." >&2
    exit 1
  }
  spark_options+=(--properties-file "$PISTA_SPARK_PROPERTIES")
fi
exec "${SPARK_HOME}/bin/spark-submit" "${spark_options[@]}" "$@" "$PISTA_JAR"
~~~

`--files` 分发 SQL 文件，`spark.pista.sqlFile_` 使用其文件名；Pista 从 driver 本地路径或 SparkFiles 读取。[Pista SQL 文件说明](https://github.com/jiangxt2/Pista/blob/v2.5.0/docs/reference/sql-template.md)。

endpoint 必须使用存储服务实际提供的 URL scheme。示例使用 HTTPS；若受控的兼容存储只提供 HTTP，将 endpoint 改为 `http://...`。脚本不另行设置 TLS 选项。

## 读取现有 Hive 源表

`PISTA_HIVE_DATABASE`.`PISTA_HIVE_TABLE` 应已存在。保存以下 SQL 为 `pista-examples/read-hive.sql`，检查源表行和汇总值：

~~~sql
SELECT id, event_date, amount, customer
FROM spark_catalog.${hive_database}.${hive_table} ORDER BY id;

SELECT COUNT(*) AS row_count, SUM(id) AS id_sum, SUM(amount) AS amount_sum
FROM spark_catalog.${hive_database}.${hive_table};
~~~

~~~bash
bash pista-examples/submit.sh read-hive.sql
~~~

四行数据的查询输出示例如下；实际行数和汇总值以读者现有的 Hive 表为准。

~~~text
+---+----------+------+--------+
|id |event_date|amount|customer|
+---+----------+------+--------+
|1  |2026-10-01|100.00|Alice   |
|2  |2026-10-01|250.00|Bob     |
|3  |2026-10-01|400.00|Carol   |
|4  |2026-10-02|500.00|Dave    |
+---+----------+------+--------+

+---------+------+----------+
|row_count|id_sum|amount_sum|
+---------+------+----------+
|4        |10    |1250.00   |
+---------+------+----------+
~~~

`${hive_database}` 和 `${hive_table}` 是 Pista FreeMarker 结构参数；脚本会将它们校验为小写标识符。

## 将 Hive 表导入 Iceberg

保存为 `pista-examples/load-iceberg.sql`：

~~~sql
CREATE NAMESPACE IF NOT EXISTS lake.${namespace};

CREATE TABLE lake.${namespace}.events (
  id BIGINT,
  event_date DATE,
  amount DECIMAL(10, 2),
  customer STRING
)
USING iceberg
PARTITIONED BY (days(event_date));

INSERT INTO lake.${namespace}.events
SELECT id, event_date, amount, customer
FROM spark_catalog.${hive_database}.${hive_table};

WITH hive_only AS (
  SELECT id, event_date, amount, customer
  FROM spark_catalog.${hive_database}.${hive_table}
  EXCEPT ALL
  SELECT id, event_date, amount, customer FROM lake.${namespace}.events
), iceberg_only AS (
  SELECT id, event_date, amount, customer FROM lake.${namespace}.events
  EXCEPT ALL
  SELECT id, event_date, amount, customer
  FROM spark_catalog.${hive_database}.${hive_table}
)
SELECT assert_true(
  (SELECT COUNT(*) FROM hive_only) = 0 AND
  (SELECT COUNT(*) FROM iceberg_only) = 0,
  'Hive and Iceberg rows differ'
) AS verified;
~~~

~~~bash
bash pista-examples/submit.sh load-iceberg.sql
~~~

断言通过时的 Pista 输出示例：

~~~text
+--------+
|verified|
+--------+
|NULL    |
+--------+
~~~

Spark `assert_true` 条件成立时返回 `NULL`；条件不成立会抛出异常。[函数说明](https://spark.apache.org/docs/3.5.8/api/sql/index.html#assert_true)。

Catalog 名为 `lake`，namespace 由脚本校验。表 `lake.<namespace>.events` 按 `days(event_date)` 分区，文件位置由 Catalog 管理。按 Hive 源表调整投影和目标 schema。

`CREATE TABLE` 和 `INSERT INTO` 是原生 SQL 命令，不经过 Pista 的 SELECT Processor 或文件输出路径。[Pista Catalog 说明](https://github.com/jiangxt2/Pista/blob/v2.5.0/docs/modules/catalog.md)。

建表不使用 `IF NOT EXISTS`，同一 namespace 重跑会失败。多条 SQL 不构成事务，后续失败不会回滚已完成的写入；遇错先检查表和 snapshots，再决定是否重跑。

## 读回 Iceberg 转存结果

保存为 `pista-examples/read-iceberg.sql`。新 Application 会读取目标表并与 Hive 源表核对：

~~~sql
SELECT id, event_date, amount, customer
FROM lake.${namespace}.events ORDER BY id;

WITH hive_only AS (
  SELECT id, event_date, amount, customer
  FROM spark_catalog.${hive_database}.${hive_table}
  EXCEPT ALL
  SELECT id, event_date, amount, customer FROM lake.${namespace}.events
), iceberg_only AS (
  SELECT id, event_date, amount, customer FROM lake.${namespace}.events
  EXCEPT ALL
  SELECT id, event_date, amount, customer
  FROM spark_catalog.${hive_database}.${hive_table}
)
SELECT assert_true(
  (SELECT COUNT(*) FROM hive_only) = 0 AND
  (SELECT COUNT(*) FROM iceberg_only) = 0,
  'Hive and Iceberg rows differ'
) AS verified;

SELECT snapshot_id, parent_id, operation, summary
FROM lake.${namespace}.events.snapshots ORDER BY committed_at;
~~~

~~~bash
bash pista-examples/submit.sh read-iceberg.sql
~~~

Pista 控制台的读回结果与 Hive 源表一致；双向断言通过时 `verified` 返回 `NULL`：

~~~text
+---+----------+------+--------+
|id |event_date|amount|customer|
+---+----------+------+--------+
|1  |2026-10-01|100.00|Alice   |
|2  |2026-10-01|250.00|Bob     |
|3  |2026-10-01|400.00|Carol   |
|4  |2026-10-02|500.00|Dave    |
+---+----------+------+--------+

+--------+
|verified|
+--------+
|NULL    |
+--------+
~~~

Snapshot 查询返回一个 `append` snapshot。

## 常见问题

### 依赖与类路径

- **缺少 S3AFileSystem**：仅当源表使用 `s3a://` 时检查；加载与 Hadoop 匹配的 `hadoop-aws` 和 AWS SDK v1。
- **缺少 SparkCatalog／S3FileIO，或出现 NoSuchMethodError**：确认 Iceberg runtime、AWS bundle 与 Spark／Scala 版本匹配，并排除重复 JAR。

### 存储与 Catalog

- **S3 403、签名或 region 错误**：区分 Hive 源端 S3A、Spark 侧 S3FileIO 和 Gravitino 服务端；核对 endpoint、region、path-style、凭据、临时 token 和对象存储权限。
- **REST 401／403／404**：401 检查认证，403 检查权限，404 核对 `/iceberg` 服务路径及 Catalog、namespace、table 和 warehouse 标识。
- **新 Application 找不到目标表**：确认导入已提交，并使用同一 `PISTA_NAMESPACE`、Catalog `lake` 和表名 `events` 读回。

### Hive 与 SQL 文件

- **SQL 文件找不到**：确认 `--files` 指向可读文件，且 `spark.pista.sqlFile_` 使用相同的普通文件名。
- **Hive 源表不可读或行集不一致**：检查 Hive support／SerDe 依赖、Metastore URI、database/table 和字段映射；确认源数据稳定，driver/executors 能访问源文件。
