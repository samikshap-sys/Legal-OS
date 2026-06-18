FROM node:22-alpine

# Install pnpm
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Copy patches directory (needed for pnpm patched dependencies)
COPY patches/ ./patches/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build: vite (client) + esbuild (server)
RUN pnpm run build

# Expose port 8080
EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]
