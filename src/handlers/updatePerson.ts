import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../db/connection';
import { validateUpdatePerson } from '../models/person';
import { success, badRequest, notFound, internalError } from '../utils/response';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('PUT /persons/{personId}', JSON.stringify(event));
  try {
    const personId = event.pathParameters?.personId;
    if (!personId || isNaN(Number(personId))) return badRequest('personId debe ser un numero valido');
    if (!event.body) return badRequest('El cuerpo de la solicitud es requerido');
    const dto = validateUpdatePerson(JSON.parse(event.body));
    const pool = await getPool();
    const [existing] = await pool.execute('SELECT id FROM persons WHERE id = ?', [Number(personId)]);
    if ((existing as unknown[]).length === 0) return notFound(`Persona con id ${personId} no encontrada`);
    await pool.execute('UPDATE persons SET email = ? WHERE id = ?', [dto.email, Number(personId)]);
    const [updated] = await pool.execute('SELECT * FROM persons WHERE id = ?', [Number(personId)]);
    return success((updated as unknown[])[0]);
  } catch (error) {
    const err = error as Error;
    console.error('Error PUT /persons:', err.message);
    if (err.message.includes('Duplicate entry')) return badRequest('El email ya esta registrado por otro usuario');
    if (err.message.includes('requerido') || err.message.includes('valido') || err.message.includes('debe ser')) return badRequest(err.message);
    return internalError(err.message);
  }
};
