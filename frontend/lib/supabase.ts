import { createClient } from '@supabase/supabase-js'

// Types for our database
export interface EntryRecord {
  id: string
  market_id: number
  author_address: string
  content_hash: string
  text: string
  image_url: string | null
  image_path: string | null
  created_at: string
  onchain_entry_id: number | null
  onchain_tx_hash: string | null
  oracle_approved: boolean | null
  oracle_signature: string | null
  failed_at: string | null
  failure_reason: string | null
}

// Client-side Supabase client (uses anon key, respects RLS)
export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseAnonKey)
}

// Server-side Supabase client (uses service role, bypasses RLS)
export function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase service role environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Helper to compute content hash
export async function computeContentHash(text: string, imageUrl?: string): Promise<string> {
  const content = JSON.stringify({ text, imageUrl: imageUrl || null })
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Check if entry data is an arena:// reference
export function isArenaReference(data: string): boolean {
  return data.startsWith('arena://')
}

// Parse arena:// reference to get UUID
export function parseArenaReference(data: string): string | null {
  if (!isArenaReference(data)) return null
  return data.replace('arena://', '')
}

// Format entry UUID as arena:// reference
export function formatArenaReference(uuid: string): string {
  return `arena://${uuid}`
}
