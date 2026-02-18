# 上海购房 vs 租房 · 全量参数与公式说明

本文件用于在终端、Excel、Notebook 或后端服务中快速落地一套可计算的模型，不是页面。所有金额默认单位为 **万元**（除非特别标注为元），利率用小数表示（3% 记为 0.03）。

## 使用与填值原则
- 所有 163 个参数均列出，分 14 组；可设置用户输入、自动镜像（沿用页面输入值）、或用默认值。
- 建议给每个参数标记三元属性：`source = {user, mirror, default}`；`unit`；`sensitivity`。
- 对入模金额，先统一转换：`金额_万元 = 金额_元 / 10000`。
- 若金额量级极大（≥10 万元），统一在界面上显示万元，输入框仍可接受元后自动换算。
- 页面可仅显示高敏感度参数，其余折叠为“高级参数”，默认镜像或填默认。

## 计算骨架（核心公式）
以下给出一条最小可运行链路，便于将 163 参数映射到计算。符号均在参数表中给出。

1) 房屋类型与购房资格
- 普通住宅判定：`isOrdinary = (P <= P_limit[环线]) ∧ (A ≤ 140)`。
- 资格校验：根据户籍、套数、社保年限，若不满足则直接输出不合规。

2) 首付与贷款结构
- 下限首付率：`dp = f(套数, 普通/非普通, 政策)`。
- 总贷款需求：`L_total = P × (1 − dp)`。
- 公积金额度：`L_gjj = min(L_gjj_max, B_gjj × 40, L_total)`。
- 商贷额度：`L_com = max(0, L_total − L_gjj)`。

3) 月供（等额本息为例）
- 月供函数：`PMT(principal, r, n) = principal × r_m × (1+r_m)^n / ((1+r_m)^n − 1)`，`r_m = r / 12`。
- 月供合计：`PMT_gjj = PMT(L_gjj, r_gjj, n)`，`PMT_com = PMT(L_com, r_com, n)`，`PMT_total = PMT_gjj + PMT_com`。

4) 一次性取得成本
- 税费：契税、增值税及附加、个税、登记费、印花税、土地收益金等（见参数表税率）。
- 中介费、评估费、贷款服务费、装修、车位、前期物业、押金等。
- 汇总：`C_oneoff = ∑(各项一次性支出)`。

5) 持有期年度成本
- 物业费、物业调增、房产税、维修、大修基金补缴、保险、能耗、车位管理等。
- 年度现金流：`CF_hold_y = PMT_total × 12 + 物业类年度 + 保险 + ...`。
- 总持有成本：`C_hold = ∑_{t=1..Y} CF_hold_y(t)`，可按增长率建序列后求和。

6) 机会成本与再投资
- 初始投入机会成本：`OC_init = C_oneoff × ((1+R_inv)^Y − 1)`。
- 月供较租金的差额再投资：`Δ = PMT_total − rent_t`；若 `Δ>0` 则为额外支出，若 `Δ<0` 可按收益率再投资求未来值 `FV_Δ`。
- 现金流安全性约束：若流动性占比或压力测试不达标，模型可提示风险而非硬算。

7) 租房成本
- 年度租金序列：`rent_t = rent_0 × (1+g_r)^t`。
- 租房总成本：`C_rent = ∑_{t=1..Y} 12×rent_t + 中介/搬家/押金摊销 + 叠租成本`。

8) 退出残值
- 房价未来值：`FV_house = P × (1+g_p)^Y × (1 − 折损率)`。
- 卖出净回款：`Net_sale = FV_house − 剩余本金 − 卖方税费 − 卖方中介 − 监管/回流手续费`。

9) 综合对比
- 购房净支出：`Cost_buy = C_oneoff + C_hold + OC_init − Net_sale`（可加入 Δ 再投资影响）。
- 决策指标：`Diff = Cost_buy − C_rent`；`Diff>0` 倾向租房；可再计算 IRR、NPV 等。

## 参数清单与默认/镜像策略
- `镜像`：直接沿用用户在页面/主表输入的值。
- `默认`：给出起始值，允许用户改；若与页面字段重叠可保持一致。
- `单位`：未特别说明均为万元；`(元)` 表示使用元。

