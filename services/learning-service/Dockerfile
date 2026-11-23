FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/auth/package.json ./packages/auth/
COPY services/learning-service/package.json ./services/learning-service/

RUN npm ci --workspace @lms/contracts --workspace @lms/auth \
    --workspace @lms/learning-service --include-workspace-root=false \
    --no-audit --no-fund

COPY packages/contracts/ ./packages/contracts/
COPY packages/auth/ ./packages/auth/
COPY services/learning-service/ ./services/learning-service/

RUN npm run build --workspace @lms/contracts \
    && npm run build --workspace @lms/auth \
    && npm run build --workspace @lms/learning-service

RUN npm prune --omit=dev --workspace @lms/contracts --workspace @lms/auth \
    --workspace @lms/learning-service --include-workspace-root=false \
    --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3004

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist/ ./packages/contracts/dist/
COPY --from=build /app/packages/contracts/fixtures/ids.json ./packages/contracts/fixtures/ids.json
COPY --from=build /app/packages/auth/package.json ./packages/auth/package.json
COPY --from=build /app/packages/auth/dist/ ./packages/auth/dist/
COPY --from=build /app/services/learning-service/package.json ./services/learning-service/package.json
COPY --from=build /app/services/learning-service/dist/ ./services/learning-service/dist/

USER node

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3004) + '/').then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "services/learning-service/dist/main.js"]
