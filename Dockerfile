FROM node:22-alpine

WORKDIR /app

# Copy package config and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY backend.js celec.js mazar.js history.js sources.js assessment.js frontend.html ./
COPY public/ ./public/
COPY hazards/ ./hazards/
COPY alerts/ ./alerts/
COPY docs/design/openalert-channels.json ./docs/design/
COPY scripts/ ./scripts/
COPY replay/ ./replay/
COPY docs/contracts/source-envelope.v1.schema.json ./docs/contracts/

ENV DATA_DIR=/data
VOLUME ["/data"]

# Expose standard port
EXPOSE 3010

# Run the app
CMD ["node", "backend.js"]
