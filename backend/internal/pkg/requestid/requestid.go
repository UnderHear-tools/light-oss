package requestid

import (
	"context"

	"github.com/google/uuid"
)

const HeaderName = "X-Request-ID"

type contextKey string

const requestIDKey contextKey = "request_id"

func New() string {
	return uuid.NewString()
}

func With(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, requestIDKey, requestID)
}

func Get(ctx context.Context) string {
	value, _ := ctx.Value(requestIDKey).(string)
	return value
}
