import { useState } from 'react'
import './App.css'
import PulseCounter from './PulseCounter'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      {/* Radial glow effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/30 rounded-full blur-[150px]" />
      </div>

      {/* Main Content */}
      <div className="relative w-full max-w-6xl mx-auto px-6 py-6">
        {/* Logo & Title */}
        <div className="text-center mb-6">
          <img
            src="/pulse.svg"
            alt="Pulse"
            className="w-16 h-16 mx-auto mb-3 opacity-90"
          />

          <h1 className="text-4xl font-bold tracking-tight mb-2 bg-linear-to-b from-white to-gray-400 bg-clip-text text-transparent">
            Pulse
          </h1>

          <p className="text-sm text-gray-400">
            A programming language for reactive and concurrent computing
          </p>
        </div>

        {/* Demo Cards */}
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto mb-5">
          {/* React State Card */}
          <div className="group relative">
            <div className="absolute inset-0 bg-linear-to-br from-gray-800/50 to-gray-900/50 rounded-2xl blur-xl" />

            <div className="relative border border-gray-800/50 rounded-2xl p-4 bg-linear-to-br from-gray-900/90 to-black/90 backdrop-blur-xl hover:border-gray-700/50 transition-all duration-300 shadow-2xl">
              <h3 className="text-base font-semibold mb-1 text-gray-200">
                React State
              </h3>
              <p className="text-gray-500 text-xs mb-3">
                Traditional React hooks
              </p>

              <div className="space-y-2.5">
                <div className="text-center py-3">
                  <div className="text-3xl font-bold mb-1 bg-linear-to-b from-white to-gray-400 bg-clip-text text-transparent">
                    {count}
                  </div>
                  <div className="text-xs uppercase tracking-widest text-gray-600">Counter</div>
                </div>
                <button
                  onClick={() => setCount(count + 1)}
                  className="w-full py-2.5 px-6 bg-white text-black font-semibold rounded-xl hover:bg-gray-100 active:scale-[0.98] transition-all duration-150 shadow-lg text-sm"
                >
                  Increment
                </button>
              </div>
            </div>
          </div>

          {/* Pulse Signals Card */}
          <div className="group relative">
            <div className="absolute inset-0 bg-linear-to-br from-blue-800/30 to-purple-900/30 rounded-2xl blur-xl" />

            <div className="relative border border-blue-800/30 rounded-2xl p-4 bg-linear-to-br from-gray-900/90 to-black/90 backdrop-blur-xl hover:border-blue-700/50 transition-all duration-300 shadow-2xl">
              <h3 className="text-base font-semibold mb-1 bg-linear-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Pulse Signals
              </h3>
              <p className="text-gray-500 text-xs mb-3">
                Built-in reactive primitives
              </p>

              <PulseCounter />
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-3 max-w-4xl mx-auto">
          <div className="border border-gray-800/30 rounded-xl p-3 bg-gray-900/20">
            <h4 className="font-semibold mb-1 text-gray-200 text-xs">Complete Language</h4>
            <p className="text-xs text-gray-500">
              Lexer, parser, runtime
            </p>
          </div>

          <div className="border border-gray-800/30 rounded-xl p-3 bg-gray-900/20">
            <h4 className="font-semibold mb-1 text-gray-200 text-xs">CSP Concurrency</h4>
            <p className="text-xs text-gray-500">
              Channels and select
            </p>
          </div>

          <div className="border border-gray-800/30 rounded-xl p-3 bg-gray-900/20">
            <h4 className="font-semibold mb-1 text-gray-200 text-xs">Deterministic</h4>
            <p className="text-xs text-gray-500">
              Predictable execution
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
