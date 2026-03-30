package repository

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"light-oss/backend/internal/model"
)

func TestSiteRepositoryFindByDomainPreloadsDomains(t *testing.T) {
	dsn := fmt.Sprintf("file:%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.Site{}, &model.SiteDomain{}); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}

	repo := NewSiteRepository(db)
	ctx := context.Background()

	var created *model.Site
	if err := repo.Transaction(ctx, func(txRepo *SiteRepository) error {
		var createErr error
		created, createErr = txRepo.Create(ctx, &model.Site{
			BucketName:    "websites",
			RootPrefix:    "demo/",
			Enabled:       true,
			IndexDocument: "index.html",
			ErrorDocument: "",
			SPAFallback:   false,
		}, []string{"www.underhear.cn", "demo.underhear.cn"})
		return createErr
	}); err != nil {
		t.Fatalf("create site: %v", err)
	}

	site, err := repo.FindByDomain(ctx, "demo.underhear.cn")
	if err != nil {
		t.Fatalf("find by domain: %v", err)
	}
	if site.ID != created.ID {
		t.Fatalf("expected site id %d, got %d", created.ID, site.ID)
	}
	if len(site.Domains) != 2 {
		t.Fatalf("expected 2 domains, got %d", len(site.Domains))
	}
	if site.Domains[0].Domain != "demo.underhear.cn" {
		t.Fatalf("expected domains to be sorted, got %+v", site.Domains)
	}
}

func TestSiteRepositoryDuplicateDomainFails(t *testing.T) {
	dsn := fmt.Sprintf("file:%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.Site{}, &model.SiteDomain{}); err != nil {
		t.Fatalf("migrate sqlite: %v", err)
	}

	repo := NewSiteRepository(db)
	ctx := context.Background()

	if err := repo.Transaction(ctx, func(txRepo *SiteRepository) error {
		_, createErr := txRepo.Create(ctx, &model.Site{
			BucketName:    "websites",
			RootPrefix:    "demo/",
			Enabled:       true,
			IndexDocument: "index.html",
		}, []string{"demo.underhear.cn"})
		return createErr
	}); err != nil {
		t.Fatalf("create site: %v", err)
	}

	err = repo.Transaction(ctx, func(txRepo *SiteRepository) error {
		_, createErr := txRepo.Create(ctx, &model.Site{
			BucketName:    "websites",
			RootPrefix:    "other/",
			Enabled:       true,
			IndexDocument: "index.html",
		}, []string{"demo.underhear.cn"})
		return createErr
	})
	if err == nil {
		t.Fatalf("expected duplicate domain error")
	}
}
