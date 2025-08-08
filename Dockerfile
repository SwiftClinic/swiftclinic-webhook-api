# Build inside Docker from source (no npm ci)
FROM node:20-alpine
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy sources and config
COPY tsconfig.json ./
COPY src ./src
COPY shared ./shared

ENV NODE_ENV=production
ENV WEBHOOK_PORT=3002

# Build TypeScript
RUN npm run build

EXPOSE 3002
CMD ["node","dist/src/index.js"]
