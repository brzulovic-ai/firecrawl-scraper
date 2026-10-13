# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy configuration files and lockfiles
COPY package.json ./

# Install all dependencies (including devDependencies for esbuild)
RUN npm install

# Copy source files
COPY . .

# Build the client static assets and bundle the server.ts
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package.json to ensure external packages are resolved
COPY package.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy built assets and bundled server from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts

# Ensure data directory exists
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production

# Start the bundled server
CMD ["npm", "run", "start"]
