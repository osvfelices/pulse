import { useSignal } from '@pulselang/react'

function PulseCounter() {
  const [count, setCount] = useSignal(0)

  return (
    <div className="space-y-2.5">
      <div className="text-center py-3">
        <div className="text-3xl font-bold mb-1 bg-gradient-to-b from-blue-300 to-purple-400 bg-clip-text text-transparent">
          {count()}
        </div>
        <div className="text-xs uppercase tracking-widest text-gray-600">Counter</div>
      </div>
      <button
        onClick={() => setCount(count() + 1)}
        className="w-full py-2.5 px-6 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-xl active:scale-[0.98] transition-all duration-150 shadow-lg shadow-blue-500/25 text-sm"
      >
        Increment
      </button>
    </div>
  )
}

export default PulseCounter
