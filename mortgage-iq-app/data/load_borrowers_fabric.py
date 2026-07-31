# Fabric notebook: load the synthetic borrower dataset into a Lakehouse table.
#
# HOW TO USE (in the Fabric portal):
#   1. Create a Lakehouse in your workspace (assigned to the F4 capacity).
#   2. Upload data/borrowers.csv to the Lakehouse "Files" area
#      (Files/borrowers.csv), OR adjust CSV_PATH below.
#   3. Create a new Notebook, attach it to that Lakehouse, paste this code, Run All.
#
# Result: a managed Delta table "borrowers" that the SQL analytics endpoint
# exposes as dbo.borrowers - exactly what the Fabric IQ connector queries
# (SELECT ... FROM dbo.borrowers WHERE full_name = ?).

from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, LongType,
)

CSV_PATH = "Files/borrowers.csv"
TABLE_NAME = "borrowers"

schema = StructType([
    StructField("full_name", StringType(), False),
    StructField("credit_score", IntegerType(), False),
    StructField("annual_income", LongType(), False),
    StructField("monthly_debt", LongType(), False),
    StructField("loan_amount", LongType(), False),
    StructField("property_value", LongType(), False),
])

df = (
    spark.read
    .option("header", "true")
    .schema(schema)
    .csv(CSV_PATH)
)

df.write.mode("overwrite").format("delta").saveAsTable(TABLE_NAME)

print(f"Loaded {df.count()} borrowers into table '{TABLE_NAME}'.")
df.show(truncate=False)
