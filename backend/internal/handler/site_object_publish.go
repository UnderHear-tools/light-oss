package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	apperrors "light-oss/backend/internal/pkg/errors"
	"light-oss/backend/internal/pkg/response"
	"light-oss/backend/internal/service"
)

type publishObjectSiteRequest struct {
	Bucket        string   `json:"bucket"`
	ObjectKey     string   `json:"object_key"`
	Enabled       *bool    `json:"enabled"`
	ErrorDocument string   `json:"error_document"`
	SPAFallback   *bool    `json:"spa_fallback"`
	Domains       []string `json:"domains"`
}

func (h *apiHandler) publishObjectSite(c *gin.Context) {
	var req publishObjectSiteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, apperrors.New(http.StatusBadRequest, "invalid_request", "request body is invalid"))
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	spaFallback := true
	if req.SPAFallback != nil {
		spaFallback = *req.SPAFallback
	}

	site, err := h.sitePublishService.PublishObject(c.Request.Context(), service.PublishObjectSiteInput{
		BucketName:    req.Bucket,
		ObjectKey:     req.ObjectKey,
		Enabled:       enabled,
		ErrorDocument: req.ErrorDocument,
		SPAFallback:   spaFallback,
		Domains:       req.Domains,
	})
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusCreated, siteToResponse(*site))
}
