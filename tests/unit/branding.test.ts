import { expect, it } from 'vitest';
import { cardColors, cardProgress } from '../../src/lib/branding';

it('keeps normal-size brand text above AA contrast across the RGB range', () => {
  for (let red = 0; red <= 255; red += 17) for (let green = 0; green <= 255; green += 17) for (let blue = 0; blue <= 255; blue += 17) {
    const color = `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('')}`;
    expect(cardColors(color).contrast).toBeGreaterThanOrEqual(4.5);
  }
  expect(cardColors('url(https://untrusted.invalid)')).toEqual(cardColors('#166534'));
});

it('preserves negative and excess balances while bounding only the progress graphic', () => {
  expect(cardProgress(-4, 8)).toEqual({ balance: -4, visibleUnits: 0, cost: 8 });
  expect(cardProgress(20, 8)).toEqual({ balance: 20, visibleUnits: 8, cost: 8 });
  expect(() => cardProgress(6, 0)).toThrow();
  expect(() => cardProgress(Number.MAX_SAFE_INTEGER + 1, 8)).toThrow();
});
