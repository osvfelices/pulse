// Adversarial tests for deeply nested control flow
import { Parser } from '../lib/parser.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(` ${name}`);
    passed++;
  } catch (err) {
    console.log(` ${name}: ${err.message}`);
    failed++;
  }
}

function testParsesSafely(name, code) {
  test(name, () => {
    try {
      const parser = new Parser(code);
      parser.parseProgram();
    } catch (err) {
      if (!err.code && !err.pulseErrors) {
        throw new Error(`Uncontrolled error: ${err.message}`);
      }
    }
  });
}

console.log('Adversarial Tests: Deeply Nested Control Flow\n');

// Nested if statements
testParsesSafely('If depth 10', `
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          if (e) {
            if (f) {
              if (g) {
                if (h) {
                  if (i) {
                    if (j) {
                      return 1
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

testParsesSafely('If depth 20',
  'if (1) {\n'.repeat(20) + 'return 1\n' + '}\n'.repeat(20));

// Nested for loops
testParsesSafely('For depth 10',
  'for (let i = 0; i < 10; i = i + 1) {\n'.repeat(10) +
  'print(i)\n' +
  '}\n'.repeat(10));

// Nested while loops
testParsesSafely('While depth 10',
  'while (x) {\n'.repeat(10) + 'x = x - 1\n' + '}\n'.repeat(10));

// Mixed nesting
testParsesSafely('Mixed if/for/while depth 5', `
  if (a) {
    for (let i = 0; i < 10; i = i + 1) {
      while (x) {
        if (b) {
          for (let j = 0; j < 5; j = j + 1) {
            return 1
          }
        }
      }
    }
  }
`);

// Nested try/catch
testParsesSafely('Try/catch depth 10',
  'try {\n'.repeat(10) +
  'throw 1\n' +
  ('} catch (e) {\n'.repeat(10) +
  'print(e)\n' +
  '}\n'.repeat(10)));

// Nested switch
testParsesSafely('Nested switch depth 5', `
  switch (a) {
    case 1:
      switch (b) {
        case 2:
          switch (c) {
            case 3:
              switch (d) {
                case 4:
                  switch (e) {
                    case 5:
                      return 1
                  }
              }
          }
      }
  }
`);

// Malformed nested control flow
testParsesSafely('Nested if with missing closing brace',
  'if (a) {\nif (b) {\nif (c) {\n}\n}');

testParsesSafely('Nested for with unclosed body',
  'for (let i = 0; i < 10; i = i + 1) {\nfor (let j = 0; j < 5; j = j + 1) {');

testParsesSafely('Nested while with syntax error in condition',
  'while (x) {\nwhile (@) {\nprint(x)\n}\n}');

// Deep nesting with errors at various levels
testParsesSafely('Error at depth 5 in if nesting',
  'if (1) {\nif (2) {\nif (3) {\nif (4) {\nif (@) {\n}\n}\n}\n}\n}');

testParsesSafely('Error at depth 3 in for nesting',
  'for (let i = 0; i < 10; i = i + 1) {\nfor (let j = 0; j < 5; j = j + 1) {\nfor (@ k = 0; k < 3; k = k + 1) {\n}\n}\n}');

// Nested with multiple statement types
testParsesSafely('Deep mixed statements', `
  fn outer() {
    if (a) {
      for (let i = 0; i < 10; i = i + 1) {
        try {
          while (x) {
            switch (y) {
              case 1:
                if (b) {
                  return 1
                }
            }
          }
        } catch (e) {
          print(e)
        }
      }
    }
  }
`);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
