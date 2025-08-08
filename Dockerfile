# Minimal Dockerfile to bypass Nixpacks/npm ci and run from compiled dist
FROM node:20-alpine
WORKDIR /app
# Only install production deps
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
# Copy compiled output only (we run from dist)
COPY dist ./dist
ENV NODE_ENV=production
# Railway will pass PORT env; default to 3002 locally
ENV WEBHOOK_PORT=3002
EXPOSE 3002
CMD ["node","dist/webhook-api/src/index.js"]
