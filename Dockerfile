FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY dashboard/package.json ./dashboard/package.json
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["sh", "-c", "npm run db:migrate && exec npm start"]
