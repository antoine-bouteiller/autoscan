# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /autoscan
COPY . .

ARG FFMPEG_STATIC_URL=https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl xz-utils ca-certificates; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "$FFMPEG_STATIC_URL" -o /tmp/ffmpeg.tar.xz; \
    tar -C /tmp -xJf /tmp/ffmpeg.tar.xz; \
    mv /tmp/ffmpeg-*/ffmpeg /tmp/ffmpeg-*/ffprobe /usr/local/bin/; \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe; \
    rm -rf /tmp/ffmpeg*;

RUN apt-get purge -y --auto-remove curl xz-utils ca-certificates;
RUN rm -rf /var/lib/apt/lists/*

RUN bun install --frozen-lockfile --production

EXPOSE 3030
CMD [ "bun", "src/index.ts" ]