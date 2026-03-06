FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server-admin/package.json server-admin/package.json
RUN pnpm install --frozen-lockfile --filter gaubee-2fa-server-admin...
COPY server-admin server-admin
RUN pnpm --filter gaubee-2fa-server-admin build

FROM nginx:1.27-alpine
ENV SERVER_UPSTREAM=http://server:8080
ENV NGINX_ENVSUBST_FILTER=SERVER_UPSTREAM
COPY infra/docker/server-admin.nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/server-admin/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
