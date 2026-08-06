import { getDb, newId, nowIso } from "@/lib/db";

export interface ResidualImportRecord {
  _id: string;
  userId: string | null;
  performerName: string;
  filename: string;
  totalChecks: number;
  totalGross: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResidualCheckRecord {
  _id: string;
  importId: string;
  seq: number;
  sagAftraId: string;
  payeeName: string;
  payeeType: string;
  company: string;
  payrollHouse: string;
  productionTitle: string;
  checkStatus: string;
  checkStatusDate: string;
  checkNumber: string;
  checkDate: string;
  grossAmount: number;
  netAmount: number;
  receivedDate: string;
  donated: string;
  prodTitleGrossAmt: number;
}

export type ResidualCheckInput = Omit<ResidualCheckRecord, "_id" | "importId" | "seq">;

export async function listResidualImports(
  userId: string
): Promise<
  Array<
    Pick<
      ResidualImportRecord,
      "_id" | "performerName" | "filename" | "totalChecks" | "totalGross" | "createdAt"
    >
  >
> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT _id, performerName, filename, totalChecks, totalGross, createdAt
       FROM residual_imports WHERE userId = ?1 ORDER BY createdAt DESC`
    )
    .bind(userId)
    .all<ResidualImportRecord>();
  return results;
}

// residual_checks has 18 columns; D1 allows at most 100 bound parameters per
// statement, so batch inserts go 5 rows (90 params) at a time.
const CHECK_COLUMNS = [
  "_id",
  "importId",
  "seq",
  "sagAftraId",
  "payeeName",
  "payeeType",
  "company",
  "payrollHouse",
  "productionTitle",
  "checkStatus",
  "checkStatusDate",
  "checkNumber",
  "checkDate",
  "grossAmount",
  "netAmount",
  "receivedDate",
  "donated",
  "prodTitleGrossAmt",
] as const;
const ROWS_PER_INSERT = 5;
const STATEMENTS_PER_BATCH = 100;

export async function createResidualImport(input: {
  userId: string;
  performerName: string;
  filename: string;
  totalGross: number;
  checks: ResidualCheckInput[];
}): Promise<string> {
  const db = await getDb();
  const importId = newId();
  const now = nowIso();

  await db
    .prepare(
      `INSERT INTO residual_imports
        (_id, userId, performerName, filename, totalChecks, totalGross, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
    )
    .bind(
      importId,
      input.userId,
      input.performerName,
      input.filename,
      input.checks.length,
      input.totalGross,
      now
    )
    .run();

  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < input.checks.length; i += ROWS_PER_INSERT) {
    const chunk = input.checks.slice(i, i + ROWS_PER_INSERT);
    const rowPlaceholders = chunk
      .map(
        (_, r) =>
          `(${CHECK_COLUMNS.map((_, c) => `?${r * CHECK_COLUMNS.length + c + 1}`).join(", ")})`
      )
      .join(", ");
    const params = chunk.flatMap((check, r) => [
      newId(),
      importId,
      i + r,
      check.sagAftraId,
      check.payeeName,
      check.payeeType,
      check.company,
      check.payrollHouse,
      check.productionTitle,
      check.checkStatus,
      check.checkStatusDate,
      check.checkNumber,
      check.checkDate,
      check.grossAmount,
      check.netAmount,
      check.receivedDate,
      check.donated,
      check.prodTitleGrossAmt,
    ]);
    statements.push(
      db
        .prepare(
          `INSERT INTO residual_checks (${CHECK_COLUMNS.join(", ")}) VALUES ${rowPlaceholders}`
        )
        .bind(...params)
    );
  }

  for (let i = 0; i < statements.length; i += STATEMENTS_PER_BATCH) {
    await db.batch(statements.slice(i, i + STATEMENTS_PER_BATCH));
  }

  return importId;
}

export async function findResidualImport(
  id: string,
  userId: string
): Promise<ResidualImportRecord | null> {
  const db = await getDb();
  return db
    .prepare("SELECT * FROM residual_imports WHERE _id = ?1 AND userId = ?2")
    .bind(id, userId)
    .first<ResidualImportRecord>();
}

export async function listChecksForImport(
  importId: string
): Promise<ResidualCheckRecord[]> {
  const db = await getDb();
  const { results } = await db
    .prepare("SELECT * FROM residual_checks WHERE importId = ?1 ORDER BY seq")
    .bind(importId)
    .all<ResidualCheckRecord>();
  return results;
}

export async function listChecksForProduction(
  importId: string,
  productionTitle: string
): Promise<ResidualCheckRecord[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT * FROM residual_checks WHERE importId = ?1 AND productionTitle = ?2 ORDER BY seq"
    )
    .bind(importId, productionTitle)
    .all<ResidualCheckRecord>();
  return results;
}

/** Delete an import (residual_checks rows cascade). */
export async function deleteResidualImport(
  id: string,
  userId: string
): Promise<boolean> {
  const db = await getDb();
  const res = await db
    .prepare("DELETE FROM residual_imports WHERE _id = ?1 AND userId = ?2")
    .bind(id, userId)
    .run();
  return res.meta.changes > 0;
}

/** Attach imports that have no owner (legacy imports) to the given user. */
export async function assignOrphanResidualImports(
  userId: string
): Promise<number> {
  const db = await getDb();
  const res = await db
    .prepare(
      "UPDATE residual_imports SET userId = ?1, updatedAt = ?2 WHERE userId IS NULL"
    )
    .bind(userId, nowIso())
    .run();
  return res.meta.changes;
}
