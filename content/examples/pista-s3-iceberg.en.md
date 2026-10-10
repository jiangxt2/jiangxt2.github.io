---
title: "Pista: Migrate Hive Tables to Iceberg on S3 with Gravitino REST Catalog"
date: 2026-10-09
draft: false
summary: "Use Pista to migrate a Hive source table into an Iceberg table on S3 managed through Gravitino REST Catalog, then read it back for verification."
description: "A Pista batch example using Spark Hive support, existing S3-compatible storage and Gravitino Iceberg REST Catalog, with complete SQL, dependencies and transfer verification."
toc: true
tocTitle: "On this page"
translationKey: "example-pista-s3-iceberg"
type: "Example"
topics:
  - Spark
  - Pista
  - Hive
  - S3
  - Iceberg
  - Gravitino
level: "Intermediate"
tags:
  - spark-sql
  - pista
  - hive
  - s3
  - iceberg
  - gravitino
---

## Before we start

Pista 2.5.0 is available from the [GitHub Release](https://github.com/jiangxt2/Pista/releases/tag/v2.5.0). This example reads an existing Hive table, writes selected columns to an Iceberg table on S3 managed by Gravitino REST Catalog, then reads it back from a new Spark Application.

Spark's Hive catalog reads the source, and Pista runs the SQL files in order. Gravitino Iceberg REST Catalog manages the target; Iceberg uses S3FileIO to write its data and metadata.

## Prepare the runtime

Use **Bash** with Spark in `local[2]` client mode. Run all commands from one working directory; save example files under `pista-examples/`.

| Component | Guide baseline |
| --- | --- |
| Java | JDK 17 |
| Spark / Scala | Spark 3.5.8 / Scala 2.12.18 |
| Hadoop | 3.3.4; check the actual version in your Spark distribution |
| Hive catalog | Spark 3.5.8 Hive support; an existing Hive Metastore Thrift URI is required |
| Iceberg client | 1.10.1 |
| Gravitino REST service | 1.3.0 |
| Pista | 2.5.0; GitHub Release tag `v2.5.0` |

> **Test environment:** JDK 17.0.16; the Gravitino REST 1.3.0 JDBC Catalog used server-side Iceberg 1.11.0 and PostgreSQL 16.14; MinIO was `RELEASE.2025-06-13T11-33-47Z`. Runtime images and dependency JARs came from cache. Read, import and new-application readback passed with a four-row Hive fixture. The bidirectional `EXCEPT ALL` assertion, target schema, `days(event_date)` partition and single snapshot all matched expectations. The fixture used an embedded Derby Metastore; an external Hive Thrift Metastore was not tested.

Set the existing Hive Metastore URI, database and table. Adapt the four-column projection and target schema to your source. Keep its files accessible and unchanged during the transfer.

`PISTA_HIVE_METASTORE_URI` identifies only the Thrift endpoint. Use the existing Hive/Hadoop settings for Kerberos or other authentication.

If the Hive source uses `s3a://`, configure a matching S3A connector, `spark.hadoop.fs.s3a.*` settings and source credentials. This is separate from S3FileIO for the target Iceberg table.

Point the Gravitino warehouse to existing S3 storage and allow table creation and commits. The Gravitino service must be able to access it. Spark's Hive catalog reads the source; Iceberg Catalog manages the target. Do not read an Iceberg table directory as Parquet.

Connect to the existing Gravitino REST service and set its URI and authentication for your deployment. [Gravitino Iceberg REST configuration](https://gravitino.apache.org/docs/1.3.0/iceberg-rest-service/). The server-side warehouse points to the S3 location for table data. With multiple Catalogs, append `--conf spark.sql.catalog.lake.warehouse=<catalog-name>` after the SQL filename when calling `submit.sh`; omit it for the single default Catalog. This client-side `warehouse` value is a Catalog name, not an S3 path. Snapshot queries need readable metadata; this example uses a JDBC backend.

Configure separate S3 credentials for Gravitino. Put the S3FileIO AWS bundle and JDBC driver JAR on the REST service classpath. Client-side `AWS_*` variables do not configure the service.

### Prepare the Pista assembly

Use `pista-2.5.0.jar` from the [Pista 2.5.0 GitHub Release](https://github.com/jiangxt2/Pista/releases/tag/v2.5.0). Replace the JDK 17 and Spark 3.5.8 paths, then download the asset:

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

The asset is the complete Spark-submit runtime; a module JAR is insufficient.

To build from source, use the release tag, Maven 3.8.8 or later, and JDK 17. Clone on the first build; confirm an existing directory uses `v2.5.0`:

~~~bash
mvn -version
git clone --branch v2.5.0 --depth 1 https://github.com/jiangxt2/Pista.git pista-examples/Pista-source
mvn -B -f pista-examples/Pista-source/pom.xml package -DskipTests
export PISTA_JAR="$PWD/pista-examples/Pista-source/pista-assembly/target/pista-2.5.0.jar"
~~~

The tag's POM declares 2.5.0, so no `revision` override is needed. `-DskipTests` only builds the JAR; it does not run tests.

### Add dependencies on the Spark side

The Pista JAR does not include the Iceberg runtime or the AWS SDK for S3FileIO. The script adds them with `--packages`:

- `org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.10.1`: the Iceberg runtime for Spark 3.5 and Scala 2.12.
- `org.apache.iceberg:iceberg-aws-bundle:1.10.1`: the AWS SDK v2 dependencies for S3FileIO.

If the Hive source uses `s3a://`, add `hadoop-aws` matching Hadoop and its compatible AWS SDK v1, then configure source-side S3A. [Hadoop S3A dependency requirements](https://hadoop.apache.org/docs/r3.3.4/hadoop-aws/tools/hadoop-aws/index.html).

For offline execution, set `PISTA_EXTRA_JARS` to the complete Iceberg runtime and AWS SDK v2 JARs, separated by commas. The set must include S3, STS, HTTP clients and transitive dependencies. The test environment used AWS SDK v2 2.33.0.

To use the verified offline mode, place the complete dependency set in `pista-examples/deps/`, then run from the common working directory:

~~~bash
export PISTA_EXTRA_JARS="$(find -L "$PWD/pista-examples/deps" -type f -name '*.jar' | sort | paste -sd, -)"
test -n "$PISTA_EXTRA_JARS"
~~~

Do not include only `s3-2.33.0.jar`. Online `--packages` resolution requires an accessible artifact repository; this example does not verify that download.

## Configure storage and the Catalog

Set the S3 endpoint, region and path-style mode, REST URI, and existing Hive Metastore URI, database and table. The Catalog warehouse points to the target store; use your deployment's REST path.

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

### Use Pista's environment configuration

If you manage environment variables in Pista's config file, use this loader instead of manually exporting the S3 endpoint and REST URI above. Keep the Hive table settings, namespace and AWS credentials from the previous block. For a first setup, copy [`pista-env.sh.template`](https://github.com/jiangxt2/Pista/blob/v2.5.0/shell/pista-env.sh.template) to `pista-env.sh` under `${PISTA_CONF_DIR:-${PISTA_HOME}/shell}`. This sanitized excerpt contains only the settings used by this example. Map `PISTA_S3_ENDPOINT` only when target S3FileIO and S3A use the same endpoint:

~~~bash
# Relevant settings in pista-env.sh
export PISTA_ICEBERG_REST_URI="https://gravitino.example.com/iceberg"
export PISTA_S3A_ENDPOINT="https://minio.example.com"

# Variable names consumed by this guide's submit.sh
export PISTA_REST_URI="${PISTA_ICEBERG_REST_URI}"
export PISTA_S3_ENDPOINT="${PISTA_S3A_ENDPOINT}"
export PISTA_S3_REGION="us-east-1"
export PISTA_S3_PATH_STYLE="true"
~~~

Set `PISTA_HOME` before sourcing [`load-pista-env.sh`](https://github.com/jiangxt2/Pista/blob/v2.5.0/shell/load-pista-env.sh) in each shell:

~~~bash
export PISTA_HOME="/path/to/pista"
export PISTA_CONF_DIR="$HOME/.config/pista" # Optional; defaults to ${PISTA_HOME}/shell
source "${PISTA_HOME}/shell/load-pista-env.sh"
~~~

The loader prefers `pista-env.local.sh`, then falls back to `pista-env.sh`; it does not merge the files, so the selected file must contain every variable needed by the submission. The template's `PISTA_S3A_ACCESS_KEY` and `PISTA_S3A_SECRET_KEY` do not configure target S3FileIO credentials; provide those separately through the `AWS_*` environment variables described above. The loader only loads and exports variables. This guide's `submit.sh` sets the Iceberg Catalog Spark options that Pista's `run_select.sh` does not include.

Enter credentials interactively; the secret key and session token prompts are hidden, and an empty token clears any inherited value. Cluster deployments need separate network and credential settings for drivers, executors and the Catalog service.

### Iceberg's S3 access path

| Purpose | Configuration | URI |
| --- | --- | --- |
| Iceberg metadata and data files | `spark.sql.catalog.lake.*` and S3FileIO | The table location returned by the Catalog, usually `s3://...` |

Iceberg uses S3FileIO to write to the table location returned by the Catalog. [Iceberg S3FileIO documentation](https://iceberg.apache.org/docs/1.10.1/aws/).

The script reads AWS credentials from the environment. If Gravitino uses credential vending, configure Spark-side credentials as required by the service.

### REST authentication and controlled configuration

REST access is assumed to be configured. For token or OAuth, set `PISTA_SPARK_PROPERTIES` to a `0600` file outside version control. A token environment variable alone does not configure Iceberg REST; do not put credentials in `--conf`, SQL or logs.

## Save the submission script

Save this script as `pista-examples/submit.sh` and run it with `bash`. It stops on error and prints query results to the console.

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

`--files` distributes the SQL file; `spark.pista.sqlFile_` passes its filename. Pista reads it from the driver or SparkFiles. [Pista SQL file documentation](https://github.com/jiangxt2/Pista/blob/v2.5.0/docs/reference/sql-template.md).

Use the URL scheme provided by the object store. The example uses HTTPS; if a controlled S3-compatible store only provides HTTP, set its endpoint to `http://...`. The script does not set a separate TLS option.

## Read the existing Hive source

`PISTA_HIVE_DATABASE`.`PISTA_HIVE_TABLE` must already exist. Save this SQL as `pista-examples/read-hive.sql` to inspect its rows and aggregates:

~~~sql
SELECT id, event_date, amount, customer
FROM spark_catalog.${hive_database}.${hive_table} ORDER BY id;

SELECT COUNT(*) AS row_count, SUM(id) AS id_sum, SUM(amount) AS amount_sum
FROM spark_catalog.${hive_database}.${hive_table};
~~~

~~~bash
bash pista-examples/submit.sh read-hive.sql
~~~

Example output for a four-row source table. Your existing Hive table will return its own rows and aggregates.

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

`${hive_database}` and `${hive_table}` are Pista FreeMarker structural parameters validated as lowercase identifiers by the script.

## Import the Hive table into Iceberg

Save as `pista-examples/load-iceberg.sql`:

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

Example Pista output when the assertion passes:

~~~text
+--------+
|verified|
+--------+
|NULL    |
+--------+
~~~

Spark `assert_true` returns `NULL` when the condition is true and throws when it is false. [Function reference](https://spark.apache.org/docs/3.5.8/api/sql/index.html#assert_true).

The Catalog is `lake`; the script validates the namespace. `lake.<namespace>.events` is partitioned by `days(event_date)`, and the Catalog manages its location. Adapt the projection and target schema to the Hive source.

`CREATE TABLE` and `INSERT INTO` are native SQL commands; they bypass Pista's SELECT Processor and file-output path. [Pista Catalog documentation](https://github.com/jiangxt2/Pista/blob/v2.5.0/docs/modules/catalog.md).

Table creation omits `IF NOT EXISTS`, so rerunning in the same namespace fails. Statements are not atomic; a later failure does not roll back earlier writes. After an error, inspect the table and snapshots before retrying.

## Read back the transferred Iceberg table

Save as `pista-examples/read-iceberg.sql`. A new Application reads the target and compares it with the Hive source:

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

The readback matched the Hive source. The key Pista console output shows all four rows and the successful bidirectional assertion (`verified` is `NULL`):

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

The snapshot query returned one `append` snapshot.

## Troubleshooting

### Dependencies and classpath

- **Missing S3AFileSystem:** Check this only for a Hive source on `s3a://`; load `hadoop-aws` matching Hadoop and AWS SDK v1.
- **Missing SparkCatalog/S3FileIO or NoSuchMethodError:** Check that the Iceberg runtime and AWS bundle match Spark/Scala, and remove duplicate JARs.

### Storage and Catalog

- **S3 403, signature or region errors:** Separate source S3A, Spark S3FileIO and Gravitino server access; check endpoint, region, path-style, credentials, session token and object-store permissions.
- **REST 401, 403 or 404:** Check authentication for 401, permissions for 403, and the `/iceberg` service path plus Catalog, namespace, table and warehouse names for 404.
- **Target table missing in a new Application:** Confirm the import committed and read back with the same `PISTA_NAMESPACE`, Catalog `lake` and table `events`.

### Hive and SQL files

- **SQL file not found:** Ensure `--files` points to a readable file and `spark.pista.sqlFile_` uses the same plain filename.
- **Hive source unreadable or rows differ:** Check Hive support/SerDe dependencies, Metastore URI, database/table and column mapping. Keep the source stable and make sure drivers and executors can read its files.
