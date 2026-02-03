'use client'

import { useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatEther } from 'viem'
import Link from 'next/link'
import { CONTRACTS, ARENA_ABI, ERC20_ABI } from '../../../config/contracts'
import { baseSepolia } from 'wagmi/chains'

// Common tokens on Base
const TOKENS = [
  { symbol: 'EMBER', name: '$EMBER' },
  { symbol: 'USDC', name: 'USDC' },
  { symbol: 'ETH', name: 'ETH' },
  { symbol: 'USDT', name: 'USDT' },
]

function formatWithCommas(value: string): string {
  const parts = value.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

// Generate user-friendly guidelines from AI rules
function generateUserGuidelines(title: string, rules: string): string[] {
  const guidelines: string[] = []
  const lowerRules = rules.toLowerCase()
  const lowerTitle = title.toLowerCase()
  
  if (lowerTitle.includes('meme') || lowerTitle.includes('funny')) {
    guidelines.push('Share your best, most creative content')
  } else if (lowerTitle.includes('photo') || lowerTitle.includes('picture')) {
    guidelines.push('Upload a high-quality image that fits the theme')
  } else if (lowerTitle.includes('best') || lowerTitle.includes('contest')) {
    guidelines.push('Submit your best work for a chance to win')
  } else {
    guidelines.push('Make your entry stand out from the crowd')
  }
  
  if (lowerRules.includes('original')) {
    guidelines.push('Only original content allowed - no reposts')
  }
  if (lowerRules.includes('no nsfw') || lowerRules.includes('sfw')) {
    guidelines.push('Keep it family-friendly (no NSFW content)')
  }
  if (lowerRules.includes('on-topic') || lowerRules.includes('relevant')) {
    guidelines.push('Stay on topic with the market theme')
  }
  
  guidelines.push('Images work best at 1200x630px or similar')
  guidelines.push('Add a caption to explain your entry')
  
  return guidelines
}

export default function SubmitEntryPage() {
  const params = useParams()
  const marketId = BigInt(params.id as string)
  const chainId = useChainId()
  const { address, isConnected } = useAccount()
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS] || CONTRACTS[baseSepolia.id]

  const [entryText, setEntryText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedToken, setSelectedToken] = useState('EMBER')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch market data
  const { data: market } = useReadContract({
    address: contracts.arena,
    abi: ARENA_ABI,
    functionName: 'getMarket',
    args: [marketId],
  })

  // Check allowance
  const { data: allowance } = useReadContract({
    address: contracts.ember,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, contracts.arena] : undefined,
  })

  // Check balance
  const { data: balance } = useReadContract({
    address: contracts.ember,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  })

  const entryCost = market?.entryCost || BigInt(0)
  const needsApproval = !allowance || allowance < entryCost
  const isPayingWithEmber = selectedToken === 'EMBER'

  // Approve
  const { writeContract: approve, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  // Submit entry
  const { writeContract: submitEntry, data: submitHash, isPending: isSubmitting } = useWriteContract()
  const { isLoading: isSubmitConfirming, isSuccess: isSubmitSuccess } = useWaitForTransactionReceipt({
    hash: submitHash,
  })

  const handleApprove = () => {
    approve({
      address: contracts.ember,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contracts.arena, entryCost],
    })
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be under 5MB')
        return
      }
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const [submitStatus, setSubmitStatus] = useState<'idle' | 'pending-approval' | 'approved' | 'submitting' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [oracleSignature, setOracleSignature] = useState<`0x${string}` | null>(null)
  const [isApprovedByOracle, setIsApprovedByOracle] = useState(false)

  const handleSubmit = async () => {
    const entryData = imagePreview 
      ? JSON.stringify({ text: entryText, image: imagePreview })
      : entryText

    setSubmitStatus('pending-approval')
    setErrorMessage('')

    try {
      // Call oracle API to get signature
      const response = await fetch('/api/oracle/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId: marketId.toString(),
          data: entryData,
          rules: market?.rules || '',
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Oracle request failed')
      }

      if (result.filtered) {
        setSubmitStatus('error')
        setErrorMessage(result.reason || 'Entry was filtered by AI moderation')
        return
      }

      // Got approval! Now submit to contract
      setOracleSignature(result.signature)
      setIsApprovedByOracle(result.approved)
      setSubmitStatus('submitting')

      // Submit to blockchain
      submitEntry({
        address: contracts.arena,
        abi: ARENA_ABI,
        functionName: 'submitEntry',
        args: [marketId, entryData, result.approved, result.signature as `0x${string}`],
      })

    } catch (err: any) {
      setSubmitStatus('error')
      setErrorMessage(err.message || 'Failed to submit entry. Please try again.')
    }
  }

  if (!market) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </main>
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const isEntryPhase = now < Number(market.entryEnd)

  if (!isEntryPhase) {
    return (
      <main className="min-h-screen bg-gray-950">
        <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-white">The Arena</Link>
            <ConnectButton />
          </div>
        </nav>
        <div className="pt-32 px-6 text-center">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold text-white mb-4">Entry Phase Ended</h1>
          <p className="text-gray-400 mb-6">This market is no longer accepting entries.</p>
          <Link href={`/market/${marketId}`} className="text-blue-400 hover:text-blue-300">
            ← Back to Market
          </Link>
        </div>
      </main>
    )
  }

  if (isSubmitSuccess) {
    return (
      <main className="min-h-screen bg-gray-950">
        <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-white">The Arena</Link>
            <ConnectButton />
          </div>
        </nav>
        <div className="pt-32 px-6 text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-3xl font-bold text-white mb-4">Entry Submitted!</h1>
          <p className="text-gray-400 mb-6">Your entry is now in the competition. Good luck!</p>
          <Link 
            href={`/market/${marketId}`}
            className="inline-block px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium"
          >
            View Market →
          </Link>
        </div>
      </main>
    )
  }

  // Price calculations
  const emberPrice = 0.001 // Placeholder
  const entryCostEmber = Number(formatEther(entryCost))
  const entryCostUSD = entryCostEmber * emberPrice

  // Swap breakdown for non-EMBER tokens
  const getSwapBreakdown = () => {
    if (isPayingWithEmber) return null
    const rates: Record<string, number> = {
      'USDC': entryCostUSD,
      'ETH': entryCostUSD / 2500, // ~$2500/ETH placeholder
      'USDT': entryCostUSD,
    }
    return {
      pay: rates[selectedToken]?.toFixed(selectedToken === 'ETH' ? 6 : 2) || '0',
      receive: formatWithCommas(entryCostEmber.toFixed(0)),
      symbol: selectedToken,
    }
  }

  const swapBreakdown = getSwapBreakdown()
  const userGuidelines = generateUserGuidelines(market.title, market.rules)

  return (
    <main className="min-h-screen bg-gray-950">
      <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">The Arena</Link>
          <ConnectButton />
        </div>
      </nav>

      <div className="pt-28 pb-20 px-6">
        <div className="max-w-2xl mx-auto">
          <Link href={`/market/${marketId}`} className="text-gray-400 hover:text-white text-sm mb-4 inline-block">
            ← Back to {market.title}
          </Link>

          <h1 className="text-3xl font-bold text-white mb-2">Submit Entry</h1>
          <p className="text-gray-400 mb-8">{market.title}</p>

          {!isConnected ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
              <p className="text-gray-400 mb-4">Connect your wallet to submit an entry</p>
              <ConnectButton />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Entry Guidelines */}
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <span>📋</span> Entry Guidelines
                </h3>
                <ul className="space-y-2">
                  {userGuidelines.map((guideline, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-300 text-sm">
                      <span className="text-blue-400 mt-0.5">✓</span>
                      <span>{guideline}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Image Upload */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Upload Image (Optional)
                </label>
                
                {imagePreview ? (
                  <div className="relative">
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="w-full rounded-xl max-h-80 object-cover"
                    />
                    <button
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 p-2 bg-gray-900/80 hover:bg-gray-800 rounded-full transition-colors"
                    >
                      <span className="text-white">✕</span>
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-700 hover:border-blue-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors"
                  >
                    <div className="text-4xl mb-3">📷</div>
                    <p className="text-white font-medium mb-1">Click to upload image</p>
                    <p className="text-gray-500 text-sm">PNG, JPG, GIF up to 5MB</p>
                    <p className="text-gray-600 text-xs mt-2">Recommended: 1200×630px or 1:1 ratio</p>
                  </div>
                )}
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </div>

              {/* Entry Text/Caption */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {imagePreview ? 'Caption / Description' : 'Your Entry'}
                </label>
                <textarea
                  value={entryText}
                  onChange={(e) => setEntryText(e.target.value)}
                  placeholder={imagePreview ? 'Add a caption to your image...' : 'Enter your submission...'}
                  rows={4}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Payment Section */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Entry Cost</h3>
                
                {/* Token Selector */}
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">Pay with</label>
                  <div className="grid grid-cols-4 gap-2">
                    {TOKENS.map((token) => (
                      <button
                        key={token.symbol}
                        onClick={() => setSelectedToken(token.symbol)}
                        className={`py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                          selectedToken === token.symbol
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {token.symbol}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cost Display */}
                <div className="bg-gray-800/50 rounded-xl p-4 mb-4">
                  {isPayingWithEmber ? (
                    <div className="text-center py-2">
                      <div className="text-2xl font-bold text-white">
                        {formatWithCommas(entryCostEmber.toFixed(0))} $EMBER
                      </div>
                      <div className="text-gray-500 text-sm mt-1">≈ ${entryCostUSD.toFixed(2)} USD</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">You pay:</span>
                        <span className="text-white font-semibold">
                          {swapBreakdown?.pay} {swapBreakdown?.symbol}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Swaps to:</span>
                        <span className="text-gray-400">{swapBreakdown?.receive} $EMBER</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Added to pot:</span>
                        <span className="text-blue-400">{swapBreakdown?.receive} $EMBER</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Balance */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Your $EMBER Balance:</span>
                  <span className="text-white">{balance ? formatWithCommas(formatEther(balance)) : '0'}</span>
                </div>

                {/* Don't have EMBER note */}
                {isPayingWithEmber && (
                  <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-blue-400 text-sm">
                      💡 Don&apos;t have $EMBER? Select another token above to pay with any token on Base.
                    </p>
                  </div>
                )}
              </div>

              {/* Status Messages */}
              {submitStatus === 'pending-approval' && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-2">🤖</div>
                  <p className="text-blue-400 font-medium">AI is reviewing your entry...</p>
                  <p className="text-gray-500 text-sm mt-1">This takes just a moment</p>
                </div>
              )}

              {submitStatus === 'submitting' && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-2">✅</div>
                  <p className="text-green-400 font-medium">Approved! Submitting to blockchain...</p>
                  <p className="text-gray-500 text-sm mt-1">Please confirm the transaction in your wallet</p>
                </div>
              )}

              {submitStatus === 'error' && errorMessage && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <p className="text-red-400 font-medium">Submission Issue</p>
                      <p className="text-gray-400 text-sm mt-1">{errorMessage}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-4">
                {isPayingWithEmber ? (
                  needsApproval && !isApproveSuccess ? (
                    <button
                      onClick={handleApprove}
                      disabled={isApproving || isApproveConfirming}
                      className="flex-1 py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                    >
                      {isApproving || isApproveConfirming ? 'Approving...' : 'Approve $EMBER'}
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={submitStatus === 'pending-approval' || (!entryText.trim() && !imagePreview)}
                      className="flex-1 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                    >
                      {submitStatus === 'pending-approval' ? 'Checking...' : 'Submit for Review'}
                    </button>
                  )
                ) : (
                  <button
                    disabled={submitStatus === 'pending-approval' || (!entryText.trim() && !imagePreview)}
                    className="flex-1 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                  >
                    {submitStatus === 'pending-approval' ? 'Checking...' : 'Swap & Submit for Review'}
                  </button>
                )}
              </div>

              {/* Info note */}
              <p className="text-center text-gray-500 text-xs">
                All entries are reviewed by AI to ensure they follow the guidelines
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
