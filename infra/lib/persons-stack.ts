import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';

export class PersonsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ================================================================
    // VPC — requerida por regulaciones para aislar las Lambdas
    // Usamos 2 AZs para alta disponibilidad sin costos excesivos
    // NAT Gateway en cada AZ permite a las Lambdas acceder a Secrets Manager
    // ================================================================
    const vpc = new ec2.Vpc(this, 'PersonsVpc', {
      maxAzs: 2,
      natGateways: 1, // 1 NAT Gateway para reducir costos (suficiente para dev/staging)
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          // Lambdas en subnets privadas — acceso a internet via NAT Gateway
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          // RDS en subnets aisladas — sin acceso a internet por seguridad
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ================================================================
    // Security Groups
    // Principio de mínimo privilegio: cada SG solo permite lo necesario
    // ================================================================

    // SG para las Lambdas
    const lambdaSG = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc,
      description: 'Security group para funciones Lambda',
      allowAllOutbound: true, // Necesario para llamar a Secrets Manager via NAT
    });

    // SG para RDS — solo acepta conexiones desde las Lambdas
    const rdsSG = new ec2.SecurityGroup(this, 'RdsSG', {
      vpc,
      description: 'Security group para RDS MySQL',
      allowAllOutbound: false,
    });

    rdsSG.addIngressRule(
      lambdaSG,
      ec2.Port.tcp(3306),
      'Permitir MySQL solo desde las Lambdas'
    );

    // ================================================================
    // Secrets Manager — credenciales de la BD generadas automáticamente
    // Evita hardcodear passwords en el código o variables de entorno
    // ================================================================
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      secretName: '/persons-api/db-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludePunctuation: true, // MySQL no tolera algunos caracteres especiales
        passwordLength: 32,
      },
    });

    // ================================================================
    // RDS MySQL — base de datos relacional requerida por el enunciado
    // Usamos t3.micro para minimizar costos en la prueba técnica
    // Multi-AZ desactivado para reducir costos (activar en producción)
    // ================================================================
    const dbInstance = new rds.DatabaseInstance(this, 'PersonsDb', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [rdsSG],
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: 'persons_db',
      multiAz: false, // Desactivado para reducir costos en la prueba
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      deletionProtection: false, // Permite destruir el stack fácilmente
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // CloudWatch Logs para queries lentas y errores
      cloudwatchLogsExports: ['error', 'slowquery'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
    });

    // ================================================================
    // Alarma CloudWatch — CPU > 70% en RDS (requerido por el enunciado)
    // ================================================================
    new cloudwatch.Alarm(this, 'DbCpuAlarm', {
      alarmName: 'persons-db-cpu-high',
      alarmDescription: 'CPU de la base de datos supera el 70%',
      metric: dbInstance.metricCPUUtilization({
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 70,
      evaluationPeriods: 2, // Debe superar 70% en 2 periodos consecutivos para evitar falsos positivos
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ================================================================
    // Log Group compartido para todas las Lambdas
    // ================================================================
    const logGroup = new logs.LogGroup(this, 'PersonsApiLogGroup', {
      logGroupName: '/persons-api/lambdas',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Variables de entorno comunes para todas las Lambdas
    const commonEnv = {
      DB_SECRET_ARN: dbSecret.secretArn,
      DB_NAME: 'persons_db',
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1', // Reutiliza conexiones HTTP para Secrets Manager
      NODE_OPTIONS: '--enable-source-maps',
    };

    // Configuración común para todas las Lambdas
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_18_X,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSG],
      environment: commonEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logGroup,
    };

    // ================================================================
    // Lambdas — una por handler para seguir el principio de
    // responsabilidad única y poder escalar/monitorear independientemente
    // ================================================================

    // Usamos NodejsFunction que integra esbuild automáticamente en el deploy
    const createPersonFn = new lambda.Function(this, 'CreatePersonFn', {
      ...commonLambdaProps,
      functionName: 'persons-api-create',
      handler: 'createPerson.handler',
      code: lambda.Code.fromAsset('../dist'),
      description: 'POST /persons - Crea una nueva persona',
    });

    const listPersonsFn = new lambda.Function(this, 'ListPersonsFn', {
      ...commonLambdaProps,
      functionName: 'persons-api-list',
      handler: 'listPersons.handler',
      code: lambda.Code.fromAsset('../dist'),
      description: 'GET /persons - Lista todas las personas',
    });

    const updatePersonFn = new lambda.Function(this, 'UpdatePersonFn', {
      ...commonLambdaProps,
      functionName: 'persons-api-update',
      handler: 'updatePerson.handler',
      code: lambda.Code.fromAsset('../dist'),
      description: 'PUT /persons/{personId} - Actualiza email de una persona',
    });

    const deletePersonFn = new lambda.Function(this, 'DeletePersonFn', {
      ...commonLambdaProps,
      functionName: 'persons-api-delete',
      handler: 'deletePerson.handler',
      code: lambda.Code.fromAsset('../dist'),
      description: 'DELETE /persons/{personId} - Elimina una persona',
    });

    // Dar permisos a cada Lambda para leer el secreto de la BD
    dbSecret.grantRead(createPersonFn);
    dbSecret.grantRead(listPersonsFn);
    dbSecret.grantRead(updatePersonFn);
    dbSecret.grantRead(deletePersonFn);

    // ================================================================
    // API Gateway V2 (HTTP API) — más barato y simple que REST API
    // para este caso de uso que no requiere autenticación compleja
    // ================================================================
    const api = new apigatewayv2.HttpApi(this, 'PersonsApi', {
      apiName: 'persons-api',
      description: 'API para gestión de personas',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Rutas de la API
    api.addRoutes({
      path: '/persons',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2integrations.HttpLambdaIntegration(
        'CreatePersonIntegration',
        createPersonFn
      ),
    });

    api.addRoutes({
      path: '/persons',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new apigatewayv2integrations.HttpLambdaIntegration(
        'ListPersonsIntegration',
        listPersonsFn
      ),
    });

    api.addRoutes({
      path: '/persons/{personId}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new apigatewayv2integrations.HttpLambdaIntegration(
        'UpdatePersonIntegration',
        updatePersonFn
      ),
    });

    api.addRoutes({
      path: '/persons/{personId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new apigatewayv2integrations.HttpLambdaIntegration(
        'DeletePersonIntegration',
        deletePersonFn
      ),
    });

    // ================================================================
    // Outputs — valores importantes para usar después del deploy
    // ================================================================
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.apiEndpoint,
      description: 'URL base de la API',
      exportName: 'PersonsApiUrl',
    });

    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: dbSecret.secretArn,
      description: 'ARN del secreto de la BD en Secrets Manager',
      exportName: 'PersonsDbSecretArn',
    });

    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: dbInstance.instanceEndpoint.hostname,
      description: 'Endpoint de la base de datos RDS',
      exportName: 'PersonsDbEndpoint',
    });
  }
}
