package service

import "testing"

func TestBuildStorageQuotaSnapshotStatuses(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name            string
		usedBytes       uint64
		maxBytes        uint64
		wantRemaining   uint64
		wantUsedPercent float64
		wantStatus      StorageLimitStatus
	}{
		{
			name:            "ok",
			usedBytes:       20,
			maxBytes:        100,
			wantRemaining:   80,
			wantUsedPercent: 20,
			wantStatus:      StorageLimitStatusOK,
		},
		{
			name:            "warning",
			usedBytes:       80,
			maxBytes:        100,
			wantRemaining:   20,
			wantUsedPercent: 80,
			wantStatus:      StorageLimitStatusWarning,
		},
		{
			name:            "exceeded",
			usedBytes:       120,
			maxBytes:        100,
			wantRemaining:   0,
			wantUsedPercent: 120,
			wantStatus:      StorageLimitStatusExceeded,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			snapshot := buildStorageQuotaSnapshot("/tmp/storage", tc.usedBytes, tc.maxBytes)

			if snapshot.RemainingBytes != tc.wantRemaining {
				t.Fatalf("expected remaining bytes %d, got %d", tc.wantRemaining, snapshot.RemainingBytes)
			}
			if snapshot.UsedPercent != tc.wantUsedPercent {
				t.Fatalf("expected used percent %.1f, got %.1f", tc.wantUsedPercent, snapshot.UsedPercent)
			}
			if snapshot.LimitStatus != tc.wantStatus {
				t.Fatalf("expected limit status %q, got %q", tc.wantStatus, snapshot.LimitStatus)
			}
		})
	}
}
