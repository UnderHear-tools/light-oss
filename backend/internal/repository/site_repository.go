package repository

import (
	"context"
	"time"

	"gorm.io/gorm"

	"light-oss/backend/internal/model"
)

type SiteRepository struct {
	db *gorm.DB
}

func NewSiteRepository(db *gorm.DB) *SiteRepository {
	return &SiteRepository{db: db}
}

func (r *SiteRepository) WithDB(db *gorm.DB) *SiteRepository {
	if db == nil {
		return r
	}

	return &SiteRepository{db: db}
}

func (r *SiteRepository) Transaction(ctx context.Context, fn func(repo *SiteRepository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(r.WithDB(tx))
	})
}

func (r *SiteRepository) Create(ctx context.Context, site *model.Site, domains []string) (*model.Site, error) {
	now := time.Now().UTC()
	site.CreatedAt = now
	site.UpdatedAt = now

	if err := r.db.WithContext(ctx).Omit("Domains").Create(site).Error; err != nil {
		return nil, err
	}

	if err := r.replaceDomains(ctx, site.ID, domains, now); err != nil {
		return nil, err
	}

	return r.FindByID(ctx, site.ID)
}

func (r *SiteRepository) List(ctx context.Context) ([]model.Site, error) {
	var sites []model.Site
	err := r.db.WithContext(ctx).
		Preload("Domains", func(db *gorm.DB) *gorm.DB {
			return db.Order("domain ASC")
		}).
		Order("created_at DESC").
		Find(&sites).Error
	return sites, err
}

func (r *SiteRepository) FindByID(ctx context.Context, id uint64) (*model.Site, error) {
	var site model.Site
	err := r.db.WithContext(ctx).
		Preload("Domains", func(db *gorm.DB) *gorm.DB {
			return db.Order("domain ASC")
		}).
		First(&site, id).Error
	if err != nil {
		return nil, err
	}

	return &site, nil
}

func (r *SiteRepository) FindByDomain(ctx context.Context, domain string) (*model.Site, error) {
	var site model.Site
	err := r.db.WithContext(ctx).
		Joins("JOIN site_domains ON site_domains.site_id = sites.id").
		Where("site_domains.domain = ?", domain).
		Preload("Domains", func(db *gorm.DB) *gorm.DB {
			return db.Order("domain ASC")
		}).
		First(&site).Error
	if err != nil {
		return nil, err
	}

	return &site, nil
}

func (r *SiteRepository) Update(ctx context.Context, site *model.Site, domains []string) (*model.Site, error) {
	updates := map[string]any{
		"bucket_name":    site.BucketName,
		"root_prefix":    site.RootPrefix,
		"enabled":        site.Enabled,
		"index_document": site.IndexDocument,
		"error_document": site.ErrorDocument,
		"spa_fallback":   site.SPAFallback,
		"updated_at":     time.Now().UTC(),
	}

	result := r.db.WithContext(ctx).Model(&model.Site{}).Where("id = ?", site.ID).Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	if err := r.replaceDomains(ctx, site.ID, domains, time.Now().UTC()); err != nil {
		return nil, err
	}

	return r.FindByID(ctx, site.ID)
}

func (r *SiteRepository) Delete(ctx context.Context, id uint64) (bool, error) {
	if err := r.db.WithContext(ctx).Where("site_id = ?", id).Delete(&model.SiteDomain{}).Error; err != nil {
		return false, err
	}

	result := r.db.WithContext(ctx).Delete(&model.Site{}, id)
	return result.RowsAffected > 0, result.Error
}

func (r *SiteRepository) replaceDomains(ctx context.Context, siteID uint64, domains []string, now time.Time) error {
	if err := r.db.WithContext(ctx).Where("site_id = ?", siteID).Delete(&model.SiteDomain{}).Error; err != nil {
		return err
	}

	if len(domains) == 0 {
		return nil
	}

	items := make([]model.SiteDomain, 0, len(domains))
	for _, domain := range domains {
		items = append(items, model.SiteDomain{
			SiteID:    siteID,
			Domain:    domain,
			CreatedAt: now,
			UpdatedAt: now,
		})
	}

	return r.db.WithContext(ctx).Create(&items).Error
}