### 一、购房初始取得成本（20）
1 合同网签价 P（镜像，万元）；2 贷款评估价 P_eval（默认=0.95P）；3 增值税 VAT_rate（默认满2年普通免征，否则按3）；4 城建税 CT_rate（默认 0.07×增值税）；5 教育费附加 Edu_rate（0.03×增值税）；6 地方教育附加 LocalEdu_rate（0.02×增值税）；7 契税首套税率 Deed1_rate（90㎡以下 0.01，以上 0.015）；8 契税二套税率 Deed2_rate（90㎡以下 0.01，以上 0.02）；9 个税核定 PIT_gross_rate（默认 0.015）；10 个税差额 PIT_gain_rate（默认 0.20×增值额）；11 满五唯一标记 M5U（镜像，布尔）；12 买方中介佣金 Buyer_agent_rate（默认 0.015）；13 卖方中介转嫁 Seller_to_buyer_rate（默认 0.005）；14 房屋登记费 Reg_fee（默认 0.01 万）；15 印花税 Stamp_rate（默认住宅 0，非住宅 0.0005）；16 土地收益金 Land_fee（默认 0，公房按政策）；17 硬装预算 Reno_hard（默认 5%×P）；18 软装家电 Reno_soft（默认 2%×P）；19 车位首款 Parking_upfront（默认 0）；20 前期物业押金 PM_deposit（默认 0.5 万）。

### 二、房贷金融与现金流变量（15）
21 首付下限 dp_min（按政策镜像）；22 商贷基准利率 LPR（默认 0.035）；23 银行加点 BP（默认 0）；24 公积金利率 r_gjj（首套 0.0285，二套 0.03325）；25 组合贷占比 Mix_ratio（镜像：由 L_gjj/L_total 算）；26 还款周期 n_years（默认 30）；27 还款方式 Repay_type（等额本息/等额本金，默认等额本息）；28 月供收入比 DTI（输出指标，阈值 0.4）；29 提前还贷违约金 Prepay_fee_rate（默认 0.02 × 当期本金）；30 公积金月冲还贷额 GJJ_offset (元，镜像页面，默认 0)；31 公积金月补充缴存额 GJJ_extra (元，默认 0)；32 贷款服务/评估费 Loan_service (万元，默认 0.1)；33 利率重定价周期 Reprice_cycle（默认 12 个月）；34 房贷利息个税抵扣 Deduct_limit（默认 1000 元/月）；35 宽限期 Grace_months（默认 0）。

### 三、持有期间运营成本（12）
36 物业费单价 PM_unit (元/㎡/月，镜像 5)；37 物业费调增率 PM_growth（默认 0.03）；38 房产税免征阈值 Exempt_area_percap (㎡/人，默认 60)；39 房产税率 PropertyTax_rate（默认 0.004 或 0.006）；40 年度维护修缮 Maintenance_yearly（默认 30 元/㎡/年）；41 大型设备更换 Large_replace (万元，默认 第10年一次 2 万)；42 公共部位大修基金补缴 Fund_supp (万元，默认 0)；43 车位管理费 Parking_mgmt (元/月，默认 0)；44 宽带电视 Broadband (元/月，默认 120)；45 能耗溢价 Energy_premium (元/月，默认 0)；46 财产保险 Insurance (元/年，默认 800)；47 空置期成本 Vacancy (元/月，默认 0)。

### 四、租房端特有变量（13）
48 初始月租 rent_0 (元，镜像页面)；49 押金倍数 Deposit_mult（默认 押一付三=1+3/12 租金摊）; 50 租金涨幅 g_r（镜像页面 0.03）；51 租房中介费率 Rent_agent_rate（默认 0.5 个月租）；52 换房频率 Move_freq_years（默认 2 年）；53 搬家费 Move_cost (元/次，默认 3000)；54 家具家电折旧 Furn_depr (元/次，默认 2000)；55 居住证办理 Residence_fee (元/年，默认 0)；56 租房开票税 Rent_tax_rate（默认 0.01，若需开票）; 57 公积金付房租额度 GJJ_rent_cap (元/月，默认 0)；58 通勤成本差额 Commute_delta (元/月，默认 0)；59 叠租成本 Overlap_rent (元/次，默认 0)；60 社交环境重建 Social_cost (元/次，默认 0)。

