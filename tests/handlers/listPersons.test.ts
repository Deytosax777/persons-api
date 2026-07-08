import { APIGatewayProxyEvent } from 'aws-lambda';
jest.mock('../../src/db/connection', () => ({ getPool: jest.fn() }));
import { getPool } from '../../src/db/connection';
import { handler } from '../../src/handlers/listPersons';

const mockExecute = jest.fn();
const mockPool = { execute: mockExecute };
beforeEach(() => { jest.clearAllMocks(); (getPool as jest.Mock).mockResolvedValue(mockPool); });

function buildEvent(): APIGatewayProxyEvent {
  return { body: null, pathParameters: null, queryStringParameters: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET', isBase64Encoded: false, path: '/persons', multiValueQueryStringParameters: null, stageVariables: null, requestContext: {} as never, resource: '' };
}

describe('GET /persons', () => {
  it('debe retornar 200 con lista de personas', async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 1, first_name: 'Juan' }, { id: 2, first_name: 'Ana' }]]);
    const result = await handler(buildEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).total).toBe(2);
  });

  it('debe retornar lista vacia si no hay personas', async () => {
    mockExecute.mockResolvedValueOnce([[]]);
    const result = await handler(buildEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).total).toBe(0);
  });

  it('debe retornar 500 si la BD falla', async () => {
    mockExecute.mockRejectedValueOnce(new Error('Connection refused'));
    const result = await handler(buildEvent());
    expect(result.statusCode).toBe(500);
  });
});
