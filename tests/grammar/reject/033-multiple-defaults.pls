// Invalid select - multiple default cases
select {
  case recv ch:
    x = 1
  default:
    y = 2
  default:
    z = 3
}
