FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

COPY app/playeriq-api/package*.json ./
RUN npm ci --omit=dev

COPY app/playeriq-api/src ./src
COPY data/playeriq/synthetic ./data/playeriq/synthetic

EXPOSE 80

CMD ["node", "src/server.js"]

