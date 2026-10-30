#!/usr/bin/env bash
# Add physical stock to an existing deployment without changing its other policies.
# Usage: bash scripts/provision-stock.sh production prod eu-north-1
set -euo pipefail
PROFILE="${1:-production}"
STAGE="${2:-prod}"
REGION="${3:-eu-north-1}"
TABLE="ta-stock-${STAGE}"
PREFIX="/la-table-amelie/production"
aws_cmd() { aws --profile "$PROFILE" --region "$REGION" --no-cli-pager "$@"; }
ACCOUNT=$(aws_cmd sts get-caller-identity --query Account --output text)
if ! aws_cmd dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
  aws_cmd dynamodb create-table --table-name "$TABLE" --attribute-definitions AttributeName=stockId,AttributeType=S --key-schema AttributeName=stockId,KeyType=HASH --billing-mode PAY_PER_REQUEST >/dev/null
fi
aws_cmd dynamodb wait table-exists --table-name "$TABLE"
aws_cmd dynamodb update-continuous-backups --table-name "$TABLE" --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null
aws_cmd ssm put-parameter --name "$PREFIX/STOCK_TABLE" --value "$TABLE" --type String --overwrite >/dev/null
aws_cmd iam put-role-policy --role-name la-table-amelie-backend-role --policy-name stock-la-table-amelie --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"dynamodb:GetItem\",\"dynamodb:PutItem\",\"dynamodb:UpdateItem\",\"dynamodb:DeleteItem\",\"dynamodb:Scan\",\"dynamodb:Query\",\"dynamodb:BatchWriteItem\",\"dynamodb:BatchGetItem\",\"dynamodb:ConditionCheckItem\"],\"Resource\":\"arn:aws:dynamodb:$REGION:$ACCOUNT:table/$TABLE\"}]}"
printf 'Stock table ready: %s\n' "$TABLE"
