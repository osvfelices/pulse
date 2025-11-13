import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { usePulseValue } from '@pulselang/react'
import { cryptoSignals } from '../pulse/market-data.pulse'

// Generate realistic chart data
function generateChartData() {
  const data = []
  const points = 50
  let value = 100

  for (let i = 0; i < points; i++) {
    value += (Math.random() - 0.48) * 3
    data.push(value)
  }

  return data
}

// Top 4 movers to display
const TOP_MOVERS_SYMBOLS = ['BTC', 'ETH', 'USDT', 'XRP']

function MoverCard({ symbol }) {
  const crypto = cryptoSignals[symbol]

  // Subscribe to Pulse signals - usePulseValue returns the VALUE directly
  const price = usePulseValue(crypto.price)
  const change = usePulseValue(crypto.change24h)

  const isPositive = change >= 0
  const color = isPositive ? '#10b981' : '#ef4444'

  // Generate chart data once and memoize it
  const chartData = useMemo(() => generateChartData(), [])

  const chartOption = useMemo(() => ({
    grid: {
      left: 0,
      right: 0,
      top: 5,
      bottom: 0
    },
    xAxis: {
      type: 'category',
      show: false,
      data: chartData.map((_, i) => i)
    },
    yAxis: {
      type: 'value',
      show: false,
      scale: true
    },
    series: [{
      data: chartData,
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: {
        color: color,
        width: 2
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: color + '40' },
            { offset: 1, color: color + '00' }
          ]
        }
      }
    }]
  }), [chartData, color])

  return (
    <div className="surface-elevated rounded-2xl p-6 interactive-element">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-linear-to-br from-gray-800 to-gray-900 flex items-center justify-center text-base font-bold shadow-lg interactive-element">
            {symbol.charAt(0)}
          </div>
          <div>
            <div className="font-bold text-lg text-display">{symbol}</div>
            <div className="text-sm text-gray-500 text-body">{crypto.name}</div>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-lg font-semibold text-sm price-change ${
          isPositive ? 'price-up' : 'price-down'
        }`}>
          {isPositive ? '+' : ''}{change.toFixed(2)}%
        </div>
      </div>

      <div className="text-3xl font-bold mb-4 tabular-nums text-data price-change">
        ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      <div className="h-24 -mx-2 chart-container">
        <ReactECharts
          option={chartOption}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
      </div>
    </div>
  )
}

export default function TopMovers() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 bg-linear-to-r from-white to-gray-400 bg-clip-text text-transparent text-display">
        Top Movers
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {TOP_MOVERS_SYMBOLS.map(symbol => (
          <MoverCard key={symbol} symbol={symbol} />
        ))}
      </div>
    </div>
  )
}
