FROM oven/bun:1 AS web-build
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install
COPY web/ ./
RUN bun run build

FROM oven/bun:1 AS server-deps
WORKDIR /app
COPY server/package.json server/bun.lock ./
RUN bun install --production

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=server-deps /app/node_modules ./node_modules
COPY server/src ./src
COPY --from=web-build /app/web/dist ./public
RUN mkdir -p /app/data/notes /app/data/uploads
EXPOSE 3000
CMD ["bun", "src/index.ts"]
