import { NextRequest, NextResponse } from 'next/server'
import { createWalletClient, http, keccak256, encodePacked, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

// ============================================================================
// Configuration
// ============================================================================

const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY as `0x${string}`
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY  // Free Kimi K2.5 via NVIDIA NIM

// AI provider priority: NVIDIA (free) > OpenRouter (cheap) > Anthropic (paid)
function getAIProvider(): 'nvidia' | 'openrouter' | 'anthropic' | 'none' {
  if (NVIDIA_API_KEY) return 'nvidia'
  if (OPENROUTER_API_KEY) return 'openrouter'
  if (ANTHROPIC_API_KEY) return 'anthropic'
  return 'none'
}
const AI_PROVIDER = getAIProvider()

// Rate limiting config
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10 // 10 requests per minute per IP

// ============================================================================
// Logging
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  data?: Record<string, unknown>
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  }
  
  const logLine = `[ORACLE] [${entry.timestamp}] [${level.toUpperCase()}] ${message}`
  
  if (level === 'error') {
    console.error(logLine, data ? JSON.stringify(data, null, 2) : '')
  } else if (level === 'warn') {
    console.warn(logLine, data ? JSON.stringify(data) : '')
  } else {
    console.log(logLine, data ? JSON.stringify(data) : '')
  }
}

// ============================================================================
// Rate Limiting (In-Memory)
// ============================================================================

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  if (realIP) {
    return realIP
  }
  return 'unknown'
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)
  
  // Clean up old entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (now - value.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.delete(key)
      }
    }
  }
  
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitStore.set(ip, { count: 1, windowStart: now })
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetIn: RATE_LIMIT_WINDOW_MS }
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const resetIn = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)
    return { allowed: false, remaining: 0, resetIn }
  }
  
  entry.count++
  return { 
    allowed: true, 
    remaining: RATE_LIMIT_MAX_REQUESTS - entry.count,
    resetIn: RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)
  }
}

// ============================================================================
// Content Moderation
// ============================================================================

interface ModerationResult {
  approved: boolean
  reason?: string
  moderationType: 'ai' | 'basic' | 'error'
  confidence?: number
}

// Basic word filter as fallback
const BANNED_PATTERNS = [
  /\b(nsfw|porn|xxx|nude|naked)\b/i,
  /\b(scam|rug\s*pull|honeypot)\b/i,
  /\b(hack|exploit|steal)\b/i,
  /\b(hate|racist|sexist)\b/i,
]

function basicModeration(data: string, rules: string): ModerationResult {
  const lowerData = data.toLowerCase()
  const lowerRules = rules.toLowerCase()
  
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(data)) {
      return { 
        approved: false, 
        reason: 'Content violates community guidelines',
        moderationType: 'basic'
      }
    }
  }
  
  if (lowerRules.includes('original') && lowerData.includes('repost')) {
    return { 
      approved: false, 
      reason: 'Reposts are not allowed per market rules',
      moderationType: 'basic'
    }
  }
  
  return { approved: true, moderationType: 'basic' }
}

const MODERATION_SYSTEM_PROMPT = `You are a content moderator for a blockchain-based competition platform. 
Your job is to evaluate submissions and determine if they should be approved.

You must be:
- Fair and consistent
- Not overly restrictive (err on the side of approval for borderline cases)
- Focused on safety: reject hate speech, scams, explicit content, and rule violations

Respond with a JSON object only:
{
  "approved": boolean,
  "reason": "string explaining decision (required if not approved)",
  "confidence": number between 0-1
}`

function getModerationPrompt(data: string, rules: string): string {
  return `Evaluate this submission for a competition market.

MARKET RULES:
${rules || 'No specific rules provided - use standard community guidelines'}

SUBMISSION CONTENT:
${data}

Should this submission be approved? Respond with JSON only.`
}

function parseAIResponse(content: string): { approved: boolean; reason?: string; confidence?: number } | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // Parse failed
  }
  return null
}

