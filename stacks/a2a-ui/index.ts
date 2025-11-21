#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-restricted-imports */
import { App } from 'aws-cdk-lib';
import { A2AStack } from './src/stack';
const app = new App();
new A2AStack(app);
