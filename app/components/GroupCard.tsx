// app/components/GroupCard.tsx
import React from 'react'
import { Card } from 'antd'

const GroupCard = (props: React.PropsWithChildren<{ title?: string }>) => {
  return (
    <Card 
      title={props.title} 
      styles={{ body: { padding: '16px 24px' } }}
      style={{ marginBottom: 16 }}
      size="small"
    >
      {props.children}
    </Card>
  )
}

export default GroupCard
