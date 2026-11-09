package db

import (
	"context"
	"database/sql"
	"path/filepath"
	"slices"
	"testing"
	"testing/fstest"
)

func openTemp(t *testing.T) *sql.DB {
	t.Helper()
	conn, err := Open(context.Background(), filepath.Join(t.TempDir(), "nested", "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

func recorded(t *testing.T, conn *sql.DB) []int {
	t.Helper()
	rows, err := conn.Query(`SELECT version FROM schema_migrations ORDER BY version`)
	if err != nil {
		t.Fatalf("read schema_migrations: %v", err)
	}
	defer func() { _ = rows.Close() }()
	var out []int
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			t.Fatal(err)
		}
		out = append(out, v)
	}
	return out
}

func TestMigrateEmbeddedIsIdempotent(t *testing.T) {
	ctx := context.Background()
	conn := openTemp(t)

	var all []int
	for _, m := range mustLoad(t) {
		all = append(all, m.Version)
	}
	if len(all) < 2 || all[0] != 1 {
		t.Fatalf("embedded migrations %v, want 1 (schema_migrations) and the later ones", all)
	}
	applied, err := Migrate(ctx, conn, Migrations)
	if err != nil {
		t.Fatalf("first Migrate: %v", err)
	}
	if !slices.Equal(applied, all) {
		t.Fatalf("first Migrate applied %v, want %v", applied, all)
	}
	if got := recorded(t, conn); !slices.Equal(got, all) {
		t.Fatalf("schema_migrations has %v, want %v", got, all)
	}

	applied, err = Migrate(ctx, conn, Migrations)
	if err != nil {
		t.Fatalf("second Migrate: %v", err)
	}
	if len(applied) != 0 {
		t.Fatalf("second Migrate applied %v, want nothing", applied)
	}
}

func TestMigrateAppliesInVersionOrderAndOnlyNewOnes(t *testing.T) {
	ctx := context.Background()
	conn := openTemp(t)
	base := firstMigration(t)
	// 0010 needs the table 0002 creates, so they must run in version order.
	base["0010_add_note.sql"] = &fstest.MapFile{Data: []byte(`ALTER TABLE things ADD COLUMN note TEXT;`)}
	base["0002_things.sql"] = &fstest.MapFile{Data: []byte(`CREATE TABLE things (id INTEGER PRIMARY KEY);`)}

	applied, err := Migrate(ctx, conn, base)
	if err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if !slices.Equal(applied, []int{1, 2, 10}) {
		t.Fatalf("applied %v, want [1 2 10]", applied)
	}

	base["0011_more.sql"] = &fstest.MapFile{Data: []byte(`CREATE TABLE more (id INTEGER PRIMARY KEY);`)}
	applied, err = Migrate(ctx, conn, base)
	if err != nil {
		t.Fatalf("Migrate again: %v", err)
	}
	if !slices.Equal(applied, []int{11}) {
		t.Fatalf("applied %v, want [11]", applied)
	}
	if got := recorded(t, conn); !slices.Equal(got, []int{1, 2, 10, 11}) {
		t.Fatalf("schema_migrations has %v, want [1 2 10 11]", got)
	}
}

func TestMigrateFailureRollsBackAndIsNotRecorded(t *testing.T) {
	ctx := context.Background()
	conn := openTemp(t)
	fsys := firstMigration(t)
	fsys["0002_broken.sql"] = &fstest.MapFile{Data: []byte(
		`CREATE TABLE half (id INTEGER PRIMARY KEY); THIS IS NOT SQL;`)}

	applied, err := Migrate(ctx, conn, fsys)
	if err == nil {
		t.Fatal("Migrate with a broken migration returned no error")
	}
	if !slices.Equal(applied, []int{1}) {
		t.Fatalf("applied %v, want [1]", applied)
	}
	if got := recorded(t, conn); !slices.Equal(got, []int{1}) {
		t.Fatalf("schema_migrations has %v, want [1]", got)
	}
	var n int
	if err := conn.QueryRow(`SELECT count(*) FROM sqlite_master WHERE name = 'half'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("the broken migration's table exists: it was not rolled back")
	}
}

func TestLoadRejectsBadNames(t *testing.T) {
	for name, fsys := range map[string]fstest.MapFS{
		"no version":        {"init.sql": {Data: []byte(`SELECT 1;`)}},
		"duplicate version": {"0001_a.sql": {Data: []byte(`SELECT 1;`)}, "1_b.sql": {Data: []byte(`SELECT 1;`)}},
	} {
		if _, err := Load(fsys); err == nil {
			t.Errorf("%s: Load returned no error", name)
		}
	}
}

func mustLoad(t *testing.T) []Migration {
	t.Helper()
	ms, err := Load(Migrations)
	if err != nil {
		t.Fatal(err)
	}
	return ms
}

// firstMigration is the embedded 0001 (it creates schema_migrations) alone, for tests that add their own.
func firstMigration(t *testing.T) fstest.MapFS {
	t.Helper()
	m := mustLoad(t)[0]
	if m.Version != 1 {
		t.Fatalf("first embedded migration is %s, want version 1", m.Name)
	}
	return fstest.MapFS{m.Name: &fstest.MapFile{Data: []byte(m.SQL)}}
}
