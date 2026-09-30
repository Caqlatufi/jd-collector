# JD Collector 后端代码风格

本文件以 JD Collector 当前实现为依据。模块接入、配置与协作流程见 [AGENTS.md](AGENTS.md)，业务规则见 [功能文档](../docs/README.md)。新代码遵循本约定，历史代码仅在相关改动范围内整理。

## 1. 格式与命名

- Java 17、UTF-8、4 空格缩进、文件结尾一个换行；多行逻辑正常展开，避免把整个控制器或业务方法压成一行。
- 类名 `PascalCase`，字段和方法 `camelCase`，常量 `UPPER_SNAKE_CASE`；包名小写。
- 控制器使用 `*Controller`，服务 `*Service`，仓储 `*Repository`，模块装配 `*Config`，请求和响应通常聚合在 `*Dtos`。
- 按项目类、第三方类、JDK 类分组或遵循所在文件的既有导入顺序；新代码使用明确导入，删除未使用项，不批量改无关文件。

## 2. 包结构与装配

```text
backend/<module>/src/main/java/com/jd/<module>/
├─ <Module>Config.java
├─ ctrl/       控制器与本模块 Web 入口
├─ service/    业务服务、策略或外部能力适配
├─ model/      JPA 实体、DTO 和枚举
└─ repo/       JPA 仓储
```

- `@ComponentScan` 限定控制器包；`@EntityScan` 指向 `model`，`@EnableJpaRepositories` 指向 `repo`。
- 服务通过配置类 `@Bean` 显式构造；使用构造器注入和 `final` 依赖，可用 Lombok `@RequiredArgsConstructor`。
- 普通业务服务直接实现具体类；只有确有多实现或替换需求的能力才引入接口。
- 控制器、模块专用 Filter 等 Web 组件可由 ctrl 扫描注册；不以宽泛组件扫描替代模块挂载。

## 3. 控制器与响应

- 控制器负责请求绑定、校验、调用服务和响应包装；数据库操作、评分和状态变化在服务中处理。
- 路径以 `/api/<resources>` 为前缀；上下文 `/jd-collector` 由应用配置提供，不重复写进控制器映射。
- 查询参数用 `@RequestParam`，资源标识用 `@PathVariable`，JSON 用 `@RequestBody`；请求 DTO 使用 `@Valid` 与 Jakarta Validation。
- 保持现有 HTTP 契约：GET 查询，POST 新增或业务动作，PUT 更新，DELETE 显式清除；不为统一风格改掉已有方法或路径。
- JSON 返回 `RestResultResponse<T>`、`RestPageResultResponse<T>` 等公共响应；文件下载按既有 CSV/二进制响应处理。
- 请求/响应 DTO 优先使用 record。不要直接把持久化实体作为公共响应，尤其是包含凭证的实体。

示例沿用本地写法：

```java
@PutMapping("/{id}")
public RestResultResponse<CompanyDtos.Response> update(
        @PathVariable Long id,
        @Valid @RequestBody CompanyDtos.SaveRequest request
) {
    return RestResultResponse.of(service.update(id, request));
}
```

## 4. 服务、事务和跨模块协作

- 服务方法表达明确的业务动作；纯查询可标记 `@Transactional(readOnly = true)`，需要原子性的写入在服务边界声明 `@Transactional`。
- 正文与派生内容块、岗位与阶段事件等需要一致的数据在同一事务完成；不要在控制器拼接多个独立写操作伪装成原子更新。
- 浏览器启动、网页等待等慢操作不放进长期数据库事务；线程串行化与数据库事务是两种不同约束。
- 跨模块优先调用对方服务；已有显式仓储读取可保留，但本模块不能随意写入其他领域的状态。
- 保存时区分“未提供”“清空”“保持原值”；account 历史凭证为只读，不恢复密码配置或清除入口。
- 派生指标由事实计算，避免前端和多个服务各自维护不同评分、阶段或时间口径。

## 5. 实体与字段

- 当前实体放在 `model` 包，继承本项目 `com.jd.common.persistence.BaseEntity`，通常使用 `@Getter`、`@Setter`。不要为套用 TwinTag 目录批量移动到 `entity` 包。
- 表名显式使用 `jd_*`；常规列按命名策略转换为下划线，不重复声明相同列名。
- 枚举用 `EnumType.STRING`。单领域枚举放本模块，多个模块共享时再明确其公共归属。
- 根据真实契约声明 `nullable`、`length` 和唯一性；正文/JSON/密文明确 `TEXT`、`LONGTEXT` 等容量，不依赖默认小字符串列。
- DTO 校验长度与持久化列容量匹配；不要将数据库实体的全部字段机械复制到客户端模型。
- 模块关联目前主要保存 `companyId`、`resumeVersionId` 等标识；需要实体关联时说明加载与序列化边界，不凭风格偏好引入级联。
- 带逻辑删除语义的查询显式排除 `deleted=true`，列表、详情、聚合与导出保持一致。

## 6. 仓储与分页

- 现有业务实体仓储统一继承 `JpaRepository<Entity, Long>`。按所需能力和现有语义选择，不为形式统一修改行为。
- 简单查询优先派生方法，多条件查询用 JPQL 或 Specification；原生 SQL 仅在确有数据库特性需要时使用并验证兼容性。
- 前端请求 `number` 从 1 开始，由服务转换为 `PageRequest` 的 0-based 页码，并约束 page size；当前主要列表上限为 100。
- 响应的 `page.number` 沿用公共响应对 Spring Page 的 0-based 输出；若用于页面控件要显式转换，不能假定请求与响应基数相同。
- 排序在仓储/查询层完成后分页；相同主排序值使用稳定次排序，避免页面之间重复或遗漏。

## 7. 异常、日志与外部能力

- 可预期业务失败抛 `BusinessException(ErrorCode, HttpStatus, 中文提示)`，由 `ApplicationExceptionHandler` 统一响应。
- 沿用 `40001` 校验、`40002` 业务失败、`40401` 不存在、`40901` 冲突、`50001` 未预期异常，不用成功码包装失败。
- 捕获异常后必须保留失败语义；浏览器导航失败、页面变空或认证未知不得返回“登录成功”。
- 日志可记录动作、平台代码、耗时和脱敏状态；禁止打印密码、Cookie、Token、密钥、请求正文及可能包含输入值的自动化调用堆栈。
- 后端不再驱动招聘平台浏览器；页面访问归前端 Electron 公共层。超时观察不等于任务结束，不因超时自动重复提交。
- URL、页面状态和会话校验规则归外部适配模块；不把不确定的平台行为写成已确认的业务事实。

## 8. 配置、依赖与测试代码

- 共享版本维护在根 Gradle 配置，单模块专用依赖声明在所属模块。只在需要向下游暴露类型时使用 `api`，其他依赖使用 `implementation`。
- 配置默认值需与根 AGENTS 和真实配置一致，秘密通过环境变量/本地密钥读取。
- 测试名称表达业务结果；MockMvc、真实 HTTP、浏览器测试分别说明覆盖范围。
- 数据落库测试检查最终实体/记录而不只断言 HTTP 200；外部认证测试使用可识别的测试秘密且不访问真实账号。
- 规范调整同步本文件；业务规则变化更新对应功能文档，避免在这里复制完整状态机或接口清单。
