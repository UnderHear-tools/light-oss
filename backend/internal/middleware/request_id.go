package middleware

import (
	"github.com/gin-gonic/gin"

	"light-oss/backend/internal/pkg/requestid"
)

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(requestid.HeaderName)
		if id == "" {
			id = requestid.New()
		}

		c.Request = c.Request.WithContext(requestid.With(c.Request.Context(), id))
		c.Writer.Header().Set(requestid.HeaderName, id)
		c.Next()
	}
}
