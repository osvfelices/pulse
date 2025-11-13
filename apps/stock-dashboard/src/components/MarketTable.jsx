import { usePulseValue } from '@pulselang/react'
import { cryptoSignals, cryptoSymbols } from '../pulse/market-data.pulse'

// Market data table component - now using Pulse signals for real-time updates

function formatNumber(num) {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
  return `$${num.toFixed(2)}`
}

function PercentCell({ value }) {
  const isPositive = value >= 0
  return (
    <span className={`font-semibold price-change ${isPositive ? 'price-up' : 'price-down'}`}>
      {isPositive ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

function MarketRow({ symbol, rank }) {
  const crypto = cryptoSignals[symbol]

  // Subscribe to Pulse signals - usePulseValue returns the VALUE directly
  const price = usePulseValue(crypto.price)
  const change1h = usePulseValue(crypto.change1h)
  const change24h = usePulseValue(crypto.change24h)
  const change7d = usePulseValue(crypto.change7d)

  return (
    <tr className="data-row interactive-element">
      <td className="px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-gray-500 font-medium w-6 text-data">{rank}</span>
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-gray-800 to-gray-900 flex items-center justify-center text-sm font-bold shadow-lg interactive-element">
            {symbol.charAt(0)}
          </div>
          <div>
            <div className="font-bold text-base text-display">{symbol}</div>
            <div className="text-sm text-gray-500 text-body">{crypto.name}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        <span className="font-bold text-lg tabular-nums text-data price-change">
          ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </td>
      <td className="px-6 py-4 text-right tabular-nums">
        <PercentCell value={change1h} />
      </td>
      <td className="px-6 py-4 text-right tabular-nums">
        <PercentCell value={change24h} />
      </td>
      <td className="px-6 py-4 text-right tabular-nums">
        <PercentCell value={change7d} />
      </td>
      <td className="px-6 py-4 text-right">
        <span className="text-gray-400 tabular-nums font-medium text-data">
          {formatNumber(crypto.volume)}
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        <span className="text-gray-400 tabular-nums font-medium text-data">
          {formatNumber(crypto.marketCap)}
        </span>
      </td>
    </tr>
  )
}

export default function MarketTable() {
  return (
    <div className="surface-elevated rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-800/50">
        <h2 className="text-2xl font-bold bg-linear-to-r from-white to-gray-400 bg-clip-text text-transparent text-display">
          Market Overview
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800/50">
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                1h %
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                24h %
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                7d %
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                Volume (24h)
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                Market Cap
              </th>
            </tr>
          </thead>
          <tbody>
            {cryptoSymbols.map((symbol, index) => (
              <MarketRow key={symbol} symbol={symbol} rank={index + 1} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
