import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../db/connection';
import { noContent, badRequest, notFound, internalError } from '../utils/response';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('DELETE /persons/{personId}', JSON.stringify(event));
  try {
    const personId = event.pathParameters?.personId;
    if (!personId || isNaN(Number(personId))) return badRequest('personId debe ser un numero valido');
    const pool = await getPool();
    const [existing] = await pool.execute('SELECT id FROM persons WHERE id = ?', [Number(personId)]);
    if ((existing as unknown[]).length === 0) return notFound(`Persona con id ${personId} no encontrada`);
    await pool.execute('DELETE FROM persons WHERE id = ?', [Number(personId)]);
    return noContent();
  } catch (error) {
    const err = error as Error;
    console.error('Error DELETE /persons:', err.message);
    return internalError(err.message);
  }
};
