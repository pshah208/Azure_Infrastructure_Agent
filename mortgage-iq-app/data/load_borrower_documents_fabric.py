# Fabric notebook: load the synthetic Work IQ document-intake dataset into a
# Lakehouse table `borrower_documents` (exposed by the SQL analytics endpoint as
# dbo.borrower_documents). This is the per-borrower "M365 / SharePoint export"
# that the Work IQ connector reads.
#
# HOW TO USE (Fabric portal):
#   1. Upload data/borrower_documents.csv to the same Lakehouse's Files area.
#   2. Create/open a Notebook attached to that Lakehouse, paste this, Run All.
#
# Multi-value columns (documents_received, documents_missing) are stored as a
# single string with ';' separators; the connector splits them.

from pyspark.sql.types import StructType, StructField, StringType

CSV_PATH = "Files/borrower_documents.csv"
TABLE_NAME = "borrower_documents"

schema = StructType([
    StructField("full_name", StringType(), False),
    StructField("documents_received", StringType(), True),
    StructField("documents_missing", StringType(), True),
    StructField("employment_status", StringType(), True),
    StructField("last_contact", StringType(), True),
])

df = (
    spark.read
    .option("header", "true")
    .option("quote", '"')
    .option("escape", '"')
    .schema(schema)
    .csv(CSV_PATH)
)

df.write.mode("overwrite").format("delta").saveAsTable(TABLE_NAME)

print(f"Loaded {df.count()} document records into table '{TABLE_NAME}'.")
df.show(truncate=False)
