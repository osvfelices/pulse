import './App.css'

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white flex items-center justify-center">
      {/* Radial glow effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-blue-600/20 rounded-full blur-[200px]" />
      </div>

      {/* Main Content */}
      <div className="relative w-full max-w-4xl mx-auto px-6 py-8 text-center">
        {/* Logo */}
        <div className="mb-6">
          <img
            src="/pulse.svg"
            alt="Pulse"
            className="w-16 h-16 mx-auto mb-4 drop-shadow-2xl"
          />

          <h1 className="text-4xl font-bold tracking-tight mb-3 bg-gradient-to-b from-white via-white to-gray-500 bg-clip-text text-transparent">
            Pulse
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            A programming language for reactive and concurrent computing
          </p>
        </div>

        {/* Quick Start Command */}
        <div className="my-6">
          <div className="inline-flex items-center gap-3 bg-gray-900/50 border border-gray-800 rounded-xl px-6 py-3 backdrop-blur-sm shadow-xl">
            <span className="text-gray-500 text-sm font-mono">$</span>
            <code className="text-white font-mono text-base">
              npx create-pulselang-app my-app
            </code>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex gap-3 justify-center my-8">
          <a
            href="https://osvfelices.github.io/pulse/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2.5 bg-white text-black font-medium rounded-lg hover:bg-gray-100 active:scale-[0.98] transition-all duration-150 shadow-lg hover:shadow-xl min-w-[120px] text-center"
          >
            Get Started
          </a>
          <a
            href="https://osvfelices.github.io/pulse/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2.5 bg-gray-900 border border-gray-700 text-white font-medium rounded-lg hover:bg-gray-800 hover:border-gray-600 active:scale-[0.98] transition-all duration-150 min-w-[120px] text-center"
          >
            Documentation
          </a>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <div className="border border-gray-800/50 rounded-xl p-4 bg-gray-900/20 backdrop-blur-sm hover:border-gray-700/50 transition-all">
            <h3 className="font-semibold mb-2 text-white text-base">Reactive Signals</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Fine-grained reactivity with automatic dependency tracking
            </p>
          </div>

          <div className="border border-gray-800/50 rounded-xl p-4 bg-gray-900/20 backdrop-blur-sm hover:border-gray-700/50 transition-all">
            <h3 className="font-semibold mb-2 text-white text-base">CSP Concurrency</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Channels and select for structured concurrent programming
            </p>
          </div>

          <div className="border border-gray-800/50 rounded-xl p-4 bg-gray-900/20 backdrop-blur-sm hover:border-gray-700/50 transition-all">
            <h3 className="font-semibold mb-2 text-white text-base">Deterministic</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Predictable execution order, same inputs yield same outputs
            </p>
          </div>
        </div>

        {/* Footer Link */}
        <div className="mt-8">
          <a
            href="https://github.com/osvfelices/pulse"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
          >
            View on GitHub →
          </a>
        </div>
      </div>
    </div>
  )
}

export default App
