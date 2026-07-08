import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../db/connection';
import { validateCreatePerson } from '../models/person';
import { created, badRequest, internalError } from '../utils/response';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('POST /persons', JSON.stringify(event));
  try {
    if (!event.body) return badRequest('El cuerpo de la solicitud es requerido');
    const dto = validateCreatePerson(JSON.parse(event.body));
    const pool = await getPool();
    const [result] = await pool.execute(
      'INSERT INTO persons (first_name, last_name, email, document_type, document_number) VALUES (?, ?, ?, ?, ?)',
      [dto.first_name, dto.last_name, dto.email, dto.document_type, dto.document_number]
    );
    const insertResult = result as { insertId: number };
    const [rows] = await pool.execute('SELECT * FROM persons WHERE id = ?', [insertResult.insertId]);
    return created((rows as unknown[])[0]);
  } catch (error) {
    const err = error as Error;
    console.error('Error POST /persons:', err.message);
    if (err.message.includes('Duplicate entry')) return badRequest('El email o documento ya esta registrado');
    if (err.message.includes('requerido') || err.message.includes('valido') || err.message.includes('debe ser')) return badRequest(err.message);
    return internalError(err.message);
  }
};
