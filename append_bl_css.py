css = """
/* -- Brand Ledger KPI card -- */
.bl-kpi-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.bl-kpi-card { background: #fff; border: 1px solid rgba(46,100,120,.15); border-radius: 12px; border-left: 4px solid var(--qbd-brand); padding: 18px 24px 16px; min-width: 220px; box-shadow: 0 1px 4px rgba(0,0,0,.04), 0 4px 16px rgba(46,100,120,.06); cursor: default; }
.bl-kpi-label { font-size: 11px; font-weight: 700; color: var(--qbd-brand); text-transform: uppercase; letter-spacing: .07em; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.bl-kpi-tooltip-icon { display: inline-flex; align-items: center; color: var(--qbd-gray-400); cursor: help; transition: color .15s; }
.bl-kpi-tooltip-icon:hover { color: var(--qbd-brand); }
.bl-kpi-value { font-size: 26px; font-weight: 800; color: var(--qbd-brand); letter-spacing: -.5px; line-height: 1.1; font-family: monospace; }
.bl-kpi-sub { font-size: 12px; color: var(--qbd-gray-500); margin-top: 5px; }
.bl-kpi-loading { font-size: 13px; color: var(--qbd-gray-400); font-style: italic; padding: 6px 0; }
.bl-kpi-empty { font-size: 12.5px; color: var(--qbd-gray-400); font-style: italic; padding: 4px 0; }

/* -- Brand Ledger pagination -- */
.bl-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 14px 20px; border-top: 1px solid rgba(46,100,120,.1); background: linear-gradient(90deg, rgba(221,240,245,.3) 0%, #fff 100%); }
.bl-page-btn { height: 32px; padding: 0 14px; background: #fff; border: 1.5px solid rgba(46,100,120,.2); border-radius: 8px; font-size: 12.5px; font-weight: 600; color: var(--qbd-brand); cursor: pointer; font-family: inherit; display: flex; align-items: center; gap: 5px; transition: background .14s, border-color .14s; }
.bl-page-btn:hover:not(:disabled) { background: var(--qbd-accent-light); border-color: var(--qbd-brand); }
.bl-page-btn:disabled { opacity: .4; cursor: not-allowed; }
.bl-page-info { font-size: 12.5px; font-weight: 600; color: var(--qbd-gray-600); }
"""

with open("client/src/index.css", "a") as f:
    f.write(css)
print("CSS appended successfully")
