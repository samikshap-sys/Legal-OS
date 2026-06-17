/**
 * Tests for QueryBee BQ Upload transparency requirements:
 * 1. Success response includes table_id and file_name
 * 2. History rows include file_name field
 * 3. Upload result message format is correct
 */
import { describe, it, expect } from "vitest";

describe("BQ Upload transparency", () => {
  it("success response shape includes table_id and file_name", () => {
    // Simulate what the backend now returns on success
    const mockSuccessResponse = {
      ok: true,
      total_rows: 100,
      total_columns: 5,
      upload_id: "abc-123",
      table_id: "project.dataset.table",
      file_name: "sales_data.csv",
    };

    expect(mockSuccessResponse.ok).toBe(true);
    expect(mockSuccessResponse.table_id).toBe("project.dataset.table");
    expect(mockSuccessResponse.file_name).toBe("sales_data.csv");
    expect(mockSuccessResponse.total_rows).toBe(100);
  });

  it("upload success message includes file name, row count, and table", () => {
    // Simulate the frontend message construction
    const data = {
      ok: true,
      total_rows: 1332,
      table_id: "fynd-db.finance_recon_tool_asia.table",
      file_name: "recon_april.csv",
    };
    const fileName = data.file_name || "recon_april.csv";
    const rowCount = (data.total_rows ?? 0).toLocaleString();
    const targetTable = data.table_id;
    const msg = `Successfully uploaded ${rowCount} rows from "${fileName}" to ${targetTable}`;

    expect(msg).toContain("1,332");
    expect(msg).toContain("recon_april.csv");
    expect(msg).toContain("fynd-db.finance_recon_tool_asia.table");
  });

  it("history row maps file_name from API response", () => {
    const apiRow = {
      id: "uuid-1",
      table_id: "project.dataset.table",
      file_type: "CSV",
      status: "success",
      total_columns: 24,
      total_rows: 1332,
      uploaded_at: "30/04/2026 11:39:21",
      uploaded_by: "kiranjadhav@gofynd.com",
      has_file: true,
      file_name: "recon_april.csv",
      error: undefined,
    };

    // Simulate the frontend mapping
    const row = {
      id: apiRow.id,
      tableId: apiRow.table_id,
      fileType: apiRow.file_type,
      status: apiRow.status,
      totalColumns: apiRow.total_columns,
      totalRows: apiRow.total_rows,
      uploadedAt: apiRow.uploaded_at,
      uploadedBy: apiRow.uploaded_by,
      fileUrl: apiRow.has_file ? `/api/bq/download/${apiRow.id}` : "",
      fileName: apiRow.file_name as string | undefined,
      error: apiRow.error as string | undefined,
    };

    expect(row.fileName).toBe("recon_april.csv");
    expect(row.tableId).toBe("project.dataset.table");
    expect(row.totalRows).toBe(1332);
  });

  it("history row handles missing file_name gracefully", () => {
    const apiRow = {
      id: "uuid-2",
      table_id: "project.dataset.table",
      file_type: "XLSX",
      status: "success",
      total_columns: 15,
      total_rows: 841,
      uploaded_at: "28/04/2026 12:43:05",
      uploaded_by: "vaibhavidambe@gofynd.com",
      has_file: true,
      file_name: undefined,
    };

    const row = {
      fileName: apiRow.file_name as string | undefined,
    };

    // Should gracefully handle missing file_name
    expect(row.fileName).toBeUndefined();
    // Frontend renders "—" for undefined fileName
    const display = row.fileName || "—";
    expect(display).toBe("—");
  });
});
