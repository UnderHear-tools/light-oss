package handler

import (
	"context"
	"database/sql"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"light-oss/backend/internal/config"
	"light-oss/backend/internal/middleware"
	"light-oss/backend/internal/model"
	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/pkg/response"
	"light-oss/backend/internal/service"
)

type Dependencies struct {
	Config        config.Config
	Logger        *zap.Logger
	DB            *sql.DB
	GormDB        *gorm.DB
	AuthValidator *middleware.TokenValidator
	BucketService *service.BucketService
	ObjectService *service.ObjectService
	SignService   *service.SignService
}

type apiHandler struct {
	cfg           config.Config
	logger        *zap.Logger
	db            *sql.DB
	gormDB        *gorm.DB
	authValidator *middleware.TokenValidator
	bucketService *service.BucketService
	objectService *service.ObjectService
	signService   *service.SignService
}

type createBucketRequest struct {
	Name string `json:"name"`
}

type signDownloadRequest struct {
	Bucket           string `json:"bucket"`
	ObjectKey        string `json:"object_key"`
	ExpiresInSeconds int64  `json:"expires_in_seconds"`
}

type bucketResponse struct {
	ID        uint64    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type objectResponse struct {
	ID               uint64    `json:"id"`
	BucketName       string    `json:"bucket_name"`
	ObjectKey        string    `json:"object_key"`
	OriginalFilename string    `json:"original_filename"`
	Size             int64     `json:"size"`
	ContentType      string    `json:"content_type"`
	ETag             string    `json:"etag"`
	Visibility       string    `json:"visibility"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func NewRouter(deps Dependencies) *gin.Engine {
	router := gin.New()
	router.MaxMultipartMemory = deps.Config.MaxMultipartMemoryBytes

	handler := &apiHandler{
		cfg:           deps.Config,
		logger:        deps.Logger,
		db:            deps.DB,
		gormDB:        deps.GormDB,
		authValidator: deps.AuthValidator,
		bucketService: deps.BucketService,
		objectService: deps.ObjectService,
		signService:   deps.SignService,
	}

	rateLimiter := middleware.NewRateLimiter(deps.Config.RateLimitRPS, deps.Config.RateLimitBurst)

	router.Use(middleware.RequestID())
	router.Use(gin.Recovery())
	router.Use(middleware.RequestLogger(deps.Logger))
	router.Use(rateLimiter.Middleware())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     deps.Config.CORSAllowedOrigins,
		AllowMethods:     []string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Object-Visibility", "X-Original-Filename", "X-Request-ID"},
		ExposeHeaders:    []string{"Content-Length", "Content-Type", "ETag", "X-Request-ID", "X-Object-Visibility", "X-Original-Filename"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	router.GET("/healthz", handler.healthz)

	api := router.Group("/api/v1")
	api.GET("/buckets/:bucket/objects/*key", handler.downloadObject)
	api.HEAD("/buckets/:bucket/objects/*key", handler.headObject)

	protected := api.Group("")
	protected.Use(deps.AuthValidator.RequireBearer())
	protected.POST("/buckets", handler.createBucket)
	protected.GET("/buckets", handler.listBuckets)
	protected.PUT("/buckets/:bucket/objects/*key", middleware.MaxBodySize(deps.Config.MaxUploadSizeBytes), handler.uploadObject)
	protected.GET("/buckets/:bucket/objects", handler.listObjects)
	protected.DELETE("/buckets/:bucket/objects/*key", handler.deleteObject)
	protected.POST("/sign/download", handler.signDownload)

	return router
}

func (h *apiHandler) healthz(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	dbStatus := "ok"
	statusCode := http.StatusOK
	if _, err := h.bucketService.List(ctx); err != nil {
		dbStatus = "error"
		statusCode = http.StatusServiceUnavailable
		h.logger.Error("healthz bucket query failed", zap.Error(err))
	}

	response.JSON(c, statusCode, gin.H{
		"status": gin.H{
			"service": "ok",
			"db":      dbStatus,
		},
		"version": "mvp",
	})
}

func (h *apiHandler) createBucket(c *gin.Context) {
	var req createBucketRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.New(http.StatusBadRequest, "invalid_request", "request body is invalid"))
		return
	}

	bucket, err := h.bucketService.Create(c.Request.Context(), req.Name)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusCreated, bucketToResponse(*bucket))
}

func (h *apiHandler) listBuckets(c *gin.Context) {
	buckets, err := h.bucketService.List(c.Request.Context())
	if err != nil {
		response.Error(c, err)
		return
	}

	items := make([]bucketResponse, 0, len(buckets))
	for _, bucket := range buckets {
		items = append(items, bucketToResponse(bucket))
	}

	response.JSON(c, http.StatusOK, gin.H{"items": items})
}

func (h *apiHandler) uploadObject(c *gin.Context) {
	object, err := h.objectService.Upload(c.Request.Context(), service.UploadObjectInput{
		BucketName:       c.Param("bucket"),
		ObjectKey:        normalizeObjectKey(c.Param("key")),
		Visibility:       c.GetHeader("X-Object-Visibility"),
		OriginalFilename: c.GetHeader("X-Original-Filename"),
		ContentType:      c.GetHeader("Content-Type"),
		Body:             c.Request.Body,
	})
	if err != nil {
		if strings.Contains(err.Error(), "http: request body too large") {
			response.Error(c, apperrors.New(http.StatusRequestEntityTooLarge, "payload_too_large", "request body exceeds configured upload size"))
			return
		}

		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusCreated, objectToResponse(*object))
}

func (h *apiHandler) listObjects(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	result, err := h.objectService.List(c.Request.Context(), service.ListObjectsInput{
		BucketName: c.Param("bucket"),
		Prefix:     c.Query("prefix"),
		Limit:      limit,
		Cursor:     c.Query("cursor"),
	})
	if err != nil {
		response.Error(c, err)
		return
	}

	items := make([]objectResponse, 0, len(result.Items))
	for _, object := range result.Items {
		items = append(items, objectToResponse(object))
	}

	response.JSON(c, http.StatusOK, gin.H{
		"items":       items,
		"next_cursor": result.NextCursor,
	})
}

func (h *apiHandler) deleteObject(c *gin.Context) {
	if err := h.objectService.Delete(c.Request.Context(), c.Param("bucket"), normalizeObjectKey(c.Param("key"))); err != nil {
		response.Error(c, err)
		return
	}

	response.NoContent(c, http.StatusNoContent)
}

func (h *apiHandler) headObject(c *gin.Context) {
	h.serveObject(c, true)
}

func (h *apiHandler) downloadObject(c *gin.Context) {
	h.serveObject(c, false)
}

func (h *apiHandler) serveObject(c *gin.Context, headOnly bool) {
	bucketName := c.Param("bucket")
	objectKey := normalizeObjectKey(c.Param("key"))

	object, reader, err := h.objectService.Open(c.Request.Context(), bucketName, objectKey)
	if err != nil {
		response.Error(c, err)
		return
	}
	defer func() {
		if reader != nil {
			_ = reader.Close()
		}
	}()

	if object.Visibility == model.VisibilityPrivate {
		if headOnly {
			if !h.authValidator.HasValidBearer(c) {
				response.Error(c, apperrors.New(http.StatusUnauthorized, "unauthorized", "missing or invalid bearer token"))
				return
			}
		} else if !h.authValidator.HasValidBearer(c) {
			expiresAt, _ := strconv.ParseInt(c.Query("expires"), 10, 64)
			if err := h.signService.VerifyDownload(bucketName, objectKey, expiresAt, c.Query("signature")); err != nil {
				response.Error(c, err)
				return
			}
		}
	}

	setObjectHeaders(c, object)
	if headOnly {
		c.Status(http.StatusOK)
		return
	}

	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, reader); err != nil {
		h.logger.Error("stream object", zap.Error(err))
	}
}

func (h *apiHandler) signDownload(c *gin.Context) {
	var req signDownloadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.New(http.StatusBadRequest, "invalid_request", "request body is invalid"))
		return
	}

	url, expiresAt, err := h.signService.GenerateDownloadURL(req.Bucket, req.ObjectKey, req.ExpiresInSeconds)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusOK, gin.H{
		"url":        url,
		"expires_at": expiresAt,
	})
}

func bucketToResponse(bucket model.Bucket) bucketResponse {
	return bucketResponse{
		ID:        bucket.ID,
		Name:      bucket.Name,
		CreatedAt: bucket.CreatedAt,
		UpdatedAt: bucket.UpdatedAt,
	}
}

func objectToResponse(object model.Object) objectResponse {
	return objectResponse{
		ID:               object.ID,
		BucketName:       object.BucketName,
		ObjectKey:        object.ObjectKey,
		OriginalFilename: object.OriginalFilename,
		Size:             object.Size,
		ContentType:      object.ContentType,
		ETag:             object.ETag,
		Visibility:       string(object.Visibility),
		CreatedAt:        object.CreatedAt,
		UpdatedAt:        object.UpdatedAt,
	}
}

func normalizeObjectKey(raw string) string {
	return strings.TrimPrefix(raw, "/")
}

func setObjectHeaders(c *gin.Context, object *model.Object) {
	c.Header("Content-Type", object.ContentType)
	c.Header("Content-Length", strconv.FormatInt(object.Size, 10))
	c.Header("ETag", object.ETag)
	c.Header("X-Object-Visibility", string(object.Visibility))
	c.Header("X-Original-Filename", object.OriginalFilename)
}
