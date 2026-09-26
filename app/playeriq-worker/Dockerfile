FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY app/playeriq-worker/package*.json ./
RUN npm ci --omit=dev

COPY app/playeriq-worker/src ./src

CMD ["node", "src/index.js"]
