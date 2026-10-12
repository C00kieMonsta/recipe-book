#!/usr/bin/env bash
# Creates the seven app tables on a DynamoDB Local endpoint. Safe to re-run.
# Usage: scripts/dynamodb-local-tables.sh [endpoint] [suffix]
set -euo pipefail

ENDPOINT="${1:-http://localhost:8000}"
SUFFIX="${2:-local}"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-fake}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-fake}"
export AWS_REGION="${AWS_REGION:-eu-north-1}"
export AWS_PAGER=""

TABLES=(
  "ta-ingredients:ingredientId"
  "ta-recipes:recipeId"
  "ta-settings:settingsId"
  "ta-events:eventId"
  "ta-grocery-lists:listId"
  "ta-clients:clientId"
  "ta-ledger:entryId"
)

for spec in "${TABLES[@]}"; do
  name="${spec%%:*}-${SUFFIX}"
  key="${spec##*:}"
  if aws dynamodb describe-table --endpoint-url "$ENDPOINT" --table-name "$name" >/dev/null 2>&1; then
    echo "exists  $name"
    continue
  fi
  aws dynamodb create-table \
    --endpoint-url "$ENDPOINT" \
    --table-name "$name" \
    --attribute-definitions "AttributeName=$key,AttributeType=S" \
    --key-schema "AttributeName=$key,KeyType=HASH" \
    --billing-mode PAY_PER_REQUEST >/dev/null
  echo "created $name ($key)"
done
