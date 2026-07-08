import mysql, { Pool } from 'mysql2/promise';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

interface DbCredentials { username: string; password: string; host: string; port: number; dbname: string; }

let pool: Pool | null = null;

async function getCredentials(): Promise<DbCredentials> {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) throw new Error('DB_SECRET_ARN no esta definida');
  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await secretsClient.send(command);
  if (!response.SecretString) throw new Error('El secreto no contiene valor string');
  return JSON.parse(response.SecretString) as DbCredentials;
}

export async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const credentials = await getCredentials();
  pool = mysql.createPool({
    host: credentials.host,
    port: credentials.port || 3306,
    user: credentials.username,
    password: credentials.password,
    database: credentials.dbname || process.env.DB_NAME || 'persons_db',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
  await pool.execute(`CREATE TABLE IF NOT EXISTS persons (id INT AUTO_INCREMENT PRIMARY KEY, first_name VARCHAR(100) NOT NULL, last_name VARCHAR(100) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, document_type ENUM('DNI', 'CE') NOT NULL, document_number VARCHAR(20) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
  return pool;
}
