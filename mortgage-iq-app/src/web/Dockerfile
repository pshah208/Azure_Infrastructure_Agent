FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Template is rendered at container start with ${ORCHESTRATOR_URL} from the env.
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Default so the image runs standalone; overridden by the container app env.
ENV ORCHESTRATOR_URL=http://localhost:8000
EXPOSE 80
