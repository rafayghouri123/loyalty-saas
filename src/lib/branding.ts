const FALLBACK_ACCENT = '#166534';

export function cardColors(input: string) {
  const background = /^#[a-f\d]{6}$/iu.test(input) ? input : FALLBACK_ACCENT;
  const channels = [1, 3, 5].map(offset => {
    const value = Number.parseInt(background.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return { background, color: blackContrast >= whiteContrast ? '#000000' : '#ffffff', contrast: Math.max(blackContrast, whiteContrast) };
}

export function cardProgress(balance: number, cost: number) {
  if (!Number.isSafeInteger(balance) || !Number.isInteger(cost) || cost < 1 || cost > 1_000_000) {
    throw new Error('Invalid card balance or reward cost.');
  }
  return { visibleUnits: Math.min(cost, Math.max(0, balance)), cost, balance };
}
