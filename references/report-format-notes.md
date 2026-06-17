# PO Dashboard Report Format Notes

## Source PDF: Fynd_Expenses_Full_Report_FY26-27.pdf

### Overall Structure
- Header: "Fynd Finance and Strategy | Monthly Business Expenses Summary | FY 2026-27 | Internal" + "Prepared By Sejal / Finance & Strategy"
- Title: "Fynd | Finance & Strategy" / "Monthly Business Expenses Summary"
- Subtitle: FY 2026-27 | Reporting Period | As of [date]
- Footer: "Prepared for Founders & CXOs | Confidential | Page N"

### Page 1 — Executive Summary
- 4 KPI boxes: CY YTD, Latest Month, Previous Month, Regions count
- Table: "Expenses by Region and Cost Category" — rows = regions, cols = G&A, Sales&Mktg, Tools&Infra, Logistics, Travel, Apr Total, then same for May, May Total

### Page 2-3 — Domain by Expense IP
- Grouped table: Domain → Expense IP → APR 2026 (Rs. Cr) | MAY 2026 (Rs. Cr) | CY YTD (Rs. Cr) | % of Domain
- Grand Total row at bottom

### Page 4 — Region by Expense IP
- Grouped table: Region/IP → APR 2026 | MAY 2026 | CY YTD | % of Region
- Subtotals per region, Grand Total

### Page 5 — Cost Category Analysis
- Table: Cost Category → APR 2026 | % of Apr | MAY 2026 | % of May | CY YTD | % of YTD
- Key Observations & Flags section with bullet-style findings

### Page 6 — Fynd | Expenses Analytics (visual page)
- 4 KPI boxes (CY YTD, MAY 2026, APR 2026, REGIONS)
- Section 1: Spend by Region & Cost Category (bar chart + donut chart)
- Section 2: Regional Trend & Domain Comparison

### Page 7 — Charts + Key Findings
- Region Spend Trend chart (line)
- Domain Spend chart (bar)
- Key Findings: 6 cards with region/domain flags

### Pages 8-9 — Raw Data / PO Register
- Full PO Register table with all columns

## For the PO Dashboard Report Download
The report should be an XLSX download (not PDF) that mirrors the dashboard data:
1. Sheet 1: Executive Summary (KPIs + BU breakdown)
2. Sheet 2: PO Register (all filtered rows with all columns)
3. Sheet 3: Monthly Consumption (month-by-month INR values)
4. Sheet 4: BU Analysis (BU → PO Value, Consumed, Balance, %)
5. Sheet 5: Vendor Analysis (top vendors)

The download should use the currently filtered data (respecting all active slicers/filters).