async function kimiModeration(data: string, rules: string): Promise<ModerationResult> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://arena.ember.engineer',
        'X-Title': 'The Arena Oracle',
      },
      body: JSON.stringify({
        model: 'moonshotai/kimi-k2.5',
        max_tokens: 256,
        messages: [
          { role: 'system', content: MODERATION_SYSTEM_PROMPT },
          { role: 'user', content: getModerationPrompt(data, rules) },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      log('error', 'Kimi API error', { status: response.status, error: errorText })
      return basicModeration(data, rules)
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content
    
    if (!content) {
      log('warn', 'Empty response from Kimi moderation')
      return basicModeration(data, rules)
    }

    const parsed = parseAIResponse(content)
    if (!parsed) {
      log('warn', 'Failed to parse Kimi response', { content })
      return basicModeration(data, rules)
    }

    log('debug', 'Kimi moderation result', { 
      approved: parsed.approved, 
      confidence: parsed.confidence,
      dataPreview: data.substring(0, 100)
    })

    return {
      approved: parsed.approved,
      reason: parsed.reason,
      moderationType: 'ai',
      confidence: parsed.confidence,
    }
    
  } catch (error) {
    log('error', 'Kimi moderation failed', { 
      error: error instanceof Error ? error.message : String(error) 
    })
    return basicModeration(data, rules)
  }
}

async function anthropicModeration(data: string, rules: string): Promise<ModerationResult> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 256,
        system: MODERATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: getModerationPrompt(data, rules) }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      log('error', 'Anthropic API error', { status: response.status, error: errorText })
      return basicModeration(data, rules)
    }

    const result = await response.json()
    const content = result.content?.[0]?.text
    
    if (!content) {
      log('warn', 'Empty response from Anthropic moderation')
      return basicModeration(data, rules)
    }

    const parsed = parseAIResponse(content)
    if (!parsed) {
      log('warn', 'Failed to parse Anthropic response', { content })
      return basicModeration(data, rules)
    }

    log('debug', 'Anthropic moderation result', { 
      approved: parsed.approved, 
      confidence: parsed.confidence,
      dataPreview: data.substring(0, 100)
    })

    return {
      approved: parsed.approved,
      reason: parsed.reason,
      moderationType: 'ai',
      confidence: parsed.confidence,
    }
    
  } catch (error) {
    log('error', 'Anthropic moderation failed', { 
      error: error instanceof Error ? error.message : String(error) 
    })
    return basicModeration(data, rules)
  }
}

async function nvidiaModeration(data: string, rules: string): Promise<ModerationResult> {
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'moonshotai/kimi-k2.5',
        max_tokens: 256,
        messages: [
          { role: 'system', content: MODERATION_SYSTEM_PROMPT },
          { role: 'user', content: getModerationPrompt(data, rules) },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      log('error', 'NVIDIA API error', { status: response.status, error: errorText })
      return basicModeration(data, rules)
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content
    
    if (!content) {
      log('warn', 'Empty response from NVIDIA moderation')
      return basicModeration(data, rules)
    }

    const parsed = parseAIResponse(content)
    if (!parsed) {
      log('warn', 'Failed to parse NVIDIA response', { content })
      return basicModeration(data, rules)
    }

    log('debug', 'NVIDIA Kimi moderation result', { 
      approved: parsed.approved, 
      confidence: parsed.confidence,
      dataPreview: data.substring(0, 100)
    })

    return {
      approved: parsed.approved,
      reason: parsed.reason,
      moderationType: 'ai',
      confidence: parsed.confidence,
    }
    
  } catch (error) {
    log('error', 'NVIDIA moderation failed', { 
      error: error instanceof Error ? error.message : String(error) 
    })
    return basicModeration(data, rules)
  }
}

async function aiModeration(data: string, rules: string): Promise<ModerationResult> {
  // Priority: NVIDIA (free) > OpenRouter (cheap) > Anthropic (paid)
  if (NVIDIA_API_KEY) {
    log('debug', 'Using Kimi K2.5 via NVIDIA (free)')
    return nvidiaModeration(data, rules)
  }
  
  if (OPENROUTER_API_KEY) {
    log('debug', 'Using Kimi K2.5 via OpenRouter')
    return kimiModeration(data, rules)
  }
  
  if (ANTHROPIC_API_KEY) {
    log('debug', 'Using Anthropic Haiku')
    return anthropicModeration(data, rules)
  }
  
  log('warn', 'No AI API key configured, falling back to basic moderation')
  return basicModeration(data, rules)
}

// ============================================================================
// Custom Error Classes
// ============================================================================

class OracleError extends Error {
  statusCode: number
  code: string
  
  constructor(message: string, statusCode: number, code: string) {
    super(message)
    this.name = 'OracleError'
    this.statusCode = statusCode
    this.code = code
  }
}

class ValidationError extends OracleError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

class RateLimitError extends OracleError {
  resetIn: number
  
  constructor(resetIn: number) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED')
    this.name = 'RateLimitError'
    this.resetIn = resetIn
  }
}

class ConfigurationError extends OracleError {
  constructor(message: string) {
    super(message, 500, 'CONFIGURATION_ERROR')
    this.name = 'ConfigurationError'
  }
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().substring(0, 8)
  const clientIP = getClientIP(request)
  const startTime = Date.now()
  
  log('info', 'Incoming request', { requestId, clientIP })
  
