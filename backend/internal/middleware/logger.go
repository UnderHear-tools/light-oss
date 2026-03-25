package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"light-oss/backend/internal/pkg/requestid"
)

type responseWriter struct {
	gin.ResponseWriter
	status int
}

func (w *responseWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func RequestLogger(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		wrapped := &responseWriter{ResponseWriter: c.Writer, status: 200}
		c.Writer = wrapped

		c.Next()

		logger.Info("http_request",
			zap.String("request_id", requestid.Get(c.Request.Context())),
			zap.String("method", c.Request.Method),
			zap.String("path", c.FullPath()),
			zap.Int("status", wrapped.status),
			zap.Duration("duration", time.Since(started)),
			zap.String("client_ip", c.ClientIP()),
		)
	}
}
