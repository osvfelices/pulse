import { signal, effect } from '/std/reactive.mjs'

const [count, setCount] = signal(0)

effect(() => {
  const el = document.getElementById('count')
  if (el) {
    el.textContent = String(count())
  }
})

export fn inc() {
  setCount(count() + 1)
}
