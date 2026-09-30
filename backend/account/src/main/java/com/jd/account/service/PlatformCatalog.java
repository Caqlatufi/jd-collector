package com.jd.account.service;

import com.jd.account.model.RecruitmentPlatform;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import org.springframework.http.HttpStatus;
import java.net.URI;
import java.util.List;
import java.util.Locale;

public class PlatformCatalog {
    public List<RecruitmentPlatform> activePlatforms() {
        return List.of(RecruitmentPlatform.BOSS, RecruitmentPlatform.LIEPIN,
                RecruitmentPlatform.JOB51, RecruitmentPlatform.ZHAOPIN);
    }

    public void requireActive(RecruitmentPlatform platform) {
        if (!activePlatforms().contains(platform)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, HttpStatus.BAD_REQUEST,
                    "该招聘平台已停用，历史数据保留，不再提供账号或浏览器操作。");
        }
    }

    public record Target(RecruitmentPlatform platform, String name, String loginUrl, String homeUrl,
                         List<String> domains, String loginHint) {
        public boolean allowsHost(String host) {
            if (host == null) return false;
            String normalized = host.toLowerCase(Locale.ROOT).replaceFirst("^\\.", "");
            return domains.stream().anyMatch(d -> normalized.equals(d) || normalized.endsWith("." + d));
        }
        public boolean allowsUrl(String url) {
            try {
                URI uri = URI.create(url);
                return ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) && allowsHost(uri.getHost());
            } catch (RuntimeException e) { return false; }
        }
    }
    public Target target(RecruitmentPlatform platform) {
        return switch (platform) {
            case BOSS -> new Target(platform, "BOSS直聘", "https://www.zhipin.com/web/user/",
                    "https://www.zhipin.com/", List.of("zhipin.com"), "通常使用扫码或短信登录；无密码入口时在窗口内完成登录。");
            case LIEPIN -> new Target(platform, "猎聘", "https://www.liepin.com/",
                    "https://www.liepin.com/", List.of("liepin.com"), "尝试密码登录；验证码或安全验证请在窗口内完成。");
            case JOB51 -> new Target(platform, "前程无忧", "https://login.51job.com/login.php",
                    "https://www.51job.com/", List.of("51job.com"), "支持页面上的账号登录或扫码；按当前登录页选择。");
            case ZHAOPIN -> new Target(platform, "智联招聘", "https://passport.zhaopin.com/login",
                    "https://www.zhaopin.com/", List.of("zhaopin.com"), "支持页面提供的密码、短信或扫码方式。");
            case LAGOU -> throw new BusinessException(ErrorCode.BUSINESS_ERROR, HttpStatus.BAD_REQUEST,
                    "拉勾招聘已停用，历史数据保留。");
        };
    }
}
