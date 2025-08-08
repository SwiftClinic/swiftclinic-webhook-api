# Runtime Dockerfile using tsx (no TypeScript compile step)
############################################
# Build stage: compile TypeScript to JS
############################################
FROM node:20-slim AS build
WORKDIR /app

# Install all deps (incl. dev) for compilation
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy sources and compile
COPY tsconfig.json ./
COPY src ./src
COPY shared ./shared
RUN npm run build

# Prune dev deps for a lean runtime
RUN npm prune --omit=dev

############################################
# Runtime stage: run compiled JS only
############################################
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV WEBHOOK_PORT=3002

# Copy production node_modules and compiled dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3002
CMD ["node","dist/src/index.js"]
