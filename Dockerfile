FROM node:22-alpine

WORKDIR /app

# Copy package config and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY backend.js celec.js mazar.js history.js sources.js assessment.js feature-flags.js frontend.html ./
COPY api/ ./api/
COPY storage/ ./storage/
COPY scripts/ ./scripts/
COPY demo/ ./demo/
COPY public/ ./public/

ENV DATA_DIR=/data
ENV DB_DIR=/data/v5
VOLUME ["/data"]

# Expose standard port
EXPOSE 3010

# Run the app
CMD ["node", "backend.js"]
