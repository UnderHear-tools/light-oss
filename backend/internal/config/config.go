package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	AppEnv                         string
	AppAddr                        string
	PublicBaseURL                  string
	DatabaseDSN                    string
	DatabaseMaxOpenConns           int
	DatabaseMaxIdleConns           int
	DatabaseConnMaxLifetimeMinutes int
	StorageRoot                    string
	MaxUploadSizeBytes             int64
	MaxMultipartMemoryBytes        int64
	RateLimitRPS                   float64
	RateLimitBurst                 int
	CORSAllowedOrigins             []string
	BearerTokens                   []string
	SigningSecret                  string
	DefaultSignedURLTTLSeconds     int64
	MaxSignedURLTTLSeconds         int64
	ReadHeaderTimeoutSeconds       int
	ShutdownTimeoutSeconds         int
}

func Load() (Config, error) {
	v := viper.New()
	v.AutomaticEnv()

	v.SetDefault("APP_ENV", "development")
	v.SetDefault("APP_ADDR", ":8080")
	v.SetDefault("APP_PUBLIC_BASE_URL", "http://localhost:8080")
	v.SetDefault("DB_DSN", "root:112233ss@tcp(115.190.254.60:3306)/light-oss?charset=utf8mb4&parseTime=True&loc=UTC")
	v.SetDefault("DB_MAX_OPEN_CONNS", 10)
	v.SetDefault("DB_MAX_IDLE_CONNS", 5)
	v.SetDefault("DB_CONN_MAX_LIFETIME_MINUTES", 30)
	v.SetDefault("APP_STORAGE_ROOT", `\light-oss-data\storage`)
	v.SetDefault("APP_MAX_UPLOAD_SIZE_BYTES", int64(50*1024*1024))
	v.SetDefault("APP_MAX_MULTIPART_MEMORY_BYTES", int64(8*1024*1024))
	v.SetDefault("APP_RATE_LIMIT_RPS", 5.0)
	v.SetDefault("APP_RATE_LIMIT_BURST", 10)
	v.SetDefault("APP_CORS_ALLOWED_ORIGINS", "http://localhost:3000")
	v.SetDefault("APP_BEARER_TOKENS", "dev-token")
	v.SetDefault("APP_SIGNING_SECRET", "dev-signing-secret")
	v.SetDefault("APP_DEFAULT_SIGNED_URL_TTL_SECONDS", 300)
	v.SetDefault("APP_MAX_SIGNED_URL_TTL_SECONDS", 86400)
	v.SetDefault("APP_READ_HEADER_TIMEOUT_SECONDS", 10)
	v.SetDefault("APP_SHUTDOWN_TIMEOUT_SECONDS", 10)

	cfg := Config{
		AppEnv:                         strings.ToLower(v.GetString("APP_ENV")),
		AppAddr:                        v.GetString("APP_ADDR"),
		PublicBaseURL:                  strings.TrimRight(v.GetString("APP_PUBLIC_BASE_URL"), "/"),
		DatabaseDSN:                    v.GetString("DB_DSN"),
		DatabaseMaxOpenConns:           v.GetInt("DB_MAX_OPEN_CONNS"),
		DatabaseMaxIdleConns:           v.GetInt("DB_MAX_IDLE_CONNS"),
		DatabaseConnMaxLifetimeMinutes: v.GetInt("DB_CONN_MAX_LIFETIME_MINUTES"),
		StorageRoot:                    v.GetString("APP_STORAGE_ROOT"),
		MaxUploadSizeBytes:             v.GetInt64("APP_MAX_UPLOAD_SIZE_BYTES"),
		MaxMultipartMemoryBytes:        v.GetInt64("APP_MAX_MULTIPART_MEMORY_BYTES"),
		RateLimitRPS:                   v.GetFloat64("APP_RATE_LIMIT_RPS"),
		RateLimitBurst:                 v.GetInt("APP_RATE_LIMIT_BURST"),
		CORSAllowedOrigins:             splitCSV(v.GetString("APP_CORS_ALLOWED_ORIGINS")),
		BearerTokens:                   splitCSV(v.GetString("APP_BEARER_TOKENS")),
		SigningSecret:                  v.GetString("APP_SIGNING_SECRET"),
		DefaultSignedURLTTLSeconds:     v.GetInt64("APP_DEFAULT_SIGNED_URL_TTL_SECONDS"),
		MaxSignedURLTTLSeconds:         v.GetInt64("APP_MAX_SIGNED_URL_TTL_SECONDS"),
		ReadHeaderTimeoutSeconds:       v.GetInt("APP_READ_HEADER_TIMEOUT_SECONDS"),
		ShutdownTimeoutSeconds:         v.GetInt("APP_SHUTDOWN_TIMEOUT_SECONDS"),
	}

	switch {
	case cfg.DatabaseDSN == "":
		return Config{}, fmt.Errorf("DB_DSN is required")
	case cfg.StorageRoot == "":
		return Config{}, fmt.Errorf("APP_STORAGE_ROOT is required")
	case len(cfg.BearerTokens) == 0:
		return Config{}, fmt.Errorf("APP_BEARER_TOKENS is required")
	case cfg.SigningSecret == "":
		return Config{}, fmt.Errorf("APP_SIGNING_SECRET is required")
	case cfg.MaxUploadSizeBytes <= 0:
		return Config{}, fmt.Errorf("APP_MAX_UPLOAD_SIZE_BYTES must be greater than zero")
	case cfg.RateLimitRPS <= 0:
		return Config{}, fmt.Errorf("APP_RATE_LIMIT_RPS must be greater than zero")
	case cfg.RateLimitBurst <= 0:
		return Config{}, fmt.Errorf("APP_RATE_LIMIT_BURST must be greater than zero")
	}

	return cfg, nil
}

func splitCSV(input string) []string {
	if input == "" {
		return nil
	}

	parts := strings.Split(input, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			values = append(values, part)
		}
	}

	return values
}
