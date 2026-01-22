# Client build stage
FROM node:18-alpine AS client-builder

WORKDIR /client

COPY client/package*.json ./
RUN npm install

COPY client .
RUN npm run build

# Panel build stage
FROM golang:1.24-alpine AS panel-builder

WORKDIR /build

RUN apk add --no-cache git ca-certificates

COPY server/go.mod server/go.sum ./server/
RUN cd server && go mod download

COPY server ./server

RUN cd server && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -o panel


# Runtime stage
FROM gcr.io/distroless/base-debian12

WORKDIR /birdactyl

# Copy panel binary
COPY --from=panel-builder /build/server/panel /birdactyl/panel

# Copy client build
COPY --from=client-builder /client/dist /birdactyl/client

# Volume for config, logs, plugins
VOLUME ["/birdactyl"]

# Panel port
EXPOSE 8080

# Optional: client static port if panel doesn't serve it internally
# EXPOSE 3000

ENTRYPOINT ["/birdactyl/panel"]
