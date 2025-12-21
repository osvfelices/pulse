// Class declarations
class Empty {}

class Animal {
  speak() {
    return "sound"
  }
}

class Dog extends Animal {
  speak() {
    return "bark"
  }

  async fetch() {
    return "ball"
  }
}