### 五、资产再投资与机会成本（10）
61 初始资金收益率 R_inv（默认 0.05）；62 月供差额再投资收益率 R_delta（默认 同 R_inv）；63 税费节省再投资收益率 R_taxsave（默认 R_inv）；64 流动性溢价 Liquidity_premium（默认 0.01 折现）；65 分红再投资率 Dividend_reinvest（默认 1）；66 投资账户管理费 Invest_fee_rate（默认 0.002）；67 通胀率 CPI（默认 0.02）；68 货币贬值预期 FX_dep (默认 0)；69 风险系数 Beta（默认 1，越高折现越大）；70 紧急备用金 Emergency (万元，默认 6 个月支出)。

### 六、房产退出与残值（10）
71 房价年化增长 g_p（用户自设，默认 0.03）；72 卖方个税 Seller_tax_rate（满五唯一 0，否则 0.20×增值）；73 卖方中介率 Seller_agent_rate（默认 0.02）；74 退出增值税附加 VAT_addon_exit（默认 与取得期相同）；75 卖出时剩余本金 Bal_remain（由摊还表生成）；76 成新折损 Depreciation_rate（默认 0.1 对应 90% 成新）；77 土地续期费 Land_renew (万元，默认 0)；78 卖房时间成本 Time_cost (万元，默认 0.1)；79 资金监管费 Escrow_fee (万元，默认 0.05)；80 回流手续费 Transfer_fee (万元，默认 0)。

### 七、宏观与社会价值（10）
81 学区溢价 School_premium (万元，默认 0)；82 医疗配套权重 Medical_weight（0–1，默认 0.5）; 83 轨交溢价 Metro_premium (万元，默认 0)；84 落户积分权重 Hukou_weight（0–1，默认 0.5）; 85 租购同权成熟度 Rent_right_weight（0–1，默认 0.5）；86 人口流入预测 Pop_growth（默认 0.01）; 87 区域规划兑现率 Plan_realize（0–1，默认 0.6）；88 气候适应性 Climate_score（0–1，默认 0.5）；89 心理安稳折现 Peace_discount（0–1，默认 0.95 作用于租房成本）；90 主权决策权 Freedom_score（0–1，默认 0.5）。

### 八、生命阶段与突发（10）
91 职业剩余年限 Career_years（镜像/默认 20）；92 薪资增长 g_salary（默认 0.03）；93 子女数量变化 Kids_change（默认 0）; 94 家庭医疗支出 Medical_future (元/年，默认 0); 95 遗产税预期 Estate_tax_rate（默认 0）；96 婚姻变动风险 Divorce_prob（默认 0）; 97 二套房资格门槛 Gap_secondary（默认 0 年）; 98 政策变动频率 Policy_vol (默认 中等)；99 邻里稳定性 Neighborhood_score（0–1，默认 0.6）；100 极端风险概率 Tail_risk_prob（默认 0.05）。

### 九、资金结构与现金流安全（15）
101 流动现金占比 Liquid_ratio（默认 ≥0.2）；102 可动用现金月数 Cash_runway_months（默认 ≥6）；103 信用额度利用率 Credit_util (默认 0.3)；104 收入集中度 Income_concentration（默认 单一=1，多元<1）; 105 奖金波动系数 Bonus_vol（默认 0.5）; 106 失业后现金流持续月数 Unemployed_months (默认 6)；107 房贷占总负债比 Mortgage_to_debt (默认 <0.7)；108 固定支出刚性指数 Fixed_burden (默认 0.6)；109 收入下降20%压力测试 DTI_stress（输出指标）; 110 职业转换成本 Career_switch_cost (万元，默认 0.5)；111 父母医疗支出 Parent_med (元/年，默认 0)；112 家庭支持持续性 Family_support (万元/年，默认 0)；113 未来大额支出 Future_big (万元，默认 0)；114 现金 vs 不动产比例 Cash_to_real (默认 0.3)；115 心理焦虑阈值 Anxiety_threshold (月供/收入，默认 0.5)。

