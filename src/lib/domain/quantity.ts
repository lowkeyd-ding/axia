export interface Quantity {
  readonly value: number;
  readonly scale: number;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

export function roundQuantity(value: number, scale = 4): number {
  assertFinite(value, 'value');
  if (!Number.isInteger(scale) || scale < 0) {
    throw new Error('scale must be a non-negative integer');
  }
  const factor = 10 ** scale;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function createQuantity(value: number, scale = 4): Quantity {
  return {
    value: roundQuantity(value, scale),
    scale,
  };
}

export function addQuantity(left: Quantity, right: Quantity): Quantity {
  const scale = Math.max(left.scale, right.scale);
  return createQuantity(left.value + right.value, scale);
}

export function subtractQuantity(left: Quantity, right: Quantity): Quantity {
  const scale = Math.max(left.scale, right.scale);
  return createQuantity(left.value - right.value, scale);
}

export function multiplyQuantity(quantity: Quantity, factor: number, scale = quantity.scale): Quantity {
  assertFinite(factor, 'factor');
  return createQuantity(quantity.value * factor, scale);
}
