// Select expression
const result = select {
  case recv ch1:
    x = 1
  case send ch2 value:
    y = 2
  default:
    z = 3
}

select {
  case msg = await ch.recv():
    process(msg)
}
