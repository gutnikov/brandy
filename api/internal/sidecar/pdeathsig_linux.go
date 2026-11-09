package sidecar

import (
	"os/exec"
	"syscall"
)

// setParentDeathSignal makes Linux send SIGTERM to the sidecar if the API dies without stopping it.
func setParentDeathSignal(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Pdeathsig: syscall.SIGTERM}
}
