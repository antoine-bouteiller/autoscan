# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /autoscan

FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS prerelease
COPY . .

# Download ffmpeg static binaries (cached layer - changes rarely)
FROM base AS ffmpeg
ARG FFMPEG_STATIC_URL=https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl xz-utils ca-certificates; \
    curl -fsSL "$FFMPEG_STATIC_URL" -o /tmp/ffmpeg.tar.xz; \
    tar -C /tmp -xJf /tmp/ffmpeg.tar.xz; \
    mv /tmp/ffmpeg-*/ffmpeg /tmp/ffmpeg-*/ffprobe /usr/local/bin/; \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe; \
    rm -rf /tmp/ffmpeg*; \
    apt-get purge -y --auto-remove curl xz-utils ca-certificates; \
    rm -rf /var/lib/apt/lists/*

# copy production dependencies and source code into final image
FROM base AS release

# Copy ffmpeg binaries from ffmpeg stage
COPY --from=ffmpeg /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /usr/local/bin/ffprobe /usr/local/bin/ffprobe

# Copy dependencies and source code (changes frequently - at the end)
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /autoscan/src src
COPY --from=prerelease /autoscan/migrations migrations
COPY --from=prerelease /autoscan/package.json package.json
COPY --from=prerelease /autoscan/tsconfig.json tsconfig.json

# run the app
USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "src/index.ts" ]