@echo off
echo Creando estructura del proyecto persons-api...

:: Crear carpetas
mkdir src\models
mkdir src\utils
mkdir src\db
mkdir src\handlers
mkdir tests\handlers

:: ============================================================
:: tsconfig.json
:: ============================================================
(
echo {
echo   "compilerOptions": {
echo     "target": "ES2020",
echo     "module": "commonjs",
echo     "lib": ["ES2020"],
echo     "outDir": "./dist",
echo     "rootDir": "./src",
echo     "strict": true,
echo     "esModuleInterop": true,
echo     "skipLibCheck": true,
echo     "forceConsistentCasingInFileNames": true,
echo     "resolveJsonModule": true,
echo     "declaration": true,
echo     "declarationMap": true,
echo     "sourceMap": true
echo   },
echo   "include": ["src/**/*"],
echo   "exclude": ["node_modules", "dist", "infra", "tests"]
echo }
) > tsconfig.json

:: ============================================================
:: jest.config.ts
:: ============================================================
(
echo import type { Config } from 'jest';
echo.
echo const config: Config = {
echo   preset: 'ts-jest',
echo   testEnvironment: 'node',
echo   roots: ['^<rootDir^>/tests'],
echo   testMatch: ['**/*.test.ts'],
echo   transform: {
echo     '^.+\\.tsx?$': ['ts-jest', {
echo       tsconfig: {
echo         rootDir: '.',
echo         strict: true,
echo         esModuleInterop: true,
echo         skipLibCheck: true,
echo       },
echo     }],
echo   },
echo   collectCoverageFrom: [
echo     'src/**/*.ts',
echo     '!src/**/*.d.ts',
echo   ],
echo   coverageDirectory: 'coverage',
echo   verbose: true,
echo };
echo.
echo export default config;
) > jest.config.ts

:: ============================================================
:: src/models/person.ts
:: ============================================================
(
echo export type DocumentType = 'DNI' ^| 'CE';
echo.
echo export interface Person {
echo   id: number;
echo   first_name: string;
echo   last_name: string;
echo   email: string;
echo   document_type: DocumentType;
echo   document_number: string;
echo   created_at?: Date;
echo   updated_at?: Date;
echo }
echo.
echo export interface CreatePersonDto {
echo   first_name: string;
echo   last_name: string;
echo   email: string;
echo   document_type: DocumentType;
echo   document_number: string;
echo }
echo.
echo export interface UpdatePersonDto {
echo   email: string;
echo }
echo.
echo export function validateCreatePerson^(data: unknown^): CreatePersonDto {
echo   const body = data as Record^<string, unknown^>;
echo   if ^(!body.first_name ^|^| typeof body.first_name !== 'string'^) throw new Error^('first_name es requerido y debe ser string'^);
echo   if ^(!body.last_name ^|^| typeof body.last_name !== 'string'^) throw new Error^('last_name es requerido y debe ser string'^);
echo   if ^(!body.email ^|^| typeof body.email !== 'string'^) throw new Error^('email es requerido y debe ser string'^);
echo   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
echo   if ^(!emailRegex.test^(body.email as string^)^) throw new Error^('email no tiene formato valido'^);
echo   if ^(!body.document_type ^|^| !['DNI', 'CE'].includes^(body.document_type as string^)^) throw new Error^('document_type debe ser DNI o CE'^);
echo   if ^(!body.document_number ^|^| typeof body.document_number !== 'string'^) throw new Error^('document_number es requerido y debe ser string'^);
echo   return {
echo     first_name: body.first_name as string,
echo     last_name: body.last_name as string,
echo     email: body.email as string,
echo     document_type: body.document_type as DocumentType,
echo     document_number: body.document_number as string,
echo   };
echo }
echo.
echo export function validateUpdatePerson^(data: unknown^): UpdatePersonDto {
echo   const body = data as Record^<string, unknown^>;
echo   if ^(!body.email ^|^| typeof body.email !== 'string'^) throw new Error^('email es requerido y debe ser string'^);
echo   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
echo   if ^(!emailRegex.test^(body.email as string^)^) throw new Error^('email no tiene formato valido'^);
echo   return { email: body.email as string };
echo }
) > src\models\person.ts

