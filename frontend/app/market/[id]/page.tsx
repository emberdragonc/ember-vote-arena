'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatEther } from 'viem'
import Link from 'next/link'
import { CONTRACTS, ARENA_ABI } from '../../config/contracts'
import { baseSepolia } from 'wagmi/chains'

function formatWithCommas(value: string): string {
  const parts = value.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

function generateSubtitle(title: string, rules: string): string {
  // Generate a user-friendly subtitle based on the market
  const lowerTitle = title.toLowerCase()
  if (lowerTitle.includes('best') || lowerTitle.includes('contest')) {
    return 'Submit your entry and let the community decide the winner'
  }
  if (lowerTitle.includes('vote') || lowerTitle.includes('poll')) {
    return 'Cast your vote and help decide the outcome'
  }
  if (lowerTitle.includes('predict')) {
    return 'Make your prediction and compete for the prize pool'
  }
  return 'Join the competition and vote for your favorites'
}

function Countdown({ targetTime, label }: { targetTime: number; label: string }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000)
      const diff = targetTime - now
      if (diff <= 0) {
        setTimeLeft('Ended')
        return
      }
      const hours = Math.floor(diff / 3600)
      const mins = Math.floor((diff % 3600) / 60)
      const secs = diff % 60
      setTimeLeft(`${hours}h ${mins}m ${secs}s`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [targetTime])

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 text-center">
      <div className="text-gray-400 text-sm mb-2">{label}</div>
      <div className="text-4xl font-bold text-white font-mono">{timeLeft}</div>
    </div>
  )
}

