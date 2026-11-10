# Deployment

Race Rewind runs on AWS in `us-east-2`, next to the Aurora DSQL cluster that
cadence loads. Every merge to `master` releases and deploys a new version.

## Architecture

```
                         ┌──────────────── CloudFront ────────────────┐
 browser ── https ──▶    │  /*      → S3 bucket (built UI)            │
                         │  /api/*  → Lambda function URL (FastAPI)   │──▶ Aurora DSQL
                         └────────────────────────────────────────────┘    (dashboard_reader)
```

- **UI:** `frontend/dist` in a private S3 bucket, read by CloudFront through an
  origin access control. A CloudFront Function serves `index.html` for app routes
  such as `/replay/5551`, so React Router handles them.
- **API:** the `backend/Dockerfile` image on Lambda (arm64). The
  [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)
  extension turns invocations into HTTP requests to uvicorn, so the app code has
  no Lambda-specific parts and the image also runs with plain `docker run`.
- **Function URL:** uses `AWS_IAM` auth, and only the CloudFront distribution may
  call it, signing its requests through an origin access control.
- **Caching:** CloudFront caches API responses for as long as their
  `Cache-Control` says (a day for a finished race's replay, a minute for listings).
  Repeat views of a race don't reach Lambda or DSQL.
- **Database:** the function's IAM role (`nascar-dashboard-api`) is mapped to the
  read-only `dashboard_reader` Postgres role. There's no VPC: DSQL has a public
  endpoint with IAM auth, so there's no NAT gateway to pay for.

UI and API share one origin, so the browser never makes a cross-origin request
and CORS isn't involved.

## Cost

At portfolio traffic it should all fit in the AWS free tier:

| Service | Free allowance (monthly) | Notes |
|---|---|---|
| CloudFront | 1 TB out, 10M requests, 2M function invocations | always free |
| Lambda | 1M requests, 400,000 GB-seconds | always free; function URLs cost nothing |
| S3 | 5 GB (first 12 months) | the UI is about 3 MB, so pennies after that |
| ECR | 500 MB (first 12 months) | the lifecycle policy keeps 5 images, about $0.05/month after that |
| CloudWatch Logs | 5 GB ingest | 14-day retention |
| Aurora DSQL | 100,000 DPUs, 1 GB storage | shared with cadence |

The account's Lambda concurrency limit (10 in a new account) also limits how
far a traffic spike can run up the bill.

## Stacks

| Stack | Template | Deployed by | Holds |
|---|---|---|---|
| `nascar-dashboard-bootstrap` | `infra/bootstrap.yaml` | you, by hand, rarely | ECR repository, site bucket, the API's IAM role, the CloudFormation and GitHub deploy roles |
| `nascar-dashboard` | `infra/app.yaml` | every release (`infra/deploy.sh`) | Lambda function and URL, CloudFront distribution and its policies, bucket policy |

The bootstrap stack holds what has to exist before the first deploy, plus the
IAM roles, so a release can't widen its own permissions. A change to
`infra/app.yaml` is applied by the next release. A change to
`infra/bootstrap.yaml` has to be deployed by hand (below).

## Releases

`.github/workflows/release.yml` runs on every push to `master`:

1. Runs CI (`ci.yml`): backend lint, format, type check and tests; frontend lint,
   type check, tests and build; template and script lint; an image build with a
   health-check smoke test.
2. Tags the commit with the next calendar version, `vYEAR.MONTH.N`: the first
   release in November 2026 is `v2026.11.0`, the next `v2026.11.1`, and N starts
   again at 0 each month. Releases ship on every merge, with no one to decide
   whether a change is major or minor, so the version records when it shipped
   instead. The tag is pushed first, so a release that fails partway uses up its
   number rather than reusing it.
3. Builds the arm64 image natively on an arm64 runner and pushes it to ECR,
   tagged with the version.
4. Builds the UI and runs `infra/deploy.sh` with the image digest: it updates the
   `nascar-dashboard` stack, uploads the UI, and invalidates the CloudFront cache.
5. Checks that `/api/health` and `/` respond, then publishes a GitHub Release
   with generated notes.

The job runs in the `production` GitHub environment, so each release shows up
under the repo's Environments, linked to the site. Releases queue rather than
run at the same time.

GitHub reaches AWS with OIDC: the `nascar-dashboard-github-deploy` role trusts
only this repository's `production` environment. It can push images, upload the
UI, invalidate the cache, and deploy the app stack, and only by passing the
`nascar-dashboard-cloudformation` role to CloudFormation.

If the very first deploy fails, CloudFormation rolls the stack back to
`ROLLBACK_COMPLETE`, a state it can't update. `infra/deploy.sh` checks for that
and deletes the empty stack before deploying, so the next release creates it
again. That's why the deploy role may also delete the app stack.

### Rolling back

Revert the bad commit on `master`; the release that follows redeploys the
previous code. For a faster fix, redeploy an earlier image by hand, using the
digest from that version's GitHub Release:

```sh
(cd frontend && npm run build)
AWS_REGION=us-east-2 infra/deploy.sh <account>.dkr.ecr.us-east-2.amazonaws.com/nascar-dashboard-api@sha256:...
```

## One-time setup

This is already done for the current account. It's here for rebuilding.

**1. Bootstrap stack.** The GitHub OIDC provider
(`token.actions.githubusercontent.com`) must already exist in the account. Then run:

```sh
aws cloudformation deploy --region us-east-2 \
  --stack-name nascar-dashboard-bootstrap \
  --template-file infra/bootstrap.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides DsqlClusterId=<cluster-id>
```

**2. DSQL role.** The `nascar` schema is owned by `admin`, and its tables by
`cadence_writer`, so the grants come from both:

```sql
-- as admin
CREATE ROLE dashboard_reader WITH LOGIN;
AWS IAM GRANT dashboard_reader TO 'arn:aws:iam::<account>:role/nascar-dashboard-api';
GRANT USAGE ON SCHEMA nascar TO dashboard_reader;

-- as cadence_writer
GRANT SELECT ON ALL TABLES IN SCHEMA nascar TO dashboard_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA nascar GRANT SELECT ON TABLES TO dashboard_reader;
```

The default privileges make tables cadence adds later readable too. To run the
API locally against DSQL as `dashboard_reader`, also
`AWS IAM GRANT dashboard_reader TO '<your role ARN>'`.

**3. GitHub.** Create a `production` environment, limited to the `master` branch,
with these variables:

| Variable | Value |
|---|---|
| `AWS_REGION` | `us-east-2` |
| `AWS_DEPLOY_ROLE_ARN` | the bootstrap stack's `GitHubDeployRoleArn` output |

Everything else the workflow needs comes from the bootstrap stack's outputs.

## Running the image locally

```sh
docker build -t nascar-dashboard-api backend
docker run --rm -p 8080:8080 -e DATABASE_URL=sqlite:////data/dev.db \
  -v "$PWD/backend:/data" nascar-dashboard-api
```

Outside Lambda the adapter isn't loaded, and uvicorn serves on port 8080 directly.