  try {
    // Rate limiting
    const rateLimit = checkRateLimit(clientIP)
    if (!rateLimit.allowed) {
      log('warn', 'Rate limit exceeded', { requestId, clientIP, resetIn: rateLimit.resetIn })
      throw new RateLimitError(rateLimit.resetIn)
    }
    
    // Parse and validate request body
    let body: { marketId?: unknown; data?: unknown; rules?: unknown }
    try {
      body = await request.json()
    } catch {
      throw new ValidationError('Invalid JSON body')
    }
    
    const { marketId, data, rules } = body
    
    // Validate required fields
    if (marketId === undefined || marketId === null) {
      throw new ValidationError('Missing required field: marketId')
    }
    if (!data || typeof data !== 'string') {
      throw new ValidationError('Missing or invalid required field: data (must be a string)')
    }
    if (typeof marketId !== 'number' && typeof marketId !== 'string') {
      throw new ValidationError('Invalid marketId: must be a number or numeric string')
    }
    
    const marketIdNum = BigInt(marketId)
    const rulesStr = typeof rules === 'string' ? rules : ''
    
    log('debug', 'Processing submission', { 
      requestId, 
      marketId: marketIdNum.toString(),
      dataLength: data.length,
      hasRules: rulesStr.length > 0
    })

    // Check oracle configuration
    if (!ORACLE_PRIVATE_KEY) {
      throw new ConfigurationError('Oracle private key not configured')
    }
    
    // Content moderation (AI with basic fallback)
    const moderation = await aiModeration(data, rulesStr)
    
    log('info', 'Moderation complete', {
      requestId,
      approved: moderation.approved,
      moderationType: moderation.moderationType,
      confidence: moderation.confidence,
    })
    
    // Create wallet and sign
    const account = privateKeyToAccount(ORACLE_PRIVATE_KEY)
    
    // Create the message hash that the contract expects
    // keccak256(abi.encodePacked(marketId, data, approved))
    const messageHash = keccak256(
      encodePacked(
        ['uint256', 'string', 'bool'],
        [marketIdNum, data, moderation.approved]
      )
    )
    
    // Sign the message (EIP-191 personal sign)
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    })
    
    const signature = await walletClient.signMessage({
      message: { raw: toBytes(messageHash) },
    })
    
    const duration = Date.now() - startTime
    log('info', 'Request complete', { 
      requestId, 
      duration: `${duration}ms`,
      approved: moderation.approved 
    })
    
    return NextResponse.json({
      approved: moderation.approved,
      filtered: !moderation.approved,
      reason: moderation.reason,
      signature,
      oracle: account.address,
      moderationType: moderation.moderationType,
      confidence: moderation.confidence,
      requestId,
    }, {
      headers: {
        'X-RateLimit-Remaining': String(rateLimit.remaining),
        'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetIn / 1000)),
        'X-Request-ID': requestId,
      }
    })
    
  } catch (error) {
    const duration = Date.now() - startTime
    
    if (error instanceof OracleError) {
      log('warn', `${error.name}: ${error.message}`, { 
        requestId, 
        code: error.code,
        duration: `${duration}ms`
      })
      
      const headers: Record<string, string> = { 'X-Request-ID': requestId }
      
      if (error instanceof RateLimitError) {
        headers['Retry-After'] = String(Math.ceil(error.resetIn / 1000))
      }
      
      return NextResponse.json(
        { 
          error: error.message, 
          code: error.code,
          requestId,
        },
        { status: error.statusCode, headers }
      )
    }
    
    // Unexpected error
    log('error', 'Unexpected error', { 
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`
    })
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        requestId,
      },
      { 
        status: 500,
        headers: { 'X-Request-ID': requestId }
      }
    )
  }
}

// Health check endpoint
export async function GET() {
  const hasOracle = !!ORACLE_PRIVATE_KEY
  
  let aiStatus: string
  if (NVIDIA_API_KEY) {
    aiStatus = 'kimi-k2.5 (via NVIDIA NIM - FREE)'
  } else if (OPENROUTER_API_KEY) {
    aiStatus = 'kimi-k2.5 (via OpenRouter)'
  } else if (ANTHROPIC_API_KEY) {
    aiStatus = 'claude-haiku (via Anthropic)'
  } else {
    aiStatus = 'disabled (using basic filter)'
  }
  
  return NextResponse.json({
    status: 'ok',
    oracle: hasOracle ? 'configured' : 'missing',
    aiModeration: aiStatus,
    aiProvider: AI_PROVIDER,
    rateLimit: `${RATE_LIMIT_MAX_REQUESTS} requests per ${RATE_LIMIT_WINDOW_MS / 1000}s`,
  })
}
