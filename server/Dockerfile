FROM rust:1.90-bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release -p gaubee-2fa-server

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/gaubee-2fa-server /usr/local/bin/gaubee-2fa-server
ENV RUST_LOG=info \
    GAUBEE_2FA_HTTP=0.0.0.0:8080 \
    GAUBEE_2FA_GRPC=0.0.0.0:50051 \
    GAUBEE_2FA_DB=sqlite \
    GAUBEE_2FA_DATABASE_URL=sqlite:///data/gaubee-2fa.db?mode=rwc
EXPOSE 8080 50051
CMD ["gaubee-2fa-server"]
