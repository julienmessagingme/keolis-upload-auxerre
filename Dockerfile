FROM node:20-alpine

# bcrypt needs build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source code
COPY src/ ./src/
COPY public/ ./public/

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "src/server.js"]
