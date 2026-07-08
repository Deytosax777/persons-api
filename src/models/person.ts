export type DocumentType = 'DNI' | 'CE';

export interface Person {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  document_type: DocumentType;
  document_number: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreatePersonDto {
  first_name: string;
  last_name: string;
  email: string;
  document_type: DocumentType;
  document_number: string;
}

export interface UpdatePersonDto {
  email: string;
}

export function validateCreatePerson(data: unknown): CreatePersonDto {
  const body = data as Record<string, unknown>;
  if (!body.first_name || typeof body.first_name !== 'string') throw new Error('first_name es requerido y debe ser string');
  if (!body.last_name || typeof body.last_name !== 'string') throw new Error('last_name es requerido y debe ser string');
  if (!body.email || typeof body.email !== 'string') throw new Error('email es requerido y debe ser string');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email as string)) throw new Error('email no tiene formato valido');
  if (!body.document_type || !['DNI', 'CE'].includes(body.document_type as string)) throw new Error('document_type debe ser DNI o CE');
  if (!body.document_number || typeof body.document_number !== 'string') throw new Error('document_number es requerido y debe ser string');
  return {
    first_name: body.first_name as string,
    last_name: body.last_name as string,
    email: body.email as string,
    document_type: body.document_type as DocumentType,
    document_number: body.document_number as string,
  };
}

export function validateUpdatePerson(data: unknown): UpdatePersonDto {
  const body = data as Record<string, unknown>;
  if (!body.email || typeof body.email !== 'string') throw new Error('email es requerido y debe ser string');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email as string)) throw new Error('email no tiene formato valido');
  return { email: body.email as string };
}
