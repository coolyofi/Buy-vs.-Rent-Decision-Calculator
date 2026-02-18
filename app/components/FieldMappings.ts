// app/components/FieldMappings.ts
import { createSchemaField } from '@formily/react'
import {
  FormItem,
  Input,
  NumberPicker,
  Select,
  Switch,
  Radio,
  Reset,
  Submit,
  FormTab,
  FormStep,
  FormGrid,
  FormCollapse,
  FormLayout,
} from '@formily/antd-v5'
import GroupCard from './GroupCard'

export const SchemaField = createSchemaField({
  components: {
    FormItem,
    Input,
    NumberPicker,
    Select,
    Switch,
    Radio,
    Reset,
    Submit,
    GroupCard,
    FormTab,
    FormStep,
    FormGrid,
    FormCollapse,
    FormLayout,
  },
})