### 十、公积金系统真实变量（10）
116 公积金账户年增长率 GJJ_growth（默认 0.05，含缴存+利息）；117 公积金提取政策风险 GJJ_policy_risk（0–1，默认 0.3）；118 换工作缴存下降概率 GJJ_drop_prob（默认 0.2）；119 冲还贷优先级 GJJ_offset_priority（默认 高）；120 贷款额度政策变化 GJJ_cap_change (默认 0)；121 双人合并可能性 GJJ_merge (布尔，默认 true)；122 异地转移成本 GJJ_transfer_cost (万元，默认 0)；123 断缴对资格影响 GJJ_gap_penalty（默认 12 月内断缴影响贷款）; 124 余额替代现金机会成本 GJJ_oc (按 R_inv 折现)；125 公积金提前还贷 vs 保留收益差 GJJ_prepay_vs_keep（输出对比项）。

### 十一、投资端隐藏变量（12）
126 投资执行一致性 Invest_consistency（0–1，默认 0.7）；127 下跌时继续定投概率 DCA_prob（默认 0.6）；128 风险厌恶系数 Risk_aversion（默认 1）；129 回撤容忍度 Drawdown_tol（默认 0.2）；130 再平衡频率 Rebalance_freq（默认 年度）；131 税后实际收益率 R_after_tax（默认 0.045）；132 黑天鹅恢复周期 Recovery_years（默认 3）；133 持仓纪律折现 Discipline_discount（默认 0.9）；134 误操作概率 Mistake_prob（默认 0.02）；135 投资时间成本 Invest_time (小时/月，默认 2)；136 情绪交易损失 Emotional_loss_rate（默认 0.01）；137 资金被迫提前使用概率 Early_use_prob（默认 0.1）。

### 十二、租房隐藏成本（10）
138 房东提前收回风险 Landlord_risk（概率，默认 0.1）；139 装修质量不可控成本 Rent_reno_risk (元/年，默认 0)；140 搬迁休假时间损失 Leave_loss (元/次，默认 0)；141 租约谈判失败风险 Negotiate_fail (概率，默认 0.1)；142 被迫升级租金档位 Upgrade_prob（默认 0.1）；143 家具不匹配损耗 Mismatch_loss (元/次，默认 0)；144 宠物/改造限制成本 Restriction_cost (元/年，默认 0)；145 租房稳定性折现 Rent_stability_discount（默认 0.95 作用于效用）; 146 租金上涨 vs 工资差 Rent_vs_salary_gap（输出指标）；147 社交资本损耗 Social_capital_loss (元/次，默认 0)。

### 十三、房屋物理生命周期（8）
148 结构寿命阶段 Structure_stage（0–10/10–20/20+ 年）; 149 楼龄折价 Age_discount（默认 10 年以上每年 0.5%）；150 电梯维护周期 Elevator_cycle（默认 10 年）; 151 管线老化概率 Pipe_prob（默认 0.05/年）；152 旧改可能性 Redev_prob（默认 0.1）；153 能耗标准升级成本 Energy_upgrade (万元，默认 0)；154 采光/噪音折现 Light_noise_discount（默认 0.02）；155 物业质量变化概率 PM_quality_prob（默认 0.1）。

### 十四、政策与制度不确定性（8）
156 房地产税推行概率 RE_tax_prob（默认 0.2）；157 限购松绑概率 LQ_relax_prob（默认 0.2）；158 房贷利率长期中枢 Shift_rate (默认 0)；159 租赁市场制度成熟度 Rent_market_maturity（0–1，默认 0.5）；160 人口老龄化住房需求影响 Aging_impact（默认 0.1 折扣房价增速）；161 城市产业迁移风险 Industry_move_prob（默认 0.1）；162 住房供应结构变化 Supply_shift (默认 0)；163 公共住房竞争影响 Public_house_competition (默认 0.05)。

## 建议的最小输入集
若需界面简洁，可先收集：P、A、环线、户籍/套数/社保、rent_0、g_r、Y、R_inv、g_p、现金/公积金余额、月缴公积金、月收入。其余参数以默认/镜像填充，并在“高级参数”折叠中逐项解释。

## 输出与提示
- 必出：资格是否通过、月供、一次性成本、10–30 年总差额、DTI、流动性警示。
- 选出：IRR/NPV、情景敏感性（房价±2%、收益率±2%、工资增速±1%）。
- 提示语：对每个高级参数，显示“用途+默认值+何时需要调整”。

本文件可作为后端计算服务或 Notebook 的直接输入定义，前端可将其转为表单 schema，未暴露的参数以默认值运行。