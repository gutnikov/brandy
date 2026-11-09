package server

import (
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// AuthProxy forwards requests to the auth sidecar at target (http://127.0.0.1:<AUTH_PORT>), path unchanged.
//
// It passes the client's IP to the sidecar as a single-value X-Forwarded-For: Better Auth rate-limits sign-in and
// sign-up per IP and trusts that header only when it holds one address. behindProxy (on Railway) takes the IP
// from the edge proxy's headers; otherwise it is the connection's address and client-sent headers are ignored.
func AuthProxy(target *url.URL, behindProxy bool, log *slog.Logger) http.Handler {
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			pr.Out.Host = pr.In.Host
			pr.Out.Header.Set("X-Forwarded-For", ClientIP(pr.In, behindProxy))
			proto := "http"
			if pr.In.TLS != nil {
				proto = "https"
			}
			if behindProxy && pr.In.Header.Get("X-Forwarded-Proto") != "" {
				proto = pr.In.Header.Get("X-Forwarded-Proto")
			}
			pr.Out.Header.Set("X-Forwarded-Proto", proto)
			pr.Out.Header.Set("X-Forwarded-Host", pr.In.Host)
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.ErrorContext(r.Context(), "auth sidecar unreachable", "path", r.URL.Path, "err", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "auth is not available"})
		},
	}
}

// ClientIP returns the address of the client that sent r. Behind a proxy: X-Real-IP, else the last address in
// X-Forwarded-For (the one the proxy added), else the connection's address.
func ClientIP(r *http.Request, behindProxy bool) string {
	if behindProxy {
		if ip := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); ip != nil {
			return ip.String()
		}
		if xff := r.Header.Values("X-Forwarded-For"); len(xff) > 0 {
			parts := strings.Split(xff[len(xff)-1], ",")
			if ip := net.ParseIP(strings.TrimSpace(parts[len(parts)-1])); ip != nil {
				return ip.String()
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return host
}
