#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";
import { BackendStack } from "../lib/backend-stack";
import { FrontendStack } from "../lib/frontend-stack";

const app = new cdk.App();

const stage = process.env.STAGE || app.node.tryGetContext("stage") || "dev";
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "eu-west-1",
};
const domainName = process.env.ROOT_DOMAIN || app.node.tryGetContext("domainName");

console.log(`La Table d'Amélie — stage: ${stage}, region: ${env.region}`);

const data = new DataStack(app, `TA-Data-${stage}`, { env, stage });

new BackendStack(app, `TA-Backend-${stage}`, {
  env,
  stage,
  ingredientsTable: data.ingredientsTable,
  recipesTable: data.recipesTable,
  domainName,
});

new FrontendStack(app, `TA-Frontend-${stage}`, {
  env,
  stage,
  domainName,
});

app.synth();
