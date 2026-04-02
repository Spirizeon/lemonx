FROM node:22-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY vitest.config.ts ./
COPY src ./src
COPY tests ./tests

CMD ["npx", "tsx", "src/index.ts"]
