#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
API_KEY="${API_KEY:-dev-api-key-change-in-production}"

echo "=== Health check ==="
curl -s "$BASE_URL/health" | jq .

echo ""
echo "=== Create advertiser (Variant assigned by hash) ==="
RESPONSE=$(curl -s -X POST "$BASE_URL/webhooks/advertiser-signed-up" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"business_name": "Test Pizza Shop", "email": "testpizza@example.com"}')
echo "$RESPONSE" | jq .
ADVERTISER_ID=$(echo "$RESPONSE" | jq -r '.advertiser_id')
echo "Created advertiser: $ADVERTISER_ID"

echo ""
echo "=== Attempt duplicate (should 409) ==="
curl -s -X POST "$BASE_URL/webhooks/advertiser-signed-up" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"business_name": "Test Pizza Shop", "email": "testpizza@example.com"}' | jq .

echo ""
echo "=== Attempt without API key (should 401) ==="
curl -s -X POST "$BASE_URL/webhooks/advertiser-signed-up" \
  -H "Content-Type: application/json" \
  -d '{"business_name": "No Key Shop", "email": "nokey@example.com"}' | jq .

echo ""
echo "=== List advertisers ==="
curl -s "$BASE_URL/api/advertisers?limit=5" | jq '.data | length, .pagination'

echo ""
echo "=== Funnel stats ==="
curl -s "$BASE_URL/api/funnel" | jq .

echo ""
echo "=== Queue health + DLQ ==="
curl -s "$BASE_URL/api/tasks/dlq" | jq '.queue_health'

echo ""
echo "=== Mark coupon designed ==="
curl -s -X POST "$BASE_URL/api/advertisers/$ADVERTISER_ID/coupon-designed" \
  -H "X-API-Key: $API_KEY" | jq .

echo ""
echo "=== Mark coupon published ==="
curl -s -X POST "$BASE_URL/api/advertisers/$ADVERTISER_ID/coupon-published" \
  -H "X-API-Key: $API_KEY" | jq .

echo ""
echo "=== Verify advertiser state ==="
curl -s "$BASE_URL/api/advertisers?limit=1" | jq '.data[0] | {id, businessName, variant, firstCouponAt, firstPublishAt}'

echo ""
echo "All tests complete."
