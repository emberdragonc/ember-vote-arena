# 🚨 AUDIT GATE - MANDATORY PRE-DEPLOY CHECK

## This file MUST exist in every contract project before mainnet deploy

**Before ANY mainnet deployment, I MUST:**

1. Create `AUDIT_STATUS.md` in the project root
2. That file MUST contain proof of 3x self-audits
3. That file MUST be committed to git

---

## Required AUDIT_STATUS.md Format

```markdown
# Audit Status for [Contract Name]

## Self-Audit Pass 1 - [DATE]
- [ ] Ran AUDIT_CHECKLIST.md line by line
- [ ] Ran slither: `slither . --config-file slither.config.json`
- [ ] Ran invariant tests
- Findings: [list or "none"]
- Fixes applied: [list or "n/a"]

## Self-Audit Pass 2 - [DATE]  
- [ ] Focused on auth + access control
- [ ] Reviewed all external calls
- [ ] Checked all state changes
- Findings: [list or "none"]
- Fixes applied: [list or "n/a"]

## Self-Audit Pass 3 - [DATE]
- [ ] Full adversarial review ("how would I attack this?")
- [ ] Reviewed all findings from previous audits (AUDIT_CHECKLIST.md)
- [ ] Economic attack vectors considered
- Findings: [list or "none"]
- Fixes applied: [list or "n/a"]

## External Audit
- [ ] Requested from: [auditor names]
- [ ] Issue link: [GitHub issue URL]
- [ ] Status: [pending/pass/conditional pass]
- [ ] Findings addressed: [yes/no/n/a]

## Deploy Authorization
- [ ] All 3 self-audit passes complete
- [ ] External audit complete (or waived for <$10k TVL)
- [ ] Testnet deploy verified
- **Ready for mainnet: YES/NO**
```

---

## 🛑 HARD RULE

**If `AUDIT_STATUS.md` does not exist with all boxes checked:**
→ DO NOT DEPLOY TO MAINNET
→ No exceptions
→ No "I'll do it after"
→ No "it's a simple contract"

---

## Verification Command

Before deploying, run:
```bash
cat AUDIT_STATUS.md | grep -c "\[x\]"
# Must show at least 12 checked boxes
```
