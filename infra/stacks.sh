# shellcheck shell=bash
# Stack names and lookups shared by infra/deploy.sh and the Release workflow.
# Source it: `source infra/stacks.sh`.

BOOTSTRAP_STACK=${BOOTSTRAP_STACK:-nascar-dashboard-bootstrap}
APP_STACK=${APP_STACK:-nascar-dashboard}

# Prints one output of a stack: stack_output <stack> <output key>.
stack_output() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text
}

# Prints a stack's status, or nothing if the stack doesn't exist.
stack_status() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].StackStatus" --output text 2> /dev/null || true
}
