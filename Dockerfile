# Stage 1: Build the React app
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app

# Vite bakes env vars into the bundle at build time. Anything the browser
# needs to know (API URL, OAuth URL) must be set HERE, not at runtime.
ARG VITE_API_URL
ARG VITE_OAUTH_BASE_URL
ARG VITE_APP_NAME
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_OAUTH_BASE_URL=${VITE_OAUTH_BASE_URL}
ENV VITE_APP_NAME=${VITE_APP_NAME}

# Copy package.json only (not package-lock.json to avoid platform mismatch)
COPY . .
RUN npm install
RUN npm run build

# Stage 2: Set up the runtime environment
FROM node:20-alpine
WORKDIR /app

# Build identity, served at /version.
#
# ENV rather than ARG in this stage because server.js reads them at RUNTIME.
# A build that omits them reports "unknown", which is correct for a local
# `docker build` and distinguishable from a stale deploy — rather than quietly
# claiming to be some commit.
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ARG BUILT_AT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_BRANCH=${GIT_BRANCH}
ENV BUILT_AT=${BUILT_AT}
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js .
COPY --from=builder /app/server.json ./package.json
RUN npm install --production \
 && chown -R 1000:1000 /app
 # 🔒 Switch to non-root user
USER 1000

EXPOSE 3000
CMD ["node", "server.js"]
