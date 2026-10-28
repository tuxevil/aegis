FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY backend.js celec.js mazar.js history.js sources.js assessment.js feature-flags.js notification-safety.js backup.js frontend.html ./
COPY *.test.js ./
COPY public/ ./public/
COPY api/ ./api/
COPY storage/ ./storage/
COPY reports/ ./reports/
COPY schedules/ ./schedules/
COPY push/ ./push/
COPY feeds/ ./feeds/
COPY hazards/ ./hazards/
COPY alerts/ ./alerts/
COPY scripts/ ./scripts/
COPY demo/ ./demo/
COPY replay/ ./replay/
COPY docs/ ./docs/
COPY examples/ ./examples/
COPY test/ ./test/
COPY test-support/ ./test-support/
ENV DATA_DIR=/data
ENV DB_DIR=/data/v5
VOLUME ["/data"]
EXPOSE 3010
CMD ["node", "backend.js"]