export default function MarketPage() {
  const params = useParams()
  const marketId = BigInt(params.id as string)
  const chainId = useChainId()
  const { address, isConnected } = useAccount()
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS] || CONTRACTS[baseSepolia.id]

  const [voteAmount, setVoteAmount] = useState('10')
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null)

  // Fetch market data
  const { data: market } = useReadContract({
    address: contracts.arena,
    abi: ARENA_ABI,
    functionName: 'getMarket',
    args: [marketId],
  })

  // Fetch leaderboard
  const { data: leaderboard } = useReadContract({
    address: contracts.arena,
    abi: ARENA_ABI,
    functionName: 'getLeaderboard',
    args: [marketId],
  })

  // Get vote price
  const { data: votePrice } = useReadContract({
    address: contracts.arena,
    abi: ARENA_ABI,
    functionName: 'getCurrentVotePrice',
    args: [marketId, BigInt(voteAmount || '1')],
  })

  // Vote transaction
  const { writeContract: vote, data: voteHash, isPending: isVoting } = useWriteContract()
  const { isLoading: isVoteConfirming, isSuccess: isVoteSuccess } = useWaitForTransactionReceipt({
    hash: voteHash,
  })

  // Resolve transaction
  const { writeContract: resolve, data: resolveHash, isPending: isResolving } = useWriteContract()
  const { isLoading: isResolveConfirming } = useWaitForTransactionReceipt({
    hash: resolveHash,
  })

  const handleVote = () => {
    if (selectedEntry === null) return
    vote({
      address: contracts.arena,
      abi: ARENA_ABI,
      functionName: 'vote',
      args: [marketId, BigInt(selectedEntry), BigInt(voteAmount)],
    })
  }

  const handleResolve = () => {
    resolve({
      address: contracts.arena,
      abi: ARENA_ABI,
      functionName: 'resolve',
      args: [marketId],
    })
  }

  if (!market) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white">Loading market...</div>
      </main>
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const isEntryPhase = now < Number(market.entryEnd)
  const isVotingPhase = now >= Number(market.entryEnd) && now < Number(market.voteEnd)
  const isEnded = now >= Number(market.voteEnd)
  const isResolved = market.resolved

  const entryIds = leaderboard?.[0] || []
  const voteCounts = leaderboard?.[1] || []

  // Calculate prize amounts
  const totalPot = Number(formatEther(market.totalPot))
  const firstPrize = totalPot * 0.55
  const secondPrize = totalPot * 0.20
  const thirdPrize = totalPot * 0.10

  // Estimate USDC value (placeholder - would need price oracle)
  const emberPrice = 0.001 // Placeholder
  const potUSD = totalPot * emberPrice

  return (
    <main className="min-h-screen bg-gray-950">
      {/* Header */}
      <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-white">The Arena</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/profile" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
              Profile
            </Link>
            <ConnectButton />
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Market Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                <StatusBadge isEntryPhase={isEntryPhase} isVotingPhase={isVotingPhase} isResolved={isResolved} />
                <h1 className="text-4xl font-bold text-white mt-3">{market.title}</h1>
                <p className="text-xl text-gray-400 mt-2">{generateSubtitle(market.title, market.rules)}</p>
              </div>
            </div>

            {/* Countdown Timer - Large */}
            {isEntryPhase && (
              <div className="mt-6">
                <Countdown targetTime={Number(market.entryEnd)} label="Entry Phase Ends In" />
                <p className="text-center text-gray-500 text-sm mt-2">Voting begins when entry phase ends</p>
              </div>
            )}
            {isVotingPhase && (
              <div className="mt-6">
                <Countdown targetTime={Number(market.voteEnd)} label="Voting Ends In" />
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Submit Entry CTA */}
              {isEntryPhase && (
                <div className="bg-gradient-to-r from-blue-500/10 to-transparent border border-blue-500/30 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2">Submit Your Entry</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Entry cost: <span className="text-white font-medium">{formatWithCommas(formatEther(market.entryCost))} $EMBER</span>
                  </p>
                  <Link
                    href={`/market/${marketId}/submit`}
                    className="inline-block px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
                  >
                    Submit Entry →
                  </Link>
                </div>
              )}

              {/* Leaderboard */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h3 className="text-xl font-bold text-white mb-4">
                  {isResolved ? '🏆 Final Results' : '📊 Leaderboard'}
                </h3>
                
                {entryIds.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">📝</div>
                    <p className="text-gray-400">No entries yet. Be the first!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {entryIds.map((entryId, index) => (
                      <EntryCard
                        key={entryId.toString()}
                        marketId={marketId}
                        entryId={entryId}
                        votes={voteCounts[index]}
                        rank={index + 1}
                        isSelected={selectedEntry === Number(entryId)}
                        onSelect={() => isVotingPhase && setSelectedEntry(Number(entryId))}
                        isVotingPhase={isVotingPhase}
                        contracts={contracts}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Voting Section */}
              {isConnected && isVotingPhase && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                  <h4 className="text-lg font-semibold text-white mb-4">Cast Your Vote</h4>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-1">Number of Votes</label>
                      <input
                        type="number"
                        value={voteAmount}
                        onChange={(e) => setVoteAmount(e.target.value)}
                        min="1"
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">Cost</div>
                      <div className="text-xl font-semibold text-blue-500">
                        {votePrice ? formatWithCommas(formatEther(votePrice)) : '...'} $EMBER
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleVote}
                    disabled={isVoting || isVoteConfirming || selectedEntry === null}
                    className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 text-white rounded-xl font-semibold transition-colors"
                  >
                    {isVoting || isVoteConfirming
                      ? 'Voting...'
                      : selectedEntry === null
                      ? 'Select an Entry Above'
                      : `Vote for Entry #${selectedEntry}`}
                  </button>
                  {isVoteSuccess && (
                    <p className="text-green-500 text-sm mt-3 text-center">Vote cast successfully! 🎉</p>
                  )}
                </div>
              )}

              {/* Resolve Button */}
              {isEnded && !isResolved && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
                  <p className="text-gray-400 mb-4">Voting has ended. Anyone can resolve this market!</p>
                  <button
                    onClick={handleResolve}
                    disabled={isResolving || isResolveConfirming}
                    className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold transition-colors"
                  >
                    {isResolving || isResolveConfirming ? 'Resolving...' : 'Resolve Market 🏆'}
                  </button>
                </div>
              )}

              {isResolved && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center">
                  <p className="text-green-400 font-semibold text-lg">✅ This market has been resolved!</p>
                  <p className="text-gray-400 text-sm mt-2">Payouts have been distributed to winners.</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Prize Pool */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Prize Pool</h3>
                <div className="text-center mb-4">
                  <div className="text-3xl font-bold text-white">{formatWithCommas(totalPot.toFixed(0))}</div>
                  <div className="text-gray-400 text-sm">$EMBER</div>
                  <div className="text-gray-500 text-xs mt-1">≈ ${potUSD.toFixed(2)} USD</div>
                </div>
                
                {/* Payout Breakdown */}
                <div className="border-t border-gray-800 pt-4 mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 flex items-center gap-2">🥇 1st Place (55%)</span>
                    <span className="text-white font-medium">{formatWithCommas(firstPrize.toFixed(0))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 flex items-center gap-2">🥈 2nd Place (20%)</span>
                    <span className="text-white font-medium">{formatWithCommas(secondPrize.toFixed(0))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 flex items-center gap-2">🥉 3rd Place (10%)</span>
                    <span className="text-white font-medium">{formatWithCommas(thirdPrize.toFixed(0))}</span>
                  </div>
                  <div className="border-t border-gray-800 pt-3 mt-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Stakers (10%)</span>
                      <span className="text-gray-400">{formatWithCommas((totalPot * 0.1).toFixed(0))}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-500">Creator (5%)</span>
                      <span className="text-gray-400">{formatWithCommas((totalPot * 0.05).toFixed(0))}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Market Info */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Market Details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Entries</span>
                    <span className="text-white">{market.entryCount.toString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Votes</span>
                    <span className="text-white">{market.totalVotes.toString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Entry Cost</span>
                    <span className="text-white">{formatWithCommas(formatEther(market.entryCost))} $EMBER</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Entry Deadline</span>
                    <span className="text-white text-xs">{new Date(Number(market.entryEnd) * 1000).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Vote Deadline</span>
                    <span className="text-white text-xs">{new Date(Number(market.voteEnd) * 1000).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Rules (for AI) */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-2">Entry Guidelines</div>
                <p className="text-sm text-gray-400">{market.rules}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function StatusBadge({ isEntryPhase, isVotingPhase, isResolved }: { 
  isEntryPhase: boolean
  isVotingPhase: boolean
  isResolved: boolean
}) {
  if (isResolved) return <span className="inline-block px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-xs font-medium">Resolved</span>
  if (isEntryPhase) return <span className="inline-block px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/30 rounded-full text-xs font-medium">Accepting Entries</span>
  if (isVotingPhase) return <span className="inline-block px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full text-xs font-medium">Voting Open</span>
  return <span className="inline-block px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded-full text-xs font-medium">Ended</span>
}

function EntryCard({ 
  marketId, 
  entryId, 
  votes, 
  rank, 
  isSelected, 
  onSelect, 
  isVotingPhase,
  contracts 
}: { 
  marketId: bigint
  entryId: bigint
  votes: bigint
  rank: number
  isSelected: boolean
  onSelect: () => void
  isVotingPhase: boolean
  contracts: typeof CONTRACTS[84532]
}) {
  const { data: entry } = useReadContract({
    address: contracts.arena,
    abi: ARENA_ABI,
    functionName: 'getEntry',
    args: [marketId, entryId],
  })

  if (!entry || entry.filtered) return null

  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`

  return (
    <div
      onClick={onSelect}
      className={`bg-gray-800 hover:bg-gray-750 rounded-xl p-4 border-2 transition-all ${
        isSelected 
          ? 'border-blue-500 bg-blue-500/5' 
          : isVotingPhase 
            ? 'border-transparent hover:border-gray-700 cursor-pointer' 
            : 'border-transparent'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-2xl">{medal}</span>
          <div>
            <div className="text-white font-medium">{entry.data}</div>
            <div className="text-sm text-gray-500">
              by {entry.author.slice(0, 6)}...{entry.author.slice(-4)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-white">{votes.toString()}</div>
          <div className="text-xs text-gray-500">votes</div>
        </div>
      </div>
    </div>
  )
}
