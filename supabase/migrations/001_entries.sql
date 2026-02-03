-- Migration: Create entries table for off-chain storage
-- Run this in Supabase SQL Editor or via CLI: supabase db push

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Entries table
CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id BIGINT NOT NULL,
  author_address TEXT NOT NULL CHECK (author_address ~ '^0x[a-fA-F0-9]{40}$'),
  content_hash TEXT NOT NULL CHECK (char_length(content_hash) = 64),
  
  -- Content (immutable after creation)
  text TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  image_path TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- On-chain state (updated after tx confirms)
  onchain_entry_id BIGINT,
  onchain_tx_hash TEXT CHECK (onchain_tx_hash IS NULL OR onchain_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
  oracle_approved BOOLEAN,
  oracle_signature TEXT,
  
  -- Failure tracking
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  
  -- Prevent duplicate entries per market
  UNIQUE(market_id, content_hash)
);

-- Indexes for common queries
CREATE INDEX idx_entries_market_id ON entries(market_id);
CREATE INDEX idx_entries_author ON entries(author_address);
CREATE INDEX idx_entries_created ON entries(created_at DESC);

-- Row Level Security
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- Anyone can read entries (public data)
CREATE POLICY "Entries are publicly readable"
  ON entries FOR SELECT
  USING (true);

-- Only service role can insert (API routes use service role)
CREATE POLICY "Service role can insert entries"
  ON entries FOR INSERT
  WITH CHECK (true);

-- Only service role can update (for onchain_tx_hash, etc.)
CREATE POLICY "Service role can update entries"
  ON entries FOR UPDATE
  USING (true);

-- Note: Create a storage bucket named 'entries' via Dashboard:
-- 1. Go to Storage in Supabase Dashboard
-- 2. Create new bucket: 'entries'
-- 3. Set to Public
-- 4. Add policy: Allow public read, authenticated upload
