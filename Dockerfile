FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /tiny-arena-server .

# assets are embedded in the binary — nothing else to ship
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /tiny-arena-server /tiny-arena-server
EXPOSE 3377
ENTRYPOINT ["/tiny-arena-server"]
