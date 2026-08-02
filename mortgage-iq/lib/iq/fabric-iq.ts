/** Fabric IQ - borrower credit/income/valuation from Fabric OneLake (or local JSON). */

import borrowers from "../../data/borrowers.json";
import { queryOne } from "../azure/fabric";
import { isFabricConfigured, FABRIC_BORROWER_TABLE } from "../constants";
import type { BorrowerProfile, IqToolResult } from "../types";

interface BorrowerRow {
  full_name: string;
  credit_score: number;
  annual_income: number;
  monthly_debt: number;
  loan_amount: number;
  property_value: number;
}

function toProfile(row: BorrowerRow): BorrowerProfile {
  const loan = Number(row.loan_amount) || 0;
  const value = Number(row.property_value) || 0;
  const income = Number(row.annual_income) || 0;
  const monthlyDebt = Number(row.monthly_debt) || 0;
  return {
    full_name: row.full_name,
    credit_score: Number(row.credit_score) || 0,
    annual_income: income,
    monthly_debt: monthlyDebt,
    loan_amount: loan,
    property_value: value,
    ltv: value ? Math.round((loan / value) * 10000) / 10000 : 0,
    dti: income ? Math.round((monthlyDebt / (income / 12)) * 10000) / 10000 : 0,
  };
}

export async function getFabricIq(
  borrower: string,
): Promise<IqToolResult<BorrowerProfile | { note: string }>> {
  if (isFabricConfigured()) {
    try {
      const row = await queryOne<BorrowerRow>(FABRIC_BORROWER_TABLE, "full_name", borrower);
      if (row) {
        return { data: toProfile(row), detail: "Queried credit, income and valuation from Fabric OneLake", live: true };
      }
      return { data: { note: `No borrower record found for '${borrower}'.` }, detail: `No Fabric record for '${borrower}'`, live: true };
    } catch (err) {
      console.warn("[fabric-iq] live query failed, using local fallback:", err instanceof Error ? err.message : err);
      // fall through to local synthetic data below
    }
  }
  const match = (borrowers as BorrowerRow[]).find(
    (b) => b.full_name.toLowerCase() === borrower.toLowerCase(),
  );
  if (!match) {
    return { data: { note: `No borrower record found for '${borrower}'.` }, detail: `No local record for '${borrower}'`, live: false };
  }
  return { data: toProfile(match), detail: "Local synthetic borrower profile", live: false };
}