:: ============================================================
:: src/utils/response.ts
:: ============================================================
(
echo export interface ApiResponse {
echo   statusCode: number;
echo   headers: Record^<string, string^>;
echo   body: string;
echo }
echo.
echo const DEFAULT_HEADERS = {
echo   'Content-Type': 'application/json',
echo   'Access-Control-Allow-Origin': '*',
echo };
echo.
echo export function success^(data: unknown, statusCode = 200^): ApiResponse {
echo   return { statusCode, headers: DEFAULT_HEADERS, body: JSON.stringify^(data^) };
echo }
echo export function created^(data: unknown^): ApiResponse { return success^(data, 201^); }
echo export function noContent^(^): ApiResponse { return { statusCode: 204, headers: DEFAULT_HEADERS, body: '' }; }
echo export function badRequest^(message: string^): ApiResponse {
echo   return { statusCode: 400, headers: DEFAULT_HEADERS, body: JSON.stringify^({ error: 'Bad Request', message }^) };
echo }
echo export function notFound^(message = 'Recurso no encontrado'^): ApiResponse {
echo   return { statusCode: 404, headers: DEFAULT_HEADERS, body: JSON.stringify^({ error: 'Not Found', message }^) };
echo }
echo export function internalError^(message = 'Error interno del servidor'^): ApiResponse {
echo   return { statusCode: 500, headers: DEFAULT_HEADERS, body: JSON.stringify^({ error: 'Internal Server Error', message }^) };
echo }
) > src\utils\response.ts

:: ============================================================
:: src/db/connection.ts
:: ============================================================
(
echo import mysql, { Pool } from 'mysql2/promise';
echo import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
echo.
echo const secretsClient = new SecretsManagerClient^({ region: process.env.AWS_REGION ^|^| 'us-east-2' }^);
echo.
echo interface DbCredentials { username: string; password: string; host: string; port: number; dbname: string; }
echo.
echo let pool: Pool ^| null = null;
echo.
echo async function getCredentials^(^): Promise^<DbCredentials^> {
echo   const secretArn = process.env.DB_SECRET_ARN;
echo   if ^(!secretArn^) throw new Error^('DB_SECRET_ARN no esta definida'^);
echo   const command = new GetSecretValueCommand^({ SecretId: secretArn }^);
echo   const response = await secretsClient.send^(command^);
echo   if ^(!response.SecretString^) throw new Error^('El secreto no contiene valor string'^);
echo   return JSON.parse^(response.SecretString^) as DbCredentials;
echo }
echo.
echo export async function getPool^(^): Promise^<Pool^> {
echo   if ^(pool^) return pool;
echo   const credentials = await getCredentials^(^);
echo   pool = mysql.createPool^({
echo     host: credentials.host,
echo     port: credentials.port ^|^| 3306,
echo     user: credentials.username,
echo     password: credentials.password,
echo     database: credentials.dbname ^|^| process.env.DB_NAME ^|^| 'persons_db',
echo     waitForConnections: true,
echo     connectionLimit: 5,
echo     queueLimit: 0,
echo   }^);
echo   await pool.execute^(`CREATE TABLE IF NOT EXISTS persons ^(id INT AUTO_INCREMENT PRIMARY KEY, first_name VARCHAR^(100^) NOT NULL, last_name VARCHAR^(100^) NOT NULL, email VARCHAR^(255^) NOT NULL UNIQUE, document_type ENUM^('DNI', 'CE'^) NOT NULL, document_number VARCHAR^(20^) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP^)`^);
echo   return pool;
echo }
) > src\db\connection.ts

