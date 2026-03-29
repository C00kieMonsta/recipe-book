#!/usr/bin/env bash
# Run once locally with AWS admin credentials.
# Stores all backend secrets in SSM Parameter Store.
# The EC2 instance reads these on first boot via ec2-bootstrap.sh.
#
# Usage:
#   ./scripts/setup-ssm-params.sh              # Interactive mode
#   ./scripts/setup-ssm-params.sh --file FILE  # Load from JSON file

set -euo pipefail

REGION="${AWS_REGION:-eu-north-1}"
PREFIX="/la-table-amelie/production"

put_param() {
  local name="$1"
  local value="$2"
  local type="${3:-SecureString}"

  aws ssm put-parameter \
    --region "$REGION" \
    --name "${PREFIX}/${name}" \
    --value "$value" \
    --type "$type" \
    --overwrite \
    --no-cli-pager

  echo "  ✓ ${PREFIX}/${name}"
}

get_json_field() {
  local json="$1"
  local field="$2"
  echo "$json" | jq -r ".$field"
}

echo "=== La Table d'Amélie — SSM Parameter Setup ==="
echo "Region: $REGION"
echo "Prefix: $PREFIX"
echo ""

if [[ "${1:-}" == "--file" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "Error: --file requires a path argument"
    exit 1
  fi

  file="$2"
  if [[ ! -f "$file" ]]; then
    echo "Error: File not found: $file"
    exit 1
  fi

  echo "Loading from: $file"
  json=$(cat "$file")

  ingredients_table=$(get_json_field "$json" "INGREDIENTS_TABLE")
  recipes_table=$(get_json_field "$json" "RECIPES_TABLE")
  settings_table=$(get_json_field "$json" "SETTINGS_TABLE")
  events_table=$(get_json_field "$json" "EVENTS_TABLE")
  grocery_lists_table=$(get_json_field "$json" "GROCERY_LISTS_TABLE")
  s3_bucket=$(get_json_field "$json" "S3_BUCKET")
  admin_credentials=$(get_json_field "$json" "ADMIN_CREDENTIALS" | jq -c .)
  jwt_secret=$(get_json_field "$json" "JWT_SECRET")
else
  read -rp "INGREDIENTS_TABLE [ta-ingredients-prod]: " ingredients_table
  ingredients_table="${ingredients_table:-ta-ingredients-prod}"

  read -rp "RECIPES_TABLE [ta-recipes-prod]: " recipes_table
  recipes_table="${recipes_table:-ta-recipes-prod}"

  read -rp "SETTINGS_TABLE [ta-settings-prod]: " settings_table
  settings_table="${settings_table:-ta-settings-prod}"

  read -rp "EVENTS_TABLE [ta-events-prod]: " events_table
  events_table="${events_table:-ta-events-prod}"

  read -rp "GROCERY_LISTS_TABLE [ta-grocery-lists-prod]: " grocery_lists_table
  grocery_lists_table="${grocery_lists_table:-ta-grocery-lists-prod}"

  read -rp "S3_BUCKET [la-table-amelie-uploads-prod]: " s3_bucket
  s3_bucket="${s3_bucket:-la-table-amelie-uploads-prod}"

  echo "ADMIN_CREDENTIALS: JSON array of {email, hash} objects."
  echo "Generate hashes with: node -e \"const b=require('bcryptjs');b.hash('password',12).then(console.log)\""
  read -rp "ADMIN_CREDENTIALS (JSON): " admin_credentials
  read -rsp "JWT_SECRET (32+ random chars): " jwt_secret
  echo ""
fi

echo ""
echo "Storing parameters..."
put_param "INGREDIENTS_TABLE"   "$ingredients_table"   "String"
put_param "RECIPES_TABLE"       "$recipes_table"       "String"
put_param "SETTINGS_TABLE"      "$settings_table"      "String"
put_param "EVENTS_TABLE"        "$events_table"        "String"
put_param "GROCERY_LISTS_TABLE" "$grocery_lists_table" "String"
put_param "S3_BUCKET"           "$s3_bucket"           "String"
put_param "ADMIN_CREDENTIALS"   "$admin_credentials"
put_param "JWT_SECRET"          "$jwt_secret"

echo ""
echo "✅ All parameters stored under ${PREFIX}/"
echo ""
echo "Next step: run ./scripts/create-ec2.sh"
