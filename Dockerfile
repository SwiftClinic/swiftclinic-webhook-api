# Runtime Dockerfile using tsx (no TypeScript compile step)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund && npm install -D tsx
COPY . .
ENV NODE_ENV=production
ENV WEBHOOK_PORT=3002
EXPOSE 3002
CMD ["npx","tsx","src/index.ts"]