:: ============================================================
:: src/handlers/createPerson.ts
:: ============================================================
(
echo import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
echo import { getPool } from '../db/connection';
echo import { validateCreatePerson } from '../models/person';
echo import { created, badRequest, internalError } from '../utils/response';
echo.
echo export const handler = async ^(event: APIGatewayProxyEvent^): Promise^<APIGatewayProxyResult^> =^> {
echo   console.log^('POST /persons', JSON.stringify^(event^)^);
echo   try {
echo     if ^(!event.body^) return badRequest^('El cuerpo de la solicitud es requerido'^);
echo     const dto = validateCreatePerson^(JSON.parse^(event.body^)^);
echo     const pool = await getPool^(^);
echo     const [result] = await pool.execute^(
echo       'INSERT INTO persons ^(first_name, last_name, email, document_type, document_number^) VALUES ^(?, ?, ?, ?, ?^)',
echo       [dto.first_name, dto.last_name, dto.email, dto.document_type, dto.document_number]
echo     ^);
echo     const insertResult = result as { insertId: number };
echo     const [rows] = await pool.execute^('SELECT * FROM persons WHERE id = ?', [insertResult.insertId]^);
echo     return created^(^(rows as unknown[]^)[0]^);
echo   } catch ^(error^) {
echo     const err = error as Error;
echo     console.error^('Error POST /persons:', err.message^);
echo     if ^(err.message.includes^('Duplicate entry'^)^) return badRequest^('El email o documento ya esta registrado'^);
echo     if ^(err.message.includes^('requerido'^) ^|^| err.message.includes^('valido'^) ^|^| err.message.includes^('debe ser'^)^) return badRequest^(err.message^);
echo     return internalError^(err.message^);
echo   }
echo };
) > src\handlers\createPerson.ts

:: ============================================================
:: src/handlers/listPersons.ts
:: ============================================================
(
echo import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
echo import { getPool } from '../db/connection';
echo import { success, internalError } from '../utils/response';
echo.
echo export const handler = async ^(event: APIGatewayProxyEvent^): Promise^<APIGatewayProxyResult^> =^> {
echo   console.log^('GET /persons', JSON.stringify^(event^)^);
echo   try {
echo     const pool = await getPool^(^);
echo     const [rows] = await pool.execute^('SELECT id, first_name, last_name, email, document_type, document_number, created_at, updated_at FROM persons ORDER BY created_at DESC'^);
echo     const persons = rows as unknown[];
echo     return success^({ persons, total: persons.length }^);
echo   } catch ^(error^) {
echo     const err = error as Error;
echo     console.error^('Error GET /persons:', err.message^);
echo     return internalError^(err.message^);
echo   }
echo };
) > src\handlers\listPersons.ts

:: ============================================================
:: src/handlers/updatePerson.ts
:: ============================================================
(
echo import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
echo import { getPool } from '../db/connection';
echo import { validateUpdatePerson } from '../models/person';
echo import { success, badRequest, notFound, internalError } from '../utils/response';
echo.
echo export const handler = async ^(event: APIGatewayProxyEvent^): Promise^<APIGatewayProxyResult^> =^> {
echo   console.log^('PUT /persons/{personId}', JSON.stringify^(event^)^);
echo   try {
echo     const personId = event.pathParameters?.personId;
echo     if ^(!personId ^|^| isNaN^(Number^(personId^)^)^) return badRequest^('personId debe ser un numero valido'^);
echo     if ^(!event.body^) return badRequest^('El cuerpo de la solicitud es requerido'^);
echo     const dto = validateUpdatePerson^(JSON.parse^(event.body^)^);
echo     const pool = await getPool^(^);
echo     const [existing] = await pool.execute^('SELECT id FROM persons WHERE id = ?', [Number^(personId^)]^);
echo     if ^(^(existing as unknown[]^).length === 0^) return notFound^(`Persona con id ${personId} no encontrada`^);
echo     await pool.execute^('UPDATE persons SET email = ? WHERE id = ?', [dto.email, Number^(personId^)]^);
echo     const [updated] = await pool.execute^('SELECT * FROM persons WHERE id = ?', [Number^(personId^)]^);
echo     return success^(^(updated as unknown[]^)[0]^);
echo   } catch ^(error^) {
echo     const err = error as Error;
echo     console.error^('Error PUT /persons:', err.message^);
echo     if ^(err.message.includes^('Duplicate entry'^)^) return badRequest^('El email ya esta registrado por otro usuario'^);
echo     if ^(err.message.includes^('requerido'^) ^|^| err.message.includes^('valido'^) ^|^| err.message.includes^('debe ser'^)^) return badRequest^(err.message^);
echo     return internalError^(err.message^);
echo   }
echo };
) > src\handlers\updatePerson.ts

