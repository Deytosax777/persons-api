import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../../src/db/connection', () => ({
  getPool: jest.fn(),
}));

const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockS3Send,
  })),
  PutObjectCommand: jest.fn(),
}));

import { getPool } from '../../src/db/connection';
import { handler } from '../../src/handlers/uploadFile';

const mockExecute = jest.fn();
const mockPool = { execute: mockExecute };

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue(mockPool);
  process.env.FILES_BUCKET_NAME = 'test-bucket';
  process.env.AWS_REGION = 'us-east-2';
});

function buildEvent(personId: string, body: string | null = 'archivo'): APIGatewayProxyEvent {
  return {
    body,
    pathParameters: { personId },
    queryStringParameters: null,
    headers: { 'content-type': 'text/plain', 'x-file-name': 'test.txt' },
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: `/persons/${personId}/files`,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as never,
    resource: '',
  };
}

describe('POST /persons/{personId}/files - uploadFile handler', () => {
  it('debe subir el archivo y retornar 201', async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 1 }]]);
    mockS3Send.mockResolvedValueOnce({});

    const result = await handler(buildEvent('1'));

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Archivo subido exitosamente');
    expect(body.person_id).toBe(1);
    expect(body.s3_key).toBe('persons/1/test.txt');
  });

  it('debe retornar 400 si personId no es número', async () => {
    const result = await handler(buildEvent('abc'));
    expect(result.statusCode).toBe(400);
  });

  it('debe retornar 400 si falta el body', async () => {
    const result = await handler(buildEvent('1', null));
    expect(result.statusCode).toBe(400);
  });

  it('debe retornar 404 si la persona no existe', async () => {
    mockExecute.mockResolvedValueOnce([[]]);

    const result = await handler(buildEvent('99'));
    expect(result.statusCode).toBe(404);
  });

  it('debe retornar 500 si S3 falla', async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 1 }]]);
    mockS3Send.mockRejectedValueOnce(new Error('S3 error'));

    const result = await handler(buildEvent('1'));
    expect(result.statusCode).toBe(500);
  });
});
