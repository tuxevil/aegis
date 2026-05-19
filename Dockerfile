FROM node:22-alpine

WORKDIR /app

# Copy package config and install dependencies
COPY package.json ./
RUN npm install --production

# Copy application code
COPY backend.js frontend.html ./

# Expose standard port
EXPOSE 3010

# Run the app
CMD ["node", "backend.js"]