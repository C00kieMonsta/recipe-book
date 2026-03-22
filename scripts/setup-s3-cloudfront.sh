#!/usr/bin/env bash
# Run once locally with AWS admin credentials.
# Creates:
#   - 1 S3 bucket (admin frontend)
#   - 1 Origin Access Control
#   - 1 CloudFront distribution (with SPA error routing)
#   - Bucket policy allowing CloudFront OAC access

set -euo pipefail

REGION="${AWS_REGION:-eu-north-1}"
ADMIN_BUCKET="ta-admin-production"

CF_CACHE_POLICY="658327ea-f89d-4fab-a63d-7e88639e58f6"

aws_r() { aws --region "$REGION" --no-cli-pager "$@"; }
aws_us() { aws --region us-east-1 --no-cli-pager "$@"; }

ACCOUNT_ID=$(aws_r sts get-caller-identity --query Account --output text)

echo "=== La Table d'Amélie — S3 + CloudFront Setup ==="
echo "Account : $ACCOUNT_ID"
echo "Region  : $REGION"
echo ""

# ── S3 Bucket ──────────────────────────────────────────────────────────────
create_bucket() {
  local bucket="$1"
  if aws_r s3api head-bucket --bucket "$bucket" 2>/dev/null; then
    echo "  ✓ Bucket already exists: $bucket"
  else
    aws_r s3api create-bucket \
      --bucket "$bucket" \
      --create-bucket-configuration LocationConstraint="$REGION" > /dev/null
    aws_r s3api put-public-access-block \
      --bucket "$bucket" \
      --public-access-block-configuration \
        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
    echo "  ✓ Created bucket: $bucket"
  fi
}

echo "Creating S3 bucket..."
create_bucket "$ADMIN_BUCKET"

# ── Origin Access Control ──────────────────────────────────────────────────
create_oac() {
  local name="$1"
  local existing
  existing=$(aws_us cloudfront list-origin-access-controls \
    --query "OriginAccessControlList.Items[?Name=='${name}'].Id | [0]" --output text)

  if [[ -n "$existing" && "$existing" != "None" ]]; then
    echo "  ✓ OAC already exists: $name ($existing)" >&2
    echo "$existing"
    return
  fi

  local tmpfile
  tmpfile=$(mktemp)
  cat > "$tmpfile" <<JSON
{
  "Name": "${name}",
  "Description": "OAC for ${name}",
  "SigningProtocol": "sigv4",
  "SigningBehavior": "always",
  "OriginAccessControlOriginType": "s3"
}
JSON

  local id
  id=$(aws_us cloudfront create-origin-access-control \
    --origin-access-control-config "file://${tmpfile}" \
    --query "OriginAccessControl.Id" --output text)
  rm -f "$tmpfile"

  echo "  ✓ Created OAC: $name ($id)" >&2
  echo "$id"
}

echo "Creating Origin Access Control..."
ADMIN_OAC_ID=$(create_oac "ta-admin-oac")

# ── CloudFront Distribution ───────────────────────────────────────────────
create_distribution() {
  local bucket="$1"
  local oac_id="$2"
  local comment="$3"
  local origin_id="${bucket}-origin"
  local bucket_domain="${bucket}.s3.${REGION}.amazonaws.com"

  local dist_id
  dist_id=$(aws_us cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='${comment}'].Id | [0]" --output text)

  if [[ -n "$dist_id" && "$dist_id" != "None" ]]; then
    echo "  ✓ Distribution already exists: $comment ($dist_id)" >&2
    echo "$dist_id"
    return
  fi

  local tmpfile
  tmpfile=$(mktemp)
  cat > "$tmpfile" <<JSON
{
  "CallerReference": "${bucket}-$(date +%s)",
  "Comment": "${comment}",
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "${origin_id}",
      "DomainName": "${bucket_domain}",
      "S3OriginConfig": { "OriginAccessIdentity": "" },
      "OriginAccessControlId": "${oac_id}"
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "${origin_id}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "${CF_CACHE_POLICY}",
    "Compress": true,
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"]
    }
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 0
      },
      {
        "ErrorCode": 403,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 0
      }
    ]
  },
  "PriceClass": "PriceClass_100",
  "Enabled": true,
  "HttpVersion": "http2and3"
}
JSON

  local id
  id=$(aws_us cloudfront create-distribution \
    --distribution-config "file://${tmpfile}" \
    --query "Distribution.Id" --output text)
  rm -f "$tmpfile"

  echo "  ✓ Created distribution: $comment ($id)" >&2
  echo "$id"
}

echo "Creating CloudFront distribution..."
ADMIN_DIST_ID=$(create_distribution "$ADMIN_BUCKET" "$ADMIN_OAC_ID" "la-table-amelie-admin")

# ── Bucket Policy ──────────────────────────────────────────────────────────
apply_bucket_policy() {
  local bucket="$1"
  local dist_id="$2"
  local dist_arn="arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${dist_id}"
  local tmpfile
  tmpfile=$(mktemp)
  cat > "$tmpfile" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontOAC",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${bucket}/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "${dist_arn}"
      }
    }
  }]
}
JSON
  aws_r s3api put-bucket-policy --bucket "$bucket" --policy "file://${tmpfile}"
  rm -f "$tmpfile"
  echo "  ✓ Bucket policy applied: $bucket"
}

echo "Applying bucket policy..."
apply_bucket_policy "$ADMIN_BUCKET" "$ADMIN_DIST_ID"

# ── Get CloudFront domain ─────────────────────────────────────────────────
ADMIN_CF_DOMAIN=$(aws_us cloudfront get-distribution \
  --id "$ADMIN_DIST_ID" --query "Distribution.DomainName" --output text)

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "✅ S3 + CloudFront setup complete"
echo "======================================================"
echo ""
echo "─── GitHub Variables (Settings → Secrets → Variables) ───"
echo "ADMIN_S3_BUCKET         = $ADMIN_BUCKET"
echo "ADMIN_CF_DISTRIBUTION   = $ADMIN_DIST_ID"
echo ""
echo "─── CloudFront URL ─────────────────────────────────────"
echo "Admin : https://$ADMIN_CF_DOMAIN"
echo ""
echo "⚠️  CloudFront distributions take 5-15 min to deploy globally."
echo "======================================================"
