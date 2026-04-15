package repository

import (
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"light-oss/backend/internal/model"
)

func TestApplyBucketSearchFilterUsesPortableEscapeClause(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{DryRun: true})
	if err != nil {
		t.Fatalf("open dry-run db: %v", err)
	}

	stmt := applyBucketSearchFilter(db.Model(&model.Bucket{}), "LOVE_%!").
		Order("created_at DESC").
		Find(&[]model.Bucket{}).
		Statement

	sql := stmt.SQL.String()
	if !strings.Contains(sql, "ESCAPE '!'") {
		t.Fatalf("expected portable escape clause, got %q", sql)
	}
	if strings.Contains(sql, `ESCAPE '\'`) {
		t.Fatalf("unexpected mysql-incompatible escape clause in %q", sql)
	}
	if len(stmt.Vars) != 1 {
		t.Fatalf("expected 1 query var, got %d", len(stmt.Vars))
	}
	if got, ok := stmt.Vars[0].(string); !ok || got != `%love!_!%!!%` {
		t.Fatalf("unexpected pattern var %#v", stmt.Vars[0])
	}
}
