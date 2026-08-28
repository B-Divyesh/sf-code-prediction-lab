FROM node:22-alpine3.20 AS web
WORKDIR /build
COPY package.json package-lock.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm ci && npm run build

FROM rust:1.89-alpine3.20 AS server
RUN apk add --no-cache musl-dev
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src ./src
ARG BUILD_SHA=unknown
ENV BUILD_SHA=${BUILD_SHA}
RUN cargo build --release

FROM node:22-alpine3.20
RUN apk add --no-cache ca-certificates python3 \
    && addgroup -S lab \
    && adduser -S -G lab -h /app lab
WORKDIR /app
COPY --from=server /build/target/release/code-prediction-lab /usr/local/bin/code-prediction-lab
COPY --from=web /build/dist ./dist
ENV PORT=8080 STATIC_DIR=/app/dist RUST_LOG=code_prediction_lab=info,tower_http=info
EXPOSE 8080
USER lab
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["code-prediction-lab"]
