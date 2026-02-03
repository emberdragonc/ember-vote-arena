# SPEC: Supabase Storage Integration for The Arena

**Status:** Draft  
**Author:** Ember 🐉  
**Date:** 2026-02-03  
**Repo:** `ember-vote-arena`

---

## 0) Implementation Contract (Rules + Definitions)

### Non-Negotiable Rules
1. **Contract > prose**: All payload shapes, DB schemas, file paths, and invariants are contracts. No guessing. No drift.
2. **Small diffs**: Prefer minimal, surgical changes over refactors. Only refactor if required to satisfy the contract.
3. **Request paths must be "cold"**: By default, request handlers make 0 upstream calls except to Supabase (considered internal infrastructure).
4. **Correctness > freshness**: No cache wipes on partial/empty responses. Idempotent writes. No timestamp pollution.
5. **Worker write model**: N/A (no workers in initial scope).
6. **Ship in phases/PRs**: Each PR is independently safe, testable, and does not mix phases.

### Definitions
- **Entry**: A user submission to a market (text + optional image)
- **Content Hash**: SHA-256 hash of entry data stored on-chain as unique identifier
- **Entry Reference**: The on-chain stored string (format: `arena://{entryUUID}`)
- **Supabase**: PostgreSQL + blob storage backend (free tier: 500MB storage, 50K MAU)

---

## 1) Current State

### Architecture (Before)
```
┌─────────────┐    ┌─────────────┐    ┌──────────────────┐
│   Browser   │───▶│ Oracle API  │───▶│  Smart Contract  │
│  (Submit)   │    │ (moderate)  │    │  (store entry)   │
└─────────────┘    └─────────────┘    └──────────────────┘
                                              │
                         Entry.data = base64 JSON blob (image + text)
                                              │
                                      EXPENSIVE ON-CHAIN STORAGE
```

### Current Request Path (Submit Entry)
1. User fills form: text + optional image
2. Image converted to base64 via `FileReader.readAsDataURL()`
3. `entryData = JSON.stringify({ text, image: base64String })` (~100KB-5MB)
4. POST to `/api/oracle/approve` with full `entryData`
5. Oracle signs approval
6. `submitEntry(marketId, entryData, approved, signature)` stores FULL DATA on-chain

### Current Request Path (View Entries)
1. Read `entries[marketId][entryId]` from contract
2. Parse `entry.data` as JSON
3. Render base64 image inline

### Known Bottlenecks
- **Gas cost**: Storing 100KB+ on-chain costs ~$10-50 per entry
- **Gas limits**: Large images may exceed block gas limits
- **RPC load**: Reading large strings from contract is slow
- **No indexing**: Cannot query entries efficiently

### Files Involved (Current)
| File | Purpose |
|------|---------|
| `src/EmberVoteArena.sol` | Contract with `Entry.data` string storage |
| `frontend/app/market/[id]/submit/page.tsx` | Submit form, base64 encoding |
| `frontend/app/market/[id]/page.tsx` | Market view, entry rendering |
| `frontend/app/api/oracle/approve/route.ts` | Oracle moderation endpoint |

---

## 2) Target State

### Architecture (After)
```
┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│   Browser   │───▶│ Upload API  │───▶│    Supabase     │
│  (Submit)   │    │ (presigned) │    │  Storage + DB   │
└─────────────┘    └─────────────┘    └─────────────────┘
       │                                      │
       │                              entry_uuid returned
       │                                      │
       ▼                                      ▼
┌─────────────┐    ┌─────────────┐    ┌──────────────────┐
│   Browser   │───▶│ Oracle API  │───▶│  Smart Contract  │
│  (Submit)   │    │ (moderate)  │    │ Entry.data =     │
└─────────────┘    └─────────────┘    │ "arena://{uuid}" │
                                      └──────────────────┘
                                              │
                                      TINY ON-CHAIN REFERENCE (~50 bytes)
```

### Target Request Path (Submit Entry)
1. User fills form: text + optional image
2. **NEW**: POST image to `/api/storage/upload` → get `image_url`
3. **NEW**: POST entry to `/api/entries/create` → get `entry_uuid`, stores in Supabase
4. POST to `/api/oracle/approve` with `entry_uuid` (oracle fetches from Supabase)
5. Oracle signs approval
6. `submitEntry(marketId, "arena://{entry_uuid}", approved, signature)` stores REFERENCE only

### Target Request Path (View Entries)
1. Read `entries[marketId][entryId]` from contract → get `"arena://{uuid}"`
2. **NEW**: Fetch from `/api/entries/{uuid}` (cache-friendly) OR client-side Supabase query
3. Render image from Supabase CDN URL

