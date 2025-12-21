// Spawn and go expressions
const t1 = spawn fn() { return 1 }
const t2 = spawn async fn() { return 2 }
const t3 = spawn () => work()
const t4 = go fn() { return 3 }
const t5 = go () => work()
