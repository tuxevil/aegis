FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY backend.js celec.js mazar.js history.js sources.js assessment.js feature-flags.js notification-safety.js backup.js frontend.html ./
COPY staging-backup.js ./
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
COPY deploy/staging/shadow-lab.plan.json ./deploy/staging/shadow-lab.plan.json
COPY examples/ ./examples/
COPY test/ ./test/
COPY test-support/ ./test-support/
ENV DATA_DIR=/data
ENV DB_DIR=/data/v5
RUN mkdir -p /data /backups /restore && chown node:node /data /backups /restore && chmod 700 /data /backups /restore
USER node
VOLUME ["/data"]
EXPOSE 3010
CMD ["node", "backend.js"]
