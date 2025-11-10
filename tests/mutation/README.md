# Mutation Testing

Mutation testing validates test quality by introducing bugs and verifying tests catch them.

## Current Status

- **Infrastructure**: [PASS] Complete
- **Mutation Score**: 33.33% (Target: ≥85%)
- **Status**: Infrastructure ready, test coverage needs expansion

## Files

- `stryker.config.mjs` - Full Stryker configuration (comprehensive, slow)
- `quick-mutation.js` - Quick mutation tester (18 mutations, fast)
- `run-tests.js` - Test suite for mutation testing (21 tests)
- `reports/` - Mutation testing reports

## Usage

### Quick Mutation Test (Recommended)
```bash
node tests/mutation/quick-mutation.js
```

Fast execution (~30s), tests common mutations.

### Full Stryker Mutation Test
```bash
npx stryker run
```

Comprehensive testing, may take hours. Uses all mutation operators.

## Reaching 85% Target

Current test coverage focuses on happy paths. To reach 85%:

1. **Add Edge Case Tests** - Boundary conditions, empty inputs, null values
2. **Add Error Path Tests** - Invalid syntax, type mismatches, overflow
3. **Add Integration Tests** - Complex expressions, nested structures
4. **Expand Test Suite** - From 21 tests to ~200+ tests

Estimated effort: 8-12 hours

## Reports

- `quick-mutation-report.json` - Quick test results
- `html/` - Stryker HTML reports (when run)

## Mutation Operators Tested

- Arithmetic: `+` ↔ `-`, `*` ↔ `/`
- Comparison: `==` ↔ `!=`, `<` ↔ `>=`, `>` ↔ `<=`
- Logical: `&&` ↔ `||`
- Increment/Decrement: `++` ↔ `--`
- Boolean: `true` ↔ `false`
- Boundaries: `<=` ↔ `<`, `>=` ↔ `>`

## Next Steps

To improve mutation score:
1. Review survived mutations in report
2. Add test cases specifically targeting those mutations
3. Re-run mutation testing
4. Iterate until ≥85% achieved
