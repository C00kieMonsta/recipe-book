#!/usr/bin/env bash
# Lets the API list the uploads bucket, which the backup download (Paramètres › Société › Sauvegarde) needs.
# Rewrites the instance role policy s3-la-table-amelie: the three object actions on the bucket's objects,
# plus s3:ListBucket on the bucket itself. Safe to re-run. No restart: the instance sees the role change within minutes.
# Usage: ./scripts/grant-backup-permissions.sh [profile] [bucket] [region]
# Example: ./scripts/grant-backup-permissions.sh production la-table-amelie-uploads-prod eu-north-1

set -euo pipefail

PROFILE="${1:-production}"
BUCKET="${2:-la-table-amelie-uploads-prod}"
REGION="${3:-eu-north-1}"
ROLE_NAME="la-table-amelie-backend-role"
POLICY_NAME="s3-la-table-amelie"

aws_cmd() { aws --profile "$PROFILE" --region "$REGION" --no-cli-pager "$@"; }

echo "account: $(aws_cmd sts get-caller-identity --query Account --output text)"

aws_cmd iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:PutObject\", \"s3:GetObject\", \"s3:DeleteObject\"],
      \"Resource\": \"arn:aws:s3:::${BUCKET}/*\"
    }, {
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:ListBucket\"],
      \"Resource\": \"arn:aws:s3:::${BUCKET}\"
    }]
  }"

echo "role policy ${POLICY_NAME} on ${ROLE_NAME}: objects of ${BUCKET} plus s3:ListBucket"
echo "done. Paramètres › Société › Sauvegarde › « Télécharger une sauvegarde » should answer within a few minutes."
