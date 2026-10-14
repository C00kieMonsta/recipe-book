#!/usr/bin/env bash
# Provisions the clients and ledger tables for an existing deployment, idempotently:
#   - DynamoDB tables ta-clients-<stage> and ta-ledger-<stage> (on demand, point-in-time recovery)
#   - SSM parameters CLIENTS_TABLE and LEDGER_TABLE under /la-table-amelie/<stage>
#   - the instance role policy dynamodb-la-table-amelie with all seven table ARNs
#     and ssm:GetParameter on /la-table-amelie/production/OPENAI_API_KEY (the Assistant key)
# Usage: ./scripts/provision-new-tables.sh [profile] [stage] [region]
# Example: ./scripts/provision-new-tables.sh production prod eu-north-1
# Afterwards push main (the deploy workflow rewrites apps/backend/.env from SSM and restarts pm2),
# or on the EC2 append CLIENTS_TABLE and LEDGER_TABLE to apps/backend/.env and run pm2 restart la-table-amelie-api.

set -euo pipefail

PROFILE="${1:-production}"
STAGE="${2:-prod}"
REGION="${3:-eu-north-1}"
SSM_PREFIX="/la-table-amelie/production"
ROLE_NAME="la-table-amelie-backend-role"
POLICY_NAME="dynamodb-la-table-amelie"

aws_cmd() { aws --profile "$PROFILE" --region "$REGION" --no-cli-pager "$@"; }

create_table() {
  local name="$1" key="$2"
  if aws_cmd dynamodb describe-table --table-name "$name" >/dev/null 2>&1; then
    echo "table $name exists"
  else
    echo "creating table $name ($key)"
    aws_cmd dynamodb create-table \
      --table-name "$name" \
      --attribute-definitions "AttributeName=${key},AttributeType=S" \
      --key-schema "AttributeName=${key},KeyType=HASH" \
      --billing-mode PAY_PER_REQUEST >/dev/null
    aws_cmd dynamodb wait table-exists --table-name "$name"
  fi
  aws_cmd dynamodb update-continuous-backups \
    --table-name "$name" \
    --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null
  echo "point-in-time recovery on for $name"
}

put_param() {
  local name="$1" value="$2"
  aws_cmd ssm put-parameter --name "${SSM_PREFIX}/${name}" --value "$value" --type String --overwrite >/dev/null
  echo "ssm ${SSM_PREFIX}/${name} = ${value}"
}

echo "account: $(aws_cmd sts get-caller-identity --query Account --output text)"

create_table "ta-clients-${STAGE}" clientId
create_table "ta-ledger-${STAGE}" entryId

put_param CLIENTS_TABLE "ta-clients-${STAGE}"
put_param LEDGER_TABLE "ta-ledger-${STAGE}"

if aws_cmd iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "updating role policy ${POLICY_NAME} on ${ROLE_NAME}"
  aws_cmd iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "$POLICY_NAME" \
    --policy-document "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [{
        \"Effect\": \"Allow\",
        \"Action\": [
          \"dynamodb:GetItem\", \"dynamodb:PutItem\", \"dynamodb:UpdateItem\",
          \"dynamodb:DeleteItem\", \"dynamodb:Scan\", \"dynamodb:Query\",
          \"dynamodb:BatchWriteItem\", \"dynamodb:BatchGetItem\"
        ],
        \"Resource\": [
          \"arn:aws:dynamodb:${REGION}:*:table/ta-ingredients-${STAGE}\",
          \"arn:aws:dynamodb:${REGION}:*:table/ta-recipes-${STAGE}\",
          \"arn:aws:dynamodb:${REGION}:*:table/ta-settings-${STAGE}\",
          \"arn:aws:dynamodb:${REGION}:*:table/ta-events-${STAGE}\",
          \"arn:aws:dynamodb:${REGION}:*:table/ta-grocery-lists-${STAGE}\",
          \"arn:aws:dynamodb:${REGION}:*:table/ta-clients-${STAGE}\",
          \"arn:aws:dynamodb:${REGION}:*:table/ta-ledger-${STAGE}\"
        ]
      }, {
        \"Effect\": \"Allow\",
        \"Action\": [\"ssm:GetParameter\"],
        \"Resource\": \"arn:aws:ssm:${REGION}:*:parameter${SSM_PREFIX}/OPENAI_API_KEY\"
      }]
    }"
else
  echo "role ${ROLE_NAME} not found: add the two table ARNs and ssm:GetParameter on ${SSM_PREFIX}/OPENAI_API_KEY to the instance role policy by hand"
fi

echo "done. Now push main (the deploy rewrites .env from SSM and restarts the API), then check GET /health for tables.clients and tables.ledger."
