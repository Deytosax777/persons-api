import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class PersonsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ================================================================
    // VPC — requerida por regulaciones para aislar las Lambdas
    // ================================================================
    const vpc = new ec2.Vpc(this, 'PersonsVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { cidrMask: 24, name: 'Public', subnetType: ec2.SubnetType.PUBLIC },
        { cidrMask: 24, name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { cidrMask: 24, name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    // ================================================================
    // Security Groups
    // ================================================================
    const lambdaSG = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc,
      description: 'Security group para funciones Lambda',
      allowAllOutbound: true,
    });

    const rdsSG = new ec2.SecurityGroup(this, 'RdsSG', {
      vpc,
      description: 'Security group para RDS MySQL',
      allowAllOutbound: false,
    });

    rdsSG.addIngressRule(lambdaSG, ec2.Port.tcp(3306), 'Permitir MySQL solo desde las Lambdas');

    // ================================================================
    // S3 Bucket — persistencia de archivos subidos por usuarios
    // Acceso público bloqueado: archivos solo accesibles via Lambda
    // Versioning activado para recuperar archivos eliminados accidentalmente
    // ================================================================
    const filesBucket = new s3.Bucket(this, 'PersonsFilesBucket', {
      bucketName: `persons-api-files-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: 'MoveToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // ================================================================
    // Secrets Manager
    // ================================================================
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      secretName: '/persons-api/db-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // ================================================================
    // RDS MySQL
    // ================================================================
    const dbInstance = new rds.DatabaseInstance(this, 'PersonsDb', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [rdsSG],
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: 'persons_db',
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      cloudwatchLogsExports: ['error', 'slowquery'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
    });

    // ================================================================
    // Alarma CloudWatch — CPU > 70% en RDS
    // ================================================================
    new cloudwatch.Alarm(this, 'DbCpuAlarm', {
      alarmName: 'persons-db-cpu-high',
      alarmDescription: 'CPU de la base de datos supera el 70%',
      metric: dbInstance.metricCPUUtilization({
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 70,
      evaluationPeriods: 2,
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

    const commonEnv = {
      DB_SECRET_ARN: dbSecret.secretArn,
      DB_NAME: 'persons_db',
      FILES_BUCKET_NAME: filesBucket.bucketName,
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      NODE_OPTIONS: '--enable-source-maps',
    };

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
    // Lambdas
    // ================================================================
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

    // Lambda para subir archivos a S3
    // Mayor memoria y timeout para manejar archivos
    const uploadFileFn = new lambda.Function(this, 'UploadFileFn', {
      ...commonLambdaProps,
      functionName: 'persons-api-upload-file',
      handler: 'uploadFile.handler',
      code: lambda.Code.fromAsset('../dist'),
      description: 'POST /persons/{personId}/files - Sube un archivo a S3',
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
    });

    // Permisos Secrets Manager para todas las Lambdas
    dbSecret.grantRead(createPersonFn);
    dbSecret.grantRead(listPersonsFn);
    dbSecret.grantRead(updatePersonFn);
    dbSecret.grantRead(deletePersonFn);
    dbSecret.grantRead(uploadFileFn);

    // Permiso S3 solo para la Lambda de upload
    // Principio de mínimo privilegio: solo quien necesita accede al bucket
    filesBucket.grantPut(uploadFileFn);

    // ================================================================
    // API Gateway V2
    // ================================================================
    const api = new apigatewayv2.HttpApi(this, 'PersonsApi', {
      apiName: 'persons-api',
      description: 'API para gestión de personas',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization', 'x-file-name'],
      },
    });

    api.addRoutes({
      path: '/persons',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2integrations.HttpLambdaIntegration('CreatePersonIntegration', createPersonFn),
    });

    api.addRoutes({
      path: '/persons',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new apigatewayv2integrations.HttpLambdaIntegration('ListPersonsIntegration', listPersonsFn),
    });

    api.addRoutes({
      path: '/persons/{personId}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new apigatewayv2integrations.HttpLambdaIntegration('UpdatePersonIntegration', updatePersonFn),
    });

    api.addRoutes({
      path: '/persons/{personId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new apigatewayv2integrations.HttpLambdaIntegration('DeletePersonIntegration', deletePersonFn),
    });

    // Nueva ruta para subida de archivos
    api.addRoutes({
      path: '/persons/{personId}/files',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2integrations.HttpLambdaIntegration('UploadFileIntegration', uploadFileFn),
    });

    // ================================================================
    // Outputs
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

    new cdk.CfnOutput(this, 'FilesBucketName', {
      value: filesBucket.bucketName,
      description: 'Nombre del bucket S3 para archivos de personas',
      exportName: 'PersonsFilesBucketName',
    });
  }
}
