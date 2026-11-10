#!/usr/bin/env bash
# Deploys the app stack with the given API image, then uploads the built UI and
# clears the CDN cache. Run from the repo root after building frontend/dist.
#
#   infra/deploy.sh <account>.dkr.ecr.<region>.amazonaws.com/nascar-dashboard-api@sha256:...
set -euo pipefail

IMAGE_URI=${1:?usage: infra/deploy.sh <image-uri>}
DIST_DIR=frontend/dist

# shellcheck source=infra/stacks.sh
source "$(dirname "$0")/stacks.sh"

if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "No UI build at $DIST_DIR. Run 'npm run build' in frontend/ first." >&2
  exit 1
fi

BUCKET=$(stack_output "$BOOTSTRAP_STACK" SiteBucketName)
CLOUDFORMATION_ROLE=$(stack_output "$BOOTSTRAP_STACK" CloudFormationRoleArn)

# A failed first create leaves the stack in ROLLBACK_COMPLETE, which can only be deleted.
if [ "$(stack_status "$APP_STACK")" = ROLLBACK_COMPLETE ]; then
  echo "Deleting stack $APP_STACK, left in ROLLBACK_COMPLETE by a failed first deploy"
  aws cloudformation delete-stack --stack-name "$APP_STACK" --role-arn "$CLOUDFORMATION_ROLE"
  aws cloudformation wait stack-delete-complete --stack-name "$APP_STACK"
fi

echo "Deploying stack $APP_STACK with $IMAGE_URI"
aws cloudformation deploy \
  --stack-name "$APP_STACK" \
  --template-file infra/app.yaml \
  --role-arn "$CLOUDFORMATION_ROLE" \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    ImageUri="$IMAGE_URI" \
    ApiFunctionRoleArn="$(stack_output "$BOOTSTRAP_STACK" ApiFunctionRoleArn)" \
    DsqlEndpoint="$(stack_output "$BOOTSTRAP_STACK" DsqlEndpoint)" \
    SiteBucketName="$BUCKET" \
    SiteBucketDomainName="$(stack_output "$BOOTSTRAP_STACK" SiteBucketDomainName)"

echo "Uploading the UI to s3://$BUCKET"
# Hashed bundles never change, so browsers can keep them; older ones stay for
# pages that are still open. Everything else is revalidated on each load.
aws s3 sync "$DIST_DIR/assets" "s3://$BUCKET/assets" \
  --cache-control "public, max-age=31536000, immutable"
aws s3 sync "$DIST_DIR" "s3://$BUCKET" --exclude "assets/*" --delete \
  --cache-control "no-cache"

aws cloudfront create-invalidation \
  --distribution-id "$(stack_output "$APP_STACK" DistributionId)" \
  --paths "/*" > /dev/null

SITE_URL=$(stack_output "$APP_STACK" SiteUrl)
echo "site_url=$SITE_URL" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "Deployed to $SITE_URL"
