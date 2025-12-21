/**
 * Stock Dashboard - Premium crypto market visualization
 *
 * Built with Pulse language for deterministic concurrency
 * React 19 UI with Tailwind CSS 4 and ECharts for data visualization
 */

import { useEffect } from 'react'
import MarketTable from './components/MarketTable'
import TopMovers from './components/TopMovers'
import { startPriceUpdates } from './pulse/market-data.pulse'

export default function App() {
  // Start price updates when app mounts
  useEffect(() => {
    startPriceUpdates()
  }, [])
  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="surface-elevated border-b border-gray-800/50 sticky top-0 z-50 bg-black/95 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-8 py-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-linear-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent text-display">
                Crypto Market
              </h1>
              <p className="text-sm text-gray-500 mt-1 font-medium text-body">
                Powered by{' '}
                <span className="text-orange-500 font-semibold">Pulse</span>
                {' '}— Deterministic concurrency for JavaScript
              </p>
            </div>

            {/* Stats summary */}
            <div className="hidden md:flex items-center gap-10">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1.5">
                  Market Cap
                </div>
                <div className="text-xl font-bold tabular-nums bg-linear-to-r from-white to-gray-400 bg-clip-text text-transparent text-data">
                  $2.89T
                </div>
              </div>
              <div className="h-12 w-px bg-gray-800"></div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1.5">
                  24h Volume
                </div>
                <div className="text-xl font-bold tabular-nums bg-linear-to-r from-white to-gray-400 bg-clip-text text-transparent text-data">
                  $127.3B
                </div>
              </div>
              <div className="h-12 w-px bg-gray-800"></div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1.5">
                  BTC Dominance
                </div>
                <div className="text-xl font-bold tabular-nums bg-linear-to-r from-white to-gray-400 bg-clip-text text-transparent text-data">
                  54.2%
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-[1600px] mx-auto px-8 py-10">
        <div className="space-y-10">
          {/* Top movers section */}
          <TopMovers />

          {/* Market table section */}
          <MarketTable />
        </div>
      </main>

      {/* Footer */}
      <footer className="surface-elevated border-t border-gray-800/50 mt-20 bg-black/95 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-8 py-8">
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-500">
              Built with{' '}
              <a
                href="https://github.com/osvfelices/pulse"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-500 hover:text-orange-400 font-semibold transition-colors interactive-element"
              >
                Pulse
              </a>
              {' '}— Deterministic concurrency for real-time data
            </div>
            <div className="flex items-center gap-6 text-gray-500">
              <span className="font-medium">15+ cryptocurrencies</span>
              <span className="text-gray-700">•</span>
              <span className="font-medium">Real-time updates</span>
              <span className="text-gray-700">•</span>
              <span className="flex items-center gap-2">
                <span className="relative flex h-2 w-2 status-indicator status-live"></span>
                <span className="text-green-500 font-semibold">Live Demo</span>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
