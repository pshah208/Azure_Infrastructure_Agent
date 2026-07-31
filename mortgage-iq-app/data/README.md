# Synthetic data - Fabric IQ layer

This folder holds the synthetic mortgage dataset that powers the **Fabric IQ**
layer when the app runs against real Microsoft Fabric (OneLake) data instead of
the built-in mock profile.

## Files

| File | Purpose |
|---|---|
| `borrowers.csv` | 5 synthetic borrower profiles |
| `load_borrowers_fabric.py` | PySpark notebook that loads the CSV into a Lakehouse Delta table `borrowers` (exposed by the SQL analytics endpoint as `dbo.borrowers`) |

## Dataset schema

Matches exactly what the `fabric_iq` connector queries
(`SELECT ... FROM dbo.borrowers WHERE full_name = ?`):

| column | type | notes |
|---|---|---|
| `full_name` | string | matched against the chat request |
| `credit_score` | int | |
| `annual_income` | long | |
| `monthly_debt` | long | |
| `loan_amount` | long | LTV = loan_amount / property_value |
| `property_value` | long | DTI = monthly_debt / (annual_income / 12) |

## Profiles (chosen to demo different underwriting outcomes)

| Borrower | FICO | LTV | Expected outcome |
|---|---|---|---|
| Jordan Rivera | 742 | 80% | Approve (conditional) |
| David Okafor | 780 | 67% | Strong approve |
| Elena Petrova | 760 | 95% | Approve + PMI (LTV > 80%) |
| Priya Nair | 705 | 80% | Refer - DTI too high |
| Marcus Chen | 640 | 75% | Refer - credit < 680 |

## Load steps (Fabric portal)

1. Create a **workspace** and assign the **F4** capacity to it.
2. Create a **Lakehouse**.
3. Upload `borrowers.csv` to the Lakehouse **Files** area (`Files/borrowers.csv`).
4. Create a **Notebook** attached to the Lakehouse, paste
   `load_borrowers_fabric.py`, and **Run all**.
5. Grant the app's managed identity **`id-mortgageiq-dev`** Viewer/Member on the
   workspace so it can query via Entra auth.
6. Copy the **SQL analytics endpoint**
   (`<workspace>.datawarehouse.fabric.microsoft.com`).
7. Set `AI_MODE=foundry`, `FABRIC_SQL_ENDPOINT`, `FABRIC_DATABASE` (and
   `FOUNDRY_PROJECT_ENDPOINT`) on the orchestrator container app and restart.

See the repository `README.md` ("Add the dataset to Fabric later") for the full
runbook and fallback behaviour.
