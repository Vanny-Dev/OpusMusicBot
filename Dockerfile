# Use Node.js 18 (stable version with good @discordjs/opus support)
FROM node:18-alpine

# Install Python and build tools for native dependencies
RUN apk add --no-cache python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev

# Set working directory
WORKDIR /app

# Copy package files first (for better Docker layer caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001
USER botuser

# Start the bot
CMD ["node", "index.js"]