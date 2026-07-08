import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../db/connection';
import { success, internalError } from '../utils/response';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('GET /persons', JSON.stringify(event));
  try {
    const pool = await getPool();
    const [rows] = await pool.execute('SELECT id, first_name, last_name, email, document_type, document_number, created_at, updated_at FROM persons ORDER BY created_at DESC');
    const persons = rows as unknown[];
    return success({ persons, total: persons.length });
  } catch (error) {
    const err = error as Error;
    console.error('Error GET /persons:', err.message);
    return internalError(err.message);
  }
};
