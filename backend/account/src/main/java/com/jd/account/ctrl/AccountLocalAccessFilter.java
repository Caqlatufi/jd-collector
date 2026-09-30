package com.jd.account.ctrl;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.net.URI;
import java.util.Set;

/** Keep local credential operations out of cross-site browser requests. No user/login system. */
@Component
public class AccountLocalAccessFilter extends OncePerRequestFilter {
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return !path.equals("/api/accounts") && !path.startsWith("/api/accounts/");
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        String origin = request.getHeader("Origin");
        boolean allowed = true;
        if (origin != null) {
            try {
                URI uri = URI.create(origin);
                allowed = "http".equals(uri.getScheme()) && Set.of("localhost", "127.0.0.1", "[::1]").contains(uri.getHost())
                        && (uri.getPort() == request.getLocalPort() || uri.getPort() == 3002);
            } catch (RuntimeException e) { allowed = false; }
        }
        if (!allowed || "cross-site".equals(request.getHeader("Sec-Fetch-Site"))) {
            response.setStatus(403); response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":40002,\"msg\":\"平台账号操作仅支持从本地工作台发起\"}"); return;
        }
        chain.doFilter(request, response);
    }
}
