# API image for AWS Lambda. The Lambda Web Adapter extension turns Lambda
# invocations into HTTP requests, so the same image also runs anywhere with
# `docker run -p 8080:8080`.

FROM public.ecr.aws/docker/library/python:3.14-slim AS build

COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable


FROM public.ecr.aws/docker/library/python:3.14-slim

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0 /lambda-adapter /opt/extensions/lambda-adapter
COPY --from=build /app/.venv /app/.venv

ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    AWS_LWA_PORT=8080 \
    AWS_LWA_READINESS_CHECK_PATH=/api/health

EXPOSE 8080
CMD ["uvicorn", "nascar_dashboard.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
