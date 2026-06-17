css = """
/* -- Brand Ledger sub-navbar (Payable / future tabs) -- */
.bl-subnav {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid rgba(46,100,120,.12);
  margin-bottom: 18px;
  padding-bottom: 0;
}
.bl-subnav-item {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--qbd-gray-500);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-family: inherit;
  transition: color .15s, border-color .15s;
  letter-spacing: .01em;
}
.bl-subnav-item:hover { color: var(--qbd-brand); }
.bl-subnav-active {
  color: var(--qbd-brand) !important;
  border-bottom-color: var(--qbd-brand) !important;
}
"""

with open("client/src/index.css", "a") as f:
    f.write(css)
print("Subnav CSS appended successfully")
