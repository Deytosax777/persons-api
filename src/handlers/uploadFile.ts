import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getPool } from '../db/connection';
import { badRequest, created, notFound, internalError } from '../utils/response';

// Cliente S3 reutilizado entre invocaciones Lambda (warm start)
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('POST /persons/{personId}/files - event:', JSON.stringify(event));

  try {
    const personId = event.pathParameters?.personId;
    if (!personId || isNaN(Number(personId))) {
      return badRequest('personId debe ser un número válido');
    }

    if (!event.body) {
      return badRequest('El cuerpo de la solicitud es requerido');
    }

    // Verificar que la persona existe antes de subir el archivo
    const pool = await getPool();
    const [existing] = await pool.execute('SELECT id FROM persons WHERE id = ?', [Number(personId)]);
    if ((existing as unknown[]).length === 0) {
      return notFound(`Persona con id ${personId} no encontrada`);
    }

    const bucketName = process.env.FILES_BUCKET_NAME;
    if (!bucketName) {
      throw new Error('FILES_BUCKET_NAME no está definida en las variables de entorno');
    }

    // El body viene en base64 cuando isBase64Encoded es true
    // El cliente debe enviar el archivo en base64 con el content-type en headers
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || 'application/octet-stream';
    const fileContent = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body);

    // Extraer nombre del archivo del header o generar uno con timestamp
    const fileName = event.headers['x-file-name'] || `file-${Date.now()}`;

    // Clave en S3: persons/{personId}/{fileName}
    // Organizamos por persona para facilitar búsqueda y políticas de acceso
    const s3Key = `persons/${personId}/${fileName}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType,
      // Metadata útil para auditoría
      Metadata: {
        'person-id': personId,
        'uploaded-at': new Date().toISOString(),
      },
    }));

    console.log(`Archivo subido: s3://${bucketName}/${s3Key}`);

    return created({
      message: 'Archivo subido exitosamente',
      person_id: Number(personId),
      file_name: fileName,
      s3_key: s3Key,
      content_type: contentType,
    });

  } catch (error) {
    const err = error as Error;
    console.error('Error en POST /persons/{personId}/files:', err.message);

    if (err.message.includes('requerido') || err.message.includes('válido')) {
      return badRequest(err.message);
    }

    return internalError(err.message);
  }
};
