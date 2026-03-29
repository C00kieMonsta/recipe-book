#!/usr/bin/env bash
# Creates (or updates) a CloudFront distribution in front of the EC2 API.
# Run once locally with AWS credentials that have CloudFront + SSM access.
#
# What it does:
#   - Creates a CloudFront distribution with EC2 as HTTP origin
#   - Creates an Origin Request Policy that forwards the Origin header
#     (required for CORS — NestJS needs to see Origin to respond correctly)
#   - Prints the CloudFront HTTPS URL to use as API_BASE_URL in GitHub

set -euo pipefail

REGION="${AWS_REGION:-eu-north-1}"
EC2_IP="${1:-}"

if [[ -z "$EC2_IP" ]]; then
  # Try to read from SSM if no arg given
  EC2_IP=$(aws ssm get-parameter \
    --region "$REGION" \
    --name "/la-table-amelie/production/EC2_HOST" \
    --query "Parameter.Value" --output text 2>/dev/null || true)
fi

if [[ -z "$EC2_IP" ]]; then
  echo "Usage: $0 <EC2_ELASTIC_IP>"
  echo "  e.g. $0 13.53.143.113"
  exit 1
fi

aws_us() { aws --region us-east-1 --no-cli-pager "$@"; }

echo "=== La Table d'Amélie — API CloudFront Setup ==="
echo "EC2 origin : http://${EC2_IP}"
echo ""

COMMENT="la-table-amelie-api"

# ── Check if distribution already exists ────────────────────────────────────
DIST_ID=$(aws_us cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='${COMMENT}'].Id | [0]" \
  --output text 2>/dev/null || echo "None")

if [[ -n "$DIST_ID" && "$DIST_ID" != "None" ]]; then
  echo "Distribution already exists: $DIST_ID"
  DOMAIN=$(aws_us cloudfront get-distribution \
    --id "$DIST_ID" --query "Distribution.DomainName" --output text)
  echo ""
  echo "======================================================"
  echo "✅ Existing distribution found"
  echo "API_BASE_URL = https://${DOMAIN}/api"
  echo ""
  echo "⚠️  If CORS is still broken, make sure the Origin Request Policy"
  echo "   forwards the 'Origin' header (see instructions below)."
  echo "======================================================"
  print_manual_cors_steps "$DIST_ID"
  exit 0
fi

# ── Origin Request Policy (forwards Origin + CORS preflight headers) ─────────
echo "Creating Origin Request Policy..."
ORP_CONFIG=$(mktemp)
cat > "$ORP_CONFIG" <<JSON
{
  "Name": "la-table-amelie-cors-policy",
  "Comment": "Forward Origin and CORS headers to EC2",
  "HeadersConfig": {
    "HeaderBehavior": "whitelist",
    "Headers": {
      "Quantity": 3,
      "Items": [
        "Origin",
        "Access-Control-Request-Headers",
        "Access-Control-Request-Method"
      ]
    }
  },
  "CookiesConfig": { "CookieBehavior": "none" },
  "QueryStringsConfig": { "QueryStringBehavior": "all" }
}
JSON

ORP_ID=$(aws_us cloudfront create-origin-request-policy \
  --origin-request-policy-config "file://${ORP_CONFIG}" \
  --query "OriginRequestPolicy.Id" --output text)
rm -f "$ORP_CONFIG"
echo "  ✓ Origin Request Policy: $ORP_ID"

# ── Cache Policy (no caching — API responses must not be cached) ──────────────
echo "Creating Cache Policy..."
CACHE_CONFIG=$(mktemp)
cat > "$CACHE_CONFIG" <<JSON
{
  "Name": "la-table-amelie-api-no-cache",
  "Comment": "No caching for API",
  "DefaultTTL": 0,
  "MaxTTL": 0,
  "MinTTL": 0,
  "ParametersInCacheKeyAndForwardedToOrigin": {
    "EnableAcceptEncodingGzip": false,
    "EnableAcceptEncodingBrotli": false,
    "HeadersConfig": { "HeaderBehavior": "none" },
    "CookiesConfig": { "CookieBehavior": "none" },
    "QueryStringsConfig": { "QueryStringBehavior": "none" }
  }
}
JSON

CACHE_POLICY_ID=$(aws_us cloudfront create-cache-policy \
  --cache-policy-config "file://${CACHE_CONFIG}" \
  --query "CachePolicy.Id" --output text)
rm -f "$CACHE_CONFIG"
echo "  ✓ Cache Policy (no-cache): $CACHE_POLICY_ID"

# ── CloudFront Distribution ───────────────────────────────────────────────────
echo "Creating CloudFront distribution..."
DIST_CONFIG=$(mktemp)
cat > "$DIST_CONFIG" <<JSON
{
  "CallerReference": "la-table-amelie-api-$(date +%s)",
  "Comment": "${COMMENT}",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "ec2-api",
      "DomainName": "${EC2_IP}",
      "CustomOriginConfig": {
        "HTTPPort": 80,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "http-only",
        "OriginSSLProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] }
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "ec2-api",
    "ViewerProtocolPolicy": "https-only",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET","HEAD","OPTIONS","PUT","PATCH","POST","DELETE"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] }
    },
    "CachePolicyId": "${CACHE_POLICY_ID}",
    "OriginRequestPolicyId": "${ORP_ID}",
    "Compress": false
  },
  "PriceClass": "PriceClass_100",
  "Enabled": true,
  "HttpVersion": "http2and3"
}
JSON

DIST_ID=$(aws_us cloudfront create-distribution \
  --distribution-config "file://${DIST_CONFIG}" \
  --query "Distribution.Id" --output text)
rm -f "$DIST_CONFIG"
echo "  ✓ Created distribution: $DIST_ID"

DOMAIN=$(aws_us cloudfront get-distribution \
  --id "$DIST_ID" --query "Distribution.DomainName" --output text)

echo ""
echo "======================================================"
echo "✅ API CloudFront setup complete"
echo "======================================================"
echo ""
echo "─── GitHub Variable to update ───────────────────────"
echo "API_BASE_URL = https://${DOMAIN}/api"
echo ""
echo "⚠️  CloudFront takes 5-15 min to deploy globally."
echo "    Re-run the frontend deploy after updating the variable."
echo "======================================================"
