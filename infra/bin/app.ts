#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PersonsStack } from '../lib/persons-stack';

const app = new cdk.App();

new PersonsStack(app, 'PersonsStack', {
  // Región requerida por el enunciado
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-2',
  },
  description: 'Stack para la API de gestión de personas — prueba técnica DevOps',
});
