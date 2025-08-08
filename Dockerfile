############################################
# Runtime Dockerfile using tsx (no TypeScript compile step)
# Deterministic, single-stage image that runs TS directly
############################################
FROM node:20-slim
WORKDIR /app

# Install deps (incl. dev) so tsx is available at runtime
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy sources and tsconfig (tsx reads tsconfig for path/ts features)
COPY tsconfig.json ./
COPY src ./src
COPY shared ./shared

ENV NODE_ENV=production
ENV WEBHOOK_PORT=3002
EXPOSE 3002

# Start the webhook using tsx directly (no build step)
CMD ["npx","tsx","src/index.ts"]
