import { APIGatewayProxyEvent } from 'aws-lambda';
jest.mock('../../src/db/connection', () => ({ getPool: jest.fn() }));
import { getPool } from '../../src/db/connection';
import { handler } from '../../src/handlers/createPerson';

const mockExecute = jest.fn();
const mockPool = { execute: mockExecute };
beforeEach(() => { jest.clearAllMocks(); (getPool as jest.Mock).mockResolvedValue(mockPool); });

function buildEvent(body: unknown): APIGatewayProxyEvent {
  return { body: JSON.stringify(body), pathParameters: null, queryStringParameters: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST', isBase64Encoded: false, path: '/persons', multiValueQueryStringParameters: null, stageVariables: null, requestContext: {} as never, resource: '' };
}

describe('POST /persons', () => {
  const validBody = { first_name: 'Juan', last_name: 'Perez', email: 'juan@example.com', document_type: 'DNI', document_number: '12345678' };

  it('debe crear una persona y retornar 201', async () => {
    mockExecute.mockResolvedValueOnce([{ insertId: 1 }]).mockResolvedValueOnce([[{ id: 1, ...validBody }]]);
    const result = await handler(buildEvent(validBody));
    expect(result.statusCode).toBe(201);
  });

  it('debe retornar 400 si falta el body', async () => {
    const event = buildEvent(null); event.body = null;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('debe retornar 400 si el email es invalido', async () => {
    const result = await handler(buildEvent({ ...validBody, email: 'no-es-email' }));
    expect(result.statusCode).toBe(400);
  });

  it('debe retornar 400 si document_type es invalido', async () => {
    const result = await handler(buildEvent({ ...validBody, document_type: 'PASAPORTE' }));
    expect(result.statusCode).toBe(400);
  });

  it('debe retornar 400 en duplicate entry', async () => {
    mockExecute.mockRejectedValueOnce(new Error("Duplicate entry 'juan@example.com' for key 'email'"));
    const result = await handler(buildEvent(validBody));
    expect(result.statusCode).toBe(400);
  });
});
