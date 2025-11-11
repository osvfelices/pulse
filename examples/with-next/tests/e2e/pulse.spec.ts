import { test, expect } from '@playwright/test';

test.describe('Pulse Determinism Demo', () => {
  test('should load the pulse page', async ({ page }) => {
    await page.goto('/pulse');
    await expect(page.locator('h1')).toContainText('Pulse 1.0.0 Determinism Demo');
  });

  test('buffered flow should produce deterministic results', async ({ page }) => {
    await page.goto('/pulse');
    
    // Click buffered test button
    await page.click('#test-buffered');
    
    // Wait for result to appear
    await page.waitForSelector('#result-buffered', { timeout: 10000 });
    
    // Get first hash
    const result1 = await page.locator('#result-buffered pre').textContent();
    expect(result1).toContain('Mismatches: 0');
    const hash1Match = result1?.match(/Hash: ([a-f0-9]{64})/);
    expect(hash1Match).toBeTruthy();
    const hash1 = hash1Match?.[1];
    
    // Click again
    await page.click('#test-buffered');
    await page.waitForTimeout(1000);
    
    // Get second hash
    const result2 = await page.locator('#result-buffered pre').textContent();
    const hash2Match = result2?.match(/Hash: ([a-f0-9]{64})/);
    const hash2 = hash2Match?.[1];
    
    // Hashes should be identical
    expect(hash1).toBe(hash2);
    
    // Should show green checkmark
    await expect(page.locator('#result-buffered').locator('text=✅ Hash is stable across runs')).toBeVisible();
  });

  test('unbuffered flow should produce deterministic results', async ({ page }) => {
    await page.goto('/pulse');
    
    // Click unbuffered test button
    await page.click('#test-unbuffered');
    
    // Wait for result
    await page.waitForSelector('#result-unbuffered', { timeout: 10000 });
    
    // Get first hash
    const result1 = await page.locator('#result-unbuffered pre').textContent();
    expect(result1).toContain('Mismatches: 0');
    const hash1Match = result1?.match(/Hash: ([a-f0-9]{64})/);
    const hash1 = hash1Match?.[1];
    
    // Click again
    await page.click('#test-unbuffered');
    await page.waitForTimeout(1000);
    
    // Get second hash
    const result2 = await page.locator('#result-unbuffered pre').textContent();
    const hash2Match = result2?.match(/Hash: ([a-f0-9]{64})/);
    const hash2 = hash2Match?.[1];
    
    // Hashes should be identical
    expect(hash1).toBe(hash2);
    
    // Should show green checkmark
    await expect(page.locator('#result-unbuffered').locator('text=✅ Hash is stable across runs')).toBeVisible();
  });

  test('select flow should produce deterministic results', async ({ page }) => {
    await page.goto('/pulse');
    
    // Click select test button
    await page.click('#test-select');
    
    // Wait for result
    await page.waitForSelector('#result-select', { timeout: 10000 });
    
    // Get first hash
    const result1 = await page.locator('#result-select pre').textContent();
    expect(result1).toContain('Mismatches: 0');
    expect(result1).toContain('select1-case0-from-ch1');
    const hash1Match = result1?.match(/Hash: ([a-f0-9]{64})/);
    const hash1 = hash1Match?.[1];
    
    // Click again
    await page.click('#test-select');
    await page.waitForTimeout(1000);
    
    // Get second hash
    const result2 = await page.locator('#result-select pre').textContent();
    const hash2Match = result2?.match(/Hash: ([a-f0-9]{64})/);
    const hash2 = hash2Match?.[1];
    
    // Hashes should be identical
    expect(hash1).toBe(hash2);
    
    // Should show green checkmark
    await expect(page.locator('#result-select').locator('text=✅ Hash is stable across runs')).toBeVisible();
  });

  test('all three flows should work in sequence', async ({ page }) => {
    await page.goto('/pulse');
    
    // Test all 3 flows in sequence
    const flows = ['buffered', 'unbuffered', 'select'];
    
    for (const flow of flows) {
      await page.click(`#test-${flow}`);
      await page.waitForSelector(`#result-${flow}`, { timeout: 10000 });
      
      const result = await page.locator(`#result-${flow} pre`).textContent();
      expect(result).toContain('Mismatches: 0');
      expect(result).toMatch(/Hash: [a-f0-9]{64}/);
    }
  });
});
