package com.jd.account.ctrl;

import com.jd.account.model.AccountDtos;
import com.jd.account.service.AccountService;
import com.jd.common.exception.BusinessException;
import com.jd.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import com.jd.common.rest.RestResultResponse;
import java.util.List;

@RestController
@RequestMapping("/api/accounts")
@RequiredArgsConstructor
public class AccountController {
    private final AccountService service;

    @GetMapping
    public RestResultResponse<List<AccountDtos.Response>> list() {
        return RestResultResponse.of(service.list());
    }

    @RequestMapping(value = {"/{platform}", "/{platform}/{action}"},
            method = {RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE})
    public RestResultResponse<Void> retired() {
        throw new BusinessException(ErrorCode.BUSINESS_ERROR, HttpStatus.BAD_REQUEST,
                "已改为客户端内置平台页面，请在页面内登录；历史凭证与会话未修改。");
    }
}
