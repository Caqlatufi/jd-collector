package com.jd.account;

import com.jd.account.model.RecruitmentPlatform;
import com.jd.account.service.PlatformCatalog;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PlatformCatalogTest {
    @Test void trustedDomainsRequireExactHostOrRealSubdomain() {
        var catalog = new PlatformCatalog();
        for (var p : catalog.activePlatforms()) {
            var target = catalog.target(p);
            assertThat(target.allowsUrl(target.loginUrl())).isTrue();
            assertThat(target.allowsUrl(target.homeUrl())).isTrue();
        }
        var boss = catalog.target(RecruitmentPlatform.BOSS);
        assertThat(boss.allowsHost(".zhipin.com")).isTrue();
        assertThat(boss.allowsHost("www.zhipin.com")).isTrue();
        assertThat(boss.allowsHost("evilzhipin.com")).isFalse();
        assertThat(boss.allowsHost("zhipin.com.evil.test")).isFalse();
        assertThat(boss.allowsUrl("https://zhipin.com@evil.test/")).isFalse();
        assertThat(boss.allowsUrl("file:///tmp/zhipin.com")).isFalse();
        assertThat(catalog.activePlatforms()).doesNotContain(RecruitmentPlatform.LAGOU);
        assertThatThrownBy(() -> catalog.target(RecruitmentPlatform.LAGOU))
                .isInstanceOf(com.jd.common.exception.BusinessException.class);
    }
}
