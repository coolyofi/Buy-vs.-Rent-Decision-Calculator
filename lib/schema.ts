import { ISchema } from "@formily/json-schema";

export const QUICK_8_KEYS = [
  "P",
  "dp_min",
  "LPR",
  "r_gjj",
  "rent_0",
  "years",
  "R_inv",
  "Mix_ratio",
];

export const PLUS_17_KEYS = [
  "area",
  "ring",
  "n_years",
  "BP",
  "M5U",
  "VAT_rate",
  "Deed1_rate",
  "Deed2_rate",
  "PIT_gross_rate",
  "Buyer_agent_rate",
  "Reno_hard",
  "Reno_soft",
  "Reg_fee",
  "Loan_service",
  "PM_unit",
  "g_r",
  "Move_freq_years",
];

const quickSet = new Set(QUICK_8_KEYS);
const plusSet = new Set(PLUS_17_KEYS);
export const POLICY_LOCKED_KEYS = [
  "LPR",
  "BP",
  "r_gjj",
  "Deed1_rate",
  "Deed2_rate",
  "VAT_rate",
  "GJJ_max_single",
  "GJJ_max_family",
  "GJJ_max_multichild",
];
const policyLockedSet = new Set(POLICY_LOCKED_KEYS);

export type FieldMeta = {
  key: string;
  label: string;
  type: "number" | "string" | "boolean";
  unit?: string;
  enum?: Array<string | number>;
  default?: unknown;
  desc?: string;
};

export const STAGE2_CARD_LAYOUT: Array<{
  title: string;
  keys: string[];
}> = [
  {
    title: "资金与收入",
    keys: ["monthly_income", "Emergency", "dp_min", "GJJ_extra"],
  },
  {
    title: "贷款偏好",
    keys: ["n_years", "Mix_ratio", "Repay_type", "GJJ_merge"],
  },
  {
    title: "交易与装修",
    keys: ["holding_years", "M5U", "Reno_hard", "Reno_soft"],
  },
  {
    title: "租房对照",
    keys: ["rent_0", "PM_unit", "years"],
  },
];

const extraFieldMeta: Record<string, FieldMeta> = {
  monthly_income: { key: "monthly_income", label: "月收入", type: "number", unit: "元", default: 25000 },
  holding_years: { key: "holding_years", label: "持有年限", type: "number", unit: "年", default: 2 },
  GJJ_merge: { key: "GJJ_merge", label: "公积金合并", type: "boolean", default: true },
};

export function createFieldMetaMap(rawSchema: any): Record<string, FieldMeta> {
  const map: Record<string, FieldMeta> = { ...extraFieldMeta };
  (rawSchema.groups ?? []).forEach((group: any) => {
    (group.items ?? []).forEach((item: any) => {
      map[item.key] = {
        key: item.key,
        label: item.label,
        type: item.key === "M5U" ? "boolean" : (item.type === "number" ? "number" : "string"),
        unit: item.unit,
        enum: item.enum,
        default: item.default,
        desc: item.desc,
      };
    });
  });
  return map;
}

