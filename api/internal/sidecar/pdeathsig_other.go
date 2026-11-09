//go:build !linux

package sidecar

import "os/exec"

// setParentDeathSignal: only Linux has a parent-death signal; elsewhere Run's SIGTERM on shutdown has to do.
func setParentDeathSignal(*exec.Cmd) {}
