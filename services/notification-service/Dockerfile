# Build from the monorepo root; credentials are injected only at runtime.
FROM node:24-bookworm-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY services/identity-service/package.json services/identity-service/package.json
COPY services/course-service/package.json services/course-service/package.json
COPY services/quiz-service/package.json services/quiz-service/package.json
COPY services/learning-service/package.json services/learning-service/package.json
COPY services/notification-service/package.json services/notification-service/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/contracts/package.json packages/contracts/package.json

FROM manifests AS build
RUN npm ci --workspace=@lms/contracts --workspace=@lms/auth --workspace=@lms/notification-service --include-workspace-root=false
COPY packages/contracts/ packages/contracts/
COPY packages/auth/ packages/auth/
COPY services/notification-service/ services/notification-service/
RUN npm run build -w @lms/contracts && npm run build -w @lms/auth && npm run build -w @lms/notification-service

FROM manifests AS production-dependencies
ENV NODE_ENV=production
RUN npm ci --omit=dev --workspace=@lms/contracts --workspace=@lms/auth --workspace=@lms/notification-service --include-workspace-root=false

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3005
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/ ./
COPY --from=build --chown=node:node /app/packages/contracts/dist/ packages/contracts/dist/
COPY --from=build --chown=node:node /app/packages/contracts/fixtures/ids.json packages/contracts/fixtures/ids.json
COPY --from=build --chown=node:node /app/packages/auth/dist/ packages/auth/dist/
COPY --from=build --chown=node:node /app/packages/contracts/openapi/notification.json packages/contracts/openapi/notification.json
COPY --from=build --chown=node:node /app/services/notification-service/dist/ services/notification-service/dist/
USER node
WORKDIR /app/services/notification-service
EXPOSE 3005
CMD ["node", "dist/main.js"]
