package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"

	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/pkg/response"
)

type RateLimiter struct {
	rps      rate.Limit
	burst    int
	mu       sync.Mutex
	limiters map[string]*rate.Limiter
}

func NewRateLimiter(rps float64, burst int) *RateLimiter {
	return &RateLimiter{
		rps:      rate.Limit(rps),
		burst:    burst,
		limiters: make(map[string]*rate.Limiter),
	}
}

func (r *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		limiter := r.getLimiter(rateLimitKey(c))
		if !limiter.Allow() {
			response.Error(c, apperrors.New(http.StatusTooManyRequests, "rate_limited", "rate limit exceeded"))
			c.Abort()
			return
		}

		c.Next()
	}
}

func (r *RateLimiter) getLimiter(key string) *rate.Limiter {
	r.mu.Lock()
	defer r.mu.Unlock()

	limiter, ok := r.limiters[key]
	if !ok {
		limiter = rate.NewLimiter(r.rps, r.burst)
		r.limiters[key] = limiter
	}

	return limiter
}

func rateLimitKey(c *gin.Context) string {
	if auth := c.GetHeader("Authorization"); auth != "" {
		hash := sha256.Sum256([]byte(auth))
		return "token:" + hex.EncodeToString(hash[:])
	}

	return "ip:" + c.ClientIP()
}
