// Domain-specific: contract and view
contract User {
  name: string,
  age: number
}

view UserCard(user) {
  return user.name
}
