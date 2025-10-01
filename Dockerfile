# Multi-stage build for NS MCP Server
# Stage 1: Build the application
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json tsconfig.json ./

# Copy source code (needed before npm ci because prepare script runs build)
COPY src ./src

# Install all dependencies (including devDependencies for build)
# This will also run the prepare script which builds the project
RUN npm ci

# Stage 2: Create the production image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy built files from the builder stage
COPY --from=builder /app/build /app/build
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

# Install only production dependencies (skip scripts since build is already done)
RUN npm ci --omit=dev --ignore-scripts

# Expose port (Smithery uses PORT environment variable, defaults to 8081)
EXPOSE 8081

# Set environment variable for port
ENV PORT=8081

# Define the command to run the HTTP server
CMD ["node", "build/http-server.js"]
