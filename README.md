# Persons API

API REST para gestión de personas desplegada en AWS con Lambda, RDS MySQL y API Gateway V2.

## Arquitectura

![Diagrama de arquitectura](./docs/architecture.png)

### Componentes principales

- **API Gateway V2 (HTTP API)** — expone los endpoints HTTP públicamente
- **AWS Lambda (Node.js 18)** — ejecuta la lógica de negocio; conectadas a VPC por regulación
- **Amazon RDS MySQL 8.0** — base de datos relacional en subnet aislada
- **AWS Secrets Manager** — almacena las credenciales de la BD de forma segura
- **Amazon VPC** — aísla los recursos en subnets privadas e isoladas
- **CloudWatch Alarm** — alerta cuando el CPU de RDS supera el 70%
- **AWS CDK (TypeScript)** — define toda la infraestructura como código

---

## Requisitos previos

- Node.js 18+
- AWS CLI configurado (`aws configure`)
- AWS CDK instalado (`npm install -g aws-cdk`)
- Una cuenta AWS con permisos de administrador

---

## Despliegue desde cero

### 1. Clonar el repositorio

```bash
git clone https://github.com/Deytosax777/persons-api.git
cd persons-api
```

### 2. Instalar dependencias

```bash
# Dependencias de la Lambda
npm install

# Dependencias de infraestructura CDK
cd infra && npm install && cd ..
```

### 3. Bootstrap de CDK (solo la primera vez por cuenta/región)

```bash
cd infra
cdk bootstrap aws://TU_ACCOUNT_ID/us-east-2
cd ..
```

> Reemplaza `TU_ACCOUNT_ID` con tu Account ID de AWS. Puedes obtenerlo con `aws sts get-caller-identity`.

### 4. Build del código Lambda

```bash
npm run build
```

### 5. Desplegar infraestructura y código

```bash
cd infra
cdk deploy
```

El deploy tarda aproximadamente 10-15 minutos (principalmente por RDS).

Al finalizar verás los outputs:

```
Outputs:
PersonsStack.ApiUrl    = https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com
PersonsStack.DbEndpoint = ...rds.amazonaws.com
PersonsStack.DbSecretArn = arn:aws:secretsmanager:...
```

---

## Endpoints disponibles

Base URL: `https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com`

### POST /persons — Crear persona

```bash
curl -X POST {BASE_URL}/persons \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Juan",
    "last_name": "Perez",
    "email": "juan@example.com",
    "document_type": "DNI",
    "document_number": "12345678"
  }'
```

Tipos de documento aceptados: `DNI` (Documento Nacional de Identidad) y `CE` (Carnet de Extranjería).

**Respuesta 201:**
```json
{
  "id": 1,
  "first_name": "Juan",
  "last_name": "Perez",
  "email": "juan@example.com",
  "document_type": "DNI",
  "document_number": "12345678",
  "created_at": "2026-07-09T18:25:17.000Z",
  "updated_at": "2026-07-09T18:25:17.000Z"
}
```

### GET /persons — Listar personas

```bash
curl {BASE_URL}/persons
```

**Respuesta 200:**
```json
{
  "persons": [...],
  "total": 1
}
```

### PUT /persons/{personId} — Actualizar email

```bash
curl -X PUT {BASE_URL}/persons/1 \
  -H "Content-Type: application/json" \
  -d '{"email": "nuevo@example.com"}'
```

> Solo se permite actualizar el email.

### DELETE /persons/{personId} — Eliminar persona

```bash
curl -X DELETE {BASE_URL}/persons/1
```

**Respuesta:** 204 No Content

---

## Desarrollo local

### Ejecutar type checking

```bash
npm run type-check
```

### Ejecutar tests unitarios

```bash
npm test
```

### Ejecutar tests con cobertura

```bash
npm run test:coverage
```

---

## CI/CD

El repositorio tiene dos workflows de GitHub Actions:

| Workflow | Trigger | Qué hace |
|---|---|---|
| `ci.yml` | Pull Request a main / Push a main | Type check + unit tests |
| `deploy.yml` | Push a main | Build + CDK deploy a AWS |

Para que el deploy funcione, configura estos secrets en GitHub Actions:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

---

## Decisiones arquitectónicas

### ¿Por qué API Gateway V2 y no V1?
HTTP API (V2) es hasta 70% más barato que REST API (V1) y suficiente para este caso de uso que no requiere autorizadores complejos ni modelos de request/response.

### ¿Por qué una Lambda por handler?
Sigue el principio de responsabilidad única. Permite escalar, monitorear y desplegar cada función de forma independiente. También limita el radio de impacto si una función falla.

### ¿Por qué esbuild y no tsc para el bundle?
esbuild es 10-100x más rápido que tsc para bundling y genera archivos más pequeños, reduciendo el cold start de Lambda.

### ¿Por qué Secrets Manager y no variables de entorno?
Las variables de entorno en Lambda son visibles en texto plano en la consola AWS. Secrets Manager cifra las credenciales, permite rotación automática y deja un audit trail de accesos.

### ¿Por qué subnets aisladas para RDS?
Las subnets PRIVATE_ISOLATED no tienen ruta a internet ni via NAT Gateway, lo que impide cualquier acceso externo a la base de datos. Solo las Lambdas (via Security Group) pueden conectarse.

### ¿Por qué pool de conexiones con límite de 5?
Lambda puede tener múltiples instancias concurrentes. Un pool grande podría agotar las conexiones disponibles de RDS. Con límite de 5 por instancia y concurrencia reservada, el total es manejable para un t3.micro.

---

## Limpieza de recursos

Para eliminar todos los recursos de AWS y evitar costos:

```bash
cd infra
cdk destroy
```

---

## Extras implementados

- ✅ Secrets Manager para credenciales de BD
- ✅ Logging de aplicación en CloudWatch (Log Group compartido)
- ✅ Alarma CPU RDS > 70%
- ✅ Tabla creada automáticamente en el primer arranque de Lambda
- 🔲 Persistencia de archivos (S3) — pendiente de implementar
