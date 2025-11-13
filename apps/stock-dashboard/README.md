# Crypto Market Dashboard

Premium cryptocurrency market data dashboard built with Pulse, React 19, and Tailwind CSS 4. This demo showcases Pulse's fine-grained reactivity with signals for real-time price updates.

## Features

- **Real-time Price Updates**: Simulated price updates every 2 seconds using Pulse signals
- **Fine-grained Reactivity**: Pulse signals ensure only affected components re-render, not the entire tree
- **Premium Dark UI**: Professional trading platform design with backdrop blur and gradients
- **Live Charts**: ECharts area charts showing price trends for top 4 cryptocurrencies
- **Market Table**: Complete overview with price, 1h/24h/7d changes, volume, and market cap
- **15 Cryptocurrencies**: BTC, ETH, USDT, XRP, SOL, BNB, DOGE, ADA, TRX, TON, LINK, AVAX, SHIB, DOT, BCH

## Development

```bash
npm install
npm run dev
```

Visit http://localhost:5173/ to see the dashboard in action.

Build for production:

```bash
npm run build
npm run preview
```

## Architecture

This app demonstrates key Pulse concepts:

### Signals (Fine-grained Reactivity)

```pulse
// market-data.pulse - Create signals for each cryptocurrency
import { signal } from 'pulselang/runtime/reactivity'

for (const crypto of CRYPTO_LIST) {
  const [price, setPrice] = signal(crypto.basePrice)
  const [change1h, setChange1h] = signal(crypto.baseChange1h)
  const [change24h, setChange24h] = signal(crypto.baseChange24h)
  const [change7d, setChange7d] = signal(crypto.baseChange7d)

  cryptoSignals[crypto.symbol] = {
    price,
    setPrice,
    change1h,
    setChange1h,
    change24h,
    setChange24h,
    change7d,
    setChange7d,
    // ...
  }
}

// Simulate price updates every 2 seconds
export fn startPriceUpdates() {
  setInterval(() => {
    for (const symbol of cryptoSymbols) {
      const crypto = cryptoSignals[symbol]
      const fluctuation = (Math.random() - 0.5) * 0.01
      const newPrice = crypto.basePrice * (1 + fluctuation)
      crypto.setPrice(newPrice)
      // ... update change percentages
    }
  }, 2000)
}
```

### React Integration

```jsx
import { usePulseValue } from '@pulselang/react'
import { cryptoSignals } from '../pulse/market-data.pulse'

function MarketRow({ symbol }) {
  const crypto = cryptoSignals[symbol]

  // Subscribe to Pulse signals - usePulseValue returns the VALUE directly
  const price = usePulseValue(crypto.price)
  const change24h = usePulseValue(crypto.change24h)

  return (
    <tr>
      <td>${price.toLocaleString()}</td>
      <td>{change24h.toFixed(2)}%</td>
    </tr>
  )
}

// Start updates when app mounts
useEffect(() => {
  startPriceUpdates()
}, [])
```

When a price signal updates, only the specific table cell re-renders - not the entire table or component tree.

## Project Structure

```
src/
├── pulse/
│   └── market-data.pulse        # Signal creation and price update simulation
├── components/
│   ├── MarketTable.jsx          # Full market table with 7 columns
│   └── TopMovers.jsx            # Top 4 cryptos with ECharts area charts
├── App.jsx                      # Main layout and startPriceUpdates() call
├── main.jsx                     # React entry point
└── index.css                    # Tailwind CSS 4 with @theme directive
```

## Tech Stack

- **Pulse**: Fine-grained reactive primitives
- **React 19**: UI library with new hooks
- **Vite 5**: Fast build tool with HMR
- **vite-plugin-pulse**: Compiles .pulse files to JavaScript
- **Tailwind CSS 4**: Utility-first CSS with new @theme syntax
- **Apache ECharts**: Premium chart library with smooth gradients

## Why Pulse?

Traditional approaches to real-time dashboards:
- WebSocket + React state → causes full component re-renders
- RxJS observables → complex to reason about
- Redux + middleware → lots of boilerplate

Pulse offers:
- **Fine-grained updates**: Only affected DOM nodes update, not entire component tree
- **Simple mental model**: Signals for reactivity, automatically tracks dependencies
- **TypeScript-first**: Full type safety from .pulse to React components
- **Zero configuration**: Works with Vite out of the box via plugin

## Performance

This dashboard handles:
- 15 cryptocurrencies with live price updates
- 4 signals per crypto (price, change1h, change24h, change7d)
- Updates every 2 seconds with random fluctuations
- Zero full component re-renders thanks to Pulse signals
- Each table row and chart only re-renders when its specific data changes

## Design

Premium trading platform design:
- Pure black background (#000000) with radial gradient glow
- Blue/purple gradient accents for Pulse branding
- Green/red color coding for positive/negative movements
- Tabular number formatting for perfect alignment
- Backdrop blur effects for glassmorphism
- Smooth transitions on interactive elements
