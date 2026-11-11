# shellcheck shell=bash
# Stack names and lookups shared by infra/deploy.sh and the Release workflow.
# Source it: `source infra/stacks.sh`.

BOOTSTRAP_STACK=${BOOTSTRAP_STACK:-nascar-dashboard-bootstrap}
APP_STACK=${APP_STACK:-nascar-dashboard}
DOMAINS_STACK=${DOMAINS_STACK:-nascar-dashboard-domains}
# CloudFront only takes certificates from us-east-1, so the domains stack lives there.
DOMAINS_REGION=us-east-1

# Prints one output of a stack: stack_output <stack> <output key> [region].
stack_output() {
  aws cloudformation describe-stacks --stack-name "$1" ${3:+--region "$3"} \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}

# Prints one output of the domains stack: domains_output <output key>.
domains_output() {
  stack_output "$DOMAINS_STACK" "$1" "$DOMAINS_REGION"
}

# Prints a stack's status, or nothing if the stack doesn't exist.
stack_status() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].StackStatus" --output text 2> /dev/null || true
}