:: ============================================================
:: src/handlers/deletePerson.ts
:: ============================================================
(
echo import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
echo import { getPool } from '../db/connection';
echo import { noContent, badRequest, notFound, internalError } from '../utils/response';
echo.
echo export const handler = async ^(event: APIGatewayProxyEvent^): Promise^<APIGatewayProxyResult^> =^> {
echo   console.log^('DELETE /persons/{personId}', JSON.stringify^(event^)^);
echo   try {
echo     const personId = event.pathParameters?.personId;
echo     if ^(!personId ^|^| isNaN^(Number^(personId^)^)^) return badRequest^('personId debe ser un numero valido'^);
echo     const pool = await getPool^(^);
echo     const [existing] = await pool.execute^('SELECT id FROM persons WHERE id = ?', [Number^(personId^)]^);
echo     if ^(^(existing as unknown[]^).length === 0^) return notFound^(`Persona con id ${personId} no encontrada`^);
echo     await pool.execute^('DELETE FROM persons WHERE id = ?', [Number^(personId^)]^);
echo     return noContent^(^);
echo   } catch ^(error^) {
echo     const err = error as Error;
echo     console.error^('Error DELETE /persons:', err.message^);
echo     return internalError^(err.message^);
echo   }
echo };
) > src\handlers\deletePerson.ts

