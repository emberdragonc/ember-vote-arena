'use client'

import { useReadContract, useChainId } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatEther } from 'viem'
import Link from 'next/link'
import { CONTRACTS, ARENA_ABI } from './config/contracts'
import { baseSepolia } from 'wagmi/chains'

export default function Home() {
  const chainId = useChainId()
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS] || CONTRACTS[baseSepolia.id]
  
  const { data: marketCount } = useReadContract({
    address: contracts.arena,
    abi: ARENA_ABI,
    functionName: 'marketCount',
  })

  return (
    <main className="min-h-screen bg-gray-950">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl"></span>
            <span className="text-xl font-bold text-white">The Arena</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/create" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
              Create
            </Link>
            <Link href="/profile" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
              Profile
            </Link>
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, mounted }) => {
                if (!mounted || !account) {
                  return (
                    <button
                      onClick={openConnectModal}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-all"
                    >
                      Connect Wallet
                    </button>
                  )
                }
                return <ConnectButton />
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-full mb-6">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-blue-400 text-sm font-medium">Now Live on Base</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Vote on <span className="text-blue-500">Anything</span>.
          </h1>
          
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Create community voting contests on any topic. AI curates entries, 
            you vote with any token on Base, and winners split the pot.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/create"
              className="w-full sm:w-auto px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold text-lg transition-all hover:scale-105 shadow-lg shadow-blue-500/25"
            >
              Create a Vote →
            </Link>
            <a 
              href="#active"
              className="w-full sm:w-auto px-8 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-semibold text-lg transition-all border border-gray-700"
            >
              See Active Votes
            </a>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="py-8 border-y border-gray-800/50 bg-gray-900/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-white">$0</div>
              <div className="text-gray-500 text-sm">Total Volume</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-500">0</div>
              <div className="text-gray-500 text-sm">$EMBER Burned</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white">$0</div>
              <div className="text-gray-500 text-sm">Paid Out</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white">Any Token</div>
              <div className="text-gray-500 text-sm">Vote on Base</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-gray-400">Four simple steps to create or join a vote</p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '01', icon: '🎯', title: 'Create', desc: 'Start a voting market on any topic. Set the rules, entry fee, and duration.' },
              { step: '02', icon: '📝', title: 'Submit', desc: 'Anyone can submit an entry. AI curates submissions based on the rules you set.' },
              { step: '03', icon: '🗳️', title: 'Vote', desc: 'Vote with any token on Base. Early votes are cheaper (bonding curve pricing).' },
              { step: '04', icon: '🏆', title: 'Win', desc: 'Top 3 entries split the pot (55/20/10%). Creator and stakers earn fees.' },
            ].map((item, i) => (
              <div key={i} className="relative group">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 h-full hover:border-blue-500/50 transition-all">
                  <div className="text-xs text-blue-500 font-mono mb-4">{item.step}</div>
                  <div className="text-3xl mb-3">{item.icon}</div>
                  <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                </div>
                {i < 3 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 text-gray-700">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Active Markets */}
      <section id="active" className="py-20 px-6 bg-gray-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-white">Active Votes</h2>
              <p className="text-gray-400 mt-1">Join a vote or see what&apos;s trending</p>
            </div>
            <Link 
              href="/create"
              className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium transition-colors border border-blue-500/30"
            >
              + Create New
            </Link>
          </div>
          
          <MarketList contracts={contracts} />
        </div>
      </section>

      {/* Payout Structure */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20 rounded-3xl p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl font-bold text-white mb-4">Fair Payout Split</h2>
                <p className="text-gray-400 mb-6">
                  Every vote goes into the pot. When voting ends, the pot is distributed fairly 
                  to winners, the market creator, and token stakers.
                </p>
                <Link 
                  href="/create"
                  className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium"
                >
                  Create your first market →
                </Link>
              </div>
              <div className="space-y-3">
                {[
                  { label: '1st Place', pct: 55, color: 'bg-blue-500' },
                  { label: '2nd Place', pct: 20, color: 'bg-blue-400' },
                  { label: '3rd Place', pct: 10, color: 'bg-blue-300' },
                  { label: 'Stakers', pct: 10, color: 'bg-gray-500' },
                  { label: 'Market Creator', pct: 5, color: 'bg-gray-600' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-20 text-sm text-gray-400">{item.label}</div>
                    <div className="flex-1 h-6 bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${item.color} rounded-full`} 
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                    <div className="w-12 text-right text-white font-medium">{item.pct}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 border-t border-gray-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to start?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Create a voting market in under 2 minutes. No coding required.
          </p>
          <Link 
            href="/create"
            className="inline-block px-10 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold text-lg transition-all hover:scale-105 shadow-lg shadow-blue-500/25"
          >
            Create Your First Vote 🔥
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-800/50">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-500">
            <span></span>
            <span>Built on Base</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <a href="https://twitter.com/emberclawd" className="text-gray-500 hover:text-white transition-colors">Twitter</a>
            <a href="https://github.com/emberdragonc/ember-vote-arena" className="text-gray-500 hover:text-white transition-colors">GitHub</a>
            <a href="https://ember.engineer" className="text-gray-500 hover:text-white transition-colors">ember.engineer</a>
          </div>
        </div>
      </footer>
    </main>
  )
}

function MarketList({ contracts }: { contracts: typeof CONTRACTS[84532] }) {
  const { data: marketCount } = useReadContract({
    address: contracts.arena,
    abi: ARENA_ABI,
    functionName: 'marketCount',
  })

  const count = Number(marketCount || 0)
  
  if (count === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
        <div className="text-5xl mb-4">🎭</div>
        <h3 className="text-xl font-semibold text-white mb-2">No active votes yet</h3>
        <p className="text-gray-500 mb-6">Be the first to create a voting market!</p>
        <Link 
          href="/create"
          className="inline-block px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
        >
          Create First Vote
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {Array.from({ length: Math.min(count, 10) }, (_, i) => (
        <MarketCard key={i} marketId={BigInt(count - 1 - i)} contracts={contracts} />
      ))}
    </div>
  )
}

function MarketCard({ marketId, contracts }: { marketId: bigint; contracts: typeof CONTRACTS[84532] }) {
  const { data: market } = useReadContract({
    address: contracts.arena,
    abi: ARENA_ABI,
    functionName: 'getMarket',
    args: [marketId],
  })

  if (!market) return null

  const now = Math.floor(Date.now() / 1000)
  const isEntryPhase = now < Number(market.entryEnd)
  const isVotingPhase = now >= Number(market.entryEnd) && now < Number(market.voteEnd)
  const isResolved = market.resolved

  const status = isResolved 
    ? { text: 'Completed', color: 'bg-gray-600', dot: 'bg-gray-400' }
    : isEntryPhase 
    ? { text: 'Accepting Entries', color: 'bg-green-500/10 text-green-400 border-green-500/30', dot: 'bg-green-500' }
    : isVotingPhase 
    ? { text: 'Voting Open', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', dot: 'bg-blue-500' }
    : { text: 'Ended', color: 'bg-red-500/10 text-red-400 border-red-500/30', dot: 'bg-red-500' }

  return (
    <Link href={`/market/${marketId.toString()}`}>
      <div className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-gray-700 rounded-2xl p-6 transition-all cursor-pointer group">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
              {market.title}
            </h3>
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{market.rules}</p>
          </div>
          <span className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${status.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot} animate-pulse`}></span>
            {status.text}
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5 text-gray-400">
            <span>📝</span>
            <span><span className="text-white font-medium">{market.entryCount.toString()}</span> entries</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <span>🗳️</span>
            <span><span className="text-white font-medium">{market.totalVotes.toString()}</span> votes</span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-400">
            <span>💰</span>
            <span className="text-blue-400 font-medium">{formatEther(market.totalPot)} tokens</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
