FROM node:22-alpine AS vendor
WORKDIR /frontend
COPY app/playeriq-frontend/package.json app/playeriq-frontend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY app/playeriq-frontend/build.mjs ./
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=vendor /frontend/vendor/msal-browser.min.js /usr/share/nginx/html/vendor/msal-browser.min.js
COPY app/playeriq-frontend/index.html /usr/share/nginx/html/index.html
COPY app/playeriq-frontend/players.html /usr/share/nginx/html/players.html
COPY app/playeriq-frontend/report.js app/playeriq-frontend/upload.js app/playeriq-frontend/players.js app/playeriq-frontend/report.css /usr/share/nginx/html/
COPY app/playeriq-frontend/auth.js /usr/share/nginx/html/auth.js
COPY app/playeriq-frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
