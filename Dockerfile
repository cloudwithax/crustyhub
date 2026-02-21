FROM oven/bun AS base
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

VOLUME /data

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
