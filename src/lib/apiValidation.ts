/**
 * API 输入验证工具
 * 提供轻量级的输入验证函数，不依赖外部库
 */

/**
 * 验证结果
 */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * 验证函数类型
 */
type Validator<T> = (input: unknown) => ValidationResult<T>;

/**
 * 验证 body 是否为合法对象
 */
export function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/**
 * 字符串验证器
 */
export function validateString(
  input: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number; allowEmpty?: boolean } = {}
): ValidationResult<string> {
  const { minLength = 0, maxLength = Infinity, allowEmpty = false } = options;

  if (typeof input !== 'string') {
    return { ok: false, error: `${fieldName} must be a string` };
  }

  if (!allowEmpty && input.trim().length === 0) {
    return { ok: false, error: `${fieldName} cannot be empty` };
  }

  if (input.length < minLength) {
    return { ok: false, error: `${fieldName} must be at least ${minLength} characters` };
  }

  if (input.length > maxLength) {
    return { ok: false, error: `${fieldName} must be at most ${maxLength} characters` };
  }

  return { ok: true, value: input };
}

/**
 * 数字验证器
 */
export function validateNumber(
  input: unknown,
  fieldName: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): ValidationResult<number> {
  const { min = -Infinity, max = Infinity, integer = false } = options;

  if (typeof input !== 'number' || Number.isNaN(input)) {
    return { ok: false, error: `${fieldName} must be a valid number` };
  }

  if (integer && !Number.isInteger(input)) {
    return { ok: false, error: `${fieldName} must be an integer` };
  }

  if (input < min) {
    return { ok: false, error: `${fieldName} must be >= ${min}` };
  }

  if (input > max) {
    return { ok: false, error: `${fieldName} must be <= ${max}` };
  }

  return { ok: true, value: input };
}

/**
 * 枚举验证器
 */
export function validateEnum<T extends string>(
  input: unknown,
  fieldName: string,
  allowedValues: readonly T[]
): ValidationResult<T> {
  if (typeof input !== 'string') {
    return { ok: false, error: `${fieldName} must be a string` };
  }

  if (!allowedValues.includes(input as T)) {
    return {
      ok: false,
      error: `${fieldName} must be one of: ${allowedValues.join(', ')}`,
    };
  }

  return { ok: true, value: input as T };
}

/**
 * 数组验证器
 */
export function validateArray<T>(
  input: unknown,
  fieldName: string,
  itemValidator?: Validator<T>,
  options: { minLength?: number; maxLength?: number } = {}
): ValidationResult<T[]> {
  const { minLength = 0, maxLength = Infinity } = options;

  if (!Array.isArray(input)) {
    return { ok: false, error: `${fieldName} must be an array` };
  }

  if (input.length < minLength) {
    return { ok: false, error: `${fieldName} must have at least ${minLength} items` };
  }

  if (input.length > maxLength) {
    return { ok: false, error: `${fieldName} must have at most ${maxLength} items` };
  }

  if (itemValidator) {
    for (let i = 0; i < input.length; i++) {
      const result = itemValidator(input[i]);
      if (!result.ok) {
        return { ok: false, error: `${fieldName}[${i}]: ${result.error}` };
      }
    }
  }

  return { ok: true, value: input as T[] };
}

/**
 * 解析并验证 JSON 请求 body
 */
export async function parseJsonBody<T>(
  request: Request,
  validator: Validator<T>
): Promise<ValidationResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }

  return validator(body);
}

/**
 * 创建标准 JSON 响应
 */
export function jsonResponse<T>(
  data: T,
  init: ResponseInit = {}
): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

/**
 * 错误响应辅助
 */
export function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse({ success: false, error: message }, { status });
}

/**
 * 安全地修剪字符串
 */
export function safeTrim(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim();
}
