# Build from the repository root: shared npm workspaces are required.
FROM node:24-bookworm-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY services/identity-service/package.json services/identity-service/package.json
COPY services/course-service/package.json services/course-service/package.json
COPY services/quiz-service/package.json services/quiz-service/package.json
COPY services/learning-service/package.json services/learning-service/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/auth/package.json packages/auth/package.json

FROM manifests AS build
RUN npm ci --workspace=@lms/identity-service --workspace=@lms/contracts --include-workspace-root=false
COPY packages/contracts/ packages/contracts/
COPY services/identity-service/ services/identity-service/
RUN npm run build --workspace=@lms/contracts \
    && npm run build --workspace=@lms/identity-service

FROM manifests AS production-dependencies
ENV NODE_ENV=production
RUN npm ci --omit=dev --workspace=@lms/identity-service --workspace=@lms/contracts --include-workspace-root=false \
    && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/ ./
COPY --from=build --chown=node:node /app/packages/contracts/dist/ packages/contracts/dist/
COPY --from=build --chown=node:node /app/packages/contracts/fixtures/ids.json packages/contracts/fixtures/ids.json
COPY --from=build --chown=node:node /app/packages/contracts/openapi/identity.json packages/contracts/openapi/identity.json
COPY --from=build --chown=node:node /app/services/identity-service/dist/ services/identity-service/dist/
USER node
WORKDIR /app/services/identity-service
EXPOSE 3001
CMD ["node", "dist/main.js"]