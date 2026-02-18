import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ConfigProvider } from 'antd'
import React from 'react'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '买房 vs 租房决策系统 · 163参数专业模型',
  description: '面向上海与北京的买房租房对比与净资产决策工具。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <ConfigProvider theme={{ 
          token: { 
            colorPrimary: '#2457e6',
            borderRadius: 8,
          } 
        }}>
          {children}
        </ConfigProvider>
      </body>
    </html>
  )
}
