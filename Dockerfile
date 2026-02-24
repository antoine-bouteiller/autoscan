# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /autoscan

FROM base AS prerelease
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build

# Download ffmpeg static binaries (cached layer - changes rarely)
FROM base AS ffmpeg
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl xz-utils ca-certificates; \
    ARCH=$(dpkg --print-architecture); \
    case "$ARCH" in \
      amd64) FFMPEG_ARCH="amd64" ;; \
      arm64) FFMPEG_ARCH="arm64" ;; \
      *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac; \
    curl -fsSL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${FFMPEG_ARCH}-static.tar.xz" -o /tmp/ffmpeg.tar.xz; \
    tar -C /tmp -xJf /tmp/ffmpeg.tar.xz; \
    mv /tmp/ffmpeg-*/ffmpeg /tmp/ffmpeg-*/ffprobe /usr/local/bin/; \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe; \
    rm -rf /tmp/ffmpeg*; \
    apt-get purge -y --auto-remove curl xz-utils ca-certificates; \
    rm -rf /var/lib/apt/lists/*

# copy production dependencies and source code into final image
FROM gcr.io/distroless/cc-debian12 AS release
WORKDIR /autoscan

# Copy ffmpeg binaries from ffmpeg stage
COPY --from=ffmpeg /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /usr/local/bin/ffprobe /usr/local/bin/ffprobe

COPY --from=prerelease /autoscan/index /autoscan/index
COPY --from=prerelease /autoscan/migrations /autoscan/migrations
COPY --from=prerelease /autoscan/resources /autoscan/resources

ENV DATABASE_URL=/autoscan/resources/autoscan.db

USER 1000

EXPOSE 3030
ENTRYPOINT ["./index"]
