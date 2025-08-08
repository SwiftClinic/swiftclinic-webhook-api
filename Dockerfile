# Runtime Dockerfile using tsx (no TypeScript compile step)
FROM node:20-alpine
WORKDIR /app

# Install deps only
COPY package*.json ./
RUN npm install --no-audit --no-fund && npm install -D tsx

# Copy application source explicitly
COPY tsconfig.json ./
COPY src ./src
COPY shared ./shared

ENV NODE_ENV=production
ENV WEBHOOK_PORT=3002
EXPOSE 3002

# Run TypeScript directly via tsx (no build step)
CMD ["npx","tsx","src/index.ts"]