### State Machine
| State | Supabase | On-Chain | UI Behavior |
|-------|----------|----------|-------------|
| **Draft** | Row exists, `onchain_tx = null` | Nothing | "Pending submission..." |
| **Submitted** | `onchain_tx = hash` | Entry exists | Show entry |
| **Failed** | `failed_at != null` | Nothing | "Submission failed" |

---

## 3) Migration Plan (Phased PR Sequence)

### PR0: Supabase Setup + DB Schema (Infrastructure)
**Does**: Creates Supabase project, tables, storage bucket, RLS policies  
**Does NOT**: Change any frontend or contract code  
**Success Criteria**: `SELECT * FROM entries` works; bucket accepts uploads  
**Rollback**: Delete Supabase project (no production impact)

### PR1: Upload API + Storage Integration
**Does**: Add `/api/storage/upload` endpoint for presigned uploads  
**Does NOT**: Change submit flow yet  
**Success Criteria**: Can upload image, get public URL back  
**Rollback**: Remove endpoint (feature flag: `ENABLE_SUPABASE_UPLOAD=false`)

### PR2: Entry Creation API + Database Writes
**Does**: Add `/api/entries/create` and `/api/entries/[uuid]` endpoints  
**Does NOT**: Change on-chain submission format yet  
**Success Criteria**: Can create entry in DB, fetch by UUID  
**Rollback**: Remove endpoints (feature flag: `ENABLE_SUPABASE_ENTRIES=false`)

### PR3: Oracle Integration (Read from Supabase)
**Does**: Oracle fetches entry content from Supabase by UUID for moderation  
**Does NOT**: Change frontend submit flow  
**Success Criteria**: Oracle can moderate entry by UUID  
**Rollback**: Flag `ORACLE_USE_SUPABASE=false` falls back to inline data

### PR4: Frontend Submit Flow Migration
**Does**: Update submit page to use new flow (upload → create → oracle → chain)  
**Does NOT**: Change market view yet (still reads from chain)  
**Success Criteria**: New entries use `arena://` format; gas cost < $0.50  
**Rollback**: Flag `USE_NEW_SUBMIT_FLOW=false` uses old base64 flow

