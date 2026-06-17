css = """
/* ══ Brand Ledger sidebar + Claimable page (bl-*) ══ */
.qbd-nav-section-label {
  padding: 12px 10px 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: rgba(255,255,255,.38);
  white-space: nowrap;
  overflow: hidden;
  user-select: none;
}
.qbd-sidebar.qbd-collapsed .qbd-nav-section-label { display: none; }
.qbd-nav-divider { height: 1px; background: rgba(255,255,255,.12); margin: 6px 10px; }
.bl-page { padding: 28px 32px 52px; }
.bl-page-header { margin-bottom: 20px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.bl-page-title { font-size: 21px; font-weight: 800; color: var(--qbd-brand); letter-spacing: -.4px; margin-bottom: 4px; display: flex; align-items: center; gap: 10px; }
.bl-page-sub { font-size: 13px; color: var(--qbd-gray-500); line-height: 1.6; }
.bl-filter-card { background: #fff; border: 1px solid rgba(46,100,120,.15); border-radius: 12px; padding: 18px 22px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.04), 0 4px 16px rgba(46,100,120,.06); }
.bl-filter-row { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.bl-filter-group { display: flex; flex-direction: column; gap: 5px; }
.bl-filter-label { font-size: 11px; font-weight: 700; color: var(--qbd-brand); text-transform: uppercase; letter-spacing: .05em; }
.bl-filter-input { height: 36px; padding: 0 12px; border: 1.5px solid var(--qbd-gray-200); border-radius: 8px; font-size: 13px; color: var(--qbd-gray-800); font-family: inherit; background: #fff; transition: border-color .15s; outline: none; }
.bl-filter-input:focus { border-color: var(--qbd-brand); box-shadow: 0 0 0 3px rgba(46,100,120,.08); }
.bl-filter-input[type="date"] { width: 148px; }
.bl-filter-input.company-id { width: 160px; }
.bl-presets { display: flex; align-items: flex-end; gap: 6px; }
.bl-preset-btn { height: 36px; padding: 0 13px; border: 1.5px solid var(--qbd-gray-200); border-radius: 8px; background: #fff; font-size: 12.5px; font-weight: 500; color: var(--qbd-gray-600); cursor: pointer; font-family: inherit; transition: background .14s, border-color .14s, color .14s; white-space: nowrap; }
.bl-preset-btn:hover { background: var(--qbd-accent-light); border-color: rgba(46,100,120,.3); color: var(--qbd-brand); }
.bl-preset-btn.active { background: var(--qbd-brand); border-color: var(--qbd-brand); color: #fff; }
.bl-apply-btn { height: 36px; padding: 0 20px; background: var(--qbd-brand); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; display: flex; align-items: center; gap: 7px; transition: background .15s, opacity .15s; white-space: nowrap; }
.bl-apply-btn:hover { background: var(--qbd-accent); }
.bl-apply-btn:disabled { opacity: .55; cursor: not-allowed; }
.bl-results-card { background: #fff; border: 1px solid rgba(46,100,120,.15); border-radius: 12px; border-left: 3px solid var(--qbd-brand); overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.04), 0 4px 16px rgba(46,100,120,.06); }
.bl-results-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 2px solid rgba(46,100,120,.12); background: linear-gradient(90deg, rgba(221,240,245,.5) 0%, #fff 100%); flex-wrap: wrap; }
.bl-results-title { font-size: 14px; font-weight: 700; color: var(--qbd-brand); display: flex; align-items: center; gap: 8px; }
.bl-preview-note { font-size: 12px; color: var(--qbd-gray-400); font-style: italic; }
.bl-download-btn { height: 34px; padding: 0 16px; background: var(--qbd-brand); color: #fff; border: none; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; display: flex; align-items: center; gap: 7px; transition: background .15s, opacity .15s; white-space: nowrap; }
.bl-download-btn:hover { background: var(--qbd-accent); }
.bl-download-btn:disabled { opacity: .55; cursor: not-allowed; }
.bl-table-wrap { overflow-x: auto; }
.bl-table { width: 100%; border-collapse: collapse; }
.bl-table thead tr { background: linear-gradient(90deg, rgba(46,100,120,.07) 0%, rgba(61,122,140,.05) 100%); border-bottom: 2px solid rgba(46,100,120,.15); }
.bl-table th { padding: 11px 14px; font-size: 11.5px; font-weight: 700; color: var(--qbd-brand); text-align: left; white-space: nowrap; letter-spacing: .04em; text-transform: uppercase; }
.bl-table tbody tr { border-bottom: 1px solid rgba(46,100,120,.08); transition: background .12s; }
.bl-table tbody tr:last-child { border-bottom: none; }
.bl-table tbody tr:hover { background: rgba(221,240,245,.35); }
.bl-table td { padding: 11px 14px; font-size: 13px; color: var(--qbd-gray-700); vertical-align: middle; }
.bl-table td.mono { font-family: monospace; font-size: 12px; color: var(--qbd-gray-600); }
.bl-table-empty { padding: 60px 20px; text-align: center; color: var(--qbd-gray-400); font-size: 13.5px; }
.bl-table-empty svg { display: block; margin: 0 auto 14px; color: var(--qbd-gray-300); }
.bl-table-empty strong { display: block; font-size: 15px; font-weight: 700; color: var(--qbd-gray-600); margin-bottom: 6px; }
.bl-loading { padding: 60px 20px; text-align: center; color: var(--qbd-gray-500); font-size: 13px; }
.bl-spinner { width: 32px; height: 32px; border: 3px solid var(--qbd-gray-200); border-top-color: var(--qbd-brand); border-radius: 50%; animation: qbd-spin .7s linear infinite; margin: 0 auto 14px; }
.bl-error { padding: 24px 20px; background: #fff5f5; border-top: 1px solid #fed7d7; color: #c53030; font-size: 13px; display: flex; align-items: flex-start; gap: 10px; }
.bl-error svg { flex-shrink: 0; margin-top: 1px; }
.bl-amount { font-weight: 600; color: var(--qbd-brand); font-family: monospace; font-size: 12.5px; }
"""

with open('/home/ubuntu/fynd-finops/client/src/index.css', 'a') as f:
    f.write(css)
print('CSS appended successfully')
