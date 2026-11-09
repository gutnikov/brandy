// Package db opens the SQLite database and applies the embedded migrations.
package db

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite" // registers the "sqlite" driver (pure Go, no cgo)
)

//go:embed migrations/*.sql
var embedded embed.FS

// Migrations are the SQL migrations built into the binary, one file per version: NNNN_name.sql.
var Migrations, _ = fs.Sub(embedded, "migrations")

// Open opens (and creates, if missing) the SQLite database file at path, creating its directory too.
func Open(ctx context.Context, path string) (*sql.DB, error) {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
	}
	q := url.Values{}
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "foreign_keys(1)")
	db, err := sql.Open("sqlite", "file:"+path+"?"+q.Encode())
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	// SQLite allows one writer at a time; one connection avoids "database is locked" between our own goroutines.
	db.SetMaxOpenConns(1)
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return db, nil
}

// Migration is one SQL file to apply.
type Migration struct {
	Version int
	Name    string
	SQL     string
}

// Load reads the migrations in fsys, sorted by version. File names must be NNNN_name.sql with unique versions.
func Load(fsys fs.FS) ([]Migration, error) {
	names, err := fs.Glob(fsys, "*.sql")
	if err != nil {
		return nil, err
	}
	var out []Migration
	seen := map[int]string{}
	for _, name := range names {
		prefix, _, ok := strings.Cut(name, "_")
		version, err := strconv.Atoi(prefix)
		if !ok || err != nil || version <= 0 {
			return nil, fmt.Errorf("migration %q: name must be NNNN_name.sql", name)
		}
		if other, dup := seen[version]; dup {
			return nil, fmt.Errorf("migrations %q and %q have the same version %d", other, name, version)
		}
		seen[version] = name
		body, err := fs.ReadFile(fsys, name)
		if err != nil {
			return nil, err
		}
		out = append(out, Migration{Version: version, Name: name, SQL: string(body)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })
	return out, nil
}

// Migrate applies the migrations in fsys that schema_migrations does not record yet, in version order, each in
// its own transaction together with its record. It returns the versions it applied. The first migration must
// create schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT).
func Migrate(ctx context.Context, db *sql.DB, fsys fs.FS) ([]int, error) {
	migrations, err := Load(fsys)
	if err != nil {
		return nil, err
	}
	done, err := appliedVersions(ctx, db)
	if err != nil {
		return nil, err
	}
	var applied []int
	for _, m := range migrations {
		if done[m.Version] {
			continue
		}
		if err := apply(ctx, db, m); err != nil {
			return applied, err
		}
		applied = append(applied, m.Version)
	}
	return applied, nil
}

func appliedVersions(ctx context.Context, db *sql.DB) (map[int]bool, error) {
	var n int
	err := db.QueryRowContext(ctx,
		`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`).Scan(&n)
	if err != nil {
		return nil, fmt.Errorf("look for schema_migrations: %w", err)
	}
	done := map[int]bool{}
	if n == 0 {
		return done, nil
	}
	rows, err := db.QueryContext(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, fmt.Errorf("read schema_migrations: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		done[v] = true
	}
	return done, rows.Err()
}

func apply(ctx context.Context, db *sql.DB, m Migration) (err error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			err = errors.Join(err, tx.Rollback())
		}
	}()
	if _, err = tx.ExecContext(ctx, m.SQL); err != nil {
		return fmt.Errorf("migration %s: %w", m.Name, err)
	}
	if _, err = tx.ExecContext(ctx,
		`INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
		m.Version, m.Name, time.Now().UTC().Format(time.RFC3339)); err != nil {
		return fmt.Errorf("record migration %s: %w", m.Name, err)
	}
	return tx.Commit()
}