### PR5: Frontend View Migration
**Does**: Update market page to resolve `arena://` references from Supabase  
**Does NOT**: Break old entries (hybrid display)  
**Success Criteria**: Both old (base64) and new (arena://) entries render  
**Rollback**: N/A (backward compatible)

### PR6: Framework Documentation
**Does**: Add pattern to `smart-contract-framework` Phase 0 planning  
**Does NOT**: Change Arena code  
**Success Criteria**: PLANNING.md includes off-chain storage checklist

---

## 4) Data Contracts

### 4.1 Entry Reference Format (On-Chain)
```
Format: "arena://{entry_uuid}"
Example: "arena://550e8400-e29b-41d4-a716-446655440000"
Length: 43 characters (fixed)

Legacy Format: JSON blob or plain text (detected by absence of "arena://" prefix)
```

### 4.2 Supabase Entry Record
```typescript
interface EntryRecord {
  // Identity (immutable after creation)
  id: string;                    // UUID v4, primary key
  market_id: number;             // References on-chain market
  author_address: string;        // 0x... checksummed
  content_hash: string;          // SHA-256 of (text + image_url)
  
  // Content (immutable after creation)
  text: string;                  // Entry text/caption
  image_url: string | null;      // Supabase storage URL or null
  image_path: string | null;     // Storage path: "entries/{uuid}/{filename}"
  
  // Timestamps (immutable)
  created_at: string;            // ISO 8601
  
  // On-chain state (mutable)
  onchain_entry_id: number | null;  // Entry ID in contract (set after tx confirms)
  onchain_tx_hash: string | null;   // Transaction hash
  oracle_approved: boolean | null;  // Oracle decision
  oracle_signature: string | null;  // 0x... signature
  
  // Failure tracking
  failed_at: string | null;      // ISO 8601 if submission failed
  failure_reason: string | null;
}
```

### 4.3 Upload Response
```typescript
interface UploadResponse {
  success: true;
  image_url: string;     // Public CDN URL
  image_path: string;    // Storage path for reference
}
```

### 4.4 Entry Create Request/Response
```typescript
// Request
interface CreateEntryRequest {
  market_id: number;
  author_address: string;   // Must match connected wallet
  text: string;
  image_url?: string;       // From upload response
  image_path?: string;
}

// Response
interface CreateEntryResponse {
  success: true;
  entry_uuid: string;
  content_hash: string;
}
```

### 4.5 Oracle Moderation (Updated)
```typescript
// Request (updated)
interface OracleRequest {
  marketId: string;
  entryUuid: string;        // NEW: instead of inline data
  // OR for backward compat:
  data?: string;            // Legacy: inline data
}

// Response (unchanged)
interface OracleResponse {
  approved: boolean;
  filtered: boolean;
  reason?: string;
  signature: string;
  oracle: string;
  moderationType: 'ai' | 'basic';
  confidence?: number;
}
```

### 4.6 Invariants
1. `entry.id` is immutable after row creation
2. `entry.content_hash` is immutable after row creation
3. `entry.created_at` is immutable
4. `entry.onchain_tx_hash` can only transition from `null` to a value (never back)
5. On-chain `Entry.data` with `arena://` prefix MUST have corresponding Supabase row
6. Image files are never deleted (even if entry fails)

---

## 5) Database Migrations (SQL)

### PR0: Initial Schema
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Entries table
CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id BIGINT NOT NULL,
  author_address TEXT NOT NULL CHECK (author_address ~ '^0x[a-fA-F0-9]{40}$'),
  content_hash TEXT NOT NULL CHECK (char_length(content_hash) = 64),
  
  text TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  image_path TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  onchain_entry_id BIGINT,
  onchain_tx_hash TEXT CHECK (onchain_tx_hash IS NULL OR onchain_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
  oracle_approved BOOLEAN,
  oracle_signature TEXT,
  
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  
  UNIQUE(market_id, content_hash)  -- Prevent duplicate entries
);

-- Indexes
CREATE INDEX idx_entries_market_id ON entries(market_id);
CREATE INDEX idx_entries_author ON entries(author_address);
CREATE INDEX idx_entries_created ON entries(created_at DESC);

-- RLS Policies
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- Anyone can read entries
CREATE POLICY "Entries are publicly readable"
  ON entries FOR SELECT
  USING (true);

-- Only service role can insert/update (API routes use service role)
CREATE POLICY "Service role can insert entries"
  ON entries FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update entries"
  ON entries FOR UPDATE
  USING (true);
```

### Storage Bucket Setup (via Supabase Dashboard or CLI)
```bash
# Create bucket
supabase storage create entries --public

# Bucket policy: public read, authenticated upload
# (Set via Dashboard > Storage > Policies)
```

---

## 6) Worker Changes

N/A for initial implementation. Future consideration:
- Background job to sync on-chain events to Supabase
- Cleanup job for orphaned uploads

---

## 7) Backend Changes

### 7.1 New Files to Create

| File | Purpose |
|------|---------|
| `frontend/app/api/storage/upload/route.ts` | Presigned upload endpoint |
| `frontend/app/api/entries/create/route.ts` | Create entry in Supabase |
| `frontend/app/api/entries/[uuid]/route.ts` | Fetch entry by UUID |
| `frontend/lib/supabase.ts` | Supabase client initialization |
| `frontend/.env.local` | Supabase credentials |

### 7.2 `/api/storage/upload/route.ts`
```typescript
// POST: Upload image to Supabase storage
// Input: FormData with 'file' field
// Output: { success: true, image_url, image_path }
// Auth: Requires connected wallet signature (future) or rate limit
// Upstream calls: Supabase Storage (1)
```

### 7.3 `/api/entries/create/route.ts`
```typescript
// POST: Create entry record
// Input: CreateEntryRequest
// Output: CreateEntryResponse
// Auth: None (spam prevented by on-chain entry cost)
// Upstream calls: Supabase DB (1)
// Idempotency: Uses content_hash unique constraint
```

### 7.4 `/api/entries/[uuid]/route.ts`
```typescript
// GET: Fetch entry by UUID
// Output: EntryRecord
// Cache: Cache-Control: public, max-age=31536000 (immutable entries)
// Upstream calls: Supabase DB (1, cacheable)
```

### 7.5 Oracle Modification (`/api/oracle/approve/route.ts`)
```typescript
// CHANGE: Add entryUuid support
// If request.entryUuid provided:
//   1. Fetch entry from Supabase
//   2. Reconstruct data for moderation
//   3. Proceed with existing moderation logic
// Else: Use legacy inline data path
```

---

## 8) Flags & Config

| Flag | Default | Enforcement Point | Purpose |
|------|---------|-------------------|---------|
| `ENABLE_SUPABASE_UPLOAD` | `false` | `/api/storage/upload` | Gate upload endpoint |
| `ENABLE_SUPABASE_ENTRIES` | `false` | `/api/entries/*` | Gate entry endpoints |
| `ORACLE_USE_SUPABASE` | `false` | `/api/oracle/approve` | Oracle fetches from Supabase |
| `USE_NEW_SUBMIT_FLOW` | `false` | Submit page | Use new upload flow |

### Environment Variables (Required)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only
```

---

## 9) Verification & Observability

### PR0: Supabase Setup
- [ ] `SELECT COUNT(*) FROM entries` returns 0
- [ ] Can upload test file to `entries` bucket
- [ ] RLS prevents anon insert: `INSERT INTO entries(...) VALUES(...)` fails

### PR1: Upload API
- [ ] `curl -X POST /api/storage/upload -F file=@test.jpg` returns URL
- [ ] URL is publicly accessible
- [ ] Log: `[STORAGE] Upload success: {path, size, contentType}`

### PR2: Entry Creation
- [ ] `POST /api/entries/create` returns UUID
- [ ] `GET /api/entries/{uuid}` returns entry
- [ ] Duplicate content_hash returns existing entry (idempotent)
- [ ] Log: `[ENTRIES] Created: {uuid, market_id, content_hash}`

### PR3: Oracle Integration
- [ ] Oracle with `entryUuid` returns same result as inline data
- [ ] Log: `[ORACLE] Fetched entry from Supabase: {uuid}`
- [ ] Latency: <500ms for Supabase fetch

### PR4: Submit Flow
- [ ] New entry submission costs <$0.50 gas
- [ ] On-chain `Entry.data` matches `arena://{uuid}` format
- [ ] Log: `[SUBMIT] Entry stored: {uuid, txHash, gas}`

### PR5: View Migration
- [ ] Old entries (base64) still render
- [ ] New entries (arena://) render from Supabase
- [ ] Log: `[VIEW] Resolved entry: {uuid, source: 'supabase'|'legacy'}`

---

## 10) Concrete Patch List

### PR0: Supabase Setup
```
NEW  frontend/lib/supabase.ts
     - Export createClient with anon key (client-side)
     - Export createServiceClient with service role (server-side)

NEW  frontend/.env.local.example
     - NEXT_PUBLIC_SUPABASE_URL
     - NEXT_PUBLIC_SUPABASE_ANON_KEY
     - SUPABASE_SERVICE_ROLE_KEY

NEW  supabase/migrations/001_entries.sql
     - Full schema from Section 5
```

### PR1: Upload API
```
NEW  frontend/app/api/storage/upload/route.ts
     - POST handler
     - File validation (5MB, image types)
     - Upload to Supabase storage
     - Return public URL

EDIT frontend/lib/supabase.ts
     - Add storage helper functions
```

### PR2: Entry Creation
```
NEW  frontend/app/api/entries/create/route.ts
     - POST handler
     - Validate input
     - Compute content_hash
     - Insert to Supabase
     - Return UUID

NEW  frontend/app/api/entries/[uuid]/route.ts
     - GET handler
     - Fetch from Supabase
     - Cache headers

NEW  frontend/lib/entries.ts
     - Type definitions
     - Helper functions
```

### PR3: Oracle Integration
```
EDIT frontend/app/api/oracle/approve/route.ts
     Lines 150-160: Add entryUuid handling
     + async function fetchEntryFromSupabase(uuid: string): Promise<EntryRecord>
     + if (body.entryUuid && process.env.ORACLE_USE_SUPABASE === 'true') {
     +   const entry = await fetchEntryFromSupabase(body.entryUuid)
     +   data = JSON.stringify({ text: entry.text, image: entry.image_url })
     + }
```

### PR4: Submit Flow Migration
```
EDIT frontend/app/market/[id]/submit/page.tsx
     Lines 145-190: Replace handleSubmit
     - Remove base64 encoding
     + Import uploadImage, createEntry from lib
     + Step 1: Upload image if present
     + Step 2: Create entry in Supabase
     + Step 3: Call oracle with entryUuid
     + Step 4: Submit to chain with arena:// reference

NEW  frontend/lib/submit.ts
     - uploadImage(file: File): Promise<UploadResponse>
     - createEntry(req: CreateEntryRequest): Promise<CreateEntryResponse>
```

### PR5: View Migration
```
EDIT frontend/app/market/[id]/page.tsx
     Lines 60-80: Add entry resolution
     + function isArenaReference(data: string): boolean
     + async function resolveEntry(data: string): Promise<ResolvedEntry>
     + useEffect for fetching Supabase entries when arena:// detected

NEW  frontend/lib/resolve.ts
     - parseArenaReference(data: string): string | null
     - fetchEntry(uuid: string): Promise<EntryRecord>
```

### PR6: Framework Documentation
```
EDIT /home/clawdbot/projects/smart-contract-framework/PLANNING.md
     Add section: "## Off-Chain Storage Checklist"
     - [ ] Define what data goes on-chain vs off-chain
     - [ ] Choose storage backend (Supabase/IPFS/Arweave)
     - [ ] Design reference format (e.g., arena://)
     - [ ] Plan migration for existing data
     - [ ] Add feature flags for gradual rollout
```

---

## 11) Rollout/Rollback Notes

### Safe Rollout Sequence
1. Deploy Supabase (PR0) - no user impact
2. Deploy APIs behind flags (PR1-2) - no user impact
3. Enable `ORACLE_USE_SUPABASE` (PR3) - transparent to users
4. Enable `USE_NEW_SUBMIT_FLOW` for 10% of users (PR4)
5. Monitor gas savings, errors
6. Ramp to 100%
7. Deploy view migration (PR5) - backward compatible

### Rollback Procedures
| PR | Rollback Action | Safe Failure Behavior |
|----|-----------------|----------------------|
| PR1 | Set `ENABLE_SUPABASE_UPLOAD=false` | 404 on upload endpoint |
| PR2 | Set `ENABLE_SUPABASE_ENTRIES=false` | 404 on entry endpoints |
| PR3 | Set `ORACLE_USE_SUPABASE=false` | Uses inline data |
| PR4 | Set `USE_NEW_SUBMIT_FLOW=false` | Uses old base64 flow |
| PR5 | N/A (backward compatible) | Legacy entries still work |

### Safe Failure Behavior
- If Supabase is down during submit: Show error, user can retry
- If Supabase is down during view: Show "Loading..." for new entries, old entries still visible
- If Oracle can't fetch from Supabase: Fall back to inline data mode

---

## 12) Scorecard

| # | Category | Item | Status | Justification |
|---|----------|------|--------|---------------|
| 1 | Contract & Scope | Non-negotiable contract rules present | ✅ PASS | Section 0 defines 6 rules |
| 2 | Contract & Scope | Explicit "forbidden by default" upstream-call rule | ✅ PASS | Rule 3 in Section 0: "cold" request paths |
| 3 | Contract & Scope | Feature flags listed with defaults OFF | ✅ PASS | Section 8: all flags default `false` |
| 4 | Contract & Scope | Clear minimal-diff philosophy | ✅ PASS | Rule 2 in Section 0: "prefer minimal, surgical changes" |
| 5 | Migration Narrative | Current state described | ✅ PASS | Section 1: full architecture diagram + request paths |
| 6 | Migration Narrative | Target state described | ✅ PASS | Section 2: full architecture diagram + request paths |
| 7 | Migration Narrative | Migration narrative explains each stage | ✅ PASS | Section 3: 6 PRs with clear does/does not |
| 8 | Migration Narrative | State machine defined | ✅ PASS | Section 2: Draft/Submitted/Failed states |
| 9 | Data Contracts | Canonical JSON payload shapes | ✅ PASS | Section 4: 6 interface definitions |
| 10 | Data Contracts | DB schemas defined | ✅ PASS | Section 5: full SQL with types/indexes |
| 11 | Data Contracts | Identity keys + normalization | ✅ PASS | Section 4.6: UUID as primary key, content_hash unique |
| 12 | Data Contracts | Timestamp semantics defined | ✅ PASS | Section 4.6: created_at immutable |
| 13 | Phasing & PR Design | PR sequence provided | ✅ PASS | Section 3: PR0-PR6 ordered |
| 14 | Phasing & PR Design | Each PR includes success criteria | ✅ PASS | Section 3 + Section 9 verification |
| 15 | Phasing & PR Design | Each PR includes rollback strategy | ✅ PASS | Section 11: rollback table per PR |
| 16 | Repo & Patch | Concrete patch list | ✅ PASS | Section 10: file → exact changes |
| 17 | Repo & Patch | Repo reality checks included | ✅ PASS | Section 1: current files table |
| 18 | Repo & Patch | Known mismatch risks enumerated | ✅ PASS | Section 1: bottlenecks listed |
| 19 | Verification | Measurable verification | ✅ PASS | Section 9: grep-able logs, latency targets |
| 20 | Verification | Observability fields defined | ✅ PASS | Section 9: log formats per PR |

**Final Score: 20/20 ✅**

---

## Appendix: Supabase Project Setup Commands

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Create project (or use dashboard)
# Project name: ember-arena
# Region: us-east-1
# Database password: [generate secure]

# Get credentials from dashboard:
# Settings > API > Project URL
# Settings > API > anon public key
# Settings > API > service_role key (keep secret!)

# Link local project
cd frontend
supabase init
supabase link --project-ref <project-id>

# Run migrations
supabase db push
```
