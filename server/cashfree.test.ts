/**
 * cashfree.test.ts
 * Tests for the Cashfree Entry backend route and Python processor.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

const PROCESSOR = path.join(__dirname, "cashfree_processor.py");

describe("cashfree_processor.py", () => {
  it("should exist and be executable", () => {
    expect(fs.existsSync(PROCESSOR)).toBe(true);
  });

  it("should emit error JSON for missing file", () => {
    const result = execSync(
      `python3 ${PROCESSOR} /nonexistent/file.xlsx /tmp/out.xlsx`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const lines = result.trim().split("\n").filter(Boolean);
    const firstLine = JSON.parse(lines[0]);
    // First line is step 0 (Reading file)
    expect(firstLine.step).toBe(0);
    // Second line should be an error
    const secondLine = JSON.parse(lines[1]);
    expect(secondLine.error).toBeDefined();
  });

  it("should produce a valid output xlsx from a synthetic input", () => {
    // Create a minimal synthetic raw file using Python
    const tmpIn  = path.join(os.tmpdir(), `cf_test_in_${Date.now()}.xlsx`);
    const tmpOut = path.join(os.tmpdir(), `cf_test_out_${Date.now()}.xlsx`);

    // Create synthetic input
    execSync(`python3 - << 'PYEOF'
import openpyxl
wb = openpyxl.Workbook()
ws = wb.active
ws.title = 'transfer report'
tr_cols = ['Added On','Amount','Transfer Id','Reference Id','Status','Service Charge','Service Tax','Bank Account','IFSC','Name','Email','Phone','Mode','Remarks','Sub Type','Source Id','Entity','Acknowledgement Id','Reason','Merchant Transfer Id','Transfer Type','UPI Transaction Id','Batch Transfer Id']
ws.append(tr_cols)
ws.append(['2025-01-06','500','TID001','REF001','SUCCESS','5','0.9','HDFC','HDFC0001','Alice','a@b.com','9999999999','IMPS','','','','','','','','','',''])
ws.append(['2025-01-06','100','TID002','REF002','FAILED','0','0','ICICI','ICIC0001','Bob','b@c.com','8888888888','IMPS','','','','','','','','','',''])
ws2 = wb.create_sheet('account statement')
ac_cols = ['Added On','Debit/Credit','Particulars','Charged Amount (INR)','Amount (INR)','Service Charge (INR)','Service Tax (INR)','Closing Balance (INR)','Event Id','Remarks']
ws2.append(ac_cols)
ws2.append(['2025-01-06','Debit','PAYOUT_TRANSFER','505.9','500','5','0.9','9000','REF001',''])
wb.save('${tmpIn}')
PYEOF`);

    // Run processor
    const result = execSync(
      `python3 ${PROCESSOR} ${tmpIn} ${tmpOut}`,
      { encoding: "utf-8" }
    );

    const lines = result.trim().split("\n").filter(Boolean);
    const lastLine = JSON.parse(lines[lines.length - 1]);

    expect(lastLine.done).toBe(true);
    expect(lastLine.step).toBe(10);
    expect(fs.existsSync(tmpOut)).toBe(true);

    // Verify output has 4 sheets
    const sheetCheck = execSync(
      `python3 -c "import openpyxl; wb = openpyxl.load_workbook('${tmpOut}'); print(','.join(wb.sheetnames))"`,
      { encoding: "utf-8" }
    ).trim();
    expect(sheetCheck).toContain("transfer report");
    expect(sheetCheck).toContain("account statement");
    expect(sheetCheck).toContain("Summary");
    expect(sheetCheck).toContain("tally entry");

    // Cleanup
    try { fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut); } catch {}
  });

  it("should strip n-suffixes from Transfer IDs", () => {
    const tmpIn  = path.join(os.tmpdir(), `cf_suffix_in_${Date.now()}.xlsx`);
    const tmpOut = path.join(os.tmpdir(), `cf_suffix_out_${Date.now()}.xlsx`);

    execSync(`python3 - << 'PYEOF'
import openpyxl
wb = openpyxl.Workbook()
ws = wb.active
ws.title = 'transfer report'
tr_cols = ['Added On','Amount','Transfer Id','Reference Id','Status','Service Charge','Service Tax','Bank Account','IFSC','Name','Email','Phone','Mode','Remarks','Sub Type','Source Id','Entity','Acknowledgement Id','Reason','Merchant Transfer Id','Transfer Type','UPI Transaction Id','Batch Transfer Id']
ws.append(tr_cols)
ws.append(['2025-01-06','300','TID003n1','REF003','SUCCESS','3','0.54','HDFC','HDFC0001','Charlie','c@d.com','7777777777','IMPS','','','','','','','','','',''])
ws.append(['2025-01-06','200','TID003n2','REF004','SUCCESS','2','0.36','SBI','SBIN0001','Dave','d@e.com','6666666666','IMPS','','','','','','','','','',''])
ws2 = wb.create_sheet('account statement')
ac_cols = ['Added On','Debit/Credit','Particulars','Charged Amount (INR)','Amount (INR)','Service Charge (INR)','Service Tax (INR)','Closing Balance (INR)','Event Id','Remarks']
ws2.append(ac_cols)
ws2.append(['2025-01-06','Debit','PAYOUT_TRANSFER','303.54','300','3','0.54','9000','REF003',''])
ws2.append(['2025-01-06','Debit','PAYOUT_TRANSFER','202.36','200','2','0.36','8696','REF004',''])
wb.save('${tmpIn}')
PYEOF`);

    const result = execSync(
      `python3 ${PROCESSOR} ${tmpIn} ${tmpOut}`,
      { encoding: "utf-8" }
    );

    const lines = result.trim().split("\n").filter(Boolean);
    const step2 = lines.map(l => JSON.parse(l)).find(l => l.step === 2 && l.suffix_fixed !== undefined);
    expect(step2).toBeDefined();
    expect(step2.suffix_fixed).toBe(2);

    try { fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut); } catch {}
  });
});