:: ============================================================
:: tests/handlers/createPerson.test.ts
:: ============================================================
(
echo import { APIGatewayProxyEvent } from 'aws-lambda';
echo jest.mock^('../../src/db/connection', ^(^) =^> ^({ getPool: jest.fn^(^) }^)^);
echo import { getPool } from '../../src/db/connection';
echo import { handler } from '../../src/handlers/createPerson';
echo.
echo const mockExecute = jest.fn^(^);
echo const mockPool = { execute: mockExecute };
echo beforeEach^(^(^) =^> { jest.clearAllMocks^(^); ^(getPool as jest.Mock^).mockResolvedValue^(mockPool^); }^);
echo.
echo function buildEvent^(body: unknown^): APIGatewayProxyEvent {
echo   return { body: JSON.stringify^(body^), pathParameters: null, queryStringParameters: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST', isBase64Encoded: false, path: '/persons', multiValueQueryStringParameters: null, stageVariables: null, requestContext: {} as never, resource: '' };
echo }
echo.
echo describe^('POST /persons', ^(^) =^> {
echo   const validBody = { first_name: 'Juan', last_name: 'Perez', email: 'juan@example.com', document_type: 'DNI', document_number: '12345678' };
echo.
echo   it^('debe crear una persona y retornar 201', async ^(^) =^> {
echo     mockExecute.mockResolvedValueOnce^([{ insertId: 1 }]^).mockResolvedValueOnce^([[{ id: 1, ...validBody }]]^);
echo     const result = await handler^(buildEvent^(validBody^)^);
echo     expect^(result.statusCode^).toBe^(201^);
echo   }^);
echo.
echo   it^('debe retornar 400 si falta el body', async ^(^) =^> {
echo     const event = buildEvent^(null^); event.body = null;
echo     const result = await handler^(event^);
echo     expect^(result.statusCode^).toBe^(400^);
echo   }^);
echo.
echo   it^('debe retornar 400 si el email es invalido', async ^(^) =^> {
echo     const result = await handler^(buildEvent^({ ...validBody, email: 'no-es-email' }^)^);
echo     expect^(result.statusCode^).toBe^(400^);
echo   }^);
echo.
echo   it^('debe retornar 400 si document_type es invalido', async ^(^) =^> {
echo     const result = await handler^(buildEvent^({ ...validBody, document_type: 'PASAPORTE' }^)^);
echo     expect^(result.statusCode^).toBe^(400^);
echo   }^);
echo.
echo   it^('debe retornar 400 en duplicate entry', async ^(^) =^> {
echo     mockExecute.mockRejectedValueOnce^(new Error^("Duplicate entry 'juan@example.com' for key 'email'"^)^);
echo     const result = await handler^(buildEvent^(validBody^)^);
echo     expect^(result.statusCode^).toBe^(400^);
echo   }^);
echo }^);
) > tests\handlers\createPerson.test.ts

:: ============================================================
:: tests/handlers/listPersons.test.ts
:: ============================================================
(
echo import { APIGatewayProxyEvent } from 'aws-lambda';
echo jest.mock^('../../src/db/connection', ^(^) =^> ^({ getPool: jest.fn^(^) }^)^);
echo import { getPool } from '../../src/db/connection';
echo import { handler } from '../../src/handlers/listPersons';
echo.
echo const mockExecute = jest.fn^(^);
echo const mockPool = { execute: mockExecute };
echo beforeEach^(^(^) =^> { jest.clearAllMocks^(^); ^(getPool as jest.Mock^).mockResolvedValue^(mockPool^); }^);
echo.
echo function buildEvent^(^): APIGatewayProxyEvent {
echo   return { body: null, pathParameters: null, queryStringParameters: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET', isBase64Encoded: false, path: '/persons', multiValueQueryStringParameters: null, stageVariables: null, requestContext: {} as never, resource: '' };
echo }
echo.
echo describe^('GET /persons', ^(^) =^> {
echo   it^('debe retornar 200 con lista de personas', async ^(^) =^> {
echo     mockExecute.mockResolvedValueOnce^([[{ id: 1, first_name: 'Juan' }, { id: 2, first_name: 'Ana' }]]^);
echo     const result = await handler^(buildEvent^(^)^);
echo     expect^(result.statusCode^).toBe^(200^);
echo     expect^(JSON.parse^(result.body^).total^).toBe^(2^);
echo   }^);
echo.
echo   it^('debe retornar lista vacia si no hay personas', async ^(^) =^> {
echo     mockExecute.mockResolvedValueOnce^([[]]^);
echo     const result = await handler^(buildEvent^(^)^);
echo     expect^(result.statusCode^).toBe^(200^);
echo     expect^(JSON.parse^(result.body^).total^).toBe^(0^);
echo   }^);
echo.
echo   it^('debe retornar 500 si la BD falla', async ^(^) =^> {
echo     mockExecute.mockRejectedValueOnce^(new Error^('Connection refused'^)^);
echo     const result = await handler^(buildEvent^(^)^);
echo     expect^(result.statusCode^).toBe^(500^);
echo   }^);
echo }^);
) > tests\handlers\listPersons.test.ts

echo.
echo ============================================================
echo  Todos los archivos creados exitosamente!
echo ============================================================
echo.
echo Ahora actualiza el package.json con los scripts:
echo   "build": "esbuild src/handlers/*.ts --bundle --platform=node --target=node18 --outdir=dist --external:@aws-sdk/*",
echo   "test": "jest",
echo   "test:coverage": "jest --coverage",
echo   "type-check": "tsc --noEmit"
echo.
pause
