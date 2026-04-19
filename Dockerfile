FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=5400
ENV PROFILE_STORAGE_PATH=/data/user-profile
EXPOSE 5400
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5400/healthz || exit 1
CMD ["node", "api/profile-server.js"]
