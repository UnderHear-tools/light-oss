package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/pkg/response"
)

type TokenValidator struct {
	allowed map[string]struct{}
}

func NewTokenValidator(tokens []string) *TokenValidator {
	allowed := make(map[string]struct{}, len(tokens))
	for _, token := range tokens {
		allowed[token] = struct{}{}
	}

	return &TokenValidator{allowed: allowed}
}

func (v *TokenValidator) RequireBearer() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !v.HasValidRequest(c.GetHeader("Authorization")) {
			response.Error(c, apperrors.New(http.StatusUnauthorized, "unauthorized", "missing or invalid bearer token"))
			c.Abort()
			return
		}

		c.Next()
	}
}

func (v *TokenValidator) HasValidBearer(c *gin.Context) bool {
	return v.HasValidRequest(c.GetHeader("Authorization"))
}

func (v *TokenValidator) HasValidRequest(authorization string) bool {
	parts := strings.SplitN(strings.TrimSpace(authorization), " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return false
	}

	_, ok := v.allowed[strings.TrimSpace(parts[1])]
	return ok
}
