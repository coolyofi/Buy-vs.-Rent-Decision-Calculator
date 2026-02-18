# City Policy Engine（上海 / 北京）

## 目标
- 把易变政策参数从用户输入中抽离，避免手工填写错误。
- 根据城市与用户画像，自动注入计算所需的政策基线。

## 代码位置
- `lib/policyProfiles.ts`: `deriveEffectivePolicy(input)`
- `lib/calc.ts`: 使用政策结果参与贷款、税费与阈值计算
- `app/page.tsx`: Stage1 中展示已自动加载的政策摘要

## 输入画像（影响政策分支）
- `target_city`
- `is_second_home`
- `holding_years`
- `area`
- `multi_child_bonus`
- `green_building`

## 输出字段（EffectivePolicy）
- 首付：`dpMinPct`
- 利率：`lprPct`, `bpBps`, `gjjRateFirstPct`, `gjjRateSecondPct`
- 税费：`deedRate*`, `vatNonExemptPct`, `vatExemptHoldingYears`
- 公积金额度：`gjjMaxSingleWan`, `gjjMaxFamilyWan`, `gjjMaxMultiChildWan`
- 展示信息：`policyName`, `policyVersion`, `autoAppliedFactors`

## 当前策略版本
- 北京：`BJ-2026.01`
  - 商贷基准 3.05%
  - 公积金 2.6% / 3.075%
  - 首付 20% / 25%
  - 增值税未满 2 年按 3%
- 上海：`SH-2026.01`
  - 商贷基准 3.5%，首套默认 -45BP
  - 公积金 2.6% / 3.075%
  - 首付 20% / 25%
  - 增值税未满 2 年按 5.3%

## 公积金额度截断（计算侧）
在 `lib/calc.ts` 中：
- 先按 `Mix_ratio` 计算理论公积金贷款
- 再按政策上限截断：`L_gjj = min(theoretical, gjjCapWan)`
- 差额自动转入商贷 `L_com`

## 扩展新城市步骤
1. 在 `deriveEffectivePolicy` 添加城市分支。
2. 更新前端城市选项。
3. 校验 `autoAppliedFactors` 文案与版本号。
4. 用固定样本跑回归，确认 `calc.ts` 输出稳定。
