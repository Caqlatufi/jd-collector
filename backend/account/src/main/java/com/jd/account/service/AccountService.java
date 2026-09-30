package com.jd.account.service;

import com.jd.account.model.AccountDtos;
import com.jd.account.model.PlatformAccount;
import com.jd.account.repo.PlatformAccountRepository;
import java.util.List;

/** Read-only legacy metadata; current login state belongs to Electron, not this table. */
public class AccountService {
    private final PlatformAccountRepository repository;
    private final PlatformCatalog catalog;

    public AccountService(PlatformAccountRepository repository, PlatformCatalog catalog) {
        this.repository = repository;
        this.catalog = catalog;
    }

    public List<AccountDtos.Response> list() {
        return catalog.activePlatforms().stream().map(platform -> {
            var account = repository.findByPlatform(platform).orElseGet(() -> {
                var empty = new PlatformAccount();
                empty.setPlatform(platform);
                return empty;
            });
            var target = catalog.target(platform);
            return new AccountDtos.Response(platform, target.name(), target.loginUrl(), target.homeUrl(),
                    "请在客户端内置平台页面登录并读取岗位。", account.getUsername(),
                    account.getPasswordCipher() != null, account.getSessionCipher() != null,
                    account.getSessionStatus(), account.getCapturedAt(), account.getVerifiedAt(),
                    account.getCookieCount(), account.getStorageCount(), false,
                    "历史会话记录，不代表当前 Electron 登录状态。", account.getNotes());
        }).toList();
    }
}