export function buildFormilySchema(rawSchema: any): ISchema {
  const step1Props: Record<string, any> = {};
  const step2Props: Record<string, any> = {};
  const expertTabs: Record<string, any> = {};

  rawSchema.groups.forEach((group: any) => {
    const groupKey = `group_${group.name.replace(/\s+/g, "_")}`;
    expertTabs[groupKey] = {
      type: "void",
      "x-component": "FormTab.TabPane",
      "x-component-props": {
        tab: group.name,
      },
      properties: {},
    };

    group.items.forEach((item: any) => {
      const isNumber = item.type === "number";
      const isEnum = !!item.enum;
      const fieldProp: Record<string, any> = {
        title: item.label,
        type: isNumber ? "number" : "string",
        default: item.key === "M5U" ? true : item.default,
        description: item.desc,
        "x-decorator": "FormItem",
        "x-component": isNumber
          ? "NumberPicker"
          : isEnum
          ? item.key === "ring"
            ? "Radio.Group"
            : "Select"
          : "Input",
        "x-component-props": {
          placeholder: item.label,
          ...(item.key === "ring" ? { optionType: "button", buttonStyle: "solid" } : {}),
          [isNumber ? "suffix" : "addonAfter"]: item.unit,
        },
        "x-reactions": [] as any[],
      };

      if (policyLockedSet.has(item.key)) {
        fieldProp["x-disabled"] = true;
      }

      if (item.key === "M5U") {
        fieldProp["x-component"] = "Switch";
        fieldProp.type = "boolean";
        delete fieldProp["x-component-props"].placeholder;
      }

      if (isEnum) {
        fieldProp.enum = item.enum.map((v: any) => ({
          label: v,
          value: v,
        }));
      }

      if (item.key === "VAT_rate") {
        fieldProp["x-reactions"].push({
          dependencies: ["M5U"],
          fulfill: {
            state: {
              value: "{{ $deps[0] ? 0 : 5 }}",
            },
          },
        });
      }

      if (item.key === "PIT_gross_rate") {
        fieldProp["x-reactions"].push({
          dependencies: ["M5U"],
          fulfill: {
            state: {
              value: "{{ $deps[0] ? 0 : 1.5 }}",
            },
          },
        });
      }

      if (item.key === "Deed1_rate") {
        fieldProp["x-reactions"].push({
          dependencies: ["area"],
          fulfill: {
            state: {
              value: "{{ $deps[0] <= 90 ? 1 : 1.5 }}",
            },
          },
        });
      }

      if (item.key === "Deed2_rate") {
        fieldProp["x-reactions"].push({
          dependencies: ["area"],
          fulfill: {
            state: {
              value: "{{ $deps[0] <= 90 ? 1 : 2 }}",
            },
          },
        });
      }

      if (item.key === "Reno_hard") {
        fieldProp["x-reactions"].push({
          dependencies: ["P", "reno_pct_default"],
          when: "{{$self.modified === false}}",
          fulfill: {
            state: {
              value: "{{ ($deps[0] || 600) * (($deps[1] || 5) / 100) }}",
            },
          },
        });
      }

      if (item.key === "Reno_soft") {
        fieldProp["x-reactions"].push({
          dependencies: ["P"],
          when: "{{$self.modified === false}}",
          fulfill: {
            state: {
              value: "{{ ($deps[0] || 600) * 0.02 }}",
            },
          },
        });
      }

      if (item.key === "PM_unit") {
        fieldProp["x-reactions"].push({
          dependencies: ["ring"],
          when: "{{$self.modified === false}}",
          fulfill: {
            state: {
              value: "{{ $deps[0] === 'inner' ? 8 : ($deps[0] === 'middle' ? 5 : 3.5) }}",
            },
          },
        });
      }

      if (quickSet.has(item.key)) {
        step1Props[item.key] = fieldProp;
      } else if (plusSet.has(item.key)) {
        step2Props[item.key] = fieldProp;
      } else {
        expertTabs[groupKey].properties[item.key] = fieldProp;
      }
    });

    if (Object.keys(expertTabs[groupKey].properties).length === 0) {
      delete expertTabs[groupKey];
    }
  });

  return {
    type: "object",
    properties: {
      steps: {
        type: "void",
        "x-component": "FormStep",
        "x-component-props": {
          formStep: "{{formStep}}",
        },
        properties: {
          step1: {
            type: "void",
            "x-component": "FormStep.StepPane",
            "x-component-props": {
              title: "快速决策 8 项",
              name: "step1",
            },
            properties: {
              grid: {
                type: "void",
                "x-component": "FormGrid",
                "x-component-props": { maxColumns: 2 },
                properties: step1Props,
              },
            },
          },
          step2: {
            type: "void",
            "x-component": "FormStep.StepPane",
            "x-component-props": {
              title: "增强假设 +17（累计25）",
              name: "step2",
            },
            properties: {
              grid: {
                type: "void",
                "x-component": "FormGrid",
                "x-component-props": { maxColumns: 2 },
                properties: step2Props,
              },
            },
          },
          step3: {
            type: "void",
            "x-component": "FormStep.StepPane",
            "x-component-props": {
              title: "Expert Mode",
              name: "step3",
            },
            properties: {
              tabs: {
                type: "void",
                "x-component": "FormTab",
                "x-component-props": {
                  animated: false,
                  destroyInactiveTabPane: true,
                },
                properties: expertTabs,
              },
            },
          },
        },
      },
    },
  };
}
