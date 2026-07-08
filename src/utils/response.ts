export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export function success(data: unknown, statusCode = 200): ApiResponse {
  return { statusCode, headers: DEFAULT_HEADERS, body: JSON.stringify(data) };
}
export function created(data: unknown): ApiResponse { return success(data, 201); }
export function noContent(): ApiResponse { return { statusCode: 204, headers: DEFAULT_HEADERS, body: '' }; }
export function badRequest(message: string): ApiResponse {
  return { statusCode: 400, headers: DEFAULT_HEADERS, body: JSON.stringify({ error: 'Bad Request', message }) };
}
export function notFound(message = 'Recurso no encontrado'): ApiResponse {
  return { statusCode: 404, headers: DEFAULT_HEADERS, body: JSON.stringify({ error: 'Not Found', message }) };
}
export function internalError(message = 'Error interno del servidor'): ApiResponse {
  return { statusCode: 500, headers: DEFAULT_HEADERS, body: JSON.stringify({ error: 'Internal Server Error', message }) };
}
